import fs from 'fs';
import path from 'path';
import { closeRcu, rcu } from './db';
import { migrateRcu } from './migrate';
import { importerFichier } from './importer';
import { rapprocher } from './rapprochement';

/**
 * Worker du RCU — conteneur `rcu-worker` (même image que `api`, autre commande).
 *
 *   node dist/rcu/worker.js                      surveille RCU_DEPOT (défaut /depot) toutes les 5 minutes
 *   node dist/rcu/worker.js --fichier <chemin>   importe un fichier une fois (ancienne base Sud-Ouest, poste local)
 *        [--forcer]                              passe outre le garde-fou de volume
 *   node dist/rcu/worker.js --rapprocher         recalcule seulement le client unique (lot 2)
 *
 * Après chaque import APPLIQUÉ, le client unique est recalculé (`rapprochement.ts`).
 *
 * Un fichier déposé par SFTP peut être en cours d'écriture : il n'est lu que s'il n'a pas bougé depuis
 * 2 minutes, et l'import vérifie en plus la ligne de total. Après traitement, il part dans RCU_ARCHIVE
 * (`appliques/` ou `refuses/`), purgé au bout de 14 jours. Un fichier refusé n'est donc jamais relu en boucle.
 */

const DEPOT = process.env.RCU_DEPOT || '/depot';
const ARCHIVE = process.env.RCU_ARCHIVE || '/archive';
const INTERVALLE_MS = 5 * 60 * 1000;
const DEMANDES_MS = 30 * 1000;
const STABLE_MS = 2 * 60 * 1000;
const RETENTION_MS = 14 * 24 * 3600 * 1000;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), '[rcu]', ...a);

async function apresImport(): Promise<void> {
  try {
    const st = await rapprocher();
    log(`rapprochement : ${st.clients} clients (${st.clientsMultiIdentites} multi-identités), ${st.aArbitrer} à arbitrer, ${st.dureeSecondes} s`);
  } catch (e) { log('rapprochement en échec :', (e as Error).message); }
}

function archiver(chemin: string, sousDossier: string, runId: number | null): void {
  const dir = path.join(ARCHIVE, sousDossier);
  fs.mkdirSync(dir, { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  fs.renameSync(chemin, path.join(dir, `${horodatage}_run${runId ?? 'x'}_${path.basename(chemin)}`));
}

function purgerArchive(): void {
  for (const sous of ['appliques', 'refuses']) {
    const dir = path.join(ARCHIVE, sous);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (Date.now() - fs.statSync(p).mtimeMs > RETENTION_MS) fs.unlinkSync(p);
    }
  }
}

async function tour(): Promise<void> {
  if (!fs.existsSync(DEPOT)) { log(`dossier de dépôt absent : ${DEPOT}`); return; }
  const fichiers = fs.readdirSync(DEPOT)
    .filter((f) => /\.txt$/i.test(f))
    .map((f) => path.join(DEPOT, f))
    .filter((p) => fs.statSync(p).isFile())
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  for (const chemin of fichiers) {
    const st = fs.statSync(chemin);
    if (Date.now() - st.mtimeMs < STABLE_MS) { log(`en cours de dépôt, attente : ${path.basename(chemin)}`); continue; }
    const r = await importerFichier(chemin, { recuLe: st.mtime });
    log(`${path.basename(chemin)} → ${r.statut} (import ${r.runId ?? '-'}) : ${r.message}`);
    archiver(chemin, r.statut === 'applique' || r.statut === 'deja_applique' ? 'appliques' : 'refuses', r.runId);
    if (r.statut === 'applique') await apresImport();
  }
  purgerArchive();
}

/** Demandes « appliquer quand même » (Master, depuis Gearbox) : relit le fichier archivé du run refusé. */
async function demandes(): Promise<void> {
  const { rows } = await rcu().query(`select id, run_id, demandeur from rcu.import_demande where traitee_le is null order by id`);
  for (const d of rows) {
    const dir = path.join(ARCHIVE, 'refuses');
    const f = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.includes(`_run${d.run_id}_`)) : undefined;
    let resultat: string;
    if (!f) resultat = 'Fichier introuvable dans l’archive (purgé après 14 jours ?).';
    else {
      const chemin = path.join(dir, f);
      const r = await importerFichier(chemin, { force: true, recuLe: fs.statSync(chemin).mtime });
      resultat = `${r.statut} (import ${r.runId ?? '-'}) : ${r.message}`;
      if (r.runId) await rcu().query(`update rcu.import_run set message = $2 where id = $1`,
        [r.runId, `Appliqué de force à la demande de ${d.demandeur} (refus de l'import n° ${d.run_id}). ${r.message}`]);
      if (r.statut === 'applique') { archiver(chemin, 'appliques', r.runId); await apresImport(); }
    }
    await rcu().query(`update rcu.import_demande set traitee_le = now(), resultat = $2 where id = $1`, [d.id, resultat]);
    log(`demande ${d.id} (import ${d.run_id}, ${d.demandeur}) → ${resultat}`);
  }
}

async function main(): Promise<void> {
  const migrations = await migrateRcu();
  if (migrations.length) log('migrations appliquées :', migrations.join(', '));

  const i = process.argv.indexOf('--fichier');
  if (i > 0) {
    const r = await importerFichier(process.argv[i + 1], { force: process.argv.includes('--forcer') });
    console.log(JSON.stringify(r, null, 2));
    if (r.statut === 'applique') await apresImport();
    await closeRcu();
    process.exit(r.statut === 'applique' || r.statut === 'deja_applique' ? 0 : 1);
  }

  if (process.argv.includes('--rapprocher')) {
    console.log(JSON.stringify(await rapprocher(), null, 2));
    await closeRcu();
    process.exit(0);
  }

  log(`surveillance de ${DEPOT} toutes les ${INTERVALLE_MS / 60000} min, demandes toutes les ${DEMANDES_MS / 1000} s`);
  let prochainTour = 0;
  for (;;) {
    try { await demandes(); } catch (e) { log('erreur sur les demandes :', (e as Error).message); }
    if (Date.now() >= prochainTour) {
      try { await tour(); } catch (e) { log('erreur de tour :', (e as Error).message); }
      prochainTour = Date.now() + INTERVALLE_MS;
    }
    await new Promise((res) => setTimeout(res, DEMANDES_MS));
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => { closeRcu().finally(() => process.exit(0)); });
}

main().catch((e) => { log('arrêt sur erreur :', (e as Error).message); process.exit(1); });
