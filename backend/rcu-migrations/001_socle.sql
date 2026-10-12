-- RCU — lot 1 : socle de la base du référentiel client unique (12/10/2026).
--
-- Base DÉDIÉE, sur le VPS (conteneur `rcu-db`), distincte de la base Gearbox (Supabase).
-- Elle ne quitte jamais le VPS : ni Supabase, ni dump GitHub (décision R1, RCU-CADRAGE.md).
--
-- Deux couches qui ne se mélangent jamais (§ 5 du cadrage) :
--   - ce que DCS envoie (identite_source, vehicule, vente) : écrit par l'import, et par lui SEUL ;
--   - ce que Bony saisit (lots 2 et suivants) : l'import n'y écrit jamais.
-- Les tables ref_* sont des DONNÉES (corrigeables sans toucher au code), pas des listes en dur.

create schema if not exists rcu;

-- ─── Référentiels ────────────────────────────────────────────────────────────────

-- Affaire DCS (`VNVO…`) → société, site par défaut, marque de l'affaire.
-- site_defaut NULL = affaire multi-sites : le site vient obligatoirement de ref_site_libelle.
create table rcu.ref_affaire (
  code          text primary key,
  societe       text not null,
  site_defaut   text,
  marque        text not null,           -- marque de l'AFFAIRE (Renault = Renault + Dacia) ; celle du véhicule vient du fichier
  retenue       boolean not null default true,
  note          text
);

-- (affaire, libellé de site DCS en MAJUSCULES) → site Gearbox. Prioritaire sur site_defaut.
create table rcu.ref_site_libelle (
  affaire  text not null references rcu.ref_affaire(code),
  libelle  text not null,
  site     text,                         -- NULL = connu mais « à classer »
  primary key (affaire, libelle)
);

-- Ancienne base Sud-Ouest : compte évènement (sans le suffixe de date `_021025`) → site.
create table rcu.ref_compte_bso (
  compte  text primary key,
  site    text,
  note    text
);

-- Type de vente DCS → retenu dans le RCU ou non (R3 : particuliers et sociétés seulement).
create table rcu.ref_type_vente (
  libelle  text primary key,
  retenu   boolean not null,
  note     text
);

-- Financement : clé = code OU libellé (en majuscules), selon `nature`.
--   nature 'organisme' : code / libellé financier → DIAC, Autre banque, Aucun
--   nature 'produit'   : code / libellé financement → LOA, LLD, Crédit…
-- Le libellé est lu d'abord ; vide ou « NE PLUS UTILISER », on se replie sur le code.
create table rcu.ref_financement (
  nature   text not null check (nature in ('organisme', 'produit')),
  cle      text not null,
  famille  text not null,
  a_confirmer boolean not null default false,
  primary key (nature, cle)
);

-- ─── Journal des imports ─────────────────────────────────────────────────────────

create table rcu.import_run (
  id            serial primary key,
  source        text not null check (source in ('VN', 'VO', 'BSO')),
  fichier       text not null,
  empreinte     text not null,           -- sha256 du fichier : un même fichier n'est jamais appliqué deux fois par erreur
  recu_le       timestamptz,
  debut         timestamptz not null default now(),
  fin           timestamptz,
  statut        text not null default 'en_cours' check (statut in ('en_cours', 'applique', 'refuse', 'erreur')),
  force         boolean not null default false,
  stats         jsonb not null default '{}'::jsonb,
  message       text
);
create index on rcu.import_run (source, statut, id desc);

-- ─── Couche DCS (écrite par l'import seulement) ─────────────────────────────────

-- Ce que DCS appelle un client. Clé = (source, société, numéro) : le n° DCS n'est unique
-- que PAR SOCIÉTÉ (mesuré : 0 collision par société, 324 au niveau du groupe), et le VO
-- a une autre numérotation que le VN. Attributs = ceux de la vente la plus récente.
create table rcu.identite_source (
  id            bigserial primary key,
  source        text not null,
  societe       text not null,
  numero        text not null,
  civilite      text,
  nom_client    text,
  nom           text,
  prenom        text,
  num_rue       text,
  type_rue      text,
  rue           text,
  cp            text,
  ville         text,
  tel_dom       text,
  tel_port      text,
  email         text,
  derniere_vente date,
  premier_run   int not null references rcu.import_run(id),
  dernier_run   int not null references rcu.import_run(id),
  empreinte     text not null,
  unique (source, societe, numero)
);

-- Véhicule. Clé = VIN, sinon « IMMAT:<immatriculation> ».
create table rcu.vehicule (
  id            bigserial primary key,
  cle           text not null unique,
  vin           text,
  immat         text,
  marque        text,
  modele        text,
  version       text,
  energie       text,
  genre         text,
  date_mec      date,
  date_immat    date,
  ct_dernier    date,
  ct_prochain   date,
  derniere_vente date,
  dernier_run   int not null references rcu.import_run(id)
);
create index on rcu.vehicule (immat);

-- Vente (ou évènement véhicule de l'ancienne base). Clé = (source, cle) :
-- VN / VO : « affaire|dossier » (unique, mesuré) ; BSO : empreinte de la ligne.
create table rcu.vente (
  id               bigserial primary key,
  source           text not null,
  cle              text not null,
  type_vh          text not null,        -- VN, VO, AUTRE (« Relation client » de l'ancienne base)
  affaire          text,
  societe          text,
  site             text,                 -- site Gearbox ; NULL = à classer
  site_libelle     text,                 -- libellé DCS brut, gardé pour l'audit
  dossier          text,
  identite_id      bigint not null references rcu.identite_source(id),
  vehicule_id      bigint references rcu.vehicule(id),
  retenue          boolean not null,
  motif_exclusion  text,
  date_commande    date,
  date_livraison   date,
  type_vente       text,
  vendeurs         text[],
  intermediaire    text,
  montant_tarif    numeric(12,2),
  montant_reprise  numeric(12,2),
  garantie_code    text,
  garantie_libelle text,
  garantie_km      int,
  fin_organisme    text,                 -- famille : DIAC, Autre banque, Aucun
  fin_produit      text,                 -- libellé ou code brut
  fin_famille      text,                 -- famille : LOA, LLD, Crédit…
  fin_debut        date,
  fin_fin          date,
  fin_duree        int,                  -- en mois
  fin_duree_calculee boolean not null default false,
  compte_evenement text,
  empreinte        text not null,
  premier_run      int not null references rcu.import_run(id),
  dernier_run      int not null references rcu.import_run(id),
  absente_depuis   timestamptz,          -- disparue d'un import COMPLET : jamais supprimée, marquée
  unique (source, cle)
);
create index on rcu.vente (identite_id);
create index on rcu.vente (vehicule_id);
create index on rcu.vente (fin_fin) where fin_fin is not null;
create index on rcu.vente (site);

-- Tampon d'import (une ligne du fichier, déjà normalisée). Vidé à la fin de chaque import.
create unlogged table rcu.tampon (
  run_id int not null, ligne int not null, cle text not null, type_vh text not null,
  affaire text, site_lib text, dossier text, marque text, modele text, version text, energie text, genre text,
  date_commande date, date_immat date, date_mec date, date_livraison date, ct_dernier date, ct_prochain date,
  vin text, immat text, type_vente text, vendeur text, intermediaire text,
  num_client text, nom_client text, civilite text, nom text, prenom text,
  num_rue text, type_rue text, rue text, cp text, ville text, tel_dom text, tel_port text, email text,
  fin_code_org text, fin_lib_org text, fin_code_prod text, fin_lib_prod text,
  fin_debut date, fin_fin date, fin_duree int,
  garantie_code text, garantie_libelle text, garantie_km int,
  montant_tarif numeric(12,2), montant_reprise numeric(12,2),
  compte_evenement text, empreinte text not null
);
create index on rcu.tampon (run_id);

-- ─── Données des référentiels (cartographie validée le 12/10/2026) ───────────────

insert into rcu.ref_affaire (code, societe, site_defaut, marque, retenue, note) values
  ('VNVOCL',       'EAA',      'Clermont',        'Renault', true,  null),
  ('VNVOCLAPL',    'EAA',      'Clermont',        'Alpine',  true,  null),
  ('VNVOVOL',      'EAA',      'Mozac',           'Renault', true,  null),
  ('VNVOMA',       'EAA',      'Massagettes',     'Renault', true,  null),
  ('VNVOUS',       'EAA',      'Ussel',           'Renault', true,  null),
  ('VNVOAUB',      'EAA',      'Clermont',        'Renault', true,  'Aubière'),
  ('VNVOVI',       'SODAVI',   'Vichy',           'Renault', true,  null),
  ('VNVOVIALP',    'SODAVI',   'Vichy',           'Alpine',  true,  null),
  ('VNVOMO',       'GGPL',     'Moulins',         'Renault', true,  null),
  ('VNVOTH',       'RICOUX',   'Thiers',          'Renault', true,  null),
  ('VNVOISS',      'AVA',      'Issoire',         'Renault', true,  null),
  ('VNVOAVABRI',   'AVA',      'Brioude',         'Renault', true,  null),
  ('VNVOBRI',      'GGV',      'Brioude',         'Renault', true,  null),
  ('VNVOLANG',     'GGV',      'Brioude',         'Renault', true,  'Langeac'),
  ('VNVOLAN',      'GGV',      'Brioude',         'Renault', true,  'Langeac'),
  ('VNVOMEN',      'GGV',      'Mende',           'Renault', true,  null),
  ('VNVOPUY',      'GGV',      'Le Puy-en-Velay', 'Renault', true,  null),
  ('VNVOPUYALP',   'GGV',      'Le Puy-en-Velay', 'Alpine',  true,  null),
  ('VNVOCLERNIS',  'REP_AUTO', null,              'Nissan',  true,  'Multi-sites : site par libellé'),
  ('VNVOCUSNIS',   'REP_AUTO', 'Vichy',           'Nissan',  true,  'Nissan Vichy (Cusset)'),
  ('VNVOMOUNIS',   'REP_AUTO', null,              'Nissan',  true,  'Multi-sites : site par libellé'),
  ('VNVOMONNIS',   'REP_AUTO', 'Montluçon',       'Nissan',  true,  null),
  ('VNVORALBI',    'BSO',      'Albi',            'Renault', true,  null),
  ('VNVORAURIL',   'BSO',      'Aurillac',        'Renault', true,  null),
  ('VNVORGAILLAC', 'BSO',      'Gaillac',         'Renault', true,  null),
  ('VNVORLAVR',    'BSO',      'Lavaur',          'Renault', true,  null),
  ('VNVORRODEZ',   'BSO',      'Rodez',           'Renault', true,  'Villefranche vend aussi sous cette affaire (RLTVIL)'),
  ('VNVORVIL',     'BSO',      'Villefranche',    'Renault', true,  null),
  ('VNVORFIG',     'BSO',      'Figeac',          'Renault', true,  'Absente des extractions du 12/10 (droits DCS)'),
  ('VNVORMILLAU',  'BSO',      'Millau',          'Renault', true,  'Absente des extractions du 12/10 (droits DCS)'),
  ('VNVORCARM',    'BSO',      'Carmaux',         'Renault', true,  'Carmaux = Blaye-les-Mines ; absente des extractions du 12/10'),
  ('VNVOALPRDZ',   'BSO',      'Rodez',           'Alpine',  true,  null),
  ('VNVONISRDZ',   'BSO',      null,              'Nissan',  true,  'Nissan Rodez / Albi / Aurillac : site par libellé'),
  ('VNVONISALB',   'BSO',      'Albi',            'Nissan',  true,  null),
  ('VNVONISAUR',   'BSO',      'Aurillac',        'Nissan',  true,  null),
  ('VNVOCOBA',     'COBA',     null,              'Coba',    false, 'Pas des clients (Théo, 12/10)'),
  ('VNVOLLDBONY',  'LLD_BONY', null,              'LLD',     false, 'Pas des clients (Théo, 12/10)');

insert into rcu.ref_site_libelle (affaire, libelle, site) values
  ('VNVOCL',      'RIOM',        'Mozac'),
  ('VNVOVOL',     'RIOM',        'Mozac'),
  ('VNVOVOL',     'MOZAC',       'Mozac'),
  ('VNVOVOL',     'MBZ RIOM',    'Mozac'),
  ('VNVOCLERNIS', 'CLERMONT',    'Clermont'),
  ('VNVOCLERNIS', 'SILENCE',     'Clermont'),
  ('VNVOCLERNIS', 'BELLERIVE',   'Vichy'),
  ('VNVOCLERNIS', 'CUSSE',       'Vichy'),
  ('VNVOCLERNIS', 'LEPUY',       'Le Puy-en-Velay'),
  ('VNVOCLERNIS', 'MONTLUCON',   'Montluçon'),
  ('VNVOCLERNIS', 'MOULINS',     'Moulins'),
  ('VNVOCLERNIS', 'STETIENNE',   'Saint-Etienne'),
  ('VNVOMOUNIS',  'CUSSE',       'Vichy'),
  ('VNVOMOUNIS',  'MOULI',       'Moulins'),
  ('VNVOMOUNIS',  'MOULINS',     'Moulins'),
  ('VNVOTH',      'AMBER',       'Ambert'),
  ('VNVOTH',      'AMBERT',      'Ambert'),
  ('VNVORRODEZ',  'RLTVIL',      'Villefranche'),
  ('VNVONISRDZ',  'NISSANRODE',  'Rodez'),
  ('VNVONISRDZ',  'NISSANAURI',  'Aurillac'),
  ('VNVONISRDZ',  'NISSANALBI',  'Albi');

insert into rcu.ref_compte_bso (compte, site, note) values
  ('VNVO_FDC',      'Millau',       null),
  ('VNVORO_FDC',    'Rodez',        null),
  ('VNVOAU_FDC',    'Aurillac',     null),
  ('VNVOALBI_FDC',  'Albi',         null),
  ('VNVOGA_FDC',    'Gaillac',      'Lavaur vendait sous Gaillac : indiscernable'),
  ('FIVNVO_FDC',    'Figeac',       null),
  ('VNVOVI_FDC',    'Villefranche', null),
  ('VNVOCX_FDC',    'Carmaux',      null),
  ('VNVONISLP_FDC', null,           'Nissan Rodez / Albi / Aurillac sur un seul compte : à classer');

insert into rcu.ref_type_vente (libelle, retenu, note) values
  ('VENTE A PARTICU', true,  null),
  ('VENTE A SOCIETE', true,  null),
  ('VENTE VD AGENT',  false, 'Vente au garage agent R2 (revendeur), pas au client final (Théo, 12/10)'),
  ('VENTE VS',        false, null),
  ('VENTE AUX LOUEU', false, null),
  ('TRANSFERT AU VO', false, null),
  ('LLD BONY',        false, null),
  ('RETROCESSION',    false, null),
  ('IMMO',            false, null),
  ('VENTE IMMO',      false, null),
  ('VENTE BUY BACK',  false, null),
  ('VENTE EX RENT',   false, null),
  ('NE PAS UTILISER', false, null);

insert into rcu.ref_financement (nature, cle, famille, a_confirmer) values
  ('organisme', 'DIAC',            'DIAC',         false),
  ('organisme', 'AUTRES BANQUES',  'Autre banque', false),
  ('organisme', 'AUCUN',           'Aucun',        false),
  ('organisme', '01',  'DIAC', false), ('organisme', '1',   'DIAC', false), ('organisme', 'DIA', 'DIAC', false),
  ('organisme', '02',  'Autre banque', false), ('organisme', 'AB',  'Autre banque', false),
  ('organisme', 'BQ',  'Autre banque', false), ('organisme', 'BQE', 'Autre banque', false),
  ('organisme', 'CET', 'Autre banque', false), ('organisme', 'AUT', 'Autre banque', false),
  ('organisme', '00',  'Aucun', false),
  ('produit', 'LOA - NEW DEAL 1',  'LOA', false),
  ('produit', 'LOA - NEW DEAL 2',  'LOA', false),
  ('produit', 'LOA - NEW DEAL 3',  'LOA', false),
  ('produit', 'LLD - NEW DEAL 3',  'LLD', false),
  ('produit', 'CREDIT CLASSIQUE',  'Crédit', false),
  ('produit', 'CREDIT BALLON (VO)','Crédit ballon', false),
  ('produit', 'CREDIT BAIL',       'Crédit-bail', false),
  ('produit', 'DLA', 'LOA', true), ('produit', 'NLA', 'LOA', true),
  ('produit', 'DLO', 'LLD', true), ('produit', 'NLO', 'LLD', true),
  ('produit', 'NEW DEAL PRO', 'New Deal Pro', true),
  ('produit', 'INTEGRAL',     'Intégral', true),
  ('produit', 'INTEGRAL PRO', 'Intégral', true),
  ('produit', '01',  'LOA', false), ('produit', '07',  'LOA', false),
  ('produit', 'ND1', 'LOA', false), ('produit', 'ND2', 'LOA', false), ('produit', 'ND3', 'LOA', false),
  ('produit', 'NEW', 'LOA', false),
  ('produit', '03',  'LOA', true),  ('produit', '25',  'LOA', true),
  ('produit', '08',  'LLD', false), ('produit', '24',  'LLD', true),
  ('produit', '02',  'Crédit', false), ('produit', 'CLA', 'Crédit', false), ('produit', 'CR', 'Crédit', false),
  ('produit', 'CRE', 'Crédit', false), ('produit', 'C',   'Crédit', false), ('produit', 'CER', 'Crédit', false),
  ('produit', '21',  'Crédit ballon', false),
  ('produit', '05',  'Crédit-bail', false), ('produit', 'CBA', 'Crédit-bail', false), ('produit', 'BAI', 'Crédit-bail', false),
  ('produit', '06',  'New Deal Pro', true), ('produit', '22', 'Intégral', true), ('produit', 'CPT', 'Comptant', true);
