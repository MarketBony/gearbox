import React from 'react';
import { Project } from '../types';
import { BRAND_COLORS } from '../constants';

// =============================================================================
// APERÇU CONDENSÉ D'UN PROJET — définition UNIQUE.
//
// Extrait de `pages/Agenda.tsx` (où il s'appelait `ProjectTooltipContent`) le
// 06/08/2026, pour être partagé avec le Chat (projets cités). L'Agenda l'importe
// désormais d'ici : il n'y a toujours qu'UNE définition de cet aperçu, pas une
// copie par écran — c'est la règle qui a coûté quatre divergences entre Budget et
// Dashboard avant d'être appliquée systématiquement.
//
// ⚠️ Cet aperçu montre le BUDGET du projet. Tout écran qui l'affiche doit s'être
// demandé si son lecteur a le droit de le voir : le Chat, lui, peut réunir des
// rôles qui n'ont pas accès aux Projets (voir ProjectChatCard dans pages/Chat.tsx).
// =============================================================================

const formatDateRange = (start: string, end: string) => {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
  if (s.getTime() === e.getTime()) return fmt.format(s);
  return `${fmt.format(s)} - ${fmt.format(e)}`;
};

const ProjectSummary: React.FC<{ project: Project }> = ({ project }) => (
  <>
    <div className="flex justify-between items-start mb-2">
      <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{project.name}</h4>
      <span className="text-[10px] bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-300 shrink-0 ml-2">{project.progress}%</span>
    </div>
    <div className="space-y-2 mb-3">
      <div className="flex flex-wrap gap-1">
        <span className="text-[9px] bg-blue-100 dark:bg-bony-blue/20 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-bony-blue/30 px-1.5 rounded">{project.site}</span>
        <span className="text-[9px] bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-1.5 rounded">{project.projectType}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {project.brands?.map(b => (
          <span key={b} className={`text-[8px] px-1.5 rounded border ${BRAND_COLORS[b]}`}>{b}</span>
        ))}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-bony-border pt-2">
      <div>
        <span className="block text-slate-500 font-bold uppercase">Dates</span>
        <span className="text-slate-800 dark:text-white font-sans">{formatDateRange(project.startDate, project.endDate)}</span>
      </div>
      <div>
        <span className="block text-slate-500 font-bold uppercase">Budget</span>
        <span className="text-slate-800 dark:text-white font-sans">{project.budgetActual} €</span>
      </div>
    </div>
  </>
);

export default ProjectSummary;
