import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSessionState } from '../hooks/useSessionState';
import { useAuth } from '../contexts/AuthContext';
import { db, ApiError } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { congesAccesStore } from '../services/congesAcces';
import { CongeJour, CongeType, CongeDemi, CongeDroit, User } from '../types';
import {
  CONGES_TYPES, CONGES_DEMI, valeurJourConge, congeDecompteSolde, peutGererConges,
  peutValiderConges, CONGES_LECTURE_ROLES, CONGES_DROIT_DEFAUT, periodeCongesDe,
  bornesPeriodeConges, libellePeriodeConges,
} from '../constants';
import { estChome, ferieDe, joursOuvres } from '../lib/joursFeries';
import Avatar from '../components/Avatar';
import FloatingPanel from '../components/FloatingPanel';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';
import {
  ChevronLeft, ChevronRight, Users, X, Check, Plus, CalendarDays, LayoutDashboard, Trash2,
  Rows3, Pencil,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// CONGÉS — portage du fichier HTML tenu par le boss de Théo (12/09/2026).
//
// Trois vues : un PLANNING cliquable (lignes = personnes, colonnes = jours du mois,
// « wallchart » façon Timetastic / Leave Dates), un AGENDA continu où tout le monde est
// mêlé sur douze mois, et un TABLEAU DE BORD.
//
// ⚠️ Les totaux sont calculés sur la PÉRIODE DE RÉFÉRENCE (1er juin → 31 mai), pas sur
// l'année civile : c'est la période légale d'acquisition des congés payés (art. L3141-3).
// Le fichier du boss de Théo, lui, compte par année civile — ses totaux et ceux de
// Gearbox ne se recoupent donc pas à l'identique, et c'est voulu.
//
// ⚠️ Les équipes de la maquette (Mkt Opérationnel / Digital / Call Center) ont été
// ABANDONNÉES sur décision de Théo : Gearbox n'a pas cette notion, une seule liste à plat.
//
// ⚠️ Le PÉRIMÈTRE décide de tout : seules les personnes ajoutées par un gestionnaire
// apparaissent en ligne. Tous les comptes Gearbox ne sont pas du marketing.
// ═══════════════════════════════════════════════════════════════════════════

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MOIS_COURT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const LETTRES_JOUR = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** 'YYYY-MM-DD' d'une date LOCALE — jamais `toISOString`, qui décale d'un jour. */
const cle = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** « 1,5 » et non « 1.5 ». Une seule porte : le total d'une ligne, le pied et les KPI
 *  affichaient sinon deux conventions différentes sur le même écran. */
const fmtJours = (n: number): string => String(n).replace('.', ',');

const joursDuMois = (annee: number, mois: number): string[] => {
  const n = new Date(annee, mois + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => cle(new Date(annee, mois, i + 1)));
};

/**
 * Les douze mois d'une période de référence, de juin à mai.
 * Rend `[annee, mois]` pour éviter de recalculer le passage d'année partout.
 */
const moisDeLaPeriode = (periode: number): [number, number][] =>
  Array.from({ length: 12 }, (_, i) => (i < 7 ? [periode, 5 + i] : [periode + 1, i - 7]) as [number, number]);

/**
 * Les cases d'un mois pour une grille LUNDI → DIMANCHE, `null` pour les cases vides qui
 * précèdent le 1er. ⚠️ `getDay()` rend 0 pour dimanche : le décalage est `(jour + 6) % 7`,
 * pas `jour - 1`, sinon un mois commençant un dimanche partirait à -1.
 */
const grilleDuMois = (annee: number, mois: number): (string | null)[] => {
  const vides = (new Date(annee, mois, 1).getDay() + 6) % 7;
  return [...Array.from({ length: vides }, () => null), ...joursDuMois(annee, mois)];
};

const Conges: React.FC = () => {
  const { user } = useAuth();
  const [onglet, setOnglet] = useSessionState<'planning' | 'agenda' | 'dashboard'>('conges_onglet', 'planning');
  const [annee, setAnnee] = useSessionState<number>('conges_annee', new Date().getFullYear());
  const [mois, setMois] = useSessionState<number>('conges_mois', new Date().getMonth());
  /**
   * Période de référence affichée par l'agenda et le tableau de bord, identifiée par son
   * année de DÉBUT. Distincte du mois du planning : on consulte volontiers le planning de
   * juillet tout en regardant le solde de la période en cours.
   */
  const [periode, setPeriode] = useSessionState<number>('conges_periode', periodeCongesDe(cle(new Date())));

  const [jours, setJours] = useState<CongeJour[]>([]);
  const [membres, setMembres] = useState<string[]>([]);
  const [droits, setDroits] = useState<CongeDroit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);

  const [showParticipants, setShowParticipants] = useState(false);
  const [showPeriode, setShowPeriode] = useState(false);
  /** Cellule ouverte : la personne, le jour, et l'élément qui sert d'ancre au panneau. */
  const [cellule, setCellule] = useState<{ userId: string; date: string; ancre: HTMLElement } | null>(null);
  /** Jour ouvert dans l'AGENDA : liste des absents, en lecture. */
  const [agendaJour, setAgendaJour] = useState<{ date: string; ancre: HTMLElement } | null>(null);
  /** Droit à CP en cours d'édition (gestionnaires). La valeur reste une chaîne tant qu'on
   *  tape : « 12, » est un état de frappe légitime qu'un `number` effacerait. */
  const [editDroit, setEditDroit] = useState<{ userId: string; valeur: string } | null>(null);
  /** Conteneur défilant de l'agenda, pour l'amener sur le mois courant à l'ouverture. */
  const agendaRef = useRef<HTMLDivElement | null>(null);

  const gestionnaire = peutGererConges(user?.role);
  const validateur = peutValiderConges(user?.role);

  /**
   * ⚠️ Chacun modifie SA ligne, les gestionnaires celle de tout le monde (arbitrage de
   * Théo). SEULE PORTE côté écran — le refus réel est dans `routes/conges.ts`, qui rend
   * 403. Masquer un bouton ne ferme pas une route.
   */
  const peutEcrirePour = useCallback(
    (userId: string) => !!user && (user.id === userId || gestionnaire),
    [user, gestionnaire]
  );

  /**
   * ⚠️ On charge une FENÊTRE ENTIÈRE d'un coup, pas le mois affiché : changer de mois ne
   * doit pas relancer une requête, et le tableau de bord agrège une période de référence
   * qui chevauche deux années civiles. La fenêtre couvre donc les deux navigations —
   * le mois du planning et la période — en années pleines. Le volume le permet largement
   * (quelques centaines de lignes par an).
   */
  const fenetre = useMemo(() => ({
    debut: `${Math.min(annee, periode)}-01-01`,
    fin: `${Math.max(annee, periode + 1)}-12-31`,
  }), [annee, periode]);

  const charger = useCallback(async () => {
    try {
      const [data, liste] = await Promise.all([
        db.getConges(fenetre.debut, fenetre.fin),
        db.getUsers().catch(() => [] as User[]),
      ]);
      setJours(data.jours);
      setMembres(data.membres);
      setDroits(data.droits ?? []);
      setUsers(liste);
      congesAccesStore.set(data.membres, user?.role, user?.id);
    } catch (e) {
      console.error('Congés : chargement échoué', e);
    } finally {
      setChargement(false);
    }
  }, [fenetre.debut, fenetre.fin, user?.id, user?.role]);

  useEffect(() => { charger(); }, [charger]);
  useRealtimeSync([...RT_EVENTS.conges, ...RT_EVENTS.users], () => charger());

  /** Index (userId → date → congé) : le planning lit une cellule des dizaines de fois. */
  const index = useMemo(() => {
    const m = new Map<string, Map<string, CongeJour>>();
    for (const j of jours) {
      if (!m.has(j.userId)) m.set(j.userId, new Map());
      m.get(j.userId)!.set(j.date, j);
    }
    return m;
  }, [jours]);

  const congeDe = useCallback((userId: string, date: string) => index.get(userId)?.get(date) ?? null, [index]);

  /** Les membres, dans l'ordre alphabétique, avec leur fiche utilisateur. */
  const lignes = useMemo(() => {
    const parId = new Map(users.map(u => [u.id, u]));
    return membres
      .map(id => ({ id, user: parId.get(id) }))
      .filter(l => !!l.user)
      .sort((a, b) => (a.user!.name || '').localeCompare(b.user!.name || ''));
  }, [membres, users]);

  const datesDuMois = useMemo(() => joursDuMois(annee, mois), [annee, mois]);

  /**
   * Total d'une personne sur un mois, demi-journées comprises. Jours chômés exclus.
   * `filtre` restreint aux types voulus (le solde ne compte que les CP).
   */
  const totalMoisDe = useCallback((userId: string, a: number, m: number, filtre?: (t: string) => boolean) =>
    joursDuMois(a, m).reduce((t, d) => {
      if (estChome(d)) return t;
      const c = congeDe(userId, d);
      if (!c || (filtre && !filtre(c.type))) return t;
      return t + valeurJourConge(c.type, c.demi);
    }, 0),
    [congeDe]);

  /** Le mois affiché par le PLANNING. */
  const totalMois = useCallback((userId: string, m: number) => totalMoisDe(userId, annee, m), [totalMoisDe, annee]);

  /** Total sur la PÉRIODE DE RÉFÉRENCE affichée (juin → mai), et non sur l'année civile. */
  const totalPeriode = useCallback((userId: string, filtre?: (t: string) => boolean) =>
    moisDeLaPeriode(periode).reduce((t, [a, m]) => t + totalMoisDe(userId, a, m, filtre), 0),
    [totalMoisDe, periode]);

  /** Droit à CP de la personne sur la période affichée. Absence de ligne = 25 jours. */
  const droitDe = useCallback((userId: string) =>
    droits.find(d => d.userId === userId && d.periode === periode)?.jours ?? CONGES_DROIT_DEFAUT,
    [droits, periode]);

  /** Qui est absent tel jour, avec son congé. Base de l'agenda. */
  const absentsDu = useCallback((d: string) =>
    lignes.map(l => ({ ligne: l, conge: congeDe(l.id, d) })).filter(x => !!x.conge),
    [lignes, congeDe]);

  /**
   * Amène l'agenda sur un mois ('YYYY-MM').
   *
   * ⚠️ `offsetTop` et non `scrollIntoView` : ce dernier ferait aussi défiler la PAGE,
   * ce qui sort l'en-tête de la rubrique de l'écran.
   *
   * ⚠️ Et on REPASSE plusieurs images : au premier cadre, les avatars des mois du haut
   * ne sont pas encore posés, les sections grandissent ensuite et la cible descend. Un
   * seul calcul visait 958 px là où le mois se trouvait finalement à 1 490 — on tombait
   * un mois trop tôt (constaté en recette). On recale tant que l'écart persiste, au plus
   * cinq cadres, ce qui s'arrête tout seul dès que la mise en page est stable.
   */
  const caleSurMois = useCallback((ym: string) => {
    let essais = 0;
    const pas = () => {
      const boite = agendaRef.current;
      const cible = boite?.querySelector(`[data-mois="${ym}"]`) as HTMLElement | null;
      if (!boite || !cible) return;
      if (Math.abs(boite.scrollTop - cible.offsetTop) > 2) boite.scrollTop = cible.offsetTop;
      if (++essais < 5) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  }, []);

  /** Ramène l'agenda sur le mois en cours, en changeant de période si besoin. */
  const allerAujourdhui = useCallback(() => {
    const auj = cle(new Date());
    const p = periodeCongesDe(auj);
    if (p !== periode) setPeriode(p);
    caleSurMois(auj.slice(0, 7));
  }, [periode, setPeriode, caleSurMois]);

  /**
   * À l'ouverture de l'agenda, on se cale sur le mois courant plutôt que sur juin :
   * consulter « qui est là » commence presque toujours par aujourd'hui.
   */
  useEffect(() => {
    if (onglet !== 'agenda' || chargement) return;
    const auj = cle(new Date());
    if (periodeCongesDe(auj) !== periode) return;
    caleSurMois(auj.slice(0, 7));
  }, [onglet, periode, chargement, caleSurMois]);

  // ─────────────────────────── ÉCRITURES ───────────────────────────

  const poser = async (userId: string, date: string, type: CongeType | null, demi: CongeDemi = null) => {
    setEnregistrement(true);
    try {
      await db.setCongeJour(userId, date, type, demi);
      await charger();
      if (type === null) setCellule(null);
    } catch (e) {
      console.error('Congés : enregistrement échoué', e);
      alert(e instanceof ApiError ? e.message : "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  };

  const basculerValidation = async (userId: string, date: string, validated: boolean) => {
    setEnregistrement(true);
    try {
      await db.setCongeValidation(userId, date, validated);
      await charger();
    } catch (e) {
      console.error('Congés : validation échouée', e);
      alert(e instanceof ApiError ? e.message : 'Validation impossible.');
    } finally {
      setEnregistrement(false);
    }
  };

  const poserDroit = async (userId: string, valeur: number) => {
    setEnregistrement(true);
    try {
      await db.setCongeDroit(userId, periode, valeur);
      await charger();
    } catch (e) {
      console.error('Congés : droit non enregistré', e);
      alert(e instanceof ApiError ? e.message : 'Enregistrement impossible.');
    } finally {
      setEnregistrement(false);
    }
  };

  // ─────────────────────────── RENDU ───────────────────────────

  const badge = (c: CongeJour | null) => {
    if (!c) return null;
    const t = CONGES_TYPES[c.type];
    if (!t) return null;
    // ⚠️ Deux teintes par type, comme la maquette : plein = validé, pâle = en attente.
    // C'est toute la lecture du planning d'un coup d'œil.
    const fond = c.validated ? t.couleur : `${t.couleur}33`;
    // Une DEMI-journée se voit : la case n'est remplie qu'à moitié, du côté concerné.
    // Un simple libellé « CP (AM) » serait illisible dans 34 px de large.
    const style: React.CSSProperties = c.demi
      ? {
          background: `linear-gradient(${c.demi === 'AM' ? '90deg' : '270deg'}, ${fond} 0 50%, transparent 50% 100%)`,
          color: c.validated ? '#fff' : t.couleur,
          border: `1px solid ${c.validated ? t.couleur : `${t.couleur}66`}`,
        }
      : { backgroundColor: fond, color: c.validated ? '#fff' : t.couleur, border: `1px solid ${c.validated ? t.couleur : `${t.couleur}66`}` };
    return (
      <span
        className="block w-full h-full rounded flex items-center justify-center text-[9px] font-bold"
        style={style}
        title={`${t.label}${c.demi ? ` — ${CONGES_DEMI[c.demi].label.toLowerCase()}` : ''}${c.validated ? ' — validé' : ' — en attente'}`}
      >
        {t.court}
      </span>
    );
  };

  const enTete = (
    <div className="shrink-0 px-3 md:px-6 pt-3 md:pt-5 pb-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-title text-lg md:text-xl text-bony-text flex items-center gap-2">
            <CalendarDays size={18} className="text-bony-orange" /> Congés
          </h2>
          <p className="text-[10px] text-bony-muted mt-0.5">
            {lignes.length} collaborateur{lignes.length > 1 ? 's' : ''} ·{' '}
            {onglet === 'planning' ? `${MOIS_FR[mois]} ${annee}` : `période ${libellePeriodeConges(periode)}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-100 dark:bg-black/30 rounded-lg p-1 border border-bony-border">
            {([['planning', 'Planning', Rows3], ['agenda', 'Agenda', CalendarDays], ['dashboard', 'Tableau de bord', LayoutDashboard]] as const).map(([id, label, Icone]) => (
              <button
                key={id}
                onClick={() => setOnglet(id)}
                className={`px-2.5 md:px-3 min-h-[38px] rounded text-[11px] font-bold uppercase transition flex items-center gap-1.5 ${onglet === id ? 'bg-white dark:bg-bony-panel text-bony-orange shadow' : 'text-slate-500'}`}
              >
                <Icone size={13} /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          {gestionnaire && (
            <button
              onClick={() => setShowParticipants(true)}
              className="flex items-center gap-1.5 px-2.5 min-h-[38px] rounded-lg text-[11px] font-bold border border-bony-border text-slate-500 hover:border-bony-orange hover:text-bony-orange transition"
              title="Choisir qui apparaît dans la rubrique"
            >
              <Users size={14} /> <span className="hidden md:inline">Participants</span>
            </button>
          )}
          {lignes.length > 0 && (
            <button
              onClick={() => setShowPeriode(true)}
              className="flex items-center gap-1.5 px-2.5 min-h-[38px] rounded-lg text-[11px] font-bold bg-bony-gradient text-white hover:opacity-90 transition"
            >
              <Plus size={14} /> <span className="hidden sm:inline">Poser une période</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const legende = (
    <div className="flex items-center gap-3 flex-wrap text-[10px] text-bony-muted">
      {Object.entries(CONGES_TYPES).map(([id, t]) => (
        <span key={id} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: t.couleur }} />
          {t.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded border border-bony-border bg-slate-200 dark:bg-white/10" />
        Week-end / férié
      </span>
      <span className="hidden md:inline text-bony-muted/80">Plein = validé · pâle = en attente</span>
    </div>
  );

  // ── PLANNING ──────────────────────────────────────────────────────

  const planning = (
    <div className="flex-1 min-h-0 flex flex-col px-3 md:px-6 pb-3 md:pb-6 gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => { if (mois === 0) { setAnnee(annee - 1); setMois(11); } else setMois(mois - 1); }}
            className="w-11 h-11 md:w-9 md:h-9 rounded-lg border border-bony-border flex items-center justify-center text-slate-500 hover:text-bony-orange hover:border-bony-orange transition"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="font-title text-sm text-bony-text min-w-[130px] text-center">{MOIS_FR[mois]} {annee}</div>
          <button
            onClick={() => { if (mois === 11) { setAnnee(annee + 1); setMois(0); } else setMois(mois + 1); }}
            className="w-11 h-11 md:w-9 md:h-9 rounded-lg border border-bony-border flex items-center justify-center text-slate-500 hover:text-bony-orange hover:border-bony-orange transition"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {legende}
      </div>

      {lignes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <p className="text-sm text-bony-text font-bold">Personne dans la rubrique pour l'instant.</p>
            <p className="text-[11px] text-bony-muted mt-1">
              {gestionnaire
                ? 'Utilisez « Participants » pour choisir qui apparaît dans le planning.'
                : 'Un administrateur doit vous ajouter au planning.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* DESKTOP — tableau lignes × jours.
              ⚠️ La colonne des noms est `sticky left-0` avec un fond OPAQUE : sur un fond
              translucide, les cellules défileraient visiblement derrière elle. */}
          <div className="hidden md:block flex-1 min-h-0 overflow-auto custom-scrollbar gx-glass-panel rounded-xl border border-bony-border">
            {/* ⚠️ `table-fixed w-full` + `minWidth` : sans `w-full`, la table prenait sa
                largeur NATURELLE et laissait un tiers de l'écran vide à droite en 1400 px
                (constaté par Théo). `table-fixed` fait répartir l'espace restant à parts
                égales entre les jours, une fois les colonnes nom et total servies ; le
                `minWidth` garde le défilement horizontal quand la place manque. */}
            <table className="border-collapse table-fixed w-full" style={{ minWidth: `${220 + datesDuMois.length * 30 + 62}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-white dark:bg-bony-panel border-b border-r border-bony-border px-3 py-2 text-left w-[220px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-bony-muted">Collaborateur</span>
                  </th>
                  {datesDuMois.map(d => {
                    const chome = estChome(d);
                    const ferie = ferieDe(d);
                    const jourSemaine = new Date(`${d}T00:00:00`).getDay();
                    return (
                      <th
                        key={d}
                        title={ferie ?? undefined}
                        // ⚠️ Pas de largeur fixe : `table-fixed` répartit l'espace restant
                        // entre les jours, c'est ce qui fait que la table remplit l'écran.
                        // Un filet plus marqué le lundi découpe les semaines à l'œil.
                        className={`sticky top-0 z-20 border-b border-bony-border px-0 py-1 text-center ${jourSemaine === 1 ? 'border-l-2 border-l-bony-border' : ''} ${chome ? 'bg-slate-100 dark:bg-white/[0.06]' : 'bg-white dark:bg-bony-panel'}`}
                      >
                        <div className={`text-[11px] font-bold ${ferie ? 'text-bony-orange' : chome ? 'text-bony-muted' : 'text-bony-text'}`}>
                          {Number(d.slice(8))}
                        </div>
                        <div className="text-[9px] text-bony-muted">{LETTRES_JOUR[jourSemaine]}</div>
                      </th>
                    );
                  })}
                  <th className="sticky top-0 z-20 bg-white dark:bg-bony-panel border-b border-l border-bony-border px-1 py-1 text-center w-[60px]">
                    <div className="text-[10px] font-bold uppercase text-bony-muted">Total</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(({ id, user: u }) => (
                  <tr key={id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    <td className="sticky left-0 z-10 bg-white dark:bg-bony-panel border-b border-r border-bony-border px-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar userId={u!.id} name={u!.name} color={u!.avatarColor} size={24} />
                        <span className="text-xs text-bony-text truncate">{u!.name}</span>
                      </div>
                    </td>
                    {datesDuMois.map(d => {
                      const chome = estChome(d);
                      const c = congeDe(id, d);
                      const modifiable = peutEcrirePour(id) && !chome;
                      const lundi = new Date(`${d}T00:00:00`).getDay() === 1;
                      return (
                        <td
                          key={d}
                          onClick={e => { if (modifiable) setCellule({ userId: id, date: d, ancre: e.currentTarget as HTMLElement }); }}
                          className={`border-b border-bony-border p-0.5 h-9 ${lundi ? 'border-l-2 border-l-bony-border' : ''} ${chome ? 'bg-slate-100 dark:bg-white/[0.06]' : modifiable ? 'cursor-pointer hover:bg-bony-orange/10' : ''}`}
                        >
                          {!chome && badge(c)}
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-bony-border text-center">
                      <span className="text-xs font-bold text-bony-text tabular-nums">{totalMois(id, mois) ? fmtJours(totalMois(id, mois)) : '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-white dark:bg-bony-panel border-r border-t border-bony-border px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase text-bony-muted">Absents / jour</span>
                  </td>
                  {datesDuMois.map(d => {
                    const n = estChome(d) ? 0 : lignes.filter(l => congeDe(l.id, d)).length;
                    return (
                      <td key={d} className={`border-t border-bony-border text-center ${estChome(d) ? 'bg-slate-100 dark:bg-white/[0.06]' : ''}`}>
                        <span className={`text-[10px] font-bold tabular-nums ${n >= 4 ? 'text-red-500' : n > 0 ? 'text-bony-orange' : 'text-bony-muted/40'}`}>
                          {n || ''}
                        </span>
                      </td>
                    );
                  })}
                  <td className="border-t border-l border-bony-border" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* MOBILE — une liste, jamais la grille.
              ⚠️ 31 colonnes au doigt sont illisibles : c'est la leçon du Digital
              (correctif 31), où la grille a été remplacée par des cartes sous `md`. */}
          <div className="md:hidden flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2">
            {lignes.map(({ id, user: u }) => {
              const poses = datesDuMois.filter(d => !estChome(d) && congeDe(id, d));
              return (
                <div key={id} className="gx-glass-panel rounded-xl border border-bony-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar userId={u!.id} name={u!.name} color={u!.avatarColor} size={26} />
                      <span className="text-sm font-bold text-bony-text truncate">{u!.name}</span>
                    </div>
                    <span className="text-xs font-bold text-bony-orange tabular-nums shrink-0">{fmtJours(totalMois(id, mois))} j</span>
                  </div>
                  {poses.length === 0 ? (
                    <p className="text-[11px] text-bony-muted italic mt-2">Aucun congé ce mois-ci.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {poses.map(d => {
                        const c = congeDe(id, d)!;
                        const t = CONGES_TYPES[c.type];
                        return (
                          <button
                            key={d}
                            onClick={e => { if (peutEcrirePour(id)) setCellule({ userId: id, date: d, ancre: e.currentTarget as HTMLElement }); }}
                            className="px-2 min-h-[32px] rounded-lg text-[11px] font-bold flex items-center gap-1.5"
                            style={{
                              backgroundColor: c.validated ? t.couleur : `${t.couleur}22`,
                              color: c.validated ? '#fff' : t.couleur,
                              border: `1px solid ${t.couleur}66`,
                            }}
                          >
                            {Number(d.slice(8))} {MOIS_COURT[mois]} · {t.court}{c.demi ? ` ${CONGES_DEMI[c.demi].court}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // ── AGENDA — douze mois d'affilée, tout le monde mêlé ─────────────
  //
  // ⚠️ La vue demandée par Théo : « un calendrier déroulant, en mode agenda, où tout le
  // monde est mêlé, pour avoir une vue sur qui est là ou pas là sur plusieurs mois ».
  // C'est le « team calendar » des outils de référence (Timetastic, Leave Dates,
  // actiPLANS) : UN seul calendrier pour toute l'équipe, une pastille par personne
  // absente, et on déroule. Le PLANNING répond à l'autre question — « combien de jours a
  // posé untel » — pas à celle-ci ; les deux vues ne font donc pas double emploi.

  const agenda = (
    <div className="flex-1 min-h-0 flex flex-col px-3 md:px-6 pb-3 md:pb-6 gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPeriode(periode - 1)}
            className="w-11 h-11 md:w-9 md:h-9 rounded-lg border border-bony-border flex items-center justify-center text-slate-500 hover:text-bony-orange hover:border-bony-orange transition"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="font-title text-sm text-bony-text min-w-[170px] text-center">{libellePeriodeConges(periode)}</div>
          <button
            onClick={() => setPeriode(periode + 1)}
            className="w-11 h-11 md:w-9 md:h-9 rounded-lg border border-bony-border flex items-center justify-center text-slate-500 hover:text-bony-orange hover:border-bony-orange transition"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={allerAujourdhui}
            className="ml-1 px-2.5 min-h-[38px] rounded-lg border border-bony-border text-[11px] font-bold text-slate-500 hover:text-bony-orange hover:border-bony-orange transition"
          >
            Aujourd’hui
          </button>
        </div>
        {legende}
      </div>

      {/* ⚠️ `relative` : le calage sur le mois courant se fait avec `offsetTop`, qui est
          relatif au premier ancêtre positionné. Sans lui, on sauterait au mauvais endroit. */}
      <div
        ref={agendaRef}
        className="relative flex-1 min-h-0 overflow-y-auto custom-scrollbar gx-glass-panel rounded-xl border border-bony-border px-3 md:px-4 pb-4"
      >
        {moisDeLaPeriode(periode).map(([a, m]) => {
          const total = lignes.reduce((t, l) => t + totalMoisDe(l.id, a, m), 0);
          return (
            <section key={`${a}-${m}`} data-mois={`${a}-${String(m + 1).padStart(2, '0')}`} className="pb-5">
              <div className="sticky top-0 z-10 -mx-3 md:-mx-4 px-3 md:px-4 py-2 bg-white/90 dark:bg-bony-panel/90 backdrop-blur border-b border-bony-border flex items-baseline gap-2">
                <h3 className="font-title text-sm text-bony-text">{MOIS_FR[m]} {a}</h3>
                <span className="text-[10px] text-bony-muted">
                  {total > 0 ? `${fmtJours(total)} jour${total > 1 ? 's' : ''} posé${total > 1 ? 's' : ''}` : 'personne d’absent'}
                </span>
              </div>

              <div className="grid grid-cols-7 gap-1 mt-2">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => (
                  <div key={i} className="text-[9px] font-bold uppercase text-bony-muted text-center pb-0.5">{l}</div>
                ))}
                {grilleDuMois(a, m).map((d, i) => {
                  if (!d) return <div key={`v${i}`} />;
                  const chome = estChome(d);
                  const ferie = ferieDe(d);
                  const abs = absentsDu(d);
                  const aujourdhui = d === cle(new Date());
                  return (
                    <button
                      key={d}
                      onClick={e => { if (abs.length) setAgendaJour({ date: d, ancre: e.currentTarget as HTMLElement }); }}
                      className={`rounded-lg border p-1 min-h-[58px] md:min-h-[74px] text-left flex flex-col transition ${
                        chome
                          ? 'bg-slate-100 dark:bg-white/[0.05] border-transparent'
                          : `border-bony-border ${abs.length ? 'hover:border-bony-orange cursor-pointer' : 'cursor-default'}`
                      } ${aujourdhui ? 'ring-1 ring-bony-orange' : ''}`}
                      title={ferie ?? undefined}
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <span className={`text-[11px] font-bold ${ferie ? 'text-bony-orange' : chome ? 'text-bony-muted' : 'text-bony-text'}`}>
                          {Number(d.slice(8))}
                        </span>
                        {abs.length > 0 && (
                          <span className={`text-[9px] font-bold tabular-nums ${abs.length >= 4 ? 'text-red-500' : 'text-bony-orange'}`}>
                            {abs.length}
                          </span>
                        )}
                      </div>
                      {ferie && <span className="block text-[8px] leading-tight text-bony-orange truncate">{ferie}</span>}

                      {/* Au-dessus de `md` on montre QUI ; en dessous, une pastille par
                          absent — un avatar de 16 px au doigt n'est pas identifiable. */}
                      <div className="hidden md:flex flex-wrap gap-0.5 mt-auto pt-1">
                        {abs.slice(0, 4).map(({ ligne, conge }) => (
                          <span
                            key={ligne.id}
                            className="rounded-full"
                            style={{ boxShadow: `0 0 0 1.5px ${CONGES_TYPES[conge!.type]?.couleur ?? '#94a3b8'}` }}
                            title={`${ligne.user!.name} — ${CONGES_TYPES[conge!.type]?.label ?? conge!.type}${conge!.demi ? ` (${CONGES_DEMI[conge!.demi].court})` : ''}`}
                          >
                            <Avatar userId={ligne.user!.id} name={ligne.user!.name} color={ligne.user!.avatarColor} size={16} />
                          </span>
                        ))}
                        {abs.length > 4 && (
                          <span className="text-[9px] font-bold text-bony-muted self-center ml-0.5">+{abs.length - 4}</span>
                        )}
                      </div>
                      <div className="md:hidden flex flex-wrap gap-0.5 mt-auto pt-1">
                        {abs.slice(0, 8).map(({ ligne, conge }) => (
                          <span
                            key={ligne.id}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: CONGES_TYPES[conge!.type]?.couleur ?? '#94a3b8' }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );

  // ── TABLEAU DE BORD ───────────────────────────────────────────────

  const dashboard = (() => {
    // ⚠️ Tout se compte sur la PÉRIODE DE RÉFÉRENCE (juin → mai), pas sur l'année civile.
    const moisPeriode = moisDeLaPeriode(periode);
    const totaux = lignes.map(l => ({
      ...l,
      total: totalPeriode(l.id),
      cp: totalPeriode(l.id, congeDecompteSolde),
      droit: droitDe(l.id),
    }));
    const grand = totaux.reduce((a, b) => a + b.total, 0);
    const parMois = moisPeriode.map(([a, m]) => lignes.reduce((t, l) => t + totalMoisDe(l.id, a, m), 0));
    const maxMois = Math.max(...parMois, 0);
    const iMoisChargé = parMois.indexOf(maxMois);

    // Pic d'absences simultanées sur la période, jours chômés exclus.
    const { debut: bDebut, fin: bFin } = bornesPeriodeConges(periode);
    let pic = 0; let picDate = '';
    const parJour = new Map<string, number>();
    for (const j of jours) {
      if (j.date < bDebut || j.date > bFin) continue;
      if (estChome(j.date) || !membres.includes(j.userId)) continue;
      const n = (parJour.get(j.date) ?? 0) + 1;
      parJour.set(j.date, n);
      if (n > pic) { pic = n; picDate = j.date; }
    }
    const pics = [...parJour.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxTotal = Math.max(...totaux.map(t => t.total), 1);

    const kpi = (label: string, valeur: string, indice: string, couleur: string) => (
      <div className="gx-glass-panel rounded-xl border border-bony-border p-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-bony-muted">{label}</div>
        <div className="text-2xl font-bold mt-1" style={{ color: couleur }}>{valeur}</div>
        <div className="text-[11px] text-bony-muted mt-0.5">{indice}</div>
      </div>
    );

    return (
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 md:px-6 pb-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPeriode(periode - 1)}
              className="w-9 h-9 rounded-lg border border-bony-border flex items-center justify-center text-slate-500 hover:text-bony-orange hover:border-bony-orange transition"
            >
              <ChevronLeft size={15} />
            </button>
            <div className="font-title text-xs text-bony-text min-w-[150px] text-center">{libellePeriodeConges(periode)}</div>
            <button
              onClick={() => setPeriode(periode + 1)}
              className="w-9 h-9 rounded-lg border border-bony-border flex items-center justify-center text-slate-500 hover:text-bony-orange hover:border-bony-orange transition"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          {legende}
        </div>

        {/* ⚠️ La période de référence n'est PAS l'année civile : art. L3141-3, les congés
            payés s'acquièrent du 1er juin au 31 mai, à défaut d'accord d'entreprise. Le
            fichier Excel d'origine comptait par année civile — ses totaux et ceux-ci ne
            se recoupent donc pas à l'identique, ce n'est pas une erreur de reprise. */}
        <p className="text-[10px] text-bony-muted -mt-1">
          Période de référence légale : du 1<sup>er</sup> juin {periode} au 31 mai {periode + 1}.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpi('Jours posés', fmtJours(grand), `sur ${lignes.length} collaborateur${lignes.length > 1 ? 's' : ''}`, '#3b82f6')}
          {kpi('Moyenne / personne', lignes.length ? fmtJours(Math.round((grand / lignes.length) * 10) / 10) : '0', 'jours sur la période', '#10b981')}
          {kpi('Mois le plus chargé', maxMois > 0 ? MOIS_FR[moisPeriode[iMoisChargé][1]] : '—', maxMois > 0 ? `${fmtJours(maxMois)} jours posés` : 'aucun congé', '#f59e0b')}
          {kpi('Pic d’absences', pic ? String(pic) : '—', pic ? `le ${new Date(`${picDate}T00:00:00`).toLocaleDateString('fr-FR')}` : 'aucun congé', '#f43f5e')}
        </div>

        {/* ── SOLDE DE CONGÉS PAYÉS ────────────────────────────────────────
            ⚠️ Seuls les CP décomptent (`congeDecompteSolde`). RTT, heures de récup,
            congé sans solde et congé révision sont suivis mais relèvent d'autres
            compteurs, qui ne sont pas dans Gearbox. */}
        <div className="gx-glass-panel rounded-xl border border-bony-border p-4">
          <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
            <div className="text-[10px] font-bold uppercase tracking-wider text-bony-muted">Solde de congés payés</div>
            <div className="text-[10px] text-bony-muted">
              {CONGES_DROIT_DEFAUT} jours ouvrés par défaut{gestionnaire ? ' · modifiable au crayon' : ''}
            </div>
          </div>
          <div className="space-y-1.5">
            {totaux.length === 0 && <p className="text-[11px] text-bony-muted italic">Aucun participant.</p>}
            {[...totaux].sort((a, b) => (a.droit - a.cp) - (b.droit - b.cp)).map(t => {
              const restant = Math.round((t.droit - t.cp) * 10) / 10;
              const part = t.droit > 0 ? Math.min((t.cp / t.droit) * 100, 100) : 0;
              const edition = editDroit?.userId === t.id;
              return (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="w-28 md:w-36 flex items-center gap-1.5 shrink-0 min-w-0">
                    <Avatar userId={t.user!.id} name={t.user!.name} color={t.user!.avatarColor} size={20} />
                    <span className="text-[11px] text-bony-text truncate">{t.user!.name}</span>
                  </div>
                  <div className="flex-1 h-4 bg-black/5 dark:bg-white/5 rounded overflow-hidden min-w-0">
                    <div
                      className="h-full rounded transition-all"
                      style={{ width: `${part}%`, backgroundColor: restant < 0 ? '#ef4444' : restant <= 3 ? '#f59e0b' : '#3b82f6' }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-bony-muted shrink-0 w-[110px] text-right">
                    <strong className="text-bony-text">{fmtJours(t.cp)}</strong> / {fmtJours(t.droit)} ·{' '}
                    <span className={restant < 0 ? 'text-red-500 font-bold' : ''}>{fmtJours(restant)} rest.</span>
                  </span>
                  {gestionnaire && (
                    edition ? (
                      <input
                        autoFocus
                        value={editDroit!.valeur}
                        onChange={e => setEditDroit({ userId: t.id, valeur: e.target.value })}
                        onBlur={() => {
                          const v = Number(editDroit!.valeur.replace(',', '.'));
                          setEditDroit(null);
                          if (Number.isFinite(v) && v >= 0 && v !== t.droit) poserDroit(t.id, v);
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') setEditDroit(null); }}
                        className="w-14 shrink-0 px-1.5 py-1 rounded-lg border border-bony-orange bg-transparent text-[11px] text-bony-text text-right"
                      />
                    ) : (
                      <button
                        onClick={() => setEditDroit({ userId: t.id, valeur: String(t.droit) })}
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-bony-orange hover:bg-bony-orange/10 transition"
                        title="Modifier le droit à congés payés de cette période"
                      >
                        <Pencil size={12} />
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="gx-glass-panel rounded-xl border border-bony-border p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-bony-muted mb-3">Répartition mensuelle</div>
          <div className="flex items-end gap-1.5 h-32">
            {parMois.map((v, i) => {
              const [a, m] = moisPeriode[i];
              return (
                <button
                  key={`${a}-${m}`}
                  onClick={() => { setAnnee(a); setMois(m); setOnglet('planning'); }}
                  className="flex-1 flex flex-col items-center justify-end gap-1 h-full group"
                  title={`${MOIS_FR[m]} ${a} : ${fmtJours(v)} jours`}
                >
                  <span className="text-[9px] font-bold text-bony-muted">{v ? fmtJours(v) : ''}</span>
                  <div
                    className="w-full rounded-t transition-all group-hover:opacity-80"
                    style={{ height: `${maxMois ? Math.max((v / maxMois) * 100, v ? 3 : 0) : 0}%`, backgroundColor: i === iMoisChargé && v > 0 ? '#f59e0b' : '#3b82f6', minHeight: v ? 3 : 0 }}
                  />
                  <span className="text-[9px] text-bony-muted">{MOIS_COURT[m]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="gx-glass-panel rounded-xl border border-bony-border p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-bony-muted mb-3">Jours posés par collaborateur</div>
            <div className="space-y-2">
              {[...totaux].sort((a, b) => b.total - a.total).map(t => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="w-24 text-[11px] text-bony-text truncate text-right shrink-0">{t.user!.name}</span>
                  <div className="flex-1 h-4 bg-black/5 dark:bg-white/5 rounded overflow-hidden">
                    <div className="h-full rounded bg-bony-gradient" style={{ width: `${(t.total / maxTotal) * 100}%` }} />
                  </div>
                  <span className="w-9 text-[11px] font-bold text-bony-muted tabular-nums text-right shrink-0">{fmtJours(t.total)}</span>
                </div>
              ))}
              {totaux.length === 0 && <p className="text-[11px] text-bony-muted italic">Aucun participant.</p>}
            </div>
          </div>

          <div className="gx-glass-panel rounded-xl border border-bony-border p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-bony-muted mb-3">Journées les plus chargées</div>
            <div className="space-y-1.5">
              {pics.length === 0 && <p className="text-[11px] text-bony-muted italic">Aucune journée à 3 absents ou plus.</p>}
              {pics.map(([d, n]) => (
                <div key={d} className="flex items-center justify-between bg-black/[0.03] dark:bg-white/[0.03] rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-bony-text">
                      {new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <div className="text-[10px] text-bony-muted truncate">
                      {lignes.filter(l => congeDe(l.id, d)).map(l => l.user!.name).join(', ')}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-bony-orange shrink-0 ml-2">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  })();

  // ── PANNEAU D'UNE CELLULE ─────────────────────────────────────────

  const panneauCellule = cellule && (() => {
    const actuel = congeDe(cellule.userId, cellule.date);
    const nom = users.find(u => u.id === cellule.userId)?.name ?? '';
    return (
      <FloatingPanel
        open
        onClose={() => setCellule(null)}
        triggerRef={{ current: cellule.ancre }}
        width={250}
        maxHeight={440}
        className="rounded-2xl p-2"
      >
        <div className="flex flex-col gap-1">
          <div className="px-2 pb-1">
            <div className="text-[11px] font-bold text-bony-text">{nom}</div>
            <div className="text-[10px] text-bony-muted">
              {new Date(`${cellule.date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          {Object.entries(CONGES_TYPES).map(([id, t]) => (
            <button
              key={id}
              disabled={enregistrement}
              // ⚠️ On conserve la demi-journée déjà posée en changeant de famille : passer
              // d'un « CP après-midi » à un « RTT » ne doit pas le transformer en jour
              // entier dans le dos de qui clique.
              onClick={() => poser(cellule.userId, cellule.date, id as CongeType, actuel?.demi ?? null)}
              className={`flex items-center gap-2 px-2 min-h-[40px] rounded-xl text-left text-xs transition disabled:opacity-50 ${actuel?.type === id ? 'bg-bony-orange/10 text-bony-orange font-bold' : 'text-bony-text hover:bg-black/5 dark:hover:bg-white/5'}`}
            >
              <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: t.couleur }} />
              {t.label}
              {actuel?.type === id && <Check size={13} className="ml-auto" />}
            </button>
          ))}
          {actuel && (
            <>
              {/* ⚠️ La demi-journée s'applique à TOUTES les familles depuis le correctif 55
                  (demande de Théo : heures de récup matin / après-midi). Elle n'est plus
                  encodée dans le type, elle est un choix à part. */}
              <div className="flex gap-1 px-2 pt-1.5 mt-0.5 border-t border-bony-border">
                {([[null, 'Journée'], ['AM', CONGES_DEMI.AM.label], ['PM', CONGES_DEMI.PM.label]] as const).map(([d, label]) => (
                  <button
                    key={label}
                    disabled={enregistrement}
                    onClick={() => poser(cellule.userId, cellule.date, actuel.type, d as CongeDemi)}
                    className={`flex-1 min-h-[34px] rounded-lg text-[10px] font-bold transition disabled:opacity-50 ${
                      (actuel.demi ?? null) === d
                        ? 'bg-bony-orange text-white'
                        : 'border border-bony-border text-bony-muted hover:text-bony-orange hover:border-bony-orange'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* ⚠️ Le ✓ n'apparaît que pour Master et Director — Administrator en est
                  exclu par décision de Théo. Le serveur refuse de toute façon en 403,
                  mais un bouton qui échoue, c'est « l'interface ment ». */}
              {validateur && (
                <button
                  disabled={enregistrement}
                  onClick={() => basculerValidation(cellule.userId, cellule.date, !actuel.validated)}
                  className="flex items-center gap-2 px-2 min-h-[40px] rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-50"
                >
                  <Check size={14} /> {actuel.validated ? 'Retirer la validation' : 'Valider ✓'}
                </button>
              )}
              <button
                disabled={enregistrement}
                onClick={() => poser(cellule.userId, cellule.date, null)}
                className="flex items-center gap-2 px-2 min-h-[40px] rounded-xl text-xs text-red-500 hover:bg-red-500/10 transition disabled:opacity-50"
              >
                <Trash2 size={13} /> Retirer ce congé
              </button>
            </>
          )}
        </div>
      </FloatingPanel>
    );
  })();

  // ── PANNEAU D'UNE JOURNÉE D'AGENDA (lecture) ──────────────────────
  //
  // Volontairement en LECTURE : la case d'agenda mêle tout le monde, un clic n'y désigne
  // pas une personne. La saisie reste dans le planning, où la ligne est explicite.

  const panneauJour = agendaJour && (() => {
    const abs = absentsDu(agendaJour.date);
    const ferie = ferieDe(agendaJour.date);
    return (
      <FloatingPanel
        open
        onClose={() => setAgendaJour(null)}
        triggerRef={{ current: agendaJour.ancre }}
        width={260}
        maxHeight={320}
        className="rounded-2xl p-2"
      >
        <div className="px-2 pb-1.5">
          <div className="text-[11px] font-bold text-bony-text">
            {new Date(`${agendaJour.date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div className="text-[10px] text-bony-muted">
            {ferie ? `${ferie} · ` : ''}{abs.length} absent{abs.length > 1 ? 's' : ''} sur {lignes.length}
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          {abs.map(({ ligne, conge }) => {
            const t = CONGES_TYPES[conge!.type];
            return (
              <div key={ligne.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5">
                <Avatar userId={ligne.user!.id} name={ligne.user!.name} color={ligne.user!.avatarColor} size={22} />
                <span className="text-xs text-bony-text truncate flex-1">{ligne.user!.name}</span>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: `${t?.couleur ?? '#94a3b8'}22`, color: t?.couleur ?? '#94a3b8' }}
                >
                  {t?.court ?? conge!.type}{conge!.demi ? ` ${CONGES_DEMI[conge!.demi].court}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </FloatingPanel>
    );
  })();

  return (
    <div className="h-full flex flex-col">
      {enTete}
      {chargement ? (
        <div className="flex-1 flex items-center justify-center text-sm text-bony-muted">Chargement…</div>
      ) : onglet === 'planning' ? planning : onglet === 'agenda' ? agenda : dashboard}
      {panneauCellule}
      {panneauJour}
      {showParticipants && (
        <ModaleParticipants
          users={users}
          membres={membres}
          onClose={() => setShowParticipants(false)}
          onChange={charger}
        />
      )}
      {showPeriode && (
        <ModalePeriode
          lignes={lignes}
          moiDefaut={user?.id ?? ''}
          peutEcrirePour={peutEcrirePour}
          onClose={() => setShowPeriode(false)}
          onFait={charger}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// PARTICIPANTS — le périmètre de la rubrique (Master / Administrator / Director).
// ═══════════════════════════════════════════════════════════════════════════

const ModaleParticipants: React.FC<{
  users: User[];
  membres: string[];
  onClose: () => void;
  onChange: () => Promise<void> | void;
}> = ({ users, membres, onClose, onChange }) => {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  /**
   * ⚠️ On ne propose QUE les rôles qui ont accès à la rubrique. Ajouter un chef de site
   * créerait une ligne de planning que son propre rôle lui interdit de lire — le serveur
   * refuse d'ailleurs en 400, autant ne pas le proposer.
   */
  const eligibles = useMemo(() => users
    .filter(u => CONGES_LECTURE_ROLES.includes(u.role))
    .filter(u => !recherche.trim() || u.name.toLowerCase().includes(recherche.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)),
    [users, recherche]);

  const basculer = async (u: User, dedans: boolean) => {
    if (dedans && !window.confirm(`Retirer ${u.name} du planning ?\n\nSes congés déjà posés sont CONSERVÉS : il suffit de le rajouter pour les revoir.`)) return;
    setEnCours(u.id);
    try {
      if (dedans) await db.retirerMembreConges(u.id);
      else await db.ajouterMembreConges(u.id);
      await onChange();
    } catch (e) {
      console.error('Congés : périmètre non modifié', e);
      alert(e instanceof ApiError ? e.message : 'Modification impossible.');
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-md shadow-glass-lg overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-bony-border shrink-0">
          <div>
            <h3 className="font-title text-sm text-bony-text">Participants</h3>
            <p className="text-[10px] text-bony-muted mt-0.5">Qui apparaît dans le planning des congés.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-bony-text"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 shrink-0">
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher…"
            className="w-full bg-[var(--bg-input)] border border-bony-border rounded-xl px-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange/60"
          />
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-1">
          {eligibles.map(u => {
            const dedans = membres.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => basculer(u, dedans)}
                disabled={enCours === u.id}
                className="w-full flex items-center gap-3 px-2 min-h-[48px] rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition disabled:opacity-50"
              >
                <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={28} />
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-xs text-bony-text truncate">{u.name}</div>
                  <div className="text-[10px] text-bony-muted">{u.role}</div>
                </div>
                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${dedans ? 'bg-bony-orange border-bony-orange' : 'border-bony-border'}`}>
                  {dedans && <Check size={12} className="text-white" />}
                </span>
              </button>
            );
          })}
          {eligibles.length === 0 && <p className="text-[11px] text-bony-muted italic px-2 py-4 text-center">Aucun compte éligible.</p>}
        </div>
        <div className="px-5 py-3 border-t border-bony-border shrink-0">
          <p className="text-[10px] text-bony-muted">
            Retirer quelqu'un ne supprime pas ses congés : il disparaît du planning, ses jours restent enregistrés.
          </p>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// POSER UNE PÉRIODE — évite 15 clics pour trois semaines.
// ═══════════════════════════════════════════════════════════════════════════

const ModalePeriode: React.FC<{
  lignes: { id: string; user?: User }[];
  moiDefaut: string;
  peutEcrirePour: (userId: string) => boolean;
  onClose: () => void;
  onFait: () => Promise<void> | void;
}> = ({ lignes, moiDefaut, peutEcrirePour, onClose, onFait }) => {
  const cibles = lignes.filter(l => peutEcrirePour(l.id));
  const [userId, setUserId] = useState(cibles.some(c => c.id === moiDefaut) ? moiDefaut : (cibles[0]?.id ?? ''));
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [type, setType] = useState<CongeType>('CP');
  const [enCours, setEnCours] = useState(false);

  /** ⚠️ Les jours chômés sont retirés ICI : le serveur ne connaît pas le calendrier. */
  const ouvres = useMemo(() => (debut && fin && debut <= fin ? joursOuvres(debut, fin) : []), [debut, fin]);

  const poser = async () => {
    if (!userId || ouvres.length === 0) return;
    setEnCours(true);
    try {
      await db.setCongePeriode(userId, ouvres, type);
      await onFait();
      onClose();
    } catch (e) {
      console.error('Congés : période non posée', e);
      alert(e instanceof ApiError ? e.message : 'Enregistrement impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !enCours && onClose()}>
      <div className="glass-strong rounded-2xl w-full max-w-md shadow-glass-lg overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-bony-border shrink-0">
          <h3 className="font-title text-sm text-bony-text">Poser une période</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-bony-text"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {cibles.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-bony-muted">Collaborateur</label>
              <Select
                value={userId}
                onChange={setUserId}
                options={cibles.map(c => ({ value: c.id, label: c.user?.name ?? c.id }))}
                size="md"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-bony-muted">Du</label>
              {/* ⚠️ Choisir le début aligne la fin dessus tant qu'elle est vide ou
                  antérieure. Sans ça, le calendrier « Au » s'ouvre sur le MOIS COURANT :
                  poser des congés de juillet depuis septembre demandait de reculer de
                  deux mois à la main, à chaque saisie. Constaté en recette. */}
              <DatePicker
                value={debut}
                onChange={v => { setDebut(v); if (!fin || fin < v) setFin(v); }}
                size="md"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-bony-muted">Au</label>
              <DatePicker value={fin} onChange={setFin} size="md" minDate={debut || undefined} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-bony-muted">Type</label>
            <Select
              value={type}
              onChange={v => setType(v as CongeType)}
              options={Object.entries(CONGES_TYPES).map(([id, t]) => ({ value: id, label: t.label }))}
              size="md"
            />
          </div>
          <p className="text-[11px] text-bony-muted">
            {ouvres.length > 0
              ? <><strong className="text-bony-text">{ouvres.length} jour{ouvres.length > 1 ? 's' : ''} ouvré{ouvres.length > 1 ? 's' : ''}</strong> seront posés. Week-ends et jours fériés sont automatiquement ignorés.</>
              : 'Choisissez une date de début et une date de fin.'}
          </p>
        </div>
        <div className="px-5 py-3 border-t border-bony-border flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-bony-text">Annuler</button>
          <button
            onClick={poser}
            disabled={enCours || ouvres.length === 0}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-bony-gradient text-white disabled:opacity-40 hover:opacity-90 transition"
          >
            {enCours ? 'Enregistrement…' : 'Poser'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Conges;
