import { Pool, PoolClient } from 'pg';
import { rcu } from './db';
import { norm } from './rapprochement';

/**
 * Portefeuilles vendeurs de SPARK (lot 4) — SEULE porte qui décide à quel vendeur appartient un client.
 * Couche Bony : l'import du soir n'écrit jamais ici ; le recalcul tourne après chaque rapprochement, une fois par jour
 * (départs datés) et après chaque changement du référentiel.
 *
 * Règles, dans l'ordre (écran « Règles du portefeuille ») :
 *   1. choix manuel VERROUILLÉ : ne bouge jamais (vendeur parti → client « à attribuer », verrou conservé) ;
 *   2. vendeur de son DERNIER ACHAT, s'il est présent — un nouvel achat remet le client en jeu ;
 *   3. un client qui a déjà un vendeur présent le GARDE (pas de rééquilibrage automatique) ;
 *   puis, pour un client sans vendeur présent (et dont le dernier achat date de moins de `anciennete_ans`) :
 *   4. règles particulières · 5. vendeur Sociétés · 6. vendeur Secteur (code postal précis avant département)
 *   · 7. Hall (au moins chargé) · 8. « à attribuer ».
 * L'agent (intermédiaire) est une SECONDE variable du client : il ne change jamais le portefeuille.
 * Calcul déterministe : clients traités par identifiant croissant, égalités départagées par identifiant de vendeur.
 */

export interface Vendeur {
  id: number; nom: string; prenom: string; site: string; service: 'VN' | 'VO'; fonction: string; marques: string[];
  recoit: boolean; entree: string | null; sortie: string | null; archive: boolean; zones: string[]; remplacant_id: number | null;
}
type Origine = 'achat' | 'garde' | 'regle' | 'societes' | 'secteur' | 'hall' | 'manuel' | 'a_attribuer';
interface Ligne { client_id: number; vendeur_id: number | null; origine: Origine; detail: string | null; verrou: boolean; vente_ref: number | null }
interface Client {
  id: number; type: string; cp: string | null; site: string | null; type_vh: string | null; marque: string | null;
  vendeur: string | null; intermediaire: string | null; vente_id: number | null; date_achat: string | null;
}
export interface Options {
  ecrire?: boolean;                 // faux = simulation (rien n'est écrit)
  absents?: number[];               // aperçu d'un départ : ces vendeurs sont considérés comme partis
  declencheur?: string;
  forcer?: boolean;                 // passe outre `actif = false` (simulation depuis l'écran)
}

export const nomVendeur = (v: Pick<Vendeur, 'nom' | 'prenom'>) => [v.prenom, v.nom].filter(Boolean).join(' ');
export const present = (v: Vendeur, jour: string, absents: number[] = []) =>
  !v.archive && !absents.includes(v.id) && (!v.entree || v.entree <= jour) && (!v.sortie || v.sortie >= jour);

export async function chargerVendeurs(db: Pool | PoolClient = rcu()): Promise<Vendeur[]> {
  const { rows } = await db.query(`
    select v.id, v.nom, v.prenom, v.site, v.service, v.fonction, v.marques, v.recoit, v.remplacant_id,
           to_char(v.entree, 'YYYY-MM-DD') as entree, to_char(v.sortie, 'YYYY-MM-DD') as sortie, v.archive_le is not null as archive,
           coalesce((select array_agg(z.zone order by z.zone) from rcu.vendeur_secteur z where z.vendeur_id = v.id), '{}') as zones
    from rcu.vendeur v order by v.id`);
  return rows;
}

/** Les données Bony suivent un client absorbé par une fusion (identifiants stables, `fusionne_dans`). */
export async function suivreFusions(db: Pool | PoolClient): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const n = (await db.query(`
      with f as (select id, fusionne_dans as vers from rcu.client where not actif and fusionne_dans is not null),
      e as (update rcu.echange x set client_id = f.vers from f where x.client_id = f.id returning 1),
      r as (insert into rcu.contact_refus (client_id, canal, motif, par, le)
            select f.vers, z.canal, z.motif, z.par, z.le from rcu.contact_refus z join f on f.id = z.client_id on conflict do nothing returning 1),
      d as (delete from rcu.contact_refus z using f where z.client_id = f.id returning 1)
      select (select count(*) from e) + (select count(*) from d) as n`)).rows[0].n;
    if (!Number(n)) break;
  }
  await db.query(`delete from rcu.portefeuille p using rcu.client c where c.id = p.client_id and not c.actif`);
}

// ─── Noms DCS ───────────────────────────────────────────────────────────────────────
const lev = (a: string, b: string): number => {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
};
/** Clés de rapprochement d'un vendeur : « NOM PRENOM » et « PRENOM NOM », normalisés. */
export const clesVendeur = (v: Pick<Vendeur, 'nom' | 'prenom'>) => [...new Set([norm(`${v.nom} ${v.prenom}`), norm(`${v.prenom} ${v.nom}`)])].filter(Boolean);

/** Inscrit les noms DCS qu'on sait rattacher (identiques → auto, proches → propose). N'écrase jamais une décision humaine. */
export async function majAlias(db: Pool | PoolClient, par = 'SPARK'): Promise<{ auto: number; propose: number }> {
  const V = (await chargerVendeurs(db)).filter((v) => !v.archive);
  const connus = new Set((await db.query(`select libelle from rcu.vendeur_alias where etat <> 'propose'`)).rows.map((r) => r.libelle));
  const noms = [...new Set((await db.query(`select distinct x as n from rcu.cv, unnest(vendeurs) x`)).rows
    .map((r) => norm(r.n)).filter((n) => n && !connus.has(n)))];
  const exact = new Map<string, number>(), proche = new Map<string, number>();
  for (const v of V) for (const k of clesVendeur(v)) if (!exact.has(k)) exact.set(k, v.id);
  for (const n of new Set(noms)) {
    if (exact.has(n)) continue;
    // Proche : même nom de famille et prénom qui commence pareil (« MOREL JUL »), ou 1-2 lettres d'écart (« MATHIEU REMY »).
    const cand = V.filter((v) => n === norm(v.nom) || clesVendeur(v).some((k) => (n.length >= 8 && lev(n, k) <= 2)
      || (n.startsWith(norm(v.nom) + ' ') && v.prenom && norm(v.prenom).startsWith(n.slice(norm(v.nom).length + 1)) && n.length - norm(v.nom).length > 3)));
    if (cand.length === 1) proche.set(n, cand[0].id);
  }
  const ex = [...exact].filter(([k]) => noms.includes(k));
  if (ex.length) await db.query(`insert into rcu.vendeur_alias (libelle, vendeur_id, etat, maj_par) select x.l, x.v, 'auto', $3
    from unnest($1::text[], $2::int[]) as x(l, v) on conflict (libelle) do update set vendeur_id = excluded.vendeur_id, etat = 'auto', maj_le = now(), maj_par = excluded.maj_par
    where rcu.vendeur_alias.etat = 'propose'`, [ex.map((x) => x[0]), ex.map((x) => x[1]), par]);
  const pr = [...proche];
  if (pr.length) await db.query(`insert into rcu.vendeur_alias (libelle, vendeur_id, etat, maj_par) select x.l, x.v, 'propose', $3
    from unnest($1::text[], $2::int[]) as x(l, v) on conflict (libelle) do nothing`, [pr.map((x) => x[0]), pr.map((x) => x[1]), par]);
  return { auto: ex.length, propose: pr.length };
}

// ─── Chargement initial (fichier MAEVA converti par scripts/spark-vendeurs-maeva.py) ─
interface Maeva {
  vendeurs: { nom: string; prenom: string; site: string; service: string; fonction: string; marques: string[]; recoit: boolean;
    ipn: string | null; telephone: string | null; zones: string[]; note: string | null; sortie: string | null }[];
  encadrement: { site: string; role: string; nom: string }[];
  regles: { site: string; type: string; valeurs: string[]; vendeur: string; note: string }[];
}
/** Charge le référentiel UNE fois (refusé si des vendeurs existent déjà). Rend les compteurs. */
export async function chargerMaeva(d: Maeva, par = 'Fichier MAEVA'): Promise<Record<string, number>> {
  const db = await rcu().connect();
  try {
    await db.query('begin');
    if ((await db.query('select 1 from rcu.vendeur limit 1')).rowCount) throw new Error('Le référentiel contient déjà des vendeurs : chargement refusé (l’écran Équipes fait foi).');
    const ids = new Map<string, number>();
    for (const v of d.vendeurs) {
      const id = Number((await db.query(`insert into rcu.vendeur (nom, prenom, site, service, fonction, marques, recoit, ipn, telephone, note, sortie, cree_par, maj_par)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) returning id`,
      [v.nom, v.prenom, v.site, v.service, v.fonction, v.marques, v.recoit, v.ipn, v.telephone, v.note, v.sortie, par])).rows[0].id);
      ids.set(norm(`${v.nom} ${v.prenom}`), id);
      if (v.zones.length) await db.query(`insert into rcu.vendeur_secteur (vendeur_id, zone) select $1, unnest($2::text[]) on conflict do nothing`, [id, v.zones]);
      await db.query(`insert into rcu.vendeur_journal (vendeur_id, texte, par) values ($1, 'Créé (chargement du fichier MAEVA)', $2)`, [id, par]);
    }
    for (const e of d.encadrement) await db.query(`insert into rcu.encadrement (site, role, nom, maj_par) values ($1, $2, $3, $4) on conflict do nothing`, [e.site, e.role, e.nom, par]);
    let regles = 0;
    for (const r of d.regles) {
      const id = ids.get(norm(r.vendeur)); if (!id) continue;
      await db.query(`insert into rcu.regle_portefeuille (site, type, valeurs, vendeur_id, note, cree_par) values ($1, $2, $3, $4, $5, $6)`, [r.site, r.type, r.valeurs, id, r.note, par]);
      regles++;
    }
    const al = await majAlias(db, par);
    await db.query('commit');
    return { vendeurs: d.vendeurs.length, encadrants: d.encadrement.length, regles, noms_auto: al.auto, noms_proposes: al.propose };
  } catch (e) { await db.query('rollback').catch(() => undefined); throw e; } finally { db.release(); }
}

// ─── Recalcul ───────────────────────────────────────────────────────────────────────
export interface Resultat {
  run: number | null; clients: number; changements: number; ms: number;
  par_origine: Record<string, number>; a_attribuer: number; hors: number;
  /** simulation d'un départ : où iraient les clients des vendeurs absents */
  destinations?: { vendeur_id: number | null; origine: string; n: number }[];
}

export async function recalculer(opts: Options = {}): Promise<Resultat | null> {
  const t0 = Date.now(), pool = rcu(), ecrire = opts.ecrire !== false;
  const db = await pool.connect();
  try {
    await db.query('select pg_advisory_lock(hashtext($1))', ['rcu-portefeuille']);
    const param = (await db.query(`select actif, anciennete_ans from rcu.portefeuille_param where id = 1`)).rows[0];
    if (!param?.actif && !opts.forcer) return null;
    if (ecrire) await suivreFusions(db);
    const jour: string = (await db.query(`select to_char(current_date, 'YYYY-MM-DD') as j`)).rows[0].j;
    const limite: string | null = param.anciennete_ans
      ? (await db.query(`select to_char(current_date - make_interval(years => $1::int), 'YYYY-MM-DD') as d`, [param.anciennete_ans])).rows[0].d : null;
    const V = await chargerVendeurs(db);
    const byId = new Map(V.map((v) => [v.id, v]));
    const absents = opts.absents ?? [];
    const ok = (v: Vendeur | undefined): v is Vendeur => !!v && present(v, jour, absents);
    const alias = new Map<string, number>((await db.query(`select libelle, vendeur_id from rcu.vendeur_alias where etat in ('auto', 'valide') and vendeur_id is not null`)).rows
      .map((r) => [r.libelle, r.vendeur_id]));
    const regles = (await db.query(`select id, site, service, type, valeurs, vendeur_id, note from rcu.regle_portefeuille where actif order by ordre, id`)).rows;
    const anciens = new Map<number, Ligne>((await db.query(`select client_id, vendeur_id, origine, detail, verrou, vente_ref from rcu.portefeuille`)).rows
      .map((r) => [Number(r.client_id), { ...r, client_id: Number(r.client_id), vente_ref: r.vente_ref == null ? null : Number(r.vente_ref) }]));
    const clients: Client[] = (await db.query(`
      with l as (select distinct on (ci.client_id) ci.client_id, cv.vente_id, cv.type_vh, cv.marque, cv.vendeurs[1] as vendeur,
                   cv.intermediaire, to_char(cv.date_achat, 'YYYY-MM-DD') as date_achat, cv.site
                 from rcu.cv cv join rcu.client_identite ci on ci.identite_id = cv.identite_id
                 order by ci.client_id, cv.date_achat desc nulls last, cv.vente_id desc)
      select c.id, c.type, c.cp, coalesce(l.site, c.site) as site, l.type_vh, l.marque, l.vendeur, l.intermediaire, l.vente_id, l.date_achat
      from rcu.client c left join l on l.client_id = c.id where c.actif order by c.id`)).rows
      .map((r) => ({ ...r, id: Number(r.id), vente_id: r.vente_id == null ? null : Number(r.vente_id) }));

    const charge = new Map<number, number>();
    const prend = (id: number) => charge.set(id, (charge.get(id) || 0) + 1);
    const moinsCharge = (L: Vendeur[]) => L.slice().sort((a, b) => (charge.get(a.id) || 0) - (charge.get(b.id) || 0) || a.id - b.id)[0];
    const nouv = new Map<number, Ligne>();
    const aCascader: Client[] = [];
    let hors = 0;

    // Passe 1 : ce qui ne bouge pas (verrou, dernier achat, vendeur présent gardé).
    for (const c of clients) {
      const old = anciens.get(c.id);
      const achat = c.vendeur ? byId.get(alias.get(norm(c.vendeur)) as number) : undefined;
      const set = (l: Omit<Ligne, 'client_id'>) => { nouv.set(c.id, { client_id: c.id, ...l }); if (l.vendeur_id) prend(l.vendeur_id); };
      if (old?.verrou) {
        set(ok(byId.get(old.vendeur_id as number)) ? { ...old } : { vendeur_id: null, origine: 'a_attribuer', detail: 'Vendeur verrouillé parti', verrou: true, vente_ref: old.vente_ref });
      } else if (ok(achat) && (!old || old.vente_ref !== c.vente_id || old.vendeur_id === achat.id)) {
        set({ vendeur_id: achat.id, origine: 'achat', detail: null, verrou: false, vente_ref: c.vente_id });
      } else if (old?.vendeur_id && ok(byId.get(old.vendeur_id))) {
        set({ ...old, origine: old.origine === 'achat' ? 'garde' : old.origine });
      } else if (ok(achat)) {
        set({ vendeur_id: achat.id, origine: 'achat', detail: null, verrou: false, vente_ref: c.vente_id });
      } else if (limite && (!c.date_achat || c.date_achat < limite)) {
        hors++;                                   // trop ancien : hors portefeuille (ligne retirée)
      } else aCascader.push(c);
    }

    // Passe 2 : clients sans vendeur présent → règles, sociétés, secteur, hall, à attribuer.
    for (const c of aCascader) {
      const old = anciens.get(c.id);
      const parti = old?.vendeur_id ? byId.get(old.vendeur_id) : c.vendeur ? byId.get(alias.get(norm(c.vendeur)) as number) : undefined;
      const avant = parti ? `Après le départ de ${nomVendeur(parti)} · ` : '';
      const svc = c.type_vh === 'VN' || c.type_vh === 'VO' ? c.type_vh : null;
      const compat = (v: Vendeur, service = true) => ok(v) && v.recoit && v.site === c.site && (!service || !svc || v.service === svc)
        && (!v.marques.length || (!!c.marque && v.marques.includes(c.marque)));
      const set = (v: Vendeur | null, origine: Origine, detail: string) => {
        nouv.set(c.id, { client_id: c.id, vendeur_id: v?.id ?? null, origine, detail: avant + detail, verrou: false, vente_ref: c.vente_id });
        if (v) prend(v.id);
      };
      const rempl = parti?.remplacant_id ? byId.get(parti.remplacant_id) : undefined;
      if (ok(rempl)) { set(rempl, 'regle', `Remplaçant de ${nomVendeur(parti!)}`); continue; }
      const r = regles.find((g) => g.site === c.site && (!g.service || g.service === svc) && (
        g.type === 'cp' ? !!c.cp && g.valeurs.some((x: string) => c.cp!.startsWith(x))
          : g.type === 'agent' ? !!c.intermediaire && g.valeurs.map(norm).includes(norm(c.intermediaire))
            // ancien vendeur : début du nom DCS (« ZARLENGA » reconnaît « ZARLENGA JEROME »)
            : !!c.vendeur && g.valeurs.some((x: string) => (norm(c.vendeur) + ' ').startsWith(norm(x) + ' '))) && ok(byId.get(g.vendeur_id)));
      if (r) { set(byId.get(r.vendeur_id)!, 'regle', `Règle : ${r.note || r.type}`); continue; }
      if (c.type === 'societe') {
        const L = V.filter((v) => v.fonction === 'societes' && compat(v, false));
        if (L.length) { set(moinsCharge(L), 'societes', 'Client société'); continue; }
      }
      if (c.cp) {
        const L = V.filter((v) => v.fonction === 'secteur' && compat(v));
        const exact = L.filter((v) => v.zones.includes(c.cp!)), dep = L.filter((v) => v.zones.includes(c.cp!.slice(0, 2)));
        const best = exact.length ? exact : dep;
        if (best.length) { set(moinsCharge(best), 'secteur', `Secteur ${exact.length ? c.cp : c.cp.slice(0, 2)}`); continue; }
      }
      const H = V.filter((v) => v.fonction === 'hall' && compat(v));
      if (H.length) { set(moinsCharge(H), 'hall', `Hall ${c.site} (au moins chargé)`); continue; }
      set(null, 'a_attribuer', svc ? `Aucun vendeur ${svc}${c.marque ? ` ${c.marque}` : ''} disponible à ${c.site || 'ce site'}` : 'Aucun vendeur disponible');
    }

    const par_origine: Record<string, number> = {};
    for (const l of nouv.values()) par_origine[l.origine] = (par_origine[l.origine] || 0) + 1;
    const diff = [...nouv.values()].filter((l) => {
      const o = anciens.get(l.client_id);
      return !o || o.vendeur_id !== l.vendeur_id || o.origine !== l.origine || o.detail !== l.detail || o.verrou !== l.verrou || o.vente_ref !== l.vente_ref;
    });
    const retires = [...anciens.keys()].filter((id) => !nouv.has(id));
    const changements = diff.filter((l) => anciens.get(l.client_id)?.vendeur_id !== l.vendeur_id).length + retires.length;
    const res: Resultat = { run: null, clients: nouv.size, changements, ms: 0, par_origine, a_attribuer: par_origine.a_attribuer || 0, hors };

    if (absents.length) {
      const m = new Map<string, { vendeur_id: number | null; origine: string; n: number }>();
      for (const [id, o] of anciens) {
        if (!o.vendeur_id || !absents.includes(o.vendeur_id)) continue;
        const l = nouv.get(id), k = `${l?.vendeur_id ?? ''}|${l?.origine ?? 'hors'}`;
        const x = m.get(k) || { vendeur_id: l?.vendeur_id ?? null, origine: l?.origine ?? 'hors', n: 0 }; x.n++; m.set(k, x);
      }
      res.destinations = [...m.values()].sort((a, b) => b.n - a.n);
    }

    if (ecrire) {
      await db.query('begin');
      const run = Number((await db.query(`insert into rcu.portefeuille_run (declencheur) values ($1) returning id`, [opts.declencheur || 'manuel'])).rows[0].id);
      const par = 'SPARK (recalcul)';
      if (diff.length) {
        const col = <K extends keyof Ligne>(k: K) => diff.map((l) => l[k]);
        await db.query(`create temp table pn (client_id bigint primary key, vendeur_id int, origine text, detail text, verrou boolean, vente_ref bigint) on commit drop`);
        await db.query(`insert into pn select * from unnest($1::bigint[], $2::int[], $3::text[], $4::text[], $5::boolean[], $6::bigint[])`,
          [col('client_id'), col('vendeur_id'), col('origine'), col('detail'), col('verrou'), col('vente_ref')]);
        await db.query(`insert into rcu.portefeuille_histo (client_id, de, vers, origine, detail, par)
          select pn.client_id, p.vendeur_id, pn.vendeur_id, pn.origine, pn.detail, $1 from pn left join rcu.portefeuille p on p.client_id = pn.client_id
          where p.vendeur_id is distinct from pn.vendeur_id`, [par]);
        await db.query(`insert into rcu.portefeuille as p (client_id, vendeur_id, origine, detail, verrou, vente_ref, depuis, par)
          select client_id, vendeur_id, origine, detail, verrou, vente_ref, now(), $1 from pn
          on conflict (client_id) do update set vendeur_id = excluded.vendeur_id, origine = excluded.origine, detail = excluded.detail,
            verrou = excluded.verrou, vente_ref = excluded.vente_ref,
            depuis = case when p.vendeur_id is distinct from excluded.vendeur_id then now() else p.depuis end,
            par = case when p.vendeur_id is distinct from excluded.vendeur_id then excluded.par else p.par end`, [par]);
      }
      if (retires.length) {
        await db.query(`insert into rcu.portefeuille_histo (client_id, de, vers, origine, detail, par)
          select client_id, vendeur_id, null, 'hors', 'Hors portefeuille (dernier achat trop ancien)', $2 from rcu.portefeuille where client_id = any($1::bigint[]) and vendeur_id is not null`, [retires, par]);
        await db.query(`delete from rcu.portefeuille where client_id = any($1::bigint[])`, [retires]);
      }
      res.ms = Date.now() - t0; res.run = run;
      await db.query(`update rcu.portefeuille_run set fin = now(), changements = $2, stats = $3 where id = $1`,
        [run, changements, { clients: res.clients, par_origine, a_attribuer: res.a_attribuer, hors, ms: res.ms }]);
      await db.query('commit');
      await db.query('analyze rcu.portefeuille');
    }
    res.ms = Date.now() - t0;
    return res;
  } catch (e) { await db.query('rollback').catch(() => undefined); throw e; } finally {
    await db.query('select pg_advisory_unlock(hashtext($1))', ['rcu-portefeuille']).catch(() => undefined);
    db.release();
  }
}
