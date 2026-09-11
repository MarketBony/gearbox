import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_SECRET as SECRET } from '../auth/secret';
import { publicUser } from '../utils/publicUser';
import { emitEvent, notifyUserChanged } from '../realtime';
import { prisma } from '../db';

const router = Router();

/**
 * Formes acceptées pour `User.chatBackground` (fond du Chat), et ELLES SEULES.
 *
 * ⚠️ Même doctrine que `CALENDAR_UPLOAD_PATH` (routes/social.ts) et que
 * `AVATAR_UPLOAD_PATH` (realtime/chat.ts) : on ne fait confiance ni au client ni au type
 * MIME qu'il déclare, on reconnaît un chemin que NOUS avons produit. Le nom de fichier
 * est toujours un `randomUUID()` et l'extension vient d'`EXT_BY_MIME` pour le type
 * `chatbg` (jpg|png|webp) — voir `routes/uploads.ts`.
 *
 * ⚠️ NE PAS élargir à `/^\/uploads\//` : les dossiers `chat/` et `project/` n'ont AUCUN
 * filtre de format, y pointer depuis un fond rouvrirait ce trou par la bande. C'est le
 * même piège que celui documenté pour les médias du Digital.
 */
const CHATBG_UPLOAD_PATH =
  /^\/uploads\/chatbg\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

/**
 * Fond du catalogue procédural : `proc:<id>`.
 *
 * ⚠️ Le serveur ne connaît PAS la liste des ids — elle vit dans `lib/personnalisationChat.ts`, côté
 * frontend, et le backend ne peut pas importer ce fichier (il n'est compilé que dans le
 * bundle web, même raison que `PLAQUES_STRUCTURE`). On valide donc la FORME, pas la
 * valeur : un id inconnu est sans danger, le client retombe proprement sur le fond par
 * défaut (`styleFondChat` rend `{}`). Valider la liste ici imposerait une troisième
 * duplication à garder synchronisée pour un gain nul.
 */
const FOND_PROCEDURAL = /^proc:[a-z0-9-]{1,40}$/;

/**
 * Couleur des bulles : un IDENTIFIANT du catalogue, jamais une couleur CSS.
 *
 * ⚠️ La distinction est le tout : la valeur est injectée dans un `style` côté client.
 * Accepter `#f00` ou `linear-gradient(...)` reviendrait à laisser un compte écrire une
 * déclaration de style dans la page de l'application — on ne laisse donc passer qu'un
 * mot-clé, que le client résout lui-même. Même raison que pour les fonds : le serveur
 * valide la FORME, la liste vit côté frontend et un id inconnu retombe sur le défaut.
 */
const BULLE_ID = /^[a-z0-9-]{1,30}$/;

router.post('/login', async (req, res) => {
  const { loginId, password } = req.body;

  // Body vide ou partiel (scanner, client mal formé) : 400 explicite plutôt
  // qu'un 500 Prisma (findUnique refuse un where sans loginId).
  if (!loginId || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  }

  const user = await prisma.user.findUnique({ where: { loginId } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '24h' });
  res.json({ token, user: publicUser(user) });
});

// ⚠️ RÈGLE À NE PAS ENFREINDRE ICI : jamais d'accès base dans un rappel passé à
// une API non promise (`jwt.verify(token, secret, cb)`, `setTimeout`, un handler
// socket sans try/catch). Un tel rappel s'exécute APRÈS que le handler Express a
// rendu la main : la promesse qu'il renvoie n'est attendue par personne, donc ni
// express-async-errors ni middleware/errorHandler.ts ne peuvent la voir. Node la
// classe en « unhandled rejection » et TERMINE le process — une coupure Supabase
// de deux secondes a ainsi tué l'API le 30/07/2026.
// On utilise donc la forme SYNCHRONE de jwt.verify (elle lève si le jeton est
// invalide) et on garde l'accès base dans le handler async, sous le filet.
const decodeToken = (req: { headers: Record<string, any> }): { id: string; role: string } | null => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET) as { id: string; role: string };
  } catch {
    return null; // jeton absent, malformé ou expiré
  }
};

router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  const decoded = decodeToken(req);
  if (!decoded) return res.sendStatus(403);

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) return res.sendStatus(404);
  res.json(publicUser(user));
});

router.put('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  const decoded = decodeToken(req);
  if (!decoded) return res.sendStatus(403);

  const { name, password, avatarColor, avatarUrl, birthdate, chatBackground, chatBubble } = req.body;

  // avatarUrl : undefined = champ absent (non modifié) ; null = suppression de la photo.
  const updateData: any = { name, avatarColor };
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
  // Même convention : undefined = non modifié ; vide = anniversaire effacé.
  if (birthdate !== undefined) updateData.birthdate = birthdate || null;
  // Fond du Chat : undefined = non modifié ; vide = retour au fond par défaut.
  //
  // ⚠️ VALIDÉ ICI, et c'est obligatoire. `avatarUrl`, juste au-dessus, accepte encore
  // n'importe quelle chaîne — trou connu et documenté : un appel direct y écrit une URL
  // EXTERNE, ensuite rendue dans un `<img>` chez tous les collègues (fuite d'IP, pixel de
  // traçage). Un fond de chat pose exactement le même risque, en pire : il est rendu en
  // grand et en permanence. On n'ouvre donc que deux formes, et rien d'autre.
  if (chatBackground !== undefined) {
    const v = typeof chatBackground === 'string' ? chatBackground.trim() : '';
    if (!v) {
      updateData.chatBackground = null;
    } else if (FOND_PROCEDURAL.test(v) || CHATBG_UPLOAD_PATH.test(v)) {
      updateData.chatBackground = v;
    } else {
      return res.status(400).json({ error: 'Fond de discussion refusé : seuls un fond du catalogue ou une image déposée dans Gearbox sont acceptés.' });
    }
  }
  // Couleur des bulles : même convention (vide = retour au dégradé Bony).
  if (chatBubble !== undefined) {
    const v = typeof chatBubble === 'string' ? chatBubble.trim() : '';
    if (!v) {
      updateData.chatBubble = null;
    } else if (BULLE_ID.test(v)) {
      updateData.chatBubble = v;
    } else {
      return res.status(400).json({ error: 'Couleur de bulle refusée.' });
    }
  }
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }

  const updatedUser = await prisma.user.update({
    where: { id: decoded.id },
    data: updateData
  });

  // ⚠️ Cette route n'émettait RIEN et n'appelait pas notifyUserChanged, alors que
  // routes/users.ts fait les deux. Conséquence : modifier son propre profil (nom,
  // avatar, et maintenant anniversaire) ne rafraîchissait ni les autres clients ni
  // le cache de présence — il fallait un F5. Manque préexistant, corrigé ici parce
  // que le bloc « Anniversaires » de Hello Marketing en dépend directement.
  emitEvent('users:updated', publicUser(updatedUser));
  notifyUserChanged(decoded.id);

  res.json(publicUser(updatedUser));
});

export default router;
