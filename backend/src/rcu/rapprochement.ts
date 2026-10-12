import { rcu } from './db';
import { majResumes } from './resume';

/**
 * Rapprochement : des identités DCS aux CLIENTS uniques (RCU-CADRAGE.md § 4). Recalcul COMPLET, déterministe, après chaque
 * import appliqué (worker) — quelques secondes pour 200 000 identités, en mémoire.
 *
 *  1. Coordonnées SUSPECTES : partagées par plus de SEUIL_SUSPECT personnes de noms différents, domaine Bony, numéro ou
 *     adresse bidon. Elles ne servent JAMAIS à rapprocher (ni, plus tard, à relancer).
 *  2. Identités GÉNÉRIQUES (plus de SEUIL_GENERIQUE véhicules : garages, loueurs, la concession elle-même ; civilité
 *     « Groupe Bony ») et identités sans aucune vente retenue : pas de client.
 *  3. Union des identités par règles, dans cet ordre : décisions « fusion » humaines, puis même nom + prénom + portable,
 *     + e-mail, + adresse, même raison sociale + CP, même véhicule + même nom. Une décision « séparation » interdit toute
 *     union qui réunirait ses deux identités : la nuit ne défait jamais un arbitrage.
 *  4. File d'arbitrage : même nom + prénom + CP, rien d'autre en commun → proposé, jamais appliqué.
 *  5. Identifiants STABLES : un groupe reprend l'identifiant de client que portaient la majorité de ses identités ; un client
 *     absorbé pointe vers son absorbeur (`fusionne_dans`).
 */

const SEUIL_SUSPECT = 3;
const SEUIL_GENERIQUE = 20;
const DOMAINES_BONY = ['bonyautomobiles.com', 'bonyauto-mobile.com', 'bony-automobiles.com', 'bonyautomobile.com'];

/** Majuscules, sans accents, ponctuation → espace. */
export const norm = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const telBidon = (t: string) => /^0(\d)\1{8}$/.test(t) || /^0[1-9]0{8}$/.test(t) || /(\d)\1{6,}/.test(t) || t === '0123456789';
const emailBidon = (e: string) =>
  !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) || /^(pas|non|no|aucun|sans|nomail|noemail|inconnu|neant|test|x{2,})[\W_\d]*@/i.test(e)
  || /@(pas|aucun|nomail|noemail|inconnu)\./i.test(e);

interface Ident {
  id: number; type: string; civ: string | null; nom: string; prenom: string; cp: string; adresse: string;
  port: string | null; dom: string | null; email: string | null; eligible: boolean;
}

export interface StatsRapprochement { [k: string]: unknown }

export async function rapprocher(): Promise<StatsRapprochement> {
  const db = rcu();
  const t0 = Date.now();
  const runId: number = (await db.query(`insert into rcu.rapprochement_run default values returning id`)).rows[0].id;

  // ─── Chargement ───────────────────────────────────────────────────────────────
  const brutes = (await db.query(`
    select i.id, rcu.type_personne(i.civilite, i.nom, i.prenom) as type, upper(coalesce(i.civilite, '')) as civ,
           i.nom, i.prenom, i.cp, concat_ws(' ', i.num_rue, i.type_rue, i.rue) as adresse, i.tel_port, i.tel_dom, i.email,
           exists (select 1 from rcu.vente v where v.identite_id = i.id and v.retenue and v.absente_depuis is null) as eligible
    from rcu.identite_source i`)).rows;
  const ids: Ident[] = brutes.map((r) => ({
    id: Number(r.id), type: r.type, civ: r.civ, nom: norm(r.nom), prenom: norm(r.prenom), cp: (r.cp ?? '').trim(),
    adresse: norm(r.adresse), port: r.tel_port, dom: r.tel_dom, email: r.email ? String(r.email).toLowerCase() : null, eligible: r.eligible,
  }));
  const phases: Record<string, number> = {};
  let tp = Date.now();
  const phase = (nom: string) => { phases[nom] = Math.round((Date.now() - tp) / 100) / 10; tp = Date.now(); };
  phase('chargement identites');

  const vehicules = (await db.query(`select distinct identite_id, vehicule_id from rcu.vente where vehicule_id is not null`)).rows;
  phase('chargement vehicules');
  const nbVeh = new Map<number, number>();
  for (const v of vehicules) nbVeh.set(Number(v.identite_id), (nbVeh.get(Number(v.identite_id)) ?? 0) + 1);

  // ─── 1. Coordonnées suspectes ───────────────────────────────────────────────────
  const porteurs = new Map<string, Set<string>>(); // 'tel:0612…' / 'email:a@b' → noms distincts
  const ajoute = (k: string, nom: string) => { let s = porteurs.get(k); if (!s) porteurs.set(k, (s = new Set())); s.add(nom || '?'); };
  for (const x of ids) {
    for (const t of [x.port, x.dom]) if (t) ajoute(`tel:${t}`, x.nom);
    if (x.email) ajoute(`email:${x.email}`, x.nom);
  }
  const suspects = new Map<string, string>(); // clé → motif
  for (const [k, noms] of porteurs) {
    const [type, valeur] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    if (noms.size > SEUIL_SUSPECT) suspects.set(k, `Partagé par ${noms.size} personnes de noms différents`);
    else if (type === 'tel' && /^0\d{9}$/.test(valeur) && telBidon(valeur)) suspects.set(k, 'Numéro bidon');
    else if (type === 'email' && DOMAINES_BONY.some((d) => valeur.endsWith('@' + d))) suspects.set(k, 'Adresse Bony (concession ou vendeur)');
    else if (type === 'email' && emailBidon(valeur)) suspects.set(k, 'Adresse bidon');
  }
  const sain = (type: 'tel' | 'email', v: string | null) => !!v && !suspects.has(`${type}:${v}`);

  // ─── 2. Génériques et éligibles ─────────────────────────────────────────────────
  const generiques = new Map<number, string>();
  for (const x of ids) {
    if ((nbVeh.get(x.id) ?? 0) > SEUIL_GENERIQUE) generiques.set(x.id, `${nbVeh.get(x.id)} véhicules (garage, loueur ou concession)`);
    else if (x.civ === 'GROUPE BONY') generiques.set(x.id, 'Civilité Groupe Bony');
  }
  const actives = ids.filter((x) => x.eligible && !generiques.has(x.id));
  const actif = new Set(actives.map((x) => x.id));

  // ─── 3. Union-find avec interdits ───────────────────────────────────────────────
  const parent = new Map<number, number>(), membres = new Map<number, number[]>(), interdits = new Map<number, Set<number>>();
  for (const x of actives) { parent.set(x.id, x.id); membres.set(x.id, [x.id]); }
  const racine = (a: number): number => { let r = a; while (parent.get(r) !== r) r = parent.get(r)!; let c = a; while (c !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  const decisions = (await db.query(`select identite_a, identite_b, decision from rcu.decision`)).rows
    .map((d) => ({ a: Number(d.identite_a), b: Number(d.identite_b), d: d.decision as string }));
  for (const d of decisions.filter((d) => d.d === 'separation' && actif.has(d.a) && actif.has(d.b))) {
    (interdits.get(d.a) ?? interdits.set(d.a, new Set()).get(d.a)!).add(d.b);
    (interdits.get(d.b) ?? interdits.set(d.b, new Set()).get(d.b)!).add(d.a);
  }
  const regle = new Map<number, string>();
  let refusees = 0;
  const unir = (a: number, b: number, nomRegle: string): boolean => {
    const ra = racine(a), rb = racine(b);
    if (ra === rb) return false;
    const ia = interdits.get(ra), ib = interdits.get(rb);
    if ((ia && membres.get(rb)!.some((m) => ia.has(m))) || (ib && membres.get(ra)!.some((m) => ib.has(m)))) { refusees++; return false; }
    const [grand, petit] = membres.get(ra)!.length >= membres.get(rb)!.length ? [ra, rb] : [rb, ra];
    parent.set(petit, grand);
    membres.get(grand)!.push(...membres.get(petit)!); membres.delete(petit);
    const ip = interdits.get(petit);
    if (ip) { const ig = interdits.get(grand) ?? interdits.set(grand, new Set()).get(grand)!; ip.forEach((v) => ig.add(v)); interdits.delete(petit); }
    if (!regle.has(b)) regle.set(b, nomRegle);
    if (!regle.has(a)) regle.set(a, nomRegle);
    return true;
  };
  const parCle = (cle: (x: Ident) => string[] | null, nomRegle: string): number => {
    const seaux = new Map<string, number[]>();
    for (const x of actives) for (const k of cle(x) ?? []) { const s = seaux.get(k); if (s) s.push(x.id); else seaux.set(k, [x.id]); }
    let n = 0;
    for (const s of seaux.values()) for (let i = 1; i < s.length; i++) if (unir(s[0], s[i], nomRegle)) n++;
    return n;
  };
  const fusions: Record<string, number> = {};
  const particulier = (x: Ident) => x.type === 'particulier' && !!x.nom && !!x.prenom;
  // Un portable est un 06 / 07, QUELLE QUE SOIT la colonne : l'ancienne base Sud-Ouest le range souvent en « domicile ».
  const portables = (x: Ident) => [...new Set([x.port, x.dom].filter((t): t is string => !!t && /^0[67]\d{8}$/.test(t) && sain('tel', t)))];
  fusions['nom + prénom + portable'] = parCle((x) => particulier(x) ? portables(x).map((t) => `${x.nom}|${x.prenom}|${t}`) : null, 'Même nom, prénom et portable');
  fusions['nom + prénom + e-mail'] = parCle((x) => particulier(x) && sain('email', x.email) ? [`${x.nom}|${x.prenom}|${x.email}`] : null, 'Même nom, prénom et e-mail');
  fusions['nom + prénom + adresse'] = parCle((x) => particulier(x) && x.cp && x.adresse.length >= 4 ? [`${x.nom}|${x.prenom}|${x.cp}|${x.adresse}`] : null, 'Même nom, prénom et adresse');
  fusions['raison sociale + CP'] = parCle((x) => x.type === 'societe' && x.nom && x.cp ? [`S|${x.nom}|${x.cp}`] : null, 'Même raison sociale et code postal');
  const vehDe = new Map<number, number[]>();
  for (const v of vehicules) { const i = Number(v.identite_id); if (actif.has(i)) (vehDe.get(i) ?? vehDe.set(i, []).get(i)!).push(Number(v.vehicule_id)); }
  fusions['même véhicule + même nom'] = parCle((x) => x.nom ? (vehDe.get(x.id) ?? []).map((v) => `${x.type}|${x.nom}|${x.type === 'particulier' ? x.prenom : ''}|${v}`) : null, 'Même véhicule et même nom');

  // Fusions humaines APRÈS les règles : l'étiquette d'une identité dit la règle automatique qui l'a rattachée quand il y en a une.
  fusions['décision manuelle'] = 0;
  for (const d of decisions.filter((d) => d.d === 'fusion' && actif.has(d.a) && actif.has(d.b))) if (unir(d.a, d.b, 'Fusion décidée à la main')) fusions['décision manuelle']++;

  // ─── 4. File d'arbitrage : même nom + prénom + CP, groupes distincts ────────────
  const proches = new Map<string, Set<number>>();
  for (const x of actives) if (particulier(x) && x.cp) { const k = `${x.nom}|${x.prenom}|${x.cp}`; (proches.get(k) ?? proches.set(k, new Set()).get(k)!).add(racine(x.id)); }
  const pairesRacines: [number, number][] = [];
  for (const rs of proches.values()) {
    if (rs.size < 2 || rs.size > 4) continue; // au-delà : homonymes courants, la paire n'apporte rien
    const l = [...rs];
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const [a, b] = [l[i], l[j]], ia = interdits.get(a);
      if (ia && membres.get(b)!.some((m) => ia.has(m))) continue; // déjà tranché : séparés
      pairesRacines.push([a, b]);
    }
  }

  // ─── 5. Identifiants stables ────────────────────────────────────────────────────
  const ancien = new Map<number, number>((await db.query(`select identite_id, client_id from rcu.client_identite`)).rows
    .map((r) => [Number(r.identite_id), Number(r.client_id)]));
  const clientDe = new Map<number, number>(); // racine → client
  const pris = new Set<number>();
  const aCreer: number[] = [];
  const racines = [...membres.keys()].sort((a, b) => membres.get(b)!.length - membres.get(a)!.length || a - b);
  for (const r of racines) {
    const votes = new Map<number, number>();
    for (const m of membres.get(r)!) { const c = ancien.get(m); if (c != null && !pris.has(c)) votes.set(c, (votes.get(c) ?? 0) + 1); }
    const elu = [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    if (elu != null) { clientDe.set(r, elu); pris.add(elu); } else aCreer.push(r);
  }
  const nouveaux = aCreer.length
    ? (await db.query(`select nextval('rcu.client_id_seq')::bigint as id from generate_series(1, $1)`, [aCreer.length])).rows.map((x) => Number(x.id))
    : [];
  aCreer.forEach((r, i) => { clientDe.set(r, nouveaux[i]); pris.add(nouveaux[i]); });

  const mapIdent: number[] = [], mapClient: number[] = [], mapRegle: string[] = [];
  for (const [r, ms] of membres) for (const m of ms) {
    mapIdent.push(m); mapClient.push(clientDe.get(r)!);
    mapRegle.push(ms.length === 1 ? 'Identité seule' : regle.get(m) ?? 'Identité de référence');
  }
  // Clients qui disparaissent : absorbés (fusionne_dans = client qui a repris la majorité de leurs identités) ou sans vente.
  const nouveauDe = new Map<number, number>(mapIdent.map((m, i) => [m, mapClient[i]]));
  const anciensClients = new Map<number, Map<number, number>>();
  for (const [ident, c] of ancien) if (!pris.has(c)) {
    const n = nouveauDe.get(ident); if (n == null) continue;
    const v = anciensClients.get(c) ?? anciensClients.set(c, new Map()).get(c)!; v.set(n, (v.get(n) ?? 0) + 1);
  }
  const absorbes = [...anciensClients].map(([c, v]) => [c, [...v].sort((a, b) => b[1] - a[1])[0][0]] as [number, number]);

  phase('calcul');
  // ─── Écriture (une transaction) ─────────────────────────────────────────────────
  const client = await db.connect();
  try {
    await client.query('begin');
    if (nouveaux.length) await client.query(`insert into rcu.client (id) select unnest($1::bigint[])`, [nouveaux]);
    await client.query(`delete from rcu.candidat`);
    // ⚠️ Jamais `id = any(<180 000 ids>)` : comparaison quadratique (69 s). Tables temporaires et jointures, et on n'écrit
    // que ce qui CHANGE (une nuit ordinaire ne touche presque rien).
    await client.query(`create temp table nm (identite_id bigint primary key, client_id bigint not null, regle text not null) on commit drop`);
    await client.query(`insert into nm select * from unnest($1::bigint[], $2::bigint[], $3::text[])`, [mapIdent, mapClient, mapRegle]);
    await client.query(`delete from rcu.client_identite ci where not exists (select 1 from nm where nm.identite_id = ci.identite_id)`);
    await client.query(`insert into rcu.client_identite as ci (identite_id, client_id, regle) select * from nm
      on conflict (identite_id) do update set client_id = excluded.client_id, regle = excluded.regle
      where (ci.client_id, ci.regle) is distinct from (excluded.client_id, excluded.regle)`);
    await client.query(`create temp table actifs (id bigint primary key) on commit drop`);
    await client.query(`insert into actifs select unnest($1::bigint[])`, [[...pris]]);
    await client.query(`update rcu.client c set actif = false, fusionne_dans = null
      where (c.actif or c.fusionne_dans is not null) and not exists (select 1 from actifs a where a.id = c.id)`);
    await client.query(`update rcu.client c set actif = true, fusionne_dans = null
      from actifs a where a.id = c.id and (not c.actif or c.fusionne_dans is not null)`);
    if (absorbes.length) await client.query(
      `update rcu.client c set fusionne_dans = x.f from unnest($1::bigint[], $2::bigint[]) as x(id, f) where c.id = x.id`,
      [absorbes.map((x) => x[0]), absorbes.map((x) => x[1])]);
    await client.query(`delete from rcu.contact_suspect`);
    const sk = [...suspects];
    await client.query(`insert into rcu.contact_suspect (type, valeur, motif) select * from unnest($1::text[], $2::text[], $3::text[])`,
      [sk.map(([k]) => k.slice(0, k.indexOf(':'))), sk.map(([k]) => k.slice(k.indexOf(':') + 1)), sk.map(([, m]) => m)]);
    await client.query(`delete from rcu.identite_generique`);
    const gk = [...generiques];
    await client.query(`insert into rcu.identite_generique (identite_id, motif) select * from unnest($1::bigint[], $2::text[])`,
      [gk.map(([i]) => i), gk.map(([, m]) => m)]);
    const pa = pairesRacines.map(([a, b]) => [clientDe.get(a)!, clientDe.get(b)!].sort((x, y) => x - y));
    await client.query(`insert into rcu.candidat (client_a, client_b, raison) select * from unnest($1::bigint[], $2::bigint[], $3::text[]) on conflict do nothing`,
      [pa.map((p) => p[0]), pa.map((p) => p[1]), pa.map(() => 'Même nom, prénom et code postal, sans coordonnée commune')]);
    await client.query('analyze rcu.client_identite');
    phase('ecriture');
    const resumes = await majResumes(client);
    phase('resumes');
    const stats: StatsRapprochement = {
      identites: ids.length, eligibles: ids.filter((x) => x.eligible).length, generiques: generiques.size,
      clients: membres.size, clientsMultiIdentites: [...membres.values()].filter((m) => m.length > 1).length,
      clientsNouveaux: nouveaux.length, clientsAbsorbes: absorbes.length, fusions, unionsRefuseesParSeparation: refusees,
      aArbitrer: pa.length, suspectsTel: sk.filter(([k]) => k.startsWith('tel:')).length, suspectsEmail: sk.filter(([k]) => k.startsWith('email:')).length,
      resumes, phases, dureeSecondes: Math.round((Date.now() - t0) / 100) / 10,
    };
    await client.query(`update rcu.rapprochement_run set fin = now(), stats = $2 where id = $1`, [runId, stats]);
    await client.query('commit');
    return stats;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    await db.query(`update rcu.rapprochement_run set fin = now(), stats = $2 where id = $1`, [runId, { erreur: (e as Error).message }]).catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
