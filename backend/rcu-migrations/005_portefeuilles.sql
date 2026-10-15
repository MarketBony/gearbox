-- Lot 4 de SPARK (15/10/2026) : référentiel vendeurs, portefeuilles, « ne plus contacter », échanges.
-- COUCHE BONY : écrite par les utilisateurs (et le recalcul des portefeuilles), JAMAIS par l'import du soir.
-- SPARK est la source des vendeurs (GRID la lira) : modèle repris de GRID (plaque → site → vendeur, encadrement par site,
-- dates d'entrée / de sortie, marques, archivage), enrichi de la fonction, du secteur, de l'IPN et des noms DCS.

-- ─── Organisation ──────────────────────────────────────────────────────────────────
create table rcu.equipe_site (
  site       text primary key,                 -- nom de site Gearbox (ALL_SITES de siteScope.ts)
  plaque     text not null,                    -- CENTRE, NORD, SUD, SUD-OUEST, NISSAN
  ordre      int not null default 0,
  archive_le timestamptz
);
insert into rcu.equipe_site (site, plaque, ordre) values
  ('Clermont', 'CENTRE', 1), ('Ussel', 'CENTRE', 2), ('Mozac', 'CENTRE', 3), ('Massagettes', 'CENTRE', 4),
  ('Vichy', 'NORD', 1), ('Moulins', 'NORD', 2), ('Thiers', 'NORD', 3), ('Ambert', 'NORD', 4), ('Ricoux', 'NORD', 5),
  ('Issoire', 'SUD', 1), ('Brioude', 'SUD', 2), ('Mende', 'SUD', 3), ('Le Puy-en-Velay', 'SUD', 4),
  ('Albi', 'SUD-OUEST', 1), ('Rodez', 'SUD-OUEST', 2), ('Millau', 'SUD-OUEST', 3), ('Aurillac', 'SUD-OUEST', 4), ('Figeac', 'SUD-OUEST', 5),
  ('Gaillac', 'SUD-OUEST', 6), ('Villefranche', 'SUD-OUEST', 7), ('Carmaux', 'SUD-OUEST', 8), ('Lavaur', 'SUD-OUEST', 9),
  ('Montluçon', 'NISSAN', 1), ('Saint-Etienne', 'NISSAN', 2);

-- Un titulaire par rôle et par site (comme GRID). Nom libre ; compte Gearbox facultatif (id Supabase, pour le lot GRID / chefs de site).
create table rcu.encadrement (
  site     text not null references rcu.equipe_site(site),
  role     text not null check (role in ('chef_de_site', 'chef_de_vente_vn', 'chef_de_vente_vo')),
  nom      text not null,
  user_id  text,
  maj_le   timestamptz not null default now(),
  maj_par  text,
  primary key (site, role)
);

-- ─── Vendeurs ──────────────────────────────────────────────────────────────────────
create table rcu.vendeur (
  id          serial primary key,
  nom         text not null,
  prenom      text not null default '',
  site        text not null references rcu.equipe_site(site),
  service     text not null check (service in ('VN', 'VO')),
  fonction    text not null check (fonction in ('hall', 'secteur', 'societes', 'magasin', 'alternant')),
  marques     text[] not null default '{}',     -- majuscules comme rcu.cv.marque ; vide = toutes
  recoit      boolean not null default true,    -- faux : ne reçoit jamais de client par le recalcul (alternant, magasin…)
  ipn         text,
  telephone   text,
  email       text,
  entree      date,                             -- null = depuis toujours ; future = n'entre dans la répartition qu'à cette date
  sortie      date,                             -- dernier jour ; ses clients sont réattribués la nuit qui suit
  remplacant_id int references rcu.vendeur(id) on delete set null,  -- au départ, ses clients vont à ce vendeur (avant les règles)
  note        text,
  archive_le  timestamptz,                      -- masqué des listes, réversible (distinct de la sortie)
  cree_le     timestamptz not null default now(),
  cree_par    text,
  maj_le      timestamptz not null default now(),
  maj_par     text
);
create index on rcu.vendeur (site);

-- Secteur : codes postaux (5 chiffres) ou départements (2 caractères). Un code postal précis l'emporte sur un département.
create table rcu.vendeur_secteur (
  vendeur_id int not null references rcu.vendeur(id) on delete cascade,
  zone       text not null check (zone ~ '^([0-9]{2}|2[AB])([0-9]{3})?$'),
  primary key (vendeur_id, zone)
);
create index on rcu.vendeur_secteur (zone);

-- Noms de vendeur tels que DCS les écrit (« Nom vendeur1 », texte libre), normalisés (majuscules, sans accents).
--   auto : rattaché automatiquement (nom identique) · valide : rattaché par un utilisateur · propose : à valider
--   ancien : ancien vendeur (ses clients sont réattribués) · pas_vendeur : DIRECTION, compte générique…
create table rcu.vendeur_alias (
  libelle    text primary key,
  vendeur_id int references rcu.vendeur(id) on delete set null,
  etat       text not null check (etat in ('auto', 'valide', 'propose', 'ancien', 'pas_vendeur')),
  maj_le     timestamptz not null default now(),
  maj_par    text
);
create index on rcu.vendeur_alias (vendeur_id);

create table rcu.vendeur_journal (
  id         bigserial primary key,
  vendeur_id int not null references rcu.vendeur(id) on delete cascade,
  texte      text not null,
  par        text,
  le         timestamptz not null default now()
);
create index on rcu.vendeur_journal (vendeur_id, le desc);

-- ─── Règles particulières (feuille « EXTRACTION DCSNET » du fichier MAEVA) ─────────
-- Un client SANS vendeur présent, du site `site` (et du service, s'il est précisé), qui remplit la condition, va au vendeur.
create table rcu.regle_portefeuille (
  id         serial primary key,
  ordre      int not null default 0,
  actif      boolean not null default true,
  site       text not null references rcu.equipe_site(site),
  service    text check (service in ('VN', 'VO')),
  type       text not null check (type in ('cp', 'agent', 'ancien_vendeur')),
  valeurs    text[] not null,
  vendeur_id int not null references rcu.vendeur(id) on delete cascade,
  note       text,
  cree_le    timestamptz not null default now(),
  cree_par   text
);

-- ─── Portefeuilles ─────────────────────────────────────────────────────────────────
-- Une ligne par client actif une fois le recalcul lancé. vendeur_id null = « à attribuer ».
-- origine : achat (vendeur de son dernier achat) · garde (réattribué plus tôt, vendeur toujours présent) · regle · societes
--           · secteur · hall · manuel · a_attribuer
create table rcu.portefeuille (
  client_id  bigint primary key,
  vendeur_id int references rcu.vendeur(id) on delete set null,
  origine    text not null check (origine in ('achat', 'garde', 'regle', 'societes', 'secteur', 'hall', 'manuel', 'a_attribuer')),
  detail     text,                              -- lisible : « Départ de X · secteur 63270 », règle appliquée…
  verrou     boolean not null default false,    -- choix manuel verrouillé : le recalcul ne le déplace plus
  vente_ref  bigint,                            -- dernier achat connu au moment de l'attribution (un NOUVEL achat la remet en jeu)
  depuis     timestamptz not null default now(),
  par        text
);
create index on rcu.portefeuille (vendeur_id);

create table rcu.portefeuille_histo (
  id        bigserial primary key,
  client_id bigint not null,
  de        int,
  vers      int,
  origine   text not null,
  detail    text,
  par       text,
  le        timestamptz not null default now()
);
create index on rcu.portefeuille_histo (client_id, le desc);

create table rcu.portefeuille_run (
  id          serial primary key,
  debut       timestamptz not null default now(),
  fin         timestamptz,
  declencheur text not null,                    -- nuit, import, référentiel, manuel
  changements int,
  stats       jsonb
);

-- Réglages du recalcul (une seule ligne). actif = faux tant que Théo n'a pas validé les noms DCS : sans ça, le premier calcul
-- réattribuerait les clients des vendeurs dont le nom DCS n'est pas encore rattaché.
create table rcu.portefeuille_param (
  id               int primary key default 1 check (id = 1),
  actif            boolean not null default false,
  anciennete_ans   int,                         -- clients dont le dernier achat date de plus de N ans : hors portefeuille (null = tous)
  maj_le           timestamptz not null default now(),
  maj_par          text
);
insert into rcu.portefeuille_param (id, actif, anciennete_ans) values (1, false, 10);

-- ─── Ne plus contacter ─────────────────────────────────────────────────────────────
-- canal « tout » = ne plus contacter du tout. Exclusion appliquée par le Requêteur (garde du canal), à tous les exports.
create table rcu.contact_refus (
  client_id bigint not null,
  canal     text not null check (canal in ('tout', 'email', 'sms', 'tel', 'courrier')),
  motif     text,
  par       text,
  le        timestamptz not null default now(),
  primary key (client_id, canal)
);

-- ─── Échanges ──────────────────────────────────────────────────────────────────────
create table rcu.echange (
  id        bigserial primary key,
  client_id bigint not null,
  type      text not null check (type in ('appel', 'email', 'sms', 'visite', 'note')),
  le        date not null,
  resultat  text,
  rappel    date,
  texte     text not null default '',
  auteur_id text,
  auteur    text,
  cree_le   timestamptz not null default now()
);
create index on rcu.echange (client_id, le desc);
create index on rcu.echange (rappel) where rappel is not null;
