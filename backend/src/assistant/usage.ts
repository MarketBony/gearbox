import { prisma } from '../db';
import { providerStatus, groqHeaders, type ProviderId } from './providers';

// ═══════════════════════════════════════════════════════════════════════════
// COMPTEUR, PLAFONDS ET CAPACITÉ de mIAouss (08/10/2026).
//
// Une « question » = le premier appel RÉUSSI d'un tour (kind 'question', ok). C'est elle que le
// plafond quotidien compte — effacer la discussion n'efface donc pas le compteur.
// Plafond : 25 questions par jour par défaut, Master sans limite ; le Master le règle pour
// chacun (décision de Théo, 08/10/2026). La journée court de minuit à minuit, heure de Paris.
//
// ⚠️ La capacité restante est une ESTIMATION : Groq ne publie pas son compteur de jetons du jour,
// on additionne ce qu'on lui a envoyé sur 24 h glissantes. Libellée comme telle à l'écran.
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_CAP = 25;
export const UNLIMITED = -1;

/** Quotas gratuits publiés (Groq : docs/rate-limits ; Cloudflare : platform/pricing), 08/10/2026. */
const GROQ_TOKENS_PER_DAY = 200_000;
const GROQ_REQUESTS_PER_DAY = 1_000;
const CF_NEURONS_PER_DAY = 10_000;
/** Neurones par jeton de Qwen3.8 27B chez Cloudflare (40 909 / 290 909 par million). */
const CF_IN = 40_909 / 1e6, CF_OUT = 290_909 / 1e6;

/** Minuit, heure de Paris, du jour de `d`, en instant UTC. */
export function parisMidnight(d = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);
  const asParis = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' })).getTime();
  const asUtc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - (asParis - asUtc));
}
const monthStartParis = () => { const m = parisMidnight(); const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(m); return parisMidnight(new Date(`${ymd.slice(0, 8)}01T12:00:00Z`)); };
const utcMidnight = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

/** Plafond effectif d'une personne. */
export const capOf = (role: string, dailyCap: number | null | undefined) =>
  dailyCap ?? (role === 'Master' ? UNLIMITED : DEFAULT_CAP);

export const questionsSince = (userId: string, since: Date) =>
  prisma.assistantUsage.count({ where: { userId, kind: 'question', ok: true, createdAt: { gte: since } } });

export async function record(userId: string, x: { provider: ProviderId; model: string; kind: 'question' | 'suite'; inTokens?: number; outTokens?: number; ms: number; ok: boolean; error?: string }) {
  try {
    await prisma.assistantUsage.create({ data: { userId, provider: x.provider, model: x.model, kind: x.kind, inTokens: x.inTokens ?? 0, outTokens: x.outTokens ?? 0, ms: x.ms, ok: x.ok, error: x.error?.slice(0, 300) ?? null } });
  } catch (e) {
    // Le compteur ne doit jamais faire échouer une réponse déjà obtenue.
    console.error('[assistant] compteur non enregistré :', (e as Error).message);
  }
}

/** Consommation d'une personne : questions du jour et du mois, jetons du jour. */
export async function personalUsage(userId: string) {
  const [today, month, tok] = await Promise.all([
    questionsSince(userId, parisMidnight()),
    questionsSince(userId, monthStartParis()),
    prisma.assistantUsage.aggregate({ where: { userId, createdAt: { gte: parisMidnight() } }, _sum: { inTokens: true, outTokens: true } }),
  ]);
  return { today, month, tokensToday: (tok._sum.inTokens || 0) + (tok._sum.outTokens || 0) };
}

/** Capacité restante de toute l'équipe, en questions (estimation). */
export async function capacity() {
  const day = new Date(Date.now() - 24 * 3600_000);
  const [groq, cf, questions, calls] = await Promise.all([
    prisma.assistantUsage.aggregate({ where: { provider: 'groq', createdAt: { gte: day } }, _sum: { inTokens: true, outTokens: true }, _count: true }),
    prisma.assistantUsage.aggregate({ where: { provider: 'cloudflare', ok: true, createdAt: { gte: utcMidnight() } }, _sum: { inTokens: true, outTokens: true } }),
    prisma.assistantUsage.count({ where: { kind: 'question', ok: true, createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } } }),
    prisma.assistantUsage.aggregate({ where: { ok: true, createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } }, _sum: { inTokens: true, outTokens: true }, _count: true }),
  ]);
  // Coût moyen d'une question sur 7 jours ; avant toute mesure, ~2 appels de 2 000 + 150 jetons.
  const q = Math.max(questions, 0);
  const avgIn = q ? (calls._sum.inTokens || 0) / q : 4_000;
  const avgOut = q ? (calls._sum.outTokens || 0) / q : 300;
  const avgCalls = q ? calls._count / q : 2;

  const status = providerStatus();
  const groqTok = (groq._sum.inTokens || 0) + (groq._sum.outTokens || 0);
  const groqReqLeft = groqHeaders.at && Date.now() - groqHeaders.at < 24 * 3600_000 ? groqHeaders.remainingRequests! : GROQ_REQUESTS_PER_DAY - groq._count;
  const groqLeft = Math.max(0, Math.floor(Math.min((GROQ_TOKENS_PER_DAY - groqTok) / (avgIn + avgOut), groqReqLeft / avgCalls)));
  const cfUsed = (cf._sum.inTokens || 0) * CF_IN + (cf._sum.outTokens || 0) * CF_OUT;
  const cfLeft = Math.max(0, Math.floor((CF_NEURONS_PER_DAY - cfUsed) / (avgIn * CF_IN + avgOut * CF_OUT)));

  const perProvider = status.map((s) => ({
    ...s,
    questionsLeft: !s.configured ? 0 : s.id === 'groq' ? groqLeft : cfLeft,
    // Fraction du quota du jour encore disponible (jauge).
    share: !s.configured ? 0 : s.id === 'groq' ? Math.max(0, 1 - groqTok / GROQ_TOKENS_PER_DAY) : Math.max(0, 1 - cfUsed / CF_NEURONS_PER_DAY),
  }));
  return {
    questionsLeft: perProvider.reduce((a, p) => a + (p.resting && p.reason === 'quota du jour épuisé' ? 0 : p.questionsLeft), 0),
    avgTokensPerQuestion: Math.round(avgIn + avgOut),
    measured: q > 0,
    providers: perProvider,
  };
}
