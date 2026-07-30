import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import { FileSpreadsheet, Calendar, Loader2, CheckCircle2, AlertCircle, Lock, Download } from 'lucide-react';
import DatePicker from '../components/DatePicker';

// Rôles autorisés à exporter les données financières (projets + dépenses fixes).
export const EXPORT_ALLOWED_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator'];

// Parse local (anti-décalage J+1) : 'YYYY-MM-DD' → Date à minuit local.
const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = (iso || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const fmtDateFr = (iso: string): string => {
  if (!iso) return '';
  const d = parseLocalDate(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
};

const joinTags = (arr?: (string | undefined)[]): string =>
  (arr ? arr.filter(Boolean) : []).join(', ');

const STATUS_LABELS: Record<string, string> = {
  Draft: 'Brouillon', Active: 'Actif', Done: 'Terminé', Archived: 'Archivé',
};

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

    if (from && to && parseLocalDate(from).getTime() > parseLocalDate(to).getTime()) {
      setMessage({ type: 'error', text: 'La date de début doit précéder la date de fin.' });
      return;
    }

    setLoading(true);
    try {
      const fromTime = from ? parseLocalDate(from).getTime() : -Infinity;
      const toTime = to ? parseLocalDate(to).getTime() : Infinity;

      const [projects, fixedExpenses] = await Promise.all([
        db.getProjects(),
        db.getFixedExpenses(),
      ]);

      // Filtrage période : projets sur la date de début, dépenses sur leur date (parse local anti J+1).
      const projInRange = projects.filter(p => {
        // Brouillon : ne remonte nulle part (règle métier, cf. CLAUDE.md) — donc
        // pas non plus dans un export qui sert de référence chiffrée.
        if (p.status === 'Draft') return false;
        if (!p.startDate) return false;
        const t = parseLocalDate(p.startDate).getTime();
        return t >= fromTime && t <= toTime;
      });
      const expInRange = fixedExpenses.filter(e => {
        if (!e.date) return false;
        const t = parseLocalDate(e.date).getTime();
        return t >= fromTime && t <= toTime;
      });

      if (projInRange.length === 0 && expInRange.length === 0) {
        setMessage({ type: 'info', text: 'Aucune donnée (projet ou dépense fixe) sur la période sélectionnée.' });
        setLoading(false);
        return;
      }

      // Import dynamique du fork compatible styles (résolu via importmap / node_modules).
      const mod: any = await import('xlsx-js-style');
      const XLSX = mod.default ?? mod;

      // ---- Style des en-têtes : gras, fond bleu charte Bony, texte blanc ----
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Calibri' },
        fill: { patternType: 'solid', fgColor: { rgb: '293F74' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          bottom: { style: 'thin', color: { rgb: 'F75632' } },
        },
      };

      const styleSheet = (
        ws: any,
        headers: string[],
        cols: number[],
        numberCols: number[],
      ) => {
        // En-têtes stylés
        headers.forEach((_, c) => {
          const ref = XLSX.utils.encode_cell({ r: 0, c });
          if (ws[ref]) ws[ref].s = headerStyle;
        });
        // Largeurs de colonnes
        ws['!cols'] = cols.map(wch => ({ wch }));
        // Format nombre (séparateur de milliers) sur les colonnes montants → sommable
        const range = XLSX.utils.decode_range(ws['!ref']);
        numberCols.forEach(c => {
          for (let r = 1; r <= range.e.r; r++) {
            const ref = XLSX.utils.encode_cell({ r, c });
            if (ws[ref] && ws[ref].t === 'n') ws[ref].z = '#,##0';
          }
        });
        // Filtre automatique sur l'en-tête
        ws['!autofilter'] = { ref: ws['!ref'] };
      };

      const wb = XLSX.utils.book_new();

      // ---- Onglet Projets (sans les tâches) ----
      const projHeaders = [
        'Nom', 'Site(s)', 'Marque(s)', 'Service(s)', 'Type', 'Statut', 'PRO+',
        'Date début', 'Date fin', 'Budget prévisionnel', 'Budget réalisé',
        'Avancement (%)', 'Description',
      ];
      const projData = projInRange.map(p => [
        p.name || '',
        joinTags(p.sites && p.sites.length ? p.sites : [p.site]),
        joinTags(p.brands),
        joinTags(p.service),
        p.projectType || '',
        STATUS_LABELS[p.status] ?? p.status ?? '',
        p.proPlus ? 'Oui' : 'Non',
        fmtDateFr(p.startDate),
        fmtDateFr(p.endDate),
        Number(p.budgetPlanned || 0),
        Number(p.budgetActual || 0),
        Number(p.progress || 0),
        p.description || '',
      ]);
      const wsProj = XLSX.utils.aoa_to_sheet([projHeaders, ...projData]);
      styleSheet(wsProj, projHeaders, [34, 22, 18, 16, 16, 12, 8, 12, 12, 18, 16, 14, 50], [9, 10]);
      XLSX.utils.book_append_sheet(wb, wsProj, 'Projets');

      // ---- Onglet Dépenses ----
      const expHeaders = ['Date', 'Site(s)', 'Marque(s)', 'Service', 'Commentaire', 'Montant', 'PRO+'];
      const expData = expInRange.map(e => [
        fmtDateFr(e.date),
        joinTags(e.sites && e.sites.length ? e.sites : [e.site]),
        joinTags(e.brands && e.brands.length ? e.brands : (e.brand ? [e.brand] : [])),
        e.service || '',
        e.comment || '',
        Number(e.amount || 0),
        e.proPlus ? 'Oui' : 'Non',
      ]);
      const wsExp = XLSX.utils.aoa_to_sheet([expHeaders, ...expData]);
      styleSheet(wsExp, expHeaders, [12, 22, 18, 14, 50, 16, 8], [5]);
      XLSX.utils.book_append_sheet(wb, wsExp, 'Dépenses');

      const fileName = `GEARBOX_Export_${from || 'debut'}_${to || 'fin'}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setResult({ projects: projInRange.length, expenses: expInRange.length });
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
