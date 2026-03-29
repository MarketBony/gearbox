
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import { User, UserRole } from '../types';
import { Save, User as UserIcon, Lock, Shield, Trash2, Plus, Edit2, Check, X, ShieldAlert } from 'lucide-react';

const Settings: React.FC = () => {
  const { user, updateProfile } = useAuth();
  
  // --- STATE: MY PROFILE ---
  const [name, setName] = useState(user?.name || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });

  // --- STATE: USER MANAGEMENT (MASTER ONLY) ---
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [isAddingUser, setIsAddingUser] = useState(false);

  useEffect(() => {
    if (user?.role === 'Master') {
        loadAllUsers();
    }
  }, [user]);

  const loadAllUsers = async () => {
      const users = await db.getUsers();
      setAllUsers(users);
  };

  // --- ACTIONS: MY PROFILE ---
  const handleUpdateProfile = async () => {
      setProfileMsg({ type: '', text: '' });
      if (!user) return;

      // Validate Password Change logic
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

      const updatedUser: User = {
          ...user,
          name: name,
          password: newPassword ? newPassword : user.password
      };

      await updateProfile(updatedUser);
      setProfileMsg({ type: 'success', text: 'Profil mis à jour avec succès.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
  };

  // --- ACTIONS: USER MANAGEMENT ---
  const startEdit = (targetUser: User) => {
      setEditingUserId(targetUser.id);
      setEditForm({ ...targetUser });
      setIsAddingUser(false);
  };

  const cancelEdit = () => {
      setEditingUserId(null);
      setEditForm({});
      setIsAddingUser(false);
  };

  const saveUser = async () => {
      if (!editForm.name || !editForm.loginId || !editForm.role) return;
      
      if (isAddingUser) {
          const newUser: User = {
              id: `u-${Date.now()}`, // Temp ID
              name: editForm.name,
              loginId: editForm.loginId,
              password: editForm.password || 'admin', // Default pwd
              role: editForm.role as UserRole,
              avatarColor: '#' + Math.floor(Math.random()*16777215).toString(16)
          };
          await db.saveUser(newUser);
      } else {
          const updatedUser = { ...allUsers.find(u => u.id === editingUserId), ...editForm } as User;
          await db.saveUser(updatedUser);
      }

      await loadAllUsers();
      cancelEdit();
  };

  const deleteUser = async (id: string) => {
      if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
      await db.deleteUser(id);
      await loadAllUsers();
  };

  if (!user) return null;

  return (
    <div className="p-8 h-screen overflow-y-auto custom-scrollbar bg-bony-dark animate-fade-in pb-20">
        <h2 className="text-3xl text-white font-title mb-8 flex items-center gap-3">
            <UserIcon className="text-bony-violet" size={32}/> Paramètres du Compte
        </h2>

        {/* SECTION 1: MY PROFILE */}
        <div className="max-w-4xl mx-auto bg-bony-panel border border-bony-border rounded-xl p-6 mb-10 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-bony-gradient"></div>
            
            <div className="flex items-start gap-6 mb-6">
                 {/* Avatar */}
                 <div 
                    className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-xl shrink-0"
                    style={{ backgroundColor: user.avatarColor || '#333' }}
                 >
                     {user.loginId.charAt(0).toUpperCase()}
                 </div>
                 <div>
                     <h3 className="text-xl font-bold text-white">{user.name}</h3>
                     <div className="flex items-center gap-2 mt-1">
                         <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${user.role === 'Master' ? 'border-purple-500 text-purple-400 bg-purple-500/10' : (user.role === 'Administrator' ? 'border-blue-500 text-blue-400 bg-blue-500/10' : 'border-emerald-500 text-emerald-400 bg-emerald-500/10')}`}>
                             {user.role}
                         </span>
                         <span className="text-xs text-slate-500">ID: {user.loginId}</span>
                     </div>
                 </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">Identité</h4>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Nom affiché</label>
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black/30 border border-bony-border rounded p-2 text-white text-sm outline-none focus:border-bony-violet"
                        />
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">Sécurité</h4>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Ancien mot de passe</label>
                        <input 
                            type="password" 
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="Requis pour changer"
                            className="w-full bg-black/30 border border-bony-border rounded p-2 text-white text-sm outline-none focus:border-bony-orange"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Nouveau mot de passe</label>
                            <input 
                                type="password" 
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full bg-black/30 border border-bony-border rounded p-2 text-white text-sm outline-none focus:border-bony-orange"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Confirmer</label>
                            <input 
                                type="password" 
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-black/30 border border-bony-border rounded p-2 text-white text-sm outline-none focus:border-bony-orange"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/5">
                <div className={`text-xs font-bold ${profileMsg.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {profileMsg.text}
                </div>
                <button 
                    onClick={handleUpdateProfile}
                    className="px-6 py-2 bg-bony-gradient text-white font-bold rounded-lg shadow-lg hover:opacity-90 transition flex items-center gap-2"
                >
                    <Save size={16}/> Enregistrer mon profil
                </button>
            </div>
        </div>

        {/* SECTION 2: USER MANAGEMENT (MASTER ONLY) */}
        {user.role === 'Master' && (
            <div className="max-w-6xl mx-auto mt-12 animate-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <ShieldAlert className="text-red-500" size={24}/> Gestion des Utilisateurs (Master)
                    </h3>
                    <button 
                        onClick={() => { setIsAddingUser(true); setEditingUserId('new'); setEditForm({ role: 'Coordinator', password: 'admin' }); }}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold uppercase flex items-center gap-2 border border-white/10 transition"
                    >
                        <Plus size={16}/> Nouvel Utilisateur
                    </button>
                </div>

                <div className="bg-bony-panel border border-bony-border rounded-xl overflow-hidden shadow-lg">
                    <table className="w-full text-left">
                        <thead className="bg-black/30 text-xs font-bold text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="p-4 w-16"></th>
                                <th className="p-4">Nom</th>
                                <th className="p-4">ID Connexion</th>
                                <th className="p-4">Rang</th>
                                <th className="p-4">Mot de passe</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm">
                            {/* ADD NEW ROW */}
                            {isAddingUser && (
                                <tr className="bg-bony-orange/10 border-l-4 border-bony-orange">
                                    <td className="p-4 text-center"><Plus size={16} className="text-bony-orange"/></td>
                                    <td className="p-4">
                                        <input className="bg-black/40 border border-bony-orange/50 rounded p-1 text-white w-full" placeholder="Nom complet" autoFocus value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                                    </td>
                                    <td className="p-4">
                                        <input className="bg-black/40 border border-bony-orange/50 rounded p-1 text-white w-full" placeholder="ID" value={editForm.loginId || ''} onChange={e => setEditForm({...editForm, loginId: e.target.value})} />
                                    </td>
                                    <td className="p-4">
                                        <select className="bg-black/40 border border-bony-orange/50 rounded p-1 text-white w-full" value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value as any})}>
                                            <option value="Master">Master</option>
                                            <option value="Administrator">Administrator</option>
                                            <option value="Coordinator">Coordinator</option>
                                        </select>
                                    </td>
                                    <td className="p-4">
                                        <input className="bg-black/40 border border-bony-orange/50 rounded p-1 text-white w-full" placeholder="Mot de passe" value={editForm.password || ''} onChange={e => setEditForm({...editForm, password: e.target.value})} />
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <button onClick={saveUser} className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/40"><Check size={16}/></button>
                                        <button onClick={cancelEdit} className="p-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/40"><X size={16}/></button>
                                    </td>
                                </tr>
                            )}

                            {/* LIST USERS */}
                            {allUsers.map(u => {
                                const isEditing = editingUserId === u.id;
                                if (isEditing) {
                                    return (
                                        <tr key={u.id} className="bg-blue-500/10 border-l-4 border-blue-500">
                                            <td className="p-4 text-center"><Edit2 size={16} className="text-blue-400"/></td>
                                            <td className="p-4">
                                                <input className="bg-black/40 border border-blue-500/50 rounded p-1 text-white w-full" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                                            </td>
                                            <td className="p-4">
                                                <input className="bg-black/40 border border-blue-500/50 rounded p-1 text-white w-full" value={editForm.loginId || ''} onChange={e => setEditForm({...editForm, loginId: e.target.value})} />
                                            </td>
                                            <td className="p-4">
                                                <select className="bg-black/40 border border-blue-500/50 rounded p-1 text-white w-full" value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value as any})}>
                                                    <option value="Master">Master</option>
                                                    <option value="Administrator">Administrator</option>
                                                    <option value="Coordinator">Coordinator</option>
                                                </select>
                                            </td>
                                            <td className="p-4">
                                                <input className="bg-black/40 border border-blue-500/50 rounded p-1 text-white w-full" placeholder="Laisser vide si inchangé" value={editForm.password || ''} onChange={e => setEditForm({...editForm, password: e.target.value})} />
                                            </td>
                                            <td className="p-4 text-right flex justify-end gap-2">
                                                <button onClick={saveUser} className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/40"><Check size={16}/></button>
                                                <button onClick={cancelEdit} className="p-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/40"><X size={16}/></button>
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr key={u.id} className="hover:bg-white/5 transition group">
                                        <td className="p-4">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow" style={{ backgroundColor: u.avatarColor }}>
                                                {u.loginId.charAt(0).toUpperCase()}
                                            </div>
                                        </td>
                                        <td className="p-4 font-bold text-slate-200">{u.name}</td>
                                        <td className="p-4 font-sans text-slate-400">{u.loginId}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${u.role === 'Master' ? 'border-purple-500 text-purple-400' : (u.role === 'Administrator' ? 'border-blue-500 text-blue-400' : 'border-emerald-500 text-emerald-400')}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-600 font-sans text-xs">••••••</td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                                                <button onClick={() => startEdit(u)} className="p-1.5 hover:bg-white/10 rounded text-slate-300"><Edit2 size={16}/></button>
                                                {u.role !== 'Master' && <button onClick={() => deleteUser(u.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={16}/></button>}
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
    </div>
  );
};

export default Settings;
