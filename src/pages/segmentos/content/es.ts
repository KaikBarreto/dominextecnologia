// ─────────────────────────────────────────────────────────────────────────────
// Contenido es (Español) de segmentos, traducciones nativas.
//
// Copy nativa en español para las 9 landing pages de segmento. Mismo shape que
// pt-br.ts (SegmentContentMap). Cada segmento lleva un `slug` en español para que
// la ruta /es/<slug>, el hreflang y el sitemap se resuelvan automáticamente vía
// el slug registry.
//
// El nombre de marca "Dominex" es un nombre propio y nunca se traduce.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Thermometer,
  Zap,
  Sun,
  Radio,
  Shield,
  HardHat,
  Building,
  Sparkles,
  Droplets,
  ClipboardList,
  MapPin,
  Calendar,
  RefreshCw,
  BarChart3,
  Smartphone,
  FileSignature,
  Gauge,
  Boxes,
  Users,
} from 'lucide-react';
import type { SegmentContentMap } from './types';

const es: SegmentContentMap = {
  // ──────────────────────────────────────────────────────────────────────────
  // Refrigeración y climatización
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-refrigeracao': {
    slug: 'software-refrigeracion-climatizacion',
    metaTitle:
      'Software de órdenes de trabajo y mantenimiento para empresas de refrigeración y climatización | Dominex',
    metaDescription:
      'Software para empresas de refrigeración y climatización: órdenes de trabajo digitales, planes de mantenimiento preventivo automáticos, control de refrigerante por equipo, app móvil para tus técnicos en campo y contratos de mantenimiento recurrentes. Prueba gratis de 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Para empresas de refrigeración y aire acondicionado',
      h1: 'Software de órdenes de trabajo y mantenimiento para empresas de refrigeración y climatización',
      h1Highlight: 'refrigeración y climatización',
      subtitle:
        'Cansado de las órdenes de trabajo en papel y de que el técnico llegue sin ningún historial. Dominex centraliza tus órdenes de trabajo, automatiza tu agenda de mantenimiento y guarda el registro de cada equipo, carga de refrigerante y visita en la palma de tu mano.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'Auto', label: 'planes de mantenimiento preventivo generados por equipo' },
      { value: '100%', label: 'en el teléfono de tu técnico en campo' },
      { value: '4.9/5', label: 'satisfacción de las empresas que lo usan' },
    ],
    pains: [
      {
        pain: '"Espera, ¿qué refrigerante le puse a este equipo?"',
        solution:
          'Cada equipo conserva su historial completo: tipo de refrigerante, carga, presiones, sobrecalentamiento y todas las visitas anteriores. El técnico abre la orden de trabajo y lo ve todo, sin llamar a la oficina.',
      },
      {
        pain: 'Mantenimiento preventivo hecho a las apuradas, sin registro, fuera de norma',
        solution:
          'Dominex arma la agenda de mantenimiento automáticamente por equipo, con un checklist para cada visita, el técnico responsable registrado y un reporte listo para una inspección.',
      },
      {
        pain: 'Contrato de mantenimiento preventivo olvidado hasta que el cliente reclama',
        solution:
          'Los contratos con cadencia configurable (mensual, bimestral, trimestral) generan las órdenes de trabajo por su cuenta en el intervalo correcto. Nunca más te pierdes una visita preventiva ni incumples un SLA.',
      },
      {
        pain: 'Reporte de visita escrito a mano, horas después, sin fotos ni firma',
        solution:
          'El técnico cierra la orden de trabajo en la app con fotos de antes y después, el checklist completo y la firma del cliente en el momento. El reporte en PDF con tu marca queda listo enseguida.',
      },
    ],
    deepDives: [
      {
        icon: Thermometer,
        title: 'Hecho para splits, cámaras frigoríficas, chillers y VRF',
        body: 'Registra cada equipo con marca, modelo, capacidad (BTU/tonelada), tipo de refrigerante y ubicación. Split, multisplit, VRF, chiller, cámara frigorífica, fan coil o autocontenido, el historial queda ligado al equipo, no solo al cliente. Cuando el técnico vuelve, sabe exactamente qué se hizo la última vez, qué refrigerante está cargado y el sobrecalentamiento objetivo.',
        image: {
          src: '/segmentos/refrigeracao/1.webp',
          alt: 'Unidades condensadoras de aire acondicionado instaladas en la azotea de un edificio',
        },
      },
      {
        icon: RefreshCw,
        title: 'Agenda de mantenimiento preventivo automática',
        body: 'El plan de mantenimiento se arma a partir de los equipos del contrato: el sistema reparte las visitas a lo largo del ciclo, arma el checklist de cada una, registra al técnico responsable y produce la agenda de mantenimiento y el reporte de cumplimiento listos para mostrar en una inspección. Cumples con la norma sin planilla aparte.',
        image: {
          src: '/segmentos/refrigeracao/2.webp',
          alt: 'Técnico inspeccionando la unidad exterior de un sistema de climatización',
        },
      },
      {
        icon: Smartphone,
        title: 'Todo en el teléfono del técnico, desde la propia azotea',
        body: 'El servicio de refrigeración pasa en azoteas, salas de máquinas y sótanos de centros comerciales, y todo se resuelve desde el teléfono. La app de Dominex se instala directamente en el dispositivo (PWA): el técnico abre la orden de trabajo, toma fotos, lee presiones, completa el checklist y captura la firma del cliente ahí mismo en el sitio. La orden de trabajo queda lista en el momento, sin volver a la oficina, sin reescribir reportes.',
        image: {
          src: '/segmentos/refrigeracao/3.webp',
          alt: 'Técnicos dando servicio a una unidad exterior de aire acondicionado en una azotea',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Órdenes de trabajo digitales',
        desc: 'Crea, asigna y da seguimiento a órdenes de instalación, mantenimiento y reparación en segundos, con fotos, checklist y firma del cliente.',
      },
      {
        icon: Gauge,
        title: 'Historial de refrigerante y equipos',
        desc: 'Refrigerante, carga, presiones y sobrecalentamiento registrados por equipo. El técnico lo ve todo antes de subir a la azotea.',
      },
      {
        icon: RefreshCw,
        title: 'Planes de mantenimiento y contratos recurrentes',
        desc: 'Agenda de mantenimiento automática y contratos preventivos que generan órdenes de trabajo por su cuenta en el intervalo correcto, por equipo.',
      },
      {
        icon: MapPin,
        title: 'Seguimiento en campo',
        desc: 'Mira en el mapa dónde está cada técnico y ten registros de llegada validados por radio alrededor de la dirección del cliente.',
      },
      {
        icon: Calendar,
        title: 'Agenda inteligente',
        desc: 'Planifica las rutas de tu equipo, asigna trabajos al técnico más cercano y evita conflictos de horario.',
      },
      {
        icon: FileSignature,
        title: 'Reportes de mantenimiento y órdenes con tu marca',
        desc: 'PDF listo apenas termina la visita, con tu logo y tus colores, para entregar al cliente y a un inspector.',
      },
      {
        icon: Boxes,
        title: 'Inventario de repuestos y refrigerante',
        desc: 'Controla repuestos, filtros y cilindros de refrigerante usados en cada orden de trabajo, con descuento automático de stock.',
      },
      {
        icon: BarChart3,
        title: 'Panel de operaciones',
        desc: 'Órdenes de trabajo por estado, tiempo promedio de conclusión y calificaciones de clientes en un panel en vivo.',
      },
    ],
    testimonials: [
      {
        quote:
          'Dejé de perder el historial de cada equipo. El técnico llega al cliente, abre la orden de trabajo y ya sabe qué refrigerante está cargado y qué se hizo en la última visita.',
        name: 'Carlos M.',
        role: 'Gerente de Operaciones',
        company: 'empresa de refrigeración comercial',
      },
      {
        quote:
          'Planificar el mantenimiento era una pesadilla de planillas. Ahora el sistema arma la agenda y el reporte por su cuenta. Le mostré todo a un inspector sin transpirar.',
        name: 'Roberta S.',
        role: 'Técnica Responsable',
        company: 'climatización comercial',
      },
      {
        quote:
          'La cuadrilla trabaja en campo todo el día y hace todo desde el teléfono. El técnico cierra la orden de trabajo frente al cliente, con foto y firma. Toda la operación se volvió mucho más rápida.',
        name: 'André P.',
        role: 'Fundador',
        company: 'mantenimiento de aire acondicionado',
      },
    ],
    faq: [
      {
        q: '¿Dominex sirve para empresas de refrigeración y climatización?',
        a: 'Sí. Fue creado para empresas que instalan y mantienen splits, multisplits, VRF, chillers, cámaras frigoríficas, autocontenidos y fan coils. Registras cada equipo, controlas el refrigerante, generas una agenda de mantenimiento y organizas los contratos de mantenimiento preventivo en un solo lugar.',
      },
      {
        q: '¿El sistema genera un plan de mantenimiento preventivo?',
        a: 'Sí. Dominex arma la agenda de mantenimiento automáticamente a partir de los equipos del contrato, con un checklist por visita, el técnico responsable registrado y un reporte de cumplimiento listo para una inspección. Cuando necesitas un plan de mantenimiento preventivo formal para un cliente o una auditoría, produces la documentación sin planilla aparte.',
      },
      {
        q: '¿El técnico trabaja desde el teléfono? ¿Hay una app para instalar?',
        a: 'Sí, todo pasa en el teléfono. Dominex es una app que se instala directamente en el dispositivo del técnico (PWA), sin descarga de tienda de apps. En el sitio, el técnico abre la orden de trabajo, toma fotos, registra presiones, completa el checklist y captura la firma del cliente directo desde el teléfono. La orden de trabajo queda lista en el momento.',
      },
      {
        q: '¿Puedo controlar el refrigerante y el historial de cada equipo?',
        a: 'Sí. Cada equipo conserva el tipo de refrigerante, la carga, las presiones, el sobrecalentamiento y todas las visitas anteriores. El técnico ve el historial completo del equipo antes de siquiera llegar al cliente.',
      },
      {
        q: '¿Los reportes salen con mi propia marca?',
        a: 'Sí. Los reportes de órdenes de trabajo y los documentos de mantenimiento salen en PDF con tu logo y tus colores. En el plan White Label, toda la experiencia de cara al cliente lleva la identidad de tu empresa.',
      },
      {
        q: '¿Cómo funcionan los contratos de mantenimiento preventivo?',
        a: 'Configuras el contrato con la cadencia que quieras (mensual, bimestral, trimestral y demás) y Dominex genera las órdenes de trabajo automáticamente en el intervalo correcto, por equipo. Nunca más te pierdes una visita preventiva ni incumples un SLA.',
      },
      {
        q: '¿Tengo herramientas de campo para refrigeración dentro del sistema?',
        a: 'Sí. El Kit del Técnico trae las calculadoras y tablas que usas a diario: curvas presión-temperatura de refrigerantes, sobrecalentamiento, dimensionamiento y un catálogo de equipos, todo al alcance directo del teléfono en campo.',
      },
      {
        q: '¿Cómo empiezo? ¿Necesito una tarjeta de crédito?',
        a: 'Solo crea tu cuenta y úsalo gratis por 14 días, sin tarjeta. Configuras tu empresa en minutos, registras tus equipos y empiezas a abrir órdenes de trabajo de inmediato. Cancela cuando quieras, y tus datos se conservan si decides suscribirte.',
      },
    ],
    finalCta: {
      title: 'Toma el control de tu operación de refrigeración',
      subtitle:
        'Gratis por 14 días, sin tarjeta, sin complicaciones. Registra tus equipos, arma tu agenda de mantenimiento y pon a tu cuadrilla de campo bajo control.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Electricistas
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-eletricistas': {
    slug: 'software-electricistas',
    metaTitle:
      'Software de órdenes de trabajo para electricistas y empresas de servicios eléctricos | Dominex',
    metaDescription:
      'Software para empresas de instalación y mantenimiento eléctrico: órdenes de trabajo digitales, reportes y certificados por cliente, registro de tableros y acometidas, checklists de seguridad y app móvil para tus electricistas en campo. Prueba gratis de 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Para electricistas y empresas de servicios eléctricos',
      h1: 'Software de órdenes de trabajo para empresas de servicios eléctricos',
      h1Highlight: 'servicios eléctricos',
      subtitle:
        'Tablero cableado, acometida cambiada, mantenimiento hecho, ¿y nada de eso se convirtió en un registro? Dominex digitaliza tus órdenes de trabajo, guarda el historial de cada instalación y pone reportes, checklists y fotos en la mano del electricista.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'Seguridad', label: 'checklist en cada visita' },
      { value: '100%', label: 'en el teléfono de tu electricista en campo' },
      { value: '4.9/5', label: 'satisfacción de las empresas que lo usan' },
    ],
    pains: [
      {
        pain: '"¿Qué hicimos la última vez en el tablero de este cliente?"',
        solution:
          'Cada cliente y cada punto de instalación conserva el historial: acometida, disyuntores reemplazados, cargas, tableros y qué se hizo en cada visita. El electricista abre la orden de trabajo y lo ve todo, sin llamar a la oficina.',
      },
      {
        pain: 'Reportes y certificados perdidos en el email, en WhatsApp o en un cajón',
        solution:
          'Adjunta reportes, certificados y fotos del trabajo directo a la orden de trabajo del cliente. Todo queda organizado por dirección y por equipo, listo para reenviar cuando el cliente lo pida.',
      },
      {
        pain: 'Presupuestos de instalación hechos de memoria, sin estándar y sin registro',
        solution:
          'Arma presupuestos con partidas, mano de obra y materiales, envíalos por enlace y da seguimiento a la aprobación. Una vez aprobado, se convierte en orden de trabajo con un clic, con la cuadrilla ya asignada.',
      },
      {
        pain: 'Seguridad en obra sin prueba de que se siguió el procedimiento',
        solution:
          'Los checklists configurables exigen los pasos de seguridad y bloqueo en cada visita, con registro de quién hizo el trabajo, fotos y firma. Puedes probar el procedimiento si alguna vez lo necesitas.',
      },
    ],
    deepDives: [
      {
        icon: Zap,
        title: 'Historial por acometida, tablero y circuito',
        body: 'Registra cada cliente con la acometida (monofásica, bifásica, trifásica), los tableros de distribución, disyuntores y cargas. Mantenimiento preventivo, cambio de disyuntor, circuito nuevo o un reporte de inspección, todo queda ligado al punto de instalación. Cuando el electricista vuelve, ya sabe qué hay ahí y qué se hizo antes.',
        image: {
          src: '/segmentos/eletrica/1.webp',
          alt: 'Tablero eléctrico de distribución organizado con disyuntores y cableado codificado por color',
        },
      },
      {
        icon: FileSignature,
        title: 'Reportes y certificados con tu marca',
        body: 'Cuando termina la visita, el reporte de la orden de trabajo sale en PDF con tu logo y tus colores, con el checklist completo, fotos de antes y después y la firma del cliente en el momento. Adjunta el certificado técnico y el reporte a la ficha del cliente y mantén todo en un solo lugar para entregar y para probar el trabajo.',
        image: {
          src: '/segmentos/eletrica/2.webp',
          alt: 'Profesional eléctrico inspeccionando un tablero industrial para verificar y documentar el trabajo',
        },
      },
      {
        icon: Smartphone,
        title: 'Todo en el teléfono del electricista, desde la propia obra',
        body: 'Tablero cableado, acometida cambiada, inspección hecha, y el registro queda listo en el mismo instante. La app de Dominex se instala directamente en el teléfono del electricista (PWA): en el sitio abre la orden de trabajo, toma fotos de antes y después, corre el checklist de seguridad y captura la firma del cliente ahí mismo. El reporte queda listo en el momento, sin volver a la oficina a redactarlo.',
        image: {
          src: '/segmentos/eletrica/3.webp',
          alt: 'Electricista con casco usando un teléfono en la obra al aire libre',
        },
      },
      {
        icon: RefreshCw,
        title: 'Contratos de mantenimiento eléctrico recurrente',
        body: 'Consorcios, fábricas y comercios necesitan mantenimiento preventivo periódico en sus sistemas eléctricos. Configura el contrato con la cadencia correcta (mensual, trimestral) y Dominex genera las órdenes de trabajo por su cuenta en el intervalo acordado, con el checklist de inspección listo. Cumples el contrato sin depender de que alguien se acuerde.',
        image: {
          src: '/segmentos/eletrica/4.webp',
          alt: 'Técnico con EPP haciendo mantenimiento en tableros eléctricos en un entorno industrial',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Órdenes de trabajo digitales',
        desc: 'Instalación, mantenimiento y reparación en segundos, con fotos, checklist y firma del cliente en la app.',
      },
      {
        icon: Zap,
        title: 'Historial de tableros y circuitos',
        desc: 'Acometida, disyuntores, cargas y qué se hizo en cada visita, registrados por punto de instalación.',
      },
      {
        icon: FileSignature,
        title: 'Reportes y certificados con tu marca',
        desc: 'Adjunta certificados y reportes al cliente y genera el reporte de la orden de trabajo en PDF con tu marca al final de cada trabajo.',
      },
      {
        icon: ClipboardList,
        title: 'Checklist de seguridad eléctrica',
        desc: 'Bloqueo e inspección paso a paso en cada visita, con registro de quién hizo el trabajo.',
      },
      {
        icon: MapPin,
        title: 'Seguimiento en campo',
        desc: 'Mira en el mapa dónde está cada electricista y ten registros de llegada validados por la dirección del cliente.',
      },
      {
        icon: Calendar,
        title: 'Agenda inteligente',
        desc: 'Planifica rutas de la cuadrilla, asigna trabajos al electricista más cercano y evita conflictos de horario.',
      },
      {
        icon: Boxes,
        title: 'Inventario de material eléctrico',
        desc: 'Controla disyuntores, cable, caño y conectores usados en cada orden de trabajo, con descuento automático.',
      },
      {
        icon: BarChart3,
        title: 'Panel de operaciones',
        desc: 'Órdenes de trabajo por estado, tiempo promedio de conclusión y calificaciones de clientes en un panel en vivo.',
      },
    ],
    testimonials: [
      {
        quote:
          'Antes todo vivía en nuestra cabeza. Ahora el electricista llega al cliente y ya ve el tablero, la acometida y qué se reemplazó la última vez. Se acabó rehacer trabajo.',
        name: 'Marcelo T.',
        role: 'Dueño',
        company: 'instalaciones eléctricas comerciales',
      },
      {
        quote:
          'Los certificados y reportes estaban dispersos por todos lados. Ahora está todo en la ficha del cliente, organizado. Cuando necesitan uno, lo reenvío en segundos.',
        name: 'Patrícia L.',
        role: 'Técnica Responsable',
        company: 'mantenimiento eléctrico industrial',
      },
      {
        quote:
          'Un reporte con mi logo y la firma del cliente en el momento le dio otra cara a la empresa. Los clientes confían más en nosotros.',
        name: 'Diego F.',
        role: 'Fundador',
        company: 'servicios eléctricos residenciales',
      },
    ],
    faq: [
      {
        q: '¿Dominex sirve para empresas de instalación y mantenimiento eléctrico?',
        a: 'Sí. Fue creado para electricistas y empresas que instalan y mantienen sistemas eléctricos: acometidas, tableros de distribución, instalaciones trifásicas, circuitos y mantenimiento preventivo. Registras cada punto de instalación, guardas el historial y generas órdenes de trabajo, presupuestos y reportes en un solo lugar.',
      },
      {
        q: '¿Puedo adjuntar reportes y certificados a la orden de trabajo?',
        a: 'Sí. Adjuntas reportes, certificados y fotos directo a la ficha del cliente y a las órdenes de trabajo. Todo queda organizado por dirección y por instalación, listo para reenviar cuando el cliente lo necesite.',
      },
      {
        q: '¿Hay un checklist de seguridad para el trabajo eléctrico?',
        a: 'Sí. Armas checklists configurables con los pasos de bloqueo, inspección y seguridad que tu cuadrilla debe seguir en cada visita, con registro de quién hizo el trabajo, fotos y firma. Así puedes probar el procedimiento cuando lo necesites.',
      },
      {
        q: '¿El electricista trabaja desde el teléfono? ¿Hay una app para instalar?',
        a: 'Sí, todo pasa en el teléfono. Dominex es una app que se instala directamente en el dispositivo del electricista (PWA), sin descarga de tienda. En el sitio abre la orden de trabajo, toma fotos, corre el checklist de seguridad y captura la firma del cliente directo desde el teléfono. El reporte queda listo en el momento.',
      },
      {
        q: '¿Puedo generar presupuestos de instalación eléctrica?',
        a: 'Sí. Armas presupuestos con materiales y mano de obra, los envías al cliente por enlace y das seguimiento a la aprobación. Cuando el cliente aprueba, el presupuesto se convierte en orden de trabajo con un clic, con la cuadrilla ya asignada.',
      },
      {
        q: '¿Cómo funcionan los contratos de mantenimiento eléctrico recurrente?',
        a: 'Configuras el contrato con la cadencia que quieras (mensual, trimestral y demás) y Dominex genera las órdenes de trabajo automáticamente en el intervalo correcto, con el checklist de inspección listo. Perfecto para consorcios, fábricas y comercios con mantenimiento periódico.',
      },
      {
        q: '¿Puedo ver dónde está mi cuadrilla en campo?',
        a: 'Sí. El mapa en vivo muestra dónde está cada electricista, y el registro de llegada de la visita se valida por la dirección del cliente. Vigilas la operación de campo sin hacer llamadas.',
      },
      {
        q: '¿Cómo empiezo? ¿Necesito una tarjeta de crédito?',
        a: 'Solo crea tu cuenta y úsalo gratis por 14 días, sin tarjeta. Configuras tu empresa en minutos, registras tus clientes y empiezas a abrir órdenes de trabajo. Cancela cuando quieras, y tus datos se conservan si decides suscribirte.',
      },
    ],
    finalCta: {
      title: 'Pon tu operación eléctrica bajo control',
      subtitle:
        'Gratis por 14 días, sin tarjeta, sin complicaciones. Registra tus clientes, organiza tus reportes y certificados y lleva a tu cuadrilla de campo a lo digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Energía solar
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-energia-solar': {
    slug: 'software-instaladores-solares',
    metaTitle:
      'Software de órdenes de trabajo y O&M para empresas de energía solar | Dominex',
    metaDescription:
      'Software para empresas de energía solar: órdenes de instalación y O&M, historial por sitio e inversor, limpieza de módulos, seguimiento de generación, contratos de mantenimiento recurrentes y app móvil para tu cuadrilla de campo. Prueba gratis de 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Para instaladores solares y empresas de energía',
      h1: 'Software de órdenes de trabajo y O&M para empresas de energía solar',
      h1Highlight: 'energía solar',
      subtitle:
        'Instalaste el sistema, ¿pero la posventa se volvió un caos? Dominex organiza tus órdenes de instalación y O&M, guarda el historial de cada sitio, inversor y visita, y mantiene tus contratos de mantenimiento andando por su cuenta.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'O&M', label: 'mantenimiento de sitios con historial por equipo' },
      { value: '100%', label: 'en el teléfono de tu cuadrilla en campo' },
      { value: '4.9/5', label: 'satisfacción de las empresas que lo usan' },
    ],
    pains: [
      {
        pain: '"¿Cuántos paneles tiene este sitio y qué inversor está instalado?"',
        solution:
          'Cada sitio conserva el registro completo: cantidad de módulos fotovoltaicos, marca y potencia del inversor, string box, montaje y todas las visitas anteriores. La cuadrilla abre la orden de trabajo y lo ve todo, sin revolver el diseño.',
      },
      {
        pain: 'Posventa y O&M olvidados hasta que cae la generación y el cliente reclama',
        solution:
          'Los contratos de O&M con cadencia configurable generan las órdenes de limpieza e inspección por su cuenta. Te adelantas a una caída de generación en vez de perseguir la pérdida.',
      },
      {
        pain: 'Limpieza e inspección de módulos hechas sin nada que lo pruebe',
        solution:
          'El técnico cierra la orden de trabajo con fotos de antes y después de la limpieza, un checklist de inspección de módulos e inversor y la firma del cliente en el momento. Pruebas el servicio y proteges el contrato.',
      },
      {
        pain: 'Cuadrillas de instalación dispersas sin saber quién está dónde',
        solution:
          'El mapa en vivo muestra dónde está cada cuadrilla, con registros de llegada validados por la dirección del sitio. La agenda y la ruta quedan organizadas incluso con varias instalaciones el mismo día.',
      },
    ],
    deepDives: [
      {
        icon: Sun,
        title: 'Historial por sitio, inversor y string',
        body: 'Registra cada sitio fotovoltaico con la cantidad de módulos, la potencia instalada (kWp), la marca y modelo del inversor, el string box y el montaje. Cada visita, instalación, limpieza, inspección o cambio de equipo, queda ligada al sitio. Cuando la cuadrilla vuelve, sabe exactamente qué hay ahí y qué se hizo antes, sin necesidad de desenterrar el diseño original.',
        image: {
          src: '/segmentos/solar/1.webp',
          alt: 'Vista aérea de un parque solar con filas de módulos fotovoltaicos en una zona rural',
        },
      },
      {
        icon: RefreshCw,
        title: 'Contratos de O&M que generan las órdenes de trabajo por su cuenta',
        body: 'La operación y el mantenimiento (O&M) es lo que mantiene la generación arriba a lo largo de los años. Configura el contrato con la cadencia de limpieza e inspección (mensual, trimestral, semestral) y Dominex genera las órdenes de trabajo automáticamente en el intervalo correcto, con el checklist de rutina listo. El mantenimiento preventivo pasa sin que tengas que acordarte.',
        image: {
          src: '/segmentos/solar/2.webp',
          alt: 'Tres técnicos uniformados con casco limpiando módulos solares en una azotea',
        },
      },
      {
        icon: Smartphone,
        title: 'Todo en el teléfono de la cuadrilla, en el propio techo',
        body: 'Los sitios están en azoteas, galpones y terrenos rurales, y la cuadrilla resuelve todo desde el teléfono en el sitio. La app de Dominex se instala directamente en el dispositivo (PWA): la cuadrilla abre la orden de trabajo, fotografía la limpieza de los módulos, completa el checklist de inspección del inversor y captura la firma del cliente ahí mismo en el sitio. El reporte de la visita queda listo en el momento, sin rehacerlo en la oficina.',
        image: {
          src: '/segmentos/solar/3.webp',
          alt: 'Técnico solar con EPP trabajando en módulos en una azotea bajo un cielo azul',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Órdenes de trabajo digitales',
        desc: 'Instalación, O&M y reparación en segundos, con fotos, checklist y firma del cliente en la app.',
      },
      {
        icon: Sun,
        title: 'Historial por sitio e inversor',
        desc: 'Módulos, potencia, inversor y cada visita registrados por sitio. La cuadrilla lo ve todo antes de subir al techo.',
      },
      {
        icon: RefreshCw,
        title: 'Contratos de O&M recurrentes',
        desc: 'La limpieza y la inspección generan las órdenes de trabajo por su cuenta en el intervalo correcto, por sitio.',
      },
      {
        icon: BarChart3,
        title: 'Seguimiento de operaciones',
        desc: 'Órdenes de trabajo por estado, tiempo promedio de conclusión y calificaciones de clientes en un panel en vivo.',
      },
      {
        icon: MapPin,
        title: 'Seguimiento en campo',
        desc: 'Mira en el mapa dónde está cada cuadrilla y ten registros de llegada validados por la dirección del sitio.',
      },
      {
        icon: Calendar,
        title: 'Agenda inteligente',
        desc: 'Planifica la ruta de instalación y asigna trabajos de O&M a la cuadrilla más cercana.',
      },
      {
        icon: FileSignature,
        title: 'Reporte de visita con tu marca',
        desc: 'PDF listo apenas termina la limpieza o inspección, con tu logo, fotos y la firma del cliente.',
      },
      {
        icon: Boxes,
        title: 'Inventario de repuestos y equipos',
        desc: 'Controla inversores, módulos, conectores y cable usados en cada orden de trabajo, con descuento automático.',
      },
    ],
    testimonials: [
      {
        quote:
          'Vendemos muchos sistemas, pero la posventa era un caos. Ahora cada sitio tiene historial de inversor y limpieza. La cuadrilla llega sabiendo qué se va a encontrar.',
        name: 'Rafael G.',
        role: 'Socio',
        company: 'integrador solar',
      },
      {
        quote:
          'El contrato de O&M se volvió previsible: el sistema genera las órdenes de limpieza por su cuenta y la generación deja de caer sin aviso. El cliente nota la diferencia.',
        name: 'Camila V.',
        role: 'Coordinadora de O&M',
        company: 'mantenimiento de sitios fotovoltaicos',
      },
      {
        quote:
          'Cuadrilla repartida en varios techos el mismo día. Con el mapa en vivo y la agenda, dejé de llamar para saber dónde está cada uno.',
        name: 'Lucas R.',
        role: 'Gerente de Operaciones',
        company: 'instalaciones solares comerciales',
      },
    ],
    faq: [
      {
        q: '¿Dominex sirve para empresas de energía solar?',
        a: 'Sí. Fue creado para instaladores y empresas que construyen y mantienen sitios fotovoltaicos. Registras cada sitio con módulos, inversor y montaje, guardas el historial de instalación y O&M y organizas tus órdenes de trabajo, contratos y reportes en un solo lugar.',
      },
      {
        q: '¿Puedo guardar el historial de cada sitio e inversor?',
        a: 'Sí. Cada sitio conserva la cantidad de módulos, la potencia instalada, la marca y modelo del inversor, el string box y todas las visitas anteriores. La cuadrilla ve el historial completo del sitio antes de siquiera llegar a la ubicación.',
      },
      {
        q: '¿Cómo funcionan los contratos de O&M y mantenimiento preventivo?',
        a: 'Configuras el contrato de O&M con la cadencia de limpieza e inspección (mensual, trimestral, semestral) y Dominex genera las órdenes de trabajo automáticamente en el intervalo correcto, con el checklist de rutina listo. El mantenimiento preventivo pasa sin depender de la memoria de la cuadrilla.',
      },
      {
        q: '¿La cuadrilla trabaja desde el teléfono? ¿Hay una app para instalar?',
        a: 'Sí, todo pasa en el teléfono. Dominex es una app que se instala directamente en el dispositivo de la cuadrilla (PWA), sin descarga de tienda. En el sitio, la cuadrilla abre la orden de trabajo, fotografía la limpieza de los módulos, completa el checklist de inspección del inversor y captura la firma del cliente directo desde el teléfono. El reporte queda listo en el momento.',
      },
      {
        q: '¿Puedo probar la limpieza e inspección de los módulos?',
        a: 'Sí. El técnico cierra la orden de trabajo con fotos de antes y después de la limpieza, un checklist de inspección completo y la firma del cliente en el momento. El reporte en PDF con tu marca queda listo para entregar al cliente y probar el servicio.',
      },
      {
        q: '¿Dominex monitorea la generación en tiempo real?',
        a: 'Dominex organiza el servicio de campo: órdenes de trabajo, contratos de O&M, historial por sitio y prueba de cada visita. No reemplaza el portal de tu inversor, pero centraliza todo lo que la cuadrilla hace en el sitio para que el mantenimiento mantenga la generación en marcha.',
      },
      {
        q: '¿Puedo ver dónde está mi cuadrilla de instalación?',
        a: 'Sí. El mapa en vivo muestra dónde está cada cuadrilla, y el registro de llegada de la visita se valida por la dirección del sitio. Planificas la ruta incluso con varias instalaciones el mismo día.',
      },
      {
        q: '¿Cómo empiezo? ¿Necesito una tarjeta de crédito?',
        a: 'Solo crea tu cuenta y úsalo gratis por 14 días, sin tarjeta. Configuras tu empresa en minutos, registras tus sitios y empiezas a abrir órdenes de trabajo. Cancela cuando quieras, y tus datos se conservan si decides suscribirte.',
      },
    ],
    finalCta: {
      title: 'Organiza la instalación y el O&M de tus sitios',
      subtitle:
        'Gratis por 14 días, sin tarjeta, sin complicaciones. Registra tus sitios, automatiza tus contratos de mantenimiento y lleva a tu cuadrilla de campo a lo digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Proveedores de internet / Telecom
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-provedores': {
    slug: 'software-proveedores-internet',
    metaTitle:
      'Software de órdenes de trabajo para proveedores de internet y empresas de telecomunicaciones | Dominex',
    metaDescription:
      'Software para proveedores de internet (ISP) y telecomunicaciones: órdenes de instalación de fibra, tickets de soporte, agendamiento de visitas, historial de CTO y ONU por abonado, control de equipos y app móvil para tus técnicos en campo. Prueba gratis de 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Para proveedores de internet y empresas de telecomunicaciones',
      h1: 'Software de órdenes de trabajo para proveedores de internet y telecom',
      h1Highlight: 'proveedores de internet',
      subtitle:
        'Instalación de fibra, ticket de soporte, cambio de ONU, ¿y cada técnico anotando en una libreta? Dominex organiza tus órdenes de trabajo, agenda las visitas y guarda el historial de CTO, ONU y equipos de cada abonado.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'Fibra', label: 'instalación y soporte con historial por abonado' },
      { value: '100%', label: 'en el teléfono de tu técnico en campo' },
      { value: '4.9/5', label: 'satisfacción de las empresas que lo usan' },
    ],
    pains: [
      {
        pain: '"¿En qué CTO está este cliente y qué ONU se instaló?"',
        solution:
          'Cada abonado conserva el historial: CTO de origen, modelo y número de serie de la ONU, router y todas las visitas anteriores. El técnico abre la orden de trabajo y lo ve todo, sin llamar al NOC.',
      },
      {
        pain: 'Tickets de soporte que se arrastran porque nadie sabe qué ya se hizo',
        solution:
          'Cada ticket se convierte en una orden de trabajo con el historial del abonado, fotos del problema y registro de qué se arregló. La próxima visita empieza sabiendo el contexto.',
      },
      {
        pain: 'Agendamiento a base de "pasamos mañana" mientras el cliente espera todo el día',
        solution:
          'El agendamiento inteligente asigna los tickets al técnico más cercano, planifica la ruta del día y da una ventana de llegada previsible. Menos visitas perdidas, menos clientes molestos.',
      },
      {
        pain: 'Equipo retirado o cambiado y nadie actualizó el inventario',
        solution:
          'Control de equipos por orden de trabajo: ONU, router y drop registrados en la instalación y el retiro, con descuento automático de stock. Siempre sabes dónde está cada equipo.',
      },
    ],
    deepDives: [
      {
        icon: Radio,
        title: 'Historial de fibra, CTO y ONU por abonado',
        body: 'Registra cada abonado con su punto de conexión: CTO de origen, puerto, modelo y número de serie de la ONU, router y drop instalado. Instalación de fibra, cambio de equipo, reparación o soporte, todo queda ligado al abonado. Cuando el técnico vuelve, ya sabe la CTO, el equipo y qué se hizo antes, sin revolver el sistema del NOC.',
        image: {
          src: '/segmentos/telecom/1.webp',
          alt: 'Técnico de telecom manipulando cables de red en un rack para registrar el punto de conexión',
        },
      },
      {
        icon: Calendar,
        title: 'Agendamiento de visitas y ruteo de cuadrillas',
        body: 'Los tickets de instalación y soporte entran en la agenda y se asignan al técnico más cercano a la dirección. La ruta del día se planifica para reducir el tiempo de traslado y el cliente recibe una ventana de llegada previsible. Menos visitas perdidas, menos tiempo ocioso del técnico y más instalaciones por día.',
        image: {
          src: '/segmentos/telecom/2.webp',
          alt: 'Torre de telecomunicaciones con antenas cubriendo el área de servicio del proveedor',
        },
      },
      {
        icon: Smartphone,
        title: 'Todo en el teléfono del técnico, en lo alto del poste',
        body: 'La instalación de fibra pasa en postes, cajas de empalme, sótanos y edificios, y el técnico resuelve todo desde el teléfono en el sitio. La app de Dominex se instala directamente en el dispositivo (PWA): abre la orden de trabajo, registra la CTO y la ONU, toma fotos de la instalación, completa el checklist y captura la firma del abonado ahí mismo. La orden de trabajo queda lista en el momento, sin volver al NOC a cerrarla.',
        image: {
          src: '/segmentos/telecom/3.webp',
          alt: 'Técnico con casco y arnés de seguridad trabajando en cables en lo alto de un poste',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Órdenes de trabajo y tickets',
        desc: 'Instalación, soporte y retiro en segundos, con fotos, checklist y firma del abonado en la app.',
      },
      {
        icon: Radio,
        title: 'Historial de CTO, ONU y drop',
        desc: 'Punto de conexión, equipo y cada visita registrados por abonado. El técnico lo ve todo antes de llegar.',
      },
      {
        icon: Calendar,
        title: 'Agendamiento de visitas',
        desc: 'Asigna tickets al técnico más cercano, planifica la ruta y dale al cliente una ventana de llegada.',
      },
      {
        icon: Boxes,
        title: 'Control de equipos',
        desc: 'ONU, router y drop registrados en la instalación y el retiro, con descuento automático de stock.',
      },
      {
        icon: MapPin,
        title: 'Seguimiento en campo',
        desc: 'Mira en el mapa dónde está cada técnico y ten registros de llegada validados por la dirección del abonado.',
      },
      {
        icon: RefreshCw,
        title: 'Problemas recurrentes bajo control',
        desc: 'El historial de tickets por abonado deja claro cuándo volvió un problema y qué ya se intentó.',
      },
      {
        icon: FileSignature,
        title: 'Reporte de visita con tu marca',
        desc: 'PDF listo apenas termina la instalación o reparación, con tu logo y la firma del cliente.',
      },
      {
        icon: BarChart3,
        title: 'Panel de operaciones',
        desc: 'Tickets por estado, tiempo promedio de conclusión y calificaciones de abonados en un panel en vivo.',
      },
    ],
    testimonials: [
      {
        quote:
          'Cada técnico anotaba a su manera. Ahora el historial de CTO y ONU vive en el abonado. El soporte se volvió mucho más rápido.',
        name: 'Fábio M.',
        role: 'Coordinador Técnico',
        company: 'proveedor regional de internet',
      },
      {
        quote:
          'El agendamiento organizó nuestro ruteo. El técnico hace más instalaciones de fibra por día y el cliente deja de esperar todo el día.',
        name: 'Juliana C.',
        role: 'Gerente de Operaciones',
        company: 'ISP de fibra',
      },
      {
        quote:
          'Los equipos desaparecían en el camino. Con el descuento por orden de trabajo, sé dónde está cada ONU y cada router.',
        name: 'Rodrigo A.',
        role: 'Socio',
        company: 'proveedor de banda ancha',
      },
    ],
    faq: [
      {
        q: '¿Dominex sirve para proveedores de internet y empresas de telecomunicaciones?',
        a: 'Sí. Fue creado para ISPs y empresas de telecom que instalan fibra, atienden tickets de soporte y gestionan equipos en campo. Registras cada abonado con su punto de conexión, guardas el historial de CTO y ONU y organizas órdenes de trabajo, agendamiento y reportes en un solo lugar.',
      },
      {
        q: '¿Puedo registrar la CTO y la ONU de cada abonado?',
        a: 'Sí. Cada abonado conserva la CTO de origen, el puerto, el modelo y número de serie de la ONU, el router y el drop instalado, además de todas las visitas anteriores. El técnico ve el historial completo antes de llegar a la dirección.',
      },
      {
        q: '¿Hay agendamiento de visitas y ruteo?',
        a: 'Sí. Los tickets de instalación y soporte entran en la agenda y se asignan al técnico más cercano, con la ruta del día planificada para reducir el tiempo de traslado. El cliente recibe una ventana de llegada previsible y reduces las visitas perdidas.',
      },
      {
        q: '¿Puedo controlar los equipos (ONU, router, drop)?',
        a: 'Sí. Cada equipo se registra en la instalación y el retiro por orden de trabajo, con descuento automático de stock. Sabes dónde está cada ONU y cada router y evitas perder equipos.',
      },
      {
        q: '¿El técnico trabaja desde el teléfono? ¿Hay una app para instalar?',
        a: 'Sí, todo pasa en el teléfono. Dominex es una app que se instala directamente en el dispositivo del técnico (PWA), sin descarga de tienda. En la instalación abre la orden de trabajo, registra la CTO y la ONU, toma fotos, completa el checklist y captura la firma del abonado directo desde el teléfono. La orden de trabajo queda lista en el momento.',
      },
      {
        q: '¿Puedo dar seguimiento a los tickets recurrentes?',
        a: 'Sí. El historial de tickets por abonado deja claro cuándo volvió un problema y qué ya se intentó, ayudando a tu equipo de soporte a resolverlo de una vez en lugar de tratar cada ticket como nuevo.',
      },
      {
        q: '¿Puedo ver dónde están mis técnicos en campo?',
        a: 'Sí. El mapa en vivo muestra dónde está cada técnico, y el registro de llegada de la visita se valida por la dirección del abonado. Vigilas la operación sin hacer llamadas.',
      },
      {
        q: '¿Cómo empiezo? ¿Necesito una tarjeta de crédito?',
        a: 'Solo crea tu cuenta y úsalo gratis por 14 días, sin tarjeta. Configuras tu empresa en minutos, registras tus abonados y empiezas a abrir órdenes de trabajo. Cancela cuando quieras, y tus datos se conservan si decides suscribirte.',
      },
    ],
    finalCta: {
      title: 'Pon tu ISP al control del campo',
      subtitle:
        'Gratis por 14 días, sin tarjeta, sin complicaciones. Registra tus abonados, organiza tus instalaciones de fibra y lleva a tu cuadrilla de soporte a lo digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Seguridad / CCTV
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-cftv': {
    slug: 'software-cctv-seguridad',
    metaTitle:
      'Software de órdenes de trabajo para empresas de CCTV y sistemas de seguridad | Dominex',
    metaDescription:
      'Software para empresas de CCTV y seguridad electrónica: órdenes de instalación y mantenimiento de cámaras, alarmas y control de acceso, historial por equipo, contratos de monitoreo recurrentes y app móvil para tus técnicos en campo. Prueba gratis de 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Para empresas de CCTV y seguridad electrónica',
      h1: 'Software de órdenes de trabajo para empresas de CCTV y sistemas de seguridad',
      h1Highlight: 'CCTV y sistemas de seguridad',
      subtitle:
        'Cámara instalada, alarma configurada, control de acceso entregado, ¿y el historial desaparece? Dominex organiza tus órdenes de trabajo, guarda el registro de cada equipo y mantiene tus contratos de monitoreo andando.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'CCTV', label: 'instalación y mantenimiento con historial por equipo' },
      { value: '100%', label: 'en el teléfono de tu técnico en campo' },
      { value: '4.9/5', label: 'satisfacción de las empresas que lo usan' },
    ],
    pains: [
      {
        pain: '"¿Cuántas cámaras tiene este cliente y qué DVR está instalado?"',
        solution:
          'Cada cliente conserva el registro: cantidad y modelo de cámaras, DVR/NVR, alarma, sensores, control de acceso y cada visita. El técnico abre la orden de trabajo y lo ve todo, sin llamar a la oficina.',
      },
      {
        pain: 'Contrato de monitoreo olvidado hasta que la cámara falla y el cliente lo nota',
        solution:
          'Los contratos de monitoreo y mantenimiento con cadencia configurable generan las órdenes de inspección por su cuenta. Te adelantas a una falla en vez de enterarte junto con el cliente.',
      },
      {
        pain: 'Mantenimiento y rondas hechos sin nada que lo pruebe',
        solution:
          'El técnico cierra la orden de trabajo con fotos de las cámaras y el sistema, un checklist de inspección completo y la firma del cliente. Pruebas cada visita y proteges el contrato.',
      },
      {
        pain: 'Cuadrilla dispersa en varias instalaciones sin control',
        solution:
          'El mapa en vivo muestra dónde está cada técnico, con registros de llegada validados por la dirección del cliente. La agenda y la ruta quedan organizadas incluso con muchos trabajos en un día.',
      },
    ],
    deepDives: [
      {
        icon: Shield,
        title: 'Historial de cámaras, alarma y control de acceso',
        body: 'Registra cada cliente con la instalación montada: cámaras (modelo, posición, IP), DVR/NVR, panel de alarma, sensores, cerraduras y control de acceso. Instalación, mantenimiento correctivo, reposicionamiento o cambio de equipo, todo queda ligado al cliente. Cuando el técnico vuelve, ya sabe qué hay ahí y qué se hizo antes.',
        image: {
          src: '/segmentos/cftv/1.webp',
          alt: 'Un conjunto de cámaras de seguridad CCTV montadas en un poste apuntando en varias direcciones',
        },
      },
      {
        icon: RefreshCw,
        title: 'Contratos de monitoreo y mantenimiento recurrentes',
        body: 'El monitoreo y el mantenimiento periódico del sistema de seguridad son el ingreso recurrente del negocio. Configura el contrato con la cadencia de inspección (mensual, trimestral) y Dominex genera las órdenes de trabajo automáticamente en el intervalo correcto, con el checklist de rondas técnicas listo. El servicio preventivo pasa sin que tengas que acordarte.',
        image: {
          src: '/segmentos/cftv/2.webp',
          alt: 'Operador en una sala de monitoreo observando las tomas de cámaras en varias pantallas',
        },
      },
      {
        icon: Smartphone,
        title: 'Todo en el teléfono del técnico, en la propia fachada',
        body: 'La instalación y el mantenimiento de CCTV pasan en azoteas, fachadas y estacionamientos, y el técnico resuelve todo desde el teléfono en el sitio. La app de Dominex se instala directamente en el dispositivo (PWA): abre la orden de trabajo, fotografía cada cámara, registra el equipo, completa el checklist y captura la firma del cliente ahí mismo. La orden de trabajo queda lista en el momento, sin volver a la oficina a cerrarla.',
        image: {
          src: '/segmentos/cftv/3.webp',
          alt: 'Una cámara de seguridad tipo domo montada en la fachada de un edificio',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Órdenes de trabajo digitales',
        desc: 'Instalación, mantenimiento y reparación en segundos, con fotos, checklist y firma del cliente en la app.',
      },
      {
        icon: Shield,
        title: 'Historial de la instalación montada',
        desc: 'Cámaras, DVR/NVR, alarma y control de acceso registrados por cliente. El técnico lo ve todo antes de llegar.',
      },
      {
        icon: RefreshCw,
        title: 'Contratos de monitoreo',
        desc: 'El mantenimiento y la inspección generan las órdenes de trabajo por su cuenta en el intervalo correcto, por cliente.',
      },
      {
        icon: Calendar,
        title: 'Agenda inteligente',
        desc: 'Planifica rutas de la cuadrilla, asigna trabajos al técnico más cercano y evita conflictos de horario.',
      },
      {
        icon: MapPin,
        title: 'Seguimiento en campo',
        desc: 'Mira en el mapa dónde está cada técnico y ten registros de llegada validados por la dirección del cliente.',
      },
      {
        icon: Boxes,
        title: 'Inventario de equipos',
        desc: 'Controla cámaras, cable, conectores y paneles usados en cada orden de trabajo, con descuento automático.',
      },
      {
        icon: FileSignature,
        title: 'Reporte de visita con tu marca',
        desc: 'PDF listo apenas termina la instalación o el mantenimiento, con tu logo y la firma del cliente.',
      },
      {
        icon: BarChart3,
        title: 'Panel de operaciones',
        desc: 'Órdenes de trabajo por estado, tiempo promedio de conclusión y calificaciones de clientes en un panel en vivo.',
      },
    ],
    testimonials: [
      {
        quote:
          'Antes llegábamos al cliente sin idea de cuántas cámaras había. Ahora toda la instalación vive en el registro. El servicio es otro nivel.',
        name: 'Bruno S.',
        role: 'Dueño',
        company: 'instalaciones de CCTV y alarma',
      },
      {
        quote:
          'El contrato de monitoreo se volvió previsible. El sistema genera las órdenes de inspección y nos adelantamos a una falla antes de que el cliente reclame.',
        name: 'Aline R.',
        role: 'Coordinadora Técnica',
        company: 'seguridad electrónica comercial',
      },
      {
        quote:
          'Cuadrilla en varios trabajos el mismo día. Con la agenda y el mapa en vivo, dejé de llamar para saber dónde está cada uno.',
        name: 'Thiago P.',
        role: 'Gerente',
        company: 'control de acceso y CCTV',
      },
    ],
    faq: [
      {
        q: '¿Dominex sirve para empresas de CCTV y seguridad electrónica?',
        a: 'Sí. Fue creado para empresas que instalan y mantienen cámaras, alarmas, sensores y control de acceso. Registras la instalación montada de cada cliente, guardas el historial por equipo y organizas órdenes de trabajo, contratos de monitoreo y reportes en un solo lugar.',
      },
      {
        q: '¿Puedo registrar las cámaras y equipos de cada cliente?',
        a: 'Sí. Cada cliente conserva la cantidad y modelo de cámaras, el DVR/NVR, el panel de alarma, los sensores y el control de acceso, además de todas las visitas anteriores. El técnico ve el historial completo antes de llegar a la dirección.',
      },
      {
        q: '¿Cómo funcionan los contratos de monitoreo y mantenimiento?',
        a: 'Configuras el contrato con la cadencia de inspección (mensual, trimestral y demás) y Dominex genera las órdenes de trabajo automáticamente en el intervalo correcto, con el checklist de rondas técnicas listo. El mantenimiento preventivo pasa sin depender de la memoria de la cuadrilla.',
      },
      {
        q: '¿Puedo probar el mantenimiento y las rondas técnicas?',
        a: 'Sí. El técnico cierra la orden de trabajo con fotos de las cámaras y el sistema, un checklist de inspección completo y la firma del cliente en el momento. El reporte en PDF con tu marca queda listo para entregar y probar la visita.',
      },
      {
        q: '¿El técnico trabaja desde el teléfono? ¿Hay una app para instalar?',
        a: 'Sí, todo pasa en el teléfono. Dominex es una app que se instala directamente en el dispositivo del técnico (PWA), sin descarga de tienda. En el sitio abre la orden de trabajo, fotografía cada cámara, registra el equipo, completa el checklist y captura la firma del cliente directo desde el teléfono. La orden de trabajo queda lista en el momento.',
      },
      {
        q: '¿Puedo controlar el inventario de cámaras y equipos?',
        a: 'Sí. Controlas cámaras, cable, conectores y paneles usados en cada orden de trabajo, con descuento automático de stock. Así sabes qué tienes y qué entró en cada instalación.',
      },
      {
        q: '¿Puedo ver dónde está mi cuadrilla en campo?',
        a: 'Sí. El mapa en vivo muestra dónde está cada técnico, y el registro de llegada de la visita se valida por la dirección del cliente. Vigilas la operación incluso con muchos trabajos el mismo día.',
      },
      {
        q: '¿Cómo empiezo? ¿Necesito una tarjeta de crédito?',
        a: 'Solo crea tu cuenta y úsalo gratis por 14 días, sin tarjeta. Configuras tu empresa en minutos, registras tus clientes y empiezas a abrir órdenes de trabajo. Cancela cuando quieras, y tus datos se conservan si decides suscribirte.',
      },
    ],
    finalCta: {
      title: 'Pon tu operación de seguridad bajo control',
      subtitle:
        'Gratis por 14 días, sin tarjeta, sin complicaciones. Registra la instalación de cada cliente, automatiza tus contratos de monitoreo y lleva a tu cuadrilla a lo digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Construcción
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-construcao-civil': {
    slug: 'software-construccion',
    metaTitle:
      'Software de órdenes de trabajo para empresas constructoras y obras | Dominex',
    metaDescription:
      'Software para construcción: órdenes de trabajo para cuadrillas de campo, inspecciones y mediciones, seguimiento del cronograma, servicio de garantía posentrega con historial por unidad y app móvil para tu cuadrilla en la obra. Prueba gratis de 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Para constructoras y empresas de construcción',
      h1: 'Software de órdenes de trabajo para empresas constructoras',
      h1Highlight: 'construcción',
      subtitle:
        'Cuadrilla en la obra, inspección pendiente, reclamos de garantía sin registro? Dominex organiza las órdenes de trabajo de tus cuadrillas de campo, registra inspecciones y mediciones y guarda el historial de cada unidad en la palma de tu mano.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'Obra', label: 'cuadrillas de campo e inspecciones con registro fotográfico' },
      { value: '100%', label: 'en el teléfono de tu cuadrilla en la obra' },
      { value: '4.9/5', label: 'satisfacción de las empresas que lo usan' },
    ],
    pains: [
      {
        pain: '"¿Qué quedó pendiente en esta inspección?"',
        solution:
          'Cada inspección se convierte en una orden de trabajo con checklist, fotos y pendientes registrados. La cuadrilla abre la orden de trabajo y ve qué falta arreglar, con fecha límite y un responsable, sin planilla aparte.',
      },
      {
        pain: 'Servicio de garantía posentrega volviéndose un dolor de cabeza y clientes molestos',
        solution:
          'Cada unidad conserva el historial de reclamos de garantía. Cuando el cliente llama, la cuadrilla ya sabe qué se hizo antes y cierra el reclamo con foto y firma, sin retrabajos.',
      },
      {
        pain: 'Trabajo de contratistas medido de memoria, sin nada que lo pruebe',
        solution:
          'Registra la medición con fotos, checklist y descripción directo en la orden de trabajo. Documentas lo que realmente se hizo en campo antes de liberar el pago de cuadrilla o contratista.',
      },
      {
        pain: 'Cuadrillas dispersas en varias obras sin control',
        solution:
          'El mapa en vivo muestra dónde está cada cuadrilla, con registros de llegada validados por la dirección de la obra. La agenda y las tareas quedan organizadas incluso con varios frentes a la vez.',
      },
    ],
    deepDives: [
      {
        icon: HardHat,
        title: 'Órdenes de trabajo para cuadrillas de campo e inspecciones',
        body: 'Asigna tareas e inspecciones a tus cuadrillas de campo como órdenes de trabajo, cada una con checklist, fotos y pendientes. Inspección de entrega, inspección de etapa, medición de contratista o un arreglo, todo queda registrado con un responsable, una fecha límite y prueba fotográfica. La oficina sigue el avance sin ir a la obra.',
        image: {
          src: '/segmentos/construcao/1.webp',
          alt: 'Un trabajador con casco inspeccionando una obra de construcción',
        },
      },
      {
        icon: Building,
        title: 'Historial por unidad y servicio de garantía posentrega',
        body: 'Registra cada unidad o desarrollo y liga los reclamos de garantía a ella. Cuando el cliente solicita una reparación dentro de la garantía, la cuadrilla abre la orden de trabajo y ya ve el historial de esa unidad: qué se entregó, qué ya se arregló y qué sigue pendiente. El servicio de garantía deja de improvisarse y empieza a dejar rastro.',
        image: {
          src: '/segmentos/construcao/2.webp',
          alt: 'Un desarrollo residencial de varias plantas en construcción con andamios',
        },
      },
      {
        icon: Smartphone,
        title: 'Todo en el teléfono de la cuadrilla, en la propia obra',
        body: 'La obra es donde pasa el trabajo: sótanos, estructura, áreas en construcción, y la cuadrilla resuelve todo desde el teléfono en el sitio. La app de Dominex se instala directamente en el dispositivo (PWA): la cuadrilla abre la orden de trabajo, registra la inspección, toma fotos de la etapa, completa el checklist y captura la firma ahí mismo en el sitio. El reporte queda listo en el momento, sin rehacerlo en la oficina.',
        image: {
          src: '/segmentos/construcao/3.webp',
          alt: 'Un obrero revisando los planos del proyecto en una tablet en la obra',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Órdenes de trabajo para el campo',
        desc: 'Asigna tareas e inspecciones a las cuadrillas en segundos, con checklist, fotos y pendientes.',
      },
      {
        icon: Building,
        title: 'Historial por unidad y obra',
        desc: 'Inspecciones, mediciones y reclamos registrados por unidad. La cuadrilla ve el historial antes de actuar.',
      },
      {
        icon: ClipboardList,
        title: 'Inspecciones y mediciones con fotos',
        desc: 'Registro fotográfico y un checklist para cada etapa, con responsable y fecha límite, listos para probar.',
      },
      {
        icon: RefreshCw,
        title: 'Servicio de garantía posentrega',
        desc: 'Reclamos de garantía ligados a la unidad, con historial de lo que ya se arregló.',
      },
      {
        icon: MapPin,
        title: 'Seguimiento en campo',
        desc: 'Mira en el mapa dónde está cada cuadrilla y ten registros de llegada validados por la dirección de la obra.',
      },
      {
        icon: Calendar,
        title: 'Agenda y tareas de la cuadrilla',
        desc: 'Organiza los frentes de trabajo, asigna tareas y sigue el avance del cronograma.',
      },
      {
        icon: FileSignature,
        title: 'Reporte de inspección con tu marca',
        desc: 'PDF listo apenas termina la inspección o medición, con tu logo, fotos y firma.',
      },
      {
        icon: BarChart3,
        title: 'Panel de operaciones',
        desc: 'Órdenes de trabajo por estado, pendientes por obra y tiempo promedio de conclusión en un panel en vivo.',
      },
    ],
    testimonials: [
      {
        quote:
          'Las inspecciones vivían en planillas y fotos sueltas en un teléfono. Ahora cada pendiente se convierte en una orden de trabajo con fecha límite y un responsable. La oficina sigue el avance sin ir a la obra.',
        name: 'Eduardo M.',
        role: 'Ingeniero de Obra',
        company: 'constructora de desarrollos',
      },
      {
        quote:
          'El servicio de garantía posentrega era un caos. Ahora cada unidad tiene historial y la cuadrilla llega sabiendo qué ya se arregló. El cliente siente la diferencia.',
        name: 'Renata B.',
        role: 'Coordinadora de Posentrega',
        company: 'desarrolladora y constructora',
      },
      {
        quote:
          'Cuadrillas en varias obras a la vez. Con el mapa en vivo y las tareas, sé qué hace cada frente sin llamar a nadie.',
        name: 'Sérgio T.',
        role: 'Jefe de Campo',
        company: 'empresa de construcción y remodelación',
      },
    ],
    faq: [
      {
        q: '¿Dominex sirve para empresas constructoras?',
        a: 'Sí. Fue creado para constructoras, desarrolladoras y empresas de construcción que necesitan organizar cuadrillas de campo, inspecciones, mediciones y servicio de garantía posentrega. Asignas tareas como órdenes de trabajo, registras cada etapa con fotos y guardas el historial por unidad en un solo lugar.',
      },
      {
        q: '¿Puedo registrar inspecciones y pendientes?',
        a: 'Sí. Cada inspección se convierte en una orden de trabajo con checklist, fotos y pendientes, cada uno con un responsable y una fecha límite. La oficina sigue qué falta arreglar sin ir a la obra.',
      },
      {
        q: '¿Puedo gestionar el servicio de garantía posentrega?',
        a: 'Sí. Cada unidad conserva el historial de reclamos de garantía. Cuando el cliente solicita una reparación dentro de la garantía, la cuadrilla abre la orden de trabajo y ya ve qué se entregó, qué se arregló y qué sigue pendiente, sin retrabajos.',
      },
      {
        q: '¿Cómo funcionan las mediciones en campo?',
        a: 'Registras la medición con fotos, checklist y descripción directo en la orden de trabajo. Así documentas lo que realmente se hizo en campo antes de liberar el pago de cuadrilla o contratista, con prueba visual.',
      },
      {
        q: '¿La cuadrilla trabaja desde el teléfono? ¿Hay una app para instalar?',
        a: 'Sí, todo pasa en el teléfono. Dominex es una app que se instala directamente en el dispositivo de la cuadrilla (PWA), sin descarga de tienda. En la obra la cuadrilla abre la orden de trabajo, registra la inspección, toma fotos de la etapa, completa el checklist y captura la firma directo desde el teléfono. El reporte queda listo en el momento.',
      },
      {
        q: '¿Puedo seguir el avance del cronograma?',
        a: 'Sí. Las tareas y frentes de trabajo quedan organizados en la agenda, y el panel muestra las órdenes de trabajo por estado y los pendientes por obra. Sigues el avance de la cuadrilla sin depender de un reporte manual.',
      },
      {
        q: '¿Puedo ver dónde están mis cuadrillas en campo?',
        a: 'Sí. El mapa en vivo muestra dónde está cada cuadrilla, y el registro de llegada de la visita se valida por la dirección de la obra. Vigilas varios frentes a la vez sin hacer llamadas.',
      },
      {
        q: '¿Cómo empiezo? ¿Necesito una tarjeta de crédito?',
        a: 'Solo crea tu cuenta y úsalo gratis por 14 días, sin tarjeta. Configuras tu empresa en minutos, registras tus obras y empiezas a asignar órdenes de trabajo. Cancela cuando quieras, y tus datos se conservan si decides suscribirte.',
      },
    ],
    finalCta: {
      title: 'Pon a tus cuadrillas de obra bajo control',
      subtitle:
        'Gratis por 14 días, sin tarjeta, sin complicaciones. Organiza inspecciones, mediciones y servicio de garantía posentrega y lleva a tus cuadrillas de campo a lo digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Ascensores
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-elevadores': {
    slug: 'software-mantenimiento-ascensores',
    metaTitle:
      'Software de órdenes de trabajo para empresas de mantenimiento de ascensores | Dominex',
    metaDescription:
      'Software para empresas de mantenimiento de ascensores: órdenes de trabajo preventivas y de emergencia, contratos mensuales recurrentes, historial por unidad, llamados de emergencia y app móvil para tus técnicos en la sala de máquinas. Prueba gratis de 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Para empresas de mantenimiento de ascensores',
      h1: 'Software de órdenes de trabajo para empresas de mantenimiento de ascensores',
      h1Highlight: 'mantenimiento de ascensores',
      subtitle:
        'Contrato mensual, preventivo a tiempo, llamado de emergencia atendido, ¿y el historial de cada ascensor desaparece? Dominex organiza tus órdenes de trabajo, mantiene tus contratos recurrentes andando y guarda el registro de cada unidad.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'Mensual', label: 'contratos preventivos generando órdenes por su cuenta' },
      { value: '100%', label: 'en el teléfono de tu técnico en la sala de máquinas' },
      { value: '4.9/5', label: 'satisfacción de las empresas que lo usan' },
    ],
    pains: [
      {
        pain: '"¿Qué se hizo en este ascensor en el último preventivo?"',
        solution:
          'Cada ascensor conserva el historial completo: marca, capacidad, número de paradas, piezas reemplazadas y todas las visitas. El técnico abre la orden de trabajo y lo ve todo, sin llamar a la oficina.',
      },
      {
        pain: 'Preventivo mensual olvidado hasta que se cuestiona el contrato',
        solution:
          'Los contratos de mantenimiento mensual generan las órdenes de trabajo preventivas automáticamente, en el intervalo correcto, con el checklist de rutina listo. Cumples el contrato sin depender de que alguien se acuerde.',
      },
      {
        pain: 'Llamado de emergencia atendido sin registro de quién fue ni qué se arregló',
        solution:
          'El llamado de emergencia se convierte en una orden de trabajo con la hora, el técnico, una descripción y una foto de lo que se arregló. Puedes probar la respuesta y el tiempo de respuesta en cualquier momento.',
      },
      {
        pain: 'Prueba de mantenimiento y cumplimiento dispersa en papel',
        solution:
          'Cada visita genera un reporte en PDF con tu marca, con el checklist completo y la firma del administrador del edificio o responsable. El historial de cumplimiento del ascensor queda organizado y listo para presentar.',
      },
    ],
    deepDives: [
      {
        icon: Building,
        title: 'Historial completo por ascensor',
        body: 'Registra cada ascensor con marca, modelo, capacidad, número de paradas, tipo de máquina y ubicación en el edificio. Preventivo, correctivo, reemplazo de pieza o modernización, todo queda ligado al equipo, no solo al edificio. Cuando el técnico vuelve, sabe exactamente qué se hizo en la última visita y qué piezas ya se reemplazaron.',
        image: {
          src: '/segmentos/elevadores/1.webp',
          alt: 'Puertas de ascensor en acero inoxidable en el vestíbulo de un edificio moderno',
        },
      },
      {
        icon: RefreshCw,
        title: 'Contratos mensuales que generan el preventivo por su cuenta',
        body: 'El mantenimiento preventivo mensual es la columna vertebral de un contrato de ascensores. Configura el contrato con una cadencia mensual y Dominex genera las órdenes de trabajo automáticamente en el intervalo correcto, con el checklist de rutina preventiva listo. Nunca te pierdes una visita contractual y nunca quedas mal si el cliente cuestiona la frecuencia.',
        image: {
          src: '/segmentos/elevadores/2.webp',
          alt: 'Técnico realizando mantenimiento en maquinaria industrial',
        },
      },
      {
        icon: Smartphone,
        title: 'Todo en el teléfono del técnico, en la propia sala de máquinas',
        body: 'La sala de máquinas, el foso y el hueco son donde pasa el trabajo, y el técnico resuelve todo desde el teléfono ahí mismo. La app de Dominex se instala directamente en el dispositivo (PWA): abre la orden de trabajo, completa el checklist de inspección, registra piezas, toma fotos y captura la firma del responsable en el sitio. El reporte queda listo en el momento, sin rehacerlo en la oficina.',
        image: {
          src: '/segmentos/elevadores/3.webp',
          alt: 'Vista de un foso de ascensor industrial iluminado',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Órdenes de trabajo digitales',
        desc: 'Preventivo, correctivo y emergencia en segundos, con checklist, fotos y firma en la app.',
      },
      {
        icon: Building,
        title: 'Historial por ascensor',
        desc: 'Marca, capacidad, paradas y piezas reemplazadas registrados por unidad. El técnico lo ve todo antes de llegar.',
      },
      {
        icon: RefreshCw,
        title: 'Contratos mensuales recurrentes',
        desc: 'El preventivo mensual genera las órdenes de trabajo por su cuenta, en el intervalo correcto, por ascensor.',
      },
      {
        icon: Calendar,
        title: 'Llamado de emergencia',
        desc: 'Servicio de emergencia registrado con hora, técnico y un tiempo de respuesta comprobado.',
      },
      {
        icon: MapPin,
        title: 'Seguimiento en campo',
        desc: 'Mira en el mapa dónde está cada técnico y ten registros de llegada validados por la dirección del edificio.',
      },
      {
        icon: Boxes,
        title: 'Inventario de piezas',
        desc: 'Controla piezas y componentes usados en cada orden de trabajo, con descuento automático de stock.',
      },
      {
        icon: FileSignature,
        title: 'Reporte de mantenimiento con tu marca',
        desc: 'PDF listo apenas termina la visita, con tu logo, checklist y la firma del responsable.',
      },
      {
        icon: BarChart3,
        title: 'Panel de operaciones',
        desc: 'Órdenes de trabajo por estado, tiempo de respuesta de emergencia y visitas por contrato en un panel en vivo.',
      },
    ],
    testimonials: [
      {
        quote:
          'Ahora cada ascensor tiene historial de piezas y preventivos. El técnico llega sabiendo qué se hizo la última vez. Se acabó el "no lo sabía".',
        name: 'Marcos V.',
        role: 'Gerente Técnico',
        company: 'mantenimiento de ascensores',
      },
      {
        quote:
          'El preventivo mensual genera las órdenes de trabajo por su cuenta. Ningún administrador me volvió a cobrar por una visita que no pudiera probar.',
        name: 'Cláudia F.',
        role: 'Técnica Responsable',
        company: 'servicio de ascensores',
      },
      {
        quote:
          'Los llamados de emergencia quedan todos registrados con hora y tiempo de respuesta. Eso pesó mucho en las renovaciones de contrato.',
        name: 'Henrique L.',
        role: 'Socio',
        company: 'ascensores y plataformas',
      },
    ],
    faq: [
      {
        q: '¿Dominex sirve para empresas de mantenimiento de ascensores?',
        a: 'Sí. Fue creado para empresas que hacen mantenimiento preventivo y correctivo de ascensores bajo contrato mensual. Registras cada ascensor, guardas el historial por unidad, generas los preventivos automáticamente y registras los llamados de emergencia en un solo lugar.',
      },
      {
        q: '¿Cómo funcionan los contratos preventivos mensuales?',
        a: 'Configuras el contrato con una cadencia mensual y Dominex genera las órdenes de trabajo preventivas automáticamente en el intervalo correcto, con el checklist de rutina listo. Cumples el contrato sin depender de la memoria de la cuadrilla y quedas protegido si se cuestiona la frecuencia.',
      },
      {
        q: '¿Puedo registrar el historial de cada ascensor?',
        a: 'Sí. Cada ascensor conserva marca, capacidad, número de paradas, piezas reemplazadas y todas las visitas anteriores. El técnico ve el historial completo del equipo antes de siquiera llegar al edificio.',
      },
      {
        q: '¿Cómo funcionan los llamados de emergencia?',
        a: 'El llamado de emergencia se convierte en una orden de trabajo con la hora de apertura, el técnico responsable, una descripción y una foto de lo que se arregló. Puedes probar la respuesta y el tiempo de respuesta en cualquier momento, lo que pesa en las renovaciones de contrato.',
      },
      {
        q: '¿El técnico trabaja desde el teléfono? ¿Hay una app para instalar?',
        a: 'Sí, todo pasa en el teléfono. Dominex es una app que se instala directamente en el dispositivo del técnico (PWA), sin descarga de tienda. En la sala de máquinas abre la orden de trabajo, completa el checklist de inspección, registra piezas, toma fotos y captura la firma del responsable directo desde el teléfono. El reporte queda listo en el momento.',
      },
      {
        q: '¿Genera un reporte de mantenimiento para el edificio?',
        a: 'Sí. Cada visita genera un reporte en PDF con tu marca, con el checklist completo y la firma del administrador del edificio o responsable. El historial de mantenimiento y cumplimiento del ascensor queda organizado y listo para presentar.',
      },
      {
        q: '¿Puedo controlar las piezas usadas en cada visita?',
        a: 'Sí. Registras las piezas y componentes usados en cada orden de trabajo, con descuento automático de stock. Así sabes qué entró en cada ascensor y mantienes el control de lo que tienes a mano.',
      },
      {
        q: '¿Cómo empiezo? ¿Necesito una tarjeta de crédito?',
        a: 'Solo crea tu cuenta y úsalo gratis por 14 días, sin tarjeta. Configuras tu empresa en minutos, registras tus ascensores y empiezas a abrir órdenes de trabajo. Cancela cuando quieras, y tus datos se conservan si decides suscribirte.',
      },
    ],
    finalCta: {
      title: 'Pon tu mantenimiento de ascensores bajo control',
      subtitle:
        'Gratis por 14 días, sin tarjeta, sin complicaciones. Registra tus ascensores, automatiza el preventivo mensual y lleva a tu cuadrilla de campo a lo digital.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Limpieza
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-limpeza-conservacao': {
    slug: 'software-limpieza',
    metaTitle:
      'Software de órdenes de trabajo para empresas de limpieza y conservación | Dominex',
    metaDescription:
      'Software para empresas de limpieza y conservación: órdenes de trabajo por sitio y contrato, checklists de limpieza, rondas con prueba de foto y firma, control de cuadrillas de campo y app móvil para tu equipo. Prueba gratis de 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Para empresas de limpieza y conservación',
      h1: 'Software de órdenes de trabajo para empresas de limpieza y conservación',
      h1Highlight: 'limpieza y conservación',
      subtitle:
        'Un sitio sin prueba de servicio, rondas sin registro, ¿un cliente cuestionando qué se hizo? Dominex organiza las órdenes de trabajo por contrato y sitio, con checklist, foto y firma que prueban cada limpieza.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'Sitio', label: 'servicio por contrato con prueba fotográfica' },
      { value: '100%', label: 'en el teléfono de tu cuadrilla en campo' },
      { value: '4.9/5', label: 'satisfacción de las empresas que lo usan' },
    ],
    pains: [
      {
        pain: '"¿Cómo le pruebo al cliente que la limpieza se hizo?"',
        solution:
          'Cada servicio cierra con un checklist completo, fotos de antes y después y la firma del supervisor en el sitio. Pruebas que se hizo y terminas la discusión del "no se hizo".',
      },
      {
        pain: 'Rondas y trabajo de rutina sin registro de quién vino y cuándo',
        solution:
          'La ronda se convierte en una orden de trabajo con un registro de llegada validado por ubicación y hora. Sabes exactamente quién estuvo en cada sitio y qué se hizo, sin depender de la palabra de la cuadrilla.',
      },
      {
        pain: 'Un contrato con varios sitios y sin control de lo que se hizo',
        solution:
          'Registra cada contrato con sus sitios y rutinas. Las órdenes de trabajo se generan en el intervalo correcto y sigues el cumplimiento de cada sitio en un panel, no por confianza.',
      },
      {
        pain: 'Cuadrillas dispersas en varios clientes sin visibilidad',
        solution:
          'El mapa en vivo muestra dónde está cada cuadrilla, con registros de llegada validados por la dirección del sitio. La agenda y las rutinas quedan organizadas incluso con muchos contratos a la vez.',
      },
    ],
    deepDives: [
      {
        icon: Sparkles,
        title: 'Órdenes de trabajo por contrato y sitio',
        body: 'Registra cada contrato con sus sitios de servicio y las rutinas de limpieza y conservación. Cada visita se convierte en una orden de trabajo con el checklist de la rutina, fotos y una firma. Sigues qué se hizo en cada sitio y tienes el registro listo para mostrarle al cliente cada vez que se cuestione el servicio.',
        image: {
          src: '/segmentos/limpeza/1.webp',
          alt: 'Una cuadrilla de limpieza profesional uniformada aspirando el piso de un espacio comercial',
        },
      },
      {
        icon: MapPin,
        title: 'Rondas y registro de llegada con prueba de ubicación y hora',
        body: 'La ronda y la rutina de conservación se registran con un registro de llegada validado por la dirección del sitio y la hora del paso. Sabes quién estuvo en cada ubicación, a qué hora y qué se hizo, con foto y firma. La prueba reemplaza la palabra de la cuadrilla y protege el contrato en cualquier auditoría del cliente.',
        image: {
          src: '/segmentos/limpeza/2.webp',
          alt: 'Un profesional de conservación haciendo una ronda y limpiando un pasillo de acceso',
        },
      },
      {
        icon: Smartphone,
        title: 'Todo en el teléfono de la cuadrilla, en el propio sitio',
        body: 'Los sitios de limpieza incluyen sótanos, estacionamientos y escaleras, y la cuadrilla resuelve todo desde el teléfono en el sitio. La app de Dominex se instala directamente en el dispositivo (PWA): la cuadrilla abre la orden de trabajo, marca el checklist de la rutina, toma fotos de antes y después y captura la firma del supervisor ahí mismo en el sitio. La prueba queda registrada en el momento, sin redactarla más tarde.',
        image: {
          src: '/segmentos/limpeza/3.webp',
          alt: 'Un trabajador de limpieza con equipo de protección secando el piso de un galpón con un escurridor',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Órdenes de trabajo por sitio',
        desc: 'Rutinas de limpieza y conservación en segundos, con checklist, fotos y firma en la app.',
      },
      {
        icon: Sparkles,
        title: 'Checklist de limpieza configurable',
        desc: 'Arma el paso a paso de cada rutina y asegúrate de que nada se pase por alto en el sitio.',
      },
      {
        icon: MapPin,
        title: 'Rondas con registro de llegada validado',
        desc: 'Un registro de quién pasó por cada sitio, con ubicación y hora comprobadas.',
      },
      {
        icon: RefreshCw,
        title: 'Contratos y rutinas recurrentes',
        desc: 'Las órdenes de trabajo del sitio se generan en el intervalo correcto, sin necesidad de planilla.',
      },
      {
        icon: Calendar,
        title: 'Agenda de la cuadrilla',
        desc: 'Organiza los sitios del día, asigna las cuadrillas y sigue el cumplimiento de las rutinas.',
      },
      {
        icon: FileSignature,
        title: 'Prueba de foto y firma',
        desc: 'Fotos de antes y después y la firma del supervisor cierran cada servicio, listas para presentar.',
      },
      {
        icon: BarChart3,
        title: 'Panel de operaciones',
        desc: 'Rutinas completadas por sitio, pendientes y calificaciones de clientes en un panel en vivo.',
      },
      {
        icon: Users,
        title: 'Control de cuadrillas de campo',
        desc: 'Mira en el mapa dónde está cada cuadrilla y sigue varios contratos a la vez.',
      },
    ],
    testimonials: [
      {
        quote:
          'El cliente insistía en que la limpieza no se había hecho. Ahora cada sitio tiene fotos de antes y después y una firma. La discusión se terminó.',
        name: 'Vanessa M.',
        role: 'Gerente de Contratos',
        company: 'empresa de limpieza y conservación',
      },
      {
        quote:
          'Las rondas ahora tienen un registro de llegada con hora y ubicación. Sé exactamente quién pasó por cada sitio y a qué hora.',
        name: 'Paulo R.',
        role: 'Supervisor de Operaciones',
        company: 'conservación de edificios',
      },
      {
        quote:
          'Con varios contratos andando a la vez, el panel me muestra qué se hizo en cada sitio sin que llame a nadie.',
        name: 'Sandra L.',
        role: 'Socia',
        company: 'servicios de limpieza tercerizados',
      },
    ],
    faq: [
      {
        q: '¿Dominex sirve para empresas de limpieza y conservación?',
        a: 'Sí. Fue creado para empresas que operan sitios y contratos de limpieza y conservación. Registras cada contrato con sus sitios y rutinas, generas las órdenes de trabajo, pruebas el servicio con foto y firma y sigues el cumplimiento en un solo lugar.',
      },
      {
        q: '¿Cómo le pruebo al cliente que la limpieza se hizo?',
        a: 'Cada servicio cierra con un checklist completo, fotos de antes y después y la firma del supervisor en el sitio. El reporte en PDF con tu marca queda listo para presentar, terminando la discusión del "no se hizo".',
      },
      {
        q: '¿Puedo registrar las rondas y la rutina de conservación?',
        a: 'Sí. La ronda se convierte en una orden de trabajo con un registro de llegada validado por la dirección del sitio y la hora del paso. Sabes quién estuvo en cada ubicación, a qué hora y qué se hizo, sin depender de la palabra de la cuadrilla.',
      },
      {
        q: '¿Puedo gestionar contratos con varios sitios?',
        a: 'Sí. Registras cada contrato con sus sitios y rutinas, las órdenes de trabajo se generan en el intervalo correcto y el panel muestra el cumplimiento de cada sitio. Sigues todo sin planilla y sin depender solo de la palabra de la cuadrilla.',
      },
      {
        q: '¿La cuadrilla trabaja desde el teléfono? ¿Hay una app para instalar?',
        a: 'Sí, todo pasa en el teléfono. Dominex es una app que se instala directamente en el dispositivo de la cuadrilla (PWA), sin descarga de tienda. En el sitio la cuadrilla abre la orden de trabajo, marca el checklist de la rutina, toma fotos de antes y después y captura la firma del supervisor directo desde el teléfono. La prueba queda registrada en el momento.',
      },
      {
        q: '¿Puedo armar el checklist de cada rutina de limpieza?',
        a: 'Sí. Armas checklists configurables con el paso a paso de cada rutina de limpieza y conservación, asegurándote de que nada se pase por alto en el sitio y que la cuadrilla siga el estándar acordado con el cliente.',
      },
      {
        q: '¿Puedo ver dónde están mis cuadrillas en campo?',
        a: 'Sí. El mapa en vivo muestra dónde está cada cuadrilla, y el registro de llegada se valida por la dirección del sitio. Sigues varios contratos a la vez sin hacer llamadas.',
      },
      {
        q: '¿Cómo empiezo? ¿Necesito una tarjeta de crédito?',
        a: 'Solo crea tu cuenta y úsalo gratis por 14 días, sin tarjeta. Configuras tu empresa en minutos, registras tus contratos y sitios y empiezas a abrir órdenes de trabajo. Cancela cuando quieras, y tus datos se conservan si decides suscribirte.',
      },
    ],
    finalCta: {
      title: 'Prueba cada limpieza y protege tus contratos',
      subtitle:
        'Gratis por 14 días, sin tarjeta, sin complicaciones. Registra tus sitios, organiza las rutinas y lleva a tus cuadrillas de campo a lo digital con prueba.',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Control de plagas
  // ──────────────────────────────────────────────────────────────────────────
  'sistema-para-dedetizacao': {
    slug: 'software-control-plagas',
    metaTitle:
      'Software de órdenes de trabajo para empresas de control de plagas | Dominex',
    metaDescription:
      'Software para empresas de control de plagas: órdenes de trabajo con registro de productos aplicados, certificados de servicio, contratos recurrentes, agendamiento periódico y app móvil para tus aplicadores en campo. Prueba gratis de 14 días, sin tarjeta.',
    hero: {
      eyebrow: 'Para empresas de control de plagas',
      h1: 'Software de órdenes de trabajo para empresas de control de plagas',
      h1Highlight: 'control de plagas',
      subtitle:
        'Productos aplicados sin registro, certificado hecho a último momento, ¿contrato recurrente olvidado? Dominex organiza tus órdenes de trabajo, registra los productos aplicados y emite un certificado con tu marca en cada visita.',
    },
    metrics: [
      { value: '50k+', label: 'órdenes de trabajo al mes en la plataforma' },
      { value: 'Certificado', label: 'emitido en cada visita' },
      { value: '100%', label: 'en el teléfono de tu aplicador en campo' },
      { value: '4.9/5', label: 'satisfacción de las empresas que lo usan' },
    ],
    pains: [
      {
        pain: '"¿Qué producto y dosis aplicamos para este cliente?"',
        solution:
          'Cada visita registra los productos aplicados, la dosis, el método y la plaga objetivo. El historial queda ligado al cliente, y el aplicador abre la orden de trabajo y ve qué se usó antes, sin llamar a la oficina.',
      },
      {
        pain: 'Certificado de servicio hecho a mano, después, sin estándar',
        solution:
          'El certificado de servicio sale en PDF con tu marca apenas termina la visita, con los productos aplicados, la fecha de validez y el técnico responsable. Entregado en el momento, sin retrabajos.',
      },
      {
        pain: 'Contrato recurrente olvidado hasta que vuelven las plagas y el cliente reclama',
        solution:
          'Los contratos de control de plagas con cadencia configurable generan las órdenes de retratamiento por su cuenta, en el intervalo correcto. Mantienes al cliente protegido y el contrato activo.',
      },
      {
        pain: 'Aplicador en campo sin nada que pruebe lo que se hizo',
        solution:
          'El aplicador cierra la orden de trabajo con fotos del trabajo, un checklist completo y la firma del cliente. Pruebas la aplicación y proteges a la empresa en cualquier inspección.',
      },
    ],
    deepDives: [
      {
        icon: Droplets,
        title: 'Registro de productos aplicados y certificado de servicio',
        body: 'Cada visita registra los productos aplicados, la dosis, el método (aspersión, cebadero, gel), la plaga objetivo y el técnico responsable. A partir de ese registro, el certificado de servicio sale en PDF con tu marca, con la fecha de validez y los productos usados, listo para entregar al cliente y para presentar a un inspector sanitario. Nada se completa a mano después.',
        image: {
          src: '/segmentos/dedetizacao/1.webp',
          alt: 'Un técnico de control de plagas aplicando termonebulización con una máquina nebulizadora',
        },
      },
      {
        icon: RefreshCw,
        title: 'Contratos y agendamiento periódico de retratamiento',
        body: 'El control de plagas depende del retratamiento en la frecuencia correcta. Configura el contrato con la cadencia (mensual, bimestral, trimestral) y Dominex genera las órdenes de retratamiento automáticamente en el intervalo acordado, con el agendamiento ya hecho. El cliente queda protegido y no pierdes la renovación por olvido.',
        image: {
          src: '/segmentos/dedetizacao/2.webp',
          alt: 'Un aplicador con equipo de protección rociando producto durante un retratamiento',
        },
      },
      {
        icon: Smartphone,
        title: 'Todo en el teléfono del aplicador, en el propio sitio',
        body: 'El control de plagas pasa en galpones, sótanos y depósitos, y el aplicador resuelve todo desde el teléfono ahí mismo. La app de Dominex se instala directamente en el dispositivo (PWA): abre la orden de trabajo, registra los productos y la dosis, toma fotos del trabajo, completa el checklist y captura la firma del cliente en el sitio. El certificado queda listo en el momento, sin rehacerlo en la oficina.',
        image: {
          src: '/segmentos/dedetizacao/3.webp',
          alt: 'Un aplicador uniformado realizando control de plagas dentro de un galpón',
        },
      },
    ],
    features: [
      {
        icon: ClipboardList,
        title: 'Órdenes de trabajo digitales',
        desc: 'Control de plagas, control de roedores y retratamiento en segundos, con checklist, fotos y firma en la app.',
      },
      {
        icon: Droplets,
        title: 'Registro de productos aplicados',
        desc: 'Producto, dosis, método y plaga objetivo registrados por visita, con el historial ligado al cliente.',
      },
      {
        icon: FileSignature,
        title: 'Certificado de servicio',
        desc: 'PDF con tu marca con productos, fecha de validez y técnico responsable, listo apenas termina la visita.',
      },
      {
        icon: RefreshCw,
        title: 'Contratos de retratamiento recurrentes',
        desc: 'Las órdenes de retratamiento se generan en el intervalo correcto, por contrato.',
      },
      {
        icon: Calendar,
        title: 'Agendamiento periódico',
        desc: 'Agenda los retratamientos, asigna los aplicadores y nunca te pierdas la ventana del contrato.',
      },
      {
        icon: MapPin,
        title: 'Seguimiento en campo',
        desc: 'Mira en el mapa dónde está cada aplicador y ten registros de llegada validados por la dirección del cliente.',
      },
      {
        icon: Boxes,
        title: 'Inventario de productos',
        desc: 'Controla los químicos y cebos usados en cada orden de trabajo, con descuento automático de stock.',
      },
      {
        icon: BarChart3,
        title: 'Panel de operaciones',
        desc: 'Órdenes de trabajo por estado, retratamientos por contrato y calificaciones de clientes en un panel en vivo.',
      },
    ],
    testimonials: [
      {
        quote:
          'El certificado se hacía a mano, después, y trababa todo. Ahora sale con la marca en el momento en que el aplicador termina. El cliente lo recibe en la misma visita.',
        name: 'Gustavo M.',
        role: 'Dueño',
        company: 'control de plagas urbano',
      },
      {
        quote:
          'Cada cliente tiene el historial del producto y la dosis aplicada. Cuando vuelvo, sé exactamente qué usé la última vez.',
        name: 'Letícia A.',
        role: 'Técnica Responsable',
        company: 'control de plagas y roedores',
      },
      {
        quote:
          'Los contratos de retratamiento generan las órdenes de trabajo por su cuenta. Dejé de perder renovaciones por olvidar la frecuencia.',
        name: 'Roberto C.',
        role: 'Socio',
        company: 'control de plagas comercial',
      },
    ],
    faq: [
      {
        q: '¿Dominex sirve para empresas de control de plagas?',
        a: 'Sí. Fue creado para empresas de control de plagas y roedores. Registras cada cliente, anotas los productos aplicados en cada visita, emites el certificado de servicio y mantienes los contratos de retratamiento recurrentes en un solo lugar.',
      },
      {
        q: '¿El sistema genera el certificado de servicio?',
        a: 'Sí. Apenas termina la visita, el certificado de servicio sale en PDF con tu marca, con los productos aplicados, la fecha de validez y el técnico responsable. Lo entregas al cliente en el momento y tienes el documento listo para presentar a un inspector sanitario.',
      },
      {
        q: '¿Puedo registrar los productos y la dosis aplicada?',
        a: 'Sí. Cada visita registra los productos aplicados, la dosis, el método (aspersión, cebadero, gel) y la plaga objetivo. El historial queda ligado al cliente, y el aplicador ve qué se usó antes de llegar a la ubicación.',
      },
      {
        q: '¿Cómo funcionan los contratos periódicos de retratamiento?',
        a: 'Configuras el contrato con la cadencia que quieras (mensual, bimestral, trimestral y demás) y Dominex genera las órdenes de retratamiento automáticamente en el intervalo correcto, con el agendamiento ya hecho. El cliente queda protegido y no pierdes la renovación por olvido.',
      },
      {
        q: '¿El aplicador trabaja desde el teléfono? ¿Hay una app para instalar?',
        a: 'Sí, todo pasa en el teléfono. Dominex es una app que se instala directamente en el dispositivo del aplicador (PWA), sin descarga de tienda. En el sitio abre la orden de trabajo, registra los productos y la dosis, toma fotos del trabajo, completa el checklist y captura la firma del cliente directo desde el teléfono. El certificado queda listo en el momento.',
      },
      {
        q: '¿Puedo probar la aplicación en una inspección?',
        a: 'Sí. El aplicador cierra la orden de trabajo con fotos del trabajo, un checklist completo y la firma del cliente, y el certificado registra los productos y el técnico responsable. Pruebas cada aplicación y mantienes a la empresa en regla.',
      },
      {
        q: '¿Puedo controlar el inventario de químicos?',
        a: 'Sí. Controlas los químicos y cebos usados en cada orden de trabajo, con descuento automático de stock. Así sabes qué se aplicó para cada cliente y qué tienes disponible.',
      },
      {
        q: '¿Cómo empiezo? ¿Necesito una tarjeta de crédito?',
        a: 'Solo crea tu cuenta y úsalo gratis por 14 días, sin tarjeta. Configuras tu empresa en minutos, registras tus clientes y empiezas a abrir órdenes de trabajo. Cancela cuando quieras, y tus datos se conservan si decides suscribirte.',
      },
    ],
    finalCta: {
      title: 'Pon tu operación de control de plagas bajo control',
      subtitle:
        'Gratis por 14 días, sin tarjeta, sin complicaciones. Registra tus clientes, emite el certificado automáticamente y automatiza tus contratos de retratamiento.',
    },
  },
};

export default es;
