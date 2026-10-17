// Thème « Grève CGT » du BOWLING — textes PROPRES au bowling (Théo, 17/10/2026 : pas les mêmes que les autres jeux ;
// liés au bowling, à l'automobile et au marketing, second degré). Le logo reste celui des autres jeux : assets/logo-cgt.svg.

/** Banderoles (longues) : murs de la salle, écrans au-dessus des pistes. */
export const SLOGANS = [
  'LES QUILLES TOMBENT, PAS NOS SALAIRES !',
  '10 QUILLES DEBOUT, 10 % D\'AUGMENTATION !',
  'LE STRIKE C\'EST NOUS, LA GOUTTIÈRE C\'EST VOUS !',
  'TON TAUX DE CONVERSION N\'EST PAS MON TAUX HORAIRE',
  'NON AU BALAYAGE AUTOMATIQUE DE NOS ACQUIS !',
  'PAS DE REPRISE SANS REPRISE DES NÉGOCIATIONS !',
  'LA REMISE, ON LA VEUT SUR LES SALAIRES !',
  'L\'OBJECTIF DU MOIS, C\'EST LA GRÈVE !',
  'CONTRÔLE TECHNIQUE DES PROFITS !',
  'ON NE SERA PLUS VOS QUILLES !',
  '3 LEADS, 0 PRIME, 100 % COLÈRE',
];

/** Pancartes (courtes) tenues par la foule. */
export const PANCARTES = [
  'STRIKE GÉNÉRAL', 'QUILLES EN LUTTE', 'NI DIEU NI GOUTTIÈRE', 'PRIME À LA CASSE… SOCIALE', '0 % HUILE 100 % COLÈRE',
  'VIDANGE DES DIVIDENDES', 'RAPPEL CONSTRUCTEUR : NOS SALAIRES', 'LEADS ≠ SALAIRE', 'BOULE DE NERFS', 'SPARE-NOUS LE BLABLA',
];

/**
 * Annonces à l'écran : le TITRE reste le terme de bowling (lisible, comme en thème Bony) et la blague CGT s'affiche
 * EN DESSOUS (Théo, 17/10/2026). Une blague tirée au hasard dans la liste du résultat.
 */
export const ANNONCES = {
  strike: { titre: 'STRIKE !', sous: ['GRÈVE GÉNÉRALE !', 'TOUT LE MONDE À TERRE… SAUF LES SALAIRES', '10 QUILLES, 0 NÉGOCIATION', 'BLOCAGE TOTAL DU PLATEAU'] },
  double: { titre: 'DOUBLE !', sous: ['CONVERGENCE DES LUTTES !', 'LE MOUVEMENT PREND'] },
  turkey: { titre: 'TURKEY !', sous: ['MOUVEMENT RECONDUCTIBLE !', 'GRÈVE ILLIMITÉE VOTÉE À MAIN LEVÉE'] },
  spare: { titre: 'SPARE !', sous: ['ACQUIS SOCIAL !', 'RATTRAPAGE DE SALAIRE', 'ARRACHÉ À LA DIRECTION'] },
  split: { titre: 'SPLIT !', sous: ['DIVISION SYNDICALE !', 'LA DIRECTION DIVISE POUR MIEUX RÉGNER'] },
  bon: { titre: null, sous: ['NÉGOCIATION EN COURS', 'AVANCÉE TIMIDE', 'MIEUX QUE LA DERNIÈRE AUGMENTATION', 'PREMIÈRE SOMMATION'] },
  rate: { titre: 'RATÉ !', sous: ['PIQUET DE GRÈVE', 'QUILLES NON GRÉVISTES', 'LA BOULE A FAIT LE PONT'] },
  gouttiere: { titre: 'GOUTTIÈRE !', sous: ['DANS LE CANIVEAU… COMME LA PRIME', 'SORTIE DE ROUTE', 'RAPPEL CONSTRUCTEUR'] },
};
