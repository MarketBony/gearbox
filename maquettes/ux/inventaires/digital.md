# Inventaire fonctionnel — Digital (« Digital & Social »)

Source principale : `pages/Digital.tsx` (2574 lignes). Composants suivis : `components/Select.tsx`,
`components/CollapsibleFilters.tsx`, `components/ChampDiffere.tsx` (`ChampTexte`), `components/FloatingPanel.tsx`,
`components/DatePicker.tsx`, `components/Avatar.tsx`, `lib/linkProviders.ts`, `services/fileSauvegardePublication.ts`,
`services/dataService.ts`. Serveur : `backend/src/routes/social.ts`, `backend/src/routes/tags.ts`,
`backend/src/routes/uploads.ts`, `backend/src/auth/siteScope.ts`, `backend/src/jobs/purge.ts`.
Relevé par lecture du code seule, le 29/09/2026.

## 1. Accès et rôles

- [ ] **Navigation** : entrée « Digital » (icône `Globe`) dans `allMainItems` (`components/Sidebar.tsx:215`), groupe « COM DIGITALE » avec Campagnes dans la nav desktop (`Sidebar.tsx:326`). Route `case 'digital'` (`App.tsx:151`).
- [ ] **Visible par tous les rôles** connectés. Aucun filtre de rubrique pour Guest, Coordinator, etc.
- [ ] **External** : rubrique par défaut. `EXTERNAL_ALLOWED_TABS = ['digital', 'chat', 'hello-marketing', 'settings']`, tout autre onglet est redirigé vers `digital` (`App.tsx:80`, `App.tsx:90`), et c'est le `default` du `switch` (`App.tsx:162`). Nav limitée à Digital, Chat et Hello Marketing (`Sidebar.tsx:232`). Il a les **quatre onglets** et l'**édition complète**, tags compris, depuis le 25/08/2026 (`Digital.tsx:1695`, `Digital.tsx:2471`).
- [ ] **Chef de site (`Site Manager`)** : `digital` fait partie de `SITE_MANAGER_SECTIONS` (`constants.ts`, `backend/src/auth/roles.ts:69`). Il ne voit **que l'onglet « Planning Digital »** : filtre des onglets (`Digital.tsx:2476`) et retour forcé si l'onglet mémorisé est un autre (`Digital.tsx:1706-1708`). Lecture seule, par absence de `DIGITAL_EDIT_ROLES`.
- [ ] **Qui écrit** : un seul test, `canEditDigital(role)` = `DIGITAL_EDIT_ROLES` = `['Master', 'Administrator', 'Director', 'Digital Manager', 'External']` (`constants.ts:655-664`). `canDelete = canEdit` et `canEditCalendar = canEdit` (`Digital.tsx:1697-1699`). Même liste côté serveur : `EDIT_ROLES` de `routes/social.ts:16` et `routes/tags.ts:11`.
- [ ] **Lecture seule** (Guest, Coordinator, Site Manager…) : pastille « Lecture Seule » (icône cadenas) dans l'en-tête (`Digital.tsx:2462-2466`) ; tous les contrôles de ligne sont `disabled` ; la date s'affiche en texte `fr-FR`, ou « — » (`Digital.tsx:1150-1154`) ; pas de bouton « Ajouter » ; modale Médias sans zone de dépôt, sans ajout de lien et sans « Retirer » ; commentaires lisibles mais sans saisie ; onglet Tags lisible sans édition.
- [ ] **Suppression d'un commentaire** : son auteur, ou Master/Administrator (`estAdmin`, `Digital.tsx:802`, `Digital.tsx:851`). Serveur : 403 « Seul l'auteur peut supprimer ce commentaire. » (`social.ts:257-260`). Un Director ne supprime pas le commentaire d'un autre.
- [ ] **Dépôt de fichier** : `POST /api/uploads/calendar`, ouvert à tous les rôles sauf `Site Manager` (`UPLOAD_ROLES`, `routes/uploads.ts:13`).
- [ ] **Cloisonnement serveur** : `GET /api/social` filtre avec `scopeOf(req)` + `arrayScopeWhere('concessions', scope)`, puis `redactSiteFields(..., 'concessions')` (`social.ts:163-176`). Le chef de site voit les publications qui portent un de ses sites, sa plaque, ou `GROUPE BONY` / `GROUPE BONY (R/N)` (`expandScope`, `siteScope.ts:77-84`, `GLOBAL_SCOPES` `siteScope.ts:45`). Il ne reçoit que ses propres valeurs dans `concessions[]`. Les commentaires passent par la même porte (`publicationVisible`, `social.ts:198-205`) : 404 « Publication introuvable. » hors périmètre.
- [ ] **Tags** : `GET /api/tags` ouvert à tout compte authentifié, sans cloisonnement (`tags.ts:59-62`) ; `POST` réservé aux `EDIT_ROLES`.
- [ ] **Ce que le client fabrique** : si la table des tags est vide, `getDigitalTags` renvoie les valeurs par défaut `SOCIAL_NETWORKS` / `CO2_OPTIONS` / `LOI_LOM_OPTIONS` de `constants.ts` (`services/dataService.ts`, `getDigitalTags`). Il fait aussi une migration unique depuis `localStorage` (`gearbox_digital_tags`, drapeau `gearbox_digital_tags_migres`), et une migration unique des publications `localStorage` (`social_posts`, drapeau `gearbox_migrated_social_posts`, admin seulement, base vide). Compteurs de médias dérivés de `mediaFiles.length` (`Digital.tsx:1757-1760`).

## 2. Structure

- [ ] En-tête : titre « Digital & Social » (icône `Globe` violette), sous-titre « Gestion Editoriale & Réseaux », indicateur « ENREGISTREMENT... » pendant `saving` (`Digital.tsx:2452-2458`).
- [ ] **4 onglets**, dans cet ordre : `'Calendrier Editorial' | 'Planning Digital' | 'Archives' | 'Gestion des TAGS'` (`Digital.tsx:22`, `Digital.tsx:2475`). Libellés affichés tels quels (en majuscules via CSS `uppercase`). Icônes : Archives → `Archive`, Planning → `Calendar`, Tags → `Settings` ; aucune icône pour Calendrier.
- [ ] Onglet actif persistant : `useSessionState('digital_activeTab', 'Calendrier Editorial')`, soit la clé sessionStorage `gearbox_session_digital_activeTab` (`Digital.tsx:1615`, `hooks/useSessionState.ts:9`).
- [ ] **Calendrier Editorial** : liste de lignes d'édito (`EditoRow`) **non archivées**.
- [ ] **Archives** : la même liste, restreinte aux publications `archived === true` (`Digital.tsx:1973-1976`).
- [ ] **Planning Digital** : calendrier de **toutes** les publications, archivées comprises (pas de logique d'onglet, `Digital.tsx:1973`). Sous-vues `'Mois' | 'Semaine'` (`Digital.tsx:23`), persistées en `digital_calendarView` (défaut `'Mois'`, `Digital.tsx:1681`). La date affichée `planningDate` n'est **pas** persistée (`useState(new Date())`, `Digital.tsx:1682`).
- [ ] **Gestion des TAGS** : `TagsManager`, trois colonnes (`Digital.tsx:1601-1607`).
- [ ] Barre de filtres (Calendrier et Archives uniquement) repliable par `CollapsibleFilters storageKey="digital"` : état ouvert/fermé en `digital_filtersOpen`, défaut `false` (`CollapsibleFilters.tsx:45`, `Digital.tsx:2496-2551`).
- [ ] Modales / panneaux : « Nouvelle Publication » (création), `MediaManagerModal` (médias + lightbox), `PanneauCommentaires` (FloatingPanel), panneau d'écriture du wording (FloatingPanel), infobulle du Planning.

## 3. Filtres et sélecteurs

Barre du Calendrier et des Archives (`Digital.tsx:2502-2549`) :

- [ ] **Recherche** : champ texte, placeholder « Rechercher... ». Filtre sur `title` seul, `toLowerCase().includes()` (`Digital.tsx:1979`). Brouillon local propagé après 250 ms sans frappe (`Digital.tsx:1716-1720`). Persistée en `digital_searchTerm`, défaut `''`.
- [ ] **Marque** : sélection simple (`Select`). Options : « Toutes Marques » (`All`), puis `BRANDS` = Renault, Dacia, Alpine, Nissan, Mobilize, Holding, avec le libellé `libelleMarqueDigital`, donc **Holding → « GROUPE BONY »** (`constants.ts:27`, `constants.ts:267-273`). Défaut `All`, persistée en `digital_filterBrand`. Règle : garde `p.brands.includes(filtre)` **ou** `p.brands.includes('Holding')`. Une publication GROUPE BONY sort donc sous toutes les marques (`Digital.tsx:1982`).
- [ ] **Service** : sélection simple. Options : « Tous Services » (`All`), puis `SOCIAL_SERVICES` = VN, VO, APV, PR, Tous Services, RH (`constants.ts:379`). Défaut `All`, persistée en `digital_filterService`. Règle : garde `p.service === filtre` **ou** `p.service === 'Tous Services'` (`Digital.tsx:1983`). Deux options affichent donc « Tous Services » : `All` et la valeur `Tous Services`.
- [ ] Compteur de filtres actifs (barre repliée sur mobile) : recherche + marque ≠ All + service ≠ All ; résumé « « terme » · marque ou 'Toutes marques' · service » (`Digital.tsx:2400-2409`).

Barre du Planning (`Digital.tsx:2241-2258`) :

- [ ] **Site** : sélection simple, persistée en `digital_filterConcession`, défaut `'All'` (`Digital.tsx:1677`). Options : « Tous Sites », puis pour chaque plaque de `PLAQUES_STRUCTURE`, `★ <PLAQUE>` suivi de ses sites (`Digital.tsx:2246-2252`). Soit : ★ PLAQUE CENTRE, Clermont, Ussel, Mozac, Massagettes ; ★ PLAQUE NORD, Vichy, Moulins, Thiers, Ambert, Ricoux ; ★ PLAQUE SUD, Issoire, Brioude, Mende, Le Puy-en-Velay ; ★ PLAQUE SUD-OUEST, Albi, Rodez, Millau, Aurillac, Figeac, Gaillac, Villefranche, Carmaux, Lavaur (`constants.ts:5-10`). Règle : la publication passe si `concessions` contient la valeur, **ou** contient `'GROUPE BONY'`, **ou** (valeur = plaque) contient un site de cette plaque (`Digital.tsx:1985-1991`).
- [ ] Navigation : `<` / « Auj. » / `>` ; ±1 mois en vue Mois, ±7 jours en vue Semaine (`Digital.tsx:2079-2091`).
- [ ] Sélecteur de vue « Mois » / « Sem. » (`Digital.tsx:2235-2238`).
- [ ] ⚠️ La recherche et les filtres Marque et Service **s'appliquent aussi au Planning**, dont la barre est masquée (voir §11).

Tri :

- [ ] Par **date** de publication (`parseLocalDate(p.date)`), croissant par défaut, persisté en `digital_sortOrder` (`'asc' | 'desc'`, `Digital.tsx:1678`, `Digital.tsx:2000-2002`). Bascule au clic sur l'en-tête « RÉGLAGES · TRI PAR DATE », flèche haut/bas (`Digital.tsx:2359-2362`). Aucun autre tri.

## 4. Affichage

**En-tête du tableau** (lg+ seulement, collant) : « CONTENU DU POST » · « RÉGLAGES · TRI PAR DATE » · « MÉDIA / ACTIONS » (`Digital.tsx:2356-2364`).

**Ligne d'édito `EditoRow`** (`Digital.tsx:940-1367`), `React.memo` :

- [ ] Bande de statut colorée : 1re classe de `SOCIAL_STATUS_COLORS[status]` sans `/20` (`Digital.tsx:987-988`) ; horizontale en haut sous `sm`, verticale à gauche au-delà.
- [ ] Ligne archivée : `opacity-60 grayscale` (`Digital.tsx:1008`).
- [ ] **Contenu** : titre (champ différé, placeholder « Titre de la publication... ») ; **lien**, cliquable au repos avec `libelleCourt(href)` et un crayon « Modifier le lien », sinon un champ placeholder « Lien… » (`Digital.tsx:1032-1072`) ; aperçu du **wording** sur une hauteur fixe de 78 px, placeholder « Rédiger le post ici… » (`Digital.tsx:1083-1091`).
- [ ] **Réglages**, une grille de 11 contrôles avec micro-intitulé (`Etiquette`) : Date · Statut · Service · Marques · Sites · Réseaux · Diffusion · Loi LOM · Classes CO² · Client B2B (PRO+) (`Digital.tsx:1140-1290`). Grille de 2 colonnes, 5 à partir de `sm`.
- [ ] Pastilles des multi-sélecteurs : `maxVisible = 1` puis « +N » ; infobulle = liste complète séparée par « · ». Marques colorées par `BRAND_COLORS` et libellées par `libelleMarqueDigital` (`Digital.tsx:181-199`).
- [ ] Statuts : les 9 clés de `SOCIAL_STATUS_COLORS` **dans l'ordre du menu** : À venir, Constructeur, En attente, Non Validé, Rédigé, Validé, Programmed (affiché « Programmé »), Publié, Abandonné (`constants.ts:350-361`, `libelleStatutSocial` `constants.ts:287-293`). Couleurs : slate, cyan, orange, rouge, bleu, émeraude, violet, vert plein (texte noir), noir barré.
- [ ] **Actions** : bouton Médias avec pastille orange (nombre, « 9+ » au-delà de 9 ; infobulle `libelleMedias`, ex. « 2 fichiers · 1 lien », ou « Gérer les médias ») ; bouton Commentaires avec pastille violette (nombre, « 9+ » ; infobulle « N commentaire(s) » ou « Commenter ») ; case Archiver / Désarchiver ; corbeille « Supprimer définitivement » (`Digital.tsx:1294-1364`).
- [ ] Compteur de commentaires : `post.commentCount` (dérivé serveur, `social.ts:137-140`), remplacé par le nombre lu dans le panneau une fois ouvert, puis réinitialisé à chaque nouvelle valeur serveur (`Digital.tsx:956-961`).
- [ ] Liste vide : voir §8.

**Planning — vue Mois** (`Digital.tsx:2101-2151`) :

- [ ] Grille de 7 colonnes, lundi en premier ; en-têtes LUN MAR MER JEU VEN SAM DIM. Numéro du jour à droite, jour courant en orange avec anneau. Titre du mois `toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })` capitalisé.
- [ ] Tuile de publication : liseré gauche couleur de statut (`bg-<couleur de bordure>`), logos de réseaux (lg+ seulement), titre sur 1 ligne, ou « Sans titre ».
- [ ] `LogosReseaux` : dédoublonné par icône (Instagram et Story Instagram = même logo), au plus 3 (`MAX_LOGOS_CALENDRIER`), puis « +N » avec infobulle ; `Globe` si aucun réseau (`Digital.tsx:78-121`). Couleurs : Instagram #E1306C, Facebook #1877F2, LinkedIn #0077B5, YouTube #FF0000, GMB `MapPin` #4285F4, TikTok `Video` noir/blanc, autre `Globe` (`Digital.tsx:123-132`).

**Planning — vue Semaine** (`Digital.tsx:2154-2212`) :

- [ ] 7 colonnes : jour abrégé + numéro en grand ; titre « Semaine du <jour mois> ». Carte : logos de réseaux, jusqu'à 3 pastilles rondes de marque dédoublonnées (1re classe de `BRAND_COLORS`), titre, **statut brut** `post.status` (`Digital.tsx:2199-2201`).
- [ ] Compteur « N posts » (md+) à côté du filtre Site (`Digital.tsx:2255-2257`).

**Infobulle au survol** (Planning, `Digital.tsx:2023-2075`) : marques (libellé Digital, couleurs), statut traduit et coloré, titre (ou « Sans titre »), date `fr-FR`, bloc « Wording » (4 lignes, entre guillemets, « ... » si vide), 3 premières concessions + « +N », icônes de **tous** les réseaux (non dédoublonnés). Position calée sur le curseur, bornée à la fenêtre (`Digital.tsx:2005-2015`).

**Gestion des TAGS** (`Digital.tsx:1473-1607`) : trois colonnes titrées « Réseaux Sociaux » (icône Globe violette), « Classes CO² & Mentions » (Settings orange, catégorie `co2`), « Mentions Loi LOM » (AlignLeft bleue). Chaque entrée affiche son icône de réseau (colonne réseaux) et un cadenas pour les 8 réseaux verrouillés `LOCKED_NETWORKS` : Instagram, Story Instagram, Facebook, Story Facebook, LinkedIn, GMB, TikTok, YouTube (`Digital.tsx:27-36`).

**Modale Médias** (`Digital.tsx:339-727`) : titre « Médias — <titre ou 'Publication sans titre'> » ; grille de vignettes (2 colonnes, 3 à partir de `sm`) avec un **numéro d'ordre** (`NumeroMedia`). Image → `<img>` cliquable vers la lightbox ; vidéo `.mp4` / `.mov` hébergée → `<video controls preload="metadata">` ; **lien externe** → tuile sans aucun chargement réseau : icône lien, badge fournisseur (`fournisseurDe`) ou « Lien », puis `libelleCourt`. Nom affiché = nom d'origine (`mediaNames[i]`), sinon le nom de fichier. Pied : « 0 média » ou `libelleMedias`, plus « · glissez les vignettes pour changer l'ordre » s'il y a plus d'un média et que l'utilisateur peut éditer.

**Panneau Commentaires** (`Digital.tsx:743-898`) : titre « Commentaires » ; pour chaque commentaire, avatar, nom (ou « Compte supprimé »), date « jj/mm à hh:mm » et texte (`pre-wrap`). Ordre chronologique croissant (`social.ts:212`). L'auteur est résolu par le serveur via `publicUser` (`social.ts:223-228`).

## 5. Formulaires

**Création — modale « Nouvelle Publication »** (`Digital.tsx:2415-2446`) :

- [ ] Texte d'aide « Donnez un titre à votre publication pour commencer. » ; un seul champ, le titre (placeholder « Titre de la publication... »), obligatoire (trim non vide) ; `Entrée` crée, `Échap` ferme. Boutons « ANNULER » / « CRÉER » (désactivé si vide).
- [ ] Valeurs par défaut envoyées (`Digital.tsx:1942-1959`) : `status: 'À venir'`, `date` du jour (`new Date().toISOString().split('T')[0]`), `targets: []`, `brands: []`, `service: 'Tous Services'`, `networks: []`, `concessions: []`, `mediaFiles: []`, `link: ''`, `wording: ''`, `lom: ''`, `co2: ''`, `co2s: []`, `proPlus: false`, `archived: false`. L'id est généré par le serveur.

**Édition en ligne** (chaque contrôle écrit **un** champ via `onChangerChamp`, `Digital.tsx:1808-1836`) :

- [ ] **Titre** `title` : texte, saisie différée (`ChampTexte`), écrit au blur, au démontage ou quand l'onglet est masqué (`ChampDiffere.tsx:100-120`).
- [ ] **Lien** `link` : texte libre, saisie différée ; rendu cliquable seulement si `hrefSur` l'accepte (http/https ; `www.` préfixé en `https://`) (`Digital.tsx:280-291`). **Aucune validation serveur**.
- [ ] **Wording** `wording` : textarea dans un FloatingPanel (au moins 420 px de large, 340 px de haut au plus), placeholder « Rédiger le post ici... », compteur « N caractères », bouton « Fermer ». Écrit à la fermeture ou au blur (`Digital.tsx:1096-1132`). Pas de limite de longueur.
- [ ] **Date** `date` : `DatePicker size="sm" compact`, format `YYYY-MM-DD` parsé en date locale (`Digital.tsx:40-51`).
- [ ] **Statut** `status` : Select simple, les 9 valeurs de §4.
- [ ] **Service** `service` (**au singulier**) : Select simple, `SOCIAL_SERVICES`.
- [ ] **Marques** `brands` : multi, `BRANDS`, libellé Holding → « GROUPE BONY ». Placeholder « Marques… ». **Aucune exclusivité Holding** (voir §11).
- [ ] **Sites** `concessions` : multi, placeholder « Sites… ». Options `DIGITAL_CONCESSIONS` = `GROUPE BONY`, `FULL RENAULT`, `FULL DACIA`, `FULL NISSAN`, `FULL ALPINE`, les `SITES` sauf `Ricoux` (Clermont, Ussel, Mozac, Massagettes, Vichy, Moulins, Thiers, Ambert, Issoire, Brioude, Mende, Le Puy-en-Velay, Albi, Rodez, Millau, Aurillac, Figeac, Gaillac, Villefranche, Carmaux, Lavaur, Montluçon, Saint-Etienne), puis `Yssingeaux` (`constants.ts:319`, `constants.ts:336-341`). **Pas de plaques** depuis le correctif 50. Les valeurs déjà présentes hors liste (anciennes plaques) sont ajoutées aux options (`Digital.tsx:973-976`).
- [ ] **Réseaux** `networks` : multi, options = `tags.networks` (catalogue en base), placeholder « Réseaux… ».
- [ ] **Diffusion** `targets` : deux boutons bascule, « WEB » (`Internet`, infobulle « Site internet ») et « COLLAB. » (`Collaborateurs`) (`Digital.tsx:1216-1237`).
- [ ] **Loi LOM** `lom` : Select simple, « Aucune » (`''`) puis `tags.lom` (`Digital.tsx:1239-1248`).
- [ ] **Classes CO²** `co2s` : multi (au plus 20 côté serveur), placeholder « Aucune », options `tags.co2`, complétées des valeurs cochées hors catalogue. Le `co2` hérité est recalculé par le serveur (= 1re valeur de `co2s`), le client ne l'écrit plus (`Digital.tsx:1250-1264`, `social.ts:154-158`).
- [ ] **Client B2B / PRO+** `proPlus` : bouton-case « PRO+ », infobulle « Marquer cette publication comme PRO+ (B2B) », `aria-pressed`. Rendu avec le dégradé Bony quand il est actif. **Marqueur d'affichage uniquement** (`Digital.tsx:1266-1289`). Forcé en booléen strict par le serveur (`social.ts:159`).
- [ ] **Archivé** `archived` : case à cocher ; `archivedAt` est posé ou vidé **par le serveur seul** (`social.ts:316-326`).

**Liste blanche serveur `SOCIAL_FIELDS`** (`social.ts:124-127`), à reprendre à l'identique : `title`, `status`, `date`, `targets`, `brands`, `service`, `networks`, `concessions`, `mediaFiles`, `mediaNames`, `link`, `wording`, `lom`, `co2`, `co2s`, `proPlus`, `archived`. Exclus : `archivedAt`, `createdAt`, `updatedAt`, `commentCount` (dérivé) ; `id` n'est accepté qu'au POST. ⚠️ Tout champ absent est **jeté en silence**.

- [ ] Validation `mediaFiles` : au plus 50 entrées de 2048 caractères chacune ; seulement `/uploads/calendar/<uuid>.(jpg|png|webp|mp4|mov)` ou une url `http(s)` parsable ; les valeurs déjà en base sont tolérées au PUT ; message 400 « Média refusé : seuls un fichier déposé dans Gearbox ou un lien http(s) sont acceptés. » (`social.ts:32-102`).
- [ ] `mediaNames` est recalé sur la longueur de `mediaFiles`, sans séparateurs de chemin, sans `..` ni caractères de contrôle, 160 caractères au plus (`social.ts:63-75`, `social.ts:304-314`).

**Médias** : formats acceptés `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, 2 Go au plus (`Digital.tsx:261-262`). Mention « JPG · PNG · WebP · MP4 · MOV — max 2 Go ». Lien : champ `type="url"`, placeholder « …ou colle un lien WeTransfer, SharePoint, Drive… », bouton « Ajouter » (Entrée valide aussi).

**Commentaire** : textarea de 2 lignes, `maxLength=2000`, placeholder « Écrire un commentaire… » ; Entrée envoie, Maj+Entrée passe à la ligne ; bouton « Envoyer (Entrée) ». Serveur : vide → 400 « Le commentaire est vide. », > 2000 → 400 « Le commentaire est limité à 2000 caractères. » ; l'auteur vient du jeton (`social.ts:231-248`).

**Tags** : champ « Ajouter un réseau... » / « Ajouter une classe CO²... » / « Ajouter une mention Loi LOM... » + bouton `+` (Entrée valide aussi) (`Digital.tsx:1386-1390`, `Digital.tsx:1577-1597`). Trim, doublon ignoré. Serveur : au plus 200 entrées par catégorie, 80 caractères, dédoublonnage, caractères de contrôle retirés (`tags.ts:31-55`).

## 6. Actions

- [ ] **Créer** (Calendrier Editorial seulement, bouton « Ajouter » avec `+`, `Digital.tsx:2540-2548`) → modale → `POST /api/social` ; la publication est ajoutée en tête de liste ; entrée d'activité « a créé la publication » (`Digital.tsx:1961`).
- [ ] **Éditer un champ** → mise à jour optimiste, puis `fileSauvegardePublication.pousser` : **un seul PUT en vol par publication**, avec coalescence. La réponse serveur n'est appliquée que si rien n'attend derrière et qu'aucun champ n'a le focus (`Digital.tsx:1824-1835`). Pas de PUT si la valeur n'a pas changé. Aucune écriture si la publication n'existe plus (garde contre la résurrection au démontage).
- [ ] **Archiver / Désarchiver** : bascule directe, sans confirmation ; entrée d'activité « a archivé la publication » à l'archivage seulement (`Digital.tsx:1820-1822`). Les médias hébergés sont purgés 30 jours après `archivedAt` ; les liens externes ne sont jamais purgés (`jobs/purge.ts:6-63`).
- [ ] **Supprimer** : confirmation en deux temps, corbeille → bouton rouge clignotant « SUPPR ? » (perdre le focus annule) (`Digital.tsx:1343-1363`) → `DELETE /api/social/:id` ; les fichiers `/uploads/calendar/` de la publication sont effacés du disque (`social.ts:333-348`) ; entrée d'activité « a supprimé la publication ».
- [ ] **Médias** : dépôt par glisser-déposer ou clic sur la zone (« Glisse des fichiers ici ou **clique pour parcourir** », « Envoi en cours… ») ; envoi séquentiel, chaque fichier persisté dès son arrivée, **nom d'origine** capturé côté client (`Digital.tsx:373-402`). Ajout de lien. **Réordonner** par glisser-déposer des vignettes : l'ordre est l'ordre de diffusion (`Digital.tsx:426-434`). Retirer, avec `confirm` « Retirer « nom » du post ? », par index (`Digital.tsx:410-417`). Télécharger un fichier sous son nom d'origine ; un lien s'ouvre dans un nouvel onglet (`noopener,noreferrer`). Lightbox au clic sur une image. Tout passe par la même file que les champs (`enregistrerPublication`, `Digital.tsx:1864-1893`), avec retour arrière en cas d'échec. Modale en lecture seule si la publication est archivée (`canEdit={canEditCalendar && !post.archived}`, `Digital.tsx:2564`).
- [ ] **Commenter / supprimer un commentaire** (croix « Supprimer ce commentaire », sans confirmation) (`Digital.tsx:851-862`).
- [ ] **Tags** : ajouter ; modifier en place (crayon → champ, ✓ ou Entrée pour valider, ✕ ou Échap pour annuler) ; supprimer en deux clics (« Confirmer ? », réarmé après 3 s) (`Digital.tsx:1411-1471`). Les réseaux verrouillés ne sont ni modifiables ni supprimables. Écriture = **patch d'une seule catégorie** (`POST /api/tags`), refusée tant que les tags n'ont pas été lus (`tagsCharges`) ; en cas d'échec, rechargement pour réaligner l'écran (`Digital.tsx:1911-1927`). Vider une catégorie laisse une trace `console.warn` côté serveur (`tags.ts:83-94`).
- [ ] Pas d'export, pas de duplication, pas d'action en masse, pas de raccourci global.

## 7. Temps réel et chargement

- [ ] Chargement initial `loadData()` : `Promise.allSettled([getSocialPosts(), getDigitalTags()])`, les deux échouent indépendamment (`Digital.tsx:1748-1777`).
- [ ] Écran : `useRealtimeSync([...RT_EVENTS.social, ...RT_EVENTS.tags, ...RT_EVENTS.socialComments], () => loadData(true))`, c'est-à-dire `social:updated`, `social:deleted`, `tags:updated`, `social-comment:updated`, `social-comment:deleted` (`Digital.tsx:1736-1739`, `services/realtime.ts:57-64`). Rechargement silencieux, sans squelette.
- [ ] Panneau Commentaires ouvert : `useRealtimeSync(RT_EVENTS.socialComments, charger)` ; il n'est monté qu'à l'ouverture (`Digital.tsx:776`).
- [ ] États : « ENREGISTREMENT... » (`saving`) ; « Chargement… » dans le panneau Commentaires ; « Envoi en cours… » dans la modale Médias. Le drapeau `loading` existe mais **n'est rendu nulle part** (voir §11).
- [ ] Protection de la saisie : `champsFocalisesRef` compte les champs qui ont le focus ; `ChampTexte` ne réabsorbe la valeur serveur qu'en dehors du focus (`ChampDiffere.tsx:88-91`).

## 8. États vides et erreurs

- [ ] Liste Calendrier ou Archives vide : « Aucune publication trouvée dans {activeTab}. » (icône `LayoutList`) (`Digital.tsx:2387-2390`).
- [ ] Planning mobile vide : « Aucune publication » (`Digital.tsx:2297`).
- [ ] Modale Médias vide : « Aucun média pour ce post ».
- [ ] Commentaires vides : « Aucun commentaire. » + « Laissez une consigne à l’équipe. » si l'utilisateur peut éditer (`Digital.tsx:833-835`) ; erreurs « Commentaires indisponibles. », « Envoi impossible. », « Suppression impossible. », ou le message de l'API.
- [ ] Échec d'enregistrement d'un champ (`onEchecSauvegarde`, `Digital.tsx:1784-1795`), par `alert` : statut 0 « Serveur injoignable. Vos modifications ne sont PAS perdues — ne fermez pas cet onglet. » ; 503 « La base est momentanément saturée. Réessayez dans une minute. » ; 401 rien (déconnexion) ; 403 « Droits insuffisants pour modifier cette publication. » ; 404 « Cette publication n'existe plus (supprimée depuis un autre poste ?). » puis rechargement ; sinon le message de l'API, ou « Échec de l'enregistrement. » ; erreur non-API « Échec inattendu de l'enregistrement. ».
- [ ] Création : « Échec de la création (serveur injoignable ?). » ; suppression : « Échec de la suppression (serveur injoignable ?). » (ou le message de l'API).
- [ ] Médias : « Format non supporté : "x". Accepté : JPG, PNG, WebP, MP4, MOV. » ; « "x" dépasse la limite de 2 Go. » ; « Échec de l'upload de "x". » ; « Échec de la suppression. » ; « Échec du réordonnancement. » ; lien : « Colle un lien commençant par http:// ou https:// — WeTransfer, SharePoint, Drive… », « Ce lien n'est pas une adresse valide. », « Ce lien est déjà attaché à ce post. », « Échec de l'ajout du lien. ».
- [ ] Tags : « Les tags n'ont pas pu être chargés : rien n'a été enregistré. Rechargez la page. » ; « Échec de l'enregistrement des tags. » ; serveur 400 « Aucune catégorie de tags reconnue dans la requête. ».
- [ ] Échec du chargement des publications : `console.error` seul, **aucun message à l'écran** (la liste paraît vide).

## 9. Règles métier touchées

- [ ] **Pas de budget** : le Digital n'appelle ni `resolveBudgetLine`, ni `splitShareToBuckets`, ni `isHoldingBrand`. `concessions` sert au ciblage éditorial, pas au routage (`constants.ts:295-341`). Aucun curseur `alpineShare` / `nissanShare`. Alpine par site / Nissan global ne s'appliquent pas : `FULL ALPINE` et `FULL NISSAN` sont de simples étiquettes de ciblage.
- [ ] **Holding** : stocké `Holding`, **affiché « GROUPE BONY »** partout via `libelleMarqueDigital` (options, pastilles, infobulles, filtre). Dans le filtre Marque, une publication Holding passe **toujours**. Exclusivité non appliquée (voir §11).
- [ ] **Périmètre `GROUPE BONY`** (valeur de concession, distincte du tag marque) : passe toujours le filtre Site du Planning ; périmètre global du chef de site (`GLOBAL_SCOPES`).
- [ ] **Brouillon (`Draft`)** : sans objet, `SocialStatus` n'a pas de valeur Draft.
- [ ] **`Programmed`** : stocké en anglais, affiché « Programmé » (`libelleStatutSocial`). La valeur ne doit pas être renommée.
- [ ] **PRO+ (`proPlus`)** : marqueur d'affichage, sans effet sur les montants (il n'y en a pas). À ne pas confondre avec `expertMode`.
- [ ] **Cloisonnement** : `scopeOf` + `arrayScopeWhere('concessions')` + `redactSiteFields` ; à réutiliser tels quels.
- [ ] **Services** : `SOCIAL_SERVICES` = `SERVICES` + `RH`, propre au Digital ; ne jamais le fusionner avec `SERVICES`.

## 10. Mobile

- [ ] `isMobile` = `window.innerWidth < 768`, recalculé au redimensionnement (`Digital.tsx:1683`, `Digital.tsx:1722-1726`).
- [ ] Planning sous 768 px : **jamais de grille**. On affiche une liste chronologique « N publication(s) » de cartes (date en orange, statut traduit, titre sur 2 lignes, 4 réseaux au plus, 3 marques au plus), toujours triée par date croissante (`Digital.tsx:2262-2300`). Sélecteur Mois/Sem. et compteur « N posts » masqués (`hidden md:`).
- [ ] Tablette (md → lg) : en vue Semaine, défilement horizontal avec une largeur minimale de 640 px (`Digital.tsx:2306-2321`). Desktop lg+ : grille complète ; logos de réseaux des tuiles du Mois seulement en lg+.
- [ ] Calendrier / Archives : en-tête du tableau masqué sous `lg` ; barre de filtres repliable (`CollapsibleFilters`) avec compteur et résumé ; recherche, sélecteurs et « Ajouter » en pleine largeur et empilés.
- [ ] Ligne d'édito : contrôles et boutons hauts de 44 px sous `md` (`h-11`), 34 px au-delà ; grille de réglages sur 2 colonnes sous `sm` ; actions sous le contenu, séparées par un trait.
- [ ] Croix de suppression d'un commentaire toujours visible sur mobile, au survol sur desktop (`Digital.tsx:858`).
- [ ] Onglets : `px-2 py-1.5` sous md, hauteur minimale 36 px.

## 11. Défauts et bizarreries relevés (signalés, non corrigés, non reproduits)

- [ ] **Filtres invisibles sur le Planning** : `filteredPosts` applique la recherche, la Marque et le Service quel que soit l'onglet (`Digital.tsx:1979-1983`), alors que leur barre est masquée sur le Planning (`Digital.tsx:2496`). Fiche du 29/09 dans `BUGS-CONNUS.md:163`, confirmée par lecture. La recherche est concernée aussi, pas seulement Marque et Service.
- [ ] **Filtre Site du Planning incomplet** : construit depuis `PLAQUES_STRUCTURE`, il ne propose ni **Montluçon**, ni **Saint-Etienne**, ni **Yssingeaux**, ni les `FULL …`. Il propose en revanche **Ricoux**, retiré de la saisie. Filtrer sur un site ne remonte pas une publication étiquetée de sa **plaque** (seul le sens plaque → sites fonctionne).
- [ ] **Chef de site** : `expandScope` n'inclut ni `FULL RENAULT/DACIA/NISSAN/ALPINE` ni `Yssingeaux`. Une publication ciblée seulement ainsi (ou sans aucune concession) lui est invisible. Voulu ou non : à arbitrer. Son filtre Site propose aussi toutes les plaques et tous les sites (le serveur cloisonne quand même).
- [ ] **Vue Semaine : statut brut** `{post.status}` (`Digital.tsx:2200`), donc « Programmed » s'affiche en anglais, sans couleur.
- [ ] **Holding non exclusif** dans le multi-sélecteur Marques du Digital (contraire à la règle « tag exclusif » du CLAUDE.md). Aucun impact budgétaire ici.
- [ ] **Loi LOM et Réseaux sans repli** sur les valeurs hors catalogue. Si une mention LOM est renommée ou supprimée dans les Tags, le `Select` d'une publication qui la porte retombe sur son placeholder, et le prochain changement l'écrase (même piège qu'au 10/09). De même, un réseau retiré du catalogue reste coché sans pouvoir être décoché. La Classe CO² a ce repli, pas eux. Renommer un tag ne répercute pas le nouveau nom sur les publications.
- [ ] **Pas de tri** sous `lg` : la seule commande de tri est l'en-tête du tableau, masqué sous `lg`.
- [ ] **Date de création en UTC** : `new Date().toISOString().split('T')[0]` (`Digital.tsx:1945`) donne la veille entre 0 h et 2 h, heure de Paris.
- [ ] **`loading` jamais rendu** : pendant le premier chargement, on lit « Aucune publication trouvée… ». Et un échec de chargement des publications n'affiche rien.
- [ ] **Code mort** : la prop `isArchivedView` de `EditoRow` est passée mais jamais lue ; `borderClass` et `textColorClass` (`Digital.tsx:991-993`) sont calculés sans être utilisés ; imports ou déclarations sans usage : icônes `Filter` et `Eye`, `SITES`, `ActivityLog`, `SocialTarget`, `theme` (`Digital.tsx:1614`), `isExternal` (`Digital.tsx:1700`).
- [ ] **Tuiles du Planning** en `cursor-pointer` sans aucune action au clic ; l'infobulle ne sort qu'au survol, donc elle est inaccessible au toucher.
- [ ] **Réseaux non dédoublonnés** dans l'infobulle et dans la liste mobile du Planning (`Digital.tsx:2070`, `Digital.tsx:2285`), contrairement aux vues Mois et Semaine.
- [ ] **Résumé des filtres** (barre repliée) : affiche `filterBrand` brut, donc « Holding » au lieu de « GROUPE BONY » (`Digital.tsx:2407`).
- [ ] Deux options « Tous Services » dans le filtre Service (`All` et la valeur `Tous Services`).
- [ ] `confirmCreatePost` fait `setPosts([created, ...posts])` depuis la closure et non depuis le miroir (`Digital.tsx:1960`).
- [ ] `loadData(true)` relance l'erreur des publications : un rechargement temps réel en échec produit une promesse rejetée non interceptée.
- [ ] `link` n'est validé ni par Prisma ni par la route (`BUGS-CONNUS.md:134`). Le garde n'existe qu'à l'affichage (`hrefSur`).
- [ ] Fiches ouvertes à reprendre en recette v2 : branche FICHIER de la modale Médias jamais rejouée (`BUGS-CONNUS.md:110`) ; rôles Site Manager et External non parcourus (`:111`, `:129`, `:133`) ; mention LOM de 80 caractères = la limite exacte (`:138`) ; filtre de recherche persistant en sessionStorage (`:128`).
