import React, { useState, useEffect, useCallback } from 'react';
import { Gauge, CalendarRange, Paperclip, Sparkles } from 'lucide-react';
import { Project, ProjectFile, User } from '../../types';
import { db } from '../../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../../services/realtime';
import ExpertKpis from './ExpertKpis';
import ExpertGantt from './ExpertGantt';
import ExpertFiles from './ExpertFiles';

/**
 * Conteneur des modules du mode EXPERT.
 *
 * ⚠️ Il ne se monte QUE si `projet.expertMode` est vrai — c'est `Projects.tsx` qui en
 * décide. Conséquence voulue : tant que le mode est éteint, ce composant n'est jamais
 * monté, aucune requête de fichiers n'est émise, et l'écran projet est strictement
 * celui d'avant ce lot. Le mode Expert est additif, il ne modifie rien d'existant.
 *
 * ⚠️ Les fichiers sont chargés ICI, une fois pour tout le projet, et redistribués aux
 * modules. Le panneau de tâche filtre sur `taskId` dans cette même liste plutôt que de
 * relancer une requête par tâche ouverte.
 */

type Onglet = 'pilotage' | 'planning' | 'fichiers';

interface Props {
  projet: Project;
  users: User[];
  canEdit: boolean;
  fichiers: ProjectFile[];
  onFichiersChange: () => void;
  onOuvrirTache: (taskId: string) => void;
}

const ExpertPanel: React.FC<Props> = ({ projet, users, canEdit, fichiers, onFichiersChange, onOuvrirTache }) => {
  const [onglet, setOnglet] = useState<Onglet>('pilotage');

  const fichiersProjet = fichiers.filter(f => !f.taskId);
  const nbFichiersTaches = fichiers.length - fichiersProjet.length;

  const ONGLETS: { id: Onglet; libelle: string; icone: React.ReactNode; badge?: number }[] = [
    { id: 'pilotage', libelle: 'Pilotage', icone: <Gauge size={14} /> },
    { id: 'planning', libelle: 'Planning', icone: <CalendarRange size={14} /> },
    { id: 'fichiers', libelle: 'Fichiers', icone: <Paperclip size={14} />, badge: fichiers.length || undefined }
  ];

  return (
    <section className="space-y-4">

      {/* En-tête du mode : c'est lui qui dit « on a changé de dimension » */}
      <div className="relative overflow-hidden rounded-2xl border border-bony-violet/30">
        <div className="absolute inset-0 gx-gradient opacity-[0.12]" />
        <div className="relative px-4 py-3 flex items-center gap-3 flex-wrap">
          <Sparkles size={18} className="text-bony-violet shrink-0" />
          <div className="min-w-0">
            <h3 className="font-title text-lg text-bony-text leading-none">MODE EXPERT</h3>
            <p className="text-[10px] text-slate-500 mt-1">
              Pilotage avancé — indicateurs, planning et pièces jointes de ce projet.
            </p>
          </div>

          {/* Onglets */}
          <div className="flex items-center gap-1 ml-auto p-1 rounded-xl bg-slate-100 dark:bg-black/30 border border-bony-border">
            {ONGLETS.map(o => (
              <button
                key={o.id}
                onClick={() => setOnglet(o.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5 transition-all ${
                  onglet === o.id
                    ? 'gx-gradient text-white shadow-glow'
                    : 'text-slate-500 hover:text-bony-text'
                }`}
              >
                {o.icone}
                {o.libelle}
                {o.badge != null && (
                  <span className={`font-sans text-[9px] px-1 rounded ${onglet === o.id ? 'bg-white/25' : 'bg-bony-violet/15 text-bony-violet'}`}>
                    {o.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {onglet === 'pilotage' && <ExpertKpis projet={projet} users={users} />}

      {onglet === 'planning' && (
        <ExpertGantt projet={projet} users={users} onOuvrirTache={onOuvrirTache} />
      )}

      {onglet === 'fichiers' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
              Fichiers du projet
            </h4>
            <ExpertFiles
              projectId={projet.id}
              taskId={null}
              fichiers={fichiersProjet}
              users={users}
              canEdit={canEdit}
              onChange={onFichiersChange}
            />
          </div>
          {nbFichiersTaches > 0 && (
            <p className="text-[11px] text-slate-500 border-t border-bony-border pt-3">
              {nbFichiersTaches} autre{nbFichiersTaches > 1 ? 's' : ''} fichier{nbFichiersTaches > 1 ? 's sont rattachés' : ' est rattaché'} à une tâche —
              ouvrez la tâche depuis le tableau pour {nbFichiersTaches > 1 ? 'les' : 'le'} voir.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default ExpertPanel;

/**
 * Charge les fichiers d'un projet et les tient à jour en temps réel.
 *
 * Extrait en hook pour que `Projects.tsx` détienne la liste : le panneau de détail de
 * tâche en a besoin lui aussi, et il vit hors de `ExpertPanel` (c'est une surcouche
 * plein écran). Une seule source, deux consommateurs.
 */
export const useProjectFiles = (projectId: string | null, actif: boolean) => {
  const [fichiers, setFichiers] = useState<ProjectFile[]>([]);

  const charger = useCallback(() => {
    if (!projectId || !actif) { setFichiers([]); return; }
    // Échec silencieux : l'absence de la liste de fichiers ne doit pas empêcher de
    // travailler sur le projet.
    db.getProjectFiles(projectId).then(setFichiers).catch(() => setFichiers([]));
  }, [projectId, actif]);

  useEffect(() => { charger(); }, [charger]);
  useRealtimeSync(RT_EVENTS.projectFiles, charger);

  return { fichiers, rechargerFichiers: charger };
};
