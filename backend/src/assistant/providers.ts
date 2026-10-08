// ═══════════════════════════════════════════════════════════════════════════
// FOURNISSEURS D'IA de mIAouss (08/10/2026) — PORTE UNIQUE vers les modèles.
//
// UN SEUL MODÈLE, Qwen3.8 27B, chez DEUX hébergeurs : Théo veut une IA « constante », jamais une
// qualité qui change selon qui répond (mesuré le 08/10 : réponses quasi identiques mot pour mot).
// Ordre : Groq (~1 s) → Cloudflare Workers AI (1 à 10 s). Les deux parlent le format OpenAI.
//
// ⚠️ Toujours SANS réflexion (`reasoning_effort: none` / `enable_thinking: false`) : Groq plafonne
// la SORTIE à 1 000 jetons/min (limite non documentée, mesurée), et une réponse réfléchie la dépasse
// à elle seule. C'est tenable parce que le modèle ne CALCULE rien : les chiffres viennent des outils.
//
// ⚠️ GRATUIT et le restera (décision de Théo) : aucun fournisseur payant ne s'ajoute ici.
//
// Variables (backend/.env et .env du VPS, listées dans docker-compose.yml) :
//   GROQ_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_TOKEN (jeton limité à Workers AI).
// Aucune clé ne sort de ce module : ni vers le navigateur, ni dans les logs.
// ═══════════════════════════════════════════════════════════════════════════

export type ProviderId = 'groq' | 'cloudflare';

export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export interface ToolDef { type: 'function'; function: { name: string; description: string; parameters: object } }

export interface LlmReply {
  provider: ProviderId;
  model: string;
  content: string;
  toolCalls: ToolCall[];
  inTokens: number;
  outTokens: number;
  ms: number;
}
/** Un essai raté, pour le compteur (les échecs comptent aussi : ils consomment parfois). */
export interface LlmFailure { provider: ProviderId; model: string; error: string; ms: number }

/** Tous les fournisseurs ont échoué ou sont au repos. */
export class AssistantUnavailable extends Error {
  constructor(public failures: LlmFailure[], public nextAt: number | null) { super('Aucun fournisseur disponible.'); }
}

interface Provider {
  id: ProviderId;
  name: string;
  model: string;
  timeoutMs: number;
  configured: () => boolean;
  url: () => string;
  key: () => string;
  extra: Record<string, unknown>;
}

const env = (k: string) => process.env[k]?.trim() || '';

const PROVIDERS: Provider[] = [
  {
    id: 'groq', name: 'Groq', model: 'qwen/qwen3.8-27b', timeoutMs: 20_000,
    configured: () => !!env('GROQ_API_KEY'),
    url: () => 'https://api.groq.com/openai/v1/chat/completions',
    key: () => env('GROQ_API_KEY'),
    extra: { reasoning_effort: 'none' },
  },
  {
    id: 'cloudflare', name: 'Cloudflare', model: '@cf/qwen/qwen3.8-27b', timeoutMs: 60_000,
    configured: () => !!(env('CLOUDFLARE_ACCOUNT_ID') && env('CLOUDFLARE_AI_TOKEN')),
    url: () => `https://api.cloudflare.com/client/v4/accounts/${env('CLOUDFLARE_ACCOUNT_ID')}/ai/v1/chat/completions`,
    key: () => env('CLOUDFLARE_AI_TOKEN'),
    extra: { chat_template_kwargs: { enable_thinking: false } },
  },
];

// ---------------------------------------------------------------- état « au repos »
// En mémoire, par process (un seul conteneur `api`, comme le cache des Jeux) : un redémarrage
// le perd, au pire on retente une fois un fournisseur épuisé. Évite de payer un aller-retour
// refusé à chaque question quand Groq a vidé son quota du jour.
const restUntil = new Map<ProviderId, { until: number; reason: string }>();
/** Dernières limites lues dans les en-têtes de Groq (capacité affichée dans Paramètres). */
export const groqHeaders: { remainingRequests?: number; limitRequests?: number; at?: number } = {};

const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };

const rest = (p: Provider, ms: number, reason: string) => restUntil.set(p.id, { until: Date.now() + ms, reason });

/** Statut public des fournisseurs (sans aucune clé). */
export const providerStatus = () => PROVIDERS.map((p) => {
  const r = restUntil.get(p.id);
  const resting = !!r && r.until > Date.now();
  return { id: p.id, name: p.name, model: p.model, configured: p.configured(), resting, until: resting ? r!.until : null, reason: resting ? r!.reason : null };
});

/** Lit le délai d'une réponse 429 (`retry-after` en secondes), avec un plancher. */
const retryAfterMs = (h: Headers, floor: number) => {
  const s = Number(h.get('retry-after'));
  return Number.isFinite(s) && s > 0 ? Math.max(s * 1000, floor) : floor;
};

async function callOne(p: Provider, messages: ChatMsg[], tools: ToolDef[] | null, maxTokens: number, toolChoice: 'auto' | 'required'): Promise<LlmReply> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), p.timeoutMs);
  try {
    const r = await fetch(p.url(), {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${p.key()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model, messages, temperature: 0.2, max_tokens: maxTokens,
        ...(tools && tools.length ? { tools, tool_choice: toolChoice } : {}),
        ...p.extra,
      }),
    });
    if (p.id === 'groq') {
      const rem = Number(r.headers.get('x-ratelimit-remaining-requests')), lim = Number(r.headers.get('x-ratelimit-limit-requests'));
      if (Number.isFinite(rem) && Number.isFinite(lim) && lim > 0) Object.assign(groqHeaders, { remainingRequests: rem, limitRequests: lim, at: Date.now() });
    }
    const text = await r.text();
    let j: any = null;
    try { j = JSON.parse(text); } catch { /* corps non JSON : traité plus bas */ }
    if (!r.ok) {
      const msg = String(j?.error?.message || j?.errors?.[0]?.message || text).slice(0, 300);
      if (r.status === 429 || r.status === 413) {
        // « Request too large » : ce message-là ne passera pas ici, mais le fournisseur n'est pas épuisé.
        if (/too large/i.test(msg)) throw new ProviderError(`trop long pour ${p.name}`, false);
        // Cloudflare : plafond quotidien de neurones → repos jusqu'à 00:00 UTC (2 h, heure de Paris).
        if (p.id === 'cloudflare' && /neuron|daily|free allocation/i.test(msg)) rest(p, nextUtcMidnight() - Date.now(), 'quota du jour épuisé');
        // Groq : quota de requêtes du JOUR épuisé, ou simple débit par minute.
        else if (/per day|RPD|TPD/i.test(msg)) rest(p, retryAfterMs(r.headers, 10 * 60_000), 'quota du jour épuisé');
        else rest(p, retryAfterMs(r.headers, 15_000), 'trop de demandes en même temps');
        throw new ProviderError(`${p.name} : quota (${r.status})`, true);
      }
      if (r.status >= 500) { rest(p, 30_000, 'service saturé'); throw new ProviderError(`${p.name} : ${r.status}`, true); }
      throw new ProviderError(`${p.name} : ${r.status} ${msg}`, false);
    }
    const m = j?.choices?.[0]?.message || {};
    return {
      provider: p.id, model: p.model,
      content: typeof m.content === 'string' ? m.content : '',
      toolCalls: Array.isArray(m.tool_calls) ? m.tool_calls.filter((c: any) => c?.function?.name) : [],
      inTokens: Number(j?.usage?.prompt_tokens) || 0,
      outTokens: Number(j?.usage?.completion_tokens) || 0,
      ms: Date.now() - t0,
    };
  } catch (e: any) {
    if (e instanceof ProviderError) throw e;
    if (e?.name === 'AbortError') { rest(p, 30_000, 'trop lent'); throw new ProviderError(`${p.name} : délai dépassé`, true); }
    rest(p, 30_000, 'injoignable');
    throw new ProviderError(`${p.name} : ${String(e?.message || e).slice(0, 120)}`, true);
  } finally {
    clearTimeout(timer);
  }
}

class ProviderError extends Error { constructor(message: string, public retryable: boolean) { super(message); } }

/**
 * Pose la question au premier fournisseur disponible, puis au suivant en cas d'échec.
 * `onFailure` reçoit chaque essai raté (le compteur les enregistre).
 */
export async function complete(
  messages: ChatMsg[], tools: ToolDef[] | null,
  opts: { maxTokens?: number; toolChoice?: 'auto' | 'required'; onFailure?: (f: LlmFailure) => void } = {},
): Promise<LlmReply> {
  const failures: LlmFailure[] = [];
  for (const p of PROVIDERS) {
    if (!p.configured()) continue;
    const r = restUntil.get(p.id);
    if (r && r.until > Date.now()) continue;
    const t0 = Date.now();
    try {
      return await callOne(p, messages, tools, opts.maxTokens ?? 700, opts.toolChoice ?? 'auto');
    } catch (e: any) {
      const f = { provider: p.id, model: p.model, error: String(e?.message || e), ms: Date.now() - t0 };
      failures.push(f);
      opts.onFailure?.(f);
    }
  }
  const nexts = [...restUntil.values()].map((x) => x.until).filter((t) => t > Date.now());
  throw new AssistantUnavailable(failures, nexts.length ? Math.min(...nexts) : null);
}

export const anyProviderConfigured = () => PROVIDERS.some((p) => p.configured());
