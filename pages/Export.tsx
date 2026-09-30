import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import { FileSpreadsheet, Calendar, Loader2, CheckCircle2, AlertCircle, Lock, Download } from 'lucide-react';
import DatePicker from '../components/DatePicker';

import { EXPORT_ALLOWED_ROLES } from '../constants';
import { buildExport, writeExportFile, periodError } from '../services/exportXlsx';
// Rôles autorisés : constants.ts (ré-exportés ici pour les imports existants).
export { EXPORT_ALLOWED_ROLES };

const Export: React.FC = () => {
  const { user } = useAuth();
  const canExport = EXPORT_ALLOWED_ROLES.includes(user?.role ?? '');

  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ projects: number; expenses: number } | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  // Défense en profondeur : la sidebar/App gèrent déjà l'accès, on re-vérifie ici.
  if (!canExport) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
        <Lock size={40} className="text-slate-400" />
        <h2 className="text-lg font-title text-bony-text">Accès restreint</h2>
        <p className="text-sm text-bony-muted max-w-sm">
          L'export des données est réservé aux rôles de gestion (Master, Administrateur, Directeur, Coordinateur).
        </p>
      </div>
    );
  }

  const handleExport = async () => {
    setMessage(null);
    setResult(null);

    const err = periodError(from, to);
    if (err) { setMessage({ type: 'error', text: err }); return; }

    setLoading(true);
    try {
      const [projects, fixedExpenses] = await Promise.all([
        db.getProjects(),
        db.getFixedExpenses(),
      ]);
      // ⚠️ Filtres, colonnes et fichier : services/exportXlsx.ts (source unique, partagée avec l'interface v2).
      const data = buildExport(projects, fixedExpenses, from, to);
      if (data.projects.length === 0 && data.expenses.length === 0) {
        setMessage({ type: 'info', text: 'Aucune donnée (projet ou dépense fixe) sur la période sélectionnée.' });
        setLoading(false);
        return;
      }
      await writeExportFile(data, from, to);
      setResult({ projects: data.projects.length, expenses: data.expenses.length });
    } catch (err) {
      console.error('Export error:', err);
      setMessage({ type: 'error', text: "Une erreur est survenue lors de la génération du fichier." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-bony-gradient flex items-center justify-center shrink-0 shadow-glow">
            <FileSpreadsheet size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-title text-bony-text leading-tight">Export Excel</h1>
            <p className="text-xs text-bony-muted">Projets et dépenses fixes sur une période, au format .xlsx</p>
          </div>
        </div>

        {/* Carte de configuration */}
        <div className="gx-card p-5 md:p-6 space-y-5">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Calendar size={13} /> Période
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Du</span>
                <DatePicker
                  size="sm"
                  value={from}
                  placeholder="Début"
                  onChange={(v) => { setFrom(v); if (v && to && v > to) setTo(v); }}
                />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Au</span>
                <DatePicker
                  size="sm"
                  value={to}
                  minDate={from}
                  placeholder="Fin"
                  onChange={(v) => setTo(v)}
                />
              </div>
            </div>
            <p className="text-[11px] text-bony-muted mt-2 leading-relaxed">
              Les <strong>projets</strong> sont filtrés sur leur date de début, les <strong>dépenses</strong> sur leur date.
              Le fichier contient 2 onglets : <em>Projets</em> et <em>Dépenses</em>.
            </p>
          </div>

          {/* Bouton de génération */}
          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold bg-bony-gradient text-white hover:opacity-90 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /> Génération en cours…</>
            ) : (
              <><Download size={18} /> Générer le fichier Excel</>
            )}
          </button>

          {/* Feedback : succès */}
          {result && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 animate-fade-in">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-700 dark:text-emerald-300">
                <p className="font-bold">Export généré avec succès.</p>
                <p className="text-xs mt-0.5">
                  {result.projects} projet{result.projects > 1 ? 's' : ''} · {result.expenses} dépense{result.expenses > 1 ? 's' : ''} fixe{result.expenses > 1 ? 's' : ''}.
                </p>
              </div>
            </div>
          )}

          {/* Feedback : erreur / info */}
          {message && (
            <div className={`flex items-start gap-3 p-3 rounded-lg border animate-fade-in ${
              message.type === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300'
            }`}>
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p className="text-sm">{message.text}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Export;
