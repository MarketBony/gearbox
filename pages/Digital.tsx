
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSessionState } from '../hooks/useSessionState';
import { useAuth } from '../contexts/AuthContext';
import { db, ApiError } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { fileSauvegardePublication } from '../services/fileSauvegardePublication';
import { ChampTexte } from '../components/ChampDiffere';
import { SocialPost, SocialStatus, SocialNetwork, BrandType, SocialServiceType, SocialTarget, Site, PlaqueName, DigitalTags, ActivityLog, SocialComment } from '../types';
import { SOCIAL_STATUS_COLORS, BRANDS, SOCIAL_SERVICES, PLAQUES_STRUCTURE, SITES, BRAND_COLORS,
         DIGITAL_CONCESSIONS, libelleMarqueDigital, libelleStatutSocial } from '../constants';
import { Globe, Lock, Plus, Save, Archive, Search, Filter, Image, Trash2, Check, ChevronDown, Link as LinkIcon, Calendar, ArrowUp, ArrowDown, Square, CheckSquare, LayoutList, X, ChevronLeft, ChevronRight, Instagram, Facebook, Linkedin, Youtube, MapPin, Video, Eye, AlignLeft, Clock, Settings, Edit2, AlertCircle, Download, Upload, ExternalLink, MessageSquare, Send } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Select from '../components/Select';
import CollapsibleFilters from '../components/CollapsibleFilters';
import { isSiteManager, canEditDigital } from '../constants';
import DatePicker from '../components/DatePicker';
import FloatingPanel from '../components/FloatingPanel';
import Avatar from '../components/Avatar';
import { fournisseurDe, libelleCourt } from '../lib/linkProviders';

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
/**
 * Icônes des réseaux d'une publication, DÉDOUBLONNÉES et bornées.
 *
 * ⚠️ POURQUOI CETTE FONCTION. Les vues Mois et Semaine n'affichaient que
 * `post.networks[0]` alors que le champ est un tableau : mesuré en base le 07/09/2026,
 * **48 publications sur 57 portent plusieurs réseaux** (jusqu'à 5). L'équipe ne pouvait
 * donc pas identifier les autres réseaux concernés depuis le calendrier.
 *
 * ⚠️ DÉDOUBLONNAGE OBLIGATOIRE. `getSocialIcon` matche par SOUS-CHAÎNE : « Instagram » et
 * « Story Instagram » sont deux valeurs distinctes qui rendent LA MÊME icône. Sans ce
 * `Set`, une publication Insta + Story Insta afficherait deux fois le même logo — ce qui
 * se lit comme un bug.
 *
 * ⚠️ BORNE À 3. Les cellules du mois sont volontairement compactes (`min-h-[80px]`,
 * titre en `line-clamp-1`) : au-delà, la grille se déforme. Le surplus est annoncé par
 * un « +N », comme le fait déjà `VisualMultiSelect` avec `maxVisible`.
 */
const MAX_LOGOS_CALENDRIER = 3;

/**
 * Clé d'ICÔNE d'un réseau — doit rester alignée sur les tests de `getSocialIcon`.
 * ⚠️ Si on ajoute un réseau reconnu là-bas, il faut l'ajouter ICI, sinon deux réseaux
 * distincts afficheront la même icône sans être dédoublonnés (le défaut d'origine).
 */
const cleIcone = (network: string): string => {
    const n = network.toLowerCase().trim();
    for (const marqueur of ['instagram', 'facebook', 'linkedin', 'youtube', 'gmb', 'tiktok']) {
        if (n.includes(marqueur)) return marqueur;
    }
    return 'autre:' + n; // non reconnu : icône Globe, mais on garde chaque réseau distinct
};

const reseauxDistincts = (networks: string[]): string[] => {
    const vus = new Set<string>();
    const sortie: string[] = [];
    for (const n of networks) {
        // La clé est le NOM D'ICÔNE, pas le nom du réseau : c'est lui qui doit être unique.
        const cle = cleIcone(n);
        if (vus.has(cle)) continue;
        vus.add(cle);
        sortie.push(n);
    }
    return sortie;
};

const LogosReseaux: React.FC<{ networks: string[]; size?: number }> = ({ networks, size = 12 }) => {
    const distincts = reseauxDistincts(networks || []);
    if (distincts.length === 0) return <Globe size={size} className="text-slate-400" />;
    const visibles = distincts.slice(0, MAX_LOGOS_CALENDRIER);
    const reste = distincts.length - visibles.length;
    return (
        <div className="flex items-center gap-0.5 shrink-0">
            {visibles.map(n => <div key={n} title={n}>{getSocialIcon(n, size)}</div>)}
            {reste > 0 && (
                <span className="text-[8px] font-bold text-slate-400 leading-none" title={distincts.slice(MAX_LOGOS_CALENDRIER).join(', ')}>
                    +{reste}
                </span>
            )}
        </div>
    );
};

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
//
// ⚠️ Le menu passe par `FloatingPanel`, comme `components/Select.tsx`, et ce n'est PAS
// un détail d'implémentation : ce composant rendait auparavant son menu en
// `absolute … z-50` À L'INTÉRIEUR de la ligne d'édito. Or la ligne porte
// `.gx-glass-panel`, donc un `backdrop-filter`, **qui crée un contexte d'empilement** :
// le z-index du menu s'y trouvait enfermé et l'édito SUIVANT — simple frère plus bas
// dans le DOM — se peignait par-dessus. Aucune valeur de z-index n'y changeait rien.
// `FloatingPanel` portalise sur `document.body` en `position: fixed`, ce qui échappe à
// tout ancêtre. Mesuré le 02/09/2026 : le seul contexte d'empilement de la chaîne était
// bien la ligne elle-même.
//
// ⚠️ HAUTEUR FIXE, et c'est ce qui tient la compacité de la ligne. Avec les pastilles
// libres de passer à la ligne, « Réseaux » montait à 72 px dès 5 réseaux cochés et
// imposait à lui seul 152 px à toute la colonne. On affiche donc au plus
// `maxVisible` pastilles, le reste en « +N ».
interface VisualMultiSelectProps {
    label: string;
    options: string[];
    selected: string[];
    onChange: (newSelected: string[]) => void;
    disabled?: boolean;
    type?: 'brand' | 'default';
    /** Pastilles affichées avant le « +N ». */
    maxVisible?: number;
}

const VisualMultiSelect: React.FC<VisualMultiSelectProps> = ({ label, options, selected, onChange, disabled, type = 'default', maxVisible = 2 }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    // Pas de gestion de clic extérieur ici : FloatingPanel s'en charge (et de Échap).

    const toggleOption = (opt: string) => {
        if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
        else onChange([...selected, opt]);
    };

    const visibles = selected.slice(0, maxVisible);
    const reste = selected.length - visibles.length;

    return (
        <>
            <button
                type="button"
                ref={triggerRef}
                onClick={() => !disabled && setIsOpen(o => !o)}
                disabled={disabled}
                title={selected.length ? selected.map(s => (type === 'brand' ? libelleMarqueDigital(s) : s)).join(' · ') : label}
                className={`h-11 md:h-[34px] w-full min-w-0 bg-[var(--bg-input)] border rounded-lg px-1.5 flex items-center gap-1 overflow-hidden text-left transition-colors ${isOpen ? 'border-bony-orange/60' : 'border-bony-border hover:border-bony-orange/40'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
                {selected.length > 0 ? (
                    <>
                        {visibles.map(item => {
                            const badgeStyle = (type === 'brand' && BRAND_COLORS[item as BrandType])
                                || 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600';
                            return (
                                <span key={item} className={`shrink-0 max-w-[92px] truncate px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeStyle}`}>
                                    {type === 'brand' ? libelleMarqueDigital(item) : item}
                                </span>
                            );
                        })}
                        {reste > 0 && (
                            <span className="shrink-0 px-1 py-0.5 rounded text-[10px] font-bold text-bony-muted border border-bony-border">
                                +{reste}
                            </span>
                        )}
                    </>
                ) : (
                    <span className="truncate text-[11px] text-bony-muted italic">{label}</span>
                )}
                <span className="flex-1" />
                <ChevronDown size={12} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180 text-bony-orange' : 'text-bony-muted'}`} />
            </button>

            <FloatingPanel
                open={isOpen}
                onClose={() => setIsOpen(false)}
                triggerRef={triggerRef}
                minWidth={220}
                role="listbox"
                className="rounded-2xl p-1.5"
            >
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                    {options.map(opt => {
                        const isSelected = selected.includes(opt);
                        return (
                            <button
                                key={opt}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => toggleOption(opt)}
                                className={`flex items-center gap-2 px-2 py-2 rounded-xl text-xs text-left transition-colors min-w-0 ${isSelected ? 'bg-bony-orange/10 dark:bg-white/10 text-bony-orange dark:text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'}`}
                            >
                                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'border-bony-orange bg-bony-orange' : 'border-slate-300 dark:border-slate-600'}`}>
                                    {isSelected && <Check size={10} className="text-white" />}
                                </span>
                                {/* Libellé traduit comme la pastille : le tag stocké reste `Holding`,
                                    l'équipe le connaît sous le nom « GROUPE BONY ». */}
                                <span className="truncate min-w-0">{type === 'brand' ? libelleMarqueDigital(opt) : opt}</span>
                            </button>
                        );
                    })}
                </div>
            </FloatingPanel>
        </>
    );
};

// Micro-intitulé d'un contrôle de la ligne. Les sélecteurs se ressemblaient tous et
// n'étaient identifiables que par leur texte de remplacement — qui disparaît dès qu'une
// valeur est choisie. Reproche direct de Théo (« mal agencé »).
const Etiquette: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="block text-[8px] leading-none uppercase tracking-wider text-bony-muted mb-1 truncate">{children}</span>
);

// --- MEDIA HELPERS ---
//
// `post.mediaFiles` porte DEUX formes, volontairement disjointes :
//  - un fichier hébergé par Gearbox  → `/uploads/calendar/<uuid>.<ext>` (POST /api/uploads/calendar) ;
//  - un LIEN EXTERNE                 → `https://…` (WeTransfer, SharePoint, Drive…).
// Aucun modèle Prisma dédié n'est nécessaire : `mediaFiles` est un `String[]`, et les
// deux purges (30j des archives, suppression de post) ne touchent QUE les urls préfixées
// `/uploads/calendar/` — voir backend/src/jobs/purge.ts et backend/src/routes/social.ts.
// ⚠️ Conséquence à connaître : un LIEN survit à la purge 30j alors que les fichiers du
// même post disparaissent. C'est voulu (le lien reste la source), d'où la ventilation
// « n fichiers · n liens » dans les libellés plutôt qu'un total opaque.
const MEDIA_MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2 Go
const MEDIA_ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];

const estLienExterne = (url: string) => /^https?:\/\//i.test(url);

/**
 * Adresse OUVRABLE d'un `post.link`, ou `null` si on refuse de la rendre cliquable.
 *
 * ⚠️ CE GARDE EST LE PRIX DU LIEN CLIQUABLE (correctif 50). Tant que le lien n'était
 * qu'un champ de saisie, son contenu était inerte. `SocialPost.link` n'est validé NULLE
 * PART — `String` libre côté Prisma, et la route ne le regarde pas — donc un
 * `javascript:…` ou un `data:text/html;…` saisi par n'importe quel compte des
 * `EDIT_ROLES` deviendrait, sans ce filtre, un exécutable d'un clic dans la session du
 * collègue qui le suit. Même doctrine que `entreeMediaValide` côté serveur
 * (`backend/src/routes/social.ts`) : on n'accepte QUE `http`/`https`.
 *
 * `www.…` est préfixé parce que c'est ce que l'équipe colle réellement, et qu'une url
 * sans protocole serait sinon interprétée comme un chemin RELATIF à Gearbox.
 */
const hrefSur = (lien?: string): string | null => {
    const brut = (lien ?? '').trim();
    if (!brut) return null;
    const candidat = /^www\./i.test(brut) ? `https://${brut}` : brut;
    if (!estLienExterne(candidat)) return null;
    try {
        const u = new URL(candidat);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch {
        return null;
    }
};

// ⚠️ Le garde `!estLienExterne` est LOAD-BEARING : sans lui, un lien de partage se
// terminant par `/video.mp4` (WeTransfer en produit) partirait dans un `<video src>`,
// c'est-à-dire une requête sortante vers un tiers depuis le navigateur de chaque
// collègue — exactement la fuite qu'on refuse d'ouvrir (cf. le trou `avatarUrl`).
const isVideoUrl = (url: string) => !estLienExterne(url) && /\.(mp4|mov)$/i.test(url);

const mediaFilename = (url: string) =>
    estLienExterne(url) ? libelleCourt(url) : (url.split('/').pop() ?? url);

/** « 2 fichiers · 1 lien », ou la forme simple quand il n'y a qu'un genre. */
const libelleMedias = (urls: string[]): string => {
    const liens = urls.filter(estLienExterne).length;
    const fichiers = urls.length - liens;
    const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    if (liens === 0) return pluriel(fichiers, 'fichier');
    if (fichiers === 0) return pluriel(liens, 'lien');
    return `${pluriel(fichiers, 'fichier')} · ${pluriel(liens, 'lien')}`;
};

/**
 * Numéro d'ordre d'un visuel.
 * ⚠️ C'est la moitié de la demande de l'équipe : l'ordre du tableau EST l'ordre de
 * diffusion à respecter, mais rien ne l'affichait — il fallait le deviner. Il se lit
 * maintenant, et se change au glisser-déposer.
 */
const NumeroMedia: React.FC<{ index: number }> = ({ index }) => (
    <span className="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] font-bold flex items-center justify-center pointer-events-none">
        {index + 1}
    </span>
);

// --- COMPONENT: MEDIA MANAGER MODAL ---
interface MediaManagerModalProps {
    post: SocialPost;
    canEdit: boolean;
    onClose: () => void;
    /**
     * Persiste la nouvelle liste d'URLs ET les noms d'origine correspondants.
     * ⚠️ Les deux tableaux sont PARALLÈLES : même longueur, même ordre, l'index fait le
     * lien. Ne jamais en modifier un sans l'autre — le serveur recale de toute façon
     * (`normaliserMediaNames` dans routes/social.ts), mais laisser diverger ici ferait
     * afficher le nom d'un autre visuel entre-temps.
     */
    onSaveMedia: (postId: string, mediaFiles: string[], mediaNames: string[]) => Promise<void>;
}

const MediaManagerModal: React.FC<MediaManagerModalProps> = ({ post, canEdit, onClose, onSaveMedia }) => {
    const [medias, setMedias] = useState<string[]>(post.mediaFiles ?? []);
    /**
     * Noms d'ORIGINE, alignés sur `medias` par l'index.
     * ⚠️ Recalés à la longueur de `medias` dès l'ouverture : une publication antérieure au
     * correctif 49 n'a pas de noms, et l'écran doit alors retomber sur le nom de fichier.
     */
    const [noms, setNoms] = useState<string[]>(() =>
        (post.mediaFiles ?? []).map((_, i) => (post.mediaNames ?? [])[i] ?? '')
    );
    /** Index en cours de glissement, pour le réordonnancement. */
    const [glisse, setGlisse] = useState<number | null>(null);
    const [dragging, setDragging] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [lienSaisi, setLienSaisi] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Nom À AFFICHER pour le média d'index `i` : le nom d'origine s'il existe, sinon le
     * nom du fichier (l'uuid) comme avant le correctif 49.
     */
    const nomAffiche = (i: number) => (noms[i] || '').trim() || mediaFilename(medias[i]);

    /** Enregistre les deux tableaux ENSEMBLE, et ne met l'écran à jour qu'en cas de succès. */
    const enregistrer = async (nouveauxMedias: string[], nouveauxNoms: string[]) => {
        await onSaveMedia(post.id, nouveauxMedias, nouveauxNoms);
        setMedias(nouveauxMedias);
        setNoms(nouveauxNoms);
    };

    // Upload séquentiel : chaque fichier -> POST /api/uploads/calendar -> URL
    // ajoutée à post.mediaFiles (persisté à chaque ajout).
    const processFiles = async (files: FileList | File[]) => {
        setError(null);
        let current = [...medias];
        let currentNoms = [...noms];
        for (const file of Array.from(files)) {
            if (!MEDIA_ACCEPTED.includes(file.type)) {
                setError(`Format non supporté : "${file.name}". Accepté : JPG, PNG, WebP, MP4, MOV.`);
                continue;
            }
            if (file.size > MEDIA_MAX_SIZE) {
                setError(`"${file.name}" dépasse la limite de 2 Go.`);
                continue;
            }
            try {
                setUploading(true);
                const url = await db.uploadFile('calendar', file);
                current = [...current, url];
                // ⚠️ Le nom d'origine est disponible ICI, et nulle part ailleurs : le
                // serveur ne le voit jamais (multer le remplace par un uuid AVANT
                // d'écrire sur disque, règle de sécurité de routes/uploads.ts). Si on ne
                // le capture pas à cet instant, il est définitivement perdu.
                currentNoms = [...currentNoms, file.name];
                await enregistrer(current, currentNoms);
            } catch (e) {
                setError(e instanceof ApiError ? e.message : `Échec de l'upload de "${file.name}".`);
            } finally {
                setUploading(false);
            }
        }
    };

    /**
     * ⚠️ Suppression PAR INDEX, et non par valeur d'URL comme avant le correctif 49 :
     * `medias.filter(m => m !== url)` retirait TOUTES les occurrences, donc deux fois le
     * même lien externe disparaissaient ensemble. Et avec des noms parallèles, filtrer par
     * valeur désalignerait les deux tableaux.
     */
    const handleDelete = async (index: number) => {
        if (!confirm(`Retirer « ${nomAffiche(index)} » du post ?`)) return;
        try {
            await enregistrer(medias.filter((_, i) => i !== index), noms.filter((_, i) => i !== index));
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Échec de la suppression.');
        }
    };

    /**
     * Réordonnancement par glisser-déposer. L'ordre du tableau EST l'ordre de diffusion
     * attendu par l'équipe — c'est la demande d'origine : « les images se renomment à
     * l'import, cela complique la transmission de l'ordre des visuels à respecter ».
     * ⚠️ Les deux tableaux se déplacent ENSEMBLE, sinon les noms suivent les mauvais
     * visuels.
     */
    const deplacer = async (de: number, vers: number) => {
        if (de === vers || de < 0 || vers < 0) return;
        const bouge = <T,>(t: T[]) => { const c = [...t]; const [x] = c.splice(de, 1); c.splice(vers, 0, x); return c; };
        try {
            await enregistrer(bouge(medias), bouge(noms));
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Échec du réordonnancement.');
        }
    };

    // ⚠️ Deux comportements, et ce n'est pas cosmétique : l'attribut `download` est
    // IGNORÉ en cross-origin. Sur un lien externe, la version « <a download> » faisait
    // NAVIGUER l'onglet Gearbox au lieu de télécharger — donc perte de la saisie en
    // cours dans le calendrier. Un lien s'ouvre à part, avec noopener (sans lui, la
    // page ouverte accède à window.opener).
    const handleOuvrirOuTelecharger = (url: string) => {
        if (estLienExterne(url)) {
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        const a = document.createElement('a');
        a.href = url;
        // Le fichier téléchargé porte son NOM D'ORIGINE, plus l'uuid.
        a.download = nomAffiche(medias.indexOf(url));
        a.click();
    };

    // Ajout d'un LIEN externe (WeTransfer, SharePoint, Drive…). Même chemin de
    // persistance que l'upload : onSaveMedia → PUT /api/social/:id.
    const handleAjouterLien = async () => {
        const brut = lienSaisi.trim();
        if (!brut) return;
        setError(null);
        if (!estLienExterne(brut)) {
            setError('Colle un lien commençant par http:// ou https:// — WeTransfer, SharePoint, Drive…');
            return;
        }
        try {
            new URL(brut);
        } catch {
            setError("Ce lien n'est pas une adresse valide.");
            return;
        }
        if (medias.includes(brut)) {
            setError('Ce lien est déjà attaché à ce post.');
            return;
        }
        const updated = [...medias, brut];
        // Un lien n'a pas de « nom d'origine » : on lui donne son libellé court, ce que
        // l'utilisateur reconnaîtra, plutôt qu'une chaîne vide qui afficherait l'url brute.
        const updatedNoms = [...noms, libelleCourt(brut)];
        try {
            await enregistrer(updated, updatedNoms);
            setLienSaisi('');
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Échec de l'ajout du lien.");
        }
    };

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="glass-strong glass-sheen relative overflow-hidden rounded-xl w-full max-w-2xl shadow-glass-lg flex flex-col max-h-[85vh]">

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
                                {uploading ? (
                                    'Envoi en cours…'
                                ) : (
                                    <>Glisse des fichiers ici ou <span className="text-bony-orange font-bold">clique pour parcourir</span></>
                                )}
                            </p>
                            <p className="text-[10px] text-bony-muted mt-1 uppercase tracking-widest">JPG · PNG · WebP · MP4 · MOV — max 2 Go</p>
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

                    {/* Ajout d'un LIEN externe — dans le même garde `canEdit` que la zone de
                        dépôt, donc fermé au chef de site (lecture seule) sans test en plus. */}
                    {canEdit && (
                        <div className="mx-5 mt-3 flex items-center gap-2">
                            <div className="relative flex-1">
                                <LinkIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                                <input
                                    type="url"
                                    value={lienSaisi}
                                    onChange={e => setLienSaisi(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAjouterLien(); } }}
                                    placeholder="…ou colle un lien WeTransfer, SharePoint, Drive…"
                                    className="w-full bg-[var(--bg-input)] border border-bony-border rounded-xl pl-9 pr-3 py-2 text-xs text-bony-text outline-none transition-all placeholder-slate-400 dark:placeholder-slate-600 focus:border-bony-orange/60"
                                />
                            </div>
                            <button
                                onClick={handleAjouterLien}
                                disabled={!lienSaisi.trim()}
                                className="px-3 py-2 rounded-xl text-xs font-bold bg-bony-orange/10 text-bony-orange border border-bony-orange/30 hover:bg-bony-orange/20 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            >
                                Ajouter
                            </button>
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
                                {medias.map((url, index) => estLienExterne(url) ? (
                                    // ⚠️⚠️ TUILE LIEN — un lien externe ne doit JAMAIS atteindre
                                    // un <img src>, un <video src> ni la lightbox : ce serait une
                                    // requête sortante émise par le navigateur de CHAQUE collègue
                                    // qui ouvre la modale, donc une fuite d'IP et un accusé de
                                    // consultation offerts au tiers (pixel de traçage). C'est
                                    // exactement le trou ouvert de `avatarUrl` (BUGS-CONNUS.md),
                                    // sauf qu'ici on le créerait volontairement. On RECONNAÎT donc
                                    // le domaine, sans jamais charger quoi que ce soit : zéro
                                    // requête réseau tant que l'utilisateur n'a pas cliqué.
                                    //
                                    // `components/LinkPreview.tsx` n'est PAS réutilisé ici : sa
                                    // branche « aperçu riche » rend une vignette <img> servie par
                                    // un tiers. Arbitrage acté pour le Chat, non étendu au Digital
                                    // — et `aUnApercuRiche()` est faux sur SharePoint/WeTransfer,
                                    // la branche ne servirait à rien.
                                    <a
                                        // ⚠️ La clé porte l'INDEX en plus de l'url : deux fois le même
                                        // lien externe est légitime, et `key={url}` les confondait.
                                        key={`${index}:${url}`}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={url}
                                        draggable={canEdit}
                                        onDragStart={() => setGlisse(index)}
                                        onDragOver={e => { if (glisse !== null) e.preventDefault(); }}
                                        onDrop={e => { e.preventDefault(); if (glisse !== null) { deplacer(glisse, index); setGlisse(null); } }}
                                        onDragEnd={() => setGlisse(null)}
                                        className={`group relative rounded-xl overflow-hidden border bg-white/45 dark:bg-white/[0.04] aspect-square flex flex-col items-center justify-center gap-2 p-3 text-center transition-colors ${glisse === index ? 'border-bony-orange opacity-50' : 'border-bony-border hover:border-bony-orange/50'}`}
                                    >
                                        <NumeroMedia index={index} />
                                        <LinkIcon size={20} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                        {(() => {
                                            const f = fournisseurDe(url);
                                            const classe = f ? f.classe : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
                                            return (
                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${classe}`}>
                                                    {f ? f.nom : 'Lien'}
                                                </span>
                                            );
                                        })()}
                                        <span className="text-[9px] text-bony-muted leading-tight break-all line-clamp-3">
                                            {libelleCourt(url)}
                                        </span>
                                        {/* Overlay : Ouvrir (le <a> le fait déjà) + Retirer */}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/55 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none">
                                            <span className="p-2 bg-bony-panel/90 rounded-lg text-bony-blue" title="Ouvrir dans un nouvel onglet">
                                                <ExternalLink size={16} />
                                            </span>
                                            {canEdit && (
                                                <button
                                                    onClick={e => { e.preventDefault(); e.stopPropagation(); handleDelete(index); }}
                                                    className="p-2 bg-bony-panel/90 rounded-lg text-red-400 hover:bg-red-500/20 transition pointer-events-auto"
                                                    title="Retirer"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </a>
                                ) : (
                                    <div
                                        key={`${index}:${url}`}
                                        draggable={canEdit}
                                        onDragStart={() => setGlisse(index)}
                                        onDragOver={e => { if (glisse !== null) e.preventDefault(); }}
                                        onDrop={e => { e.preventDefault(); if (glisse !== null) { deplacer(glisse, index); setGlisse(null); } }}
                                        onDragEnd={() => setGlisse(null)}
                                        className={`group relative rounded-xl overflow-hidden border bg-bony-dark aspect-square ${glisse === index ? 'border-bony-orange opacity-50' : 'border-bony-border'}`}
                                    >
                                        <NumeroMedia index={index} />
                                        {isVideoUrl(url) ? (
                                            <video
                                                src={url}
                                                className="w-full h-full object-cover"
                                                controls
                                                preload="metadata"
                                            />
                                        ) : (
                                            <img
                                                src={url}
                                                alt={nomAffiche(index)}
                                                className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition"
                                                onClick={() => setLightboxSrc(url)}
                                            />
                                        )}
                                        {/* Overlay on hover (pointer-events-none pour laisser les contrôles vidéo cliquables) */}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/55 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none">
                                            <button
                                                onClick={e => { e.stopPropagation(); handleOuvrirOuTelecharger(url); }}
                                                className="p-2 bg-bony-panel/90 rounded-lg text-bony-blue hover:bg-bony-panel transition pointer-events-auto"
                                                title="Télécharger"
                                            >
                                                <Download size={16} />
                                            </button>
                                            {canEdit && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleDelete(index); }}
                                                    className="p-2 bg-bony-panel/90 rounded-lg text-red-400 hover:bg-red-500/20 transition pointer-events-auto"
                                                    title="Retirer"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                        {/* ⚠️ Le NOM D'ORIGINE, et non plus l'uuid : c'est la demande de
                                            l'équipe (« les images se renomment à l'import »). Repli sur le
                                            nom de fichier pour les publications antérieures au correctif 49. */}
                                        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/80 to-transparent text-[9px] text-white truncate pointer-events-none" title={nomAffiche(index)}>
                                            {nomAffiche(index)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-bony-border shrink-0 flex items-center justify-between">
                        <span className="text-[10px] text-bony-muted uppercase tracking-widest">
                            {medias.length === 0 ? '0 média' : libelleMedias(medias)}
                            {canEdit && medias.length > 1 && (
                                <span className="normal-case tracking-normal text-bony-muted/80"> · glissez les vignettes pour changer l'ordre</span>
                            )}
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

// --- COMPONENT: FIL DE COMMENTAIRES D'UNE PUBLICATION (correctif 50) ---
//
// Demande de l'équipe : laisser une consigne sur un édito sans passer par le chat, où
// elle se perd. La contrainte d'intégration était l'ESPACE — la ligne d'édito a été
// resserrée au correctif 47 et n'a plus de marge — d'où un panneau ouvert à la demande
// depuis la colonne d'actions, et non un bloc affiché en permanence.
//
// ⚠️ MONTÉ SEULEMENT QUAND IL EST OUVERT (rendu conditionnel côté ligne). C'est ce qui
// permet d'y appeler `useRealtimeSync` sans poser 57 abonnements — un par ligne — et de
// ne charger le fil qu'à l'ouverture.
//
// ⚠️ Panneau PORTALISÉ (`FloatingPanel`) et non `absolute` : `.gx-glass-panel` porte un
// `backdrop-filter`, qui crée un contexte d'empilement — c'est ce qui faisait passer
// l'ancien wording SOUS les lignes suivantes (correctif 47).
const PanneauCommentaires: React.FC<{
    postId: string;
    triggerRef: React.RefObject<HTMLElement | null>;
    canEdit: boolean;
    onClose: () => void;
    /** Remonte le nombre réel à la ligne, qui n'a sinon que le compteur du dernier GET. */
    onNombre: (n: number) => void;
}> = ({ postId, triggerRef, canEdit, onClose, onNombre }) => {
    const { user } = useAuth();
    const [commentaires, setCommentaires] = useState<SocialComment[] | null>(null);
    const [saisie, setSaisie] = useState('');
    const [envoiEnCours, setEnvoiEnCours] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);

    // `onNombre` vient du parent et n'est pas mémoïsé : passer par une ref évite de
    // recréer `charger` (et donc de recharger le fil) à chaque rendu de la ligne.
    const onNombreRef = useRef(onNombre);
    onNombreRef.current = onNombre;

    const charger = useCallback(async () => {
        try {
            const liste = await db.getSocialComments(postId);
            setCommentaires(liste);
            onNombreRef.current(liste.length);
            setErreur(null);
        } catch (e) {
            setErreur(e instanceof ApiError ? e.message : 'Commentaires indisponibles.');
        }
    }, [postId]);

    useEffect(() => { charger(); }, [charger]);
    // Un collègue qui commente pendant que le fil est ouvert. Le compteur des AUTRES
    // lignes, lui, se met à jour par le rechargement de l'écran (voir `Digital`).
    useRealtimeSync([...RT_EVENTS.socialComments], charger);

    const envoyer = async () => {
        const texte = saisie.trim();
        if (!texte || envoiEnCours) return;
        setEnvoiEnCours(true);
        try {
            await db.addSocialComment(postId, texte);
            setSaisie('');
            await charger();
        } catch (e) {
            setErreur(e instanceof ApiError ? e.message : 'Envoi impossible.');
        } finally {
            setEnvoiEnCours(false);
        }
    };

    const supprimer = async (id: string) => {
        try {
            await db.deleteSocialComment(id);
            await charger();
        } catch (e) {
            setErreur(e instanceof ApiError ? e.message : 'Suppression impossible.');
        }
    };

    const estAdmin = user?.role === 'Master' || user?.role === 'Administrator';
    const quand = (iso: string) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime())
            ? ''
            : `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    };

    return (
        <FloatingPanel
            open
            onClose={onClose}
            triggerRef={triggerRef}
            width={320}
            minWidth={280}
            maxHeight={360}
            align="end"
            className="rounded-2xl p-2"
        >
            <div className="flex flex-col min-h-0 gap-2">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-bony-muted">Commentaires</span>
                    <button type="button" onClick={onClose} className="p-1 -m-1 text-bony-muted hover:text-bony-orange transition-colors" title="Fermer">
                        <X size={12} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2 px-1">
                    {commentaires === null ? (
                        <p className="text-[11px] text-bony-muted italic py-2">Chargement…</p>
                    ) : commentaires.length === 0 ? (
                        <p className="text-[11px] text-bony-muted italic py-2">
                            Aucun commentaire. {canEdit ? 'Laissez une consigne à l’équipe.' : ''}
                        </p>
                    ) : commentaires.map(c => (
                        <div key={c.id} className="flex items-start gap-2 group/com">
                            <Avatar userId={c.authorId} name={c.author?.name ?? '?'} color={c.author?.avatarColor} size={22} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1.5 min-w-0">
                                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                                        {/* Compte supprimé depuis : on ne fabrique pas un nom, on le dit. */}
                                        {c.author?.name ?? 'Compte supprimé'}
                                    </span>
                                    <span className="text-[9px] text-bony-muted shrink-0">{quand(c.createdAt)}</span>
                                </div>
                                <p className="text-[11px] leading-snug text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                                    {c.content}
                                </p>
                            </div>
                            {canEdit && (c.authorId === user?.id || estAdmin) && (
                                <button
                                    type="button"
                                    onClick={() => supprimer(c.id)}
                                    title="Supprimer ce commentaire"
                                    // Visible au doigt sur mobile, discret au survol sur ordinateur :
                                    // c'est la parade du correctif 31 sur la sourdine du chat.
                                    className="shrink-0 p-1 rounded text-slate-400 dark:text-slate-600 hover:text-red-500 transition-colors opacity-100 md:opacity-0 md:group-hover/com:opacity-100"
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {erreur && <p className="text-[10px] text-red-500 px-1">{erreur}</p>}

                {canEdit && (
                    <div className="border-t border-bony-border pt-2 flex items-end gap-1.5">
                        <textarea
                            value={saisie}
                            onChange={e => setSaisie(e.target.value)}
                            // ⚠️ Entrée envoie, Maj+Entrée passe à la ligne : même convention que le
                            // Chat. Aucun appel réseau à la frappe — l'état est purement local.
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
                            }}
                            rows={2}
                            maxLength={2000}
                            placeholder="Écrire un commentaire…"
                            className="flex-1 min-w-0 bg-[var(--bg-input)] border border-bony-border rounded-lg px-2 py-1.5 text-[11px] text-bony-text outline-none focus:border-bony-violet resize-none custom-scrollbar"
                        />
                        <button
                            type="button"
                            onClick={envoyer}
                            disabled={!saisie.trim() || envoiEnCours}
                            title="Envoyer (Entrée)"
                            className="shrink-0 w-9 h-9 rounded-lg bg-bony-orange/15 border border-bony-orange/50 text-bony-orange flex items-center justify-center transition-opacity disabled:opacity-40"
                        >
                            <Send size={14} />
                        </button>
                    </div>
                )}
            </div>
        </FloatingPanel>
    );
};

// --- COMPONENT: EDITO ROW ---
interface EditoRowProps {
    post: SocialPost;
    /**
     * Écrit UN champ de la publication.
     *
     * ⚠️ Remplace l'ancien `onUpdate(publicationEntiere)` au correctif 49. Les douze
     * contrôles de cette ligne ne modifient chacun QU'UN champ : passer l'objet entier
     * obligeait à le reconstruire depuis `post`, c'est-à-dire depuis la closure du rendu.
     * Avec une saisie différée, cette closure est périmée au moment du flush — un menu
     * déroulant modifié entre-temps serait réécrit avec son ancienne valeur. L'écran
     * relit donc la publication COURANTE par son id (voir `changerChampPublication`).
     */
    onChangerChamp: (postId: string, champ: keyof SocialPost, valeur: any) => void;
    onDelete: (post: SocialPost) => void;
    canEdit: boolean;
    canDelete: boolean;
    isArchivedView?: boolean;
    networkOptions: string[];
    co2Options: string[];
    /** Mentions Loi LOM, éditables depuis « Gestion des TAGS » depuis le correctif 49. */
    lomOptions: string[];
    mediaCount: number;
    onOpenMedia: (postId: string) => void;
    /** Signale qu'un champ texte prend/perd le focus (voir `champsFocalisesRef`). */
    onFocusChange: (focus: boolean) => void;
}

/**
 * ⚠️ `React.memo` — indispensable, et inopérant sans les `useCallback` de l'écran.
 * Avant le correctif 49, une frappe dans n'importe quel champ re-rendait les 57 lignes,
 * chacune remontant 1 DatePicker + 4 Select + 3 VisualMultiSelect. C'est la moitié de la
 * lenteur ressentie. Si quelqu'un repasse un jour `onChangerChamp`/`onDelete`/`onOpenMedia`
 * en fonctions recréées à chaque rendu, ce `memo` redeviendra silencieusement inutile.
 */
// ⚠️ Props annotées SUR LA FONCTION, pas via `React.FC<...>` sur la const : combiné à
// `React.memo`, l'annotation externe fait PERDRE la vérification des props à l'appel.
// Constaté le 09/09/2026 — un `onUpdate={...}` resté en place ne produisait aucune erreur
// TypeScript, et `onChangerChamp` serait arrivé `undefined` à l'exécution. Défaut
// silencieux, donc à ne pas réintroduire.
const EditoRow = React.memo(function EditoRow({ post, onChangerChamp, onDelete, canEdit, canDelete, isArchivedView, networkOptions, co2Options, lomOptions, mediaCount, onOpenMedia, onFocusChange }: EditoRowProps) {
    const [wordingOuvert, setWordingOuvert] = useState(false);
    const wordingRef = useRef<HTMLDivElement>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    /** Bascule lien cliquable ↔ saisie (correctif 50). Voir le bloc LIEN plus bas. */
    const [editionLien, setEditionLien] = useState(false);
    const [commentairesOuverts, setCommentairesOuverts] = useState(false);
    const boutonCommentairesRef = useRef<HTMLButtonElement>(null);
    /**
     * Nombre de commentaires.
     *
     * ⚠️ Deux sources, et l'ordre compte : `post.commentCount` vient du dernier
     * `GET /api/social` et peut donc être périmé de quelques secondes ; dès que le
     * panneau a lu le fil, c'est LUI qui fait autorité — sinon la pastille afficherait
     * encore « 2 » juste après qu'on a supprimé le troisième commentaire.
     */
    const [nbCommentairesLus, setNbCommentairesLus] = useState<number | null>(null);
    const nbCommentaires = nbCommentairesLus ?? post.commentCount ?? 0;
    // Toute valeur FRAÎCHE du serveur reprend la main : sans cette remise à zéro, une
    // ligne dont le fil a été ouvert une fois resterait figée sur ce qu'elle avait lu,
    // même après qu'un collègue a commenté et que l'écran s'est rechargé.
    useEffect(() => { setNbCommentairesLus(null); }, [post.commentCount]);
    const hrefLien = hrefSur(post.link);
    /**
     * Options du sélecteur « Sites ».
     *
     * ⚠️ `DIGITAL_CONCESSIONS` ne contient plus les PLAQUES depuis le correctif 50, mais
     * une publication écrite avant peut en porter une. Le bouton du `VisualMultiSelect`
     * rend `selected` et non `options` : la plaque resterait donc AFFICHÉE sans figurer
     * dans le menu, c'est-à-dire impossible à décocher. On complète les options par les
     * valeurs déjà retenues — ce qui retire la plaque des nouveaux choix sans piéger
     * l'existant.
     */
    const optionsSites = useMemo(
        () => [...DIGITAL_CONCESSIONS, ...post.concessions.filter(c => !DIGITAL_CONCESSIONS.includes(c))],
        [post.concessions]
    );
    /**
     * Brouillon du wording, remonté par `ChampTexte` à chaque frappe.
     * ⚠️ Sert UNIQUEMENT à l'aperçu et au compteur de caractères, qui lisaient
     * `post.wording` et figeaient donc pendant la frappe une fois l'écriture différée.
     * `null` = pas de saisie en cours, on lit la valeur enregistrée.
     */
    const [brouillonWording, setBrouillonWording] = useState<string | null>(null);
    const wordingAffiche = brouillonWording ?? post.wording;
    
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
        onChangerChamp(post.id, 'archived', !post.archived);
    };

    // Ligne d'edito : `flex-wrap` + bases explicites, PAS un enchainement de largeurs
    // fixes. La version precedente alignait 5 colonnes rigides (128+250+224+160+48 =
    // 810 px de minimum) qui se comprimaient mutuellement sous ~900 px, et deux piles
    // verticales de selecteurs imposaient 178 px de hauteur a chaque ligne pendant que
    // Date/Statut et Contenu laissaient 78 px de vide (mesure du 02/09/2026).
    return (
        <div className={`group relative flex flex-wrap items-start gap-x-3 gap-y-2 gx-glass-panel rounded-xl hover:bg-slate-50 dark:hover:bg-[#252525] transition-colors p-2.5 ${post.archived ? 'opacity-60 grayscale' : ''}`}>
            
            {/* Status Strip */}
            <div className={`h-1 w-full sm:h-auto sm:w-1 sm:self-stretch rounded-full ${stripColor} shrink-0`}></div>

            {/* CONTENU — la moitie gauche, et la plus large. Titre + lien sur une ligne,
                puis le wording. Cliquer le wording ouvre un vrai panneau d'ecriture. */}
            <div className="flex-[1_1_340px] min-w-0 sm:min-w-[260px] flex flex-col gap-1.5 self-stretch">
                <div className="flex items-center gap-2 min-w-0">
                    <ChampTexte
                        cle={`${post.id}:title`}
                        valeur={post.title}
                        disabled={!canEdit}
                        onValider={v => onChangerChamp(post.id, 'title', v)}
                        onFocusChange={onFocusChange}
                        className="flex-1 min-w-0 bg-transparent border-none p-0 text-sm font-bold text-slate-900 dark:text-white outline-none placeholder-slate-400 dark:placeholder-slate-600 focus:text-bony-orange transition-colors"
                        placeholder="Titre de la publication..."
                    />
                    {/* LIEN — cliquable au repos, editable au crayon (correctif 50).
                        L'equipe recopiait l'adresse a la main : le champ etait un input nu,
                        sans <a>. On garde la saisie differee pour l'edition, et on rend un
                        vrai lien le reste du temps. Le champ reste affiche tant qu'il n'y a
                        rien a ouvrir (vide, ou protocole refuse par `hrefSur`) : sans quoi
                        une saisie non conforme deviendrait invisible ET ineditable. */}
                    <div className="flex items-center gap-1 shrink-0 w-[34%] max-w-[230px]">
                        <LinkIcon size={11} className={post.link ? "text-blue-500 dark:text-blue-400 shrink-0" : "text-slate-400 dark:text-slate-600 shrink-0"}/>
                        {hrefLien && !editionLien ? (
                            <>
                                <a
                                    href={hrefLien}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={post.link}
                                    className="flex-1 min-w-0 truncate text-[11px] text-blue-500 dark:text-blue-300 underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:hover:text-blue-200 transition-colors"
                                >
                                    {libelleCourt(hrefLien)}
                                </a>
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={() => setEditionLien(true)}
                                        title="Modifier le lien"
                                        className="shrink-0 p-1 -my-1 rounded text-slate-400 dark:text-slate-600 hover:text-bony-orange transition-colors"
                                    >
                                        <Edit2 size={11} />
                                    </button>
                                )}
                            </>
                        ) : (
                            <ChampTexte
                                cle={`${post.id}:link`}
                                valeur={post.link}
                                disabled={!canEdit}
                                autoFocus={editionLien}
                                onValider={v => onChangerChamp(post.id, 'link', v)}
                                // ⚠️ On referme sur la PERTE DE FOCUS, pas sur `onValider` :
                                // celui-ci n'est appele que si la valeur a CHANGE (garde de
                                // `ChampTexte`), donc ouvrir puis renoncer laisserait le
                                // champ ouvert indefiniment.
                                onFocusChange={f => { onFocusChange?.(f); if (!f) setEditionLien(false); }}
                                placeholder="Lien…"
                                className="bg-transparent text-[11px] text-blue-500 dark:text-blue-300 w-full min-w-0 truncate outline-none placeholder-slate-400 dark:placeholder-slate-700 hover:text-blue-600 dark:hover:text-blue-200 transition-colors"
                            />
                        )}
                    </div>
                </div>

                {/* ⚠️⚠️ LE WORDING NE S'AGRANDIT PLUS « EN PLACE ».
                    L'ancienne version passait le textarea en `absolute` au focus : piegee
                    dans le contexte d'empilement de la ligne (cree par le backdrop-filter
                    de .gx-glass-panel), elle passait SOUS les editos suivants — exactement
                    le meme defaut que les menus deroulants, et il a survecu a leur
                    correctif parce que je n'avais regarde que les menus.
                    L'edition se fait donc dans un FloatingPanel, portalise sur
                    document.body : rien ne peut passer devant. */}
                <div
                    ref={wordingRef}
                    onClick={() => canEdit && setWordingOuvert(true)}
                    className={`h-[78px] shrink-0 w-full bg-slate-50 dark:bg-black/30 border rounded-lg px-2.5 py-1.5 text-[11px] leading-[1.45] text-slate-700 dark:text-slate-300 overflow-hidden whitespace-pre-wrap transition-colors ${wordingOuvert ? 'border-bony-violet' : 'border-bony-border'} ${canEdit ? 'cursor-text hover:border-bony-violet/60' : ''}`}
                >
                    {wordingAffiche
                        ? wordingAffiche
                        : <span className="text-slate-400 dark:text-slate-600 italic">Rédiger le post ici…</span>}
                </div>
                {/* ⚠️ Hauteur FIXE et non `flex-1` : laissee libre, la zone suivait la
                    longueur du texte et une ligne montait a 507 px (mesure). Le texte
                    complet se lit et s'edite dans le panneau. */}

                <FloatingPanel
                    open={wordingOuvert}
                    onClose={() => setWordingOuvert(false)}
                    triggerRef={wordingRef}
                    width="trigger"
                    minWidth={420}
                    maxHeight={340}
                    className="rounded-2xl p-2"
                >
                    {/* ⚠️ SAISIE DIFFÉRÉE — c'est LE correctif de la lenteur signalée par l'équipe.
                        Avant, chaque caractère envoyait la publication ENTIÈRE au serveur, qui
                        diffusait un événement faisant recharger toute la liste chez TOUS les
                        collègues connectés. Une personne qui rédigeait ralentissait l'équipe.
                        Le texte n'est désormais envoyé qu'à la fermeture du panneau (blur ou
                        démontage). `onBrouillonChange` ne sert qu'à l'aperçu et au compteur. */}
                    <ChampTexte
                        multiligne
                        cle={`${post.id}:wording`}
                        valeur={post.wording}
                        disabled={!canEdit}
                        onValider={v => onChangerChamp(post.id, 'wording', v)}
                        onFocusChange={onFocusChange}
                        onBrouillonChange={setBrouillonWording}
                        className="w-full h-56 bg-transparent border-none outline-none resize-none text-xs leading-relaxed text-bony-text custom-scrollbar"
                        placeholder="Rédiger le post ici..."
                    />
                    <div className="flex items-center justify-between px-1 pt-1 border-t border-bony-border">
                        <span className="text-[10px] text-bony-muted">{wordingAffiche.length} caractères</span>
                        <button
                            type="button"
                            onClick={() => setWordingOuvert(false)}
                            className="text-[11px] font-bold text-bony-orange hover:opacity-80 transition-opacity px-2 py-1"
                        >
                            Fermer
                        </button>
                    </div>
                </FloatingPanel>
            </div>

            {/* REGLAGES — TOUS les controles au meme endroit.
                Ils etaient repartis en deux paquets de part et d'autre du contenu
                (Date/Statut/Service/Diffusion d'un cote, Marques/Sites/Reseaux/LOM/CO2 de
                l'autre) : on cherchait un reglage dans deux zones separees par le texte.
                Reproche direct de Theo. Neuf controles, une grille, un seul endroit. */}
            <div className="flex-[1_1_560px] min-w-0 sm:min-w-[480px] grid grid-cols-2 sm:grid-cols-5 gap-x-1.5 gap-y-1.5 self-stretch content-start">
                <div className="min-w-0">
                    <Etiquette>Date</Etiquette>
                    {canEdit ? (
                        <DatePicker
                            value={post.date}
                            onChange={v => onChangerChamp(post.id, 'date', v)}
                            size="sm"
                            compact
                        />
                    ) : (
                        <div className="w-full h-11 md:h-[34px] flex items-center bg-[var(--bg-input)] border border-bony-border rounded-2xl px-3 text-xs text-bony-text">
                            {post.date ? parseLocalDate(post.date).toLocaleDateString('fr-FR') : '—'}
                        </div>
                    )}
                </div>

                <div className="min-w-0">
                    <Etiquette>Statut</Etiquette>
                    <Select
                        value={post.status}
                        disabled={!canEdit}
                        onChange={v => onChangerChamp(post.id, 'status', v as SocialStatus)}
                        options={Object.keys(SOCIAL_STATUS_COLORS).map(s => ({ value: s, label: libelleStatutSocial(s) }))}
                        size="sm"
                    />
                </div>

                <div className="min-w-0">
                    <Etiquette>Service</Etiquette>
                    <Select
                        value={post.service}
                        disabled={!canEdit}
                        onChange={v => onChangerChamp(post.id, 'service', v as SocialServiceType)}
                        options={SOCIAL_SERVICES.map(s => ({ value: s, label: s }))}
                        size="sm"
                    />
                </div>

                <div className="min-w-0">
                    <Etiquette>Marques</Etiquette>
                    <VisualMultiSelect
                        label="Marques…"
                        options={BRANDS}
                        selected={post.brands}
                        onChange={v => onChangerChamp(post.id, 'brands', v as BrandType[])}
                        disabled={!canEdit}
                        type="brand"
                        maxVisible={1}
                    />
                </div>

                <div className="min-w-0">
                    <Etiquette>Sites</Etiquette>
                    <VisualMultiSelect
                        label="Sites…"
                        options={optionsSites}
                        selected={post.concessions}
                        onChange={v => onChangerChamp(post.id, 'concessions', v)}
                        disabled={!canEdit}
                        maxVisible={1}
                    />
                </div>

                <div className="min-w-0">
                    <Etiquette>Réseaux</Etiquette>
                    <VisualMultiSelect
                        label="Réseaux…"
                        options={networkOptions}
                        selected={post.networks}
                        onChange={v => onChangerChamp(post.id, 'networks', v as SocialNetwork[])}
                        disabled={!canEdit}
                        maxVisible={1}
                    />
                </div>

                <div className="min-w-0">
                    <Etiquette>Diffusion</Etiquette>
                    <div className="flex gap-1 h-11 md:h-[34px]">
                        {(['Internet', 'Collaborateurs'] as const).map(t => (
                            <button
                                key={t}
                                type="button"
                                disabled={!canEdit}
                                onClick={() => {
                                    const newTargets = post.targets.includes(t)
                                        ? post.targets.filter(x => x !== t)
                                        : [...post.targets, t];
                                    onChangerChamp(post.id, 'targets', newTargets);
                                }}
                                className={`flex-1 min-w-0 rounded-lg text-[9px] font-bold uppercase border flex items-center justify-center transition-colors ${post.targets.includes(t) ? 'bg-bony-orange/15 text-bony-orange border-bony-orange/50' : 'text-slate-500 dark:text-slate-600 border-bony-border hover:border-slate-400 dark:hover:border-slate-500 bg-[var(--bg-input)]'}`}
                                title={t === 'Internet' ? 'Site internet' : 'Collaborateurs'}
                            >
                                {t === 'Internet' ? 'WEB' : 'COLLAB.'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="min-w-0">
                    <Etiquette>Loi LOM</Etiquette>
                    <Select
                        value={post.lom}
                        disabled={!canEdit}
                        onChange={v => onChangerChamp(post.id, 'lom', v)}
                        options={[{ value: '', label: 'Aucune' }, ...lomOptions.map(l => ({ value: l, label: l }))]}
                        size="sm"
                    />
                </div>

                <div className="min-w-0">
                    <Etiquette>Classe CO²</Etiquette>
                    <Select
                        value={post.co2}
                        disabled={!canEdit}
                        onChange={v => onChangerChamp(post.id, 'co2', v)}
                        options={[{ value: '', label: 'Aucune' }, ...co2Options.map(c => ({ value: c, label: c }))]}
                        size="sm"
                    />
                </div>
            </div>

            {/* ACTIONS — en ligne, et non plus en colonne verticale : la pile forcait la
                ligne a 152 px pour trois boutons de 40 px. */}
            <div className="w-full sm:w-auto sm:ml-auto flex flex-row items-center justify-end gap-1 shrink-0 border-t sm:border-t-0 sm:border-l border-bony-border pt-2 sm:pt-0 sm:pl-2 self-stretch">
                <button
                    onClick={() => onOpenMedia(post.id)}
                    className={`relative w-11 h-11 md:w-9 md:h-9 rounded-lg border flex items-center justify-center transition-all shrink-0 ${mediaCount > 0 ? 'bg-bony-orange/10 border-bony-orange text-bony-orange shadow-[0_0_10px_rgba(247,86,50,0.15)]' : 'bg-slate-100 dark:bg-black/40 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white hover:border-bony-orange/50'}`}
                    title={mediaCount > 0 ? libelleMedias(post.mediaFiles ?? []) : 'Gérer les médias'}
                >
                    <Image size={18}/>
                    {mediaCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-bony-orange text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none shadow">
                            {mediaCount > 9 ? '9+' : mediaCount}
                        </span>
                    )}
                </button>

                {/* COMMENTAIRES — 4e bouton (correctif 50). Le fil n'est chargé qu'à
                    l'ouverture ; la pastille se contente du compteur renvoyé par
                    `GET /api/social`, jusqu'à ce que le panneau donne le nombre réel. */}
                <button
                    ref={boutonCommentairesRef}
                    onClick={() => setCommentairesOuverts(o => !o)}
                    className={`relative w-11 h-11 md:w-9 md:h-9 rounded-lg border flex items-center justify-center transition-all shrink-0 ${nbCommentaires > 0 ? 'bg-bony-violet/10 border-bony-violet text-bony-violet' : 'bg-slate-100 dark:bg-black/40 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white hover:border-bony-violet/50'}`}
                    title={nbCommentaires > 0 ? `${nbCommentaires} commentaire${nbCommentaires > 1 ? 's' : ''}` : 'Commenter'}
                >
                    <MessageSquare size={18}/>
                    {nbCommentaires > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-bony-violet text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none shadow">
                            {nbCommentaires > 9 ? '9+' : nbCommentaires}
                        </span>
                    )}
                </button>
                {commentairesOuverts && (
                    <PanneauCommentaires
                        postId={post.id}
                        triggerRef={boutonCommentairesRef}
                        canEdit={canEdit}
                        onClose={() => setCommentairesOuverts(false)}
                        onNombre={setNbCommentairesLus}
                    />
                )}

                <button
                    disabled={!canEdit}
                    onClick={handleArchiveToggle}
                    className={`p-2 rounded-lg transition-colors ${post.archived ? 'text-bony-orange bg-bony-orange/10' : 'text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5'}`}
                    title={post.archived ? "Désarchiver" : "Archiver"}
                >
                    {post.archived ? <CheckSquare size={18}/> : <Square size={18}/>}
                </button>

                {canDelete && (
                    confirmDelete ? (
                        <button
                            onClick={e => { e.stopPropagation(); onDelete(post); }}
                            onBlur={() => setConfirmDelete(false)}
                            autoFocus
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-500 text-white animate-pulse"
                            title="Confirmer la suppression"
                        >
                            SUPPR ?
                        </button>
                    ) : (
                        <button
                            onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                            className="p-2 rounded-lg text-slate-400 dark:text-slate-600 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Supprimer définitivement"
                        >
                            <Trash2 size={18}/>
                        </button>
                    )
                )}
            </div>
        </div>
    );
});

/**
 * Catégories de tags éditables depuis l'écran.
 *
 * ⚠️ FRONTIÈRE VOLONTAIRE, et c'est la réponse à « donner accès aux autres tags ».
 * Ces trois-là sont ouvertes parce que les champs correspondants de `SocialPost` sont des
 * chaînes LIBRES (`networks`, `co2`, `lom`). Marques, services, statuts et sites ne le
 * sont pas : ils sont adossés à des types de `types.ts`, indexent `BRAND_COLORS` /
 * `SOCIAL_STATUS_COLORS` et pilotent des tests métier. Les rendre éditables en base
 * supprimerait la garantie de compilation sans rien mettre à la place — le schéma Prisma
 * n'a aucun enum et aucune route ne valide ces valeurs. Si le besoin se confirme, c'est
 * un lot dédié qui commence par écrire cette validation côté serveur.
 * Miroir de `CATEGORIES` dans `backend/src/routes/tags.ts` : les deux doivent rester
 * alignées.
 */
type CategorieTag = 'networks' | 'co2' | 'lom';

/** Libellé du champ d'ajout, par catégorie — à compléter en même temps que `CategorieTag`. */
const LIBELLE_AJOUT: Record<CategorieTag, string> = {
    networks: 'un réseau',
    co2: 'une classe CO²',
    lom: 'une mention Loi LOM',
};

// --- COMPONENT: TAGS MANAGER ---
const TagsManager: React.FC<{ 
    tags: DigitalTags, 
    /** ⚠️ Reçoit un PATCH d'une seule catégorie, jamais l'objet complet. */
    onUpdate: (patch: Partial<DigitalTags>) => void,
    canEdit: boolean 
}> = ({ tags, onUpdate, canEdit }) => {
    // --- STATE FOR NEW ITEM ---
    const [newNetwork, setNewNetwork] = useState('');
    const [newCo2, setNewCo2] = useState('');
    const [newLom, setNewLom] = useState('');

    // --- STATE FOR EDITING ---
    const [editingItem, setEditingItem] = useState<{ type: CategorieTag, originalValue: string, currentValue: string } | null>(null);
    
    // --- STATE FOR DELETING CONFIRMATION ---
    const [confirmDelete, setConfirmDelete] = useState<{ type: CategorieTag, value: string } | null>(null);

    // ADD
    const addTag = (type: CategorieTag, value: string) => {
        if (!value.trim()) return;
        const current = tags[type];
        if (current.includes(value.trim())) return;

        // ⚠️ PATCH D'UNE SEULE CATÉGORIE — voir `handleUpdateTags`. Envoyer l'objet
        // entier a effacé les classes CO² et les mentions Loi LOM le 10/09/2026.
        onUpdate({ [type]: [...current, value.trim()] });

        if (type === 'networks') setNewNetwork('');
        else if (type === 'co2') setNewCo2('');
        else setNewLom('');
    };

    // START EDIT
    const startEdit = (e: React.MouseEvent, type: CategorieTag, value: string) => {
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
            onUpdate({ [type]: updatedList });
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
    const handleDeleteClick = (e: React.MouseEvent, type: CategorieTag, value: string) => {
        e.preventDefault();
        e.stopPropagation();

        // If already confirming THIS item, then actually delete
        if (confirmDelete && confirmDelete.type === type && confirmDelete.value === value) {
            onUpdate({ [type]: tags[type].filter(t => t !== value) });
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

    const renderList = (title: string, items: string[], type: CategorieTag, inputValue: string, setInput: (v: string) => void) => (
        <div className="flex-1 gx-glass-panel border border-bony-border rounded-xl flex flex-col min-h-0 shadow-lg h-full overflow-hidden">
            <div className="p-4 border-b border-bony-border bg-slate-100 dark:bg-black/20 shrink-0">
                <h3 className="text-sm font-bold text-bony-text uppercase tracking-widest flex items-center gap-2">
                    {type === 'networks'
                        ? <Globe size={16} className="text-bony-violet"/>
                        : type === 'lom'
                            ? <AlignLeft size={16} className="text-bony-blue"/>
                            : <Settings size={16} className="text-bony-orange"/>}
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
                            placeholder={`Ajouter ${LIBELLE_AJOUT[type]}...`}
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
            {renderList("Mentions Loi LOM", tags.lom, 'lom', newLom, setNewLom)}
        </div>
    );
};

// --- MAIN PAGE ---

const Digital: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useSessionState<Tab>('digital_activeTab', 'Calendrier Editorial');
  const [posts, setPostsRaw] = useState<SocialPost[]>([]);

  /**
   * ⚠️ MIROIR de la liste — c'est LUI que lit la couche réseau, jamais la closure d'un
   * rendu. Même parade qu'au correctif 48 sur les Projets : avec une saisie différée, la
   * publication capturée au rendu est périmée au moment du flush (un menu déroulant
   * modifié entre-temps serait réécrit avec son ancienne valeur).
   */
  const postsRef = useRef<SocialPost[]>([]);

  /**
   * SEULE porte d'écriture de la liste : elle pose AUSSI le miroir.
   *
   * ⚠️ Le calcul se fait DEPUIS LE MIROIR et hors de l'updater React. Muter une ref
   * à l'intérieur d'un updater est un effet de bord dans un réducteur, rejoué deux fois
   * en StrictMode — c'est précisément ce que le correctif 48 s'interdisait côté Projets.
   * Le miroir étant mis à jour de façon synchrone, deux appels successifs dans le même
   * gestionnaire lisent bien l'état le plus récent.
   */
  const setPosts = useCallback((maj: SocialPost[] | ((prev: SocialPost[]) => SocialPost[])) => {
    const suivant = typeof maj === 'function'
      ? (maj as (p: SocialPost[]) => SocialPost[])(postsRef.current)
      : maj;
    postsRef.current = suivant;
    setPostsRaw(suivant);
  }, []);

  /** Nombre de champs de saisie ayant le focus — interdit d'écraser une saisie vive. */
  const champsFocalisesRef = useRef(0);
  /** ⚠️ Stable (`useCallback` sans dépendance) : passée à `EditoRow`, qui est mémoïsé. */
  const suivreFocusChamp = useCallback((focus: boolean) => {
      champsFocalisesRef.current = Math.max(0, champsFocalisesRef.current + (focus ? 1 : -1));
  }, []);
  const [tags, setTags] = useState<DigitalTags>({ networks: [], co2: [], lom: [] });
  /**
   * Les tags ont-ils été LUS avec succès au moins une fois ?
   * ⚠️ L'état ci-dessus démarre à trois listes vides : sans ce drapeau, un écran ouvert
   * pendant une panne de l'API prendrait ces listes vides pour la vérité et les écrirait
   * en base à la première modification. C'est une des deux causes de la perte du
   * 10/09/2026 — l'autre étant l'envoi de l'objet complet, voir `handleUpdateTags`.
   */
  const [tagsCharges, setTagsCharges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mediaModalPostId, setMediaModalPostId] = useState<string | null>(null);
  const [mediaCounts, setMediaCounts] = useState<Record<string, number>>({});
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');

  // Filters & Sort
  const [searchTerm, setSearchTerm] = useSessionState<string>('digital_searchTerm', '');
  /**
   * Brouillon de la recherche.
   * ⚠️ `useSessionState` fait un `JSON.stringify` + `sessionStorage.setItem` SYNCHRONES à
   * chaque écriture, et changer `searchTerm` re-filtre et re-trie toute la liste. Sans ce
   * brouillon, chaque caractère tapé payait les deux. On saisit donc en local et on ne
   * propage qu'après une pause de frappe — même motif que `components/GifPicker.tsx`.
   */
  const [rechercheBrouillon, setRechercheBrouillon] = useState(searchTerm);
  const [filterBrand, setFilterBrand] = useSessionState<BrandType | 'All'>('digital_filterBrand', 'All');
  const [filterService, setFilterService] = useSessionState<SocialServiceType | 'All'>('digital_filterService', 'All');
  const [filterConcession, setFilterConcession] = useSessionState<string>('digital_filterConcession', 'All');
  const [sortOrder, setSortOrder] = useSessionState<'asc' | 'desc'>('digital_sortOrder', 'asc');

  // Planning View State
  const [calendarView, setCalendarView] = useSessionState<CalendarView>('digital_calendarView', 'Mois');
  const [planningDate, setPlanningDate] = useState(new Date());
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Tooltip State
  const [hoveredPostId, setHoveredPostId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  // Permissions — UN SEUL test, partagé avec le serveur via constants.ts.
  // ⚠️ Il y avait ici TROIS listes de rôles en dur (`canEdit`, `canDelete`,
  // `canEditCalendar`) qui divergeaient entre elles ET du serveur : `routes/social.ts`
  // autorisait déjà l'External à créer, modifier et SUPPRIMER une publication, mais
  // l'écran lui refusait la suppression et les tags. C'est l'inverse du piège habituel
  // — ici le serveur était ouvert et l'interface fermée.
  // Depuis le 25/08/2026, l'External a l'accès complet au Digital (décision de Théo,
  // tags compris), donc les trois listes n'en font plus qu'une.
  const canEdit = canEditDigital(user?.role);
  const canDelete = canEdit;
  const canEditCalendar = canEdit;
  const isExternal = user?.role === 'External';
  const estChefDeSite = isSiteManager(user?.role);

  // ⚠️ L'onglet actif est mémorisé en session : un chef de site arrivant avec
  // « Calendrier Editorial » en mémoire (par exemple après un changement de rôle)
  // se retrouverait sur un onglet qui ne lui est plus proposé. On le ramène.
  useEffect(() => {
    if (estChefDeSite && activeTab !== 'Planning Digital') setActiveTab('Planning Digital');
  }, [estChefDeSite, activeTab]);

  useEffect(() => {
      loadData();
  }, []);

  // Anti-rafale de la recherche : on ne propage qu'après une pause de frappe. Voir le
  // commentaire sur `rechercheBrouillon`.
  useEffect(() => {
      if (rechercheBrouillon === searchTerm) return;
      const t = window.setTimeout(() => setSearchTerm(rechercheBrouillon), 250);
      return () => window.clearTimeout(t);
  }, [rechercheBrouillon]);

  useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Temps réel : posts du calendrier + tags (réseaux/CO2). `silent` = pas de
  // squelette de chargement pendant le refetch.
  //
  // ⚠️ Les commentaires en font partie, mais SEULEMENT pour le compteur : un commentaire
  // posté par un collègue doit faire bouger la pastille des lignes, ce que seul un
  // `GET /api/social` sait faire (le fil, lui, se recharge dans le panneau ouvert). Un
  // commentaire est un événement RARE — rien à voir avec la frappe au kilomètre que le
  // correctif 49 a sortie du réseau.
  useRealtimeSync(
      [...RT_EVENTS.social, ...RT_EVENTS.tags, ...RT_EVENTS.socialComments],
      () => loadData(true)
  );

  /**
   * ⚠️ `allSettled` ET NON `all` — corrigé le 10/09/2026 après la perte des classes CO²
   * et des mentions Loi LOM. Avec `Promise.all`, l'échec de `getSocialPosts()` (une
   * coupure, un 500, une saturation du pooler) faisait rejeter le tout : `setTags`
   * n'était jamais atteint et l'écran gardait ses trois listes de tags VIDES, son état
   * initial. Les deux chargements sont indépendants, ils doivent échouer indépendamment.
   */
  const loadData = async (silent = false) => {
      if (!silent) setLoading(true);
      const [rPosts, rTags] = await Promise.allSettled([
          db.getSocialPosts(),
          db.getDigitalTags()
      ]);

      if (rPosts.status === 'fulfilled') {
          const pData = rPosts.value;
          // Compteurs de médias dérivés de post.mediaFiles (URLs uploadées).
          const counts: Record<string, number> = {};
          pData.forEach(p => { counts[p.id] = p.mediaFiles?.length ?? 0; });
          setMediaCounts(counts);
          setPosts(pData);
      } else {
          console.error('Digital : chargement des publications échoué', rPosts.reason);
      }

      if (rTags.status === 'fulfilled') {
          setTags(rTags.value);
          setTagsCharges(true);
      } else {
          console.error('Digital : chargement des tags échoué', rTags.reason);
      }

      if (!silent) setLoading(false);
      // On propage l'échec des publications APRÈS avoir posé ce qui a réussi : l'appelant
      // (et le rechargement temps réel) doit toujours voir passer l'erreur.
      if (rPosts.status === 'rejected') throw rPosts.reason;
  };

  /**
   * Message d'échec choisi d'après le STATUT — même branchement qu'aux Projets depuis le
   * correctif 48. `apiFetch` distingue déjà réseau (`ApiError(0)`) et réponse HTTP ; ne
   * pas jeter cette information, sinon toute panne redevient « serveur injoignable ? ».
   */
  const onEchecSauvegarde = useCallback((erreur: unknown) => {
    console.error('Digital : enregistrement échoué', erreur);
    if (!(erreur instanceof ApiError)) { alert("Échec inattendu de l'enregistrement."); return; }
    switch (erreur.status) {
      case 0:   alert('Serveur injoignable. Vos modifications ne sont PAS perdues — ne fermez pas cet onglet.'); return;
      case 503: alert('La base est momentanément saturée. Réessayez dans une minute.'); return;
      case 401: return; // apiFetch a déjà déclenché la déconnexion
      case 403: alert('Droits insuffisants pour modifier cette publication.'); return;
      case 404: alert("Cette publication n'existe plus (supprimée depuis un autre poste ?)."); loadData(true); return;
      default:  alert(erreur.message || "Échec de l'enregistrement.");
    }
  }, []);

  /**
   * ÉCRIT UN CHAMP d'une publication — seule porte d'écriture de l'écran.
   *
   * ⚠️ Part du MIROIR (`postsRef`) et non de `posts` capturé au rendu, et **refuse
   * d'écrire si la publication n'existe plus** : c'est ce qui empêche le flush au
   * démontage de `ChampDiffere` de faire RESSUSCITER une publication supprimée en pleine
   * saisie. Même garde que `validerChampTache` dans `pages/Projects.tsx`.
   *
   * ⚠️ La sauvegarde passe par `fileSauvegardePublication` : UN SEUL PUT en vol par
   * publication. Ne jamais rappeler `db.updateSocialPost` directement depuis cet écran.
   */
  const changerChampPublication = useCallback((postId: string, champ: keyof SocialPost, valeur: any) => {
      if (!canEditCalendar) return;
      const courant = postsRef.current.find(p => p.id === postId);
      if (!courant) return;
      if ((courant as any)[champ] === valeur) return; // rien n'a changé : pas de PUT inutile

      const suivant = { ...courant, [champ]: valeur } as SocialPost;
      setPosts(prev => prev.map(p => (p.id === postId ? suivant : p)));
      setSaving(true);

      // Les médias ne sont PLUS supprimés à l'archivage : le backend renseigne archivedAt
      // et la purge serveur supprime les fichiers 30 jours plus tard.
      if (champ === 'archived' && valeur === true && user) {
          db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a archivé la publication', entity: 'post', entityName: courant.title || '(sans titre)', timestamp: new Date().toISOString() });
      }

      fileSauvegardePublication.pousser(suivant, {
          onSucces: (serveur) => {
              // ⚠️ Réponse appliquée SEULEMENT si rien n'attend derrière et qu'aucun champ
              // n'a le focus : sinon elle est plus ancienne que la saisie en cours et
              // l'écraserait.
              if (fileSauvegardePublication.aDesEcrituresEnCours(serveur.id)) return;
              if (champsFocalisesRef.current > 0) return;
              setPosts(prev => prev.map(p => (p.id === serveur.id ? serveur : p)));
          },
          onEchec: onEchecSauvegarde,
          onRepos: () => setSaving(false),
      });
  }, [canEditCalendar, user, setPosts, onEchecSauvegarde]);

  const handleDeletePost = useCallback(async (post: SocialPost) => {
      try {
          await db.deleteSocialPost(post.id);
      } catch (e) {
          alert(e instanceof ApiError ? e.message : 'Échec de la suppression (serveur injoignable ?).');
          return;
      }
      // Les fichiers calendar du post sont nettoyés côté backend (route DELETE /api/social).
      setMediaCounts(prev => { const next = { ...prev }; delete next[post.id]; return next; });
      setPosts(prev => prev.filter(p => p.id !== post.id));
      if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a supprimé la publication', entity: 'post', entityName: post.title || '(sans titre)', entityId: post.id, timestamp: new Date().toISOString() });
  }, [user, setPosts]);

  // Persiste la nouvelle liste de médias d'un post, via la FILE (voir enregistrerPublication).
  /**
   * Passe une publication par la FILE et attend son sort.
   *
   * ⚠️ Les médias doivent emprunter la même file que les champs, sinon un PUT de wording
   * parti AVANT un dépôt de visuel — donc porteur de l'ancienne liste de médias — écrase
   * le dépôt en arrivant après lui. Ils partagent le miroir, donc chaque instantané est
   * complet ; c'est l'ORDRE qui doit être garanti, et c'est ce que fait la file.
   *
   * ⚠️ `onRepos` sert de filet : la coalescence peut remplacer l'instantané en attente
   * (et donc ses rappels) avant que `onSucces` ne se déclenche. Sans ce repli, la modale
   * resterait bloquée sur une promesse qui ne se résout jamais.
   */
  const enregistrerPublication = useCallback((post: SocialPost) => new Promise<SocialPost>((resoudre, rejeter) => {
      let regle = false;
      setSaving(true);
      fileSauvegardePublication.pousser(post, {
          onSucces: (serveur) => { if (!regle) { regle = true; resoudre(serveur); } },
          onEchec: (e) => { if (!regle) { regle = true; rejeter(e); } },
          onRepos: () => { setSaving(false); if (!regle) { regle = true; resoudre(post); } },
      });
  }), []);

  /**
   * ⚠️ Les deux tableaux voyagent ENSEMBLE. `mediaNames` est parallèle à `mediaFiles` :
   * même longueur, même ordre, l'index fait le lien. Le serveur recale de toute façon
   * (`normaliserMediaNames`, routes/social.ts), mais envoyer l'un sans l'autre ferait
   * afficher, le temps d'un aller-retour, le nom d'un autre visuel.
   */
  const handleSaveMedia = async (postId: string, mediaFiles: string[], mediaNames: string[]) => {
      const target = postsRef.current.find(p => p.id === postId);
      if (!target) return;
      const updated = { ...target, mediaFiles, mediaNames };
      setPosts(prev => prev.map(p => p.id === postId ? updated : p)); // optimistic
      try {
          const saved = await enregistrerPublication(updated);
          setPosts(prev => prev.map(p => p.id === saved.id ? saved : p));
          setMediaCounts(prev => ({ ...prev, [postId]: mediaFiles.length }));
      } catch (e) {
          setPosts(prev => prev.map(p => p.id === postId ? target : p)); // rollback
          throw e; // remonte au modal pour affichage de l'erreur
      }
  };

  /**
   * Écrit UNE catégorie de tags.
   *
   * ⚠️⚠️ NE JAMAIS REPASSER À L'OBJET COMPLET. Le 10/09/2026, les 34 modèles CO² et les
   * 4 mentions Loi LOM ont été effacés de la base : cette fonction envoyait les TROIS
   * catégories, donc l'état de l'écran faisait autorité sur les trois — y compris sur
   * celles qu'il n'avait pas réussi à charger. Une seule action sur les réseaux suffisait
   * alors à écrire `co2: []` et `lom: []`.
   * `routes/tags.ts` ne touche QUE les catégories présentes dans le corps (c'est écrit
   * dans son commentaire) : envoyer un patch d'une seule catégorie rend la perte des deux
   * autres structurellement impossible, au lieu de dépendre de l'état de l'écran.
   *
   * ⚠️ Second garde-fou, indépendant : tant que les tags n'ont pas été LUS avec succès,
   * on n'écrit rien. Sans lui, un écran ouvert pendant une panne de l'API écraserait la
   * catégorie modifiée avec la liste vide de son état initial.
   */
  const handleUpdateTags = async (patch: Partial<DigitalTags>) => {
      if (!canEdit) return;
      if (!tagsCharges) {
          alert("Les tags n'ont pas pu être chargés : rien n'a été enregistré. Rechargez la page.");
          return;
      }
      setSaving(true);
      setTags(prev => ({ ...prev, ...patch })); // Optimistic Update
      try {
          await db.saveDigitalTags(patch);
      } catch (e) {
          console.error('Digital : enregistrement des tags échoué', e);
          alert(e instanceof ApiError ? e.message : "Échec de l'enregistrement des tags.");
          await loadData(true).catch(() => {}); // on remet l'écran d'accord avec la base
      }
      setTimeout(() => setSaving(false), 500);
  };

  const openCreatePostModal = () => {
      if (!canEditCalendar) return;
      setNewPostTitle('');
      setShowCreatePostModal(true);
  };

  const confirmCreatePost = async () => {
      const trimmed = newPostTitle.trim();
      if (!trimmed) return;
      setShowCreatePostModal(false);
      setNewPostTitle('');
      try {
          // L'id est généré par le backend.
          const created = await db.createSocialPost({
              title: trimmed,
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
          });
          setPosts([created, ...posts]);
          if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a créé la publication', entity: 'post', entityName: trimmed, entityId: created.id, timestamp: new Date().toISOString() });
      } catch (e) {
          alert(e instanceof ApiError ? e.message : "Échec de la création (serveur injoignable ?).");
      }
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
          if (filterBrand !== 'All' && !p.brands.includes(filterBrand) && !p.brands.includes('Holding')) return false;
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

      // ⚠️ Clé de tri calculée UNE FOIS par publication, et non deux `new Date()` par
      // COMPARAISON. Sur 57 publications, un tri fait ~330 comparaisons : l'ancienne
      // version construisait donc ~660 objets `Date` à chaque frappe, filtre ou
      // changement d'onglet.
      const parDate = filtered.map(p => ({ p, t: parseLocalDate(p.date).getTime() }));
      parDate.sort((a, b) => (sortOrder === 'asc' ? a.t - b.t : b.t - a.t));
      return parDate.map(x => x.p);
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
            className="glass-menu fixed z-[100] w-72 rounded-xl p-4 pointer-events-none animate-in fade-in duration-200"
            style={{ top: cursorPos.y, left: cursorPos.x }}
          >
              {/* Header: Brands + Status */}
              <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-wrap gap-1">
                      {hoveredPostData.brands.map(b => (
                          <span key={b} className={`text-[8px] px-1.5 py-0.5 rounded border uppercase font-bold ${BRAND_COLORS[b]}`}>{libelleMarqueDigital(b)}</span>
                      ))}
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${SOCIAL_STATUS_COLORS[hoveredPostData.status]}`}>
                      {libelleStatutSocial(hoveredPostData.status)}
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
                      if (!day) return <div key={`empty-${idx}`} className="min-h-[60px] lg:min-h-[120px]"></div>;
                      const isToday = day.toDateString() === new Date().toDateString();
                      const dayPosts = getPostsForDay(day);

                      return (
                          <div 
                              key={day.toISOString()} 
                              className={`min-h-[80px] lg:min-h-[140px] bg-white/45 dark:bg-white/[0.04] border rounded-lg p-1 lg:p-2 flex flex-col gap-0.5 lg:gap-1 transition-all ${isToday ? 'border-bony-orange/50 ring-1 ring-bony-orange/20' : 'border-bony-border'}`}
                          >
                              <div className={`text-right text-[10px] font-bold mb-0.5 ${isToday ? 'text-bony-orange' : 'text-slate-400'}`}>
                                  {day.getDate()}
                              </div>
                              <div className="flex-1 flex flex-col gap-0.5 lg:gap-1 overflow-y-auto custom-scrollbar pr-0.5">
                                  {dayPosts.map(post => {
                                      const statusColor = SOCIAL_STATUS_COLORS[post.status] || 'border-slate-500';
                                      const borderColor = statusColor.match(/border-([\w-]+)/)?.[1] || 'slate-500';
                                      return (
                                          <div
                                              key={post.id}
                                              onMouseEnter={(e) => handlePostHover(e, post.id)}
                                              onMouseLeave={(e) => handlePostHover(e, null)}
                                              className="group relative p-1 rounded border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 hover:border-bony-violet transition cursor-pointer flex items-start gap-1 overflow-hidden"
                                          >
                                              <div className={`absolute left-0 top-0 bottom-0 w-0.5 bg-${borderColor}`}></div>
                                              <div className="hidden lg:block mt-0.5 shrink-0"><LogosReseaux networks={post.networks} size={12} /></div>
                                              <div className="min-w-0">
                                                  <div className="text-[8px] lg:text-[10px] font-bold text-slate-800 dark:text-slate-200 truncate leading-tight line-clamp-1">{post.title || "Sans titre"}</div>
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
                          <div key={day.toISOString()} className={`flex flex-col bg-white/45 dark:bg-white/[0.04] border rounded-lg overflow-hidden h-full ${isToday ? 'border-bony-orange/50' : 'border-bony-border'}`}>
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
                                                      <LogosReseaux networks={post.networks} size={14} />
                                                      {/* Pastilles de TOUTES les marques, dédoublonnées — une seule était rendue.
                                                          ⚠️ Regroupées dans un conteneur : en frères directs, elles cassaient le
                                                          `justify-between` de la ligne. */}
                                                      <div className="flex items-center gap-0.5 shrink-0">
                                                          {post.brands.filter((b, i, t) => t.indexOf(b) === i).slice(0, 3).map(b => (
                                                              <div key={b} title={libelleMarqueDigital(b)} className={`w-2 h-2 rounded-full ${BRAND_COLORS[b]?.split(' ')[0]}`}></div>
                                                          ))}
                                                      </div>
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
          <div className="flex flex-col flex-1 min-h-0 relative max-w-full overflow-x-hidden">
              {renderTooltip()}
              
              {/* Controls */}
              <div className="flex flex-wrap justify-between items-center gap-2 px-3 md:px-6 py-3 md:py-4 border-b border-bony-border glass-strong shrink-0">
                  <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                      <h3 className="text-sm md:text-xl font-title text-slate-900 dark:text-white capitalize md:min-w-[200px]">
                          {titleLabel}
                      </h3>
                      <div className="flex bg-slate-100 dark:bg-black/30 rounded-lg p-1 border border-bony-border">
                          <button onClick={handlePrev} className="p-1 hover:text-bony-orange text-slate-500 transition"><ChevronLeft size={18}/></button>
                          <button onClick={handleToday} className="px-2 md:px-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase hover:text-slate-900 dark:hover:text-white transition">Auj.</button>
                          <button onClick={handleNext} className="p-1 hover:text-bony-orange text-slate-500 transition"><ChevronRight size={18}/></button>
                      </div>

                      {/* View Switcher — masqué sur mobile */}
                      <div className="hidden md:flex bg-slate-100 dark:bg-black/30 rounded-lg p-1 border border-bony-border">
                          <button onClick={() => setCalendarView('Mois')} className={`px-2 md:px-3 py-1 rounded text-xs font-bold uppercase transition ${calendarView === 'Mois' ? 'bg-white dark:bg-bony-panel text-bony-orange shadow' : 'text-slate-500'}`}>Mois</button>
                          <button onClick={() => setCalendarView('Semaine')} className={`px-2 md:px-3 py-1 rounded text-xs font-bold uppercase transition ${calendarView === 'Semaine' ? 'bg-white dark:bg-bony-panel text-bony-orange shadow' : 'text-slate-500'}`}>Sem.</button>
                      </div>
                  </div>

                  {/* Planning Filters */}
                  <div className="flex items-center gap-2">
                      <Select
                          value={filterConcession}
                          onChange={v => setFilterConcession(v)}
                          options={[
                              { value: 'All', label: 'Tous Sites' },
                              ...Object.entries(PLAQUES_STRUCTURE).flatMap(([plaque, sites]) => [
                                  { value: plaque, label: `★ ${plaque}` },
                                  ...sites.map(s => ({ value: s, label: s })),
                              ]),
                          ]}
                          size="sm"
                      />
                      <div className="hidden md:block text-xs text-slate-500 font-sans border-l border-bony-border pl-2 ml-2">
                          {filteredPosts.length} posts
                      </div>
                  </div>
              </div>

              {/* Mobile: liste chronologique uniquement — jamais de grille calendrier */}
              {isMobile && (
                  <div className="overflow-y-auto overflow-x-hidden flex-1 p-3 space-y-2 w-full max-w-full">
                      <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              {filteredPosts.length} publication{filteredPosts.length !== 1 ? 's' : ''}
                          </span>
                      </div>
                      {filteredPosts.length > 0 ? filteredPosts
                          .slice()
                          .sort((a, b) => a.date.localeCompare(b.date))
                          .map(post => {
                              const sc = SOCIAL_STATUS_COLORS[post.status] || '';
                              return (
                                  <div key={post.id} className="w-full gx-glass-panel rounded-xl p-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                          <span className="text-xs font-bold text-bony-orange">
                                              {parseLocalDate(post.date).toLocaleDateString('fr-FR')}
                                          </span>
                                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${sc}`}>{libelleStatutSocial(post.status)}</span>
                                      </div>
                                      <p className="text-sm font-bold text-bony-text leading-tight line-clamp-2">{post.title || 'Sans titre'}</p>
                                      <div className="flex items-center justify-between">
                                          <div className="flex gap-1.5">
                                              {post.networks.slice(0, 4).map(n => <div key={n}>{getSocialIcon(n, 14)}</div>)}
                                          </div>
                                          <div className="flex flex-wrap gap-1 justify-end">
                                              {post.brands.slice(0, 3).map(b => (
                                                  <span key={b} className={`text-[8px] px-1.5 py-0.5 rounded border uppercase font-bold ${BRAND_COLORS[b]}`}>{libelleMarqueDigital(b)}</span>
                                              ))}
                                          </div>
                                      </div>
                                  </div>
                              );
                          })
                      : (
                          <div className="text-center py-10 text-slate-500 text-sm">Aucune publication</div>
                      )}
                  </div>
              )}

              {/* Tablette + Desktop : calendrier (jamais rendu sur mobile) */}
              {!isMobile && (
                  <>
                      {/* Tablette (md → lg) : scroll horizontal contrôlé sur vue Semaine */}
                      <div className="hidden md:flex lg:hidden flex-col flex-1 min-h-0 bg-slate-50/40 dark:bg-black/10 overflow-y-auto custom-scrollbar p-3 max-w-full overflow-x-hidden">
                          {calendarView === 'Mois' && (
                              <div className="grid grid-cols-7 mb-2 shrink-0">
                                  {weekDays.map(d => (
                                      <div key={d} className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-wide">{d}</div>
                                  ))}
                              </div>
                          )}
                          {calendarView === 'Mois' ? renderMonthGrid() : (
                              <div className="overflow-x-auto custom-scrollbar">
                                  <div className="min-w-[640px] h-full">
                                      {renderWeekGrid()}
                                  </div>
                              </div>
                          )}
                      </div>

                      {/* Desktop (lg+) : grille calendrier inchangée */}
                      <div className="hidden lg:flex flex-col flex-1 min-h-0 bg-slate-50/40 dark:bg-black/10 overflow-y-auto custom-scrollbar p-4 max-w-full overflow-x-hidden">
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
                  </>
              )}
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
          <div className="flex-1 flex flex-col min-h-0">
              {/* TABLE HEADER */}
              <div className="hidden lg:flex items-center gap-x-3 px-5 py-2.5 border-b border-bony-border bg-slate-100 dark:bg-black/40 text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky top-0 z-20 shadow-lg backdrop-blur-md">
                  <div className="w-1"></div>
                  <div className="flex-[1_1_340px] min-w-[260px]">CONTENU DU POST</div>
                  <div className="flex-[1_1_560px] min-w-[480px] flex items-center gap-1 cursor-pointer hover:text-bony-text transition-colors" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                      RÉGLAGES · TRI PAR DATE
                      {sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                  </div>
                  <div className="shrink-0 w-[152px] text-right">MÉDIA / ACTIONS</div>
              </div>

              {/* LIST */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pb-6 p-2 md:p-4 space-y-3">
                  {filteredPosts.length > 0 ? (
                      filteredPosts.map(post => (
                          <EditoRow
                            key={post.id}
                            post={post}
                            onChangerChamp={changerChampPublication}
                            onDelete={handleDeletePost}
                            canEdit={canEditCalendar}
                            canDelete={canDelete}
                            isArchivedView={isArchivedView}
                            networkOptions={tags.networks}
                            co2Options={tags.co2}
                            lomOptions={tags.lom}
                            mediaCount={mediaCounts[post.id] ?? 0}
                            onOpenMedia={setMediaModalPostId}
                            onFocusChange={suivreFocusChamp}
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

  // --- Résumé des filtres, pour la barre repliée sur mobile ---
  // Un filtre « actif » = un filtre qui restreint réellement la liste. La
  // recherche en fait partie ; « Toutes marques » et « Tous services » non.
  const filtresActifs =
    (searchTerm.trim() ? 1 : 0) +
    (filterBrand !== 'All' ? 1 : 0) +
    (filterService !== 'All' ? 1 : 0);

  const resumeFiltres = [
    searchTerm.trim() ? `« ${searchTerm.trim()} »` : null,
    filterBrand !== 'All' ? filterBrand : 'Toutes marques',
    filterService !== 'All' ? filterService : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in transition-colors relative max-w-full">

        {/* Create Post Modal */}
        {showCreatePostModal && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="glass-strong rounded-xl p-6 max-w-sm w-full shadow-glass-lg">
                    <h3 className="text-lg font-title text-bony-text mb-1">Nouvelle Publication</h3>
                    <p className="text-xs text-bony-muted mb-4">Donnez un titre à votre publication pour commencer.</p>
                    <input
                        type="text"
                        value={newPostTitle}
                        onChange={e => setNewPostTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmCreatePost(); if (e.key === 'Escape') setShowCreatePostModal(false); }}
                        placeholder="Titre de la publication..."
                        autoFocus
                        className="w-full bg-white dark:bg-black/30 border border-slate-300 dark:border-bony-border rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-bony-violet transition mb-5"
                    />
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => { setShowCreatePostModal(false); setNewPostTitle(''); }}
                            className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-bony-text transition"
                        >
                            ANNULER
                        </button>
                        <button
                            onClick={confirmCreatePost}
                            disabled={!newPostTitle.trim()}
                            className="px-4 py-2 rounded-lg text-sm font-bold bg-bony-gradient text-white hover:opacity-90 transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            CRÉER
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Header */}
        <div className="px-3 py-3 md:px-6 md:py-4 glass-strong border-b border-bony-border shrink-0 z-30 shadow-md">
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
                    {!canEditCalendar && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs font-bold uppercase">
                            <Lock size={12}/> Lecture Seule
                        </div>
                    )}
                    {/* Tabs */}
                    <div className="bg-slate-100 dark:bg-black/30 p-1 rounded-lg border border-bony-border flex flex-wrap gap-1">
                        {/* Chef de site : SEUL « Planning Digital » lui est accessible
                            (demande de Théo).
                            ⚠️ L'External voyait lui aussi UN SEUL onglet (le calendrier
                            éditorial) : c'était la vraie limite de son accès Digital,
                            plus encore que les droits d'édition. Levé le 25/08/2026 —
                            il a désormais les quatre onglets. */}
                        {(['Calendrier Editorial', 'Planning Digital', 'Archives', 'Gestion des TAGS'] as Tab[])
                          .filter(tab => estChefDeSite ? tab === 'Planning Digital' : true)
                          .map(tab => (
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

            {/* Toolbar (Only for Calendar & Archives) — repliée derrière une barre
                fine sur mobile : recherche, deux sélecteurs et bouton « Ajouter »
                empilés pleine largeur mangeaient l'écran. Desktop inchangé. */}
            {activeTab !== 'Planning Digital' && activeTab !== 'Gestion des TAGS' && (
                <CollapsibleFilters
                    storageKey="digital"
                    activeCount={filtresActifs}
                    summary={resumeFiltres}
                >
                <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-2">
                    {/* Search — pleine largeur sur mobile */}
                    <div className="relative w-full md:flex-1 md:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input
                            type="text"
                            value={rechercheBrouillon}
                            onChange={e => setRechercheBrouillon(e.target.value)}
                            placeholder="Rechercher..."
                            className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg pl-10 pr-3 py-2 text-xs text-slate-900 dark:text-bony-text outline-none focus:border-bony-violet transition-colors"
                        />
                    </div>

                    <div className="hidden md:block w-px h-6 bg-bony-border"></div>

                    {/* Filters — colonne sur mobile */}
                    <div className="flex flex-col md:flex-row gap-2">
                        <div className="w-full md:w-48">
                            <Select
                                value={filterBrand}
                                onChange={v => setFilterBrand(v as any)}
                                options={[{ value: 'All', label: 'Toutes Marques' }, ...BRANDS.map(b => ({ value: b, label: libelleMarqueDigital(b) }))]}
                                size="sm"
                            />
                        </div>
                        <div className="w-full md:w-48">
                            <Select
                                value={filterService}
                                onChange={v => setFilterService(v as any)}
                                options={[{ value: 'All', label: 'Tous Services' }, ...SOCIAL_SERVICES.map(s => ({ value: s, label: s }))]}
                                size="sm"
                            />
                        </div>
                    </div>

                    <div className="hidden md:flex flex-1"></div>

                    {/* Add Button — pleine largeur sur mobile */}
                    {canEditCalendar && activeTab === 'Calendrier Editorial' && (
                        <button
                            onClick={openCreatePostModal}
                            className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-bony-gradient hover:opacity-90 text-white rounded-lg transition shadow-lg shadow-bony-violet/20"
                        >
                            <Plus size={18} />
                            <span className="font-bold text-xs uppercase">Ajouter</span>
                        </button>
                    )}
                </div>
                </CollapsibleFilters>
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
                    canEdit={canEditCalendar && !post.archived}
                    onClose={() => setMediaModalPostId(null)}
                    onSaveMedia={handleSaveMedia}
                />
            );
        })()}
    </div>
  );
};

export default Digital;
