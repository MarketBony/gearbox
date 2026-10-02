import { newDef, applyAmbiance, type BonyFormDef, type Field, type FieldType } from '../../../../shared/bonyform';
import { newField, newOption } from './catalog';

// =====================================================================
// Modèles de formulaires Forms Bony (lot F2b, 01/10/2026). Construits avec les MÊMES fabriques que
// l'éditeur (newField, newOption) : identifiants neufs à chaque création, rien de figé à recopier.
// =====================================================================

type Patch = Partial<Field> & { opts?: (string | [string, string])[] };
/** Champ d'un type, retouché ; `opts` = libellés d'options (ou [emoji, libellé] pour des tuiles). */
function F(t: FieldType, p: Patch = {}): Field {
  const f = newField(t), { opts, ...rest } = p;
  if (opts) f.options = opts.map((o) => { if (Array.isArray(o)) { const x = newOption(o[1]); x.emoji = o[0]; return x; } return newOption(o); });
  return Object.assign(f, rest);
}

export interface Template { id: string; l: string; d: string; icon: string; build: (title: string) => BonyFormDef }

export const TEMPLATES: Template[] = [
  { id: 'blank', l: 'Formulaire vierge', d: 'On part de zéro.', icon: 'plus', build: (title) => newDef(title) },
  {
    id: 'contest', l: 'Jeu-concours', d: 'Accueil, coordonnées, question à tuiles, règlement et consentement.', icon: 'gift',
    build: (title) => {
      const d = newDef(title);
      d.description = 'Tentez votre chance : tirage au sort parmi les participants.';
      d.fields = [
        F('short', { label: 'Prénom', required: true, width: 'half' }), F('short', { label: 'Nom', required: true, width: 'half' }),
        F('email', { unique: true, width: 'half' }), F('phone', { width: 'half' }),
        F('concession', { label: 'Votre concession la plus proche', required: true }),
        F('choice', { label: 'Quel univers vous fait rêver ?', required: true, display: 'tiles', columns: 2, opts: [['⚡', 'Électrique'], ['🏔️', 'Aventure'], ['🏁', 'Sportive'], ['👨‍👩‍👧', 'Famille']] }),
        F('consent', { label: 'Règlement', consentText: 'J’ai lu et j’accepte le règlement du jeu-concours.' }),
        F('consent', { label: 'Consentement', required: false, consentText: 'J’accepte de recevoir les offres et invitations de Bony auto-mobile (facultatif).' }),
      ];
      d.settings.welcome = { enabled: true, title: 'Participez et gagnez !', message: 'Deux minutes pour tenter votre chance.', button: 'Je participe' };
      d.settings.thankYou = { title: 'Participation enregistrée !', message: 'Bonne chance : le gagnant sera contacté par e-mail.', button: { label: 'Découvrir nos véhicules', url: 'https://www.bonyauto-mobile.com' } };
      return d;
    },
  },
  {
    id: 'event', l: 'Inscription à un événement', d: 'Portes ouvertes, soirée client, lancement : coordonnées, accompagnants, moment de venue.', icon: 'agenda',
    build: (title) => {
      const d = newDef(title);
      d.description = 'Réservez votre place, nous vous attendons.';
      d.fields = [
        F('short', { label: 'Prénom', required: true, width: 'half' }), F('short', { label: 'Nom', required: true, width: 'half' }),
        F('email', { width: 'half' }), F('phone', { required: true, width: 'half' }),
        F('concession', { required: true }),
        F('number', { label: 'Nombre de personnes (vous compris)', required: true, min: 1, max: 10 }),
        F('choice', { label: 'Quand pensez-vous venir ?', required: true, opts: ['Matin', 'Midi', 'Après-midi'] }),
        F('consent'),
      ];
      d.settings.thankYou = { title: 'Inscription confirmée !', message: 'Merci, nous avons hâte de vous accueillir.' };
      return d;
    },
  },
  {
    id: 'nps', l: 'Satisfaction après-vente', d: 'NPS, notes, commentaire : une question par écran, au clavier.', icon: 'star',
    build: (title) => {
      const d = newDef(title);
      d.theme.layout = 'steps';
      d.description = 'Votre avis nous aide à mieux vous servir.';
      d.fields = [
        F('concession', { label: 'Dans quelle concession êtes-vous venu ?', required: true }),
        F('nps', { required: true }),
        F('rating', { label: 'Comment jugez-vous l’accueil ?', required: true }),
        F('choice', { label: 'Votre véhicule était-il prêt à l’heure ?', required: true, opts: ['Oui', 'Avec un peu de retard', 'Non'] }),
        F('long', { label: 'Un mot pour l’équipe ?', placeholder: 'Ce qui vous a plu, ce qu’on peut améliorer…' }),
        F('hidden', { label: 'E-mail (depuis le lien)', param: 'email' }),
      ];
      d.settings.welcome = { enabled: true, title: 'Votre avis compte', message: 'Cinq questions, une minute.', button: 'C’est parti' };
      d.settings.thankYou = { title: 'Merci pour votre retour !', message: 'Chaque avis est lu par l’équipe de votre concession.' };
      return d;
    },
  },
  {
    id: 'lead', l: 'Demande de contact / devis', d: 'Projet en tuiles, marque, coordonnées complètes, message.', icon: 'handshake',
    build: (title) => {
      const d = newDef(title);
      d.description = 'Un conseiller vous recontacte sous 24 h ouvrées.';
      d.fields = [
        F('choice', { label: 'Votre projet', required: true, display: 'tiles', columns: 4, opts: [['🚗', 'Véhicule neuf'], ['🔑', 'Occasion'], ['🔄', 'Reprise'], ['🔧', 'Entretien']] }),
        F('brand', { label: 'Marque qui vous intéresse' }),
        F('short', { label: 'Prénom', required: true, width: 'half' }), F('short', { label: 'Nom', required: true, width: 'half' }),
        F('email', { width: 'half' }), F('phone', { required: true, width: 'half' }),
        F('postal', { width: 'half' }), F('concession', { width: 'half' }),
        F('long', { label: 'Votre message', placeholder: 'Modèle, budget, délai…' }),
        F('consent'),
      ];
      d.settings.thankYou = { title: 'Demande envoyée !', message: 'Un conseiller vous recontacte très vite.' };
      return d;
    },
  },
  {
    id: 'alpine', l: 'Invitation Alpine', d: 'Ambiance Alpine, une question par écran : un formulaire premium prêt à envoyer.', icon: 'car',
    build: (title) => {
      const d = newDef(title);
      d.theme = applyAmbiance(d.theme, 'alpine');
      d.theme.layout = 'steps';
      d.fields = [
        F('short', { label: 'Votre prénom', required: true }),
        F('short', { label: 'Votre nom', required: true }),
        F('email'),
        F('phone', { required: true }),
        F('choice', { label: 'Le modèle que vous souhaitez découvrir', required: true, opts: ['A110', 'A290', 'A390'] }),
        F('consent'),
      ];
      d.settings.welcome = { enabled: true, title: 'Vous êtes invité', message: 'Découvrez la gamme Alpine en avant-première.', button: 'Je réponds' };
      d.settings.thankYou = { title: 'À très bientôt', message: 'Votre invitation est confirmée.' };
      return d;
    },
  },
];
