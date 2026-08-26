import React, { useState, useRef } from 'react';
import { UploadCloud, Trash2, Download, FileText, FileSpreadsheet, FileArchive, Film, File as FileIcon, Loader2 } from 'lucide-react';
import { ProjectFile, User } from '../../types';
import { db } from '../../services/dataService';
import { formatPoids, estImage, familleFichier } from '../../utils/fichiers';
import Avatar from '../Avatar';

/**
 * Dépôt de fichiers du mode EXPERT.
 *
 * ⚠️ UN SEUL composant pour les fichiers de PROJET et ceux d'une TÂCHE : c'est
 * `taskId` qui fait la différence, exactement comme en base. Deux composants auraient
 * dupliqué le glisser-déposer, la validation et la suppression — la duplication étant
 * précisément ce qui les fait diverger.
 *
 * ⚠️ Le dépôt se fait en DEUX appels, et c'est voulu : `uploadFile` écrit sur le disque
 * via la route uploads (seule à le faire, avec ses règles de taille et son nommage en
 * uuid), puis `addProjectFile` enregistre la métadonnée. Si le second échoue, le fichier
 * reste orphelin sur le disque — le balayage de `jobs/purge.ts` le ramasse.
 */

const ICONES: Record<string, React.ReactNode> = {
  pdf: <FileText size={18} className="text-red-400" />,
  tableur: <FileSpreadsheet size={18} className="text-green-400" />,
  document: <FileText size={18} className="text-blue-400" />,
  archive: <FileArchive size={18} className="text-amber-400" />,
  media: <Film size={18} className="text-bony-violet" />,
  autre: <FileIcon size={18} className="text-slate-400" />
};

// Doit rester aligné sur la règle `project` de backend/src/routes/uploads.ts.
// ⚠️ Ce contrôle n'est qu'un CONFORT (message immédiat) : le seul garde-fou réel est
// côté serveur. Toute modification se reporte des deux côtés.
const MAX_OCTETS = 100 * 1024 * 1024;

interface Props {
  projectId: string;
  taskId?: string | null;
  fichiers: ProjectFile[];
  users: User[];
  canEdit: boolean;
  onChange: () => void;
  compact?: boolean;
}

const ExpertFiles: React.FC<Props> = ({ projectId, taskId = null, fichiers, users, canEdit, onChange, compact = false }) => {
  const [envoiEnCours, setEnvoiEnCours] = useState(0);
  const [erreur, setErreur] = useState('');
  const [survol, setSurvol] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const envoyer = async (liste: FileList | null) => {
    if (!liste || liste.length === 0 || !canEdit) return;
    setErreur('');
    const fichiersOk = [...liste].filter(f => {
      if (f.size > MAX_OCTETS) {
        setErreur(`« ${f.name} » dépasse 100 Mo et n'a pas été envoyé.`);
        return false;
      }
      return true;
    });
    if (fichiersOk.length === 0) return;

    setEnvoiEnCours(n => n + fichiersOk.length);
    for (const f of fichiersOk) {
      try {
        const url = await db.uploadFile('project', f);
        await db.addProjectFile(projectId, { url, fileName: f.name, fileSize: f.size, taskId });
      } catch (e) {
        console.error('Upload fichier projet échoué :', e);
        setErreur(`Échec de l'envoi de « ${f.name} ».`);
      } finally {
        setEnvoiEnCours(n => n - 1);
      }
    }
    onChange();
  };

  const supprimer = async (f: ProjectFile) => {
    if (!canEdit) return;
    if (!confirm(`Supprimer définitivement « ${f.fileName} » ?`)) return;
    try {
      await db.deleteProjectFile(f.id);
      onChange();
    } catch (e) {
      console.error('Suppression fichier échouée :', e);
      alert('Échec de la suppression (serveur injoignable ?).');
    }
  };

  return (
    <div className="space-y-3">

      {canEdit && (
        <div
          onDragOver={e => { e.preventDefault(); setSurvol(true); }}
          onDragLeave={() => setSurvol(false)}
          onDrop={e => { e.preventDefault(); setSurvol(false); void envoyer(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${
            compact ? 'py-4' : 'py-8'
          } ${survol ? 'border-bony-orange bg-bony-orange/[0.06]' : 'border-bony-border hover:border-bony-orange/50'}`}
        >
          {envoiEnCours > 0 ? (
            <>
              <Loader2 size={compact ? 18 : 24} className="text-bony-orange animate-spin" />
              <p className="text-[11px] text-bony-orange font-semibold">
                Envoi de {envoiEnCours} fichier{envoiEnCours > 1 ? 's' : ''}…
              </p>
            </>
          ) : (
            <>
              <UploadCloud size={compact ? 18 : 24} className="text-slate-400" />
              <p className="text-[11px] text-slate-500">
                <span className="text-bony-orange font-semibold">Choisir un fichier</span> ou glisser-déposer
              </p>
              {!compact && <p className="text-[10px] text-slate-500/70">Tous formats, 100 Mo maximum</p>}
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { void envoyer(e.target.files); e.target.value = ''; }}
          />
        </div>
      )}

      {erreur && (
        <p className="text-[11px] text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{erreur}</p>
      )}

      {fichiers.length === 0 ? (
        <p className="text-[11px] text-slate-500 italic text-center py-2">
          {canEdit ? 'Aucun fichier pour le moment.' : 'Aucun fichier déposé.'}
        </p>
      ) : (
        <div className={compact ? 'space-y-1.5' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2'}>
          {fichiers.map(f => {
            const auteur = users.find(u => u.id === f.uploadedBy);
            const image = estImage(f.fileName);
            return (
              <div
                key={f.id}
                className="gx-glass-panel gx-hover-lift rounded-xl border border-bony-border p-2 flex items-center gap-2.5 group"
              >
                {/* Vignette pour une image, icône de famille sinon */}
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-slate-100 dark:bg-white/5 border border-bony-border/60">
                  {image
                    ? <img src={f.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : ICONES[familleFichier(f.fileName)]}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-bony-text truncate" title={f.fileName}>{f.fileName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-500 font-sans shrink-0">{formatPoids(f.fileSize)}</span>
                    {auteur && (
                      <>
                        <span className="text-[10px] text-slate-500/50">·</span>
                        <Avatar userId={auteur.id} name={auteur.name} color={auteur.avatarColor} size={13} />
                        <span className="text-[10px] text-slate-500 truncate">{auteur.name}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  {/* `download` porte le NOM D'ORIGINE : sur le disque le fichier
                      s'appelle <uuid>.<ext>, sans cet attribut on téléchargerait un
                      fichier au nom illisible. */}
                  <a
                    href={f.url}
                    download={f.fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Télécharger"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-bony-orange hover:bg-bony-orange/10 transition"
                  >
                    <Download size={14} />
                  </a>
                  {canEdit && (
                    <button
                      onClick={() => supprimer(f)}
                      title="Supprimer définitivement"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExpertFiles;
