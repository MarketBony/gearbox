
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChatConversation, ChatMessage, User } from '../types';
import { db, ApiError } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { getSocket, connectSocket, emitWithAck } from '../services/socket';
import { chatStore } from '../services/chatStore';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageSquare, Plus, Send, Star, StarOff, ArrowLeft,
  MoreHorizontal, Pencil, Trash2, X, Image, Reply, Check,
  Users, UserPlus, UserMinus, ChevronRight, Hash, Camera, Upload, ZoomIn,
  Bell, BellOff, Paperclip, FileText, FileX, Download, SmilePlus
} from 'lucide-react';
import Avatar from '../components/Avatar';
import Cropper from 'react-easy-crop';

const REACTIONS = ['👍', '❤️', '😂', '😮'];
// ⚠️ Doit rester aligné sur la règle `chat` de `backend/src/routes/uploads.ts`. Ce
// contrôle client n'est qu'un confort (message d'erreur immédiat, pas d'upload de
// 100 Mo pour rien) : **le serveur est le seul garde-fou réel**.
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 Mo, tous formats
// Sert uniquement à décider si le message s'affiche en IMAGE dans le fil ou en carte
// de pièce jointe — ce n'est plus une liste d'autorisation.
const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// ⚠️ Doivent rester alignés sur la règle `avatar` de `backend/src/routes/uploads.ts`,
// le seul garde-fou réel, et sur `pages/Settings.tsx` qui uploade l'autre avatar du
// projet. Le client validait jpeg/png/webp et 2 Mo, soit plus strict que le serveur
// sans rien économiser : ce qui part est TOUJOURS un JPEG 200×200 de ~20 Ko produit
// par le recadrage, quel que soit le fichier d'origine. Le GIF est donc accepté en
// entrée puis aplati, exactement comme pour la photo de profil d'un utilisateur.
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 Mo
const AVATAR_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Plafond de hauteur de la barre de saisie, en phase avec la classe `max-h-32`
// (8rem) du textarea : au-delà, le champ défile au lieu de continuer à grandir.
const MAX_INPUT_HEIGHT = 128;

// Poids lisible pour l'affichage d'une pièce jointe.
const formatPoids = (octets?: number): string => {
  if (!octets || octets <= 0) return '';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(octets < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
};

// Overlay client-only pour les features HORS PÉRIMÈTRE (épingle, renommage et
// membres de groupe) : le backend n'expose aucun événement pour elles. Stocké
// par navigateur et ré-appliqué sur les conversations du store à l'affichage,
// pour survivre aux chat:conversation:updated du backend. Comportement identique
// à aujourd'hui (par navigateur, non propagé aux autres utilisateurs).
type ConvOverlay = { pinnedBy?: string[]; name?: string; participants?: string[] };
const OVERLAY_KEY = 'gearbox_chat_overlay';
const readOverlay = (): Record<string, ConvOverlay> => {
  try { const d = localStorage.getItem(OVERLAY_KEY); return d ? JSON.parse(d) : {}; }
  catch { return {}; }
};
const updateOverlay = (convId: string, patch: ConvOverlay) => {
  const all = readOverlay();
  all[convId] = { ...all[convId], ...patch };
  localStorage.setItem(OVERLAY_KEY, JSON.stringify(all));
};
const applyOverlay = (convs: ChatConversation[]): ChatConversation[] => {
  const overlay = readOverlay();
  return convs.map(c => {
    const o = overlay[c.id];
    if (!o) return c;
    return {
      ...c,
      pinnedBy: o.pinnedBy ?? c.pinnedBy,
      name: o.name ?? c.name,
      participants: o.participants ?? c.participants
    };
  });
};

// --- Helpers ---
const relativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  if (h < 48) return 'hier';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const msgTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// --- Conversation Avatar ---
const ConvAvatar: React.FC<{
  conv: ChatConversation;
  members: User[];
  meId: string;
  isActive?: boolean;
  size?: number;
}> = ({ conv, members, meId, isActive, size = 38 }) => {
  if (conv.type === 'general') {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-full flex items-center justify-center text-white shrink-0 ${isActive ? 'bg-white/20' : 'bg-bony-orange'}`}
      >
        <Hash size={Math.floor(size * 0.44)} />
      </div>
    );
  }

  if (conv.type === 'private') {
    const other = members.find(u => u.id !== meId) ?? members[0];
    if (!other) return (
      <div style={{ width: size, height: size }} className="rounded-full bg-slate-700 shrink-0" />
    );
    return <Avatar userId={other.id} name={other.name} color={isActive ? '#ffffff44' : other.avatarColor} size={size} />;
  }

  // Groupe — la photo du groupe est prioritaire sur les avatars empilés des membres.
  // Elle se lit directement dans la conversation (source de vérité : la base) : il n'y
  // a plus de prop `groupPhoto` à passer, et donc plus de risque d'oublier de la câbler
  // sur l'un des quatre points d'appel. Les branches `general` et `private` retournent
  // avant, ce qui garantit structurellement qu'une conversation non-groupe n'affiche
  // jamais de photo de groupe.
  if (conv.avatarUrl) {
    return (
      <img
        src={conv.avatarUrl}
        alt="Groupe"
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0 border border-bony-border"
      />
    );
  }

  const others = members.filter(u => u.id !== meId).slice(0, 2);
  if (others.length === 0) {
    return (
      <div style={{ width: size, height: size }} className="rounded-full bg-bony-violet/20 flex items-center justify-center shrink-0">
        <Users size={Math.floor(size * 0.44)} className="text-bony-violet" />
      </div>
    );
  }
  if (others.length === 1) {
    return <Avatar userId={others[0].id} name={others[0].name} color={isActive ? '#ffffff44' : others[0].avatarColor} size={size} />;
  }
  const mini = Math.floor(size * 0.62);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute bottom-0 left-0">
        <Avatar userId={others[0].id} name={others[0].name} color={isActive ? '#ffffff44' : others[0].avatarColor} size={mini} />
      </div>
      <div className="absolute top-0 right-0">
        <Avatar userId={others[1].id} name={others[1].name} color={isActive ? '#ffffff44' : others[1].avatarColor} size={mini} />
      </div>
    </div>
  );
};

// --- Section label ---
const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <div className="px-5 pt-4 pb-1">
    <span className="text-[9px] font-bold text-bony-muted uppercase tracking-widest">{label}</span>
  </div>
);

// --- Crop helper (circular, 200×200) ---
interface CropArea { x: number; y: number; width: number; height: number; }
interface CropPoint { x: number; y: number; }

const getCroppedImg = (imageSrc: string, cropPixels: CropArea): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.beginPath();
      ctx.arc(100, 100, 100, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, 200, 200);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = reject;
    img.src = imageSrc;
  });

// --- Group Avatar Crop Modal ---
// `currentAvatarUrl` vient du SERVEUR (`conv.avatarUrl`) : la photo est partagée entre
// tous les participants depuis le 06/08/2026. Elle était auparavant lue dans le
// localStorage de ce poste, ce qui la rendait invisible de tout le monde sauf de son
// auteur.
interface GroupAvatarModalProps {
  convId: string;
  convName: string;
  currentAvatarUrl?: string | null;
  onClose: () => void;
}
const GroupAvatarCropModal: React.FC<GroupAvatarModalProps> = ({ convId, convName, currentAvatarUrl, onClose }) => {
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  // L'enregistrement était un `localStorage.setItem` instantané ; c'est devenu un
  // recadrage + un upload réseau + un aller-retour socket. Sans cet état, un
  // double-clic envoie deux uploads et l'utilisateur n'a aucun retour pendant l'attente.
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasExisting = !!currentAvatarUrl;

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!AVATAR_INPUT_TYPES.includes(file.type)) { setError('Format non supporté. Utilisez jpg, png, gif ou webp.'); return; }
    if (file.size > MAX_AVATAR_SIZE) { setError('Fichier trop lourd (max 5 Mo).'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = e => { setCropSrc(e.target?.result as string); setZoom(1); setCrop({ x: 0, y: 0 }); };
    reader.readAsDataURL(file);
  };

  // Même chemin que la photo de profil d'un utilisateur (pages/Settings.tsx) :
  // recadrage 200×200 -> Blob -> POST /api/uploads/avatar -> l'URL est persistée par
  // le socket, qui rediffuse la conversation à TOUS les participants.
  // Aucune mise à jour optimiste à écrire : la diffusion inclut l'émetteur, donc cet
  // onglet reçoit son propre `chat:conversation:updated`.
  const handleValidate = async () => {
    if (!cropSrc || !croppedAreaPixels || saving) return;
    setSaving(true);
    try {
      const base64 = await getCroppedImg(cropSrc, croppedAreaPixels);
      const blob = await (await fetch(base64)).blob();
      const file = new File([blob], 'group-avatar.jpg', { type: 'image/jpeg' });
      const url = await db.uploadFile('avatar', file);
      await emitWithAck('chat:conversation:avatar', { conversationId: convId, avatarUrl: url });
      onClose();
    } catch (e) {
      // On ne ferme PAS : le recadrage est conservé et l'utilisateur peut réessayer.
      // Le message du serveur est affiché tel quel (413 « trop volumineux »,
      // 415 « format non accepté »…) — un texte générique masquerait la cause.
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement. Réessayez.");
      setSaving(false);
    }
    // Pas de `finally` : en cas de succès le composant est démonté par `onClose()`.
  };

  const handleDelete = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await emitWithAck('chat:conversation:avatar', { conversationId: convId, avatarUrl: null });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la suppression. Réessayez.');
      setSaving(false);
    }
  };

  // ⚠️ Fermeture par le fond neutralisée pendant l'enregistrement (`saving`) : sinon on
  // démonte le composant au milieu de l'upload et un éventuel message d'erreur n'a plus
  // d'endroit où s'afficher.
  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="glass-strong rounded-2xl w-full max-w-sm shadow-glass-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-bony-border">
          <div>
            <h3 className="font-title text-slate-900 dark:text-bony-text flex items-center gap-2">
              <Camera size={18} className="text-bony-orange" /> Photo du groupe
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-bony-muted mt-0.5">{convName}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-700 dark:hover:text-bony-text transition disabled:opacity-40"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          {!cropSrc ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
              className={`h-44 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${dragging ? 'border-bony-orange bg-bony-orange/10' : 'border-slate-300 dark:border-bony-border hover:border-bony-orange/60 hover:bg-slate-50 dark:hover:bg-white/3'}`}
            >
              <Upload size={32} className={`transition-colors ${dragging ? 'text-bony-orange' : 'text-slate-400'}`} />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-bony-text">Glisser une photo ici</p>
                <p className="text-[11px] text-slate-500 dark:text-bony-muted mt-0.5">ou cliquer pour parcourir</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1">jpg, png, gif, webp — max 5 Mo</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative h-64 rounded-xl overflow-hidden bg-black">
                <Cropper
                  image={cropSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false}
                  onCropChange={setCrop} onZoomChange={setZoom}
                  onCropComplete={(_: unknown, pixels: CropArea) => setCroppedAreaPixels(pixels)}
                />
              </div>
              <div className="flex items-center gap-3">
                <ZoomIn size={14} className="text-slate-400 shrink-0" />
                <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="flex-1 accent-bony-orange" />
              </div>
              <button onClick={() => setCropSrc(null)} disabled={saving} className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-bony-text transition underline disabled:opacity-40">
                Choisir une autre photo
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
          <div className="flex gap-2 pt-1">
            {cropSrc && (
              <button onClick={handleValidate} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-bony-gradient text-white text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-60">
                <Check size={16} /> {saving ? 'Enregistrement…' : 'Valider'}
              </button>
            )}
            {hasExisting && (
              <button onClick={handleDelete} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-sm font-bold hover:bg-red-500/20 transition flex items-center justify-center gap-2 disabled:opacity-60">
                <Trash2 size={16} /> {saving ? 'Suppression…' : 'Supprimer la photo'}
              </button>
            )}
            {!cropSrc && !hasExisting && (
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 text-sm font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition">Annuler</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ========================
// --- MAIN COMPONENT ---
// ========================
const Chat: React.FC = () => {
  const { user: me } = useAuth();
  const isExternal = me?.role === 'External';

  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menuMsgId, setMenuMsgId] = useState<string | null>(null);
  // Sélecteur de réactions, pour le tactile : la rangée d'emojis directe est
  // réservée au desktop (`hidden md:flex` plus bas) — cinq emojis en permanence à
  // côté de chaque message serait illisible sur 320 px. Même mécanisme que
  // `menuMsgId` plutôt qu'un second système de popover.
  const [reactMsgId, setReactMsgId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);

  // Modal: 'none' | 'choice' | 'private' | 'group'
  const [showNewModal, setShowNewModal] = useState<'none' | 'choice' | 'private' | 'group'>('none');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);

  // Group members panel
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [tempGroupName, setTempGroupName] = useState('');

  // Group avatar modal
  const [showGroupAvatarModal, setShowGroupAvatarModal] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const activeConvIdRef = useRef<string | null>(null);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  // Chargement initial + abonnement au store partagé (source unique des
  // conversations) + listeners socket pour les messages de la conv ouverte.
  useEffect(() => {
    db.getUsers().then(setUsers).catch(() => {});
    const s = getSocket() ?? connectSocket(); // idempotent
    const sync = () => setConversations(applyOverlay(chatStore.getConversations()));
    const unsub = chatStore.subscribe(sync);
    sync(); // état courant immédiat (le store peut déjà être peuplé par le connect)
    // Refresh REST : le socket recharge aussi au connect, mais ceci garantit le
    // chargement même en arrivant directement sur la page.
    db.getConversations().then(c => chatStore.setConversations(c)).catch(() => {});

    if (!s) return unsub;

    const onNew = (msg: ChatMessage) => {
      if (msg.conversationId !== activeConvIdRef.current) return;
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      // Je regarde cette conversation : mon compteur non-lu retombe à 0.
      if (msg.senderId !== me?.id) {
        emitWithAck('chat:conversation:read', { conversationId: msg.conversationId }).catch(() => {});
      }
    };
    const onUpdated = (msg: ChatMessage) => {
      if (msg.conversationId !== activeConvIdRef.current) return;
      setMessages(prev => prev.map(m => (m.id === msg.id ? msg : m)));
    };
    // Reconnexion réseau : recharge l'historique de la conversation ouverte.
    const onReconnect = () => {
      const id = activeConvIdRef.current;
      if (id) db.getMessages(id).then(setMessages).catch(() => {});
    };
    s.on('chat:message:new', onNew);
    s.on('chat:message:updated', onUpdated);
    window.addEventListener('gearbox-chat-reconnected', onReconnect);
    return () => {
      unsub();
      s.off('chat:message:new', onNew);
      s.off('chat:message:updated', onUpdated);
      window.removeEventListener('gearbox-chat-reconnected', onReconnect);
    };
  }, []);

  // Temps réel de la liste des utilisateurs (les messages, eux, passent déjà
  // par les listeners chat:* ci-dessus) : un nouveau collègue devient
  // sélectionnable dans une conversation sans rechargement.
  useRealtimeSync(RT_EVENTS.users, () => { db.getUsers().then(setUsers).catch(() => {}); });

  // Auto-ouverture de la 1re conversation visible une fois la liste chargée.
  useEffect(() => {
    if (activeConvId || !me || conversations.length === 0) return;
    const visible = filterVisible(conversations);
    if (visible.length > 0) openConversation(visible[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, activeConvId, me]);

  // Purge des photos de groupe base64 de l'ancien mécanisme localStorage
  // (`gearbox_conv_avatar_<id>`), remplacé le 06/08/2026 par `ChatConversation.avatarUrl`.
  //
  // ⚠️ AUCUNE reprise vers le serveur, et c'est un choix : la photo est PARTAGÉE, or
  // chaque poste en a sa propre version et rien ne dit laquelle est la bonne — le
  // premier qui ouvrirait le Chat imposerait la sienne au groupe, le suivant
  // l'écraserait. Et une migration déclenchée au chargement n'est pas sérialisable
  // entre deux onglets (c'est le défaut de `migrateEquipmentIfNeeded`, en pire : ici la
  // cible est un champ partagé, pas une ligne à soi). Même arbitrage que pour la date
  // de naissance, qui n'a pas été reprise non plus.
  //
  // Bloc purement local, sans appel réseau, supprimable dans quelques mois.
  useEffect(() => {
    // Snapshot des clés AVANT suppression : itérer sur les index de localStorage en le
    // mutant saute une clé sur deux.
    Object.keys(localStorage)
      .filter(k => k.startsWith('gearbox_conv_avatar_'))
      .forEach(k => localStorage.removeItem(k));
  }, []);

  // Filter conversations visible to the current user
  const filterVisible = (all: ChatConversation[]): ChatConversation[] => {
    if (!me) return [];
    return all.filter(c => {
      if (c.type === 'general') return !isExternal;
      return c.participants.includes(me.id);
    });
  };

  const myConvs = useMemo(() => filterVisible(conversations), [conversations, me?.id, isExternal]);

  const getConvMembers = useCallback((conv: ChatConversation): User[] => {
    if (conv.type === 'general') return users;
    return conv.participants.map(pid => users.find(u => u.id === pid)).filter(Boolean) as User[];
  }, [users]);

  const getConvName = (conv: ChatConversation): string => {
    if (conv.name) return conv.name;
    if (conv.type === 'general') return 'Chat Général';
    const others = getConvMembers(conv).filter(u => u.id !== me?.id);
    if (others.length === 0) return 'Conversation';
    return others.map(u => u.name).join(', ');
  };

  const openConversation = async (id: string, all?: ChatConversation[]) => {
    const convList = all || conversations;
    const conv = convList.find(c => c.id === id);
    if (!conv || !me) return;
    // Sécurité : External ne voit pas le général ; non-participant ne voit pas privé/groupe.
    if (conv.type === 'general' && isExternal) return;
    if (conv.type !== 'general' && !conv.participants.includes(me.id)) return;

    setActiveConvId(id);
    setReplyTo(null);
    setEditingId(null);
    setShowMembersPanel(false);
    try {
      setMessages(await db.getMessages(id));
    } catch {
      setMessages([]);
    }
    // Marquage lu via socket : le backend remet le compteur à 0 et diffuse
    // chat:conversation:updated (le store met à jour la liste + le badge Sidebar).
    emitWithAck('chat:conversation:read', { conversationId: id }).catch(() => {});
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleSelectConv = (id: string) => {
    openConversation(id);
    setShowMobileChat(true);
  };

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;
  const activeMembers = activeConv ? getConvMembers(activeConv) : [];
  const isGroupAdmin = !!(activeConv?.type === 'group' && me && (activeConv.adminIds ?? []).includes(me.id));

  const unreadCount = (conv: ChatConversation) => conv.unreadCounts?.[me?.id ?? ''] ?? 0;

  // ---- SEND ----
  // `piece` porte le nom et le poids d'origine d'une pièce jointe : le fichier sur le
  // serveur est renommé en uuid, donc sans ça on ne saurait plus quoi afficher.
  const sendMessage = useCallback((
    content: string,
    type: 'text' | 'image' | 'file' = 'text',
    piece?: { fileName: string; fileSize: number }
  ) => {
    if (!activeConvId || !me || !content.trim()) return;
    const replyToId = replyTo?.id;
    setReplyTo(null);
    setInput('');
    // Envoi via socket : l'ajout à la liste se fait à la réception de
    // chat:message:new (l'émetteur est dans la room et reçoit sa diffusion).
    // Le backend gère identité/timestamp/unread/lastMessage. Erreur via l'ack.
    emitWithAck('chat:message:send', { conversationId: activeConvId, content, type, replyToId, ...piece })
      .catch(err => alert(err instanceof Error ? err.message : "Échec de l'envoi du message."));
  }, [activeConvId, me, replyTo]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  // ---- HAUTEUR DE LA BARRE DE SAISIE ----
  // Un `<textarea rows={1}>` ne grandit JAMAIS tout seul : sans ce calcul, un message
  // de plusieurs lignes défilait à l'intérieur de la hauteur d'une seule ligne, et le
  // plafond `max-h-32` de la classe était du code mort (jamais atteint).
  // On passe par un effet sur `input` plutôt que par `onChange` pour couvrir du même
  // coup le collage, l'insertion programmatique, et la REMISE À ZÉRO après envoi —
  // sans quoi la barre resterait haute une fois le message parti.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // 'auto' d'abord : sans ça `scrollHeight` ne peut jamais REDESCENDRE, il reste
    // celui de la hauteur déjà imposée.
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [input]);

  // ---- EDIT ----
  const startEdit = (msg: ChatMessage) => { setEditingId(msg.id); setEditContent(msg.content); setMenuMsgId(null); };
  const saveEdit = () => {
    if (!editingId || !editContent.trim()) return;
    const messageId = editingId;
    const content = editContent;
    setEditingId(null);
    // Mise à jour reçue via chat:message:updated (auteur uniquement, côté serveur).
    emitWithAck('chat:message:edit', { messageId, content })
      .catch(err => alert(err instanceof Error ? err.message : 'Échec de la modification.'));
  };

  // ---- DELETE ----
  const deleteMsg = (id: string) => {
    if (!confirm('Supprimer ce message ?')) return;
    setMenuMsgId(null);
    // Suppression (soft delete) reçue via chat:message:updated (auteur uniquement).
    emitWithAck('chat:message:delete', { messageId: id })
      .catch(err => alert(err instanceof Error ? err.message : 'Échec de la suppression.'));
  };

  // ---- REACTION ----
  const toggleReaction = (msgId: string, emoji: string) => {
    if (!me) return;
    // Toggle géré côté serveur ; mise à jour reçue via chat:message:updated.
    emitWithAck('chat:message:react', { messageId: msgId, emoji })
      .catch(err => alert(err instanceof Error ? err.message : 'Échec de la réaction.'));
  };

  // ---- PIN ----
  const togglePin = (convId: string) => {
    if (!me) return;
    // HORS PÉRIMÈTRE — overlay client-only (aucun événement backend pour l'épingle).
    const conv = conversations.find(c => c.id === convId);
    const currentPinned = conv?.pinnedBy ?? [];
    const pinned = currentPinned.includes(me.id);
    updateOverlay(convId, {
      pinnedBy: pinned ? currentPinned.filter(id => id !== me.id) : [...currentPinned, me.id]
    });
    setConversations(applyOverlay(chatStore.getConversations()));
  };

  // ---- SOURDINE ----
  // ⚠️ NE PAS calquer sur togglePin ci-dessus : l'épinglage est un overlay
  // localStorage, alors que la sourdine doit passer par le SERVEUR, seul à
  // décider d'envoyer ou non une notification push. Bénéfice : elle est
  // synchronisée entre tous les appareils, et le `chat:conversation:updated`
  // renvoyé par le serveur met l'interface à jour tout seul.
  //
  // La sourdine coupe le push, PAS le compteur non-lu (comportement Messenger).
  const toggleMute = (convId: string) => {
    if (!me) return;
    const conv = conversations.find(c => c.id === convId);
    const enSourdine = (conv?.mutedBy ?? []).includes(me.id);
    emitWithAck('chat:conversation:mute', { conversationId: convId, muted: !enSourdine })
      .catch(() => alert('Échec de la mise en sourdine (serveur injoignable ?).'));
  };

  // ---- PIÈCES JOINTES ----
  // Upload préalable (POST /api/uploads/chat) puis le message socket transporte
  // l'URL (plus de base64). Tous formats acceptés depuis le 05/08/2026 : une image
  // s'affiche dans le fil, tout le reste devient une carte de pièce jointe.
  const handleAttachment = async (file: File) => {
    if (file.size > MAX_UPLOAD_SIZE) {
      alert(`Fichier trop lourd (max ${MAX_UPLOAD_SIZE / 1024 / 1024} Mo).`);
      return;
    }
    // Un fichier vide passerait le contrôle de taille mais produirait un message
    // inutilisable (et `content` vide est refusé par le serveur).
    if (file.size === 0) { alert('Fichier vide.'); return; }
    try {
      const url = await db.uploadFile('chat', file);
      const estImage = CHAT_IMAGE_TYPES.includes(file.type);
      sendMessage(url, estImage ? 'image' : 'file', { fileName: file.name, fileSize: file.size });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Échec de l'envoi du fichier.");
    }
  };

  // Coller : on prend le premier fichier quel qu'il soit, plus seulement une image.
  const handlePaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files as FileList)[0];
    if (file) { e.preventDefault(); handleAttachment(file); }
  };

  // ---- NEW PRIVATE CONVERSATION ----
  const startPrivateConv = async (userId: string) => {
    if (!me) return;
    const existing = conversations.find(
      c => c.type === 'private' && c.participants.length === 2 &&
        c.participants.includes(me.id) && c.participants.includes(userId)
    );
    if (existing) { handleSelectConv(existing.id); setShowNewModal('none'); return; }
    try {
      // Création via REST (idempotence privée gérée serveur). Le backend émet
      // chat:conversation:created -> le store l'ajoute ; on ouvre tout de suite.
      const conv = await db.createConversation({ type: 'private', participants: [me.id, userId] });
      chatStore.upsertConversation(conv);
      setShowNewModal('none');
      setShowMobileChat(true);
      openConversation(conv.id, [conv]);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Échec de la création de la conversation.');
    }
  };

  // ---- CREATE GROUP ----
  const createGroup = async () => {
    if (!me || !newGroupName.trim() || newGroupMembers.length < 2) return;
    try {
      const conv = await db.createConversation({
        type: 'group',
        name: newGroupName.trim(),
        participants: [...new Set([me.id, ...newGroupMembers])],
        adminIds: [me.id]
      });
      chatStore.upsertConversation(conv);
      setShowNewModal('none');
      setNewGroupName('');
      setNewGroupMembers([]);
      setShowMobileChat(true);
      openConversation(conv.id, [conv]);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Échec de la création du groupe.');
    }
  };

  // ---- GROUP MANAGEMENT (HORS PÉRIMÈTRE — overlay client-only, aucun backend) ----
  const addMemberToGroup = (userId: string) => {
    if (!activeConv || activeConv.type !== 'group') return;
    if (activeConv.participants.includes(userId)) return;
    updateOverlay(activeConv.id, { participants: [...activeConv.participants, userId] });
    setConversations(applyOverlay(chatStore.getConversations()));
  };

  const removeMemberFromGroup = (userId: string) => {
    if (!activeConv || activeConv.type !== 'group' || !me || userId === me.id) return;
    updateOverlay(activeConv.id, { participants: activeConv.participants.filter(id => id !== userId) });
    setConversations(applyOverlay(chatStore.getConversations()));
  };

  const renameGroup = () => {
    if (!activeConv || !tempGroupName.trim()) return;
    updateOverlay(activeConv.id, { name: tempGroupName.trim() });
    setConversations(applyOverlay(chatStore.getConversations()));
    setEditingGroupName(false);
  };

  // ---- SORTED SECTIONS ----
  const sortByDate = (a: ChatConversation, b: ChatConversation) => {
    const aPin = a.pinnedBy.includes(me?.id ?? '');
    const bPin = b.pinnedBy.includes(me?.id ?? '');
    if (aPin !== bPin) return aPin ? -1 : 1;
    return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '');
  };

  const generalConvs = myConvs.filter(c => c.type === 'general');
  const groupConvs = myConvs.filter(c => c.type === 'group').sort(sortByDate);
  const privateConvs = myConvs.filter(c => c.type === 'private').sort(sortByDate);

  const groupedMessages = useMemo(() =>
    messages.reduce<{ day: string; msgs: ChatMessage[] }[]>((acc, msg) => {
      const day = dayLabel(msg.timestamp);
      const last = acc[acc.length - 1];
      if (last && last.day === day) last.msgs.push(msg);
      else acc.push({ day, msgs: [msg] });
      return acc;
    }, []),
  [messages]);

  // Users for private modal (all except me)
  const usersForPrivate = users.filter(u => u.id !== me?.id);
  // Users for group modal (non-External only)
  const usersForGroup = users.filter(u => u.id !== me?.id && u.role !== 'External');
  // Users not yet in active group
  const membersNotInGroup = activeConv?.type === 'group'
    ? usersForGroup.filter(u => !activeConv.participants.includes(u.id))
    : [];

  // ========================
  // RENDER
  // ========================
  return (
    // Un clic n'importe où referme le menu d'un message ET le sélecteur de
    // réactions — ce dernier suit la même règle, sinon il resterait ouvert.
    <div className="flex h-full overflow-hidden text-bony-text" onClick={() => { setMenuMsgId(null); setReactMsgId(null); }}>

      {/* ===== LEFT: CONVERSATION LIST ===== */}
      <div className={`${showMobileChat ? 'hidden md:flex' : 'flex'} w-full md:w-[280px] md:min-w-[280px] border-r border-bony-border flex-col glass-strong h-full shrink-0`}>

        <div className="h-16 flex items-center justify-between px-4 border-b border-bony-border shrink-0">
          <h2 className="font-title text-lg text-bony-text flex items-center gap-2">
            <div className="p-1.5 bg-bony-orange/10 rounded-lg">
              <MessageSquare size={18} className="text-bony-orange" />
            </div>
            Chat
          </h2>
          <button
            onClick={() => setShowNewModal(isExternal ? 'private' : 'choice')}
            className="p-2 rounded-lg hover:bg-bony-gradient hover:text-white text-bony-orange border border-bony-orange/30 transition-all"
            title="Nouvelle conversation"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pb-4">

          {/* GÉNÉRAL */}
          {!isExternal && generalConvs.length > 0 && (
            <>
              <SectionLabel label="Général" />
              {generalConvs.map(conv => {
                const isActive = conv.id === activeConvId;
                const pinned = conv.pinnedBy.includes(me?.id ?? '');
                const muted = (conv.mutedBy ?? []).includes(me?.id ?? '');
                const unread = unreadCount(conv);
                const members = getConvMembers(conv);
                return (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl cursor-pointer transition-all ${isActive ? 'bg-bony-gradient text-white shadow-lg shadow-bony-orange/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}
                    onClick={() => handleSelectConv(conv.id)}
                  >
                    <div className="relative shrink-0">
                      <ConvAvatar conv={conv} members={members} meId={me!.id} isActive={isActive} size={38} />
                      {pinned && <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-bony-orange rounded-full flex items-center justify-center"><Star size={8} className="text-white fill-white" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-bony-text'}`}>{getConvName(conv)}</span>
                        {conv.lastMessageAt && <span className={`text-[9px] ml-1 shrink-0 ${isActive ? 'text-white/70' : 'text-bony-muted'}`}>{relativeTime(conv.lastMessageAt)}</span>}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-[10px] truncate ${isActive ? 'text-white/70' : 'text-bony-muted'}`}>{conv.lastMessage ?? 'Aucun message'}</p>
                        {unread > 0 && <span className="ml-1 shrink-0 min-w-[18px] h-[18px] bg-bony-orange text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">{unread > 99 ? '99+' : unread}</span>}
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); toggleMute(conv.id); }} title={muted ? 'Réactiver les notifications' : 'Mettre en sourdine'} className={`shrink-0 p-1 rounded transition-opacity ${muted ? 'opacity-100 text-bony-orange' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'} ${isActive && !muted ? 'text-white/70 hover:text-white' : muted ? '' : 'text-slate-400 hover:text-bony-orange'}`}>
                      {muted ? <BellOff size={13} /> : <Bell size={13} />}
                    </button>
                    <button onClick={e => { e.stopPropagation(); togglePin(conv.id); }} className={`shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded transition-opacity ${isActive ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-bony-orange'}`}>
                      {pinned ? <StarOff size={13} /> : <Star size={13} />}
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* GROUPES */}
          {!isExternal && (
            <>
              <SectionLabel label={`Groupes${groupConvs.length > 0 ? ` (${groupConvs.length})` : ''}`} />
              {groupConvs.length === 0
                ? <p className="text-[10px] text-bony-muted px-5 pb-1">Aucun groupe</p>
                : groupConvs.map(conv => {
                    const isActive = conv.id === activeConvId;
                    const pinned = conv.pinnedBy.includes(me?.id ?? '');
                    const muted = (conv.mutedBy ?? []).includes(me?.id ?? '');
                    const unread = unreadCount(conv);
                    const members = getConvMembers(conv);
                    return (
                      <div
                        key={conv.id}
                        className={`group flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl cursor-pointer transition-all ${isActive ? 'bg-bony-gradient text-white shadow-lg shadow-bony-orange/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}
                        onClick={() => handleSelectConv(conv.id)}
                      >
                        <div className="relative shrink-0">
                          <ConvAvatar conv={conv} members={members} meId={me!.id} isActive={isActive} size={38} />
                          {pinned && <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-bony-orange rounded-full flex items-center justify-center"><Star size={8} className="text-white fill-white" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-bony-text'}`}>{getConvName(conv)}</span>
                            {conv.lastMessageAt && <span className={`text-[9px] ml-1 shrink-0 ${isActive ? 'text-white/70' : 'text-bony-muted'}`}>{relativeTime(conv.lastMessageAt)}</span>}
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className={`text-[10px] truncate ${isActive ? 'text-white/70' : 'text-bony-muted'}`}>{conv.lastMessage ?? 'Aucun message'}</p>
                            {unread > 0 && <span className="ml-1 shrink-0 min-w-[18px] h-[18px] bg-bony-orange text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">{unread > 99 ? '99+' : unread}</span>}
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); toggleMute(conv.id); }} title={muted ? 'Réactiver les notifications' : 'Mettre en sourdine'} className={`shrink-0 p-1 rounded transition-opacity ${muted ? 'opacity-100 text-bony-orange' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'} ${isActive && !muted ? 'text-white/70 hover:text-white' : muted ? '' : 'text-slate-400 hover:text-bony-orange'}`}>
                          {muted ? <BellOff size={13} /> : <Bell size={13} />}
                        </button>
                        <button onClick={e => { e.stopPropagation(); togglePin(conv.id); }} className={`shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded transition-opacity ${isActive ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-bony-orange'}`}>
                          {pinned ? <StarOff size={13} /> : <Star size={13} />}
                        </button>
                      </div>
                    );
                  })
              }
            </>
          )}

          {/* MESSAGES PRIVÉS */}
          <SectionLabel label={`Messages Privés${privateConvs.length > 0 ? ` (${privateConvs.length})` : ''}`} />
          {privateConvs.length === 0
            ? <p className="text-[10px] text-bony-muted px-5 pb-1">Aucune conversation privée</p>
            : privateConvs.map(conv => {
                const isActive = conv.id === activeConvId;
                const pinned = conv.pinnedBy.includes(me?.id ?? '');
                const muted = (conv.mutedBy ?? []).includes(me?.id ?? '');
                const unread = unreadCount(conv);
                const members = getConvMembers(conv);
                return (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl cursor-pointer transition-all ${isActive ? 'bg-bony-gradient text-white shadow-lg shadow-bony-orange/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}
                    onClick={() => handleSelectConv(conv.id)}
                  >
                    <div className="relative shrink-0">
                      <ConvAvatar conv={conv} members={members} meId={me!.id} isActive={isActive} size={38} />
                      {pinned && <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-bony-orange rounded-full flex items-center justify-center"><Star size={8} className="text-white fill-white" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-bony-text'}`}>{getConvName(conv)}</span>
                        {conv.lastMessageAt && <span className={`text-[9px] ml-1 shrink-0 ${isActive ? 'text-white/70' : 'text-bony-muted'}`}>{relativeTime(conv.lastMessageAt)}</span>}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-[10px] truncate ${isActive ? 'text-white/70' : 'text-bony-muted'}`}>{conv.lastMessage ?? 'Aucun message'}</p>
                        {unread > 0 && <span className="ml-1 shrink-0 min-w-[18px] h-[18px] bg-bony-orange text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">{unread > 99 ? '99+' : unread}</span>}
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); toggleMute(conv.id); }} title={muted ? 'Réactiver les notifications' : 'Mettre en sourdine'} className={`shrink-0 p-1 rounded transition-opacity ${muted ? 'opacity-100 text-bony-orange' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'} ${isActive && !muted ? 'text-white/70 hover:text-white' : muted ? '' : 'text-slate-400 hover:text-bony-orange'}`}>
                      {muted ? <BellOff size={13} /> : <Bell size={13} />}
                    </button>
                    <button onClick={e => { e.stopPropagation(); togglePin(conv.id); }} className={`shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded transition-opacity ${isActive ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-bony-orange'}`}>
                      {pinned ? <StarOff size={13} /> : <Star size={13} />}
                    </button>
                  </div>
                );
              })
          }
        </div>
      </div>

      {/* ===== RIGHT: CHAT WINDOW ===== */}
      <div className={`${showMobileChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full overflow-hidden`}>
        {activeConv ? (
          <>
            {/* Header */}
            <div className="h-16 flex items-center gap-3 px-4 border-b border-bony-border glass-strong shrink-0 z-10">
              <button className="md:hidden p-2 rounded-lg text-slate-400 hover:text-bony-text hover:bg-white/5 transition" onClick={() => setShowMobileChat(false)}>
                <ArrowLeft size={20} />
              </button>

              {activeConv.type === 'group' ? (
                <button
                  onClick={() => setShowGroupAvatarModal(true)}
                  className="relative group/ga shrink-0 rounded-full focus:outline-none"
                  title="Changer la photo du groupe"
                >
                  <ConvAvatar conv={activeConv} members={activeMembers} meId={me!.id} size={36} />
                  {/* ⚠️ Deux indices distincts, et non le même rendu aux deux tailles.
                      L'overlay au survol ne dit RIEN sur tactile (il n'y a pas de
                      survol), or la photo est désormais collective : il faut un indice
                      permanent. Mais réutiliser l'overlay en `opacity-100` sous `md`
                      masquerait la photo derrière un voile noir en permanence — le
                      contraire du but. D'où un petit badge d'angle sur mobile, et
                      l'overlay au survol conservé tel quel sur ordinateur. */}
                  <div className="md:hidden absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-bony-orange flex items-center justify-center pointer-events-none ring-2 ring-bony-panel">
                    <Camera size={9} className="text-white" />
                  </div>
                  <div className="hidden md:flex absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover/ga:opacity-100 transition-opacity items-center justify-center pointer-events-none">
                    <Camera size={13} className="text-white" />
                  </div>
                </button>
              ) : (
                <ConvAvatar conv={activeConv} members={activeMembers} meId={me!.id} size={36} />
              )}

              <div className="flex-1 min-w-0">
                {editingGroupName ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="text-sm font-bold bg-bony-dark border border-bony-orange rounded px-2 py-0.5 text-bony-text outline-none w-44"
                      value={tempGroupName}
                      onChange={e => setTempGroupName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameGroup(); if (e.key === 'Escape') setEditingGroupName(false); }}
                      autoFocus
                    />
                    <button onClick={renameGroup} className="p-1 bg-bony-gradient text-white rounded"><Check size={14} /></button>
                    <button onClick={() => setEditingGroupName(false)} className="p-1 text-slate-400 hover:text-bony-text"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-sm text-bony-text truncate">{getConvName(activeConv)}</p>
                    {isGroupAdmin && (
                      <button
                        onClick={() => { setTempGroupName(getConvName(activeConv)); setEditingGroupName(true); }}
                        className="text-slate-400 hover:text-bony-orange transition shrink-0"
                        title="Renommer le groupe"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-bony-muted">
                  {activeConv.type === 'general'
                    ? `${users.length} membres`
                    : activeConv.type === 'group'
                      ? `${activeMembers.length} membre${activeMembers.length > 1 ? 's' : ''}`
                      : 'Conversation privée'}
                </p>
              </div>

              {/* Participant avatar stack */}
              <div className="hidden sm:flex items-center shrink-0">
                {activeMembers.slice(0, 5).map((u, i) => (
                  <div key={u.id} className={i > 0 ? '-ml-2' : ''} title={u.name}>
                    <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={26} />
                  </div>
                ))}
                {activeMembers.length > 5 && (
                  <div className="-ml-2 w-[26px] h-[26px] rounded-full bg-bony-dark border border-bony-border flex items-center justify-center text-[8px] font-bold text-bony-muted">
                    +{activeMembers.length - 5}
                  </div>
                )}
              </div>

              {/* Membres button (group only) */}
              {activeConv.type === 'group' && (
                <button
                  onClick={() => setShowMembersPanel(!showMembersPanel)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition border shrink-0 ${showMembersPanel ? 'bg-bony-orange text-white border-bony-orange' : 'text-slate-500 border-bony-border hover:border-bony-orange hover:text-bony-text'}`}
                >
                  <Users size={14} />
                  <span className="hidden lg:inline">Membres</span>
                </button>
              )}
            </div>

            {/* Content row: messages + members panel */}
            <div className="flex flex-1 overflow-hidden relative">

              {/* Messages */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-1">
                  {groupedMessages.map(({ day, msgs }) => (
                    <div key={day}>
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-bony-border" />
                        <span className="text-[10px] font-bold text-bony-muted uppercase tracking-widest px-2">{day}</span>
                        <div className="flex-1 h-px bg-bony-border" />
                      </div>
                      {msgs.map(msg => {
                        const isMe = msg.senderId === me?.id;
                        const isDeleted = msg.deleted;
                        return (
                          <div
                            key={msg.id}
                            className={`group flex gap-2 mb-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                            onDoubleClick={() => { if (isMe && !isDeleted) startEdit(msg); }}
                          >
                            {!isMe && <Avatar userId={msg.senderId} name={msg.senderName} color={msg.senderColor} size={28} />}
                            <div className={`flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                              {!isMe && !isDeleted && (
                                <span className="text-[10px] text-bony-muted mb-1 ml-1 font-bold">
                                  {msg.senderName} · {msgTime(msg.timestamp)}
                                </span>
                              )}
                              {msg.replyToId && !isDeleted && (() => {
                                const parent = messages.find(m => m.id === msg.replyToId);
                                if (!parent) return null;
                                return (
                                  <div className="text-[10px] text-bony-muted border-l-2 border-bony-orange pl-2 mb-1 truncate max-w-full italic">
                                    {parent.senderName}: {parent.type === 'image'
                                      ? '📷 Image'
                                      : parent.type === 'file'
                                        ? `📎 ${parent.fileName ?? 'Pièce jointe'}`
                                        : parent.content.slice(0, 60)}
                                  </div>
                                );
                              })()}

                              {isDeleted ? (
                                <div className="px-3 py-2 rounded-xl text-[11px] italic text-bony-muted bg-bony-panel border border-bony-border">
                                  Message supprimé
                                </div>
                              ) : editingId === msg.id ? (
                                <div className="flex items-center gap-2 w-full">
                                  <textarea
                                    className="flex-1 bg-bony-dark border border-bony-orange rounded-lg px-3 py-2 text-sm text-bony-text outline-none resize-none min-h-[60px]"
                                    value={editContent}
                                    onChange={e => setEditContent(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditingId(null); }}
                                    autoFocus
                                  />
                                  <button onClick={saveEdit} className="p-2 rounded-lg bg-bony-gradient text-white"><Check size={16} /></button>
                                  <button onClick={() => setEditingId(null)} className="p-2 rounded-lg text-slate-400 hover:text-bony-text"><X size={16} /></button>
                                </div>
                              ) : (
                                <div className="relative">
                                  {/* Pièce jointe purgée (180 j) : le message reste, le
                                      fichier a disparu du disque. On l'annonce au lieu
                                      d'afficher une image cassée ou un lien mort. */}
                                  {msg.fileExpiredAt ? (
                                    <div className="px-3 py-2 rounded-xl border border-dashed border-bony-border bg-bony-panel/60 flex items-center gap-2 max-w-[260px]">
                                      <FileX size={16} className="text-bony-muted shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-bony-muted truncate">
                                          {msg.fileName ?? 'Pièce jointe'}
                                        </p>
                                        <p className="text-[10px] text-bony-muted/70">Pièce jointe expirée</p>
                                      </div>
                                    </div>
                                  ) : msg.type === 'image' ? (
                                    <img
                                      src={msg.content} alt="img"
                                      className="max-w-[240px] max-h-[200px] rounded-xl object-cover cursor-pointer border border-bony-border hover:opacity-90 transition"
                                      onClick={() => setLightboxSrc(msg.content)}
                                    />
                                  ) : msg.type === 'file' ? (
                                    // `download` porte le nom d'origine : le fichier sur
                                    // le serveur s'appelle <uuid>.<ext>, l'utilisateur
                                    // récupérerait sinon un nom illisible. Le serveur
                                    // force déjà le téléchargement pour tout ce qui
                                    // n'est pas image ou PDF (en-tête Content-Disposition).
                                    <a
                                      href={msg.content}
                                      download={msg.fileName ?? undefined}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-2.5 rounded-xl border border-bony-border bg-bony-panel hover:border-bony-orange/60 transition-colors flex items-center gap-2.5 max-w-[260px] group/pj"
                                    >
                                      <span className="w-8 h-8 rounded-lg bg-bony-orange/10 flex items-center justify-center shrink-0">
                                        <FileText size={16} className="text-bony-orange" />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block text-[11px] font-bold text-bony-text truncate" title={msg.fileName ?? ''}>
                                          {msg.fileName ?? 'Pièce jointe'}
                                        </span>
                                        <span className="block text-[10px] text-bony-muted">
                                          {formatPoids(msg.fileSize) || 'Fichier'}
                                        </span>
                                      </span>
                                      <Download size={14} className="text-bony-muted group-hover/pj:text-bony-orange transition-colors shrink-0" />
                                    </a>
                                  ) : (
                                    <div
                                      className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${isMe ? 'text-white rounded-br-sm' : 'bg-bony-panel border border-bony-border text-bony-text rounded-bl-sm'}`}
                                      style={isMe ? { background: 'linear-gradient(135deg, #f75632, #8f12ab)' } : {}}
                                    >
                                      {msg.content}
                                      {msg.edited && <span className="text-[9px] opacity-60 ml-1">(modifié)</span>}
                                    </div>
                                  )}
                                  {/* Hover actions */}
                                  <div className={`absolute ${isMe ? 'right-full mr-1' : 'left-full ml-1'} top-0 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10`}>
                                    {/* Desktop : la rangée d'emojis directement, un clic suffit. */}
                                    <div className="hidden md:flex items-center gap-1">
                                      {REACTIONS.map(emoji => (
                                        <button key={emoji} onClick={e => { e.stopPropagation(); toggleReaction(msg.id, emoji); }} className="text-sm hover:scale-125 transition-transform leading-none">{emoji}</button>
                                      ))}
                                    </div>
                                    {/* Mobile : un bouton qui ouvre le sélecteur. Réagir était tout
                                        simplement impossible au doigt jusqu'au 05/08/2026 — la barre
                                        d'actions était bien visible, mais la rangée d'emojis
                                        qu'elle contient est en `hidden md:flex`. */}
                                    <div className="relative md:hidden">
                                      <button
                                        onClick={e => { e.stopPropagation(); setReactMsgId(reactMsgId === msg.id ? null : msg.id); }}
                                        className="p-1 rounded text-slate-400 hover:text-bony-orange transition"
                                        title="Réagir"
                                      >
                                        <SmilePlus size={13} />
                                      </button>
                                      {reactMsgId === msg.id && (
                                        <div className="glass-menu absolute right-0 top-full mt-1 rounded-full z-20 flex items-center gap-1 px-2 py-1.5" onClick={e => e.stopPropagation()}>
                                          {REACTIONS.map(emoji => (
                                            <button
                                              key={emoji}
                                              onClick={e => { e.stopPropagation(); toggleReaction(msg.id, emoji); setReactMsgId(null); }}
                                              className="text-lg leading-none min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full active:bg-white/10"
                                            >
                                              {emoji}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <button onClick={e => { e.stopPropagation(); setReplyTo(msg); inputRef.current?.focus(); }} className="p-1 rounded text-slate-400 hover:text-bony-blue transition" title="Répondre">
                                      <Reply size={13} />
                                    </button>
                                    {isMe && (
                                      <div className="relative">
                                        <button onClick={e => { e.stopPropagation(); setMenuMsgId(menuMsgId === msg.id ? null : msg.id); }} className="p-1 rounded text-slate-400 hover:text-bony-text transition">
                                          <MoreHorizontal size={13} />
                                        </button>
                                        {menuMsgId === msg.id && (
                                          <div className="glass-menu absolute right-0 top-full mt-1 rounded-lg z-20 min-w-[120px] overflow-hidden" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => startEdit(msg)} className="w-full flex items-center gap-2 px-3 py-2 text-xs whitespace-nowrap hover:bg-white/5 text-bony-text"><Pencil size={12} /> Modifier</button>
                                            <button onClick={() => deleteMsg(msg.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs whitespace-nowrap hover:bg-red-500/10 text-red-400"><Trash2 size={12} /> Supprimer</button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Reactions */}
                              {!isDeleted && (Object.entries(msg.reactions) as [string, string[]][]).some(([, ids]) => ids.length > 0) && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {(Object.entries(msg.reactions) as [string, string[]][])
                                    .filter(([, ids]) => ids.length > 0)
                                    .map(([emoji, ids]) => (
                                      <button
                                        key={emoji}
                                        onClick={() => toggleReaction(msg.id, emoji)}
                                        className={`text-[11px] px-1.5 py-0.5 rounded-full border transition-all flex items-center gap-0.5 ${me && ids.includes(me.id) ? 'bg-bony-orange/20 border-bony-orange/50 text-bony-orange' : 'bg-bony-panel border-bony-border text-bony-muted hover:border-bony-orange/30'}`}
                                      >
                                        {emoji} {ids.length}
                                      </button>
                                    ))}
                                </div>
                              )}

                              {isMe && !isDeleted && (
                                <span className="text-[9px] text-bony-muted mt-0.5 mr-1">{msgTime(msg.timestamp)}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>

                {/* Bandeau de saisie : l'aperçu de réponse ET la barre vivent sur UNE
                    seule surface. Ils étaient auparavant sur deux fonds distincts
                    (`bg-bony-panel/50` sous `glass-strong`) séparés par une bordure,
                    d'où un empilement discordant.
                    ⚠️ Paddings en longhand uniquement : un raccourci `p-*` préfixé
                    `md:` écrase un `pt-*`/`pb-*` écrit après lui (l'ordre des règles
                    générées par la CDN Play ne suit pas l'ordre des classes). */}
                <div className="px-3 md:px-4 pt-2 pb-2 md:pb-2.5 border-t border-bony-border glass-strong shrink-0">
                  {/* Aperçu du message auquel on répond */}
                  {replyTo && (
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                      <Reply size={14} className="text-bony-orange shrink-0" />
                      <div className="flex-1 text-[11px] text-bony-muted truncate">
                        <span className="font-bold text-bony-orange">{replyTo.senderName}</span>
                        {' '}— {replyTo.type === 'image'
                          ? '📷 Image'
                          : replyTo.type === 'file'
                            ? `📎 ${replyTo.fileName ?? 'Pièce jointe'}`
                            : replyTo.content.slice(0, 80)}
                      </div>
                      <button
                        onClick={() => setReplyTo(null)}
                        title="Annuler la réponse"
                        className="shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-[26px] md:min-w-[26px] rounded-lg text-slate-400 hover:text-bony-text hover:bg-white/5 transition"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {/* ⚠️ `items-end` est voulu : quand le champ grandit sur plusieurs
                      lignes, les pictos restent ancrés en bas (comportement de toute
                      messagerie). L'alignement sur une seule ligne ne vient donc PAS
                      d'`items-center` mais du fait que les quatre enfants ont la même
                      hauteur — voir le commentaire du textarea. */}
                  <div className="flex items-end gap-2 bg-[var(--bg-input)] border border-bony-border rounded-2xl px-2 py-1 focus-within:border-bony-orange/60 transition-colors">
                    {/* Deux déclencheurs pour un seul champ : l'un filtre sur les
                        images (usage le plus courant, la galerie s'ouvre directement
                        sur mobile), l'autre accepte tout. Le contrôle réel est côté
                        serveur, `accept` n'est qu'un confort de sélection. */}
                    <button onClick={() => imageInputRef.current?.click()} className="shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px] rounded-xl text-slate-400 hover:text-bony-orange hover:bg-white/5 transition" title="Envoyer une image">
                      <Image size={18} />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px] rounded-xl text-slate-400 hover:text-bony-orange hover:bg-white/5 transition" title="Joindre un fichier (tous formats, max 100 Mo)">
                      <Paperclip size={18} />
                    </button>
                    {/* ⚠️ PAS de `min-h-[...]` ici, et c'est tout le correctif de
                        l'alignement. Tailwind Preflight met `padding: 0` sur un
                        textarea, dont le texte se colle EN HAUT de sa boîte (un
                        `<input>`, lui, centre le sien). Une hauteur minimale laissait
                        donc ~13 px de vide mort sous le texte, et comme le textarea
                        était l'élément le plus haut il imposait la hauteur de la
                        rangée : texte, pictos et bouton d'envoi finissaient sur trois
                        médianes différentes. On donne à la place un padding vertical
                        SYMÉTRIQUE, qui centre la ligne dans sa propre boîte et cale
                        cette boîte sur la hauteur des boutons (24 px de `leading-6`
                        + 2×10 = 44 px au doigt, + 2×6 = 36 px sur ordinateur). */}
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder="Écrire un message… (Entrée pour envoyer)"
                      className="flex-1 min-w-0 bg-transparent text-sm text-bony-text outline-none resize-none overflow-y-auto max-h-32 py-[10px] md:py-1.5 leading-6 placeholder-bony-muted"
                      rows={1}
                    />
                    <button onClick={() => sendMessage(input)} disabled={!input.trim()} className="shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px] rounded-xl bg-bony-gradient text-white disabled:opacity-30 transition-opacity hover:opacity-90" title="Envoyer">
                      <Send size={16} />
                    </button>
                  </div>
                  <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleAttachment(f); e.target.value = ''; }} />
                  <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleAttachment(f); e.target.value = ''; }} />
                </div>
              </div>

              {/* Members panel (group) */}
              {showMembersPanel && activeConv.type === 'group' && (
                <div className="absolute inset-y-0 right-0 z-30 w-full max-w-[300px] md:static md:w-60 md:max-w-none border-l border-bony-border gx-glass-panel flex flex-col shrink-0 overflow-hidden">
                  <div className="p-4 border-b border-bony-border flex items-center justify-between shrink-0">
                    <h4 className="font-title text-sm text-bony-text">Membres ({activeMembers.length})</h4>
                    <button onClick={() => setShowMembersPanel(false)} className="text-slate-400 hover:text-bony-text"><X size={16} /></button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                    {activeMembers.map(u => {
                      const isAdmin = (activeConv.adminIds ?? []).includes(u.id);
                      const isSelf = u.id === me?.id;
                      return (
                        <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition">
                          <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={30} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-bony-text truncate">{u.name}{isSelf ? ' (moi)' : ''}</p>
                            <p className="text-[9px] text-bony-muted">{isAdmin ? '★ Admin' : u.role}</p>
                          </div>
                          {isGroupAdmin && !isAdmin && !isSelf && (
                            <button onClick={() => removeMemberFromGroup(u.id)} className="text-red-400 hover:text-red-500 transition p-1 rounded" title="Retirer">
                              <UserMinus size={13} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {isGroupAdmin && membersNotInGroup.length > 0 && (
                    <div className="p-3 border-t border-bony-border shrink-0">
                      <p className="text-[9px] font-bold text-bony-muted uppercase tracking-widest mb-2">Ajouter</p>
                      <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                        {membersNotInGroup.map(u => (
                          <button
                            key={u.id}
                            onClick={() => addMemberToGroup(u.id)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition text-left"
                          >
                            <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={26} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-bony-text truncate">{u.name}</p>
                              <p className="text-[9px] text-bony-muted">{u.role}</p>
                            </div>
                            <UserPlus size={13} className="text-bony-orange shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-bony-muted">
            <MessageSquare size={48} className="opacity-20" />
            <p className="text-sm">Sélectionne une conversation</p>
          </div>
        )}
      </div>

      {/* ===== MODAL: CHOICE ===== */}
      {showNewModal === 'choice' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-strong rounded-xl w-full max-w-xs shadow-glass-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-bony-border">
              <h3 className="font-title text-bony-text text-sm">Nouvelle conversation</h3>
              <button onClick={() => setShowNewModal('none')} className="text-slate-400 hover:text-bony-text"><X size={18} /></button>
            </div>
            <div className="p-3 space-y-2">
              <button
                onClick={() => setShowNewModal('private')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-left"
              >
                <div className="w-10 h-10 rounded-full bg-bony-orange/10 flex items-center justify-center shrink-0">
                  <MessageSquare size={18} className="text-bony-orange" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-bony-text">Message privé</p>
                  <p className="text-[10px] text-bony-muted">Conversation 1-to-1</p>
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
              <button
                onClick={() => setShowNewModal('group')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-left"
              >
                <div className="w-10 h-10 rounded-full bg-bony-violet/10 flex items-center justify-center shrink-0">
                  <Users size={18} className="text-bony-violet" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-bony-text">Groupe de travail</p>
                  <p className="text-[10px] text-bony-muted">2 membres minimum</p>
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: PRIVATE ===== */}
      {showNewModal === 'private' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-strong rounded-xl w-full max-w-sm shadow-glass-lg">
            <div className="flex items-center justify-between p-4 border-b border-bony-border">
              <div className="flex items-center gap-2">
                {!isExternal && (
                  <button onClick={() => setShowNewModal('choice')} className="text-slate-400 hover:text-bony-text"><ArrowLeft size={18} /></button>
                )}
                <h3 className="font-title text-bony-text text-sm">Message privé</h3>
              </div>
              <button onClick={() => setShowNewModal('none')} className="text-slate-400 hover:text-bony-text"><X size={18} /></button>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto custom-scrollbar">
              {usersForPrivate.map(u => {
                const existing = conversations.find(
                  c => c.type === 'private' && c.participants.includes(me!.id) && c.participants.includes(u.id)
                );
                return (
                  <button
                    key={u.id}
                    onClick={() => startPrivateConv(u.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition"
                  >
                    <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={34} />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold text-bony-text">{u.name}</p>
                      <p className="text-[10px] text-bony-muted">{u.role}</p>
                    </div>
                    {existing && <span className="text-[9px] font-bold text-bony-orange shrink-0">EXISTANTE</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: GROUP ===== */}
      {showNewModal === 'group' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-strong rounded-xl w-full max-w-sm shadow-glass-lg">
            <div className="flex items-center justify-between p-4 border-b border-bony-border">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowNewModal('choice')} className="text-slate-400 hover:text-bony-text"><ArrowLeft size={18} /></button>
                <h3 className="font-title text-bony-text text-sm">Nouveau groupe</h3>
              </div>
              <button onClick={() => { setShowNewModal('none'); setNewGroupMembers([]); setNewGroupName(''); }} className="text-slate-400 hover:text-bony-text"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-bony-muted uppercase tracking-widest mb-1.5 block">Nom du groupe</label>
                <input
                  className="w-full bg-bony-dark border border-bony-border rounded-lg px-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange transition"
                  placeholder="Ex: Équipe comm Renault…"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-bony-muted uppercase tracking-widest mb-2 block">
                  Membres ({newGroupMembers.length} sélectionné{newGroupMembers.length > 1 ? 's' : ''}) — 2 minimum
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {usersForGroup.map(u => {
                    const selected = newGroupMembers.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => setNewGroupMembers(prev =>
                          selected ? prev.filter(id => id !== u.id) : [...prev, u.id]
                        )}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition text-left border ${selected ? 'bg-bony-orange/10 border-bony-orange/30' : 'border-transparent hover:bg-white/5'}`}
                      >
                        <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={30} />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-bony-text">{u.name}</p>
                          <p className="text-[10px] text-bony-muted">{u.role}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition shrink-0 ${selected ? 'bg-bony-orange border-bony-orange' : 'border-bony-border'}`}>
                          {selected && <Check size={11} className="text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={createGroup}
                disabled={!newGroupName.trim() || newGroupMembers.length < 2}
                className="w-full py-2.5 bg-bony-gradient text-white font-bold rounded-xl disabled:opacity-40 transition hover:opacity-90 text-sm"
              >
                Créer le groupe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== LIGHTBOX ===== */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="Agrandissement" className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" />
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightboxSrc(null)}><X size={28} /></button>
        </div>
      )}

      {/* ===== GROUP AVATAR MODAL ===== */}
      {showGroupAvatarModal && activeConv?.type === 'group' && (
        <GroupAvatarCropModal
          convId={activeConv.id}
          convName={getConvName(activeConv)}
          currentAvatarUrl={activeConv.avatarUrl}
          onClose={() => setShowGroupAvatarModal(false)}
        />
      )}
    </div>
  );
};

export default Chat;
