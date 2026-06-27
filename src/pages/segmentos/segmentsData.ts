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
  type LucideIcon,
  ClipboardList,
  MapPin,
  Calendar,
  RefreshCw,
  BarChart3,
  Smartphone,
  WifiOff,
  FileSignature,
  Wrench,
  Gauge,
  Boxes,
  Users,
} from 'lucide-react';

/**
 * Catálogo de páginas de segmento (landings de SEO por nicho).
 *
 * Cada entrada alimenta o componente genérico `SegmentLandingPage`. Para
 * adicionar um novo segmento na Onda 2: copie um bloco, troque o vocabulário
 * (dores/deep-dives/FAQ específicos do nicho), defina `slug` e registre a rota
 * em App.tsx + o link já aparece sozinho no dropdown do navbar (que lê deste
 * mesmo array via `SEGMENT_NAV_LINKS`).
 *
 * Regras:
 * - PT-BR sempre, copy dor-primeiro, marca = Dominex (nunca Auctus).
 * - `icon`/`label` espelham SegmentsSection.tsx (consistência interna).
 * - CTA principal NÃO muda: "Teste grátis 14 dias, sem cartão".
 */

export interface SegmentMetric {
  value: string;
  label: string;
}

export interface SegmentPain {
  /** A dor, na voz do dono da empresa. */
  pain: string;
  /** Como o Dominex resolve. */
  solution: string;
}

export interface SegmentDeepDive {
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface SegmentFeature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

export interface SegmentTestimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
}

export interface SegmentFaq {
  q: string;
  a: string;
}

export interface SegmentData {
  /** Slug da rota, ex: 'sistema-para-refrigeracao' (sem barra inicial). */
  slug: string;
  /**
   * Cor de acento (hex) do segmento — fonte canônica: companySegments.ts.
   * Usada nos DESTAQUES da página (degradê do H1, ícones de acento, bordas,
   * fundo WebGL) no lugar do verde da marca Dominex. Não troca a cor do corpo
   * de texto; é só o realce visual do nicho.
   */
  accentColor: string;
  /**
   * Override OPCIONAL do uHueShift do fundo WebGL (DarkVeil), por segmento.
   * Quando definido, o DarkVeilBackground usa este valor cru e IGNORA o cálculo
   * derivado do accentColor. Serve pra cravar shifts calibrados no browser
   * quando o modelo linear (ver GREEN_VISIBLE_HUE) não bate 100%. Deixe
   * undefined para usar o cálculo automático.
   */
  veilHueShift?: number;
  /** Rótulo curto do segmento, usado no dropdown do navbar. */
  navLabel: string;
  /** Ícone do segmento (espelha SegmentsSection). */
  icon: LucideIcon;
  /** <title> da aba. */
  metaTitle: string;
  /** <meta name="description">. */
  metaDescription: string;

  hero: {
    /** Selo/eyebrow acima do H1. */
    eyebrow: string;
    /** H1 — keyword-rico, dor-do-segmento. DEVE conter a keyword principal. */
    h1: string;
    /** Destaque colorido dentro do H1 (substring exata de `h1`). */
    h1Highlight: string;
    subtitle: string;
  };

  metrics: SegmentMetric[];
  pains: SegmentPain[];

  /** Blocos H2 de aprofundamento com vocabulário do setor. */
  deepDives: SegmentDeepDive[];

  features: SegmentFeature[];
  testimonials: SegmentTestimonial[];
  faq: SegmentFaq[];

  finalCta: {
    title: string;
    subtitle: string;
  };
}

/* ------------------------------------------------------------------ */
/* Refrigeração e Climatização — primeira página (template de referência) */
/* ------------------------------------------------------------------ */

const refrigeracao: SegmentData = {
  slug: 'sistema-para-refrigeracao',
  accentColor: '#06b6d4',
  navLabel: 'Refrigeração e Climatização',
  icon: Thermometer,
  metaTitle:
    'Sistema de ordem de serviço e PMOC para empresas de refrigeração e climatização | Dominex',
  metaDescription:
    'Software para empresas de refrigeração e climatização: ordens de serviço digitais, PMOC automático (Lei 13.589/2018), controle de gás por equipamento, app no celular para o técnico em campo e contratos de manutenção preventiva. Teste grátis 14 dias, sem cartão.',

  hero: {
    eyebrow: 'Para empresas de refrigeração e ar-condicionado',
    h1: 'Sistema de ordem de serviço e PMOC para empresas de refrigeração e climatização',
    h1Highlight: 'refrigeração e climatização',
    subtitle:
      'Chega de OS no papel e técnico sem histórico no campo. O Dominex centraliza suas ordens de serviço, automatiza o PMOC e mantém o registro de cada equipamento, gás e visita na palma da mão.',
  },

  metrics: [
    { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
    { value: 'PMOC', label: 'gerado automático pela Lei 13.589/2018' },
    { value: '100%', label: 'no celular do técnico em campo' },
    { value: '4,9/5', label: 'satisfação das empresas que usam' },
  ],

  pains: [
    {
      pain: '"Qual gás eu coloquei nessa máquina mesmo?"',
      solution:
        'Cada equipamento guarda o histórico completo: tipo de gás refrigerante, carga, pressões, superaquecimento e todas as visitas anteriores. O técnico abre a OS e vê tudo, sem ligar pro escritório.',
    },
    {
      pain: 'PMOC feito na correria, sem rastro e fora da lei',
      solution:
        'O Dominex gera o cronograma PMOC automaticamente por equipamento, conforme a Lei 13.589/2018, com checklist de cada visita, responsável técnico e relatório pronto pra fiscalização.',
    },
    {
      pain: 'Contrato de manutenção preventiva esquecido até o cliente reclamar',
      solution:
        'Contratos com recorrência configurável (mensal, bimestral, trimestral) geram as OS sozinhos no intervalo certo. Nunca mais perca uma preventiva nem um SLA.',
    },
    {
      pain: 'Relatório de visita feito à mão, horas depois, sem foto nem assinatura',
      solution:
        'O técnico fecha a OS no app com fotos antes/depois, checklist preenchido e assinatura do cliente na hora. O relatório em PDF com a sua marca sai pronto na sequência.',
    },
  ],

  deepDives: [
    {
      icon: Thermometer,
      title: 'Feito para split, câmara fria, chiller e VRF',
      body: 'Cadastre cada equipamento com marca, modelo, capacidade (BTU/TR), tipo de gás e localização. Split, multi-split, VRF, chiller, câmara fria, fancoil ou self-contained — o histórico fica amarrado à máquina, não ao cliente. Quando o técnico volta, ele sabe exatamente o que foi feito da última vez, qual o gás carregado e qual o superaquecimento alvo.',
    },
    {
      icon: RefreshCw,
      title: 'PMOC automático conforme a Lei 13.589/2018',
      body: 'O Plano de Manutenção, Operação e Controle exigido por lei é montado a partir dos equipamentos do contrato: o sistema distribui as visitas no ciclo, monta o checklist de cada uma, registra o responsável técnico e gera a planilha PMOC e o relatório de conformidade prontos pra apresentar em fiscalização. Você cumpre a lei sem planilha paralela.',
    },
    {
      icon: Smartphone,
      title: 'Tudo no celular do técnico, direto do telhado',
      body: 'O serviço de refrigeração acontece em cobertura, casa de máquinas e subsolo de shopping — e é tudo resolvido pelo celular. O app do Dominex é instalável no aparelho (PWA): o técnico abre a OS, tira foto, mede pressão, preenche o checklist e coleta a assinatura do cliente ali mesmo, no local do serviço. A OS sai pronta na hora, sem voltar pro escritório nem refazer relatório.',
    },
  ],

  features: [
    {
      icon: ClipboardList,
      title: 'Ordens de serviço digitais',
      desc: 'Crie, atribua e acompanhe OS de instalação, manutenção e corretiva em segundos, com fotos, checklist e assinatura do cliente.',
    },
    {
      icon: Gauge,
      title: 'Histórico de gás e equipamento',
      desc: 'Gás refrigerante, carga, pressões e superaquecimento registrados por máquina. O técnico vê tudo antes de subir no telhado.',
    },
    {
      icon: RefreshCw,
      title: 'PMOC e contratos recorrentes',
      desc: 'Cronograma PMOC automático e contratos de preventiva que geram as OS sozinhos no intervalo certo, por equipamento.',
    },
    {
      icon: MapPin,
      title: 'Rastreamento em campo',
      desc: 'Veja no mapa onde cada técnico está e tenha check-in validado por raio do endereço do cliente.',
    },
    {
      icon: Calendar,
      title: 'Agenda inteligente',
      desc: 'Monte a rota da equipe, distribua chamados pelo técnico mais próximo e evite conflito de horário.',
    },
    {
      icon: FileSignature,
      title: 'Relatório PMOC e de OS com sua marca',
      desc: 'PDF pronto ao finalizar a visita, com sua logo e cores, para entregar ao cliente e à fiscalização.',
    },
    {
      icon: Boxes,
      title: 'Estoque de peças e gás',
      desc: 'Controle peças, filtros e cilindros de gás usados em cada OS, com baixa automática no estoque.',
    },
    {
      icon: BarChart3,
      title: 'Indicadores da operação',
      desc: 'OS por status, tempo médio de atendimento e avaliação do cliente em um painel ao vivo.',
    },
  ],

  testimonials: [
    {
      quote:
        'Parei de perder o histórico das máquinas. O técnico chega no cliente, abre a OS e já sabe qual gás está carregado e o que foi feito na última visita.',
      name: 'Carlos M.',
      role: 'Gestor de Operações',
      company: 'empresa de refrigeração comercial',
    },
    {
      quote:
        'O PMOC era um pesadelo de planilha. Agora o sistema monta o cronograma e o relatório sozinho. Apresentei pra fiscalização sem suar.',
      name: 'Roberta S.',
      role: 'Responsável Técnica',
      company: 'climatização predial',
    },
    {
      quote:
        'A equipe trabalha o dia todo no campo e faz tudo pelo celular. O técnico fecha a OS na frente do cliente, com foto e assinatura — a operação ficou muito mais ágil.',
      name: 'André P.',
      role: 'Fundador',
      company: 'manutenção de ar-condicionado',
    },
  ],

  faq: [
    {
      q: 'O Dominex serve para empresas de refrigeração e climatização?',
      a: 'Sim. Foi feito para empresas que instalam e mantêm split, multi-split, VRF, chiller, câmara fria, self-contained e fancoil. Você cadastra cada equipamento, controla o gás refrigerante, gera PMOC e organiza contratos de manutenção preventiva em um só lugar.',
    },
    {
      q: 'O PMOC é obrigatório? O sistema gera o PMOC?',
      a: 'O PMOC (Plano de Manutenção, Operação e Controle) é exigido pela Lei Federal 13.589/2018 para sistemas de climatização de uso coletivo. O Dominex monta o cronograma PMOC automaticamente a partir dos equipamentos do contrato, com checklist por visita, responsável técnico e relatório de conformidade pronto para fiscalização.',
    },
    {
      q: 'O técnico usa pelo celular? Precisa instalar algum app?',
      a: 'Sim, é tudo no celular. O Dominex é um app instalável no aparelho do técnico (PWA) — sem precisar baixar nada da loja. No local do serviço, ele abre a OS, tira fotos, registra pressões, preenche o checklist e coleta a assinatura do cliente direto pelo celular. A OS sai pronta na hora.',
    },
    {
      q: 'Consigo controlar o gás e o histórico de cada equipamento?',
      a: 'Sim. Cada equipamento guarda o tipo de gás refrigerante, a carga, pressões, superaquecimento e todas as visitas anteriores. O técnico vê o histórico completo da máquina antes mesmo de chegar no cliente.',
    },
    {
      q: 'Gera relatório de PMOC e de ordem de serviço com a minha marca?',
      a: 'Sim. Os relatórios de OS e os documentos de PMOC saem em PDF com a sua logo e cores. No plano com White Label, toda a apresentação ao cliente fica com a identidade da sua empresa.',
    },
    {
      q: 'Como funcionam os contratos de manutenção preventiva?',
      a: 'Você cadastra o contrato com a recorrência desejada (mensal, bimestral, trimestral etc.) e o Dominex gera as ordens de serviço automaticamente no intervalo certo, por equipamento. Você nunca mais esquece uma preventiva ou fura um SLA.',
    },
    {
      q: 'Tenho ferramentas técnicas de refrigeração no sistema?',
      a: 'Sim. A Área do Técnico traz calculadoras e tabelas do dia a dia: curvas de pressão por temperatura dos gases, superaquecimento, dimensionamento e um catálogo de equipamentos — tudo acessível direto no celular, em campo.',
    },
    {
      q: 'Como começo a usar? Precisa de cartão?',
      a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura sua empresa em minutos, cadastra os equipamentos e já começa a abrir OS. Cancela quando quiser e seus dados ficam preservados se decidir assinar.',
    },
  ],

  finalCta: {
    title: 'Domine sua operação de refrigeração',
    subtitle:
      '14 dias grátis, sem cartão, sem burocracia. Cadastre seus equipamentos, gere o PMOC e coloque sua equipe de campo no controle.',
  },
};

/* ------------------------------------------------------------------ */
/* Instalações Elétricas                                              */
/* ------------------------------------------------------------------ */

const eletricistas: SegmentData = {
  slug: 'sistema-para-eletricistas',
  accentColor: '#f59e0b',
  veilHueShift: 200, // calibrado no browser: empurra o veil pro laranja (vs amarelo-esverdeado do cálculo)
  navLabel: 'Instalações Elétricas',
  icon: Zap,
  metaTitle:
    'Sistema de ordem de serviço para eletricistas e empresas de instalações elétricas | Dominex',
  metaDescription:
    'Software para empresas de instalações e manutenção elétrica: ordens de serviço digitais, laudos e ART por cliente, registro de quadros e padrão de entrada, checklist NR-10 e app no celular para o eletricista em campo. Teste grátis 14 dias, sem cartão.',

  hero: {
    eyebrow: 'Para eletricistas e empresas de instalações elétricas',
    h1: 'Sistema de ordem de serviço para empresas de instalações elétricas',
    h1Highlight: 'instalações elétricas',
    subtitle:
      'Quadro montado, padrão de entrada trocado, manutenção feita — e nada disso virou registro? O Dominex digitaliza suas ordens de serviço, guarda o histórico de cada instalação e coloca laudo, checklist e foto na mão do eletricista.',
  },

  metrics: [
    { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
    { value: 'NR-10', label: 'checklist de segurança em cada visita' },
    { value: '100%', label: 'no celular do eletricista em campo' },
    { value: '4,9/5', label: 'satisfação das empresas que usam' },
  ],

  pains: [
    {
      pain: '"O que a gente fez no quadro desse cliente da última vez?"',
      solution:
        'Cada cliente e cada ponto de instalação guarda o histórico: padrão de entrada, disjuntores trocados, cargas, quadros e o que foi feito em cada visita. O eletricista abre a OS e enxerga tudo, sem ligar pro escritório.',
    },
    {
      pain: 'Laudo e ART perdidos no e-mail, no WhatsApp ou na gaveta',
      solution:
        'Anexe laudos, ART e fotos do serviço direto na ordem de serviço do cliente. Tudo fica organizado por endereço e por equipamento, pronto pra reenviar quando o cliente pedir.',
    },
    {
      pain: 'Orçamento de instalação feito de cabeça, sem padrão e sem rastro',
      solution:
        'Monte orçamentos com itens, mão de obra e material, envie por link e acompanhe a aprovação. Aprovado, vira ordem de serviço com um clique, já com a equipe escalada.',
    },
    {
      pain: 'Segurança do serviço sem comprovação de NR-10',
      solution:
        'Checklists configuráveis garantem o passo a passo de segurança e desenergização em cada visita, com registro de quem executou, fotos e assinatura. Você comprova o procedimento se precisar.',
    },
  ],

  deepDives: [
    {
      icon: Zap,
      title: 'Histórico por padrão de entrada, quadro e circuito',
      body: 'Cadastre cada cliente com o padrão de entrada (monofásico, bifásico, trifásico), os quadros de distribuição, disjuntores e cargas. Manutenção preventiva, troca de disjuntor, instalação de novo circuito ou laudo — tudo fica amarrado ao ponto de instalação. Quando o eletricista volta ao local, ele já sabe o que existe ali e o que foi feito antes.',
    },
    {
      icon: FileSignature,
      title: 'Laudos, ART e relatório de OS com a sua marca',
      body: 'Ao finalizar a visita, o relatório da ordem de serviço sai em PDF com a sua logo e cores, com checklist preenchido, fotos antes/depois e assinatura do cliente na hora. Anexe a ART e o laudo técnico ao registro do cliente e tenha tudo num só lugar para entregar e comprovar o serviço.',
    },
    {
      icon: Smartphone,
      title: 'Tudo no celular do eletricista, direto da obra',
      body: 'Quadro montado, padrão de entrada trocado, inspeção feita — e o registro fica pronto no mesmo instante. O app do Dominex é instalável no celular do eletricista (PWA): no local do serviço ele abre a OS, tira foto antes/depois, percorre o checklist de segurança e coleta a assinatura do cliente ali mesmo. O relatório sai pronto na hora, sem voltar pra anotar no escritório.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos de manutenção elétrica recorrente',
      body: 'Condomínios, indústrias e comércios precisam de manutenção preventiva periódica do sistema elétrico. Cadastre o contrato com a recorrência certa (mensal, trimestral) e o Dominex gera as ordens de serviço sozinho no intervalo combinado, com o checklist da inspeção pronto. Você cumpre o contrato sem depender da memória de ninguém.',
    },
  ],

  features: [
    {
      icon: ClipboardList,
      title: 'Ordens de serviço digitais',
      desc: 'Instalação, manutenção e corretiva em segundos, com fotos, checklist e assinatura do cliente direto no app.',
    },
    {
      icon: Zap,
      title: 'Histórico de quadros e circuitos',
      desc: 'Padrão de entrada, disjuntores, cargas e o que foi feito em cada visita, registrado por ponto de instalação.',
    },
    {
      icon: FileSignature,
      title: 'Laudos, ART e relatório com sua marca',
      desc: 'Anexe ART e laudo ao cliente e gere o relatório de OS em PDF com sua logo ao fim de cada serviço.',
    },
    {
      icon: ClipboardList,
      title: 'Checklist de segurança NR-10',
      desc: 'Passo a passo de desenergização e inspeção em cada visita, com registro de quem executou.',
    },
    {
      icon: MapPin,
      title: 'Rastreamento em campo',
      desc: 'Veja no mapa onde cada eletricista está e tenha check-in validado pelo endereço do cliente.',
    },
    {
      icon: Calendar,
      title: 'Agenda inteligente',
      desc: 'Monte a rota da equipe, distribua chamados pelo eletricista mais próximo e evite conflito de horário.',
    },
    {
      icon: Boxes,
      title: 'Estoque de material elétrico',
      desc: 'Controle disjuntores, cabos, eletrodutos e conectores usados em cada OS, com baixa automática.',
    },
    {
      icon: BarChart3,
      title: 'Indicadores da operação',
      desc: 'OS por status, tempo médio de atendimento e avaliação do cliente em um painel ao vivo.',
    },
  ],

  testimonials: [
    {
      quote:
        'Antes era tudo na cabeça. Agora o eletricista chega no cliente e já vê o quadro, o padrão de entrada e o que foi trocado da última vez. Acabou o retrabalho.',
      name: 'Marcelo T.',
      role: 'Proprietário',
      company: 'instalações elétricas prediais',
    },
    {
      quote:
        'Os laudos e ARTs ficavam espalhados. Agora está tudo no cliente, organizado. Quando precisam, eu reenvio em segundos.',
      name: 'Patrícia L.',
      role: 'Responsável Técnica',
      company: 'manutenção elétrica industrial',
    },
    {
      quote:
        'O relatório com a minha logo e a assinatura do cliente na hora deu outra cara pra empresa. O cliente confia mais.',
      name: 'Diego F.',
      role: 'Fundador',
      company: 'serviços elétricos residenciais',
    },
  ],

  faq: [
    {
      q: 'O Dominex serve para empresas de instalações e manutenção elétrica?',
      a: 'Sim. Foi feito para eletricistas e empresas que instalam e mantêm sistemas elétricos: padrão de entrada, quadros de distribuição, instalações trifásicas, circuitos e manutenção preventiva. Você cadastra cada ponto de instalação, registra o histórico e gera ordens de serviço, orçamentos e relatórios em um só lugar.',
    },
    {
      q: 'Consigo anexar laudos e ART à ordem de serviço?',
      a: 'Sim. Você anexa laudos, ART e fotos diretamente ao cadastro do cliente e às ordens de serviço. Tudo fica organizado por endereço e por instalação, pronto para reenviar quando o cliente precisar.',
    },
    {
      q: 'Tem checklist de segurança para NR-10?',
      a: 'Sim. Você monta checklists configuráveis com o passo a passo de desenergização, inspeção e segurança que sua equipe deve seguir em cada visita, com registro de quem executou, fotos e assinatura. Assim você comprova o procedimento quando for necessário.',
    },
    {
      q: 'O eletricista usa pelo celular? Precisa instalar algum app?',
      a: 'Sim, é tudo no celular. O Dominex é um app instalável no aparelho do eletricista (PWA), sem precisar baixar da loja. No local do serviço ele abre a OS, tira fotos, percorre o checklist de segurança e coleta a assinatura do cliente direto pelo celular. O relatório sai pronto na hora.',
    },
    {
      q: 'Dá para gerar orçamento de instalação elétrica?',
      a: 'Sim. Você monta orçamentos com material e mão de obra, envia por link ao cliente e acompanha a aprovação. Quando o cliente aprova, o orçamento vira ordem de serviço com um clique, já com a equipe escalada.',
    },
    {
      q: 'Como funcionam os contratos de manutenção preventiva elétrica?',
      a: 'Você cadastra o contrato com a recorrência desejada (mensal, trimestral etc.) e o Dominex gera as ordens de serviço automaticamente no intervalo certo, com o checklist da inspeção pronto. Ideal para condomínios, indústrias e comércios com manutenção periódica.',
    },
    {
      q: 'Consigo ver onde minha equipe está em campo?',
      a: 'Sim. O mapa ao vivo mostra onde cada eletricista está, e o check-in da visita é validado pelo endereço do cliente. Você acompanha a operação de campo sem ficar ligando.',
    },
    {
      q: 'Como começo a usar? Precisa de cartão?',
      a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura sua empresa em minutos, cadastra seus clientes e já começa a abrir ordens de serviço. Cancela quando quiser e seus dados ficam preservados se decidir assinar.',
    },
  ],

  finalCta: {
    title: 'Coloque sua operação elétrica no controle',
    subtitle:
      '14 dias grátis, sem cartão, sem burocracia. Cadastre seus clientes, organize laudos e ARTs e ponha sua equipe de campo no digital.',
  },
};

/* ------------------------------------------------------------------ */
/* Energia Solar                                                     */
/* ------------------------------------------------------------------ */

const energiaSolar: SegmentData = {
  slug: 'sistema-para-energia-solar',
  accentColor: '#eab308',
  veilHueShift: 195, // calibrado: veil amarelo-ouro quente (sem puxar verde)
  navLabel: 'Energia Solar',
  icon: Sun,
  metaTitle:
    'Sistema de ordem de serviço e O&M para empresas de energia solar fotovoltaica | Dominex',
  metaDescription:
    'Software para empresas de energia solar: ordens de serviço de instalação e O&M, histórico por usina e inversor, limpeza de módulos, monitoramento de geração, contratos de manutenção recorrente e app no celular para a equipe em campo. Teste grátis 14 dias, sem cartão.',

  hero: {
    eyebrow: 'Para integradores e empresas de energia solar',
    h1: 'Sistema de ordem de serviço e O&M para empresas de energia solar',
    h1Highlight: 'energia solar',
    subtitle:
      'Instalou a usina, mas o pós-venda virou bagunça? O Dominex organiza as ordens de serviço de instalação e O&M, guarda o histórico de cada usina, inversor e visita, e mantém os contratos de manutenção rodando sozinhos.',
  },

  metrics: [
    { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
    { value: 'O&M', label: 'manutenção de usinas com histórico por equipamento' },
    { value: '100%', label: 'no celular da equipe em campo' },
    { value: '4,9/5', label: 'satisfação das empresas que usam' },
  ],

  pains: [
    {
      pain: '"Quantas placas tem nessa usina e qual o inversor instalado?"',
      solution:
        'Cada usina guarda a ficha completa: quantidade de módulos fotovoltaicos, marca e potência do inversor, string box, estrutura e todas as visitas anteriores. A equipe abre a OS e vê tudo, sem garimpar no projeto.',
    },
    {
      pain: 'Pós-venda e O&M esquecidos até a geração cair e o cliente reclamar',
      solution:
        'Contratos de O&M com recorrência configurável geram as ordens de serviço de limpeza e inspeção sozinhos. Você antecipa a queda de geração em vez de correr atrás do prejuízo.',
    },
    {
      pain: 'Limpeza de módulos e inspeção feitas sem comprovação',
      solution:
        'O técnico fecha a OS com fotos antes/depois da limpeza, checklist de inspeção dos módulos e do inversor, e assinatura do cliente na hora. Você comprova o serviço e protege o contrato.',
    },
    {
      pain: 'Equipe de instalação espalhada e sem controle de quem está onde',
      solution:
        'O mapa ao vivo mostra onde cada equipe está, com check-in validado pelo endereço da usina. Agenda e rota organizadas mesmo com várias instalações no mesmo dia.',
    },
  ],

  deepDives: [
    {
      icon: Sun,
      title: 'Histórico por usina, inversor e string',
      body: 'Cadastre cada usina fotovoltaica com a quantidade de módulos, potência instalada (kWp), marca e modelo do inversor, string box e estrutura. Cada visita — instalação, limpeza, inspeção ou troca de equipamento — fica amarrada à usina. Quando a equipe volta, ela sabe exatamente o que tem ali e o que foi feito antes, sem depender do projeto original.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos de O&M que geram as OS sozinhos',
      body: 'A operação e manutenção (O&M) de usinas é o que sustenta a geração ao longo dos anos. Cadastre o contrato com a recorrência de limpeza e inspeção (mensal, trimestral, semestral) e o Dominex gera as ordens de serviço automaticamente no intervalo certo, com o checklist da rotina pronto. A manutenção preventiva acontece sem você precisar lembrar.',
    },
    {
      icon: Smartphone,
      title: 'Tudo no celular da equipe, direto no telhado',
      body: 'As usinas ficam em telhado, galpão e área rural — e a equipe resolve tudo pelo celular no local. O app do Dominex é instalável no aparelho (PWA): a equipe abre a OS, tira foto da limpeza dos módulos, preenche o checklist de inspeção do inversor e coleta a assinatura do cliente ali mesmo, na usina. O relatório da visita sai pronto na hora, sem refazer no escritório.',
    },
  ],

  features: [
    {
      icon: ClipboardList,
      title: 'Ordens de serviço digitais',
      desc: 'Instalação, O&M e corretiva em segundos, com fotos, checklist e assinatura do cliente direto no app.',
    },
    {
      icon: Sun,
      title: 'Histórico por usina e inversor',
      desc: 'Módulos, potência, inversor e cada visita registrados por usina. A equipe vê tudo antes de subir no telhado.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos de O&M recorrentes',
      desc: 'Limpeza e inspeção geram as ordens de serviço sozinhas no intervalo certo, por usina.',
    },
    {
      icon: BarChart3,
      title: 'Acompanhamento da operação',
      desc: 'OS por status, tempo médio de atendimento e avaliação do cliente em um painel ao vivo.',
    },
    {
      icon: MapPin,
      title: 'Rastreamento em campo',
      desc: 'Veja no mapa onde cada equipe está e tenha check-in validado pelo endereço da usina.',
    },
    {
      icon: Calendar,
      title: 'Agenda inteligente',
      desc: 'Monte a rota das instalações e distribua os chamados de O&M pela equipe mais próxima.',
    },
    {
      icon: FileSignature,
      title: 'Relatório de visita com sua marca',
      desc: 'PDF pronto ao finalizar a limpeza ou inspeção, com sua logo, fotos e assinatura do cliente.',
    },
    {
      icon: Boxes,
      title: 'Estoque de peças e equipamentos',
      desc: 'Controle inversores, módulos, conectores e cabos usados em cada OS, com baixa automática.',
    },
  ],

  testimonials: [
    {
      quote:
        'Vendemos muita usina, mas o pós-venda era um caos. Agora cada usina tem histórico de inversor e de limpeza. A equipe chega sabendo o que vai encontrar.',
      name: 'Rafael G.',
      role: 'Sócio',
      company: 'integradora de energia solar',
    },
    {
      quote:
        'O contrato de O&M virou previsível: o sistema gera as OS de limpeza sozinho e a geração para de cair sem aviso. O cliente nota a diferença.',
      name: 'Camila V.',
      role: 'Coordenadora de O&M',
      company: 'manutenção de usinas fotovoltaicas',
    },
    {
      quote:
        'Equipe espalhada em vários telhados no mesmo dia. Com o mapa ao vivo e a agenda, parei de ligar pra saber onde cada um está.',
      name: 'Lucas R.',
      role: 'Gestor de Operações',
      company: 'instalação solar comercial',
    },
  ],

  faq: [
    {
      q: 'O Dominex serve para empresas de energia solar fotovoltaica?',
      a: 'Sim. Foi feito para integradores e empresas que instalam e mantêm usinas fotovoltaicas. Você cadastra cada usina com módulos, inversor e estrutura, registra o histórico de instalação e O&M, e organiza as ordens de serviço, contratos e relatórios em um só lugar.',
    },
    {
      q: 'Dá para registrar o histórico de cada usina e inversor?',
      a: 'Sim. Cada usina guarda a quantidade de módulos, a potência instalada, a marca e o modelo do inversor, a string box e todas as visitas anteriores. A equipe enxerga o histórico completo da usina antes mesmo de chegar ao local.',
    },
    {
      q: 'Como funcionam os contratos de O&M e manutenção preventiva?',
      a: 'Você cadastra o contrato de O&M com a recorrência de limpeza e inspeção (mensal, trimestral, semestral) e o Dominex gera as ordens de serviço automaticamente no intervalo certo, com o checklist da rotina pronto. A manutenção preventiva acontece sem depender da memória da equipe.',
    },
    {
      q: 'A equipe usa pelo celular? Precisa instalar algum app?',
      a: 'Sim, é tudo no celular. O Dominex é um app instalável no aparelho da equipe (PWA), sem baixar da loja. Na usina, a equipe abre a OS, tira fotos da limpeza dos módulos, preenche o checklist de inspeção do inversor e coleta a assinatura do cliente direto pelo celular. O relatório sai pronto na hora.',
    },
    {
      q: 'Consigo comprovar a limpeza de módulos e a inspeção?',
      a: 'Sim. O técnico fecha a OS com fotos antes/depois da limpeza, checklist de inspeção preenchido e assinatura do cliente na hora. O relatório em PDF com a sua marca sai pronto para entregar ao cliente e comprovar o serviço.',
    },
    {
      q: 'O Dominex faz monitoramento da geração em tempo real?',
      a: 'O Dominex organiza o serviço de campo: ordens de serviço, contratos de O&M, histórico por usina e comprovação das visitas. Ele não substitui o portal do inversor, mas centraliza tudo o que a equipe faz na usina para que a manutenção mantenha a geração em dia.',
    },
    {
      q: 'Consigo ver onde minha equipe de instalação está?',
      a: 'Sim. O mapa ao vivo mostra onde cada equipe está, e o check-in da visita é validado pelo endereço da usina. Você organiza a rota mesmo com várias instalações no mesmo dia.',
    },
    {
      q: 'Como começo a usar? Precisa de cartão?',
      a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura sua empresa em minutos, cadastra as usinas e já começa a abrir ordens de serviço. Cancela quando quiser e seus dados ficam preservados se decidir assinar.',
    },
  ],

  finalCta: {
    title: 'Organize a instalação e o O&M das suas usinas',
    subtitle:
      '14 dias grátis, sem cartão, sem burocracia. Cadastre suas usinas, automatize os contratos de manutenção e ponha sua equipe de campo no digital.',
  },
};

/* ------------------------------------------------------------------ */
/* Telecomunicações / Provedores                                     */
/* ------------------------------------------------------------------ */

const provedores: SegmentData = {
  slug: 'sistema-para-provedores',
  accentColor: '#3b82f6',
  navLabel: 'Telecomunicações / Provedores',
  icon: Radio,
  metaTitle:
    'Sistema de ordem de serviço para provedores de internet e empresas de telecomunicações | Dominex',
  metaDescription:
    'Software para provedores de internet (ISP) e telecom: ordens de serviço de instalação de fibra, chamados de suporte, agendamento de visita, histórico de CTO/ONU por assinante, controle de equipamentos e app no celular para o técnico em campo. Teste grátis 14 dias, sem cartão.',

  hero: {
    eyebrow: 'Para provedores de internet e empresas de telecom',
    h1: 'Sistema de ordem de serviço para provedores de internet e telecomunicações',
    h1Highlight: 'provedores de internet',
    subtitle:
      'Instalação de fibra, chamado de suporte, troca de ONU — e cada técnico anotando no caderno? O Dominex organiza suas ordens de serviço, agenda as visitas e guarda o histórico de CTO, ONU e equipamento de cada assinante.',
  },

  metrics: [
    { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
    { value: 'Fibra', label: 'instalação e suporte com histórico por assinante' },
    { value: '100%', label: 'no celular do técnico em campo' },
    { value: '4,9/5', label: 'satisfação das empresas que usam' },
  ],

  pains: [
    {
      pain: '"Em qual CTO esse cliente está e qual ONU foi instalada?"',
      solution:
        'Cada assinante guarda o histórico: CTO de origem, modelo e número de série da ONU, roteador e todas as visitas anteriores. O técnico abre a OS e enxerga tudo, sem ligar pra central.',
    },
    {
      pain: 'Chamado de suporte que demora porque ninguém sabe o que já foi feito',
      solution:
        'Cada chamado vira ordem de serviço com histórico do assinante, fotos do problema e registro do que foi resolvido. O próximo atendimento já começa sabendo o contexto.',
    },
    {
      pain: 'Agendamento de visita na base do "passo aí amanhã" e cliente esperando o dia todo',
      solution:
        'A agenda inteligente distribui os chamados pelo técnico mais próximo, organiza a rota do dia e dá previsibilidade de janela de atendimento. Menos visita furada, menos cliente irritado.',
    },
    {
      pain: 'Equipamento retirado ou trocado e ninguém deu baixa',
      solution:
        'Controle de equipamentos por OS: ONU, roteador e drop registrados na instalação e na retirada, com baixa de estoque automática. Você sabe onde cada equipamento está.',
    },
  ],

  deepDives: [
    {
      icon: Radio,
      title: 'Histórico de fibra, CTO e ONU por assinante',
      body: 'Cadastre cada assinante com o ponto de conexão: CTO de origem, porta, modelo e número de série da ONU, roteador e drop instalado. Instalação de fibra, troca de equipamento, reparo ou suporte — tudo fica amarrado ao assinante. Quando o técnico volta, ele já sabe a CTO, o equipamento e o que foi feito antes, sem garimpar no sistema da central.',
    },
    {
      icon: Calendar,
      title: 'Agendamento de visita e roteirização da equipe',
      body: 'Os chamados de instalação e suporte entram na agenda e são distribuídos pelo técnico mais próximo do endereço. A rota do dia é organizada para reduzir deslocamento e o cliente recebe uma janela de atendimento previsível. Menos visita furada, menos ociosidade do técnico e mais instalações por dia.',
    },
    {
      icon: Smartphone,
      title: 'Tudo no celular do técnico, direto no poste',
      body: 'Instalação de fibra acontece em poste, caixa de passagem, subsolo e condomínio — e o técnico resolve tudo pelo celular no local. O app do Dominex é instalável no aparelho (PWA): ele abre a OS, registra a CTO e a ONU, tira foto da instalação, preenche o checklist e coleta a assinatura do assinante ali mesmo. A OS sai pronta na hora, sem voltar pra central pra fechar.',
    },
  ],

  features: [
    {
      icon: ClipboardList,
      title: 'Ordens de serviço e chamados',
      desc: 'Instalação, suporte e retirada em segundos, com fotos, checklist e assinatura do assinante no app.',
    },
    {
      icon: Radio,
      title: 'Histórico de CTO, ONU e drop',
      desc: 'Ponto de conexão, equipamento e cada visita registrados por assinante. O técnico vê tudo antes de chegar.',
    },
    {
      icon: Calendar,
      title: 'Agendamento de visita',
      desc: 'Distribua chamados pelo técnico mais próximo, organize a rota e dê janela de atendimento ao cliente.',
    },
    {
      icon: Boxes,
      title: 'Controle de equipamentos',
      desc: 'ONU, roteador e drop registrados na instalação e na retirada, com baixa de estoque automática.',
    },
    {
      icon: MapPin,
      title: 'Rastreamento em campo',
      desc: 'Veja no mapa onde cada técnico está e tenha check-in validado pelo endereço do assinante.',
    },
    {
      icon: RefreshCw,
      title: 'Reincidência sob controle',
      desc: 'Histórico de chamados por assinante deixa claro quando um problema voltou e o que já foi tentado.',
    },
    {
      icon: FileSignature,
      title: 'Relatório de visita com sua marca',
      desc: 'PDF pronto ao finalizar a instalação ou o reparo, com sua logo e a assinatura do cliente.',
    },
    {
      icon: BarChart3,
      title: 'Indicadores da operação',
      desc: 'Chamados por status, tempo médio de atendimento e avaliação do assinante em um painel ao vivo.',
    },
  ],

  testimonials: [
    {
      quote:
        'Cada técnico anotava do seu jeito. Agora o histórico de CTO e ONU fica no assinante. O atendimento de suporte ficou muito mais rápido.',
      name: 'Fábio M.',
      role: 'Coordenador Técnico',
      company: 'provedor de internet regional',
    },
    {
      quote:
        'A agenda organizou a roteirização. O técnico faz mais instalações de fibra por dia e o cliente para de esperar o dia todo.',
      name: 'Juliana C.',
      role: 'Gerente de Operações',
      company: 'ISP de fibra óptica',
    },
    {
      quote:
        'Equipamento sumia no meio do caminho. Com a baixa por OS, eu sei onde cada ONU e roteador está.',
      name: 'Rodrigo A.',
      role: 'Sócio',
      company: 'provedor de banda larga',
    },
  ],

  faq: [
    {
      q: 'O Dominex serve para provedores de internet e empresas de telecom?',
      a: 'Sim. Foi feito para provedores (ISP) e empresas de telecomunicações que instalam fibra, atendem chamados de suporte e gerenciam equipamentos em campo. Você cadastra cada assinante com o ponto de conexão, registra o histórico de CTO e ONU e organiza ordens de serviço, agendamento e relatórios em um só lugar.',
    },
    {
      q: 'Consigo registrar a CTO e a ONU de cada assinante?',
      a: 'Sim. Cada assinante guarda a CTO de origem, a porta, o modelo e número de série da ONU, o roteador e o drop instalado, além de todas as visitas anteriores. O técnico enxerga o histórico completo antes de chegar ao endereço.',
    },
    {
      q: 'Tem agendamento e roteirização de visitas?',
      a: 'Sim. Os chamados de instalação e suporte entram na agenda e são distribuídos pelo técnico mais próximo, com a rota do dia organizada para reduzir deslocamento. O cliente recebe uma janela de atendimento previsível e você reduz visitas furadas.',
    },
    {
      q: 'Dá para controlar os equipamentos (ONU, roteador, drop)?',
      a: 'Sim. Cada equipamento é registrado na instalação e na retirada por ordem de serviço, com baixa de estoque automática. Você sabe onde cada ONU e roteador está e evita perda de equipamento.',
    },
    {
      q: 'O técnico usa pelo celular? Precisa instalar algum app?',
      a: 'Sim, é tudo no celular. O Dominex é um app instalável no aparelho do técnico (PWA), sem baixar da loja. No local da instalação ele abre a OS, registra a CTO e a ONU, tira fotos, preenche o checklist e coleta a assinatura do assinante direto pelo celular. A OS sai pronta na hora.',
    },
    {
      q: 'Consigo acompanhar a reincidência de chamados?',
      a: 'Sim. O histórico de chamados por assinante deixa claro quando um problema voltou e o que já foi tentado, ajudando a equipe de suporte a resolver de vez em vez de tratar sempre como novo.',
    },
    {
      q: 'Vejo onde meus técnicos estão em campo?',
      a: 'Sim. O mapa ao vivo mostra onde cada técnico está, e o check-in da visita é validado pelo endereço do assinante. Você acompanha a operação sem ficar ligando.',
    },
    {
      q: 'Como começo a usar? Precisa de cartão?',
      a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura sua empresa em minutos, cadastra os assinantes e já começa a abrir ordens de serviço. Cancela quando quiser e seus dados ficam preservados se decidir assinar.',
    },
  ],

  finalCta: {
    title: 'Coloque seu provedor no controle do campo',
    subtitle:
      '14 dias grátis, sem cartão, sem burocracia. Cadastre seus assinantes, organize as instalações de fibra e ponha sua equipe de suporte no digital.',
  },
};

/* ------------------------------------------------------------------ */
/* CFTV e Segurança Eletrônica                                       */
/* ------------------------------------------------------------------ */

const cftv: SegmentData = {
  slug: 'sistema-para-cftv',
  accentColor: '#6366f1',
  navLabel: 'CFTV e Segurança Eletrônica',
  icon: Shield,
  metaTitle:
    'Sistema de ordem de serviço para empresas de CFTV e segurança eletrônica | Dominex',
  metaDescription:
    'Software para empresas de CFTV e segurança eletrônica: ordens de serviço de instalação e manutenção de câmeras, alarme e controle de acesso, histórico por equipamento, contratos de monitoramento recorrente e app no celular para o técnico em campo. Teste grátis 14 dias, sem cartão.',

  hero: {
    eyebrow: 'Para empresas de CFTV e segurança eletrônica',
    h1: 'Sistema de ordem de serviço para empresas de CFTV e segurança eletrônica',
    h1Highlight: 'CFTV e segurança eletrônica',
    subtitle:
      'Câmera instalada, alarme configurado, controle de acesso entregue — e o histórico some? O Dominex organiza suas ordens de serviço, guarda o registro de cada equipamento e mantém os contratos de monitoramento rodando.',
  },

  metrics: [
    { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
    { value: 'CFTV', label: 'instalação e manutenção com histórico por equipamento' },
    { value: '100%', label: 'no celular do técnico em campo' },
    { value: '4,9/5', label: 'satisfação das empresas que usam' },
  ],

  pains: [
    {
      pain: '"Quantas câmeras tem nesse cliente e qual o DVR instalado?"',
      solution:
        'Cada cliente guarda a ficha: quantidade e modelo de câmeras, DVR/NVR, alarme, sensores, controle de acesso e todas as visitas. O técnico abre a OS e enxerga tudo, sem ligar pro escritório.',
    },
    {
      pain: 'Contrato de monitoramento esquecido até a câmera parar e o cliente perceber',
      solution:
        'Contratos de monitoramento e manutenção com recorrência configurável geram as ordens de serviço de inspeção sozinhos. Você antecipa a falha em vez de descobrir junto com o cliente.',
    },
    {
      pain: 'Manutenção e ronda feitas sem comprovação',
      solution:
        'O técnico fecha a OS com fotos das câmeras e do sistema, checklist de inspeção preenchido e assinatura do cliente. Você comprova cada visita e protege o contrato.',
    },
    {
      pain: 'Equipe espalhada em várias instalações e sem controle',
      solution:
        'O mapa ao vivo mostra onde cada técnico está, com check-in validado pelo endereço do cliente. Agenda e rota organizadas mesmo com muitas obras no dia.',
    },
  ],

  deepDives: [
    {
      icon: Shield,
      title: 'Histórico de câmeras, alarme e controle de acesso',
      body: 'Cadastre cada cliente com o parque instalado: câmeras (modelo, posição, IP), DVR/NVR, central de alarme, sensores, fechaduras e controle de acesso. Instalação, manutenção corretiva, reposicionamento ou troca de equipamento — tudo fica amarrado ao cliente. Quando o técnico volta, ele já sabe o que existe ali e o que foi feito antes.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos de monitoramento e manutenção recorrente',
      body: 'O monitoramento e a manutenção periódica do sistema de segurança são a receita recorrente do negócio. Cadastre o contrato com a recorrência de inspeção (mensal, trimestral) e o Dominex gera as ordens de serviço automaticamente no intervalo certo, com o checklist da ronda técnica pronto. A preventiva acontece sem você precisar lembrar.',
    },
    {
      icon: Smartphone,
      title: 'Tudo no celular do técnico, direto na fachada',
      body: 'Instalação e manutenção de CFTV acontecem em laje, fachada e estacionamento — e o técnico resolve tudo pelo celular no local. O app do Dominex é instalável no aparelho (PWA): ele abre a OS, fotografa cada câmera, registra o equipamento, preenche o checklist e coleta a assinatura do cliente ali mesmo. A OS sai pronta na hora, sem voltar pro escritório pra fechar.',
    },
  ],

  features: [
    {
      icon: ClipboardList,
      title: 'Ordens de serviço digitais',
      desc: 'Instalação, manutenção e corretiva em segundos, com fotos, checklist e assinatura do cliente no app.',
    },
    {
      icon: Shield,
      title: 'Histórico do parque instalado',
      desc: 'Câmeras, DVR/NVR, alarme e controle de acesso registrados por cliente. O técnico vê tudo antes de chegar.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos de monitoramento',
      desc: 'Manutenção e inspeção geram as ordens de serviço sozinhas no intervalo certo, por cliente.',
    },
    {
      icon: Calendar,
      title: 'Agenda inteligente',
      desc: 'Monte a rota da equipe, distribua chamados pelo técnico mais próximo e evite conflito de horário.',
    },
    {
      icon: MapPin,
      title: 'Rastreamento em campo',
      desc: 'Veja no mapa onde cada técnico está e tenha check-in validado pelo endereço do cliente.',
    },
    {
      icon: Boxes,
      title: 'Estoque de equipamentos',
      desc: 'Controle câmeras, cabos, conectores e centrais usados em cada OS, com baixa automática.',
    },
    {
      icon: FileSignature,
      title: 'Relatório de visita com sua marca',
      desc: 'PDF pronto ao finalizar a instalação ou a manutenção, com sua logo e a assinatura do cliente.',
    },
    {
      icon: BarChart3,
      title: 'Indicadores da operação',
      desc: 'OS por status, tempo médio de atendimento e avaliação do cliente em um painel ao vivo.',
    },
  ],

  testimonials: [
    {
      quote:
        'Antes a gente chegava no cliente sem saber quantas câmeras tinha. Agora o parque inteiro fica no cadastro. O atendimento ficou outro.',
      name: 'Bruno S.',
      role: 'Proprietário',
      company: 'instalação de CFTV e alarmes',
    },
    {
      quote:
        'O contrato de monitoramento virou previsível. O sistema gera as OS de inspeção e a gente antecipa a falha antes do cliente reclamar.',
      name: 'Aline R.',
      role: 'Coordenadora Técnica',
      company: 'segurança eletrônica predial',
    },
    {
      quote:
        'Equipe em várias obras no mesmo dia. Com a agenda e o mapa ao vivo, parei de ligar pra saber onde cada técnico está.',
      name: 'Thiago P.',
      role: 'Gestor',
      company: 'controle de acesso e CFTV',
    },
  ],

  faq: [
    {
      q: 'O Dominex serve para empresas de CFTV e segurança eletrônica?',
      a: 'Sim. Foi feito para empresas que instalam e mantêm câmeras, alarmes, sensores e controle de acesso. Você cadastra o parque instalado de cada cliente, registra o histórico por equipamento e organiza ordens de serviço, contratos de monitoramento e relatórios em um só lugar.',
    },
    {
      q: 'Consigo registrar o parque de câmeras e equipamentos de cada cliente?',
      a: 'Sim. Cada cliente guarda a quantidade e o modelo das câmeras, o DVR/NVR, a central de alarme, os sensores e o controle de acesso, além de todas as visitas anteriores. O técnico enxerga o histórico completo antes de chegar ao endereço.',
    },
    {
      q: 'Como funcionam os contratos de monitoramento e manutenção?',
      a: 'Você cadastra o contrato com a recorrência de inspeção (mensal, trimestral etc.) e o Dominex gera as ordens de serviço automaticamente no intervalo certo, com o checklist da ronda técnica pronto. A manutenção preventiva acontece sem depender da memória da equipe.',
    },
    {
      q: 'Dá para comprovar a manutenção e a ronda técnica?',
      a: 'Sim. O técnico fecha a OS com fotos das câmeras e do sistema, checklist de inspeção preenchido e assinatura do cliente na hora. O relatório em PDF com a sua marca sai pronto para entregar e comprovar a visita.',
    },
    {
      q: 'O técnico usa pelo celular? Precisa instalar algum app?',
      a: 'Sim, é tudo no celular. O Dominex é um app instalável no aparelho do técnico (PWA), sem baixar da loja. No local ele abre a OS, fotografa cada câmera, registra o equipamento, preenche o checklist e coleta a assinatura do cliente direto pelo celular. A OS sai pronta na hora.',
    },
    {
      q: 'Consigo controlar o estoque de câmeras e equipamentos?',
      a: 'Sim. Você controla câmeras, cabos, conectores e centrais usados em cada ordem de serviço, com baixa automática de estoque. Assim você sabe o que tem e o que foi aplicado em cada instalação.',
    },
    {
      q: 'Vejo onde minha equipe está em campo?',
      a: 'Sim. O mapa ao vivo mostra onde cada técnico está, e o check-in da visita é validado pelo endereço do cliente. Você acompanha a operação mesmo com muitas obras no mesmo dia.',
    },
    {
      q: 'Como começo a usar? Precisa de cartão?',
      a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura sua empresa em minutos, cadastra os clientes e já começa a abrir ordens de serviço. Cancela quando quiser e seus dados ficam preservados se decidir assinar.',
    },
  ],

  finalCta: {
    title: 'Coloque sua operação de segurança no controle',
    subtitle:
      '14 dias grátis, sem cartão, sem burocracia. Cadastre o parque de cada cliente, automatize os contratos de monitoramento e ponha sua equipe no digital.',
  },
};

/* ------------------------------------------------------------------ */
/* Construção Civil                                                  */
/* ------------------------------------------------------------------ */

const construcaoCivil: SegmentData = {
  slug: 'sistema-para-construcao-civil',
  accentColor: '#a16207',
  veilHueShift: 200, // calibrado: veil mais marrom/laranja-queimado
  navLabel: 'Construção Civil',
  icon: HardHat,
  metaTitle:
    'Sistema de ordem de serviço para empresas de construção civil e obras | Dominex',
  metaDescription:
    'Software para construção civil: ordens de serviço para equipes em campo, vistorias e medições, acompanhamento de cronograma, assistência técnica pós-obra com histórico por unidade e app no celular para a equipe no canteiro. Teste grátis 14 dias, sem cartão.',

  hero: {
    eyebrow: 'Para construtoras e empresas de obras',
    h1: 'Sistema de ordem de serviço para empresas de construção civil',
    h1Highlight: 'construção civil',
    subtitle:
      'Equipe na obra, vistoria pendente, assistência pós-obra sem registro? O Dominex organiza as ordens de serviço das suas equipes em campo, registra vistorias e medições e mantém o histórico de cada unidade na palma da mão.',
  },

  metrics: [
    { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
    { value: 'Obra', label: 'equipes de campo e vistorias com registro fotográfico' },
    { value: '100%', label: 'no celular da equipe no canteiro' },
    { value: '4,9/5', label: 'satisfação das empresas que usam' },
  ],

  pains: [
    {
      pain: '"O que ficou pendente nessa vistoria mesmo?"',
      solution:
        'Cada vistoria vira ordem de serviço com checklist, fotos e itens pendentes registrados. A equipe abre a OS e enxerga o que falta resolver, com prazo e responsável, sem planilha paralela.',
    },
    {
      pain: 'Assistência técnica pós-obra virando dor de cabeça e cliente insatisfeito',
      solution:
        'Cada unidade guarda o histórico de chamados de assistência. Quando o cliente aciona, a equipe já sabe o que foi feito antes e fecha o chamado com foto e assinatura, sem retrabalho.',
    },
    {
      pain: 'Medição de serviço de empreiteiro feita de cabeça, sem comprovação',
      solution:
        'Registre a medição com fotos, checklist e descrição direto na ordem de serviço. Você documenta o que foi executado em campo antes de liberar pagamento de equipe ou empreiteiro.',
    },
    {
      pain: 'Equipes espalhadas em vários canteiros e sem controle',
      solution:
        'O mapa ao vivo mostra onde cada equipe está, com check-in validado pelo endereço da obra. Agenda e tarefas organizadas mesmo com várias frentes ao mesmo tempo.',
    },
  ],

  deepDives: [
    {
      icon: HardHat,
      title: 'Ordens de serviço para equipes em campo e vistorias',
      body: 'Distribua tarefas e vistorias para as equipes em campo como ordens de serviço, cada uma com checklist, fotos e itens pendentes. Vistoria de entrega, inspeção de etapa, medição de empreiteiro ou correção — tudo fica registrado com responsável, prazo e comprovação fotográfica. O escritório acompanha o andamento sem precisar ir ao canteiro.',
    },
    {
      icon: Building,
      title: 'Histórico por unidade e assistência técnica pós-obra',
      body: 'Cadastre cada unidade ou empreendimento e amarre os chamados de assistência técnica a ela. Quando o cliente aciona um reparo dentro da garantia, a equipe abre a OS e já vê o histórico daquela unidade: o que foi entregue, o que já foi corrigido e o que ficou pendente. A assistência deixa de ser improviso e passa a ter rastro.',
    },
    {
      icon: Smartphone,
      title: 'Tudo no celular da equipe, direto no canteiro',
      body: 'A obra é o lugar do serviço: subsolo, estrutura, áreas em construção — e a equipe resolve tudo pelo celular no local. O app do Dominex é instalável no aparelho (PWA): a equipe abre a OS, registra a vistoria, tira fotos da etapa, preenche o checklist e coleta a assinatura ali mesmo, no canteiro. O relatório sai pronto na hora, sem refazer no escritório.',
    },
  ],

  features: [
    {
      icon: ClipboardList,
      title: 'Ordens de serviço para campo',
      desc: 'Distribua tarefas e vistorias às equipes em segundos, com checklist, fotos e itens pendentes.',
    },
    {
      icon: Building,
      title: 'Histórico por unidade e obra',
      desc: 'Vistorias, medições e assistências registradas por unidade. A equipe vê o histórico antes de agir.',
    },
    {
      icon: ClipboardList,
      title: 'Vistorias e medições com foto',
      desc: 'Registro fotográfico e checklist de cada etapa, com responsável e prazo, prontos para comprovar.',
    },
    {
      icon: RefreshCw,
      title: 'Assistência técnica pós-obra',
      desc: 'Chamados de garantia amarrados à unidade, com histórico do que já foi corrigido.',
    },
    {
      icon: MapPin,
      title: 'Rastreamento em campo',
      desc: 'Veja no mapa onde cada equipe está e tenha check-in validado pelo endereço da obra.',
    },
    {
      icon: Calendar,
      title: 'Agenda e tarefas das equipes',
      desc: 'Organize as frentes de serviço, distribua tarefas e acompanhe o andamento do cronograma.',
    },
    {
      icon: FileSignature,
      title: 'Relatório de vistoria com sua marca',
      desc: 'PDF pronto ao finalizar a vistoria ou medição, com sua logo, fotos e assinatura.',
    },
    {
      icon: BarChart3,
      title: 'Indicadores da operação',
      desc: 'OS por status, pendências por obra e tempo médio de atendimento em um painel ao vivo.',
    },
  ],

  testimonials: [
    {
      quote:
        'As vistorias viviam em planilha e foto solta no celular. Agora cada pendência vira OS com prazo e responsável. O escritório acompanha sem ir na obra.',
      name: 'Eduardo M.',
      role: 'Engenheiro de Obras',
      company: 'construtora de empreendimentos',
    },
    {
      quote:
        'A assistência pós-obra era um caos. Agora cada unidade tem histórico e a equipe chega sabendo o que já foi corrigido. O cliente percebe a diferença.',
      name: 'Renata B.',
      role: 'Coordenadora de Pós-Obra',
      company: 'incorporadora e construtora',
    },
    {
      quote:
        'Equipes em vários canteiros ao mesmo tempo. Com o mapa ao vivo e as tarefas, eu sei o que cada frente está fazendo sem ligar pra ninguém.',
      name: 'Sérgio T.',
      role: 'Gestor de Campo',
      company: 'empresa de construção e reformas',
    },
  ],

  faq: [
    {
      q: 'O Dominex serve para empresas de construção civil?',
      a: 'Sim. Foi feito para construtoras, incorporadoras e empresas de obras que precisam organizar equipes em campo, vistorias, medições e assistência técnica pós-obra. Você distribui tarefas como ordens de serviço, registra cada etapa com foto e mantém o histórico por unidade em um só lugar.',
    },
    {
      q: 'Consigo registrar vistorias e itens pendentes?',
      a: 'Sim. Cada vistoria vira uma ordem de serviço com checklist, fotos e itens pendentes, cada um com responsável e prazo. O escritório acompanha o que falta resolver sem precisar ir ao canteiro.',
    },
    {
      q: 'Dá para controlar a assistência técnica pós-obra?',
      a: 'Sim. Cada unidade guarda o histórico de chamados de assistência. Quando o cliente aciona um reparo na garantia, a equipe abre a OS e já vê o que foi entregue, o que já foi corrigido e o que ficou pendente — sem retrabalho.',
    },
    {
      q: 'Como funcionam as medições de serviço em campo?',
      a: 'Você registra a medição com fotos, checklist e descrição direto na ordem de serviço. Assim documenta o que foi executado em campo antes de liberar pagamento de equipe ou empreiteiro, com comprovação visual.',
    },
    {
      q: 'A equipe usa pelo celular? Precisa instalar algum app?',
      a: 'Sim, é tudo no celular. O Dominex é um app instalável no aparelho da equipe (PWA), sem baixar da loja. No canteiro a equipe abre a OS, registra a vistoria, tira fotos da etapa, preenche o checklist e coleta a assinatura direto pelo celular. O relatório sai pronto na hora.',
    },
    {
      q: 'Consigo acompanhar o andamento do cronograma?',
      a: 'Sim. As tarefas e frentes de serviço ficam organizadas na agenda, e o painel mostra ordens de serviço por status e pendências por obra. Você acompanha o andamento das equipes sem depender de relatório manual.',
    },
    {
      q: 'Vejo onde minhas equipes estão em campo?',
      a: 'Sim. O mapa ao vivo mostra onde cada equipe está, e o check-in da visita é validado pelo endereço da obra. Você acompanha várias frentes ao mesmo tempo sem ficar ligando.',
    },
    {
      q: 'Como começo a usar? Precisa de cartão?',
      a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura sua empresa em minutos, cadastra suas obras e já começa a distribuir ordens de serviço. Cancela quando quiser e seus dados ficam preservados se decidir assinar.',
    },
  ],

  finalCta: {
    title: 'Coloque suas equipes de obra no controle',
    subtitle:
      '14 dias grátis, sem cartão, sem burocracia. Organize vistorias, medições e a assistência pós-obra e ponha suas equipes de campo no digital.',
  },
};

/* ------------------------------------------------------------------ */
/* Elevadores                                                        */
/* ------------------------------------------------------------------ */

const elevadores: SegmentData = {
  slug: 'sistema-para-elevadores',
  accentColor: '#ef4444',
  veilHueShift: 245, // calibrado no browser: vermelho vivo (longe do laranja)
  navLabel: 'Elevadores',
  icon: Building,
  metaTitle:
    'Sistema de ordem de serviço para empresas de manutenção de elevadores | Dominex',
  metaDescription:
    'Software para empresas de manutenção de elevadores: ordens de serviço de preventiva e emergência, contratos mensais recorrentes, histórico por equipamento, chamado de emergência e app no celular para o técnico na casa de máquinas. Teste grátis 14 dias, sem cartão.',

  hero: {
    eyebrow: 'Para empresas de manutenção de elevadores',
    h1: 'Sistema de ordem de serviço para empresas de manutenção de elevadores',
    h1Highlight: 'manutenção de elevadores',
    subtitle:
      'Contrato mensal, preventiva no prazo, chamado de emergência atendido — e o histórico de cada elevador some? O Dominex organiza suas ordens de serviço, mantém os contratos recorrentes rodando e guarda o registro de cada equipamento.',
  },

  metrics: [
    { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
    { value: 'Mensal', label: 'contratos de preventiva gerando OS sozinhos' },
    { value: '100%', label: 'no celular do técnico na casa de máquinas' },
    { value: '4,9/5', label: 'satisfação das empresas que usam' },
  ],

  pains: [
    {
      pain: '"O que foi feito nesse elevador na última preventiva?"',
      solution:
        'Cada elevador guarda o histórico completo: marca, capacidade, número de paradas, peças trocadas e todas as visitas. O técnico abre a OS e vê tudo, sem ligar pro escritório.',
    },
    {
      pain: 'Preventiva mensal esquecida até o contrato ser questionado',
      solution:
        'Contratos de manutenção mensal geram as ordens de serviço de preventiva automaticamente, no intervalo certo, com o checklist da rotina pronto. Você cumpre o contrato sem depender da memória de ninguém.',
    },
    {
      pain: 'Chamado de emergência atendido sem rastro de quem foi e o que resolveu',
      solution:
        'O chamado de emergência vira OS com horário, técnico, descrição e foto do que foi resolvido. Você comprova o atendimento e o tempo de resposta a qualquer momento.',
    },
    {
      pain: 'Comprovação de manutenção e conformidade espalhada em papel',
      solution:
        'Cada visita gera relatório em PDF com a sua marca, checklist preenchido e assinatura do síndico ou responsável. O histórico de conformidade do elevador fica organizado e pronto para apresentar.',
    },
  ],

  deepDives: [
    {
      icon: Building,
      title: 'Histórico completo por elevador',
      body: 'Cadastre cada elevador com marca, modelo, capacidade, número de paradas, tipo de máquina e localização no edifício. Preventiva, corretiva, troca de peça ou modernização — tudo fica amarrado ao equipamento, não só ao condomínio. Quando o técnico volta, ele sabe exatamente o que foi feito na última visita e quais peças já foram trocadas.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos mensais que geram a preventiva sozinhos',
      body: 'A manutenção preventiva mensal é a base do contrato de elevadores. Cadastre o contrato com a recorrência mensal e o Dominex gera as ordens de serviço automaticamente no intervalo certo, com o checklist da rotina de preventiva pronto. Você nunca mais perde uma visita contratual nem fica exposto se o cliente questionar a periodicidade.',
    },
    {
      icon: Smartphone,
      title: 'Tudo no celular do técnico, direto na casa de máquinas',
      body: 'A casa de máquinas, o poço e a caixa de corrida são o lugar do serviço — e o técnico resolve tudo pelo celular ali mesmo. O app do Dominex é instalável no aparelho (PWA): ele abre a OS, preenche o checklist de inspeção, registra peças, tira fotos e coleta a assinatura do responsável no local. O relatório sai pronto na hora, sem refazer no escritório.',
    },
  ],

  features: [
    {
      icon: ClipboardList,
      title: 'Ordens de serviço digitais',
      desc: 'Preventiva, corretiva e emergência em segundos, com checklist, fotos e assinatura no app.',
    },
    {
      icon: Building,
      title: 'Histórico por elevador',
      desc: 'Marca, capacidade, paradas e peças trocadas registradas por equipamento. O técnico vê tudo antes de chegar.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos mensais recorrentes',
      desc: 'A preventiva mensal gera as ordens de serviço sozinha, no intervalo certo, por elevador.',
    },
    {
      icon: Calendar,
      title: 'Chamado de emergência',
      desc: 'Atendimento de emergência registrado com horário, técnico e tempo de resposta comprovado.',
    },
    {
      icon: MapPin,
      title: 'Rastreamento em campo',
      desc: 'Veja no mapa onde cada técnico está e tenha check-in validado pelo endereço do prédio.',
    },
    {
      icon: Boxes,
      title: 'Estoque de peças',
      desc: 'Controle peças e componentes usados em cada OS, com baixa automática no estoque.',
    },
    {
      icon: FileSignature,
      title: 'Relatório de manutenção com sua marca',
      desc: 'PDF pronto ao finalizar a visita, com sua logo, checklist e assinatura do responsável.',
    },
    {
      icon: BarChart3,
      title: 'Indicadores da operação',
      desc: 'OS por status, tempo de resposta de emergência e visitas por contrato em um painel ao vivo.',
    },
  ],

  testimonials: [
    {
      quote:
        'Cada elevador agora tem histórico de peça e de preventiva. O técnico chega sabendo o que foi feito da última vez. Acabou a desculpa de "não sabia".',
      name: 'Marcos V.',
      role: 'Gerente Técnico',
      company: 'manutenção de elevadores',
    },
    {
      quote:
        'A preventiva mensal gera as OS sozinha. Nunca mais um síndico me cobrou uma visita que eu não comprovei.',
      name: 'Cláudia F.',
      role: 'Responsável Técnica',
      company: 'conservação de elevadores',
    },
    {
      quote:
        'Os chamados de emergência ficam todos registrados com horário e tempo de resposta. Isso pesou muito na renovação dos contratos.',
      name: 'Henrique L.',
      role: 'Sócio',
      company: 'elevadores e plataformas',
    },
  ],

  faq: [
    {
      q: 'O Dominex serve para empresas de manutenção de elevadores?',
      a: 'Sim. Foi feito para empresas que fazem manutenção preventiva e corretiva de elevadores sob contrato mensal. Você cadastra cada elevador, mantém o histórico por equipamento, gera as preventivas automaticamente e registra os chamados de emergência em um só lugar.',
    },
    {
      q: 'Como funcionam os contratos mensais de preventiva?',
      a: 'Você cadastra o contrato com recorrência mensal e o Dominex gera as ordens de serviço de preventiva automaticamente no intervalo certo, com o checklist da rotina pronto. Você cumpre o contrato sem depender da memória da equipe e fica protegido se a periodicidade for questionada.',
    },
    {
      q: 'Dá para registrar o histórico de cada elevador?',
      a: 'Sim. Cada elevador guarda marca, capacidade, número de paradas, peças trocadas e todas as visitas anteriores. O técnico enxerga o histórico completo do equipamento antes mesmo de chegar ao prédio.',
    },
    {
      q: 'Como funcionam os chamados de emergência?',
      a: 'O chamado de emergência vira uma ordem de serviço com horário de abertura, técnico responsável, descrição e foto do que foi resolvido. Você comprova o atendimento e o tempo de resposta a qualquer momento, o que pesa na renovação de contratos.',
    },
    {
      q: 'O técnico usa pelo celular? Precisa instalar algum app?',
      a: 'Sim, é tudo no celular. O Dominex é um app instalável no aparelho do técnico (PWA), sem baixar da loja. Na casa de máquinas ele abre a OS, preenche o checklist de inspeção, registra peças, tira fotos e coleta a assinatura do responsável direto pelo celular. O relatório sai pronto na hora.',
    },
    {
      q: 'Gera relatório de manutenção para o condomínio?',
      a: 'Sim. Cada visita gera um relatório em PDF com a sua marca, checklist preenchido e assinatura do síndico ou responsável. O histórico de manutenção e conformidade do elevador fica organizado e pronto para apresentar.',
    },
    {
      q: 'Consigo controlar as peças usadas em cada visita?',
      a: 'Sim. Você registra as peças e componentes usados em cada ordem de serviço, com baixa automática de estoque. Assim sabe o que foi aplicado em cada elevador e mantém o controle do que tem em mãos.',
    },
    {
      q: 'Como começo a usar? Precisa de cartão?',
      a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura sua empresa em minutos, cadastra os elevadores e já começa a abrir ordens de serviço. Cancela quando quiser e seus dados ficam preservados se decidir assinar.',
    },
  ],

  finalCta: {
    title: 'Coloque a manutenção dos elevadores no controle',
    subtitle:
      '14 dias grátis, sem cartão, sem burocracia. Cadastre seus elevadores, automatize a preventiva mensal e ponha sua equipe de campo no digital.',
  },
};

/* ------------------------------------------------------------------ */
/* Limpeza e Conservação                                             */
/* ------------------------------------------------------------------ */

const limpezaConservacao: SegmentData = {
  slug: 'sistema-para-limpeza-conservacao',
  accentColor: '#10b981',
  navLabel: 'Limpeza e Conservação',
  icon: Sparkles,
  metaTitle:
    'Sistema de ordem de serviço para empresas de limpeza e conservação | Dominex',
  metaDescription:
    'Software para empresas de limpeza e conservação: ordens de serviço por posto e contrato, checklist de limpeza, ronda com comprovação por foto e assinatura, controle de equipes em campo e app no celular para a equipe. Teste grátis 14 dias, sem cartão.',

  hero: {
    eyebrow: 'Para empresas de limpeza e conservação',
    h1: 'Sistema de ordem de serviço para empresas de limpeza e conservação',
    h1Highlight: 'limpeza e conservação',
    subtitle:
      'Posto de serviço sem comprovação, ronda sem registro, cliente cobrando o que foi feito? O Dominex organiza as ordens de serviço por contrato e posto, com checklist, foto e assinatura provando cada limpeza.',
  },

  metrics: [
    { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
    { value: 'Posto', label: 'serviço por contrato com comprovação fotográfica' },
    { value: '100%', label: 'no celular da equipe em campo' },
    { value: '4,9/5', label: 'satisfação das empresas que usam' },
  ],

  pains: [
    {
      pain: '"Como provo pro cliente que a limpeza foi feita?"',
      solution:
        'Cada serviço fecha com checklist preenchido, fotos antes/depois e assinatura do responsável no posto. Você comprova a execução e elimina a discussão de "não foi feito".',
    },
    {
      pain: 'Ronda e rotina de conservação sem registro de quem passou e quando',
      solution:
        'A ronda vira ordem de serviço com check-in validado por local e horário. Você sabe exatamente quem esteve em cada posto e o que foi executado, sem depender da palavra da equipe.',
    },
    {
      pain: 'Contrato com vários postos e nenhum controle do que foi cumprido',
      solution:
        'Cadastre cada contrato com seus postos e rotinas. As ordens de serviço são geradas no intervalo certo e você acompanha o cumprimento de cada posto em um painel, não na base da confiança.',
    },
    {
      pain: 'Equipes espalhadas em vários clientes e sem visibilidade',
      solution:
        'O mapa ao vivo mostra onde cada equipe está, com check-in validado pelo endereço do posto. Agenda e rotinas organizadas mesmo com muitos contratos simultâneos.',
    },
  ],

  deepDives: [
    {
      icon: Sparkles,
      title: 'Ordens de serviço por contrato e posto',
      body: 'Cadastre cada contrato com seus postos de serviço e as rotinas de limpeza e conservação. Cada visita vira uma ordem de serviço com o checklist da rotina, fotos e assinatura. Você acompanha o que foi cumprido em cada posto e tem o registro pronto para apresentar ao cliente sempre que a execução for questionada.',
    },
    {
      icon: MapPin,
      title: 'Ronda e check-in com comprovação de local e horário',
      body: 'A ronda e a rotina de conservação ficam registradas com check-in validado pelo endereço do posto e horário da passagem. Você sabe quem esteve em cada local, a que horas e o que foi executado, com foto e assinatura. A comprovação substitui a palavra da equipe e protege o contrato em qualquer auditoria do cliente.',
    },
    {
      icon: Smartphone,
      title: 'Tudo no celular da equipe, direto no posto',
      body: 'Os postos de limpeza incluem subsolo, garagem e escadaria — e a equipe resolve tudo pelo celular no local. O app do Dominex é instalável no aparelho (PWA): a equipe abre a OS, marca o checklist da rotina, tira foto antes/depois e coleta a assinatura do responsável ali mesmo, no posto. A comprovação fica registrada na hora, sem depender de anotar depois.',
    },
  ],

  features: [
    {
      icon: ClipboardList,
      title: 'Ordens de serviço por posto',
      desc: 'Rotinas de limpeza e conservação em segundos, com checklist, fotos e assinatura no app.',
    },
    {
      icon: Sparkles,
      title: 'Checklist de limpeza configurável',
      desc: 'Monte o passo a passo de cada rotina e garanta que nada seja esquecido no posto.',
    },
    {
      icon: MapPin,
      title: 'Ronda com check-in validado',
      desc: 'Registro de quem passou em cada posto, com local e horário comprovados.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos e rotinas recorrentes',
      desc: 'As ordens de serviço dos postos são geradas no intervalo certo, sem depender de planilha.',
    },
    {
      icon: Calendar,
      title: 'Agenda das equipes',
      desc: 'Organize os postos do dia, distribua as equipes e acompanhe o cumprimento das rotinas.',
    },
    {
      icon: FileSignature,
      title: 'Comprovação com foto e assinatura',
      desc: 'Fotos antes/depois e assinatura do responsável encerram cada serviço, prontos para apresentar.',
    },
    {
      icon: BarChart3,
      title: 'Indicadores da operação',
      desc: 'Rotinas cumpridas por posto, pendências e avaliação do cliente em um painel ao vivo.',
    },
    {
      icon: Users,
      title: 'Controle de equipes em campo',
      desc: 'Veja no mapa onde cada equipe está e acompanhe os vários contratos ao mesmo tempo.',
    },
  ],

  testimonials: [
    {
      quote:
        'O cliente vivia dizendo que a limpeza não foi feita. Agora cada posto tem foto antes/depois e assinatura. A discussão acabou.',
      name: 'Vanessa M.',
      role: 'Gerente de Contratos',
      company: 'empresa de limpeza e conservação',
    },
    {
      quote:
        'A ronda agora tem check-in com horário e local. Eu sei exatamente quem passou em cada posto e a que horas.',
      name: 'Paulo R.',
      role: 'Supervisor de Operações',
      company: 'conservação predial',
    },
    {
      quote:
        'Com vários contratos rodando ao mesmo tempo, o painel me mostra o que foi cumprido em cada posto sem eu ligar pra ninguém.',
      name: 'Sandra L.',
      role: 'Sócia',
      company: 'serviços de limpeza terceirizada',
    },
  ],

  faq: [
    {
      q: 'O Dominex serve para empresas de limpeza e conservação?',
      a: 'Sim. Foi feito para empresas que operam postos e contratos de limpeza e conservação. Você cadastra cada contrato com seus postos e rotinas, gera as ordens de serviço, comprova a execução com foto e assinatura e acompanha o cumprimento em um só lugar.',
    },
    {
      q: 'Como comprovo ao cliente que a limpeza foi feita?',
      a: 'Cada serviço encerra com checklist preenchido, fotos antes/depois e assinatura do responsável no posto. O relatório em PDF com a sua marca fica pronto para apresentar, eliminando a discussão de "não foi feito".',
    },
    {
      q: 'Dá para registrar a ronda e a rotina de conservação?',
      a: 'Sim. A ronda vira ordem de serviço com check-in validado pelo endereço do posto e horário da passagem. Você sabe quem esteve em cada local, a que horas e o que foi executado, sem depender da palavra da equipe.',
    },
    {
      q: 'Consigo controlar contratos com vários postos?',
      a: 'Sim. Você cadastra cada contrato com seus postos e rotinas, as ordens de serviço são geradas no intervalo certo e o painel mostra o cumprimento de cada posto. Você acompanha tudo sem planilha e sem confiar só na palavra da equipe.',
    },
    {
      q: 'A equipe usa pelo celular? Precisa instalar algum app?',
      a: 'Sim, é tudo no celular. O Dominex é um app instalável no aparelho da equipe (PWA), sem baixar da loja. No posto a equipe abre a OS, marca o checklist da rotina, tira foto antes/depois e coleta a assinatura do responsável direto pelo celular. A comprovação fica registrada na hora.',
    },
    {
      q: 'Consigo montar o checklist de cada rotina de limpeza?',
      a: 'Sim. Você monta checklists configuráveis com o passo a passo de cada rotina de limpeza e conservação, garantindo que nada seja esquecido no posto e que a equipe siga o padrão combinado com o cliente.',
    },
    {
      q: 'Vejo onde minhas equipes estão em campo?',
      a: 'Sim. O mapa ao vivo mostra onde cada equipe está, e o check-in é validado pelo endereço do posto. Você acompanha vários contratos ao mesmo tempo sem ficar ligando.',
    },
    {
      q: 'Como começo a usar? Precisa de cartão?',
      a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura sua empresa em minutos, cadastra os contratos e postos e já começa a abrir ordens de serviço. Cancela quando quiser e seus dados ficam preservados se decidir assinar.',
    },
  ],

  finalCta: {
    title: 'Comprove cada limpeza e proteja seus contratos',
    subtitle:
      '14 dias grátis, sem cartão, sem burocracia. Cadastre seus postos, organize as rotinas e ponha suas equipes de campo no digital com comprovação.',
  },
};

/* ------------------------------------------------------------------ */
/* Dedetização                                                       */
/* ------------------------------------------------------------------ */

const dedetizacao: SegmentData = {
  slug: 'sistema-para-dedetizacao',
  accentColor: '#65a30d',
  navLabel: 'Dedetização',
  icon: Droplets,
  metaTitle:
    'Sistema de ordem de serviço para empresas de dedetização e controle de pragas | Dominex',
  metaDescription:
    'Software para empresas de dedetização e controle de pragas: ordens de serviço com registro de produtos aplicados, certificado de dedetização, contratos recorrentes, agendamento periódico e app no celular para o aplicador em campo. Teste grátis 14 dias, sem cartão.',

  hero: {
    eyebrow: 'Para empresas de dedetização e controle de pragas',
    h1: 'Sistema de ordem de serviço para empresas de dedetização e controle de pragas',
    h1Highlight: 'dedetização e controle de pragas',
    subtitle:
      'Produto aplicado sem registro, certificado feito na correria, contrato periódico esquecido? O Dominex organiza suas ordens de serviço, registra os produtos aplicados e emite o certificado com a sua marca em cada visita.',
  },

  metrics: [
    { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
    { value: 'Certificado', label: 'de dedetização gerado em cada visita' },
    { value: '100%', label: 'no celular do aplicador em campo' },
    { value: '4,9/5', label: 'satisfação das empresas que usam' },
  ],

  pains: [
    {
      pain: '"Qual produto e dosagem foram aplicados nesse cliente?"',
      solution:
        'Cada visita registra os produtos aplicados, a dosagem, o método e a praga-alvo. O histórico fica amarrado ao cliente, e o aplicador abre a OS e vê o que foi usado antes, sem ligar pro escritório.',
    },
    {
      pain: 'Certificado de dedetização feito à mão, depois, sem padrão',
      solution:
        'O certificado de dedetização sai pronto em PDF com a sua marca ao finalizar a visita, com produtos aplicados, validade e responsável técnico. Entrega na hora, sem retrabalho.',
    },
    {
      pain: 'Contrato recorrente esquecido até a praga voltar e o cliente reclamar',
      solution:
        'Contratos de controle de pragas com recorrência configurável geram as ordens de serviço de reaplicação sozinhos, no intervalo certo. Você mantém o cliente protegido e o contrato ativo.',
    },
    {
      pain: 'Aplicador em campo sem comprovação do que foi feito',
      solution:
        'O aplicador fecha a OS com fotos do serviço, checklist preenchido e assinatura do cliente. Você comprova a aplicação e protege a empresa em qualquer fiscalização.',
    },
  ],

  deepDives: [
    {
      icon: Droplets,
      title: 'Registro de produtos aplicados e certificado de dedetização',
      body: 'Cada visita registra os produtos aplicados, a dosagem, o método (pulverização, isca, gel), a praga-alvo e o responsável técnico. A partir desse registro, o certificado de dedetização sai pronto em PDF com a sua marca, com validade e os produtos utilizados — pronto para entregar ao cliente e apresentar à fiscalização sanitária. Nada é preenchido à mão depois.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos e agendamento periódico de reaplicação',
      body: 'O controle de pragas depende de reaplicação na frequência certa. Cadastre o contrato com a recorrência (mensal, bimestral, trimestral) e o Dominex gera as ordens de serviço de reaplicação automaticamente no intervalo combinado, com o agendamento já feito. O cliente fica protegido e você não perde a renovação por esquecimento.',
    },
    {
      icon: Smartphone,
      title: 'Tudo no celular do aplicador, direto no local',
      body: 'A dedetização acontece em galpão, subsolo e depósito — e o aplicador resolve tudo pelo celular ali mesmo. O app do Dominex é instalável no aparelho (PWA): ele abre a OS, registra os produtos e a dosagem, tira foto do serviço, preenche o checklist e coleta a assinatura do cliente no local. O certificado sai pronto na hora, sem refazer no escritório.',
    },
  ],

  features: [
    {
      icon: ClipboardList,
      title: 'Ordens de serviço digitais',
      desc: 'Dedetização, desratização e reaplicação em segundos, com checklist, fotos e assinatura no app.',
    },
    {
      icon: Droplets,
      title: 'Registro de produtos aplicados',
      desc: 'Produto, dosagem, método e praga-alvo registrados por visita, com histórico amarrado ao cliente.',
    },
    {
      icon: FileSignature,
      title: 'Certificado de dedetização',
      desc: 'PDF com a sua marca, produtos, validade e responsável técnico, pronto ao finalizar a visita.',
    },
    {
      icon: RefreshCw,
      title: 'Contratos de reaplicação recorrente',
      desc: 'As ordens de serviço de reaplicação são geradas no intervalo certo, por contrato.',
    },
    {
      icon: Calendar,
      title: 'Agendamento periódico',
      desc: 'Programe as reaplicações, distribua os aplicadores e nunca perca a janela do contrato.',
    },
    {
      icon: MapPin,
      title: 'Rastreamento em campo',
      desc: 'Veja no mapa onde cada aplicador está e tenha check-in validado pelo endereço do cliente.',
    },
    {
      icon: Boxes,
      title: 'Estoque de produtos',
      desc: 'Controle os produtos químicos e iscas usados em cada OS, com baixa automática de estoque.',
    },
    {
      icon: BarChart3,
      title: 'Indicadores da operação',
      desc: 'OS por status, reaplicações por contrato e avaliação do cliente em um painel ao vivo.',
    },
  ],

  testimonials: [
    {
      quote:
        'O certificado saía à mão, depois, e atrasava tudo. Agora ele sai pronto com a minha marca na hora que o aplicador termina. O cliente recebe na mesma visita.',
      name: 'Gustavo M.',
      role: 'Proprietário',
      company: 'controle de pragas urbanas',
    },
    {
      quote:
        'Cada cliente tem o histórico de produto e dosagem aplicados. Quando volto, sei exatamente o que usei da última vez.',
      name: 'Letícia A.',
      role: 'Responsável Técnica',
      company: 'dedetização e desratização',
    },
    {
      quote:
        'Os contratos de reaplicação geram as OS sozinhos. Parei de perder renovação por esquecer a periodicidade.',
      name: 'Roberto C.',
      role: 'Sócio',
      company: 'controle de pragas comercial',
    },
  ],

  faq: [
    {
      q: 'O Dominex serve para empresas de dedetização e controle de pragas?',
      a: 'Sim. Foi feito para empresas de dedetização, desratização e controle de pragas. Você cadastra cada cliente, registra os produtos aplicados em cada visita, emite o certificado de dedetização e mantém os contratos de reaplicação recorrente em um só lugar.',
    },
    {
      q: 'O sistema gera o certificado de dedetização?',
      a: 'Sim. Ao finalizar a visita, o certificado de dedetização sai pronto em PDF com a sua marca, com os produtos aplicados, a validade e o responsável técnico. Você entrega ao cliente na hora e tem o documento pronto para apresentar à fiscalização sanitária.',
    },
    {
      q: 'Consigo registrar os produtos e a dosagem aplicada?',
      a: 'Sim. Cada visita registra os produtos aplicados, a dosagem, o método (pulverização, isca, gel) e a praga-alvo. O histórico fica amarrado ao cliente, e o aplicador vê o que foi usado antes de chegar ao local.',
    },
    {
      q: 'Como funcionam os contratos de reaplicação periódica?',
      a: 'Você cadastra o contrato com a recorrência desejada (mensal, bimestral, trimestral etc.) e o Dominex gera as ordens de serviço de reaplicação automaticamente no intervalo certo, com o agendamento já feito. O cliente fica protegido e você não perde a renovação por esquecimento.',
    },
    {
      q: 'O aplicador usa pelo celular? Precisa instalar algum app?',
      a: 'Sim, é tudo no celular. O Dominex é um app instalável no aparelho do aplicador (PWA), sem baixar da loja. No local ele abre a OS, registra os produtos e a dosagem, tira foto do serviço, preenche o checklist e coleta a assinatura do cliente direto pelo celular. O certificado sai pronto na hora.',
    },
    {
      q: 'Consigo comprovar a aplicação em uma fiscalização?',
      a: 'Sim. O aplicador fecha a OS com fotos do serviço, checklist preenchido e assinatura do cliente, e o certificado registra os produtos e o responsável técnico. Você comprova cada aplicação e mantém a empresa em conformidade.',
    },
    {
      q: 'Dá para controlar o estoque de produtos químicos?',
      a: 'Sim. Você controla os produtos químicos e iscas usados em cada ordem de serviço, com baixa automática de estoque. Assim sabe o que foi aplicado em cada cliente e o que tem disponível.',
    },
    {
      q: 'Como começo a usar? Precisa de cartão?',
      a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura sua empresa em minutos, cadastra os clientes e já começa a abrir ordens de serviço. Cancela quando quiser e seus dados ficam preservados se decidir assinar.',
    },
  ],

  finalCta: {
    title: 'Coloque seu controle de pragas no controle',
    subtitle:
      '14 dias grátis, sem cartão, sem burocracia. Cadastre seus clientes, emita o certificado automaticamente e automatize os contratos de reaplicação.',
  },
};

/* ------------------------------------------------------------------ */
/* Registro de todos os segmentos (data-driven)                       */
/* ------------------------------------------------------------------ */

/**
 * Onda 2: adicione aqui as 8 entradas restantes seguindo o shape de
 * `refrigeracao`, registre cada `slug` em App.tsx e o navbar atualiza sozinho.
 */
export const SEGMENTS: Record<string, SegmentData> = {
  [refrigeracao.slug]: refrigeracao,
  [eletricistas.slug]: eletricistas,
  [energiaSolar.slug]: energiaSolar,
  [provedores.slug]: provedores,
  [cftv.slug]: cftv,
  [construcaoCivil.slug]: construcaoCivil,
  [elevadores.slug]: elevadores,
  [limpezaConservacao.slug]: limpezaConservacao,
  [dedetizacao.slug]: dedetizacao,
};

/**
 * Itens do dropdown "Segmentos" no navbar. Os 9 estão fixos (todos terão página
 * até o release — não marcar "em breve", conforme briefing). Ícone/label
 * espelham SegmentsSection.tsx.
 */
export interface SegmentNavLink {
  label: string;
  slug: string;
  icon: LucideIcon;
}

// Estes 9 nichos espelham 1:1 os segmentos `site: true` da FONTE ÚNICA em
// `@/utils/companySegments` (getSiteSegments) — mesmos labels e ordem. Aqui eles
// carregam o `slug` da landing e ícones próprios do site, por isso a lista fica
// explícita (não derivada) para não acoplar as rotas públicas ao runtime do app.
// Ao adicionar/remover um nicho do site, atualizar o flag `site` lá também.
export const SEGMENT_NAV_LINKS: SegmentNavLink[] = [
  { label: 'Refrigeração e Climatização', slug: 'sistema-para-refrigeracao', icon: Thermometer },
  { label: 'Instalações Elétricas', slug: 'sistema-para-eletricistas', icon: Zap },
  { label: 'Energia Solar', slug: 'sistema-para-energia-solar', icon: Sun },
  { label: 'Telecomunicações / Provedores', slug: 'sistema-para-provedores', icon: Radio },
  { label: 'CFTV e Segurança Eletrônica', slug: 'sistema-para-cftv', icon: Shield },
  { label: 'Construção Civil', slug: 'sistema-para-construcao-civil', icon: HardHat },
  { label: 'Elevadores', slug: 'sistema-para-elevadores', icon: Building },
  { label: 'Limpeza e Conservação', slug: 'sistema-para-limpeza-conservacao', icon: Sparkles },
  { label: 'Dedetização', slug: 'sistema-para-dedetizacao', icon: Droplets },
];

// Re-export de ícones genéricos que entradas futuras podem reaproveitar sem
// reimportar do lucide (mantém o vocabulário de ícones centralizado).
export const SEGMENT_ICONS = {
  ClipboardList,
  MapPin,
  Calendar,
  RefreshCw,
  BarChart3,
  Smartphone,
  WifiOff,
  FileSignature,
  Wrench,
  Gauge,
  Boxes,
  Users,
};
