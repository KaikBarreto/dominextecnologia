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

    // ── Switcher de contas (AccountSwitcherDropdown) ──────────────────────────
    accountSwitcher: {
      // aria-label do trigger (botão fechado)
      triggerAria: 'Trocar de conta',
      // Tooltip do botão de remover conta
      removeAccountTooltip: 'Remover conta salva',
      // Botão "sair desta conta" (aria-label + title)
      signOutThisAccount: 'Sair desta conta',
      // Mensagem quando só há 1 conta salva
      onlyAccountSaved: 'Apenas essa conta está salva. Use "+ Adicionar conta" pra incluir outra.',
      // Botão de adicionar conta
      addAccount: 'Adicionar conta',
      // Tooltip quando limite atingido
      addAccountLimitTooltip: 'Limite de 5 contas atingido — remova uma antes',
      // Botão "sair de todas"
      signOutAll: 'Sair de todas as contas',
      // Confirmação de "sair de todas"
      confirmSignOutAllTitle: 'Sair de todas as contas?',
      confirmSignOutAllDesc: 'Vai sair de TODAS as contas salvas neste dispositivo. Você precisará entrar com email e senha de novo pra cada conta.',
      confirmSignOutAllCancel: 'Cancelar',
      confirmSignOutAllConfirm: 'Sair de todas',
    },

    // ── Diálogo de confirmação de sessão (SessionConfirmDialog) ───────────────
    sessionConfirm: {
      title: 'Sessão ativa detectada',
      description_one: 'Sua conta já está conectada em outro dispositivo. Você pode continuar e usar ambos ao mesmo tempo.',
      description_other: 'Sua conta já está conectada em {count} outros dispositivos. Você pode continuar e usar ambos ao mesmo tempo.',
      deviceUnknown: 'Dispositivo desconhecido',
      lastAccessPrefix: 'Último acesso:',
      disconnectOthersLabel: 'Desconectar outros acessos ao entrar',
      btnCancel: 'Cancelar',
      btnContinue: 'Continuar',
      btnLoading: 'Entrando...',
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

    accountSwitcher: {
      triggerAria: 'Switch account',
      removeAccountTooltip: 'Remove saved account',
      signOutThisAccount: 'Sign out of this account',
      onlyAccountSaved: 'Only this account is saved. Use "+ Add account" to include another.',
      addAccount: 'Add account',
      addAccountLimitTooltip: '5-account limit reached, remove one first',
      signOutAll: 'Sign out of all accounts',
      confirmSignOutAllTitle: 'Sign out of all accounts?',
      confirmSignOutAllDesc: 'You will be signed out of ALL saved accounts on this device. You will need to sign in again with email and password for each account.',
      confirmSignOutAllCancel: 'Cancel',
      confirmSignOutAllConfirm: 'Sign out of all',
    },

    sessionConfirm: {
      title: 'Active session detected',
      description_one: 'Your account is already connected on another device. You can continue and use both at the same time.',
      description_other: 'Your account is already connected on {count} other devices. You can continue and use all of them at the same time.',
      deviceUnknown: 'Unknown device',
      lastAccessPrefix: 'Last access:',
      disconnectOthersLabel: 'Disconnect other sessions when signing in',
      btnCancel: 'Cancel',
      btnContinue: 'Continue',
      btnLoading: 'Signing in...',
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

    accountSwitcher: {
      triggerAria: 'Cambiar de cuenta',
      removeAccountTooltip: 'Eliminar cuenta guardada',
      signOutThisAccount: 'Salir de esta cuenta',
      onlyAccountSaved: 'Solo esta cuenta está guardada. Usa "+ Añadir cuenta" para incluir otra.',
      addAccount: 'Añadir cuenta',
      addAccountLimitTooltip: 'Límite de 5 cuentas alcanzado, elimina una primero',
      signOutAll: 'Salir de todas las cuentas',
      confirmSignOutAllTitle: '¿Salir de todas las cuentas?',
      confirmSignOutAllDesc: 'Saldrás de TODAS las cuentas guardadas en este dispositivo. Deberás iniciar sesión de nuevo con email y contraseña en cada cuenta.',
      confirmSignOutAllCancel: 'Cancelar',
      confirmSignOutAllConfirm: 'Salir de todas',
    },

    sessionConfirm: {
      title: 'Sesión activa detectada',
      description_one: 'Tu cuenta ya está conectada en otro dispositivo. Puedes continuar y usar ambos al mismo tiempo.',
      description_other: 'Tu cuenta ya está conectada en {count} otros dispositivos. Puedes continuar y usarlos todos al mismo tiempo.',
      deviceUnknown: 'Dispositivo desconocido',
      lastAccessPrefix: 'Último acceso:',
      disconnectOthersLabel: 'Desconectar otras sesiones al entrar',
      btnCancel: 'Cancelar',
      btnContinue: 'Continuar',
      btnLoading: 'Entrando...',
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

    accountSwitcher: {
      triggerAria: 'Changer de compte',
      removeAccountTooltip: 'Supprimer le compte enregistré',
      signOutThisAccount: 'Se déconnecter de ce compte',
      onlyAccountSaved: "Seul ce compte est enregistré. Utilisez \"+ Ajouter un compte\" pour en inclure un autre.",
      addAccount: 'Ajouter un compte',
      addAccountLimitTooltip: 'Limite de 5 comptes atteinte, supprimez-en un d\'abord',
      signOutAll: 'Se déconnecter de tous les comptes',
      confirmSignOutAllTitle: 'Se déconnecter de tous les comptes ?',
      confirmSignOutAllDesc: "Vous serez déconnecté de TOUS les comptes enregistrés sur cet appareil. Vous devrez vous reconnecter avec l'e-mail et le mot de passe de chaque compte.",
      confirmSignOutAllCancel: 'Annuler',
      confirmSignOutAllConfirm: 'Se déconnecter de tous',
    },

    sessionConfirm: {
      title: 'Session active détectée',
      description_one: "Votre compte est déjà connecté sur un autre appareil. Vous pouvez continuer et utiliser les deux en même temps.",
      description_other: "Votre compte est déjà connecté sur {count} autres appareils. Vous pouvez continuer et les utiliser tous en même temps.",
      deviceUnknown: 'Appareil inconnu',
      lastAccessPrefix: 'Dernier accès :',
      disconnectOthersLabel: "Déconnecter les autres sessions à la connexion",
      btnCancel: 'Annuler',
      btnContinue: 'Continuer',
      btnLoading: 'Connexion...',
    },

    languageSwitcher: {
      ariaLabel: 'Sélectionner la langue',
      languageLabel: 'Langue',
    },
  },
};
