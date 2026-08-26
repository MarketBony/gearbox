import React, { useMemo } from 'react';
import { AlertTriangle, CalendarClock, CircleHelp, Scale, Users, Coins, TrendingUp } from 'lucide-react';
import { Project, Task, User } from '../../types';
import Avatar from '../Avatar';

/**
 * KPI du mode EXPERT — quatre lectures d'un gros projet.
 *
 * ⚠️⚠️ AUCUN de ces chiffres n'entre dans un budget, un total ou une agrégation. Ils
 * sont calculés ICI, pour l'affichage de CE projet, et ne redescendent nulle part.
 * En particulier ils n'ont RIEN à voir avec le routage budgétaire de `constants.ts`
 * (`resolveBudgetLine`, `splitShareToBuckets`) : on ne ventile pas par site ni par
 * marque, on lit les tâches d'un projet déjà sélectionné.
 *
 * ⚠️ Pas de burndown ni de vélocité, volontairement : il n'existe AUCUN historique de
 * changement de statut. `Task.updatedAt` bouge à chaque modification, pas au passage en
 * « Terminé ». Une courbe bâtie dessus serait fausse, et ce projet a déjà payé ce genre
 * d'approximation avec le KPI de rythme biaisé (correctif 25).
 */

// Une tâche « Vierge » n'a jamais été engagée : elle ne compte ni comme faite, ni comme
// en retard. Même traitement que dans la To-do, qui l'exclut de ses colonnes.
const EST_ACTIVE = (t: Task) => t.status !== 'Empty';
const EST_FINIE = (t: Task) => t.status === 'Done' || t.status === 'Programmed';

const aujourdhui = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const dansNJours = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const euros = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

// --- Brique d'affichage commune -------------------------------------------------
const Bloc: React.FC<{ titre: string; icone: React.ReactNode; children: React.ReactNode }> = ({ titre, icone, children }) => (
  <div className="gx-card p-4 flex flex-col gap-3">
    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
      {icone} {titre}
    </h4>
    {children}
  </div>
);

const Chiffre: React.FC<{ valeur: React.ReactNode; libelle: string; ton?: 'neutre' | 'alerte' | 'attention' | 'ok' }> = ({ valeur, libelle, ton = 'neutre' }) => {
  const couleur =
    ton === 'alerte' ? 'text-red-500'
    : ton === 'attention' ? 'text-bony-orange'
    : ton === 'ok' ? 'text-green-500'
    : 'text-bony-text';
  return (
    <div className="flex-1 min-w-0">
      <p className={`font-title text-2xl leading-none ${couleur}`}>{valeur}</p>
      <p className="text-[10px] text-slate-500 mt-1 leading-tight">{libelle}</p>
    </div>
  );
};

interface Props {
  projet: Project;
  users: User[];
}

const ExpertKpis: React.FC<Props> = ({ projet, users }) => {
  const k = useMemo(() => {
    const taches = projet.tasks.filter(EST_ACTIVE);
    const today = aujourdhui();
    const dans7 = dansNJours(7);

    // 1. TENUE DES ÉCHÉANCES ---------------------------------------------------
    // Une tâche terminée n'est jamais « en retard », même si sa date est passée :
    // le retard qualifie ce qu'il reste à faire, pas l'historique.
    const enRetard = taches.filter(t => !EST_FINIE(t) && t.deadline && t.deadline < today);
    const imminentes = taches.filter(t => !EST_FINIE(t) && t.deadline && t.deadline >= today && t.deadline <= dans7);
    const sansEcheance = taches.filter(t => !EST_FINIE(t) && !t.deadline);

    // 2. CHARGE PAR PERSONNE ---------------------------------------------------
    // Seules les tâches NON terminées : la charge, c'est ce qui reste à porter.
    const parPersonne = new Map<string, { nb: number; euros: number; retard: number }>();
    for (const t of taches) {
      if (EST_FINIE(t)) continue;
      const cle = t.assignedUserId || '';
      const e = parPersonne.get(cle) || { nb: 0, euros: 0, retard: 0 };
      e.nb += 1;
      e.euros += t.cost || 0;
      if (t.deadline && t.deadline < today) e.retard += 1;
      parPersonne.set(cle, e);
    }
    const charge = [...parPersonne.entries()]
      .map(([userId, v]) => ({ userId, ...v, nom: users.find(u => u.id === userId)?.name || '' }))
      // Les non-assignées en DERNIER mais jamais masquées : ce sont elles le vrai
      // trou de pilotage sur un gros projet.
      .sort((a, b) => (a.userId === '' ? 1 : b.userId === '' ? -1 : b.euros - a.euros || b.nb - a.nb));

    // 3. AVANCEMENT PONDÉRÉ ----------------------------------------------------
    // ⚠️ Le `progress` du projet compte chaque tâche pour 1, quel que soit son montant.
    // Sur un projet où une ligne pèse 66 000 € et une autre 0 €, les deux comptent
    // pareil. On recalcule donc le même barème (Done/Programmed = 1, InProgress = 0,5)
    // pondéré par le COÛT — et on affiche les deux : c'est leur ÉCART qui informe.
    const poids = (t: Task) => (EST_FINIE(t) ? 1 : t.status === 'InProgress' ? 0.5 : 0);
    const budgetTotal = taches.reduce((s, t) => s + (t.cost || 0), 0);
    const avancementUnite = taches.length > 0
      ? Math.round((taches.reduce((s, t) => s + poids(t), 0) / taches.length) * 100)
      : 0;
    // Sans budget saisi, la pondération n'a aucun sens : on retombe sur l'unité plutôt
    // que d'afficher 0 % ou une division par zéro.
    const avancementPondere = budgetTotal > 0
      ? Math.round((taches.reduce((s, t) => s + poids(t) * (t.cost || 0), 0) / budgetTotal) * 100)
      : avancementUnite;
    const ecart = avancementPondere - avancementUnite;

    // 4. CONCENTRATION DES COÛTS -----------------------------------------------
    const parPresta = new Map<string, number>();
    for (const t of taches) {
      if (!t.cost) continue;
      const nom = (t.provider || '').trim() || '— non renseigné —';
      parPresta.set(nom, (parPresta.get(nom) || 0) + t.cost);
    }
    const prestataires = [...parPresta.entries()]
      .map(([nom, montant]) => ({ nom, montant }))
      .sort((a, b) => b.montant - a.montant);
    const topTaches = [...taches].filter(t => (t.cost || 0) > 0).sort((a, b) => (b.cost || 0) - (a.cost || 0));
    const top3 = topTaches.slice(0, 3).reduce((s, t) => s + (t.cost || 0), 0);
    const partTop3 = budgetTotal > 0 ? Math.round((top3 / budgetTotal) * 100) : 0;

    return {
      taches, enRetard, imminentes, sansEcheance, charge,
      avancementUnite, avancementPondere, ecart, budgetTotal,
      prestataires, topTaches, partTop3
    };
  }, [projet.tasks, users]);

  if (k.taches.length === 0) {
    return (
      <div className="gx-card p-8 text-center text-slate-500 text-sm italic border border-dashed border-bony-border">
        Aucune tâche engagée : les indicateurs apparaîtront dès la première tâche non « Vierge ».
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* 1. TENUE DES ÉCHÉANCES */}
      <Bloc titre="Tenue des échéances" icone={<CalendarClock size={12} />}>
        <div className="flex gap-4">
          <Chiffre valeur={k.enRetard.length} libelle="en retard" ton={k.enRetard.length > 0 ? 'alerte' : 'ok'} />
          <Chiffre valeur={k.imminentes.length} libelle="sous 7 jours" ton={k.imminentes.length > 0 ? 'attention' : 'neutre'} />
          <Chiffre valeur={k.sansEcheance.length} libelle="sans échéance" />
        </div>
        {k.enRetard.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-bony-border">
            {k.enRetard.slice(0, 3).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-[11px]">
                <AlertTriangle size={11} className="text-red-500 shrink-0" />
                <span className="truncate text-bony-text">{t.name || 'Sans nom'}</span>
                <span className="ml-auto shrink-0 text-red-500 font-semibold">{t.deadline}</span>
              </div>
            ))}
            {k.enRetard.length > 3 && (
              <p className="text-[10px] text-slate-500 pl-[19px]">et {k.enRetard.length - 3} autre(s)</p>
            )}
          </div>
        )}
        {k.sansEcheance.length > 0 && k.enRetard.length === 0 && (
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5 pt-1 border-t border-bony-border">
            <CircleHelp size={11} className="shrink-0" />
            Une tâche sans échéance n'apparaît ni ici, ni en retard, ni dans le Gantt.
          </p>
        )}
      </Bloc>

      {/* 3. AVANCEMENT PONDÉRÉ (placé en 2e position : c'est le plus parlant) */}
      <Bloc titre="Avancement réel" icone={<Scale size={12} />}>
        <div className="flex gap-4 items-start">
          <Chiffre valeur={`${k.avancementPondere} %`} libelle="pondéré par le budget" ton={k.ecart < -10 ? 'alerte' : k.ecart < 0 ? 'attention' : 'ok'} />
          <Chiffre valeur={`${k.avancementUnite} %`} libelle="par nombre de tâches" />
        </div>
        <div className="h-2 bg-slate-200 dark:bg-black/50 rounded-full overflow-hidden">
          <div className="h-full gx-gradient transition-all duration-700" style={{ width: `${k.avancementPondere}%` }} />
        </div>
        <p className="text-[10px] text-slate-500 leading-snug">
          {k.budgetTotal === 0
            ? 'Aucun coût saisi : la pondération retombe sur le compte de tâches.'
            : k.ecart === 0
            ? 'Les deux lectures coïncident : l’effort est réparti uniformément.'
            : k.ecart < 0
            ? `Les tâches terminées sont les moins chères : ${Math.abs(k.ecart)} points d’écart, le gros du budget reste devant.`
            : `Les tâches les plus lourdes sont déjà faites : ${k.ecart} points d’avance sur le simple décompte.`}
        </p>
      </Bloc>

      {/* 2. CHARGE PAR PERSONNE */}
      <Bloc titre="Charge par personne" icone={<Users size={12} />}>
        <div className="space-y-2">
          {k.charge.map(c => {
            const u = users.find(x => x.id === c.userId);
            const part = k.budgetTotal > 0 ? Math.round((c.euros / k.budgetTotal) * 100) : 0;
            return (
              <div key={c.userId || 'non-assigne'} className="flex items-center gap-2">
                {u
                  ? <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={22} />
                  : <div className="w-[22px] h-[22px] rounded-full border border-dashed border-bony-orange/60 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate ${u ? 'text-bony-text' : 'text-bony-orange'}`}>
                    {u ? u.name : 'Non assignées'}
                  </p>
                  <div className="h-1 bg-slate-200 dark:bg-black/40 rounded-full overflow-hidden mt-1">
                    <div className={`h-full ${u ? 'gx-gradient' : 'bg-bony-orange/50'}`} style={{ width: `${part}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] font-bold text-bony-text font-sans">{c.nb} tâche{c.nb > 1 ? 's' : ''}</p>
                  <p className="text-[10px] text-slate-500 font-sans">{euros(c.euros)}</p>
                </div>
                {c.retard > 0 && (
                  <span className="shrink-0 text-[9px] font-bold text-red-500 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5">
                    {c.retard} en retard
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-500 pt-1 border-t border-bony-border">
          Tâches restant à faire uniquement — les terminées ne pèsent plus sur personne.
        </p>
      </Bloc>

      {/* 4. CONCENTRATION DES COÛTS */}
      <Bloc titre="Où part l'argent" icone={<Coins size={12} />}>
        <div className="flex gap-4">
          <Chiffre valeur={euros(k.budgetTotal)} libelle="engagé sur les tâches" />
          <Chiffre valeur={`${k.partTop3} %`} libelle="sur les 3 plus grosses lignes" ton={k.partTop3 >= 70 ? 'attention' : 'neutre'} />
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
          <p className="text-[10px] text-slate-500 pt-1 border-t border-bony-border">
            Aucun coût saisi sur les tâches.
          </p>
        )}
      </Bloc>

    </div>
  );
};

export default ExpertKpis;
