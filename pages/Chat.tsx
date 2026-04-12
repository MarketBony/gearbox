
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChatConversation, ChatMessage, User } from '../types';
import { db } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageSquare, Plus, Send, Star, StarOff, ArrowLeft,
  MoreHorizontal, Pencil, Trash2, X, Image, Reply, Check,
  Users, UserPlus, UserMinus, ChevronRight, Hash
} from 'lucide-react';
import Avatar from '../components/Avatar';

const REACTIONS = ['👍', '❤️', '😂', '😮'];
const MAX_IMAGE_SIZE = 300 * 1024;
const genId = () => Math.random().toString(36).substr(2, 9);

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

  // Group
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    db.getUsers().then(setUsers);
    const all = db.getConversations();
    setConversations(all);
    // Auto-open first visible conv
    const visible = filterVisible(all);
    if (visible.length > 0) openConversation(visible[0].id, all);
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

  const openConversation = (id: string, all?: ChatConversation[]) => {
    const convList = all || conversations;
    const conv = convList.find(c => c.id === id);
    if (!conv || !me) return;
    // Security: External cannot see general; non-participants cannot see private/group
    if (conv.type === 'general' && isExternal) return;
    if (conv.type !== 'general' && !conv.participants.includes(me.id)) return;

    setActiveConvId(id);
    setMessages(db.getMessages(id));
    setReplyTo(null);
    setEditingId(null);
    setShowMembersPanel(false);

    // Mark as read
    const updated = convList.map(c =>
      c.id === id ? { ...c, unreadCounts: { ...c.unreadCounts, [me.id]: 0 } } : c
    );
    db.saveConversations(updated);
    setConversations(updated);
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
  const sendMessage = useCallback((content: string, type: 'text' | 'image' = 'text') => {
    if (!activeConvId || !me || !content.trim()) return;
    const msg: ChatMessage = {
      id: genId(),
      conversationId: activeConvId,
      senderId: me.id,
      senderName: me.name,
      senderColor: me.avatarColor ?? '#64748b',
      content, type,
      timestamp: new Date().toISOString(),
      edited: false, deleted: false, reactions: {},
      replyToId: replyTo?.id,
    };
    const updatedMsgs = [...messages, msg];
    db.saveMessages(activeConvId, updatedMsgs);
    setMessages(updatedMsgs);

    const updatedConvs = conversations.map(c => {
      if (c.id !== activeConvId) return c;
      const newUnread = { ...c.unreadCounts };
      const targets = c.type === 'general' ? users.map(u => u.id) : c.participants;
      targets.forEach(uid => { if (uid !== me.id) newUnread[uid] = (newUnread[uid] ?? 0) + 1; });
      newUnread[me.id] = 0;
      return { ...c, lastMessage: type === 'image' ? '📷 Image' : content.slice(0, 60), lastMessageAt: msg.timestamp, unreadCounts: newUnread };
    });
    db.saveConversations(updatedConvs);
    setConversations(updatedConvs);
    setReplyTo(null);
    setInput('');
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [activeConvId, me, messages, conversations, replyTo, users]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  // ---- EDIT ----
  const startEdit = (msg: ChatMessage) => { setEditingId(msg.id); setEditContent(msg.content); setMenuMsgId(null); };
  const saveEdit = () => {
    if (!editingId || !editContent.trim()) return;
    const updated = messages.map(m =>
      m.id === editingId ? { ...m, content: editContent, edited: true, editedAt: new Date().toISOString() } : m
    );
    db.saveMessages(activeConvId!, updated);
    setMessages(updated);
    setEditingId(null);
  };

  // ---- DELETE ----
  const deleteMsg = (id: string) => {
    if (!confirm('Supprimer ce message ?')) return;
    const updated = messages.map(m => m.id === id ? { ...m, deleted: true, content: '' } : m);
    db.saveMessages(activeConvId!, updated);
    setMessages(updated);
    setMenuMsgId(null);
  };

  // ---- REACTION ----
  const toggleReaction = (msgId: string, emoji: string) => {
    if (!me) return;
    const updated = messages.map(m => {
      if (m.id !== msgId) return m;
      const existing = m.reactions[emoji] ?? [];
      const has = existing.includes(me.id);
      return { ...m, reactions: { ...m.reactions, [emoji]: has ? existing.filter(id => id !== me.id) : [...existing, me.id] } };
    });
    db.saveMessages(activeConvId!, updated);
    setMessages(updated);
  };

  // ---- PIN ----
  const togglePin = (convId: string) => {
    if (!me) return;
    const updated = conversations.map(c => {
      if (c.id !== convId) return c;
      const pinned = c.pinnedBy.includes(me.id);
      return { ...c, pinnedBy: pinned ? c.pinnedBy.filter(id => id !== me.id) : [...c.pinnedBy, me.id] };
    });
    db.saveConversations(updated);
    setConversations(updated);
  };

  // ---- IMAGE ----
  const handleImage = (file: File) => {
    if (file.size > MAX_IMAGE_SIZE) { alert('Image trop lourde (max 300 Ko). Compresse-la avant envoi.'); return; }
    const reader = new FileReader();
    reader.onload = e => sendMessage(e.target?.result as string, 'image');
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files as FileList).find((f: File) => f.type.startsWith('image/'));
    if (file) { e.preventDefault(); handleImage(file); }
  };

  // ---- NEW PRIVATE CONVERSATION ----
  const startPrivateConv = (userId: string) => {
    if (!me) return;
    const existing = conversations.find(
      c => c.type === 'private' && c.participants.length === 2 &&
        c.participants.includes(me.id) && c.participants.includes(userId)
    );
    if (existing) { handleSelectConv(existing.id); setShowNewModal('none'); return; }
    const newConv: ChatConversation = {
      id: genId(), type: 'private',
      participants: [me.id, userId],
      pinnedBy: [], unreadCounts: {}
    };
    const updated = [...conversations, newConv];
    db.saveConversations(updated);
    setConversations(updated);
    openConversation(newConv.id, updated);
    setShowNewModal('none');
    setShowMobileChat(true);
  };

  // ---- CREATE GROUP ----
  const createGroup = () => {
    if (!me || !newGroupName.trim() || newGroupMembers.length < 2) return;
    const allMembers = [...new Set([me.id, ...newGroupMembers])];
    const newConv: ChatConversation = {
      id: genId(), type: 'group',
      name: newGroupName.trim(),
      participants: allMembers,
      adminIds: [me.id],
      pinnedBy: [], unreadCounts: {}
    };
    const updated = [...conversations, newConv];
    db.saveConversations(updated);
    setConversations(updated);
    openConversation(newConv.id, updated);
    setShowNewModal('none');
    setNewGroupName('');
    setNewGroupMembers([]);
    setShowMobileChat(true);
  };

  // ---- GROUP MANAGEMENT ----
  const addMemberToGroup = (userId: string) => {
    if (!activeConv || activeConv.type !== 'group') return;
    const updated = conversations.map(c =>
      c.id === activeConv.id ? { ...c, participants: [...c.participants, userId] } : c
    );
    db.saveConversations(updated);
    setConversations(updated);
  };

  const removeMemberFromGroup = (userId: string) => {
    if (!activeConv || activeConv.type !== 'group' || !me || userId === me.id) return;
    const updated = conversations.map(c =>
      c.id === activeConv.id ? { ...c, participants: c.participants.filter(id => id !== userId) } : c
    );
    db.saveConversations(updated);
    setConversations(updated);
  };

  const renameGroup = () => {
    if (!activeConv || !tempGroupName.trim()) return;
    const updated = conversations.map(c =>
      c.id === activeConv.id ? { ...c, name: tempGroupName.trim() } : c
    );
    db.saveConversations(updated);
    setConversations(updated);
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
    <div className="flex h-screen overflow-hidden bg-bony-dark text-bony-text" onClick={() => setMenuMsgId(null)}>

      {/* ===== LEFT: CONVERSATION LIST ===== */}
      <div className={`${showMobileChat ? 'hidden md:flex' : 'flex'} w-full md:w-[280px] md:min-w-[280px] border-r border-bony-border flex-col bg-bony-panel h-full shrink-0`}>

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
                    <button onClick={e => { e.stopPropagation(); togglePin(conv.id); }} className={`shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity ${isActive ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-bony-orange'}`}>
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
                        <button onClick={e => { e.stopPropagation(); togglePin(conv.id); }} className={`shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity ${isActive ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-bony-orange'}`}>
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
                    <button onClick={e => { e.stopPropagation(); togglePin(conv.id); }} className={`shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity ${isActive ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-bony-orange'}`}>
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
            <div className="h-16 flex items-center gap-3 px-4 border-b border-bony-border bg-bony-panel shrink-0 z-10">
              <button className="md:hidden p-2 rounded-lg text-slate-400 hover:text-bony-text hover:bg-white/5 transition" onClick={() => setShowMobileChat(false)}>
                <ArrowLeft size={20} />
              </button>

              <ConvAvatar conv={activeConv} members={activeMembers} meId={me!.id} size={36} />

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
            <div className="flex flex-1 overflow-hidden">

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
                                    {parent.senderName}: {parent.type === 'image' ? '📷 Image' : parent.content.slice(0, 60)}
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
                                  {msg.type === 'image' ? (
                                    <img
                                      src={msg.content} alt="img"
                                      className="max-w-[240px] max-h-[200px] rounded-xl object-cover cursor-pointer border border-bony-border hover:opacity-90 transition"
                                      onClick={() => setLightboxSrc(msg.content)}
                                    />
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
                                  <div className={`absolute ${isMe ? 'right-full mr-1' : 'left-full ml-1'} top-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10`}>
                                    {REACTIONS.map(emoji => (
                                      <button key={emoji} onClick={e => { e.stopPropagation(); toggleReaction(msg.id, emoji); }} className="text-sm hover:scale-125 transition-transform leading-none">{emoji}</button>
                                    ))}
                                    <button onClick={e => { e.stopPropagation(); setReplyTo(msg); inputRef.current?.focus(); }} className="p-1 rounded text-slate-400 hover:text-bony-blue transition" title="Répondre">
                                      <Reply size={13} />
                                    </button>
                                    {isMe && (
                                      <div className="relative">
                                        <button onClick={e => { e.stopPropagation(); setMenuMsgId(menuMsgId === msg.id ? null : msg.id); }} className="p-1 rounded text-slate-400 hover:text-bony-text transition">
                                          <MoreHorizontal size={13} />
                                        </button>
                                        {menuMsgId === msg.id && (
                                          <div className="absolute right-0 top-full mt-1 bg-bony-panel border border-bony-border rounded-lg shadow-xl z-20 min-w-[120px] overflow-hidden" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => startEdit(msg)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-bony-text"><Pencil size={12} /> Modifier</button>
                                            <button onClick={() => deleteMsg(msg.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-500/10 text-red-400"><Trash2 size={12} /> Supprimer</button>
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

                {/* Reply bar */}
                {replyTo && (
                  <div className="px-4 py-2 border-t border-bony-border bg-bony-panel/50 flex items-center gap-2 shrink-0">
                    <Reply size={14} className="text-bony-orange shrink-0" />
                    <div className="flex-1 text-[11px] text-bony-muted truncate">
                      <span className="font-bold text-bony-orange">{replyTo.senderName}</span>
                      {' '}— {replyTo.type === 'image' ? '📷 Image' : replyTo.content.slice(0, 80)}
                    </div>
                    <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-bony-text"><X size={14} /></button>
                  </div>
                )}

                {/* Input */}
                <div className="px-4 py-3 border-t border-bony-border bg-bony-panel shrink-0">
                  <div className="flex items-end gap-2 bg-bony-dark border border-bony-border rounded-xl px-3 py-2 focus-within:border-bony-orange transition-colors">
                    <button onClick={() => fileInputRef.current?.click()} className="text-slate-400 hover:text-bony-orange transition p-1 shrink-0 mb-0.5" title="Envoyer une image">
                      <Image size={18} />
                    </button>
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder="Écrire un message… (Entrée pour envoyer)"
                      className="flex-1 bg-transparent text-sm text-bony-text outline-none resize-none max-h-32 min-h-[36px] placeholder-bony-muted leading-relaxed"
                      rows={1}
                    />
                    <button onClick={() => sendMessage(input)} disabled={!input.trim()} className="p-2 rounded-lg bg-bony-gradient text-white disabled:opacity-30 shrink-0 mb-0.5 transition-opacity hover:opacity-90">
                      <Send size={16} />
                    </button>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ''; }} />
                </div>
              </div>

              {/* Members panel (group) */}
              {showMembersPanel && activeConv.type === 'group' && (
                <div className="w-60 border-l border-bony-border bg-bony-panel flex flex-col shrink-0 overflow-hidden">
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
          <div className="bg-bony-panel border border-bony-border rounded-xl w-full max-w-xs shadow-2xl overflow-hidden">
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
          <div className="bg-bony-panel border border-bony-border rounded-xl w-full max-w-sm shadow-2xl">
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
          <div className="bg-bony-panel border border-bony-border rounded-xl w-full max-w-sm shadow-2xl">
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
    </div>
  );
};

export default Chat;
