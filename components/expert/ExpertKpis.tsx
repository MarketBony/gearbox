import React, { useMemo, useState } from 'react';
import { AlertTriangle, UserX, CalendarOff, Users, Coins, TrendingUp, ChevronRight, Check } from 'lucide-react';
import { Project, Task, User } from '../../types';
import Avatar from '../Avatar';

/**
 * Onglet PILOTAGE du mode Expert — refait le 27/08/2026 après le rejet de la première
 * version par Théo, testée sur le vrai projet « Forum Pièces 2026 ».
 *
 * ⚠️ CE QUI A ÉTÉ RETIRÉ, ET POURQUOI — ne pas le réintroduire sans lui redemander :
 *  - « Avancement réel » (97 % pondéré vs 53 % à l'unité) : « je comprends pas ton truc,
 *    c'est beaucoup trop complexe ». Deux pourcentages abstraits et trois lignes
 *    d'explication, c'est un raisonnement d'analyste, pas un tableau de bord. Et
 *    l'avancement est DÉJÀ affiché plus haut dans le projet (« Avancement Tâches »).
 *  - « Charge par personne » limitée aux tâches restantes : affichait « Théo 8 tâches /
 *    0 € » parce que sur ce projet le restant ne coûte rien. Des barres vides.
 *
 * ⚠️ Un bloc de pilotage doit faire AGIR, pas seulement compter. « À traiter » est donc
 * entièrement CLIQUABLE : chaque ligne ouvre la tâche pour la corriger sur place.
 *
 * ⚠️ Toujours pas de burndown ni de vélocité : il n'existe AUCUN historique de
 * changement de statut (`Task.updatedAt` bouge à chaque modification, pas au passage en
 * « Terminé »). Une courbe bâtie dessus serait fausse.
 *
 * ⚠️ Aucun de ces chiffres n'entre dans un budget ni une agrégation. Rien à voir avec le
 * routage budgétaire de `constants.ts`.
 */

// Une tâche « Vierge » n'a jamais été engagée : ni faite, ni à faire. Même traitement
// que la To-do, qui l'exclut de ses colonnes.
const EST_ACTIVE = (t: Task) => t.status !== 'Empty';
const EST_FINIE = (t: Task) => t.status === 'Done' || t.status === 'Programmed';

const aujourdhui = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const euros = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

const Bloc: React.FC<{ titre: string; icone: React.ReactNode; children: React.ReactNode }> = ({ titre, icone, children }) => (
  <div className="gx-card p-4 flex flex-col gap-3">
    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
      {icone} {titre}
    </h4>
    {children}
  </div>
);

/** Une catégorie de « À traiter » : un compteur qui déplie sa liste. */
const Categorie: React.FC<{
  taches: Task[];
  libelle: string;
  icone: React.ReactNode;
  ton: 'alerte' | 'attention' | 'neutre';
  ouvert: boolean;
  onToggle: () => void;
  onOuvrirTache: (id: string) => void;
  detail?: (t: Task) => string;
}> = ({ taches, libelle, icone, ton, ouvert, onToggle, onOuvrirTache, detail }) => {
  const couleur = ton === 'alerte' ? 'text-red-500' : ton === 'attention' ? 'text-bony-orange' : 'text-bony-text';
  const vide = taches.length === 0;

  return (
    <div className={`rounded-xl border transition-colors ${vide ? 'border-bony-border/50' : 'border-bony-border'}`}>
      <button
        onClick={onToggle}
        disabled={vide}
        className={`w-full px-3 py-2 flex items-center gap-2.5 text-left transition-colors ${
          vide ? 'cursor-default' : 'hover:bg-[var(--text-main)]/[0.04]'
        }`}
      >
        <span className={vide ? 'text-green-500' : couleur}>{vide ? <Check size={14} /> : icone}</span>
        <span className={`font-title text-xl leading-none ${vide ? 'text-green-500' : couleur}`}>{taches.length}</span>
        <span className="text-[11px] text-slate-500 leading-tight flex-1 min-w-0">{libelle}</span>
        {!vide && (
          <ChevronRight size={14} className={`text-slate-400 shrink-0 transition-transform ${ouvert ? 'rotate-90' : ''}`} />
        )}
      </button>

      {ouvert && !vide && (
        <div className="px-2 pb-2 space-y-0.5">
          {taches.map(t => (
            <button
              key={t.id}
              onClick={() => onOuvrirTache(t.id)}
              title="Ouvrir la tâche pour la corriger"
              className="w-full px-2 py-1.5 rounded-lg flex items-center gap-2 text-left hover:bg-[var(--text-main)]/[0.06] transition-colors group"
            >
              <span className="text-[11px] text-bony-text truncate flex-1 min-w-0">{t.name || 'Sans nom'}</span>
              {detail && <span className={`text-[10px] shrink-0 ${couleur}`}>{detail(t)}</span>}
              <ChevronRight size={12} className="text-slate-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface Props {
  projet: Project;
  users: User[];
  onOuvrirTache: (taskId: string) => void;
}

const ExpertKpis: React.FC<Props> = ({ projet, users, onOuvrirTache }) => {
  const [deplie, setDeplie] = useState<string | null>(null);

  const k = useMemo(() => {
    const taches = projet.tasks.filter(EST_ACTIVE);
    const today = aujourdhui();
    const restantes = taches.filter(t => !EST_FINIE(t));

    // --- À TRAITER : uniquement ce qui RESTE à faire, sinon rien n'est actionnable ---
    const enRetard = restantes.filter(t => t.deadline && t.deadline < today);
    const nonAssignees = restantes.filter(t => !t.assignedUserId);
    const sansDate = restantes.filter(t => !t.deadline);

    // --- QUI FAIT QUOI : TOUTES les tâches de chacun, faites comprises ---------------
    // C'est le correctif du défaut signalé : la version précédente ne comptait que le
    // restant et affichait « 0 € » dès que les tâches restantes étaient gratuites.
    const parPersonne = new Map<string, { total: number; faites: number; euros: number; retard: number }>();
    for (const t of taches) {
      const cle = t.assignedUserId || '';
      const e = parPersonne.get(cle) || { total: 0, faites: 0, euros: 0, retard: 0 };
      e.total += 1;
      if (EST_FINIE(t)) e.faites += 1;
      e.euros += t.cost || 0;
      if (!EST_FINIE(t) && t.deadline && t.deadline < today) e.retard += 1;
      parPersonne.set(cle, e);
    }
    const equipe = [...parPersonne.entries()]
      .map(([userId, v]) => ({ userId, ...v, user: users.find(u => u.id === userId) }))
      // Non-assignées toujours en dernier, jamais masquées : c'est le trou de pilotage.
      .sort((a, b) => (a.userId === '' ? 1 : b.userId === '' ? -1 : b.total - a.total || b.euros - a.euros));

    // --- OÙ PART L'ARGENT : inchangé, le seul bloc que Théo n'a pas critiqué ---------
    const budgetTotal = taches.reduce((s, t) => s + (t.cost || 0), 0);
    const parPresta = new Map<string, number>();
    for (const t of taches) {
      if (!t.cost) continue;
      const nom = (t.provider || '').trim() || '— non renseigné —';
      parPresta.set(nom, (parPresta.get(nom) || 0) + t.cost);
    }
    const prestataires = [...parPresta.entries()]
      .map(([nom, montant]) => ({ nom, montant }))
      .sort((a, b) => b.montant - a.montant);
    const top3 = [...taches].sort((a, b) => (b.cost || 0) - (a.cost || 0)).slice(0, 3)
      .reduce((s, t) => s + (t.cost || 0), 0);
    const partTop3 = budgetTotal > 0 ? Math.round((top3 / budgetTotal) * 100) : 0;

    return { taches, restantes, enRetard, nonAssignees, sansDate, equipe, budgetTotal, prestataires, partTop3 };
  }, [projet.tasks, users]);

  if (k.taches.length === 0) {
    return (
      <div className="gx-card p-8 text-center text-slate-500 text-sm italic border border-dashed border-bony-border">
        Aucune tâche engagée : les indicateurs apparaîtront dès la première tâche non « Vierge ».
      </div>
    );
  }

  const bascule = (id: string) => setDeplie(d => (d === id ? null : id));
  const totalATraiter = k.enRetard.length + k.nonAssignees.length + k.sansDate.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* 1. À TRAITER — le seul bloc qui doit faire agir */}
      <Bloc titre="À traiter" icone={<AlertTriangle size={12} />}>
        <div className="space-y-1.5">
          <Categorie
            taches={k.enRetard}
            libelle="en retard"
            icone={<AlertTriangle size={14} />}
            ton="alerte"
            ouvert={deplie === 'retard'}
            onToggle={() => bascule('retard')}
            onOuvrirTache={onOuvrirTache}
            detail={t => t.deadline || ''}
          />
          <Categorie
            taches={k.nonAssignees}
            libelle="sans personne assignée"
            icone={<UserX size={14} />}
            ton="attention"
            ouvert={deplie === 'assign'}
            onToggle={() => bascule('assign')}
            onOuvrirTache={onOuvrirTache}
          />
          <Categorie
            // ⚠️ Libellé PRÉCIS : « à faire sans date ». Le Planning, lui, compte TOUTES
            // les tâches non plaçables, terminées comprises — d'où deux nombres
            // différents dans le même écran (7 ici, 14 là-bas sur Forum Pièces). Les
            // deux sont justes, à condition que chaque libellé dise ce qu'il compte.
            taches={k.sansDate}
            libelle="à faire sans date"
            icone={<CalendarOff size={14} />}
            ton="attention"
            ouvert={deplie === 'date'}
            onToggle={() => bascule('date')}
            onOuvrirTache={onOuvrirTache}
          />
        </div>
        <p className="text-[10px] text-slate-500 leading-snug">
          {totalATraiter === 0
            ? 'Rien à corriger : tout est assigné, daté et à jour.'
            : 'Cliquez un compteur pour dérouler, puis une ligne pour ouvrir la tâche et la corriger.'}
        </p>
      </Bloc>

      {/* 2. QUI FAIT QUOI — toutes les tâches, pas seulement le restant */}
      <Bloc titre="Qui fait quoi" icone={<Users size={12} />}>
        <div className="space-y-2.5">
          {k.equipe.map(c => {
            const pct = c.total > 0 ? Math.round((c.faites / c.total) * 100) : 0;
            return (
              <div key={c.userId || 'non-assigne'} className="flex items-center gap-2">
                {c.user
                  ? <Avatar userId={c.user.id} name={c.user.name} color={c.user.avatarColor} size={22} />
                  : <div className="w-[22px] h-[22px] rounded-full border border-dashed border-bony-orange/60 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <p className={`text-xs font-semibold truncate ${c.user ? 'text-bony-text' : 'text-bony-orange'}`}>
                      {c.user ? c.user.name : 'Non assignées'}
                    </p>
                    <span className="text-[10px] text-slate-500 shrink-0 font-sans">
                      {c.faites}/{c.total} faite{c.total > 1 ? 's' : ''}
                    </span>
                    {c.retard > 0 && (
                      <span className="ml-auto shrink-0 text-[9px] font-bold text-red-500 bg-red-500/10 border border-red-500/30 rounded px-1.5">
                        {c.retard} en retard
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 bg-slate-200 dark:bg-black/40 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full transition-all duration-700 ${c.user ? 'gx-gradient' : 'bg-bony-orange/50'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                {c.euros > 0 && (
                  <span className="text-[10px] text-slate-500 font-sans shrink-0 w-16 text-right">{euros(c.euros)}</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-500 pt-1 border-t border-bony-border">
          Toutes les tâches de chacun, terminées comprises — la barre montre ce qui est fait.
        </p>
      </Bloc>

      {/* 3. OÙ PART L'ARGENT — inchangé */}
      <Bloc titre="Où part l'argent" icone={<Coins size={12} />}>
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-title text-2xl leading-none text-bony-text">{euros(k.budgetTotal)}</p>
            <p className="text-[10px] text-slate-500 mt-1">engagé sur les tâches</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-title text-2xl leading-none ${k.partTop3 >= 70 ? 'text-bony-orange' : 'text-bony-text'}`}>
              {k.partTop3} %
            </p>
            <p className="text-[10px] text-slate-500 mt-1">sur les 3 plus grosses lignes</p>
          </div>
        </div>
        {k.prestataires.length > 0 ? (
          <div className="space-y-1.5 pt-1 border-t border-bony-border">
            {k.prestataires.slice(0, 4).map(p => {
              const part = k.budgetTotal > 0 ? Math.round((p.montant / k.budgetTotal) * 100) : 0;
              return (
                <div key={p.nom} className="flex items-center gap-2 text-[11px]">
                  <TrendingUp size={11} className="text-bony-violet shrink-0" />
                  <span className={`truncate ${p.nom.startsWith('—') ? 'text-slate-500 italic' : 'text-bony-text'}`}>{p.nom}</span>
                  <span className="ml-auto shrink-0 font-sans text-bony-text">{euros(p.montant)}</span>
                  <span className="shrink-0 w-9 text-right text-slate-500 font-sans">{part} %</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px] text-slate-500 pt-1 border-t border-bony-border">Aucun coût saisi sur les tâches.</p>
        )}
      </Bloc>

    </div>
  );
};

export default ExpertKpis;
