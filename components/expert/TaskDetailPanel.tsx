import React, { useState, useEffect } from 'react';
import { X, CalendarRange, StickyNote, Paperclip, UserCircle } from 'lucide-react';
import { Task, ProjectFile, User } from '../../types';
import DatePicker from '../DatePicker';
import Avatar from '../Avatar';
import ExpertFiles from './ExpertFiles';

/**
 * Détail d'une tâche en mode EXPERT : dates, notes, pièces jointes.
 *
 * ⚠️ C'est un PANNEAU, délibérément, et non deux colonnes de plus dans le tableau des
 * tâches. Ce tableau compte déjà 8 colonnes et vient d'être recalibré au pixel
 * (correctif 42) : une note libre et une liste de fichiers n'y tiennent pas, et les y
 * pousser aurait ré-écrasé la colonne « Nom de la tâche ».
 *
 * ⚠️ LES NOTES SONT LOCALES PUIS SAUVÉES AU BLUR, pas à chaque frappe. Partout ailleurs
 * dans l'écran Projets, une frappe déclenche un PUT du projet entier — acceptable pour
 * un champ court, ruineux pour un bloc-notes (un PUT par caractère, et
 * `handleUpdateProject` recalcule au passage l'avancement et le budget réel du projet).
 */

interface Props {
  tache: Task;
  projectId: string;
  fichiers: ProjectFile[];
  users: User[];
  canEdit: boolean;
  onFermer: () => void;
  onChangerTache: (taskId: string, champ: keyof Task, valeur: any) => void;
  onFichiersChange: () => void;
}

const TaskDetailPanel: React.FC<Props> = ({
  tache, projectId, fichiers, users, canEdit, onFermer, onChangerTache, onFichiersChange
}) => {
  // Brouillon local de la note : voir l'avertissement en tête de fichier.
  const [note, setNote] = useState(tache.notes || '');
  useEffect(() => { setNote(tache.notes || ''); }, [tache.id]);

  const assigne = users.find(u => u.id === tache.assignedUserId);
  const fichiersTache = fichiers.filter(f => f.taskId === tache.id);

  const enregistrerNote = () => {
    const valeur = note.trim();
    if (valeur === (tache.notes || '')) return; // rien n'a changé : pas de PUT inutile
    // `|| null` et non `|| undefined` : côté serveur `undefined` signifie « champ absent
    // du body, donc non modifié », un effacement ne partirait donc jamais.
    onChangerTache(tache.id, 'notes', valeur || null);
  };

  return (
    <>
      {/* Voile : ferme au clic, et isole visuellement le panneau */}
      <div className="fixed inset-0 bg-black/40 z-40 animate-[fadeIn_.15s_ease-out]" onClick={onFermer} />

      <aside className="fixed top-0 right-0 bottom-0 w-full sm:w-[420px] z-50 flex flex-col bg-[var(--bg-panel)] border-l border-bony-border shadow-2xl">

        <header className="shrink-0 px-4 py-3 border-b border-bony-border flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold text-bony-violet uppercase tracking-widest">Détail de la tâche</p>
            <h3 className="text-sm font-bold text-bony-text leading-snug mt-0.5 break-words">
              {tache.name || 'Sans nom'}
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5">
              {assigne
                ? <><Avatar userId={assigne.id} name={assigne.name} color={assigne.avatarColor} size={16} />
                    <span className="text-[10px] text-slate-500">{assigne.name}</span></>
                : <><UserCircle size={16} className="text-slate-400" />
                    <span className="text-[10px] text-slate-500">Non assignée</span></>}
              {tache.cost > 0 && (
                <span className="ml-auto text-[10px] font-sans text-bony-text">{tache.cost.toLocaleString('fr-FR')} €</span>
              )}
            </div>
          </div>
          <button onClick={onFermer} className="p-1.5 rounded-lg text-slate-400 hover:text-bony-text hover:bg-[var(--text-main)]/[0.08] transition shrink-0">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

          {/* DATES */}
          <section className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <CalendarRange size={12} /> Fenêtre de réalisation
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[9px] text-slate-500 uppercase">Début</label>
                <DatePicker
                  size="sm"
                  clearable
                  value={tache.startDate || ''}
                  onChange={v => onChangerTache(tache.id, 'startDate', v || null)}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] text-slate-500 uppercase">Échéance</label>
                <DatePicker
                  size="sm"
                  clearable
                  value={tache.deadline || ''}
                  onChange={v => onChangerTache(tache.id, 'deadline', v || null)}
                  placeholder="—"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              {tache.startDate && tache.deadline
                ? 'Les deux dates sont posées : la tâche apparaît en barre dans le planning.'
                : tache.deadline
                ? 'Sans date de début, la tâche se place en jalon sur son échéance.'
                : 'Sans échéance, la tâche n’apparaît pas dans le planning.'}
            </p>
          </section>

          {/* NOTES */}
          <section className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <StickyNote size={12} /> Note
            </h4>
            <textarea
              value={note}
              disabled={!canEdit}
              onChange={e => setNote(e.target.value)}
              onBlur={enregistrerNote}
              placeholder="Compte rendu, contraintes, points de vigilance, contacts…"
              className="w-full h-40 gx-glass-panel rounded-xl p-3 text-bony-text outline-none focus:border-bony-violet resize-none leading-relaxed text-xs disabled:opacity-50 border border-bony-border"
            />
            {canEdit && (
              <p className="text-[10px] text-slate-500">Enregistrée en quittant le champ.</p>
            )}
          </section>

          {/* FICHIERS DE LA TÂCHE */}
          <section className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Paperclip size={12} /> Fichiers de la tâche
              {fichiersTache.length > 0 && (
                <span className="ml-1 text-bony-violet font-sans">{fichiersTache.length}</span>
              )}
            </h4>
            <ExpertFiles
              projectId={projectId}
              taskId={tache.id}
              fichiers={fichiersTache}
              users={users}
              canEdit={canEdit}
              onChange={onFichiersChange}
              compact
            />
          </section>
        </div>
      </aside>
    </>
  );
};

export default TaskDetailPanel;
