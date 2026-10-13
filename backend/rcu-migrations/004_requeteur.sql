-- SPARK (RCU) — lot 3 : le Requêteur (12/10/2026).

-- ─── Résumé client : les coordonnées VALIDES (non suspectes), calculées par src/rcu/resume.ts ───────
-- Elles servent aux garde-fous des canaux, au dédoublonnage et aux exports.
alter table rcu.client add column premiere_vente date;
alter table rcu.client add column email text;              -- e-mail valide le plus récent
alter table rcu.client add column portable text;           -- 06 / 07 valide le plus récent (colonne portable OU domicile)
alter table rcu.client add column fixe text;               -- fixe valide le plus récent
alter table rcu.client add column adresse_complete boolean not null default false;
alter table rcu.client add column energie text;
alter table rcu.client add column nb_parc int not null default 0;   -- véhicules ENCORE au parc (taille de flotte), recalculé avec rcu.cv          -- énergie du dernier véhicule (précalculée : la déduire 180 000 fois coûte 4 s)

-- ─── Énergie : DCS ne la donne qu'en VN ; ailleurs, on la DÉDUIT de la version / du modèle ──────────
create function rcu.energie_norm(energie text, version text, modele text) returns text language sql immutable as $$
  select case
    when upper(coalesce(energie, '')) ~ 'COURANT' and upper(energie) ~ 'ESSENCE|DIESEL' then 'Hybride'
    when upper(coalesce(energie, '')) ~ 'HYBRID' then 'Hybride'
    when upper(coalesce(energie, '')) ~ 'ELECTRIQUE|ÉLECTRIQUE|COURANT' then 'Électrique'
    when upper(coalesce(energie, '')) ~ 'GPL|GAZ' then 'GPL'
    when upper(coalesce(energie, '')) ~ 'DIESEL' then 'Diesel'
    when upper(coalesce(energie, '')) ~ 'ESSENCE' then 'Essence'
    -- sans énergie DCS : indices de la version / du modèle (Renault, Dacia, Nissan)
    when upper(concat_ws(' ', version, modele)) ~ '\m(E-TECH|ETECH) (FULL )?HYBRID|PLUG-IN|\mHYBRID|E-POWER' then 'Hybride'
    when upper(concat_ws(' ', version, modele)) ~ '\m(ZOE|SPRING|MEGANE E-TECH|R5 E-TECH|RENAULT 5|TWINGO E-TECH|LEAF|ARIYA|Z\.?E\.?|ELECTRIQUE|ÉLECTRIQUE|100% ELECTRIQUE)\M' then 'Électrique'
    when upper(concat_ws(' ', version, modele)) ~ '\m(ECO-G|ECO G|GPL|BI-FUEL|LPG)\M' then 'GPL'
    when upper(concat_ws(' ', version, modele)) ~ '\m(DCI|BLUE DCI|BLUEDCI|D-4D|HDI|TDI|CRDI|MULTIJET)\M' then 'Diesel'
    when upper(concat_ws(' ', version, modele)) ~ '\m(TCE|SCE|DIG-T|PURETECH|TSI|TFSI|VTI|E-TECH)\M' then 'Essence'
  end
$$;

-- ─── Table de travail du Requêteur : une ligne par vente RETENUE, véhicule et financement à plat ─────
-- Reconstruite après chaque rapprochement (src/rcu/requete.ts › rafraichirVentesClients). Elle porte l'identité DCS,
-- pas le client : une fusion / séparation manuelle n'a donc pas à la reconstruire.
create table rcu.cv (
  vente_id        bigint primary key,
  identite_id     bigint not null,
  source          text not null,
  type_vh         text not null,
  date_achat      date,
  site            text,
  vendeurs        text[] not null default '{}',
  intermediaire   text,
  type_vente      text,
  montant_tarif   numeric(12,2),
  reprise         boolean not null,
  garantie        text,
  fin_organisme   text,
  fin_famille     text,
  fin_debut       date,
  fin_fin         date,
  fin_duree       int,
  vehicule_id     bigint,
  marque          text,
  modele          text,
  version         text,
  energie         text,
  genre           text,
  date_mec        date,
  ct_prochain     date,
  immat           text,
  vin             text,
  actuel          boolean not null      -- ce client est le dernier acheteur connu du véhicule
);
create index on rcu.cv (identite_id);
create index on rcu.cv (fin_fin) where fin_fin is not null;

-- ─── Zones de chalandise (règles « EXTRACTION DCSNET » de Bony, 12/10/2026) — des DONNÉES ─────────────
create table rcu.ref_zone (
  concession    text primary key,
  departements  text[] not null,
  note          text
);
insert into rcu.ref_zone (concession, departements, note) values
  ('Clermont',        '{63}',          null),
  ('Issoire',         '{63,15,43}',    '43 = Brioude'),
  ('Le Puy-en-Velay', '{43,07,48}',    null),
  ('Massagettes',     '{63,15}',       null),
  ('Mende',           '{48}',          null),
  ('Moulins',         '{03,58,71}',    null),
  ('Mozac',           '{63}',          null),
  ('Ussel',           '{19,23}',       null),
  ('Vichy',           '{03,63}',       null),
  ('Thiers',          '{42,43,63}',    'Thiers / Ambert');

-- ─── Agents R2 rattachés à un AUTRE site que celui de l'affaire (règles Bony) ─────────────────────────
-- Exemple : l'agent GGE SERVEL vend sous l'affaire de Thiers mais est rattaché au Puy depuis le 01/01/2026.
create table rcu.ref_agent (
  intermediaire  text primary key,       -- libellé DCS « Nom intermédiaire 1 », en majuscules
  site           text not null,
  vendeur        text,
  depuis         date,
  note           text
);
insert into rcu.ref_agent (intermediaire, site, vendeur, depuis, note) values
  ('GGE SERVEL DIDIER ET NATH', 'Le Puy-en-Velay', 'RANVOISE JEAN PIERRE', '2026-01-01', 'Agent rattaché au Puy (vendeur secteur JP Ranvoise)'),
  ('GARAGE SERVEL',             'Le Puy-en-Velay', 'RANVOISE JEAN PIERRE', '2026-01-01', 'Même agent, autre libellé DCS'),
  ('SERVEL DIDIER ET NATHALIE', 'Le Puy-en-Velay', 'RANVOISE JEAN PIERRE', '2026-01-01', 'Même agent, autre libellé DCS');

-- ─── Requêtes enregistrées et journal des exports ────────────────────────────────────────────────────
create table rcu.requete (
  id                 serial primary key,
  nom                text not null,
  spec               jsonb not null,
  partagee           boolean not null default false,
  auteur_id          text not null,
  auteur             text not null,
  cree_le            timestamptz not null default now(),
  maj_le             timestamptz not null default now(),
  dernier_compte     int,
  dernier_lancement  timestamptz
);

-- Chaque export est tracé : qui, quand, combien, quelle requête — et QUELS clients (lot 4 : « déjà ciblés »).
create table rcu.export_journal (
  id           serial primary key,
  cree_le      timestamptz not null default now(),
  auteur_id    text not null,
  auteur       text not null,
  format       text not null,
  fichier      text not null,
  requete_id   int references rcu.requete(id) on delete set null,
  requete_nom  text,
  spec         jsonb not null,
  nb_lignes    int not null
);
create table rcu.export_client (
  export_id  int not null references rcu.export_journal(id) on delete cascade,
  client_id  bigint not null,
  primary key (export_id, client_id)
);
create index on rcu.export_client (client_id);
