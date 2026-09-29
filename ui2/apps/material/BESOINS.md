# Matériel — besoins partagés (à traiter à l'intégration)

## 1. Journal d'activité partagé
- **Quoi** : une fonction exportée `logActivity(action: string, entity: ActivityLog['entity'], entityName: string, entityId?: string)`
  dans `ui2/store/workspace.ts` (celle qui existe n'est pas exportée et ne sert qu'aux projets).
- **Pourquoi** : la page actuelle journalise chaque action (« a ajouté le matériel », « a créé une réservation
  matériel »…, entités `equipment` / `booking`). Sans fonction partagée, chaque rubrique recopie la charge.
- **Bouchon** : `// BESOIN:` dans `MaterialApp.tsx` — même appel `db.logActivity(...)` que `pages/Material.tsx`
  (une écriture, pas une lecture), même charge mot pour mot.

## 2. Primitive « onglets » (`.tabs` + encre)
- **Quoi** : `Tabs` dans `ui2/apps/ui/kit.tsx`, sur le modèle de `Seg` (rend lui-même `.ink` et le place).
- **Pourquoi** : la maquette utilise `.tabs` (Planning / Inventaire) ; le kit n'a que le segmenté.
- **Bouchon** : balisage rendu dans `MaterialApp.tsx` avec `<span className="ink" />`, placé par
  `gx().ui.refresh()` au changement d'onglet ; le clic est aussi vu par la délégation du moteur (sans effet
  de bord : elle pose le même `aria-selected`).

## 3. Déclaration de la rubrique
- `ui2/apps/ids.ts` : ajouter `'material'` à `PORTED_IDS` ; `ui2/apps/registry.tsx` : `material: MaterialApp`.
- Vérifier que l'ouverture depuis une activité (`entity` `equipment` / `booking`, `Sidebar.tsx:163-166`)
  mène bien à la fenêtre `material` de la coque.

## 4. À trancher (hors portage, signalé par l'inventaire § 11)
- **API des réservations ouverte à tous les comptes** (`routes/equipmentBookings.ts` sans `requireRole`) :
  un chef de site (lecture seule partout) ou un externe peut réserver / modifier / supprimer par appel
  direct. L'interface v2 ne leur montre pas la rubrique (même garde-fou que la maquette), mais le
  cloisonnement doit être côté serveur (CLAUDE.md, « Rôles cloisonnés »).
- **Invité** : peut réserver et supprimer (comportement actuel, conservé : on n'invente pas de règle).
- **Baisse de `totalQuantity`** sans contrôle des réservations existantes (conservé tel quel).
