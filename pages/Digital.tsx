
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSessionState } from '../hooks/useSessionState';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import { SocialPost, SocialStatus, SocialNetwork, BrandType, ServiceType, SocialTarget, Site, PlaqueName, DigitalTags, ActivityLog } from '../types';
import { SOCIAL_STATUS_COLORS, BRANDS, SERVICES, PLAQUES_STRUCTURE, LOI_LOM_OPTIONS, SITES, BRAND_COLORS } from '../constants';
import { Globe, Lock, Plus, Save, Archive, Search, Filter, Image, Trash2, Check, ChevronDown, Link as LinkIcon, Calendar, ArrowUp, ArrowDown, Square, CheckSquare, LayoutList, X, ChevronLeft, ChevronRight, Instagram, Facebook, Linkedin, Youtube, MapPin, Video, Eye, AlignLeft, Clock, Settings, Edit2, AlertCircle, Download, Upload } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

type Tab = 'Calendrier Editorial' | 'Planning Digital' | 'Archives' | 'Gestion des TAGS';
type CalendarView = 'Mois' | 'Semaine';

// --- CONSTANTS ---
// Normalisation stricte pour éviter les espaces invisibles ou différences de casse
const LOCKED_NETWORKS = [
    'Instagram',
    'Story Instagram',
    'Facebook',
    'Story Facebook',
    'LinkedIn',
    'GMB',
    'TikTok',
    'YouTube'
];

// --- HELPER: DATE UTILS ---
// Parse "YYYY-MM-DD" en date locale sans décalage UTC
const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

// Convertit une Date locale en "YYYY-MM-DD" sans passer par UTC
const toLocalIso = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust so Monday is 1
    return new Date(date.setDate(diff));
};

// --- HELPER: NETWORK ICONS ---
const getSocialIcon = (network: string, size: number = 14) => {
    const n = network.toLowerCase().trim();
    if (n.includes('instagram')) return <Instagram size={size} className="text-[#E1306C]" />;
    if (n.includes('facebook')) return <Facebook size={size} className="text-[#1877F2]" />;
    if (n.includes('linkedin')) return <Linkedin size={size} className="text-[#0077B5]" />;
    if (n.includes('youtube')) return <Youtube size={size} className="text-[#FF0000]" />;
    if (n.includes('gmb')) return <MapPin size={size} className="text-[#4285F4]" />;
    if (n.includes('tiktok')) return <Video size={size} className="text-slate-900 dark:text-white" />;
    return <Globe size={size} className="text-slate-500" />;
};

// --- COMPONENT: VISUAL MULTI-SELECT (CHIPS) ---
interface VisualMultiSelectProps {
    label: string;
    options: string[];
    selected: string[];
    onChange: (newSelected: string[]) => void;
    disabled?: boolean;
    type?: 'brand' | 'default';
}

const VisualMultiSelect: React.FC<VisualMultiSelectProps> = ({ label, options, selected, onChange, disabled, type = 'default' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleOption = (opt: string) => {
        if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
        else onChange([...selected, opt]);
    };

    const removeItem = (e: React.MouseEvent, item: string) => {
        e.stopPropagation();
        onChange(selected.filter(s => s !== item));
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            <div 
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`min-h-[32px] w-full bg-black/5 dark:bg-black/40 border border-bony-border rounded px-2 py-1 cursor-pointer hover:border-slate-400 dark:hover:border-white/20 transition-colors flex flex-wrap gap-1 items-center ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {selected.length > 0 ? (
                    selected.map(item => {
                        let badgeStyle = "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600";
                        if (type === 'brand') {
                             const colorClass = BRAND_COLORS[item as BrandType];
                             if (colorClass) badgeStyle = colorClass;
                        }

                        return (
                            <span key={item} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeStyle} shadow-sm`}>
                                {item}
                                {!disabled && <X size={10} className="cursor-pointer hover:opacity-70" onClick={(e) => removeItem(e, item)}/>}
                            </span>
                        );
                    })
                ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-600 italic">{label}</span>
                )}
                <div className="flex-1"></div>
                <ChevronDown size={12} className="text-slate-500 dark:text-slate-600"/>
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-[#1a1a1a] border border-bony-border rounded-lg shadow-2xl z-50 p-2 max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in duration-100">
                    <div className="flex flex-col gap-1">
                        {options.map(opt => {
                            const isSelected = selected.includes(opt);
                            return (
                                <button
                                    key={opt}
                                    onClick={() => toggleOption(opt)}
                                    className={`flex items-center gap-2 px-2 py-2 rounded text-xs text-left transition-colors ${isSelected ? 'bg-bony-orange/10 dark:bg-white/10 text-bony-orange dark:text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'border-bony-orange bg-bony-orange' : 'border-slate-300 dark:border-slate-600'}`}>
                                        {isSelected && <Check size={10} className="text-white"/>}
                                    </div>
                                    {opt}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- MEDIA TYPES & HELPERS ---
interface PostMediaItem {
    id: string;
    postId: string;
    name: string;
    type: string;
    size: number;
    base64: string;
    uploadedAt: string;
    uploadedBy: string;
}

const MEDIA_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const MEDIA_ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const mediaKey = (postId: string) => `gearbox_media_${postId}`;
const loadPostMedias = (postId: string): PostMediaItem[] => {
    try { return JSON.parse(localStorage.getItem(mediaKey(postId)) ?? '[]'); } catch { return []; }
};
const savePostMedias = (postId: string, items: PostMediaItem[]) =>
    localStorage.setItem(mediaKey(postId), JSON.stringify(items));

// --- COMPONENT: MEDIA MANAGER MODAL ---
interface MediaManagerModalProps {
    post: SocialPost;
    canEdit: boolean;
    uploaderName: string;
    onClose: () => void;
    onCountChange: (postId: string, count: number) => void;
}

const MediaManagerModal: React.FC<MediaManagerModalProps> = ({ post, canEdit, uploaderName, onClose, onCountChange }) => {
    const [medias, setMedias] = useState<PostMediaItem[]>(() => loadPostMedias(post.id));
    const [dragging, setDragging] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const persist = (items: PostMediaItem[]) => {
        savePostMedias(post.id, items);
        setMedias(items);
        onCountChange(post.id, items.length);
    };

    const processFiles = (files: FileList | File[]) => {
        setError(null);
        Array.from(files).forEach(file => {
            if (!MEDIA_ACCEPTED.includes(file.type)) {
                setError(`Format non supporté : "${file.name}". Accepté : JPG, PNG, GIF, WebP.`);
                return;
            }
            if (file.size > MEDIA_MAX_SIZE) {
                setError(`"${file.name}" dépasse la limite de 2 Mo (${(file.size / 1024 / 1024).toFixed(1)} Mo). Compresse le fichier avant envoi.`);
                return;
            }
            const reader = new FileReader();
            reader.onload = e => {
                const item: PostMediaItem = {
                    id: Math.random().toString(36).substr(2, 9),
                    postId: post.id,
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    base64: e.target!.result as string,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: uploaderName,
                };
                setMedias(prev => {
                    const updated = [...prev, item];
                    savePostMedias(post.id, updated);
                    onCountChange(post.id, updated.length);
                    return updated;
                });
            };
            reader.readAsDataURL(file);
        });
    };

    const handleDelete = (id: string) => {
        if (!confirm('Supprimer ce média définitivement ?')) return;
        persist(medias.filter(m => m.id !== id));
    };

    const handleDownload = (m: PostMediaItem) => {
        const a = document.createElement('a');
        a.href = m.base64;
        a.download = m.name;
        a.click();
    };

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-bony-panel border border-bony-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-bony-border shrink-0">
                        <h3 className="font-title text-bony-text flex items-center gap-2 text-base">
                            <div className="p-1.5 bg-bony-orange/10 rounded-lg">
                                <Image size={16} className="text-bony-orange" />
                            </div>
                            Médias
                            <span className="text-bony-muted font-sans text-sm font-normal truncate max-w-[280px]">
                                — {post.title || 'Publication sans titre'}
                            </span>
                        </h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-bony-text transition p-1 rounded">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Drop zone (only if canEdit) */}
                    {canEdit && (
                        <div
                            className={`mx-5 mt-4 border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer select-none ${dragging ? 'border-bony-orange bg-bony-orange/5 scale-[1.01]' : 'border-bony-border hover:border-bony-orange/50 hover:bg-bony-orange/5'}`}
                            onDragOver={e => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={e => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files); }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload size={24} className={`mx-auto mb-2 transition-colors ${dragging ? 'text-bony-orange' : 'text-slate-400'}`} />
                            <p className="text-sm text-bony-muted">
                                Glisse des images ici ou{' '}
                                <span className="text-bony-orange font-bold">clique pour parcourir</span>
                            </p>
                            <p className="text-[10px] text-bony-muted mt-1 uppercase tracking-widest">JPG · PNG · GIF · WebP — max 2 Mo</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={MEDIA_ACCEPTED.join(',')}
                                multiple
                                className="hidden"
                                onChange={e => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
                            />
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="mx-5 mt-3 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-start gap-2 shrink-0">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Gallery */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 pt-4">
                        {medias.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-10 text-bony-muted">
                                <Image size={36} className="opacity-20" />
                                <p className="text-sm">Aucun média pour ce post</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {medias.map(m => (
                                    <div key={m.id} className="group relative rounded-xl overflow-hidden border border-bony-border bg-bony-dark aspect-square">
                                        <img
                                            src={m.base64}
                                            alt={m.name}
                                            className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition"
                                            onClick={() => setLightboxSrc(m.base64)}
                                        />
                                        {/* Overlay on hover */}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/55 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                            <button
                                                onClick={e => { e.stopPropagation(); handleDownload(m); }}
                                                className="p-2 bg-bony-panel/90 rounded-lg text-bony-blue hover:bg-bony-panel transition"
                                                title="Télécharger"
                                            >
                                                <Download size={16} />
                                            </button>
                                            {canEdit && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleDelete(m.id); }}
                                                    className="p-2 bg-bony-panel/90 rounded-lg text-red-400 hover:bg-red-500/20 transition"
                                                    title="Supprimer"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                        {/* Filename bar */}
                                        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/80 to-transparent text-[9px] text-white truncate">
                                            {m.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-bony-border shrink-0 flex items-center justify-between">
                        <span className="text-[10px] text-bony-muted uppercase tracking-widest">
                            {medias.length} média{medias.length !== 1 ? 's' : ''}
                        </span>
                        <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-bony-text transition">
                            Fermer
                        </button>
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {lightboxSrc && (
                <div
                    className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setLightboxSrc(null)}
                >
                    <img src={lightboxSrc} alt="Aperçu" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
                    <button
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                        onClick={() => setLightboxSrc(null)}
                    >
                        <X size={24} />
                    </button>
                </div>
            )}
        </>
    );
};

// --- COMPONENT: EDITO ROW ---
interface EditoRowProps {
    post: SocialPost;
    onUpdate: (updatedPost: SocialPost) => void;
    canEdit: boolean;
    isArchivedView?: boolean;
    networkOptions: string[];
    co2Options: string[];
    mediaCount: number;
    onOpenMedia: (postId: string) => void;
}

const EditoRow: React.FC<EditoRowProps> = ({ post, onUpdate, canEdit, isArchivedView, networkOptions, co2Options, mediaCount, onOpenMedia }) => {
    const [isWordingFocused, setIsWordingFocused] = useState(false);
    
    // Status Color Strip
    const statusColorClass = SOCIAL_STATUS_COLORS[post.status] || 'bg-slate-500';
    const stripColor = statusColorClass.split(' ')[0].replace('/20', '');

    // Extract border color for the select input to match theme without background issues
    const borderClass = statusColorClass.match(/border-[\w-/]+/)?.[0] || 'border-slate-600';
    // Ensure text is visible (handle "Publié" green bg issue by forcing color logic)
    const textColorClass = post.status === 'Publié' ? 'text-green-600 dark:text-green-500' : (post.status === 'Validé' ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-800 dark:text-white');

    const handleArchiveToggle = (e: React.MouseEvent) => {
        e.stopPropagation(); // Important to prevent row conflicts
        if (!canEdit) return;
        // Direct toggle without blocking confirm for speed
        onUpdate({ ...post, archived: !post.archived });
    };

    return (
        <div className={`group relative flex items-start gap-4 bg-white dark:bg-bony-panel border-b border-bony-border hover:bg-slate-50 dark:hover:bg-[#252525] transition-colors p-3 ${post.archived ? 'opacity-60 grayscale' : ''}`}>
            
            {/* Status Strip */}
            <div className={`w-1.5 self-stretch rounded-full ${stripColor} shrink-0 shadow-[0_0_10px_rgba(0,0,0,0.5)]`}></div>

            {/* COL 1: Date & Status */}
            <div className="w-32 flex flex-col gap-2 shrink-0">
                <div className="relative">
                    <label className="text-[9px] text-slate-500 uppercase font-bold mb-0.5 block">Date</label>
                    <input 
                        type="date" 
                        value={post.date}
                        disabled={!canEdit}
                        onChange={e => onUpdate({...post, date: e.target.value})}
                        className="w-full bg-slate-100 dark:bg-black/40 border border-bony-border rounded px-2 py-1 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/60 transition-colors"
                    />
                </div>
                <div>
                    <label className="text-[9px] text-slate-500 uppercase font-bold mb-0.5 block">Statut</label>
                    <select 
                        value={post.status}
                        disabled={!canEdit}
                        onChange={e => onUpdate({...post, status: e.target.value as SocialStatus})}
                        className={`w-full text-[10px] font-bold uppercase py-1 px-2 rounded outline-none cursor-pointer border bg-white dark:bg-black ${borderClass} ${textColorClass}`}
                    >
                        {Object.keys(SOCIAL_STATUS_COLORS).map(s => <option key={s} value={s} className="bg-white dark:bg-gray-900 text-black dark:text-white">{s}</option>)}
                    </select>
                </div>
            </div>

            {/* COL 2: Content (Title, Link, Wording) */}
            <div className="flex-1 flex flex-col gap-3 min-w-[250px]">
                <div className="flex flex-col gap-1">
                    <input 
                        type="text" 
                        value={post.title}
                        disabled={!canEdit}
                        onChange={e => onUpdate({...post, title: e.target.value})}
                        className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-900 dark:text-white outline-none placeholder-slate-400 dark:placeholder-slate-600 focus:text-bony-orange transition-colors"
                        placeholder="Titre de la publication..."
                    />
                    <div className="flex items-center gap-2">
                        <LinkIcon size={12} className={post.link ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-600"}/>
                        <input 
                            type="text"
                            value={post.link}
                            disabled={!canEdit}
                            onChange={e => onUpdate({...post, link: e.target.value})}
                            placeholder="Ajouter un lien..."
                            className="bg-transparent text-xs text-blue-500 dark:text-blue-300 w-full outline-none placeholder-slate-400 dark:placeholder-slate-700 hover:text-blue-600 dark:hover:text-blue-200 transition-colors"
                        />
                    </div>
                </div>
                
                <div className="relative">
                    <textarea 
                        value={post.wording}
                        disabled={!canEdit}
                        onChange={e => onUpdate({...post, wording: e.target.value})}
                        onFocus={() => setIsWordingFocused(true)}
                        onBlur={() => setIsWordingFocused(false)}
                        className={`w-full bg-slate-50 dark:bg-black/30 border border-bony-border rounded px-3 py-2 text-xs text-slate-700 dark:text-slate-300 outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/50 resize-none transition-all z-10 
                            ${isWordingFocused ? 'absolute top-0 left-0 h-40 shadow-2xl bg-white dark:bg-[#1a1a1a] border-bony-violet' : 'h-16'}`}
                        placeholder="Rédiger le post ici..."
                    />
                </div>
            </div>

            {/* COL 3: Context (Brands, Services, Sites, Networks) */}
            <div className="w-56 flex flex-col gap-2 shrink-0">
                <VisualMultiSelect 
                    label="Choisir Marques..." 
                    options={BRANDS} 
                    selected={post.brands} 
                    onChange={v => onUpdate({...post, brands: v as BrandType[]})} 
                    disabled={!canEdit}
                    type="brand"
                />
                
                <VisualMultiSelect 
                    label="Choisir Sites..." 
                    options={['GROUPE BONY', ...Object.keys(PLAQUES_STRUCTURE), ...SITES]} 
                    selected={post.concessions} 
                    onChange={v => onUpdate({...post, concessions: v})} 
                    disabled={!canEdit}
                />

                <VisualMultiSelect 
                    label="Choisir Réseaux..." 
                    options={networkOptions} 
                    selected={post.networks} 
                    onChange={v => onUpdate({...post, networks: v as SocialNetwork[]})} 
                    disabled={!canEdit}
                />
            </div>

            {/* COL 4: Details (Service, LOM, CO2, Target) */}
            <div className="w-40 flex flex-col gap-2 shrink-0">
                 <select 
                    value={post.service}
                    disabled={!canEdit}
                    onChange={e => onUpdate({...post, service: e.target.value as ServiceType})}
                    className="w-full bg-slate-100 dark:bg-black/40 border border-bony-border rounded px-2 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:border-bony-blue cursor-pointer hover:bg-slate-200 dark:hover:bg-black/60"
                >
                    {SERVICES.map(s => <option key={s} value={s} className="bg-white dark:bg-gray-900">{s}</option>)}
                </select>

                <div className="flex gap-1">
                    {(['Internet', 'Collaborateurs'] as const).map(t => (
                        <button
                            key={t}
                            disabled={!canEdit}
                            onClick={() => {
                                const newTargets = post.targets.includes(t) 
                                    ? post.targets.filter(x => x !== t) 
                                    : [...post.targets, t];
                                onUpdate({...post, targets: newTargets});
                            }}
                            className={`flex-1 py-1 rounded text-[9px] font-bold uppercase border flex items-center justify-center transition-colors ${post.targets.includes(t) ? 'bg-white text-black border-slate-300 dark:border-white' : 'text-slate-500 dark:text-slate-600 border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 bg-slate-100 dark:bg-black/40'}`}
                            title={t}
                        >
                            {t === 'Internet' ? 'WEB' : 'COLLABORATEURS'}
                        </button>
                    ))}
                </div>

                <select 
                    value={post.lom}
                    disabled={!canEdit}
                    onChange={e => onUpdate({...post, lom: e.target.value})}
                    className="w-full bg-slate-100 dark:bg-black/40 border border-bony-border rounded px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 outline-none focus:border-bony-blue truncate hover:bg-slate-200 dark:hover:bg-black/60"
                >
                    <option value="" className="bg-white dark:bg-gray-900">Loi LOM...</option>
                    {LOI_LOM_OPTIONS.map(l => <option key={l} value={l} className="bg-white dark:bg-gray-900">{l}</option>)}
                </select>
                <select 
                    value={post.co2}
                    disabled={!canEdit}
                    onChange={e => onUpdate({...post, co2: e.target.value})}
                    className="w-full bg-slate-100 dark:bg-black/40 border border-bony-border rounded px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 outline-none focus:border-bony-blue truncate hover:bg-slate-200 dark:hover:bg-black/60"
                >
                    <option value="" className="bg-white dark:bg-gray-900">Classe CO²...</option>
                    {co2Options.map(c => <option key={c} value={c} className="bg-white dark:bg-gray-900">{c}</option>)}
                </select>
            </div>

            {/* COL 5: Media & Actions */}
            <div className="w-12 flex flex-col items-center gap-3 shrink-0 border-l border-bony-border pl-2 py-2">
                <button
                    onClick={() => onOpenMedia(post.id)}
                    className={`relative w-10 h-10 rounded-lg border flex items-center justify-center transition-all ${mediaCount > 0 ? 'bg-bony-orange/10 border-bony-orange text-bony-orange shadow-[0_0_10px_rgba(247,86,50,0.15)]' : 'bg-slate-100 dark:bg-black/40 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white hover:border-bony-orange/50'}`}
                    title={mediaCount > 0 ? `${mediaCount} média${mediaCount > 1 ? 's' : ''}` : 'Gérer les médias'}
                >
                    <Image size={18}/>
                    {mediaCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-bony-orange text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none shadow">
                            {mediaCount > 9 ? '9+' : mediaCount}
                        </span>
                    )}
                </button>

                <div className="flex-1"></div>

                <button 
                    disabled={!canEdit}
                    onClick={handleArchiveToggle}
                    className={`p-2 rounded-lg transition-colors ${post.archived ? 'text-bony-orange bg-bony-orange/10' : 'text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5'}`}
                    title={post.archived ? "Désarchiver" : "Archiver"}
                >
                    {post.archived ? <CheckSquare size={18}/> : <Square size={18}/>}
                </button>
            </div>
        </div>
    );
};

// --- COMPONENT: TAGS MANAGER ---
const TagsManager: React.FC<{ 
    tags: DigitalTags, 
    onUpdate: (newTags: DigitalTags) => void,
    canEdit: boolean 
}> = ({ tags, onUpdate, canEdit }) => {
    // --- STATE FOR NEW ITEM ---
    const [newNetwork, setNewNetwork] = useState('');
    const [newCo2, setNewCo2] = useState('');

    // --- STATE FOR EDITING ---
    const [editingItem, setEditingItem] = useState<{ type: 'networks'|'co2', originalValue: string, currentValue: string } | null>(null);
    
    // --- STATE FOR DELETING CONFIRMATION ---
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'networks'|'co2', value: string } | null>(null);

    // ADD
    const addTag = (type: 'networks' | 'co2', value: string) => {
        if (!value.trim()) return;
        const current = tags[type];
        if (current.includes(value.trim())) return;
        
        const updated = { ...tags, [type]: [...current, value.trim()] };
        onUpdate(updated);
        
        if (type === 'networks') setNewNetwork('');
        else setNewCo2('');
    };

    // START EDIT
    const startEdit = (e: React.MouseEvent, type: 'networks'|'co2', value: string) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingItem({ type, originalValue: value, currentValue: value });
        setConfirmDelete(null); // Clear delete state if open
    };

    // SAVE EDIT
    const saveEdit = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editingItem) return;

        const { type, originalValue, currentValue } = editingItem;
        if (currentValue.trim() && currentValue.trim() !== originalValue) {
            const updatedList = tags[type].map(t => t === originalValue ? currentValue.trim() : t);
            onUpdate({ ...tags, [type]: updatedList });
        }
        setEditingItem(null);
    };

    // CANCEL EDIT
    const cancelEdit = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingItem(null);
    };

    // HANDLE DELETE (2-Step)
    const handleDeleteClick = (e: React.MouseEvent, type: 'networks'|'co2', value: string) => {
        e.preventDefault();
        e.stopPropagation();

        // If already confirming THIS item, then actually delete
        if (confirmDelete && confirmDelete.type === type && confirmDelete.value === value) {
            const updated = { ...tags, [type]: tags[type].filter(t => t !== value) };
            onUpdate(updated);
            setConfirmDelete(null);
        } else {
            // First click -> Enter confirm mode
            setConfirmDelete({ type, value });
            // Auto-reset confirm state after 3 seconds
            setTimeout(() => {
                setConfirmDelete(prev => (prev && prev.value === value) ? null : prev);
            }, 3000);
        }
    };

    const renderList = (title: string, items: string[], type: 'networks' | 'co2', inputValue: string, setInput: (v: string) => void) => (
        <div className="flex-1 bg-bony-panel border border-bony-border rounded-xl flex flex-col min-h-0 shadow-lg h-full overflow-hidden">
            <div className="p-4 border-b border-bony-border bg-slate-100 dark:bg-black/20 shrink-0">
                <h3 className="text-sm font-bold text-bony-text uppercase tracking-widest flex items-center gap-2">
                    {type === 'networks' ? <Globe size={16} className="text-bony-violet"/> : <Settings size={16} className="text-bony-orange"/>}
                    {title}
                </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {items.map(item => {
                    // Check locked
                    const isLocked = type === 'networks' && LOCKED_NETWORKS.includes(item);
                    // Check if editing this specific item
                    const isEditing = editingItem && editingItem.type === type && editingItem.originalValue === item;
                    // Check if confirming delete for this item
                    const isConfirmingDelete = confirmDelete && confirmDelete.type === type && confirmDelete.value === item;

                    return (
                        <div key={item} className={`relative flex items-center justify-between p-3 border rounded-lg transition-colors ${isEditing ? 'bg-bony-orange/10 border-bony-orange' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-bony-blue'}`}>
                            
                            {/* CONTENT OR INPUT */}
                            {isEditing ? (
                                <div className="flex items-center gap-2 flex-1 mr-2">
                                    <input 
                                        autoFocus
                                        type="text" 
                                        value={editingItem.currentValue}
                                        onChange={(e) => setEditingItem({ ...editingItem, currentValue: e.target.value })}
                                        className="w-full bg-white dark:bg-black/40 border border-bony-border rounded px-2 py-1 text-xs font-bold text-bony-text outline-none focus:border-bony-orange"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveEdit(e as any);
                                            if (e.key === 'Escape') cancelEdit(e as any);
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 min-w-0">
                                    {type === 'networks' && getSocialIcon(item, 16)}
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item}</span>
                                    {isLocked && <Lock size={10} className="text-slate-400 opacity-50"/>}
                                </div>
                            )}
                            
                            {/* ACTION BUTTONS */}
                            {canEdit && !isLocked && (
                                <div className="flex items-center gap-2 pl-2 z-20 pointer-events-auto shrink-0">
                                    {isEditing ? (
                                        <>
                                            <button 
                                                type="button"
                                                onClick={saveEdit}
                                                className="p-1.5 bg-emerald-500/20 text-emerald-500 rounded hover:bg-emerald-500/40"
                                            >
                                                <Check size={14}/>
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={cancelEdit}
                                                className="p-1.5 bg-slate-200 dark:bg-white/10 text-slate-500 rounded hover:bg-slate-300 dark:hover:bg-white/20"
                                            >
                                                <X size={14}/>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button 
                                                type="button"
                                                onClick={(e) => startEdit(e, type, item)} 
                                                className="p-1.5 text-slate-400 hover:text-bony-text bg-slate-100 dark:bg-black/20 hover:bg-slate-200 dark:hover:bg-white/10 rounded cursor-pointer transition-colors"
                                                title="Modifier"
                                            >
                                                <Edit2 size={14}/>
                                            </button>
                                            
                                            <button 
                                                type="button"
                                                onClick={(e) => handleDeleteClick(e, type, item)} 
                                                className={`p-1.5 rounded cursor-pointer transition-all flex items-center gap-1 ${
                                                    isConfirmingDelete 
                                                    ? 'bg-red-500 text-white w-auto px-2 shadow-lg animate-pulse' 
                                                    : 'text-slate-400 hover:text-red-500 bg-slate-100 dark:bg-black/20 hover:bg-red-500/10'
                                                }`}
                                                title={isConfirmingDelete ? "Cliquez pour confirmer" : "Supprimer"}
                                            >
                                                {isConfirmingDelete ? (
                                                    <span className="text-[9px] font-bold uppercase whitespace-nowrap">Confirmer ?</span>
                                                ) : (
                                                    <Trash2 size={14}/>
                                                )}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {canEdit && (
                <div className="p-4 border-t border-bony-border bg-slate-50 dark:bg-black/30 shrink-0">
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={inputValue}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addTag(type, inputValue)}
                            placeholder={`Ajouter ${type === 'networks' ? 'un réseau' : 'une classe CO²'}...`}
                            className="flex-1 bg-white dark:bg-black/40 border border-bony-border rounded-lg px-3 py-2 text-xs text-bony-text outline-none focus:border-bony-violet"
                        />
                        <button 
                            type="button"
                            onClick={() => addTag(type, inputValue)}
                            className="bg-bony-gradient text-white p-2 rounded-lg hover:opacity-90 transition shadow-lg"
                        >
                            <Plus size={16}/>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex gap-6 flex-1 min-h-0 p-6 overflow-hidden h-full">
            {renderList("Réseaux Sociaux", tags.networks, 'networks', newNetwork, setNewNetwork)}
            {renderList("Classes CO² & Mentions", tags.co2, 'co2', newCo2, setNewCo2)}
        </div>
    );
};

// --- MAIN PAGE ---

const Digital: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useSessionState<Tab>('digital_activeTab', 'Calendrier Editorial');
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [tags, setTags] = useState<DigitalTags>({ networks: [], co2: [] });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mediaModalPostId, setMediaModalPostId] = useState<string | null>(null);
  const [mediaCounts, setMediaCounts] = useState<Record<string, number>>({});

  // Filters & Sort
  const [searchTerm, setSearchTerm] = useSessionState<string>('digital_searchTerm', '');
  const [filterBrand, setFilterBrand] = useSessionState<BrandType | 'All'>('digital_filterBrand', 'All');
  const [filterService, setFilterService] = useSessionState<ServiceType | 'All'>('digital_filterService', 'All');
  const [filterConcession, setFilterConcession] = useSessionState<string>('digital_filterConcession', 'All');
  const [sortOrder, setSortOrder] = useSessionState<'asc' | 'desc'>('digital_sortOrder', 'asc');

  // Planning View State
  const [calendarView, setCalendarView] = useSessionState<CalendarView>('digital_calendarView', 'Mois');
  const [planningDate, setPlanningDate] = useState(new Date());
  
  // Tooltip State
  const [hoveredPostId, setHoveredPostId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  // Permissions
  const canEdit = user?.role === 'Master' || user?.role === 'Administrator' || user?.role === 'Digital Manager';

  useEffect(() => {
      loadData();
  }, []);

  const loadData = async () => {
      setLoading(true);
      const [pData, tData] = await Promise.all([
          db.getSocialPosts(),
          db.getDigitalTags()
      ]);
      // Init media counts from localStorage
      const counts: Record<string, number> = {};
      pData.forEach(p => { counts[p.id] = loadPostMedias(p.id).length; });
      setMediaCounts(counts);
      setPosts(pData);
      setTags(tData);
      setLoading(false);
  };

  const handleUpdatePost = async (updatedPost: SocialPost) => {
      if (!canEdit) return;
      // Suppression automatique des médias lors de l'archivage
      const oldPost = posts.find(p => p.id === updatedPost.id);
      const isArchiving = oldPost && !oldPost.archived && updatedPost.archived;
      if (isArchiving) {
          localStorage.removeItem(mediaKey(updatedPost.id));
          setMediaCounts(prev => ({ ...prev, [updatedPost.id]: 0 }));
      }
      setSaving(true);
      const newPosts = posts.map(p => p.id === updatedPost.id ? updatedPost : p);
      setPosts(newPosts);
      await db.saveSocialPosts(newPosts);
      if (isArchiving && user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a archivé la publication', entity: 'post', entityName: updatedPost.title || '(sans titre)', timestamp: new Date().toISOString() });
      setTimeout(() => setSaving(false), 500);
  };

  const handleMediaCountChange = (postId: string, count: number) => {
      setMediaCounts(prev => ({ ...prev, [postId]: count }));
  };

  const handleUpdateTags = async (newTags: DigitalTags) => {
      if (!canEdit) return;
      setSaving(true);
      setTags(newTags); // Optimistic Update
      await db.saveDigitalTags(newTags); // Async Save
      setTimeout(() => setSaving(false), 500);
  };

  const createPost = async () => {
      if (!canEdit) return;
      const newPost: SocialPost = {
          id: `sp-${Date.now()}`,
          title: '',
          status: 'À venir',
          date: new Date().toISOString().split('T')[0],
          targets: [],
          brands: [],
          service: 'Tous Services',
          networks: [],
          concessions: [],
          mediaFiles: [],
          link: '',
          wording: '',
          lom: '',
          co2: '',
          archived: false
      };
      // Add to top
      const newPosts = [newPost, ...posts];
      setPosts(newPosts);
      await db.saveSocialPosts(newPosts);
      if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a créé une publication', entity: 'post', entityName: '(sans titre)', timestamp: new Date().toISOString() });
  };

  const filteredPosts = useMemo(() => {
      const isPlanning = activeTab === 'Planning Digital';
      const isArchiveTab = activeTab === 'Archives';
      
      let filtered = posts.filter(p => {
          // Tab Logic
          if (!isPlanning) {
              if (isArchiveTab && !p.archived) return false;
              if (!isArchiveTab && p.archived) return false;
          }

          // Search
          if (searchTerm && !p.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;

          // Filters
          if (filterBrand !== 'All' && !p.brands.includes(filterBrand) && !p.brands.includes('Groupe')) return false;
          if (filterService !== 'All' && p.service !== filterService && p.service !== 'Tous Services') return false;
          
          if (isPlanning && filterConcession !== 'All') {
              // Concessions filter logic: check direct match or Plaque match
              const match = p.concessions.includes(filterConcession) || 
                            p.concessions.includes('GROUPE BONY') || 
                            (PLAQUES_STRUCTURE[filterConcession as PlaqueName] && p.concessions.some(c => PLAQUES_STRUCTURE[filterConcession as PlaqueName].includes(c as Site)));
              if (!match) return false;
          }

          return true;
      });

      return filtered.sort((a,b) => {
          const dateA = parseLocalDate(a.date).getTime();
          const dateB = parseLocalDate(b.date).getTime();
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      });
  }, [posts, activeTab, searchTerm, filterBrand, filterService, filterConcession, sortOrder]);

  const handlePostHover = (e: React.MouseEvent, postId: string | null) => {
      if (postId) {
          setHoveredPostId(postId);
          // Calculate safe position to avoid clipping
          const x = Math.min(e.clientX + 15, window.innerWidth - 320); // Keep within right edge
          const y = Math.min(e.clientY + 15, window.innerHeight - 300); // Keep within bottom edge
          setCursorPos({ x, y });
      } else {
          setHoveredPostId(null);
      }
  };

  const hoveredPostData = useMemo(() => {
      if (!hoveredPostId) return null;
      return posts.find(p => p.id === hoveredPostId);
  }, [hoveredPostId, posts]);

  // --- TOOLTIP RENDERER ---
  const renderTooltip = () => {
      if (!hoveredPostData) return null;
      return (
          <div 
            className="fixed z-[100] w-72 bg-white dark:bg-bony-panel border border-bony-border rounded-xl shadow-2xl p-4 pointer-events-none animate-in fade-in duration-200"
            style={{ top: cursorPos.y, left: cursorPos.x }}
          >
              {/* Header: Brands + Status */}
              <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-wrap gap-1">
                      {hoveredPostData.brands.map(b => (
                          <span key={b} className={`text-[8px] px-1.5 py-0.5 rounded border uppercase font-bold ${BRAND_COLORS[b]}`}>{b}</span>
                      ))}
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${SOCIAL_STATUS_COLORS[hoveredPostData.status]}`}>
                      {hoveredPostData.status}
                  </span>
              </div>

              {/* Title & Date */}
              <div className="mb-3">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight mb-1">{hoveredPostData.title || 'Sans titre'}</h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock size={12} />
                      <span className="font-sans">{parseLocalDate(hoveredPostData.date).toLocaleDateString('fr-FR')}</span>
                  </div>
              </div>

              {/* Content Snippet */}
              <div className="bg-slate-100 dark:bg-black/30 p-2 rounded-lg border border-bony-border mb-3">
                  <div className="flex items-start gap-2 mb-1 text-[10px] font-bold text-slate-400 uppercase">
                      <AlignLeft size={10} /> Wording
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 italic line-clamp-4">
                      "{hoveredPostData.wording || '...'}"
                  </p>
              </div>

              {/* Footer: Sites & Networks */}
              <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1">
                      {hoveredPostData.concessions.slice(0, 3).map(c => (
                          <span key={c} className="text-[9px] bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200 px-1.5 rounded border border-blue-200 dark:border-blue-500/30">{c}</span>
                      ))}
                      {hoveredPostData.concessions.length > 3 && <span className="text-[9px] text-slate-500">+{hoveredPostData.concessions.length - 3}</span>}
                  </div>
                  <div className="flex gap-2 border-t border-bony-border pt-2 mt-1">
                      {hoveredPostData.networks.map(n => <div key={n}>{getSocialIcon(n, 16)}</div>)}
                  </div>
              </div>
          </div>
      );
  };

  // --- PLANNING RENDERERS ---
  const renderPlanning = () => {
      const handlePrev = () => {
          const d = new Date(planningDate);
          if (calendarView === 'Mois') d.setMonth(d.getMonth() - 1);
          else d.setDate(d.getDate() - 7);
          setPlanningDate(d);
      };
      const handleNext = () => {
          const d = new Date(planningDate);
          if (calendarView === 'Mois') d.setMonth(d.getMonth() + 1);
          else d.setDate(d.getDate() + 7);
          setPlanningDate(d);
      };
      const handleToday = () => setPlanningDate(new Date());

      const getPostsForDay = (d: Date) => {
          const iso = toLocalIso(d);
          return filteredPosts.filter(p => p.date === iso);
      };

      const weekDays = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

      // --- SUB-RENDER: MONTH GRID ---
      const renderMonthGrid = () => {
          const year = planningDate.getFullYear();
          const month = planningDate.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0

          const days = [];
          for(let i=0; i<firstDayIndex; i++) days.push(null);
          for(let i=1; i<=daysInMonth; i++) days.push(new Date(year, month, i));

          return (
              <div className="grid grid-cols-7 gap-2 auto-rows-fr pb-4">
                  {days.map((day, idx) => {
                      if (!day) return <div key={`empty-${idx}`} className="min-h-[120px]"></div>;
                      const isToday = day.toDateString() === new Date().toDateString();
                      const dayPosts = getPostsForDay(day);

                      return (
                          <div 
                              key={day.toISOString()} 
                              className={`min-h-[140px] bg-white dark:bg-bony-panel border rounded-lg p-2 flex flex-col gap-1 transition-all ${isToday ? 'border-bony-orange/50 ring-1 ring-bony-orange/20' : 'border-bony-border'}`}
                          >
                              <div className={`text-right text-xs font-bold mb-1 ${isToday ? 'text-bony-orange' : 'text-slate-400'}`}>
                                  {day.getDate()}
                              </div>
                              <div className="flex-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1">
                                  {dayPosts.map(post => {
                                      const statusColor = SOCIAL_STATUS_COLORS[post.status] || 'border-slate-500';
                                      const borderColor = statusColor.match(/border-([\w-]+)/)?.[1] || 'slate-500';
                                      return (
                                          <div 
                                              key={post.id}
                                              onMouseEnter={(e) => handlePostHover(e, post.id)}
                                              onMouseLeave={(e) => handlePostHover(e, null)}
                                              className="group relative p-1.5 rounded border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 hover:border-bony-violet transition cursor-pointer flex items-start gap-2 overflow-hidden"
                                          >
                                              <div className={`absolute left-0 top-0 bottom-0 w-0.5 bg-${borderColor}`}></div>
                                              <div className="mt-0.5 shrink-0">{post.networks.length > 0 ? getSocialIcon(post.networks[0], 12) : <Globe size={12} className="text-slate-400"/>}</div>
                                              <div className="min-w-0">
                                                  <div className="text-[10px] font-bold text-slate-800 dark:text-slate-200 truncate leading-tight">{post.title || "Sans titre"}</div>
                                                  <div className="flex items-center gap-1 mt-0.5">
                                                      {post.brands.length > 0 && <div className={`w-1.5 h-1.5 rounded-full ${BRAND_COLORS[post.brands[0]]?.split(' ')[0]}`}></div>}
                                                      <span className="text-[8px] text-slate-500 truncate">{post.status}</span>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      );
                  })}
              </div>
          );
      };

      // --- SUB-RENDER: WEEK GRID ---
      const renderWeekGrid = () => {
          const startOfWeek = getStartOfWeek(planningDate);
          const weekDates = Array.from({length: 7}).map((_, i) => {
              const d = new Date(startOfWeek);
              d.setDate(d.getDate() + i);
              return d;
          });

          return (
              <div className="grid grid-cols-7 gap-2 h-full min-h-[500px]">
                  {weekDates.map((day) => {
                      const isToday = day.toDateString() === new Date().toDateString();
                      const dayPosts = getPostsForDay(day);
                      
                      return (
                          <div key={day.toISOString()} className={`flex flex-col bg-white dark:bg-bony-panel border rounded-lg overflow-hidden h-full ${isToday ? 'border-bony-orange/50' : 'border-bony-border'}`}>
                              <div className={`p-2 text-center border-b border-bony-border shrink-0 ${isToday ? 'bg-bony-orange/10' : 'bg-slate-50 dark:bg-black/20'}`}>
                                  <div className="text-[10px] font-bold uppercase text-slate-500">{weekDays[day.getDay() === 0 ? 6 : day.getDay() - 1]}</div>
                                  <div className={`text-xl font-title font-bold ${isToday ? 'text-bony-orange' : 'text-slate-800 dark:text-white'}`}>{day.getDate()}</div>
                              </div>
                              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                                  {dayPosts.map(post => {
                                      const statusColor = SOCIAL_STATUS_COLORS[post.status] || 'border-slate-500';
                                      const borderColor = statusColor.match(/border-([\w-]+)/)?.[1] || 'slate-500';
                                      return (
                                          <div 
                                              key={post.id}
                                              onMouseEnter={(e) => handlePostHover(e, post.id)}
                                              onMouseLeave={(e) => handlePostHover(e, null)}
                                              className="relative p-2 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 hover:border-bony-violet hover:shadow-lg transition cursor-pointer"
                                          >
                                              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l bg-${borderColor}`}></div>
                                              <div className="pl-2">
                                                  <div className="flex justify-between items-start mb-1">
                                                      {post.networks.length > 0 ? getSocialIcon(post.networks[0], 14) : <Globe size={14} className="text-slate-400"/>}
                                                      {post.brands.length > 0 && <div className={`w-2 h-2 rounded-full ${BRAND_COLORS[post.brands[0]]?.split(' ')[0]}`}></div>}
                                                  </div>
                                                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight mb-1">{post.title || "Sans titre"}</div>
                                                  <div className="text-[9px] px-1.5 py-0.5 rounded bg-white dark:bg-black/40 border border-bony-border w-fit">
                                                      {post.status}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      );
                  })}
              </div>
          );
      };

      const titleLabel = calendarView === 'Mois' 
        ? planningDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : `Semaine du ${getStartOfWeek(planningDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;

      return (
          <div className="flex flex-col flex-1 min-h-0 bg-bony-dark relative">
              {renderTooltip()}
              
              {/* Controls */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-bony-border bg-white dark:bg-bony-panel shrink-0">
                  <div className="flex items-center gap-4">
                      <h3 className="text-xl font-title text-slate-900 dark:text-white capitalize min-w-[200px]">
                          {titleLabel}
                      </h3>
                      <div className="flex bg-slate-100 dark:bg-black/30 rounded-lg p-1 border border-bony-border">
                          <button onClick={handlePrev} className="p-1 hover:text-bony-orange text-slate-500 transition"><ChevronLeft size={18}/></button>
                          <button onClick={handleToday} className="px-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase hover:text-slate-900 dark:hover:text-white transition">Aujourd'hui</button>
                          <button onClick={handleNext} className="p-1 hover:text-bony-orange text-slate-500 transition"><ChevronRight size={18}/></button>
                      </div>
                      
                      {/* View Switcher */}
                      <div className="flex bg-slate-100 dark:bg-black/30 rounded-lg p-1 border border-bony-border ml-2">
                          <button onClick={() => setCalendarView('Mois')} className={`px-3 py-1 rounded text-xs font-bold uppercase transition ${calendarView === 'Mois' ? 'bg-white dark:bg-bony-panel text-bony-orange shadow' : 'text-slate-500'}`}>Mois</button>
                          <button onClick={() => setCalendarView('Semaine')} className={`px-3 py-1 rounded text-xs font-bold uppercase transition ${calendarView === 'Semaine' ? 'bg-white dark:bg-bony-panel text-bony-orange shadow' : 'text-slate-500'}`}>Semaine</button>
                      </div>
                  </div>

                  {/* Planning Filters */}
                  <div className="flex items-center gap-2">
                      <select value={filterConcession} onChange={e => setFilterConcession(e.target.value)} className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-2 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet">
                          <option value="All">Tous Sites</option>
                          {Object.entries(PLAQUES_STRUCTURE).map(([plaque, sites]) => (
                              <optgroup key={plaque} label={plaque}>
                                  <option value={plaque}>★ {plaque}</option>
                                  {sites.map(s => <option key={s} value={s}>{s}</option>)}
                              </optgroup>
                          ))}
                      </select>
                      <div className="text-xs text-slate-500 font-sans border-l border-bony-border pl-2 ml-2">
                          {filteredPosts.length} posts
                      </div>
                  </div>
              </div>

              {/* Mobile: list of upcoming posts instead of calendar grid */}
              <div className="md:hidden overflow-y-auto flex-1 p-3 space-y-2">
                  {filteredPosts.length > 0 ? (
                      filteredPosts
                          .slice()
                          .sort((a, b) => a.date.localeCompare(b.date))
                          .map(post => (
                              <div key={post.id} className="bg-bony-panel border border-bony-border rounded-lg p-3 space-y-1">
                                  <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-bony-orange">{parseLocalDate(post.date).toLocaleDateString('fr-FR')}</span>
                                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-bony-border text-slate-500">{post.status}</span>
                                  </div>
                                  <p className="text-sm font-medium text-bony-text truncate">{post.title || 'Sans titre'}</p>
                                  <p className="text-xs text-slate-500 truncate">{post.concessions?.slice(0,2).join(', ')}</p>
                              </div>
                          ))
                  ) : (
                      <div className="text-center py-10 text-slate-500 text-sm">Aucune publication</div>
                  )}
              </div>

              {/* Desktop: calendar grid */}
              <div className="hidden md:flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-black/10 overflow-y-auto custom-scrollbar p-4">
                  {/* Header Row (Only needed for Month View here, Week view has headers inside columns) */}
                  {calendarView === 'Mois' && (
                      <div className="grid grid-cols-7 mb-2 shrink-0">
                          {weekDays.map(d => (
                              <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                  {d}
                              </div>
                          ))}
                      </div>
                  )}

                  {calendarView === 'Mois' ? renderMonthGrid() : renderWeekGrid()}
              </div>
          </div>
      );
  };

  const renderContent = () => {
      if (activeTab === 'Planning Digital') {
          return renderPlanning();
      }
      
      if (activeTab === 'Gestion des TAGS') {
          return <TagsManager tags={tags} onUpdate={handleUpdateTags} canEdit={canEdit} />;
      }

      const isArchivedView = activeTab === 'Archives';

      return (
          <div className="flex-1 flex flex-col min-h-0 bg-bony-dark">
              {/* TABLE HEADER */}
              <div className="hidden md:flex items-center gap-4 px-6 py-3 border-b border-bony-border bg-slate-100 dark:bg-black/40 text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky top-0 z-20 shadow-lg backdrop-blur-md">
                  <div className="w-1.5"></div>
                  <div className="w-32 flex items-center gap-1 cursor-pointer hover:text-bony-text transition-colors" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                      DATE / STATUT
                      {sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                  </div>
                  <div className="flex-1 min-w-[250px]">CONTENU DU POST</div>
                  <div className="w-56">CONTEXTE & CIBLAGE</div>
                  <div className="w-40">DÉTAILS TECHNIQUES</div>
                  <div className="w-12 text-center">MÉDIA</div>
              </div>

              {/* LIST */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pb-6 p-2 md:p-4 space-y-3">
                  {filteredPosts.length > 0 ? (
                      filteredPosts.map(post => (
                          <EditoRow
                            key={post.id}
                            post={post}
                            onUpdate={handleUpdatePost}
                            canEdit={canEdit}
                            isArchivedView={isArchivedView}
                            networkOptions={tags.networks}
                            co2Options={tags.co2}
                            mediaCount={mediaCounts[post.id] ?? 0}
                            onOpenMedia={setMediaModalPostId}
                          />
                      ))
                  ) : (
                      <div className="text-center py-20 text-slate-600 border border-dashed border-bony-border rounded-xl m-4">
                          <LayoutList size={48} className="mx-auto mb-4 opacity-50"/>
                          <p className="text-sm">Aucune publication trouvée dans {activeTab}.</p>
                      </div>
                  )}
              </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bony-dark animate-fade-in transition-colors">
        {/* Header */}
        <div className="px-3 py-3 md:px-6 md:py-4 bg-white dark:bg-bony-panel border-b border-bony-border shrink-0 z-30 shadow-md">
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3 mb-4">
                <div>
                    <h2 className="text-lg md:text-2xl text-slate-900 dark:text-bony-text font-title mb-1 flex items-center gap-3">
                        <Globe className="text-bony-violet"/> Digital & Social
                    </h2>
                    <div className="flex items-center gap-3">
                        <p className="text-xs text-slate-500 dark:text-bony-muted font-sans tracking-wide uppercase">Gestion Editoriale & Réseaux</p>
                        {saving && <span className="text-bony-orange flex items-center text-[10px] animate-pulse font-bold"><Save size={10} className="mr-1"/> ENREGISTREMENT...</span>}
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    {!canEdit && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs font-bold uppercase">
                            <Lock size={12}/> Lecture Seule
                        </div>
                    )}
                    {/* Tabs */}
                    <div className="bg-slate-100 dark:bg-black/30 p-1 rounded-lg border border-bony-border flex flex-wrap gap-1">
                        {(['Calendrier Editorial', 'Planning Digital', 'Archives', 'Gestion des TAGS'] as Tab[]).map(tab => (
                            <button 
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-2 py-1.5 md:px-4 md:py-2 min-h-[36px] rounded-md text-xs font-bold uppercase transition-all ${activeTab === tab ? 'bg-bony-gradient text-white shadow-lg' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-bony-text'}`}
                            >
                                {tab === 'Archives' && <Archive size={12} className="inline mr-1 mb-0.5"/>}
                                {tab === 'Planning Digital' && <Calendar size={12} className="inline mr-1 mb-0.5"/>}
                                {tab === 'Gestion des TAGS' && <Settings size={12} className="inline mr-1 mb-0.5"/>}
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Toolbar (Only for Calendar & Archives) */}
            {activeTab !== 'Planning Digital' && activeTab !== 'Gestion des TAGS' && (
                <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input 
                            type="text" 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Rechercher..."
                            className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg pl-10 pr-3 py-2 text-xs text-slate-900 dark:text-bony-text outline-none focus:border-bony-violet transition-colors"
                        />
                    </div>

                    <div className="w-px h-6 bg-bony-border"></div>

                    {/* Filters */}
                    <div className="flex gap-2">
                        <select 
                            value={filterBrand} 
                            onChange={e => setFilterBrand(e.target.value as any)}
                            className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-3 py-1.5 text-xs text-slate-900 dark:text-bony-text outline-none focus:border-bony-violet"
                        >
                            <option value="All" className="bg-white dark:bg-gray-900">Toutes Marques</option>
                            {BRANDS.map(b => <option key={b} value={b} className="bg-white dark:bg-gray-900">{b}</option>)}
                        </select>
                        <select 
                            value={filterService} 
                            onChange={e => setFilterService(e.target.value as any)}
                            className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-3 py-1.5 text-xs text-slate-900 dark:text-bony-text outline-none focus:border-bony-violet"
                        >
                            <option value="All" className="bg-white dark:bg-gray-900">Tous Services</option>
                            {SERVICES.map(s => <option key={s} value={s} className="bg-white dark:bg-gray-900">{s}</option>)}
                        </select>
                    </div>

                    <div className="flex-1"></div>

                    {/* Add Button */}
                    {canEdit && activeTab === 'Calendrier Editorial' && (
                        <button 
                            onClick={createPost}
                            className="flex items-center gap-2 px-6 py-2 bg-bony-gradient hover:opacity-90 text-white rounded-lg transition shadow-lg shadow-bony-violet/20"
                        >
                            <Plus size={18} />
                            <span className="font-bold text-xs uppercase">Ajouter</span>
                        </button>
                    )}
                </div>
            )}
        </div>

        {/* Content */}
        {renderContent()}

        {/* Media Manager Modal */}
        {mediaModalPostId && (() => {
            const post = posts.find(p => p.id === mediaModalPostId);
            if (!post) return null;
            return (
                <MediaManagerModal
                    post={post}
                    canEdit={canEdit && !post.archived}
                    uploaderName={user?.name ?? 'Utilisateur'}
                    onClose={() => setMediaModalPostId(null)}
                    onCountChange={handleMediaCountChange}
                />
            );
        })()}
    </div>
  );
};

export default Digital;
