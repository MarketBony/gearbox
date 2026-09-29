// Moteur d'agrégation du Dashboard, extrait TEL QUEL de pages/Dashboard.tsx
// (ancien `useMemo` « AGGREGATION ENGINE »). Fonction pure : aucun état React,
// aucune lecture hors de `input`. Source unique des chiffres du Dashboard — les
// widgets de l'interface v2 doivent l'appeler plutôt que recalculer quoi que ce
// soit (cf. CLAUDE.md : une seule logique métier, jamais une seconde à côté).
import { Project, BudgetLine, BrandType, ServiceType, SocialPost, FixedExpense } from '../types';
import { isHoldingBrand, isDestinationInScope, resolveSiteAlias, splitShareToBuckets } from '../constants';
import { parseLocalDate } from '../components/DateRangePicker';

export interface DashboardStatsInput {
  projects: Project[];
  budgets: BudgetLine[];
  socialPosts: SocialPost[];
  fixedExpenses: FixedExpense[];
  /** Bornes de période, format 'YYYY-MM-DD' (parsées par `new Date(...)`). */
  dateStart: string;
  dateEnd: string;
  filterContexts: string[];
  filterBrands: BrandType[];
  filterServices: ServiceType[];
  filterProPlus: 'all' | 'pro' | 'standard';
}

export function computeDashboardStats(input: DashboardStatsInput) {
  const {
    projects, budgets, socialPosts, fixedExpenses,
    dateStart, dateEnd, filterContexts, filterBrands, filterServices, filterProPlus
  } = input;

  // 0. Init
  let totalForecast = 0;
  let totalActual = 0;
  // Engagé JUSQU'À AUJOURD'HUI, sous-ensemble de `totalActual`. Sert uniquement au
  // KPI de rythme : comparer un total de fin de période au temps écoulé à ce jour
  // est faux par construction (cf. le commentaire du bloc « Rythme » plus bas).
  // `totalActual` reste la seule valeur affichée en « Budget Consommé », pour
  // rester d'accord avec Budget.tsx.
  let totalEngageADate = 0;
  let activeProjectsCount = 0;
  let activeCampaignsCount = 0;
  
  // Arrays for charts
  const monthlyTrend = Array.from({length: 12}, (_, i) => ({ 
      month: new Date(0, i).toLocaleString('fr-FR', {month:'short'}), 
      prevu: 0, 
      reel: 0, 
      cumulReel: 0 
  }));

  // Specific structure for mix (VN/VO/APV/PR only)
  const serviceMix: Record<string, number> = { VN: 0, VO: 0, APV: 0, PR: 0 };

  // Minuit aujourd'hui, pour détecter les retards. Déclaré AVANT la boucle
  // projets (la section « prochaines échéances » plus bas a sa propre variable).
  const todayMidnightRef = new Date();
  todayMidnightRef.setHours(0, 0, 0, 0);

  // --- Accumulateurs des indicateurs de pilotage (ajoutés le 30/07/2026) ---
  // Tous alimentés depuis la boucle projets, donc soumis aux MÊMES filtres
  // (périmètre, marque, service, PRO+) et aux mêmes règles métier (Draft exclu,
  // Holding hors montants) que le budget consommé. Un indicateur qui ne
  // respecterait pas les filtres afficherait un chiffre incohérent avec le reste.
  const coutParCanal: Record<string, number> = {};
  const coutParSite: Record<string, number> = {};
  const coutParPrestataire: Record<string, { montant: number; taches: number }> = {};
  const chargeParUtilisateur: Record<string, number> = {};
  const ecartsProjets: { nom: string; prevu: number; realise: number; ecart: number }[] = [];
  const projetsEnRetard: { id: string; nom: string; site: string; fin: string; avancement: number }[] = [];
  let sommeAvancement = 0, nbActifsPourAvancement = 0;
  // Performance des campagnes : on cumule les NUMÉRATEURS pondérés par la
  // volumétrie, jamais des moyennes de taux — une moyenne simple de taux issus
  // d'envois de tailles différentes est fausse (piège classique).
  const perf = {
    SMS:     { volume: 0, ouvertures: 0, clics: 0, npai: 0, stop: 0, cout: 0, envois: 0 },
    'E-mail': { volume: 0, ouvertures: 0, clics: 0, npai: 0, stop: 0, cout: 0, envois: 0 }
  };
  
  // Parse filter dates
  const dStart = new Date(dateStart);
  const dEnd = new Date(dateEnd);

  // 1. Filter Logic Helpers
  //
  // ⚠️ UN SEUL test de périmètre, partagé avec Budget.tsx via `constants.ts`.
  // Il y en avait DEUX ici : `isBudgetLineInScope` (correcte, écrite au correctif 23
  // pour les enveloppes) et `isSiteInScope` (une simple égalité de nom, appliquée au
  // CONSOMMÉ). Or les projets et les dépenses passent par `splitShareToBuckets`, qui
  // rend des destinations comme `Alpine-Clermont` : l'égalité de nom ne matchait
  // jamais le périmètre « Clermont ». L'enveloppe Alpine était donc comptée au prévu
  // mais son consommé restait nul — « Reste à engager » faux, et désaccord avec la
  // page Budget. Signalé par Théo le 14/08/2026 sur les plaques ; le défaut valait
  // aussi pour un site seul.
  const isSiteInScope = (site: string) => isDestinationInScope(site, filterContexts);

  const isBrandInScope = (projectBrands: BrandType[]) => {
      if (filterBrands.length === 0) return true;
      return projectBrands.includes('Holding') || filterBrands.some(b => projectBrands.includes(b));
  };

  const isServiceInScope = (projectServices: string[]) => {
      if (filterServices.length === 0) return true;
      if (projectServices.includes('Tous Services')) return true;
      return filterServices.some(s => projectServices.includes(s));
  };

  // Filtre PRO+ (B2B) à 3 états — se combine avec les autres filtres. Fallback : absent = non-PRO+.
  const isProPlusInScope = (proPlus?: boolean) =>
      filterProPlus === 'all' || (filterProPlus === 'pro' ? !!proPlus : !proPlus);

  // 2. Process BUDGETS
  const chartYear = dStart.getFullYear();

  budgets.forEach(b => {
      if (!isSiteInScope(b.site)) return;
      // ⚠️ Le filtre de MARQUE manquait ici alors que le consommé l'appliquait :
      // avec MARQUE = Alpine, on comparait 120 295 € consommés à l'enveloppe du
      // GROUPE ENTIER (1 480 800 €). Trois chiffres faux d'un coup — le
      // pourcentage, le « Sur X € » et le Reste à engager, tous dérivés de
      // `totalForecast`. Signalé par Théo le 03/08/2026.
      if (!isBrandInScope(b.brands || [])) return;

      (['VN', 'VO', 'PR', 'APV'] as const).forEach(svc => {
          if (filterServices.length > 0 && !filterServices.includes(svc as ServiceType)) return;
          b.entries[svc].forEach((val, monthIdx) => {
              monthlyTrend[monthIdx].prevu += val;
              const checkDate = new Date(chartYear, monthIdx, 15);
              if (checkDate >= dStart && checkDate <= dEnd) {
                  totalForecast += val;
              }
          });
      });
  });

  // 3. Process PROJECTS (Actuals)
  projects.forEach(p => {
      // Brouillon : ne remonte NULLE PART. Budget.tsx l'excluait déjà (bloc 3),
      // le Dashboard non — un projet en brouillon portant un coût gonflait donc
      // le consommé, la trajectoire mensuelle, le mix activité et le compteur
      // « campagnes live », sans jamais apparaître dans Budget. Les deux écrans
      // se contredisaient. Corrigé le 30/07/2026.
      // Placé en tête : « projets actifs » et « prochaines échéances » ne testent
      // que status === 'Active', ils ne comptaient donc déjà pas les brouillons.
      if (p.status === 'Draft') return;

      if (!isProPlusInScope(p.proPlus)) return;

      // VENTILATION PAR SITE — corrigé le 30/07/2026, même cause que les dépenses
      // fixes (bloc 3bis). Avant, le test portait sur `p.site` brut : or pour un
      // projet MULTI-SITES ce champ contient le libellé concaténé
      // ("Clermont, Vichy, Moulins"), qui ne correspond à aucun site du filtre —
      // le projet disparaissait donc en totalité dès qu'un périmètre était
      // sélectionné, au lieu de contribuer sa part. Même source de parts que
      // Budget.tsx : budgetDistribution si multi-sites, sinon 100 % sur le site.
      const siteShares: Record<string, number> =
          (p.sites && p.sites.length > 0 && p.budgetDistribution)
              ? p.budgetDistribution
              : { [p.site as string]: 100 };

      // Parts retenues par le filtre de périmètre. Si aucune ne passe, le projet
      // est hors périmètre : il ne compte ni en montant, ni dans les compteurs.
      //
      // Chaque part est d'abord ÉCLATÉE en destinations pondérées (une seule le
      // plus souvent ; deux quand le curseur de répartition Alpine/Nissan scinde
      // un élément mixte), puis chaque destination est testée séparément. Le
      // périmètre porte sur la DESTINATION BUDGÉTAIRE, pas sur le site brut :
      // sans ça, « périmètre = Nissan » ne ramenait rien, puisque le site d'un
      // projet est toujours un site réel, jamais « Nissan ».
      const partsEnScope = Object.entries(siteShares).flatMap(([rawSite, pct]) => {
          if (pct <= 0) return [];
          return splitShareToBuckets(rawSite, p.brands, null, {
              alpineShare: p.alpineShare,
              nissanShare: p.nissanShare,
          })
              .filter(d => isSiteInScope(d.site))
              .map(d => ({ rawSite, pct: pct * d.ratio }));
      });
      if (partsEnScope.length === 0) return;

      const pBrands = p.brands || [];
      if (!isBrandInScope(pBrands)) return;

      const pServices = p.service || [];
      if (!isServiceInScope(pServices)) return;

      // Compteurs : UNE fois par projet, jamais dans la boucle de ventilation —
      // sinon un projet sur 3 sites serait compté 3 fois.
      if (p.status === 'Active') activeProjectsCount++;

      // --- Pilotage projets (indépendant du budget : le Holding est TRACKÉ) ---
      if (p.status === 'Active') {
          sommeAvancement += p.progress || 0;
          nbActifsPourAvancement++;
      }
      // En retard = échéance dépassée et travail inachevé. C'est l'indicateur qui
      // manquait le plus : un projet peut être « Actif » depuis des mois sans que
      // rien ne le signale.
      if (p.status !== 'Archived' && p.endDate && parseLocalDate(p.endDate) < todayMidnightRef && (p.progress || 0) < 100) {
          projetsEnRetard.push({ id: p.id, nom: p.name, site: p.site as string, fin: p.endDate, avancement: p.progress || 0 });
      }
      // Charge d'équipe : tâches encore ouvertes, par personne assignée.
      (p.tasks || []).forEach(t => {
          if ((t.status === 'Todo' || t.status === 'InProgress') && t.assignedUserId) {
              chargeParUtilisateur[t.assignedUserId] = (chargeParUtilisateur[t.assignedUserId] || 0) + 1;
          }
      });

      // Campagnes : on compte les TÂCHES SMS/e-mail programmées, pas les projets
      // qui en contiennent au moins une (le libellé annonçait des envois).
      activeCampaignsCount += p.tasks.filter(
          t => (t.channel === 'SMS' || t.channel === 'E-mail') && t.status === 'Programmed'
      ).length;

      // Tag Holding : tracké mais JAMAIS imputé à un budget (règle métier, cf.
      // CLAUDE.md). Placé ICI volontairement, APRÈS les compteurs « projets
      // actifs » et « campagnes live » : le Holding sort des montants, il ne
      // disparaît pas du suivi.
      if (isHoldingBrand(p.brands)) return;

      // Date de référence = date de DÉBUT du projet (cohérent avec l'agrégation Budget) :
      // le budget réalisé est compté sur le mois/année de startDate, pas de fin.
      const pDate = new Date(p.startDate);
      const coutTotal = p.budgetActual || 0;
      // Seules les parts dans le périmètre contribuent — sans filtre, elles
      // valent 100 % au total, donc le chiffre affiché est inchangé.
      const partEnScope = partsEnScope.reduce((s, { pct }) => s + pct, 0) / 100;
      const cost = coutTotal * partEnScope;

      if (pDate.getFullYear() === chartYear) {
          const monthIdx = pDate.getMonth();
          monthlyTrend[monthIdx].reel += cost;
      }

      if (pDate >= dStart && pDate <= dEnd) {
          totalActual += cost;
          // Un projet dont le budget est engagé à sa date de DÉBUT ne compte dans
          // l'engagé à date que si cette date est passée. `cost` est déjà la part
          // pondérée par le périmètre : on n'ajoute aucun routage ici.
          if (pDate <= todayMidnightRef) totalEngageADate += cost;

          // --- Analyse budgétaire : où part l'argent ---
          // Écart prévu / réalisé : seulement si un prévisionnel a été saisi,
          // sinon l'écart vaudrait -100 % et polluerait le classement.
          if ((p.budgetPlanned || 0) > 0) {
              ecartsProjets.push({
                  nom: p.name, prevu: p.budgetPlanned, realise: coutTotal,
                  ecart: coutTotal - p.budgetPlanned
              });
          }
          // Consommation par site, à partir des parts déjà filtrées. Ce graphe
          // raisonne en SITES RÉELS (et non en destinations budgétaires) : une
          // part Alpine reste affichée sur sa concession. Les alias passent par
          // `resolveSiteAlias`, qui était recopié en dur ici.
          partsEnScope.forEach(({ rawSite, pct }) => {
              const s = resolveSiteAlias(rawSite);
              coutParSite[s] = (coutParSite[s] || 0) + coutTotal * pct / 100;
          });
          // Détail par tâche : canal, prestataire, performance de campagne.
          // Les coûts de tâche sont pris au prorata de la part en périmètre, pour
          // rester cohérents avec le consommé affiché.
          (p.tasks || []).forEach(t => {
              const coutTache = (t.cost || 0) * partEnScope;
              if (t.channel) coutParCanal[t.channel] = (coutParCanal[t.channel] || 0) + coutTache;
              if (t.provider) {
                  const e = coutParPrestataire[t.provider] || { montant: 0, taches: 0 };
                  e.montant += coutTache; e.taches++;
                  coutParPrestataire[t.provider] = e;
              }
              const cible = perf[t.channel as 'SMS' | 'E-mail'];
              if (cible && (t.volumetry || 0) > 0) {
                  const v = t.volumetry as number;
                  cible.volume += v;
                  cible.envois++;
                  cible.cout += coutTache;
                  // Pondération par la volumétrie : on cumule des VOLUMES, pas des taux.
                  cible.ouvertures += v * (t.openRate || 0) / 100;
                  cible.clics     += v * (t.clickRate || 0) / 100;
                  cible.npai      += v * (t.npaiRate || 0) / 100;
                  cible.stop      += v * (t.stopRate || 0) / 100;
              }
          });

          const svcs = p.service || [];
          let servicesToHit: string[] = [];

          if (svcs.includes('Tous Services')) {
              servicesToHit = ['VN', 'VO', 'APV', 'PR'];
          } else {
              servicesToHit = svcs.filter(s => ['VN', 'VO', 'APV', 'PR'].includes(s));
          }

          if (servicesToHit.length > 0) {
              const splitAmount = cost / servicesToHit.length;
              servicesToHit.forEach(s => {
                  if (serviceMix[s] !== undefined) serviceMix[s] += splitAmount;
              });
          }
      }
  });

  // 3bis. Process FIXED EXPENSES (Actuals) — VENTILÉES PAR SITE.
  //
  // Correctif du 29 juillet 2026. Avant, ce bloc testait `isSiteInScope(e.site)`
  // sur le champ `site` brut. Or pour une dépense MULTI-SITES ce champ contient le
  // libellé concaténé ("Clermont, Ussel, Mozac, …"), qui ne correspond à aucun site
  // du filtre : la dépense était donc écartée en totalité dès qu'un périmètre était
  // sélectionné. Mesuré avant correctif : périmètre Clermont → consommé 0 € au
  // Dashboard, alors que Budget affichait 9 259 € pour ce même site.
  //
  // On ventile désormais par site avec la MÊME source de parts que Budget.tsx
  // (bloc 4) : budgetDistribution si la dépense est multi-sites, sinon 100 % sur le
  // site unique (repli legacy). Sans filtre, la somme des parts vaut 100 % → le
  // total affiché est inchangé.
  //
  // Choix assumés, différents de Budget.tsx :
  // - PAS de routage bucket Alpine/Nissan : Budget en a besoin pour placer le coût
  //   dans la bonne LIGNE de son tableau ; ici on ne fait qu'un total comparé au
  //   périmètre choisi, où le site réel est la bonne réponse — cohérent avec le
  //   traitement des projets juste au-dessus.
  // - pourcentages utilisés tels quels, sans renormalisation (comme Budget.tsx).
  fixedExpenses.forEach(e => {
      if (!isProPlusInScope(e.proPlus)) return;

      // Tag Holding : hors budget (voir bloc 3). Champ legacy `brand` inclus.
      if (isHoldingBrand(e.brands, e.brand)) return;

      const eBrands = e.brands || (e.brand ? [e.brand] : []);
      if (!isBrandInScope(eBrands)) return;

      if (!isServiceInScope([e.service])) return;

      const totalCost = e.amount || 0;
      if (totalCost === 0) return;

      const siteShares: Record<string, number> =
          (e.sites && e.sites.length > 0 && e.budgetDistribution)
              ? e.budgetDistribution
              : { [e.site as string]: 100 };

      const expDate = new Date(e.date);
      const expYear = expDate.getFullYear();

      let servicesToHit: string[] = [];
      if (e.service === 'Tous Services') {
          servicesToHit = ['VN', 'VO', 'APV', 'PR'];
      } else if (['VN', 'VO', 'APV', 'PR'].includes(e.service)) {
          servicesToHit = [e.service];
      }

      Object.entries(siteShares).forEach(([rawSite, sharePct]) => {
          if (sharePct <= 0) return;

          // Comme pour les projets : le périmètre s'applique aux destinations
          // budgétaires de la part (bucket Alpine/Nissan ou site réel), sinon un
          // périmètre Nissan ne ramène aucune dépense. Rien en aval ne dépend de
          // la destination elle-même — seule la FRACTION de la part qui tombe
          // dans le périmètre importe (< 1 quand le curseur de répartition
          // envoie le reste sur un site hors périmètre).
          const fractionEnScope = splitShareToBuckets(rawSite, e.brands, e.brand, {
              alpineShare: e.alpineShare,
              nissanShare: e.nissanShare,
          })
              .filter(d => isSiteInScope(d.site))
              .reduce((s, d) => s + d.ratio, 0);
          if (fractionEnScope <= 0) return;

          const cost = totalCost * (sharePct / 100) * fractionEnScope;

          // Dépense ANNUELLE : même principe que l'agrégation Budget.tsx — le mois de
          // expDate est ignoré, le montant contribue cost/12 sur chacun des 12 mois de
          // l'année civile de référence. Dépense mensuelle : tout sur le mois de expDate.
          const monthlyContributions = e.isAnnual
              ? Array.from({ length: 12 }, (_, m) => ({ monthIdx: m, mCost: cost / 12 }))
              : [{ monthIdx: expDate.getMonth(), mCost: cost }];

          monthlyContributions.forEach(({ monthIdx, mCost }) => {
              if (expYear === chartYear) {
                  monthlyTrend[monthIdx].reel += mCost;
              }

              // Fenêtre de période : la contribution mensuelle d'une annuelle est testée
              // au 15 du mois (même convention que la section budgets ci-dessus) ;
              // une mensuelle est testée sur sa date réelle, comme les projets.
              const checkDate = e.isAnnual ? new Date(expYear, monthIdx, 15) : expDate;
              if (checkDate >= dStart && checkDate <= dEnd) {
                  totalActual += mCost;
                  // Même borne que les projets. À noter : `checkDate` d'une dépense
                  // ANNUELLE est le 15 du mois (convention de ce bloc, conservée
                  // telle quelle) — la douzième du mois courant n'entre donc dans
                  // l'engagé à date qu'à partir du 15. C'est voulu, pas un décalage.
                  if (checkDate <= todayMidnightRef) totalEngageADate += mCost;
                  if (servicesToHit.length > 0) {
                      const splitAmount = mCost / servicesToHit.length;
                      servicesToHit.forEach(s => {
                          if (serviceMix[s] !== undefined) serviceMix[s] += splitAmount;
                      });
                  }
              }
          });
      });
  });

  let accReel = 0;
  monthlyTrend.forEach(m => {
      accReel += m.reel;
      m.cumulReel = Math.round(accReel);
      m.prevu = Math.round(m.prevu);
      m.reel = Math.round(m.reel);
  });

  const serviceChartData = Object.entries(serviceMix)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .filter(d => d.value > 0)
      .sort((a,b) => b.value - a.value);

  // --- Agrégation des indicateurs de pilotage ---
  const trier = (o: Record<string, number>, max: number) =>
      Object.entries(o).map(([name, value]) => ({ name, value: Math.round(value) }))
          .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, max);

  const budgetParCanal = trier(coutParCanal, 8);
  const topSites = trier(coutParSite, 5);
  const topPrestataires = Object.entries(coutParPrestataire)
      .map(([name, v]) => ({ name, value: Math.round(v.montant), taches: v.taches }))
      .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);

  const chargeEquipe = Object.entries(chargeParUtilisateur)
      .map(([userId, taches]) => ({ userId, taches })).sort((a, b) => b.taches - a.taches);

  const ecartsTop = ecartsProjets
      .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart)).slice(0, 6)
      .map(e => ({ ...e, ecartPct: e.prevu > 0 ? Math.round((e.ecart / e.prevu) * 100) : 0 }));

  const avancementMoyen = nbActifsPourAvancement > 0
      ? Math.round(sommeAvancement / nbActifsPourAvancement) : 0;

  // Taux pondérés : volume d'ouvertures / volume envoyé. Faire la moyenne des
  // taux donnerait un chiffre faux dès que les envois ont des tailles différentes.
  const tauxPondere = (num: number, vol: number) => vol > 0 ? +((num / vol) * 100).toFixed(1) : 0;
  const perfCanal = (['SMS', 'E-mail'] as const).map(canal => {
      const d = perf[canal];
      return {
          canal, envois: d.envois, volume: d.volume, cout: Math.round(d.cout),
          ouverture: tauxPondere(d.ouvertures, d.volume),
          clic: tauxPondere(d.clics, d.volume),
          npai: tauxPondere(d.npai, d.volume),
          stop: tauxPondere(d.stop, d.volume),
          // Coût par contact : l'indicateur d'efficience d'un envoi.
          coutParContact: d.volume > 0 ? +(d.cout / d.volume).toFixed(3) : 0
      };
  }).filter(d => d.volume > 0);

  const volumeTotal = perf.SMS.volume + perf['E-mail'].volume;
  const perfGlobale = {
      volume: volumeTotal,
      envois: perf.SMS.envois + perf['E-mail'].envois,
      ouverture: tauxPondere(perf.SMS.ouvertures + perf['E-mail'].ouvertures, volumeTotal),
      clic: tauxPondere(perf.SMS.clics + perf['E-mail'].clics, volumeTotal),
      npai: tauxPondere(perf.SMS.npai + perf['E-mail'].npai, volumeTotal),
      stop: tauxPondere(perf.SMS.stop + perf['E-mail'].stop, volumeTotal),
      cout: Math.round(perf.SMS.cout + perf['E-mail'].cout),
      coutParContact: volumeTotal > 0 ? +((perf.SMS.cout + perf['E-mail'].cout) / volumeTotal).toFixed(3) : 0
  };

  // Rythme de consommation : le pourcentage de budget engagé ne dit rien seul.
  // Comparé au pourcentage de la période écoulée, il devient une alerte.
  //
  // ⚠️ CORRIGÉ le 04/08/2026. La version d'origine comparait `totalActual` — cumulé
  // sur TOUTE la période filtrée, soit janvier→décembre par défaut, donc y compris
  // les dépenses datées du 01/11 et du 01/12 — au temps écoulé JUSQU'À AUJOURD'HUI.
  // C'est un total de fin d'année confronté à une horloge de mi-année : faux par
  // construction. La reprise des données réelles (le récurrent de toute l'année
  // étant saisi) l'a rendu visible — l'écart affichait +41 points en permanence —
  // mais la cause n'est PAS le caractère récurrent des dépenses : n'importe quel
  // budget saisi à l'avance produisait la même fausse alerte.
  //
  // Le KPI compare donc désormais deux grandeurs qui parlent du même instant :
  // l'engagé à date et la période écoulée. `pctEngagePeriode` reste calculé et
  // affiché, mais comme information distincte et non comme terme de la comparaison.
  const dureeTotale = dEnd.getTime() - dStart.getTime();
  const ecoule = Math.min(Math.max(Date.now() - dStart.getTime(), 0), dureeTotale);
  const pctTempsEcoule = dureeTotale > 0 ? Math.round((ecoule / dureeTotale) * 100) : 0;
  const pctEngageADate = totalForecast > 0 ? Math.round((totalEngageADate / totalForecast) * 100) : 0;
  const pctEngagePeriode = totalForecast > 0 ? Math.round((totalActual / totalForecast) * 100) : 0;

  // 6. Upcoming Deadlines (Projects) — uniquement aujourd'hui ou futur, par date de fin croissante.
  // Comparaison via parse local (anti J+1) ; recalculé à chaque rendu → les échéances passées disparaissent.
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const deadlines = projects
      .filter(p => p.status === 'Active' && isSiteInScope(p.site as string) && isProPlusInScope(p.proPlus)
          && p.endDate && parseLocalDate(p.endDate) >= todayMidnight)
      .sort((a,b) => parseLocalDate(a.endDate).getTime() - parseLocalDate(b.endDate).getTime())
      .slice(0, 10);

  // 7. Upcoming Social Posts
  // Filter: Future dates or today, not archived, not published yet
  const today = new Date();
  today.setHours(0,0,0,0);

  const upcomingPosts = socialPosts
      .filter(p => {
           // Scope Check for Social
           if (filterContexts.length > 0) {
               const pScope = p.concessions || [];
               const match = pScope.includes('GROUPE BONY') || filterContexts.some(ctx => pScope.includes(ctx));
               if (!match) return false;
           }
           // Brand check
           if (filterBrands.length > 0) {
               if (!p.brands.includes('Holding') && !filterBrands.some(b => p.brands.includes(b))) return false;
           }

           if (p.archived) return false;
           if (p.status === 'Publié' || p.status === 'Abandonné') return false;
           return new Date(p.date) >= today;
      })
      .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 10);

  return {
      totalForecast,
      totalActual,
      activeProjectsCount,
      activeCampaignsCount,
      monthlyTrend,
      serviceChartData,
      deadlines,
      upcomingPosts,
      // Indicateurs de pilotage
      projetsEnRetard: projetsEnRetard.sort((a, b) => a.fin.localeCompare(b.fin)),
      avancementMoyen,
      ecartsTop,
      budgetParCanal,
      topSites,
      topPrestataires,
      chargeEquipe,
      perfCanal,
      perfGlobale,
      pctTempsEcoule,
      pctEngageADate,
      pctEngagePeriode
  };
}

export type DashboardStats = ReturnType<typeof computeDashboardStats>;
