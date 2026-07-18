// i18n do APP — domínio EQUIPAMENTOS. Preencha nos 4 locales (pt-br base;
// ausência cai no pt-br pelo deepMerge). Ver app/index.ts.
//
// Dado do banco NÃO se traduz (categorias, campos custom criados pela empresa,
// nomes de equipamento). Só chrome: títulos, botões, colunas, empty states.
// Campos fixos de cadastro traduzidos semanticamente (Nº de Série → Serial number).
export const equipment = {
  'pt-br': {
    // ── Chrome da tela Equipment.tsx ──
    title: 'Equipamentos',
    subtitle: 'Gerencie equipamentos e categorias',
    tabEquipment: 'Equipamentos',
    tabCategories: 'Categorias',

    // ── Painel de equipamentos (EquipmentPanel) ──
    listHeading: 'Lista de Equipamentos',
    newEquipment: 'Novo Equipamento',
    newEquipmentShort: 'Equipamento',
    configureFields: 'Configurar Campos',
    configureFieldsShort: 'Config. campos',
    searchPlaceholder: 'Buscar por nome, identificador, marca ou cliente...',
    searchPlaceholderMobile: 'Buscar equipamentos...',
    filterLabel: 'Filtros',
    filterCategory: 'Categoria',
    filterAllCategories: 'Todas categorias',
    filterCustomer: 'Cliente',
    filterAllCustomers: 'Todos clientes',

    // ── Colunas da tabela (desktop) ──
    colPhoto: 'Foto',
    colName: 'Nome',
    colLocation: 'Local',
    colCustomer: 'Cliente',
    colCategory: 'Categoria',
    colStatus: 'Status',
    colActions: 'Ações',

    // ── Status do equipamento ──
    statusActive: 'Ativo',
    statusInactive: 'Inativo',

    // ── Ações de linha ──
    view: 'Visualizar',
    edit: 'Editar',
    delete: 'Excluir',

    // ── Estados vazios / erro ──
    loadError: 'Erro ao carregar equipamentos',
    loadErrorDesc: 'Não foi possível conectar ao servidor. Tente novamente.',
    retry: 'Tentar novamente',
    emptySearch: 'Nenhum equipamento encontrado',
    emptyNone: 'Nenhum equipamento cadastrado',
    emptySearchDesc: 'Tente filtros diferentes',
    emptyNoneDescAdd: 'Adicione um equipamento para começar',
    emptyNoneDescTapMobile: 'Toque em "Novo Equipamento" para começar',
    emptyNoneDescClick: 'Clique em "Novo Equipamento" para começar',

    // ── Diálogo de exclusão ──
    deleteTitle: 'Excluir equipamento',
    deleteConfirm: 'Tem certeza que deseja excluir "{name}"? Esta ação não pode ser desfeita.',
    cancel: 'Cancelar',

    // ── Painel de categorias (CategoriesPanel) ──
    categories: {
      heading: 'Categorias de Equipamentos',
      newCategory: 'Nova Categoria',
      nameLabel: 'Nome da categoria',
      namePlaceholder: 'Ex: Split, Cassete, VRF...',
      colorLabel: 'Cor',
      save: 'Salvar',
      create: 'Criar',
      cancel: 'Cancelar',
      deleteTitle: 'Excluir categoria',
      deleteDesc: 'Esta ação não pode ser desfeita. Equipamentos com esta categoria perderão a associação.',
      emptyTitle: 'Nenhuma categoria criada',
      emptyDesc: 'Crie categorias para organizar seus equipamentos',
    },

    // ── Detalhe do equipamento (EquipmentDetail.tsx) ──
    detail: {
      // Abas
      tabGeneral: 'Geral',
      tabAttachments: 'Anexos',
      tabHistory: 'Histórico / Tarefas',

      // Ações no header
      actions: 'Ações',

      // Card de informações
      sectionInfo: 'Informações',
      fieldCategory: 'Categoria',
      fieldCustomer: 'Cliente',
      fieldBrand: 'Marca',
      fieldModel: 'Modelo',
      fieldSerialNumber: 'Nº de Série',
      fieldDescription: 'Descrição',
      fieldLocation: 'Local',
      fieldInstallDate: 'Data de Instalação',
      fieldWarrantyUntil: 'Garantia até',
      fieldNotes: 'Observações',
      fieldIdentifier: 'Identificador',
      fieldPhotoCaption: 'Foto do equipamento',

      // QR / portal
      qrCaption: 'QR Code do equipamento',
      generateLabel: 'Gerar Etiqueta',
      openLink: 'Abrir link',
      copyLink: 'Copiar link',
      linkCopied: 'Link copiado!',
      noPortalActive: 'Cliente sem portal ativo',

      // Diálogo de etiqueta
      labelDialogTitle: 'Gerar Etiqueta de Identificação',
      labelDialogDesc: 'Escolha o tamanho da etiqueta para impressão.',
      labelPrint: 'Imprimir',
      labelEqName: 'Nome do equipamento',
      labelEqId: 'Identificador',

      // Aba Anexos
      sectionAttachments: 'Arquivos anexados',
      upload: 'Enviar',
      uploading: 'Enviando...',
      uploadingProgress: 'Enviando {current} de {total}...',
      attachImages: 'Imagens',
      attachPdfs: 'PDFs',
      attachOther: 'Outros Documentos',
      emptyAttachments: 'Nenhum anexo',
      deleteAttachmentTitle: 'Excluir anexo',
      deleteAttachmentDesc: 'Tem certeza que deseja excluir este anexo?',

      // Aba Histórico / Tarefas
      sectionOrders: 'Ordens de Serviço Relacionadas',
      emptyOrders: 'Nenhuma OS relacionada a este equipamento',
      colOs: 'OS',
      colStatus: 'Status',
      colDate: 'Data',
      colActions: 'Ações',

      sectionTasks: 'Tarefas',
      taskPlaceholder: 'Nova tarefa...',
      emptyTasks: 'Nenhuma tarefa',

      // Switcher de equipamento
      switcherSearch: 'Buscar equipamento...',
      switcherEmpty: 'Nenhum equipamento encontrado.',

      // Não encontrado
      notFound: 'Equipamento não encontrado.',
      back: 'Voltar',
    },
  },

  en: {
    title: 'Equipment',
    subtitle: 'Manage equipment and categories',
    tabEquipment: 'Equipment',
    tabCategories: 'Categories',

    listHeading: 'Equipment List',
    newEquipment: 'New Equipment',
    newEquipmentShort: 'Equipment',
    configureFields: 'Configure Fields',
    configureFieldsShort: 'Config. fields',
    searchPlaceholder: 'Search by name, identifier, brand or customer...',
    searchPlaceholderMobile: 'Search equipment...',
    filterLabel: 'Filters',
    filterCategory: 'Category',
    filterAllCategories: 'All categories',
    filterCustomer: 'Customer',
    filterAllCustomers: 'All customers',

    colPhoto: 'Photo',
    colName: 'Name',
    colLocation: 'Location',
    colCustomer: 'Customer',
    colCategory: 'Category',
    colStatus: 'Status',
    colActions: 'Actions',

    statusActive: 'Active',
    statusInactive: 'Inactive',

    view: 'View',
    edit: 'Edit',
    delete: 'Delete',

    loadError: 'Failed to load equipment',
    loadErrorDesc: 'Could not connect to the server. Please try again.',
    retry: 'Try again',
    emptySearch: 'No equipment found',
    emptyNone: 'No equipment registered',
    emptySearchDesc: 'Try different filters',
    emptyNoneDescAdd: 'Add a piece of equipment to get started',
    emptyNoneDescTapMobile: 'Tap "New Equipment" to get started',
    emptyNoneDescClick: 'Click "New Equipment" to get started',

    deleteTitle: 'Delete equipment',
    deleteConfirm: 'Are you sure you want to delete "{name}"? This action cannot be undone.',
    cancel: 'Cancel',

    categories: {
      heading: 'Equipment Categories',
      newCategory: 'New Category',
      nameLabel: 'Category name',
      namePlaceholder: 'e.g. Split, Cassette, VRF...',
      colorLabel: 'Color',
      save: 'Save',
      create: 'Create',
      cancel: 'Cancel',
      deleteTitle: 'Delete category',
      deleteDesc: 'This action cannot be undone. Equipment linked to this category will lose the association.',
      emptyTitle: 'No categories created',
      emptyDesc: 'Create categories to organise your equipment',
    },

    detail: {
      tabGeneral: 'General',
      tabAttachments: 'Attachments',
      tabHistory: 'History / Tasks',

      actions: 'Actions',

      sectionInfo: 'Information',
      fieldCategory: 'Category',
      fieldCustomer: 'Customer',
      fieldBrand: 'Brand',
      fieldModel: 'Model',
      fieldSerialNumber: 'Serial number',
      fieldDescription: 'Description',
      fieldLocation: 'Location',
      fieldInstallDate: 'Installation date',
      fieldWarrantyUntil: 'Warranty until',
      fieldNotes: 'Notes',
      fieldIdentifier: 'Identifier',
      fieldPhotoCaption: 'Equipment photo',

      qrCaption: 'Equipment QR Code',
      generateLabel: 'Generate Label',
      openLink: 'Open link',
      copyLink: 'Copy link',
      linkCopied: 'Link copied!',
      noPortalActive: 'Customer has no active portal',

      labelDialogTitle: 'Generate Identification Label',
      labelDialogDesc: 'Choose the label size for printing.',
      labelPrint: 'Print',
      labelEqName: 'Equipment name',
      labelEqId: 'Identifier',

      sectionAttachments: 'Attached files',
      upload: 'Upload',
      uploading: 'Uploading...',
      uploadingProgress: 'Uploading {current} of {total}...',
      attachImages: 'Images',
      attachPdfs: 'PDFs',
      attachOther: 'Other Documents',
      emptyAttachments: 'No attachments',
      deleteAttachmentTitle: 'Delete attachment',
      deleteAttachmentDesc: 'Are you sure you want to delete this attachment?',

      sectionOrders: 'Related Service Orders',
      emptyOrders: 'No service orders related to this equipment',
      colOs: 'SO',
      colStatus: 'Status',
      colDate: 'Date',
      colActions: 'Actions',

      sectionTasks: 'Tasks',
      taskPlaceholder: 'New task...',
      emptyTasks: 'No tasks',

      switcherSearch: 'Search equipment...',
      switcherEmpty: 'No equipment found.',

      notFound: 'Equipment not found.',
      back: 'Back',
    },
  },

  es: {
    title: 'Equipos',
    subtitle: 'Administra equipos y categorías',
    tabEquipment: 'Equipos',
    tabCategories: 'Categorías',

    listHeading: 'Lista de Equipos',
    newEquipment: 'Nuevo Equipo',
    newEquipmentShort: 'Equipo',
    configureFields: 'Configurar Campos',
    configureFieldsShort: 'Config. campos',
    searchPlaceholder: 'Buscar por nombre, identificador, marca o cliente...',
    searchPlaceholderMobile: 'Buscar equipos...',
    filterLabel: 'Filtros',
    filterCategory: 'Categoría',
    filterAllCategories: 'Todas las categorías',
    filterCustomer: 'Cliente',
    filterAllCustomers: 'Todos los clientes',

    colPhoto: 'Foto',
    colName: 'Nombre',
    colLocation: 'Ubicación',
    colCustomer: 'Cliente',
    colCategory: 'Categoría',
    colStatus: 'Estado',
    colActions: 'Acciones',

    statusActive: 'Activo',
    statusInactive: 'Inactivo',

    view: 'Ver',
    edit: 'Editar',
    delete: 'Eliminar',

    loadError: 'Error al cargar equipos',
    loadErrorDesc: 'No fue posible conectar al servidor. Inténtalo de nuevo.',
    retry: 'Intentar de nuevo',
    emptySearch: 'Ningún equipo encontrado',
    emptyNone: 'Ningún equipo registrado',
    emptySearchDesc: 'Prueba filtros diferentes',
    emptyNoneDescAdd: 'Agrega un equipo para comenzar',
    emptyNoneDescTapMobile: 'Toca "Nuevo Equipo" para comenzar',
    emptyNoneDescClick: 'Haz clic en "Nuevo Equipo" para comenzar',

    deleteTitle: 'Eliminar equipo',
    deleteConfirm: '¿Estás seguro de que deseas eliminar "{name}"? Esta acción no se puede deshacer.',
    cancel: 'Cancelar',

    categories: {
      heading: 'Categorías de Equipos',
      newCategory: 'Nueva Categoría',
      nameLabel: 'Nombre de la categoría',
      namePlaceholder: 'Ej: Split, Cassette, VRF...',
      colorLabel: 'Color',
      save: 'Guardar',
      create: 'Crear',
      cancel: 'Cancelar',
      deleteTitle: 'Eliminar categoría',
      deleteDesc: 'Esta acción no se puede deshacer. Los equipos vinculados a esta categoría perderán la asociación.',
      emptyTitle: 'Ninguna categoría creada',
      emptyDesc: 'Crea categorías para organizar tus equipos',
    },

    detail: {
      tabGeneral: 'General',
      tabAttachments: 'Adjuntos',
      tabHistory: 'Historial / Tareas',

      actions: 'Acciones',

      sectionInfo: 'Información',
      fieldCategory: 'Categoría',
      fieldCustomer: 'Cliente',
      fieldBrand: 'Marca',
      fieldModel: 'Modelo',
      fieldSerialNumber: 'Número de serie',
      fieldDescription: 'Descripción',
      fieldLocation: 'Ubicación',
      fieldInstallDate: 'Fecha de instalación',
      fieldWarrantyUntil: 'Garantía hasta',
      fieldNotes: 'Observaciones',
      fieldIdentifier: 'Identificador',
      fieldPhotoCaption: 'Foto del equipo',

      qrCaption: 'Código QR del equipo',
      generateLabel: 'Generar Etiqueta',
      openLink: 'Abrir enlace',
      copyLink: 'Copiar enlace',
      linkCopied: '¡Enlace copiado!',
      noPortalActive: 'Cliente sin portal activo',

      labelDialogTitle: 'Generar Etiqueta de Identificación',
      labelDialogDesc: 'Elige el tamaño de la etiqueta para imprimir.',
      labelPrint: 'Imprimir',
      labelEqName: 'Nombre del equipo',
      labelEqId: 'Identificador',

      sectionAttachments: 'Archivos adjuntos',
      upload: 'Subir',
      uploading: 'Subiendo...',
      uploadingProgress: 'Subiendo {current} de {total}...',
      attachImages: 'Imágenes',
      attachPdfs: 'PDFs',
      attachOther: 'Otros Documentos',
      emptyAttachments: 'Sin adjuntos',
      deleteAttachmentTitle: 'Eliminar adjunto',
      deleteAttachmentDesc: '¿Estás seguro de que deseas eliminar este adjunto?',

      sectionOrders: 'Órdenes de Servicio Relacionadas',
      emptyOrders: 'Ninguna orden de servicio relacionada con este equipo',
      colOs: 'OS',
      colStatus: 'Estado',
      colDate: 'Fecha',
      colActions: 'Acciones',

      sectionTasks: 'Tareas',
      taskPlaceholder: 'Nueva tarea...',
      emptyTasks: 'Ninguna tarea',

      switcherSearch: 'Buscar equipo...',
      switcherEmpty: 'Ningún equipo encontrado.',

      notFound: 'Equipo no encontrado.',
      back: 'Volver',
    },
  },

  fr: {
    title: 'Équipements',
    subtitle: 'Gérez vos équipements et catégories',
    tabEquipment: 'Équipements',
    tabCategories: 'Catégories',

    listHeading: 'Liste des Équipements',
    newEquipment: 'Nouvel Équipement',
    newEquipmentShort: 'Équipement',
    configureFields: 'Configurer les champs',
    configureFieldsShort: 'Config. champs',
    searchPlaceholder: 'Rechercher par nom, identifiant, marque ou client...',
    searchPlaceholderMobile: 'Rechercher des équipements...',
    filterLabel: 'Filtres',
    filterCategory: 'Catégorie',
    filterAllCategories: 'Toutes les catégories',
    filterCustomer: 'Client',
    filterAllCustomers: 'Tous les clients',

    colPhoto: 'Photo',
    colName: 'Nom',
    colLocation: 'Emplacement',
    colCustomer: 'Client',
    colCategory: 'Catégorie',
    colStatus: 'Statut',
    colActions: 'Actions',

    statusActive: 'Actif',
    statusInactive: 'Inactif',

    view: 'Voir',
    edit: 'Modifier',
    delete: 'Supprimer',

    loadError: 'Échec du chargement des équipements',
    loadErrorDesc: 'Impossible de se connecter au serveur. Veuillez réessayer.',
    retry: 'Réessayer',
    emptySearch: 'Aucun équipement trouvé',
    emptyNone: 'Aucun équipement enregistré',
    emptySearchDesc: 'Essayez des filtres différents',
    emptyNoneDescAdd: 'Ajoutez un équipement pour commencer',
    emptyNoneDescTapMobile: 'Touchez « Nouvel Équipement » pour commencer',
    emptyNoneDescClick: 'Cliquez sur « Nouvel Équipement » pour commencer',

    deleteTitle: 'Supprimer l\'équipement',
    deleteConfirm: 'Êtes-vous sûr de vouloir supprimer « {name} » ? Cette action est irréversible.',
    cancel: 'Annuler',

    categories: {
      heading: 'Catégories d\'Équipements',
      newCategory: 'Nouvelle Catégorie',
      nameLabel: 'Nom de la catégorie',
      namePlaceholder: 'Ex : Split, Cassette, VRF...',
      colorLabel: 'Couleur',
      save: 'Enregistrer',
      create: 'Créer',
      cancel: 'Annuler',
      deleteTitle: 'Supprimer la catégorie',
      deleteDesc: 'Cette action est irréversible. Les équipements liés à cette catégorie perdront l\'association.',
      emptyTitle: 'Aucune catégorie créée',
      emptyDesc: 'Créez des catégories pour organiser vos équipements',
    },

    detail: {
      tabGeneral: 'Général',
      tabAttachments: 'Pièces jointes',
      tabHistory: 'Historique / Tâches',

      actions: 'Actions',

      sectionInfo: 'Informations',
      fieldCategory: 'Catégorie',
      fieldCustomer: 'Client',
      fieldBrand: 'Marque',
      fieldModel: 'Modèle',
      fieldSerialNumber: 'Numéro de série',
      fieldDescription: 'Description',
      fieldLocation: 'Emplacement',
      fieldInstallDate: 'Date d\'installation',
      fieldWarrantyUntil: 'Garantie jusqu\'au',
      fieldNotes: 'Remarques',
      fieldIdentifier: 'Identifiant',
      fieldPhotoCaption: 'Photo de l\'équipement',

      qrCaption: 'QR Code de l\'équipement',
      generateLabel: 'Générer une Étiquette',
      openLink: 'Ouvrir le lien',
      copyLink: 'Copier le lien',
      linkCopied: 'Lien copié !',
      noPortalActive: 'Client sans portail actif',

      labelDialogTitle: 'Générer une Étiquette d\'Identification',
      labelDialogDesc: 'Choisissez la taille de l\'étiquette pour l\'impression.',
      labelPrint: 'Imprimer',
      labelEqName: 'Nom de l\'équipement',
      labelEqId: 'Identifiant',

      sectionAttachments: 'Fichiers joints',
      upload: 'Envoyer',
      uploading: 'Envoi en cours...',
      uploadingProgress: 'Envoi de {current} sur {total}...',
      attachImages: 'Images',
      attachPdfs: 'PDFs',
      attachOther: 'Autres Documents',
      emptyAttachments: 'Aucune pièce jointe',
      deleteAttachmentTitle: 'Supprimer la pièce jointe',
      deleteAttachmentDesc: 'Êtes-vous sûr de vouloir supprimer cette pièce jointe ?',

      sectionOrders: 'Ordres de Service Associés',
      emptyOrders: 'Aucun ordre de service lié à cet équipement',
      colOs: 'OS',
      colStatus: 'Statut',
      colDate: 'Date',
      colActions: 'Actions',

      sectionTasks: 'Tâches',
      taskPlaceholder: 'Nouvelle tâche...',
      emptyTasks: 'Aucune tâche',

      switcherSearch: 'Rechercher un équipement...',
      switcherEmpty: 'Aucun équipement trouvé.',

      notFound: 'Équipement introuvable.',
      back: 'Retour',
    },
  },
};
