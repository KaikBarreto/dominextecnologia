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

    // ── Botão de voltar (usado pelo quiosque em grupo, ao voltar pra grade) ──
    backButton: 'Voltar',

    // ── PIN do funcionário (opcional, protege a batida no tablet compartilhado) ──
    // A falha nunca pode ser silenciosa: a pessoa precisa entender que errou,
    // quantas tentativas restam e quando destrava.
    pin: {
      prompt: 'Digite seu PIN para continuar',
      dotsAria: 'PIN com {n} dígitos digitados',
      backspace: 'Apagar último dígito',
      confirm: 'Confirmar PIN',
      invalid: 'PIN incorreto.',
      attemptsLeft: 'Restam {n} tentativas.',
      attemptsLeftOne: 'Resta 1 tentativa.',
      genericError: 'Não foi possível validar o PIN. Tente novamente.',
      required: 'Digite seu PIN para registrar o ponto.',
      lockedTitle: 'PIN bloqueado',
      lockedDescription: 'Muitas tentativas erradas. Tente de novo às {time}.',
      lockedDescriptionNoTime: 'Muitas tentativas erradas. Aguarde alguns minutos e tente de novo, ou fale com o responsável.',
    },

    // ── Quiosque de ponto em grupo (/ponto/empresa/:kioskSlug) ──────────────
    kiosk: {
      headerFallbackTitle: 'Ponto eletrônico',
      searchPlaceholder: 'Buscar funcionário',
      sort: { name: 'A-Z', pending: 'Quem falta' },
      status: {
        not_started: 'Não bateu hoje',
        working: 'Trabalhando',
        on_break: 'Em intervalo',
        finished: 'Jornada concluída',
      },
      punchLabels: {
        clock_in: 'Entrada registrada',
        break_start: 'Intervalo iniciado',
        break_end: 'Volta do intervalo registrada',
        clock_out: 'Saída registrada',
      },
      punchDefaultLabel: 'Ponto registrado',
      backNow: 'Voltar agora',
      emptyTitle: 'Ninguém com ponto ativo ainda',
      emptyDescription: 'Ative o ponto eletrônico dos funcionários no sistema, em Funcionários, Ponto, e eles aparecem aqui.',
      noResults: 'Ninguém encontrado com “{search}”.',
      moduleInactive: {
        title: 'Ponto eletrônico indisponível',
        description: 'O ponto eletrônico da sua empresa está temporariamente indisponível. Fale com o responsável.',
      },
      connectionError: 'Sem conexão. Verifique a internet do tablet.',
    },
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

    // ── Back button (used by the group kiosk, going back to the badge grid) ──
    backButton: 'Back',

    // ── Employee PIN (optional, protects punching on a shared tablet) ────────
    pin: {
      prompt: 'Enter your PIN to continue',
      dotsAria: 'PIN with {n} digits entered',
      backspace: 'Delete last digit',
      confirm: 'Confirm PIN',
      invalid: 'Wrong PIN.',
      attemptsLeft: '{n} attempts left.',
      attemptsLeftOne: '1 attempt left.',
      genericError: 'Could not validate the PIN. Try again.',
      required: 'Enter your PIN to record the punch.',
      lockedTitle: 'PIN locked',
      lockedDescription: 'Too many wrong attempts. Try again at {time}.',
      lockedDescriptionNoTime: 'Too many wrong attempts. Wait a few minutes and try again, or talk to the person in charge.',
    },

    // ── Group time clock kiosk (/ponto/empresa/:kioskSlug) ──────────────────
    kiosk: {
      headerFallbackTitle: 'Time clock',
      searchPlaceholder: 'Search employee',
      sort: { name: 'A-Z', pending: 'Who is missing' },
      status: {
        not_started: 'Not clocked in today',
        working: 'Working',
        on_break: 'On break',
        finished: 'Day completed',
      },
      punchLabels: {
        clock_in: 'Clock-in recorded',
        break_start: 'Break started',
        break_end: 'Break ended',
        clock_out: 'Clock-out recorded',
      },
      punchDefaultLabel: 'Punch recorded',
      backNow: 'Back now',
      emptyTitle: 'No one with active time tracking yet',
      emptyDescription: 'Turn on time tracking for employees in the system, under Employees, Time Clock, and they will show up here.',
      noResults: 'No one found for “{search}”.',
      moduleInactive: {
        title: 'Time clock unavailable',
        description: 'Your company time clock is temporarily unavailable. Contact the person in charge.',
      },
      connectionError: 'No connection. Check the tablet internet.',
    },
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

    // ── Botón de volver (usado por el quiosco en grupo, hacia la grilla) ────
    backButton: 'Volver',

    // ── PIN del empleado (opcional, protege el fichaje en la tablet compartida) ──
    pin: {
      prompt: 'Escribe tu PIN para continuar',
      dotsAria: 'PIN con {n} dígitos escritos',
      backspace: 'Borrar último dígito',
      confirm: 'Confirmar PIN',
      invalid: 'PIN incorrecto.',
      attemptsLeft: 'Quedan {n} intentos.',
      attemptsLeftOne: 'Queda 1 intento.',
      genericError: 'No fue posible validar el PIN. Inténtalo de nuevo.',
      required: 'Escribe tu PIN para registrar el fichaje.',
      lockedTitle: 'PIN bloqueado',
      lockedDescription: 'Demasiados intentos incorrectos. Inténtalo de nuevo a las {time}.',
      lockedDescriptionNoTime: 'Demasiados intentos incorrectos. Espera unos minutos e inténtalo de nuevo, o habla con el responsable.',
    },

    // ── Quiosco de fichaje en grupo (/ponto/empresa/:kioskSlug) ──────────────
    kiosk: {
      headerFallbackTitle: 'Reloj de fichaje',
      searchPlaceholder: 'Buscar empleado',
      sort: { name: 'A-Z', pending: 'Quién falta' },
      status: {
        not_started: 'Aún no fichó hoy',
        working: 'Trabajando',
        on_break: 'En descanso',
        finished: 'Jornada completada',
      },
      punchLabels: {
        clock_in: 'Entrada registrada',
        break_start: 'Descanso iniciado',
        break_end: 'Vuelta del descanso registrada',
        clock_out: 'Salida registrada',
      },
      punchDefaultLabel: 'Fichaje registrado',
      backNow: 'Volver ahora',
      emptyTitle: 'Aún nadie con fichaje activo',
      emptyDescription: 'Activa el fichaje de los empleados en el sistema, en Empleados, Fichaje, y aparecerán aquí.',
      noResults: 'Nadie encontrado con “{search}”.',
      moduleInactive: {
        title: 'Fichaje no disponible',
        description: 'El fichaje de tu empresa está temporalmente no disponible. Habla con el responsable.',
      },
      connectionError: 'Sin conexión. Verifica la internet de la tablet.',
    },
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

    // ── Bouton retour (utilisé par la borne collective, vers la grille) ─────
    backButton: 'Retour',

    // ── Code PIN de l`employé (optionnel, protège le pointage sur tablette partagée) ──
    pin: {
      prompt: 'Saisissez votre code PIN pour continuer',
      dotsAria: 'Code PIN avec {n} chiffres saisis',
      backspace: 'Effacer le dernier chiffre',
      confirm: 'Confirmer le code PIN',
      invalid: 'Code PIN incorrect.',
      attemptsLeft: 'Il reste {n} tentatives.',
      attemptsLeftOne: 'Il reste 1 tentative.',
      genericError: `Impossible de valider le code PIN. Réessayez.`,
      required: 'Saisissez votre code PIN pour enregistrer le pointage.',
      lockedTitle: 'Code PIN bloqué',
      lockedDescription: 'Trop de tentatives incorrectes. Réessayez à {time}.',
      lockedDescriptionNoTime: `Trop de tentatives incorrectes. Attendez quelques minutes et réessayez, ou contactez le responsable.`,
    },

    // ── Borne de pointage collectif (/ponto/empresa/:kioskSlug) ─────────────
    kiosk: {
      headerFallbackTitle: 'Pointeuse',
      searchPlaceholder: 'Rechercher un employé',
      sort: { name: 'A-Z', pending: 'Qui manque' },
      status: {
        not_started: `N'a pas encore pointé aujourd'hui`,
        working: 'En service',
        on_break: 'En pause',
        finished: 'Journée terminée',
      },
      punchLabels: {
        clock_in: 'Arrivée enregistrée',
        break_start: 'Pause commencée',
        break_end: 'Retour de pause enregistré',
        clock_out: 'Départ enregistré',
      },
      punchDefaultLabel: 'Pointage enregistré',
      backNow: 'Retour maintenant',
      emptyTitle: 'Personne avec pointage actif pour le moment',
      emptyDescription: `Activez le pointage des employés dans le système, sous Employés, Pointage, et ils apparaîtront ici.`,
      noResults: 'Personne trouvée pour « {search} ».',
      moduleInactive: {
        title: 'Pointeuse indisponible',
        description: `La pointeuse de votre entreprise est temporairement indisponible. Contactez le responsable.`,
      },
      connectionError: `Pas de connexion. Vérifiez l'internet de la tablette.`,
    },
  },
};
