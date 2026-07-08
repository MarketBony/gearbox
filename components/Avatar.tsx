
import React, { useState, useEffect } from 'react';
import { getAvatarUrl } from '../services/avatarCache';

export const avatarKey = (userId: string) => `gearbox_avatar_${userId}`;

interface AvatarProps {
  userId: string;
  name: string;
  color?: string;
  size?: number;
}

// Priorité : URL serveur (cache alimenté par l'API) puis photo base64 localStorage
// (legacy, pré-branchement uploads), sinon initiale colorée.
const resolveSrc = (userId: string): string | null =>
  userId ? (getAvatarUrl(userId) || localStorage.getItem(avatarKey(userId))) : null;

const Avatar: React.FC<AvatarProps> = ({ userId, name, color = '#64748b', size = 32 }) => {
  const [photo, setPhoto] = useState<string | null>(() => resolveSrc(userId));

  useEffect(() => {
    setPhoto(resolveSrc(userId));

    const handleUpdate = (e: Event) => {
      // Event ciblé (detail.userId) ou global (prime du cache sans detail) -> on rafraîchit.
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.userId === undefined || detail.userId === userId) {
        setPhoto(resolveSrc(userId));
      }
    };
    window.addEventListener('gearbox-avatar-updated', handleUpdate);
    return () => window.removeEventListener('gearbox-avatar-updated', handleUpdate);
  }, [userId]);

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className="rounded-full object-cover shrink-0 select-none"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none"
      style={{ width: size, height: size, fontSize: Math.max(Math.round(size * 0.38), 10), backgroundColor: color }}
    >
      {name ? name.charAt(0).toUpperCase() : '?'}
    </div>
  );
};

export default Avatar;
