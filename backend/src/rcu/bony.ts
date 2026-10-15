import { rcu } from './db';

/**
 * Couche Bony d'une fiche client (lot 4) : portefeuille (et son historique), refus de contact, échanges.
 * Lue par GET /api/crm/clients/:id ; écrite par routes/crmEquipes.ts. Jamais par l'import du soir.
 */
export const CANAUX = ['tout', 'email', 'sms', 'tel', 'courrier'] as const;
export const TYPES_ECHANGE = ['appel', 'email', 'sms', 'visite', 'note'] as const;

export async function ficheBony(id: number) {
  const db = rcu();
  const [pf, histo, refus, echanges, param] = await Promise.all([
    db.query(`select p.vendeur_id, nullif(concat_ws(' ', v.prenom, v.nom), '') as vendeur, v.site as vendeur_site, v.service as vendeur_service,
                     p.origine, p.detail, p.verrou, p.depuis, p.par
              from rcu.portefeuille p left join rcu.vendeur v on v.id = p.vendeur_id where p.client_id = $1`, [id]),
    db.query(`select h.le, h.origine, h.detail, h.par, nullif(concat_ws(' ', a.prenom, a.nom), '') as de, nullif(concat_ws(' ', b.prenom, b.nom), '') as vers
              from rcu.portefeuille_histo h left join rcu.vendeur a on a.id = h.de left join rcu.vendeur b on b.id = h.vers
              where h.client_id = $1 order by h.le desc, h.id desc limit 20`, [id]),
    db.query(`select canal, motif, par, le from rcu.contact_refus where client_id = $1 order by canal`, [id]),
    db.query(`select id, type, to_char(le, 'YYYY-MM-DD') as le, resultat, to_char(rappel, 'YYYY-MM-DD') as rappel, texte, auteur, auteur_id, cree_le
              from rcu.echange where client_id = $1 order by le desc, id desc`, [id]),
    db.query(`select actif from rcu.portefeuille_param where id = 1`),
  ]);
  return { portefeuille: pf.rows[0] ?? null, portefeuille_actif: !!param.rows[0]?.actif, historique: histo.rows, refus: refus.rows, echanges: echanges.rows };
}
