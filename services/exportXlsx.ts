import type { FixedExpense, Project } from '../types';

// =====================================================================
// ⚠️ SOURCE UNIQUE de l'export Excel depuis le 30/09/2026 : utilisée par pages/Export.tsx ET par la
// rubrique v2 (ui2/apps/export). Ne jamais recopier ce calcul dans un écran.
//
// Contenu repris À L'IDENTIQUE de pages/Export.tsx (`handleExport`) — mêmes filtres, mêmes
// colonnes, mêmes valeurs, même bibliothèque (`xlsx-js-style`, import dynamique), mêmes styles,
// même nom de fichier. Les montants sont les valeurs BRUTES des enregistrements (`budgetPlanned`,
// `budgetActual`, `progress`, `amount`) : aucun routage budgétaire, aucune répartition, comme la page.
// Seule différence d'organisation : le calcul des lignes (`buildExport`) est séparé de l'écriture du
// fichier (`writeExportFile`), pour que l'aperçu de la maquette montre EXACTEMENT les cellules écrites.
// =====================================================================

// Parse local (anti-décalage J+1) : 'YYYY-MM-DD' → Date à minuit local.
export const parseLocalDate = (iso: string): Date => {
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

export const PROJ_HEADERS = [
  'Nom', 'Site(s)', 'Marque(s)', 'Service(s)', 'Type', 'Statut', 'PRO+',
  'Date début', 'Date fin', 'Budget prévisionnel', 'Budget réalisé',
  'Avancement (%)', 'Description',
];
export const EXP_HEADERS = ['Date', 'Site(s)', 'Marque(s)', 'Service', 'Commentaire', 'Montant', 'PRO+'];
const PROJ_COLS = [34, 22, 18, 16, 16, 12, 8, 12, 12, 18, 16, 14, 50], PROJ_NUM = [9, 10];
const EXP_COLS = [12, 22, 18, 14, 50, 16, 8], EXP_NUM = [5];

export type Cell = string | number;
export interface ExportData { projects: Cell[][]; expenses: Cell[][] }

/** Message de la page quand « Du » dépasse « Au » (null si la période est valide). */
export const periodError = (from: string, to: string) =>
  (from && to && parseLocalDate(from).getTime() > parseLocalDate(to).getTime() ? 'La date de début doit précéder la date de fin.' : null);

/** Lignes des deux onglets — filtres et colonnes de pages/Export.tsx, ordre des listes reçues (aucun tri). */
export function buildExport(projects: Project[], fixedExpenses: FixedExpense[], from: string, to: string): ExportData {
  const fromTime = from ? parseLocalDate(from).getTime() : -Infinity;
  const toTime = to ? parseLocalDate(to).getTime() : Infinity;

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

  // ---- Onglet Projets (sans les tâches) ----
  const projData: Cell[][] = projInRange.map(p => [
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
  // ---- Onglet Dépenses ----
  const expData: Cell[][] = expInRange.map(e => [
    fmtDateFr(e.date),
    joinTags(e.sites && e.sites.length ? e.sites : [e.site]),
    joinTags(e.brands && e.brands.length ? e.brands : (e.brand ? [e.brand] : [])),
    e.service || '',
    e.comment || '',
    Number(e.amount || 0),
    e.proPlus ? 'Oui' : 'Non',
  ]);
  return { projects: projData, expenses: expData };
}

export const exportFileName = (from: string, to: string) => `GEARBOX_Export_${from || 'debut'}_${to || 'fin'}.xlsx`;

/** Écrit le classeur et le fait télécharger par le navigateur (`XLSX.writeFile`), comme la page. */
export async function writeExportFile(data: ExportData, from: string, to: string): Promise<void> {
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

  const styleSheet = (ws: any, headers: string[], cols: number[], numberCols: number[]) => {
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
  const wsProj = XLSX.utils.aoa_to_sheet([PROJ_HEADERS, ...data.projects]);
  styleSheet(wsProj, PROJ_HEADERS, PROJ_COLS, PROJ_NUM);
  XLSX.utils.book_append_sheet(wb, wsProj, 'Projets');

  const wsExp = XLSX.utils.aoa_to_sheet([EXP_HEADERS, ...data.expenses]);
  styleSheet(wsExp, EXP_HEADERS, EXP_COLS, EXP_NUM);
  XLSX.utils.book_append_sheet(wb, wsExp, 'Dépenses');

  XLSX.writeFile(wb, exportFileName(from, to));
}
