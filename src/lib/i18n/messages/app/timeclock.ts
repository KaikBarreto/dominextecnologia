// i18n do APP — domínio PONTO ELETRÔNICO PÚBLICO (/ponto/:slug).
//
// REGRA: copy do PORTAL PÚBLICO do funcionário (sem login). O idioma vem da
// empresa (payload da edge), não do navegador do funcionário.
// Tradução SEMÂNTICA por termo de mercado de cada idioma (régua CEO):
//   pt-br: "ponto eletrônico" / en: "time clock" / es: "reloj de fichaje" / fr: "pointeuse"
// Copy PT-BR sem travessão (—): usar vírgula.
export const timeclock = {
  'pt-br': {
    // ── Título principal (centro/HOME + rodapé HISTÓRICO) ──────────────────
    title: 'PONTO',
    titleLine2: 'ELETRÔNICO',
    // Rótulo compacto no rodapé quando há histórico
    titleShort: 'PONTO ELETRÔNICO',

    // ── Status do dia ──────────────────────────────────────────────────────
    status: {
      not_started: 'Você ainda não bateu o ponto hoje',
      working: 'Trabalhando',
      on_break: 'Em intervalo',
      finished: 'Jornada concluída',
    },

    // ── Ações (CTA e label do tipo de batida) ─────────────────────────────
    actions: {
      clock_in: 'Registrar Entrada',
      break_start: 'Iniciar Intervalo',
      break_end: 'Voltar do Intervalo',
      clock_out: 'Registrar Saída',
    },

    // ── Rótulos de tipo de batida (timeline) ──────────────────────────────
    typeLabels: {
      clock_in: 'Entrada',
      break_start: 'Início do intervalo',
      break_end: 'Fim do intervalo',
      clock_out: 'Saída',
    },

    // ── Seção de histórico ─────────────────────────────────────────────────
    history: {
      todayTitle: 'Registros de hoje',
      dayDone: 'PONTO DO DIA CONCLUÍDO',
    },

    // ── Fluxo de registro (drawer) ─────────────────────────────────────────
    flow: {
      geoLoading: 'Obtendo sua localização...',
      geoError: 'Não foi possível obter a localização. Verifique as permissões do navegador.',
      geoUnsupported: 'Geolocalização não suportada neste dispositivo.',
      geoRetry: 'Tentar novamente',
      geoContinueWithout: 'Continuar sem localização',
      selfiePrompt: 'Tire uma selfie para confirmar',
      selfieRetake: 'Tirar novamente',
      selfieUse: 'Usar esta foto',
      selfieOpen: 'Abrir câmera',
      confirmType: 'Tipo',
      confirmTime: 'Horário',
      confirmLocation: 'Local',
      confirmButton: 'Confirmar registro',
      cancelButton: 'Cancelar',
    },

    // ── Toasts ─────────────────────────────────────────────────────────────
    toasts: {
      registered: '{type} registrada',
      punchError: 'Não foi possível registrar o ponto',
      retryButton: 'Tentar novamente',
    },

    // ── Tela de link quebrado ──────────────────────────────────────────────
    linkInvalid: {
      title: 'Link inválido ou desativado',
      description: 'Este link de ponto não está mais ativo. Fale com o responsável da sua empresa para receber o link correto.',
    },

    // ── Estado de erro de conexão ──────────────────────────────────────────
    connectionError: 'Não foi possível carregar. Verifique sua conexão.',
    retryButton: 'Tentar novamente',
  },

  // ── English ──────────────────────────────────────────────────────────────
  en: {
    title: 'TIME',
    titleLine2: 'CLOCK',
    titleShort: 'TIME CLOCK',

    status: {
      not_started: 'You have not clocked in yet today',
      working: 'Working',
      on_break: 'On break',
      finished: 'Day completed',
    },

    actions: {
      clock_in: 'Clock In',
      break_start: 'Start Break',
      break_end: 'End Break',
      clock_out: 'Clock Out',
    },

    typeLabels: {
      clock_in: 'Clock in',
      break_start: 'Break started',
      break_end: 'Break ended',
      clock_out: 'Clock out',
    },

    history: {
      todayTitle: "Today's records",
      dayDone: 'DAY COMPLETED',
    },

    flow: {
      geoLoading: 'Getting your location...',
      geoError: 'Unable to get location. Check your browser permissions.',
      geoUnsupported: 'Geolocation is not supported on this device.',
      geoRetry: 'Try again',
      geoContinueWithout: 'Continue without location',
      selfiePrompt: 'Take a selfie to confirm',
      selfieRetake: 'Retake',
      selfieUse: 'Use this photo',
      selfieOpen: 'Open camera',
      confirmType: 'Type',
      confirmTime: 'Time',
      confirmLocation: 'Location',
      confirmButton: 'Confirm',
      cancelButton: 'Cancel',
    },

    toasts: {
      registered: '{type} recorded',
      punchError: 'Could not record punch',
      retryButton: 'Try again',
    },

    linkInvalid: {
      title: 'Invalid or disabled link',
      description: 'This time clock link is no longer active. Contact your company administrator for the correct link.',
    },

    connectionError: 'Could not load. Check your connection.',
    retryButton: 'Try again',
  },

  // ── Español ───────────────────────────────────────────────────────────────
  es: {
    title: 'RELOJ DE',
    titleLine2: 'FICHAJE',
    titleShort: 'RELOJ DE FICHAJE',

    status: {
      not_started: 'Aún no has fichado hoy',
      working: 'Trabajando',
      on_break: 'En descanso',
      finished: 'Jornada completada',
    },

    actions: {
      clock_in: 'Registrar Entrada',
      break_start: 'Iniciar Descanso',
      break_end: 'Volver del Descanso',
      clock_out: 'Registrar Salida',
    },

    typeLabels: {
      clock_in: 'Entrada',
      break_start: 'Inicio del descanso',
      break_end: 'Fin del descanso',
      clock_out: 'Salida',
    },

    history: {
      todayTitle: 'Registros de hoy',
      dayDone: 'JORNADA DEL DÍA COMPLETADA',
    },

    flow: {
      geoLoading: 'Obteniendo tu ubicación...',
      geoError: 'No fue posible obtener la ubicación. Verifica los permisos del navegador.',
      geoUnsupported: 'Geolocalización no soportada en este dispositivo.',
      geoRetry: 'Intentar de nuevo',
      geoContinueWithout: 'Continuar sin ubicación',
      selfiePrompt: 'Hazte una foto para confirmar',
      selfieRetake: 'Repetir foto',
      selfieUse: 'Usar esta foto',
      selfieOpen: 'Abrir cámara',
      confirmType: 'Tipo',
      confirmTime: 'Hora',
      confirmLocation: 'Lugar',
      confirmButton: 'Confirmar registro',
      cancelButton: 'Cancelar',
    },

    toasts: {
      registered: '{type} registrado',
      punchError: 'No fue posible registrar el fichaje',
      retryButton: 'Intentar de nuevo',
    },

    linkInvalid: {
      title: 'Enlace inválido o desactivado',
      description: 'Este enlace de fichaje ya no está activo. Habla con el responsable de tu empresa para recibir el enlace correcto.',
    },

    connectionError: 'No fue posible cargar. Verifica tu conexión.',
    retryButton: 'Intentar de nuevo',
  },

  // ── Français ──────────────────────────────────────────────────────────────
  fr: {
    title: 'POINTEUSE',
    titleLine2: 'ÉLECTRONIQUE',
    titleShort: 'POINTEUSE',

    status: {
      not_started: "Vous n'avez pas encore pointé aujourd'hui",
      working: 'En service',
      on_break: 'En pause',
      finished: 'Journée terminée',
    },

    actions: {
      clock_in: 'Pointer l\'arrivée',
      break_start: 'Commencer la pause',
      break_end: 'Reprendre le travail',
      clock_out: 'Pointer le départ',
    },

    typeLabels: {
      clock_in: 'Arrivée',
      break_start: 'Début de pause',
      break_end: 'Fin de pause',
      clock_out: 'Départ',
    },

    history: {
      todayTitle: "Pointages d'aujourd'hui",
      dayDone: 'JOURNÉE TERMINÉE',
    },

    flow: {
      geoLoading: 'Récupération de votre position...',
      geoError: "Impossible d'obtenir la position. Vérifiez les autorisations du navigateur.",
      geoUnsupported: "La géolocalisation n'est pas prise en charge sur cet appareil.",
      geoRetry: 'Réessayer',
      geoContinueWithout: 'Continuer sans localisation',
      selfiePrompt: 'Prenez un selfie pour confirmer',
      selfieRetake: 'Reprendre',
      selfieUse: 'Utiliser cette photo',
      selfieOpen: 'Ouvrir la caméra',
      confirmType: 'Type',
      confirmTime: 'Heure',
      confirmLocation: 'Lieu',
      confirmButton: 'Confirmer le pointage',
      cancelButton: 'Annuler',
    },

    toasts: {
      registered: '{type} enregistré',
      punchError: 'Impossible d\'enregistrer le pointage',
      retryButton: 'Réessayer',
    },

    linkInvalid: {
      title: 'Lien invalide ou désactivé',
      description: "Ce lien de pointage n'est plus actif. Contactez le responsable de votre entreprise pour obtenir le bon lien.",
    },

    connectionError: 'Impossible de charger. Vérifiez votre connexion.',
    retryButton: 'Réessayer',
  },
};
