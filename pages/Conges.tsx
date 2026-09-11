import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSessionState } from '../hooks/useSessionState';
import { useAuth } from '../contexts/AuthContext';
import { db, ApiError } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { congesAccesStore } from '../services/congesAcces';
import { CongeJour, CongeType, User } from '../types';
import {
  CONGES_TYPES, valeurJourConge, peutGererConges, peutValiderConges, CONGES_LECTURE_ROLES,
} from '../constants';
import { estChome, ferieDe, estWeekend, joursOuvres } from '../lib/joursFeries';
import Avatar from '../components/Avatar';
import FloatingPanel from '../components/FloatingPanel';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';
import {
  ChevronLeft, ChevronRight, Users, X, Check, Plus, CalendarDays, LayoutDashboard, Trash2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// CONGÉS — portage du fichier HTML tenu par le boss de Théo (12/09/2026).
//
// Deux vues, comme la maquette : un PLANNING cliquable (lignes = personnes, colonnes =
// jours du mois) et un TABLEAU DE BORD annuel.
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

const Conges: React.FC = () => {
  const { user } = useAuth();
  const [onglet, setOnglet] = useSessionState<'planning' | 'dashboard'>('conges_onglet', 'planning');
  const [annee, setAnnee] = useSessionState<number>('conges_annee', new Date().getFullYear());
  const [mois, setMois] = useSessionState<number>('conges_mois', new Date().getMonth());

  const [jours, setJours] = useState<CongeJour[]>([]);
  const [membres, setMembres] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);

  const [showParticipants, setShowParticipants] = useState(false);
  const [showPeriode, setShowPeriode] = useState(false);
  /** Cellule ouverte : la personne, le jour, et l'élément qui sert d'ancre au panneau. */
  const [cellule, setCellule] = useState<{ userId: string; date: string; ancre: HTMLElement } | null>(null);

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
   * ⚠️ On charge l'ANNÉE ENTIÈRE d'un coup, pas le mois affiché : le tableau de bord est
   * annuel, et changer de mois ne doit pas relancer une requête. Le volume le permet
   * largement (quelques centaines de lignes par an).
   */
  const charger = useCallback(async () => {
    try {
      const [data, liste] = await Promise.all([
        db.getConges(`${annee}-01-01`, `${annee}-12-31`),
        db.getUsers().catch(() => [] as User[]),
      ]);
      setJours(data.jours);
      setMembres(data.membres);
      setUsers(liste);
      congesAccesStore.set(data.membres, user?.role, user?.id);
    } catch (e) {
      console.error('Congés : chargement échoué', e);
    } finally {
      setChargement(false);
    }
  }, [annee, user?.id, user?.role]);

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

  /** Total d'une personne sur un mois, demi-journées comprises. Jours chômés exclus. */
  const totalMois = useCallback((userId: string, m: number) =>
    joursDuMois(annee, m).reduce((t, d) => t + (estChome(d) ? 0 : valeurJourConge(congeDe(userId, d)?.type)), 0),
    [annee, congeDe]);

  const totalAnnuel = useCallback((userId: string) =>
    Array.from({ length: 12 }, (_, m) => totalMois(userId, m)).reduce((a, b) => a + b, 0),
    [totalMois]);

  // ─────────────────────────── ÉCRITURES ───────────────────────────

  const poser = async (userId: string, date: string, type: CongeType | null) => {
    setEnregistrement(true);
    try {
      await db.setCongeJour(userId, date, type);
      await charger();
      setCellule(null);
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

  // ─────────────────────────── RENDU ───────────────────────────

  const badge = (c: CongeJour | null) => {
    if (!c) return null;
    const t = CONGES_TYPES[c.type];
    if (!t) return null;
    return (
      <span
        className="block w-full h-full rounded flex items-center justify-center text-[9px] font-bold"
        style={{
          // ⚠️ Deux teintes par type, comme la maquette : plein = validé, pâle = en
          // attente. C'est toute la lecture du planning d'un coup d'œil.
          backgroundColor: c.validated ? t.couleur : `${t.couleur}33`,
          color: c.validated ? '#fff' : t.couleur,
          border: `1px solid ${c.validated ? t.couleur : `${t.couleur}66`}`,
        }}
        title={`${t.label}${c.validated ? ' — validé' : ' — en attente'}`}
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
            {lignes.length} collaborateur{lignes.length > 1 ? 's' : ''} · année {annee}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-100 dark:bg-black/30 rounded-lg p-1 border border-bony-border">
            {([['planning', 'Planning', CalendarDays], ['dashboard', 'Tableau de bord', LayoutDashboard]] as const).map(([id, label, Icone]) => (
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
            <table className="border-collapse" style={{ minWidth: `${220 + datesDuMois.length * 34 + 60}px` }}>
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
                        className={`sticky top-0 z-20 border-b border-bony-border px-0 py-1 text-center w-[34px] ${chome ? 'bg-slate-100 dark:bg-white/[0.06]' : 'bg-white dark:bg-bony-panel'}`}
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
                      return (
                        <td
                          key={d}
                          onClick={e => { if (modifiable) setCellule({ userId: id, date: d, ancre: e.currentTarget as HTMLElement }); }}
                          className={`border-b border-bony-border p-0.5 h-9 ${chome ? 'bg-slate-100 dark:bg-white/[0.06]' : modifiable ? 'cursor-pointer hover:bg-bony-orange/10' : ''}`}
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
                            {Number(d.slice(8))} {MOIS_COURT[mois]} · {t.court}
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

  // ── TABLEAU DE BORD ───────────────────────────────────────────────

  const dashboard = (() => {
    const totaux = lignes.map(l => ({ ...l, total: totalAnnuel(l.id) }));
    const grand = totaux.reduce((a, b) => a + b.total, 0);
    const parMois = Array.from({ length: 12 }, (_, m) => lignes.reduce((t, l) => t + totalMois(l.id, m), 0));
    const maxMois = Math.max(...parMois, 0);
    const moisChargé = parMois.indexOf(maxMois);

    // Pic d'absences simultanées sur l'année, jours chômés exclus.
    let pic = 0; let picDate = '';
    const parJour = new Map<string, number>();
    for (const j of jours) {
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
        <div className="flex items-center gap-2">
          <Select
            value={String(annee)}
            onChange={v => setAnnee(Number(v))}
            options={[annee - 1, annee, annee + 1].map(a => ({ value: String(a), label: String(a) }))}
            size="sm"
          />
          {legende}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpi('Jours posés', fmtJours(grand), `sur ${lignes.length} collaborateur${lignes.length > 1 ? 's' : ''}`, '#3b82f6')}
          {kpi('Moyenne / personne', lignes.length ? fmtJours(Math.round((grand / lignes.length) * 10) / 10) : '0', `jours en ${annee}`, '#10b981')}
          {kpi('Mois le plus chargé', maxMois > 0 ? MOIS_FR[moisChargé] : '—', maxMois > 0 ? `${fmtJours(maxMois)} jours posés` : 'aucun congé', '#f59e0b')}
          {kpi('Pic d’absences', pic ? String(pic) : '—', pic ? `le ${new Date(`${picDate}T00:00:00`).toLocaleDateString('fr-FR')}` : 'aucun congé', '#f43f5e')}
        </div>

        <div className="gx-glass-panel rounded-xl border border-bony-border p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-bony-muted mb-3">Répartition mensuelle</div>
          <div className="flex items-end gap-1.5 h-32">
            {parMois.map((v, m) => (
              <button
                key={m}
                onClick={() => { setMois(m); setOnglet('planning'); }}
                className="flex-1 flex flex-col items-center justify-end gap-1 h-full group"
                title={`${MOIS_FR[m]} : ${fmtJours(v)} jours`}
              >
                <span className="text-[9px] font-bold text-bony-muted">{v ? fmtJours(v) : ''}</span>
                <div
                  className="w-full rounded-t transition-all group-hover:opacity-80"
                  style={{ height: `${maxMois ? Math.max((v / maxMois) * 100, v ? 3 : 0) : 0}%`, backgroundColor: m === moisChargé && v > 0 ? '#f59e0b' : '#3b82f6', minHeight: v ? 3 : 0 }}
                />
                <span className="text-[9px] text-bony-muted">{MOIS_COURT[m]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="gx-glass-panel rounded-xl border border-bony-border p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-bony-muted mb-3">Total par collaborateur</div>
            <div className="space-y-2">
              {totaux.sort((a, b) => b.total - a.total).map(t => (
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
                      {new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
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
        maxHeight={330}
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
              onClick={() => poser(cellule.userId, cellule.date, id as CongeType)}
              className={`flex items-center gap-2 px-2 min-h-[40px] rounded-xl text-left text-xs transition disabled:opacity-50 ${actuel?.type === id ? 'bg-bony-orange/10 text-bony-orange font-bold' : 'text-bony-text hover:bg-black/5 dark:hover:bg-white/5'}`}
            >
              <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: t.couleur }} />
              {t.label}
              {actuel?.type === id && <Check size={13} className="ml-auto" />}
            </button>
          ))}
          {actuel && (
            <>
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

  return (
    <div className="h-full flex flex-col">
      {enTete}
      {chargement ? (
        <div className="flex-1 flex items-center justify-center text-sm text-bony-muted">Chargement…</div>
      ) : onglet === 'planning' ? planning : dashboard}
      {panneauCellule}
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
