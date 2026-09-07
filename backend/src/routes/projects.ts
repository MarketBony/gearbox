import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { withDates } from '../utils/dates';
import { scopeOf, arrayScopeWhere, redactSiteFields } from '../auth/siteScope';
import { prisma } from '../db';

const router = Router();

// Rôles autorisés à éditer les projets.
// ⚠️ 'Digital Manager' AVEC l'espace — c'est la valeur réelle en base (le rôle écrit
// 'DigitalManager' ne matche jamais, piège déjà rencontré dans tags.ts et social.ts).
// Ajouté le 05/08/2026 à la demande de Théo : le Digital Manager éditait déjà les
// dépenses fixes, les tags et le Digital, mais pas les projets.
// Doit rester aligné sur `canEdit` de `pages/Projects.tsx` — sinon l'interface affiche
// des boutons que l'API refuse en 403.
const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager'];

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  // Cloisonnement par concession : `scopeOf` rend `null` pour tous les rôles
  // historiques (aucune restriction), et la liste des sites autorisés pour un chef
  // de site. ⚠️ Le filtre est appliqué ICI, côté serveur : le faire côté client
  // laisserait les autres concessions lisibles dans l'onglet Réseau.
  // L'Agenda se sert de cette même route, il est donc cloisonné du même coup.
  const scope = await scopeOf(req);
  const projects = await prisma.project.findMany({
    where: arrayScopeWhere('sites', scope),
    include: { tasks: true },
  });
  // ⚠️ Filtrer les lignes ne suffit pas : un projet multi-sites qui inclut le sien
  // nommait les AUTRES concessions et leurs pourcentages. Voir redactSiteFields.
  res.json(projects.map(p => redactSiteFields(p, scope)));
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { tasks, ...projectData } = req.body;
  const project = await prisma.project.create({
    data: {
      ...withDates(projectData, ['startDate', 'endDate']),
      tasks: {
        create: tasks
      }
    },
    include: { tasks: true }
  });
  emitEvent('projects:updated', project);
  res.json(project);
});

// Champs de tâche modifiables (aligné sur le modèle Task) — liste blanche pour
// que le diff ne crashe pas si le frontend renvoie des objets issus d'un GET
// (createdAt/updatedAt/projectId ne sont pas des données d'entrée).
// ⚠️ `deadline` ajouté le 26/08/2026 : le champ existait déjà en base (créé au
// correctif 35 pour les tâches AUTONOMES) mais il manquait à cette liste blanche, donc
// `pickTaskData` le jetait silencieusement. Une échéance saisie dans un projet partait
// bien au serveur et disparaissait au rechargement suivant, SANS erreur. C'est la seule
// porte d'écriture des tâches de projet : le POST reçoit toujours `tasks: []` (un projet
// est créé sans tâche), tout passe donc par le diff du PUT ci-dessous.
// ⚠️ `startDate` et `notes` ajoutés le 27/08/2026 (mode Expert) — MÊME PIÈGE que
// `deadline` la veille : les oublier ici aurait fait accepter la saisie, répondre 200,
// et perdre la valeur au rechargement suivant, sans erreur nulle part.
const TASK_FIELDS = [
  'name', 'provider', 'channel', 'cost', 'status', 'assignedUserId', 'deadline',
  'startDate', 'notes',
  'volumetry', 'openRate', 'npaiRate', 'stopRate', 'clickRate', 'codTxt', 'billedAmount'
] as const;

const pickTaskData = (t: any) => {
  const data: any = {};
  for (const f of TASK_FIELDS) {
    if (t[f] !== undefined) data[f] = t[f];
  }
  // Les champs texte NULLABLES doivent valoir NULL en base, pas ''. Un DatePicker vidé
  // ou une note effacée renvoient une chaîne vide — on normalise ICI plutôt que dans
  // l'écran, pour que n'importe quel appelant de cette route soit couvert.
  // ⚠️ Ne pas confondre avec `undefined`, qui signifie « champ absent du body, donc
  // non modifié » et ne doit surtout pas devenir un effacement.
  // ⚠️ `assignedUserId` ajouté le 07/09/2026 (correctif 48) : désassigner une tâche
  // envoyait `undefined` depuis l'écran, donc un champ ABSENT du corps, donc « non
  // modifié » — la désassignation ne partait jamais et le serveur répondait 200.
  // L'écran est corrigé (il envoie `null`), mais la normalisation est ici pour couvrir
  // n'importe quel appelant, comme pour les trois champs ci-dessus.
  for (const f of ['deadline', 'startDate', 'notes', 'assignedUserId'] as const) {
    if (data[f] === '') data[f] = null;
  }
  return data;
};

/**
 * Traduit une erreur Prisma en statut HTTP.
 *
 * ⚠️ Remplace le `catch` qui rendait « 404 Projet introuvable » pour DOUZE causes
 * distinctes — dont la saturation de la base, une contrainte violée et un champ refusé
 * par Prisma. Côté écran le symptôme était toujours le même (« serveur injoignable ? »),
 * donc jamais actionnable : c'est ce qui a laissé un problème de CONCURRENCE passer pour
 * une panne réseau pendant des mois. Mesuré le 07/09/2026 : les 48 échecs de la semaine
 * étaient tous des dépassements de budget de transaction, et tous rendus en 404.
 *
 * ⚠️ La TRACE ne bouge pas. Le `console.error` de l'appelant reste, et gagne le code
 * Prisma — c'est la seule source exploitable par
 * `docker compose logs api | grep "PUT échoué"`, et c'est elle qui a permis ce
 * diagnostic.
 *
 * ⚠️ On ne renvoie JAMAIS `e.message` au client : il contient le SQL, les noms de
 * colonnes et parfois des valeurs. Le message sort d'un ENSEMBLE FIXE de chaînes
 * françaises. Même posture que `middleware/errorHandler.ts`, qui n'expose `detail` que
 * hors production.
 *
 * ⚠️ Mappage PAR CODE, avec REPLI SUR LE MESSAGE : selon la version du moteur, « Unable
 * to start a transaction in the given time » remonte tantôt avec le code P2028, tantôt
 * sans code du tout (observé en production). Sans ce repli, une montée de version ferait
 * silencieusement retomber une saturation dans le 500 générique — et on repartirait à
 * zéro sur le même diagnostic.
 */
export const statutPrisma = (e: any): { statut: number; message: string } => {
  const code: string | undefined = e?.code;
  const msg: string = typeof e?.message === 'string' ? e.message : '';

  if (code === 'P2025') return { statut: 404, message: 'Projet introuvable.' };
  if (code === 'P2002') return { statut: 409, message: 'Conflit : une valeur unique existe déjà.' };
  if (code === 'P2003') return { statut: 409, message: 'Référence invalide (élément lié inexistant).' };

  // Saturation / conflit d'écriture : réessayable, donc 503 et non 500.
  if (code === 'P2028' || code === 'P2024' || code === 'P2034'
      || /already closed|Unable to start a transaction|connection pool|Timed out fetching|write conflict|deadlock/i.test(msg)) {
    return { statut: 503, message: 'Base momentanément saturée. Réessayez dans quelques secondes.' };
  }

  if (e instanceof Prisma.PrismaClientValidationError) {
    return { statut: 400, message: 'Données de projet invalides.' };
  }
  return { statut: 500, message: 'Erreur interne du serveur.' };
};

/** Réponse d'échec homogène : trace complète côté serveur, message borné côté client. */
const repondreErreurPrisma = (res: any, contexte: string, id: string, e: any) => {
  const { statut, message } = statutPrisma(e);
  console.error(`[projects] ${contexte} échoué sur`, id, `: [${e?.code ?? 'sans-code'} -> ${statut}]`, (e as Error)?.message);
  // Un 503 est transitoire : on le dit explicitement à tout client qui n'est pas notre
  // frontend (la file de sauvegarde côté écran, elle, rejoue déjà d'elle-même).
  if (statut === 503) res.setHeader('Retry-After', '2');
  return res.status(statut).json({ error: message });
};

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  // ⚠️ `id`, `createdAt` et `updatedAt` ne sont PAS des données d'entrée. Le frontend
  // renvoie le projet tel qu'il l'a lu au GET, `updatedAt` compris — et Prisma respecte
  // une valeur EXPLICITE plutôt que son `@updatedAt`. Mesuré le 07/09/2026 dans le SQL
  // généré : `UPDATE "Project" SET "id" = $1, ... "createdAt" = $21, "updatedAt" = $22`.
  // `Project.updatedAt` restait donc figé sur la valeur du dernier GET. Sans conséquence
  // visible aujourd'hui (personne ne le lit), mais c'est exactement le champ sur lequel
  // on bâtira un jour un « modifié le », et il aurait menti.
  // ⚠️ Le POST, lui, GARDE `id` : le frontend génère les identifiants de projet.
  // Même doctrine que `stripMeta` dans services/dataService.ts, appliquée ici pour
  // couvrir tout appelant plutôt que le seul écran.
  const { tasks, id: _metaId, createdAt: _metaCreatedAt, updatedAt: _metaUpdatedAt,
          ...projectData } = req.body;

  // Diff des tâches (et non purge/recréation, qui perdait les IDs à chaque
  // sauvegarde) — le tout dans une transaction pour éviter un état incohérent :
  // - id reçu connu en base pour ce projet  -> update en place (id conservé)
  // - pas d'id, ou id inconnu               -> create (id client conservé s'il est fourni)
  // - tâche en base absente du body         -> delete (retirée côté frontend)
  // ⚠️ La transaction est ENTIÈREMENT dans le try : un id inexistant faisait remonter
  // l'erreur Prisma au middleware global, qui répondait 500 alors que `budget.ts` et
  // `fixedExpenses.ts` répondent 404 dans le même cas. Incohérence de traitement
  // d'erreur entre routes, sans impact utilisateur (l'interface n'envoie jamais d'id
  // inconnu) mais corrigée pour aligner les trois routes.
  // ⚠️ COUT DE CETTE TRANSACTION — mesure, pas estime. Avant le correctif 48 elle
  // emettait UN `task.update` PAR TACHE, quel que soit le champ modifie : ~30 requetes
  // sequentielles pour un projet de 24 taches. Une transaction interactive EPINGLE une
  // connexion serveur du pooler pgBouncer pendant toute sa duree ; a 22 ms d'aller-retour
  // mesures entre le VPS et le pooler, cela faisait ~0,7 s d'epinglage par sauvegarde —
  // et l'ecran en lancait une PAR FRAPPE. En production : 48 echecs en 4 jours, tous sur
  // le meme projet, en depassement de `timeout` ou de `maxWait`.
  // On n'ecrit donc plus que les lignes REELLEMENT modifiees : 4 requetes au lieu de 30
  // pour le cas courant (un champ d'une tache).
  const appliquer = async () => prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: withDates(projectData, ['startDate', 'endDate'])
      });

      // ⚠️ Lecture des taches EN ENTIER (et non plus `select: { id: true }`) : c'est ce
      // qui permet de comparer champ par champ. Les colonnes de plus a lire ne coutent
      // rien — elles suppriment jusqu'a 23 ecritures inutiles.
      const existing = await tx.task.findMany({ where: { projectId: id } });
      const parId = new Map(existing.map(t => [t.id, t]));
      const incoming: any[] = Array.isArray(tasks) ? tasks : [];
      const keptIds = new Set<string>();
      const aCreer: any[] = [];

      for (const t of incoming) {
        const ancienne = typeof t?.id === 'string' ? parId.get(t.id) : undefined;
        if (!ancienne) {
          aCreer.push({
            ...pickTaskData(t),
            projectId: id,
            // id client conserve si fourni (le frontend genere ses propres ids) —
            // sinon uuid genere par la base.
            ...(typeof t?.id === 'string' && t.id.length > 0 ? { id: t.id } : {})
          });
          continue;
        }
        keptIds.add(ancienne.id);

        const donnees = pickTaskData(t);
        // ⚠️ COMPARAISON APRES `pickTaskData`, jamais avant : c'est elle qui normalise
        // '' -> null pour deadline/startDate/notes/assignedUserId. Comparer avant ferait
        // paraitre une chaine vide DIFFERENTE d'un null en base, et la ligne serait
        // reecrite a chaque PUT — le gain disparaitrait en silence.
        // ⚠️ Un champ ABSENT du corps est absent de `donnees` : il n'entre pas dans la
        // comparaison et ne compte jamais comme une difference. Meme semantique
        // qu'`undefined` = << non modifie >> dans pickTaskData.
        // ⚠️ Tous les TASK_FIELDS sont SCALAIRES (aucun tableau, aucun Json), donc `!==`
        // suffit. Le jour ou on en ajoute un qui ne l'est pas, cette comparaison devient
        // FAUSSE en silence et la valeur cessera d'etre enregistree — meme classe de
        // piege que la liste blanche elle-meme.
        const aChange = Object.keys(donnees).some(k => (donnees as any)[k] !== (ancienne as any)[k]);
        if (aChange) {
          await tx.task.update({ where: { id: ancienne.id }, data: donnees });
        }
      }

      // `createMany` : un seul aller-retour au lieu d'un par tache creee.
      if (aCreer.length > 0) await tx.task.createMany({ data: aCreer });

      const toDelete = [...parId.keys()].filter(tid => !keptIds.has(tid));
      if (toDelete.length > 0) {
        await tx.task.deleteMany({ where: { id: { in: toDelete } } });
      }
    }, {
      // ⚠️ Valeurs EXPLICITES : les defauts de Prisma (maxWait 2 000, timeout 5 000)
      // etaient tacites, et c'est le `maxWait` qui a produit 20 des 48 echecs mesures.
      // Une transaction ramenee a 4 aller-retours fait ~100 ms de travail reel : si elle
      // depasse, c'est qu'elle ATTEND une connexion — et pour une sauvegarde declenchee
      // par un humain, attendre 8 s vaut mieux qu'echouer en 2 s. Le `timeout` reste
      // borne : une transaction bloquee epingle une connexion du pooler, l'allonger sans
      // limite deplacerait le probleme au lieu de le regler.
      maxWait: 8000,
      timeout: 15000,
    });

  try {
    await appliquer();
  } catch (e) {
    // ⚠️ UNE seule reprise, et uniquement sur la SATURATION. Le PUT est IDEMPOTENT — il
    // applique un instantane complet et converge vers le meme etat — donc rejouable sans
    // risque de doublon. Elle transforme la majorite des saturations passageres en 200 au
    // lieu d'une alerte a l'ecran. Ce n'est PAS le correctif : c'est la phase 1 (fin du
    // PUT par frappe) qui divise la charge par ~20 ; cette reprise n'absorbe que les
    // pointes residuelles, typiquement deux personnes qui sauvegardent la meme seconde.
    if (statutPrisma(e).statut !== 503) return repondreErreurPrisma(res, 'PUT', id, e);
    try {
      await new Promise(r => setTimeout(r, 250));
      await appliquer();
    } catch (e2) {
      return repondreErreurPrisma(res, 'PUT (apres reprise)', id, e2);
    }
  }

  // ⚠️ RELECTURE SORTIE DE LA TRANSACTION. C'est une lecture pure : la garder dedans
  // ajoutait un aller-retour a la fenetre pendant laquelle la connexion du pooler est
  // epinglee, sans rien garantir de plus. Consequence assumee : l'objet rendu peut
  // refleter l'ecriture d'un collegue arrivee entre le commit et cette lecture — ce qui
  // est plus JUSTE que de rendre un etat coherent mais perime, et le client le
  // remplacerait de toute facon au prochain evenement temps reel.
  const project = await prisma.project.findUnique({ where: { id }, include: { tasks: true } });

  emitEvent('projects:updated', project);
  res.json(project);
});

router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.project.delete({ where: { id } });
  } catch (e) {
    // ⚠️ Ce catch était un COPIER-COLLER de celui du PUT : il annonçait « la
    // transaction » alors que ce DELETE n'en a pas, et journalisait « PUT échoué » sur
    // une suppression — donc un grep dans les logs mélangeait les deux. Il rend
    // désormais un statut traduit : un 404 signifie réellement « projet introuvable »,
    // et une saturation de la base rend un 503 réessayable.
    return repondreErreurPrisma(res, 'DELETE', id, e);
  }
  emitEvent('projects:deleted', id);
  res.sendStatus(204);
});

export default router;
