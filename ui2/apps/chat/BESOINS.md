# Besoins partagés — rubrique Chat (lot 4)

Bouchons marqués `// BESOIN:` dans le code. À traiter à l'intégration (fichiers hors de ce dossier).

## 0. Intégration

- Déclarer la rubrique : `'chat'` dans `PORTED_IDS` (`ui2/apps/ids.ts`) et `chat: ChatApp` dans `PORTED_APPS`
  (`ui2/apps/registry.tsx`). Les métadonnées existent déjà dans `APP_META` (`ui2/os/bridge.ts`).
- Commandes prises en charge (widget « Chat » du bureau, Spotlight) : `conv:<id>`, `dm:<userId>`, `new-dm`, `new-group`.
- La rubrique n'émet PAS `GX.emit('chat:message')` : ce canal nourrit la simulation du widget (`D.MESSAGES` fictif).

## 1. `Avatar` du kit : présence et auteur absent

- **Quoi** : `Avatar` (`ui2/apps/ui/kit.tsx`) lit `GX.data.user(uid)` et ne rend ni la pastille `.pres` de la maquette,
  ni un auteur qui n'est plus dans la liste des utilisateurs (ancien membre : le message porte `senderName` / `senderColor`).
- **Bouchon** : `Av` / `UserAv` dans `common.tsx` (même balisage `.av`, initiales, `--c`).
- **Signature proposée** : `Avatar({ uid, cls, online?: boolean, fallback?: { name: string; color?: string } })`.

## 2. Enregistrement vocal : un hook commun

- **Quoi** : la logique MediaRecorder (micro relâché à l'arrêt / l'annulation / le démontage, type laissé au navigateur,
  extension déduite du type réel, 5 min max, messages d'erreur) vit dans `components/VoiceRecorder.tsx`, mêlée à son
  habillage Tailwind. L'interface v2 a besoin de la même logique sous la barre `.cht-rec` de la maquette.
- **Bouchon** : `voice.ts` (`useVoiceRecorder`) — copie fidèle de la logique, à supprimer ensuite.
- **Proposition** : extraire `useVoiceRecorder()` (état, secondes, erreur, `start`, `cancel`, `take(): { file, duree }`)
  dans `lib/` ; `VoiceRecorder.tsx` et `ui2/apps/chat` l'importent.

## 3. `Stack` du kit : en-tête de page personnalisable

- **Quoi** : en fenêtre étroite, la maquette place l'en-tête de conversation (`.cht-head` : avatar, nom, membres,
  personnaliser, options) DANS la `.stack-head`, à la place du titre `.t` (CSS `.stack-head .cht-head` déjà présente).
  `Stack` ne rend qu'un titre texte.
- **Bouchon** : titre vide + `.cht-head` en tête du contenu de la page (une ligne « ‹ Chat » au-dessus de l'en-tête).
- **Signature proposée** : `pages: { key, title, noHead?, head?: React.ReactNode, content }[]` — `head` remplace `.t`.

## 4. Accès aux données du Chat hors `ui2/store`

L'exception « temps réel du Chat » (services `chatStore`, socket `chat:*`, `emitWithAck`, `presenceStore`) est appliquée
telle quelle. Restent des appels `db.*` directs, les mêmes que `pages/Chat.tsx` et ses composants :
`getConversations`, `getMessages`, `createConversation`, `uploadFile('chat' | 'avatar' | 'chatbg')`, `getGifStatus`,
`searchGifs`, `getLinkPreview`. Si l'on veut les rassembler : un `ui2/store/chat.ts` (ou des exports de `services/`)
avec `useChatConversations()` (le même abonnement que `DataHub.tsx`, aujourd'hui recopié en `useChatConvs` dans
`common.tsx`), `loadMessages(id)`, `uploadChatFile(kind, file)`.

## 5. Défauts serveur relevés, hors de ce dossier (non corrigés ici)

- `GET /api/chat/conversations` et `GET /conversations/:id/messages` n'excluent que l'External : un chef de site peut
  LIRE le Chat Général par l'API (`routes/chat.ts`). La rubrique v2 n'appelle rien pour un rôle sans `hasSocialFeatures`,
  mais le cloisonnement réel reste à poser côté serveur.
- Compteur non-lu / push du Général ciblent « tous les non-External », chefs de site compris (`realtime/chat.ts`).
- `hasSocialFeatures('')` vaut `true` côté client et `false` côté serveur.
