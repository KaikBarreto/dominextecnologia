// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo fr (Français) de segmentos — traduções nativas (Fase 6).
//
// Copie française native des 9 pages de segment. Même forme que pt-br.ts
// (SegmentContentMap). Chaque segment porte un `slug` français pour que la
// route /fr/<slug>, le hreflang et le sitemap se résolvent automatiquement
// via le registre de slugs.
//
// Le nom de marque « Dominex » est un nom propre et n'est jamais traduit.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Thermometer,
  Zap,
  Sun,
  Radio,
  Shield,
  HardHat,
  Building,
  Sparkles,
  Droplets,
  ClipboardList,
  MapPin,
  Calendar,
  RefreshCw,
  BarChart3,
  Smartphone,
  FileSignature,
  Gauge,
  Boxes,
  Users,
} from 'lucide-react';
import type { SegmentContentMap } from './types';

const fr: SegmentContentMap = {
  // ──────────────────────────────────────────────────────────────────────────
  // Réfrigération et climatisation
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-refrigeracao': {
    slug: 'logiciel-refrigeration-climatisation',
    metaTitle:
      "Logiciel d'ordres de travail et de maintenance pour les entreprises de réfrigération et de climatisation | Dominex",
    metaDescription:
      "Logiciel pour les entreprises de réfrigération et de climatisation : ordres de travail numériques, plans de maintenance préventive automatisés, suivi du fluide frigorigène par équipement, application mobile pour vos techniciens sur le terrain et contrats de maintenance récurrents. Essai gratuit de 14 jours, sans carte bancaire.",
    hero: {
      eyebrow: 'Pour les entreprises de réfrigération et de climatisation',
      h1: "Logiciel d'ordres de travail et de maintenance pour les entreprises de réfrigération et de climatisation",
      h1Highlight: 'réfrigération et climatisation',
      subtitle:
        "Fini les ordres de travail papier et les techniciens qui arrivent sans aucun historique. Dominex centralise vos ordres de travail, automatise votre planning de maintenance et conserve la trace de chaque équipement, de chaque charge de fluide et de chaque visite, directement dans votre main.",
    },
    metrics: [
      { value: '50k+', label: "ordres de travail par mois sur la plateforme" },
      { value: 'Auto', label: 'plans de maintenance préventive générés par équipement' },
      { value: '100%', label: 'sur le téléphone du technicien sur le terrain' },
      { value: '4,9/5', label: 'satisfaction des entreprises qui l\'utilisent' },
    ],
    pains: [
      {
        pain: '« Attends, quel fluide j\'ai mis dans cette machine déjà ? »',
        solution:
          "Chaque équipement conserve tout son historique : type de fluide frigorigène, charge, pressions, surchauffe et chaque visite passée. Le technicien ouvre l'ordre de travail et voit tout, sans appeler le bureau.",
      },
      {
        pain: "Maintenance préventive faite dans l'urgence, sans trace, hors conformité",
        solution:
          "Dominex construit le planning de maintenance automatiquement par équipement, avec une checklist pour chaque visite, le technicien responsable enregistré et un rapport prêt pour une inspection.",
      },
      {
        pain: "Contrat de maintenance préventive oublié jusqu'à ce que le client se plaigne",
        solution:
          "Les contrats avec une cadence configurable (mensuelle, bimestrielle, trimestrielle) génèrent les ordres de travail tout seuls au bon intervalle. Ne ratez plus jamais une visite préventive ni un SLA.",
      },
      {
        pain: 'Rapport de visite écrit à la main, des heures plus tard, sans photos ni signature',
        solution:
          "Le technicien clôture l'ordre de travail dans l'application avec des photos avant et après, une checklist complétée et la signature du client sur place. Le rapport PDF à votre marque est prêt juste après.",
      },
    ],
    deepDives: [
      {
        icon: Thermometer,
        title: 'Conçu pour les splits, chambres froides, groupes froid et VRV',
        body: "Enregistrez chaque équipement avec sa marque, son modèle, sa puissance (BTU/kW), son type de fluide et son emplacement. Split, multi-split, VRV, groupe froid, chambre froide, ventilo-convecteur ou monobloc : l'historique est rattaché à l'équipement, pas seulement au client. Quand le technicien revient, il sait exactement ce qui a été fait la dernière fois, quel fluide est chargé et la surchauffe cible.",
        image: {
          src: '/segmentos/refrigeracao/1.webp',
          alt: "Unités de condensation de climatisation installées sur le toit d'un bâtiment",
        },
      },
      {
        icon: RefreshCw,
        title: 'Planning de maintenance préventive automatisé',
        body: "Le plan de maintenance est construit à partir des équipements du contrat : le système répartit les visites sur le cycle, monte la checklist de chacune, enregistre le technicien responsable et produit le planning de maintenance et le rapport de conformité, prêts à présenter lors d'une inspection. Vous restez conforme sans tableur parallèle.",
        image: {
          src: '/segmentos/refrigeracao/2.webp',
          alt: "Technicien inspectant l'unité extérieure d'un système de climatisation",
        },
      },
      {
        icon: Smartphone,
        title: 'Tout sur le téléphone du technicien, directement sur le toit',
        body: "Le service de réfrigération se déroule sur les toits, dans les salles des machines et dans les sous-sols de centres commerciaux, et tout se règle depuis un téléphone. L'application Dominex s'installe directement sur l'appareil (PWA) : le technicien ouvre l'ordre de travail, prend des photos, relève les pressions, remplit la checklist et recueille la signature du client sur place. L'ordre de travail est prêt immédiatement, sans retour au bureau ni rapport à réécrire.",
        image: {
          src: '/segmentos/refrigeracao/3.webp',
          alt: "Techniciens intervenant sur une unité extérieure de climatisation sur un toit",
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Ordres de travail numériques',
        desc: "Créez, attribuez et suivez les ordres d'installation, de maintenance et de dépannage en quelques secondes, avec photos, checklist et signature du client.",
      },
      {
        icon: Gauge,
        title: "Historique du fluide et de l'équipement",
        desc: "Fluide, charge, pressions et surchauffe enregistrés par équipement. Le technicien voit tout avant de monter sur le toit.",
      },
      {
        icon: RefreshCw,
        title: 'Plans de maintenance et contrats récurrents',
        desc: "Planning de maintenance automatisé et contrats préventifs qui génèrent les ordres de travail tout seuls au bon intervalle, par équipement.",
      },
      {
        icon: MapPin,
        title: 'Suivi terrain',
        desc: "Voyez sur la carte où se trouve chaque technicien et validez les pointages par rayon autour de l'adresse du client.",
      },
      {
        icon: Calendar,
        title: 'Planification intelligente',
        desc: "Planifiez les tournées de vos équipes, envoyez les interventions au technicien le plus proche et évitez les conflits d'horaire.",
      },
      {
        icon: FileSignature,
        title: 'Rapports de maintenance et de travail à votre marque',
        desc: "PDF prêt dès la fin de la visite, avec votre logo et vos couleurs, à remettre au client et à un inspecteur.",
      },
      {
        icon: Boxes,
        title: 'Stock de pièces et de fluide',
        desc: "Suivez les pièces, filtres et bouteilles de fluide utilisés sur chaque ordre de travail, avec déduction automatique du stock.",
      },
      {
        icon: BarChart3,
        title: 'Tableau de bord des opérations',
        desc: "Ordres de travail par statut, temps moyen de réalisation et notes des clients dans un tableau de bord en direct.",
      },
    ],
    testimonials: [
      {
        quote:
          "J'ai arrêté de perdre l'historique de chaque machine. Le technicien arrive chez le client, ouvre l'ordre de travail et sait déjà quel fluide est chargé et ce qui a été fait à la dernière visite.",
        name: 'Carlos M.',
        role: "Responsable d'exploitation",
        company: 'entreprise de réfrigération commerciale',
      },
      {
        quote:
          "La planification de la maintenance était un cauchemar de tableur. Maintenant le système monte le planning et le rapport tout seul. J'ai déroulé le tout devant un inspecteur sans transpirer.",
        name: 'Roberta S.',
        role: 'Technicienne responsable',
        company: 'climatisation tertiaire',
      },
      {
        quote:
          "L'équipe travaille toute la journée sur le terrain et fait tout au téléphone. Le technicien clôture l'ordre de travail devant le client, avec photo et signature. Toute l'exploitation est devenue bien plus fluide.",
        name: 'André P.',
        role: 'Fondateur',
        company: 'maintenance de climatisation',
      },
    ],
    faq: [
      {
        q: 'Dominex convient-il aux entreprises de réfrigération et de climatisation ?',
        a: "Oui. Il a été conçu pour les entreprises qui installent et entretiennent des splits, multi-splits, VRV, groupes froid, chambres froides, monoblocs et ventilo-convecteurs. Vous enregistrez chaque équipement, suivez le fluide frigorigène, générez un planning de maintenance et organisez les contrats de maintenance préventive au même endroit.",
      },
      {
        q: 'Le système génère-t-il un plan de maintenance préventive ?',
        a: "Oui. Dominex construit le planning de maintenance automatiquement à partir des équipements du contrat, avec une checklist par visite, le technicien responsable enregistré et un rapport de conformité prêt pour une inspection. Quand vous avez besoin d'un plan de maintenance préventive formel pour un client ou un audit, vous produisez la documentation sans tableur parallèle.",
      },
      {
        q: "Le technicien travaille-t-il depuis un téléphone ? Faut-il installer une application ?",
        a: "Oui, tout se passe sur le téléphone. Dominex est une application qui s'installe directement sur l'appareil du technicien (PWA), sans téléchargement depuis un store. Sur place, le technicien ouvre l'ordre de travail, prend des photos, relève les pressions, remplit la checklist et recueille la signature du client directement depuis le téléphone. L'ordre de travail est prêt immédiatement.",
      },
      {
        q: "Puis-je suivre le fluide et l'historique de chaque équipement ?",
        a: "Oui. Chaque équipement conserve le type de fluide, la charge, les pressions, la surchauffe et chaque visite passée. Le technicien voit tout l'historique de l'équipement avant même d'arriver chez le client.",
      },
      {
        q: 'Les rapports sortent-ils à ma propre marque ?',
        a: "Oui. Les rapports d'ordre de travail et les documents de maintenance sortent en PDF avec votre logo et vos couleurs. Avec l'offre marque blanche, toute l'expérience côté client porte l'identité de votre entreprise.",
      },
      {
        q: 'Comment fonctionnent les contrats de maintenance préventive ?',
        a: "Vous configurez le contrat avec la cadence souhaitée (mensuelle, bimestrielle, trimestrielle, etc.) et Dominex génère les ordres de travail automatiquement au bon intervalle, par équipement. Vous ne ratez plus jamais une visite préventive ni un SLA.",
      },
      {
        q: 'Ai-je des outils techniques de réfrigération dans le système ?',
        a: "Oui. La Boîte à outils du technicien réunit les calculatrices et tableaux que vous utilisez au quotidien : courbes pression-température des fluides, surchauffe, dimensionnement et un catalogue d'équipements, le tout accessible directement depuis le téléphone sur le terrain.",
      },
      {
        q: 'Comment démarrer ? Faut-il une carte bancaire ?',
        a: "Créez simplement votre compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes, enregistrez vos équipements et commencez à ouvrir des ordres de travail tout de suite. Annulez quand vous voulez, vos données sont préservées si vous décidez de vous abonner.",
      },
    ],
    finalCta: {
      title: 'Prenez le contrôle de votre exploitation de réfrigération',
      subtitle:
        "Gratuit pendant 14 jours, sans carte bancaire, sans tracas. Enregistrez vos équipements, construisez votre planning de maintenance et donnez le contrôle à votre équipe terrain.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Électricité
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-eletricistas': {
    slug: 'logiciel-electriciens',
    metaTitle:
      "Logiciel d'ordres de travail pour électriciens et entreprises d'électricité | Dominex",
    metaDescription:
      "Logiciel pour les entreprises d'installation et de maintenance électrique : ordres de travail numériques, rapports et attestations par client, relevés de tableaux et de branchement, checklists de sécurité et application mobile pour vos électriciens sur le terrain. Essai gratuit de 14 jours, sans carte bancaire.",
    hero: {
      eyebrow: "Pour les électriciens et les entreprises d'électricité",
      h1: "Logiciel d'ordres de travail pour les entreprises d'électricité",
      h1Highlight: "entreprises d'électricité",
      subtitle:
        "Tableau câblé, branchement remplacé, maintenance faite, et rien de tout ça n'est devenu une trace ? Dominex numérise vos ordres de travail, conserve l'historique de chaque installation et met rapports, checklists et photos dans la main de l'électricien.",
    },
    metrics: [
      { value: '50k+', label: 'ordres de travail par mois sur la plateforme' },
      { value: 'Sécurité', label: 'checklist à chaque visite' },
      { value: '100%', label: "sur le téléphone de l'électricien sur le terrain" },
      { value: '4,9/5', label: 'satisfaction des entreprises qui l\'utilisent' },
    ],
    pains: [
      {
        pain: "« Qu'est-ce qu'on a fait sur le tableau de ce client la dernière fois ? »",
        solution:
          "Chaque client et chaque point d'installation conserve l'historique : branchement, disjoncteurs remplacés, charges, tableaux et ce qui a été fait à chaque visite. L'électricien ouvre l'ordre de travail et voit tout, sans appeler le bureau.",
      },
      {
        pain: "Rapports et attestations perdus dans les e-mails, sur WhatsApp ou dans un tiroir",
        solution:
          "Joignez rapports, attestations et photos du chantier directement à l'ordre de travail du client. Tout reste organisé par adresse et par équipement, prêt à renvoyer dès que le client le demande.",
      },
      {
        pain: "Devis d'installation faits de tête, sans standard et sans trace",
        solution:
          "Montez des devis avec postes, main-d'œuvre et matériel, envoyez-les par lien et suivez la validation. Une fois validé, cela devient un ordre de travail en un clic, équipe déjà affectée.",
      },
      {
        pain: "Sécurité du chantier sans preuve que la procédure a été suivie",
        solution:
          "Des checklists configurables imposent les étapes de sécurité et de consignation à chaque visite, avec la trace de qui a exécuté, des photos et une signature. Vous pouvez prouver la procédure en cas de besoin.",
      },
    ],
    deepDives: [
      {
        icon: Zap,
        title: 'Historique par branchement, tableau et circuit',
        body: "Enregistrez chaque client avec son branchement (monophasé, triphasé), ses tableaux de distribution, disjoncteurs et charges. Maintenance préventive, remplacement de disjoncteur, nouveau circuit ou rapport d'inspection : tout est rattaché au point d'installation. Quand l'électricien revient, il sait déjà ce qui est en place et ce qui a été fait avant.",
        image: {
          src: '/segmentos/eletrica/1.webp',
          alt: 'Tableau de distribution électrique organisé, avec disjoncteurs et câblage codé par couleur',
        },
      },
      {
        icon: FileSignature,
        title: 'Rapports et attestations à votre marque',
        body: "À la fin de la visite, le rapport d'ordre de travail sort en PDF avec votre logo et vos couleurs, checklist remplie, photos avant/après et signature du client sur place. Joignez l'attestation technique et le rapport à la fiche du client et gardez tout au même endroit pour remettre et prouver le travail.",
        image: {
          src: '/segmentos/eletrica/2.webp',
          alt: "Professionnel de l'électricité inspectant une armoire électrique industrielle pour vérifier et documenter le travail",
        },
      },
      {
        icon: Smartphone,
        title: "Tout sur le téléphone de l'électricien, directement du chantier",
        body: "Tableau câblé, branchement remplacé, inspection faite, et la trace est prête au même instant. L'application Dominex s'installe directement sur le téléphone de l'électricien (PWA) : sur place il ouvre l'ordre de travail, prend des photos avant/après, déroule la checklist de sécurité et recueille la signature du client sur place. Le rapport est prêt immédiatement, sans retour au bureau pour le rédiger.",
        image: {
          src: '/segmentos/eletrica/3.webp',
          alt: 'Électricien avec un casque utilisant un téléphone sur le chantier en extérieur',
        },
      },
      {
        icon: RefreshCw,
        title: 'Contrats de maintenance électrique récurrente',
        body: "Copropriétés, usines et commerces ont besoin d'une maintenance préventive périodique de leurs installations électriques. Configurez le contrat avec la bonne cadence (mensuelle, trimestrielle) et Dominex génère les ordres de travail tout seul à l'intervalle convenu, checklist d'inspection prête. Vous honorez le contrat sans dépendre de la mémoire de personne.",
        image: {
          src: '/segmentos/eletrica/4.webp',
          alt: 'Technicien en EPI réalisant la maintenance de tableaux électriques dans un environnement industriel',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Ordres de travail numériques',
        desc: "Installation, maintenance et dépannage en quelques secondes, avec photos, checklist et signature du client directement dans l'application.",
      },
      {
        icon: Zap,
        title: 'Historique des tableaux et circuits',
        desc: "Branchement, disjoncteurs, charges et ce qui a été fait à chaque visite, enregistrés par point d'installation.",
      },
      {
        icon: FileSignature,
        title: 'Rapports et attestations à votre marque',
        desc: "Joignez attestations et rapports au client et générez le rapport d'ordre de travail en PDF à votre marque à la fin de chaque chantier.",
      },
      {
        icon: ClipboardList,
        title: 'Checklist de sécurité électrique',
        desc: "Consignation et inspection étape par étape à chaque visite, avec la trace de qui a exécuté.",
      },
      {
        icon: MapPin,
        title: 'Suivi terrain',
        desc: "Voyez sur la carte où se trouve chaque électricien et validez les pointages par l'adresse du client.",
      },
      {
        icon: Calendar,
        title: 'Planification intelligente',
        desc: "Planifiez les tournées, envoyez les interventions à l'électricien le plus proche et évitez les conflits d'horaire.",
      },
      {
        icon: Boxes,
        title: 'Stock de matériel électrique',
        desc: "Suivez disjoncteurs, câbles, gaines et connecteurs utilisés sur chaque ordre de travail, avec déduction automatique.",
      },
      {
        icon: BarChart3,
        title: 'Tableau de bord des opérations',
        desc: "Ordres de travail par statut, temps moyen de réalisation et notes des clients dans un tableau de bord en direct.",
      },
    ],
    testimonials: [
      {
        quote:
          "Avant, tout était dans nos têtes. Maintenant l'électricien arrive chez le client et voit déjà le tableau, le branchement et ce qui a été remplacé la dernière fois. Fini le travail à refaire.",
        name: 'Marcelo T.',
        role: 'Gérant',
        company: 'installations électriques tertiaires',
      },
      {
        quote:
          "Les attestations et rapports étaient éparpillés partout. Maintenant tout est sur la fiche du client, organisé. Quand ils en ont besoin, je les renvoie en quelques secondes.",
        name: 'Patrícia L.',
        role: 'Technicienne responsable',
        company: 'maintenance électrique industrielle',
      },
      {
        quote:
          "Un rapport avec mon logo et la signature du client sur place a donné un tout autre visage à l'entreprise. Les clients nous font plus confiance.",
        name: 'Diego F.',
        role: 'Fondateur',
        company: 'services électriques résidentiels',
      },
    ],
    faq: [
      {
        q: "Dominex convient-il aux entreprises d'installation et de maintenance électrique ?",
        a: "Oui. Il a été conçu pour les électriciens et les entreprises qui installent et entretiennent des installations électriques : branchements, tableaux de distribution, installations triphasées, circuits et maintenance préventive. Vous enregistrez chaque point d'installation, conservez l'historique et générez ordres de travail, devis et rapports au même endroit.",
      },
      {
        q: "Puis-je joindre des rapports et des attestations à l'ordre de travail ?",
        a: "Oui. Vous joignez rapports, attestations et photos directement à la fiche du client et aux ordres de travail. Tout reste organisé par adresse et par installation, prêt à renvoyer dès que le client en a besoin.",
      },
      {
        q: "Y a-t-il une checklist de sécurité pour les travaux électriques ?",
        a: "Oui. Vous montez des checklists configurables avec les étapes de consignation, d'inspection et de sécurité que votre équipe doit suivre à chaque visite, avec la trace de qui a exécuté, des photos et une signature. Ainsi vous pouvez prouver la procédure dès que nécessaire.",
      },
      {
        q: "L'électricien travaille-t-il depuis un téléphone ? Faut-il installer une application ?",
        a: "Oui, tout se passe sur le téléphone. Dominex est une application qui s'installe directement sur l'appareil de l'électricien (PWA), sans téléchargement depuis un store. Sur place il ouvre l'ordre de travail, prend des photos, déroule la checklist de sécurité et recueille la signature du client directement depuis le téléphone. Le rapport est prêt immédiatement.",
      },
      {
        q: "Puis-je générer des devis d'installation électrique ?",
        a: "Oui. Vous montez des devis avec matériel et main-d'œuvre, les envoyez au client par lien et suivez la validation. Quand le client valide, le devis devient un ordre de travail en un clic, équipe déjà affectée.",
      },
      {
        q: 'Comment fonctionnent les contrats de maintenance électrique préventive ?',
        a: "Vous configurez le contrat avec la cadence souhaitée (mensuelle, trimestrielle, etc.) et Dominex génère les ordres de travail automatiquement au bon intervalle, checklist d'inspection prête. Parfait pour les copropriétés, usines et commerces à maintenance périodique.",
      },
      {
        q: 'Puis-je voir où se trouve mon équipe sur le terrain ?',
        a: "Oui. La carte en direct montre où se trouve chaque électricien, et le pointage de visite est validé par l'adresse du client. Vous gardez un œil sur l'exploitation terrain sans passer d'appels.",
      },
      {
        q: 'Comment démarrer ? Faut-il une carte bancaire ?',
        a: "Créez simplement votre compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes, enregistrez vos clients et commencez à ouvrir des ordres de travail. Annulez quand vous voulez, vos données sont préservées si vous décidez de vous abonner.",
      },
    ],
    finalCta: {
      title: 'Prenez le contrôle de votre exploitation électrique',
      subtitle:
        "Gratuit pendant 14 jours, sans carte bancaire, sans tracas. Enregistrez vos clients, organisez vos rapports et attestations et faites passer votre équipe terrain au numérique.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Énergie solaire
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-energia-solar': {
    slug: 'logiciel-installateurs-solaires',
    metaTitle:
      "Logiciel d'ordres de travail et d'exploitation-maintenance pour les entreprises d'énergie solaire | Dominex",
    metaDescription:
      "Logiciel pour les entreprises d'énergie solaire : ordres de travail d'installation et d'exploitation-maintenance, historique par centrale et onduleur, nettoyage des modules, suivi de production, contrats de maintenance récurrents et application mobile pour votre équipe terrain. Essai gratuit de 14 jours, sans carte bancaire.",
    hero: {
      eyebrow: "Pour les installateurs et les entreprises d'énergie solaire",
      h1: "Logiciel d'ordres de travail et d'exploitation-maintenance pour les entreprises d'énergie solaire",
      h1Highlight: 'énergie solaire',
      subtitle:
        "Installation posée, mais le service après-vente est devenu le chaos ? Dominex organise vos ordres de travail d'installation et d'exploitation-maintenance, conserve l'historique de chaque centrale, onduleur et visite, et fait tourner vos contrats de maintenance tout seuls.",
    },
    metrics: [
      { value: '50k+', label: 'ordres de travail par mois sur la plateforme' },
      { value: 'O&M', label: 'maintenance des centrales avec historique par équipement' },
      { value: '100%', label: "sur le téléphone de l'équipe sur le terrain" },
      { value: '4,9/5', label: 'satisfaction des entreprises qui l\'utilisent' },
    ],
    pains: [
      {
        pain: '« Combien de panneaux sur cette centrale et quel onduleur est installé ? »',
        solution:
          "Chaque centrale conserve la fiche complète : nombre de modules PV, marque et puissance de l'onduleur, coffret de string, structure et chaque visite passée. L'équipe ouvre l'ordre de travail et voit tout, sans fouiller dans le dossier de conception.",
      },
      {
        pain: "Service après-vente et exploitation-maintenance oubliés jusqu'à ce que la production chute et que le client se plaigne",
        solution:
          "Les contrats d'exploitation-maintenance à cadence configurable génèrent les ordres de nettoyage et d'inspection tout seuls. Vous anticipez une chute de production au lieu de courir après la perte.",
      },
      {
        pain: "Nettoyage des modules et inspection faits sans rien pour le prouver",
        solution:
          "Le technicien clôture l'ordre de travail avec des photos de nettoyage avant/après, une checklist d'inspection des modules et de l'onduleur et la signature du client sur place. Vous prouvez la prestation et protégez le contrat.",
      },
      {
        pain: "Équipes d'installation éparpillées sans savoir qui est où",
        solution:
          "La carte en direct montre où se trouve chaque équipe, avec des pointages validés par l'adresse de la centrale. Planning et tournées restent organisés même avec plusieurs installations le même jour.",
      },
    ],
    deepDives: [
      {
        icon: Sun,
        title: 'Historique par centrale, onduleur et string',
        body: "Enregistrez chaque centrale PV avec le nombre de modules, la puissance installée (kWc), la marque et le modèle de l'onduleur, le coffret de string et la structure. Chaque visite, installation, nettoyage, inspection ou remplacement d'équipement, est rattachée à la centrale. Quand l'équipe revient, elle sait exactement ce qui est là et ce qui a été fait avant, sans avoir à ressortir le dossier de conception.",
        image: {
          src: '/segmentos/solar/1.webp',
          alt: "Vue aérienne d'une centrale solaire avec des rangées de modules PV en zone rurale",
        },
      },
      {
        icon: RefreshCw,
        title: "Contrats d'exploitation-maintenance qui génèrent les ordres tout seuls",
        body: "L'exploitation et la maintenance (O&M) sont ce qui maintient la production au fil des ans. Configurez le contrat avec la cadence de nettoyage et d'inspection (mensuelle, trimestrielle, semestrielle) et Dominex génère les ordres de travail automatiquement au bon intervalle, checklist de routine prête. La maintenance préventive a lieu sans que vous ayez à y penser.",
        image: {
          src: '/segmentos/solar/2.webp',
          alt: 'Trois techniciens en uniforme et casque nettoyant des modules solaires sur un toit',
        },
      },
      {
        icon: Smartphone,
        title: "Tout sur le téléphone de l'équipe, directement sur le toit",
        body: "Les centrales sont sur les toits, les hangars et en zone rurale, et l'équipe règle tout depuis le téléphone sur place. L'application Dominex s'installe directement sur l'appareil (PWA) : l'équipe ouvre l'ordre de travail, photographie le nettoyage des modules, remplit la checklist d'inspection de l'onduleur et recueille la signature du client sur place, à la centrale. Le rapport de visite est prêt immédiatement, sans le refaire au bureau.",
        image: {
          src: '/segmentos/solar/3.webp',
          alt: 'Technicien solaire en EPI travaillant sur des modules sur un toit sous un ciel bleu',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Ordres de travail numériques',
        desc: "Installation, exploitation-maintenance et dépannage en quelques secondes, avec photos, checklist et signature du client directement dans l'application.",
      },
      {
        icon: Sun,
        title: 'Historique par centrale et onduleur',
        desc: "Modules, puissance, onduleur et chaque visite enregistrés par centrale. L'équipe voit tout avant de monter sur le toit.",
      },
      {
        icon: RefreshCw,
        title: "Contrats d'exploitation-maintenance récurrents",
        desc: "Nettoyage et inspection génèrent les ordres de travail tout seuls au bon intervalle, par centrale.",
      },
      {
        icon: BarChart3,
        title: 'Suivi des opérations',
        desc: "Ordres de travail par statut, temps moyen de réalisation et notes des clients dans un tableau de bord en direct.",
      },
      {
        icon: MapPin,
        title: 'Suivi terrain',
        desc: "Voyez sur la carte où se trouve chaque équipe et validez les pointages par l'adresse de la centrale.",
      },
      {
        icon: Calendar,
        title: 'Planification intelligente',
        desc: "Planifiez la tournée des installations et envoyez les interventions d'exploitation-maintenance à l'équipe la plus proche.",
      },
      {
        icon: FileSignature,
        title: 'Rapport de visite à votre marque',
        desc: "PDF prêt dès la fin du nettoyage ou de l'inspection, avec votre logo, des photos et la signature du client.",
      },
      {
        icon: Boxes,
        title: "Stock de pièces et d'équipements",
        desc: "Suivez onduleurs, modules, connecteurs et câbles utilisés sur chaque ordre de travail, avec déduction automatique.",
      },
    ],
    testimonials: [
      {
        quote:
          "On vend beaucoup d'installations, mais le service après-vente était le chaos. Maintenant chaque centrale a un historique d'onduleur et de nettoyage. L'équipe arrive en sachant ce qu'elle va trouver.",
        name: 'Rafael G.',
        role: 'Associé',
        company: "intégrateur d'énergie solaire",
      },
      {
        quote:
          "Le contrat d'exploitation-maintenance est devenu prévisible : le système génère les ordres de nettoyage tout seul et la production ne chute plus sans prévenir. Le client remarque la différence.",
        name: 'Camila V.',
        role: "Coordinatrice exploitation-maintenance",
        company: 'maintenance de centrales PV',
      },
      {
        quote:
          "Équipe répartie sur plusieurs toits le même jour. Avec la carte en direct et le planning, j'ai arrêté d'appeler pour savoir où est chacun.",
        name: 'Lucas R.',
        role: "Responsable d'exploitation",
        company: 'installation solaire commerciale',
      },
    ],
    faq: [
      {
        q: "Dominex convient-il aux entreprises d'énergie solaire ?",
        a: "Oui. Il a été conçu pour les installateurs et les entreprises qui construisent et entretiennent des centrales PV. Vous enregistrez chaque centrale avec ses modules, son onduleur et sa structure, conservez l'historique d'installation et d'exploitation-maintenance et organisez vos ordres de travail, contrats et rapports au même endroit.",
      },
      {
        q: "Puis-je conserver l'historique de chaque centrale et onduleur ?",
        a: "Oui. Chaque centrale conserve le nombre de modules, la puissance installée, la marque et le modèle de l'onduleur, le coffret de string et chaque visite passée. L'équipe voit tout l'historique de la centrale avant même d'arriver sur place.",
      },
      {
        q: "Comment fonctionnent les contrats d'exploitation-maintenance et de maintenance préventive ?",
        a: "Vous configurez le contrat d'exploitation-maintenance avec la cadence de nettoyage et d'inspection (mensuelle, trimestrielle, semestrielle) et Dominex génère les ordres de travail automatiquement au bon intervalle, checklist de routine prête. La maintenance préventive a lieu sans dépendre de la mémoire de l'équipe.",
      },
      {
        q: "L'équipe travaille-t-elle depuis un téléphone ? Faut-il installer une application ?",
        a: "Oui, tout se passe sur le téléphone. Dominex est une application qui s'installe directement sur l'appareil de l'équipe (PWA), sans téléchargement depuis un store. À la centrale, l'équipe ouvre l'ordre de travail, photographie le nettoyage des modules, remplit la checklist d'inspection de l'onduleur et recueille la signature du client directement depuis le téléphone. Le rapport est prêt immédiatement.",
      },
      {
        q: "Puis-je prouver le nettoyage des modules et l'inspection ?",
        a: "Oui. Le technicien clôture l'ordre de travail avec des photos de nettoyage avant/après, une checklist d'inspection complétée et la signature du client sur place. Le rapport PDF à votre marque est prêt à remettre au client et à prouver la prestation.",
      },
      {
        q: 'Dominex surveille-t-il la production en temps réel ?',
        a: "Dominex organise le service terrain : ordres de travail, contrats d'exploitation-maintenance, historique par centrale et preuve de chaque visite. Il ne remplace pas le portail de votre onduleur, mais centralise tout ce que l'équipe fait sur la centrale pour que la maintenance maintienne la production.",
      },
      {
        q: "Puis-je voir où se trouve mon équipe d'installation ?",
        a: "Oui. La carte en direct montre où se trouve chaque équipe, et le pointage de visite est validé par l'adresse de la centrale. Vous planifiez la tournée même avec plusieurs installations le même jour.",
      },
      {
        q: 'Comment démarrer ? Faut-il une carte bancaire ?',
        a: "Créez simplement votre compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes, enregistrez vos centrales et commencez à ouvrir des ordres de travail. Annulez quand vous voulez, vos données sont préservées si vous décidez de vous abonner.",
      },
    ],
    finalCta: {
      title: "Organisez l'installation et l'exploitation-maintenance de vos centrales",
      subtitle:
        "Gratuit pendant 14 jours, sans carte bancaire, sans tracas. Enregistrez vos centrales, automatisez vos contrats de maintenance et faites passer votre équipe terrain au numérique.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Fournisseurs d'accès internet / Télécoms
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-provedores': {
    slug: 'logiciel-fournisseurs-internet',
    metaTitle:
      "Logiciel d'ordres de travail pour les fournisseurs d'accès internet et les télécoms | Dominex",
    metaDescription:
      "Logiciel pour les fournisseurs d'accès internet (FAI) et les télécoms : ordres de travail d'installation fibre, tickets de support, planification des visites, historique du point de raccordement et de l'ONT par abonné, suivi des équipements et application mobile pour vos techniciens sur le terrain. Essai gratuit de 14 jours, sans carte bancaire.",
    hero: {
      eyebrow: "Pour les fournisseurs d'accès internet et les télécoms",
      h1: "Logiciel d'ordres de travail pour les fournisseurs d'accès internet et les télécoms",
      h1Highlight: "fournisseurs d'accès internet",
      subtitle:
        "Installation fibre, ticket de support, remplacement d'ONT, et chaque technicien qui griffonne dans un carnet ? Dominex organise vos ordres de travail, planifie les visites et conserve l'historique du point de raccordement, de l'ONT et des équipements de chaque abonné.",
    },
    metrics: [
      { value: '50k+', label: 'ordres de travail par mois sur la plateforme' },
      { value: 'Fibre', label: 'installation et support avec historique par abonné' },
      { value: '100%', label: 'sur le téléphone du technicien sur le terrain' },
      { value: '4,9/5', label: 'satisfaction des entreprises qui l\'utilisent' },
    ],
    pains: [
      {
        pain: "« Sur quel point de raccordement est ce client et quelle ONT a été installée ? »",
        solution:
          "Chaque abonné conserve l'historique : point de raccordement d'origine, modèle et numéro de série de l'ONT, routeur et chaque visite passée. Le technicien ouvre l'ordre de travail et voit tout, sans appeler le NOC.",
      },
      {
        pain: "Ticket de support qui traîne parce que personne ne sait ce qui a déjà été fait",
        solution:
          "Chaque ticket devient un ordre de travail avec l'historique de l'abonné, des photos du problème et la trace de ce qui a été résolu. La visite suivante démarre déjà avec le contexte.",
      },
      {
        pain: "Planification au « on passe demain » pendant que le client attend toute la journée",
        solution:
          "La planification intelligente envoie les tickets au technicien le plus proche, organise la tournée du jour et donne un créneau d'arrivée prévisible. Moins de visites ratées, moins de clients agacés.",
      },
      {
        pain: "Équipement retiré ou remplacé et personne n'a mis à jour le stock",
        solution:
          "Suivi des équipements par ordre de travail : ONT, routeur et point de terminaison enregistrés à l'installation et à la dépose, avec déduction automatique du stock. Vous savez toujours où est chaque appareil.",
      },
    ],
    deepDives: [
      {
        icon: Radio,
        title: "Historique fibre, point de raccordement et ONT par abonné",
        body: "Enregistrez chaque abonné avec son point de raccordement : boîtier d'origine, port, modèle et numéro de série de l'ONT, routeur et point de terminaison installé. Installation fibre, remplacement d'équipement, réparation ou support : tout est rattaché à l'abonné. Quand le technicien revient, il connaît déjà le point de raccordement, l'équipement et ce qui a été fait avant, sans fouiller dans le système du NOC.",
        image: {
          src: '/segmentos/telecom/1.webp',
          alt: 'Technicien télécom manipulant des câbles réseau dans une baie pour consigner le point de raccordement',
        },
      },
      {
        icon: Calendar,
        title: 'Planification des visites et optimisation des tournées',
        body: "Les tickets d'installation et de support entrent dans le planning et sont envoyés au technicien le plus proche de l'adresse. La tournée du jour est optimisée pour réduire les trajets et le client reçoit un créneau d'arrivée prévisible. Moins de visites ratées, moins de temps mort pour le technicien et plus d'installations par jour.",
        image: {
          src: '/segmentos/telecom/2.webp',
          alt: "Pylône de télécommunications avec des antennes couvrant la zone de service du fournisseur",
        },
      },
      {
        icon: Smartphone,
        title: 'Tout sur le téléphone du technicien, directement en haut du poteau',
        body: "L'installation fibre se fait sur poteaux, dans les chambres de tirage, en sous-sol et en immeuble, et le technicien règle tout depuis le téléphone sur place. L'application Dominex s'installe directement sur l'appareil (PWA) : il ouvre l'ordre de travail, consigne le point de raccordement et l'ONT, prend des photos d'installation, remplit la checklist et recueille la signature de l'abonné sur place. L'ordre de travail est prêt immédiatement, sans retour au NOC pour le clôturer.",
        image: {
          src: '/segmentos/telecom/3.webp',
          alt: "Technicien avec casque et harnais de sécurité travaillant sur des câbles en haut d'un poteau",
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Ordres de travail et tickets',
        desc: "Installation, support et dépose en quelques secondes, avec photos, checklist et signature de l'abonné dans l'application.",
      },
      {
        icon: Radio,
        title: 'Historique point de raccordement, ONT et terminaison',
        desc: "Point de raccordement, équipement et chaque visite enregistrés par abonné. Le technicien voit tout avant d'arriver.",
      },
      {
        icon: Calendar,
        title: 'Planification des visites',
        desc: "Envoyez les tickets au technicien le plus proche, optimisez la tournée et donnez un créneau d'arrivée au client.",
      },
      {
        icon: Boxes,
        title: 'Suivi des équipements',
        desc: "ONT, routeur et terminaison enregistrés à l'installation et à la dépose, avec déduction automatique du stock.",
      },
      {
        icon: MapPin,
        title: 'Suivi terrain',
        desc: "Voyez sur la carte où se trouve chaque technicien et validez les pointages par l'adresse de l'abonné.",
      },
      {
        icon: RefreshCw,
        title: 'Récurrences maîtrisées',
        desc: "L'historique des tickets par abonné montre clairement quand un problème est revenu et ce qui a déjà été tenté.",
      },
      {
        icon: FileSignature,
        title: 'Rapport de visite à votre marque',
        desc: "PDF prêt dès la fin de l'installation ou de la réparation, avec votre logo et la signature du client.",
      },
      {
        icon: BarChart3,
        title: 'Tableau de bord des opérations',
        desc: "Tickets par statut, temps moyen de résolution et notes des abonnés dans un tableau de bord en direct.",
      },
    ],
    testimonials: [
      {
        quote:
          "Chaque technicien notait à sa façon. Maintenant l'historique du point de raccordement et de l'ONT est sur l'abonné. Le support est devenu bien plus rapide.",
        name: 'Fábio M.',
        role: 'Coordinateur technique',
        company: "fournisseur d'accès internet régional",
      },
      {
        quote:
          "La planification a organisé nos tournées. Le technicien fait plus d'installations fibre par jour et le client arrête d'attendre toute la journée.",
        name: 'Juliana C.',
        role: "Responsable d'exploitation",
        company: 'FAI fibre',
      },
      {
        quote:
          "L'équipement disparaissait en chemin. Avec la déduction par ordre de travail, je sais où est chaque ONT et chaque routeur.",
        name: 'Rodrigo A.',
        role: 'Associé',
        company: 'fournisseur haut débit',
      },
    ],
    faq: [
      {
        q: "Dominex convient-il aux fournisseurs d'accès internet et aux télécoms ?",
        a: "Oui. Il a été conçu pour les FAI et les entreprises télécoms qui installent la fibre, traitent les tickets de support et gèrent les équipements sur le terrain. Vous enregistrez chaque abonné avec son point de raccordement, conservez l'historique du point de raccordement et de l'ONT et organisez ordres de travail, planification et rapports au même endroit.",
      },
      {
        q: "Puis-je consigner le point de raccordement et l'ONT de chaque abonné ?",
        a: "Oui. Chaque abonné conserve le point de raccordement d'origine, le port, le modèle et le numéro de série de l'ONT, le routeur et le point de terminaison installé, ainsi que chaque visite passée. Le technicien voit tout l'historique avant d'arriver à l'adresse.",
      },
      {
        q: "Y a-t-il une planification et une optimisation des tournées ?",
        a: "Oui. Les tickets d'installation et de support entrent dans le planning et sont envoyés au technicien le plus proche, avec la tournée du jour optimisée pour réduire les trajets. Le client reçoit un créneau d'arrivée prévisible et vous réduisez les visites ratées.",
      },
      {
        q: "Puis-je suivre les équipements (ONT, routeur, terminaison) ?",
        a: "Oui. Chaque appareil est enregistré à l'installation et à la dépose par ordre de travail, avec déduction automatique du stock. Vous savez où est chaque ONT et chaque routeur et vous évitez de perdre des équipements.",
      },
      {
        q: "Le technicien travaille-t-il depuis un téléphone ? Faut-il installer une application ?",
        a: "Oui, tout se passe sur le téléphone. Dominex est une application qui s'installe directement sur l'appareil du technicien (PWA), sans téléchargement depuis un store. Sur l'installation, il ouvre l'ordre de travail, consigne le point de raccordement et l'ONT, prend des photos, remplit la checklist et recueille la signature de l'abonné directement depuis le téléphone. L'ordre de travail est prêt immédiatement.",
      },
      {
        q: 'Puis-je suivre la récurrence des tickets ?',
        a: "Oui. L'historique des tickets par abonné montre clairement quand un problème est revenu et ce qui a déjà été tenté, ce qui aide votre équipe de support à le résoudre définitivement au lieu de traiter chaque ticket comme neuf.",
      },
      {
        q: 'Puis-je voir où se trouvent mes techniciens sur le terrain ?',
        a: "Oui. La carte en direct montre où se trouve chaque technicien, et le pointage de visite est validé par l'adresse de l'abonné. Vous gardez un œil sur l'exploitation sans passer d'appels.",
      },
      {
        q: 'Comment démarrer ? Faut-il une carte bancaire ?',
        a: "Créez simplement votre compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes, enregistrez vos abonnés et commencez à ouvrir des ordres de travail. Annulez quand vous voulez, vos données sont préservées si vous décidez de vous abonner.",
      },
    ],
    finalCta: {
      title: "Prenez le contrôle du terrain de votre réseau",
      subtitle:
        "Gratuit pendant 14 jours, sans carte bancaire, sans tracas. Enregistrez vos abonnés, organisez vos installations fibre et faites passer votre équipe de support au numérique.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Vidéosurveillance / Sécurité électronique
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-cftv': {
    slug: 'logiciel-videosurveillance-securite',
    metaTitle:
      "Logiciel d'ordres de travail pour les entreprises de vidéosurveillance et de sécurité électronique | Dominex",
    metaDescription:
      "Logiciel pour les entreprises de vidéosurveillance et de sécurité électronique : ordres de travail d'installation et de maintenance de caméras, alarmes et contrôle d'accès, historique par équipement, contrats de télésurveillance récurrents et application mobile pour vos techniciens sur le terrain. Essai gratuit de 14 jours, sans carte bancaire.",
    hero: {
      eyebrow: 'Pour les entreprises de vidéosurveillance et de sécurité électronique',
      h1: "Logiciel d'ordres de travail pour les entreprises de vidéosurveillance et de sécurité électronique",
      h1Highlight: 'vidéosurveillance et sécurité électronique',
      subtitle:
        "Caméra installée, alarme configurée, contrôle d'accès livré, et l'historique disparaît ? Dominex organise vos ordres de travail, conserve la trace de chaque équipement et fait tourner vos contrats de télésurveillance.",
    },
    metrics: [
      { value: '50k+', label: 'ordres de travail par mois sur la plateforme' },
      { value: 'Vidéo', label: 'installation et maintenance avec historique par équipement' },
      { value: '100%', label: 'sur le téléphone du technicien sur le terrain' },
      { value: '4,9/5', label: 'satisfaction des entreprises qui l\'utilisent' },
    ],
    pains: [
      {
        pain: "« Combien de caméras chez ce client et quel enregistreur est installé ? »",
        solution:
          "Chaque client conserve la fiche : nombre et modèle de caméras, enregistreur, alarme, capteurs, contrôle d'accès et chaque visite. Le technicien ouvre l'ordre de travail et voit tout, sans appeler le bureau.",
      },
      {
        pain: "Contrat de télésurveillance oublié jusqu'à ce que la caméra tombe en panne et que le client le remarque",
        solution:
          "Les contrats de télésurveillance et de maintenance à cadence configurable génèrent les ordres d'inspection tout seuls. Vous anticipez une panne au lieu de la découvrir en même temps que le client.",
      },
      {
        pain: 'Maintenance et rondes faites sans rien pour le prouver',
        solution:
          "Le technicien clôture l'ordre de travail avec des photos des caméras et du système, une checklist d'inspection complétée et la signature du client. Vous prouvez chaque visite et protégez le contrat.",
      },
      {
        pain: 'Équipe éparpillée sur plusieurs installations sans contrôle',
        solution:
          "La carte en direct montre où se trouve chaque technicien, avec des pointages validés par l'adresse du client. Planning et tournées restent organisés même avec de nombreux chantiers dans la journée.",
      },
    ],
    deepDives: [
      {
        icon: Shield,
        title: "Historique des caméras, de l'alarme et du contrôle d'accès",
        body: "Enregistrez chaque client avec son parc installé : caméras (modèle, position, IP), enregistreur, centrale d'alarme, capteurs, serrures et contrôle d'accès. Installation, dépannage, repositionnement ou remplacement d'équipement : tout est rattaché au client. Quand le technicien revient, il sait déjà ce qui est là et ce qui a été fait avant.",
        image: {
          src: '/segmentos/cftv/1.webp',
          alt: "Ensemble de caméras de vidéosurveillance montées sur un poteau pointant dans plusieurs directions",
        },
      },
      {
        icon: RefreshCw,
        title: 'Contrats de télésurveillance et de maintenance récurrente',
        body: "La télésurveillance et la maintenance périodique du système de sécurité sont le revenu récurrent de l'activité. Configurez le contrat avec la cadence d'inspection (mensuelle, trimestrielle) et Dominex génère les ordres de travail automatiquement au bon intervalle, checklist de ronde technique prête. Le préventif a lieu sans que vous ayez à y penser.",
        image: {
          src: '/segmentos/cftv/2.webp',
          alt: "Opérateur dans une salle de supervision surveillant les flux des caméras sur plusieurs écrans",
        },
      },
      {
        icon: Smartphone,
        title: 'Tout sur le téléphone du technicien, directement sur la façade',
        body: "L'installation et la maintenance de vidéosurveillance se font sur les toits, les façades et les parkings, et le technicien règle tout depuis le téléphone sur place. L'application Dominex s'installe directement sur l'appareil (PWA) : il ouvre l'ordre de travail, photographie chaque caméra, consigne l'équipement, remplit la checklist et recueille la signature du client sur place. L'ordre de travail est prêt immédiatement, sans retour au bureau pour le clôturer.",
        image: {
          src: '/segmentos/cftv/3.webp',
          alt: "Caméra de sécurité de type dôme montée sur la façade d'un bâtiment",
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Ordres de travail numériques',
        desc: "Installation, maintenance et dépannage en quelques secondes, avec photos, checklist et signature du client dans l'application.",
      },
      {
        icon: Shield,
        title: 'Historique du parc installé',
        desc: "Caméras, enregistreur, alarme et contrôle d'accès enregistrés par client. Le technicien voit tout avant d'arriver.",
      },
      {
        icon: RefreshCw,
        title: 'Contrats de télésurveillance',
        desc: "Maintenance et inspection génèrent les ordres de travail tout seuls au bon intervalle, par client.",
      },
      {
        icon: Calendar,
        title: 'Planification intelligente',
        desc: "Planifiez les tournées, envoyez les interventions au technicien le plus proche et évitez les conflits d'horaire.",
      },
      {
        icon: MapPin,
        title: 'Suivi terrain',
        desc: "Voyez sur la carte où se trouve chaque technicien et validez les pointages par l'adresse du client.",
      },
      {
        icon: Boxes,
        title: "Stock d'équipements",
        desc: "Suivez caméras, câbles, connecteurs et centrales utilisés sur chaque ordre de travail, avec déduction automatique.",
      },
      {
        icon: FileSignature,
        title: 'Rapport de visite à votre marque',
        desc: "PDF prêt dès la fin de l'installation ou de la maintenance, avec votre logo et la signature du client.",
      },
      {
        icon: BarChart3,
        title: 'Tableau de bord des opérations',
        desc: "Ordres de travail par statut, temps moyen de réalisation et notes des clients dans un tableau de bord en direct.",
      },
    ],
    testimonials: [
      {
        quote:
          "Avant, on arrivait chez le client sans savoir combien de caméras il y avait. Maintenant tout le parc est sur la fiche. Le service est devenu tout autre.",
        name: 'Bruno S.',
        role: 'Gérant',
        company: "installation de vidéosurveillance et d'alarmes",
      },
      {
        quote:
          "Le contrat de télésurveillance est devenu prévisible. Le système génère les ordres d'inspection et on anticipe la panne avant que le client se plaigne.",
        name: 'Aline R.',
        role: 'Coordinatrice technique',
        company: 'sécurité électronique tertiaire',
      },
      {
        quote:
          "Équipe sur plusieurs chantiers le même jour. Avec le planning et la carte en direct, j'ai arrêté d'appeler pour savoir où est chaque technicien.",
        name: 'Thiago P.',
        role: 'Responsable',
        company: "contrôle d'accès et vidéosurveillance",
      },
    ],
    faq: [
      {
        q: 'Dominex convient-il aux entreprises de vidéosurveillance et de sécurité électronique ?',
        a: "Oui. Il a été conçu pour les entreprises qui installent et entretiennent caméras, alarmes, capteurs et contrôle d'accès. Vous enregistrez le parc installé de chaque client, conservez l'historique par équipement et organisez ordres de travail, contrats de télésurveillance et rapports au même endroit.",
      },
      {
        q: "Puis-je enregistrer le parc de caméras et d'équipements de chaque client ?",
        a: "Oui. Chaque client conserve le nombre et le modèle des caméras, l'enregistreur, la centrale d'alarme, les capteurs et le contrôle d'accès, ainsi que chaque visite passée. Le technicien voit tout l'historique avant d'arriver à l'adresse.",
      },
      {
        q: 'Comment fonctionnent les contrats de télésurveillance et de maintenance ?',
        a: "Vous configurez le contrat avec la cadence d'inspection (mensuelle, trimestrielle, etc.) et Dominex génère les ordres de travail automatiquement au bon intervalle, checklist de ronde technique prête. La maintenance préventive a lieu sans dépendre de la mémoire de l'équipe.",
      },
      {
        q: 'Puis-je prouver la maintenance et la ronde technique ?',
        a: "Oui. Le technicien clôture l'ordre de travail avec des photos des caméras et du système, une checklist d'inspection complétée et la signature du client sur place. Le rapport PDF à votre marque est prêt à remettre et à prouver la visite.",
      },
      {
        q: "Le technicien travaille-t-il depuis un téléphone ? Faut-il installer une application ?",
        a: "Oui, tout se passe sur le téléphone. Dominex est une application qui s'installe directement sur l'appareil du technicien (PWA), sans téléchargement depuis un store. Sur place il ouvre l'ordre de travail, photographie chaque caméra, consigne l'équipement, remplit la checklist et recueille la signature du client directement depuis le téléphone. L'ordre de travail est prêt immédiatement.",
      },
      {
        q: "Puis-je suivre le stock de caméras et d'équipements ?",
        a: "Oui. Vous suivez caméras, câbles, connecteurs et centrales utilisés sur chaque ordre de travail, avec déduction automatique du stock. Ainsi vous savez ce que vous avez et ce qui a été posé sur chaque installation.",
      },
      {
        q: 'Puis-je voir où se trouve mon équipe sur le terrain ?',
        a: "Oui. La carte en direct montre où se trouve chaque technicien, et le pointage de visite est validé par l'adresse du client. Vous gardez un œil sur l'exploitation même avec de nombreux chantiers le même jour.",
      },
      {
        q: 'Comment démarrer ? Faut-il une carte bancaire ?',
        a: "Créez simplement votre compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes, enregistrez vos clients et commencez à ouvrir des ordres de travail. Annulez quand vous voulez, vos données sont préservées si vous décidez de vous abonner.",
      },
    ],
    finalCta: {
      title: 'Prenez le contrôle de votre exploitation de sécurité',
      subtitle:
        "Gratuit pendant 14 jours, sans carte bancaire, sans tracas. Enregistrez le parc de chaque client, automatisez vos contrats de télésurveillance et faites passer votre équipe au numérique.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Construction
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-construcao-civil': {
    slug: 'logiciel-construction',
    metaTitle:
      "Logiciel d'ordres de travail pour les entreprises de construction et les chantiers | Dominex",
    metaDescription:
      "Logiciel pour la construction : ordres de travail pour les équipes terrain, inspections et métrés, suivi de planning, service après-vente avec historique par lot et application mobile pour votre équipe sur le chantier. Essai gratuit de 14 jours, sans carte bancaire.",
    hero: {
      eyebrow: 'Pour les constructeurs et les entreprises de construction',
      h1: "Logiciel d'ordres de travail pour les entreprises de construction",
      h1Highlight: 'construction',
      subtitle:
        "Équipe sur le chantier, inspection en attente, service après-vente sans trace ? Dominex organise les ordres de travail de vos équipes terrain, consigne inspections et métrés et conserve l'historique de chaque lot directement dans votre main.",
    },
    metrics: [
      { value: '50k+', label: 'ordres de travail par mois sur la plateforme' },
      { value: 'Chantier', label: 'équipes terrain et inspections avec preuve photo' },
      { value: '100%', label: "sur le téléphone de l'équipe sur le chantier" },
      { value: '4,9/5', label: 'satisfaction des entreprises qui l\'utilisent' },
    ],
    pains: [
      {
        pain: "« Qu'est-ce qui restait ouvert sur cette inspection déjà ? »",
        solution:
          "Chaque inspection devient un ordre de travail avec une checklist, des photos et les réserves consignées. L'équipe ouvre l'ordre de travail et voit ce qui reste à traiter, avec échéance et responsable, sans tableur parallèle.",
      },
      {
        pain: 'Service après-vente qui vire au casse-tête avec des clients mécontents',
        solution:
          "Chaque lot conserve l'historique des passages de garantie. Quand le client appelle, l'équipe sait déjà ce qui a été fait avant et clôture le passage avec photo et signature, sans travail à refaire.",
      },
      {
        pain: 'Travaux de sous-traitance métrés de mémoire, sans rien pour le prouver',
        solution:
          "Consignez le métré avec photos, checklist et description directement sur l'ordre de travail. Vous documentez ce qui a réellement été fait sur le terrain avant de libérer un paiement d'équipe ou de sous-traitant.",
      },
      {
        pain: 'Équipes éparpillées sur plusieurs chantiers sans contrôle',
        solution:
          "La carte en direct montre où se trouve chaque équipe, avec des pointages validés par l'adresse du chantier. Planning et tâches restent organisés même avec plusieurs fronts en parallèle.",
      },
    ],
    deepDives: [
      {
        icon: HardHat,
        title: 'Ordres de travail pour les équipes terrain et les inspections',
        body: "Attribuez tâches et inspections à vos équipes terrain sous forme d'ordres de travail, chacun avec une checklist, des photos et les réserves. Inspection de réception, inspection de phase, métré de sous-traitant ou reprise : tout est consigné avec un responsable, une échéance et une preuve photo. Le bureau suit l'avancement sans se rendre sur le chantier.",
        image: {
          src: '/segmentos/construcao/1.webp',
          alt: 'Ouvrier casqué inspectant un chantier de construction',
        },
      },
      {
        icon: Building,
        title: 'Historique par lot et service après-vente',
        body: "Enregistrez chaque lot ou programme et rattachez-y les passages de garantie. Quand le client demande une réparation sous garantie, l'équipe ouvre l'ordre de travail et voit déjà l'historique de ce lot : ce qui a été livré, ce qui a déjà été repris et ce qui reste ouvert. Le service après-vente cesse d'être improvisé et commence à laisser une trace.",
        image: {
          src: '/segmentos/construcao/2.webp',
          alt: "Programme résidentiel de plusieurs étages en construction avec échafaudages",
        },
      },
      {
        icon: Smartphone,
        title: "Tout sur le téléphone de l'équipe, directement sur le chantier",
        body: "Le chantier est là où le travail se fait : sous-sols, gros œuvre, zones en travaux, et l'équipe règle tout depuis le téléphone sur place. L'application Dominex s'installe directement sur l'appareil (PWA) : l'équipe ouvre l'ordre de travail, consigne l'inspection, prend des photos de phase, remplit la checklist et recueille la signature sur place. Le rapport est prêt immédiatement, sans le refaire au bureau.",
        image: {
          src: '/segmentos/construcao/3.webp',
          alt: "Ouvrier de la construction consultant les plans du projet sur une tablette sur le chantier",
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Ordres de travail pour le terrain',
        desc: "Attribuez tâches et inspections aux équipes en quelques secondes, avec checklist, photos et réserves.",
      },
      {
        icon: Building,
        title: 'Historique par lot et par chantier',
        desc: "Inspections, métrés et passages consignés par lot. L'équipe voit l'historique avant d'agir.",
      },
      {
        icon: ClipboardList,
        title: 'Inspections et métrés avec photos',
        desc: "Preuve photo et checklist pour chaque phase, avec responsable et échéance, prêtes à prouver.",
      },
      {
        icon: RefreshCw,
        title: 'Service après-vente',
        desc: "Passages de garantie rattachés au lot, avec un historique de ce qui a déjà été repris.",
      },
      {
        icon: MapPin,
        title: 'Suivi terrain',
        desc: "Voyez sur la carte où se trouve chaque équipe et validez les pointages par l'adresse du chantier.",
      },
      {
        icon: Calendar,
        title: 'Planning et tâches des équipes',
        desc: "Organisez les fronts de travail, attribuez les tâches et suivez l'avancement du planning.",
      },
      {
        icon: FileSignature,
        title: "Rapport d'inspection à votre marque",
        desc: "PDF prêt dès la fin de l'inspection ou du métré, avec votre logo, des photos et une signature.",
      },
      {
        icon: BarChart3,
        title: 'Tableau de bord des opérations',
        desc: "Ordres de travail par statut, réserves par chantier et temps moyen de réalisation dans un tableau de bord en direct.",
      },
    ],
    testimonials: [
      {
        quote:
          "Les inspections vivaient dans des tableurs et des photos éparses sur un téléphone. Maintenant chaque réserve devient un ordre de travail avec échéance et responsable. Le bureau suit sans se déplacer.",
        name: 'Eduardo M.',
        role: 'Conducteur de travaux',
        company: 'promoteur-constructeur',
      },
      {
        quote:
          "Le service après-vente était le chaos. Maintenant chaque lot a un historique et l'équipe arrive en sachant ce qui a déjà été repris. Le client sent la différence.",
        name: 'Renata B.',
        role: 'Coordinatrice service après-vente',
        company: 'promoteur et constructeur',
      },
      {
        quote:
          "Équipes sur plusieurs chantiers en même temps. Avec la carte en direct et les tâches, je sais ce que fait chaque front sans appeler personne.",
        name: 'Sérgio T.',
        role: 'Responsable de terrain',
        company: 'entreprise de construction et rénovation',
      },
    ],
    faq: [
      {
        q: 'Dominex convient-il aux entreprises de construction ?',
        a: "Oui. Il a été conçu pour les constructeurs, promoteurs et entreprises de construction qui doivent organiser équipes terrain, inspections, métrés et service après-vente. Vous attribuez des tâches sous forme d'ordres de travail, consignez chaque phase avec des photos et conservez l'historique par lot au même endroit.",
      },
      {
        q: 'Puis-je consigner les inspections et les réserves ?',
        a: "Oui. Chaque inspection devient un ordre de travail avec une checklist, des photos et les réserves, chacune avec un responsable et une échéance. Le bureau suit ce qui reste à traiter sans se rendre sur le chantier.",
      },
      {
        q: 'Puis-je gérer le service après-vente ?',
        a: "Oui. Chaque lot conserve l'historique des passages de garantie. Quand le client demande une réparation sous garantie, l'équipe ouvre l'ordre de travail et voit déjà ce qui a été livré, ce qui a été repris et ce qui reste ouvert, sans travail à refaire.",
      },
      {
        q: 'Comment fonctionnent les métrés terrain ?',
        a: "Vous consignez le métré avec photos, checklist et description directement sur l'ordre de travail. Ainsi vous documentez ce qui a réellement été fait sur le terrain avant de libérer un paiement d'équipe ou de sous-traitant, avec preuve visuelle.",
      },
      {
        q: "L'équipe travaille-t-elle depuis un téléphone ? Faut-il installer une application ?",
        a: "Oui, tout se passe sur le téléphone. Dominex est une application qui s'installe directement sur l'appareil de l'équipe (PWA), sans téléchargement depuis un store. Sur le chantier l'équipe ouvre l'ordre de travail, consigne l'inspection, prend des photos de phase, remplit la checklist et recueille la signature directement depuis le téléphone. Le rapport est prêt immédiatement.",
      },
      {
        q: "Puis-je suivre l'avancement du planning ?",
        a: "Oui. Tâches et fronts de travail restent organisés dans le planning, et le tableau de bord montre les ordres de travail par statut et les réserves par chantier. Vous suivez l'avancement des équipes sans dépendre d'un rapport manuel.",
      },
      {
        q: 'Puis-je voir où se trouvent mes équipes sur le terrain ?',
        a: "Oui. La carte en direct montre où se trouve chaque équipe, et le pointage de visite est validé par l'adresse du chantier. Vous gardez un œil sur plusieurs fronts en même temps sans passer d'appels.",
      },
      {
        q: 'Comment démarrer ? Faut-il une carte bancaire ?',
        a: "Créez simplement votre compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes, enregistrez vos chantiers et commencez à attribuer des ordres de travail. Annulez quand vous voulez, vos données sont préservées si vous décidez de vous abonner.",
      },
    ],
    finalCta: {
      title: 'Donnez le contrôle à vos équipes de chantier',
      subtitle:
        "Gratuit pendant 14 jours, sans carte bancaire, sans tracas. Organisez inspections, métrés et service après-vente et faites passer vos équipes terrain au numérique.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Ascenseurs
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-elevadores': {
    slug: 'logiciel-maintenance-ascenseurs',
    metaTitle:
      "Logiciel d'ordres de travail pour les entreprises de maintenance d'ascenseurs | Dominex",
    metaDescription:
      "Logiciel pour les entreprises de maintenance d'ascenseurs : ordres de travail préventifs et d'urgence, contrats mensuels récurrents, historique par appareil, interventions d'urgence et application mobile pour vos techniciens en salle des machines. Essai gratuit de 14 jours, sans carte bancaire.",
    hero: {
      eyebrow: "Pour les entreprises de maintenance d'ascenseurs",
      h1: "Logiciel d'ordres de travail pour les entreprises de maintenance d'ascenseurs",
      h1Highlight: "maintenance d'ascenseurs",
      subtitle:
        "Contrat mensuel, préventif à l'heure, intervention d'urgence traitée, et l'historique de chaque ascenseur disparaît ? Dominex organise vos ordres de travail, fait tourner vos contrats récurrents et conserve la trace de chaque appareil.",
    },
    metrics: [
      { value: '50k+', label: 'ordres de travail par mois sur la plateforme' },
      { value: 'Mensuel', label: 'contrats préventifs générant les ordres tout seuls' },
      { value: '100%', label: 'sur le téléphone du technicien en salle des machines' },
      { value: '4,9/5', label: 'satisfaction des entreprises qui l\'utilisent' },
    ],
    pains: [
      {
        pain: "« Qu'est-ce qui a été fait sur cet ascenseur au dernier préventif ? »",
        solution:
          "Chaque ascenseur conserve tout son historique : marque, capacité, nombre de niveaux, pièces remplacées et chaque visite. Le technicien ouvre l'ordre de travail et voit tout, sans appeler le bureau.",
      },
      {
        pain: "Préventif mensuel oublié jusqu'à ce que le contrat soit remis en cause",
        solution:
          "Les contrats de maintenance mensuels génèrent les ordres de travail préventifs automatiquement, au bon intervalle, checklist de routine prête. Vous honorez le contrat sans dépendre de la mémoire de personne.",
      },
      {
        pain: "Intervention d'urgence traitée sans trace de qui est venu ni de ce qui a été réparé",
        solution:
          "L'intervention d'urgence devient un ordre de travail avec l'heure, le technicien, une description et une photo de ce qui a été réparé. Vous pouvez prouver l'intervention et son délai à tout moment.",
      },
      {
        pain: 'Preuve de maintenance et de conformité éparpillée sur papier',
        solution:
          "Chaque visite génère un rapport PDF à votre marque avec la checklist remplie et la signature du syndic ou du responsable. L'historique de conformité de l'ascenseur reste organisé et prêt à présenter.",
      },
    ],
    deepDives: [
      {
        icon: Building,
        title: 'Historique complet par ascenseur',
        body: "Enregistrez chaque ascenseur avec sa marque, son modèle, sa capacité, son nombre de niveaux, son type de machine et son emplacement dans le bâtiment. Préventif, correctif, remplacement de pièce ou modernisation : tout est rattaché à l'appareil, pas seulement au bâtiment. Quand le technicien revient, il sait exactement ce qui a été fait à la dernière visite et quelles pièces ont déjà été remplacées.",
        image: {
          src: '/segmentos/elevadores/1.webp',
          alt: "Portes d'ascenseur en acier inoxydable dans le hall d'un bâtiment moderne",
        },
      },
      {
        icon: RefreshCw,
        title: 'Contrats mensuels qui génèrent le préventif tout seuls',
        body: "La maintenance préventive mensuelle est la colonne vertébrale d'un contrat d'ascenseur. Configurez le contrat avec une cadence mensuelle et Dominex génère les ordres de travail automatiquement au bon intervalle, checklist de routine préventive prête. Vous ne ratez jamais une visite contractuelle et n'êtes jamais pris au dépourvu si le client remet en cause la fréquence.",
        image: {
          src: '/segmentos/elevadores/2.webp',
          alt: 'Technicien réalisant la maintenance de machines industrielles',
        },
      },
      {
        icon: Smartphone,
        title: 'Tout sur le téléphone du technicien, directement en salle des machines',
        body: "La salle des machines, la cuvette et la gaine sont là où le travail se fait, et le technicien règle tout depuis le téléphone sur place. L'application Dominex s'installe directement sur l'appareil (PWA) : il ouvre l'ordre de travail, remplit la checklist d'inspection, consigne les pièces, prend des photos et recueille la signature du responsable sur place. Le rapport est prêt immédiatement, sans le refaire au bureau.",
        image: {
          src: '/segmentos/elevadores/3.webp',
          alt: "Vue d'une cuvette d'ascenseur industriel éclairée",
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Ordres de travail numériques',
        desc: "Préventif, correctif et urgence en quelques secondes, avec checklist, photos et signature dans l'application.",
      },
      {
        icon: Building,
        title: 'Historique par ascenseur',
        desc: "Marque, capacité, niveaux et pièces remplacées enregistrés par appareil. Le technicien voit tout avant d'arriver.",
      },
      {
        icon: RefreshCw,
        title: 'Contrats mensuels récurrents',
        desc: "Le préventif mensuel génère les ordres de travail tout seul, au bon intervalle, par ascenseur.",
      },
      {
        icon: Calendar,
        title: "Intervention d'urgence",
        desc: "Intervention d'urgence consignée avec heure, technicien et un délai d'intervention prouvé.",
      },
      {
        icon: MapPin,
        title: 'Suivi terrain',
        desc: "Voyez sur la carte où se trouve chaque technicien et validez les pointages par l'adresse du bâtiment.",
      },
      {
        icon: Boxes,
        title: 'Stock de pièces',
        desc: "Suivez les pièces et composants utilisés sur chaque ordre de travail, avec déduction automatique du stock.",
      },
      {
        icon: FileSignature,
        title: 'Rapport de maintenance à votre marque',
        desc: "PDF prêt dès la fin de la visite, avec votre logo, la checklist et la signature du responsable.",
      },
      {
        icon: BarChart3,
        title: 'Tableau de bord des opérations',
        desc: "Ordres de travail par statut, délai d'intervention d'urgence et visites par contrat dans un tableau de bord en direct.",
      },
    ],
    testimonials: [
      {
        quote:
          "Chaque ascenseur a maintenant un historique de pièces et de préventif. Le technicien arrive en sachant ce qui a été fait la dernière fois. Fini le « je ne savais pas ».",
        name: 'Marcos V.',
        role: 'Responsable technique',
        company: "maintenance d'ascenseurs",
      },
      {
        quote:
          "Le préventif mensuel génère les ordres de travail tout seul. Plus aucun syndic ne m'a jamais facturé une visite que je ne pouvais pas prouver.",
        name: 'Cláudia F.',
        role: 'Technicienne responsable',
        company: "entretien d'ascenseurs",
      },
      {
        quote:
          "Les interventions d'urgence sont toutes consignées avec heure et délai. Cela a beaucoup pesé dans les renouvellements de contrat.",
        name: 'Henrique L.',
        role: 'Associé',
        company: 'ascenseurs et plateformes',
      },
    ],
    faq: [
      {
        q: "Dominex convient-il aux entreprises de maintenance d'ascenseurs ?",
        a: "Oui. Il a été conçu pour les entreprises qui réalisent la maintenance préventive et corrective d'ascenseurs sous contrat mensuel. Vous enregistrez chaque ascenseur, conservez l'historique par appareil, générez les préventifs automatiquement et consignez les interventions d'urgence au même endroit.",
      },
      {
        q: 'Comment fonctionnent les contrats préventifs mensuels ?',
        a: "Vous configurez le contrat avec une cadence mensuelle et Dominex génère les ordres de travail préventifs automatiquement au bon intervalle, checklist de routine prête. Vous honorez le contrat sans dépendre de la mémoire de l'équipe et restez protégé si la fréquence est remise en cause.",
      },
      {
        q: "Puis-je consigner l'historique de chaque ascenseur ?",
        a: "Oui. Chaque ascenseur conserve la marque, la capacité, le nombre de niveaux, les pièces remplacées et chaque visite passée. Le technicien voit tout l'historique de l'appareil avant même d'arriver au bâtiment.",
      },
      {
        q: "Comment fonctionnent les interventions d'urgence ?",
        a: "L'intervention d'urgence devient un ordre de travail avec l'heure d'ouverture, le technicien responsable, une description et une photo de ce qui a été réparé. Vous pouvez prouver l'intervention et son délai à tout moment, ce qui pèse dans les renouvellements de contrat.",
      },
      {
        q: "Le technicien travaille-t-il depuis un téléphone ? Faut-il installer une application ?",
        a: "Oui, tout se passe sur le téléphone. Dominex est une application qui s'installe directement sur l'appareil du technicien (PWA), sans téléchargement depuis un store. En salle des machines il ouvre l'ordre de travail, remplit la checklist d'inspection, consigne les pièces, prend des photos et recueille la signature du responsable directement depuis le téléphone. Le rapport est prêt immédiatement.",
      },
      {
        q: 'Génère-t-il un rapport de maintenance pour le bâtiment ?',
        a: "Oui. Chaque visite génère un rapport PDF à votre marque avec la checklist remplie et la signature du syndic ou du responsable. L'historique de maintenance et de conformité de l'ascenseur reste organisé et prêt à présenter.",
      },
      {
        q: 'Puis-je suivre les pièces utilisées à chaque visite ?',
        a: "Oui. Vous consignez les pièces et composants utilisés sur chaque ordre de travail, avec déduction automatique du stock. Ainsi vous savez ce qui a été posé sur chaque ascenseur et gardez le contrôle de ce que vous avez en stock.",
      },
      {
        q: 'Comment démarrer ? Faut-il une carte bancaire ?',
        a: "Créez simplement votre compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes, enregistrez vos ascenseurs et commencez à ouvrir des ordres de travail. Annulez quand vous voulez, vos données sont préservées si vous décidez de vous abonner.",
      },
    ],
    finalCta: {
      title: "Prenez le contrôle de votre maintenance d'ascenseurs",
      subtitle:
        "Gratuit pendant 14 jours, sans carte bancaire, sans tracas. Enregistrez vos ascenseurs, automatisez le préventif mensuel et faites passer votre équipe terrain au numérique.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Nettoyage
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-limpeza-conservacao': {
    slug: 'logiciel-nettoyage',
    metaTitle:
      "Logiciel d'ordres de travail pour les entreprises de nettoyage et de propreté | Dominex",
    metaDescription:
      "Logiciel pour les entreprises de nettoyage et de propreté : ordres de travail par site et par contrat, checklists de nettoyage, rondes avec preuve photo et signature, contrôle des équipes terrain et application mobile pour votre équipe. Essai gratuit de 14 jours, sans carte bancaire.",
    hero: {
      eyebrow: 'Pour les entreprises de nettoyage et de propreté',
      h1: "Logiciel d'ordres de travail pour les entreprises de nettoyage et de propreté",
      h1Highlight: 'nettoyage et propreté',
      subtitle:
        "Un site sans preuve de prestation, des rondes sans trace, un client qui conteste ce qui a été fait ? Dominex organise les ordres de travail par contrat et par site, avec checklist, photo et signature pour prouver chaque nettoyage.",
    },
    metrics: [
      { value: '50k+', label: 'ordres de travail par mois sur la plateforme' },
      { value: 'Site', label: 'prestation par contrat avec preuve photo' },
      { value: '100%', label: "sur le téléphone de l'équipe sur le terrain" },
      { value: '4,9/5', label: 'satisfaction des entreprises qui l\'utilisent' },
    ],
    pains: [
      {
        pain: '« Comment prouver au client que le nettoyage a été fait ? »',
        solution:
          "Chaque prestation se clôture avec une checklist complétée, des photos avant/après et la signature du superviseur sur place. Vous prouvez que c'est fait et mettez fin au « ça n'a pas été fait ».",
      },
      {
        pain: 'Rondes et travail de routine sans trace de qui est venu et quand',
        solution:
          "La ronde devient un ordre de travail avec un pointage validé par lieu et heure. Vous savez exactement qui était sur chaque site et ce qui a été fait, sans dépendre de la parole de l'équipe.",
      },
      {
        pain: 'Un contrat avec plusieurs sites et aucun contrôle sur ce qui a été fait',
        solution:
          "Enregistrez chaque contrat avec ses sites et ses routines. Les ordres de travail sont générés au bon intervalle et vous suivez la conformité de chaque site sur un tableau de bord, pas sur la confiance.",
      },
      {
        pain: 'Équipes éparpillées sur plusieurs clients sans visibilité',
        solution:
          "La carte en direct montre où se trouve chaque équipe, avec des pointages validés par l'adresse du site. Planning et routines restent organisés même avec de nombreux contrats en parallèle.",
      },
    ],
    deepDives: [
      {
        icon: Sparkles,
        title: 'Ordres de travail par contrat et par site',
        body: "Enregistrez chaque contrat avec ses sites de prestation et les routines de nettoyage et de propreté. Chaque visite devient un ordre de travail avec la checklist de routine, des photos et une signature. Vous suivez ce qui a été fait sur chaque site et disposez de la trace prête à montrer au client dès que la prestation est contestée.",
        image: {
          src: '/segmentos/limpeza/1.webp',
          alt: "Équipe de nettoyage en uniforme aspirant le sol d'un espace commercial",
        },
      },
      {
        icon: MapPin,
        title: 'Rondes et pointage avec preuve de lieu et heure',
        body: "La ronde et la routine de propreté sont consignées avec un pointage validé par l'adresse du site et l'heure du passage. Vous savez qui était à chaque endroit, à quelle heure et ce qui a été fait, avec photo et signature. La preuve remplace la parole de l'équipe et protège le contrat lors de tout audit client.",
        image: {
          src: '/segmentos/limpeza/2.webp',
          alt: "Professionnel de la propreté effectuant une ronde et nettoyant une allée d'accès",
        },
      },
      {
        icon: Smartphone,
        title: "Tout sur le téléphone de l'équipe, directement sur le site",
        body: "Les sites de nettoyage incluent sous-sols, parkings et cages d'escalier, et l'équipe règle tout depuis le téléphone sur place. L'application Dominex s'installe directement sur l'appareil (PWA) : l'équipe ouvre l'ordre de travail, coche la checklist de routine, prend des photos avant/après et recueille la signature du superviseur sur place. La preuve est consignée immédiatement, sans la rédiger plus tard.",
        image: {
          src: '/segmentos/limpeza/3.webp',
          alt: "Agent de nettoyage en tenue de protection raclant le sol d'un entrepôt",
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Ordres de travail par site',
        desc: "Routines de nettoyage et de propreté en quelques secondes, avec checklist, photos et signature dans l'application.",
      },
      {
        icon: Sparkles,
        title: 'Checklist de nettoyage configurable',
        desc: "Montez le pas à pas de chaque routine et assurez-vous que rien n'est oublié sur le site.",
      },
      {
        icon: MapPin,
        title: 'Rondes avec pointage validé',
        desc: "Une trace de qui est passé sur chaque site, avec lieu et heure prouvés.",
      },
      {
        icon: RefreshCw,
        title: 'Contrats et routines récurrents',
        desc: "Les ordres de travail par site sont générés au bon intervalle, sans tableur.",
      },
      {
        icon: Calendar,
        title: 'Planning des équipes',
        desc: "Organisez les sites de la journée, affectez les équipes et suivez la conformité des routines.",
      },
      {
        icon: FileSignature,
        title: 'Preuve photo et signature',
        desc: "Photos avant/après et signature du superviseur clôturent chaque prestation, prêtes à présenter.",
      },
      {
        icon: BarChart3,
        title: 'Tableau de bord des opérations',
        desc: "Routines réalisées par site, réserves et notes des clients dans un tableau de bord en direct.",
      },
      {
        icon: Users,
        title: 'Contrôle des équipes terrain',
        desc: "Voyez sur la carte où se trouve chaque équipe et suivez plusieurs contrats en même temps.",
      },
    ],
    testimonials: [
      {
        quote:
          "Le client répétait que le nettoyage n'avait pas été fait. Maintenant chaque site a des photos avant/après et une signature. Le débat est clos.",
        name: 'Vanessa M.',
        role: 'Responsable des contrats',
        company: 'entreprise de nettoyage et de propreté',
      },
      {
        quote:
          "Les rondes ont maintenant un pointage avec heure et lieu. Je sais exactement qui est passé sur chaque site et à quelle heure.",
        name: 'Paulo R.',
        role: "Superviseur d'exploitation",
        company: 'propreté tertiaire',
      },
      {
        quote:
          "Avec plusieurs contrats en parallèle, le tableau de bord me montre ce qui a été fait sur chaque site sans que j'appelle personne.",
        name: 'Sandra L.',
        role: 'Associée',
        company: 'services de nettoyage externalisés',
      },
    ],
    faq: [
      {
        q: 'Dominex convient-il aux entreprises de nettoyage et de propreté ?',
        a: "Oui. Il a été conçu pour les entreprises qui gèrent des sites et des contrats de nettoyage et de propreté. Vous enregistrez chaque contrat avec ses sites et ses routines, générez les ordres de travail, prouvez la prestation par photo et signature et suivez la conformité au même endroit.",
      },
      {
        q: 'Comment prouver au client que le nettoyage a été fait ?',
        a: "Chaque prestation se clôture avec une checklist complétée, des photos avant/après et la signature du superviseur sur place. Le rapport PDF à votre marque est prêt à présenter, mettant fin au « ça n'a pas été fait ».",
      },
      {
        q: 'Puis-je consigner les rondes et la routine de propreté ?',
        a: "Oui. La ronde devient un ordre de travail avec un pointage validé par l'adresse du site et l'heure du passage. Vous savez qui était à chaque endroit, à quelle heure et ce qui a été fait, sans dépendre de la parole de l'équipe.",
      },
      {
        q: 'Puis-je gérer des contrats avec plusieurs sites ?',
        a: "Oui. Vous enregistrez chaque contrat avec ses sites et ses routines, les ordres de travail sont générés au bon intervalle et le tableau de bord montre la conformité de chaque site. Vous suivez tout sans tableur et sans vous reposer uniquement sur la parole de l'équipe.",
      },
      {
        q: "L'équipe travaille-t-elle depuis un téléphone ? Faut-il installer une application ?",
        a: "Oui, tout se passe sur le téléphone. Dominex est une application qui s'installe directement sur l'appareil de l'équipe (PWA), sans téléchargement depuis un store. Sur le site l'équipe ouvre l'ordre de travail, coche la checklist de routine, prend des photos avant/après et recueille la signature du superviseur directement depuis le téléphone. La preuve est consignée immédiatement.",
      },
      {
        q: 'Puis-je monter la checklist de chaque routine de nettoyage ?',
        a: "Oui. Vous montez des checklists configurables avec le pas à pas de chaque routine de nettoyage et de propreté, en vous assurant que rien n'est oublié sur le site et que l'équipe suit le standard convenu avec le client.",
      },
      {
        q: 'Puis-je voir où se trouvent mes équipes sur le terrain ?',
        a: "Oui. La carte en direct montre où se trouve chaque équipe, et le pointage est validé par l'adresse du site. Vous suivez plusieurs contrats en même temps sans passer d'appels.",
      },
      {
        q: 'Comment démarrer ? Faut-il une carte bancaire ?',
        a: "Créez simplement votre compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes, enregistrez vos contrats et sites et commencez à ouvrir des ordres de travail. Annulez quand vous voulez, vos données sont préservées si vous décidez de vous abonner.",
      },
    ],
    finalCta: {
      title: 'Prouvez chaque nettoyage et protégez vos contrats',
      subtitle:
        "Gratuit pendant 14 jours, sans carte bancaire, sans tracas. Enregistrez vos sites, organisez les routines et faites passer vos équipes terrain au numérique avec preuve à l'appui.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Lutte antiparasitaire
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-dedetizacao': {
    slug: 'logiciel-lutte-antiparasitaire',
    metaTitle:
      "Logiciel d'ordres de travail pour les entreprises de lutte antiparasitaire | Dominex",
    metaDescription:
      "Logiciel pour les entreprises de lutte antiparasitaire : ordres de travail avec traçabilité des produits appliqués, attestations de prestation, contrats récurrents, planification périodique et application mobile pour vos applicateurs sur le terrain. Essai gratuit de 14 jours, sans carte bancaire.",
    hero: {
      eyebrow: 'Pour les entreprises de lutte antiparasitaire',
      h1: "Logiciel d'ordres de travail pour les entreprises de lutte antiparasitaire",
      h1Highlight: 'lutte antiparasitaire',
      subtitle:
        "Produits appliqués sans trace, attestation faite à la dernière minute, contrat récurrent oublié ? Dominex organise vos ordres de travail, enregistre les produits appliqués et émet une attestation à votre marque à chaque visite.",
    },
    metrics: [
      { value: '50k+', label: 'ordres de travail par mois sur la plateforme' },
      { value: 'Attestation', label: 'émise à chaque visite' },
      { value: '100%', label: "sur le téléphone de l'applicateur sur le terrain" },
      { value: '4,9/5', label: 'satisfaction des entreprises qui l\'utilisent' },
    ],
    pains: [
      {
        pain: "« Quel produit et quelle dose on a appliqués chez ce client ? »",
        solution:
          "Chaque visite enregistre les produits appliqués, la dose, la méthode et le nuisible ciblé. L'historique est rattaché au client, et l'applicateur ouvre l'ordre de travail et voit ce qui a été utilisé avant, sans appeler le bureau.",
      },
      {
        pain: 'Attestation de prestation faite à la main, après coup, sans standard',
        solution:
          "L'attestation de prestation sort en PDF à votre marque dès la fin de la visite, avec les produits appliqués, la date de validité et le technicien responsable. Remise sur place, sans travail à refaire.",
      },
      {
        pain: "Contrat récurrent oublié jusqu'à ce que les nuisibles reviennent et que le client se plaigne",
        solution:
          "Les contrats de lutte antiparasitaire à cadence configurable génèrent les ordres de retraitement tout seuls, au bon intervalle. Vous gardez le client protégé et le contrat actif.",
      },
      {
        pain: 'Applicateur sur le terrain sans rien pour prouver ce qui a été fait',
        solution:
          "L'applicateur clôture l'ordre de travail avec des photos du chantier, une checklist complétée et la signature du client. Vous prouvez l'application et protégez l'entreprise lors de tout contrôle.",
      },
    ],
    deepDives: [
      {
        icon: Droplets,
        title: 'Traçabilité des produits appliqués et attestation de prestation',
        body: "Chaque visite enregistre les produits appliqués, la dose, la méthode (pulvérisation, poste d'appâtage, gel), le nuisible ciblé et le technicien responsable. À partir de cette trace, l'attestation de prestation sort en PDF à votre marque, avec la date de validité et les produits utilisés, prête à remettre au client et à présenter à un contrôle sanitaire. Rien n'est rempli à la main après coup.",
        image: {
          src: '/segmentos/dedetizacao/1.webp',
          alt: "Technicien de lutte antiparasitaire réalisant une nébulisation à chaud avec un appareil de fumigation",
        },
      },
      {
        icon: RefreshCw,
        title: 'Contrats et planification périodique des retraitements',
        body: "La lutte antiparasitaire dépend du retraitement à la bonne fréquence. Configurez le contrat avec la cadence (mensuelle, bimestrielle, trimestrielle) et Dominex génère les ordres de retraitement automatiquement à l'intervalle convenu, planification déjà faite. Le client reste protégé et vous ne perdez pas le renouvellement par oubli.",
        image: {
          src: '/segmentos/dedetizacao/2.webp',
          alt: 'Applicateur en tenue de protection pulvérisant un produit lors d\'un retraitement',
        },
      },
      {
        icon: Smartphone,
        title: "Tout sur le téléphone de l'applicateur, directement sur place",
        body: "La lutte antiparasitaire se déroule dans les entrepôts, sous-sols et réserves, et l'applicateur règle tout depuis le téléphone sur place. L'application Dominex s'installe directement sur l'appareil (PWA) : il ouvre l'ordre de travail, enregistre les produits et la dose, prend des photos du chantier, remplit la checklist et recueille la signature du client sur place. L'attestation est prête immédiatement, sans la refaire au bureau.",
        image: {
          src: '/segmentos/dedetizacao/3.webp',
          alt: "Applicateur en uniforme réalisant une lutte antiparasitaire dans un entrepôt",
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Ordres de travail numériques',
        desc: "Désinsectisation, dératisation et retraitement en quelques secondes, avec checklist, photos et signature dans l'application.",
      },
      {
        icon: Droplets,
        title: 'Traçabilité des produits appliqués',
        desc: "Produit, dose, méthode et nuisible ciblé enregistrés par visite, avec l'historique rattaché au client.",
      },
      {
        icon: FileSignature,
        title: 'Attestation de prestation',
        desc: "PDF à votre marque avec produits, date de validité et technicien responsable, prêt dès la fin de la visite.",
      },
      {
        icon: RefreshCw,
        title: 'Contrats de retraitement récurrents',
        desc: "Les ordres de retraitement sont générés au bon intervalle, par contrat.",
      },
      {
        icon: Calendar,
        title: 'Planification périodique',
        desc: "Planifiez les retraitements, affectez les applicateurs et ne ratez jamais la fenêtre du contrat.",
      },
      {
        icon: MapPin,
        title: 'Suivi terrain',
        desc: "Voyez sur la carte où se trouve chaque applicateur et validez les pointages par l'adresse du client.",
      },
      {
        icon: Boxes,
        title: 'Stock de produits',
        desc: "Suivez les produits chimiques et appâts utilisés sur chaque ordre de travail, avec déduction automatique du stock.",
      },
      {
        icon: BarChart3,
        title: 'Tableau de bord des opérations',
        desc: "Ordres de travail par statut, retraitements par contrat et notes des clients dans un tableau de bord en direct.",
      },
    ],
    testimonials: [
      {
        quote:
          "L'attestation se faisait à la main, après coup, et ça bloquait tout. Maintenant elle sort à notre marque dès que l'applicateur a fini. Le client la reçoit lors de la même visite.",
        name: 'Gustavo M.',
        role: 'Gérant',
        company: 'lutte antiparasitaire urbaine',
      },
      {
        quote:
          "Chaque client a l'historique du produit et de la dose appliqués. Quand j'y retourne, je sais exactement ce que j'ai utilisé la dernière fois.",
        name: 'Letícia A.',
        role: 'Technicienne responsable',
        company: 'désinsectisation et dératisation',
      },
      {
        quote:
          "Les contrats de retraitement génèrent les ordres de travail tout seuls. J'ai arrêté de perdre des renouvellements en oubliant la fréquence.",
        name: 'Roberto C.',
        role: 'Associé',
        company: 'lutte antiparasitaire commerciale',
      },
    ],
    faq: [
      {
        q: 'Dominex convient-il aux entreprises de lutte antiparasitaire ?',
        a: "Oui. Il a été conçu pour les entreprises de désinsectisation et de dératisation. Vous enregistrez chaque client, tracez les produits appliqués à chaque visite, émettez l'attestation de prestation et gérez les contrats de retraitement récurrents au même endroit.",
      },
      {
        q: "Le système génère-t-il l'attestation de prestation ?",
        a: "Oui. Dès la fin de la visite, l'attestation de prestation sort en PDF à votre marque, avec les produits appliqués, la date de validité et le technicien responsable. Vous la remettez au client sur place et disposez du document prêt à présenter à un contrôle sanitaire.",
      },
      {
        q: 'Puis-je enregistrer les produits et la dose appliqués ?',
        a: "Oui. Chaque visite enregistre les produits appliqués, la dose, la méthode (pulvérisation, poste d'appâtage, gel) et le nuisible ciblé. L'historique est rattaché au client, et l'applicateur voit ce qui a été utilisé avant d'arriver sur place.",
      },
      {
        q: 'Comment fonctionnent les contrats de retraitement périodique ?',
        a: "Vous configurez le contrat avec la cadence souhaitée (mensuelle, bimestrielle, trimestrielle, etc.) et Dominex génère les ordres de retraitement automatiquement au bon intervalle, planification déjà faite. Le client reste protégé et vous ne perdez pas le renouvellement par oubli.",
      },
      {
        q: "L'applicateur travaille-t-il depuis un téléphone ? Faut-il installer une application ?",
        a: "Oui, tout se passe sur le téléphone. Dominex est une application qui s'installe directement sur l'appareil de l'applicateur (PWA), sans téléchargement depuis un store. Sur place il ouvre l'ordre de travail, enregistre les produits et la dose, prend des photos du chantier, remplit la checklist et recueille la signature du client directement depuis le téléphone. L'attestation est prête immédiatement.",
      },
      {
        q: "Puis-je prouver l'application lors d'un contrôle ?",
        a: "Oui. L'applicateur clôture l'ordre de travail avec des photos du chantier, une checklist complétée et la signature du client, et l'attestation trace les produits et le technicien responsable. Vous prouvez chaque application et gardez l'entreprise conforme.",
      },
      {
        q: 'Puis-je suivre le stock de produits chimiques ?',
        a: "Oui. Vous suivez les produits chimiques et appâts utilisés sur chaque ordre de travail, avec déduction automatique du stock. Ainsi vous savez ce qui a été appliqué chez chaque client et ce dont vous disposez.",
      },
      {
        q: 'Comment démarrer ? Faut-il une carte bancaire ?',
        a: "Créez simplement votre compte et utilisez-le gratuitement pendant 14 jours, sans carte bancaire. Vous configurez votre entreprise en quelques minutes, enregistrez vos clients et commencez à ouvrir des ordres de travail. Annulez quand vous voulez, vos données sont préservées si vous décidez de vous abonner.",
      },
    ],
    finalCta: {
      title: 'Prenez le contrôle de votre exploitation de lutte antiparasitaire',
      subtitle:
        "Gratuit pendant 14 jours, sans carte bancaire, sans tracas. Enregistrez vos clients, émettez l'attestation automatiquement et automatisez vos contrats de retraitement.",
    },
  },
};

export default fr;
