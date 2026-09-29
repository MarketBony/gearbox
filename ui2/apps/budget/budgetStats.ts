// =====================================================================
// ⚠️ À DÉPLACER DANS `services/budgetStats.ts` À L'INTÉGRATION (voir ./BESOINS.md).
//
// Moteur d'agrégation de la page Budget, extrait TEL QUEL de pages/Budget.tsx :
//  - `prepareBudgetLines` = le bloc « Migration silencieuse » de `loadData` (l.261-308),
//    SANS ses écritures en base (upsert des buckets manquants, purge du bucket générique
//    `Alpine`) : seule la fusion EN MÉMOIRE est reprise, puis le tri par nom de ligne ;
//  - `computeBudgetStats` = le `useMemo` « AGGREGATION ENGINE » (l.366-662), même ordre
//    d'opérations, mêmes tests, mêmes arrondis ;
//  - `groupProvisions` = l'en-tête de `renderProvisions` (l.670-698).
// Fonctions PURES : aucun état React, aucune lecture hors des arguments. Le routage passe
// exclusivement par constants.ts (`resolveBudgetLine`, `isDestinationInScope`,
// `splitShareToBuckets`, `isHoldingBrand`) — rien n'est réimplémenté ici.
// Une fois déplacé dans services/, pages/Budget.tsx doit l'appeler à son tour (comme
// Dashboard.tsx avec `computeDashboardStats`), sinon les deux copies divergeront.
// =====================================================================
import type { BudgetLine, BrandType, FixedExpense, Project, ServiceType } from '../../../types';
import {
  PLAQUES_STRUCTURE, ALPINE_BUCKETS, NISSAN_BUCKET, isHoldingBrand, resolveBudgetLine,
  isDestinationInScope, splitShareToBuckets,
} from '../../../constants';

export const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
export const SPECIFIC_ENTITIES = 'ENTITÉS SPÉCIFIQUES';
type Svc = 'VN' | 'VO' | 'PR' | 'APV';

/** `getPlaqueForSite` de Budget.tsx (l.357). */
export const getPlaqueForSite = (site: string): string => {
  for (const [plaque, sites] of Object.entries(PLAQUES_STRUCTURE)) {
    if ((sites as string[]).includes(site)) return plaque;
  }
  return SPECIFIC_ENTITIES;
};

/**
 * Lignes de budget telles que la page les AFFICHE et les AGRÈGE : fusion en mémoire des
 * buckets Alpine-* / Nissan manquants (montants à 0) et retrait du bucket générique `Alpine`,
 * puis tri par nom. `perimetreImpose` = `allowedSitesFor(user)` : pour un rôle CLOISONNÉ,
 * aucun bucket n'est recréé (le serveur les a exclus de son périmètre — CLAUDE.md).
 * Rend aussi `missing` / `generic` : ce que la page ÉCRIT en base au montage (éditeurs) —
 * voir BESOINS.md, cette écriture n'est pas reprise ici.
 */
export function prepareBudgetLines(input: BudgetLine[], perimetreImpose: string[] | null) {
  let budgetData = input;
  const allBuckets = perimetreImpose
    ? []
    : [...Object.values(ALPINE_BUCKETS), NISSAN_BUCKET];
  const missing = allBuckets.filter(bucket => !budgetData.some(b => b.site === bucket));
  const generic = budgetData.find(b => b.site === 'Alpine');
  const withoutGeneric = budgetData.filter(b => b.site !== 'Alpine');
  let newEntries: BudgetLine[] = [];
  if (missing.length > 0 || generic) {
    newEntries = missing.map(bucket => ({
      site: bucket,
      brands: [bucket === NISSAN_BUCKET ? 'Nissan' : 'Alpine'] as BrandType[],
      entries: {
        VN: new Array(12).fill(0),
        VO: new Array(12).fill(0),
        PR: new Array(12).fill(0),
        APV: new Array(12).fill(0),
      },
    })) as any;
    budgetData = [...withoutGeneric, ...newEntries];
  }
  // Tri par nom de ligne (Budget.tsx l.308) — copie : la liste reçue n'est pas mutée.
  const lines = [...budgetData].sort((a, b) => a.site.localeCompare(b.site));
  return { lines, missing: newEntries, generic: generic || null };
}

export interface BudgetStatsInput {
  budgets: BudgetLine[];
  projects: Project[];
  fixedExpenses: FixedExpense[];
  filterSites: string[];
  filterBrands: BrandType[];
  filterServices: ServiceType[];
  filterYear: number;
  filterMonthStart: number;
  filterMonthEnd: number;
  filterProPlus: 'all' | 'pro' | 'standard';
}

export interface BudgetMatrixRow {
  site: string;
  plaque: string;
  forecast: Record<string, number>;
  actual: Record<string, number>;
  totalForecast: number;
  totalActual: number;
  consumption: number;
}

export function computeBudgetStats(input: BudgetStatsInput) {
  const { budgets, projects, fixedExpenses, filterSites, filterBrands, filterServices, filterYear, filterMonthStart, filterMonthEnd, filterProPlus } = input;

  // 1. Initialize Structure
  const siteStats: Record<string, {
    forecast: Record<string, number>,
    actual: Record<string, number>,
    forecastMonthly: number[],
    actualMonthly: number[]
  }> = {};

  budgets.forEach(b => {
    siteStats[b.site] = {
      forecast: { VN: 0, VO: 0, PR: 0, APV: 0 },
      actual: { VN: 0, VO: 0, PR: 0, APV: 0 },
      forecastMonthly: new Array(12).fill(0),
      actualMonthly: new Array(12).fill(0)
    };
  });

  // Define which services to aggregate
  let servicesToProcess: Svc[];
  if (filterServices.length === 0) {
    servicesToProcess = ['VN', 'VO', 'PR', 'APV'];
  } else {
    servicesToProcess = filterServices.filter(s => ['VN', 'VO', 'PR', 'APV'].includes(s)) as Svc[];
    if (servicesToProcess.length === 0) servicesToProcess = ['VN', 'VO', 'PR', 'APV'];
  }

  // Filtre de MARQUE — un seul test pour projets et dépenses (Budget.tsx l.400).
  const isBrandInScope = (brands?: string[] | null, legacyBrand?: string | null) => {
    if (filterBrands.length === 0) return true;
    const all = [...(brands || []), ...(legacyBrand ? [legacyBrand] : [])];
    if (all.includes('Holding')) return true;     // tracké partout (règle métier)
    return filterBrands.some(fb => all.includes(fb));
  };

  // Marque portée par une LIGNE DE BUDGET. `null` = compte commun Renault/Dacia/Mobilize.
  const isBudgetLineBrandInScope = (site: string) => {
    if (filterBrands.length === 0) return true;
    const { marque } = resolveBudgetLine(site);
    if (marque) return filterBrands.includes(marque);
    return filterBrands.some(b => b === 'Renault' || b === 'Dacia' || b === 'Mobilize');
  };

  // 2. Process FORECASTS (Budgets)
  budgets.forEach(b => {
    const s = siteStats[b.site];
    if (!s) return;
    if (!isBudgetLineBrandInScope(b.site)) return;

    servicesToProcess.forEach(svc => {
      if (b.entries[svc]) {
        b.entries[svc].forEach((val, monthIdx) => {
          if (monthIdx >= filterMonthStart && monthIdx <= filterMonthEnd) {
            s.forecast[svc] += val;
            s.forecastMonthly[monthIdx] += val;
          }
        });
      }
    });
  });

  // 3. Process ACTUALS (Projects) — PRO+ à 3 états, absent = non-PRO+.
  const isProPlusInScope = (proPlus?: boolean) =>
    filterProPlus === 'all' || (filterProPlus === 'pro' ? !!proPlus : !proPlus);

  projects.forEach(p => {
    // Archivés comptés, brouillons exclus.
    if (p.status === 'Draft') return;
    if (!isProPlusInScope(p.proPlus)) return;

    // Holding : tracké, jamais imputé — sortie AVANT parts et routage.
    if (isHoldingBrand(p.brands)) return;

    let siteShares: Record<string, number> = {};
    if (p.sites && p.sites.length > 0 && p.budgetDistribution) {
      siteShares = p.budgetDistribution;
    } else {
      siteShares = { [p.site as string]: 100 };
    }

    Object.entries(siteShares).forEach(([rawSite, sharePct]) => {
      if (sharePct <= 0) return;

      const pBrands = p.brands || [];
      if (!isBrandInScope(pBrands)) return;

      // Compté sur sa date de DÉBUT (année et mois).
      const pDate = new Date(p.startDate);
      if (pDate.getFullYear() !== filterYear) return;

      const totalProjectCost = p.budgetActual || 0;
      if (totalProjectCost === 0) return;

      const siteCost = totalProjectCost * (sharePct / 100);
      const monthIdx = pDate.getMonth();
      if (monthIdx < filterMonthStart || monthIdx > filterMonthEnd) return;

      const services = p.service || [];
      let servicesToHit: string[] = [];
      if ((services as string[]).includes('Tous Services')) {
        servicesToHit = ['VN', 'VO', 'PR', 'APV'];
      } else {
        servicesToHit = (services as string[]).filter(s => ['VN', 'VO', 'PR', 'APV'].includes(s));
      }

      if (servicesToHit.length > 0) {
        splitShareToBuckets(rawSite, pBrands, null, {
          alpineShare: p.alpineShare,
          nissanShare: p.nissanShare,
        }).forEach(({ site: targetSite, ratio }) => {
          if (!siteStats[targetSite]) return;
          const costPerSvc = (siteCost * ratio) / servicesToHit.length;
          servicesToHit.forEach(svc => {
            if (servicesToProcess.includes(svc as any)) {
              if (siteStats[targetSite].actual[svc] !== undefined) {
                siteStats[targetSite].actual[svc] += costPerSvc;
              }
              siteStats[targetSite].actualMonthly[monthIdx] += costPerSvc;
            }
          });
        });
      }
    });
  });

  // 4. Process FIXED EXPENSES
  fixedExpenses.forEach(exp => {
    if (!isProPlusInScope(exp.proPlus)) return;
    if (isHoldingBrand(exp.brands, exp.brand)) return;
    if (!isBrandInScope(exp.brands, exp.brand)) return;

    let siteShares: Record<string, number> = {};
    if (exp.sites && exp.sites.length > 0 && exp.budgetDistribution) {
      siteShares = exp.budgetDistribution;
    } else {
      siteShares = { [exp.site as string]: 100 };
    }

    Object.entries(siteShares).forEach(([rawSite, sharePct]) => {
      if (sharePct <= 0) return;

      const expDate = new Date(exp.date);
      if (expDate.getFullYear() !== filterYear) return;

      const totalCost = exp.amount || 0;
      if (totalCost === 0) return;

      const siteCost = totalCost * (sharePct / 100);

      let servicesToHit: string[] = [];
      if (exp.service === 'Tous Services') {
        servicesToHit = ['VN', 'VO', 'PR', 'APV'];
      } else if (['VN', 'VO', 'PR', 'APV'].includes(exp.service)) {
        servicesToHit = [exp.service];
      }
      if (servicesToHit.length === 0) return;

      const destinations = splitShareToBuckets(rawSite, exp.brands, exp.brand, {
        alpineShare: exp.alpineShare,
        nissanShare: exp.nissanShare,
      });

      // Annuelle : étalée ÷ 12 sur l'année de `date` ; ponctuelle : le mois de `date`.
      const monthlyContributions = exp.isAnnual
        ? Array.from({ length: 12 }, (_, m) => ({ monthIdx: m, cost: siteCost / 12 }))
        : [{ monthIdx: expDate.getMonth(), cost: siteCost }];

      monthlyContributions.forEach(({ monthIdx, cost }) => {
        if (monthIdx < filterMonthStart || monthIdx > filterMonthEnd) return;
        destinations.forEach(({ site: targetSite, ratio }) => {
          if (!siteStats[targetSite]) return;
          const costPerSvc = (cost * ratio) / servicesToHit.length;
          servicesToHit.forEach(svc => {
            if (servicesToProcess.includes(svc as any)) {
              if (siteStats[targetSite].actual[svc] !== undefined) {
                siteStats[targetSite].actual[svc] += costPerSvc;
              }
              siteStats[targetSite].actualMonthly[monthIdx] += costPerSvc;
            }
          });
        });
      });
    });
  });

  // 5. Final Aggregation
  const finalForecastMonthly = new Array(12).fill(0);
  const finalActualMonthly = new Array(12).fill(0);
  const matrix: BudgetMatrixRow[] = [];
  let totalForecast = 0;
  let totalActual = 0;

  Object.entries(siteStats).forEach(([site, stats]) => {
    const plaque = getPlaqueForSite(site);
    // Périmètre : Alpine suit son site, Nissan n'entre que nommé (constants.ts).
    if (!isDestinationInScope(site, filterSites)) return;

    stats.forecastMonthly.forEach((v, i) => finalForecastMonthly[i] += v);
    stats.actualMonthly.forEach((v, i) => finalActualMonthly[i] += v);

    const siteTotalForecast = Object.values(stats.forecast).reduce((a, b) => a + b, 0);
    const siteTotalActual = Object.values(stats.actual).reduce((a, b) => a + b, 0);

    totalForecast += siteTotalForecast;
    totalActual += siteTotalActual;

    matrix.push({
      site,
      plaque,
      forecast: stats.forecast,
      actual: stats.actual,
      totalForecast: siteTotalForecast,
      totalActual: siteTotalActual,
      consumption: siteTotalForecast > 0 ? (siteTotalActual / siteTotalForecast) * 100 : 0
    });
  });

  const chartData = finalForecastMonthly.map((f, i) => ({
    name: MONTHS[i],
    Prevu: i >= filterMonthStart && i <= filterMonthEnd ? Math.round(f) : 0,
    Reel: i >= filterMonthStart && i <= filterMonthEnd ? Math.round(finalActualMonthly[i]) : 0,
    amt: Math.round(f)
  })).slice(filterMonthStart, filterMonthEnd + 1);

  return { chartData, matrix, totalForecast, totalActual };
}

/** Somme annuelle d'une ligne (tous services, 12 mois) — Budget.tsx l.671 / l.735. */
export const annualOf = (b: BudgetLine) => Object.values(b.entries).flat().reduce((s: number, v: number) => s + v, 0);

/**
 * Onglet Provisions : total groupe (TOUTES les lignes chargées, avant périmètre — comme la page),
 * puis lignes du périmètre groupées par plaque (ordre de PLAQUES_STRUCTURE, puis Entités spécifiques).
 */
export function groupProvisions(budgets: BudgetLine[], filterSites: string[]) {
  const totalAnnualGroup = budgets.reduce((acc, b) => acc + annualOf(b), 0);
  const displayBudgets = budgets.filter(b => isDestinationInScope(b.site, filterSites));
  const groupedBudgets: Record<string, BudgetLine[]> = {};
  Object.keys(PLAQUES_STRUCTURE).forEach(p => groupedBudgets[p] = []);
  groupedBudgets[SPECIFIC_ENTITIES] = [];
  displayBudgets.forEach(b => {
    const plaque = getPlaqueForSite(b.site);
    (groupedBudgets[plaque] || groupedBudgets[SPECIFIC_ENTITIES]).push(b);
  });
  return { totalAnnualGroup, displayBudgets, groups: Object.entries(groupedBudgets).filter(([, ls]) => ls.length > 0) };
}
