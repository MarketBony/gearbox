
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getThemeKey = (userId: string) => `gearbox_theme_${userId}`;

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  // During loading, fall back to localStorage to avoid flash
  const userId = user?.id || localStorage.getItem('gearbox_auth_user_id') || 'default';

  const [theme, setTheme] = useState<Theme>(() => {
    const currentUserId = localStorage.getItem('gearbox_auth_user_id') || 'default';
    const saved = localStorage.getItem(getThemeKey(currentUserId));
    return (saved as Theme) || 'light';
  });

  // Reload theme preference when the logged-in user changes
  useEffect(() => {
    const saved = localStorage.getItem(getThemeKey(userId));
    setTheme((saved as Theme) || 'light');
  }, [userId]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(getThemeKey(userId), theme);
  }, [theme, userId]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
