// ─────────────────────────────────────────────────────────────────────────────
// Contenu fr (Français) des modules, traductions natives.
//
// Les clés du Record = slug pt-br canonique (identique à pt-br.ts). Le champ
// `slug` de chaque module définit l'adresse en français (/fr/<slug>) via le
// slugRegistry.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ClipboardList,
  ShieldCheck,
  Users,
  Wallet,
  Clock,
  FileText,
  UserCircle,
  Boxes,
  FileSignature,
  MapPin,
  Wrench,
  Calendar,
  RefreshCw,
  BarChart3,
  Smartphone,
  Download,
  Camera,
  PenLine,
  CheckSquare,
  QrCode,
  TrendingUp,
  Receipt,
  CreditCard,
  Landmark,
  CalendarClock,
  HandCoins,
  Banknote,
  FileCheck2,
  Building2,
  Package,
  PackageMinus,
  Route as RouteIcon,
  Navigation,
  Gauge,
  Calculator,
  BookOpen,
  Eye,
  Send,
  Repeat,
} from 'lucide-react';
import type { ModuleContentMap } from './types';


const fr: ModuleContentMap = {
  // ────────────────────────────────────────────────────────────────────────
  // 1. Ordre de travail numérique
  // ────────────────────────────────────────────────────────────────────────
  'os-digital': {
    slug: 'logiciel-ordres-de-travail',
    metaTitle: 'Logiciel d\'ordres de travail pour les équipes de terrain | Dominex',
    metaDescription:
      'Logiciel d\'ordres de travail pour les équipes de terrain : l\'ordre de travail sur le téléphone du technicien, checklists, photos avant et après, signature du client, application installable, planification et rapport PDF automatique. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Ordres de travail numériques',
      h1: 'Logiciel d\'ordres de travail pour les équipes de terrain',
      h1Highlight: 'ordre de travail numérique',
      subtitle:
        'Fini les ordres de travail papier qui se perdent, arrivent en retard et n\'ont aucune photo. Dominex met l\'ordre de travail sur le téléphone de votre technicien, avec une checklist, des photos, une signature et un rapport prêt sur place, directement sur le terrain.',
    },
    metrics: [
      { value: '50k+', label: 'ordres de travail par mois sur la plateforme' },
      { value: 'Zéro papier', label: 'ordres de travail créés, exécutés et clôturés dans l\'application' },
      { value: 'Sur le téléphone', label: 'ordres de travail complétés par le technicien sur le terrain' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Les ordres de travail papier vous coûtent chaque jour',
    painsSubheading: 'Là où l\'ordre de travail sombre dans l\'improvisation, Dominex rétablit le contrôle',
    pains: [
      {
        pain: '« Où est l\'ordre de travail de l\'intervention d\'hier ? »',
        solution:
          'Chaque ordre de travail est enregistré dans le système, lié au client, à l\'équipement et au technicien responsable. Cherchez par numéro, client ou statut et ouvrez l\'historique complet en quelques secondes.',
      },
      {
        pain: 'Le technicien a terminé l\'intervention mais n\'a pris aucune photo ni recueilli de signature',
        solution:
          'L\'application impose les étapes : photos avant et après, checklist complétée et signature du client à l\'écran. Rien n\'est clôturé à moitié, et vous avez la preuve du travail réalisé.',
      },
      {
        pain: 'Rapport de visite tapé des heures plus tard, en fin de journée',
        solution:
          'Dès que le technicien termine l\'ordre de travail sur le terrain, un rapport PDF à votre image est prêt, avec photos, checklist et signature. Vous l\'envoyez au client aussitôt, sans reprise au bureau.',
      },
      {
        pain: 'Interventions distribuées par messagerie et personne ne sait ce qui est en attente',
        solution:
          'Le tableau de bord affiche chaque ordre de travail par statut : ouvert, en cours, terminé. Vous affectez chacun au bon technicien et suivez toute l\'opération sans passer d\'appels.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'L\'ordre de travail complet dans la main du technicien',
        body: 'Le technicien ouvre l\'application, voit la file d\'interventions du jour, sélectionne l\'ordre de travail et obtient tout : coordonnées du client, adresse sur une carte, équipement, historique des visites précédentes et ce qui doit être fait. Il exécute l\'intervention, la consigne et clôture le service sans retourner au bureau ni appeler pour obtenir des informations.',
        image: {
          src: '/modulos/os-digital/1.webp',
          alt: 'Deux techniciens de terrain près du fourgon consultant un ordre de travail sur une tablette',
        },
      },
      {
        icon: Download,
        title: 'Application installable sur le téléphone du technicien',
        body: 'Dominex est une application installable (PWA) sur le téléphone du technicien, sans avoir à la télécharger depuis un magasin d\'applications. L\'équipe ouvre l\'ordre de travail, prend des photos, remplit la checklist et recueille la signature du client directement depuis le téléphone, sur le terrain. Tout ce que le technicien consigne apparaît instantanément pour le suivi au bureau.',
        image: {
          src: '/modulos/os-digital/2.webp',
          alt: 'Technicien en équipement de sécurité utilisant un téléphone sur un chantier sur le terrain',
        },
      },
      {
        icon: FileSignature,
        title: 'Checklist, photos et signature génèrent le rapport sur place',
        body: 'Créez des checklists par type de service, capturez des photos avant et après et recueillez la signature du client directement à l\'écran. Une fois l\'intervention terminée, le rapport PDF de l\'ordre de travail à votre logo et à vos couleurs est prêt à envoyer. Le client reçoit un document professionnel, et vous avez la preuve de chaque étape de l\'intervention.',
        image: {
          src: '/modulos/os-digital/3.webp',
          alt: 'Technicien tenant une planchette à pince avec une checklist d\'inspection et un stylo',
        },
      },
    ],
    featuresHeading: 'Tout ce dont votre ordre de travail a besoin, au même endroit',
    featuresSubheading: 'De la demande au rapport, les ordres de travail numériques couvrent chaque étape',
    features: [
      { icon: ClipboardList, title: 'Création rapide d\'ordres de travail', desc: 'Ouvrez des ordres d\'installation, de maintenance et de réparation en quelques secondes, déjà liés au client et à l\'équipement.' },
      { icon: CheckSquare, title: 'Checklist par service', desc: 'Des modèles de checklist par type de service maintiennent chaque visite sur la bonne voie.' },
      { icon: Camera, title: 'Photos avant et après', desc: 'Les preuves photo jointes à l\'ordre de travail attestent l\'état de l\'intervention et protègent votre entreprise.' },
      { icon: PenLine, title: 'Signature du client', desc: 'Le client signe sur l\'écran du téléphone et la signature entre dans le rapport final.' },
      { icon: Download, title: 'Application installable', desc: 'Installez Dominex sur le téléphone du technicien, comme une application, sans magasin d\'applications.' },
      { icon: Calendar, title: 'Planification et répartition', desc: 'Voyez la file du jour et affectez chaque intervention au technicien le plus proche, sans conflit d\'horaire.' },
      { icon: FileSignature, title: 'Rapport automatique', desc: 'Un PDF à votre image prêt dès la fin de l\'intervention, avec photos, checklist et signature.' },
      { icon: BarChart3, title: 'Tableau de bord des statuts', desc: 'Ordres de travail ouverts, en cours et terminés en vue en direct de votre opération.' },
      { icon: Smartphone, title: 'Réponse vidéo dans la checklist', desc: 'Avec les offres Pro et Business, le technicien enregistre un court clip (jusqu\'à 15 s) comme réponse de checklist, sur le terrain. Le client voit la vidéo dans le lien de l\'ordre de travail.' },
    ],
    testimonialsHeading: 'Personne ne revient au papier après être passé au numérique',
    testimonials: [
      { quote: 'Les ordres de travail papier se perdaient et les clients demandaient des photos que personne n\'avait prises. Maintenant tout vit dans l\'application, avec la signature et le rapport sur place.', name: 'Carlos M.', role: 'Responsable des opérations', company: 'entreprise de maintenance' },
      { quote: 'Le technicien arrive chez le client et voit déjà l\'historique. Fini le « laissez-moi appeler le bureau pour confirmer ».', name: 'Roberta S.', role: 'Coordinatrice technique', company: 'services de réparation' },
      { quote: 'Le rapport à notre image sur place a changé l\'image de l\'entreprise. Les clients ont plus confiance dans le service.', name: 'André P.', role: 'Fondateur', company: 'services de terrain' },
    ],
    faq: [
      { q: 'Qu\'est-ce qu\'un ordre de travail numérique ?', a: 'C\'est un ordre de travail créé, exécuté et clôturé directement dans le système et dans l\'application du technicien, sans papier. Toute la visite, checklist, photos avant et après, signature du client et rapport, est enregistrée dans Dominex et liée au client et à l\'équipement.' },
      { q: 'Le technicien utilise-t-il l\'ordre de travail sur son téléphone ? Doit-il installer un logiciel ?', a: 'Dominex est une application installable (PWA) sur le téléphone du technicien, sans téléchargement depuis un magasin d\'applications. Sur le terrain, il ouvre l\'ordre de travail, prend des photos, remplit la checklist et recueille la signature du client directement depuis le téléphone, et tout ce qu\'il consigne apparaît instantanément pour le bureau.' },
      { q: 'Puis-je joindre des photos et recueillir la signature du client sur l\'ordre de travail ?', a: 'Oui. Chaque ordre de travail accepte des photos avant et après et la signature du client capturée sur l\'écran du téléphone. Tout cela entre dans le rapport PDF final.' },
      { q: 'Le système génère-t-il les rapports d\'ordre de travail automatiquement ?', a: 'Oui. Une fois l\'ordre de travail terminé, le rapport PDF à votre logo et à vos couleurs est prêt, avec la checklist complétée, les photos et la signature. Vous l\'envoyez au client aussitôt.' },
      { q: 'Puis-je utiliser des checklists différentes par type de service ?', a: 'Oui. Vous créez des modèles de checklist par type de service (installation, préventif, correctif) et le technicien suit les bonnes étapes à chaque visite.' },
      { q: 'Comment répartir les ordres de travail à mon équipe ?', a: 'Sur le tableau de bord, vous voyez la file du jour et affectez chaque ordre de travail au technicien responsable, en suivant le statut (ouvert, en cours, terminé) en temps réel.' },
      { q: 'Le technicien peut-il répondre à une question de checklist par vidéo ?', a: 'Oui, avec les offres Pro et Business. Le technicien enregistre un court clip de 15 secondes maximum directement depuis son téléphone sur le terrain, en guise de réponse à une question de checklist. La vidéo est sauvegardée dans l\'ordre de travail et le client peut la visionner via le lien de l\'ordre de travail.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes et commencez à ouvrir des ordres de travail dans l\'application.' },
    ],
    finalCta: {
      title: 'Passez vos ordres de travail au numérique',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Sortez les ordres de travail du papier et donnez le contrôle à votre équipe de terrain.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 2. Plan de maintenance préventive CVC
  // ────────────────────────────────────────────────────────────────────────
  'sistema-pmoc': {
    slug: 'logiciel-maintenance-preventive-cvc',
    metaTitle: 'Logiciel de plan de maintenance préventive CVC | Dominex',
    metaDescription:
      'Logiciel de plan de maintenance préventive CVC : un plan de maintenance par unité d\'équipement, visites récurrentes automatiques, une checklist par machine, un rapport de maintenance prêt pour l\'audit et un QR code sur chaque unité. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Plans de maintenance automatiques',
      h1: 'Logiciel de plan de maintenance préventive CVC',
      h1Highlight: 'plan de maintenance CVC',
      subtitle:
        'Arrêtez de bâtir votre plan de maintenance dans un tableur à part. Dominex génère un plan de maintenance préventive par unité d\'équipement, planifie les visites tout seul et fournit un rapport prêt pour tout audit ou toute inspection.',
    },
    metrics: [
      { value: 'Par plan', label: 'un programme de maintenance conforme et prêt pour l\'audit' },
      { value: 'Par machine', label: 'un plan de maintenance individuel par unité' },
      { value: 'Automatique', label: 'visites récurrentes générées par le système' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Le plan de maintenance ne se fait pas à la va-vite',
    painsSubheading: 'Là où le tableur à part échoue, Dominex vous tient dans les temps',
    pains: [
      {
        pain: 'Un plan de maintenance bâti à la main, sans traçabilité et non conforme',
        solution:
          'Le système bâtit le programme de maintenance à partir des équipements du contrat, avec le technicien responsable, le cycle de visites et une checklist par machine.',
      },
      {
        pain: 'La visite de ce mois est passée à la trappe et le planning s\'est effondré',
        solution:
          'Les visites de maintenance sont générées automatiquement au bon cycle (mensuel, trimestriel, semestriel). Chacune naît avec la routine de maintenance de cette phase du plan.',
      },
      {
        pain: 'Un auditeur a demandé les registres de maintenance et vous n\'aviez aucun document prêt',
        solution:
          'Le rapport de maintenance et le registre de conformité sortent en PDF à votre image, avec ce qui a été fait à chaque visite et la signature du technicien responsable. Vous le présentez sur place.',
      },
      {
        pain: 'Vous ne connaissez pas l\'historique de maintenance de chaque machine',
        solution:
          'Le plan est par unité : chaque machine a son propre planning, sa propre checklist et son propre historique de visites. Un QR code sur l\'équipement mène directement au registre.',
      },
    ],
    deepDives: [
      {
        icon: RefreshCw,
        title: 'Un plan de maintenance automatique, prêt pour l\'audit',
        body: 'Le programme de maintenance préventive de vos systèmes de climatisation est bâti à partir des équipements du contrat. Dominex répartit les visites sur le cycle, construit la checklist de chaque visite selon la phase du plan, enregistre le technicien responsable et génère le registre de maintenance et le rapport de conformité prêts à présenter lors d\'un audit ou d\'une inspection, sans tableur à part.',
        image: {
          src: '/modulos/sistema-pmoc/1.webp',
          alt: 'Technicien CVC mesurant le fluide frigorigène avec des manomètres sur un condenseur de climatisation',
        },
      },
      {
        icon: Wrench,
        title: 'Un plan de maintenance par unité, non par contrat',
        body: 'Chaque machine (split, multi-split, VRF, groupe d\'eau glacée, ventilo-convecteur, monobloc) a son propre planning de maintenance, avec la routine adaptée à chaque visite du cycle de 12 mois. Les auditeurs et les clients voient exactement ce qui a été fait sur chaque unité, quand et par qui.',
        image: {
          src: '/modulos/sistema-pmoc/2.webp',
          alt: 'Technicien inspectant une unité de condensation de climatisation avec une lampe torche',
        },
      },
      {
        icon: QrCode,
        title: 'QR code sur l\'équipement et visites récurrentes',
        body: 'Collez un QR code sur la machine : le technicien pointe l\'appareil photo et arrive directement sur le registre de cette unité, avec son historique et la prochaine visite planifiée. Les visites récurrentes sont générées par le système au bon intervalle, avec la checklist prête, si bien que la maintenance préventive ne dépend jamais de la mémoire de qui que ce soit.',
        image: {
          src: '/modulos/sistema-pmoc/3.webp',
          alt: 'Technicien intervenant sur les raccords d\'une unité extérieure de climatisation split',
        },
      },
    ],
    featuresHeading: 'Un plan de maintenance complet, de la génération à l\'inspection',
    featuresSubheading: 'La conformité de la maintenance planifiée sans travail manuel',
    features: [
      { icon: RefreshCw, title: 'Génération automatique du plan', desc: 'Le plan est bâti à partir des équipements du contrat, avec le cycle de visites et le technicien responsable.' },
      { icon: Wrench, title: 'Plan par machine', desc: 'Un planning et une checklist individuels par unité, avec la bonne routine à chaque visite.' },
      { icon: Calendar, title: 'Visites récurrentes', desc: 'Le système planifie les visites de maintenance au bon intervalle, sans avoir à s\'en souvenir.' },
      { icon: CheckSquare, title: 'Checklist par phase', desc: 'Chaque visite du cycle de 12 mois porte la routine de maintenance correspondante.' },
      { icon: FileText, title: 'Rapport de conformité', desc: 'Le registre de maintenance et le rapport PDF prêts à présenter lors d\'un audit.' },
      { icon: QrCode, title: 'QR code sur l\'équipement', desc: 'Le technicien scanne et arrive directement sur l\'historique et la prochaine visite de la machine.' },
      { icon: FileSignature, title: 'Signature du technicien responsable', desc: 'Le technicien responsable signe les documents de maintenance, portant l\'identité de votre entreprise.' },
      { icon: ShieldCheck, title: 'Conformité de la maintenance planifiée', desc: 'Tout dans les temps et documenté pour vos systèmes de climatisation.' },
    ],
    testimonialsHeading: 'Le plan de maintenance a cessé d\'être un cauchemar',
    testimonials: [
      { quote: 'Le plan de maintenance, c\'était tableur sur tableur. Maintenant le système construit le planning et le rapport tout seul. Je l\'ai présenté à l\'audit sans transpirer.', name: 'Roberta S.', role: 'Technicienne responsable', company: 'CVC de bâtiment' },
      { quote: 'Un plan par machine a tout changé. Chaque unité a son propre historique et sa prochaine visite déjà planifiée.', name: 'Carlos M.', role: 'Responsable des opérations', company: 'réfrigération commerciale' },
      { quote: 'Le QR code sur l\'équipement a été une trouvaille. Le technicien pointe l\'appareil photo et il est déjà sur le bon registre.', name: 'André P.', role: 'Fondateur', company: 'maintenance de climatisation' },
    ],
    faq: [
      { q: 'Qu\'est-ce qu\'un plan de maintenance préventive et pourquoi est-il important ?', a: 'Un plan de maintenance préventive est le programme documenté de la maintenance planifiée de vos systèmes de climatisation. Il enregistre la maintenance préventive, le technicien responsable et l\'historique de chaque unité, si bien que vous restez dans les temps et disposez de la documentation prête dès qu\'un client ou un auditeur la demande.' },
      { q: 'Dominex génère-t-il le plan de maintenance automatiquement ?', a: 'Oui. Le système bâtit le plan à partir des équipements du contrat, répartit les visites sur le cycle, construit la checklist de chaque visite et génère le registre et le rapport de conformité prêts pour un audit, sans tableur à part.' },
      { q: 'Le plan de maintenance est-il par unité ou par contrat ?', a: 'Par unité. Chaque machine a son propre planning, sa checklist et son historique de visites, avec la routine adaptée à chaque phase du cycle de 12 mois.' },
      { q: 'Les visites de maintenance sont-elles planifiées toutes seules ?', a: 'Oui. Les visites récurrentes sont générées par le système au bon intervalle (mensuel, trimestriel, semestriel), avec la checklist de phase prête. La maintenance préventive ne dépend pas de la mémoire de l\'équipe.' },
      { q: 'Y a-t-il un QR code sur l\'équipement ?', a: 'Oui. Vous collez un QR code sur la machine et le technicien, en le scannant, arrive directement sur le registre de cette unité, avec son historique et la prochaine visite planifiée.' },
      { q: 'Le rapport de maintenance sort-il à mon image ?', a: 'Oui. Le registre de maintenance et le rapport de conformité sortent en PDF à votre logo et à vos couleurs, avec la signature du technicien responsable, prêts à remettre au client et à un auditeur.' },
      { q: 'Est-ce que ça fonctionne autant pour la réfrigération que pour la climatisation ?', a: 'Oui. Cela fonctionne pour les entreprises de CVC et de réfrigération qui entretiennent des unités split, multi-split, VRF, groupe d\'eau glacée, chambre froide, ventilo-convecteur et monobloc, avec un plan et un historique par unité.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous enregistrez les équipements, configurez le contrat et le plan de maintenance est généré automatiquement.' },
    ],
    finalCta: {
      title: 'Générez le plan de maintenance sans tableur à part',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Enregistrez les équipements et disposez du plan de maintenance prêt pour tout audit.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 3. CRM (clé du record = slug pt-br 'sistema-crm')
  // ────────────────────────────────────────────────────────────────────────
  'sistema-crm': {
    slug: 'crm-services-terrain',
    metaTitle: 'CRM pour les entreprises de services et de maintenance | Dominex',
    metaDescription:
      'CRM pour les entreprises de services et de maintenance : captez des leads, organisez votre pipeline commercial sur un tableau kanban, affectez chaque affaire à un commercial et passez du devis à la proposition au contrat, avec conversion directe en ordre de travail. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'CRM et ventes',
      h1: 'CRM pour les entreprises de services et de maintenance',
      h1Highlight: 'CRM',
      subtitle:
        'Un lead est arrivé par messagerie et s\'est éteint dans votre boîte de réception ? Le CRM Dominex organise votre pipeline commercial sur un tableau kanban, affecte chaque opportunité à un commercial et la mène du premier contact au contrat signé.',
    },
    metrics: [
      { value: 'Pipeline', label: 'opportunités organisées sur un tableau kanban' },
      { value: 'Lead à l\'ordre de travail', label: 'du premier contact à l\'intervention' },
      { value: 'Par commercial', label: 'affectation et suivi individuels' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Un lead qui ne devient pas une vente, c\'est de l\'argent laissé sur la table',
    painsSubheading: 'Là où le traitement se perd dans l\'improvisation, le CRM organise la conversion',
    pains: [
      {
        pain: 'Un lead arrive et personne ne sait qui le traite',
        solution:
          'Chaque opportunité entre dans le pipeline et est affectée à un commercial responsable. Vous voyez qui la traite, à quel stade elle se trouve et ce qu\'il reste pour conclure.',
      },
      {
        pain: 'Le pipeline vit dans la tête du commercial, sans aucune visibilité',
        solution:
          'Le pipeline kanban affiche chaque opportunité par stade, du premier contact à la conclusion. Vous voyez tout le pipeline et où l\'affaire cale.',
      },
      {
        pain: 'Devis, proposition et contrat éparpillés dans des fichiers isolés',
        solution:
          'Du lead naît le devis, qui devient la proposition puis le contrat au sein du même flux, rattachés à l\'opportunité. Tout est relié, sans fichier perdu dans une messagerie.',
      },
      {
        pain: 'Vous avez conclu la vente, mais l\'intervention est repartie de zéro',
        solution:
          'L\'opportunité gagnée devient un ordre de travail en un clic, portant les coordonnées du client et ce qui a été vendu. Les ventes et le terrain parlent le même langage.',
      },
    ],
    deepDives: [
      {
        icon: Users,
        title: 'Un pipeline commercial kanban, du lead au contrat',
        body: 'Captez le lead, consignez le contact et faites avancer l\'opportunité à travers les stades du pipeline en la glissant sur le tableau kanban : nouveau, en contact, devis, proposition, conclusion. Chaque carte affiche le client, la valeur estimée, le commercial responsable et l\'historique des interactions. Vous voyez tout le pipeline et agissez là où l\'affaire est bloquée.',
        image: {
          src: '/modulos/crm/1.webp',
          alt: 'Équipe commerciale en réunion au bureau examinant le pipeline avec un graphique de croissance',
        },
      },
      {
        icon: FileSignature,
        title: 'Devis à proposition à contrat dans le même flux',
        body: 'À partir de l\'opportunité, vous construisez le devis avec articles, main-d\'œuvre et matériaux, le transformez en proposition envoyée par lien et le concluez en contrat. Tout reste rattaché à l\'opportunité du CRM, si bien que le commercial suit l\'approbation et rien ne se perd entre « je vais y réfléchir » et « affaire conclue ».',
        image: {
          src: '/modulos/crm/2.webp',
          alt: 'Professionnels examinant un contrat et une proposition sur la table du bureau',
        },
      },
      {
        icon: TrendingUp,
        title: 'Conversion directe en ordre de travail',
        body: 'Une affaire gagnée ne repart pas de zéro : l\'opportunité devient un ordre de travail en un clic, portant le client, l\'adresse et le périmètre vendu sur le terrain. Les ventes concluent l\'affaire et l\'opération dispose déjà de tout pour exécuter l\'intervention, sans avoir à ressaisir quoi que ce soit.',
        image: {
          src: '/modulos/crm/3.webp',
          alt: 'Commercial concluant une affaire avec un client après la signature des documents',
        },
      },
    ],
    featuresHeading: 'Du lead au contrat, sans perdre une opportunité',
    featuresSubheading: 'Le CRM qui parle le même langage que votre opération de terrain',
    features: [
      { icon: Users, title: 'Captation de leads', desc: 'Consignez chaque contact entrant et ne laissez pas une opportunité mourir dans la boîte de réception.' },
      { icon: ClipboardList, title: 'Pipeline kanban', desc: 'Faites avancer les opportunités à travers les stades en les glissant, avec valeur et responsable visibles.' },
      { icon: UserCircle, title: 'Affectation à un commercial', desc: 'Chaque opportunité a un responsable et vous suivez la performance de chaque commercial.' },
      { icon: FileText, title: 'Devis intégrés', desc: 'Construisez le devis directement à partir de l\'opportunité, avec articles et main-d\'œuvre.' },
      { icon: Send, title: 'Propositions par lien', desc: 'Envoyez la proposition par lien et voyez quand le client l\'ouvre et l\'approuve.' },
      { icon: FileSignature, title: 'Contrats dans le flux', desc: 'Concluez l\'affaire en contrat au sein du même parcours CRM.' },
      { icon: TrendingUp, title: 'Conversion en ordre de travail', desc: 'L\'opportunité gagnée devient un ordre de travail en un clic.' },
      { icon: BarChart3, title: 'Vue du pipeline', desc: 'Suivez le pipeline, le taux de conversion et où l\'affaire cale.' },
    ],
    testimonialsHeading: 'Qui a organisé le pipeline conclut davantage',
    testimonials: [
      { quote: 'Les leads arrivaient et se perdaient dans la messagerie. Maintenant chaque opportunité a un responsable et un stade. On a cessé de laisser de l\'argent sur la table.', name: 'Juliana C.', role: 'Responsable des ventes', company: 'entreprise de services' },
      { quote: 'Le devis devient une proposition et un contrat sans changer de système. Et ce qui se conclut devient déjà un ordre de travail.', name: 'Marcelo T.', role: 'Associé', company: 'maintenance de bâtiment' },
      { quote: 'Pour la première fois, je vois tout le pipeline. Je sais où en est chaque affaire et ce qu\'il reste pour conclure.', name: 'Patrícia L.', role: 'Directrice', company: 'installations et services' },
    ],
    faq: [
      { q: 'Que fait le CRM Dominex ?', a: 'Il organise votre opération commerciale : il capte les leads, construit le pipeline commercial sur un tableau kanban, affecte chaque opportunité à un commercial et la mène du devis à la proposition au contrat, avec conversion directe en ordre de travail.' },
      { q: 'Comment fonctionne le pipeline commercial ?', a: 'Le pipeline est un kanban avec des stades (nouveau, en contact, devis, proposition, conclusion). Vous glissez chaque opportunité dans le bon stade et voyez le client, la valeur estimée et le responsable sur chaque carte.' },
      { q: 'Puis-je affecter des opportunités à des commerciaux ?', a: 'Oui. Chaque opportunité a un commercial responsable et vous suivez le pipeline et la performance de chacun.' },
      { q: 'Le CRM se connecte-t-il aux devis et aux contrats ?', a: 'Oui. À partir de l\'opportunité, vous construisez le devis, le transformez en proposition envoyée par lien et le concluez en contrat, le tout rattaché à l\'opportunité, sans fichiers isolés.' },
      { q: 'Quand je conclus la vente, dois-je ressaisir le client pour l\'ordre de travail ?', a: 'Non. L\'opportunité gagnée devient un ordre de travail en un clic, portant le client, l\'adresse et le périmètre vendu. Les ventes et le terrain travaillent avec les mêmes données.' },
      { q: 'Puis-je suivre le taux de conversion ?', a: 'Oui. Vous suivez le pipeline, voyez combien d\'opportunités avancent par stade et repérez où les affaires ont tendance à caler.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous ajoutez vos leads et commencez à organiser le pipeline commercial aussitôt.' },
    ],
    finalCta: {
      title: 'Organisez votre pipeline et concluez davantage',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Captez vos leads, organisez le pipeline et passez du lead au contrat.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 4. Gestion financière
  // ────────────────────────────────────────────────────────────────────────
  'controle-financeiro': {
    slug: 'logiciel-financier-services',
    metaTitle: 'Logiciel de gestion financière pour les entreprises de services | Dominex',
    metaDescription:
      'Logiciel de gestion financière pour les entreprises de services : comptes à payer et à recevoir, trésorerie, compte de résultat, gestion de carte bancaire et rapprochement. Sachez combien entre, combien sort et combien il reste. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Finance',
      h1: 'Logiciel de gestion financière pour les entreprises de services',
      h1Highlight: 'Gestion financière',
      subtitle:
        'Pas sûr que le mois se soit clôturé dans le vert ? Dominex organise les comptes à payer et à recevoir, affiche la trésorerie en temps réel et clôture le compte de résultat, si bien que vous décidez avec des chiffres, non à l\'intuition.',
    },
    metrics: [
      { value: 'À payer/recevoir', label: 'comptes organisés avec leurs échéances' },
      { value: 'Trésorerie', label: 'entrées et sorties d\'argent en temps réel' },
      { value: 'Compte de résultat', label: 'le résultat du mois clôturé automatiquement' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Décider au feeling vous coûte le bénéfice du mois',
    painsSubheading: 'Là où le tableur ne dit pas la vérité, Dominex affiche le chiffre',
    pains: [
      {
        pain: '« Y a-t-il assez d\'argent pour payer ça ? »',
        solution:
          'La trésorerie affiche, en temps réel, combien est entré, combien va sortir et le solde projeté. Vous décidez en regardant le chiffre, non sous le coup de la peur.',
      },
      {
        pain: 'Une facture oubliée se transforme en intérêts et pénalités',
        solution:
          'Les comptes à payer et à recevoir sont organisés par échéance, avec des alertes sur ce qui arrive à terme. Rien ne passe entre les mailles.',
      },
      {
        pain: 'Vous ne savez pas si le mois a fait un bénéfice ou une perte',
        solution:
          'Le compte de résultat se clôture automatiquement avec les recettes, coûts et dépenses catégorisés. Vous voyez le résultat du mois sans construire de tableur.',
      },
      {
        pain: 'La facture de carte bancaire mêlée à la trésorerie et personne ne comprend le solde',
        solution:
          'La carte bancaire reçoit son propre traitement : la dépense entre en prévision et c\'est le relevé agrégé qui devient réellement un paiement. Le solde cesse de mentir.',
      },
    ],
    deepDives: [
      {
        icon: CalendarClock,
        title: 'Comptes à payer et à recevoir sous contrôle',
        body: 'Saisissez chaque compte à payer et à recevoir avec son échéance, sa catégorie et son client ou fournisseur. Le système les organise par date, vous alerte sur ce qui arrive à terme et affiche ce qui a déjà été réglé. Vous cessez de payer des intérêts par oubli et facturez le client au bon jour.',
        image: {
          src: '/modulos/controle-financeiro/1.webp',
          alt: 'Mains utilisant une calculatrice sur un bureau avec des documents et des dossiers, organisant les comptes à payer et à recevoir',
        },
      },
      {
        icon: TrendingUp,
        title: 'Trésorerie et compte de résultat en temps réel',
        body: 'La trésorerie consolide les entrées et sorties d\'argent et projette le solde des jours à venir. Le compte de résultat clôture le mois avec recettes, coûts et dépenses catégorisés, affichant la marge réelle de l\'activité. Vous décidez chiffres en main, non au ressenti.',
        image: {
          src: '/modulos/controle-financeiro/2.webp',
          alt: 'Professionnel analysant des graphiques et rapports financiers, pointant les chiffres avec un crayon',
        },
      },
      {
        icon: CreditCard,
        title: 'Carte bancaire sans dérégler votre trésorerie',
        body: 'Dans Dominex, la dépense par carte bancaire entre en prévision, et ce qui devient réellement un paiement est le relevé agrégé, si bien que le solde de votre compte n\'apparaît jamais plus bas qu\'il ne l\'est réellement. Vous suivez le total du relevé par carte et rapprochez ce qui a été réellement dépensé, sans confondre une dépense avec un paiement.',
        image: {
          src: '/modulos/controle-financeiro/3.webp',
          alt: 'Personne effectuant un paiement sans contact avec une carte bancaire sur un terminal',
        },
      },
    ],
    featuresHeading: 'Les finances de votre entreprise, organisées',
    featuresSubheading: 'Sachez combien entre, combien sort et combien il reste',
    features: [
      { icon: CalendarClock, title: 'Comptes à payer', desc: 'Échéances organisées, avec des alertes sur ce qui arrive à terme.' },
      { icon: HandCoins, title: 'Comptes à recevoir', desc: 'Sachez ce que chaque client doit et facturez au bon jour.' },
      { icon: TrendingUp, title: 'Trésorerie', desc: 'Entrées, sorties et solde projeté en temps réel.' },
      { icon: BarChart3, title: 'Compte de résultat automatique', desc: 'Le résultat du mois avec recettes, coûts et dépenses catégorisés.' },
      { icon: CreditCard, title: 'Gestion de carte', desc: 'Dépense en prévision et relevé agrégé, sans dérégler le solde.' },
      { icon: Receipt, title: 'Catégories', desc: 'Classez chaque écriture et voyez où va l\'argent.' },
      { icon: Landmark, title: 'Comptes et banques', desc: 'Suivez le solde de chacun des comptes et caisses de l\'entreprise.' },
      { icon: FileCheck2, title: 'Rapprochement', desc: 'Rapprochez ce qui était prévu de ce qui est réellement entré et sorti.' },
    ],
    testimonialsHeading: 'Qui mesure décide mieux',
    testimonials: [
      { quote: 'Je clôturais le mois dans la panique. Maintenant je vois la trésorerie et le compte de résultat et je sais s\'il y a eu un bénéfice avant le comptable.', name: 'Rafael G.', role: 'Associé', company: 'entreprise de services' },
      { quote: 'Plus une facture ne passe entre les mailles. Le système m\'alerte et j\'ai cessé de payer des intérêts par oubli.', name: 'Camila V.', role: 'Finance', company: 'maintenance et installation' },
      { quote: 'Le relevé de carte déréglait mon solde. Maintenant la dépense est en prévision et c\'est le relevé qui compte. C\'est logique.', name: 'Lucas R.', role: 'Administrateur', company: 'services de terrain' },
    ],
    faq: [
      { q: 'Que fait la gestion financière de Dominex ?', a: 'Elle organise les comptes à payer et à recevoir, affiche la trésorerie en temps réel, clôture le compte de résultat du mois, traite la carte bancaire séparément et aide au rapprochement, si bien que vous décidez avec des chiffres, non à l\'intuition.' },
      { q: 'Comment fonctionne la trésorerie ?', a: 'La trésorerie consolide toutes les entrées et sorties d\'argent et projette le solde des jours à venir. Vous voyez combien est entré, combien va sortir et combien il reste, en temps réel.' },
      { q: 'Le système génère-t-il un compte de résultat ?', a: 'Oui. Le compte de résultat clôture le mois automatiquement avec recettes, coûts et dépenses catégorisés, affichant la marge réelle de l\'activité sans construire de tableur.' },
      { q: 'Comment Dominex gère-t-il la carte bancaire ?', a: 'La dépense par carte entre en prévision (non comme un paiement), et ce qui devient réellement un paiement est le relevé agrégé. Ainsi le solde de votre compte n\'apparaît jamais plus bas qu\'il ne l\'est réellement.' },
      { q: 'Puis-je gérer les comptes à payer et à recevoir avec leurs échéances ?', a: 'Oui. Chaque compte a une échéance, une catégorie et un client ou fournisseur. Le système les organise par date et vous alerte sur ce qui arrive à terme.' },
      { q: 'Puis-je suivre le solde de plusieurs comptes et caisses ?', a: 'Oui. Vous suivez le solde de chaque caisse et compte bancaire de l\'entreprise et rapprochez ce qui était prévu de ce qui est réellement entré et sorti.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous saisissez vos comptes et voyez la trésorerie et le résultat du mois aussitôt.' },
    ],
    finalCta: {
      title: 'Sachez si le mois s\'est clôturé dans le vert',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Organisez les comptes, voyez la trésorerie et clôturez le compte de résultat sans tableur.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 5. Pointage et paie (RH)
  // ────────────────────────────────────────────────────────────────────────
  'ponto-e-folha': {
    slug: 'logiciel-pointage-paie',
    metaTitle: 'Pointage et paie pour les équipes de terrain | Dominex',
    metaDescription:
      'Pointage et paie pour les équipes de terrain : pointage avec selfie et géolocalisation, solde d\'heures, paie, avances et gestion des salariés, le tout au même endroit. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Pointage et paie (RH)',
      h1: 'Pointage et paie pour les équipes de terrain',
      h1Highlight: 'Pointage et paie',
      subtitle:
        'Votre équipe commence la journée chez le client, non au bureau, donc une feuille de pointage papier ne suffit pas. Dominex pointe les heures avec selfie et localisation, calcule le solde d\'heures et clôture la paie avec les avances déduites.',
    },
    metrics: [
      { value: 'Selfie + GPS', label: 'heures pointées d\'où que soit le technicien' },
      { value: 'Solde d\'heures', label: 'heures supplémentaires et absences calculées toutes seules' },
      { value: 'Paie + avances', label: 'le mois clôturé par salarié' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Suivre les heures de gens qui vivent sur la route est difficile',
    painsSubheading: 'Là où la feuille de pointage papier n\'atteint pas, Dominex enregistre',
    pains: [
      {
        pain: 'Le technicien commence la journée chez le client et les heures ne sont pas enregistrées',
        solution:
          'Les heures sont pointées sur le téléphone, d\'où que soit le salarié, avec selfie et géolocalisation. Vous savez qui a pointé, à quelle heure et d\'où.',
      },
      {
        pain: 'Le solde d\'heures calculé à la main, toujours avec des erreurs',
        solution:
          'Le système calcule les heures travaillées, les heures supplémentaires et les absences à partir des pointages. Le solde d\'heures se clôture tout seul, sans tableur.',
      },
      {
        pain: 'Une avance versée à la volée et oubliée à la clôture de la paie',
        solution:
          'Chaque avance est enregistrée et déduite automatiquement du bulletin de paie. La paie se clôture avec le net correct.',
      },
      {
        pain: 'Données des salariés éparpillées sur des papiers et des messages',
        solution:
          'La fiche du salarié centralise salaire, poste, avances et relevé. Vous voyez la situation financière de chaque personne en un seul endroit.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'Pointez avec selfie et géolocalisation',
        body: 'Le salarié pointe l\'entrée, la sortie et les pauses sur son téléphone, d\'où qu\'il soit. Chaque pointage enregistre un selfie et la localisation, si bien que vous pouvez prouver qui a pointé et d\'où, idéal pour les équipes qui commencent la journée directement chez le client sans passer par l\'entreprise.',
        image: {
          src: '/modulos/ponto-e-folha/1.webp',
          alt: 'Travailleur de terrain en équipement de sécurité consultant un téléphone sur un chantier',
        },
      },
      {
        icon: Clock,
        title: 'Le solde d\'heures calculé tout seul',
        body: 'À partir des pointages, le système calcule les heures travaillées, les heures supplémentaires et les absences, en tenant le solde d\'heures à jour. En fin de mois, vous avez le solde de chaque salarié prêt, sans rien additionner à la main ni vous battre avec un tableur.',
        image: {
          src: '/modulos/ponto-e-folha/2.webp',
          alt: 'Responsable assis à un bureau examinant des informations sur une planchette à pince au bureau',
        },
      },
      {
        icon: Banknote,
        title: 'Paie avec avances déduites',
        body: 'La clôture de la paie consolide salaire, solde d\'heures et avances que le salarié a prises pendant le mois, les déduisant automatiquement du net. Le bulletin de paie et le reçu d\'avance sortent prêts, et le relevé du salarié affiche chaque entrée et sortie avec le bon signe.',
        image: {
          src: '/modulos/ponto-e-folha/3.webp',
          alt: 'Femme comptant des espèces au bureau, clôturant la paie',
        },
      },
    ],
    featuresHeading: 'Le RH de votre opération de terrain, au même endroit',
    featuresSubheading: 'Du pointage sur la route à la clôture de la paie',
    features: [
      { icon: Smartphone, title: 'Pointage par téléphone', desc: 'Pointez l\'entrée, la sortie et les pauses d\'où que soit le salarié.' },
      { icon: Camera, title: 'Selfie au pointage', desc: 'Chaque pointage enregistre un selfie, prouvant qui a pointé.' },
      { icon: MapPin, title: 'Géolocalisation', desc: 'La localisation du pointage est enregistrée avec l\'écriture.' },
      { icon: Clock, title: 'Solde d\'heures', desc: 'Heures supplémentaires et absences calculées à partir des pointages, sans tableur.' },
      { icon: Banknote, title: 'Paie', desc: 'Clôturez par salarié avec le bulletin de paie prêt.' },
      { icon: HandCoins, title: 'Avances déduites', desc: 'Chaque avance enregistrée est déduite du bulletin de paie.' },
      { icon: Users, title: 'Fiches des salariés', desc: 'Salaire, poste, avances et relevé centralisés par personne.' },
      { icon: FileText, title: 'Relevé du salarié', desc: 'Entrées et sorties sur des cartes, avec le bon signe sur chacune.' },
    ],
    testimonialsHeading: 'Qui contrôle les heures clôture la paie en toute tranquillité',
    testimonials: [
      { quote: 'Mon équipe commence la journée chez le client. Avec le pointage selfie et GPS, je sais qui a commencé et d\'où, sans papier.', name: 'Diego F.', role: 'Responsable', company: 'services de terrain' },
      { quote: 'Le solde d\'heures était un casse-tête mensuel. Maintenant il se clôture tout seul à partir des pointages.', name: 'Aline R.', role: 'RH', company: 'maintenance de bâtiment' },
      { quote: 'On versait des avances et on les oubliait à la clôture. Maintenant elles sont déduites automatiquement sur la paie. Le net tombe juste.', name: 'Thiago P.', role: 'Administrateur', company: 'installations électriques' },
    ],
    faq: [
      { q: 'Comment fonctionne le pointage Dominex ?', a: 'Le salarié pointe l\'entrée, la sortie et les pauses sur son téléphone, d\'où qu\'il soit, avec selfie et géolocalisation à chaque pointage. Idéal pour les équipes de terrain qui commencent la journée directement chez le client.' },
      { q: 'Le pointage prouve-t-il qui a pointé et d\'où ?', a: 'Oui. Chaque pointage enregistre un selfie du salarié et la localisation, apportant la preuve de qui a pointé et où.' },
      { q: 'Le solde d\'heures est-il calculé automatiquement ?', a: 'Oui. À partir des pointages, le système calcule les heures travaillées, les heures supplémentaires et les absences, en tenant le solde d\'heures à jour sans tableur.' },
      { q: 'Puis-je clôturer la paie dans le système ?', a: 'Oui. La clôture consolide salaire, solde d\'heures et avances, en déduisant les avances automatiquement. Le bulletin de paie sort prêt.' },
      { q: 'Comment fonctionnent les avances ?', a: 'Chaque avance est enregistrée et déduite automatiquement du bulletin de paie. Le relevé du salarié affiche chaque entrée et sortie avec le bon signe.' },
      { q: 'Où sont conservées les données des salariés ?', a: 'Dans la fiche du salarié, qui centralise salaire, poste, avances et relevé. Vous voyez la situation financière de chaque personne en un seul endroit.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous enregistrez l\'équipe et commencez à pointer les heures et à clôturer la paie aussitôt.' },
    ],
    finalCta: {
      title: 'Contrôlez les heures de gens qui vivent sur la route',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Pointez les heures avec selfie et localisation et clôturez la paie sans tableur.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 6. Facturation électronique de services
  // ────────────────────────────────────────────────────────────────────────
  'emissao-de-nfse': {
    slug: 'logiciel-facturation-services',
    metaTitle: 'Logiciel de facturation de services pour les entreprises de services | Dominex',
    metaDescription:
      'Logiciel de facturation de services pour les entreprises de services : émettez la facture de service par client directement depuis la plateforme, avec les données du client reprises automatiquement. Sans logiciel de facturation séparé. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Facturation de services',
      h1: 'Logiciel de facturation de services pour les entreprises de services',
      h1Highlight: 'facturation de services',
      subtitle:
        'Vous avez fait l\'intervention et vous devez encore ouvrir un autre système pour émettre la facture ? Dominex émet la facture de service par client, sans quitter la plateforme où vous travaillez déjà.',
    },
    metrics: [
      { value: 'Facturation', label: 'la facture de service émise sur la plateforme' },
      { value: 'Par client', label: 'émission rattachée à la fiche client' },
      { value: 'Intégrée', label: 'la facturation là où vous gérez l\'opération' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'La facture ne peut pas être un système à part',
    painsSubheading: 'Là où l\'émetteur autonome gêne, Dominex intègre',
    pains: [
      {
        pain: 'Émettre les factures dans un autre système, avec un autre identifiant et mot de passe',
        solution:
          'La facture de service est émise dans Dominex, par client, sans ouvrir d\'émetteur à part ni ressaisir de données. Moins de changements d\'écran, moins d\'erreurs.',
      },
      {
        pain: 'Données du client saisies à nouveau juste pour la facture',
        solution:
          'L\'émission reprend les données de la fiche client que vous avez déjà sur la plateforme. Vous sélectionnez le client et émettez.',
      },
      {
        pain: 'Facturation éparpillée dans des outils qui ne parlent pas à votre opération',
        solution:
          'La facturation vit sur la même plateforme que vos clients et services, si bien que ce que vous facturez correspond toujours à l\'intervention réalisée.',
      },
      {
        pain: 'Facture émise et perdue, sans contrôle de ce qui a été facturé',
        solution:
          'Les factures sont enregistrées et organisées par client, avec ce qui a déjà été émis. Vous suivez la facturation sans fouiller dans les e-mails.',
      },
    ],
    deepDives: [
      {
        icon: FileText,
        title: 'La facture émise sans quitter la plateforme',
        body: 'La facture de service électronique est émise depuis Dominex, sur la même plateforme où vous gérez clients et services. Vous sélectionnez le client, vérifiez les données déjà dans la fiche et émettez, sans émetteur autonome, sans autre identifiant et sans rien ressaisir.',
        image: {
          src: '/modulos/emissao-de-nfse/1.webp',
          alt: 'Personne organisant des documents et utilisant un ordinateur portable sur un bureau',
        },
      },
      {
        icon: Building2,
        title: 'Une facturation qui correspond à l\'intervention réalisée',
        body: 'Comme la facture est émise depuis la même fiche que vos clients et ordres de travail, ce que vous facturez s\'aligne toujours sur le service réalisé. Vous sélectionnez le client, confirmez les montants et émettez, gardant facturation et opérations parfaitement synchronisées.',
        image: {
          src: '/modulos/emissao-de-nfse/2.webp',
          alt: 'Professionnel examinant des documents et formulaires de facturation sur un bureau en bois',
        },
      },
      {
        icon: Receipt,
        title: 'Émission par client, avec un historique organisé',
        body: 'Chaque facture est émise depuis la fiche client et reste dans l\'historique, organisée par la personne facturée. Vous suivez ce qui a déjà été émis, évitez les factures en double et gardez le contrôle de votre facturation sans dépendre d\'un tableur ni de votre boîte de réception.',
        image: {
          src: '/modulos/emissao-de-nfse/3.webp',
          alt: 'Personne manipulant et organisant des reçus et factures papier, gardant l\'historique en ordre',
        },
      },
    ],
    featuresHeading: 'Facturation de services, sans système à part',
    featuresSubheading: 'La facture là où vous gérez déjà l\'opération',
    features: [
      { icon: FileText, title: 'Émission de factures', desc: 'Émettez la facture de service directement sur la plateforme, sans émetteur autonome.' },
      { icon: UserCircle, title: 'Émission par client', desc: 'La facture reprend les données de la fiche client que vous avez déjà.' },
      { icon: Building2, title: 'Facturation intégrée', desc: 'La facturation vit sur la même plateforme que vos clients et services.' },
      { icon: CheckSquare, title: 'Vérification des données', desc: 'Avant l\'émission, le système confirme les montants et les données du client.' },
      { icon: Receipt, title: 'Historique par client', desc: 'Suivez les factures émises, organisées par la personne facturée.' },
      { icon: ShieldCheck, title: 'Standard cohérent', desc: 'Adhésion à un standard cohérent pour chaque facture de service que vous émettez.' },
      { icon: BarChart3, title: 'Contrôle de la facturation', desc: 'Voyez ce qui a déjà été émis et gardez la facturation sous contrôle.' },
      { icon: FileCheck2, title: 'Document prêt', desc: 'La facture émise est disponible pour l\'envoyer au client.' },
    ],
    testimonialsHeading: 'Qui a intégré la facture a gagné du temps',
    testimonials: [
      { quote: 'J\'émettais la facture dans un autre système, avec un autre identifiant. Maintenant je l\'émets directement dans Dominex, depuis la fiche client.', name: 'Rodrigo A.', role: 'Associé', company: 'entreprise de services' },
      { quote: 'J\'ai cessé de ressaisir les données du client juste pour la facture. Je sélectionne le client et j\'émets la facture.', name: 'Fábio M.', role: 'Administrateur', company: 'maintenance et installation' },
      { quote: 'Avoir la facturation sur la même plateforme que les interventions fait que ce que je facture correspond toujours à ce que j\'ai livré.', name: 'Bruno S.', role: 'Propriétaire', company: 'services de terrain' },
    ],
    faq: [
      { q: 'Qu\'est-ce que la facturation électronique de services ?', a: 'C\'est l\'émission numérique de la facture de service, le document de facturation pour les prestataires de services. Dominex émet la facture de service électronique, destinée aux entreprises de services, directement depuis la plateforme où vous gérez déjà clients et interventions.' },
      { q: 'Ai-je besoin d\'un autre système pour émettre la facture ?', a: 'Non. La facture est émise depuis Dominex, par client, sans ouvrir d\'émetteur autonome ni utiliser un autre identifiant. Vous sélectionnez le client et émettez sur la même plateforme où vous travaillez déjà.' },
      { q: 'La facturation reste-t-elle synchronisée avec mes interventions ?', a: 'Oui. Comme la facture est émise depuis la même fiche que vos clients et ordres de travail, ce que vous facturez s\'aligne toujours sur le service réalisé, sans double saisie.' },
      { q: 'La facture reprend-elle les données du client automatiquement ?', a: 'Oui. L\'émission utilise les données de la fiche client que vous avez déjà sur la plateforme, sans rien ressaisir.' },
      { q: 'Puis-je suivre les factures que j\'ai émises ?', a: 'Oui. Les factures sont enregistrées et organisées par client, avec un historique de ce qui a déjà été émis, vous aidant à contrôler la facturation et à éviter les doublons.' },
      { q: 'Puis-je envoyer la facture au client ?', a: 'Oui. Une fois émise, la facture est disponible sur la fiche client et prête à envoyer, si bien que le client reçoit le document de facturation sans reprise manuelle.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous activez le module de facturation et émettez la facture de service depuis la fiche client.' },
    ],
    finalCta: {
      title: 'Émettez la facture de service là où vous travaillez déjà',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Émettez la facture de service par client, sans système à part.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 7. Portail client
  // ────────────────────────────────────────────────────────────────────────
  'portal-do-cliente': {
    slug: 'portail-client',
    metaTitle: 'Portail client pour les entreprises de services | Dominex',
    metaDescription:
      'Portail client pour les entreprises de services : votre client suit l\'ordre de travail, voit l\'historique des interventions, accède aux documents et approuve le devis par lien, sans avoir à appeler le bureau. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Portail client',
      h1: 'Portail client pour les entreprises de services',
      h1Highlight: 'Portail client',
      subtitle:
        'Votre client appelle toutes les heures pour savoir si le technicien est arrivé ? Avec le portail client, il suit l\'ordre de travail, voit l\'historique, accède aux documents et approuve le devis par lien, tout seul.',
    },
    metrics: [
      { value: 'Par lien', label: 'le client accède sans rien installer' },
      { value: 'Suit l\'ordre de travail', label: 'statut et historique en temps réel' },
      { value: 'Approuve le devis', label: 'sans appel, sans e-mail perdu' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Le téléphone sonne toute la journée avec la même question',
    painsSubheading: 'Là où le client doit appeler pour savoir, le portail affiche tout seul',
    pains: [
      {
        pain: '« Le technicien est parti ? C\'est réparé ? »',
        solution:
          'Le client ouvre le portail par lien et voit le statut de l\'ordre de travail en temps réel, planifié, en cours, terminé. Le téléphone cesse de sonner pour la même chose.',
      },
      {
        pain: 'Le client demande l\'historique des interventions et personne ne le retrouve',
        solution:
          'Le portail affiche l\'historique complet des ordres de travail du client, avec les dates et ce qui a été fait. Il le consulte tout seul, sans contacter le bureau.',
      },
      {
        pain: 'Un devis approuvé par un message qui se perd dans la messagerie',
        solution:
          'Le client approuve le devis directement dans le portail, avec l\'enregistrement de la date d\'approbation. Fini le « renvoyez-le », fini l\'approbation qui se perd.',
      },
      {
        pain: 'Rapports et documents envoyés et perdus dans les e-mails',
        solution:
          'Les rapports d\'ordre de travail et les documents restent disponibles dans le portail pour que le client y accède à tout moment, sans renvoi.',
      },
    ],
    deepDives: [
      {
        icon: Eye,
        title: 'Le client suit l\'ordre de travail tout seul',
        body: 'Grâce au portail client, accessible par lien (aucune application à installer), le client voit où en est l\'ordre de travail : planifié, technicien en route, en cours, terminé. Il suit l\'intervention en temps réel et cesse d\'appeler le bureau toutes les heures, donnant à votre équipe la tranquillité dont elle a besoin pour travailler.',
        image: {
          src: '/modulos/portal-do-cliente/1.webp',
          alt: 'Cliente souriante suivant le service sur un téléphone à la maison',
        },
      },
      {
        icon: BookOpen,
        title: 'Historique et documents toujours à portée de main',
        body: 'L\'historique complet des interventions du client vit dans le portail : ordres de travail passés, dates, ce qui a été fait et les rapports PDF. Les documents restent disponibles pour consultation à tout moment, si bien que le client n\'a jamais à demander « renvoyez-moi ce rapport », tout est là.',
        image: {
          src: '/modulos/portal-do-cliente/2.webp',
          alt: 'Mains examinant des documents imprimés à côté d\'un ordinateur portable sur le bureau',
        },
      },
      {
        icon: CheckSquare,
        title: 'Approbation du devis par lien',
        body: 'Le devis parvient au client par lien et il l\'approuve directement dans le portail, avec l\'enregistrement de la date d\'approbation. L\'approbation ne se perd pas dans la messagerie ni dans les e-mails, et ce qui a été approuvé passe à devenir un ordre de travail, bouclant la boucle des ventes à l\'exécution sans friction.',
        image: {
          src: '/modulos/portal-do-cliente/3.webp',
          alt: 'Homme souriant approuvant quelque chose sur un ordinateur portable',
        },
      },
    ],
    featuresHeading: 'De l\'autonomie pour le client, de la tranquillité pour vous',
    featuresSubheading: 'Le client résout tout seul ce qui devient aujourd\'hui un appel téléphonique',
    features: [
      { icon: Eye, title: 'Suivi de l\'ordre de travail', desc: 'Le client voit le statut de l\'ordre de travail en temps réel.' },
      { icon: BookOpen, title: 'Historique des interventions', desc: 'Tous les ordres de travail passés, avec les dates et ce qui a été fait.' },
      { icon: FileText, title: 'Accès aux documents', desc: 'Rapports et documents disponibles pour consultation à tout moment.' },
      { icon: CheckSquare, title: 'Approbation du devis', desc: 'Le client approuve le devis par lien, avec un enregistrement.' },
      { icon: Send, title: 'Accès par lien', desc: 'Aucune application à installer : le client entre par un lien.' },
      { icon: UserCircle, title: 'L\'identité de votre entreprise', desc: 'Le portail peut porter votre logo et vos couleurs, avec l\'offre marque blanche.' },
      { icon: BarChart3, title: 'Moins d\'appels téléphoniques', desc: 'Le client consulte tout seul ce qui devient aujourd\'hui un appel.' },
      { icon: ShieldCheck, title: 'Chacun ne voit que le sien', desc: 'Le client accède uniquement à ses propres interventions et documents.' },
    ],
    testimonialsHeading: 'Qui a ouvert le portail a cessé de prendre le même appel',
    testimonials: [
      { quote: 'Le client appelait toute la journée pour savoir si le technicien arrivait. Maintenant il suit dans le portail et on travaille tranquilles.', name: 'Juliana C.', role: 'Service client', company: 'entreprise de services' },
      { quote: 'Les approbations de devis se volatilisaient dans la messagerie. Dans le portail, ils approuvent et ça reste enregistré.', name: 'Marcelo T.', role: 'Associé', company: 'maintenance de bâtiment' },
      { quote: 'L\'historique des interventions dans le portail a donné de l\'autonomie au client. Il consulte sans avoir besoin de nous.', name: 'Patrícia L.', role: 'Responsable', company: 'installations et services' },
    ],
    faq: [
      { q: 'Qu\'est-ce que le portail client ?', a: 'C\'est un espace où votre client suit les ordres de travail, voit l\'historique des interventions, accède aux documents et approuve les devis, tout seul, sans appeler le bureau.' },
      { q: 'Le client doit-il installer une application ?', a: 'Non. L\'accès se fait par lien : le client l\'ouvre dans le navigateur et voit le statut de l\'ordre de travail, l\'historique et les documents.' },
      { q: 'Le client peut-il suivre l\'ordre de travail en temps réel ?', a: 'Oui. Il voit le statut de l\'ordre de travail (planifié, en cours, terminé) en temps réel, ce qui réduit drastiquement les appels au bureau.' },
      { q: 'Le client peut-il approuver un devis via le portail ?', a: 'Oui. Le devis arrive par lien et le client l\'approuve directement dans le portail, avec l\'enregistrement de la date d\'approbation. L\'approbation ne se perd pas dans la messagerie.' },
      { q: 'Le client voit-il l\'historique des interventions et les documents ?', a: 'Oui. L\'historique complet des ordres de travail, avec les dates et ce qui a été fait, plus les rapports et documents, reste disponible dans le portail pour consultation à tout moment.' },
      { q: 'Chaque client ne voit-il que ses propres données ?', a: 'Oui. Dans le portail, chaque client accède uniquement à ses propres interventions et documents.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous activez le portail et partagez le lien avec vos clients.' },
    ],
    finalCta: {
      title: 'Donnez de l\'autonomie au client et de la tranquillité à votre équipe',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Laissez le client suivre l\'ordre de travail et approuver le devis tout seul.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 8. Gestion de stock
  // ────────────────────────────────────────────────────────────────────────
  'controle-de-estoque': {
    slug: 'logiciel-gestion-stock',
    metaTitle: 'Logiciel de gestion de stock pour les équipes de terrain | Dominex',
    metaDescription:
      'Logiciel de gestion de stock pour les équipes de terrain : enregistrez pièces et matériaux, consignez les entrées et sorties de stock, déduisez automatiquement par ordre de travail et réalisez des inventaires. Sachez ce que vous avez, ce qui est sorti et sur quel ordre de travail. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Stock',
      h1: 'Logiciel de gestion de stock pour les équipes de terrain',
      h1Highlight: 'Gestion de stock',
      subtitle:
        'La pièce a manqué juste au moment où l\'intervention en avait besoin et personne ne l\'a remarqué ? Dominex suit pièces et matériaux, déduit automatiquement sur chaque ordre de travail et affiche ce que vous avez réellement en stock.',
    },
    metrics: [
      { value: 'Entrées/sorties', label: 'mouvements de pièces sous contrôle' },
      { value: 'Déduire par ordre de travail', label: 'consommation consignée sur l\'ordre de travail' },
      { value: 'Inventaire', label: 'le solde réel vérifié quand vous voulez' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Un stock dans le flou bloque l\'intervention',
    painsSubheading: 'Là où la pièce disparaît sans enregistrement, Dominex la déduit correctement',
    pains: [
      {
        pain: 'Le technicien arrive chez le client et la pièce était en rupture de stock',
        solution:
          'Le solde de chaque pièce reste à jour à chaque entrée et sortie de stock. Vous savez ce que vous avez avant d\'envoyer le technicien, sans surprise sur l\'intervention.',
      },
      {
        pain: 'Matériau utilisé sur l\'ordre de travail et personne ne l\'a déduit',
        solution:
          'La consommation est consignée sur l\'ordre de travail lui-même et le stock est déduit automatiquement. Vous savez ce qui est sorti et sur quelle intervention.',
      },
      {
        pain: 'Vous ne savez pas combien de matériau chaque intervention a utilisé',
        solution:
          'Comme la déduction est rattachée à l\'ordre de travail, vous pouvez voir le coût matériau par intervention. Le devis de la prochaine intervention devient plus précis.',
      },
      {
        pain: 'Vous ne découvrez le manque qu\'après la rupture de la pièce',
        solution:
          'Réalisez un inventaire quand vous voulez et ajustez le solde réel. Le système affiche l\'écart et garde le stock fiable.',
      },
    ],
    deepDives: [
      {
        icon: Package,
        title: 'Pièces et matériaux avec un solde toujours à jour',
        body: 'Enregistrez chaque pièce et matériau avec un code, une unité et une quantité. Chaque entrée de stock (achat, réapprovisionnement) et chaque sortie de stock (utilisation, perte) met le solde à jour instantanément. Vous consultez le stock et voyez ce que vous avez réellement, évitant d\'envoyer le technicien à une intervention sans la pièce dont il a besoin.',
        image: {
          src: '/modulos/controle-de-estoque/1.webp',
          alt: 'Étagères étiquetées avec séparateurs numérotés dans un entrepôt',
        },
      },
      {
        icon: PackageMinus,
        title: 'Déduction automatique par ordre de travail',
        body: 'Le matériau utilisé sur l\'intervention est consigné sur l\'ordre de travail lui-même et le stock est déduit tout seul. Cela rattache la consommation à l\'ordre de travail : vous savez ce qui est sorti, sur quelle intervention et pour quel client, et vous pouvez même voir le coût matériau par intervention, rendant les prochains devis plus précis.',
        image: {
          src: '/modulos/controle-de-estoque/2.webp',
          alt: 'Magasinier consignant des articles avec un scanner et une tablette',
        },
      },
      {
        icon: ClipboardList,
        title: 'Des inventaires pour garder le solde fiable',
        body: 'Quand vous en avez besoin, réalisez un inventaire : comparez le comptage physique au solde du système et ajustez l\'écart. Le stock revient à refléter la réalité, et vous repérez un manque ou une perte avant qu\'il ne perturbe la prochaine intervention, non après la rupture de la pièce chez le client.',
        image: {
          src: '/modulos/controle-de-estoque/3.webp',
          alt: 'Magasinier vérifiant l\'inventaire avec une tablette',
        },
      },
    ],
    featuresHeading: 'Le stock qui parle au terrain',
    featuresSubheading: 'Sachez ce que vous avez, ce qui est sorti et sur quel ordre de travail',
    features: [
      { icon: Package, title: 'Registre des pièces', desc: 'Pièces et matériaux avec un code, une unité et une quantité.' },
      { icon: TrendingUp, title: 'Entrée de stock', desc: 'Consignez les achats et réapprovisionnements et mettez le solde à jour instantanément.' },
      { icon: PackageMinus, title: 'Sortie de stock', desc: 'Consignez l\'utilisation et la perte, avec le solde toujours juste.' },
      { icon: ClipboardList, title: 'Déduire par ordre de travail', desc: 'La consommation est consignée sur l\'ordre de travail et déduite automatiquement.' },
      { icon: Receipt, title: 'Coût matériau par ordre de travail', desc: 'Voyez combien de matériau chaque intervention a consommé.' },
      { icon: CheckSquare, title: 'Inventaire', desc: 'Vérifiez le comptage physique et ajustez l\'écart quand vous voulez.' },
      { icon: ShieldCheck, title: 'Solde fiable', desc: 'Le stock reflète la réalité, sans manque caché.' },
      { icon: BarChart3, title: 'Ce qui est bas', desc: 'Voyez les pièces au solde bas avant qu\'elles ne manquent.' },
    ],
    testimonialsHeading: 'Qui a contrôlé le stock a cessé de rater des interventions',
    testimonials: [
      { quote: 'Le technicien arrivait chez le client et la pièce avait manqué. Maintenant le solde est juste et on réapprovisionne avant que ça ne baisse.', name: 'Rafael G.', role: 'Associé', company: 'maintenance et installation' },
      { quote: 'Du matériau sortait et personne ne le déduisait. Maintenant il est déduit sur l\'ordre de travail, automatiquement. Je sais ce qui est sorti et sur quelle intervention.', name: 'Camila V.', role: 'Entrepôt', company: 'services de terrain' },
      { quote: 'Comme la déduction est sur l\'ordre de travail, je vois le coût matériau par intervention. Le devis est devenu plus précis.', name: 'Lucas R.', role: 'Responsable', company: 'entreprise de services' },
    ],
    faq: [
      { q: 'Que fait la gestion de stock de Dominex ?', a: 'Elle enregistre pièces et matériaux, consigne les entrées et sorties de stock, déduit automatiquement par ordre de travail et permet des inventaires, si bien que vous savez ce que vous avez, ce qui est sorti et sur quelle intervention.' },
      { q: 'La déduction de stock se fait-elle automatiquement ?', a: 'Oui. Le matériau utilisé est consigné sur l\'ordre de travail lui-même et le stock est déduit tout seul, rattachant la consommation à l\'ordre de travail et au client.' },
      { q: 'Puis-je connaître le coût matériau par intervention ?', a: 'Oui. Comme la déduction est rattachée à l\'ordre de travail, vous pouvez voir combien de matériau chaque intervention a consommé, rendant les prochains devis plus précis.' },
      { q: 'Comment fonctionne l\'inventaire ?', a: 'Vous réalisez le comptage physique quand vous voulez, le comparez au solde du système et ajustez l\'écart. Le stock revient à refléter la réalité.' },
      { q: 'Le solde est-il mis à jour en temps réel ?', a: 'Oui. Chaque entrée et sortie de stock met le solde à jour instantanément, si bien que vous consultez le stock et voyez ce que vous avez réellement.' },
      { q: 'Puis-je voir les pièces qui sont en train de manquer ?', a: 'Oui. Vous voyez les pièces au solde bas et réapprovisionnez avant qu\'elles ne manquent sur l\'intervention.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous enregistrez vos pièces et commencez à contrôler entrées, sorties et déductions par ordre de travail.' },
    ],
    finalCta: {
      title: 'Cessez de rater des interventions faute de pièce',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Contrôlez votre stock et déduisez automatiquement sur chaque ordre de travail.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 9. Devis et contrats
  // ────────────────────────────────────────────────────────────────────────
  'orcamentos-e-contratos': {
    slug: 'logiciel-devis-contrats',
    metaTitle: 'Logiciel de devis et contrats pour les entreprises de services | Dominex',
    metaDescription:
      'Logiciel de devis et contrats pour les entreprises de services : créez des devis professionnels, envoyez-les en proposition par lien, concluez des contrats récurrents qui génèrent les ordres de travail tout seuls et transformez l\'approbation en ordre de travail. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Devis et contrats',
      h1: 'Logiciel de devis et contrats pour les entreprises de services',
      h1Highlight: 'Devis et contrats',
      subtitle:
        'Des devis faits de tête et des contrats oubliés jusqu\'à ce que le client se plaigne ? Dominex crée des devis professionnels, les transforme en proposition par lien et conclut des contrats récurrents qui génèrent les ordres de travail tout seuls.',
    },
    metrics: [
      { value: 'Proposition par lien', label: 'le client approuve de n\'importe où' },
      { value: 'Récurrent', label: 'un contrat qui génère les ordres de travail tout seul' },
      { value: 'Approuvé à ordre de travail', label: 'le devis devient un ordre de travail' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Devis et contrats improvisés freinent votre chiffre d\'affaires',
    painsSubheading: 'Là où il n\'y a pas de standard, Dominex le rend professionnel et automatique',
    pains: [
      {
        pain: 'Un devis fait de tête, sans standard et sans traçabilité',
        solution:
          'Créez des devis avec articles, main-d\'œuvre et matériaux dans un modèle professionnel à votre image. Chaque devis est enregistré et lié au client.',
      },
      {
        pain: 'Une proposition envoyée par message et approuvée par un « ok » qui disparaît',
        solution:
          'La proposition part par lien et le client approuve avec l\'enregistrement de la date d\'approbation. Vous voyez qui l\'a ouverte et qui a conclu.',
      },
      {
        pain: 'Un contrat de maintenance préventive oublié jusqu\'à ce que le client le réclame',
        solution:
          'Les contrats récurrents (mensuel, trimestriel) génèrent les ordres de travail tout seuls au bon intervalle. Vous ne manquez plus jamais un engagement de service par oubli.',
      },
      {
        pain: 'Vous avez conclu l\'intervention et l\'exécution est repartie de zéro',
        solution:
          'Le devis approuvé devient un ordre de travail en un clic, portant le périmètre sur le terrain. Ventes et opérations travaillent avec les mêmes données.',
      },
    ],
    deepDives: [
      {
        icon: FileText,
        title: 'Un devis professionnel à votre image',
        body: 'Créez le devis avec articles, main-d\'œuvre et matériaux, organisé dans un document à votre logo et à vos couleurs. Le devis est lié au client et à l\'opportunité, avec la valeur calculée, les conditions et la validité. Vous projetez une image professionnelle et cessez de perdre des ventes à cause de devis faits à la va-vite.',
        image: {
          src: '/modulos/orcamentos-e-contratos/1.webp',
          alt: 'Professionnel rédigeant et construisant un devis sur un bureau',
        },
      },
      {
        icon: Send,
        title: 'Proposition par lien, approbation enregistrée',
        body: 'Le devis devient une proposition envoyée par lien : le client l\'ouvre sur son téléphone, l\'examine et approuve, avec l\'enregistrement de la date d\'approbation. Vous suivez le statut (envoyée, vue, approuvée) et cessez de compter sur le « ok » de la messagerie qui disparaît. L\'approbation est documentée, prête à devenir un contrat ou un ordre de travail.',
        image: {
          src: '/modulos/orcamentos-e-contratos/2.webp',
          alt: 'Personne souriante approuvant une proposition sur un téléphone',
        },
      },
      {
        icon: Repeat,
        title: 'Des contrats récurrents qui génèrent les ordres de travail tout seuls',
        body: 'Pour la maintenance préventive et le service périodique, enregistrez le contrat avec la bonne récurrence (mensuelle, bimestrielle, trimestrielle). Dominex génère les ordres de travail automatiquement à l\'intervalle convenu, déjà avec le périmètre du contrat. Le chiffre d\'affaires récurrent tourne sans dépendre de la mémoire de qui que ce soit et aucun engagement de service n\'est manqué.',
        image: {
          src: '/modulos/orcamentos-e-contratos/3.webp',
          alt: 'Main signant un contrat avec un stylo sur un bureau en bois',
        },
      },
    ],
    featuresHeading: 'Du devis au contrat, sans perdre une vente',
    featuresSubheading: 'Rendez la proposition professionnelle et automatisez la récurrence',
    features: [
      { icon: FileText, title: 'Devis professionnels', desc: 'Articles, main-d\'œuvre et matériaux dans un document à votre image.' },
      { icon: Send, title: 'Proposition par lien', desc: 'Envoyez par lien et voyez quand le client l\'ouvre et l\'approuve.' },
      { icon: CheckSquare, title: 'Approbation enregistrée', desc: 'L\'approbation du client est documentée, avec une date.' },
      { icon: FileSignature, title: 'Contrats', desc: 'Concluez l\'affaire en contrat lié au client.' },
      { icon: Repeat, title: 'Récurrence automatique', desc: 'Des contrats qui génèrent les ordres de travail tout seuls au bon intervalle.' },
      { icon: TrendingUp, title: 'Conversion en ordre de travail', desc: 'Le devis approuvé devient un ordre de travail en un clic.' },
      { icon: UserCircle, title: 'Lié au client', desc: 'Chaque devis et contrat reste dans l\'historique du client.' },
      { icon: BarChart3, title: 'Suivi', desc: 'Voyez les propositions envoyées, vues et approuvées sur un tableau de bord.' },
    ],
    testimonialsHeading: 'Qui a standardisé la proposition conclut davantage',
    testimonials: [
      { quote: 'Mon devis était un texte par messagerie. Maintenant c\'est un document à mon image, et le client approuve par lien.', name: 'Diego F.', role: 'Associé', company: 'installations et services' },
      { quote: 'Le contrat préventif générait des ordres de travail de tête. Maintenant le système les génère tout seul au bon intervalle. Fini les engagements de service manqués.', name: 'Aline R.', role: 'Coordinatrice', company: 'maintenance de bâtiment' },
      { quote: 'Ils ont approuvé la proposition, elle est devenue un ordre de travail en un clic. Le terrain reçoit déjà le périmètre prêt.', name: 'Thiago P.', role: 'Responsable', company: 'services de terrain' },
    ],
    faq: [
      { q: 'Comment fonctionnent les devis dans Dominex ?', a: 'Vous créez des devis avec articles, main-d\'œuvre et matériaux dans un document professionnel à votre image, lié au client. Le devis est enregistré et peut devenir une proposition, un contrat ou un ordre de travail.' },
      { q: 'Le client approuve-t-il la proposition par lien ?', a: 'Oui. La proposition part par lien, le client l\'ouvre sur son téléphone et approuve avec l\'enregistrement de la date d\'approbation. Vous voyez qui l\'a ouverte et qui a conclu, sans compter sur le « ok » de la messagerie.' },
      { q: 'Que sont les contrats récurrents ?', a: 'Ce sont des contrats de maintenance préventive ou de service périodique avec une récurrence configurable (mensuelle, bimestrielle, trimestrielle). Dominex génère les ordres de travail automatiquement au bon intervalle, avec le périmètre du contrat prêt.' },
      { q: 'Les contrats génèrent-ils les ordres de travail tout seuls ?', a: 'Oui. Une fois le contrat configuré avec la récurrence, les ordres de travail sont générés par le système à l\'intervalle convenu, sans avoir à s\'en souvenir, si bien qu\'aucun engagement de service n\'est manqué par oubli.' },
      { q: 'Le devis approuvé devient-il un ordre de travail ?', a: 'Oui. En un clic, le devis approuvé devient un ordre de travail, portant le périmètre vendu sur le terrain. Ventes et opérations travaillent avec les mêmes données.' },
      { q: 'Les devis et contrats restent-ils liés au client ?', a: 'Oui. Chaque devis et contrat reste dans l\'historique du client, organisé, pour consultation et suivi.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous construisez votre premier devis et envoyez la proposition par lien aussitôt.' },
    ],
    finalCta: {
      title: 'Rendez la proposition professionnelle et automatisez le contrat',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Créez des devis à votre image et laissez le contrat générer les ordres de travail tout seul.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 10. Géolocalisation GPS des équipes et planification
  // ────────────────────────────────────────────────────────────────────────
  'rastreamento-de-equipes': {
    slug: 'logiciel-gps-equipes',
    metaTitle: 'Géolocalisation GPS des équipes et planification pour les services de terrain | Dominex',
    metaDescription:
      'Géolocalisation GPS des équipes et planification pour les services de terrain : localisation en temps réel sur la carte, planification et optimisation d\'itinéraire, pointage d\'arrivée et de départ validé par l\'adresse et historique des déplacements. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Géolocalisation GPS et planification',
      h1: 'Géolocalisation GPS des équipes et planification pour les services de terrain',
      h1Highlight: 'Géolocalisation GPS des équipes',
      subtitle:
        'Toujours à appeler pour savoir où est chaque technicien ? Dominex affiche votre équipe sur la carte en temps réel, organise le planning du jour et valide le pointage d\'arrivée par l\'adresse du client.',
    },
    metrics: [
      { value: 'Temps réel', label: 'votre équipe sur la carte pendant qu\'elle travaille' },
      { value: 'Arrivée/départ', label: 'validés par l\'adresse du client' },
      { value: 'Planning', label: 'l\'itinéraire du jour organisé par technicien' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Ne pas savoir où est votre équipe vous coûte cher',
    painsSubheading: 'Là où le téléphone reste sans réponse, la carte affiche',
    pains: [
      {
        pain: '« Où est le technicien maintenant ? Est-il arrivé chez le client ? »',
        solution:
          'La carte en direct affiche où est chaque technicien pendant qu\'il travaille. Vous suivez l\'équipe sans passer d\'appels.',
      },
      {
        pain: 'Le planning du jour dans votre tête et le technicien qui traverse la ville pour rien',
        solution:
          'Le planning organise les interventions du jour et aide à l\'optimisation d\'itinéraire, en affectant au technicien le plus proche. Moins de trajets, plus de service.',
      },
      {
        pain: '« Est-il vraiment allé chez le client ? »',
        solution:
          'Le pointage d\'arrivée et de départ est validé par l\'adresse du client, avec l\'heure enregistrée. Vous avez la preuve de présence à la visite.',
      },
      {
        pain: 'Aucun historique de déplacements pour vérifier l\'itinéraire',
        solution:
          'L\'historique des déplacements conserve les points clés de la journée. Vous vérifiez où l\'équipe est allée et justifiez le temps passé sur le terrain.',
      },
    ],
    deepDives: [
      {
        icon: Navigation,
        title: 'Votre équipe sur la carte en temps réel',
        body: 'La carte en direct affiche où est chaque technicien pendant que l\'équipe travaille. Vous suivez l\'opération de terrain depuis un seul endroit, savez qui est près de la prochaine intervention et cessez d\'appeler pour demander une localisation. La visibilité de toute la journée est à l\'écran, non au téléphone.',
        image: {
          src: '/modulos/rastreamento-de-equipes/1.webp',
          alt: 'Une flotte de fourgons de service alignés, l\'équipe de terrain suivie comme sur une carte en direct',
        },
      },
      {
        icon: Calendar,
        title: 'Le planning du jour et l\'optimisation d\'itinéraire',
        body: 'Construisez le planning du jour avec les interventions de chaque technicien et organisez l\'itinéraire pour réduire les trajets. Affectez l\'intervention au technicien le plus proche de l\'adresse et évitez les conflits d\'horaire. Moins de temps dans la circulation signifie plus d\'interventions par jour et des clients avec un créneau plus prévisible.',
        image: {
          src: '/modulos/rastreamento-de-equipes/2.webp',
          alt: 'Conducteur utilisant la navigation GPS dans la voiture pour suivre l\'itinéraire du jour',
        },
      },
      {
        icon: MapPin,
        title: 'Pointage d\'arrivée/départ validé et historique des déplacements',
        body: 'Le technicien pointe son arrivée et son départ à la visite, validés par l\'adresse du client, avec l\'heure enregistrée, prouvant sa présence sur l\'intervention. L\'historique des déplacements conserve les points clés de l\'itinéraire, si bien que vous vérifiez où l\'équipe est allée et justifiez le temps passé sur le terrain.',
        image: {
          src: '/modulos/rastreamento-de-equipes/3.webp',
          alt: 'Technicien descendant du fourgon de service à l\'arrivée à l\'adresse du client pour le pointage',
        },
      },
    ],
    featuresHeading: 'Voyez votre opération de terrain, ne la devinez pas',
    featuresSubheading: 'Localisation, planification et preuve de présence au même endroit',
    features: [
      { icon: Navigation, title: 'Carte en direct', desc: 'La localisation de l\'équipe en temps réel pendant qu\'elle travaille.' },
      { icon: Calendar, title: 'Planning du jour', desc: 'Interventions organisées par technicien, sans conflit d\'horaire.' },
      { icon: RouteIcon, title: 'Optimisation d\'itinéraire', desc: 'Affectez l\'intervention au technicien le plus proche et réduisez les trajets.' },
      { icon: MapPin, title: 'Pointage d\'arrivée validé', desc: 'Arrivée à la visite validée par l\'adresse du client.' },
      { icon: CheckSquare, title: 'Départ enregistré', desc: 'Départ avec l\'heure, prouvant le temps sur l\'intervention.' },
      { icon: BookOpen, title: 'Historique des déplacements', desc: 'Points clés de l\'itinéraire conservés pour consultation.' },
      { icon: Clock, title: 'Temps sur le terrain', desc: 'Justifiez le temps passé à chaque visite avec des données, non des suppositions.' },
      { icon: BarChart3, title: 'Productivité', desc: 'Suivez les interventions par technicien et par jour.' },
    ],
    testimonialsHeading: 'Qui voit l\'équipe sur la carte a cessé d\'appeler',
    testimonials: [
      { quote: 'J\'appelais sans arrêt pour savoir où était chaque technicien. Maintenant je les vois tous sur la carte et j\'organise l\'itinéraire du jour.', name: 'Rodrigo A.', role: 'Responsable des opérations', company: 'services de terrain' },
      { quote: 'Le pointage par l\'adresse du client a mis fin au doute sur la présence réelle du technicien. J\'ai la preuve.', name: 'Fábio M.', role: 'Coordinateur', company: 'maintenance de bâtiment' },
      { quote: 'Avec la planification et l\'optimisation d\'itinéraire, l\'équipe fait plus d\'interventions par jour et traverse moins souvent la ville pour rien.', name: 'Bruno S.', role: 'Associé', company: 'installations et services' },
    ],
    faq: [
      { q: 'Dominex affiche-t-il où est mon équipe en temps réel ?', a: 'Oui. La carte en direct affiche où est chaque technicien pendant qu\'il travaille, si bien que vous suivez l\'opération de terrain sans passer d\'appels.' },
      { q: 'Comment fonctionnent la planification et l\'optimisation d\'itinéraire ?', a: 'Le planning organise les interventions du jour par technicien et aide à l\'optimisation d\'itinéraire, en affectant l\'intervention au technicien le plus proche de l\'adresse, réduisant les trajets et évitant les conflits d\'horaire.' },
      { q: 'Le pointage prouve-t-il que le technicien est allé chez le client ?', a: 'Oui. Le pointage d\'arrivée et de départ est validé par l\'adresse du client, avec l\'heure enregistrée, prouvant la présence à la visite et le temps sur l\'intervention.' },
      { q: 'Y a-t-il un historique des déplacements ?', a: 'Oui. L\'historique conserve les points clés de l\'itinéraire du jour, si bien que vous vérifiez où l\'équipe est allée et justifiez le temps sur le terrain.' },
      { q: 'L\'optimisation d\'itinéraire aide-t-elle à faire plus d\'interventions par jour ?', a: 'Oui. En affectant au technicien le plus proche et en organisant l\'itinéraire, l\'équipe traverse moins souvent la ville pour rien et sert plus de clients le même jour.' },
      { q: 'Le client obtient-il un horaire prévisible ?', a: 'Oui. Avec un planning organisé, vous donnez au client un créneau de service plus prévisible et réduisez les visites manquées.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous enregistrez l\'équipe et suivez la carte en direct et le planning du jour aussitôt.' },
    ],
    finalCta: {
      title: 'Voyez votre équipe de terrain sur la carte',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Suivez l\'équipe en temps réel, organisez le planning et prouvez chaque visite.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 11. Application technicien (Espace du technicien)
  // ────────────────────────────────────────────────────────────────────────
  'area-do-tecnico': {
    slug: 'app-technicien-terrain',
    metaTitle: 'Application technicien : l\'app de terrain de votre équipe | Dominex',
    metaDescription:
      'L\'application technicien : l\'app de terrain de votre équipe. Ordres de travail sur le téléphone, outils techniques (charge de frigorigène, surchauffe, dimensionnement de contacteur), un catalogue d\'équipements et une application installable sur le téléphone. Essai gratuit de 14 jours, sans carte bancaire.',
    hero: {
      eyebrow: 'Application technicien',
      h1: 'Application technicien : l\'app de terrain de votre équipe',
      h1Highlight: 'Application technicien',
      subtitle:
        'Le technicien ne travaille pas assis au bureau, il a besoin de tout sur son téléphone. L\'application technicien est une app installable qui met l\'ordre de travail, les outils de calcul et le catalogue au creux de sa main, directement sur le terrain.',
    },
    metrics: [
      { value: 'PWA', label: 'application installable sur le téléphone du technicien' },
      { value: 'Outils', label: 'calculs techniques dans la poche de l\'équipe' },
      { value: 'Dans la poche', label: 'tout sur le téléphone du technicien, sur le terrain' },
      { value: '4,9/5', label: 'satisfaction parmi les entreprises qui l\'utilisent' },
    ],
    painsHeading: 'Le technicien a besoin de tout sur le terrain, non au bureau',
    painsSubheading: 'Là où l\'équipe travaille sans outil en main, l\'application technicien fournit',
    pains: [
      {
        pain: 'Le technicien ouvre l\'ordre de travail sur son téléphone et la moitié des informations manque',
        solution:
          'Dans l\'application technicien, l\'ordre de travail arrive complet : client, adresse, équipement, historique et checklist. Il l\'exécute depuis le téléphone, sans appeler le bureau.',
      },
      {
        pain: 'Charge de frigorigène et surchauffe calculées de tête, avec un risque d\'erreur',
        solution:
          'Les outils techniques mettent charge de frigorigène, surchauffe et tables pression-température dans sa poche. Moins d\'erreurs, plus de précision sur le terrain.',
      },
      {
        pain: 'Dimensionner un contacteur à la volée, sans référence',
        solution:
          'Le dimensionnement du contacteur et du relais thermique est directement dans l\'outil, étape par étape. Le technicien le calcule sur place.',
      },
      {
        pain: 'Le technicien transporte des manuels et des tables imprimés pour consulter chez le client',
        solution:
          'Le catalogue d\'équipements, avec photos et manuels, vit sur le téléphone du technicien. Il consulte le modèle et la fiche technique sur place, sur le terrain, sans papier et sans appel au bureau.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'L\'app de terrain (PWA) avec l\'ordre de travail au creux de la main',
        body: 'L\'application technicien est une app installable sur le téléphone (PWA), sans magasin d\'applications. Le technicien voit la file du jour, ouvre l\'ordre de travail complet, client, adresse sur une carte, équipement et historique, exécute la checklist, prend des photos, recueille la signature et clôture l\'intervention. Le tout depuis le terrain, sans retourner au bureau.',
        image: {
          src: '/modulos/area-do-tecnico/1.webp',
          alt: 'Technicien en combinaison utilisant un téléphone sur le terrain pour ouvrir l\'ordre de travail',
        },
      },
      {
        icon: Calculator,
        title: 'Outils techniques dans la poche du technicien',
        body: 'L\'équipe emporte les calculateurs du quotidien sur son téléphone : courbes de charge et de pression-température pour les gaz frigorigènes, calcul de surchauffe, dimensionnement du contacteur et du relais thermique (avec démarrage direct), et un catalogue d\'équipements avec photos et manuels. Le calcul sort sur place, sur le terrain, sans compter sur la mémoire ni un tableur.',
        image: {
          src: '/modulos/area-do-tecnico/2.webp',
          alt: 'Technicien CVC utilisant un manomètre et des outils sur un climatiseur',
        },
      },
      {
        icon: Download,
        title: 'Application installable sur le téléphone, sans magasin d\'applications',
        body: 'L\'application technicien est une app installable (PWA) : le technicien l\'ajoute à son téléphone directement depuis le navigateur, sans passer par un magasin d\'applications, et l\'ouvre comme n\'importe quelle autre app, légère et rapide. L\'ordre de travail, les outils de calcul et le catalogue restent au creux de sa main, prêts à l\'emploi chez le client, sur le terrain.',
        image: {
          src: '/modulos/area-do-tecnico/3.webp',
          alt: 'Professionnel portant un casque consultant l\'application sur une tablette sur le chantier',
        },
      },
    ],
    featuresHeading: 'Tout le terrain sur le téléphone du technicien',
    featuresSubheading: 'Ordres de travail, outils et catalogue au creux de la main, sur le terrain',
    features: [
      { icon: Smartphone, title: 'PWA installable', desc: 'S\'installe sur le téléphone sans magasin d\'applications, légère et rapide.' },
      { icon: ClipboardList, title: 'Ordres de travail sur le téléphone', desc: 'L\'ordre de travail complet, avec checklist, photos et signature.' },
      { icon: Gauge, title: 'Charge de frigorigène', desc: 'Courbes de charge et de pression-température pour les frigorigènes.' },
      { icon: Calculator, title: 'Surchauffe', desc: 'Calcul de surchauffe directement dans l\'application.' },
      { icon: Wrench, title: 'Dimensionnement de contacteur', desc: 'Contacteur et relais thermique avec démarrage direct, étape par étape.' },
      { icon: BookOpen, title: 'Catalogue d\'équipements', desc: 'Photos et manuels d\'équipements pour consultation sur le terrain.' },
      { icon: Camera, title: 'Photos avant et après', desc: 'Preuves photo jointes à l\'ordre de travail, prises depuis le téléphone chez le client.' },
      { icon: PenLine, title: 'Signature numérique', desc: 'Le client signe sur l\'écran du téléphone et cela entre directement dans le rapport.' },
    ],
    testimonialsHeading: 'Le technicien aux commandes, directement depuis le téléphone',
    testimonials: [
      { quote: 'L\'application technicien est devenue l\'app officielle de l\'équipe. Ordres de travail, photos, signature, tout depuis le téléphone, chez le client.', name: 'Diego F.', role: 'Responsable', company: 'réfrigération et CVC' },
      { quote: 'Les outils de charge de frigorigène et de surchauffe dans sa poche ont réduit les erreurs sur le terrain. Le technicien le calcule sur place.', name: 'Aline R.', role: 'Coordinatrice technique', company: 'maintenance de climatisation' },
      { quote: 'Avoir l\'ordre de travail, les calculateurs et le catalogue tous sur le téléphone a changé la journée du technicien. Il résout chez le client, sans retourner à la base ni transporter des manuels imprimés.', name: 'Thiago P.', role: 'Fondateur', company: 'services de réfrigération' },
    ],
    faq: [
      { q: 'Qu\'est-ce que l\'application technicien ?', a: 'C\'est l\'app de terrain de votre équipe : une application installable sur le téléphone (PWA) avec l\'ordre de travail, les outils de calcul technique et le catalogue d\'équipements, le tout au creux de la main du technicien pour l\'utiliser chez le client.' },
      { q: 'Dois-je la télécharger depuis un magasin d\'applications ?', a: 'Non. L\'application technicien est une PWA : elle s\'installe directement depuis le navigateur sur le téléphone du technicien, sans passer par un magasin d\'applications, et reste légère et rapide.' },
      { q: 'Quels outils techniques sont disponibles ?', a: 'Courbes de charge et de pression-température pour les gaz frigorigènes, calcul de surchauffe, dimensionnement du contacteur et du relais thermique avec démarrage direct, et un catalogue d\'équipements avec photos et manuels, le tout sur le téléphone.' },
      { q: 'Le technicien peut-il exécuter l\'ordre de travail dans l\'application ?', a: 'Oui. Il ouvre l\'ordre de travail complet (client, adresse, équipement, historique), remplit la checklist, prend des photos, recueille la signature et clôture l\'intervention, le tout depuis le téléphone.' },
      { q: 'L\'équipe utilise-t-elle tout directement depuis le téléphone, sur le terrain ?', a: 'Oui. L\'ordre de travail, les outils de calcul et le catalogue d\'équipements restent sur le téléphone du technicien, prêts à l\'emploi chez le client. Il exécute l\'ordre de travail, fait les calculs et consulte le catalogue sur le terrain, sans retourner au bureau ni transporter des manuels imprimés.' },
      { q: 'Les outils de calcul fonctionnent-ils pour la réfrigération et la climatisation ?', a: 'Oui. Les calculateurs de charge de frigorigène, de surchauffe et de courbe de pression sont destinés au quotidien de la réfrigération et de la climatisation, et le dimensionnement de contacteur accompagne l\'installation et la mise en service des équipements.' },
      { q: 'Comment démarrer ? Ai-je besoin d\'une carte bancaire ?', a: 'Créez simplement un compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Votre équipe installe l\'application technicien sur son téléphone et commence à travailler sur le terrain aussitôt.' },
    ],
    finalCta: {
      title: 'Mettez tout le terrain sur le téléphone de votre équipe',
      subtitle: 'Gratuit pendant 14 jours, sans carte bancaire. Ordres de travail, outils techniques et catalogue dans l\'application technicien, sur le téléphone de votre équipe.',
    },
  },
};

export default fr;
