import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { withDates } from '../utils/dates';
import { scopeOf, arrayScopeWhere, redactSiteFields } from '../auth/siteScope';

const router = Router();
const prisma = new PrismaClient();

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
const TASK_FIELDS = [
  'name', 'provider', 'channel', 'cost', 'status', 'assignedUserId', 'deadline',
  'volumetry', 'openRate', 'npaiRate', 'stopRate', 'clickRate', 'codTxt', 'billedAmount'
] as const;

const pickTaskData = (t: any) => {
  const data: any = {};
  for (const f of TASK_FIELDS) {
    if (t[f] !== undefined) data[f] = t[f];
  }
  // `deadline` est un String? : une échéance effacée doit valoir NULL en base, pas ''.
  // Le DatePicker vidé renvoie une chaîne vide — on normalise ICI plutôt que dans
  // l'écran, pour que n'importe quel appelant de cette route soit couvert.
  // ⚠️ Ne pas confondre avec `undefined`, qui signifie « champ absent du body, donc
  // non modifié » et ne doit surtout pas devenir un effacement.
  if (data.deadline === '') data.deadline = null;
  return data;
};

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const { tasks, ...projectData } = req.body;

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
  let project;
  try {
    project = await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: withDates(projectData, ['startDate', 'endDate'])
      });

      const existing = await tx.task.findMany({
        where: { projectId: id },
        select: { id: true }
      });
      const existingIds = new Set(existing.map(t => t.id));
      const incoming: any[] = Array.isArray(tasks) ? tasks : [];
      const keptIds = new Set<string>();

      for (const t of incoming) {
        if (typeof t?.id === 'string' && existingIds.has(t.id)) {
          keptIds.add(t.id);
          await tx.task.update({ where: { id: t.id }, data: pickTaskData(t) });
        } else {
          await tx.task.create({
            data: {
              ...pickTaskData(t),
              projectId: id,
              // id client conservé si fourni (le frontend génère ses propres ids) —
              // sinon uuid généré par la base.
              ...(typeof t?.id === 'string' && t.id.length > 0 ? { id: t.id } : {})
            }
          });
        }
      }

      const toDelete = [...existingIds].filter(tid => !keptIds.has(tid));
      if (toDelete.length > 0) {
        await tx.task.deleteMany({ where: { id: { in: toDelete } } });
      }

      return await tx.project.findUnique({ where: { id }, include: { tasks: true } });
    });
  } catch (e) {
    return res.status(404).json({ error: 'Projet introuvable.' });
  }

  emitEvent('projects:updated', project);
  res.json(project);
});

router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.project.delete({ where: { id } });
  } catch (e) {
    return res.status(404).json({ error: 'Projet introuvable.' });
  }
  emitEvent('projects:deleted', id);
  res.sendStatus(204);
});

export default router;
