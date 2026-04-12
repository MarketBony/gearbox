
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatConversation, ChatMessage, User } from '../types';
import { db } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageSquare, Plus, Send, Star, StarOff, ArrowLeft,
  MoreHorizontal, Pencil, Trash2, X, Image, Reply, Check
} from 'lucide-react';
import Avatar from '../components/Avatar';

const REACTIONS = ['👍', '❤️', '😂', '😮'];
const MAX_IMAGE_SIZE = 300 * 1024; // 300 KB

// --- Helpers ---
const genId = () => Math.random().toString(36).substr(2, 9);

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

// --- Main Component ---
const Chat: React.FC = () => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menuMsgId, setMenuMsgId] = useState<string | null>(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load
  useEffect(() => {
    db.getUsers().then(setUsers);
    refreshConversations();
  }, []);

  const refreshConversations = () => {
    const convs = db.getConversations();
    setConversations(convs);
    if (!activeConvId && convs.length > 0) {
      const isExternal = me?.role === 'External';
      const allowed = isExternal ? convs.filter(c => c.type !== 'general') : convs;
      if (allowed.length > 0) openConversation(allowed[0].id, convs);
    }
  };

  const openConversation = (id: string, convs?: ChatConversation[]) => {
    const list = convs || conversations;
    setActiveConvId(id);
    const msgs = db.getMessages(id);
    setMessages(msgs);
    setReplyTo(null);
    setEditingId(null);
    // Mark as read
    const updated = list.map(c =>
      c.id === id
        ? { ...c, unreadCounts: { ...c.unreadCounts, [me!.id]: 0 } }
        : c
    );
    db.saveConversations(updated);
    setConversations(updated);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleSelectConv = (id: string) => {
    openConversation(id);
    setShowMobileChat(true);
  };

  // Active conversation
  const activeConv = conversations.find(c => c.id === activeConvId);

  const getConvName = (conv: ChatConversation) => {
    if (conv.name) return conv.name;
    const other = conv.participants.filter(id => id !== me?.id);
    const u = users.find(u => u.id === other[0]);
    return u?.name ?? 'Conversation';
  };

  const getConvColor = (conv: ChatConversation) => {
    if (conv.type === 'general') return '#f75632';
    const other = conv.participants.filter(id => id !== me?.id)[0];
    return users.find(u => u.id === other)?.avatarColor ?? '#64748b';
  };

  const getConvUserId = (conv: ChatConversation) => {
    if (conv.type === 'general') return 'general';
    return conv.participants.filter(id => id !== me?.id)[0] ?? 'general';
  };

  const unreadCount = (conv: ChatConversation) =>
    conv.unreadCounts?.[me?.id ?? ''] ?? 0;

  // Send message
  const sendMessage = useCallback((content: string, type: 'text' | 'image' = 'text') => {
    if (!activeConvId || !me || !content.trim()) return;
    const msg: ChatMessage = {
      id: genId(),
      conversationId: activeConvId,
      senderId: me.id,
      senderName: me.name,
      senderColor: me.avatarColor ?? '#64748b',
      content,
      type,
      timestamp: new Date().toISOString(),
      edited: false,
      deleted: false,
      reactions: {},
      replyToId: replyTo?.id,
    };
    const updated = [...messages, msg];
    db.saveMessages(activeConvId, updated);
    setMessages(updated);

    // Update conversation preview + unread for others
    const updatedConvs = conversations.map(c => {
      if (c.id !== activeConvId) return c;
      const newUnread = { ...c.unreadCounts };
      const participants = c.type === 'general' ? users.map(u => u.id) : c.participants;
      participants.forEach(uid => {
        if (uid !== me.id) newUnread[uid] = (newUnread[uid] ?? 0) + 1;
      });
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Edit
  const startEdit = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
    setMenuMsgId(null);
  };

  const saveEdit = () => {
    if (!editingId || !editContent.trim()) return;
    const updated = messages.map(m =>
      m.id === editingId
        ? { ...m, content: editContent, edited: true, editedAt: new Date().toISOString() }
        : m
    );
    db.saveMessages(activeConvId!, updated);
    setMessages(updated);
    setEditingId(null);
    setEditContent('');
  };

  // Delete
  const deleteMsg = (id: string) => {
    if (!confirm('Supprimer ce message ?')) return;
    const updated = messages.map(m =>
      m.id === id ? { ...m, deleted: true, content: '' } : m
    );
    db.saveMessages(activeConvId!, updated);
    setMessages(updated);
    setMenuMsgId(null);
  };

  // Reaction
  const toggleReaction = (msgId: string, emoji: string) => {
    if (!me) return;
    const updated = messages.map(m => {
      if (m.id !== msgId) return m;
      const existing = m.reactions[emoji] ?? [];
      const has = existing.includes(me.id);
      return {
        ...m,
        reactions: {
          ...m.reactions,
          [emoji]: has ? existing.filter(id => id !== me.id) : [...existing, me.id]
        }
      };
    });
    db.saveMessages(activeConvId!, updated);
    setMessages(updated);
  };

  // Pin / unpin conversation
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

  // Image upload
  const handleImage = (file: File) => {
    if (file.size > MAX_IMAGE_SIZE) {
      alert('Image trop lourde (max 300 Ko). Compresse-la avant envoi.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => sendMessage(e.target?.result as string, 'image');
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files as FileList).find((f: File) => f.type.startsWith('image/'));
    if (file) { e.preventDefault(); handleImage(file); }
  };

  // Start new private conversation
  const startPrivateConv = (userId: string) => {
    if (!me) return;
    const existing = conversations.find(
      c => c.type === 'private' && c.participants.includes(me.id) && c.participants.includes(userId)
    );
    if (existing) { handleSelectConv(existing.id); setShowNewConv(false); return; }
    const newConv: ChatConversation = {
      id: genId(), type: 'private',
      participants: [me.id, userId],
      pinnedBy: [], unreadCounts: {}
    };
    const updated = [...conversations, newConv];
    db.saveConversations(updated);
    setConversations(updated);
    openConversation(newConv.id, updated);
    setShowNewConv(false);
    setShowMobileChat(true);
  };

  // Sort conversations: pinned first, then by lastMessageAt
  // External users cannot see the general channel
  const visibleConversations = me?.role === 'External'
    ? conversations.filter(c => c.type !== 'general')
    : conversations;

  const sortedConvs = [...visibleConversations].sort((a, b) => {
    const aPin = a.pinnedBy.includes(me?.id ?? '');
    const bPin = b.pinnedBy.includes(me?.id ?? '');
    if (aPin !== bPin) return aPin ? -1 : 1;
    if (a.id === 'general') return -1;
    if (b.id === 'general') return 1;
    return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '');
  });

  // Group messages by day
  const groupedMessages = messages.reduce<{ day: string; msgs: ChatMessage[] }[]>((acc, msg) => {
    const day = dayLabel(msg.timestamp);
    const last = acc[acc.length - 1];
    if (last && last.day === day) last.msgs.push(msg);
    else acc.push({ day, msgs: [msg] });
    return acc;
  }, []);

  const replyMsg = replyTo ? messages.find(m => m.id === replyTo.id) : null;

  return (
    <div className="flex h-screen overflow-hidden bg-bony-dark text-bony-text" onClick={() => setMenuMsgId(null)}>

      {/* ===== LEFT: CONVERSATION LIST ===== */}
      <div className={`${showMobileChat ? 'hidden md:flex' : 'flex'} w-full md:w-[280px] md:min-w-[280px] border-r border-bony-border flex-col bg-bony-panel h-full shrink-0`}>

        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-bony-border shrink-0">
          <h2 className="font-title text-lg text-bony-text flex items-center gap-2">
            <div className="p-1.5 bg-bony-orange/10 rounded-lg">
              <MessageSquare size={18} className="text-bony-orange" />
            </div>
            Chat
          </h2>
          <button
            onClick={() => setShowNewConv(true)}
            className="p-2 rounded-lg hover:bg-bony-gradient hover:text-white text-bony-orange border border-bony-orange/30 transition-all"
            title="Nouvelle conversation"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
          {sortedConvs.map(conv => {
            const isActive = conv.id === activeConvId;
            const pinned = conv.pinnedBy.includes(me?.id ?? '');
            const unread = unreadCount(conv);
            const color = getConvColor(conv);
            return (
              <div
                key={conv.id}
                className={`group flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl cursor-pointer transition-all relative ${
                  isActive
                    ? 'bg-bony-gradient text-white shadow-lg shadow-bony-orange/20'
                    : 'hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
                onClick={() => handleSelectConv(conv.id)}
              >
                <div className="relative shrink-0">
                  <Avatar userId={getConvUserId(conv)} name={getConvName(conv)} color={isActive ? '#ffffff44' : color} size={38} />
                  {pinned && (
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-bony-orange rounded-full flex items-center justify-center">
                      <Star size={8} className="text-white fill-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-bony-text'}`}>
                      {getConvName(conv)}
                    </span>
                    {conv.lastMessageAt && (
                      <span className={`text-[9px] ml-1 shrink-0 ${isActive ? 'text-white/70' : 'text-bony-muted'}`}>
                        {relativeTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-[10px] truncate ${isActive ? 'text-white/70' : 'text-bony-muted'}`}>
                      {conv.lastMessage ?? 'Aucun message'}
                    </p>
                    {unread > 0 && (
                      <span className="ml-1 shrink-0 min-w-[18px] h-[18px] bg-bony-orange text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </div>
                {/* Pin button */}
                <button
                  onClick={e => { e.stopPropagation(); togglePin(conv.id); }}
                  className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity ${isActive ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-bony-orange'}`}
                >
                  {pinned ? <StarOff size={13} /> : <Star size={13} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== RIGHT: CHAT WINDOW ===== */}
      <div className={`${showMobileChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full overflow-hidden`}>
        {activeConv ? (
          <>
            {/* Chat header */}
            <div className="h-16 flex items-center gap-3 px-4 border-b border-bony-border bg-bony-panel shrink-0">
              <button
                className="md:hidden p-2 rounded-lg text-slate-400 hover:text-bony-text hover:bg-white/5 transition"
                onClick={() => setShowMobileChat(false)}
              >
                <ArrowLeft size={20} />
              </button>
              <Avatar userId={getConvUserId(activeConv)} name={getConvName(activeConv)} color={getConvColor(activeConv)} size={36} />
              <div>
                <p className="font-bold text-sm text-bony-text">{getConvName(activeConv)}</p>
                <p className="text-[10px] text-bony-muted">
                  {activeConv.type === 'general' ? `${users.length} membres` : 'Conversation privée'}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-1">
              {groupedMessages.map(({ day, msgs }) => (
                <div key={day}>
                  {/* Day separator */}
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-bony-border" />
                    <span className="text-[10px] font-bold text-bony-muted uppercase tracking-widest px-2">
                      {day}
                    </span>
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
                          {/* Sender name + time */}
                          {!isMe && !isDeleted && (
                            <span className="text-[10px] text-bony-muted mb-1 ml-1 font-bold">
                              {msg.senderName} · {msgTime(msg.timestamp)}
                            </span>
                          )}

                          {/* Reply preview */}
                          {msg.replyToId && !isDeleted && (() => {
                            const parent = messages.find(m => m.id === msg.replyToId);
                            if (!parent) return null;
                            return (
                              <div className={`text-[10px] text-bony-muted border-l-2 border-bony-orange pl-2 mb-1 truncate max-w-full italic`}>
                                {parent.senderName}: {parent.type === 'image' ? '📷 Image' : parent.content.slice(0, 60)}
                              </div>
                            );
                          })()}

                          {/* Bubble */}
                          {isDeleted ? (
                            <div className={`px-3 py-2 rounded-xl text-[11px] italic text-bony-muted bg-bony-panel border border-bony-border`}>
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
                                  src={msg.content}
                                  alt="img"
                                  className="max-w-[240px] max-h-[200px] rounded-xl object-cover cursor-pointer border border-bony-border hover:opacity-90 transition"
                                  onClick={() => setLightboxSrc(msg.content)}
                                />
                              ) : (
                                <div
                                  className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                    isMe
                                      ? 'text-white rounded-br-sm'
                                      : 'bg-bony-panel border border-bony-border text-bony-text rounded-bl-sm'
                                  }`}
                                  style={isMe ? { background: `linear-gradient(135deg, #f75632, #8f12ab)` } : {}}
                                >
                                  {msg.content}
                                  {msg.edited && <span className="text-[9px] opacity-60 ml-1">(modifié)</span>}
                                </div>
                              )}

                              {/* Action buttons on hover */}
                              <div className={`absolute ${isMe ? 'right-full mr-1' : 'left-full ml-1'} top-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                {/* Reactions */}
                                {REACTIONS.map(emoji => (
                                  <button
                                    key={emoji}
                                    onClick={e => { e.stopPropagation(); toggleReaction(msg.id, emoji); }}
                                    className="text-sm hover:scale-125 transition-transform leading-none"
                                    title={emoji}
                                  >{emoji}</button>
                                ))}
                                {/* Reply */}
                                <button
                                  onClick={e => { e.stopPropagation(); setReplyTo(msg); inputRef.current?.focus(); }}
                                  className="p-1 rounded text-slate-400 hover:text-bony-blue transition"
                                  title="Répondre"
                                >
                                  <Reply size={13} />
                                </button>
                                {/* My message menu */}
                                {isMe && (
                                  <div className="relative">
                                    <button
                                      onClick={e => { e.stopPropagation(); setMenuMsgId(menuMsgId === msg.id ? null : msg.id); }}
                                      className="p-1 rounded text-slate-400 hover:text-bony-text transition"
                                    >
                                      <MoreHorizontal size={13} />
                                    </button>
                                    {menuMsgId === msg.id && (
                                      <div className="absolute right-0 top-full mt-1 bg-bony-panel border border-bony-border rounded-lg shadow-xl z-20 min-w-[120px] overflow-hidden" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => startEdit(msg)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-bony-text">
                                          <Pencil size={12} /> Modifier
                                        </button>
                                        <button onClick={() => deleteMsg(msg.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-500/10 text-red-400">
                                          <Trash2 size={12} /> Supprimer
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Reactions display */}
                          {!isDeleted && (Object.entries(msg.reactions) as [string, string[]][]).some(([, ids]) => ids.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(Object.entries(msg.reactions) as [string, string[]][])
                                .filter(([, ids]) => ids.length > 0)
                                .map(([emoji, ids]) => (
                                  <button
                                    key={emoji}
                                    onClick={() => toggleReaction(msg.id, emoji)}
                                    className={`text-[11px] px-1.5 py-0.5 rounded-full border transition-all flex items-center gap-0.5 ${
                                      me && ids.includes(me.id)
                                        ? 'bg-bony-orange/20 border-bony-orange/50 text-bony-orange'
                                        : 'bg-bony-panel border-bony-border text-bony-muted hover:border-bony-orange/30'
                                    }`}
                                  >
                                    {emoji} {ids.length}
                                  </button>
                                ))}
                            </div>
                          )}

                          {/* Timestamp for own messages */}
                          {isMe && !isDeleted && (
                            <span className="text-[9px] text-bony-muted mt-0.5 mr-1">
                              {msgTime(msg.timestamp)}
                            </span>
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
                <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-bony-text">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-bony-border bg-bony-panel shrink-0">
              <div className="flex items-end gap-2 bg-bony-dark border border-bony-border rounded-xl px-3 py-2 focus-within:border-bony-orange transition-colors">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-slate-400 hover:text-bony-orange transition p-1 shrink-0 mb-0.5"
                  title="Envoyer une image"
                >
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
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className="p-2 rounded-lg bg-bony-gradient text-white disabled:opacity-30 shrink-0 mb-0.5 transition-opacity hover:opacity-90"
                >
                  <Send size={16} />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ''; }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-bony-muted">
            <MessageSquare size={48} className="opacity-20" />
            <p className="text-sm">Sélectionne une conversation</p>
          </div>
        )}
      </div>

      {/* ===== NEW CONVERSATION MODAL ===== */}
      {showNewConv && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bony-panel border border-bony-border rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-bony-border">
              <h3 className="font-title text-bony-text">Nouvelle conversation</h3>
              <button onClick={() => setShowNewConv(false)} className="text-slate-400 hover:text-bony-text">
                <X size={20} />
              </button>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto custom-scrollbar">
              {users.filter(u => u.id !== me?.id).map(u => (
                <button
                  key={u.id}
                  onClick={() => startPrivateConv(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition"
                >
                  <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={34} />
                  <div className="text-left">
                    <p className="text-sm font-bold text-bony-text">{u.name}</p>
                    <p className="text-[10px] text-bony-muted">{u.role}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== LIGHTBOX ===== */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc} alt="Agrandissement" className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" />
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightboxSrc(null)}>
            <X size={28} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Chat;
