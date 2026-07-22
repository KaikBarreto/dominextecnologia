// i18n do APP — domínio TASKS (Tarefas do tenant).
// Preencha as chaves nos 4 locales (pt-br é a fonte/base; ausência num locale
// cai no pt-br pelo deepMerge). Ver app/index.ts.
//
// REGRA: dados vindos do banco (títulos de tarefas, nomes de responsáveis)
// NÃO se traduzem — só texto fixo da UI.
export const tasks = {
  'pt-br': {
    // ── Chrome do drawer de pendentes ──
    drawerTitle: 'Tarefas',
    drawerTitleWithCount: 'Tarefas ({n})',
    badgeAriaLabel: '{n} tarefas pendentes',
    badgeAriaLabelOne: '1 tarefa pendente',
    badgeAriaLabelNone: 'Tarefas',

    // ── Botão de nova tarefa ──
    newTask: 'Nova tarefa',

    // ── Formulário de criação ──
    formTitle: 'Nova tarefa',
    fieldTitle: 'Título',
    fieldTitlePlaceholder: 'Descreva a tarefa...',
    fieldDate: 'Data',
    fieldDescription: 'Descrição',
    fieldDescriptionPlaceholder: 'Detalhes ou observações (opcional)',
    fieldAssignedTo: 'Responsável',
    fieldAssignedToPlaceholder: 'Selecionar responsável',
    fieldAssignedToNone: 'Sem responsável',
    save: 'Criar tarefa',
    cancel: 'Cancelar',

    // ── Ações por item ──
    markDone: 'Marcar como feita',
    deleteTask: 'Excluir tarefa',
    deleteConfirmTitle: 'Excluir tarefa',
    deleteConfirmDesc: 'Essa ação é permanente. Deseja excluir a tarefa "{title}"?',
    deleteConfirmYes: 'Excluir',
    deleteConfirmNo: 'Cancelar',

    // ── Estados ──
    overdue: 'Atrasada',
    today: 'Hoje',
    emptyTitle: 'Nenhuma tarefa pendente',
    emptyDesc: 'Crie uma tarefa para começar.',

    // ── Toasts ──
    toastCreated: 'Tarefa criada',
    toastDone: 'Tarefa concluída',
    toastDeleted: 'Tarefa excluída',
    toastErrorCreate: 'Erro ao criar tarefa',
    toastErrorDone: 'Erro ao concluir tarefa',
    toastErrorDelete: 'Erro ao excluir tarefa',

    // ── Popup do dia ──
    popupTitleOne: 'Você tem {n} tarefa para hoje',
    popupTitleOther: 'Você tem {n} tarefas para hoje',
    popupOverdueOne: 'e {n} atrasada',
    popupOverdueOther: 'e {n} atrasadas',
    popupViewTasks: 'Ver tarefas',
    popupDismiss: 'Depois',
  },
  en: {
    drawerTitle: 'Tasks',
    drawerTitleWithCount: 'Tasks ({n})',
    badgeAriaLabel: '{n} pending tasks',
    badgeAriaLabelOne: '1 pending task',
    badgeAriaLabelNone: 'Tasks',

    newTask: 'New task',

    formTitle: 'New task',
    fieldTitle: 'Title',
    fieldTitlePlaceholder: 'Describe the task...',
    fieldDate: 'Date',
    fieldDescription: 'Description',
    fieldDescriptionPlaceholder: 'Details or notes (optional)',
    fieldAssignedTo: 'Assignee',
    fieldAssignedToPlaceholder: 'Select assignee',
    fieldAssignedToNone: 'No assignee',
    save: 'Create task',
    cancel: 'Cancel',

    markDone: 'Mark as done',
    deleteTask: 'Delete task',
    deleteConfirmTitle: 'Delete task',
    deleteConfirmDesc: 'This action is permanent. Delete task "{title}"?',
    deleteConfirmYes: 'Delete',
    deleteConfirmNo: 'Cancel',

    overdue: 'Overdue',
    today: 'Today',
    emptyTitle: 'No pending tasks',
    emptyDesc: 'Create a task to get started.',

    toastCreated: 'Task created',
    toastDone: 'Task completed',
    toastDeleted: 'Task deleted',
    toastErrorCreate: 'Error creating task',
    toastErrorDone: 'Error completing task',
    toastErrorDelete: 'Error deleting task',

    popupTitleOne: 'You have {n} task for today',
    popupTitleOther: 'You have {n} tasks for today',
    popupOverdueOne: 'and {n} overdue',
    popupOverdueOther: 'and {n} overdue',
    popupViewTasks: 'View tasks',
    popupDismiss: 'Later',
  },
  es: {
    drawerTitle: 'Tareas',
    drawerTitleWithCount: 'Tareas ({n})',
    badgeAriaLabel: '{n} tareas pendientes',
    badgeAriaLabelOne: '1 tarea pendiente',
    badgeAriaLabelNone: 'Tareas',

    newTask: 'Nueva tarea',

    formTitle: 'Nueva tarea',
    fieldTitle: 'Título',
    fieldTitlePlaceholder: 'Describe la tarea...',
    fieldDate: 'Fecha',
    fieldDescription: 'Descripción',
    fieldDescriptionPlaceholder: 'Detalles u observaciones (opcional)',
    fieldAssignedTo: 'Responsable',
    fieldAssignedToPlaceholder: 'Seleccionar responsable',
    fieldAssignedToNone: 'Sin responsable',
    save: 'Crear tarea',
    cancel: 'Cancelar',

    markDone: 'Marcar como hecha',
    deleteTask: 'Eliminar tarea',
    deleteConfirmTitle: 'Eliminar tarea',
    deleteConfirmDesc: 'Esta acción es permanente. ¿Eliminar la tarea "{title}"?',
    deleteConfirmYes: 'Eliminar',
    deleteConfirmNo: 'Cancelar',

    overdue: 'Atrasada',
    today: 'Hoy',
    emptyTitle: 'No hay tareas pendientes',
    emptyDesc: 'Crea una tarea para empezar.',

    toastCreated: 'Tarea creada',
    toastDone: 'Tarea completada',
    toastDeleted: 'Tarea eliminada',
    toastErrorCreate: 'Error al crear la tarea',
    toastErrorDone: 'Error al completar la tarea',
    toastErrorDelete: 'Error al eliminar la tarea',

    popupTitleOne: 'Tienes {n} tarea para hoy',
    popupTitleOther: 'Tienes {n} tareas para hoy',
    popupOverdueOne: 'y {n} atrasada',
    popupOverdueOther: 'y {n} atrasadas',
    popupViewTasks: 'Ver tareas',
    popupDismiss: 'Después',
  },
  fr: {
    drawerTitle: 'Tâches',
    drawerTitleWithCount: 'Tâches ({n})',
    badgeAriaLabel: '{n} tâches en attente',
    badgeAriaLabelOne: '1 tâche en attente',
    badgeAriaLabelNone: 'Tâches',

    newTask: 'Nouvelle tâche',

    formTitle: 'Nouvelle tâche',
    fieldTitle: 'Titre',
    fieldTitlePlaceholder: 'Décrivez la tâche...',
    fieldDate: 'Date',
    fieldDescription: 'Description',
    fieldDescriptionPlaceholder: 'Détails ou remarques (facultatif)',
    fieldAssignedTo: 'Responsable',
    fieldAssignedToPlaceholder: 'Sélectionner le responsable',
    fieldAssignedToNone: 'Sans responsable',
    save: 'Créer la tâche',
    cancel: 'Annuler',

    markDone: 'Marquer comme faite',
    deleteTask: 'Supprimer la tâche',
    deleteConfirmTitle: 'Supprimer la tâche',
    deleteConfirmDesc: 'Cette action est permanente. Supprimer la tâche "{title}" ?',
    deleteConfirmYes: 'Supprimer',
    deleteConfirmNo: 'Annuler',

    overdue: 'En retard',
    today: `Aujourd'hui`,
    emptyTitle: 'Aucune tâche en attente',
    emptyDesc: 'Créez une tâche pour commencer.',

    toastCreated: 'Tâche créée',
    toastDone: 'Tâche terminée',
    toastDeleted: 'Tâche supprimée',
    toastErrorCreate: 'Erreur lors de la création de la tâche',
    toastErrorDone: 'Erreur lors de la finalisation de la tâche',
    toastErrorDelete: 'Erreur lors de la suppression de la tâche',

    popupTitleOne: 'Vous avez {n} tâche pour aujourd`hui',
    popupTitleOther: 'Vous avez {n} tâches pour aujourd`hui',
    popupOverdueOne: 'et {n} en retard',
    popupOverdueOther: 'et {n} en retard',
    popupViewTasks: 'Voir les tâches',
    popupDismiss: 'Plus tard',
  },
};
