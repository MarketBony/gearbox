import React, { useState, useEffect, useCallback } from 'react';
import { Gauge, CalendarRange, Paperclip, Sparkles, ChevronRight } from 'lucide-react';
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

  // Fichiers de tâche regroupés par tâche, dans l'ordre du tableau. Une tâche supprimée
  // emporte ses fichiers (cascade en base), donc `find` ne devrait jamais échouer — on
  // se protège quand même plutôt que d'afficher un groupe sans nom.
  const groupesParTache = projet.tasks
    .map(t => ({ taskId: t.id, nom: t.name || 'Sans nom', fichiers: fichiers.filter(f => f.taskId === t.id) }))
    .filter(g => g.fichiers.length > 0);

  const ONGLETS: { id: Onglet; libelle: string; icone: React.ReactNode; badge?: number }[] = [
    { id: 'pilotage', libelle: 'Pilotage', icone: <Gauge size={14} /> },
    { id: 'planning', libelle: 'Planning', icone: <CalendarRange size={14} /> },
    { id: 'fichiers', libelle: 'Fichiers', icone: <Paperclip size={14} />, badge: fichiers.length || undefined }
  ];

  return (
    <section className="space-y-4">

      {/* En-tête du mode.
          ⚠️ EN VERRE, pas en dégradé délavé. La première version posait un
          `gx-gradient opacity-[0.12]` en aplat sur toute la surface : l'exact contraire
          de la charte liquid glass, qui veut du translucide + `backdrop-filter`. Théo
          l'a qualifié d'« immonde » le 27/08/2026, à raison.
          On reprend donc `gx-card` (le verre de l'application) et le liseré dégradé
          vertical déjà utilisé sur le panneau de contexte du projet — un accent de
          charte sur le bord, pas un voile sur le fond. */}
      <div className="gx-card relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-bony-orange to-bony-violet" />
        <div className="relative px-4 py-3 pl-5 flex items-center gap-3 flex-wrap">
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
                // Onglet actif en dégradé plein, SANS `shadow-glow` : même raison que le
                // bouton d'activation, le halo orange est hors charte.
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5 transition-all ${
                  onglet === o.id
                    ? 'gx-gradient text-white'
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

      {onglet === 'pilotage' && (
        <ExpertKpis projet={projet} users={users} onOuvrirTache={onOuvrirTache} />
      )}

      {onglet === 'planning' && (
        <ExpertGantt projet={projet} users={users} onOuvrirTache={onOuvrirTache} />
      )}

      {onglet === 'fichiers' && (
        <div className="space-y-5">
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

          {/* ⚠️ Les fichiers de TÂCHE sont LISTÉS ICI, plus seulement annoncés.
              La première version affichait « 2 autres fichiers sont rattachés à une
              tâche — ouvrez la tâche pour les voir » : on signalait des fichiers sans
              les montrer, dans l'onglet qui s'appelle « Fichiers ». Théo l'a relevé le
              27/08/2026 (« complètement con »), à raison.
              Le dépôt reste au niveau de la TÂCHE (`canEdit={false}` ici) : c'est là
              qu'on choisit à quoi le fichier se rattache. */}
          {nbFichiersTaches > 0 && (
            <div className="border-t border-bony-border pt-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                Fichiers rattachés à une tâche
                <span className="ml-1.5 text-bony-violet font-sans">{nbFichiersTaches}</span>
              </h4>
              <div className="space-y-3">
                {groupesParTache.map(g => (
                  <div key={g.taskId}>
                    <button
                      onClick={() => onOuvrirTache(g.taskId)}
                      title="Ouvrir cette tâche"
                      className="flex items-center gap-1.5 mb-1.5 group"
                    >
                      <Paperclip size={11} className="text-bony-violet shrink-0" />
                      <span className="text-[11px] font-semibold text-bony-text group-hover:text-bony-orange transition-colors truncate max-w-[320px]">
                        {g.nom}
                      </span>
                      <ChevronRight size={12} className="text-slate-400 group-hover:text-bony-orange transition-colors shrink-0" />
                    </button>
                    <ExpertFiles
                      projectId={projet.id}
                      taskId={g.taskId}
                      fichiers={g.fichiers}
                      users={users}
                      canEdit={false}
                      onChange={onFichiersChange}
                      compact
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-3">
                Pour en ajouter ou en retirer un, ouvrez la tâche concernée.
              </p>
            </div>
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
