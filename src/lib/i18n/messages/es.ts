// Fase 6: español GENERALIZADO (sin ley/impuesto/órgano específico de ningún país).
// Override parcial sobre el pt-br (fuente). Marca "Dominex" mantenida. Sin raya
// (—) en la copy: usar coma/punto y coma.
//
// Los institucionales legales (privacidad/términos) son TRADUCCIÓN AUTOMÁTICA de
// texto jurídico, generalizada; necesitan revisión profesional antes de volverse
// oficiales (ver informe de entrega).
import type { MessagesOverride } from './index';

export const esOverrides: MessagesOverride = {
  languageSelector: {
    label: 'Idioma',
    ariaLabel: 'Seleccionar idioma',
  },

  nav: {
    platform: 'Plataforma',
    solutions: 'Soluciones',
    segments: 'Sectores',
    pricing: 'Precios',
    blog: 'Blog',
    login: 'Iniciar sesión',
    signup: 'Crear cuenta',
    trialSticky: 'Empieza tu prueba gratis de 14 días',
    openMenu: 'Menú',
    openMenuAria: 'Abrir menú',
    closeMenuAria: 'Cerrar menú',
    solutionsMenuAria: 'Nuestras soluciones',
    solutionsMenuHeader: 'Todo lo que hace la plataforma',
    segmentsMenuAria: 'Nuestros sectores',
    segmentsMenuHeader: 'Nuestros sectores',
    solutionTaglines: {
      'os-digital': 'Órdenes de trabajo en la app, con fotos, checklists y firma del cliente.',
      'sistema-pmoc': 'Planes de mantenimiento automáticos por equipo, en el calendario.',
      'sistema-crm': 'Embudo de clientes y propuestas hasta cerrar la venta.',
      'controle-financeiro': 'Cuentas por pagar, por cobrar y flujo de caja bajo control.',
      'ponto-e-folha': 'Control de asistencia del equipo, anticipos y nómina sin planillas aparte.',
      'emissao-de-nfse': 'Emite facturas de servicio directamente desde la plataforma.',
      'portal-do-cliente': 'Tu cliente sigue órdenes de trabajo, presupuestos e historial en línea.',
      'controle-de-estoque': 'Piezas y materiales descontados automáticamente en cada orden.',
      'orcamentos-e-contratos': 'Un presupuesto aprobado se convierte en contrato y órdenes recurrentes.',
      'rastreamento-de-equipes': 'Equipo en mapa en vivo y la ruta del día organizada.',
      'area-do-tecnico': 'Calculadoras, tablas de gases y catálogo de equipos en tu bolsillo.',
    },
    segmentTaglines: {
      'sistema-para-refrigeracao': 'Órdenes de trabajo, planes de mantenimiento y control de gases por unidad.',
      'sistema-para-eletricistas': 'Informes, permisos e instalaciones bajo control.',
      'sistema-para-energia-solar': 'Diseño, instalación y O&M de plantas solares.',
      'sistema-para-provedores': 'Instalación de fibra, soporte y visitas técnicas.',
      'sistema-para-cftv': 'Cámaras, alarmas y rondas con historial completo.',
      'sistema-para-construcao-civil': 'Obras, cuadrillas y mediciones en campo.',
      'sistema-para-elevadores': 'Mantenimiento preventivo y avisos de avería a tiempo.',
      'sistema-para-limpeza-conservacao': 'Sitios, rondas y cuadrillas organizados.',
      'sistema-para-dedetizacao': 'Certificados, control de plagas y contratos recurrentes.',
    },
  },

  moduleLabels: {
    'os-digital': 'Órdenes de Trabajo Digitales',
    'sistema-pmoc': 'Planes de Mantenimiento',
    'sistema-crm': 'CRM y Ventas',
    'controle-financeiro': 'Finanzas',
    'ponto-e-folha': 'Asistencia y Nómina (RR. HH.)',
    'emissao-de-nfse': 'Facturación de Servicios',
    'portal-do-cliente': 'Portal del Cliente',
    'controle-de-estoque': 'Inventario',
    'orcamentos-e-contratos': 'Presupuestos y Contratos',
    'rastreamento-de-equipes': 'Rastreo y Programación',
    'area-do-tecnico': 'Kit del Técnico™',
  },

  segmentLabels: {
    'sistema-para-refrigeracao': 'Refrigeración y Climatización',
    'sistema-para-eletricistas': 'Instalaciones Eléctricas',
    'sistema-para-energia-solar': 'Energía Solar',
    'sistema-para-provedores': 'Telecomunicaciones / ISP',
    'sistema-para-cftv': 'CCTV y Seguridad Electrónica',
    'sistema-para-construcao-civil': 'Construcción',
    'sistema-para-elevadores': 'Ascensores',
    'sistema-para-limpeza-conservacao': 'Limpieza y Facilities',
    'sistema-para-dedetizacao': 'Control de Plagas',
  },

  footer: {
    tagline: 'Domina cómo funciona tu negocio.',
    solutions: 'Soluciones',
    segments: 'Sectores',
    institutional: 'Empresa',
    linkAbout: 'Quiénes somos',
    linkBlog: 'Blog',
    linkTerms: 'Términos de uso',
    linkPrivacy: 'Política de Privacidad',
    copyright: 'Todos los derechos reservados. Hecho para equipos que dominan el campo.',
    madeBy: 'Desarrollado por',
  },

  pageChrome: {
    ctaTrial: 'Empieza gratis por 14 días, sin tarjeta',
    seePlans: 'Ver planes',
    seeAllPlans: 'Ver todos los planes',
    faqHeading: 'Preguntas frecuentes',
    problemLabel: 'El problema',
    withDominex: 'Con Dominex',
    pricing: {
      heading: 'Precios transparentes, sin sorpresas',
      subtitle:
        'Planes que crecen con tu operación. Mira la lista completa y elige el que encaja.',
    },
    segment: {
      painsHeading: 'Los dolores de cabeza del día a día, resueltos',
      painsSubheading: 'Donde la operación se traba con la improvisación, Dominex toma el control',
      featuresHeading: 'Todo lo que tu operación necesita, en un solo lugar',
      featuresSubheading:
        'Desde el aviso de servicio hasta el informe, Dominex cubre cada etapa del trabajo en campo',
      testimonialsHeading: 'Quien usa Dominex nunca vuelve a improvisar',
    },
    nicheSearchPlaceholder: 'Buscar sector...',
    nicheEmpty: 'No se encontró ningún sector.',
  },

  home: {
    hero: {
      typedPre: 'Domina cómo funciona ',
      typedHighlight: 'tu negocio.',
      srHeadline:
        'Software de órdenes de trabajo, mantenimiento y gestión para equipos de climatización y servicio en campo. Domina cómo funciona tu negocio.',
      subtitle:
        'Se acabaron las planillas, los chats y el retrabajo. Dominex centraliza tus órdenes de trabajo, rastrea a tu equipo y entrega datos reales para que crezcas.',
      ctaPrimary: 'Empieza gratis por 14 días',
      ctaSecondary: 'Ver planes',
      videoUnsupported: 'Tu navegador no admite video HTML5.',
      videoLabel: 'Demostración de Dominex',
    },
    logos: {
      eyebrow: 'Empresas que ya dominan sus operaciones con Dominex',
    },
    problemSolution: {
      problemsTitle: '¿Tu operación sigue atada a la improvisación?',
      solutionsTitle: 'Con Dominex, tienes el control total',
      problems: [
        'Órdenes de trabajo en papel o en una planilla perdida',
        'Técnico sin información en el campo',
        'Clientes llamando "¿dónde está mi técnico?"',
        'Informes escritos a mano, horas después',
        'Sin visibilidad de lo que pasa ahora mismo',
      ],
      solutions: [
        'Orden de trabajo digital creada en segundos',
        'App para el técnico con todo lo que necesita',
        'Rastreo en tiempo real en el mapa',
        'Informes automáticos al finalizar',
        'Panel con indicadores en vivo',
      ],
    },
    features: {
      heading: 'Todo lo que tu operación necesita, en un solo lugar',
      subheading: 'Desde el aviso de servicio hasta la facturación, Dominex cubre cada etapa del trabajo',
      cta: 'Prueba gratis de 14 días, sin tarjeta',
      items: [
        {
          title: 'Órdenes de trabajo digitales',
          description:
            'Crea, asigna y sigue órdenes de trabajo con fotos, checklists, firma digital e historial completo. Sin más papel ni retrabajo.',
        },
        {
          title: 'App del técnico en el campo',
          description:
            'App móvil instalable: el técnico recibe la orden de trabajo, hace check-in, toma fotos y recoge la firma del cliente, directo desde el campo.',
        },
        {
          title: 'Programación y rastreo del equipo',
          description:
            'Mira al equipo en un mapa en vivo, planifica la ruta del día y envía los avisos al técnico más cercano, sin conflictos de agenda.',
        },
        {
          title: 'Planes de mantenimiento automáticos',
          description:
            'Genera planes de mantenimiento preventivo por equipo, con visitas, checklists y el calendario listo. Preventivos recurrentes en piloto automático.',
        },
        {
          title: 'CRM y ventas',
          description:
            'Embudo de clientes, presupuestos y propuestas hasta el cierre. Sigue cada oportunidad sin perder ningún seguimiento.',
        },
        {
          title: 'Finanzas completas',
          description:
            'Cuentas por pagar y por cobrar, flujo de caja, tarjetas y categorías. Sabe qué entra, qué sale y cuánto de verdad te queda.',
        },
        {
          title: 'Asistencia y nómina (RR. HH.)',
          description:
            'Control de asistencia del equipo, anticipos, bonos y nómina. Recibos listos, sin planilla aparte.',
        },
        {
          title: 'Facturación de servicios',
          description:
            'Emite facturas de servicio directamente desde la plataforma, por cliente, siguiendo tus reglas fiscales locales.',
        },
        {
          title: 'Portal del cliente',
          description:
            'Tu cliente sigue órdenes de trabajo, presupuestos e historial por enlace, sin llamar. Más transparencia, menos llamadas.',
        },
        {
          title: 'Control de inventario',
          description:
            'Piezas y materiales descontados automáticamente en cada orden de trabajo. Sabe qué tienes disponible antes de prometer un plazo.',
        },
        {
          title: 'Presupuestos y contratos',
          description:
            'Un presupuesto aprobado por enlace se convierte en contrato y órdenes de trabajo recurrentes. De "venta cerrada" a un trabajo programado sin volver a escribir todo.',
        },
        {
          title: 'Kit del Técnico™',
          description:
            'Calculadoras, tablas de gases y un catálogo de equipos en el bolsillo del técnico, la caja de herramientas que le faltaba en el teléfono.',
        },
        {
          title: 'Informes y métricas',
          description:
            'Panel con órdenes de trabajo por estado, tiempo promedio de atención y valoraciones de clientes. Decisiones basadas en datos, no en suposiciones.',
        },
      ],
    },
    howItWorks: {
      heading: 'Simple para empezar, potente para escalar',
      steps: [
        {
          title: 'Registra tus clientes y técnicos',
          desc: 'Impórtalos o agrégalos en minutos. Configura grupos, regiones y permisos para cada perfil.',
        },
        {
          title: 'Crea y despacha órdenes de trabajo',
          desc: 'Abre una orden de trabajo en segundos, asígnala al técnico correcto y síguela en vivo en el panel.',
        },
        {
          title: 'Analiza y crece',
          desc: 'Informes automáticos, valoraciones de clientes y métricas de rendimiento para decidir más rápido.',
        },
      ],
    },
    productMockup: {
      heading: 'El panel que tu equipo va a amar usar',
      subheading: 'Una interfaz intuitiva y potente, diseñada para gestores de equipos en campo',
      searchPlaceholder: 'Buscar órdenes de trabajo...',
      filters: 'Filtros',
      liveMap: 'Mapa en vivo',
      sidebar: {
        dashboard: 'Panel',
        serviceOrders: 'Órdenes de Trabajo',
        schedule: 'Agenda',
        clients: 'Clientes',
        settings: 'Configuración',
      },
      status: {
        open: 'Abierta',
        inProgress: 'En progreso',
        done: 'Completada',
        blocked: 'Bloqueada',
      },
    },
    testimonials: {
      heading: 'Quien usa Dominex nunca vuelve a improvisar',
      items: [
        {
          quote:
            'Perdíamos 3 horas al día en informes manuales. Ahora cerramos todo en 15 minutos. Resultados reales.',
          role: 'Gerente de Operaciones',
        },
        {
          quote:
            'El equipo de campo ganó autonomía y nuestros clientes empezaron a confiar más en nuestro servicio.',
          role: 'Director',
        },
        {
          quote:
            'En 2 semanas teníamos visibilidad total de nuestras órdenes de trabajo. Nunca más perdimos un aviso de servicio.',
          role: 'Fundador',
        },
      ],
    },
    segments: {
      heading: 'Para cualquier empresa con un equipo en el campo',
      subheading: 'Atendemos a muchos sectores de servicio en campo',
      hoverHint: 'Haz clic para ver más',
      ariaSuffix: 'ver Dominex para este sector',
      imageAltPrefix: 'Dominex para',
    },
    pricing: {
      heading: 'Planes que crecen con tu operación',
      monthly: 'Mensual',
      annual: 'Anual',
      annualDiscount: '-20%',
      mostPopular: '⭐ Más popular',
      priceEquivalent: 'equivalente a',
      priceFrom: 'desde',
      perMonth: '/mes',
      featuresLabel: 'Funciones',
      currencyPrefix: 'US$',
      annualStrike: (monthly: number) => `US$ ${monthly}/mes`,
      annualTotal: (total: number) => `Total: US$ ${total}/año · Ahorra 20%`,
      ctaTrial: 'Empezar Prueba Gratis de 14 Días',
      enterpriseBadge: 'Enterprise',
      plans: {
        start: {
          name: 'Esencial',
          desc: 'Gestión básica para equipos pequeños',
          features: [
            'Órdenes de trabajo ilimitadas',
            '5 usuarios incluidos',
            'App para técnicos',
            'Agenda y calendario',
            'Portal del cliente',
            'Informes básicos',
            'Soporte por correo',
          ],
        },
        avancado: {
          name: 'Pro',
          desc: 'Para empresas que necesitan RR. HH. y finanzas',
          features: [
            'Todo lo de Esencial +',
            '10 usuarios incluidos',
            'Módulo de empleados / RR. HH.',
            'Finanzas avanzadas',
            'Cuentas por pagar/por cobrar',
            'Estado de resultados e informes financieros',
            'Gestión de contratos y planes de mantenimiento',
          ],
        },
        master: {
          name: 'Business',
          desc: 'Operación completa con CRM y portal',
          features: [
            'Todo lo de Pro +',
            '15 usuarios incluidos',
            'CRM / Embudo de ventas',
            'Facturación de servicios integrada',
            'Precios avanzados (markup)',
            'Gestión de contratos y planes de mantenimiento',
            'Portal del Cliente / Portal de Contratos',
            'Marca blanca (tu marca)',
            'Soporte prioritario',
          ],
        },
        enterprise: {
          name: 'Plan Enterprise',
          desc: 'Diseña un plan hecho a la medida de tu operación.',
          cta: 'Hablar con un Consultor',
        },
      },
    },
    faq: {
      heading: 'Preguntas frecuentes',
      items: [
        {
          q: '¿Para qué tipo de empresa es Dominex?',
          a: 'Para empresas que prestan servicios técnicos en campo: refrigeración y climatización, mantenimiento preventivo, electricidad, control de plagas, telecomunicaciones, seguridad electrónica, instalaciones, soporte técnico y cualquier operación con equipos en campo y órdenes de trabajo.',
        },
        {
          q: '¿Funciona en el móvil? ¿Hay una app para técnicos?',
          a: 'Sí. La plataforma es 100% web y responsiva (funciona en cualquier navegador) y el técnico usa una app PWA instalable en Android e iOS, con check-in/out, fotos, firma digital y checklists.',
        },
        {
          q: '¿Cómo funciona la prueba gratuita?',
          a: 'Son 14 días con acceso completo al plan que elijas, sin necesidad de tarjeta de crédito. Puedes cancelar en cualquier momento y tus datos se conservan si decides suscribirte después.',
        },
        {
          q: '¿Los datos de las órdenes de trabajo se guardan para siempre?',
          a: 'Sí. Mantenemos el historial completo de órdenes de trabajo, equipos, clientes e informes sin límite de retención mientras tu suscripción esté activa, garantizando la trazabilidad para garantías, auditorías y planes de mantenimiento.',
        },
        {
          q: '¿Puedo gestionar planes de mantenimiento y contratos recurrentes?',
          a: 'Sí. Dominex genera automáticamente las órdenes de trabajo de los contratos de mantenimiento (mensual, bimestral, trimestral, etc.) y mantiene el calendario de mantenimiento organizado por equipo y cliente.',
        },
        {
          q: '¿Puedo personalizar formularios, checklists e informes?',
          a: 'Sí. Creas plantillas de checklist por tipo de servicio, defines campos obligatorios, fotos y firma. Los informes de las órdenes de trabajo se generan como PDF con tu marca, colores y logo.',
        },
        {
          q: '¿Hay un CRM y embudo de ventas integrado?',
          a: 'Sí. El plan Business incluye un CRM completo con embudo tipo Kanban, etapas personalizables, webhooks para captación de leads y conversión directa en presupuestos y órdenes de trabajo.',
        },
        {
          q: '¿Puedo gestionar finanzas, cuentas por pagar y estados de resultados?',
          a: 'Sí. A partir del plan Pro tienes cuentas por pagar/por cobrar, múltiples cuentas bancarias, flujo de caja, movimientos recurrentes, conciliación por categoría y un estado de resultados para el análisis de resultados.',
        },
        {
          q: '¿Cómo funciona el control de asistencia y la nómina de los empleados?',
          a: 'El módulo de RR. HH. permite que los empleados registren su entrada y salida, además del control de horas, ausencias, anticipos, bonos y la generación de recibos individuales calculados de forma proporcional a la jornada.',
        },
        {
          q: '¿Puedo tener más usuarios de los que permite el plan?',
          a: 'Sí. Puedes agregar usuarios adicionales a cualquier plan por una tarifa mensual extra, o pasar a un plan superior cuando necesites más recursos.',
        },
        {
          q: '¿Cómo es el soporte? ¿Hablo con una persona real?',
          a: 'Sí. Soporte humano por chat y correo en horario comercial. Los planes Business y Enterprise incluyen soporte prioritario y un gestor de cuenta dedicado.',
        },
        {
          q: '¿Mis datos están seguros? ¿Qué hay de la protección de datos?',
          a: 'Usamos infraestructura en la nube con cifrado en tránsito y en reposo, copias de seguridad automáticas y aislamiento entre empresas (multi-tenant). Seguimos un proceso continuo de cumplimiento en protección de datos, y puedes leer nuestra Política de Privacidad para conocer los detalles sobre la recolección, el uso y tus derechos como titular de los datos.',
        },
      ],
    },
    ctaFinal: {
      heading: 'Empieza hoy. Resultados en días.',
      subtitle:
        '14 días gratis, sin tarjeta, sin trámites. Configúralo en minutos y mira a tu equipo ganar productividad.',
      ctaPrimary: 'Crear mi cuenta gratis',
      ctaSecondary: 'O agenda una demostración',
    },
  },

  quemSomos: {
    heroBadge: 'Sobre Dominex',
    heroTitlePre: 'Domina el campo,',
    heroTitleHighlight: 'domina la operación',
    heroSubtitle:
      'Dominex existe para sacar el servicio en campo del papeleo. Un solo sistema, en móvil y escritorio, para dirigir la operación desde el presupuesto hasta el cobro.',
    ctaTrial: 'Prueba gratis de 14 días, sin tarjeta',
    ctaPricing: 'Ver planes',
    missionTitle: 'Nuestra misión',
    missionP1Strong: 'órdenes de trabajo, mantenimiento y gestión',
    missionP1:
      'Dominex es un sistema de {strong} creado para empresas de servicios y equipos en campo: refrigeración y climatización, electricidad, energía solar, CCTV, proveedores de internet, ascensores, control de plagas, limpieza y facilities, construcción y mucho más.',
    missionP2:
      'Creemos que el técnico no debe perder tiempo con órdenes de trabajo en papel, ni el gestor debe quedarse a oscuras sobre lo que pasa en el campo. Por eso reunimos en un solo lugar lo que antes estaba disperso en cuadernos, grupos de chat y planillas: CRM, presupuestos, contratos, órdenes de trabajo, planes de mantenimiento, rastreo de equipos, control de inventario, finanzas y nómina.',
    missionP3:
      'Nuestro compromiso es simple: mantener la operación organizada, trazable y fácil de dirigir, para que te enfoques en hacer bien el trabajo, no en la burocracia.',
    valuesTitle: 'En qué creemos',
    valuesSubtitle: 'Los principios que guían cada decisión sobre el producto.',
    values: [
      {
        title: 'Todo en el teléfono del técnico',
        body: 'Los equipos en campo necesitan todo a mano. La app se instala en el teléfono y el técnico abre la orden de trabajo, registra fotos, checklists y firma justo en el sitio, sin papel ni viaje de vuelta a la oficina.',
      },
      {
        title: 'Hecho para equipos que dominan el campo',
        body: 'Nacimos cerca de la operación de servicio, no de la planilla. Cada pantalla está pensada para el técnico en la calle y el gestor que necesita verlo todo desde lejos.',
      },
      {
        title: 'Rápido para empezar',
        body: 'Sin implementaciones eternas. Creas la cuenta, registras a tu equipo y empiezas a emitir órdenes de trabajo el mismo día, sin tarjeta para probar.',
      },
      {
        title: 'Tus datos son tuyos',
        body: 'Aislamiento por empresa, control de acceso por permisos y documentos siempre trazables. Cada cliente ve solo lo que es suyo.',
      },
      {
        title: 'Del presupuesto al cobro',
        body: 'CRM, presupuestos, órdenes de trabajo, planes de mantenimiento, finanzas y nómina en el mismo lugar. Un solo sistema para dirigir el trabajo de principio a fin.',
      },
      {
        title: 'Soporte que conoce el oficio',
        body: 'Hablamos el idioma de los prestadores de servicio en campo. Cuando nos contactas, del otro lado hay alguien que conoce tu rutina.',
      },
    ],
    finalCtaTitle: 'Prueba Dominex en tu operación',
    finalCtaSubtitle:
      'Son 14 días gratis, sin tarjeta de crédito. Registra a tu equipo y empieza a emitir órdenes de trabajo hoy.',
  },

  // El texto legal de abajo es una traducción AUTOMÁTICA y GENERALIZADA. Necesita
  // revisión profesional antes de tratarse como oficial (ver informe de entrega).
  privacidade: {
    back: '← Volver',
    title: 'Política de Privacidad',
    version: 'Versión 1.0 — última actualización: abril de 2026',
    s1Title: '1. Identificación del Responsable del Tratamiento',
    s1P1Strong: 'Dominex Tecnologia',
    s1P1: '{strong} es el responsable de los datos personales tratados en esta plataforma, conforme a la legislación de protección de datos aplicable.',
    s1DpoStrong: 'Delegado de Protección de Datos (DPO):',
    s1Dpo: 'En proceso de designación conforme a la legislación de protección de datos aplicable.',
    s1Contact: 'Canal de contacto:',
    s2Title: '2. Datos Personales Recopilados',
    s2Intro: 'Recopilamos las siguientes categorías de datos personales:',
    s2Items: [
      { strong: 'Registro:', rest: 'nombre, correo, teléfono, identificación fiscal' },
      { strong: 'Acceso:', rest: 'registros de inicio de sesión, dirección IP, agente de usuario, sesiones activas' },
      { strong: 'Empleado:', rest: 'nombre, identificación fiscal, teléfono, dirección, clave de pago, salario, jornada' },
      { strong: 'Geolocalización:', rest: 'coordenadas GPS de los técnicos durante las visitas de servicio (cada 30s)' },
      { strong: 'Biométrico/imagen:', rest: 'selfies para el registro de asistencia y fotos de equipos' },
      { strong: 'Clientes finales de la empresa cliente:', rest: 'nombre, identificación fiscal, correo, teléfono, dirección, equipos' },
      { strong: 'Financiero:', rest: 'registros de transacciones (sin datos de tarjeta de crédito, procesados por pasarelas externas)' },
    ],
    s3Title: '3. Finalidades y Bases Legales',
    s3ColPurpose: 'Finalidad',
    s3ColBasis: 'Base Legal',
    s3Rows: [
      ['Prestación del servicio de gestión de órdenes de trabajo y equipos', 'Ejecución de contrato'],
      ['Control de asistencia y jornada laboral', 'Cumplimiento de una obligación legal'],
      ['Rastreo de técnicos en el campo durante las visitas de servicio', 'Interés legítimo y consentimiento'],
      ['Registro de asistencia con selfie (biometría)', 'Consentimiento específico'],
      ['Comunicación sobre el servicio contratado', 'Ejecución de contrato'],
      ['Mejora y seguridad de la plataforma', 'Interés legítimo'],
      ['Cumplimiento de obligaciones fiscales y contables', 'Cumplimiento de una obligación legal'],
    ] as [string, string][],
    s4Title: '4. Compartir con Terceros (Subencargados)',
    s4Items: [
      { strong: 'Supabase Inc.', rest: '(EE. UU.) — base de datos, autenticación y almacenamiento de archivos. Transferencia internacional basada en cláusulas contractuales estándar.' },
      { strong: 'OpenStreetMap/Nominatim', rest: '— geocodificación de direcciones (mediada por el servidor, sin enviar directamente la IP del usuario).' },
      { strong: 'Servicio de búsqueda de direcciones', rest: '— búsqueda de código postal para autocompletar direcciones.' },
      { strong: 'Pasarelas de pago', rest: '— procesamiento de cobros. No tenemos acceso a los datos de tarjeta.' },
    ],
    s4Note: 'No vendemos, alquilamos ni compartimos datos personales con terceros con fines publicitarios.',
    s5Title: '5. Conservación de los Datos',
    s5Items: [
      'Datos de la cuenta: mientras el contrato esté activo + 90 días tras la terminación',
      'Registros fiscales y financieros: 5 años (obligación legal)',
      'Registros de acceso: 6 meses',
      'Datos de geolocalización: 12 meses',
      'Datos de registro de asistencia: 5 años (obligación laboral)',
    ],
    s6Title: '6. Derechos del Titular de los Datos',
    s6Intro: 'Tienes los siguientes derechos sobre tus datos personales:',
    s6Items: [
      'Confirmación de la existencia del tratamiento',
      'Acceso a los datos',
      'Corrección de datos incompletos, inexactos o desactualizados',
      'Anonimización, bloqueo o eliminación de datos innecesarios',
      'Portabilidad de los datos (formato estructurado)',
      'Eliminación de los datos tratados con base en el consentimiento',
      'Información sobre el compartir con terceros',
      'Revocación del consentimiento',
    ],
    s6OutroPre: 'Para ejercer tus derechos, entra en el ',
    s6OutroLink: 'Centro de Datos',
    s6OutroMid: ' o envía un correo a ',
    s6OutroPost: '.',
    s7Title: '7. Cookies y Tecnologías de Seguimiento',
    s7P: 'Usamos solo cookies esenciales para que la plataforma funcione (autenticación y preferencias de sesión). No usamos cookies de seguimiento ni de publicidad. La fuente Montserrat se carga localmente, sin conexión con Google Fonts.',
    s8Title: '8. Seguridad',
    s8P: 'Adoptamos medidas técnicas y organizativas para proteger tus datos: cifrado TLS en tránsito, control de acceso por empresa (multi-tenant con seguridad a nivel de fila en la base de datos), autenticación segura y monitoreo de seguridad.',
    s9Title: '9. Cambios en esta Política',
    s9P: 'Esta política puede actualizarse periódicamente. Cuando ocurran cambios significativos, te notificaremos por correo o aviso en la plataforma. La versión y la fecha de actualización siempre se muestran en la parte superior.',
    s10Title: '10. Contacto y DPO',
    s10P: 'Para dudas, solicitudes o reclamaciones relacionadas con la privacidad y la protección de datos:',
    s10NotePre: 'También puedes presentar una reclamación ante la autoridad de protección de datos de tu jurisdicción. ',
    s10NoteUrl: '',
    s10NoteUrlLabel: '',
    s10NotePost: '',
  },

  termos: {
    back: '← Volver',
    title: 'Términos de Uso',
    version: 'Versión 1.0 — última actualización: abril de 2026',
    s1Title: '1. Aceptación de los Términos',
    s1Pre: 'Al registrarte y usar la plataforma Dominex, tú ("Usuario") aceptas estos Términos de Uso y nuestra ',
    s1Link: 'Política de Privacidad',
    s1Post: '. Si no estás de acuerdo, no uses el servicio.',
    s2Title: '2. Descripción del Servicio',
    s2P: 'Dominex es una plataforma SaaS (Software como Servicio) para la gestión de equipos en campo, órdenes de trabajo, clientes, equipos, finanzas y recursos humanos, destinada a empresas que prestan servicios técnicos.',
    s3Title: '3. Registro y Cuenta',
    s3Items: [
      'El Usuario es responsable de la exactitud de la información proporcionada en el registro.',
      'La cuenta es personal e intransferible. No compartas tus credenciales.',
      'El Usuario es responsable de toda actividad realizada bajo su cuenta.',
      'Reporta de inmediato cualquier acceso no autorizado a tu cuenta.',
    ],
    s4Title: '4. Período de Prueba',
    s4P: 'Ofrecemos un período gratuito de 14 días con acceso al plan seleccionado. Cuando el período termina, la cuenta se suspende automáticamente si no hay una suscripción activa. Los datos se conservan por 90 días adicionales para una posible reactivación.',
    s5Title: '5. Propiedad de los Datos',
    s5Pre: 'Los datos ingresados en la plataforma (clientes, órdenes de trabajo, empleados, finanzas) son propiedad de la empresa cliente. Dominex los trata exclusivamente para prestar el servicio contratado, según los términos de la ',
    s5Link: 'Política de Privacidad',
    s5Post: '.',
    s6Title: '6. Uso Aceptable',
    s6Intro: 'Está prohibido usar la plataforma para:',
    s6Items: [
      'Actividades ilegales o que violen derechos de terceros',
      'Envío de spam o contenido malicioso',
      'Intentos de acceso no autorizado a sistemas o datos',
      'Reventa o sublicencia del servicio sin autorización',
      'Ingeniería inversa o extracción del código fuente',
    ],
    s7Title: '7. Disponibilidad y SLA',
    s7P: 'Nos esforzamos por mantener la plataforma disponible 24/7, pero no garantizamos una disponibilidad ininterrumpida. El mantenimiento programado se comunicará con al menos 24 horas de anticipación.',
    s8Title: '8. Suspensión y Cancelación',
    s8P: 'Nos reservamos el derecho de suspender o terminar cuentas que violen estos Términos, tras notificar al Usuario. La cancelación voluntaria puede hacerse en cualquier momento en la configuración de la cuenta.',
    s9Title: '9. Limitación de Responsabilidad',
    s9P: 'Dominex no se hace responsable por daños indirectos, pérdida de datos por no mantener el Usuario sus propias copias de seguridad, ni interrupciones causadas por fuerza mayor o fallas de terceros (proveedores de internet, infraestructura en la nube).',
    s10Title: '10. Cambios en los Términos',
    s10P: 'Podemos actualizar estos Términos periódicamente. Los cambios significativos se comunicarán con al menos 30 días de anticipación por correo. El uso continuado del servicio tras los cambios implica su aceptación.',
    s11Title: '11. Ley y Jurisdicción Aplicables',
    s11P: 'Estos Términos se rigen por la legislación aplicable. Cualquier controversia se resolverá ante los tribunales competentes del lugar de registro del proveedor.',
    s12Title: '12. Contacto',
    s12Pre: 'Dudas sobre estos Términos: ',
  },
};

export default esOverrides;
