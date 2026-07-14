// Fase 6: français GÉNÉRALISÉ (sans loi/impôt/organisme spécifique au Brésil).
// Override partiel sur le pt-br (source). Marque "Dominex" conservée. Pas de tiret
// cadratin (—) dans la copie : utiliser la virgule/point-virgule.
//
// Institutionnels légaux (confidentialité/conditions) sont une TRADUCTION
// AUTOMATIQUE de texte juridique, généralisée ; nécessitent une relecture
// professionnelle avant de devenir officiels (voir rapport de livraison).
import type { MessagesOverride } from './index';

export const frOverrides: MessagesOverride = {
  languageSelector: {
    label: 'Langue',
    ariaLabel: 'Choisir la langue',
  },

  nav: {
    platform: 'Plateforme',
    solutions: 'Solutions',
    segments: 'Secteurs',
    pricing: 'Tarifs',
    blog: 'Blog',
    login: 'Se connecter',
    signup: "S'inscrire",
    trialSticky: 'Démarrez votre essai gratuit de 14 jours',
    openMenu: 'Menu',
    openMenuAria: 'Ouvrir le menu',
    closeMenuAria: 'Fermer le menu',
    solutionsMenuAria: 'Nos solutions',
    solutionsMenuHeader: 'Tout ce que fait la plateforme',
    segmentsMenuAria: 'Nos secteurs',
    segmentsMenuHeader: 'Nos secteurs',
    solutionTaglines: {
      'os-digital': 'Ordres de travail dans l’app, avec photos, checklists et signature du client.',
      'sistema-pmoc': 'Plans de maintenance automatiques par équipement, dans les temps.',
      'sistema-crm': 'Pipeline de clients et devis jusqu’à la conclusion de la vente.',
      'controle-financeiro': 'Comptes à payer, à recevoir et trésorerie sous contrôle.',
      'ponto-e-folha': 'Pointage de l’équipe, acomptes et paie sans feuilles de calcul annexes.',
      'emissao-de-nfse': 'Émettez vos factures de service directement depuis la plateforme.',
      'portal-do-cliente': 'Votre client suit les ordres de travail, devis et historique en ligne.',
      'controle-de-estoque': 'Pièces et matériaux déduits automatiquement à chaque ordre de travail.',
      'orcamentos-e-contratos': 'Un devis approuvé devient un contrat et des ordres de travail récurrents.',
      'rastreamento-de-equipes': 'Équipe sur une carte en direct et tournée du jour organisée.',
      'area-do-tecnico': 'Calculatrices, tableaux de gaz et catalogue d’équipements dans votre poche.',
    },
    segmentTaglines: {
      'sistema-para-refrigeracao': 'Ordres de travail, plans de maintenance et suivi des gaz par unité.',
      'sistema-para-eletricistas': 'Rapports, autorisations et installations sous contrôle.',
      'sistema-para-energia-solar': 'Conception, installation et exploitation des centrales solaires.',
      'sistema-para-provedores': 'Installation fibre, support et interventions techniques.',
      'sistema-para-cftv': 'Caméras, alarmes et rondes avec historique complet.',
      'sistema-para-construcao-civil': 'Chantiers, équipes et relevés sur le terrain.',
      'sistema-para-elevadores': 'Maintenance préventive et dépannages dans les temps.',
      'sistema-para-limpeza-conservacao': 'Sites, rondes et équipes organisés.',
      'sistema-para-dedetizacao': 'Certificats, gestion des nuisibles et contrats récurrents.',
    },
  },

  moduleLabels: {
    'os-digital': 'Ordres de travail numériques',
    'sistema-pmoc': 'Plans de maintenance',
    'sistema-crm': 'CRM & Ventes',
    'controle-financeiro': 'Finances',
    'ponto-e-folha': 'Pointage & Paie (RH)',
    'emissao-de-nfse': 'Facturation de services',
    'portal-do-cliente': 'Portail client',
    'controle-de-estoque': 'Inventaire',
    'orcamentos-e-contratos': 'Devis & Contrats',
    'rastreamento-de-equipes': 'Suivi & Planification',
    'area-do-tecnico': 'Boîte à outils du technicien™',
  },

  segmentLabels: {
    'sistema-para-refrigeracao': 'Réfrigération & CVC',
    'sistema-para-eletricistas': 'Installations électriques',
    'sistema-para-energia-solar': 'Énergie solaire',
    'sistema-para-provedores': 'Télécoms / FAI',
    'sistema-para-cftv': 'Vidéosurveillance & Sécurité électronique',
    'sistema-para-construcao-civil': 'Construction',
    'sistema-para-elevadores': 'Ascenseurs',
    'sistema-para-limpeza-conservacao': 'Nettoyage & Facility management',
    'sistema-para-dedetizacao': 'Lutte antiparasitaire',
  },

  footer: {
    tagline: 'Maîtrisez le fonctionnement de votre entreprise.',
    solutions: 'Solutions',
    segments: 'Secteurs',
    institutional: 'Entreprise',
    linkAbout: 'À propos',
    linkBlog: 'Blog',
    linkTerms: 'Conditions d’utilisation',
    linkPrivacy: 'Politique de confidentialité',
    copyright: 'Tous droits réservés. Conçu pour les équipes qui maîtrisent le terrain.',
    madeBy: 'Réalisé par',
  },

  pageChrome: {
    ctaTrial: 'Commencez gratuitement pendant 14 jours, sans carte',
    seePlans: 'Voir les tarifs',
    seeAllPlans: 'Voir tous les tarifs',
    faqHeading: 'Questions fréquentes',
    problemLabel: 'Le problème',
    withDominex: 'Avec Dominex',
    pricing: {
      heading: 'Des tarifs transparents, sans surprise',
      subtitle:
        'Des offres qui évoluent avec votre activité. Découvrez la gamme complète et choisissez ce qui vous convient.',
    },
    segment: {
      painsHeading: 'Les tracas du quotidien, résolus',
      painsSubheading: 'Là où l’opération cale sur l’improvisation, Dominex prend le contrôle',
      featuresHeading: 'Tout ce dont votre opération a besoin, au même endroit',
      featuresSubheading:
        'De l’appel à l’intervention jusqu’au rapport, Dominex couvre chaque étape du travail sur le terrain',
      testimonialsHeading: 'Ceux qui utilisent Dominex ne reviennent jamais à l’improvisation',
    },
    nicheSearchPlaceholder: 'Rechercher un secteur...',
    nicheEmpty: 'Aucun secteur trouvé.',
  },

  home: {
    hero: {
      typedPre: 'Maîtrisez le fonctionnement de votre ',
      typedHighlight: 'entreprise.',
      srHeadline:
        'Logiciel d’ordres de travail, de maintenance et de gestion pour les équipes CVC et d’intervention sur le terrain. Maîtrisez le fonctionnement de votre entreprise.',
      subtitle:
        'Fini les feuilles de calcul, les fils de discussion et les reprises. Dominex centralise vos ordres de travail, suit votre équipe et fournit des données réelles pour vous aider à grandir.',
      ctaPrimary: 'Commencez gratuitement pendant 14 jours',
      ctaSecondary: 'Voir les tarifs',
      videoUnsupported: 'Votre navigateur ne prend pas en charge la vidéo HTML5.',
      videoLabel: 'Démo Dominex',
    },
    logos: {
      eyebrow: 'Des entreprises maîtrisent déjà leurs opérations avec Dominex',
    },
    problemSolution: {
      problemsTitle: 'Votre opération est-elle bloquée sur l’improvisation ?',
      solutionsTitle: 'Avec Dominex, vous gardez le contrôle total',
      problems: [
        'Ordres de travail sur papier ou dans une feuille de calcul perdue',
        'Technicien sans information sur le terrain',
        'Clients qui appellent « où est mon technicien ? »',
        'Rapports rédigés à la main, des heures plus tard',
        'Aucune visibilité sur ce qui se passe en ce moment',
      ],
      solutions: [
        'Ordre de travail numérique créé en quelques secondes',
        'Application pour le technicien avec tout ce qu’il lui faut',
        'Suivi en temps réel sur la carte',
        'Rapports automatiques à la clôture',
        'Tableau de bord avec des indicateurs en direct',
      ],
    },
    features: {
      heading: 'Tout ce dont votre opération a besoin, au même endroit',
      subheading: 'De l’appel de service à la facturation, Dominex couvre chaque étape du travail',
      cta: 'Essai gratuit de 14 jours, sans carte requise',
      items: [
        {
          title: 'Ordres de travail numériques',
          description:
            'Créez, assignez et suivez les ordres de travail avec photos, checklists, signature numérique et historique complet. Fini le papier et les reprises.',
        },
        {
          title: 'Application technicien sur le terrain',
          description:
            'Application mobile installable : le technicien reçoit l’ordre de travail, pointe son arrivée, prend des photos et recueille la signature du client, directement depuis le terrain.',
        },
        {
          title: 'Planification et suivi des équipes',
          description:
            'Visualisez l’équipe sur une carte en direct, planifiez la tournée du jour et orientez les interventions vers le technicien le plus proche, sans conflit d’agenda.',
        },
        {
          title: 'Plans de maintenance automatiques',
          description:
            'Générez des plans de maintenance préventive par équipement, avec visites, checklists et calendrier prêts. La préventive récurrente en pilote automatique.',
        },
        {
          title: 'CRM et ventes',
          description:
            'Pipeline de clients, devis et propositions jusqu’à la conclusion. Suivez chaque opportunité sans manquer une relance.',
        },
        {
          title: 'Finances complètes',
          description:
            'Comptes à payer et à recevoir, trésorerie, cartes et catégories. Sachez ce qui entre, ce qui sort et ce qu’il vous reste vraiment.',
        },
        {
          title: 'Pointage et paie (RH)',
          description:
            'Pointage de l’équipe, acomptes, primes et paie. Bulletins prêts, sans feuille de calcul annexe.',
        },
        {
          title: 'Facturation de services',
          description:
            'Émettez vos factures de service directement depuis la plateforme, par client, selon vos règles fiscales locales.',
        },
        {
          title: 'Portail client',
          description:
            'Votre client suit les ordres de travail, devis et historique par lien, sans appeler. Plus de transparence, moins d’appels.',
        },
        {
          title: 'Gestion des stocks',
          description:
            'Pièces et matériaux déduits automatiquement à chaque ordre de travail. Sachez ce qui est en stock avant de promettre un délai.',
        },
        {
          title: 'Devis et contrats',
          description:
            'Un devis approuvé par lien devient un contrat et des ordres de travail récurrents. De « affaire conclue » à un travail planifié sans tout ressaisir.',
        },
        {
          title: 'Boîte à outils du technicien™',
          description:
            'Calculatrices, tableaux de gaz et catalogue d’équipements dans la poche du technicien, la caisse à outils qui manquait sur son téléphone.',
        },
        {
          title: 'Rapports et indicateurs',
          description:
            'Tableau de bord avec les ordres de travail par statut, le temps moyen de traitement et les évaluations des clients. Des décisions fondées sur les données, pas sur des suppositions.',
        },
      ],
    },
    howItWorks: {
      heading: 'Simple à démarrer, puissant à faire évoluer',
      steps: [
        {
          title: 'Enregistrez vos clients et techniciens',
          desc: 'Importez-les ou ajoutez-les en quelques minutes. Configurez les groupes, régions et autorisations pour chaque profil.',
        },
        {
          title: 'Créez et dispatchez les ordres de travail',
          desc: 'Ouvrez un ordre de travail en quelques secondes, assignez-le au bon technicien et suivez-le en direct sur le tableau de bord.',
        },
        {
          title: 'Analysez et grandissez',
          desc: 'Rapports automatiques, évaluations des clients et indicateurs de performance pour des décisions plus rapides.',
        },
      ],
    },
    productMockup: {
      heading: 'Le tableau de bord que votre équipe aimera utiliser',
      subheading: 'Une interface intuitive et puissante, conçue pour les responsables d’équipes terrain',
      searchPlaceholder: 'Rechercher des ordres de travail...',
      filters: 'Filtres',
      liveMap: 'Carte en direct',
      sidebar: {
        dashboard: 'Tableau de bord',
        serviceOrders: 'Ordres de travail',
        schedule: 'Agenda',
        clients: 'Clients',
        settings: 'Paramètres',
      },
      status: {
        open: 'Ouvert',
        inProgress: 'En cours',
        done: 'Terminé',
        blocked: 'Bloqué',
      },
    },
    testimonials: {
      heading: 'Ceux qui utilisent Dominex ne reviennent jamais à l’improvisation',
      items: [
        {
          quote:
            'Nous perdions 3 heures par jour en rapports manuels. Maintenant nous bouclons tout en 15 minutes. De vrais résultats.',
          role: 'Responsable des opérations',
        },
        {
          quote:
            'L’équipe de terrain a gagné en autonomie et nos clients ont commencé à faire davantage confiance à notre service.',
          role: 'Directeur',
        },
        {
          quote:
            'En 2 semaines nous avions une visibilité totale sur nos ordres de travail. Nous n’avons plus jamais perdu un appel de service.',
          role: 'Fondateur',
        },
      ],
    },
    segments: {
      heading: 'Pour toute entreprise ayant une équipe sur le terrain',
      subheading: 'Nous servons de nombreux secteurs d’intervention',
      hoverHint: 'Cliquez pour en savoir plus',
      ariaSuffix: 'voir Dominex pour ce secteur',
      imageAltPrefix: 'Dominex pour',
    },
    pricing: {
      heading: 'Des offres qui grandissent avec votre opération',
      monthly: 'Mensuel',
      annual: 'Annuel',
      annualDiscount: '-20%',
      mostPopular: '⭐ Le plus populaire',
      priceEquivalent: 'équivaut à',
      priceFrom: 'à partir de',
      perMonth: '/mois',
      featuresLabel: 'Fonctionnalités',
      currencyPrefix: '€',
      annualStrike: (monthly: number) => `${monthly} €/mois`,
      annualTotal: (total: number) => `Total : ${total} €/an · Économisez 20 %`,
      ctaTrial: 'Démarrer l’essai gratuit de 14 jours',
      enterpriseBadge: 'Entreprise',
      plans: {
        start: {
          name: 'Essentiel',
          desc: 'Gestion de base pour les petites équipes',
          features: [
            'Ordres de travail illimités',
            '5 utilisateurs inclus',
            'Application pour les techniciens',
            'Agenda et calendrier',
            'Portail client',
            'Rapports de base',
            'Support par e-mail',
          ],
        },
        avancado: {
          name: 'Pro',
          desc: 'Pour les entreprises qui ont besoin de RH et de finances',
          features: [
            'Tout ce qui est inclus dans Essentiel +',
            '10 utilisateurs inclus',
            'Module Employés / RH',
            'Finances avancées',
            'Comptes à payer/à recevoir',
            'Compte de résultat et rapports financiers',
            'Gestion des contrats et plans de maintenance',
          ],
        },
        master: {
          name: 'Business',
          desc: 'Opération complète avec CRM et portail',
          features: [
            'Tout ce qui est inclus dans Pro +',
            '15 utilisateurs inclus',
            'CRM / Pipeline de ventes',
            'Facturation de services intégrée',
            'Tarification avancée (marge)',
            'Gestion des contrats et plans de maintenance',
            'Portail client / Portail des contrats',
            'Marque blanche (votre marque)',
            'Support prioritaire',
          ],
        },
        enterprise: {
          name: 'Offre Entreprise',
          desc: 'Composez une offre sur mesure adaptée à votre opération.',
          cta: 'Parler à un consultant',
        },
      },
    },
    faq: {
      heading: 'Questions fréquentes',
      items: [
        {
          q: 'À quel type d’entreprise Dominex s’adresse-t-il ?',
          a: 'Aux entreprises qui fournissent des services techniques sur le terrain : réfrigération et CVC, maintenance préventive, électricité, lutte antiparasitaire, télécoms, sécurité électronique, installations, support technique et toute opération impliquant des équipes de terrain et des ordres de travail.',
        },
        {
          q: 'Fonctionne-t-il sur mobile ? Existe-t-il une application pour les techniciens ?',
          a: 'Oui. La plateforme est 100 % web et responsive (fonctionne dans n’importe quel navigateur) et le technicien utilise une application PWA installable sur Android et iOS, avec pointage entrée/sortie, photos, signature numérique et checklists.',
        },
        {
          q: 'Comment fonctionne l’essai gratuit ?',
          a: 'Ce sont 14 jours avec un accès complet à l’offre que vous choisissez, sans carte bancaire requise. Vous pouvez annuler à tout moment et vos données sont conservées si vous décidez de vous abonner plus tard.',
        },
        {
          q: 'Les données des ordres de travail sont-elles conservées indéfiniment ?',
          a: 'Oui. Nous conservons l’historique complet des ordres de travail, équipements, clients et rapports sans limite de rétention tant que votre abonnement est actif, garantissant la traçabilité pour les garanties, audits et plans de maintenance.',
        },
        {
          q: 'Puis-je gérer des plans de maintenance et des contrats récurrents ?',
          a: 'Oui. Dominex génère automatiquement les ordres de travail des contrats de maintenance (mensuels, bimestriels, trimestriels, etc.) et garde le calendrier de maintenance organisé par équipement et par client.',
        },
        {
          q: 'Puis-je personnaliser les formulaires, checklists et rapports ?',
          a: 'Oui. Vous créez des modèles de checklist par type de service, définissez les champs obligatoires, les photos et la signature. Les rapports d’ordre de travail sont générés en PDF avec votre marque, vos couleurs et votre logo.',
        },
        {
          q: 'Y a-t-il un CRM et un pipeline de ventes intégrés ?',
          a: 'Oui. L’offre Business inclut un CRM complet avec un pipeline Kanban, des étapes personnalisables, des webhooks pour la capture de leads et une conversion directe en devis et ordres de travail.',
        },
        {
          q: 'Puis-je gérer les finances, les comptes à payer et le compte de résultat ?',
          a: 'Oui. À partir de l’offre Pro, vous disposez des comptes à payer/à recevoir, de plusieurs comptes bancaires, de la trésorerie, des écritures récurrentes, du rapprochement par catégorie et d’un compte de résultat pour analyser vos performances.',
        },
        {
          q: 'Comment fonctionnent le pointage et la paie des employés ?',
          a: 'Le module RH permet aux employés de pointer eux-mêmes leurs entrées et sorties, ainsi que le contrôle des heures, absences, acomptes, primes et la génération de relevés individuels calculés au prorata de l’horaire de travail.',
        },
        {
          q: 'Puis-je avoir plus d’utilisateurs que ne le permet l’offre ?',
          a: 'Oui. Vous pouvez ajouter des utilisateurs supplémentaires à n’importe quelle offre moyennant un montant mensuel additionnel, ou passer à une offre supérieure lorsque vous avez besoin de plus de ressources.',
        },
        {
          q: 'Comment est le support ? Est-ce que je parle à une vraie personne ?',
          a: 'Oui. Un support humain par chat et e-mail pendant les heures ouvrées. Les offres Business et Entreprise incluent un support prioritaire et un gestionnaire de compte dédié.',
        },
        {
          q: 'Mes données sont-elles en sécurité ? Qu’en est-il de la protection des données ?',
          a: 'Nous utilisons une infrastructure cloud avec chiffrement en transit et au repos, des sauvegardes automatiques et un isolement entre les entreprises (multi-tenant). Nous suivons un processus continu de conformité en matière de protection des données, et vous pouvez consulter notre Politique de confidentialité pour les détails sur la collecte, l’usage et vos droits en tant que personne concernée.',
        },
      ],
    },
    ctaFinal: {
      heading: 'Commencez aujourd’hui. Des résultats en quelques jours.',
      subtitle:
        '14 jours gratuits, sans carte, sans paperasse. Une mise en place en quelques minutes et regardez votre équipe gagner en productivité.',
      ctaPrimary: 'Créer mon compte gratuit',
      ctaSecondary: 'Ou planifier une démo',
    },
  },

  quemSomos: {
    heroBadge: 'À propos de Dominex',
    heroTitlePre: 'Maîtrisez le terrain,',
    heroTitleHighlight: 'maîtrisez l’opération',
    heroSubtitle:
      'Dominex existe pour sortir le travail d’intervention de la paperasse. Un seul système, sur mobile et ordinateur, pour piloter l’opération du devis à l’encaissement.',
    ctaTrial: 'Essai gratuit de 14 jours, sans carte requise',
    ctaPricing: 'Voir les tarifs',
    missionTitle: 'Notre mission',
    missionP1Strong: 'ordres de travail, maintenance et gestion',
    missionP1:
      'Dominex est un système de {strong} conçu pour les entreprises de services et les équipes de terrain : réfrigération et CVC, électricité, énergie solaire, vidéosurveillance, fournisseurs d’accès internet, ascenseurs, lutte antiparasitaire, nettoyage et facility management, construction et bien plus encore.',
    missionP2:
      'Nous pensons que le technicien ne devrait pas perdre de temps avec des ordres de travail papier, ni que le responsable devrait rester dans le flou sur ce qui se passe sur le terrain. C’est pourquoi nous réunissons au même endroit ce qui était auparavant éparpillé dans des carnets, des groupes de discussion et des feuilles de calcul : CRM, devis, contrats, ordres de travail, plans de maintenance, suivi des équipes, gestion des stocks, finances et paie.',
    missionP3:
      'Notre engagement est simple : garder l’opération organisée, traçable et facile à piloter, pour que vous puissiez vous concentrer sur le travail bien fait, pas sur la bureaucratie.',
    valuesTitle: 'Ce en quoi nous croyons',
    valuesSubtitle: 'Les principes qui guident chaque décision sur le produit.',
    values: [
      {
        title: 'Tout sur le téléphone du technicien',
        body: 'Les équipes de terrain ont besoin de tout à portée de main. L’application s’installe sur le téléphone et le technicien ouvre l’ordre de travail, enregistre les photos, checklists et signature directement sur le lieu d’intervention, sans papier ni retour au bureau.',
      },
      {
        title: 'Conçu pour les équipes qui maîtrisent le terrain',
        body: 'Nous sommes nés au plus près de l’opération de service, pas de la feuille de calcul. Chaque écran est pensé pour le technicien sur le terrain et le responsable qui doit tout voir à distance.',
      },
      {
        title: 'Rapide à démarrer',
        body: 'Pas de déploiement interminable. Vous créez le compte, enregistrez votre équipe et commencez à émettre des ordres de travail le jour même, sans carte pour l’essayer.',
      },
      {
        title: 'Vos données vous appartiennent',
        body: 'Isolement par entreprise, contrôle d’accès basé sur les autorisations et documents toujours traçables. Chaque client ne voit que ce qui lui appartient.',
      },
      {
        title: 'Du devis à l’encaissement',
        body: 'CRM, devis, ordres de travail, plans de maintenance, finances et paie au même endroit. Un seul système pour piloter le travail de bout en bout.',
      },
      {
        title: 'Un support qui connaît le métier',
        body: 'Nous parlons le langage des prestataires de services de terrain. Quand vous nous contactez, en face il y a quelqu’un qui connaît votre quotidien.',
      },
    ],
    finalCtaTitle: 'Essayez Dominex dans votre opération',
    finalCtaSubtitle:
      'C’est 14 jours gratuits, sans carte bancaire. Enregistrez votre équipe et commencez à émettre des ordres de travail dès aujourd’hui.',
  },

  // Le texte légal ci-dessous est une traduction AUTOMATIQUE, GÉNÉRALISÉE. Il
  // nécessite une relecture professionnelle avant d’être considéré comme officiel
  // (voir rapport de livraison).
  privacidade: {
    back: '← Retour',
    title: 'Politique de confidentialité',
    version: 'Version 1.0 — dernière mise à jour : avril 2026',
    s1Title: '1. Identification du responsable du traitement',
    s1P1Strong: 'Dominex Tecnologia',
    s1P1: '{strong} est le responsable du traitement des données personnelles traitées sur cette plateforme, conformément à la législation applicable sur la protection des données.',
    s1DpoStrong: 'Délégué à la protection des données (DPO) :',
    s1Dpo: 'En cours de désignation conformément à la législation applicable sur la protection des données.',
    s1Contact: 'Canal de contact :',
    s2Title: '2. Données personnelles collectées',
    s2Intro: 'Nous collectons les catégories de données personnelles suivantes :',
    s2Items: [
      { strong: 'Inscription :', rest: 'nom, e-mail, téléphone, numéro d’identification fiscale' },
      { strong: 'Accès :', rest: 'journaux de connexion, adresse IP, agent utilisateur, sessions actives' },
      { strong: 'Employé :', rest: 'nom, numéro d’identification fiscale, téléphone, adresse, clé de paiement, salaire, horaire de travail' },
      { strong: 'Géolocalisation :', rest: 'coordonnées GPS des techniciens pendant les interventions (toutes les 30 s)' },
      { strong: 'Biométrie/image :', rest: 'selfies pour les pointages et photos d’équipements' },
      { strong: 'Clients finaux de l’entreprise cliente :', rest: 'nom, numéro d’identification fiscale, e-mail, téléphone, adresse, équipements' },
      { strong: 'Financier :', rest: 'enregistrements de transactions (aucune donnée de carte bancaire, traitées par des passerelles externes)' },
    ],
    s3Title: '3. Finalités et bases légales',
    s3ColPurpose: 'Finalité',
    s3ColBasis: 'Base légale',
    s3Rows: [
      ['Fourniture du service de gestion des ordres de travail et des équipes', 'Exécution du contrat'],
      ['Pointage et contrôle des horaires de travail', 'Respect d’une obligation légale'],
      ['Suivi des techniciens sur le terrain pendant les interventions', 'Intérêt légitime et consentement'],
      ['Pointages avec selfie (biométrie)', 'Consentement spécifique'],
      ['Communication concernant le service souscrit', 'Exécution du contrat'],
      ['Amélioration et sécurité de la plateforme', 'Intérêt légitime'],
      ['Respect des obligations fiscales et comptables', 'Respect d’une obligation légale'],
    ] as [string, string][],
    s4Title: '4. Partage avec des tiers (sous-traitants)',
    s4Items: [
      { strong: 'Supabase Inc.', rest: '(États-Unis) — base de données, authentification et stockage de fichiers. Transfert international fondé sur des clauses contractuelles types.' },
      { strong: 'OpenStreetMap/Nominatim', rest: '— géocodage d’adresses (relayé par le serveur, sans envoyer directement l’IP de l’utilisateur).' },
      { strong: 'Service de recherche d’adresses', rest: '— recherche de code postal pour le remplissage automatique de l’adresse.' },
      { strong: 'Passerelles de paiement', rest: '— traitement des paiements. Nous n’avons aucun accès aux données de carte.' },
    ],
    s4Note: 'Nous ne vendons, ne louons ni ne partageons de données personnelles avec des tiers à des fins publicitaires.',
    s5Title: '5. Conservation des données',
    s5Items: [
      'Données du compte : pendant la durée du contrat + 90 jours après sa résiliation',
      'Enregistrements fiscaux et financiers : 5 ans (obligation légale)',
      'Journaux d’accès : 6 mois',
      'Données de géolocalisation : 12 mois',
      'Données de pointage : 5 ans (obligation liée au travail)',
    ],
    s6Title: '6. Droits de la personne concernée',
    s6Intro: 'Vous disposez des droits suivants sur vos données personnelles :',
    s6Items: [
      'Confirmation de l’existence d’un traitement',
      'Accès aux données',
      'Rectification des données incomplètes, inexactes ou obsolètes',
      'Anonymisation, blocage ou suppression des données inutiles',
      'Portabilité des données (format structuré)',
      'Suppression des données traitées sur la base du consentement',
      'Information sur le partage avec des tiers',
      'Retrait du consentement',
    ],
    s6OutroPre: 'Pour exercer vos droits, rendez-vous au ',
    s6OutroLink: 'Centre de données',
    s6OutroMid: ' ou envoyez un e-mail à ',
    s6OutroPost: '.',
    s7Title: '7. Cookies et technologies de suivi',
    s7P: 'Nous utilisons uniquement des cookies essentiels au fonctionnement de la plateforme (authentification et préférences de session). Nous n’utilisons pas de cookies de suivi ou publicitaires. La police Montserrat est chargée localement, sans connexion à Google Fonts.',
    s8Title: '8. Sécurité',
    s8P: 'Nous adoptons des mesures techniques et organisationnelles pour protéger vos données : chiffrement TLS en transit, contrôle d’accès par entreprise (multi-tenant avec sécurité au niveau des lignes dans la base de données), authentification sécurisée et surveillance de la sécurité.',
    s9Title: '9. Modifications de cette politique',
    s9P: 'Cette politique peut être mise à jour périodiquement. En cas de changements importants, nous vous en informerons par e-mail ou par un avis sur la plateforme. La version et la date de mise à jour sont toujours affichées en haut.',
    s10Title: '10. Contact et DPO',
    s10P: 'Pour toute question, demande ou réclamation liée à la confidentialité et à la protection des données :',
    s10NotePre: 'Vous pouvez également déposer une réclamation auprès de l’autorité de protection des données de votre juridiction. ',
    s10NoteUrl: '',
    s10NoteUrlLabel: '',
    s10NotePost: '',
  },

  termos: {
    back: '← Retour',
    title: 'Conditions d’utilisation',
    version: 'Version 1.0 — dernière mise à jour : avril 2026',
    s1Title: '1. Acceptation des conditions',
    s1Pre: 'En vous inscrivant et en utilisant la plateforme Dominex, vous (« Utilisateur ») acceptez ces Conditions d’utilisation ainsi que notre ',
    s1Link: 'Politique de confidentialité',
    s1Post: '. Si vous n’êtes pas d’accord, n’utilisez pas le service.',
    s2Title: '2. Description du service',
    s2P: 'Dominex est une plateforme SaaS (logiciel en tant que service) de gestion des équipes de terrain, des ordres de travail, des clients, des équipements, des finances et des ressources humaines, destinée aux entreprises qui fournissent des services techniques.',
    s3Title: '3. Inscription et compte',
    s3Items: [
      'L’Utilisateur est responsable de l’exactitude des informations fournies lors de l’inscription.',
      'Le compte est personnel et non transférable. Ne partagez pas vos identifiants.',
      'L’Utilisateur est responsable de toute activité réalisée sous son compte.',
      'Signalez immédiatement tout accès non autorisé à votre compte.',
    ],
    s4Title: '4. Période d’essai',
    s4P: 'Nous offrons une période gratuite de 14 jours avec accès à l’offre sélectionnée. À la fin de la période, le compte est automatiquement suspendu s’il n’y a pas d’abonnement actif. Les données sont conservées 90 jours supplémentaires en vue d’une éventuelle réactivation.',
    s5Title: '5. Propriété des données',
    s5Pre: 'Les données saisies dans la plateforme (clients, ordres de travail, employés, finances) appartiennent à l’entreprise cliente. Dominex les traite exclusivement pour fournir le service souscrit, selon les termes de la ',
    s5Link: 'Politique de confidentialité',
    s5Post: '.',
    s6Title: '6. Utilisation acceptable',
    s6Intro: 'Il est interdit d’utiliser la plateforme pour :',
    s6Items: [
      'Des activités illégales ou qui violent les droits de tiers',
      'L’envoi de spam ou de contenu malveillant',
      'Des tentatives d’accès non autorisé à des systèmes ou données',
      'La revente ou la sous-licence du service sans autorisation',
      'L’ingénierie inverse ou l’extraction du code source',
    ],
    s7Title: '7. Disponibilité et SLA',
    s7P: 'Nous nous efforçons de maintenir la plateforme disponible 24 h/24 et 7 j/7, mais nous ne garantissons pas une disponibilité ininterrompue. Les maintenances planifiées seront communiquées au moins 24 heures à l’avance.',
    s8Title: '8. Suspension et résiliation',
    s8P: 'Nous nous réservons le droit de suspendre ou de résilier les comptes qui enfreignent ces Conditions, après avoir notifié l’Utilisateur. La résiliation volontaire peut se faire à tout moment dans les paramètres du compte.',
    s9Title: '9. Limitation de responsabilité',
    s9P: 'Dominex n’est pas responsable des dommages indirects, de la perte de données due au fait que l’Utilisateur n’a pas conservé ses propres sauvegardes, ni des interruptions causées par un cas de force majeure ou des défaillances de tiers (fournisseurs d’accès internet, infrastructure cloud).',
    s10Title: '10. Modifications des conditions',
    s10P: 'Nous pouvons mettre à jour ces Conditions périodiquement. Les changements importants seront communiqués au moins 30 jours à l’avance par e-mail. La poursuite de l’utilisation du service après les changements vaut acceptation.',
    s11Title: '11. Droit applicable et juridiction',
    s11P: 'Ces Conditions sont régies par le droit applicable. Tout litige sera résolu devant les tribunaux compétents du lieu d’enregistrement du prestataire.',
    s12Title: '12. Contact',
    s12Pre: 'Questions concernant ces Conditions : ',
  },
};

export default frOverrides;
