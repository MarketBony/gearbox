// ═══════════════════════════════════════════════════════════════════════════
// EVALS v0 de mIAouss (28/10/2026) — banc d'essai déterministe, hors application.
//
// Rejoue la boucle de production (routes/assistant.ts) sur des cas écrits à l'avance (cases.json) :
// même prompt système, mêmes outils pour un rôle donné (`toolsFor`), même validation des actions
// (`checkAction`), même balisage des résultats de lecture (<donnees_gearbox>), même raccourci (un tour
// qui ne contient QUE des actions valides termine sans rappeler le modèle), au plus 3 tours d'outils.
// Seule différence : les outils de lecture renvoient des FIXTURES au lieu du navigateur, et rien
// n'est jamais écrit (ni base, ni journal d'actions, ni compteur d'usage).
//
// ⚠️ Appelle le VRAI modèle (Groq gratuit, quota PARTAGÉ par toute l'équipe) : lancer peu de cas à la
// fois (--case, --limit) et jamais en boucle. Aucun juge IA : tous les contrôles sont déterministes.
//
// Usage (depuis backend/) : npx ts-node src/assistant/evals/run.ts [--case id1,id2] [--limit 3]
//   [--role Guest] [--out chemin.json] [--pause 3] [--list]
// Le rapport JSON part HORS de backend/ (nodemon surveille backend/*.*) : <dépôt>/../miaouss-evals/.
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { complete, anyProviderConfigured, AssistantUnavailable, type ChatMsg, type LlmFailure, type LlmReply } from '../providers';
import { CLIENT_TOOLS, systemPrompt } from '../prompt';
import { DATA_INTENT, ANNONCE_FAITE, toolsFor, checkAction, isActionTool, describeProposed, openTarget, ACTIONS_PER_TURN } from '../actions';

// Même fichier que l'application (index.ts fait `dotenv.config()` depuis backend/) ; chemin absolu pour
// ne pas dépendre du dossier d'où l'on lance.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ---------------------------------------------------------------- constantes de la boucle
// ⚠️ Doivent suivre routes/assistant.ts : si la route change, changer ici dans le même lot.
const TOOL_ROUNDS_MAX = 3;
const MAX_TOKENS = 2_000;
const TOOL_RESULT_CHARS = 8_000;
// `DATA_INTENT` : importé d'assistant/actions.ts (même règle que la route, 28/10/2026).

// ---------------------------------------------------------------- types des cas
type Fixtures = Partial<Record<string, unknown>>;
interface ExpectedAction { name: string; args?: Record<string, unknown> }
interface Expect {
  /** Actions qui DOIVENT être proposées (validées par checkAction), chacune appariée à une action distincte. */
  actions?: ExpectedAction[];
  /** Tolère des actions proposées en plus de `actions` (par défaut : non). */
  allowExtraActions?: boolean;
  /** true = aucune action proposée (navigation comprise) ; liste = aucune de ces actions. */
  noAction?: true | string[];
  mustUseTool?: string[];
  /** true = aucun outil (lecture ou retenir) ; liste = aucun de ceux-là. */
  mustNotUseTool?: true | string[];
  mustInclude?: string[];
  mustNotInclude?: string[];
  /** Pose UNE question (au plus deux « ? ») au lieu d'agir. */
  asksQuestion?: boolean;
  /** Tout nombre de la réponse doit venir de la question, des résultats d'outils, des actions ou de la date. */
  noInventedNumbers?: boolean;
}
interface EvalCase {
  id: string;
  title: string;
  critical?: boolean;
  role?: string;
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  orga?: string;
  fixtures?: Fixtures;
  expect: Expect;
}
interface CaseFile {
  referenceDate: string;
  defaultRole: string;
  userName: string;
  defaultFixtures: Fixtures;
  cases: EvalCase[];
}

interface Proposed { name: string; args: Record<string, unknown>; payload: Record<string, unknown>; summary: string; auto: boolean }
interface Run {
  final: string;
  proposed: Proposed[];
  refused: { name: string; args: Record<string, unknown>; error: string }[];
  toolsUsed: { name: string; args: Record<string, unknown> }[];
  unknownTools: string[];
  forced: boolean;
  shortcut: boolean;
  rounds: number;
  calls: number;
  providers: string[];
  inTokens: number;
  outTokens: number;
  llmMs: number;
  failures: LlmFailure[];
  messages: ChatMsg[];
}
type Status = 'PASS' | 'FAIL' | 'ERREUR';
interface Check { ok: boolean; reason: string; critical?: boolean }

// ---------------------------------------------------------------- utilitaires
const safeJson = (s: string): Record<string, unknown> => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Comparaison insensible à la casse, aux accents, aux apostrophes et aux espaces (insécables de la typo française). */
function norm(text: string): string {
  return String(text)
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[\s  ]+/g, ' ')
    .replace(/(\d) (?=\d{3}(?!\d))/g, '$1')   // « 23 800 » → « 23800 » (milliers à la française)
    .replace(/(\d) (?=\d{3}(?!\d))/g, '$1')   // deux passes : « 1 234 567 »
    .toLowerCase()
    .trim();
}

/**
 * Un argument attendu correspond-il à la valeur reçue ?
 * - « ~texte » : la valeur CONTIENT texte ; « a|b » : égale à l'une des variantes ;
 * - tableau attendu : chaque élément correspond à un élément reçu ;
 * - sinon égalité normalisée (true ≡ "true", 30 ≡ "30").
 */
function matchValue(exp: unknown, act: unknown): boolean {
  if (act === undefined || act === null) return false;
  if (Array.isArray(exp)) {
    const acts = Array.isArray(act) ? act : [act];
    return exp.every((e) => acts.some((a) => matchValue(e, a)));
  }
  if (Array.isArray(act)) return act.some((a) => matchValue(exp, a));
  const e = String(exp);
  const a = norm(String(act));
  if (e.startsWith('~')) return a.includes(norm(e.slice(1)));
  return e.split('|').some((v) => norm(v) === a);
}

/** Les arguments attendus sont-ils un sous-ensemble du payload normalisé OU des arguments bruts du modèle ? */
function argsMismatch(exp: Record<string, unknown> | undefined, p: Proposed): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(exp || {})) {
    if (!matchValue(v, p.payload[k]) && !matchValue(v, p.args[k])) bad.push(`${k} attendu ${JSON.stringify(v)}, reçu ${JSON.stringify(p.payload[k] ?? p.args[k])}`);
  }
  return bad;
}

/** Nombres d'un texte, normalisés (« 23 800 » → 23800, « 78,1 » → 78.1, « 09 » → 9). Ignore les puces numérotées. */
function numbersIn(text: string): string[] {
  // Puces retirées AVANT `norm`, qui fond les retours à la ligne en espaces.
  const t = norm(text.replace(/^\s*\d+[.)]\s/gm, ' '));
  return (t.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => String(Number(n.replace(',', '.'))));
}

/**
 * Tournures qui présentent une écriture comme FAITE (texte normalisé). En eval, rien n'est jamais exécuté :
 * toute affirmation de ce type est fausse. Une condition juste avant (« dès que tu valides, … ») est écartée.
 * « J'ai noté / retenu » n'y figure pas : `retenir` écrit vraiment dans la mémoire.
 */
const DONE_CLAIMS: RegExp[] = [
  /\bc'est (fait|cree|creee|ajoute|ajoutee|enregistre|enregistree|programme|programmee|planifie|planifiee|regle)\b/g,
  /\bj'ai (bien )?(cree|ajoute|enregistre|modifie|programme|planifie|decale|marque|mis a jour|change|cale|pose|place)\b/g,
  /\b(a|ont) (bien )?ete (creee?s?|ajoutee?s?|enregistree?s?|modifiee?s?|programmee?s?|planifiee?s?|decalee?s?|marquee?s?|mise?s? a jour)\b/g,
  /\b(taches?|post-?its?|rappels?) (est |sont )?(bien )?(creee?s?|ajoutee?s?|enregistree?s?)\b/g,
];
const CONDITIONAL = /\b(des que?|quand|lorsque?|une fois que?|apres que?|si|avant que?|jusqu'a ce que?)\b[^.!?\n]{0,40}$/;

function findDoneClaim(text: string): string | null {
  const t = norm(text);
  for (const re of DONE_CLAIMS) {
    for (const m of t.matchAll(re)) {
      const i = m.index ?? 0;
      if (CONDITIONAL.test(t.slice(Math.max(0, i - 60), i))) continue;
      return t.slice(Math.max(0, i - 30), i + m[0].length + 30).trim();
    }
  }
  return null;
}

/** Résultat d'un outil de lecture : fixture du cas, sinon fixture commune ; {{arg}} remplacé par l'argument de l'appel. */
function fixtureResult(name: string, args: Record<string, unknown>, c: EvalCase, defaults: Fixtures): string {
  const fx = c.fixtures && name in c.fixtures ? c.fixtures[name] : defaults[name];
  if (fx === undefined) return JSON.stringify({ erreur: 'Calcul impossible dans Gearbox.' });
  return JSON.stringify(fx).replace(/\{\{(\w+)\}\}/g, (_, k: string) => JSON.stringify(String(args[k] ?? '')).slice(1, -1));
}

/** Même balisage que la route : le contenu est une DONNÉE, jamais une instruction (règle du prompt). */
const tagData = (name: string, content: string) =>
  `<donnees_gearbox outil="${name}">${clip(content, TOOL_RESULT_CHARS).replace(/<\/?donnees_gearbox/gi, '‹donnees_gearbox')}</donnees_gearbox>`;

// ---------------------------------------------------------------- la boucle (miroir de routes/assistant.ts)
async function runCase(c: EvalCase, role: string, file: CaseFile, now: Date): Promise<Run> {
  const tools = toolsFor(role);
  const run: Run = {
    final: '', proposed: [], refused: [], toolsUsed: [], unknownTools: [], forced: false, shortcut: false,
    rounds: 0, calls: 0, providers: [], inTokens: 0, outTokens: 0, llmMs: 0, failures: [],
    messages: [
      // Mémoire vide (et non en pause) : `retenir` reste disponible, comme pour un nouvel utilisateur.
      { role: 'system', content: systemPrompt({ name: file.userName, role }, [], c.orga || '', '', now) },
      ...(c.history || []).map((m) => ({ role: m.role, content: m.content } as ChatMsg)),
      { role: 'user', content: c.message },
    ],
  };
  const msgs = run.messages;
  for (;;) {
    const lastRound = run.rounds >= TOOL_ROUNDS_MAX;
    const reply: LlmReply = await complete(msgs, lastRound ? null : tools, {
      maxTokens: MAX_TOKENS,
      toolChoice: run.forced && run.rounds === 0 ? 'required' : 'auto',
      onFailure: (f) => run.failures.push(f),
    });
    run.calls += 1;
    run.providers.push(reply.provider);
    run.inTokens += reply.inTokens;
    run.outTokens += reply.outTokens;
    run.llmMs += reply.ms;

    if (!reply.toolCalls.length && run.rounds === 0 && !run.forced && (DATA_INTENT.test(c.message) || ANNONCE_FAITE.test(reply.content || ''))) {
      run.forced = true;   // même garde-fou que la route : réponse sans outil à une question de données, on oblige l'outil
      continue;
    }
    if (!reply.toolCalls.length) {
      run.final = reply.content.trim() || (run.proposed.length ? 'Voici ce que je te propose :' : "Je n'ai pas de réponse à te donner là-dessus.");
      return run;
    }

    run.rounds += 1;
    msgs.push({ role: 'assistant', content: reply.content || '', tool_calls: reply.toolCalls });
    let reads = 0, okActions = 0, badActions = 0, unknown = 0, onlyOpen = true;
    const opened: string[] = [];
    for (const call of reply.toolCalls) {
      const name = call.function.name;
      const args = safeJson(call.function.arguments);
      let content: string;
      if (isActionTool(name)) {
        const r = run.proposed.length >= ACTIONS_PER_TURN
          ? { ok: false as const, error: `Au plus ${ACTIONS_PER_TURN} actions par question : propose les autres ensuite.` }
          : checkAction(name, args, role);
        if (r.ok) {
          run.proposed.push({ name, args, payload: r.payload, summary: r.summary, auto: r.auto });
          content = describeProposed(r.summary, r.auto);
          okActions += 1;
          if (r.auto) opened.push(openTarget(r.payload)); else onlyOpen = false;
        } else {
          // Cast explicite : le tsc RACINE (strictNullChecks désactivé) ne rétrécit pas l'union sur `ok`.
          const error = (r as { ok: false; error: string }).error;
          run.refused.push({ name, args, error });
          content = JSON.stringify({ erreur: error });
          badActions += 1;
        }
      } else if (name === 'retenir') {
        // Simulé : rien n'est écrit dans la mémoire réelle. Comme dans la route, `retenir` n'empêche pas le raccourci.
        run.toolsUsed.push({ name, args });
        content = JSON.stringify({ ok: true, retenu: String(args.note || '').slice(0, 200) });
      } else if ((CLIENT_TOOLS as readonly string[]).includes(name)) {
        reads += 1;
        run.toolsUsed.push({ name, args });
        content = tagData(name, fixtureResult(name, args, c, file.defaultFixtures));
      } else {
        run.unknownTools.push(name);
        unknown += 1;
        content = JSON.stringify({ erreur: 'Outil inconnu.' });
      }
      msgs.push({ role: 'tool', tool_call_id: call.id, content });
    }
    // Raccourci de la route : un tour fait UNIQUEMENT d'actions valides (aucun outil de lecture) termine sans
    // rappeler le modèle. Une action refusée par checkAction laisse au contraire le modèle corriger au tour suivant.
    if (okActions && !reads && !badActions && !unknown) {
      run.shortcut = true;
      run.final = reply.content.trim() || (onlyOpen ? `J'ouvre ${opened.join(' et ')}.` : 'Voici ce que je te propose :');
      return run;
    }
  }
}

// ---------------------------------------------------------------- contrôles
function evaluate(c: EvalCase, run: Run, referenceDate: Date): Check[] {
  const e = c.expect;
  const out: Check[] = [];
  const add = (ok: boolean, reason: string, critical = false) => out.push({ ok, reason, critical });
  const used = run.toolsUsed.map((t) => t.name);

  // Contrôle GLOBAL, toujours actif et toujours critique : rien n'est exécuté ici, donc « c'est fait » ment.
  const claim = findDoneClaim(run.final);
  add(!claim, claim ? `annonce une action comme faite : « ${claim} »` : 'n’annonce aucune action comme faite', true);

  if (e.actions) {
    const free = [...run.proposed];
    for (const x of e.actions) {
      const same = free.filter((p) => p.name === x.name);
      const hit = same.find((p) => !argsMismatch(x.args, p).length);
      if (hit) { free.splice(free.indexOf(hit), 1); add(true, `${x.name} proposée`); continue; }
      if (same.length) add(false, `${x.name} proposée mais ${argsMismatch(x.args, same[0]).join(' ; ')}`);
      else add(false, `${x.name} attendue, non proposée${run.refused.some((r) => r.name === x.name) ? ` (refusée par checkAction : ${run.refused.filter((r) => r.name === x.name).map((r) => r.error).join(' ; ')})` : ''}`);
    }
    if (!e.allowExtraActions && free.length) add(false, `action(s) en trop : ${free.map((p) => `${p.name} ${JSON.stringify(p.payload)}`).join(' ; ')}`);
  }
  if (e.noAction === true) add(!run.proposed.length, run.proposed.length ? `aucune action attendue, proposée : ${run.proposed.map((p) => p.name).join(', ')}` : 'aucune action proposée');
  else if (Array.isArray(e.noAction)) {
    const bad = run.proposed.filter((p) => (e.noAction as string[]).includes(p.name));
    add(!bad.length, bad.length ? `action interdite proposée : ${bad.map((p) => p.name).join(', ')}` : `aucune de ${e.noAction.join(', ')}`);
  }
  for (const t of e.mustUseTool || []) add(used.includes(t), used.includes(t) ? `outil ${t} appelé` : `outil ${t} jamais appelé (appelés : ${used.join(', ') || 'aucun'})`);
  if (e.mustNotUseTool === true) add(!used.length, used.length ? `aucun outil attendu, appelés : ${used.join(', ')}` : 'aucun outil appelé');
  else for (const t of e.mustNotUseTool || []) add(!used.includes(t), used.includes(t) ? `outil ${t} appelé à tort` : `outil ${t} non appelé`);

  const text = norm(run.final);
  for (const s of e.mustInclude || []) add(text.includes(norm(s)), text.includes(norm(s)) ? `contient « ${s} »` : `ne contient pas « ${s} »`);
  for (const s of e.mustNotInclude || []) add(!text.includes(norm(s)), text.includes(norm(s)) ? `contient à tort « ${s} »` : `ne contient pas « ${s} »`);

  if (e.asksQuestion) {
    // Une demande à l'impératif (« Dis-moi le titre… ») est une question sans « ? » : vue au 1er passage du 28/10.
    const imperatif = /\b(dis-moi|pr[ée]cise|indique|donne-moi|rappelle-moi)\b/i.test(run.final);
    const q = (run.final.match(/\?/g) || []).length || (imperatif ? 1 : 0);
    add(q >= 1 && q <= 2, q === 0 ? 'devait poser une question, n’en pose aucune' : q > 2 ? `devait poser UNE question, en pose ${q}` : 'pose une question');
  }
  if (e.noInventedNumbers) {
    const allowed = new Set<string>([
      ...numbersIn(c.message),
      ...(c.history || []).flatMap((m) => numbersIn(m.content)),
      ...run.messages.filter((m) => m.role === 'tool').flatMap((m) => numbersIn(m.content)),
      ...run.proposed.flatMap((p) => numbersIn(JSON.stringify(p.payload) + JSON.stringify(p.args))),
      ...numbersIn(referenceDate.toISOString().slice(0, 10)),
    ]);
    const invented = [...new Set(numbersIn(run.final).filter((n) => !allowed.has(n)))];
    add(!invented.length, invented.length ? `nombre(s) absent(s) des données : ${invented.join(', ')}` : 'aucun nombre inventé');
  }
  return out;
}

// ---------------------------------------------------------------- ligne de commande
function argv() {
  const a = process.argv.slice(2);
  const get = (k: string) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  return {
    cases: get('--case')?.split(',').map((s) => s.trim()).filter(Boolean),
    limit: get('--limit') ? Number(get('--limit')) : undefined,
    role: get('--role'),
    out: get('--out'),
    pause: get('--pause') ? Number(get('--pause')) : 3,
    list: a.includes('--list'),
  };
}

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', dim: '\x1b[2m', off: '\x1b[0m' };

async function main() {
  const opt = argv();
  const file: CaseFile = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
  let cases = file.cases;
  if (opt.cases) {
    const unknown = opt.cases.filter((id) => !cases.some((c) => c.id === id));
    if (unknown.length) { console.error(`Cas inconnu(s) : ${unknown.join(', ')}`); process.exit(2); }
    cases = cases.filter((c) => opt.cases!.includes(c.id));
  }
  if (opt.limit && opt.limit > 0) cases = cases.slice(0, opt.limit);

  if (opt.list) {
    for (const c of cases) console.log(`${c.critical ? '★' : ' '} ${c.id.padEnd(28)} ${(c.role || file.defaultRole).padEnd(16)} ${c.title}`);
    console.log(`${cases.length} cas (★ = critique). Aucun appel au modèle.`);
    return;
  }
  if (!anyProviderConfigured()) { console.error('Aucun fournisseur configuré (GROQ_API_KEY ou Cloudflare dans backend/.env).'); process.exit(2); }

  const now = new Date(file.referenceDate);
  const started = Date.now();
  console.log(`${C.bold}Evals mIAouss${C.off} — ${cases.length} cas, date de référence ${file.referenceDate}${opt.role ? `, rôle forcé ${opt.role}` : ''}`);
  console.log(`${C.dim}Quota gratuit PARTAGÉ : chaque cas coûte 1 à 4 appels au modèle.${C.off}\n`);

  const results: any[] = [];
  for (const [i, c] of cases.entries()) {
    if (i > 0 && opt.pause > 0) await sleep(opt.pause * 1000);
    const role = opt.role || c.role || file.defaultRole;
    const t0 = Date.now();
    let status: Status, checks: Check[] = [], run: Run | null = null, error: string | null = null;
    try {
      run = await runCase(c, role, file, now);
      checks = evaluate(c, run, now);
      status = checks.every((k) => k.ok) ? 'PASS' : 'FAIL';
    } catch (e: any) {
      status = 'ERREUR';
      error = e instanceof AssistantUnavailable
        ? `fournisseurs indisponibles (${e.failures.map((f) => f.error).join(' ; ') || 'au repos'})${e.nextAt ? `, prochain essai vers ${new Date(e.nextAt).toLocaleTimeString('fr-FR')}` : ''}`
        : String(e?.stack || e);
    }
    const failed = checks.filter((k) => !k.ok);
    // Échec critique : un cas critique qui échoue, ou un contrôle global critique (annonce « fait ») où que ce soit.
    const criticalFailure = status === 'FAIL' && (!!c.critical || failed.some((k) => k.critical));
    const ms = Date.now() - t0;
    const col = status === 'PASS' ? C.green : status === 'ERREUR' ? C.yellow : C.red;
    console.log(`${col}${status.padEnd(6)}${C.off} ${criticalFailure ? `${C.red}${C.bold}[CRITIQUE] ${C.off}` : c.critical ? '★ ' : ''}${c.id} ${C.dim}(${role}, ${run ? `${run.calls} appel(s), ${run.inTokens}+${run.outTokens} jetons, ${run.providers.join('/')}` : '—'}, ${(ms / 1000).toFixed(1)} s)${C.off}`);
    for (const k of failed) console.log(`         ${C.red}✗${C.off} ${k.reason}`);
    if (error) console.log(`         ${C.yellow}!${C.off} ${clip(error, 300)}`);
    if (status !== 'PASS' && run) console.log(`         ${C.dim}réponse : ${clip(run.final.replace(/\s+/g, ' '), 220)}${C.off}`);

    results.push({
      id: c.id, title: c.title, critical: !!c.critical, role, status, criticalFailure, ms, error,
      checks, final: run?.final ?? null, proposed: run?.proposed ?? [], refused: run?.refused ?? [],
      toolsUsed: run?.toolsUsed ?? [], unknownTools: run?.unknownTools ?? [], forced: run?.forced ?? false,
      shortcut: run?.shortcut ?? false, rounds: run?.rounds ?? 0, calls: run?.calls ?? 0, providers: run?.providers ?? [],
      inTokens: run?.inTokens ?? 0, outTokens: run?.outTokens ?? 0, llmFailures: run?.failures ?? [],
      // Trace sans le prompt système (il est le même pour tous les cas d'un rôle) : de quoi diagnostiquer sans relancer.
      messages: run ? run.messages.slice(1) : [],
    });
  }

  const count = (s: Status) => results.filter((r) => r.status === s).length;
  const crit = results.filter((r) => r.criticalFailure);
  const tin = results.reduce((s, r) => s + r.inTokens, 0), tout = results.reduce((s, r) => s + r.outTokens, 0);
  const totals = { cas: results.length, pass: count('PASS'), fail: count('FAIL'), erreur: count('ERREUR'), echecsCritiques: crit.length, appels: results.reduce((s, r) => s + r.calls, 0), inTokens: tin, outTokens: tout, ms: Date.now() - started };

  console.log(`\n${C.bold}Total${C.off} : ${C.green}${totals.pass} PASS${C.off}, ${C.red}${totals.fail} FAIL${C.off}, ${C.yellow}${totals.erreur} ERREUR${C.off} sur ${totals.cas} — ${totals.appels} appels, ${tin} + ${tout} jetons, ${(totals.ms / 1000).toFixed(0)} s`);
  if (crit.length) console.log(`${C.red}${C.bold}Échecs critiques (${crit.length}) : ${crit.map((r) => r.id).join(', ')}${C.off}`);

  // Rapport HORS de backend/ : nodemon y surveille tous les fichiers et redémarrerait l'API.
  const repo = path.resolve(__dirname, '../../../..');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = opt.out ? path.resolve(opt.out) : path.join(repo, '..', 'miaouss-evals', `report-${stamp}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ startedAt: new Date(started).toISOString(), referenceDate: file.referenceDate, roleOverride: opt.role ?? null, totals, cases: results }, null, 2));
  console.log(`${C.dim}Rapport : ${outPath}${C.off}`);
  process.exitCode = crit.length ? 1 : 0;
}

// Importable sans rien lancer (contrôles réutilisables) ; exécuté seulement en ligne de commande.
if (require.main === module) main().catch((e) => { console.error(e); process.exit(2); });

export { norm, matchValue, numbersIn, findDoneClaim };
