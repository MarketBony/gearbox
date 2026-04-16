
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, Lock, User, AlertCircle } from 'lucide-react';

const Login: React.FC = () => {
  const { login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    // Simulate animation delay for "classy" feel
    setTimeout(async () => {
        const success = await login(loginId, password);
        if (!success) {
            setError('Identifiant ou mot de passe incorrect.');
            setIsLoading(false);
        }
        // If success, AuthProvider state updates and App.tsx switches view
    }, 800);
  };

  return (
    <div className="h-screen w-full relative overflow-hidden flex items-center justify-center bg-black">
        {/* ANIMATED BACKGROUND */}
        <div className="absolute inset-0 bg-gradient-to-br from-bony-orange via-bony-violet to-bony-blue bg-[length:400%_400%] animate-gradient-slow opacity-20"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30"></div>
        
        {/* LOGIN CARD */}
        <div className="relative z-10 w-full max-w-md p-8 backdrop-blur-xl bg-black/60 border border-white/10 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-700">
            
            {/* LOGO ANIMATION */}
            <div className="flex flex-col items-center mb-10 group">
                <div className="relative w-24 h-24 transition-transform duration-700 group-hover:scale-110">
                     <img src="/logo-white.svg" alt="GEARBOX" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
                </div>
            </div>

            {/* FORM */}
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Identifiant</label>
                    <div className="relative group">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-bony-orange transition-colors" size={18} />
                        <input 
                            type="text" 
                            value={loginId}
                            onChange={(e) => setLoginId(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white outline-none focus:border-bony-orange focus:bg-black/60 transition-all font-sans"
                            placeholder="Votre ID de connexion"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mot de Passe</label>
                    <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-bony-violet transition-colors" size={18} />
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white outline-none focus:border-bony-violet focus:bg-black/60 transition-all font-sans"
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 p-3 rounded-lg border border-red-500/20 animate-pulse">
                        <AlertCircle size={16}/> {error}
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={isLoading || !loginId || !password}
                    className="w-full group relative bg-bony-gradient hover:opacity-90 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-bony-violet/20 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                >
                    <div className="relative z-10 flex items-center justify-center gap-2">
                        {isLoading ? 'CONNEXION...' : 'ACCÉDER AU COCKPIT'}
                        {!isLoading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform"/>}
                    </div>
                    {/* Hover Shine Effect */}
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                </button>
            </form>

            <div className="mt-8 text-center">
                <p className="text-[10px] text-slate-600 font-sans">
                    SECURED LOCAL ENVIRONMENT • BONY AUTO-MOBILE
                </p>
            </div>
        </div>

        <style>{`
            @keyframes gradient-slow {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            .animate-gradient-slow {
                animation: gradient-slow 15s ease infinite;
            }
            .animate-draw {
                stroke-dasharray: 100;
                stroke-dashoffset: 100;
                animation: draw 1.5s ease-out forwards;
            }
            @keyframes draw {
                to { stroke-dashoffset: 0; }
            }
        `}</style>
    </div>
  );
};

export default Login;
