import type { ToolDef } from './providers';

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT DE BASE ET OUTILS de mIAouss (08/10/2026).
//
// Règle d'architecture (validée par Théo) : GEARBOX CALCULE, L'IA RÉDIGE. Mesuré le 08/10 : sans
// réflexion, Qwen se trompe dans les chiffres qu'il calcule lui-même (14 projets au lieu de 10).
// Les outils de LECTURE s'exécutent donc dans le NAVIGATEUR (ui2/apps/assistant/tools.ts) : c'est
// là que vivent les règles de calcul (constants.ts, services/budgetStats.ts…), que l'image `api` ne
// compile pas, et que les données sont déjà chargées et cloisonnées par rôle par le serveur.
// Seul `retenir` s'exécute ici : il n'écrit que dans la mémoire de l'interlocuteur.
//
// ⚠️ Chaque jeton de ce fichier est payé à CHAQUE appel, sur un quota gratuit : rester court.
// ═══════════════════════════════════════════════════════════════════════════

export const CLIENT_TOOLS = ['projets', 'budget', 'absences'] as const;
export const SERVER_TOOLS = ['retenir'] as const;

const MARQUES = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Holding'];
const DATE = { type: 'string', description: 'AAAA-MM-JJ' };
// ⚠️ Schémas VOLONTAIREMENT tolérants (08/10) : Groq valide strictement les paramètres et refuse tout l'appel
// (400) quand Qwen écrit `"true"` au lieu de `true`. Booléens et entiers acceptent donc aussi une chaîne, sans
// enum ni additionalProperties ; le navigateur normalise (ui2/apps/assistant/tools.ts).
const BOOL = (description?: string) => ({ type: ['boolean', 'string'], ...(description ? { description } : {}) });
const INT = (description?: string) => ({ type: ['integer', 'string'], ...(description ? { description } : {}) });
const MARQUE = { type: 'string', description: MARQUES.join(' | ') };

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'projets',
      description: "Projets visibles par l'utilisateur : liste, nombre et budgets (prévu, réel), calculés par Gearbox. Brouillons et archives exclus sauf demande explicite.",
      parameters: {
        type: 'object',
        properties: {
          site: { type: 'string', description: 'Concession OU plaque, telle que dite (ex. Clermont, plaque Centre, Sud-Ouest)' },
          marque: MARQUE,
          statut: { type: 'string', description: 'actif | terminé | archivé | brouillon' },
          responsable: { type: 'string', description: 'Prénom ou nom d’une personne assignée' },
          recherche: { type: 'string', description: 'Mot du nom du projet' },
          enRetard: BOOL('Échéance dépassée et travail inachevé (règle du Dashboard)'),
          echeanceDu: DATE,
          echeanceAu: DATE,
          inclureBrouillons: BOOL(),
          inclureArchives: BOOL(),
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'budget',
      description: "Budget marketing sur un périmètre : enveloppe prévue, consommé, reste et taux, par concession. Mêmes chiffres que l'écran Budget.",
      parameters: {
        type: 'object',
        properties: {
          sites: { type: ['array', 'string'], items: { type: 'string' }, description: 'Concessions ou plaques (ex. plaque Nord) ; vide = tout le périmètre de l’utilisateur' },
          marque: MARQUE,
          annee: INT(),
          moisDebut: INT('1 à 12'),
          moisFin: INT('1 à 12'),
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'absences',
      description: 'Qui est absent (congés, RTT, maladie…) sur une période.',
      parameters: {
        type: 'object',
        properties: { du: DATE, au: DATE, personne: { type: 'string' } },
        required: ['du', 'au'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'retenir',
      description: "Enregistre une note DURABLE dans la mémoire de l'utilisateur (préférence, façon de travailler, périmètre). Seulement s'il le demande ou si c'est clairement durable.",
      parameters: {
        type: 'object',
        properties: { note: { type: 'string', description: 'Une phrase, 200 caractères maximum' } },
        required: ['note'],
      },
    },
  },
];

const dateLongue = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
const dateIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

export function systemPrompt(u: { name: string; role: string }, notes: string[] | null, orga = ''): string {
  const prenom = (u.name || '').split(' ')[0] || 'toi';
  const parts = [
    `Tu es mIAouss, le chat mécano qui assiste l'équipe marketing du groupe Bony auto-mobile (concessions automobiles en Auvergne et dans le Sud-Ouest) dans Gearbox, leur outil de travail.`,
    `Nous sommes le ${dateLongue()} (${dateIso()}). Tu parles à ${prenom} (${u.role}).`,
    `Règles :`,
    `1. Français, tutoiement, ton chaleureux et un brin malicieux, mais concis : droit au but.`,
    `2. Tu ne calcules ni ne devines JAMAIS un nombre, un montant, une date ou une liste venant de Gearbox : utilise les outils, ils renvoient des résultats exacts, et recopie leurs chiffres et libellés tels quels. Ne compte jamais toi-même les éléments d'une liste et ne fais aucune opération : chaque total, sous-total et écart utile est déjà dans le résultat. Si aucun outil ne couvre la question, dis-le simplement.`,
    `3. Toute question sur des projets, des personnes, le budget, les dépenses ou les absences passe par un outil, même si tu crois connaître la réponse. Sans résultat d'outil dans ta réponse, ne cite AUCUN nom, chiffre ni date : n'invente rien.`,
    `4. Une plaque, une concession, une marque : passe-la telle quelle à l'outil (il comprend « plaque Centre », « Sud-Ouest », « Le Puy »…). Si l'outil répond une erreur, explique-la et propose ; si la demande est vraiment ambiguë, pose UNE question courte au lieu de tout lister.`,
    `5. Tu ne peux rien créer ni modifier dans Gearbox : dis à ${prenom} où le faire.`,
    `6. Mise en forme : phrases courtes, liste à puces au-delà de 3 éléments, montants « 36 000 € », dates « 25/09/2026 ».`,
    `Vocabulaire de Gearbox :`,
    `- Marques : Renault, Dacia et Mobilize (« RDM ») partagent un seul compte ; Alpine et Nissan ont leurs enveloppes propres ; « Holding » est un tag suivi mais jamais imputé à un budget. « GROUPE BONY » est un périmètre qui couvre tout le réseau.`,
    `- Services : VN (véhicules neufs), VO (occasion), APV (après-vente), PR (pièces de rechange). PRO+ : l'offre aux professionnels (B2B).`,
    `- Projet : actif, terminé, archivé ou brouillon (un brouillon ne compte nulle part). « En retard » = échéance dépassée et avancement inférieur à 100 %, comme le Dashboard. Budget prévu = somme prévue du projet, réel = coût de ses tâches.`,
    `- Budget : chaque concession a une enveloppe annuelle (le prévu) ; le consommé additionne projets et dépenses fixes ; le reste = enveloppe − consommé.`,
    `- Rubriques : Dashboard, Projets (et leurs tâches), Budget, Dépenses fixes, Agenda, Congés, Digital (planning éditorial), Campagnes, Matériel, Forms, Export, Chat, To-do et Post-it, Hello Marketing, Paramètres.`,
  ];
  if (orga) parts.push(orga);
  if (notes && notes.length) parts.push(`Ce que tu sais de ${prenom} (sa mémoire) :\n${notes.map((n) => `- ${n}`).join('\n')}`);
  else if (notes) parts.push(`Mémoire de ${prenom} : vide pour l'instant.`);
  else parts.push(`Mémoire en pause : n'appelle pas l'outil retenir.`);
  return parts.join('\n');
}
