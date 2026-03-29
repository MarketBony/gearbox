import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { db } from '../services/dataService';

interface AuthContextType {
  user: User | null;
  login: (loginId: string, password?: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updatedUser: User) => Promise<void>;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const userId = localStorage.getItem('gearbox_auth_user_id');
      if (userId) {
        try {
          const users = await db.getUsers();
          const foundUser = users.find(u => u.id === userId);
          if (foundUser) {
            setUser(foundUser);
          } else {
            localStorage.removeItem('gearbox_auth_user_id');
          }
        } catch (e) {
          console.error('Auth check failed', e);
          localStorage.removeItem('gearbox_auth_user_id');
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (loginId: string, password?: string) => {
    try {
      if (!password) return false;
      const foundUser = await db.authenticate(loginId, password);
      if (foundUser) {
        localStorage.setItem('gearbox_auth_user_id', foundUser.id);
        setUser(foundUser);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Login failed', e);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('gearbox_auth_user_id');
    sessionStorage.clear();
    setUser(null);
  };

  const updateProfile = async (updatedUser: User) => {
    try {
      const users = await db.getUsers();
      const newUsers = users.map(u => u.id === updatedUser.id ? updatedUser : u);
      await db.saveUsers(newUsers);
      setUser(updatedUser);
    } catch (e) {
      console.error('Update profile failed', e);
      throw e;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateProfile, loading, isAuthenticated: !!user }}>
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
