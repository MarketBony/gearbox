// =====================================================================
// Forms Bony — catalogue des types de champs de l'éditeur (01/10/2026). Logique pure.
// Le FORMAT (ce qu'un champ contient) est dans shared/bonyform.ts ; ici : libellés, icônes,
// familles et champs vierges proposés par l'éditeur.
// =====================================================================
import { SITES, BRANDS } from '../../../../constants';
import type { Field, FieldType, Option } from '../../../../shared/bonyform';

export interface TypeDef { t: FieldType; l: string; icon: string; g: 'Saisie' | 'Choix' | 'Échelles' | 'Bony' | 'Mise en page' | 'Spécial'; hint: string }
export const TYPES: TypeDef[] = [
  { t: 'short', l: 'Réponse courte', icon: 'edit', g: 'Saisie', hint: 'Une ligne de texte' },
  { t: 'long', l: 'Paragraphe', icon: 'list', g: 'Saisie', hint: 'Texte long' },
  { t: 'email', l: 'E-mail', icon: 'mail', g: 'Saisie', hint: 'Adresse vérifiée' },
  { t: 'phone', l: 'Téléphone', icon: 'sms', g: 'Saisie', hint: 'Numéro vérifié' },
  { t: 'number', l: 'Nombre', icon: 'grid', g: 'Saisie', hint: 'Avec minimum et maximum' },
  { t: 'postal', l: 'Code postal', icon: 'pin', g: 'Saisie', hint: '5 chiffres' },
  { t: 'date', l: 'Date', icon: 'agenda', g: 'Saisie', hint: 'Calendrier' },
  { t: 'time', l: 'Heure', icon: 'clock', g: 'Saisie', hint: 'hh:mm' },
  { t: 'choice', l: 'Choix unique', icon: 'target', g: 'Choix', hint: 'Une réponse parmi plusieurs' },
  { t: 'multi', l: 'Choix multiples', icon: 'kanban', g: 'Choix', hint: 'Plusieurs réponses' },
  { t: 'dropdown', l: 'Liste déroulante', icon: 'chevdown', g: 'Choix', hint: 'Longue liste compacte' },
  { t: 'scale', l: 'Échelle', icon: 'sliders', g: 'Échelles', hint: 'De 1 à 5, de 0 à 10…' },
  { t: 'rating', l: 'Note', icon: 'star', g: 'Échelles', hint: 'Étoiles, cœurs, pouces' },
  { t: 'nps', l: 'Recommandation (NPS)', icon: 'trending', g: 'Échelles', hint: '0 à 10, « nous recommanderiez-vous ? »' },
  { t: 'concession', l: 'Concession', icon: 'building', g: 'Bony', hint: 'Liste des sites tenue par Gearbox' },
  { t: 'brand', l: 'Marque', icon: 'car', g: 'Bony', hint: 'Renault, Dacia, Alpine, Nissan, Mobilize' },
  { t: 'consent', l: 'Consentement RGPD', icon: 'lock', g: 'Spécial', hint: 'Case d’accord avec texte légal' },
  { t: 'hidden', l: 'Champ caché', icon: 'eye', g: 'Spécial', hint: 'Rempli par le lien de l’e-mailing' },
  { t: 'statement', l: 'Texte', icon: 'info', g: 'Mise en page', hint: 'Paragraphe d’information' },
  { t: 'section', l: 'Section', icon: 'layers', g: 'Mise en page', hint: 'Titre de partie (écran suivant en mode étapes)' },
];
export const typeDef = (t: FieldType) => TYPES.find((x) => x.t === t) || { t, l: t, icon: 'edit', g: 'Spécial', hint: '' } as TypeDef;

const rid = (p: string, n = 6) => p + Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
export const newFieldId = () => rid('f');
export const newOption = (label: string): Option => ({ id: rid('o', 5), label });
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'option';

/** Listes tenues par Gearbox (aperçu de l'éditeur ; le serveur les remplit à la publication, même calcul). */
export const bonyOptions = (t: FieldType): Option[] | undefined =>
  t === 'concession' ? SITES.map((s) => ({ id: slug(s), label: s }))
  : t === 'brand' ? BRANDS.filter((b) => b !== 'Holding').map((b) => ({ id: slug(b), label: b }))
  : undefined;

export function newField(t: FieldType): Field {
  const f: Field = { id: newFieldId(), type: t, label: '' };
  switch (t) {
    case 'short': f.label = 'Votre réponse'; break;
    case 'long': f.label = 'Votre message'; break;
    case 'email': f.label = 'Votre adresse e-mail'; f.required = true; f.param = 'email'; break;
    case 'phone': f.label = 'Votre téléphone'; break;
    case 'number': f.label = 'Nombre'; break;
    case 'postal': f.label = 'Code postal'; break;
    case 'date': f.label = 'Date'; break;
    case 'time': f.label = 'Heure'; break;
    case 'choice': case 'multi': case 'dropdown': f.label = 'Votre choix'; f.options = [newOption('Option 1'), newOption('Option 2')]; break;
    case 'scale': f.label = 'Votre avis'; f.min = 1; f.max = 5; break;
    case 'rating': f.label = 'Votre note'; f.max = 5; f.icon = 'star'; break;
    case 'nps': f.label = 'Recommanderiez-vous Bony à un proche ?'; break;
    case 'concession': f.label = 'Votre concession'; f.options = bonyOptions('concession'); f.param = 'concession'; break;
    case 'brand': f.label = 'Marque'; f.options = bonyOptions('brand'); break;
    case 'consent': f.label = 'Consentement'; f.required = true; f.consentText = 'J’accepte que Bony Automobiles utilise mes données pour traiter ma demande et me recontacter. Je peux exercer mes droits d’accès, de rectification et d’effacement en écrivant à marketbony@gmail.com.'; break;
    case 'hidden': f.label = 'Source'; f.param = 'source'; break;
    case 'statement': f.label = 'Information'; f.help = 'Texte affiché aux répondants.'; break;
    case 'section': f.label = 'Nouvelle partie'; break;
  }
  return f;
}

/** Copie d'un champ (nouveaux identifiants ; les options gardent les leurs, propres au champ). */
export function copyField(f: Field): Field {
  const c: Field = JSON.parse(JSON.stringify(f));
  c.id = newFieldId();
  if (c.options && c.type !== 'concession' && c.type !== 'brand') c.options = c.options.map((o) => ({ ...o, id: rid('o', 5) }));
  c.label = c.label ? `${c.label} (copie)` : c.label;
  return c;
}
