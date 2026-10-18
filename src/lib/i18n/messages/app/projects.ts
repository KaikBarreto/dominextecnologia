// i18n do APP — domínio PROJECTS (gestão de obras, Onda 1).
//
// Um Projeto agrupa frentes de trabalho, e cada frente é um funil do CRM
// (`crm_pipelines.project_id`). Preencha os 4 locales (pt-br é a fonte/base;
// ausência num locale cai no pt-br pelo deepMerge). Ver app/index.ts.
export const projects = {
  'pt-br': {
    title: 'Projetos',
    subtitle: 'Acompanhe obras e projetos com suas frentes de trabalho',

    // Estado vazio — sem nenhum projeto cadastrado ainda.
    empty: {
      title: 'Nenhum projeto ainda',
      description: 'Crie o primeiro projeto para agrupar frentes de trabalho e acompanhar o progresso da obra. Cada frente é um quadro Kanban, igual ao do CRM.',
      action: 'Criar projeto',
    },
    // Estado vazio — tem projeto, mas a busca/filtro não achou nenhum.
    emptyFiltered: {
      title: 'Nenhum projeto encontrado',
      description: 'Ajuste a busca ou os filtros para ver outros projetos.',
    },

    // KPIs
    kpiTotal: 'Projetos',
    kpiInProgress: 'Em andamento',
    kpiOverdue: 'Atrasados',
    kpiDone: 'Concluídos',

    // Busca e filtros
    searchPlaceholder: 'Buscar por nome, código ou cliente...',
    searchPlaceholderMobile: 'Buscar projeto...',
    filterStatus: 'Status',
    filterAll: 'Todos',

    // Status (chaves do banco nunca mudam, só o rótulo exibido)
    statusPlanejada: 'Planejada',
    statusEmAndamento: 'Em andamento',
    statusPausada: 'Pausada',
    statusConcluida: 'Concluída',
    statusCancelada: 'Cancelada',

    // Colunas da tabela (desktop)
    colCode: 'Código',
    colName: 'Projeto',
    colCustomer: 'Cliente',
    colDeadline: 'Prazo',
    colProgress: 'Progresso',
    colStatus: 'Status',
    colActions: 'Ações',

    // Linha / cartão
    internalProject: 'Projeto interno',
    noDeadline: 'Sem prazo',
    progressUnavailable: 'Configure uma etapa de ganho em alguma frente para ver o progresso',

    // Ações
    newProject: 'Novo projeto',
    newProjectShort: 'Novo',
    editProject: 'Editar projeto',

    // Formulário de criar/editar
    form: {
      titleCreate: 'Novo projeto',
      titleEdit: 'Editar projeto',
      fieldName: 'Nome do projeto',
      fieldNamePlaceholder: 'Ex: Instalação de 80 splits, Indústria X',
      fieldCustomer: 'Cliente',
      fieldCustomerPlaceholder: 'Selecione o cliente...',
      fieldCustomerSearchPlaceholder: 'Buscar cliente...',
      fieldCustomerNone: 'Projeto interno (sem cliente)',
      fieldResponsible: 'Responsável',
      fieldResponsiblePlaceholder: 'Selecione o responsável...',
      fieldResponsibleNone: 'Sem responsável definido',
      fieldStatus: 'Status',
      fieldStartDate: 'Início previsto',
      fieldEndDate: 'Prazo final',
      fieldDescription: 'Descrição',
      fieldDescriptionPlaceholder: 'Detalhes da obra...',
      fieldColor: 'Cor',
      nameRequired: 'Informe o nome do projeto',
    },

    // Exclusão
    deleteTitle: 'Excluir projeto?',
    deleteDesc: 'Esta ação não pode ser desfeita. Projetos com frentes de trabalho vinculadas não podem ser excluídos.',
    deleteConfirm: 'Excluir',

    // Tela de detalhe (/projetos/:id) — Onda 1, continuação.
    detail: {
      notFoundTitle: 'Projeto não encontrado',
      notFoundDesc: 'Este projeto não existe ou foi excluído.',
      back: 'Voltar',

      tabOverview: 'Visão geral',
      tabFronts: 'Frentes',
      tabTasks: 'Tarefas',

      // Visão geral
      overviewCustomer: 'Cliente',
      overviewResponsible: 'Responsável',
      overviewDeadline: 'Prazo',
      overviewStart: 'Início previsto',
      overviewDescription: 'Descrição',
      overviewNoDescription: 'Sem descrição.',
      overviewProgress: 'Progresso da obra',
      overviewFrontsTitle: 'Frentes de trabalho',
      overviewFrontsCardCount: '{count} card',
      overviewFrontsCardCountPlural: '{count} cards',
      overviewEmptyFrontsTitle: 'Nenhuma frente de trabalho ainda',
      overviewEmptyFrontsDesc: 'Crie a primeira frente de trabalho para começar a organizar esta obra.',
      overviewEmptyFrontsAction: 'Criar frente de trabalho',

      // Frentes (quadro)
      frontsNewCard: 'Novo card',
      frontsNewFront: 'Nova frente',
      frontsConfigureFront: 'Configurar frente',
      frontsManageStages: 'Gerenciar etapas',
      frontsEditFront: 'Editar frente',
      frontsDeleteFront: 'Excluir frente',
      frontsEmptyStageTitle: 'Nenhum card nesta etapa',
      frontsEmptyBoardTitle: 'Esta frente ainda não tem etapas',
      frontsEmptyBoardDesc: 'Gerencie as etapas desta frente para começar a organizar o trabalho.',
      frontsEmptyNoFrontsTitle: 'Nenhuma frente de trabalho ainda',
      frontsEmptyNoFrontsDesc: 'Crie a primeira frente de trabalho para montar o quadro desta obra.',
      frontsEmptyNoFrontsAction: 'Criar frente de trabalho',

      // Dialog de criar/editar frente
      frontFormTitleCreate: 'Nova frente de trabalho',
      frontFormTitleEdit: 'Editar frente de trabalho',
      frontFormName: 'Nome da frente',
      frontFormNamePlaceholder: 'Ex: Instalação, Elétrica, Dutos',
      frontFormColor: 'Cor',
      frontFormNameRequired: 'Informe o nome da frente',

      // Exclusão de frente
      frontDeleteTitle: 'Excluir esta frente?',
      frontDeleteDesc: 'Esta ação não pode ser desfeita. Etapas e cards vinculados a esta frente também serão perdidos.',
      frontDeleteConfirm: 'Excluir',

      // Tarefas
      tasksSearchPlaceholder: 'Buscar tarefa...',
      tasksViewKanban: 'Kanban',
      tasksViewAgenda: 'Agenda',
      tasksEmptyTitle: 'Nenhuma tarefa ainda',
      tasksEmptyDesc: 'As tarefas vinculadas aos cards das frentes deste projeto aparecem aqui.',
    },
  },
  en: {
    title: 'Projects',
    subtitle: 'Track construction jobs and projects with their work fronts',

    empty: {
      title: 'No projects yet',
      description: 'Create your first project to group work fronts and track the job progress. Each work front is a Kanban board, just like in the CRM.',
      action: 'Create project',
    },
    emptyFiltered: {
      title: 'No projects found',
      description: 'Adjust the search or filters to see other projects.',
    },

    kpiTotal: 'Projects',
    kpiInProgress: 'In progress',
    kpiOverdue: 'Overdue',
    kpiDone: 'Completed',

    searchPlaceholder: 'Search by name, code or customer...',
    searchPlaceholderMobile: 'Search project...',
    filterStatus: 'Status',
    filterAll: 'All',

    statusPlanejada: 'Planned',
    statusEmAndamento: 'In progress',
    statusPausada: 'Paused',
    statusConcluida: 'Completed',
    statusCancelada: 'Cancelled',

    colCode: 'Code',
    colName: 'Project',
    colCustomer: 'Customer',
    colDeadline: 'Deadline',
    colProgress: 'Progress',
    colStatus: 'Status',
    colActions: 'Actions',

    internalProject: 'Internal project',
    noDeadline: 'No deadline',
    progressUnavailable: 'Set a "won" stage on some work front to see progress',

    newProject: 'New project',
    newProjectShort: 'New',
    editProject: 'Edit project',

    form: {
      titleCreate: 'New project',
      titleEdit: 'Edit project',
      fieldName: 'Project name',
      fieldNamePlaceholder: 'E.g.: Installing 80 split units, Industry X',
      fieldCustomer: 'Customer',
      fieldCustomerPlaceholder: 'Select the customer...',
      fieldCustomerSearchPlaceholder: 'Search customer...',
      fieldCustomerNone: 'Internal project (no customer)',
      fieldResponsible: 'Responsible',
      fieldResponsiblePlaceholder: 'Select the responsible person...',
      fieldResponsibleNone: 'No responsible person set',
      fieldStatus: 'Status',
      fieldStartDate: 'Expected start',
      fieldEndDate: 'Final deadline',
      fieldDescription: 'Description',
      fieldDescriptionPlaceholder: 'Job details...',
      fieldColor: 'Color',
      nameRequired: 'Enter the project name',
    },

    deleteTitle: 'Delete project?',
    deleteDesc: 'This action cannot be undone. Projects with linked work fronts cannot be deleted.',
    deleteConfirm: 'Delete',

    detail: {
      notFoundTitle: 'Project not found',
      notFoundDesc: 'This project does not exist or was deleted.',
      back: 'Back',

      tabOverview: 'Overview',
      tabFronts: 'Work fronts',
      tabTasks: 'Tasks',

      overviewCustomer: 'Customer',
      overviewResponsible: 'Responsible',
      overviewDeadline: 'Deadline',
      overviewStart: 'Expected start',
      overviewDescription: 'Description',
      overviewNoDescription: 'No description.',
      overviewProgress: 'Job progress',
      overviewFrontsTitle: 'Work fronts',
      overviewFrontsCardCount: '{count} card',
      overviewFrontsCardCountPlural: '{count} cards',
      overviewEmptyFrontsTitle: 'No work fronts yet',
      overviewEmptyFrontsDesc: 'Create the first work front to start organizing this job.',
      overviewEmptyFrontsAction: 'Create work front',

      frontsNewCard: 'New card',
      frontsNewFront: 'New front',
      frontsConfigureFront: 'Configure front',
      frontsManageStages: 'Manage stages',
      frontsEditFront: 'Edit front',
      frontsDeleteFront: 'Delete front',
      frontsEmptyStageTitle: 'No card in this stage',
      frontsEmptyBoardTitle: 'This front has no stages yet',
      frontsEmptyBoardDesc: 'Manage this front’s stages to start organizing the work.',
      frontsEmptyNoFrontsTitle: 'No work fronts yet',
      frontsEmptyNoFrontsDesc: 'Create the first work front to build this job’s board.',
      frontsEmptyNoFrontsAction: 'Create work front',

      frontFormTitleCreate: 'New work front',
      frontFormTitleEdit: 'Edit work front',
      frontFormName: 'Front name',
      frontFormNamePlaceholder: 'E.g.: Installation, Electrical, Ductwork',
      frontFormColor: 'Color',
      frontFormNameRequired: 'Enter the front name',

      frontDeleteTitle: 'Delete this front?',
      frontDeleteDesc: 'This action cannot be undone. Stages and cards linked to this front will also be lost.',
      frontDeleteConfirm: 'Delete',

      tasksSearchPlaceholder: 'Search task...',
      tasksViewKanban: 'Kanban',
      tasksViewAgenda: 'Agenda',
      tasksEmptyTitle: 'No tasks yet',
      tasksEmptyDesc: 'Tasks linked to cards in this project’s fronts show up here.',
    },
  },
  es: {
    title: 'Proyectos',
    subtitle: 'Siga obras y proyectos con sus frentes de trabajo',

    empty: {
      title: 'Todavía no hay proyectos',
      description: 'Cree el primer proyecto para agrupar frentes de trabajo y seguir el progreso de la obra. Cada frente es un tablero Kanban, igual que en el CRM.',
      action: 'Crear proyecto',
    },
    emptyFiltered: {
      title: 'No se encontraron proyectos',
      description: 'Ajuste la búsqueda o los filtros para ver otros proyectos.',
    },

    kpiTotal: 'Proyectos',
    kpiInProgress: 'En curso',
    kpiOverdue: 'Atrasados',
    kpiDone: 'Finalizados',

    searchPlaceholder: 'Buscar por nombre, código o cliente...',
    searchPlaceholderMobile: 'Buscar proyecto...',
    filterStatus: 'Estado',
    filterAll: 'Todos',

    statusPlanejada: 'Planificada',
    statusEmAndamento: 'En curso',
    statusPausada: 'Pausada',
    statusConcluida: 'Finalizada',
    statusCancelada: 'Cancelada',

    colCode: 'Código',
    colName: 'Proyecto',
    colCustomer: 'Cliente',
    colDeadline: 'Plazo',
    colProgress: 'Progreso',
    colStatus: 'Estado',
    colActions: 'Acciones',

    internalProject: 'Proyecto interno',
    noDeadline: 'Sin plazo',
    progressUnavailable: 'Configure una etapa de ganado en algún frente para ver el progreso',

    newProject: 'Nuevo proyecto',
    newProjectShort: 'Nuevo',
    editProject: 'Editar proyecto',

    form: {
      titleCreate: 'Nuevo proyecto',
      titleEdit: 'Editar proyecto',
      fieldName: 'Nombre del proyecto',
      fieldNamePlaceholder: 'Ej: Instalación de 80 splits, Industria X',
      fieldCustomer: 'Cliente',
      fieldCustomerPlaceholder: 'Seleccione el cliente...',
      fieldCustomerSearchPlaceholder: 'Buscar cliente...',
      fieldCustomerNone: 'Proyecto interno (sin cliente)',
      fieldResponsible: 'Responsable',
      fieldResponsiblePlaceholder: 'Seleccione el responsable...',
      fieldResponsibleNone: 'Sin responsable definido',
      fieldStatus: 'Estado',
      fieldStartDate: 'Inicio previsto',
      fieldEndDate: 'Plazo final',
      fieldDescription: 'Descripción',
      fieldDescriptionPlaceholder: 'Detalles de la obra...',
      fieldColor: 'Color',
      nameRequired: 'Ingrese el nombre del proyecto',
    },

    deleteTitle: '¿Eliminar proyecto?',
    deleteDesc: 'Esta acción no se puede deshacer. Los proyectos con frentes de trabajo vinculados no pueden eliminarse.',
    deleteConfirm: 'Eliminar',

    detail: {
      notFoundTitle: 'Proyecto no encontrado',
      notFoundDesc: 'Este proyecto no existe o fue eliminado.',
      back: 'Volver',

      tabOverview: 'Resumen',
      tabFronts: 'Frentes',
      tabTasks: 'Tareas',

      overviewCustomer: 'Cliente',
      overviewResponsible: 'Responsable',
      overviewDeadline: 'Plazo',
      overviewStart: 'Inicio previsto',
      overviewDescription: 'Descripción',
      overviewNoDescription: 'Sin descripción.',
      overviewProgress: 'Progreso de la obra',
      overviewFrontsTitle: 'Frentes de trabajo',
      overviewFrontsCardCount: '{count} tarjeta',
      overviewFrontsCardCountPlural: '{count} tarjetas',
      overviewEmptyFrontsTitle: 'Todavía no hay frentes de trabajo',
      overviewEmptyFrontsDesc: 'Cree el primer frente de trabajo para empezar a organizar esta obra.',
      overviewEmptyFrontsAction: 'Crear frente de trabajo',

      frontsNewCard: 'Nueva tarjeta',
      frontsNewFront: 'Nuevo frente',
      frontsConfigureFront: 'Configurar frente',
      frontsManageStages: 'Gestionar etapas',
      frontsEditFront: 'Editar frente',
      frontsDeleteFront: 'Eliminar frente',
      frontsEmptyStageTitle: 'Ninguna tarjeta en esta etapa',
      frontsEmptyBoardTitle: 'Este frente todavía no tiene etapas',
      frontsEmptyBoardDesc: 'Gestione las etapas de este frente para empezar a organizar el trabajo.',
      frontsEmptyNoFrontsTitle: 'Todavía no hay frentes de trabajo',
      frontsEmptyNoFrontsDesc: 'Cree el primer frente de trabajo para armar el tablero de esta obra.',
      frontsEmptyNoFrontsAction: 'Crear frente de trabajo',

      frontFormTitleCreate: 'Nuevo frente de trabajo',
      frontFormTitleEdit: 'Editar frente de trabajo',
      frontFormName: 'Nombre del frente',
      frontFormNamePlaceholder: 'Ej: Instalación, Eléctrica, Ductos',
      frontFormColor: 'Color',
      frontFormNameRequired: 'Ingrese el nombre del frente',

      frontDeleteTitle: '¿Eliminar este frente?',
      frontDeleteDesc: 'Esta acción no se puede deshacer. Las etapas y las tarjetas vinculadas a este frente también se perderán.',
      frontDeleteConfirm: 'Eliminar',

      tasksSearchPlaceholder: 'Buscar tarea...',
      tasksViewKanban: 'Kanban',
      tasksViewAgenda: 'Agenda',
      tasksEmptyTitle: 'Todavía no hay tareas',
      tasksEmptyDesc: 'Las tareas vinculadas a las tarjetas de los frentes de este proyecto aparecen aquí.',
    },
  },
  fr: {
    title: 'Projets',
    subtitle: 'Suivez les chantiers et projets avec leurs fronts de travail',

    empty: {
      title: `Aucun projet pour l'instant`,
      description: `Créez votre premier projet pour regrouper les fronts de travail et suivre l'avancement du chantier. Chaque front de travail est un tableau Kanban, comme dans le CRM.`,
      action: 'Créer un projet',
    },
    emptyFiltered: {
      title: 'Aucun projet trouvé',
      description: `Ajustez la recherche ou les filtres pour voir d'autres projets.`,
    },

    kpiTotal: 'Projets',
    kpiInProgress: 'En cours',
    kpiOverdue: 'En retard',
    kpiDone: 'Terminés',

    searchPlaceholder: 'Rechercher par nom, code ou client...',
    searchPlaceholderMobile: 'Rechercher un projet...',
    filterStatus: 'Statut',
    filterAll: 'Tous',

    statusPlanejada: 'Planifié',
    statusEmAndamento: 'En cours',
    statusPausada: 'En pause',
    statusConcluida: 'Terminé',
    statusCancelada: 'Annulé',

    colCode: 'Code',
    colName: 'Projet',
    colCustomer: 'Client',
    colDeadline: 'Échéance',
    colProgress: 'Avancement',
    colStatus: 'Statut',
    colActions: 'Actions',

    internalProject: 'Projet interne',
    noDeadline: 'Sans échéance',
    progressUnavailable: `Configurez une étape "gagné" sur un front de travail pour voir l'avancement`,

    newProject: 'Nouveau projet',
    newProjectShort: 'Nouveau',
    editProject: 'Modifier le projet',

    form: {
      titleCreate: 'Nouveau projet',
      titleEdit: 'Modifier le projet',
      fieldName: 'Nom du projet',
      fieldNamePlaceholder: `Ex : Installation de 80 splits, Industrie X`,
      fieldCustomer: 'Client',
      fieldCustomerPlaceholder: 'Sélectionnez le client...',
      fieldCustomerSearchPlaceholder: 'Rechercher un client...',
      fieldCustomerNone: 'Projet interne (sans client)',
      fieldResponsible: 'Responsable',
      fieldResponsiblePlaceholder: 'Sélectionnez le responsable...',
      fieldResponsibleNone: 'Aucun responsable défini',
      fieldStatus: 'Statut',
      fieldStartDate: 'Début prévu',
      fieldEndDate: 'Échéance finale',
      fieldDescription: 'Description',
      fieldDescriptionPlaceholder: 'Détails du chantier...',
      fieldColor: 'Couleur',
      nameRequired: 'Indiquez le nom du projet',
    },

    deleteTitle: 'Supprimer le projet ?',
    deleteDesc: `Cette action est irréversible. Les projets avec des fronts de travail liés ne peuvent pas être supprimés.`,
    deleteConfirm: 'Supprimer',

    detail: {
      notFoundTitle: 'Projet introuvable',
      notFoundDesc: `Ce projet n'existe pas ou a été supprimé.`,
      back: 'Retour',

      tabOverview: `Vue d'ensemble`,
      tabFronts: 'Fronts de travail',
      tabTasks: 'Tâches',

      overviewCustomer: 'Client',
      overviewResponsible: 'Responsable',
      overviewDeadline: 'Échéance',
      overviewStart: 'Début prévu',
      overviewDescription: 'Description',
      overviewNoDescription: 'Aucune description.',
      overviewProgress: 'Avancement du chantier',
      overviewFrontsTitle: 'Fronts de travail',
      overviewFrontsCardCount: '{count} carte',
      overviewFrontsCardCountPlural: '{count} cartes',
      overviewEmptyFrontsTitle: `Aucun front de travail pour l'instant`,
      overviewEmptyFrontsDesc: `Créez le premier front de travail pour commencer à organiser ce chantier.`,
      overviewEmptyFrontsAction: 'Créer un front de travail',

      frontsNewCard: 'Nouvelle carte',
      frontsNewFront: 'Nouveau front',
      frontsConfigureFront: 'Configurer le front',
      frontsManageStages: 'Gérer les étapes',
      frontsEditFront: 'Modifier le front',
      frontsDeleteFront: 'Supprimer le front',
      frontsEmptyStageTitle: 'Aucune carte dans cette étape',
      frontsEmptyBoardTitle: `Ce front n'a pas encore d'étapes`,
      frontsEmptyBoardDesc: `Gérez les étapes de ce front pour commencer à organiser le travail.`,
      frontsEmptyNoFrontsTitle: `Aucun front de travail pour l'instant`,
      frontsEmptyNoFrontsDesc: `Créez le premier front de travail pour construire le tableau de ce chantier.`,
      frontsEmptyNoFrontsAction: 'Créer un front de travail',

      frontFormTitleCreate: 'Nouveau front de travail',
      frontFormTitleEdit: 'Modifier le front de travail',
      frontFormName: 'Nom du front',
      frontFormNamePlaceholder: `Ex : Installation, Électricité, Gaines`,
      frontFormColor: 'Couleur',
      frontFormNameRequired: 'Indiquez le nom du front',

      frontDeleteTitle: 'Supprimer ce front ?',
      frontDeleteDesc: `Cette action est irréversible. Les étapes et cartes liées à ce front seront aussi perdues.`,
      frontDeleteConfirm: 'Supprimer',

      tasksSearchPlaceholder: 'Rechercher une tâche...',
      tasksViewKanban: 'Kanban',
      tasksViewAgenda: 'Agenda',
      tasksEmptyTitle: `Aucune tâche pour l'instant`,
      tasksEmptyDesc: 'Les tâches liées aux cartes des fronts de ce projet apparaissent ici.',
    },
  },
};
