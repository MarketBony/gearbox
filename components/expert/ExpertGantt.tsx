import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Project, Task, User } from '../../types';
import Avatar from '../Avatar';

/**
 * GANTT du mode EXPERT — les tâches dans le temps, groupées par PERSONNE.
 *
 * Le regroupement par personne n'est pas décoratif : c'est la réponse à « faire
 * ressortir qui est sur quelle tâche ». Une ligne par intervenant, ses tâches posées
 * dessus, et les chevauchements se lisent d'un coup d'œil.
 *
 * ⚠️ DEUX FORMES DE MARQUE, et c'est structurel :
 *  - `startDate` + `deadline` -> une BARRE, la seule qui porte une durée ;
 *  - `deadline` seule         -> un JALON (losange), parce qu'une tâche sans date de
 *    début n'a qu'un point dans le temps. Dessiner une barre partant du début du projet
 *    serait plus joli et FAUX : toutes les tâches sembleraient démarrer le même jour.
 * Une tâche sans aucune date ne peut pas être placée ; elle est listée à part, sous le
 * graphique, plutôt que silencieusement absente.
 *
 * ⚠️ Tailwind est en CDN Play : pas de `grid-cols-[repeat(...)]` (les valeurs
 * arbitraires contenant `repeat(...)` ne sont pas générées). Tout est donc positionné
 * en pourcentages, comme le Gantt de l'Agenda (`ProjectBarGantt`), dont on reprend
 * l'arithmétique left/width.
 */

const JOUR_MS = 24 * 60 * 60 * 1000;

// Parse local (anti-décalage J+1) : 'YYYY-MM-DD' -> Date à minuit local.
// Même helper que Projects.tsx / Dashboard.tsx — recopié plutôt qu'importé pour ne pas
// créer une dépendance d'un composant vers une page.
const parseLocal = (iso: string): Date => {
  const [y, m, d] = (iso || '').split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
};

const iso = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const EST_FINIE = (t: Task) => t.status === 'Done' || t.status === 'Programmed';

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/**
 * Largeur RÉELLE d'un libellé, mesurée au canvas dans la police de la page.
 *
 * ⚠️ Mesurer et ne pas estimer : la première version supposait « 130 px pour tout le
 * monde » et alternait sur deux niveaux en ne regardant que le jalon précédent. Sur
 * « Forum Pièces 2026 », trois jalons rapprochés retombaient donc au même niveau et
 * leurs noms se chevauchaient — « Grande Halle d'Auvergne » et « Visuel Ticket d'Or »
 * s'écrivaient l'un sur l'autre. Même méthode que le calibrage des colonnes du tableau
 * des tâches (correctif 42) : on mesure, on ne devine pas.
 */
let ctxMesure: CanvasRenderingContext2D | null = null;
const largeurTexte = (texte: string): number => {
  if (!ctxMesure) {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return texte.length * 5;
    c.font = `600 9px ${getComputedStyle(document.body).fontFamily}`;
    ctxMesure = c;
  }
  return Math.ceil(ctxMesure.measureText(texte).width);
};

// Crans verticaux ou se posent les libelles.
// ⚠️ AUCUN cran a la hauteur de l'axe (0). Un cran 0 semblait pourtant le plus lisible,
// et il l'etait pour SON jalon — mais rien n'empeche le LOSANGE d'un jalon voisin de
// tomber par-dessus le texte : constate le 27/08/2026, « Visuel Ticket D'or » s'affichait
// « uel Ticket D'or », son debut mange par le losange suivant. L'algorithme ci-dessous
// evite les collisions entre LIBELLES ; les losanges, eux, sont toujours sur l'axe. En
// n'ecrivant jamais sur l'axe, le probleme disparait par construction.
// Ordre volontaire : on remplit d'abord les crans proches de l'axe (plus lisibles).
// Ecarts mesures le 27/08/2026 : le losange est un carre de 12 px tourne a 45 deg, sa
// DIAGONALE fait donc ~17 px et il deborde de +/-8,5 px autour de l'axe. Un libelle de
// 9 px occupe ~+/-6 px autour de son cran. En dessous de 15 px, les deux se touchent
// encore — mesure a l'appui, +/-11 px laissait 3 losanges mordre un libelle.
const CRANS = [-17, 17, -32, 32];
const LARGEUR_MAX_LIBELLE = 150;

interface Jalon { left: number; aGauche: boolean; niveau: number; largeur: number; }

/**
 * Place les libellés de jalons sur les crans disponibles, sans collision.
 *
 * Pour chaque jalon (de gauche à droite) on calcule l'intervalle horizontal qu'occupera
 * son texte, puis on lui donne le PREMIER cran dont le dernier libellé se termine avant
 * — algorithme classique de placement d'étiquettes. Quand aucun cran n'est libre, le
 * libellé est masqué (`niveau = -1`) : le losange reste, son nom s'affiche au survol.
 * Mieux vaut un nom en moins qu'une bouillie de texte.
 */
const placerLibelles = (
  marques: { t: Task; jalon: boolean; left: number; width: number }[],
  largeurPiste: number
): Map<string, Jalon> => {
  const place = new Map<string, Jalon>();
  if (largeurPiste <= 0) return place;

  const finParCran = CRANS.map(() => -Infinity);
  const MARGE = 8; // respiration entre deux étiquettes voisines

  for (const m of marques) {
    if (!m.jalon) continue;
    const xLosange = (m.left / 100) * largeurPiste;
    const largeur = Math.min(largeurTexte(m.t.name || 'Sans nom') + 4, LARGEUR_MAX_LIBELLE);
    // Près du bord droit, le texte s'écrit à gauche du losange, sinon il sort du cadre.
    const aGauche = xLosange + largeur + 14 > largeurPiste;
    const debut = aGauche ? xLosange - 10 - largeur : xLosange + 10;
    const fin = debut + largeur;

    let niveau = -1;
    for (let i = 0; i < CRANS.length; i++) {
      if (debut >= finParCran[i] + MARGE) { niveau = i; finParCran[i] = fin; break; }
    }
    place.set(m.t.id, { left: m.left, aGauche, niveau, largeur });
  }
  return place;
};

interface Props {
  projet: Project;
  users: User[];
  onOuvrirTache: (taskId: string) => void;
}

const ExpertGantt: React.FC<Props> = ({ projet, users, onOuvrirTache }) => {
  const g = useMemo(() => {
    const taches = projet.tasks.filter(t => t.status !== 'Empty');
    const placables = taches.filter(t => t.deadline || t.startDate);
    const orphelines = taches.filter(t => !t.deadline && !t.startDate);

    if (placables.length === 0) {
      return { lignes: [], orphelines, debut: null as Date | null, total: 0, graduations: [], posAujourdhui: -1 };
    }

    // Fenêtre = min/max des dates de tâches, ET des bornes du projet : le Gantt d'un
    // projet doit montrer le projet, pas seulement ses tâches datées.
    const toutes: string[] = [];
    for (const t of placables) {
      if (t.startDate) toutes.push(t.startDate);
      if (t.deadline) toutes.push(t.deadline);
    }
    if (projet.startDate) toutes.push(projet.startDate.slice(0, 10));
    if (projet.endDate) toutes.push(projet.endDate.slice(0, 10));

    const min = parseLocal(toutes.reduce((a, b) => (a < b ? a : b)));
    const max = parseLocal(toutes.reduce((a, b) => (a > b ? a : b)));
    // Marge de 2 jours de chaque côté : sans elle, une tâche tombant sur une borne se
    // colle au bord et devient illisible.
    const debut = new Date(min.getTime() - 2 * JOUR_MS);
    const fin = new Date(max.getTime() + 2 * JOUR_MS);
    const total = Math.max(1, Math.round((fin.getTime() - debut.getTime()) / JOUR_MS));

    // Position en % d'une date dans la fenêtre.
    const pos = (d: string) => ((parseLocal(d).getTime() - debut.getTime()) / JOUR_MS / total) * 100;

    // Regroupement par personne, non-assignées en dernier.
    const parPersonne = new Map<string, Task[]>();
    for (const t of placables) {
      const cle = t.assignedUserId || '';
      parPersonne.set(cle, [...(parPersonne.get(cle) || []), t]);
    }
    const lignes = [...parPersonne.entries()]
      .map(([userId, ts]) => ({
        userId,
        user: users.find(u => u.id === userId),
        taches: ts
          .map(t => {
            const dDeb = t.startDate || t.deadline!;
            const dFin = t.deadline || t.startDate!;
            const left = Math.max(0, Math.min(100, pos(dDeb)));
            const right = Math.max(0, Math.min(100, pos(dFin)));
            return {
              t,
              jalon: !t.startDate || !t.deadline || t.startDate === t.deadline,
              left,
              width: Math.max(0, right - left)
            };
          })
          .sort((a, b) => a.left - b.left)
      }))
      .sort((a, b) => (a.userId === '' ? 1 : b.userId === '' ? -1 : (a.user?.name || '').localeCompare(b.user?.name || '', 'fr')));

    // Graduations : le 1er de chaque mois de la fenêtre.
    const graduations: { pos: number; libelle: string }[] = [];
    const curseur = new Date(debut.getFullYear(), debut.getMonth(), 1);
    while (curseur <= fin) {
      const p = ((curseur.getTime() - debut.getTime()) / JOUR_MS / total) * 100;
      if (p >= 0 && p <= 100) {
        graduations.push({ pos: p, libelle: `${MOIS_COURTS[curseur.getMonth()]} ${String(curseur.getFullYear()).slice(2)}` });
      }
      curseur.setMonth(curseur.getMonth() + 1);
    }

    const today = iso(new Date());
    const pAuj = pos(today);
    return {
      lignes, orphelines, debut, total, graduations,
      posAujourdhui: pAuj >= 0 && pAuj <= 100 ? pAuj : -1
    };
  }, [projet.tasks, projet.startDate, projet.endDate, users]);

  // Largeur RÉELLE d'une piste, observée dans le DOM : le placement des libellés se
  // fait en pixels, pas en pourcentages estimés. Toutes les pistes ont la même largeur
  // (elles partagent `flex-1` après une colonne de gauche fixe), une seule mesure suffit.
  const pisteRef = useRef<HTMLDivElement>(null);
  const [largeurPiste, setLargeurPiste] = useState(0);
  useLayoutEffect(() => {
    const el = pisteRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setLargeurPiste(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [g.lignes.length]);

  // Un placement par ligne : les jalons d'une personne n'entrent jamais en collision
  // avec ceux d'une autre, elles sont sur des pistes distinctes.
  const placements = useMemo(
    () => new Map(g.lignes.map(l => [l.userId, placerLibelles(l.taches, largeurPiste)])),
    [g.lignes, largeurPiste]
  );

  if (g.lignes.length === 0) {
    return (
      <div className="gx-card p-8 text-center text-slate-500 text-sm italic border border-dashed border-bony-border">
        Aucune tâche datée. Renseignez une échéance — et, pour une vraie barre, une date de
        début — dans le détail d'une tâche.
      </div>
    );
  }

  const today = iso(new Date());

  return (
    <div className="space-y-3">
      <div className="gx-card p-4 overflow-x-auto">
        <div className="min-w-[680px]">

          {/* Graduations mensuelles */}
          <div className="relative h-5 mb-2 ml-[150px] border-b border-bony-border">
            {g.graduations.map(gr => (
              <span
                key={gr.libelle}
                className="absolute top-0 text-[9px] font-bold text-slate-500 uppercase -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${gr.pos}%` }}
              >
                {gr.libelle}
              </span>
            ))}
          </div>

          {/* Lignes : une par personne */}
          <div className="space-y-2">
            {g.lignes.map((ligne, idxLigne) => (
              <div key={ligne.userId || 'non-assigne'} className="flex items-center gap-2">

                {/* Colonne de gauche : l'intervenant */}
                <div className="w-[142px] shrink-0 flex items-center gap-1.5 pr-2">
                  {ligne.user
                    ? <Avatar userId={ligne.user.id} name={ligne.user.name} color={ligne.user.avatarColor} size={20} />
                    : <div className="w-5 h-5 rounded-full border border-dashed border-bony-orange/60 shrink-0" />}
                  <span className={`text-[11px] font-semibold truncate ${ligne.user ? 'text-bony-text' : 'text-bony-orange'}`}>
                    {ligne.user ? ligne.user.name : 'Non assignées'}
                  </span>
                  <span className="ml-auto text-[9px] text-slate-500 font-sans shrink-0">{ligne.taches.length}</span>
                </div>

                {/* Piste temporelle */}
                <div
                  ref={idxLigne === 0 ? pisteRef : undefined}
                  className="relative flex-1 h-20 rounded-lg bg-slate-100 dark:bg-white/[0.03] border border-bony-border/60"
                >
                  {/* Repères de mois, discrets */}
                  {g.graduations.map(gr => (
                    <div key={gr.libelle} className="absolute top-0 bottom-0 w-px bg-bony-border/40" style={{ left: `${gr.pos}%` }} />
                  ))}
                  {/* Trait « aujourd'hui » */}
                  {g.posAujourdhui >= 0 && (
                    <div className="absolute top-0 bottom-0 w-px bg-bony-orange z-10" style={{ left: `${g.posAujourdhui}%` }} />
                  )}

                  {ligne.taches.map(({ t, jalon, left, width }) => {
                    const enRetard = !EST_FINIE(t) && !!t.deadline && t.deadline < today;
                    const titre = `${t.name || 'Sans nom'}${t.startDate ? ` — du ${t.startDate}` : ''}${t.deadline ? ` au ${t.deadline}` : ''}${enRetard ? ' (en retard)' : ''}`;

                    if (jalon) {
                      // Position et cran calcules en AMONT par `placerLibelles`, sur des
                      // largeurs de texte mesurees : c'est ce qui garantit qu'aucun libelle
                      // n'en recouvre un autre. `niveau === -1` = pas de place, on n'affiche
                      // que le losange et son infobulle.
                      const pl = placements.get(ligne.userId)?.get(t.id);
                      const aGauche = pl?.aGauche ?? false;
                      const niveau = pl?.niveau ?? -1;
                      const couleur = enRetard
                        ? 'bg-red-500 border-red-300'
                        : EST_FINIE(t) ? 'bg-green-500 border-green-300'
                        : 'bg-bony-violet border-bony-violet/50';

                      return (
                        <React.Fragment key={t.id}>
                          {/* Le LOSANGE, toujours sur l'axe du temps : sa position verticale
                              ne doit jamais bouger, c'est elle qui aligne le jalon sur les
                              graduations et sur les barres des autres taches. */}
                          <button
                            onClick={() => onOuvrirTache(t.id)}
                            title={titre}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 group"
                            style={{ left: `${left}%` }}
                          >
                            <span className={`block w-3 h-3 rotate-45 border transition-transform group-hover:scale-125 ${couleur}`} />
                          </button>

                          {/* Le LIBELLE, pose sur son cran. Il porte sa largeur mesuree :
                              pas de `truncate` a l'aveugle, la troncature n'arrive que si le
                              nom depasse vraiment la largeur maximale. */}
                          {niveau >= 0 && (
                            <button
                              onClick={() => onOuvrirTache(t.id)}
                              title={titre}
                              className="absolute top-1/2 z-20 text-[9px] font-semibold text-bony-text/80 hover:text-bony-orange truncate text-left transition-colors"
                              style={{
                                width: `${pl!.largeur}px`,
                                transform: `translateY(calc(-50% + ${CRANS[niveau]}px))`,
                                ...(aGauche
                                  ? { right: `calc(${100 - left}% + 10px)`, textAlign: 'right' as const }
                                  : { left: `calc(${left}% + 10px)` })
                              }}
                            >
                              {t.name}
                            </button>
                          )}
                        </React.Fragment>
                      );
                    }
                    return (
                      <button
                        key={t.id}
                        onClick={() => onOuvrirTache(t.id)}
                        title={titre}
                        className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md z-20 px-1.5 flex items-center overflow-hidden transition-all hover:brightness-110 hover:h-6 ${
                          enRetard ? 'bg-red-500/80 border border-red-400'
                          : EST_FINIE(t) ? 'bg-green-500/70 border border-green-400/60'
                          : 'gx-gradient border border-white/10'
                        }`}
                        style={{ left: `${left}%`, width: `${width}%`, minWidth: '10px' }}
                      >
                        <span className="text-[9px] font-bold text-white truncate">{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Légende */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-bony-border text-[9px] text-slate-500 uppercase font-bold tracking-wide">
            <span className="flex items-center gap-1.5"><span className="w-4 h-2 rounded gx-gradient" /> Barre : début → échéance</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rotate-45 bg-bony-violet" /> Jalon : échéance seule</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-2 rounded bg-green-500/70" /> Terminé</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-2 rounded bg-red-500/80" /> En retard</span>
            <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-bony-orange" /> Aujourd'hui</span>
          </div>
        </div>
      </div>

      {/* Tâches non plaçables — listées, jamais escamotées */}
      {g.orphelines.length > 0 && (
        <div className="gx-card p-3 border border-dashed border-bony-border">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
            {g.orphelines.length} tâche{g.orphelines.length > 1 ? 's' : ''} sans date — absente{g.orphelines.length > 1 ? 's' : ''} du planning
          </p>
          <div className="flex flex-wrap gap-1.5">
            {g.orphelines.map(t => (
              <button
                key={t.id}
                onClick={() => onOuvrirTache(t.id)}
                className="text-[11px] px-2 py-1 rounded-lg border border-bony-border bg-slate-100 dark:bg-white/5 text-bony-text hover:border-bony-orange/50 transition truncate max-w-[220px]"
              >
                {t.name || 'Sans nom'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpertGantt;
