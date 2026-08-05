
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, ApiError } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { User, UserRole, ActivityLog, StorageInfo } from '../types';
import { Save, User as UserIcon, Trash2, Plus, Edit2, Check, X, ShieldAlert, Camera, Upload, ZoomIn, MapPin, Cake, Download, Smartphone, HardDrive } from 'lucide-react';
import Cropper from 'react-easy-crop';
import Avatar, { avatarKey } from '../components/Avatar';
import { getAvatarUrl, setAvatarUrl } from '../services/avatarCache';
import Select from '../components/Select';
import DatePicker from '../components/DatePicker';
import InstallAppModal from '../components/InstallAppModal';
import NotificationsToggle from '../components/NotificationsToggle';
import { SITES } from '../constants';
// `parseLocalDate` est exporté par DateRangePicker (et non par constants.ts).
import { parseLocalDate } from '../components/DateRangePicker';

// --- Types for react-easy-crop ---
interface CropArea { x: number; y: number; width: number; height: number; }
interface CropPoint { x: number; y: number; }

// --- Helper: generate 200x200 cropped base64 ---
const getCroppedImg = (imageSrc: string, cropPixels: CropArea): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
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

// --- Shared Avatar Upload Modal ---
interface AvatarModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
  // Persiste l'URL de la photo uploadée (ou null pour la retirer). Fourni par le
  // parent selon le contexte : profil propre (PUT /me) ou autre compte (PUT /users/:id).
  onSave: (url: string | null) => Promise<void>;
}
const AvatarUploadModal: React.FC<AvatarModalProps> = ({ userId, userName, onClose, onSave }) => {
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const hasExistingPhoto = !!(getAvatarUrl(userId) || localStorage.getItem(avatarKey(userId)));

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Format non supporté. Utilisez jpg, png, gif ou webp.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Fichier trop lourd (max 5 Mo).');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = e => { setCropSrc(e.target?.result as string); setZoom(1); setCrop({ x: 0, y: 0 }); };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleValidate = useCallback(async () => {
    if (!cropSrc || !croppedAreaPixels || saving) return;
    setSaving(true);
    try {
      // Recadrage 200x200 -> Blob JPEG -> upload (POST /api/uploads/avatar) -> persist URL.
      const base64 = await getCroppedImg(cropSrc, croppedAreaPixels);
      const blob = await (await fetch(base64)).blob();
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const url = await db.uploadFile('avatar', file);
      await onSave(url);
      localStorage.removeItem(avatarKey(userId)); // purge d'une éventuelle photo base64 legacy
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur lors de l\'enregistrement. Réessayez.');
      setSaving(false);
    }
  }, [cropSrc, croppedAreaPixels, userId, onClose, onSave, saving]);

  const handleDelete = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(null);
      localStorage.removeItem(avatarKey(userId)); // purge legacy locale
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Échec de la suppression.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="glass-strong glass-sheen relative rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-bony-border">
          <div>
            <h3 className="font-title text-slate-900 dark:text-bony-text flex items-center gap-2">
              <Camera size={18} className="text-bony-orange" /> Photo de profil
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-bony-muted mt-0.5">{userName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-bony-text transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!cropSrc ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`h-44 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                dragging
                  ? 'border-bony-orange bg-bony-orange/10'
                  : 'border-slate-300 dark:border-bony-border hover:border-bony-orange/60 hover:bg-slate-50 dark:hover:bg-white/3'
              }`}
            >
              <Upload size={32} className={`transition-colors ${dragging ? 'text-bony-orange' : 'text-slate-400'}`} />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-bony-text">Glisser une photo ici</p>
                <p className="text-[11px] text-slate-500 dark:text-bony-muted mt-0.5">ou cliquer pour parcourir</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1">jpg, png, gif, webp — max 5 Mo</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative h-64 rounded-xl overflow-hidden bg-black">
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_: unknown, pixels: CropArea) => setCroppedAreaPixels(pixels)}
                />
              </div>
              <div className="flex items-center gap-3">
                <ZoomIn size={14} className="text-slate-400 shrink-0" />
                <input
                  type="range"
                  min={1} max={3} step={0.05}
                  value={zoom}
                  onChange={e => setZoom(Number(e.target.value))}
                  className="flex-1 accent-bony-orange"
                />
              </div>
              <button
                onClick={() => setCropSrc(null)}
                className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-bony-text transition underline"
              >
                Choisir une autre photo
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

          <div className="flex gap-2 pt-1">
            {cropSrc && (
              <button
                onClick={handleValidate}
                className="flex-1 py-2.5 rounded-xl bg-bony-gradient text-white text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2"
              >
                <Check size={16} /> Valider
              </button>
            )}
            {hasExistingPhoto && (
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-sm font-bold hover:bg-red-500/20 transition flex items-center justify-center gap-2"
              >
                <Trash2 size={16} /> Supprimer la photo
              </button>
            )}
            {!cropSrc && !hasExistingPhoto && (
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 text-sm font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition">
                Annuler
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Role badge helper ---
const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const cls =
    role === 'Master'
      ? 'border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10'
      : role === 'Administrator'
        ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
        : role === 'Director'
          ? 'border-teal-500 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10'
          : role === 'Digital Manager'
            ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10'
            : role === 'Guest'
              ? 'border-slate-400 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-500/10'
              : role === 'External'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10'
                : 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10';
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${cls}`}>{role}</span>
  );
};

// --- SECTION STOCKAGE -------------------------------------------------------------
// Combien de place les fichiers envoyés dans Gearbox occupent, et combien il reste sur
// le serveur. Lecture ouverte à tous les rôles.

const formatOctets = (o: number): string => {
  if (o <= 0) return '0 o';
  if (o < 1024) return `${o} o`;
  if (o < 1024 * 1024) return `${(o / 1024).toFixed(0)} Ko`;
  if (o < 1024 * 1024 * 1024) return `${(o / 1024 / 1024).toFixed(o < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
  return `${(o / 1024 / 1024 / 1024).toFixed(1)} Go`;
};

const LIBELLES_TYPE: Record<string, string> = {
  chat: 'Chat (pièces jointes)',
  avatar: 'Photos de profil',
  calendar: 'Digital (médias)'
};

const StorageSection: React.FC = () => {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    db.getStorage().then(setInfo).catch(() =>
      setErreur("Impossible de lire l'espace disque (serveur injoignable ?)."));
  }, []);

  // Pourcentage du DISQUE occupé, toutes causes confondues. Volontairement pas
  // « uploads / disque » : ce chiffre serait toujours proche de 0 % et ne dirait rien
  // du risque réel de saturation, qui est ce qu'on veut surveiller.
  const pct = info && info.disque.total > 0
    ? Math.round((info.disque.utilise / info.disque.total) * 100)
    : 0;
  // Seuils d'alerte : au-delà de 90 % la place manque vraiment.
  const couleurBarre = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-bony-orange';

  return (
    <div className="max-w-4xl mx-auto gx-card p-6 mb-10">
      <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-white/5 pb-2 mb-4 flex items-center gap-2">
        <HardDrive size={15} className="text-bony-blue" /> Stockage
      </h4>

      {erreur ? (
        <p className="text-xs text-red-500">{erreur}</p>
      ) : !info ? (
        <p className="text-xs text-slate-500 dark:text-bony-muted">Calcul en cours…</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-bony-text">
              Fichiers envoyés dans Gearbox : {formatOctets(info.uploads.total)}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-bony-muted tabular-nums">
              {formatOctets(info.disque.libre)} libres
            </span>
          </div>

          <div className="h-2.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full ${couleurBarre} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>

          {/* Dire explicitement ce que mesure la barre : sans cette phrase, « 4,6 Mo
              envoyés » à côté de « 4 % utilisé » est incompréhensible. */}
          <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-1.5">
            Le disque du serveur est utilisé à <strong>{pct} %</strong> ({formatOctets(info.disque.utilise)}
            {' '}sur {formatOctets(info.disque.total)}). Il est partagé avec le système,
            ce n'est pas un quota propre à Gearbox.
          </p>

          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/5 space-y-2">
            {/* `Object.entries` perd le type de la valeur (elle ressort en `unknown`) :
                on le rétablit explicitement plutôt que d'ajouter une erreur au
                baseline `tsc`. */}
            {(Object.entries(info.uploads.parType) as [string, { octets: number; fichiers: number }][]).map(([type, v]) => (
              <div key={type} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600 dark:text-bony-muted">
                  {LIBELLES_TYPE[type] ?? type}
                  <span className="text-slate-400 dark:text-slate-600"> · {v.fichiers} fichier{v.fichiers > 1 ? 's' : ''}</span>
                </span>
                <span className="font-bold text-slate-700 dark:text-bony-text tabular-nums">{formatOctets(v.octets)}</span>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-4 leading-relaxed">
            Ménage automatique : les médias d'une publication Digital archivée sont
            supprimés au bout de 30 jours, les pièces jointes du chat au bout de
            180 jours (le message reste, la pièce jointe disparaît). Les photos de
            profil ne sont jamais supprimées automatiquement.
          </p>
        </>
      )}
    </div>
  );
};

const USER_PREFS_KEY = (id: string) => `gearbox_user_prefs_${id}`;

// ⚠️ `birthdate` a QUITTÉ cette structure le 04/08/2026 : c'est désormais un champ du
// modèle `User` côté serveur. Il était ici, en localStorage, ce qui le rendait
// invisible de tous les autres postes — un anniversaire est une donnée d'équipe.
// La ville reste locale à dessein : elle pilote la météo du poste de chacun
// (lue par HelloMarketing), ce n'est pas une information partagée.
interface UserPrefs { city: string; }
const loadUserPrefs = (id: string): UserPrefs => {
  try { return { city: '', ...JSON.parse(localStorage.getItem(USER_PREFS_KEY(id)) || '{}') }; }
  catch { return { city: '' }; }
};
const saveUserPrefs = (id: string, prefs: UserPrefs) =>
  localStorage.setItem(USER_PREFS_KEY(id), JSON.stringify(prefs));

// --- Main Settings ---
const Settings: React.FC = () => {
  const { user, updateProfile, setAvatarPhoto } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  // User prefs (city + birthdate) for own profile
  const [userCity, setUserCity] = useState('');
  const [userBirthdate, setUserBirthdate] = useState('');

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [userMgmtError, setUserMgmtError] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [editPrefs, setEditPrefs] = useState<UserPrefs>({ city: '' });
  const [isAddingUser, setIsAddingUser] = useState(false);
  // Avatar modal for master managing other users
  const [avatarTargetUser, setAvatarTargetUser] = useState<User | null>(null);
  // Map userId -> prefs for display in user table
  const [allUserPrefs, setAllUserPrefs] = useState<Record<string, UserPrefs>>({});

  // Gestion des comptes réservée Master/Administrator/Director (aligné sur
  // ADMIN_ROLES du backend routes/users.ts — les mutations y sont déjà protégées).
  const canManageUsers = user?.role === 'Master' || user?.role === 'Administrator' || user?.role === 'Director';

  useEffect(() => {
    if (user) {
      const prefs = loadUserPrefs(user.id);
      setUserCity(prefs.city);
      // L'anniversaire vient désormais du serveur (champ du User), plus du localStorage.
      setUserBirthdate(user.birthdate || '');
    }
    if (canManageUsers) loadAllUsers();
  }, [user]);

  // Temps réel : la Gestion des Utilisateurs reflète les créations/modifications
  // /suppressions faites par les autres administrateurs. Ne s'abonne que si
  // l'écran est accessible (les autres rôles n'affichent pas cette liste).
  useRealtimeSync(canManageUsers ? RT_EVENTS.users : [], () => loadAllUsers());

  const loadAllUsers = async () => {
    try {
      const users = await db.getUsers(); // GET /api/users — plus de localStorage
      setAllUsers(users);
      const prefsMap: Record<string, UserPrefs> = {};
      users.forEach(u => { prefsMap[u.id] = loadUserPrefs(u.id); });
      setAllUserPrefs(prefsMap);
    } catch (e) {
      setUserMgmtError(e instanceof ApiError ? e.message : 'Impossible de charger les utilisateurs.');
    }
  };

  const handleUpdateProfile = async () => {
    setProfileMsg({ type: '', text: '' });
    if (!user) return;

    if (newPassword || oldPassword) {
      // Le mot de passe n'est plus disponible côté client (auth backend, hash
      // bcrypt en base) : plus de vérification locale de l'ancien mot de passe.
      if (newPassword !== confirmPassword) {
        setProfileMsg({ type: 'error', text: 'Les nouveaux mots de passe ne correspondent pas.' });
        return;
      }
      if (newPassword.length < 4) {
        setProfileMsg({ type: 'error', text: 'Le mot de passe est trop court.' });
        return;
      }
    }

    try {
      // `birthdate` part au serveur avec le profil ; seule la ville reste locale.
      const updatedUser: User = { ...user, name, birthdate: userBirthdate, password: newPassword || undefined };
      await updateProfile(updatedUser); // PUT /api/auth/me
      saveUserPrefs(user.id, { city: userCity });
      setProfileMsg({ type: 'success', text: 'Profil mis à jour avec succès.' });
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch {
      setProfileMsg({ type: 'error', text: 'Échec de la mise à jour (serveur injoignable ?).' });
    }
  };

  const startEdit = (targetUser: User) => {
    setEditingUserId(targetUser.id);
    setEditForm({ ...targetUser });
    setEditPrefs(loadUserPrefs(targetUser.id));
    setIsAddingUser(false);
  };

  const cancelEdit = () => { setEditingUserId(null); setEditForm({}); setEditPrefs({ city: '' }); setIsAddingUser(false); };

  const saveUser = async () => {
    if (!editForm.name || !editForm.loginId || !editForm.role) return;
    setUserMgmtError('');
    try {
      if (isAddingUser) {
        // L'id est généré par le backend ; le mot de passe part en clair,
        // le hash bcrypt est fait côté serveur.
        const created = await db.createUser({
          name: editForm.name,
          loginId: editForm.loginId,
          password: editForm.password || 'admin',
          role: editForm.role as UserRole,
          avatarColor: '#' + Math.floor(Math.random() * 16777215).toString(16),
          // L'anniversaire part au serveur avec le compte ; seule la ville reste locale.
          birthdate: editForm.birthdate || undefined
        });
        saveUserPrefs(created.id, editPrefs);
        if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: "a créé l'utilisateur", entity: 'user', entityName: created.name, timestamp: new Date().toISOString() });
      } else {
        // password vide -> non envoyé -> hash inchangé côté backend.
        const updatedUser = { ...allUsers.find(u => u.id === editingUserId), ...editForm } as User;
        if (!updatedUser.password) delete updatedUser.password;
        const saved = await db.updateUser(updatedUser);
        saveUserPrefs(saved.id, editPrefs);
        if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: "a modifié l'utilisateur", entity: 'user', entityName: saved.name, timestamp: new Date().toISOString() });
      }
      await loadAllUsers();
      cancelEdit();
    } catch (e) {
      // Un 400 backend (rôle invalide, loginId déjà pris...) porte un message clair.
      setUserMgmtError(e instanceof ApiError ? e.message : "Échec de l'enregistrement (serveur injoignable ?).");
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
    setUserMgmtError('');
    const toDelete = allUsers.find(u => u.id === id);
    try {
      await db.deleteUser(id);
      if (user && toDelete) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: "a supprimé l'utilisateur", entity: 'user', entityName: toDelete.name, timestamp: new Date().toISOString() });
      await loadAllUsers();
    } catch (e) {
      setUserMgmtError(e instanceof ApiError ? e.message : 'Échec de la suppression (serveur injoignable ?).');
    }
  };

  if (!user) return null;

  // Input classes
  const inputCls = 'w-full bg-white dark:bg-black/30 border border-slate-300 dark:border-bony-border rounded p-2 text-slate-900 dark:text-white text-sm outline-none focus:border-bony-orange transition';
  const tableInputCls = 'bg-white dark:bg-black/40 border border-bony-orange/50 rounded p-1 text-slate-900 dark:text-white w-full text-sm';

  return (
    <div className="p-3 md:p-8 h-full overflow-y-auto custom-scrollbar animate-fade-in pb-20">
      <h2 className="text-xl md:text-3xl text-slate-900 dark:text-white font-title mb-8 flex items-center gap-3">
        <UserIcon className="text-bony-violet" size={32} /> Paramètres du Compte
      </h2>

      {/* SECTION 1: MY PROFILE */}
      <div className="max-w-4xl mx-auto gx-card p-6 mb-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-bony-orange to-bony-violet" />

        <div className="flex items-start gap-6 mb-6">
          {/* Clickable avatar */}
          <button
            onClick={() => setShowAvatarModal(true)}
            className="relative group shrink-0 rounded-full focus:outline-none"
            title="Changer la photo de profil"
          >
            <Avatar userId={user.id} name={user.name} color={user.avatarColor} size={80} />
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={22} className="text-white" />
            </div>
          </button>
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{user.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <RoleBadge role={user.role} />
              <span className="text-xs text-slate-500">ID: {user.loginId}</span>
            </div>
            <button
              onClick={() => setShowAvatarModal(true)}
              className="mt-2 text-[11px] text-bony-orange hover:text-bony-violet transition underline font-bold"
            >
              Changer la photo de profil
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-white/5 pb-2">
              Identité
            </h4>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-500 mb-1">Nom affiché</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-500 mb-1 flex items-center gap-1">
                <MapPin size={11} /> Ville de référence (météo)
              </label>
              <Select
                value={userCity}
                onChange={v => setUserCity(v)}
                options={[{ value: '', label: '— Sélectionner une ville —' }, ...SITES.map(s => ({ value: s, label: s }))]}
                size="md"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-500 mb-1 flex items-center gap-1">
                <Cake size={11} /> Date de naissance
              </label>
              <DatePicker
                value={userBirthdate}
                onChange={v => setUserBirthdate(v)}
                size="md"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-white/5 pb-2">
              Sécurité
            </h4>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-500 mb-1">Ancien mot de passe</label>
              <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="Requis pour changer" className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-500 mb-1">Nouveau mot de passe</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-500 mb-1">Confirmer</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-200 dark:border-white/5">
          <div className={`text-xs font-bold ${profileMsg.type === 'error' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {profileMsg.text}
          </div>
          <button
            onClick={handleUpdateProfile}
            className="px-6 py-2 min-h-[44px] bg-bony-gradient text-white font-bold rounded-lg shadow hover:opacity-90 transition flex items-center gap-2"
          >
            <Save size={16} /> Enregistrer mon profil
          </button>
        </div>
      </div>

      {/* SECTION 1bis : APPLICATION (PWA) — visible par TOUS les rôles, comme le
           profil au-dessus, et non réservée aux admins comme la section suivante. */}
      <div className="max-w-4xl mx-auto gx-card p-6 mb-10">
        <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-white/5 pb-2 mb-4 flex items-center gap-2">
          <Smartphone size={15} className="text-bony-violet" /> Application
        </h4>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <p className="text-xs text-slate-600 dark:text-bony-muted leading-relaxed flex-1">
            Installe Gearbox comme une application sur ton ordinateur ou ton téléphone :
            icône dédiée, fenêtre propre, et les mises à jour arrivent toutes seules.
            <span className="block mt-1 text-slate-500 dark:text-slate-500">
              Aucun fichier à télécharger, aucun store.
            </span>
          </p>
          <button
            onClick={() => setShowInstallModal(true)}
            className="shrink-0 px-5 py-2.5 min-h-[44px] bg-bony-gradient text-white font-bold rounded-lg shadow hover:opacity-90 transition flex items-center justify-center gap-2 text-sm"
          >
            <Download size={16} /> Installer l'application
          </button>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-200 dark:border-white/5">
          <NotificationsToggle />
        </div>
      </div>

      {/* SECTION 1ter : STOCKAGE — visible par TOUS les rôles (demande de Théo) :
           savoir si le serveur sature concerne tout le monde, pas que les admins. */}
      <StorageSection />

      {/* SECTION 2: USER MANAGEMENT (MASTER/ADMINISTRATOR) */}
      {canManageUsers && (
        <div className="max-w-6xl mx-auto mt-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="text-red-500" size={24} /> Gestion des Utilisateurs (Master/Admin)
            </h3>
            <button
              onClick={() => { setIsAddingUser(true); setEditingUserId('new'); setEditForm({ role: 'Coordinator', password: 'admin' }); setEditPrefs({ city: '', birthdate: '' }); }}
              className="px-4 py-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-lg text-xs font-bold uppercase flex items-center gap-2 border border-slate-300 dark:border-white/10 transition"
            >
              <Plus size={16} /> Nouvel Utilisateur
            </button>
          </div>

          {userMgmtError && (
            <p className="mb-4 text-xs font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {userMgmtError}
            </p>
          )}

          <div className="gx-card p-0 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-slate-50 dark:bg-black/30 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-bony-border">
                <tr>
                  <th className="p-4 w-16"></th>
                  <th className="p-4">Nom</th>
                  <th className="p-4">ID Connexion</th>
                  <th className="p-4">Rang</th>
                  <th className="p-4">Ville</th>
                  <th className="p-4">Anniversaire</th>
                  <th className="p-4">Mot de passe</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-sm">

                {/* ADD NEW ROW */}
                {isAddingUser && (
                  <tr className="bg-bony-orange/10 border-l-4 border-bony-orange">
                    <td className="p-4 text-center"><Plus size={16} className="text-bony-orange" /></td>
                    <td className="p-4">
                      <input className={tableInputCls} placeholder="Nom complet" autoFocus value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                    </td>
                    <td className="p-4">
                      <input className={tableInputCls} placeholder="ID" value={editForm.loginId || ''} onChange={e => setEditForm({ ...editForm, loginId: e.target.value })} />
                    </td>
                    <td className="p-4">
                      <Select
                        value={editForm.role ?? ''}
                        onChange={v => setEditForm({ ...editForm, role: v as UserRole })}
                        options={[
                          { value: 'Master', label: 'Master' },
                          { value: 'Administrator', label: 'Administrator' },
                          { value: 'Director', label: 'Director' },
                          { value: 'Coordinator', label: 'Coordinator' },
                          { value: 'Digital Manager', label: 'Digital Manager' },
                          { value: 'Guest', label: 'Guest' },
                          { value: 'External', label: 'External' },
                        ]}
                        size="sm"
                      />
                    </td>
                    <td className="p-4">
                      <Select
                        value={editPrefs.city}
                        onChange={v => setEditPrefs({ ...editPrefs, city: v })}
                        options={[{ value: '', label: '—' }, ...SITES.map(s => ({ value: s, label: s }))]}
                        size="sm"
                      />
                    </td>
                    <td className="p-4">
                      <DatePicker value={editForm.birthdate || ''} onChange={v => setEditForm({ ...editForm, birthdate: v })} size="sm" />
                    </td>
                    <td className="p-4">
                      <input className={tableInputCls} placeholder="Mot de passe" value={editForm.password || ''} onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={saveUser} className="p-2.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded hover:bg-emerald-500/30"><Check size={16} /></button>
                        <button onClick={cancelEdit} className="p-2.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500/30"><X size={16} /></button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* LIST USERS */}
                {allUsers.map(u => {
                  const isEditing = editingUserId === u.id;

                  if (isEditing) {
                    const editInputCls = 'bg-white dark:bg-black/40 border border-blue-500/50 rounded p-1 text-slate-900 dark:text-white w-full text-sm';
                    return (
                      <tr key={u.id} className="bg-blue-50 dark:bg-blue-500/10 border-l-4 border-blue-500">
                        <td className="p-4 text-center"><Edit2 size={16} className="text-blue-500" /></td>
                        <td className="p-4">
                          <input className={editInputCls} value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                        </td>
                        <td className="p-4">
                          <input className={editInputCls} value={editForm.loginId || ''} onChange={e => setEditForm({ ...editForm, loginId: e.target.value })} />
                        </td>
                        <td className="p-4">
                          <Select
                            value={editForm.role ?? ''}
                            onChange={v => setEditForm({ ...editForm, role: v as UserRole })}
                            options={[
                              { value: 'Master', label: 'Master' },
                              { value: 'Administrator', label: 'Administrator' },
                              { value: 'Director', label: 'Director' },
                              { value: 'Coordinator', label: 'Coordinator' },
                              { value: 'Digital Manager', label: 'Digital Manager' },
                              { value: 'Guest', label: 'Guest' },
                              { value: 'External', label: 'External' },
                            ]}
                            size="sm"
                          />
                        </td>
                        <td className="p-4">
                          <Select
                            value={editPrefs.city}
                            onChange={v => setEditPrefs({ ...editPrefs, city: v })}
                            options={[{ value: '', label: '—' }, ...SITES.map(s => ({ value: s, label: s }))]}
                            size="sm"
                          />
                        </td>
                        <td className="p-4">
                          <DatePicker value={editForm.birthdate || ''} onChange={v => setEditForm({ ...editForm, birthdate: v })} size="sm" />
                        </td>
                        <td className="p-4">
                          <input className={editInputCls} placeholder="Laisser vide si inchangé" value={editForm.password || ''} onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={saveUser} className="p-1.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded hover:bg-emerald-500/30"><Check size={16} /></button>
                            <button onClick={cancelEdit} className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500/30"><X size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition group">
                      <td className="p-4">
                        {/* Clickable avatar for master to change profile photo */}
                        <button
                          onClick={() => setAvatarTargetUser(u)}
                          className="relative group/av rounded-full focus:outline-none"
                          title="Modifier la photo de profil"
                        >
                          <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={36} />
                          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover/av:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera size={13} className="text-white" />
                          </div>
                        </button>
                      </td>
                      <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{u.name}</td>
                      <td className="p-4 font-sans text-slate-500 dark:text-slate-400">{u.loginId}</td>
                      <td className="p-4"><RoleBadge role={u.role} /></td>
                      <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                        {allUserPrefs[u.id]?.city
                          ? <span className="flex items-center gap-1"><MapPin size={10} className="text-blue-400" />{allUserPrefs[u.id].city}</span>
                          : <span className="text-slate-300 dark:text-slate-700">—</span>}
                      </td>
                      <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                        {/* Vient du serveur : la colonne montrait auparavant le
                            localStorage du poste, donc uniquement ce qui y avait été
                            saisi. `parseLocalDate` et non `new Date` — sur une chaîne
                            'YYYY-MM-DD', `new Date` parse en UTC et peut afficher la
                            veille selon le fuseau. */}
                        {u.birthdate
                          ? <span className="flex items-center gap-1"><Cake size={10} className="text-pink-400" />{parseLocalDate(u.birthdate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                          : <span className="text-slate-300 dark:text-slate-700">—</span>}
                      </td>
                      <td className="p-4 text-slate-400 dark:text-slate-600 font-sans text-xs">••••••</td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                          <button onClick={() => startEdit(u)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-slate-500 dark:text-slate-300">
                            <Edit2 size={16} />
                          </button>
                          {u.role !== 'Master' && (
                            <button onClick={() => deleteUser(u.id)} className="p-2.5 hover:bg-red-500/20 rounded text-red-500">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modale d'installation de la PWA */}
      {showInstallModal && (
        <InstallAppModal
          onClose={() => setShowInstallModal(false)}
          // Proposé dans la foulée de l'installation : c'est le moment où l'accord
          // est le plus naturel, et sur iOS c'est le seul ordre qui fonctionne
          // (l'abonnement exige l'app déjà installée).
          footer={
            <div className="pt-4 mt-1 border-t border-slate-200 dark:border-bony-border">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                Notifications
              </h4>
              <NotificationsToggle compact />
            </div>
          }
        />
      )}

      {/* Avatar modal — own profile (PUT /me) */}
      {showAvatarModal && (
        <AvatarUploadModal
          userId={user.id}
          userName={user.name}
          onClose={() => setShowAvatarModal(false)}
          onSave={(url) => setAvatarPhoto(url)}
        />
      )}

      {/* Avatar modal — master editing another user (PUT /users/:id) */}
      {avatarTargetUser && (
        <AvatarUploadModal
          userId={avatarTargetUser.id}
          userName={avatarTargetUser.name}
          onClose={() => setAvatarTargetUser(null)}
          onSave={async (url) => {
            await db.setUserAvatar(avatarTargetUser.id, url);
            setAvatarUrl(avatarTargetUser.id, url);
            window.dispatchEvent(new CustomEvent('gearbox-avatar-updated', { detail: { userId: avatarTargetUser.id } }));
          }}
        />
      )}
    </div>
  );
};

export default Settings;
