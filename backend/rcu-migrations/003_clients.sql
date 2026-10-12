-- RCU — lot 2 : le CLIENT UNIQUE (12/10/2026).
--
-- Une identité DCS (identite_source) = ce que DCS appelle un client, dans UNE société. Un client RCU regroupe une ou
-- plusieurs identités selon les règles de RCU-CADRAGE.md § 4.3, recalculées après chaque import (src/rcu/rapprochement.ts).
-- Un client garde son identifiant à vie ; absorbé par un autre, il pointe vers lui (`fusionne_dans`).
-- Les DÉCISIONS humaines (fusion / séparation) sont rejouées à chaque recalcul : la nuit ne défait jamais un arbitrage.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

create table rcu.client (
  id              bigserial primary key,
  actif           boolean not null default true,  -- faux : absorbé (fusionne_dans) ou plus aucune vente retenue
  fusionne_dans   bigint references rcu.client(id),
  cree_le         timestamptz not null default now(),
  -- Résumé recalculé (src/rcu/resume.ts) : sert la liste et la recherche sans rien charger en masse.
  type            text,                -- particulier | societe
  civilite        text,                -- homme | femme | couple | societe
  civilite_dcs    text,
  nom             text,
  prenom          text,
  num_rue         text,
  type_rue        text,
  rue             text,
  cp              text,
  ville           text,
  site            text,
  sites           text[] not null default '{}',
  marques         text[] not null default '{}',
  sources         text[] not null default '{}',
  derniere_vente  date,
  source_derniere text,
  vehicule_id     bigint references rcu.vehicule(id),
  nb_vehicules    int not null default 0,
  vendeur         text,
  fin_famille     text,
  fin_organisme   text,
  fin_fin         date,
  suspect         boolean not null default false,
  recherche       text not null default ''
);
create index on rcu.client using gin (recherche gin_trgm_ops) where actif;
create index on rcu.client (derniere_vente desc nulls last) where actif;
create index on rcu.client (fin_fin) where actif and fin_fin is not null;
create index on rcu.client using gin (sites) where actif;
create index on rcu.client using gin (marques) where actif;

-- Rattachement identité DCS → client, avec la règle qui l'a décidé (affichée dans l'onglet Sources de la fiche).
create table rcu.client_identite (
  identite_id  bigint primary key references rcu.identite_source(id),
  client_id    bigint not null references rcu.client(id),
  regle        text not null
);
create index on rcu.client_identite (client_id);

-- Décisions humaines, sur des paires d'IDENTITÉS (stables), pas de clients (qui peuvent changer d'identifiant).
create table rcu.decision (
  id          serial primary key,
  identite_a  bigint not null references rcu.identite_source(id),
  identite_b  bigint not null references rcu.identite_source(id),
  decision    text not null check (decision in ('fusion', 'separation')),
  auteur      text not null,
  cree_le     timestamptz not null default now(),
  check (identite_a < identite_b),
  unique (identite_a, identite_b)
);

-- Recalculés à chaque rapprochement.
create table rcu.contact_suspect (
  type    text not null,               -- tel | email
  valeur  text not null,
  motif   text not null,
  primary key (type, valeur)
);
create table rcu.identite_generique (
  identite_id  bigint primary key references rcu.identite_source(id),
  motif        text not null
);
create table rcu.candidat (
  client_a  bigint not null references rcu.client(id),
  client_b  bigint not null references rcu.client(id),
  raison    text not null,
  primary key (client_a, client_b)
);

create table rcu.rapprochement_run (
  id      serial primary key,
  debut   timestamptz not null default now(),
  fin     timestamptz,
  stats   jsonb not null default '{}'::jsonb
);

-- ─── SEULES règles de civilité et de type de personne (rapprochement ET résumé les lisent) ───────────
-- 39 libellés DCS (« Mr & Mme », « MR ME », « SARL », « Etablissement »…) ramenés à 4 valeurs.
create function rcu.civilite_norm(c text) returns text language sql immutable as $$
  select case
    when c is null or btrim(c) = '' then null
    when upper(btrim(c)) in ('SOCIETE', 'SOCIÉTÉ', 'SARL', 'SAS', 'SASU', 'SA', 'EURL', 'SNC', 'SCI', 'EARL', 'EARL.', 'GAEC', 'EI',
         'ETABLISSEMENT', 'ÉTABLISSEMENT', 'ENTREPRISE', 'ASSOCIATION', 'ADMINISTRATION', 'GARAGE', 'MAIRIE', 'COMMUNE', 'HOPITAL',
         'HÔPITAL', 'CABINET', 'AGENCE', 'FEDERATION', 'FÉDÉRATION', 'ASSURANCE', 'STE ACTION SIMP', 'SCT', 'STE', 'CCS',
         'GROUPE BONY', 'SELARL', 'MTRE') then 'societe'
    when upper(c) ~ '&|\mET\M|\mOU\M' or upper(btrim(c)) in ('MR ME', 'MME MR', 'MR MME', 'MONSIEUR MADAME', 'MADAME MONSIEUR', 'M ET MME')
      then 'couple'
    when upper(btrim(c)) in ('MONSIEUR', 'MR', 'M', 'M.') then 'homme'
    when upper(btrim(c)) in ('MADAME', 'MME', 'MADEMOISELLE', 'MLLE', 'MELLE') then 'femme'
  end
$$;

-- Société : civilité de société, OU (pas de civilité ni de prénom ET forme juridique dans le nom).
create function rcu.type_personne(civilite text, nom text, prenom text) returns text language sql immutable as $$
  select case
    when rcu.civilite_norm(civilite) = 'societe' then 'societe'
    when rcu.civilite_norm(civilite) is null and coalesce(btrim(prenom), '') = ''
         and upper(coalesce(nom, '')) ~ '\m(SARL|SAS|SASU|SA|EURL|SCI|EARL|GAEC|SNC|STE|SOCIETE|GARAGE|ETS|ASSOCIATION|MAIRIE|COMMUNE|AUTOMOBILES?|TRANSPORTS?)\M'
      then 'societe'
    else 'particulier'
  end
$$;
