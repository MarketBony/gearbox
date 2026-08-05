# Rapport de contrôle — reprise des données 2026

> ## ℹ️ L'IMPORT A ÉTÉ EFFECTUÉ le 3 août 2026
>
> Ce document a été rédigé **avant** l'import, pour validation. Il a été validé et
> l'import a eu lieu (correctif 22 de `ETAT-PROJET.md`) : 24 enveloppes, 738 dépenses,
> 100 projets et 247 tâches, réconciliés à **0,00 € d'écart**.
>
> Il reste la **référence d'audit** de cette reprise : totaux par mois, site et service,
> correspondances de nommage retenues, et anomalies du fichier source laissées telles
> quelles. C'est la pièce à ouvrir pour comprendre l'origine d'un chiffre en base.
> Les phrases au conditionnel ci-dessous sont donc à lire au passé.
>
> ⚠️ Les données ont **évolué depuis** : Théo corrige les projets au fil de l'eau, et
> les totaux actuels ne correspondent plus exactement à ceux d'ici.

## 1. Ce qui serait créé

| | Nombre | Montant |
|---|---|---|
| Enveloppes budgétaires | 21 entités | **1 480 800,00 €** |
| Dépenses | 738 | 1 132 083,76 € |
| Projets | 100 | 341 966,50 € |
| dont tâches | 247 | |
| **Total dépensé** | | **1 474 050,26 €** |

## 2. Réconciliation avec le fichier

| Source | Montant | Écart |
|---|---|---|
| Somme des colonnes de sites (référence) | 1 474 050,26 € | — |
| Total qui serait importé | 1 474 050,26 € | **0,00 €** |
| Colonne G « Montant HT » | 1 475 140,25 € | -1 089,99 € |

L'import reproduit **au centime** la ventilation par site du fichier. L'écart de
1 089,99 € avec la colonne « Montant HT » est **préexistant dans le fichier** —
c'est ce que mesure ta colonne `Ctrl`. Détail au point 5.

## 3. Correspondances appliquées

| Fichier | Gearbox |
|---|---|
| `SODAVI` | Vichy |
| `AVA` | Issoire |
| `GG VELAY` | Le Puy-en-Velay |
| `RIOM` | Mozac |
| `MPR (code 3)` | PR |
| `ATS (code 4)` | APV |
| `code 1` | VN |
| `code 2` | VO |

Les autres entités gardent leur nom. Dates : **1ᵉʳ du mois de l'onglet** — la colonne
« Date commande » est ignorée (elle contient des dates de 2025 et une coquille).

## 4. Décisions à valider

### A. Alpine — sur quel site imputer les 119 500 € ?

Ton fichier traite Alpine comme **une entité unique** : le second bloc place
118 465 € des 119 500 € sous `LANGEAC`, sans ventilation par site. Or Gearbox a
**quatre** buckets Alpine (Clermont, Vichy, Le Puy, Rodez).

**J'ai retenu `Alpine-Le Puy`** par défaut, Langeac (43) étant le plus proche du Puy.
Dis-moi si c'est un autre site, ou s'il faut répartir.

### B. Nissan

167 lignes mélangent Nissan et d'autres sites : chacune produit **deux**
enregistrements, la part Nissan et le reste. Sans conséquence sur le total : Gearbox
regroupe Nissan dans un bucket **global** unique, sans ventilation par site (asymétrie
assumée avec Alpine, déjà documentée).

### C. Type de projet

Le fichier ne porte pas le type. J'ai mis **`OP Clients`** partout. Les 6 valeurs
possibles : Partenariat, Expo/Salon, Animation Co, OP Clients, Contenu, Collaborateurs.
Beaucoup de tes libellés commencent par « partenariat » — je peux les router
automatiquement si tu veux.

### D. Statut des projets

**94 projets terminés** (dernier mois passé) et **6 actifs**.
Sans cette distinction, Gearbox afficherait « 100 projets actifs » et le compteur ne
voudrait plus rien dire.

## 5. Anomalies

- **montant HT != somme des sites** : 148
- **libellés de projet fusionnés** : 9
- **projet multi-marques** : 7
- **code service invalide** : 2

### Montant HT ≠ somme des sites

148 lignes, dont **70 sous 50 centimes** (arrondis de tes formules de
ventilation). Somme algébrique : **-1 089,94 €**.

**Une seule mérite ton œil** — les autres sont du bruit :

| Onglet | Ligne | Prestataire | Montant HT | Ventilé | Écart |
|---|---|---|---|---|---|
| JUIN | 35 | CAVE SBBM | 700,00 € | 379,17 € | **-320,83 €** |
| AVRIL | 108 | DIAGO | 125,00 € | 170,00 € | **45,00 €** |
| JUIN | 39 | Diago | 225,00 € | 200,00 € | **-25,00 €** |
| JUIN | 40 | Diago | 225,00 € | 200,00 € | **-25,00 €** |
| JUIN | 41 | Diago | 225,00 € | 200,00 € | **-25,00 €** |
| JUIN | 42 | Diago | 225,00 € | 200,00 € | **-25,00 €** |

`CAVE SBBM` (JUIN ligne 35) : 320,83 € des 700,00 € ne sont ventilés sur aucun site.
C'est le seul cas où l'import perdrait un montant significatif.

### Code service invalide

2 lignes dont la colonne C ne vaut pas 1-4. **Rattachées à « Tous Services »** :

- JANVIER ligne 65 — colonne C = None (attendu 1-4) — presta « ascent prod », 1,500.00 €
- MAI ligne 49 — colonne C = '/' (attendu 1-4) — presta « CASINO DIEPPE », 795.00 €

### Libellés de projet regroupés

9 projets écrits de plusieurs façons dans le fichier. **Vérifie qu'il
s'agit bien du même projet à chaque fois** :

- 2 écritures regroupées : ['Projet : RMC 2026', 'projet : RMC 2026']
- 3 écritures regroupées : ['Projet : Visite Dieppe 2026', 'Projet : visite dieppe 2026', 'projet : visite dieppe 2026']
- 2 écritures regroupées : ['Projet : A290 Road Trip', 'projet : A290 Road trip']
- 3 écritures regroupées : ['Projet : Track Day Mornay', 'Projet : Track day mornay', 'projet : track day mornay']
- 4 écritures regroupées : ['Projet : lancement Twingo Clermont', 'Projet : lancement twingo clermont', 'projet : lancement Twingo clermont', 'projet : lancement twingo clermont']
- 2 écritures regroupées : ['projet : Renew Days clermont', 'projet : renew days clermont']
- 2 écritures regroupées : ['Projet : lancement twingo mozac', 'projet : lancement twingo mozac']
- 2 écritures regroupées : ['Projet : lancement twingo massagettes', 'projet : lancement twingo massagettes']
- 2 écritures regroupées : ['Projet : alpine blue expérience', 'projet : alpine blue expérience']

### Projets portant plusieurs marques

7 projets mêlent des parts Renault et Nissan (ou Alpine). Le montant est
juste, mais le routage budgétaire mérite un regard :

- « projet : portrait collaborateur » porte ['Nissan', 'Renault'] — vérifier le routage budgétaire
- « Projet : Portrait collaborateurs avril » porte ['Nissan', 'Renault'] — vérifier le routage budgétaire
- « projet : corporace 2026 » porte ['Nissan', 'Renault'] — vérifier le routage budgétaire
- « projet : opération edf » porte ['Alpine', 'Renault'] — vérifier le routage budgétaire
- « projet : portrait collaborateurs » porte ['Nissan', 'Renault'] — vérifier le routage budgétaire
- « Projet : Minute de l'auto Juillet » porte ['Nissan', 'Renault'] — vérifier le routage budgétaire
- « projet : salon auto de vichy » porte ['Nissan', 'Renault'] — vérifier le routage budgétaire

### Regroupements que je n'ai PAS faits — à trancher

Mon regroupement ignore la casse et les espaces, **pas** les singuliers/pluriels ni
la ponctuation. Ces libellés désignent probablement le même projet — dis-moi si je
dois les fusionner :

| Libellés | Montants | Tâches |
|---|---|---|
| « partenariat raf » | 14 400,00 € | 4 |
| « partenariat : raf » | 375,36 € | 2 |
| | | |
| « track days mas du clos » | 6 000,00 € | 1 |
| « track day mas du clos » | 900,00 € | 3 |
| | | |
| « portrait collaborateur » | 700,00 € | 8 |
| « portrait collaborateurs » | 700,00 € | 8 |
| | | |

### ⚠️ « corporace 2027 » à « corporace 2033 » — très probablement une erreur de saisie

7 projets aux années 2027-2033, **tous sur les lignes 94 à 101 d'avril**,
**tous du même prestataire RP EVENTS**, à côté de `corporace 2026`. Tout indique un
tirage de cellule Excel qui a incrémenté l'année.

Si c'est bien le cas, ce sont **7 projets fantômes** à rattacher à
`corporace 2026` — soit 1 694,00 € et
7 tâches. **Je n'ai rien fusionné sans ton accord.**

## 6. Totaux par mois

| Mois | Montant |
|---|---|
| Janvier | 209 727,99 € |
| Fevrier | 126 849,63 € |
| Mars | 186 583,70 € |
| Avril | 137 350,35 € |
| Mai | 102 751,95 € |
| Juin | 120 483,42 € |
| Juillet | 154 047,82 € |
| Aout | 87 213,48 € |
| Septembre | 88 217,48 € |
| Octobre | 84 793,48 € |
| Novembre | 87 493,48 € |
| Decembre | 88 537,48 € |

## 7. Totaux par site et marque

| Site / marque | Montant | Part |
|---|---|---|
| Clermont | 275 306,91 € | 18.7 % |
| Alpine | 119 500,02 € | 8.1 % |
| Nissan | 115 347,71 € | 7.8 % |
| Rodez | 113 157,35 € | 7.7 % |
| Vichy | 99 352,54 € | 6.7 % |
| Aurillac | 92 034,79 € | 6.2 % |
| Issoire | 86 394,51 € | 5.9 % |
| Le Puy-en-Velay | 79 814,76 € | 5.4 % |
| Albi | 70 554,34 € | 4.8 % |
| Mozac | 63 579,05 € | 4.3 % |
| Ricoux | 54 343,37 € | 3.7 % |
| Moulins | 51 424,71 € | 3.5 % |
| Gaillac | 46 706,95 € | 3.2 % |
| Mende | 34 430,13 € | 2.3 % |
| Figeac | 33 456,03 € | 2.3 % |
| Massagettes | 33 340,84 € | 2.3 % |
| Ussel | 32 158,05 € | 2.2 % |
| Millau | 27 377,45 € | 1.9 % |
| Villefranche | 19 512,05 € | 1.3 % |
| Lavaur | 14 128,23 € | 1.0 % |
| Carmaux | 12 130,47 € | 0.8 % |

## 8. Totaux par service

| Service | Montant |
|---|---|
| VN | 604 570,27 € |
| VO | 597 668,57 € |
| APV | 177 257,23 € |
| PR | 92 259,19 € |
| Tous Services | 2 295,00 € |

## 9. Enveloppes budgétaires

| Entité | VN | VO | PR | APV | Total |
|---|---|---|---|---|---|
| CLERMONT | 144 000,00 | 84 000,00 | 60 000,00 | 36 000,00 | **324 000,00** |
| ALPINE | 120 000,00 | 0,00 | 0,00 | 0,00 | **120 000,00** |
| SODAVI | 39 000,00 | 36 000,00 | 6 000,00 | 18 000,00 | **99 000,00** |
| RODEZ | 39 000,00 | 36 000,00 | 6 000,00 | 18 000,00 | **99 000,00** |
| LE PUY EN VELAY | 42 000,00 | 30 000,00 | 6 000,00 | 12 000,00 | **90 000,00** |
| MOULINS | 36 000,00 | 24 000,00 | 4 200,00 | 12 000,00 | **76 200,00** |
| AVA | 30 000,00 | 30 000,00 | 3 000,00 | 12 000,00 | **75 000,00** |
| RIOM | 30 000,00 | 24 000,00 | 3 600,00 | 12 000,00 | **69 600,00** |
| ALBI | 30 000,00 | 24 000,00 | 3 000,00 | 12 000,00 | **69 000,00** |
| AURILLAC | 30 000,00 | 24 000,00 | 3 000,00 | 12 000,00 | **69 000,00** |
| NISSAN | 30 000,00 | 24 000,00 | 3 000,00 | 3 600,00 | **60 600,00** |
| RICOUX | 18 000,00 | 18 000,00 | 2 400,00 | 6 000,00 | **44 400,00** |
| Massagettes | 15 000,00 | 18 000,00 | 2 400,00 | 6 000,00 | **41 400,00** |
| USSEL | 15 000,00 | 18 000,00 | 2 400,00 | 6 000,00 | **41 400,00** |
| MENDE | 15 000,00 | 18 000,00 | 2 400,00 | 6 000,00 | **41 400,00** |
| GAILLAC | 15 000,00 | 15 000,00 | 2 400,00 | 6 000,00 | **38 400,00** |
| MILLAU | 15 000,00 | 15 000,00 | 2 400,00 | 6 000,00 | **38 400,00** |
| FIGEAC | 12 000,00 | 12 000,00 | 2 400,00 | 3 600,00 | **30 000,00** |
| CARMAUX | 0,00 | 15 000,00 | 2 400,00 | 3 600,00 | **21 000,00** |
| VILLEFRANCHE de R | 0,00 | 12 000,00 | 2 400,00 | 3 600,00 | **18 000,00** |
| LAVAUR | 0,00 | 9 000,00 | 2 400,00 | 3 600,00 | **15 000,00** |
| **TOTAL** | | | | | **1 480 800,00** |

## 10. Les 100 projets

À parcourir pour valider les regroupements — chaque ligne du fichier devient une tâche.

| Projet | Mois | Tâches | Montant | Statut |
|---|---|---|---|---|
| Projet : lancement alpine a390 | Jan | 6 | 36 106,00 € | Done |
| Projet : lancement Clio BSO | Jan | 3 | 27 566,00 € | Done |
| Projet : lancement clio clermont | Jan | 7 | 27 219,48 € | Done |
| projet : partenariat Stade Aurillacois | Jui | 4 | 22 600,00 € | Done |
| Projet : convention agent groupe | Mar | 4 | 19 084,50 € | Done |
| Projet : lancement Twingo Clermont | Mar,Avr | 6 | 16 139,69 € | Done |
| Projet : partenariat GT4 Alpine | Mar | 1 | 15 000,00 € | Done |
| projet : partenariat RAF | Jui | 4 | 14 400,00 € | Done |
| projet : partenariat GT4 Rudy Servol | Jui | 1 | 8 000,00 € | Done |
| Projet : Track Day Mornay | Fev,Mar,Avr | 7 | 7 786,00 € | Done |
| Projet : Visite Dieppe 2026 | Fev,Mar,Avr,Mai | 9 | 7 218,00 € | Done |
| projet : Renew Days clermont | Avr | 10 | 6 884,99 € | Done |
| projet : lancement twingo issoire | Mar,Avr | 3 | 6 480,00 € | Done |
| projet : partenariat JAV vichy | Jui | 1 | 6 162,50 € | Done |
| projet : track days mas du clos | Mai | 1 | 6 000,00 € | Done |
| Projet : CCDMD 2026 | Fev,Aou | 2 | 5 520,00 € | Active |
| projet : renew days rodez | Jui | 4 | 5 331,88 € | Done |
| projet : lancement twingo vichy | Mar | 2 | 4 947,00 € | Done |
| Projet : visite atelier mozac | Mar | 3 | 4 056,36 € | Done |
| Projet : relance téléphonique Bony Historique | Fev,Mar | 2 | 3 951,00 € | Done |
| projet : lancement twingo le puy | Mar,Avr | 3 | 3 941,00 € | Done |
| Projet : lancement twingo mozac | Avr | 3 | 3 923,63 € | Done |
| Projet : alpine blue expérience | Jui,Jui,Aou | 3 | 3 888,00 € | Active |
| Projet : lancement clio issoire | Jan | 1 | 3 645,45 € | Done |
| projet : galette clermont | Jan | 6 | 3 627,99 € | Done |
| projet : inauguration renault pro+ le puy | Jui | 6 | 3 600,17 € | Done |
| Projet : relance téléphonique BSO | Fev | 2 | 3 598,00 € | Done |
| Projet : lancement clio vichy | Jan | 1 | 3 595,29 € | Done |
| projet : lancement twingo thiers | Mar | 2 | 3 522,00 € | Done |
| Projet : RMC 2026 | Fev,Mar | 4 | 2 898,00 € | Done |
| Projet : A290 Road Trip | Fev,Mar,Avr | 6 | 2 842,00 € | Done |
| projet : pro+ circuit albi | Avr | 2 | 2 752,50 € | Done |
| projet : salon auto de vichy | Nov | 2 | 2 700,00 € | Active |
| projet : partenariat dome sancy foot | Jan | 1 | 2 500,00 € | Done |
| Projet : Partenariat F'estivada | Mai | 1 | 1 900,00 € | Done |
| Projet : Video Twingo Groupe | Avr | 1 | 1 804,00 € | Done |
| Projet : lancement Clio Thiers | Jan | 1 | 1 801,52 € | Done |
| Projet : Minute de l'auto Juillet | Jui | 8 | 1 776,00 € | Done |
| projet : VA Clermont Septembre | Sep | 1 | 1 724,00 € | Active |
| Projet : lancement twingo massagettes | Avr | 2 | 1 622,71 € | Done |
| Projet : vidéo Clio | Jan | 1 | 1 500,00 € | Done |
| projet : soirée découverte brioude | Jui | 1 | 1 500,00 € | Done |
| Projet : lancement clio mozac | Jan | 2 | 1 443,63 € | Done |
| projet : relance tel opo juin EAA | Jui | 3 | 1 383,78 € | Done |
| projet : lancement clio mende | Jan | 1 | 1 327,08 € | Done |
| Projet : lancement clio massagettes | Jan | 2 | 1 209,19 € | Done |
| Projet : partenariat | Fev | 2 | 1 163,24 € | Done |
| Projet : soirée CMV | Fev | 1 | 1 075,00 € | Done |
| projet : corporace 2026 | Avr,Mai | 14 | 1 070,00 € | Done |
| Projet : Comité Novotel | Mar | 4 | 904,00 € | Done |
| projet : track day mas du clos | Jui | 3 | 900,00 € | Done |
| Projet : Salon Aveyr'auto | Sep | 1 | 900,00 € | Active |
| projet : alpine bony cars & coffee | Jui | 1 | 840,00 € | Done |
| Projet : partenariat : La Foulée des 2 Roches | Avr | 1 | 800,00 € | Done |
| projet : partenariat alpine handigolf | Jui | 1 | 800,00 € | Done |
| projet : salon/expo VUVP figeac | Jui | 1 | 800,00 € | Done |
| projet : partenariat Course des filles le Puy | Sep | 1 | 800,00 € | Active |
| Projet : partenariat 15km du Puy | Mar | 1 | 750,00 € | Done |
| projet : conf de presse CCDMD | Jui | 1 | 715,00 € | Done |
| Projet : Portrait collaborateurs avril | Avr | 8 | 712,00 € | Done |
| projet : portrait collaborateur | Mar | 8 | 700,00 € | Done |
| projet : portrait collaborateurs | Jui | 8 | 700,00 € | Done |
| projet : soirée alpine depailler | Mai | 2 | 668,00 € | Done |
| projet : relance tel clio | Jan | 3 | 615,60 € | Done |
| Projet : journée phoning Clermont | Fev | 1 | 610,52 € | Done |
| projet : partenariat ferrarissimo issoire | Avr | 1 | 600,00 € | Done |
| Projet : Salon Ussel | Avr | 1 | 500,00 € | Done |
| projet : expo vn ceyrat | Mai | 1 | 500,00 € | Done |
| projet : expo Malintrat Ma Ville en Rose | Jui | 1 | 500,00 € | Done |
| Projet : lancement clio le puy | Jan | 1 | 483,33 € | Done |
| Projet : OPO mars | Mar | 1 | 475,00 € | Done |
| Projet : OPO alpine mars | Mar | 1 | 434,00 € | Done |
| projet : relance VN Avril twingo | Avr | 2 | 419,60 € | Done |
| projet : visite ateliers Moulins | Jui | 1 | 417,00 € | Done |
| Projet : partenariat : RAF | Avr | 2 | 375,36 € | Done |
| Projet : opo alpine janvier | Jan | 1 | 361,00 € | Done |
| projet : corporace 2030 | Avr | 1 | 326,00 € | Done |
| projet : corporace 2031 | Avr | 1 | 326,00 € | Done |
| projet : corporace 2032 | Avr | 1 | 326,00 € | Done |
| projet : corporace 2033 | Avr | 1 | 326,00 € | Done |
| projet : VA Massagettes | Mai | 1 | 301,19 € | Done |
| Projet : partenariat Rugby 13 | Avr | 1 | 300,00 € | Done |
| projet : stickers partenariat issoire | Jui | 1 | 298,98 € | Done |
| projet : ventes privées clermont juillet | Jui | 1 | 297,00 € | Done |
| Projet : soirée fiscalité clermont | Mar | 1 | 290,00 € | Done |
| projet : accueil balade rotary | Mai | 2 | 282,00 € | Done |
| Projet : Salon Canoe Kayak | Mar | 1 | 263,00 € | Done |
| projet : partenariat restaurant golf le puy | Mar | 1 | 250,00 € | Done |
| projet : partenariat restaurant golf | Mar | 1 | 250,00 € | Done |
| projet : cars & coffee UNAPL | Jui | 1 | 152,00 € | Done |
| Projet : Ass Réflexe Brézet | Fev | 1 | 133,00 € | Done |
| projet : corporace 2027 | Avr | 1 | 130,00 € | Done |
| projet : corporace 2028 | Avr | 1 | 130,00 € | Done |
| projet : corporace 2029 | Avr | 1 | 130,00 € | Done |
| projet : Soirée BPCE | Mai | 1 | 92,84 € | Done |
| projet : opération edf | Mai | 2 | 90,00 € | Done |
| projet : cars & coffee | Jui | 1 | 76,00 € | Done |
| projet : conférence de presse CCDMD | Jui | 1 | 60,00 € | Done |
| projet : lancement twingo mende | Avr | 1 | 48,00 € | Done |
| projet | Jan | 1 | 20,50 € | Done |

