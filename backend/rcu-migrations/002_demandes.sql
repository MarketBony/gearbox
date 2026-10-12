-- RCU — lot 1 : demandes du Master traitées par le worker (12/10/2026).
--
-- « Appliquer quand même » un import refusé : seul le worker a les fichiers (archive du VPS). L'API inscrit
-- donc une DEMANDE ; le worker la prend, relit le fichier archivé de ce run et l'applique avec `force`.
create table rcu.import_demande (
  id          serial primary key,
  run_id      int not null references rcu.import_run(id),
  demandeur   text not null,             -- nom de l'utilisateur Gearbox (journal)
  cree_le     timestamptz not null default now(),
  traitee_le  timestamptz,
  resultat    text
);
create unique index on rcu.import_demande (run_id) where traitee_le is null;

-- Trace d'une correspondance de site ajoutée depuis Gearbox (« Classer… »).
alter table rcu.ref_site_libelle add column ajoute_par text;
alter table rcu.ref_site_libelle add column ajoute_le timestamptz;
