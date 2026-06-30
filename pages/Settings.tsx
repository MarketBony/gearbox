
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import { User, UserRole, ActivityLog } from '../types';
import { Save, User as UserIcon, Trash2, Plus, Edit2, Check, X, ShieldAlert, Camera, Upload, ZoomIn, MapPin, Cake } from 'lucide-react';
import Cropper from 'react-easy-crop';
import Avatar, { avatarKey } from '../components/Avatar';
import { SITES } from '../constants';

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
}
const AvatarUploadModal: React.FC<AvatarModalProps> = ({ userId, userName, onClose }) => {
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasExistingPhoto = !!localStorage.getItem(avatarKey(userId));

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Format non supporté. Utilisez jpg, png ou webp.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Fichier trop lourd (max 2 Mo).');
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
    if (!cropSrc || !croppedAreaPixels) return;
    try {
      const base64 = await getCroppedImg(cropSrc, croppedAreaPixels);
      localStorage.setItem(avatarKey(userId), base64);
      window.dispatchEvent(new CustomEvent('gearbox-avatar-updated', { detail: { userId } }));
      onClose();
    } catch {
      setError('Erreur lors du recadrage. Réessayez.');
    }
  }, [cropSrc, croppedAreaPixels, userId, onClose]);

  const handleDelete = () => {
    localStorage.removeItem(avatarKey(userId));
    window.dispatchEvent(new CustomEvent('gearbox-avatar-updated', { detail: { userId } }));
    onClose();
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
                <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1">jpg, png, webp — max 2 Mo</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
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

const USER_PREFS_KEY = (id: string) => `gearbox_user_prefs_${id}`;

interface UserPrefs { city: string; birthdate: string; }
const loadUserPrefs = (id: string): UserPrefs => {
  try { return { city: '', birthdate: '', ...JSON.parse(localStorage.getItem(USER_PREFS_KEY(id)) || '{}') }; }
  catch { return { city: '', birthdate: '' }; }
};
const saveUserPrefs = (id: string, prefs: UserPrefs) =>
  localStorage.setItem(USER_PREFS_KEY(id), JSON.stringify(prefs));

// --- Main Settings ---
const Settings: React.FC = () => {
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // User prefs (city + birthdate) for own profile
  const [userCity, setUserCity] = useState('');
  const [userBirthdate, setUserBirthdate] = useState('');

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [editPrefs, setEditPrefs] = useState<UserPrefs>({ city: '', birthdate: '' });
  const [isAddingUser, setIsAddingUser] = useState(false);
  // Avatar modal for master managing other users
  const [avatarTargetUser, setAvatarTargetUser] = useState<User | null>(null);
  // Map userId -> prefs for display in user table
  const [allUserPrefs, setAllUserPrefs] = useState<Record<string, UserPrefs>>({});

  useEffect(() => {
    if (user) {
      const prefs = loadUserPrefs(user.id);
      setUserCity(prefs.city);
      setUserBirthdate(prefs.birthdate);
    }
    if (user?.role === 'Master') loadAllUsers();
  }, [user]);

  const loadAllUsers = async () => {
    const users = await db.getUsers();
    setAllUsers(users);
    const prefsMap: Record<string, UserPrefs> = {};
    users.forEach(u => { prefsMap[u.id] = loadUserPrefs(u.id); });
    setAllUserPrefs(prefsMap);
  };

  const handleUpdateProfile = async () => {
    setProfileMsg({ type: '', text: '' });
    if (!user) return;

    if (newPassword || oldPassword) {
      if (oldPassword !== user.password) {
        setProfileMsg({ type: 'error', text: 'Ancien mot de passe incorrect.' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setProfileMsg({ type: 'error', text: 'Les nouveaux mots de passe ne correspondent pas.' });
        return;
      }
      if (newPassword.length < 4) {
        setProfileMsg({ type: 'error', text: 'Le mot de passe est trop court.' });
        return;
      }
    }

    const updatedUser: User = { ...user, name, password: newPassword ? newPassword : user.password };
    await updateProfile(updatedUser);
    saveUserPrefs(user.id, { city: userCity, birthdate: userBirthdate });
    setProfileMsg({ type: 'success', text: 'Profil mis à jour avec succès.' });
    setOldPassword(''); setNewPassword(''); setConfirmPassword('');
  };

  const startEdit = (targetUser: User) => {
    setEditingUserId(targetUser.id);
    setEditForm({ ...targetUser });
    setEditPrefs(loadUserPrefs(targetUser.id));
    setIsAddingUser(false);
  };

  const cancelEdit = () => { setEditingUserId(null); setEditForm({}); setEditPrefs({ city: '', birthdate: '' }); setIsAddingUser(false); };

  const saveUser = async () => {
    if (!editForm.name || !editForm.loginId || !editForm.role) return;
    if (isAddingUser) {
      const newUser: User = {
        id: `u-${Date.now()}`,
        name: editForm.name,
        loginId: editForm.loginId,
        password: editForm.password || 'admin',
        role: editForm.role as UserRole,
        avatarColor: '#' + Math.floor(Math.random() * 16777215).toString(16)
      };
      await db.saveUser(newUser);
      saveUserPrefs(newUser.id, editPrefs);
      if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: "a créé l'utilisateur", entity: 'user', entityName: newUser.name, timestamp: new Date().toISOString() });
    } else {
      const updatedUser = { ...allUsers.find(u => u.id === editingUserId), ...editForm } as User;
      await db.saveUser(updatedUser);
      saveUserPrefs(updatedUser.id, editPrefs);
      if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: "a modifié l'utilisateur", entity: 'user', entityName: updatedUser.name, timestamp: new Date().toISOString() });
    }
    await loadAllUsers();
    cancelEdit();
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
    const toDelete = allUsers.find(u => u.id === id);
    await db.deleteUser(id);
    if (user && toDelete) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: "a supprimé l'utilisateur", entity: 'user', entityName: toDelete.name, timestamp: new Date().toISOString() });
    await loadAllUsers();
  };

  if (!user) return null;

  // Input classes
  const inputCls = 'w-full bg-white dark:bg-black/30 border border-slate-300 dark:border-bony-border rounded p-2 text-slate-900 dark:text-white text-sm outline-none focus:border-bony-orange transition';
  const tableInputCls = 'bg-white dark:bg-black/40 border border-bony-orange/50 rounded p-1 text-slate-900 dark:text-white w-full text-sm';

  return (
    <div className="p-3 md:p-8 h-screen overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-bony-dark animate-fade-in pb-20">
      <h2 className="text-xl md:text-3xl text-slate-900 dark:text-white font-title mb-8 flex items-center gap-3">
        <UserIcon className="text-bony-violet" size={32} /> Paramètres du Compte
      </h2>

      {/* SECTION 1: MY PROFILE */}
      <div className="max-w-4xl mx-auto gx-card p-6 mb-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-bony-gradient" />

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
              <select value={userCity} onChange={e => setUserCity(e.target.value)} className={inputCls}>
                <option value="">— Sélectionner une ville —</option>
                {SITES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-500 mb-1 flex items-center gap-1">
                <Cake size={11} /> Date de naissance
              </label>
              <input
                type="date"
                value={userBirthdate}
                onChange={e => setUserBirthdate(e.target.value)}
                className={inputCls}
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

      {/* SECTION 2: USER MANAGEMENT (MASTER ONLY) */}
      {user.role === 'Master' && (
        <div className="max-w-6xl mx-auto mt-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="text-red-500" size={24} /> Gestion des Utilisateurs (Master)
            </h3>
            <button
              onClick={() => { setIsAddingUser(true); setEditingUserId('new'); setEditForm({ role: 'Coordinator', password: 'admin' }); setEditPrefs({ city: '', birthdate: '' }); }}
              className="px-4 py-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-lg text-xs font-bold uppercase flex items-center gap-2 border border-slate-300 dark:border-white/10 transition"
            >
              <Plus size={16} /> Nouvel Utilisateur
            </button>
          </div>

          <div className="gx-card p-0 overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
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
                      <select className={tableInputCls} value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value as UserRole })}>
                        <option value="Master">Master</option>
                        <option value="Administrator">Administrator</option>
                        <option value="Director">Director</option>
                        <option value="Coordinator">Coordinator</option>
                        <option value="Digital Manager">Digital Manager</option>
                        <option value="Guest">Guest</option>
                        <option value="External">External</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <select className={tableInputCls} value={editPrefs.city} onChange={e => setEditPrefs({ ...editPrefs, city: e.target.value })}>
                        <option value="">—</option>
                        {SITES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="p-4">
                      <input type="date" className={tableInputCls} value={editPrefs.birthdate} onChange={e => setEditPrefs({ ...editPrefs, birthdate: e.target.value })} />
                    </td>
                    <td className="p-4">
                      <input className={tableInputCls} placeholder="Mot de passe" value={editForm.password || ''} onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={saveUser} className="p-1.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded hover:bg-emerald-500/30"><Check size={16} /></button>
                        <button onClick={cancelEdit} className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500/30"><X size={16} /></button>
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
                          <select className={editInputCls} value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value as UserRole })}>
                            <option value="Master">Master</option>
                            <option value="Administrator">Administrator</option>
                            <option value="Director">Director</option>
                            <option value="Coordinator">Coordinator</option>
                            <option value="Digital Manager">Digital Manager</option>
                            <option value="Guest">Guest</option>
                            <option value="External">External</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <select className={editInputCls} value={editPrefs.city} onChange={e => setEditPrefs({ ...editPrefs, city: e.target.value })}>
                            <option value="">—</option>
                            {SITES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="p-4">
                          <input type="date" className={editInputCls} value={editPrefs.birthdate} onChange={e => setEditPrefs({ ...editPrefs, birthdate: e.target.value })} />
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
                        {allUserPrefs[u.id]?.birthdate
                          ? <span className="flex items-center gap-1"><Cake size={10} className="text-pink-400" />{new Date(allUserPrefs[u.id].birthdate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                          : <span className="text-slate-300 dark:text-slate-700">—</span>}
                      </td>
                      <td className="p-4 text-slate-400 dark:text-slate-600 font-sans text-xs">••••••</td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => startEdit(u)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-slate-500 dark:text-slate-300">
                            <Edit2 size={16} />
                          </button>
                          {u.role !== 'Master' && (
                            <button onClick={() => deleteUser(u.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-500">
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

      {/* Avatar modal — own profile */}
      {showAvatarModal && (
        <AvatarUploadModal
          userId={user.id}
          userName={user.name}
          onClose={() => setShowAvatarModal(false)}
        />
      )}

      {/* Avatar modal — master editing another user */}
      {avatarTargetUser && (
        <AvatarUploadModal
          userId={avatarTargetUser.id}
          userName={avatarTargetUser.name}
          onClose={() => setAvatarTargetUser(null)}
        />
      )}
    </div>
  );
};

export default Settings;
