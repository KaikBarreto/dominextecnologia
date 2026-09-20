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
      selfieCenterTitle: 'Centralize o rosto no círculo',
      selfiePreparing: 'Preparando o enquadramento. Você já pode tirar a foto manualmente.',
      selfieCaptureNow: 'Tirar foto agora',
      selfiePrivacy: 'Esta selfie será protegida e usada como evidência do registro de ponto.',
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
      recognition: {
        matchingTitle: 'Identificando você', matching: 'Comparando sua leitura com os cadastros da empresa...',
        retryTitle: 'Não conseguimos confirmar seu rosto',
        ambiguous: 'Há mais de um cadastro parecido. Tente novamente ou busque seu nome manualmente.',
        ambiguousRequired: 'Há mais de um cadastro parecido. Ajuste a posição e tente novamente.',
        notRecognized: 'Seu rosto não foi reconhecido. Tente novamente ou busque seu nome manualmente.',
        notRecognizedRequired: 'Seu rosto não foi reconhecido. Ajuste a posição e tente novamente.',
        unavailable: 'O reconhecimento está indisponível agora. Você ainda pode registrar o ponto pela busca manual.',
        tryAgain: 'Tentar novamente', manualSearch: 'Buscar manualmente',
      },
    },
    faceCalibration: {
      button: 'Testar reconhecimento facial',
      completed: 'Teste facial concluído. Continue o registro normalmente.',
      unavailable: 'Não foi possível analisar o rosto agora. Seu registro pode continuar normalmente.',
    },
    faceEnrollment: {
      eyebrow: 'Cadastro facial',
      title: 'Olá, {name}',
      description: 'Vamos registrar seu rosto em três posições. Leva menos de um minuto e você faz apenas uma vez.',
      privacy: 'As imagens ficam somente neste aparelho durante a leitura. O sistema envia e guarda apenas uma assinatura matemática do rosto.',
      start: 'Começar cadastro',
      requirement: 'Use um local iluminado e retire boné, máscara ou qualquer item que cubra o rosto.',
      invalidTitle: 'Link inválido ou expirado',
      invalidDescription: 'Peça ao responsável da empresa um novo link de cadastro facial.',
      unavailableTitle: 'Cadastro temporariamente indisponível',
      unavailableDescription: 'Verifique sua conexão e tente novamente. O link não será consumido enquanto o cadastro não terminar.',
      retry: 'Tentar novamente',
      saving: 'Protegendo seu cadastro...',
      successTitle: 'Cadastro facial concluído',
      successDescription: 'Seu rosto já pode ser usado para facilitar a identificação no ponto eletrônico.',
      successHint: 'Você já pode fechar esta página.',
      capture: {
        preparing: 'Carregando o reconhecimento no aparelho...', requestingCamera: 'Autorize o uso da câmera para continuar.', captureLabel: 'Captura {current} de {total}',
        poses: { front: 'Olhe de frente para a câmera', first_side: 'Vire levemente para um lado', opposite_side: 'Agora vire para o outro lado' },
        guidance: { ready: 'Fique parado por um instante', no_face: 'Posicione o rosto dentro do círculo', multiple_faces: 'Deixe apenas uma pessoa na frente da câmera', move_closer: 'Aproxime um pouco o rosto', move_away: 'Afaste um pouco o rosto', center_face: 'Centralize o rosto no círculo', look_forward: 'Olhe de frente para a câmera', keep_head_level: 'Mantenha a cabeça reta', turn_to_one_side: 'Vire levemente para um dos lados', turn_to_other_side: 'Vire para o lado oposto ao anterior', hold_still: 'Fique parado e mantenha boa iluminação' },
        captured: 'Captura concluída', privacy: 'Nenhuma foto é enviada ou armazenada.', cameraDenied: 'A câmera foi bloqueada. Libere a permissão no navegador e tente novamente.', cameraMissing: 'Nenhuma câmera compatível foi encontrada neste aparelho.', genericError: 'Não foi possível iniciar o reconhecimento facial.', tryAgain: 'Tentar novamente', cancel: 'Voltar', closeAria: 'Fechar leitura facial',
      },
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
      selfieCenterTitle: 'Center your face in the circle',
      selfiePreparing: 'Preparing face framing. You can already take the photo manually.',
      selfieCaptureNow: 'Take photo now',
      selfiePrivacy: 'This selfie will be protected and used as evidence of the time entry.',
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
      recognition: {
        matchingTitle: 'Identifying you', matching: 'Comparing your scan with the company enrollments...',
        retryTitle: 'We could not confirm your face',
        ambiguous: 'More than one enrollment looks similar. Try again or search for your name manually.',
        ambiguousRequired: 'More than one enrollment looks similar. Adjust your position and try again.',
        notRecognized: 'Your face was not recognized. Try again or search for your name manually.',
        notRecognizedRequired: 'Your face was not recognized. Adjust your position and try again.',
        unavailable: 'Face recognition is unavailable now. You can still clock in through manual search.',
        tryAgain: 'Try again', manualSearch: 'Search manually',
      },
    },
    faceCalibration: {
      button: 'Test face recognition',
      completed: 'Face recognition test complete. Continue your time entry normally.',
      unavailable: 'Your face could not be analyzed now. You can continue your time entry normally.',
    },
    faceEnrollment: {
      eyebrow: 'Face enrollment', title: 'Hi, {name}', description: 'We will register your face in three positions. It takes less than a minute and you only do it once.',
      privacy: 'Images stay on this device during scanning. The system sends and stores only a mathematical signature of your face.', start: 'Start enrollment', requirement: 'Use a well-lit place and remove hats, masks, or anything covering your face.',
      invalidTitle: 'Invalid or expired link', invalidDescription: 'Ask your company administrator for a new face enrollment link.', unavailableTitle: 'Enrollment temporarily unavailable', unavailableDescription: 'Check your connection and try again. The link is not consumed until enrollment finishes.', retry: 'Try again', saving: 'Protecting your enrollment...', successTitle: 'Face enrollment complete', successDescription: 'Your face can now help identify you at the time clock.', successHint: 'You can close this page now.',
      capture: {
        preparing: 'Loading recognition on this device...', requestingCamera: 'Allow camera access to continue.', captureLabel: 'Capture {current} of {total}',
        poses: { front: 'Look straight at the camera', first_side: 'Turn slightly to one side', opposite_side: 'Now turn to the other side' },
        guidance: { ready: 'Hold still for a moment', no_face: 'Place your face inside the circle', multiple_faces: 'Keep only one person in front of the camera', move_closer: 'Move a little closer', move_away: 'Move a little farther away', center_face: 'Center your face in the circle', look_forward: 'Look straight at the camera', keep_head_level: 'Keep your head level', turn_to_one_side: 'Turn slightly to either side', turn_to_other_side: 'Turn to the opposite side', hold_still: 'Hold still and use good lighting' },
        captured: 'Capture complete', privacy: 'No photo is sent or stored.', cameraDenied: 'Camera access was blocked. Allow it in your browser and try again.', cameraMissing: 'No compatible camera was found on this device.', genericError: 'Face recognition could not be started.', tryAgain: 'Try again', cancel: 'Back', closeAria: 'Close face scan',
      },
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
      selfieCenterTitle: 'Centra tu rostro en el círculo',
      selfiePreparing: 'Preparando el encuadre. Ya puedes tomar la foto manualmente.',
      selfieCaptureNow: 'Tomar foto ahora',
      selfiePrivacy: 'Esta foto estará protegida y se usará como evidencia del fichaje.',
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
      recognition: {
        matchingTitle: 'Identificándote', matching: 'Comparando la lectura con los registros de la empresa...',
        retryTitle: 'No pudimos confirmar tu rostro',
        ambiguous: 'Hay más de un registro parecido. Inténtalo de nuevo o busca tu nombre manualmente.',
        ambiguousRequired: 'Hay más de un registro parecido. Ajusta tu posición e inténtalo de nuevo.',
        notRecognized: 'Tu rostro no fue reconocido. Inténtalo de nuevo o busca tu nombre manualmente.',
        notRecognizedRequired: 'Tu rostro no fue reconocido. Ajusta tu posición e inténtalo de nuevo.',
        unavailable: 'El reconocimiento no está disponible ahora. Aún puedes fichar mediante la búsqueda manual.',
        tryAgain: 'Intentar de nuevo', manualSearch: 'Buscar manualmente',
      },
    },
    faceCalibration: {
      button: 'Probar reconocimiento facial',
      completed: 'Prueba facial completada. Continúa el registro normalmente.',
      unavailable: 'No fue posible analizar el rostro ahora. Puedes continuar el registro normalmente.',
    },
    faceEnrollment: {
      eyebrow: 'Registro facial', title: 'Hola, {name}', description: 'Registraremos tu rostro en tres posiciones. Tarda menos de un minuto y solo se hace una vez.',
      privacy: 'Las imágenes permanecen en este dispositivo durante la lectura. El sistema solo envía y guarda una firma matemática del rostro.', start: 'Comenzar registro', requirement: 'Busca un lugar iluminado y quítate gorra, mascarilla o cualquier objeto que cubra el rostro.',
      invalidTitle: 'Enlace inválido o caducado', invalidDescription: 'Pide al responsable de la empresa un nuevo enlace de registro facial.', unavailableTitle: 'Registro temporalmente no disponible', unavailableDescription: 'Comprueba tu conexión e inténtalo de nuevo. El enlace no se consume hasta terminar el registro.', retry: 'Intentar de nuevo', saving: 'Protegiendo tu registro...', successTitle: 'Registro facial completado', successDescription: 'Tu rostro ya puede facilitar tu identificación en el reloj de fichaje.', successHint: 'Ya puedes cerrar esta página.',
      capture: {
        preparing: 'Cargando el reconocimiento en el dispositivo...', requestingCamera: 'Permite el acceso a la cámara para continuar.', captureLabel: 'Captura {current} de {total}',
        poses: { front: 'Mira de frente a la cámara', first_side: 'Gira ligeramente hacia un lado', opposite_side: 'Ahora gira hacia el otro lado' },
        guidance: { ready: 'Quédate quieto un instante', no_face: 'Coloca el rostro dentro del círculo', multiple_faces: 'Deja solo una persona frente a la cámara', move_closer: 'Acerca un poco el rostro', move_away: 'Aleja un poco el rostro', center_face: 'Centra el rostro en el círculo', look_forward: 'Mira de frente a la cámara', keep_head_level: 'Mantén la cabeza recta', turn_to_one_side: 'Gira ligeramente hacia uno de los lados', turn_to_other_side: 'Gira hacia el lado opuesto al anterior', hold_still: 'Quédate quieto y usa buena iluminación' },
        captured: 'Captura completada', privacy: 'No se envía ni almacena ninguna foto.', cameraDenied: 'La cámara está bloqueada. Permite el acceso en el navegador e inténtalo de nuevo.', cameraMissing: 'No se encontró una cámara compatible en este dispositivo.', genericError: 'No fue posible iniciar el reconocimiento facial.', tryAgain: 'Intentar de nuevo', cancel: 'Volver', closeAria: 'Cerrar lectura facial',
      },
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
      selfieCenterTitle: 'Centrez votre visage dans le cercle',
      selfiePreparing: `Préparation du cadrage. Vous pouvez déjà prendre la photo manuellement.`,
      selfieCaptureNow: 'Prendre la photo maintenant',
      selfiePrivacy: `Ce selfie sera protégé et utilisé comme preuve du pointage.`,
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
      recognition: {
        matchingTitle: 'Identification en cours', matching: `Comparaison avec les enregistrements de l'entreprise...`,
        retryTitle: `Nous n'avons pas pu confirmer votre visage`,
        ambiguous: `Plusieurs enregistrements sont similaires. Réessayez ou recherchez votre nom manuellement.`,
        ambiguousRequired: `Plusieurs enregistrements sont similaires. Ajustez votre position et réessayez.`,
        notRecognized: `Votre visage n'a pas été reconnu. Réessayez ou recherchez votre nom manuellement.`,
        notRecognizedRequired: `Votre visage n'a pas été reconnu. Ajustez votre position et réessayez.`,
        unavailable: `La reconnaissance est indisponible pour le moment. Vous pouvez toujours pointer via la recherche manuelle.`,
        tryAgain: 'Réessayer', manualSearch: 'Rechercher manuellement',
      },
    },
    faceCalibration: {
      button: 'Tester la reconnaissance faciale',
      completed: 'Test facial terminé. Continuez le pointage normalement.',
      unavailable: `Le visage n'a pas pu être analysé. Vous pouvez continuer le pointage normalement.`,
    },
    faceEnrollment: {
      eyebrow: 'Enregistrement facial', title: 'Bonjour, {name}', description: `Nous allons enregistrer votre visage dans trois positions. Cela prend moins d'une minute et ne se fait qu'une fois.`,
      privacy: `Les images restent sur cet appareil pendant l'analyse. Le système envoie et conserve uniquement une signature mathématique du visage.`, start: `Commencer l'enregistrement`, requirement: `Placez-vous dans un endroit éclairé et retirez casquette, masque ou tout objet couvrant le visage.`,
      invalidTitle: 'Lien invalide ou expiré', invalidDescription: `Demandez au responsable de l'entreprise un nouveau lien d'enregistrement facial.`, unavailableTitle: 'Enregistrement temporairement indisponible', unavailableDescription: `Vérifiez votre connexion et réessayez. Le lien n'est utilisé qu'une fois l'enregistrement terminé.`, retry: 'Réessayer', saving: 'Protection de votre enregistrement...', successTitle: 'Enregistrement facial terminé', successDescription: `Votre visage peut maintenant faciliter votre identification sur la pointeuse.`, successHint: 'Vous pouvez maintenant fermer cette page.',
      capture: {
        preparing: `Chargement de la reconnaissance sur l'appareil...`, requestingCamera: `Autorisez l'accès à la caméra pour continuer.`, captureLabel: 'Capture {current} sur {total}',
        poses: { front: 'Regardez la caméra de face', first_side: `Tournez légèrement la tête d'un côté`, opposite_side: `Tournez maintenant la tête de l'autre côté` },
        guidance: { ready: 'Restez immobile un instant', no_face: 'Placez votre visage dans le cercle', multiple_faces: `Une seule personne doit se trouver devant la caméra`, move_closer: 'Rapprochez légèrement votre visage', move_away: 'Éloignez légèrement votre visage', center_face: 'Centrez votre visage dans le cercle', look_forward: 'Regardez la caméra de face', keep_head_level: 'Gardez la tête droite', turn_to_one_side: `Tournez légèrement la tête d'un côté`, turn_to_other_side: 'Tournez la tête du côté opposé', hold_still: 'Restez immobile avec un bon éclairage' },
        captured: 'Capture terminée', privacy: `Aucune photo n'est envoyée ni conservée.`, cameraDenied: `La caméra est bloquée. Autorisez-la dans le navigateur puis réessayez.`, cameraMissing: `Aucune caméra compatible n'a été trouvée sur cet appareil.`, genericError: `Impossible de démarrer la reconnaissance faciale.`, tryAgain: 'Réessayer', cancel: 'Retour', closeAria: `Fermer la lecture faciale`,
      },
    },
  },
};
