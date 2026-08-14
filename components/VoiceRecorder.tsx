import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send } from 'lucide-react';

// =============================================================================
// ENREGISTREUR DE MESSAGE VOCAL
//
// ⚠️ Le flux micro DOIT être relâché explicitement (`track.stop()`) : sans ça, le
// navigateur garde le voyant d'enregistrement allumé après coup — l'utilisateur croit
// être encore écouté, et sur mobile ça consomme la batterie. On le coupe donc à
// l'arrêt, à l'annulation ET au démontage du composant.
//
// ⚠️ `getUserMedia` n'existe QUE sur une origine sécurisée (https, ou localhost).
// La production est en https, le développement en localhost : les deux cas passent.
// Un accès par IP locale (http://192.168.x.x) échouerait — c'est attendu.
// =============================================================================

const formatDuree = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Plafond volontaire : un « message vocal » n'est pas un podcast, et chaque minute
// pèse sur le disque du VPS. L'enregistrement s'arrête tout seul à cette durée.
const DUREE_MAX_S = 5 * 60;

const VoiceRecorder: React.FC<{
  onSend: (fichier: File, duree: string) => Promise<void> | void;
  onClose: () => void;
}> = ({ onSend, onClose }) => {
  const [enCours, setEnCours] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const morceauxRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);

  const couperFlux = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Filet de sécurité : quitter la conversation ou fermer le panneau pendant un
  // enregistrement ne doit pas laisser le micro ouvert.
  useEffect(() => () => {
    couperFlux();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const demarrer = async () => {
    setErreur('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      morceauxRef.current = [];
      // Type laissé au navigateur : Chrome/Firefox produisent du webm/opus, Safari
      // du mp4/aac. Les deux sont servis « inline » par le backend (EXT_AFFICHABLES)
      // et lus par <audio>. Forcer un type ferait échouer l'un des deux.
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = e => { if (e.data.size > 0) morceauxRef.current.push(e.data); };
      rec.onstop = () => setBlob(new Blob(morceauxRef.current, { type: rec.mimeType || 'audio/webm' }));
      rec.start();
      recorderRef.current = rec;
      setEnCours(true);
      setSecondes(0);
      timerRef.current = window.setInterval(() => {
        setSecondes(s => {
          if (s + 1 >= DUREE_MAX_S) { arreter(); return DUREE_MAX_S; }
          return s + 1;
        });
      }, 1000);
    } catch (e: any) {
      // NotAllowedError = refus explicite ; NotFoundError = aucun micro.
      setErreur(
        e?.name === 'NotAllowedError'
          ? "Accès au micro refusé. Autorise-le dans les réglages du navigateur pour ce site."
          : e?.name === 'NotFoundError'
            ? 'Aucun micro détecté sur cet appareil.'
            : "Impossible de démarrer l'enregistrement."
      );
    }
  };

  const arreter = () => {
    recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    setEnCours(false);
    couperFlux();
  };

  const annuler = () => {
    arreter();
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setBlob(null);
    setSecondes(0);
    onClose();
  };

  const envoyer = async () => {
    if (!blob || envoi) return;
    setEnvoi(true);
    try {
      // Extension déduite du type réel produit par le navigateur, pour que le
      // backend serve le fichier « inline » (la liste porte sur l'extension disque).
      const ext = blob.type.includes('mp4') || blob.type.includes('aac') ? 'm4a'
        : blob.type.includes('ogg') ? 'ogg'
        : 'webm';
      const fichier = new File([blob], `vocal-${Date.now()}.${ext}`, { type: blob.type });
      await onSend(fichier, formatDuree(secondes));
      annuler();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'envoi.");
      setEnvoi(false);
    }
  };

  if (blob && !urlRef.current) urlRef.current = URL.createObjectURL(blob);

  return (
    <div className="flex items-center gap-2 mb-1.5 px-1">
      {erreur ? (
        <>
          <p className="flex-1 text-[11px] text-red-500 font-bold">{erreur}</p>
          <button onClick={annuler} className="text-[11px] text-bony-muted hover:text-bony-text underline">Fermer</button>
        </>
      ) : blob ? (
        <>
          <audio src={urlRef.current!} controls className="flex-1 h-8 min-w-0" />
          <button onClick={annuler} disabled={envoi} title="Supprimer" className="shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-[32px] md:min-w-[32px] rounded-lg text-slate-400 hover:text-red-500 transition disabled:opacity-40">
            <Trash2 size={15} />
          </button>
          <button onClick={envoyer} disabled={envoi} title="Envoyer" className="shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-[32px] md:min-w-[32px] rounded-lg bg-bony-gradient text-white transition disabled:opacity-50">
            <Send size={15} />
          </button>
        </>
      ) : (
        <>
          <span className={`w-2 h-2 rounded-full shrink-0 ${enCours ? 'bg-red-500 animate-pulse' : 'bg-bony-muted'}`} />
          <span className="text-[11px] font-bold text-bony-text tabular-nums">{formatDuree(secondes)}</span>
          <span className="flex-1 text-[10px] text-bony-muted truncate">
            {enCours ? 'Enregistrement… (5 min max)' : 'Prêt à enregistrer'}
          </span>
          {enCours ? (
            <button onClick={arreter} title="Arrêter" className="shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-[32px] md:min-w-[32px] rounded-lg bg-red-500 text-white transition">
              <Square size={14} />
            </button>
          ) : (
            <button onClick={demarrer} title="Enregistrer" className="shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-[32px] md:min-w-[32px] rounded-lg bg-bony-gradient text-white transition">
              <Mic size={15} />
            </button>
          )}
          <button onClick={annuler} className="shrink-0 text-[11px] text-bony-muted hover:text-bony-text px-1">Annuler</button>
        </>
      )}
    </div>
  );
};

export default VoiceRecorder;
