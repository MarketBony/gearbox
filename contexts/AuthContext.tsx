import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { db, getToken, setToken, clearToken, ApiError } from '../services/dataService';
import { connectSocket, disconnectSocket } from '../services/socket';
import { setAvatarUrl } from '../services/avatarCache';
import { canUseAssistant } from '../constants';

interface AuthContextType {
  user: User | null;
  login: (loginId: string, password?: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updatedUser: User) => Promise<void>;
  setAvatarPhoto: (url: string | null) => Promise<void>;
  /** Fond du Chat : `proc:<id>`, chemin d'une image importée, ou `null` pour le défaut. */
  setChatBackground: (valeur: string | null) => Promise<void>;
  /** Couleur des bulles de mes messages : un id du catalogue, ou `null` pour le défaut. */
  setChatBubble: (valeur: string | null) => Promise<void>;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Copie locale du user connecté (le backend ne renvoie pas loginId : on le
// conserve ici depuis le formulaire de login pour compléter les réponses /me).
const AUTH_USER_KEY = 'gearbox_auth_user';
const readStoredUser = (): User | null => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Au chargement : si un token existe, on le valide contre le backend (GET /me).
    const checkAuth = async () => {
      if (getToken()) {
        try {
          const me = await db.fetchMe();
          const stored = readStoredUser();
          const fullUser: User = { loginId: stored?.loginId ?? '', ...stored, ...me } as User;
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(fullUser));
          setUser(fullUser);
          setAvatarUrl(fullUser.id, fullUser.avatarUrl); // photo de profil pour <Avatar/>
          connectSocket(); // session restaurée : ouvre le socket chat (JWT au handshake)
        } catch (e) {
          // Token invalide/expiré ou serveur injoignable : retour au login.
          console.error('Auth check failed', e);
          clearToken();
        }
      }
      // Nettoyage de l'ancien mécanisme localStorage (pré-branchement).
      localStorage.removeItem('gearbox_auth_user_id');
      setLoading(false);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    // Déconnexion propre déclenchée par la couche API sur un 401 (token expiré).
    const onExpired = () => {
      disconnectSocket();
      sessionStorage.clear();
      setUser(null);
    };
    window.addEventListener('gearbox-auth-expired', onExpired);
    return () => window.removeEventListener('gearbox-auth-expired', onExpired);
  }, []);

  const login = async (loginId: string, password?: string) => {
    if (!password) return false;
    try {
      const { token, user: apiUser } = await db.login(loginId, password);
      const fullUser: User = { ...apiUser, loginId } as User;
      setToken(token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(fullUser));
      setUser(fullUser);
      setAvatarUrl(fullUser.id, fullUser.avatarUrl); // photo de profil pour <Avatar/>
      connectSocket(); // login réussi : ouvre le socket chat (JWT au handshake)
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        return false; // identifiants incorrects — message géré par Login.tsx
      }
      // Réseau/serveur injoignable : on laisse remonter pour un message distinct.
      throw e;
    }
  };

  const logout = () => {
    // mIAouss : une DÉCONNEXION VOLONTAIRE efface la discussion (décision de Théo, 08/10/2026) — la
    // mémoire, elle, reste. Lancé AVANT clearToken : apiFetch lit le jeton au moment de l'appel.
    if (canUseAssistant(user?.role)) db.assistantReset().catch(() => {});
    disconnectSocket(); // fermeture propre du socket : pas de connexion fantôme
    clearToken();
    sessionStorage.clear();
    setUser(null);
  };

  // Profil du user CONNECTÉ uniquement — passe par PUT /api/auth/me.
  const updateProfile = async (updatedUser: User) => {
    try {
      const me = await db.updateMe({
        name: updatedUser.name,
        avatarColor: updatedUser.avatarColor,
        // ⚠️ Chaîne vide et non `undefined` : la convention du serveur est
        // « champ absent = inchangé, valeur vide = effacement » (routes/auth.ts).
        // Envoyer `undefined` rendrait impossible d'effacer sa date de naissance.
        birthdate: updatedUser.birthdate ?? '',
        ...(updatedUser.password ? { password: updatedUser.password } : {})
      });
      // ⚠️ `me` (réponse serveur) est étalé APRÈS `updatedUser` : c'est volontaire, le
      // serveur est la source de vérité. Corollaire à ne pas oublier — tout champ que
      // l'on omet d'envoyer ci-dessus est ici RÉÉCRIT à son ancienne valeur, donc la
      // saisie de l'utilisateur disparaît de l'écran sans message d'erreur. C'est ce
      // qui masquait le bug de l'anniversaire : le formulaire revenait à l'ancienne
      // valeur, ce qui se lit comme « ça n'enregistre pas » plutôt que comme un bug.
      const fullUser: User = { ...updatedUser, ...me, password: undefined } as User;
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(fullUser));
      setUser(fullUser);
    } catch (e) {
      console.error('Update profile failed', e);
      throw e;
    }
  };

  // Photo de profil du user CONNECTÉ : url d'un fichier uploadé, ou null pour la retirer.
  const setAvatarPhoto = async (url: string | null) => {
    if (!user) return;
    const me = await db.updateMe({ avatarUrl: url });
    const fullUser: User = { ...user, avatarUrl: me.avatarUrl } as User;
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(fullUser));
    setUser(fullUser);
    setAvatarUrl(fullUser.id, me.avatarUrl);
    window.dispatchEvent(new CustomEvent('gearbox-avatar-updated', { detail: { userId: fullUser.id } }));
  };

  /**
   * Fond de discussion du Chat de l'utilisateur CONNECTÉ.
   *
   * ⚠️ Méthode dédiée, et surtout PAS un passage par `updateProfile` : celui-ci
   * reconstruit un objet littéral champ par champ, et c'est exactement ce qui a fait
   * qu'une date de naissance saisie par son propriétaire n'atteignait jamais le serveur
   * (correctif du 06/08/2026) — le serveur répondait 200, l'interface affichait « profil
   * mis à jour », et rien n'était écrit. Une méthode par intention évite d'avoir à se
   * souvenir d'une liste.
   */
  /** Même patron que `setChatBackground` — et pour la même raison, voir son avertissement. */
  const setChatBubble = async (valeur: string | null) => {
    if (!user) return;
    const me = await db.updateMe({ chatBubble: valeur ?? '' });
    const fullUser: User = { ...user, chatBubble: me.chatBubble ?? null } as User;
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(fullUser));
    setUser(fullUser);
  };

  const setChatBackground = async (valeur: string | null) => {
    if (!user) return;
    // Chaîne vide et non `null` dans le corps : convention du serveur « champ absent =
    // inchangé, valeur vide = effacement » (routes/auth.ts).
    const me = await db.updateMe({ chatBackground: valeur ?? '' });
    const fullUser: User = { ...user, chatBackground: me.chatBackground ?? null } as User;
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(fullUser));
    setUser(fullUser);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateProfile, setAvatarPhoto, setChatBackground, setChatBubble, loading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
