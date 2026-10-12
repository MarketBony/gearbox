# RCU — cadrage du lot 0 (CRM Gearbox)

> **Statut : PROPOSITION, à valider par Théo.** Page visuelle : `maquettes/crm/rcu-cartographie.html`. Rédigé le 12/10/2026 à partir des extractions réelles
> (`Clients VN - REQ.txt`, `Clients VO - REQ (1).txt`, `CLIENTS VNVO - BSO (AVR).txt`) et des fichiers de
> correspondance DCS (table de mapping des affaires, établissements, comptes DCSNET, doc DCSnet BONY BSO).
> Rien n'est codé. Les fichiers clients ne sont **jamais** copiés dans le dépôt.

## 1. Ce qu'on construit

Un **référentiel client unique** (RCU) du groupe Bony, alimenté chaque nuit par le Requêteur DCSNETneo, enrichi
par le travail des vendeurs, et qui produit des **listes de relance**. Il est consulté :
- dans **Gearbox**, rubrique **CRM** (interface v2 seulement), par les rôles de **Jeux** :
  Master, Administrator, Coordinator, Digital Manager (`GAMES_ROLES`). **Director exclu, chef de site exclu.** ;
- plus tard dans **GRID**, par les vendeurs (lot 5).

### Décisions déjà prises (Théo, 12/10/2026)
| # | Décision |
|---|---|
| R1 | Base **Postgres sur le VPS**. Elle ne quitte jamais cet environnement : ni Supabase, ni dump GitHub, ni copie externe. |
| R2 | Arrivée des fichiers par **SFTP**, format **TXT tabulé** (cp1252, ligne de titre, en-têtes, ligne de total). |
| R3 | Le RCU contient les **particuliers et les sociétés**. Sont écartés : lignes sans client, transferts au VO, ventes aux loueurs, VS, LLD Bony, rétrocessions, immobilisations, buy-back, ex-rent. |
| R4 | Coordonnée **suspecte** (partagée par trop de personnes, domaine Bony, numéro bidon) : ni rapprochement, ni relance. |
| R5 | Aucun renvoi vers DCS. Le RCU est la seule mémoire des relances. |
| R6 | Un client dont le vendeur part est **réattribué**. |
| R7 | RGPD : géré par Bony. **mIAouss n'a aucun accès au CRM.** |
| R8 | Ancienne base Sud-Ouest (`LABOBSO`, avant le 01/10/2025) : **import unique**, pas de requête quotidienne. |
| R9 | VO : filtre « Particulier » maintenu (le reste = transferts). Pas d'autre numéro client que `N° compte client`. |
| R10 | Nissan Cusset / Bellerive (`BELLERIVE`, `CUSSE`) = **Nissan Vichy** → site Vichy. |
| R11 | Affaires **COBA** et **LLD Bony** : écartées, ce ne sont pas des clients. |
| R13 | « VENTE VD AGENT » = vente au garage agent (revendeur) : écartée. |
| R12 | Financement : on avance avec le dictionnaire du § 3.4 tel quel (corrigeable, c'est une table). |

## 2. Les sources, telles que mesurées

| Source | Lignes | Période utile | Clé de vente | N° client |
|---|---|---|---|---|
| VN (requête du soir) | 80 522, dont 54 947 avec client | 2020 → aujourd'hui (Sud-Ouest depuis le 07/10/2025) | affaire + n° dossier, **unique** | `Numéro du client (propriétaire)` — **unique par SOCIÉTÉ**, pas par groupe |
| VO (requête du soir) | 55 104 | fin 2016 → aujourd'hui (~5 400 ventes / an) | affaire + n° dossier (347 doublons : multi-vendeurs) | `N° compte client` — numérotation **différente** du VN, unique par société sauf 40 comptes génériques (`77777`…) |
| BSO historique (une fois) | 360 302 (avec VIN) | 1998 → 2025 | aucune (pas de n° dossier) | `Numéro de fiche` (+ `Numéro de compte client`) |

### Mesures qui fondent les règles
- VN : la clé société + n° ne porte **jamais** deux identités (0 cas sur 38 363) ; au niveau groupe, 324 cas.
- VN : **DCS a ses propres doublons**, 1 065 personnes (nom + prénom + CP) sous plusieurs numéros, dont 818 dans
  la même société. Le rapprochement reste indispensable.
- VN / VO : sur 1 568 personnes présentes dans les deux, le numéro ne coïncide **qu'une fois** → deux espaces de
  numérotation distincts. Le lien VN ↔ VO passe par le rapprochement.
- Coordonnées bidon : un portable sur **278 ventes**, 315 portables et 350 e-mails sur plus de 5 ventes,
  adresses `@bonyautomobiles.com` / `@bonyauto-mobile.com`.
- BSO (fichier avec VIN) : aucune ligne en double exact, **169 974 VIN distincts** dont 1 580 déjà présents dans DCS
  (194 en VN, 1 386 en VO) ; 222 fiches de plus de 100 véhicules (garages, loueurs, la concession
  elle-même : 32 490 lignes « ZA du Bourguet Star Autom »), 15 267 lignes sans nom, 2 597 fins de financement au
  01/01/1997 (date bidon).
- Financement : 14 439 fins de financement VN à partir d'octobre 2026.

### Format : ce que l'import doit savoir
- Encodage **cp1252**, fin de ligne LF, ligne 1 = titre, ligne 2 = en-têtes, **dernière ligne = total**.
  VN : `80522 … 100,00 % … 80522` ; VO : `55104`. **Le total sert de contrôle d'intégrité ET de marqueur de
  fin de fichier** (un fichier en cours de dépôt n'a pas encore sa ligne de total). BSO : pas de ligne de total.
- En-têtes comparés **sans la casse** (`Site (Lib)` dans le VN, `Site (lib)` dans le VO), par NOM et jamais par
  position : une colonne ajoutée ou déplacée dans le Requêteur ne doit rien casser. Colonne obligatoire absente
  → import refusé, avec le nom de la colonne.
- `Nom intermédiaire 1` apparaît **deux fois** dans le VN (identique) : on en lit une.
- Pas de guillemets CSV : les `"` sont du texte. Espaces insécables (0xA0) à normaliser.
- Dates `jj/mm/aaaa`, montants à virgule décimale, CP sur 5 chiffres (à compléter si un zéro manque).

## 3. Correspondances (tables de référence, modifiables)

### 3.1 Affaire → société, plaque, marque
Reprise de la *Table mapping affaires*, complétée des trois codes absents : `VNVOMOUNIS`, `VNVOCUSNIS`,
`VNVOMONNIS` (Nissan, société REP_AUTO). La **société** (EAA, SODAVI, GGPL, AVA, GGV, RICOUX, REP_AUTO, BSO, COBA,
LLD_BONY) est indispensable : c'est la moitié de la clé client du VN.

### 3.2 Affaire + libellé de site DCS → site Gearbox
Site Gearbox = `SITES` de `constants.ts` (une seule liste, celle du reste de Gearbox). La marque Alpine / Nissan
reste une **marque**, jamais un site (règle « Alpine est PAR SITE »).

| Affaire | Libellés DCS rencontrés | Site Gearbox |
|---|---|---|
| VNVOCL | CLERM, (RIOM ×3) | Clermont (RIOM → Mozac) |
| VNVOCLAPL | ALPINE CLE | Clermont — marque Alpine |
| VNVOVOL | RIOM, MOZAC, MBZ RIOM | Mozac |
| VNVOMA | VNVOMA, Massagette | Massagettes |
| VNVOUS | USSEL, Ussel | Ussel |
| VNVOVI | VICHY, Vichy, MBZ VICHY, (vide) | Vichy |
| VNVOVIALP | ALPVICHY | Vichy — marque Alpine |
| VNVOMO | AVERMES, Moulins | Moulins |
| VNVOTH | THIER / AMBER | Thiers / Ambert |
| VNVOISS | ISSOI, (vide), RENAULT | Issoire |
| VNVOAVABRI | BRIOUDE | Brioude |
| VNVOMEN | MENDE, Mende | Mende |
| VNVOPUY | LE PUY, GGV LE PUY | Le Puy-en-Velay |
| VNVOPUYALP | ALPLEPUY | Le Puy-en-Velay — marque Alpine |
| VNVOCLERNIS | CLERMONT / LEPUY / MONTLUCON / MOULINS / STETIENNE | Clermont / Le Puy-en-Velay / Montluçon / Moulins / Saint-Etienne |
| VNVOCLERNIS, VNVOCUSNIS, VNVOMOUNIS | BELLERIVE, CUSSE Vichy (Nissan Vichy, R10) |
| VNVOMONNIS / VNVOMOUNIS | MONTLUCON / MOULI | Montluçon / Moulins |
| VNVORALBI, VNVORAURIL, VNVORGAILLAC, VNVORLAVR | ALBI, AURILLAC (MBZ AURILL), GAILLAC, LAVAUR | Albi, Aurillac, Gaillac, Lavaur |
| VNVORRODEZ | RODEZ / RLTVIL | Rodez / Villefranche |
| VNVORVIL | VILLEFRANC, VILLEFRAN | Villefranche |
| VNVOCOBA | COBA, Coba | **Écarté** (R11) |
| VNVOLLDBONY | LLDBONY | **Écarté** (R11) |

Libellé vide sur une affaire mono-site → site de l'affaire. Libellé inconnu → la ligne est importée, le site
reste « à classer », et le rapport d'import le signale (jamais de rejet silencieux, jamais d'invention).

### 3.3 Ancienne base BSO : compte évènement → site
D'après *DCSnet BONY BSO* : `VNVORO_FDC` Rodez, `VNVOALBI_FDC` Albi, `VNVOAU_FDC` Aurillac, `VNVOGA_FDC` Gaillac
(et Lavaur, qui vendait sous Gaillac), `VNVO_FDC` Millau, `VNVOVI_FDC` Villefranche, `FIVNVO_FDC` Figeac,
`VNVOCX_FDC` Carmaux, `VNVONISLP_FDC` Nissan Rodez / Albi / Aurillac (un seul compte pour trois : site non
déterminable → « Sud-Ouest, à classer »). Suffixe `_021025` = date de clôture (02/10/2025).

### 3.4 Financement
On se fie au **libellé financier** (DIAC, Autres banques, Aucun) et au **libellé financement** (type de produit).
Quand ils sont vides ou à « NE PLUS UTILISER », on se replie sur les codes. Dictionnaire déduit des fichiers,
**à valider** :

| Organisme (code financier) | Famille |
|---|---|
| `01`, `1`, `DIA` | DIAC |
| `02`, `AB`, `BQ`, `BQE`, `CET`, `AUT` | Autre banque |
| `00` | Aucun (comptant) |

| Code financement | Libellé DCS | Famille de produit |
|---|---|---|
| `01`, `07`, `ND1`, `ND2`, `ND3`, `NEW` | LOA New Deal 2 / 1 (anciens codes) | **LOA** |
| `03`, `25` | DLA, NLA | LOA (à confirmer) |
| `08`, `24` | LLD New Deal 3, NLO | **LLD** |
| `DLO` (libellé) | DLO | LLD (à confirmer) |
| `02`, `CLA`, `CR`, `CRE`, `C`, `CER` | Crédit classique (anciens codes) | **Crédit** |
| `21` | Crédit ballon (VO) | Crédit ballon |
| `05`, `CBA`, `BAI` | Crédit-bail | Crédit-bail |
| `06` | New Deal Pro | LOA / LLD pro (à confirmer) |
| `22` | Intégral | Intégral (à confirmer) |
| `CPT` | — | Comptant (à confirmer) |

**Durée** : prise du fichier si > 0 ; sinon **calculée** depuis début et fin (la saisie à 0 est la règle au VO).
Une date manifestement fausse (avant 2000, comme le 01/01/1997 de BSO) est ignorée.

## 4. Le client unique

### 4.1 Trois niveaux, de la donnée brute au client
1. **Identité source** = ce que DCS appelle un client, avec sa clé propre :
   - VN : `VN · société · n° client propriétaire` ;
   - VO : `VO · société · n° compte client` ;
   - BSO : `BSO · n° de fiche`.
   Ses attributs (nom, adresse, coordonnées) sont ceux de **sa vente la plus récente**.
2. **Client RCU** = une personne ou une société, qui regroupe une ou plusieurs identités sources.
3. **Contacts** du client : chaque portable / e-mail / téléphone, avec sa source, sa date de dernière vue et son
   état (valide, suspect, refusé).

### 4.2 Nettoyage avant rapprochement
- Noms et prénoms : majuscules, sans accents, espaces réduits. Civilités ramenées à 4 valeurs :
  homme, femme, couple, société (les 39 libellés DCS : « Mr & Mme », « MR ME », « SARL », « Etablissement »…).
- Téléphones au format `0XXXXXXXXX` ; le portable = numéro en 06 / 07, quelle que soit la colonne qui le porte.
- **Coordonnée suspecte** (R4), recalculée à chaque import : utilisée par **plus de 3 identités de noms
  différents**, ou domaine Bony, ou numéro bidon (`0600000000`, chiffres répétés…). Le seuil est un paramètre.
- **Identité générique exclue** : plus de 20 véhicules (garages, loueurs, concession), civilité « Groupe Bony »,
  comptes de type `77777`. Seuil réglable, liste consultable.

### 4.3 Règles de fusion (déterministes, explicables)
| Règle | Décision |
|---|---|
| Même identité source | Toujours le même client |
| Même nom + même prénom + même portable OU même e-mail (non suspects) | **Fusion automatique** |
| Même nom + même prénom + même CP + même voie | **Fusion automatique** |
| Société : même raison sociale normalisée + même CP | Fusion automatique |
| Même portable, même nom, prénom différent | **Pas de fusion** (foyer) — lien « même foyer » noté |
| Même nom + prénom + CP, sans autre élément commun | **File à arbitrer** (proposé, pas appliqué) |
| BSO ↔ DCS : même VIN (ou même immat. à défaut) + même nom | Fusion automatique |

- Les décisions **manuelles** (fusionner / séparer) sont enregistrées et **rejouées à chaque import** : la nuit ne
  défait jamais un arbitrage humain.
- Un client RCU garde son identifiant à vie. En cas de fusion, le plus ancien survit, l'autre est journalisé.

### 4.4 Véhicules
Clé = **VIN** ; à défaut (BSO tant que les VIN n'y sont pas), l'immatriculation. L'historique de propriété se
lit dans les ventes : un même VIN vendu VN puis repris et vendu VO a deux propriétaires successifs. Le véhicule
« actuel » d'un client = ses véhicules dont il est le dernier acheteur connu.

## 5. Deux couches qui ne se mélangent jamais

| Couche | Contenu | Écrite par |
|---|---|---|
| **DCS** | identités sources, ventes, véhicules, financements, garanties | l'import du soir **seulement** (réécrite chaque nuit) |
| **Bony** | client RCU, vendeur référent, décisions de rapprochement, contacts refusés, « ne plus contacter », relances, qualifications, échanges | les utilisateurs **seulement** — l'import n'y écrit jamais |

Une donnée Bony ne se recalcule pas : si un vendeur note « ne plus appeler », aucune nuit ne l'efface.

## 6. Architecture

```
DCS Requêteur ──SFTP──▶ VPS /srv/dcs/depot  (compte `dcs`, SFTP seul, chroot, pas de shell)
                              │
                       conteneur `rcu-worker`  (même image que `api`, autre commande)
                              │  1. fichier complet ? (ligne de total présente)
                              │  2. COPY dans une table tampon, contrôles
                              │  3. mise à jour des identités / ventes / véhicules / financements
                              │  4. rapprochement, contacts suspects
                              │  5. rapport d'import, fichier archivé 14 jours
                              ▼
                       conteneur `rcu-db` (Postgres 17, volume `rcu_data`, AUCUN port publié)
                              ▲
                       conteneur `api` (Gearbox) — routes `/api/crm/*`, rôles GAMES_ROLES
```

- **Base** : `rcu-db`, sur le réseau Docker interne seulement. Le pare-feu `ufw` du VPS est inactif (constaté le
  12/10) : raison de plus pour ne publier aucun port.
- **Accès Gearbox** : un second client Prisma (`backend/prisma-rcu/`), **seule porte** vers le RCU
  (`backend/src/rcu/db.ts`), comme `db.ts` pour la base principale. L'import et le rapprochement, ensemblistes,
  sont en SQL (`COPY` + requêtes) : Prisma ligne à ligne serait trop lent sur 500 000 lignes.
- **Migrations** : `prisma migrate deploy` du schéma RCU au démarrage de `rcu-worker`. La base étant sur le
  VPS, pas de hotspot ni de `db execute` à la main pour elle.
- **Garde-fou anti-catastrophe** : un import dont le volume chute de plus de 10 % par rapport au précédent, ou
  dont le total ne correspond pas, **n'est pas appliqué** (rapport en erreur, données de la veille conservées).
- **Sauvegarde** : `pg_dump` chaque nuit sur le VPS (`/var/backups/rcu`, root seul, 14 jours), comme les
  fichiers de Gearbox. Elle ne sort pas du VPS (R1) ; le risque d'une panne de disque est donc assumé.
- **Développement** : Postgres 17 local de ce poste, base `rcu`, chargée avec les vrais fichiers depuis
  `Téléchargements`. **La base de prod du RCU n'est jamais écrite depuis le poste.**
- **SFTP** : le SSH du VPS refuse les mots de passe. Si DCS ne sait envoyer qu'avec un mot de passe, exception
  limitée au compte `dcs` (bloc `Match User dcs`).

## 7. Découpage

| Lot | Contenu | Déployé |
|---|---|---|
| **0** | Ce document, validé | — |
| **1** | `rcu-db`, `rcu-worker`, compte SFTP ; import VN / VO / BSO ; tables de référence ; rapport d'import (Master) ; sauvegarde | api + worker |
| **2** | Client unique : rapprochement, file d'arbitrage, fusion / séparation manuelles ; rubrique **CRM** v2 en lecture : recherche, fiche client, véhicules, ventes, financements | api + web |
| **3** | Couche Bony : vendeur référent et réattribution, qualifications, échanges, « ne plus contacter » | api + web |
| **4** | Moteur de relances v1 : fin de financement, prochain CT, anniversaire, âge du véhicule, sans achat depuis X ans ; règles = données réglables ; listes exportables | api + web |
| **5** | GRID : API lue avec la session GRID, comptes vendeurs, fiches dans GRID (travail aussi dans le dépôt RELTEL) | api + GRID |

## 8. Points ouverts

1. ~~Nissan Cusset / Bellerive~~ → Vichy (R10). 2. ~~COBA, LLD Bony~~ → écartés (R11).
3. **Dictionnaire de financement** (§ 3.4) : DLA / DLO / NLA / NLO, `06`, `22`, `CPT` restent à confirmer (on avance sans, R12).
4. **Seuils** : coordonnée suspecte au-delà de 3 identités ? Identité générique au-delà de 20 véhicules ?
5. **SFTP** : clé ou mot de passe côté DCS ? Adresse IP d'envoi fixe ? Heure d'envoi ?
6. **Requête du soir complète ou glissante** (temps de production du Requêteur à mesurer).
7. **BSO** : achats datés de 2026 dans une base gelée en octobre 2025 (à éclaircir, non bloquant). VIN reçus le 12/10.
8. **Lot 5 / GRID** : son référentiel a un site « ALPINE » (plaque Centre), contraire à la règle Gearbox (Alpine
   par site). À traiter quand on reliera les vendeurs.
