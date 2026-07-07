
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, Lock, User, AlertCircle } from 'lucide-react';

const GRID = 40;
const LINE_COLORS = [
  'rgba(143,18,171,0.25)',
  'rgba(100,10,130,0.2)',
  'rgba(41,63,116,0.2)',
  'rgba(247,86,50,0.15)',
];
const PULSE_COLORS = [
  'rgba(247,86,50,0.9)',
  'rgba(200,50,220,0.85)',
  'rgba(143,18,171,0.9)',
  'rgba(247,86,50,0.7)',
];
const NODE_COLORS = [
  'rgba(247,86,50,0.6)',
  'rgba(143,18,171,0.6)',
  'rgba(200,80,230,0.5)',
];

interface Segment {
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
}

interface Pulse {
  segment: Segment;
  t: number;
  speed: number;
  color: string;
  size: number;
}

interface Node {
  x: number;
  y: number;
  color: string;
}

function buildGrid(width: number, height: number): { segments: Segment[]; nodes: Node[] } {
  const segments: Segment[] = [];
  const nodes: Node[] = [];

  const cols = Math.ceil(width / GRID) + 1;
  const rows = Math.ceil(height / GRID) + 1;

  // Horizontal segments
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const len = 1 + Math.floor(Math.random() * 4);
      if (Math.random() < 0.55) {
        segments.push({
          x1: c * GRID, y1: r * GRID,
          x2: Math.min((c + len) * GRID, width), y2: r * GRID,
          color: LINE_COLORS[Math.floor(Math.random() * LINE_COLORS.length)],
        });
      }
      c += len;
    }
  }

  // Vertical segments
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const len = 1 + Math.floor(Math.random() * 3);
      if (Math.random() < 0.4) {
        segments.push({
          x1: c * GRID, y1: r * GRID,
          x2: c * GRID, y2: Math.min((r + len) * GRID, height),
          color: LINE_COLORS[Math.floor(Math.random() * LINE_COLORS.length)],
        });
      }
      r += len;
    }
  }

  // Nodes at grid intersections
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.012) {
        nodes.push({
          x: c * GRID, y: r * GRID,
          color: NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)],
        });
      }
    }
  }

  return { segments, nodes };
}

function spawnPulse(segments: Segment[]): Pulse {
  const seg = segments[Math.floor(Math.random() * segments.length)];
  return {
    segment: seg,
    t: 0,
    speed: 0.003 + Math.random() * 0.006,
    color: PULSE_COLORS[Math.floor(Math.random() * PULSE_COLORS.length)],
    size: 3 + Math.random() * 3,
  };
}

const Login: React.FC = () => {
  const { login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let segments: Segment[] = [];
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const grid = buildGrid(canvas.width, canvas.height);
      segments = grid.segments;
      nodes = grid.nodes;
      pulses = Array.from({ length: 8 }, () => spawnPulse(segments));
    };

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0a0414';
      ctx.fillRect(0, 0, w, h);

      // Animated radial gradient overlay
      const t = Date.now() / 8000;
      const cx = w * (0.3 + 0.2 * Math.sin(t));
      const cy = h * (0.4 + 0.2 * Math.cos(t * 0.7));
      const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
      radGrad.addColorStop(0, 'rgba(80,10,120,0.35)');
      radGrad.addColorStop(0.4, 'rgba(40,5,80,0.2)');
      radGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, w, h);

      // Draw segments
      ctx.lineWidth = 1;
      for (const seg of segments) {
        ctx.strokeStyle = seg.color;
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update & draw pulses
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += p.speed;
        if (p.t > 1) {
          pulses[i] = spawnPulse(segments);
          continue;
        }
        const x = p.segment.x1 + (p.segment.x2 - p.segment.x1) * p.t;
        const y = p.segment.y1 + (p.segment.y2 - p.segment.y1) * p.t;

        // Halo
        const grad = ctx.createRadialGradient(x, y, 0, x, y, p.size * 5);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 5, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Maintain max 14 pulses
      while (pulses.length < 14) pulses.push(spawnPulse(segments));

      animId = requestAnimationFrame(draw);
    };

    const handleResize = () => { init(); };

    init();
    draw();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const base = document.getElementById('glitch-logo');
    const l1 = document.getElementById('glitch-l1');
    const l2 = document.getElementById('glitch-l2');
    if (!base || !l1 || !l2) return;

    let timeout: ReturnType<typeof setTimeout>;

    function randPx(max: number) {
      return (Math.random() * max * 2 - max) + 'px';
    }

    function glitch() {
      const steps = 4 + Math.floor(Math.random() * 4);
      const stepDuration = 40;
      let i = 0;
      const interval = setInterval(() => {
        if (i >= steps) {
          l1.style.opacity = '0';
          l2.style.opacity = '0';
          l1.style.transform = 'none';
          l2.style.transform = 'none';
          (base as HTMLElement).style.transform = 'none';
          clearInterval(interval);
          timeout = setTimeout(glitch, 2500 + Math.random() * 3000);
          return;
        }
        const intensity = Math.random();
        l1.style.opacity = String(0.5 + Math.random() * 0.5);
        l2.style.opacity = String(0.4 + Math.random() * 0.4);
        l1.style.transform = `translate(${randPx(6 * intensity)}, ${randPx(1)})`;
        l2.style.transform = `translate(${randPx(4 * intensity)}, ${randPx(1)})`;
        (base as HTMLElement).style.transform = `translate(${randPx(1.5 * intensity)}, 0)`;
        const y1 = Math.floor(Math.random() * 80);
        const y2 = y1 + 10 + Math.floor(Math.random() * 20);
        l1.style.clipPath = `inset(${y1}% 0 ${100 - y2}% 0)`;
        l2.style.clipPath = `inset(${100 - y2}% 0 ${y1}% 0)`;
        i++;
      }, stepDuration);
    }

    timeout = setTimeout(glitch, 1000);
    return () => clearTimeout(timeout);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    setTimeout(async () => {
      try {
        const success = await login(loginId, password);
        if (!success) {
          setError('Identifiant ou mot de passe incorrect.');
          setIsLoading(false);
        }
      } catch {
        // Erreur réseau (backend éteint, base Supabase injoignable...) —
        // distincte du refus d'identifiants.
        setError('Serveur injoignable — vérifiez que le backend tourne et que la connexion (hotspot) est active.');
        setIsLoading(false);
      }
    }, 800);
  };

  return (
    <div className="h-screen w-full relative overflow-hidden flex items-center justify-center">
      {/* CANVAS BACKGROUND */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />

      {/* LOGIN CARD */}
      <div className="relative z-10 w-full max-w-md p-8 backdrop-blur-xl bg-black/60 border border-white/10 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-700">

        {/* LOGO */}
        <div className="flex flex-col items-center mb-10">
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src="/logo-white.svg" alt="GEARBOX" className="w-48 h-auto object-contain mx-auto block" id="glitch-logo" />
            <img src="/logo-white.svg" alt="" aria-hidden className="w-48 h-auto object-contain mx-auto block" id="glitch-l1" style={{ position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none', filter: 'hue-rotate(320deg) saturate(3) brightness(1.2)' }} />
            <img src="/logo-white.svg" alt="" aria-hidden className="w-48 h-auto object-contain mx-auto block" id="glitch-l2" style={{ position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none', filter: 'hue-rotate(200deg) saturate(3) brightness(1.1)' }} />
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
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !loginId || !password}
            className="w-full group relative bg-bony-gradient hover:opacity-90 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-bony-violet/20 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
          >
            <div className="relative z-10 flex items-center justify-center gap-2">
              {isLoading ? 'CONNEXION...' : 'ACCÉDER AU COCKPIT'}
              {!isLoading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
            </div>
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-slate-600 font-sans">
            SECURED LOCAL ENVIRONMENT • BONY AUTO-MOBILE
          </p>
        </div>
      </div>

    </div>
  );
};

export default Login;
