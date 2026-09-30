import { useCallback, useEffect, useRef, useState } from 'react';

// =====================================================================
// Enregistrement d'un message vocal — même logique que components/VoiceRecorder.tsx (micro relâché
// à l'arrêt, à l'annulation ET au démontage ; type laissé au navigateur ; extension déduite du type
// réel ; 5 min max ; mêmes messages d'erreur). Seul l'habillage change : la barre `.cht-rec` de la
// maquette (appui sur le micro = l'enregistrement démarre, flèche = arrêt + envoi).
// BESOIN: logique à extraire du composant partagé en un hook commun (BESOINS.md § 2) — la page actuelle
// et l'interface v2 en ont chacune une copie tant que ce n'est pas fait.
// =====================================================================

export const formatDuree = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** Plafond volontaire : un « message vocal » n'est pas un podcast (même valeur que VoiceRecorder). */
export const DUREE_MAX_S = 5 * 60;

export type VoiceState = 'idle' | 'rec' | 'done' | 'error';

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceState>('idle');
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timer = useRef<number | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const secsRef = useRef(0);
  const stopping = useRef<Promise<Blob | null> | null>(null);
  const gen = useRef(0);

  const cut = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
  };
  useEffect(() => () => { cut(); const r = recRef.current; if (r && r.state === 'recording') { r.onstop = null; r.stop(); } }, []);

  /** Arrête l'enregistrement et rend le fichier sonore (null si rien n'a été capté). */
  const finish = useCallback((): Promise<Blob | null> => {
    const rec = recRef.current;
    if (!rec || rec.state === 'inactive') return Promise.resolve(blobRef.current);
    if (stopping.current) return stopping.current;
    stopping.current = new Promise<Blob | null>((res) => {
      rec.onstop = () => { const b = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }); blobRef.current = b.size ? b : null; stopping.current = null; res(blobRef.current); };
      rec.stop();
    });
    cut(); setState('done');
    return stopping.current;
  }, []);

  const start = useCallback(async () => {
    if (recRef.current?.state === 'recording') return;
    setError(''); blobRef.current = null; setSecs(0); secsRef.current = 0; setState('rec');
    const g = ++gen.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Annulé pendant la demande d'accès au micro : on relâche aussitôt le flux obtenu.
      if (g !== gen.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream; chunks.current = [];
      // Type laissé au navigateur : webm/opus (Chrome, Firefox) ou mp4/aac (Safari), tous deux servis
      // « inline » par le backend. Forcer un type ferait échouer l'un des deux.
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.start(); recRef.current = rec;
      const t0 = Date.now();
      timer.current = window.setInterval(() => {
        const s = Math.min(DUREE_MAX_S, Math.floor((Date.now() - t0) / 1000));
        secsRef.current = s; setSecs(s);
        if (s >= DUREE_MAX_S) finish();
      }, 250);
    } catch (e: any) {
      if (g !== gen.current) return;
      cut();
      setError(e?.name === 'NotAllowedError' ? 'Accès au micro refusé. Autorise-le dans les réglages du navigateur pour ce site.'
        : e?.name === 'NotFoundError' ? 'Aucun micro détecté sur cet appareil.' : 'Impossible de démarrer l’enregistrement.');
      setState('error');
    }
  }, [finish]);

  const cancel = useCallback(() => {
    gen.current++;
    const r = recRef.current;
    if (r && r.state === 'recording') { r.onstop = null; r.stop(); }
    recRef.current = null; cut(); blobRef.current = null; stopping.current = null;
    setSecs(0); setError(''); setState('idle');
  }, []);

  /** Fichier prêt à téléverser, avec sa durée formatée (portée par `fileName`, comme la page). */
  const take = useCallback(async (): Promise<{ file: File; duree: string } | null> => {
    const blob = await finish(); if (!blob) return null;
    const ext = blob.type.includes('mp4') || blob.type.includes('aac') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    return { file: new File([blob], `vocal-${Date.now()}.${ext}`, { type: blob.type }), duree: formatDuree(Math.max(1, secsRef.current)) };
  }, [finish]);

  return { state, secs, error, start, cancel, take };
}
