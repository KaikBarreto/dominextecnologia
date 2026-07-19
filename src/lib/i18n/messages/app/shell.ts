// ─────────────────────────────────────────────────────────────────────────────
// i18n do APP LOGADO — namespace `shell` (a CASCA: menu lateral, top navbar,
// bottom nav mobile, more-menu drawer, rodapé de conta e labels globais do
// chrome). Consumido por AppLayout + SidebarMenuContent + TopNavbar +
// MobileBottomNav + MoreMenuDrawer.
//
// FORMATO: as 4 traduções JUNTAS, chaveadas por locale (ver app/common.ts).
// pt-br é a FONTE — texto EXATO que hoje está cravado no menu (nada reescrito).
//
// `menu` = rótulos dos ITENS e GRUPOS do menu (tenant + admin), chaveados por uma
// KEY estável (NÃO pelo texto pt-br), pra o lookup ser type-safe e o texto poder
// mudar sem quebrar o mapeamento. O componente traduz `item.title` via
// `translateMenuLabel()` (shellMenuKey.ts), que casa o título pt-br → key.
//
// NÃO se generaliza aqui (produto interno; traduz fiel). Termos de mercado por
// idioma: "Ordens de Serviço" → Work Orders / Órdenes de trabajo / Bons de
// travail. Copy PT-BR sem travessão (—): usar vírgula. Marca tenant-facing é
// Dominex; "Auctus" (painel master, bastidor) NÃO traduz.
// ─────────────────────────────────────────────────────────────────────────────

export const shell = {
  'pt-br': {
    // ── Itens/grupos do menu (tenant + admin), por KEY estável ────────────────
    menu: {
      // Grupos (collapsibles)
      operational: 'Operacional',
      management: 'Gestão',
      finance: 'Financeiro',
      // Itens de tenant
      dashboard: 'Dashboard',
      schedule: 'Agenda',
      serviceOrders: 'Ordens de Serviço',
      liveMap: 'Mapa e Rastreamento',
      technicianArea: 'Área do Técnico™',
      quotes: 'Orçamentos',
      services: 'Serviços',
      customers: 'Clientes',
      equipment: 'Equipamentos',
      contracts: 'Contratos',
      employees: 'Funcionários',
      inventory: 'Estoque',
      crm: 'CRM',
      financeOverview: 'Visão Geral',
      financeMovements: 'Movimentações Financeiras',
      financeAccounts: 'Contas a Pagar/Receber',
      fiscalNotes: 'Notas Fiscais',
      // Itens do painel admin Auctus
      adminDashboard: 'Dashboard',
      adminCrm: 'CRM/Tarefas',
      adminCompanies: 'Empresas',
      adminSalespeople: 'Vendedores',
      adminFinance: 'Financeiro',
      adminHealthScore: 'Health Score',
      adminBlog: 'Blog',
      adminDomiflix: 'Domiflix',
    },

    // ── Rótulos curtos do bottom nav mobile (5 slots) ─────────────────────────
    bottomNav: {
      home: 'Início',
      serviceOrders: 'OS',
      schedule: 'Agenda',
      customers: 'Clientes',
      menu: 'Menu',
    },

    // ── Rodapé de conta / dropdown de perfil (sidebar + topnav + more-menu) ────
    account: {
      accountMenuAria: 'Menu da conta',
      switchAccountAria: 'Trocar de conta',
      profile: 'Perfil',
      subscription: 'Assinatura',
      theme: 'Tema',
      themeLight: 'Claro',
      themeDark: 'Escuro',
      tutorials: 'Tutoriais | Domiflix',
      helpCenter: 'Central de Ajuda',
      support: 'Falar com o Suporte',
      settings: 'Configurações',
      logout: 'Sair',
      section: 'Conta',
      // Seção "Menu" do drawer (título acessível)
      menuTitle: 'Menu',
      menuDescription: 'Menu completo de navegação e configurações',
      // Atalhos do header (AppLayout)
      adminSettings: 'Configurações do Admin',
      myProfile: 'Meu Perfil',
      backAria: 'Voltar',
    },

    // ── Papéis exibidos no card de perfil (more-menu header) ──────────────────
    roles: {
      auctusAdmin: 'Administrador Auctus',
      admin: 'Administrador',
      user: 'Usuário',
    },

    // ── Header do painel admin ────────────────────────────────────────────────
    adminPanelLabel: 'Painel Administrativo',
    // Fallback do nome exibido quando o perfil não tem nome
    defaultUserName: 'Usuário',
    // ── Relógio do header (tooltip de fuso + aria-label) ─────────────────────
    clockTimezoneLabel: 'Fuso horário',
    clockDateTimeLabel: 'Data e hora',

    // ── Sino de notificações ─────────────────────────────────────────────────
    notifications: {
      // aria-label do sino
      ariaLabelUnread: '{n} notificações não lidas',
      ariaLabel: 'Notificações',
      // Título no drawer/dropdown
      title: 'Notificações',
      // Badge de contagem no drawer
      badgeNew: '{n} nova',
      badgeNewPlural: '{n} novas',
      // Empty state
      empty: 'Nenhuma notificação',
      // Botão "marcar todas como lidas"
      markAllRead: 'Marcar todas como lidas',
      // Rótulos dos grupos de data
      groupToday: 'Hoje',
      groupYesterday: 'Ontem',
      groupWeek: 'Esta semana',
      groupOlder: 'Anteriores',
    },

    // ── Seletor de idioma (AppLanguageSwitcher + LanguageSelector do site) ──────
    languageSwitcher: {
      // aria-label do botão trigger (compacto/icon e row)
      ariaLabel: 'Selecionar idioma',
      // Rótulo visível na variante 'row' (menu mobile)
      languageLabel: 'Idioma',
    },

    // ── Primitivos mobile ─────────────────────────────────────────────────────
    mobilePrimitives: {
      // FilterCheckboxGroup
      filterAll: 'Todos',
      filterSelected: '({n} selecionados)',
      filterCloseSearch: 'Fechar busca',
      filterOpenSearch: 'Buscar',
      filterSelectAll: 'Todos',
      filterClear: 'Limpar',
      filterPlaceholder: 'Buscar...',
      filterEmptyOptions: 'Nenhuma opção disponível',
      filterEmptySearch: 'Nenhuma opção encontrada',
      filterHint: 'Vazio = {emptyLabel}',
      // NotificationItem
      dismissNotification: 'Dispensar notificação',
      // NotificationDetailModal
      modalClose: 'Fechar',
      modalReadTerms: 'Ler Termos de Uso',
      modalOpen: 'Abrir',
      modalAvailableUntil: 'Disponível até',
      // SpeedDialFAB
      fabCloseMenu: 'Fechar menu',
      fabOpenMenu: 'Abrir menu de ferramentas',
      // MobileListItem
      moreActions: 'Mais ações',
    },
  },

  en: {
    menu: {
      operational: 'Operations',
      management: 'Management',
      finance: 'Finance',
      dashboard: 'Dashboard',
      schedule: 'Schedule',
      serviceOrders: 'Work Orders',
      liveMap: 'Map & Tracking',
      technicianArea: 'Technician Area™',
      quotes: 'Quotes',
      services: 'Services',
      customers: 'Customers',
      equipment: 'Equipment',
      contracts: 'Contracts',
      employees: 'Employees',
      inventory: 'Inventory',
      crm: 'CRM',
      financeOverview: 'Overview',
      financeMovements: 'Transactions',
      financeAccounts: 'Payables/Receivables',
      fiscalNotes: 'Invoices',
      adminDashboard: 'Dashboard',
      adminCrm: 'CRM/Tasks',
      adminCompanies: 'Companies',
      adminSalespeople: 'Salespeople',
      adminFinance: 'Finance',
      adminHealthScore: 'Health Score',
      adminBlog: 'Blog',
      adminDomiflix: 'Domiflix',
    },
    bottomNav: {
      home: 'Home',
      serviceOrders: 'Orders',
      schedule: 'Schedule',
      customers: 'Customers',
      menu: 'Menu',
    },
    account: {
      accountMenuAria: 'Account menu',
      switchAccountAria: 'Switch account',
      profile: 'Profile',
      subscription: 'Subscription',
      theme: 'Theme',
      themeLight: 'Light',
      themeDark: 'Dark',
      tutorials: 'Tutorials | Domiflix',
      helpCenter: 'Help Center',
      support: 'Contact Support',
      settings: 'Settings',
      logout: 'Log out',
      section: 'Account',
      menuTitle: 'Menu',
      menuDescription: 'Full navigation and settings menu',
      adminSettings: 'Admin Settings',
      myProfile: 'My Profile',
      backAria: 'Back',
    },
    roles: {
      auctusAdmin: 'Auctus Administrator',
      admin: 'Administrator',
      user: 'User',
    },
    adminPanelLabel: 'Admin Panel',
    defaultUserName: 'User',
    clockTimezoneLabel: 'Time zone',
    clockDateTimeLabel: 'Date and time',

    notifications: {
      ariaLabelUnread: '{n} unread notifications',
      ariaLabel: 'Notifications',
      title: 'Notifications',
      badgeNew: '{n} new',
      badgeNewPlural: '{n} new',
      empty: 'No notifications',
      markAllRead: 'Mark all as read',
      groupToday: 'Today',
      groupYesterday: 'Yesterday',
      groupWeek: 'This week',
      groupOlder: 'Earlier',
    },

    languageSwitcher: {
      ariaLabel: 'Select language',
      languageLabel: 'Language',
    },

    mobilePrimitives: {
      filterAll: 'All',
      filterSelected: '({n} selected)',
      filterCloseSearch: 'Close search',
      filterOpenSearch: 'Search',
      filterSelectAll: 'All',
      filterClear: 'Clear',
      filterPlaceholder: 'Search...',
      filterEmptyOptions: 'No options available',
      filterEmptySearch: 'No options found',
      filterHint: 'Empty = {emptyLabel}',
      dismissNotification: 'Dismiss notification',
      modalClose: 'Close',
      modalReadTerms: 'Read Terms of Use',
      modalOpen: 'Open',
      modalAvailableUntil: 'Available until',
      fabCloseMenu: 'Close menu',
      fabOpenMenu: 'Open tools menu',
      moreActions: 'More actions',
    },
  },

  es: {
    menu: {
      operational: 'Operaciones',
      management: 'Gestión',
      finance: 'Finanzas',
      dashboard: 'Panel',
      schedule: 'Agenda',
      serviceOrders: 'Órdenes de Trabajo',
      liveMap: 'Mapa y Seguimiento',
      technicianArea: 'Área del Técnico™',
      quotes: 'Presupuestos',
      services: 'Servicios',
      customers: 'Clientes',
      equipment: 'Equipos',
      contracts: 'Contratos',
      employees: 'Empleados',
      inventory: 'Inventario',
      crm: 'CRM',
      financeOverview: 'Resumen',
      financeMovements: 'Movimientos',
      financeAccounts: 'Cuentas por Pagar/Cobrar',
      fiscalNotes: 'Facturas',
      adminDashboard: 'Panel',
      adminCrm: 'CRM/Tareas',
      adminCompanies: 'Empresas',
      adminSalespeople: 'Vendedores',
      adminFinance: 'Finanzas',
      adminHealthScore: 'Health Score',
      adminBlog: 'Blog',
      adminDomiflix: 'Domiflix',
    },
    bottomNav: {
      home: 'Inicio',
      serviceOrders: 'OT',
      schedule: 'Agenda',
      customers: 'Clientes',
      menu: 'Menú',
    },
    account: {
      accountMenuAria: 'Menú de la cuenta',
      switchAccountAria: 'Cambiar de cuenta',
      profile: 'Perfil',
      subscription: 'Suscripción',
      theme: 'Tema',
      themeLight: 'Claro',
      themeDark: 'Oscuro',
      tutorials: 'Tutoriales | Domiflix',
      helpCenter: 'Centro de Ayuda',
      support: 'Contactar Soporte',
      settings: 'Configuración',
      logout: 'Salir',
      section: 'Cuenta',
      menuTitle: 'Menú',
      menuDescription: 'Menú completo de navegación y configuración',
      adminSettings: 'Configuración del Admin',
      myProfile: 'Mi Perfil',
      backAria: 'Volver',
    },
    roles: {
      auctusAdmin: 'Administrador Auctus',
      admin: 'Administrador',
      user: 'Usuario',
    },
    adminPanelLabel: 'Panel Administrativo',
    defaultUserName: 'Usuario',
    clockTimezoneLabel: 'Zona horaria',
    clockDateTimeLabel: 'Fecha y hora',

    notifications: {
      ariaLabelUnread: '{n} notificaciones no leídas',
      ariaLabel: 'Notificaciones',
      title: 'Notificaciones',
      badgeNew: '{n} nueva',
      badgeNewPlural: '{n} nuevas',
      empty: 'Sin notificaciones',
      markAllRead: 'Marcar todas como leídas',
      groupToday: 'Hoy',
      groupYesterday: 'Ayer',
      groupWeek: 'Esta semana',
      groupOlder: 'Anteriores',
    },

    mobilePrimitives: {
      filterAll: 'Todos',
      filterSelected: '({n} seleccionados)',
      filterCloseSearch: 'Cerrar búsqueda',
      filterOpenSearch: 'Buscar',
      filterSelectAll: 'Todos',
      filterClear: 'Limpiar',
      filterPlaceholder: 'Buscar...',
      filterEmptyOptions: 'Sin opciones disponibles',
      filterEmptySearch: 'Sin resultados',
      filterHint: 'Vacío = {emptyLabel}',
      dismissNotification: 'Descartar notificación',
      modalClose: 'Cerrar',
      modalReadTerms: 'Leer Términos de Uso',
      modalOpen: 'Abrir',
      modalAvailableUntil: 'Disponible hasta',
      fabCloseMenu: 'Cerrar menú',
      fabOpenMenu: 'Abrir menú de herramientas',
      moreActions: 'Más acciones',
    },

    languageSwitcher: {
      ariaLabel: 'Seleccionar idioma',
      languageLabel: 'Idioma',
    },
  },

  fr: {
    menu: {
      operational: 'Opérations',
      management: 'Gestion',
      finance: 'Finances',
      dashboard: 'Tableau de bord',
      schedule: 'Agenda',
      serviceOrders: 'Bons de travail',
      liveMap: 'Carte et suivi',
      technicianArea: 'Espace Technicien™',
      quotes: 'Devis',
      services: 'Services',
      customers: 'Clients',
      equipment: 'Équipements',
      contracts: 'Contrats',
      employees: 'Employés',
      inventory: 'Stock',
      crm: 'CRM',
      financeOverview: 'Vue d’ensemble',
      financeMovements: 'Mouvements',
      financeAccounts: 'Comptes à payer/recevoir',
      fiscalNotes: 'Factures',
      adminDashboard: 'Tableau de bord',
      adminCrm: 'CRM/Tâches',
      adminCompanies: 'Entreprises',
      adminSalespeople: 'Commerciaux',
      adminFinance: 'Finances',
      adminHealthScore: 'Health Score',
      adminBlog: 'Blog',
      adminDomiflix: 'Domiflix',
    },
    bottomNav: {
      home: 'Accueil',
      serviceOrders: 'BT',
      schedule: 'Agenda',
      customers: 'Clients',
      menu: 'Menu',
    },
    account: {
      accountMenuAria: 'Menu du compte',
      switchAccountAria: 'Changer de compte',
      profile: 'Profil',
      subscription: 'Abonnement',
      theme: 'Thème',
      themeLight: 'Clair',
      themeDark: 'Sombre',
      tutorials: 'Tutoriels | Domiflix',
      helpCenter: 'Centre d’aide',
      support: 'Contacter le support',
      settings: 'Paramètres',
      logout: 'Déconnexion',
      section: 'Compte',
      menuTitle: 'Menu',
      menuDescription: 'Menu complet de navigation et de paramètres',
      adminSettings: 'Paramètres Admin',
      myProfile: 'Mon Profil',
      backAria: 'Retour',
    },
    roles: {
      auctusAdmin: 'Administrateur Auctus',
      admin: 'Administrateur',
      user: 'Utilisateur',
    },
    adminPanelLabel: "Panneau d'administration",
    defaultUserName: 'Utilisateur',
    clockTimezoneLabel: 'Fuseau horaire',
    clockDateTimeLabel: 'Date et heure',

    notifications: {
      ariaLabelUnread: '{n} notifications non lues',
      ariaLabel: 'Notifications',
      title: 'Notifications',
      badgeNew: '{n} nouvelle',
      badgeNewPlural: '{n} nouvelles',
      empty: 'Aucune notification',
      markAllRead: 'Tout marquer comme lu',
      groupToday: "Aujourd'hui",
      groupYesterday: 'Hier',
      groupWeek: 'Cette semaine',
      groupOlder: 'Précédentes',
    },

    mobilePrimitives: {
      filterAll: 'Tous',
      filterSelected: '({n} sélectionnés)',
      filterCloseSearch: 'Fermer la recherche',
      filterOpenSearch: 'Rechercher',
      filterSelectAll: 'Tous',
      filterClear: 'Effacer',
      filterPlaceholder: 'Rechercher...',
      filterEmptyOptions: 'Aucune option disponible',
      filterEmptySearch: 'Aucune option trouvée',
      filterHint: 'Vide = {emptyLabel}',
      dismissNotification: 'Ignorer la notification',
      modalClose: 'Fermer',
      modalReadTerms: "Lire les Conditions d'utilisation",
      modalOpen: 'Ouvrir',
      modalAvailableUntil: "Disponible jusqu'au",
      fabCloseMenu: 'Fermer le menu',
      fabOpenMenu: "Ouvrir le menu d'outils",
      moreActions: "Plus d'actions",
    },

    languageSwitcher: {
      ariaLabel: 'Sélectionner la langue',
      languageLabel: 'Langue',
    },
  },
};
