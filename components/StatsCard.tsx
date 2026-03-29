import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'orange' | 'violet' | 'blue' | 'white';
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, subtitle, icon, color = 'orange' }) => {
  // Mapping branding colors to the card styles
  const colorStyles = {
    orange: { bg: 'bg-bony-orange/10', text: 'text-bony-orange', border: 'border-bony-orange/20' },
    violet: { bg: 'bg-bony-violet/10', text: 'text-bony-violet', border: 'border-bony-violet/20' },
    blue: { bg: 'bg-bony-blue/20', text: 'text-blue-400', border: 'border-bony-blue/30' },
    white: { bg: 'bg-white/5', text: 'text-slate-200', border: 'border-white/10' },
  };

  const currentStyle = colorStyles[color] || colorStyles.orange;

  return (
    <div className={`bg-bony-panel p-5 rounded-xl border ${currentStyle.border} shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-slate-400 text-xs font-bold tracking-wider mb-1 font-sans uppercase">{title}</p>
          <h3 className="text-2xl font-title font-bold text-white">{value}</h3>
        </div>
        <div className={`p-2.5 rounded-lg ${currentStyle.bg} ${currentStyle.text}`}>
          {icon}
        </div>
      </div>
      {subtitle && (
        <div className="mt-3 flex items-center">
             <span className="text-slate-500 text-xs font-medium bg-black/20 px-2 py-0.5 rounded">
                {subtitle}
             </span>
        </div>
      )}
    </div>
  );
};

export default StatsCard;