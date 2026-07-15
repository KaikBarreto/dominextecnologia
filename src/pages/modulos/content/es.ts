// ─────────────────────────────────────────────────────────────────────────────
// Contenido es (Español) de módulos, traducciones nativas.
//
// Record keys = slug pt-br canónico (idéntico a pt-br.ts). El campo `slug` de
// cada módulo define la dirección en español (/es/<slug>) vía slugRegistry.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ClipboardList,
  ShieldCheck,
  Users,
  Wallet,
  Clock,
  FileText,
  UserCircle,
  Boxes,
  FileSignature,
  MapPin,
  Wrench,
  Calendar,
  RefreshCw,
  BarChart3,
  Smartphone,
  Download,
  Camera,
  PenLine,
  CheckSquare,
  QrCode,
  TrendingUp,
  Receipt,
  CreditCard,
  Landmark,
  CalendarClock,
  HandCoins,
  Banknote,
  FileCheck2,
  Building2,
  Package,
  PackageMinus,
  Route as RouteIcon,
  Navigation,
  Gauge,
  Calculator,
  BookOpen,
  Eye,
  Send,
  Repeat,
} from 'lucide-react';
import type { ModuleContentMap } from './types';


const es: ModuleContentMap = {
  // ────────────────────────────────────────────────────────────────────────
  // 1. Órdenes de trabajo digitales
  // ────────────────────────────────────────────────────────────────────────
  'os-digital': {
    slug: 'software-ordenes-de-trabajo',
    metaTitle: 'Software de órdenes de trabajo para equipos de campo | Dominex',
    metaDescription:
      'Software de órdenes de trabajo digitales para equipos de campo: órdenes en el móvil del técnico, listas de verificación, fotos de antes y después, firma del cliente, app instalable, agenda e informe PDF automático. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Órdenes de trabajo digitales',
      h1: 'Software de órdenes de trabajo para equipos de campo',
      h1Highlight: 'órdenes de trabajo digitales',
      subtitle:
        'Despídete de las órdenes en papel que se pierden, llegan tarde y aparecen sin fotos. Dominex pone la orden de trabajo en el móvil de tu técnico, con lista de verificación, fotos, firma y un informe que queda listo en el momento, en pleno campo.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'Cero papel', label: 'órdenes creadas, ejecutadas y cerradas en la app' },
      { value: 'En el móvil', label: 'órdenes completadas por el técnico en campo' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que la usan' },
    ],
    painsHeading: 'Las órdenes en papel te cuestan todos los días',
    painsSubheading: 'Donde las órdenes se rompen en improvisación, Dominex devuelve el control',
    pains: [
      {
        pain: '"¿Dónde está la orden del trabajo de ayer?"',
        solution:
          'Cada orden de trabajo queda registrada en el sistema, vinculada al cliente, al equipo y al técnico responsable. Busca por número, cliente o estado y abre el historial completo en segundos.',
      },
      {
        pain: 'El técnico terminó el trabajo pero no tomó fotos ni consiguió la firma',
        solution:
          'La app exige los pasos: fotos de antes y después, lista de verificación completa y firma del cliente en pantalla. Nada se cierra a medias, y tienes prueba del trabajo hecho.',
      },
      {
        pain: 'Informe de la visita escrito horas después, al final del día',
        solution:
          'En cuanto el técnico termina la orden en campo, queda listo un informe PDF con tu marca, con fotos, lista de verificación y firma. Se lo envías al cliente de inmediato, sin retrabajo en la oficina.',
      },
      {
        pain: 'Trabajos repartidos por WhatsApp y nadie sabe qué está pendiente',
        solution:
          'El panel muestra cada orden por estado: abierta, en ejecución, finalizada. Asignas cada una al técnico adecuado y sigues toda la operación sin hacer llamadas.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'Toda la orden de trabajo en la mano del técnico',
        body: 'El técnico abre la app, ve la cola de trabajos del día, entra en la orden y lo tiene todo: datos del cliente, la dirección en el mapa, el equipo, el historial de visitas anteriores y qué hay que hacer. Ejecuta el trabajo, lo registra y cierra el servicio sin volver a la oficina ni llamar para pedir información.',
        image: {
          src: '/modulos/os-digital/1.webp',
          alt: 'Dos técnicos de campo junto a la furgoneta revisando una orden de trabajo en una tablet',
        },
      },
      {
        icon: Download,
        title: 'App instalable en el móvil del técnico',
        body: 'Dominex es una app instalable (PWA) en el móvil del técnico, sin necesidad de descargarla de una tienda de aplicaciones. El equipo abre la orden, toma fotos, completa la lista de verificación y recoge la firma del cliente directo desde el móvil, en pleno campo. Todo lo que el técnico registra aparece al instante para que la oficina lo siga.',
        image: {
          src: '/modulos/os-digital/2.webp',
          alt: 'Técnico con equipo de seguridad usando un móvil en una obra en campo',
        },
      },
      {
        icon: FileSignature,
        title: 'Lista de verificación, fotos y firma generan el informe en el momento',
        body: 'Crea listas de verificación por tipo de servicio, captura fotos de antes y después y recoge la firma del cliente en la propia pantalla. Cuando el trabajo termina, el informe PDF de la orden con tu logo y colores queda listo para enviar. El cliente recibe un documento profesional, y tú tienes prueba de cada paso del trabajo.',
        image: {
          src: '/modulos/os-digital/3.webp',
          alt: 'Técnico sosteniendo una carpeta con una lista de verificación de inspección y un bolígrafo',
        },
      },
    ],
    featuresHeading: 'Todo lo que tu orden de trabajo necesita, en un solo lugar',
    featuresSubheading: 'Desde la solicitud hasta el informe, las órdenes digitales cubren cada paso',
    features: [
      { icon: ClipboardList, title: 'Creación rápida de órdenes', desc: 'Abre órdenes de instalación, mantenimiento y reparación en segundos, ya vinculadas al cliente y al equipo.' },
      { icon: CheckSquare, title: 'Lista de verificación por servicio', desc: 'Plantillas de lista por tipo de servicio mantienen cada visita en el camino correcto.' },
      { icon: Camera, title: 'Fotos de antes y después', desc: 'Evidencia fotográfica adjunta a la orden prueba el estado del trabajo y protege a tu empresa.' },
      { icon: PenLine, title: 'Firma del cliente', desc: 'El cliente firma en la pantalla del móvil y la firma entra en el informe final.' },
      { icon: Download, title: 'App instalable', desc: 'Instala Dominex en el móvil del técnico, como una app, sin tienda de aplicaciones.' },
      { icon: Calendar, title: 'Agenda y despacho', desc: 'Ve la cola del día y asigna cada trabajo al técnico más cercano, sin choques de horario.' },
      { icon: FileSignature, title: 'Informe automático', desc: 'Un PDF con tu marca listo en cuanto el trabajo termina, con fotos, lista de verificación y firma.' },
      { icon: BarChart3, title: 'Panel de estados', desc: 'Órdenes abiertas, en ejecución y finalizadas en una vista en vivo de tu operación.' },
      { icon: Smartphone, title: 'Respuesta en video en la lista de verificación', desc: 'En los planes Pro y Business, el técnico graba un clip corto (hasta 15 s) como respuesta de lista de verificación, en campo. El cliente ve el video en el enlace de la orden.' },
    ],
    testimonialsHeading: 'Quien pasó a digital no vuelve al papel',
    testimonials: [
      { quote: 'Las órdenes en papel se perdían y los clientes pedían fotos que nadie tomaba. Ahora todo vive en la app, con la firma y el informe en el momento.', name: 'Carlos M.', role: 'Gerente de Operaciones', company: 'empresa de mantenimiento' },
      { quote: 'El técnico llega al cliente y ya ve el historial. Se acabó el "déjame llamar a la oficina para confirmar".', name: 'Roberta S.', role: 'Coordinadora Técnica', company: 'servicios de reparación' },
      { quote: 'El informe con marca en el momento cambió la cara de la empresa. Los clientes confían más en el servicio.', name: 'André P.', role: 'Fundador', company: 'servicios de campo' },
    ],
    faq: [
      { q: '¿Qué es una orden de trabajo digital?', a: 'Es una orden de trabajo creada, ejecutada y cerrada directo en el sistema y en la app del técnico, sin papel. Toda la visita, lista de verificación, fotos de antes y después, firma del cliente e informe, queda registrada en Dominex y vinculada al cliente y al equipo.' },
      { q: '¿El técnico usa la orden en su móvil? ¿Necesita instalar algún software?', a: 'Dominex es una app instalable (PWA) en el móvil del técnico, sin descarga de una tienda de aplicaciones. En campo, abre la orden, toma fotos, completa la lista de verificación y recoge la firma del cliente directo desde el móvil, y todo lo que registra aparece al instante para la oficina.' },
      { q: '¿Puedo adjuntar fotos y recoger la firma del cliente en la orden?', a: 'Sí. Cada orden acepta fotos de antes y después y la firma del cliente capturada en la pantalla del móvil. Todo ello entra en el informe PDF final.' },
      { q: '¿El sistema genera informes de órdenes automáticamente?', a: 'Sí. Cuando la orden termina, el informe PDF con tu logo y colores queda listo, con la lista de verificación completa, las fotos y la firma. Se lo envías al cliente de inmediato.' },
      { q: '¿Puedo usar listas de verificación distintas por tipo de servicio?', a: 'Sí. Creas plantillas de lista por tipo de servicio (instalación, preventivo, correctivo) y el técnico sigue los pasos correctos en cada visita.' },
      { q: '¿Cómo reparto las órdenes a mi equipo?', a: 'En el panel ves la cola del día y asignas cada orden al técnico responsable, siguiendo el estado (abierta, en ejecución, finalizada) en tiempo real.' },
      { q: '¿El técnico puede responder la lista de verificación con video?', a: 'Sí, en los planes Pro y Business. El técnico graba un clip corto de hasta 15 segundos directo desde su móvil en campo, como respuesta a una pregunta de la lista de verificación. El video queda guardado en la orden y el cliente puede verlo en el enlace de la orden de trabajo.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Configuras tu empresa en minutos y empiezas a abrir órdenes en la app.' },
    ],
    finalCta: {
      title: 'Pasa tus órdenes de trabajo a digital',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Saca las órdenes del papel y pon a tu equipo de campo en control.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 2. Plan de mantenimiento preventivo HVAC
  // ────────────────────────────────────────────────────────────────────────
  'sistema-pmoc': {
    slug: 'software-mantenimiento-preventivo-hvac',
    metaTitle: 'Software de plan de mantenimiento preventivo HVAC | Dominex',
    metaDescription:
      'Software de plan de mantenimiento preventivo HVAC: un plan de mantenimiento por unidad de equipo, visitas recurrentes automáticas, una lista de verificación por máquina, un informe listo para auditoría y un código QR en cada unidad. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Planes de mantenimiento automáticos',
      h1: 'Software de plan de mantenimiento preventivo HVAC',
      h1Highlight: 'plan de mantenimiento HVAC',
      subtitle:
        'Deja de armar tu plan de mantenimiento en una hoja de cálculo aparte. Dominex genera un plan de mantenimiento preventivo por unidad de equipo, programa las visitas por sí solo y entrega un informe listo para cualquier auditoría o inspección.',
    },
    metrics: [
      { value: 'Por plan', label: 'un programa de mantenimiento conforme y listo para auditoría' },
      { value: 'Por máquina', label: 'un plan de mantenimiento individual por unidad' },
      { value: 'Automático', label: 'visitas recurrentes generadas por el sistema' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que lo usan' },
    ],
    painsHeading: 'El plan de mantenimiento no se puede hacer a las prisas',
    painsSubheading: 'Donde la hoja de cálculo aparte falla, Dominex te mantiene en calendario',
    pains: [
      {
        pain: 'Un plan de mantenimiento armado a mano, sin rastro y fuera de conformidad',
        solution:
          'El sistema arma el programa de mantenimiento a partir de los equipos del contrato, con el técnico responsable, el ciclo de visitas y una lista de verificación por máquina.',
      },
      {
        pain: 'Se pasó la visita de este mes y el calendario se desarmó',
        solution:
          'Las visitas de mantenimiento se generan automáticamente en el ciclo correcto (mensual, trimestral, semestral). Cada una nace con la rutina de mantenimiento de esa fase del plan.',
      },
      {
        pain: 'Un auditor pidió los registros de mantenimiento y no tenías ningún documento listo',
        solution:
          'El informe de mantenimiento y el registro de conformidad salen como PDF con tu marca, con lo que se hizo en cada visita y la firma del técnico responsable. Lo presentas en el momento.',
      },
      {
        pain: 'No conoces el historial de mantenimiento de cada máquina',
        solution:
          'El plan es por unidad: cada máquina tiene su propio calendario, su propia lista de verificación y su propio historial de visitas. Un código QR en el equipo lleva directo al registro.',
      },
    ],
    deepDives: [
      {
        icon: RefreshCw,
        title: 'Un plan de mantenimiento automático, listo para auditoría',
        body: 'El programa de mantenimiento preventivo de tus sistemas de aire acondicionado se arma a partir de los equipos del contrato. Dominex reparte las visitas a lo largo del ciclo, arma la lista de verificación de cada visita según la fase del plan, registra al técnico responsable y genera el registro de mantenimiento y el informe de conformidad listos para presentar en una auditoría o inspección, sin hoja de cálculo aparte.',
        image: {
          src: '/modulos/sistema-pmoc/1.webp',
          alt: 'Técnico de HVAC midiendo refrigerante con manómetros en un condensador de aire acondicionado',
        },
      },
      {
        icon: Wrench,
        title: 'Un plan de mantenimiento por unidad, no por contrato',
        body: 'Cada máquina (split, multisplit, VRF, chiller, fan coil, autocontenido) tiene su propio calendario de mantenimiento, con la rutina adecuada para cada visita del ciclo de 12 meses. Auditores y clientes ven exactamente qué se hizo en cada unidad, cuándo y por quién.',
        image: {
          src: '/modulos/sistema-pmoc/2.webp',
          alt: 'Técnico inspeccionando una unidad condensadora de aire acondicionado con una linterna',
        },
      },
      {
        icon: QrCode,
        title: 'Código QR en el equipo y visitas recurrentes',
        body: 'Pega un código QR en la máquina: el técnico apunta la cámara y llega directo al registro de esa unidad, con su historial y la próxima visita programada. Las visitas recurrentes se generan por el sistema en el intervalo correcto, con la lista de verificación lista, para que el mantenimiento preventivo nunca dependa de la memoria de nadie.',
        image: {
          src: '/modulos/sistema-pmoc/3.webp',
          alt: 'Técnico dando servicio a las conexiones de una unidad split exterior de aire acondicionado',
        },
      },
    ],
    featuresHeading: 'Un plan de mantenimiento completo, de la generación a la inspección',
    featuresSubheading: 'Conformidad del mantenimiento programado sin trabajo manual',
    features: [
      { icon: RefreshCw, title: 'Generación automática del plan', desc: 'El plan se arma a partir de los equipos del contrato, con el ciclo de visitas y el técnico responsable.' },
      { icon: Wrench, title: 'Plan por máquina', desc: 'Un calendario y una lista de verificación individual por unidad, con la rutina adecuada en cada visita.' },
      { icon: Calendar, title: 'Visitas recurrentes', desc: 'El sistema programa las visitas de mantenimiento en el intervalo correcto, sin necesidad de recordar.' },
      { icon: CheckSquare, title: 'Lista de verificación por fase', desc: 'Cada visita del ciclo de 12 meses lleva la rutina de mantenimiento correspondiente.' },
      { icon: FileText, title: 'Informe de conformidad', desc: 'El registro de mantenimiento y el informe PDF listos para presentar en una auditoría.' },
      { icon: QrCode, title: 'Código QR en el equipo', desc: 'El técnico escanea y llega directo al historial de la máquina y a la próxima visita.' },
      { icon: FileSignature, title: 'Firma del técnico responsable', desc: 'El técnico responsable firma los documentos de mantenimiento, que llevan la identidad de tu empresa.' },
      { icon: ShieldCheck, title: 'Conformidad del mantenimiento programado', desc: 'Todo en calendario y documentado para tus sistemas de aire acondicionado.' },
    ],
    testimonialsHeading: 'El plan de mantenimiento dejó de ser una pesadilla',
    testimonials: [
      { quote: 'El plan de mantenimiento era hoja de cálculo sobre hoja de cálculo. Ahora el sistema arma el calendario y el informe por sí solo. Lo presenté en la auditoría sin sudar.', name: 'Roberta S.', role: 'Técnica Responsable', company: 'HVAC de edificios' },
      { quote: 'Un plan por máquina lo cambió todo. Cada unidad tiene su propio historial y su próxima visita ya programada.', name: 'Carlos M.', role: 'Gerente de Operaciones', company: 'refrigeración comercial' },
      { quote: 'El código QR en el equipo fue un acierto. El técnico apunta la cámara y ya está en el registro correcto.', name: 'André P.', role: 'Fundador', company: 'mantenimiento de aire acondicionado' },
    ],
    faq: [
      { q: '¿Qué es un plan de mantenimiento preventivo y por qué importa?', a: 'Un plan de mantenimiento preventivo es el programa documentado de mantenimiento programado para tus sistemas de aire acondicionado. Registra el mantenimiento preventivo, el técnico responsable y el historial de cada unidad, para que te mantengas en calendario y tengas la documentación lista siempre que un cliente o un auditor la pida.' },
      { q: '¿Dominex genera el plan de mantenimiento automáticamente?', a: 'Sí. El sistema arma el plan a partir de los equipos del contrato, reparte las visitas a lo largo del ciclo, arma la lista de verificación de cada visita y genera el registro y el informe de conformidad listos para una auditoría, sin hoja de cálculo aparte.' },
      { q: '¿El plan de mantenimiento es por unidad o por contrato?', a: 'Por unidad. Cada máquina tiene su propio calendario, lista de verificación e historial de visitas, con la rutina adecuada para cada fase del ciclo de 12 meses.' },
      { q: '¿Las visitas de mantenimiento se programan por sí solas?', a: 'Sí. Las visitas recurrentes se generan por el sistema en el intervalo correcto (mensual, trimestral, semestral), con la lista de verificación de la fase lista. El mantenimiento preventivo no depende de la memoria del equipo.' },
      { q: '¿Hay un código QR en el equipo?', a: 'Sí. Pegas un código QR en la máquina y el técnico, al escanearlo, llega directo al registro de esa unidad, con su historial y la próxima visita programada.' },
      { q: '¿El informe de mantenimiento sale con mi marca?', a: 'Sí. El registro de mantenimiento y el informe de conformidad salen como PDF con tu logo y colores, con la firma del técnico responsable, listos para entregar al cliente y a un auditor.' },
      { q: '¿Funciona tanto para refrigeración como para aire acondicionado?', a: 'Sí. Funciona para empresas de HVAC y refrigeración que dan mantenimiento a unidades split, multisplit, VRF, chiller, cámara frigorífica, fan coil y autocontenidas, con un plan e historial por unidad.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Registras los equipos, configuras el contrato y el plan de mantenimiento se genera automáticamente.' },
    ],
    finalCta: {
      title: 'Genera el plan de mantenimiento sin hoja de cálculo aparte',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Registra los equipos y ten el plan de mantenimiento listo para cualquier auditoría.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 3. CRM (record key = pt-br slug 'sistema-crm')
  // ────────────────────────────────────────────────────────────────────────
  'sistema-crm': {
    slug: 'crm-servicios-campo',
    metaTitle: 'CRM para empresas de servicios y mantenimiento | Dominex',
    metaDescription:
      'CRM para empresas de servicios y mantenimiento: capta leads, organiza tu embudo de ventas en un tablero kanban, asigna cada oportunidad a un vendedor y avanza de presupuesto a propuesta y contrato, con conversión directa en orden de trabajo. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'CRM y ventas',
      h1: 'CRM para empresas de servicios y mantenimiento',
      h1Highlight: 'CRM',
      subtitle:
        '¿Un lead llegó por WhatsApp y murió en tu bandeja de entrada? El CRM de Dominex organiza tu embudo de ventas en un tablero kanban, asigna cada oportunidad a un vendedor y la lleva del primer contacto a un contrato cerrado.',
    },
    metrics: [
      { value: 'Embudo', label: 'oportunidades organizadas en un tablero kanban' },
      { value: 'Lead a orden', label: 'del primer contacto al trabajo' },
      { value: 'Por vendedor', label: 'asignación y seguimiento individual' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que lo usan' },
    ],
    painsHeading: 'Un lead que no se convierte en venta es dinero que dejas sobre la mesa',
    painsSubheading: 'Donde la gestión se pierde en la improvisación, el CRM organiza la conversión',
    pains: [
      {
        pain: 'Llega un lead y nadie sabe quién lo está atendiendo',
        solution:
          'Cada oportunidad entra en el embudo y se asigna a un vendedor responsable. Ves quién la atiende, en qué etapa está y qué falta para cerrar.',
      },
      {
        pain: 'El embudo vive en la cabeza del vendedor, con cero visibilidad',
        solution:
          'El embudo kanban muestra cada oportunidad por etapa, del primer contacto al cierre. Ves todo el embudo y dónde se está estancando el negocio.',
      },
      {
        pain: 'Presupuesto, propuesta y contrato dispersos en archivos sueltos',
        solution:
          'Del lead sale el presupuesto, que se convierte en propuesta y contrato dentro del mismo flujo, atado a la oportunidad. Todo conectado, sin archivos perdidos en WhatsApp.',
      },
      {
        pain: 'Cerraste la venta, pero el trabajo empezó de cero',
        solution:
          'La oportunidad ganada se convierte en orden de trabajo con un clic, llevando los datos del cliente y lo que se vendió. Ventas y campo hablan el mismo idioma.',
      },
    ],
    deepDives: [
      {
        icon: Users,
        title: 'Un embudo de ventas kanban, del lead al contrato',
        body: 'Capta el lead, registra el contacto y mueve la oportunidad por las etapas del embudo arrastrándola en el tablero kanban: nueva, en contacto, presupuesto, propuesta, cierre. Cada tarjeta muestra el cliente, el valor estimado, el vendedor responsable y el historial de interacciones. Ves todo el embudo y actúas donde el negocio está atascado.',
        image: {
          src: '/modulos/crm/1.webp',
          alt: 'Equipo de ventas reunido en la oficina revisando el embudo con un gráfico de crecimiento',
        },
      },
      {
        icon: FileSignature,
        title: 'De presupuesto a propuesta y contrato en el mismo flujo',
        body: 'Desde la oportunidad armas el presupuesto con partidas, mano de obra y materiales, lo conviertes en propuesta enviada por enlace y lo cierras como contrato. Todo queda atado a la oportunidad del CRM, para que el vendedor siga la aprobación y nada se pierda entre el "déjame pensarlo" y el "trato hecho".',
        image: {
          src: '/modulos/crm/2.webp',
          alt: 'Profesionales revisando un contrato y una propuesta en la mesa de la oficina',
        },
      },
      {
        icon: TrendingUp,
        title: 'Conversión directa en orden de trabajo',
        body: 'Un negocio ganado no empieza de cero: la oportunidad se convierte en orden de trabajo con un clic, llevando el cliente, la dirección y el alcance vendido al campo. Ventas cierra el negocio y la operación ya tiene todo para ejecutar el trabajo, sin necesidad de reescribir nada.',
        image: {
          src: '/modulos/crm/3.webp',
          alt: 'Vendedor cerrando un negocio con un cliente tras firmar los documentos',
        },
      },
    ],
    featuresHeading: 'Del lead al contrato, sin perder una oportunidad',
    featuresSubheading: 'El CRM que habla el mismo idioma que tu operación de campo',
    features: [
      { icon: Users, title: 'Captación de leads', desc: 'Registra cada contacto entrante y no dejes morir una oportunidad en la bandeja de entrada.' },
      { icon: ClipboardList, title: 'Embudo kanban', desc: 'Mueve oportunidades por las etapas arrastrando, con el valor y el responsable a la vista.' },
      { icon: UserCircle, title: 'Asignar a un vendedor', desc: 'Cada oportunidad tiene un responsable y sigues el desempeño de cada vendedor.' },
      { icon: FileText, title: 'Presupuestos integrados', desc: 'Arma el presupuesto directo desde la oportunidad, con partidas y mano de obra.' },
      { icon: Send, title: 'Propuestas por enlace', desc: 'Envía la propuesta por enlace y ve cuándo el cliente la abre y la aprueba.' },
      { icon: FileSignature, title: 'Contratos en el flujo', desc: 'Cierra el negocio como contrato dentro del mismo recorrido del CRM.' },
      { icon: TrendingUp, title: 'Conversión en orden de trabajo', desc: 'La oportunidad ganada se convierte en orden de trabajo con un clic.' },
      { icon: BarChart3, title: 'Vista del embudo', desc: 'Sigue el embudo, la tasa de conversión y dónde se estanca el negocio.' },
    ],
    testimonialsHeading: 'Quien organizó el embudo cierra más',
    testimonials: [
      { quote: 'Los leads llegaban y se perdían en WhatsApp. Ahora cada oportunidad tiene un responsable y una etapa. Dejamos de dejar dinero sobre la mesa.', name: 'Juliana C.', role: 'Gerente de Ventas', company: 'empresa de servicios' },
      { quote: 'El presupuesto se convierte en propuesta y contrato sin cambiar de sistema. Y lo que se cierra ya se vuelve orden de trabajo.', name: 'Marcelo T.', role: 'Socio', company: 'mantenimiento de edificios' },
      { quote: 'Por primera vez veo todo el embudo. Sé dónde está cada negocio y qué falta para cerrar.', name: 'Patrícia L.', role: 'Directora', company: 'instalaciones y servicios' },
    ],
    faq: [
      { q: '¿Qué hace el CRM de Dominex?', a: 'Organiza tu operación de ventas: capta leads, arma el embudo de ventas en un tablero kanban, asigna cada oportunidad a un vendedor y la lleva de presupuesto a propuesta y contrato, con conversión directa en orden de trabajo.' },
      { q: '¿Cómo funciona el embudo de ventas?', a: 'El embudo es un kanban con etapas (nueva, en contacto, presupuesto, propuesta, cierre). Arrastras cada oportunidad a la etapa correcta y ves el cliente, el valor estimado y el responsable en cada tarjeta.' },
      { q: '¿Puedo asignar oportunidades a vendedores?', a: 'Sí. Cada oportunidad tiene un vendedor responsable y sigues el embudo y el desempeño de cada uno.' },
      { q: '¿El CRM se conecta con presupuestos y contratos?', a: 'Sí. Desde la oportunidad armas el presupuesto, lo conviertes en propuesta enviada por enlace y lo cierras como contrato, todo atado a la oportunidad, sin archivos sueltos.' },
      { q: 'Cuando cierro la venta, ¿tengo que volver a ingresar el cliente para la orden de trabajo?', a: 'No. La oportunidad ganada se convierte en orden de trabajo con un clic, llevando el cliente, la dirección y el alcance vendido. Ventas y campo trabajan con los mismos datos.' },
      { q: '¿Puedo seguir la tasa de conversión?', a: 'Sí. Sigues el embudo, ves cuántas oportunidades avanzan por etapa y detectas dónde suelen estancarse los negocios.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Agregas tus leads y empiezas a organizar el embudo de ventas de inmediato.' },
    ],
    finalCta: {
      title: 'Organiza tu embudo y cierra más',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Capta tus leads, organiza el embudo y ve del lead al contrato.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 4. Control financiero
  // ────────────────────────────────────────────────────────────────────────
  'controle-financeiro': {
    slug: 'software-financiero-servicios',
    metaTitle: 'Software financiero para empresas de servicios | Dominex',
    metaDescription:
      'Software de gestión financiera para empresas de servicios: cuentas por pagar y por cobrar, flujo de caja, estado de resultados, gestión de tarjeta de crédito y conciliación. Sabe cuánto entra, cuánto sale y cuánto queda. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Finanzas',
      h1: 'Software financiero para empresas de servicios',
      h1Highlight: 'Gestión financiera',
      subtitle:
        '¿No sabes si el mes cerró en positivo? Dominex organiza las cuentas por pagar y por cobrar, muestra el flujo de caja en tiempo real y cierra el estado de resultados, para que decidas con números, no a ojo.',
    },
    metrics: [
      { value: 'Por pagar/cobrar', label: 'cuentas organizadas con vencimientos' },
      { value: 'Flujo de caja', label: 'dinero que entra y sale en tiempo real' },
      { value: 'Estado de resultados', label: 'el resultado del mes cerrado automáticamente' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que lo usan' },
    ],
    painsHeading: 'Decidir por corazonada te cuesta la ganancia del mes',
    painsSubheading: 'Donde la hoja de cálculo no dice la verdad, Dominex muestra el número',
    pains: [
      {
        pain: '"¿Hay dinero suficiente para pagar esto?"',
        solution:
          'El flujo de caja muestra, en tiempo real, cuánto entró, cuánto va a salir y el saldo proyectado. Decides mirando el número, no del susto.',
      },
      {
        pain: 'Una factura olvidada se convierte en intereses y recargos',
        solution:
          'Las cuentas por pagar y por cobrar se organizan por vencimiento, con alertas de lo que está por vencer. Nada se te escapa.',
      },
      {
        pain: 'No sabes si el mes dio ganancia o pérdida',
        solution:
          'El estado de resultados se cierra automáticamente con ingresos, costos y gastos categorizados. Ves el resultado del mes sin armar una hoja de cálculo.',
      },
      {
        pain: 'La factura de la tarjeta mezclada con la caja y nadie entiende el saldo',
        solution:
          'La tarjeta de crédito tiene su propio tratamiento: el gasto entra como previsión y la factura agregada es la que se convierte en pago de verdad. El saldo deja de mentir.',
      },
    ],
    deepDives: [
      {
        icon: CalendarClock,
        title: 'Cuentas por pagar y por cobrar bajo control',
        body: 'Ingresa cada cuenta por pagar y por cobrar con su vencimiento, categoría y cliente o proveedor. El sistema las organiza por fecha, te avisa de lo que está por vencer y muestra lo que ya se liquidó. Dejas de pagar intereses por olvido y le cobras al cliente el día correcto.',
        image: {
          src: '/modulos/controle-financeiro/1.webp',
          alt: 'Manos usando una calculadora sobre un escritorio con documentos y carpetas, organizando cuentas por pagar y por cobrar',
        },
      },
      {
        icon: TrendingUp,
        title: 'Flujo de caja y estado de resultados en tiempo real',
        body: 'El flujo de caja consolida el dinero que entra y sale y proyecta el saldo de los próximos días. El estado de resultados cierra el mes con ingresos, costos y gastos categorizados, mostrando el margen real del negocio. Decides con los números en la mano, no por sensación.',
        image: {
          src: '/modulos/controle-financeiro/2.webp',
          alt: 'Profesional analizando gráficos e informes financieros, señalando los números con un lápiz',
        },
      },
      {
        icon: CreditCard,
        title: 'Tarjeta de crédito sin descuadrar tu caja',
        body: 'En Dominex el gasto de la tarjeta de crédito entra como previsión, y lo que realmente se convierte en pago es la factura agregada, para que el saldo de tu cuenta nunca aparezca más bajo de lo que realmente es. Sigues la factura total por tarjeta y concilias lo que se gastó de verdad, sin confundir un gasto con un pago.',
        image: {
          src: '/modulos/controle-financeiro/3.webp',
          alt: 'Persona haciendo un pago sin contacto con una tarjeta de crédito en un lector',
        },
      },
    ],
    featuresHeading: 'Las finanzas de tu empresa, organizadas',
    featuresSubheading: 'Sabe cuánto entra, cuánto sale y cuánto queda',
    features: [
      { icon: CalendarClock, title: 'Cuentas por pagar', desc: 'Vencimientos organizados, con alertas de lo que está por vencer.' },
      { icon: HandCoins, title: 'Cuentas por cobrar', desc: 'Sabe cuánto te debe cada cliente y cobra el día correcto.' },
      { icon: TrendingUp, title: 'Flujo de caja', desc: 'Dinero que entra, dinero que sale y el saldo proyectado en tiempo real.' },
      { icon: BarChart3, title: 'Estado de resultados automático', desc: 'El resultado del mes con ingresos, costos y gastos categorizados.' },
      { icon: CreditCard, title: 'Gestión de tarjeta', desc: 'Gasto previsto y factura agregada, sin descuadrar el saldo.' },
      { icon: Receipt, title: 'Categorías', desc: 'Clasifica cada movimiento y ve a dónde va el dinero.' },
      { icon: Landmark, title: 'Cuentas y bancos', desc: 'Sigue el saldo de cada una de las cuentas y cajas de la empresa.' },
      { icon: FileCheck2, title: 'Conciliación', desc: 'Cruza lo previsto con lo que realmente entró y salió.' },
    ],
    testimonialsHeading: 'Quien mide decide mejor',
    testimonials: [
      { quote: 'Antes cerraba el mes en pánico. Ahora veo el flujo de caja y el estado de resultados y sé si hubo ganancia antes que el contador.', name: 'Rafael G.', role: 'Socio', company: 'empresa de servicios' },
      { quote: 'Ya no se me escapa una factura. El sistema me avisa y dejé de pagar intereses por olvido.', name: 'Camila V.', role: 'Finanzas', company: 'mantenimiento e instalación' },
      { quote: 'La factura de la tarjeta me descuadraba el saldo. Ahora el gasto es previsión y la factura es lo que cuenta. Tiene sentido.', name: 'Lucas R.', role: 'Administrador', company: 'servicios de campo' },
    ],
    faq: [
      { q: '¿Qué hace la gestión financiera de Dominex?', a: 'Organiza las cuentas por pagar y por cobrar, muestra el flujo de caja en tiempo real, cierra el estado de resultados del mes, trata la tarjeta de crédito por separado y ayuda con la conciliación, para que decidas con números, no a ojo.' },
      { q: '¿Cómo funciona el flujo de caja?', a: 'El flujo de caja consolida todo el dinero que entra y sale y proyecta el saldo de los próximos días. Ves cuánto entró, cuánto va a salir y cuánto queda, en tiempo real.' },
      { q: '¿El sistema genera un estado de resultados?', a: 'Sí. El estado de resultados cierra el mes automáticamente con ingresos, costos y gastos categorizados, mostrando el margen real del negocio sin armar una hoja de cálculo.' },
      { q: '¿Cómo maneja Dominex la tarjeta de crédito?', a: 'El gasto de la tarjeta entra como previsión (no como pago), y lo que realmente se convierte en pago es la factura agregada. Así el saldo de tu cuenta nunca aparece más bajo de lo que realmente es.' },
      { q: '¿Puedo controlar cuentas por pagar y por cobrar con vencimientos?', a: 'Sí. Cada cuenta tiene un vencimiento, categoría y cliente o proveedor. El sistema las organiza por fecha y te avisa de lo que está por vencer.' },
      { q: '¿Puedo seguir el saldo de varias cuentas y cajas?', a: 'Sí. Sigues el saldo de cada caja y cuenta bancaria de la empresa y concilias lo previsto con lo que realmente entró y salió.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Ingresas tus cuentas y ves el flujo de caja y el resultado del mes de inmediato.' },
    ],
    finalCta: {
      title: 'Sabe si el mes cerró en positivo',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Organiza las cuentas, ve el flujo de caja y cierra el estado de resultados sin hoja de cálculo.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 5. Control horario y nómina (RRHH)
  // ────────────────────────────────────────────────────────────────────────
  'ponto-e-folha': {
    slug: 'software-control-horario-nomina',
    metaTitle: 'Control horario y nómina para equipos de campo | Dominex',
    metaDescription:
      'Control horario y nómina para equipos de campo: fichaje con selfi y geolocalización, un balance de horas extra, nómina, anticipos y gestión de empleados, todo en un solo lugar. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Control horario y nómina (RRHH)',
      h1: 'Control horario y nómina para equipos de campo',
      h1Highlight: 'Control horario y nómina',
      subtitle:
        'Tu equipo empieza el día en el cliente, no en la oficina, así que una tarjeta de fichaje en papel no sirve. Dominex ficha el horario con selfi y ubicación, calcula el balance de horas extra y cierra la nómina con los anticipos descontados.',
    },
    metrics: [
      { value: 'Selfi + GPS', label: 'horario fichado desde donde esté el técnico' },
      { value: 'Balance de horas', label: 'horas extra y ausencias calculadas solas' },
      { value: 'Nómina + anticipos', label: 'el mes cerrado por empleado' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que lo usan' },
    ],
    painsHeading: 'Controlar las horas de quien vive en la carretera es difícil',
    painsSubheading: 'Donde la tarjeta de fichaje en papel no llega, Dominex registra',
    pains: [
      {
        pain: 'El técnico empieza el día en el cliente y el horario queda sin registrar',
        solution:
          'El horario se ficha en el móvil, desde donde esté el empleado, con selfi y geolocalización. Sabes quién fichó, a qué hora y desde dónde.',
      },
      {
        pain: 'El balance de horas extra calculado a mano, siempre con errores',
        solution:
          'El sistema calcula horas trabajadas, horas extra y ausencias a partir de los fichajes. El balance de horas se cierra solo, sin hoja de cálculo.',
      },
      {
        pain: 'Un anticipo entregado sobre la marcha y olvidado al cierre de nómina',
        solution:
          'Cada anticipo se registra y se descuenta automáticamente del recibo. La nómina cierra con el neto correcto.',
      },
      {
        pain: 'Datos de los empleados dispersos en papeles y mensajes',
        solution:
          'La ficha del empleado centraliza salario, cargo, anticipos y extracto. Ves la imagen financiera de cada persona en un solo lugar.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'Ficha con selfi y geolocalización',
        body: 'El empleado ficha la entrada, la salida y las pausas en su móvil, desde donde esté. Cada fichaje guarda un selfi y la ubicación, para que puedas probar quién fichó y desde dónde, ideal para equipos que empiezan el día directo en el cliente sin pasar por la empresa.',
        image: {
          src: '/modulos/ponto-e-folha/1.webp',
          alt: 'Trabajador de campo con equipo de seguridad consultando un móvil en una obra',
        },
      },
      {
        icon: Clock,
        title: 'El balance de horas extra calculado solo',
        body: 'A partir de los fichajes, el sistema calcula horas trabajadas, horas extra y ausencias, manteniendo el balance de horas al día. Al final del mes tienes el balance de cada empleado listo, sin sumar nada a mano ni pelear con una hoja de cálculo.',
        image: {
          src: '/modulos/ponto-e-folha/2.webp',
          alt: 'Gerente sentado en un escritorio revisando información en una carpeta en la oficina',
        },
      },
      {
        icon: Banknote,
        title: 'Nómina con los anticipos descontados',
        body: 'El cierre de nómina consolida salario, el balance de horas extra y los anticipos que el empleado tomó durante el mes, descontándolos automáticamente del neto. El recibo de pago y el comprobante del anticipo salen listos, y el extracto del empleado muestra cada movimiento de entrada y salida con el signo correcto.',
        image: {
          src: '/modulos/ponto-e-folha/3.webp',
          alt: 'Mujer contando efectivo en la oficina, cerrando la nómina',
        },
      },
    ],
    featuresHeading: 'El RRHH de tu operación de campo, en un solo lugar',
    featuresSubheading: 'Del fichaje en la carretera al cierre de nómina',
    features: [
      { icon: Smartphone, title: 'Fichaje por móvil', desc: 'Ficha entrada, salida y pausas desde donde esté el empleado.' },
      { icon: Camera, title: 'Selfi en el fichaje', desc: 'Cada fichaje guarda un selfi, probando quién fichó.' },
      { icon: MapPin, title: 'Geolocalización', desc: 'La ubicación del fichaje se registra con el movimiento.' },
      { icon: Clock, title: 'Balance de horas extra', desc: 'Horas extra y ausencias calculadas a partir de los fichajes, sin hoja de cálculo.' },
      { icon: Banknote, title: 'Nómina', desc: 'Cierra por empleado con el recibo de pago listo.' },
      { icon: HandCoins, title: 'Anticipos descontados', desc: 'Cada anticipo registrado se descuenta del recibo.' },
      { icon: Users, title: 'Fichas de empleados', desc: 'Salario, cargo, anticipos y extracto centralizados por persona.' },
      { icon: FileText, title: 'Extracto del empleado', desc: 'Movimientos de entrada y salida en tarjetas, con el signo correcto en cada uno.' },
    ],
    testimonialsHeading: 'Quien controla las horas cierra la nómina en paz',
    testimonials: [
      { quote: 'Mi equipo empieza el día en el cliente. Con el fichaje con selfi y GPS, sé quién empezó y desde dónde, sin papel.', name: 'Diego F.', role: 'Gerente', company: 'servicios de campo' },
      { quote: 'El balance de horas extra era un dolor de cabeza mensual. Ahora se cierra solo a partir de los fichajes.', name: 'Aline R.', role: 'RRHH', company: 'mantenimiento de edificios' },
      { quote: 'Antes entregábamos anticipos y los olvidábamos al cierre. Ahora se descuentan automáticamente en la nómina. El neto sale correcto.', name: 'Thiago P.', role: 'Administrador', company: 'instalaciones eléctricas' },
    ],
    faq: [
      { q: '¿Cómo funciona el fichaje de Dominex?', a: 'El empleado ficha entrada, salida y pausas en su móvil, desde donde esté, con selfi y geolocalización en cada movimiento. Ideal para equipos de campo que empiezan el día directo en el cliente.' },
      { q: '¿El fichaje prueba quién fichó y desde dónde?', a: 'Sí. Cada movimiento guarda un selfi del empleado y la ubicación, dando prueba de quién fichó y dónde.' },
      { q: '¿El balance de horas extra se calcula automáticamente?', a: 'Sí. A partir de los fichajes, el sistema calcula horas trabajadas, horas extra y ausencias, manteniendo el balance de horas al día sin hoja de cálculo.' },
      { q: '¿Puedo cerrar la nómina en el sistema?', a: 'Sí. El cierre consolida salario, el balance de horas extra y los anticipos, descontando los anticipos automáticamente. El recibo de pago sale listo.' },
      { q: '¿Cómo funcionan los anticipos?', a: 'Cada anticipo se registra y se descuenta automáticamente del recibo. El extracto del empleado muestra cada movimiento de entrada y salida con el signo correcto.' },
      { q: '¿Dónde se guardan los datos de los empleados?', a: 'En la ficha del empleado, que centraliza salario, cargo, anticipos y extracto. Ves la imagen financiera de cada persona en un solo lugar.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Registras al equipo y empiezas a fichar el horario y cerrar la nómina de inmediato.' },
    ],
    finalCta: {
      title: 'Controla las horas de quien vive en la carretera',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Ficha el horario con selfi y ubicación y cierra la nómina sin hoja de cálculo.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 6. Facturación de servicios electrónica
  // ────────────────────────────────────────────────────────────────────────
  'emissao-de-nfse': {
    slug: 'software-facturacion-servicios',
    metaTitle: 'Software de facturación de servicios para empresas de servicios | Dominex',
    metaDescription:
      'Software de facturación de servicios electrónica para empresas de servicios: emite la factura de servicio por cliente directo desde la plataforma, con los datos del cliente cargados automáticamente. Sin software de facturación aparte. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Facturación de servicios',
      h1: 'Software de facturación de servicios para empresas de servicios',
      h1Highlight: 'facturación de servicios',
      subtitle:
        '¿Hiciste el trabajo y encima tienes que abrir otro sistema para emitir la factura? Dominex emite la factura de servicio electrónica por cliente, sin salir de la plataforma donde ya trabajas.',
    },
    metrics: [
      { value: 'Facturación', label: 'la factura de servicio emitida en la plataforma' },
      { value: 'Por cliente', label: 'emisión atada a la ficha del cliente' },
      { value: 'Integrada', label: 'facturación donde gestionas la operación' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que lo usan' },
    ],
    painsHeading: 'La factura no puede ser un sistema aparte',
    painsSubheading: 'Donde el emisor independiente estorba, Dominex integra',
    pains: [
      {
        pain: 'Emitir facturas en otro sistema, con otro usuario y contraseña',
        solution:
          'La factura de servicio se emite dentro de Dominex, por cliente, sin abrir un emisor aparte ni reescribir datos. Menos cambio de pantallas, menos errores.',
      },
      {
        pain: 'Datos del cliente escritos otra vez solo para la factura',
        solution:
          'La emisión carga los datos de la ficha del cliente que ya tienes en la plataforma. Seleccionas el cliente y emites.',
      },
      {
        pain: 'Facturación dispersa en herramientas que no hablan con tu operación',
        solution:
          'La facturación vive en la misma plataforma que tus clientes y servicios, así que lo que facturas siempre coincide con el trabajo que entregaste.',
      },
      {
        pain: 'Factura emitida y perdida, sin control de lo que se facturó',
        solution:
          'Las facturas quedan registradas y organizadas por cliente, con lo que ya se emitió. Sigues la facturación sin escarbar en el correo.',
      },
    ],
    deepDives: [
      {
        icon: FileText,
        title: 'La factura emitida sin salir de la plataforma',
        body: 'La factura de servicio electrónica se emite desde dentro de Dominex, en la misma plataforma donde gestionas clientes y servicios. Seleccionas el cliente, revisas los datos que ya están en la ficha y emites, sin emisor independiente, sin otro usuario y sin reescribir nada.',
        image: {
          src: '/modulos/emissao-de-nfse/1.webp',
          alt: 'Persona organizando documentos y usando una laptop en un escritorio de oficina',
        },
      },
      {
        icon: Building2,
        title: 'Facturación que coincide con el trabajo que entregaste',
        body: 'Como la factura se emite desde la misma ficha que tus clientes y órdenes de trabajo, lo que facturas siempre se alinea con el servicio que entregaste. Seleccionas el cliente, confirmas los importes y emites, manteniendo la facturación y la operación perfectamente en sincronía.',
        image: {
          src: '/modulos/emissao-de-nfse/2.webp',
          alt: 'Profesional revisando documentos y formularios de facturación en un escritorio de madera',
        },
      },
      {
        icon: Receipt,
        title: 'Emisión por cliente, con un historial organizado',
        body: 'Cada factura se emite desde la ficha del cliente y queda en el historial, organizada por a quién se facturó. Sigues lo que ya se emitió, evitas facturas duplicadas y mantienes el control de tu facturación sin depender de una hoja de cálculo o tu bandeja de entrada.',
        image: {
          src: '/modulos/emissao-de-nfse/3.webp',
          alt: 'Persona manejando y organizando recibos y facturas en papel, manteniendo el historial en orden',
        },
      },
    ],
    featuresHeading: 'Facturación de servicios, sin sistema aparte',
    featuresSubheading: 'La factura donde ya gestionas la operación',
    features: [
      { icon: FileText, title: 'Emisión de facturas', desc: 'Emite la factura de servicio directo en la plataforma, sin emisor independiente.' },
      { icon: UserCircle, title: 'Emisión por cliente', desc: 'La factura carga los datos de la ficha del cliente que ya tienes.' },
      { icon: Building2, title: 'Facturación integrada', desc: 'La facturación vive en la misma plataforma que tus clientes y servicios.' },
      { icon: CheckSquare, title: 'Revisión de datos', desc: 'Antes de emitir, el sistema confirma los importes y los datos del cliente.' },
      { icon: Receipt, title: 'Historial por cliente', desc: 'Sigue las facturas emitidas, organizadas por a quién se facturó.' },
      { icon: ShieldCheck, title: 'Estándar consistente', desc: 'Apego a un estándar consistente para cada factura de servicio que emites.' },
      { icon: BarChart3, title: 'Control de facturación', desc: 'Ve lo que ya se emitió y mantén la facturación bajo control.' },
      { icon: FileCheck2, title: 'Documento listo', desc: 'La factura emitida queda disponible para enviar al cliente.' },
    ],
    testimonialsHeading: 'Quien integró la factura ahorró tiempo',
    testimonials: [
      { quote: 'Antes emitía la factura en otro sistema, con otro usuario. Ahora la emito directo en Dominex, desde la ficha del cliente.', name: 'Rodrigo A.', role: 'Socio', company: 'empresa de servicios' },
      { quote: 'Dejé de reescribir datos del cliente solo para la factura. Selecciono el cliente y emito la factura.', name: 'Fábio M.', role: 'Administrador', company: 'mantenimiento e instalación' },
      { quote: 'Tener la facturación en la misma plataforma que los trabajos hace que lo que facturo siempre coincida con lo que entregué.', name: 'Bruno S.', role: 'Propietario', company: 'servicios de campo' },
    ],
    faq: [
      { q: '¿Qué es la facturación de servicios electrónica?', a: 'Es la emisión digital de la factura de servicio, el documento de facturación para prestadores de servicios. Dominex emite la factura de servicio electrónica, orientada a empresas de servicios, directo desde la plataforma donde ya gestionas clientes y trabajos.' },
      { q: '¿Necesito otro sistema para emitir la factura?', a: 'No. La factura se emite desde dentro de Dominex, por cliente, sin abrir un emisor independiente ni usar otro usuario. Seleccionas el cliente y emites en la misma plataforma donde ya trabajas.' },
      { q: '¿La facturación queda en sincronía con mis trabajos?', a: 'Sí. Como la factura se emite desde la misma ficha que tus clientes y órdenes de trabajo, lo que facturas siempre se alinea con el servicio que entregaste, sin doble captura.' },
      { q: '¿La factura carga los datos del cliente automáticamente?', a: 'Sí. La emisión usa los datos de la ficha del cliente que ya tienes en la plataforma, sin reescribir nada.' },
      { q: '¿Puedo seguir las facturas que he emitido?', a: 'Sí. Las facturas quedan registradas y organizadas por cliente, con un historial de lo que ya se emitió, ayudándote a controlar la facturación y evitar duplicados.' },
      { q: '¿Puedo enviar la factura al cliente?', a: 'Sí. Una vez emitida, la factura queda disponible en la ficha del cliente y lista para enviar, para que el cliente reciba el documento de facturación sin ningún retrabajo manual.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Activas el módulo de facturación y emites la factura de servicio desde la ficha del cliente.' },
    ],
    finalCta: {
      title: 'Emite la factura de servicio donde ya trabajas',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Emite la factura de servicio por cliente, sin sistema aparte.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 7. Portal del cliente
  // ────────────────────────────────────────────────────────────────────────
  'portal-do-cliente': {
    slug: 'portal-del-cliente',
    metaTitle: 'Portal del cliente para empresas de servicios | Dominex',
    metaDescription:
      'Portal del cliente para empresas de servicios: tu cliente sigue la orden de trabajo, ve el historial de servicios, accede a los documentos y aprueba el presupuesto por enlace, sin tener que llamar a la oficina. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Portal del cliente',
      h1: 'Portal del cliente para empresas de servicios',
      h1Highlight: 'Portal del cliente',
      subtitle:
        '¿Tu cliente llama cada hora para preguntar si el técnico ya llegó? Con el Portal del cliente, sigue la orden de trabajo, ve el historial, accede a los documentos y aprueba el presupuesto por enlace, por su cuenta.',
    },
    metrics: [
      { value: 'Por enlace', label: 'el cliente accede sin instalar nada' },
      { value: 'Sigue la orden', label: 'estado e historial en tiempo real' },
      { value: 'Aprueba el presupuesto', label: 'sin llamada, sin correo perdido' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que lo usan' },
    ],
    painsHeading: 'El teléfono suena todo el día con la misma pregunta',
    painsSubheading: 'Donde el cliente tiene que llamar para enterarse, el portal muestra solo',
    pains: [
      {
        pain: '"¿Ya fue el técnico? ¿Está arreglado?"',
        solution:
          'El cliente abre el portal por enlace y ve el estado de la orden en tiempo real, programada, en ejecución, finalizada. El teléfono deja de sonar por lo mismo.',
      },
      {
        pain: 'El cliente pide el historial de servicios y nadie lo encuentra',
        solution:
          'El portal muestra el historial completo de órdenes del cliente, con fechas y lo que se hizo. Lo consulta por su cuenta, sin contactar a la oficina.',
      },
      {
        pain: 'Un presupuesto aprobado por un mensaje que se pierde en WhatsApp',
        solution:
          'El cliente aprueba el presupuesto directo en el portal, con registro de cuándo aprobó. Sin "reenvíamelo", sin aprobación que se pierde.',
      },
      {
        pain: 'Informes y documentos enviados y perdidos en el correo',
        solution:
          'Los informes de órdenes y documentos quedan disponibles en el portal para que el cliente acceda en cualquier momento, sin reenvíos.',
      },
    ],
    deepDives: [
      {
        icon: Eye,
        title: 'El cliente sigue la orden de trabajo por su cuenta',
        body: 'A través del Portal del cliente, accedido por un enlace (sin app que instalar), el cliente ve en qué punto está la orden: programada, técnico en camino, en ejecución, finalizada. Sigue el trabajo en tiempo real y deja de llamar a la oficina cada hora, dándole a tu equipo la calma que necesita para trabajar.',
        image: {
          src: '/modulos/portal-do-cliente/1.webp',
          alt: 'Cliente sonriendo mientras sigue el servicio en un móvil en casa',
        },
      },
      {
        icon: BookOpen,
        title: 'Historial y documentos siempre a mano',
        body: 'El historial completo de servicios del cliente vive en el portal: órdenes pasadas, fechas, lo que se hizo y los informes PDF. Los documentos quedan disponibles para consulta en cualquier momento, así el cliente nunca tiene que pedir "reenvíame ese informe", está todo ahí.',
        image: {
          src: '/modulos/portal-do-cliente/2.webp',
          alt: 'Manos revisando documentos impresos junto a una laptop en el escritorio',
        },
      },
      {
        icon: CheckSquare,
        title: 'Aprobación del presupuesto por enlace',
        body: 'El presupuesto llega al cliente por enlace y lo aprueba directo en el portal, con registro de cuándo aprobó. La aprobación no se pierde en WhatsApp ni en el correo, y lo aprobado pasa a convertirse en orden de trabajo, cerrando el círculo de ventas a ejecución sin fricción.',
        image: {
          src: '/modulos/portal-do-cliente/3.webp',
          alt: 'Hombre sonriendo mientras aprueba algo en una laptop',
        },
      },
    ],
    featuresHeading: 'Autonomía para el cliente, calma para ti',
    featuresSubheading: 'El cliente resuelve por su cuenta lo que hoy se convierte en una llamada',
    features: [
      { icon: Eye, title: 'Seguimiento de la orden', desc: 'El cliente ve el estado de la orden en tiempo real.' },
      { icon: BookOpen, title: 'Historial de servicios', desc: 'Todas las órdenes pasadas, con fechas y lo que se hizo.' },
      { icon: FileText, title: 'Acceso a documentos', desc: 'Informes y documentos disponibles para consulta en cualquier momento.' },
      { icon: CheckSquare, title: 'Aprobación de presupuesto', desc: 'El cliente aprueba el presupuesto por enlace, con registro.' },
      { icon: Send, title: 'Acceso por enlace', desc: 'Sin app que instalar: el cliente entra por un enlace.' },
      { icon: UserCircle, title: 'La identidad de tu empresa', desc: 'El portal puede llevar tu logo y colores, en el plan White Label.' },
      { icon: BarChart3, title: 'Menos llamadas', desc: 'El cliente consulta por su cuenta lo que hoy se vuelve una llamada.' },
      { icon: ShieldCheck, title: 'Cada uno ve solo lo suyo', desc: 'El cliente accede solo a sus propios trabajos y documentos.' },
    ],
    testimonialsHeading: 'Quien abrió el portal dejó de recibir la misma llamada',
    testimonials: [
      { quote: 'El cliente llamaba todo el día para preguntar si el técnico venía. Ahora lo siguen en el portal y trabajamos en paz.', name: 'Juliana C.', role: 'Atención al Cliente', company: 'empresa de servicios' },
      { quote: 'Las aprobaciones de presupuesto se esfumaban en WhatsApp. En el portal, aprueban y queda registrado.', name: 'Marcelo T.', role: 'Socio', company: 'mantenimiento de edificios' },
      { quote: 'El historial de servicios en el portal le dio autonomía al cliente. Lo consultan sin necesitarnos.', name: 'Patrícia L.', role: 'Gerente', company: 'instalaciones y servicios' },
    ],
    faq: [
      { q: '¿Qué es el Portal del cliente?', a: 'Es un área donde tu cliente sigue las órdenes de trabajo, ve el historial de servicios, accede a los documentos y aprueba presupuestos, por su cuenta, sin llamar a la oficina.' },
      { q: '¿El cliente necesita instalar una app?', a: 'No. El acceso es por enlace: el cliente lo abre en el navegador y ve el estado de la orden, el historial y los documentos.' },
      { q: '¿El cliente puede seguir la orden de trabajo en tiempo real?', a: 'Sí. Ve el estado de la orden (programada, en ejecución, finalizada) en tiempo real, lo que reduce drásticamente las llamadas a la oficina.' },
      { q: '¿El cliente puede aprobar un presupuesto a través del portal?', a: 'Sí. El presupuesto llega por enlace y el cliente lo aprueba directo en el portal, con registro de cuándo aprobó. La aprobación no se pierde en WhatsApp.' },
      { q: '¿El cliente ve el historial de servicios y los documentos?', a: 'Sí. El historial completo de órdenes, con fechas y lo que se hizo, más informes y documentos, queda disponible en el portal para consulta en cualquier momento.' },
      { q: '¿Cada cliente ve solo sus propios datos?', a: 'Sí. En el portal, cada cliente accede solo a sus propios trabajos y documentos.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Activas el portal y compartes el enlace con tus clientes.' },
    ],
    finalCta: {
      title: 'Dale autonomía al cliente y calma a tu equipo',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Deja que el cliente siga la orden de trabajo y apruebe el presupuesto por su cuenta.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 8. Gestión de inventario
  // ────────────────────────────────────────────────────────────────────────
  'controle-de-estoque': {
    slug: 'software-gestion-inventario',
    metaTitle: 'Software de gestión de inventario para equipos de campo | Dominex',
    metaDescription:
      'Software de gestión de inventario para equipos de campo: registra piezas y materiales, registra entradas y salidas de stock, descuenta automáticamente por orden de trabajo y realiza inventarios físicos. Sabe qué tienes, qué salió y en qué orden. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Inventario',
      h1: 'Software de gestión de inventario para equipos de campo',
      h1Highlight: 'Gestión de inventario',
      subtitle:
        '¿La pieza se acabó justo cuando el trabajo la necesitaba y nadie lo notó? Dominex controla piezas y materiales, descuenta automáticamente en cada orden de trabajo y muestra lo que realmente tienes en stock.',
    },
    metrics: [
      { value: 'Entrada/salida', label: 'movimientos de piezas bajo control' },
      { value: 'Descuento por orden', label: 'consumo registrado en la orden de trabajo' },
      { value: 'Inventario físico', label: 'el saldo real verificado cuando quieras' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que lo usan' },
    ],
    painsHeading: 'El stock a ciegas detiene el trabajo',
    painsSubheading: 'Donde la pieza desaparece sin registro, Dominex la descuenta bien',
    pains: [
      {
        pain: 'El técnico llega al cliente y la pieza estaba agotada',
        solution:
          'El saldo de cada pieza se mantiene al día con cada entrada y salida de stock. Sabes qué tienes antes de enviar al técnico, sin sorpresas en el trabajo.',
      },
      {
        pain: 'Material usado en la orden y nadie lo descontó',
        solution:
          'El consumo se registra en la propia orden de trabajo y el stock se descuenta automáticamente. Sabes qué salió y en qué trabajo.',
      },
      {
        pain: 'No sabes cuánto material usó cada trabajo',
        solution:
          'Como el descuento está atado a la orden de trabajo, puedes ver el costo de material por trabajo. El presupuesto del próximo trabajo se vuelve más preciso.',
      },
      {
        pain: 'Solo descubres el faltante después de que la pieza se acaba',
        solution:
          'Haz un inventario físico cuando quieras y ajusta el saldo real. El sistema muestra la discrepancia y mantiene el stock confiable.',
      },
    ],
    deepDives: [
      {
        icon: Package,
        title: 'Piezas y materiales con un saldo siempre al día',
        body: 'Registra cada pieza y material con un código, unidad y cantidad. Cada entrada de stock (compra, reposición) y cada salida (uso, pérdida) actualiza el saldo al instante. Consultas el stock y ves lo que realmente tienes, evitando enviar al técnico a un trabajo sin la pieza que necesita.',
        image: {
          src: '/modulos/controle-de-estoque/1.webp',
          alt: 'Estanterías etiquetadas con divisores numerados en un almacén',
        },
      },
      {
        icon: PackageMinus,
        title: 'Descuento automático por orden de trabajo',
        body: 'El material usado en el trabajo se registra en la propia orden de trabajo y el stock se descuenta solo. Esto ata el consumo a la orden: sabes qué salió, en qué trabajo y para qué cliente, e incluso puedes ver el costo de material por trabajo, haciendo los próximos presupuestos más precisos.',
        image: {
          src: '/modulos/controle-de-estoque/2.webp',
          alt: 'Operario de almacén registrando artículos con un escáner y una tablet',
        },
      },
      {
        icon: ClipboardList,
        title: 'Inventarios físicos para mantener el saldo confiable',
        body: 'Cuando lo necesites, haz un inventario físico: contrasta el conteo físico con el saldo del sistema y ajusta la discrepancia. El stock vuelve a reflejar la realidad, y detectas un faltante o pérdida antes de que altere el próximo trabajo, no después de que la pieza se acabó en el cliente.',
        image: {
          src: '/modulos/controle-de-estoque/3.webp',
          alt: 'Operario de almacén verificando el inventario físico con una tablet',
        },
      },
    ],
    featuresHeading: 'El stock que habla con el campo',
    featuresSubheading: 'Sabe qué tienes, qué salió y en qué orden de trabajo',
    features: [
      { icon: Package, title: 'Registro de piezas', desc: 'Piezas y materiales con un código, unidad y cantidad.' },
      { icon: TrendingUp, title: 'Entrada de stock', desc: 'Registra compras y reposiciones y actualiza el saldo al instante.' },
      { icon: PackageMinus, title: 'Salida de stock', desc: 'Registra uso y pérdida, con el saldo siempre correcto.' },
      { icon: ClipboardList, title: 'Descuento por orden', desc: 'El consumo se registra en la orden de trabajo y se descuenta automáticamente.' },
      { icon: Receipt, title: 'Costo de material por orden', desc: 'Ve cuánto material consumió cada trabajo.' },
      { icon: CheckSquare, title: 'Inventario físico', desc: 'Verifica el conteo físico y ajusta la discrepancia cuando quieras.' },
      { icon: ShieldCheck, title: 'Saldo confiable', desc: 'El stock refleja la realidad, sin faltantes ocultos.' },
      { icon: BarChart3, title: 'Lo que se está agotando', desc: 'Ve las piezas con saldo bajo antes de que se acaben.' },
    ],
    testimonialsHeading: 'Quien controló el stock dejó de perder trabajos',
    testimonials: [
      { quote: 'El técnico llegaba al cliente y la pieza se había acabado. Ahora el saldo es correcto y reponemos antes de que baje.', name: 'Rafael G.', role: 'Socio', company: 'mantenimiento e instalación' },
      { quote: 'El material salía y nadie lo descontaba. Ahora se descuenta en la orden de trabajo, automáticamente. Sé qué salió y en qué trabajo.', name: 'Camila V.', role: 'Almacén', company: 'servicios de campo' },
      { quote: 'Como el descuento está en la orden de trabajo, puedo ver el costo de material por trabajo. El presupuesto se volvió más preciso.', name: 'Lucas R.', role: 'Gerente', company: 'empresa de servicios' },
    ],
    faq: [
      { q: '¿Qué hace la gestión de inventario de Dominex?', a: 'Registra piezas y materiales, registra entradas y salidas de stock, descuenta automáticamente por orden de trabajo y permite inventarios físicos, para que sepas qué tienes, qué salió y en qué trabajo.' },
      { q: '¿El descuento de stock ocurre automáticamente?', a: 'Sí. El material usado se registra en la propia orden de trabajo y el stock se descuenta solo, atando el consumo a la orden y al cliente.' },
      { q: '¿Puedo saber el costo de material por trabajo?', a: 'Sí. Como el descuento está atado a la orden de trabajo, puedes ver cuánto material consumió cada trabajo, haciendo los próximos presupuestos más precisos.' },
      { q: '¿Cómo funciona el inventario físico?', a: 'Haces el conteo físico cuando quieras, lo comparas con el saldo del sistema y ajustas la discrepancia. El stock vuelve a reflejar la realidad.' },
      { q: '¿El saldo se actualiza en tiempo real?', a: 'Sí. Cada entrada y salida de stock actualiza el saldo al instante, así consultas el stock y ves lo que realmente tienes.' },
      { q: '¿Puedo ver las piezas que se están agotando?', a: 'Sí. Ves las piezas con saldo bajo y repones antes de que se acaben en el trabajo.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Registras tus piezas y empiezas a controlar entradas, salidas y descuentos por orden de trabajo.' },
    ],
    finalCta: {
      title: 'Deja de perder trabajos por falta de una pieza',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Controla tu stock y descuenta automáticamente en cada orden de trabajo.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 9. Presupuestos y contratos
  // ────────────────────────────────────────────────────────────────────────
  'orcamentos-e-contratos': {
    slug: 'software-presupuestos-contratos',
    metaTitle: 'Software de presupuestos y contratos para empresas de servicios | Dominex',
    metaDescription:
      'Software de presupuestos y contratos para empresas de servicios: crea presupuestos profesionales, envíalos como propuesta por enlace, cierra contratos recurrentes que generan órdenes de trabajo solos y convierte la aprobación en orden de trabajo. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Presupuestos y contratos',
      h1: 'Software de presupuestos y contratos para empresas de servicios',
      h1Highlight: 'Presupuestos y contratos',
      subtitle:
        '¿Presupuestos hechos de memoria y contratos olvidados hasta que el cliente se queja? Dominex crea presupuestos profesionales, los convierte en propuesta por enlace y cierra contratos recurrentes que generan las órdenes de trabajo solos.',
    },
    metrics: [
      { value: 'Propuesta por enlace', label: 'el cliente aprueba desde cualquier lugar' },
      { value: 'Recurrente', label: 'un contrato que genera las órdenes de trabajo solo' },
      { value: 'Aprobado a orden', label: 'el presupuesto se convierte en orden de trabajo' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que lo usan' },
    ],
    painsHeading: 'Presupuestos y contratos improvisados frenan tus ingresos',
    painsSubheading: 'Donde no hay estándar, Dominex lo vuelve profesional y automático',
    pains: [
      {
        pain: 'Un presupuesto hecho de memoria, sin estándar y sin rastro',
        solution:
          'Crea presupuestos con partidas, mano de obra y materiales en una plantilla profesional con tu marca. Cada presupuesto queda registrado y vinculado al cliente.',
      },
      {
        pain: 'Una propuesta enviada por mensaje y aprobada con un "ok" que desaparece',
        solution:
          'La propuesta va por enlace y el cliente aprueba con registro de cuándo aprobó. Ves quién la abrió y quién cerró.',
      },
      {
        pain: 'Un contrato de mantenimiento preventivo olvidado hasta que el cliente pregunta',
        solution:
          'Los contratos recurrentes (mensual, trimestral) generan las órdenes de trabajo solos en el intervalo correcto. Nunca más incumples un SLA por olvido.',
      },
      {
        pain: 'Cerraste el trabajo y todo empezó de cero',
        solution:
          'El presupuesto aprobado se convierte en orden de trabajo con un clic, llevando el alcance al campo. Ventas y operaciones trabajan con los mismos datos.',
      },
    ],
    deepDives: [
      {
        icon: FileText,
        title: 'Un presupuesto profesional con tu marca',
        body: 'Crea el presupuesto con partidas, mano de obra y materiales, organizado en un documento con tu logo y colores. El presupuesto queda vinculado al cliente y a la oportunidad, con el valor calculado, las condiciones y la validez. Proyectas una imagen profesional y dejas de perder ventas por presupuestos hechos sobre la marcha.',
        image: {
          src: '/modulos/orcamentos-e-contratos/1.webp',
          alt: 'Profesional escribiendo y armando un presupuesto en un escritorio',
        },
      },
      {
        icon: Send,
        title: 'Propuesta por enlace, aprobación registrada',
        body: 'El presupuesto se convierte en propuesta enviada por enlace: el cliente la abre en su móvil, la revisa y aprueba, con registro de cuándo aprobó. Sigues el estado (enviada, vista, aprobada) y dejas de depender del "ok" en WhatsApp que desaparece. La aprobación queda documentada, lista para convertirse en contrato u orden de trabajo.',
        image: {
          src: '/modulos/orcamentos-e-contratos/2.webp',
          alt: 'Persona sonriendo mientras aprueba una propuesta en un móvil',
        },
      },
      {
        icon: Repeat,
        title: 'Contratos recurrentes que generan las órdenes de trabajo solos',
        body: 'Para mantenimiento preventivo y servicio periódico, registra el contrato con la recurrencia correcta (mensual, bimestral, trimestral). Dominex genera las órdenes de trabajo automáticamente en el intervalo acordado, ya con el alcance del contrato. Los ingresos recurrentes fluyen sin depender de la memoria de nadie y ningún SLA se incumple.',
        image: {
          src: '/modulos/orcamentos-e-contratos/3.webp',
          alt: 'Mano firmando un contrato con un bolígrafo en un escritorio de madera',
        },
      },
    ],
    featuresHeading: 'Del presupuesto al contrato, sin perder una venta',
    featuresSubheading: 'Vuelve profesional la propuesta y automatiza la recurrencia',
    features: [
      { icon: FileText, title: 'Presupuestos profesionales', desc: 'Partidas, mano de obra y materiales en un documento con tu marca.' },
      { icon: Send, title: 'Propuesta por enlace', desc: 'Envía por enlace y ve cuándo el cliente la abre y la aprueba.' },
      { icon: CheckSquare, title: 'Aprobación registrada', desc: 'La aprobación del cliente queda documentada, con fecha.' },
      { icon: FileSignature, title: 'Contratos', desc: 'Cierra el negocio como contrato vinculado al cliente.' },
      { icon: Repeat, title: 'Recurrencia automática', desc: 'Contratos que generan las órdenes de trabajo solos en el intervalo correcto.' },
      { icon: TrendingUp, title: 'Conversión en orden de trabajo', desc: 'El presupuesto aprobado se convierte en orden de trabajo con un clic.' },
      { icon: UserCircle, title: 'Vinculado al cliente', desc: 'Cada presupuesto y contrato queda en el historial del cliente.' },
      { icon: BarChart3, title: 'Seguimiento', desc: 'Ve propuestas enviadas, vistas y aprobadas en un solo panel.' },
    ],
    testimonialsHeading: 'Quien estandarizó la propuesta cierra más',
    testimonials: [
      { quote: 'Mi presupuesto era un texto en WhatsApp. Ahora es un documento con mi marca, y el cliente aprueba por enlace.', name: 'Diego F.', role: 'Socio', company: 'instalaciones y servicios' },
      { quote: 'El contrato preventivo generaba órdenes de memoria. Ahora el sistema las genera solo en el intervalo correcto. Se acabaron los SLA incumplidos.', name: 'Aline R.', role: 'Coordinadora', company: 'mantenimiento de edificios' },
      { quote: 'Aprobaron la propuesta, se convirtió en orden de trabajo con un clic. El campo ya recibe el alcance listo.', name: 'Thiago P.', role: 'Gerente', company: 'servicios de campo' },
    ],
    faq: [
      { q: '¿Cómo funcionan los presupuestos en Dominex?', a: 'Creas presupuestos con partidas, mano de obra y materiales en un documento profesional con tu marca, vinculado al cliente. El presupuesto queda registrado y puede convertirse en propuesta, contrato u orden de trabajo.' },
      { q: '¿El cliente aprueba la propuesta por enlace?', a: 'Sí. La propuesta va por enlace, el cliente la abre en su móvil y aprueba con registro de cuándo aprobó. Ves quién la abrió y quién cerró, sin depender del "ok" en WhatsApp.' },
      { q: '¿Qué son los contratos recurrentes?', a: 'Son contratos de mantenimiento preventivo o servicio periódico con una recurrencia configurable (mensual, bimestral, trimestral). Dominex genera las órdenes de trabajo automáticamente en el intervalo correcto, con el alcance del contrato listo.' },
      { q: '¿Los contratos generan órdenes de trabajo solos?', a: 'Sí. Una vez configurado el contrato con la recurrencia, las órdenes de trabajo se generan por el sistema en el intervalo acordado, sin necesidad de recordar, para que ningún SLA se incumpla por olvido.' },
      { q: '¿El presupuesto aprobado se convierte en orden de trabajo?', a: 'Sí. Con un clic, el presupuesto aprobado se convierte en orden de trabajo, llevando el alcance vendido al campo. Ventas y operaciones trabajan con los mismos datos.' },
      { q: '¿Los presupuestos y contratos quedan vinculados al cliente?', a: 'Sí. Cada presupuesto y contrato queda en el historial del cliente, organizado, para consulta y seguimiento.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Armas tu primer presupuesto y envías la propuesta por enlace de inmediato.' },
    ],
    finalCta: {
      title: 'Vuelve profesional la propuesta y automatiza el contrato',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Crea presupuestos con tu marca y deja que el contrato genere las órdenes de trabajo solo.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 10. Rastreo GPS de equipos y agenda
  // ────────────────────────────────────────────────────────────────────────
  'rastreamento-de-equipes': {
    slug: 'software-gps-equipos',
    metaTitle: 'Rastreo GPS de equipos y agenda para servicios de campo | Dominex',
    metaDescription:
      'Rastreo GPS de equipos y agenda para servicios de campo: ubicación en tiempo real en el mapa, agenda y ruteo, check-in y check-out validados por dirección e historial de recorridos. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Rastreo GPS y agenda',
      h1: 'Rastreo GPS de equipos y agenda para servicios de campo',
      h1Highlight: 'Rastreo GPS de equipos',
      subtitle:
        '¿Siempre llamando para saber dónde está cada técnico? Dominex muestra a tu equipo en el mapa en tiempo real, organiza la agenda del día y valida el check-in por la dirección del cliente.',
    },
    metrics: [
      { value: 'Tiempo real', label: 'tu equipo en el mapa mientras trabaja' },
      { value: 'Check-in/out', label: 'validado por la dirección del cliente' },
      { value: 'Agenda', label: 'la ruta del día organizada por técnico' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que lo usan' },
    ],
    painsHeading: 'No saber dónde está tu equipo te sale caro',
    painsSubheading: 'Donde el teléfono no contesta, el mapa muestra',
    pains: [
      {
        pain: '"¿Dónde está el técnico ahora? ¿Ya llegó al cliente?"',
        solution:
          'El mapa en vivo muestra dónde está cada técnico mientras trabaja. Sigues al equipo sin hacer llamadas.',
      },
      {
        pain: 'La agenda del día en tu cabeza y el técnico cruzando la ciudad en vano',
        solution:
          'La agenda organiza los trabajos del día y ayuda con el ruteo, asignando al técnico más cercano. Menos desplazamientos, más servicio.',
      },
      {
        pain: '"¿Realmente fue al cliente?"',
        solution:
          'El check-in y el check-out se validan por la dirección del cliente, con la hora registrada. Tienes prueba de presencia en la visita.',
      },
      {
        pain: 'Sin historial de recorridos para verificar la ruta',
        solution:
          'El historial de recorridos guarda los puntos clave del día. Verificas por dónde fue el equipo y justificas el tiempo pasado en campo.',
      },
    ],
    deepDives: [
      {
        icon: Navigation,
        title: 'Tu equipo en el mapa en tiempo real',
        body: 'El mapa en vivo muestra dónde está cada técnico mientras el equipo trabaja. Sigues la operación de campo desde un solo lugar, sabes quién está cerca del próximo trabajo y dejas de llamar para pedir una ubicación. La visibilidad de todo el día está en la pantalla, no en el teléfono.',
        image: {
          src: '/modulos/rastreamento-de-equipes/1.webp',
          alt: 'Una flota de furgonetas de servicio alineadas, el equipo de campo seguido como en un mapa en vivo',
        },
      },
      {
        icon: Calendar,
        title: 'La agenda del día y el ruteo',
        body: 'Arma la agenda del día con los trabajos de cada técnico y organiza la ruta para reducir desplazamientos. Asigna el trabajo al técnico más cercano a la dirección y evita choques de horario. Menos tiempo en el tráfico significa más trabajos por día y clientes con una ventana más predecible.',
        image: {
          src: '/modulos/rastreamento-de-equipes/2.webp',
          alt: 'Conductor usando la navegación GPS en el coche para seguir la ruta del día',
        },
      },
      {
        icon: MapPin,
        title: 'Check-in/out validado e historial de recorridos',
        body: 'El técnico hace check-in y check-out en la visita, validado por la dirección del cliente, con la hora registrada, probando su presencia en el trabajo. El historial de recorridos guarda los puntos clave de la ruta, para que verifiques por dónde fue el equipo y justifiques el tiempo pasado en campo.',
        image: {
          src: '/modulos/rastreamento-de-equipes/3.webp',
          alt: 'Técnico bajando de la furgoneta de servicio al llegar a la dirección del cliente para el check-in',
        },
      },
    ],
    featuresHeading: 'Ve tu operación de campo, no la adivines',
    featuresSubheading: 'Ubicación, agenda y prueba de presencia en un solo lugar',
    features: [
      { icon: Navigation, title: 'Mapa en vivo', desc: 'La ubicación del equipo en tiempo real mientras trabaja.' },
      { icon: Calendar, title: 'Agenda del día', desc: 'Trabajos organizados por técnico, sin choques de horario.' },
      { icon: RouteIcon, title: 'Ruteo', desc: 'Asigna el trabajo al técnico más cercano y reduce desplazamientos.' },
      { icon: MapPin, title: 'Check-in validado', desc: 'Llegada a la visita validada por la dirección del cliente.' },
      { icon: CheckSquare, title: 'Check-out registrado', desc: 'Salida con la hora, probando el tiempo en el trabajo.' },
      { icon: BookOpen, title: 'Historial de recorridos', desc: 'Puntos clave de la ruta guardados para revisión.' },
      { icon: Clock, title: 'Tiempo en campo', desc: 'Justifica el tiempo pasado en cada visita con datos, no con suposiciones.' },
      { icon: BarChart3, title: 'Productividad', desc: 'Sigue los trabajos por técnico y por día.' },
    ],
    testimonialsHeading: 'Quien ve al equipo en el mapa dejó de llamar',
    testimonials: [
      { quote: 'Yo llamaba para saber dónde estaba cada técnico. Ahora los veo a todos en el mapa y organizo la ruta del día.', name: 'Rodrigo A.', role: 'Gerente de Operaciones', company: 'servicios de campo' },
      { quote: 'El check-in por la dirección del cliente acabó con la duda de si el técnico realmente fue. Tengo la prueba.', name: 'Fábio M.', role: 'Coordinador', company: 'mantenimiento de edificios' },
      { quote: 'Con la agenda y el ruteo, el equipo hace más trabajos por día y cruza la ciudad en vano menos veces.', name: 'Bruno S.', role: 'Socio', company: 'instalaciones y servicios' },
    ],
    faq: [
      { q: '¿Dominex muestra dónde está mi equipo en tiempo real?', a: 'Sí. El mapa en vivo muestra dónde está cada técnico mientras trabaja, así sigues la operación de campo sin hacer llamadas.' },
      { q: '¿Cómo funcionan la agenda y el ruteo?', a: 'La agenda organiza los trabajos del día por técnico y ayuda con el ruteo, asignando el trabajo al técnico más cercano a la dirección, reduciendo desplazamientos y evitando choques de horario.' },
      { q: '¿El check-in prueba que el técnico fue al cliente?', a: 'Sí. El check-in y el check-out se validan por la dirección del cliente, con la hora registrada, probando la presencia en la visita y el tiempo en el trabajo.' },
      { q: '¿Hay un historial de recorridos?', a: 'Sí. El historial guarda los puntos clave de la ruta del día, así verificas por dónde fue el equipo y justificas el tiempo en campo.' },
      { q: '¿El ruteo ayuda a hacer más trabajos por día?', a: 'Sí. Al asignar al técnico más cercano y organizar la ruta, el equipo cruza la ciudad en vano menos veces y atiende a más clientes el mismo día.' },
      { q: '¿El cliente recibe una hora predecible?', a: 'Sí. Con una agenda organizada, le das al cliente una ventana de servicio más predecible y reduces las visitas fallidas.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Registras al equipo y sigues el mapa en vivo y la agenda del día de inmediato.' },
    ],
    finalCta: {
      title: 'Ve a tu equipo de campo en el mapa',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Sigue al equipo en tiempo real, organiza la agenda y prueba cada visita.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 11. App del técnico (Área del Técnico™)
  // ────────────────────────────────────────────────────────────────────────
  'area-do-tecnico': {
    slug: 'app-tecnico-campo',
    metaTitle: 'App del técnico: la app de campo de tu equipo | Dominex',
    metaDescription:
      'La App del técnico: la app de campo de tu equipo. Órdenes de trabajo en el móvil, herramientas técnicas (carga de refrigerante, sobrecalentamiento, dimensionado de contactor), un catálogo de equipos y una app instalable en el móvil. Prueba gratis 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'App del técnico',
      h1: 'La App del técnico: la app de campo de tu equipo',
      h1Highlight: 'App del técnico',
      subtitle:
        'El técnico no trabaja sentado en la oficina, necesita todo en su móvil. La App del técnico es una app instalable que lleva la orden de trabajo, las herramientas de cálculo y el catálogo a la palma de su mano, en pleno campo.',
    },
    metrics: [
      { value: 'PWA', label: 'app instalable en el móvil del técnico' },
      { value: 'Herramientas', label: 'cálculos técnicos en el bolsillo del equipo' },
      { value: 'En el bolsillo', label: 'todo en el móvil del técnico, en campo' },
      { value: '4,9/5', label: 'satisfacción entre las empresas que la usan' },
    ],
    painsHeading: 'El técnico necesita todo en campo, no en la oficina',
    painsSubheading: 'Donde el equipo trabaja sin una herramienta a mano, la App del técnico la entrega',
    pains: [
      {
        pain: 'El técnico abre la orden en su móvil y falta la mitad de la información',
        solution:
          'En la App del técnico, la orden llega completa: cliente, dirección, equipo, historial y lista de verificación. La ejecuta desde el móvil, sin llamar a la oficina.',
      },
      {
        pain: 'Carga de refrigerante y sobrecalentamiento calculados de cabeza, con riesgo de error',
        solution:
          'Las herramientas técnicas traen carga de refrigerante, sobrecalentamiento y tablas de presión por temperatura al bolsillo. Menos errores, más precisión en campo.',
      },
      {
        pain: 'Dimensionar un contactor sobre la marcha, sin referencia',
        solution:
          'El dimensionado de contactor y relé térmico está en la herramienta, paso a paso. El técnico lo calcula bien en el momento.',
      },
      {
        pain: 'El técnico carga manuales y tablas impresas para consultar en el cliente',
        solution:
          'El catálogo de equipos, con fotos y manuales, vive en el móvil del técnico. Consulta el modelo y la especificación en el momento, en campo, sin papel y sin llamar a la oficina.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'La app de campo (PWA) con la orden de trabajo en la palma de la mano',
        body: 'La App del técnico es una app instalable en el móvil (PWA), sin tienda de aplicaciones. El técnico ve la cola del día, abre la orden completa, cliente, dirección en el mapa, equipo e historial, ejecuta la lista de verificación, toma fotos, recoge la firma y cierra el trabajo. Todo desde el campo, sin volver a la oficina.',
        image: {
          src: '/modulos/area-do-tecnico/1.webp',
          alt: 'Técnico en overol usando un móvil en campo para abrir la orden de trabajo',
        },
      },
      {
        icon: Calculator,
        title: 'Herramientas técnicas en el bolsillo del técnico',
        body: 'El equipo lleva las calculadoras del día a día en su móvil: curvas de carga y presión por temperatura para gases refrigerantes, cálculo de sobrecalentamiento, dimensionado de contactor y relé térmico (con arranque directo) y un catálogo de equipos con fotos y manuales. El cálculo sale bien en el momento, en campo, sin depender de la memoria ni de una hoja de cálculo.',
        image: {
          src: '/modulos/area-do-tecnico/2.webp',
          alt: 'Técnico de HVAC usando un manómetro de manifold y herramientas en un aire acondicionado',
        },
      },
      {
        icon: Download,
        title: 'App instalable en el móvil, sin tienda de aplicaciones',
        body: 'La App del técnico es una app instalable (PWA): el técnico la agrega a su móvil directo desde el navegador, sin pasar por una tienda de aplicaciones, y la abre como cualquier otra app, ligera y rápida. La orden de trabajo, las herramientas de cálculo y el catálogo quedan en la palma de su mano, listos para usar en el cliente, en campo.',
        image: {
          src: '/modulos/area-do-tecnico/3.webp',
          alt: 'Profesional con casco revisando la app en una tablet en la obra',
        },
      },
    ],
    featuresHeading: 'Todo el campo en el móvil del técnico',
    featuresSubheading: 'Órdenes de trabajo, herramientas y catálogo en la palma de la mano, en campo',
    features: [
      { icon: Smartphone, title: 'PWA instalable', desc: 'Se instala en el móvil sin tienda de aplicaciones, ligera y rápida.' },
      { icon: ClipboardList, title: 'Órdenes en el móvil', desc: 'La orden completa, con lista de verificación, fotos y firma.' },
      { icon: Gauge, title: 'Carga de refrigerante', desc: 'Curvas de carga y presión por temperatura para refrigerantes.' },
      { icon: Calculator, title: 'Sobrecalentamiento', desc: 'Cálculo de sobrecalentamiento directo en la app.' },
      { icon: Wrench, title: 'Dimensionado de contactor', desc: 'Contactor y relé térmico con arranque directo, paso a paso.' },
      { icon: BookOpen, title: 'Catálogo de equipos', desc: 'Fotos y manuales de equipos para consulta en campo.' },
      { icon: Camera, title: 'Fotos de antes y después', desc: 'Evidencia fotográfica adjunta a la orden, tomada desde el móvil en el cliente.' },
      { icon: PenLine, title: 'Firma digital', desc: 'El cliente firma en la pantalla del móvil y entra directo en el informe.' },
    ],
    testimonialsHeading: 'El técnico en control, directo desde el móvil',
    testimonials: [
      { quote: 'La App del técnico se volvió la app oficial del equipo. Órdenes, fotos, firma, todo desde el móvil, en el cliente.', name: 'Diego F.', role: 'Gerente', company: 'refrigeración y HVAC' },
      { quote: 'Las herramientas de carga de refrigerante y sobrecalentamiento en el bolsillo redujeron errores en campo. El técnico lo calcula bien en el momento.', name: 'Aline R.', role: 'Coordinadora Técnica', company: 'mantenimiento de aire acondicionado' },
      { quote: 'Tener la orden de trabajo, las calculadoras y el catálogo todo en el móvil cambió el día del técnico. Lo resuelve en el cliente, sin volver a la base ni cargar manuales impresos.', name: 'Thiago P.', role: 'Fundador', company: 'servicios de refrigeración' },
    ],
    faq: [
      { q: '¿Qué es la App del técnico?', a: 'Es la app de campo de tu equipo: una app instalable en el móvil (PWA) con la orden de trabajo, las herramientas de cálculo técnico y el catálogo de equipos, todo en la palma de la mano del técnico para usar en el cliente.' },
      { q: '¿Necesito descargarla de una tienda de aplicaciones?', a: 'No. La App del técnico es una PWA: se instala directo desde el navegador en el móvil del técnico, sin pasar por una tienda de aplicaciones, y se mantiene ligera y rápida.' },
      { q: '¿Qué herramientas técnicas están disponibles?', a: 'Curvas de carga y presión por temperatura para gases refrigerantes, cálculo de sobrecalentamiento, dimensionado de contactor y relé térmico con arranque directo, y un catálogo de equipos con fotos y manuales, todo en el móvil.' },
      { q: '¿El técnico puede ejecutar la orden de trabajo en la app?', a: 'Sí. Abre la orden completa (cliente, dirección, equipo, historial), completa la lista de verificación, toma fotos, recoge la firma y cierra el trabajo, todo desde el móvil.' },
      { q: '¿El equipo usa todo directo desde el móvil, en campo?', a: 'Sí. La orden de trabajo, las herramientas de cálculo y el catálogo de equipos quedan en el móvil del técnico, listos para usar en el cliente. Ejecuta la orden, hace los cálculos y consulta el catálogo en campo, sin volver a la oficina ni cargar manuales impresos.' },
      { q: '¿Las herramientas de cálculo funcionan para refrigeración y aire acondicionado?', a: 'Sí. Las calculadoras de carga de refrigerante, sobrecalentamiento y curva de presión están orientadas al día a día de la refrigeración y el aire acondicionado, y el dimensionado de contactor apoya la instalación y el arranque de equipos.' },
      { q: '¿Cómo empiezo? ¿Necesito tarjeta de crédito?', a: 'Solo crea una cuenta y úsala gratis durante 14 días, sin tarjeta de crédito. Tu equipo instala la App del técnico en su móvil y empieza a trabajar en campo de inmediato.' },
    ],
    finalCta: {
      title: 'Pon todo el campo en el móvil de tu equipo',
      subtitle: 'Gratis durante 14 días, sin tarjeta de crédito. Órdenes de trabajo, herramientas técnicas y catálogo en la App del técnico, en el móvil de tu equipo.',
    },
  },
};

export default es;
