# Plan — bulles de discussion (façon Messenger Android)

Rédigé le 09/10/2026, **à valider par Théo avant toute ligne de code**. Chantier inséré avant la refonte des widgets
(`PLAN-WIDGETS.md`). Interface v2 seulement (règle : les nouveautés vont dans la v2).

## 1. Le principe
Une conversation peut vivre dans une **petite bulle ronde** (photo de la personne ou du groupe) qui flotte
par-dessus Gearbox, quelle que soit la rubrique ouverte :
- on la **déplace au doigt ou à la souris** ; lâchée, elle se **colle au bord** le plus proche avec un petit ressort ;
- une **pastille rouge** compte les messages non lus ;
- un **toucher ou un clic** ouvre un **volet de conversation** collé à la bulle : fil des messages, réponse, réactions.
  Un second toucher, ou un clic à côté, le referme ;
- pour **fermer la bulle**, on la glisse vers une **cible « ✕ »** qui apparaît en bas de l'écran pendant le glisser,
  comme sur Android ;
- **plusieurs bulles** s'empilent sur le même bord (4 au maximum, la plus ancienne disparaît ensuite).
  Quand le volet est ouvert, elles s'alignent en rangée au-dessus de lui pour passer d'une conversation à l'autre.

## 2. Ce qui existe déjà et qu'on réutilise (aucune copie)
| Besoin | Porte existante |
|---|---|
| Envoyer un message, une photo | `services/chatOutbox.ts` (porte UNIQUE des envois : accusé, renvoi, anti-doublon) |
| Afficher un message | `Msg` de `ui2/apps/chat/Message.tsx` (le même rendu que la rubrique Chat) |
| Liste des conversations, noms, avatars | `useChatConvs`, `convName`, `ConvAv` (`ui2/apps/chat/common.tsx`) |
| Fils et temps réel | `GX.chatFeed` (`DataHub.tsx`) : chargement d'un fil, nouveaux messages, « lu » |
| Glisser au doigt et à la souris | même mécanique que la mascotte (`ui2/apps/assistant/mascot.ts` : capture du pointeur, ressort) |
| Calque flottant au-dessus de tout | même montage que `MascotLayer.tsx` (portail dans la coque, `React.memo`) |

⚠️ **Défaut trouvé pendant l'audit, à corriger dans ce lot** : `GX.chatFeed.send`, qu'utilise le widget « Chat
interactif », envoie par un `emitWithAck` DIRECT, sans passer par `chatOutbox`. C'est exactement le chemin que le
correctif 72 a fermé dans la rubrique Chat (message perdu en silence sur une connexion à moitié morte), mais le widget
y passe encore. Les bulles comme le widget enverront par `chatOutbox`.

## 3. Proposition de comportement (recommandations, à trancher en §6)
- **Quand une bulle apparaît**
  - **toujours à la demande** : bouton « Ouvrir en bulle » sur une conversation (rubrique Chat, menu de la
    conversation, widget) ;
  - **et automatiquement** à l'arrivée d'un message **privé ou de groupe** quand la rubrique Chat n'est pas au
    premier plan ;
  - **jamais pour le Chat Général**, qui est trop bavard : bulle seulement à la demande.
  - Une conversation **mise en sourdine** ne fait jamais apparaître de bulle toute seule.
- **Où** : sur le **bureau** (au-dessus des fenêtres, sans couvrir le Dock ni la mascotte) et sur le **téléphone**
  (au-dessus des rubriques, sans couvrir la pilule).
- **Ce qu'on fait dans le volet** : lire le fil, répondre en texte, réagir, envoyer une photo. Pour le reste (GIF,
  vocal, citer un projet, réglages du groupe), un bouton « Ouvrir dans Chat » mène à la conversation complète.
- **Lu / non lu** : ouvrir le volet marque la conversation comme lue, comme dans la rubrique Chat.
- **Mémoire** : la position et les bulles ouvertes sont retenues **sur ce navigateur** (préférence d'affichage,
  rien sur le serveur).
- **Réglage** : Réglages › Chat › « Bulles de discussion » avec trois choix : automatiques / seulement à la demande / désactivées.
- **Rôles** : uniquement ceux qui ont la rubrique Chat (`GX.shell.canOpen('chat')`). Un chef de site n'en a pas.
- **Animations** : courtes et légères (ressort au collage, apparition en « pop »), désactivées en mode économe et pour
  « réduire les animations ». Pas de physique « lourde » (leçon de la mascotte).

## 4. Découpage
1. **Planche interactive** (`maquettes/ux/bulles.html`) pour juger la **sensation** avant de coder : glisser,
   collage au bord, cible ✕, pile, ouverture du volet, sur ordinateur et en taille téléphone. Théo valide les
   réglages : vitesse du ressort, taille, seuil de la cible.
2. **Lot code** (`web` seul, aucune migration, aucune route nouvelle) :
   - `ui2/apps/chat/bubbles/` : le calque, la bulle, le volet ;
   - une porte unique `GX.bubbles` (`open(convId)`, `close`, `list`) appelée par la rubrique Chat, le widget et
     l'arrivée d'un message ;
   - `GX.chatFeed.send` rebranché sur `chatOutbox` ;
   - le réglage dans Réglages › Chat.
3. **Test sur localhost** avec ton compte, dans **la conversation privée Théo / Romane** comme au correctif 72 :
   réception (bulle qui apparaît, pastille), envoi depuis le volet, connexion coupée (renvoi). **Messages de test
   supprimés ensuite** : le backend local écrit en prod, et une photo envoyée en local serait cassée chez Romane.
   Ordinateur puis taille téléphone (tactile simulé).
4. Recette par toi, `.md` à jour, push, déploiement `web`.

## 5. Risques et points d'attention
- **Superpositions** : une bulle ne doit couvrir ni le Dock ni la pilule. Elle doit aussi rester accessible au-dessus
  d'une fenêtre en plein écran. Les zones interdites sont calculées comme pour la mascotte.
- **Gestes du téléphone** : le glisser d'une bulle ne doit pas déclencher le retour par le bord gauche
  (`mobile.ts`), ni le défilement de la page.
- **Performance** : pas de flou d'arrière-plan sur les bulles (une ombre suffit) ; le volet ne monte le fil
  qu'une fois ouvert.
- **Vraie notification système** : hors de ce lot (les notifications push existent déjà).

## 6. Décisions attendues de Théo
- **B1 — Apparition** : automatique à chaque nouveau message (sauf Général et sourdine) + à la demande (recommandé),
  ou seulement à la demande ?
- **B2 — Plateformes** : téléphone ET ordinateur (recommandé), ou téléphone seulement, comme Android ?
- **B3 — Volet** : texte + réactions + photo, le reste via « Ouvrir dans Chat » (recommandé), ou tout le Chat dans la
  bulle (GIF, vocal, projets) ?
- **B4 — Planche interactive d'abord** pour régler la sensation (recommandé), ou directement dans Gearbox ?
