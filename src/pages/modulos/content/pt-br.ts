// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo pt-br de módulos — ÚNICO locale populado com dados reais (Fase 2).
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


const ptBr: ModuleContentMap = {
  // ────────────────────────────────────────────────────────────────────────
  // 1. OS Digital
  // ────────────────────────────────────────────────────────────────────────
  'os-digital': {
    metaTitle: 'Sistema de ordem de serviço digital para equipes de campo | Dominex',
    metaDescription:
      'Software de ordem de serviço digital para equipes de campo: OS no celular do técnico, checklist, foto antes/depois, assinatura do cliente, app instalável, agenda e relatório em PDF automático. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'Ordem de Serviço Digital',
      h1: 'Sistema de ordem de serviço digital para equipes de campo',
      h1Highlight: 'ordem de serviço digital',
      subtitle:
        'Acabe com a OS em papel que some, atrasa e chega sem foto. O Dominex coloca a ordem de serviço no celular do técnico — com checklist, foto, assinatura e relatório pronto na hora, em campo.',
    },
    metrics: [
      { value: '+50 mil', label: 'ordens de serviço por mês na plataforma' },
      { value: 'Zero papel', label: 'OS criada, executada e fechada no app' },
      { value: 'No celular', label: 'OS executada pelo técnico em campo' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'A OS em papel custa caro todo dia',
    painsSubheading: 'Onde a ordem de serviço trava no improviso, o Dominex entra no controle',
    pains: [
      {
        pain: '"Cadê a OS daquele atendimento de ontem?"',
        solution:
          'Cada ordem de serviço fica registrada no sistema, vinculada ao cliente, ao equipamento e ao técnico responsável. Você busca por número, cliente ou status e abre o histórico completo em segundos.',
      },
      {
        pain: 'Técnico fechou o serviço, mas não tirou foto nem coletou assinatura',
        solution:
          'O app obriga o passo a passo: foto antes/depois, checklist preenchido e assinatura do cliente na tela. Nada se fecha pela metade e você tem prova do que foi feito.',
      },
      {
        pain: 'Relatório de visita digitado horas depois, no fim do dia',
        solution:
          'Ao finalizar a OS no campo, o relatório em PDF com a sua marca já sai pronto — com fotos, checklist e assinatura. Você envia ao cliente na hora, sem retrabalho no escritório.',
      },
      {
        pain: 'Chamado distribuído por WhatsApp e ninguém sabe o que está pendente',
        solution:
          'O painel mostra todas as OS por status: aberta, em andamento, concluída. Você distribui para o técnico certo e acompanha a operação inteira sem ficar ligando.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'A ordem de serviço inteira na mão do técnico',
        body: 'O técnico abre o app, vê a fila de atendimentos do dia, entra na OS e enxerga tudo: dados do cliente, endereço com mapa, equipamento, histórico das visitas anteriores e o que precisa ser feito. Ele executa, registra e fecha o serviço sem voltar ao escritório nem ligar para pedir informação.',
        image: {
          src: '/modulos/os-digital/1.webp',
          alt: 'Dois técnicos de campo ao lado da van consultando uma ordem de serviço no tablet',
        },
      },
      {
        icon: Download,
        title: 'App instalável no celular do técnico',
        body: 'O Dominex tem app instalável (PWA) no celular do técnico, sem precisar baixar na loja de aplicativos. A equipe abre a ordem de serviço, tira foto, preenche o checklist e coleta a assinatura do cliente direto do celular, em campo. O que o técnico registra aparece na hora para o escritório acompanhar.',
        image: {
          src: '/modulos/os-digital/2.webp',
          alt: 'Técnico com equipamento de proteção usando o celular em campo na obra',
        },
      },
      {
        icon: FileSignature,
        title: 'Checklist, foto e assinatura geram o relatório na hora',
        body: 'Monte checklists por tipo de serviço, registre fotos antes e depois e colha a assinatura do cliente direto na tela. Ao concluir, o relatório de OS em PDF com a sua logo e cores sai pronto para enviar. O cliente recebe um documento profissional e você comprova cada etapa do atendimento.',
        image: {
          src: '/modulos/os-digital/3.webp',
          alt: 'Técnico segurando prancheta com checklist de inspeção e caneta',
        },
      },
    ],
    featuresHeading: 'Tudo que sua OS precisa, em um só lugar',
    featuresSubheading: 'Do chamado ao relatório, a ordem de serviço digital cobre cada etapa',
    features: [
      { icon: ClipboardList, title: 'Criação rápida de OS', desc: 'Abra ordens de instalação, manutenção e corretiva em segundos, já com cliente e equipamento vinculados.' },
      { icon: CheckSquare, title: 'Checklist por serviço', desc: 'Modelos de checklist por tipo de atendimento garantem o passo a passo certo em cada visita.' },
      { icon: Camera, title: 'Foto antes e depois', desc: 'Registro fotográfico anexado à OS comprova o estado do serviço e protege sua empresa.' },
      { icon: PenLine, title: 'Assinatura do cliente', desc: 'O cliente assina na tela do celular e a assinatura entra no relatório final.' },
      { icon: Download, title: 'App instalável', desc: 'Instale o Dominex no celular do técnico, como um app, sem loja de aplicativos.' },
      { icon: Calendar, title: 'Agenda e distribuição', desc: 'Veja a fila do dia e atribua o chamado ao técnico mais próximo, sem conflito de horário.' },
      { icon: FileSignature, title: 'Relatório automático', desc: 'PDF com sua marca pronto ao finalizar, com fotos, checklist e assinatura.' },
      { icon: BarChart3, title: 'Painel por status', desc: 'OS abertas, em andamento e concluídas em um painel ao vivo da operação.' },
      { icon: Smartphone, title: 'Resposta em vídeo no checklist', desc: 'Nos planos Pro e Business, o técnico grava um clipe curto (até 15 s) como resposta de checklist, em campo. O cliente vê o vídeo no link da OS.' },
    ],
    testimonialsHeading: 'Quem digitalizou a OS não volta ao papel',
    testimonials: [
      { quote: 'A OS em papel sumia e o cliente cobrava foto que ninguém tirou. Hoje tudo fica no app, com assinatura e relatório na hora.', name: 'Carlos M.', role: 'Gestor de Operações', company: 'empresa de manutenção' },
      { quote: 'O técnico chega no cliente e já vê o histórico. Acabou o "deixa eu ligar pro escritório pra confirmar".', name: 'Roberta S.', role: 'Coordenadora Técnica', company: 'assistência técnica' },
      { quote: 'O relatório com a nossa logo na hora deu outra cara pra empresa. O cliente confia mais no serviço.', name: 'André P.', role: 'Fundador', company: 'serviços de campo' },
    ],
    faq: [
      { q: 'O que é uma ordem de serviço digital?', a: 'É a OS criada, executada e fechada direto no sistema e no app do técnico, sem papel. Toda a visita — checklist, fotos antes/depois, assinatura do cliente e relatório — fica registrada no Dominex e vinculada ao cliente e ao equipamento.' },
      { q: 'O técnico usa a OS pelo celular? Precisa instalar algum programa?', a: 'O Dominex tem app instalável (PWA) no celular do técnico, sem baixar na loja de aplicativos. Em campo, ele abre a OS, tira fotos, preenche o checklist e coleta a assinatura do cliente direto pelo celular — o que registra aparece na hora para o escritório.' },
      { q: 'Consigo anexar fotos e coletar a assinatura do cliente na OS?', a: 'Sim. Cada ordem de serviço aceita fotos antes e depois e a assinatura do cliente colhida na tela do celular. Tudo entra no relatório final em PDF.' },
      { q: 'O sistema gera relatório de ordem de serviço automaticamente?', a: 'Sim. Ao finalizar a OS, o relatório em PDF com a sua logo e cores sai pronto, com checklist preenchido, fotos e assinatura. Você envia ao cliente na hora.' },
      { q: 'Dá para usar checklists diferentes por tipo de serviço?', a: 'Sim. Você cria modelos de checklist por tipo de atendimento (instalação, preventiva, corretiva) e o técnico segue o passo a passo certo em cada visita.' },
      { q: 'Como distribuo as ordens de serviço para a equipe?', a: 'No painel você vê a fila do dia e atribui cada OS ao técnico responsável, acompanhando o status (aberta, em andamento, concluída) em tempo real.' },
      { q: 'O técnico pode responder o checklist com vídeo?', a: 'Sim, nos planos Pro e Business. O técnico grava um clipe curto de até 15 segundos direto pelo celular em campo, como resposta de uma pergunta do checklist. O vídeo fica registrado na OS e o cliente pode visualizá-lo no link da ordem de serviço.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você configura a empresa em minutos e já começa a abrir ordens de serviço no app.' },
    ],
    finalCta: {
      title: 'Coloque a ordem de serviço no digital',
      subtitle: '14 dias grátis, sem cartão. Tire a OS do papel e ponha sua equipe de campo no controle.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 2. PMOC
  // ────────────────────────────────────────────────────────────────────────
  'sistema-pmoc': {
    metaTitle: 'Software de PMOC para climatização e refrigeração (Lei 13.589/2018) | Dominex',
    metaDescription:
      'Software de PMOC para climatização e refrigeração: plano de manutenção por equipamento, visitas recorrentes automáticas, checklist por máquina, relatório PMOC pronto para fiscalização e QR Code no equipamento, conforme a Lei 13.589/2018. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'PMOC automático',
      h1: 'Software de PMOC para climatização e refrigeração',
      h1Highlight: 'PMOC',
      subtitle:
        'Pare de montar o Plano de Manutenção em planilha paralela. O Dominex gera o PMOC por equipamento conforme a Lei 13.589/2018, agenda as visitas sozinho e entrega o relatório pronto para a fiscalização.',
    },
    metrics: [
      { value: 'Lei 13.589', label: 'PMOC em conformidade com a legislação federal' },
      { value: 'Por máquina', label: 'plano de manutenção individual por equipamento' },
      { value: 'Auto', label: 'visitas recorrentes geradas pelo sistema' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'O PMOC não pode ser feito na correria',
    painsSubheading: 'Onde a planilha paralela falha, o Dominex garante conformidade',
    pains: [
      {
        pain: 'PMOC montado à mão, sem rastro e fora da lei',
        solution:
          'O sistema monta o Plano de Manutenção, Operação e Controle a partir dos equipamentos do contrato, conforme a Lei 13.589/2018, com responsável técnico, ciclo de visitas e checklist por máquina.',
      },
      {
        pain: 'Esqueceu a visita do mês e o cronograma furou',
        solution:
          'As visitas PMOC são geradas automaticamente no ciclo certo (mensal, trimestral, semestral). Cada uma já nasce com a rotina de manutenção daquela fase do plano.',
      },
      {
        pain: 'Fiscalização pediu o PMOC e você não tinha o documento pronto',
        solution:
          'O relatório PMOC e a planilha de conformidade saem em PDF com a sua marca, com o que foi feito em cada visita e a assinatura do responsável técnico. Você apresenta na hora.',
      },
      {
        pain: 'Não sabe o histórico de manutenção de cada máquina',
        solution:
          'O plano é por equipamento: cada máquina tem seu cronograma, seu checklist e seu histórico de visitas. Um QR Code no equipamento leva direto ao registro.',
      },
    ],
    deepDives: [
      {
        icon: RefreshCw,
        title: 'PMOC automático conforme a Lei 13.589/2018',
        body: 'O Plano de Manutenção, Operação e Controle exigido por lei para sistemas de climatização de uso coletivo é montado a partir dos equipamentos do contrato. O Dominex distribui as visitas no ciclo, monta o checklist de cada uma conforme a fase do plano, registra o responsável técnico e gera a planilha PMOC e o relatório de conformidade prontos para apresentar em fiscalização — sem planilha paralela.',
        image: {
          src: '/modulos/sistema-pmoc/1.webp',
          alt: 'Técnico de refrigeração medindo gás com manômetros na condensadora do ar-condicionado',
        },
      },
      {
        icon: Wrench,
        title: 'Plano de manutenção por equipamento, não por contrato',
        body: 'Cada máquina (split, multi-split, VRF, chiller, fancoil, self-contained) tem seu próprio cronograma de manutenção, com a rotina certa para cada visita do ciclo de 12 meses. A fiscalização e o cliente enxergam exatamente o que foi feito em cada equipamento, quando e por quem.',
        image: {
          src: '/modulos/sistema-pmoc/2.webp',
          alt: 'Técnico inspecionando uma unidade condensadora de ar-condicionado com lanterna',
        },
      },
      {
        icon: QrCode,
        title: 'QR Code no equipamento e visitas recorrentes',
        body: 'Cole o QR Code na máquina: o técnico aponta a câmera e cai direto no registro daquele equipamento, com histórico e a próxima visita PMOC. As visitas recorrentes são geradas pelo sistema no intervalo certo, com checklist pronto, para que a preventiva nunca dependa da memória de ninguém.',
        image: {
          src: '/modulos/sistema-pmoc/3.webp',
          alt: 'Técnico fazendo manutenção nas conexões de um split externo de ar-condicionado',
        },
      },
    ],
    featuresHeading: 'PMOC completo, da geração à fiscalização',
    featuresSubheading: 'Conformidade com a Lei 13.589/2018 sem trabalho manual',
    features: [
      { icon: RefreshCw, title: 'Geração automática do PMOC', desc: 'Plano montado a partir dos equipamentos do contrato, com ciclo de visitas e responsável técnico.' },
      { icon: Wrench, title: 'Plano por máquina', desc: 'Cronograma e checklist individuais por equipamento, com a rotina certa em cada visita.' },
      { icon: Calendar, title: 'Visitas recorrentes', desc: 'O sistema agenda as visitas PMOC no intervalo certo, sem você precisar lembrar.' },
      { icon: CheckSquare, title: 'Checklist por fase', desc: 'Cada visita do ciclo de 12 meses traz a rotina de manutenção correspondente.' },
      { icon: FileText, title: 'Relatório de conformidade', desc: 'Planilha PMOC e relatório em PDF prontos para apresentar à fiscalização.' },
      { icon: QrCode, title: 'QR Code no equipamento', desc: 'O técnico escaneia e cai direto no histórico e na próxima visita da máquina.' },
      { icon: FileSignature, title: 'Assinatura do responsável técnico', desc: 'O RT assina os documentos PMOC, com a identidade da sua empresa.' },
      { icon: ShieldCheck, title: 'Conformidade legal', desc: 'Tudo conforme a Lei Federal 13.589/2018 de climatização de uso coletivo.' },
    ],
    testimonialsHeading: 'O PMOC deixou de ser pesadelo',
    testimonials: [
      { quote: 'O PMOC era planilha em cima de planilha. Agora o sistema monta o cronograma e o relatório sozinho. Apresentei pra fiscalização sem suar.', name: 'Roberta S.', role: 'Responsável Técnica', company: 'climatização predial' },
      { quote: 'Plano por máquina mudou tudo. Cada equipamento tem o histórico dele e a próxima visita já agendada.', name: 'Carlos M.', role: 'Gestor de Operações', company: 'refrigeração comercial' },
      { quote: 'O QR Code no equipamento foi um achado. O técnico aponta a câmera e já está no registro certo.', name: 'André P.', role: 'Fundador', company: 'manutenção de ar-condicionado' },
    ],
    faq: [
      { q: 'O que é PMOC e por que é obrigatório?', a: 'O PMOC (Plano de Manutenção, Operação e Controle) é exigido pela Lei Federal 13.589/2018 para sistemas de climatização de uso coletivo. Ele documenta a manutenção preventiva, o responsável técnico e o histórico de cada equipamento, e deve ser apresentado em fiscalização.' },
      { q: 'O Dominex gera o PMOC automaticamente?', a: 'Sim. O sistema monta o PMOC a partir dos equipamentos do contrato, distribui as visitas no ciclo, monta o checklist de cada uma e gera a planilha e o relatório de conformidade prontos para a fiscalização — sem planilha paralela.' },
      { q: 'O plano de manutenção é por equipamento ou por contrato?', a: 'Por equipamento. Cada máquina tem seu próprio cronograma, checklist e histórico de visitas, com a rotina certa para cada fase do ciclo de 12 meses.' },
      { q: 'As visitas PMOC são agendadas sozinhas?', a: 'Sim. As visitas recorrentes são geradas pelo sistema no intervalo correto (mensal, trimestral, semestral), já com o checklist da fase pronto. A preventiva não depende da memória da equipe.' },
      { q: 'Tem QR Code no equipamento?', a: 'Sim. Você cola um QR Code na máquina e o técnico, ao escanear, cai direto no registro daquele equipamento, com histórico e a próxima visita PMOC.' },
      { q: 'O relatório PMOC sai com a minha marca?', a: 'Sim. A planilha PMOC e o relatório de conformidade saem em PDF com a sua logo e cores, com a assinatura do responsável técnico, prontos para entregar ao cliente e à fiscalização.' },
      { q: 'Serve para refrigeração além de climatização?', a: 'Sim. Funciona para empresas de climatização e refrigeração que mantêm split, multi-split, VRF, chiller, câmara fria, fancoil e self-contained, com plano e histórico por equipamento.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você cadastra os equipamentos, monta o contrato e o PMOC é gerado automaticamente.' },
    ],
    finalCta: {
      title: 'Gere o PMOC sem planilha paralela',
      subtitle: '14 dias grátis, sem cartão. Cadastre os equipamentos e tenha o PMOC pronto para a fiscalização.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 3. CRM
  // ────────────────────────────────────────────────────────────────────────
  'sistema-crm': {
    metaTitle: 'CRM para empresas de serviço e manutenção | Dominex',
    metaDescription:
      'CRM para empresas de serviço e manutenção: capture leads, organize o funil de vendas em kanban, atribua a cada vendedor e leve do orçamento à proposta e ao contrato — com conversão direta em ordem de serviço. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'CRM & Vendas',
      h1: 'CRM para empresas de serviço e manutenção',
      h1Highlight: 'CRM',
      subtitle:
        'Lead chegou no WhatsApp e morreu na caixa de entrada? O CRM do Dominex organiza seu funil de vendas em kanban, atribui cada oportunidade a um vendedor e leva do primeiro contato ao contrato fechado.',
    },
    metrics: [
      { value: 'Funil', label: 'oportunidades organizadas em kanban' },
      { value: 'Lead → OS', label: 'do primeiro contato à ordem de serviço' },
      { value: 'Por vendedor', label: 'atribuição e acompanhamento individual' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'Lead que não vira venda é dinheiro na mesa',
    painsSubheading: 'Onde o atendimento se perde no improviso, o CRM organiza a conversão',
    pains: [
      {
        pain: 'Lead chega e ninguém sabe quem está cuidando',
        solution:
          'Cada oportunidade entra no funil e é atribuída a um vendedor responsável. Você enxerga quem está cuidando, em que etapa está e o que falta para fechar.',
      },
      {
        pain: 'Pipeline na cabeça do vendedor, sem visibilidade nenhuma',
        solution:
          'O funil em kanban mostra todas as oportunidades por etapa — do primeiro contato ao fechamento. Você vê o pipeline inteiro e onde o negócio está travando.',
      },
      {
        pain: 'Orçamento, proposta e contrato em arquivos soltos',
        solution:
          'Do lead sai o orçamento, que vira proposta e contrato dentro do mesmo fluxo, ligado à oportunidade. Tudo conectado, sem arquivo perdido no WhatsApp.',
      },
      {
        pain: 'Fechou a venda, mas a execução começou do zero',
        solution:
          'A oportunidade ganha vira ordem de serviço com um clique, levando os dados do cliente e do que foi vendido. Comercial e campo falam a mesma língua.',
      },
    ],
    deepDives: [
      {
        icon: Users,
        title: 'Funil de vendas em kanban, do lead ao contrato',
        body: 'Capture o lead, registre o contato e mova a oportunidade pelas etapas do funil arrastando no kanban: novo, em contato, orçamento, proposta, fechamento. Cada card mostra o cliente, o valor estimado, o vendedor responsável e o histórico de interações. Você vê o pipeline inteiro e age onde o negócio está parado.',
        image: {
          src: '/modulos/crm/1.webp',
          alt: 'Equipe de vendas em reunião no escritório analisando o pipeline com gráfico de crescimento',
        },
      },
      {
        icon: FileSignature,
        title: 'Orçamento → proposta → contrato no mesmo fluxo',
        body: 'A partir da oportunidade você monta o orçamento com itens, mão de obra e material, transforma em proposta enviada por link e fecha em contrato. Tudo fica amarrado à oportunidade do CRM — o vendedor acompanha a aprovação e nada se perde entre o "vou pensar" e o "fechado".',
        image: {
          src: '/modulos/crm/2.webp',
          alt: 'Profissionais revisando um contrato e proposta sobre a mesa no escritório',
        },
      },
      {
        icon: TrendingUp,
        title: 'Conversão direta em ordem de serviço',
        body: 'Negócio ganho não recomeça do zero: a oportunidade vira ordem de serviço com um clique, levando cliente, endereço e o escopo vendido para o campo. O comercial fecha e a operação já tem tudo para executar, sem retrabalho de digitar de novo.',
        image: {
          src: '/modulos/crm/3.webp',
          alt: 'Vendedor fechando negócio com o cliente após assinar os documentos',
        },
      },
    ],
    featuresHeading: 'Do lead ao contrato, sem perder oportunidade',
    featuresSubheading: 'O CRM que fala a mesma língua da sua operação de campo',
    features: [
      { icon: Users, title: 'Captura de leads', desc: 'Registre cada contato que chega e não deixe oportunidade morrer na caixa de entrada.' },
      { icon: ClipboardList, title: 'Funil em kanban', desc: 'Mova oportunidades pelas etapas arrastando, com valor e responsável visíveis.' },
      { icon: UserCircle, title: 'Atribuição a vendedor', desc: 'Cada oportunidade tem um dono e você acompanha o desempenho de cada vendedor.' },
      { icon: FileText, title: 'Orçamentos integrados', desc: 'Monte o orçamento direto da oportunidade, com itens e mão de obra.' },
      { icon: Send, title: 'Propostas por link', desc: 'Envie a proposta por link e acompanhe quando o cliente abre e aprova.' },
      { icon: FileSignature, title: 'Contratos no fluxo', desc: 'Feche o negócio em contrato dentro do mesmo caminho do CRM.' },
      { icon: TrendingUp, title: 'Conversão em OS', desc: 'A oportunidade ganha vira ordem de serviço com um clique.' },
      { icon: BarChart3, title: 'Visão do pipeline', desc: 'Acompanhe o funil, a taxa de conversão e onde o negócio trava.' },
    ],
    testimonialsHeading: 'Quem organizou o funil, fecha mais',
    testimonials: [
      { quote: 'Lead chegava e se perdia no WhatsApp. Agora cada oportunidade tem dono e etapa. Paramos de deixar dinheiro na mesa.', name: 'Juliana C.', role: 'Gerente Comercial', company: 'empresa de serviços' },
      { quote: 'O orçamento vira proposta e contrato sem trocar de sistema. E o que fecha já vira ordem de serviço.', name: 'Marcelo T.', role: 'Sócio', company: 'manutenção predial' },
      { quote: 'Pela primeira vez eu enxergo o pipeline inteiro. Sei onde cada negócio está e o que falta pra fechar.', name: 'Patrícia L.', role: 'Diretora', company: 'instalações e serviços' },
    ],
    faq: [
      { q: 'O que o CRM do Dominex faz?', a: 'Ele organiza sua operação comercial: captura leads, monta o funil de vendas em kanban, atribui cada oportunidade a um vendedor e leva do orçamento à proposta e ao contrato, com conversão direta em ordem de serviço.' },
      { q: 'Como funciona o funil de vendas?', a: 'O funil é um kanban com etapas (novo, em contato, orçamento, proposta, fechamento). Você arrasta cada oportunidade pela etapa certa e vê o cliente, o valor estimado e o responsável em cada card.' },
      { q: 'Consigo atribuir oportunidades a vendedores?', a: 'Sim. Cada oportunidade tem um vendedor responsável e você acompanha o pipeline e o desempenho de cada um.' },
      { q: 'O CRM se conecta com orçamentos e contratos?', a: 'Sim. A partir da oportunidade você monta o orçamento, transforma em proposta enviada por link e fecha em contrato — tudo amarrado à oportunidade, sem arquivo solto.' },
      { q: 'Quando fecho a venda, preciso recadastrar o cliente para a OS?', a: 'Não. A oportunidade ganha vira ordem de serviço com um clique, levando cliente, endereço e o escopo vendido. O comercial e o campo trabalham com os mesmos dados.' },
      { q: 'Dá para acompanhar a taxa de conversão?', a: 'Sim. Você acompanha o pipeline, vê quantas oportunidades avançam por etapa e identifica onde o negócio costuma travar.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você cadastra seus leads e já começa a organizar o funil de vendas.' },
    ],
    finalCta: {
      title: 'Organize seu funil e feche mais',
      subtitle: '14 dias grátis, sem cartão. Capture seus leads, organize o pipeline e leve do lead ao contrato.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 4. Financeiro
  // ────────────────────────────────────────────────────────────────────────
  'controle-financeiro': {
    metaTitle: 'Controle financeiro para empresas de serviço | Dominex',
    metaDescription:
      'Controle financeiro para empresas de serviço: contas a pagar e a receber, fluxo de caixa, DRE, gestão de cartão de crédito e conciliação. Saiba quanto entra, quanto sai e quanto sobra. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'Financeiro',
      h1: 'Controle financeiro para empresas de serviço',
      h1Highlight: 'Controle financeiro',
      subtitle:
        'Não sabe se o mês fechou no azul? O Dominex organiza contas a pagar e a receber, mostra o fluxo de caixa em tempo real e fecha o DRE — para você decidir com número, não no chute.',
    },
    metrics: [
      { value: 'A pagar/receber', label: 'contas organizadas e com vencimento' },
      { value: 'Fluxo de caixa', label: 'entradas e saídas em tempo real' },
      { value: 'DRE', label: 'resultado do mês fechado automaticamente' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'Decidir no chute custa o lucro do mês',
    painsSubheading: 'Onde a planilha não conta a verdade, o Dominex mostra o número',
    pains: [
      {
        pain: '"Será que tem dinheiro pra pagar isso?"',
        solution:
          'O fluxo de caixa mostra, em tempo real, quanto entrou, quanto vai sair e o saldo projetado. Você decide olhando o número, não no susto.',
      },
      {
        pain: 'Conta a pagar esquecida vira juro e multa',
        solution:
          'Contas a pagar e a receber ficam organizadas por vencimento, com aviso do que está perto de vencer. Nada passa batido.',
      },
      {
        pain: 'Não sabe se o mês deu lucro ou prejuízo',
        solution:
          'O DRE fecha automaticamente com receitas, custos e despesas categorizados. Você vê o resultado do mês sem montar planilha.',
      },
      {
        pain: 'Fatura do cartão misturada com o caixa e ninguém entende o saldo',
        solution:
          'O cartão de crédito tem tratamento próprio: a despesa entra como prevista e a fatura agregada é o que de fato vira pagamento. O saldo para de mentir.',
      },
    ],
    deepDives: [
      {
        icon: CalendarClock,
        title: 'Contas a pagar e a receber sob controle',
        body: 'Lance cada conta a pagar e a receber com vencimento, categoria e cliente ou fornecedor. O sistema organiza por data, avisa o que está próximo de vencer e mostra o que já foi quitado. Você para de pagar juros por esquecimento e cobra o cliente no dia certo.',
        image: {
          src: '/modulos/controle-financeiro/1.webp',
          alt: 'Mãos usando calculadora sobre uma mesa com documentos e pastas, organizando contas a pagar e a receber',
        },
      },
      {
        icon: TrendingUp,
        title: 'Fluxo de caixa e DRE em tempo real',
        body: 'O fluxo de caixa consolida entradas e saídas e projeta o saldo dos próximos dias. O DRE (Demonstração do Resultado) fecha o mês com receitas, custos e despesas categorizados, mostrando a margem real do negócio. Você decide com número na mão, não no feeling.',
        image: {
          src: '/modulos/controle-financeiro/2.webp',
          alt: 'Profissional analisando gráficos e relatórios financeiros, apontando com um lápis para os números',
        },
      },
      {
        icon: CreditCard,
        title: 'Cartão de crédito sem bagunçar o caixa',
        body: 'No Dominex a despesa de cartão entra como prevista e quem vira pagamento de verdade é a fatura agregada — então o saldo da sua conta nunca aparece menor do que é. Você acompanha o total da fatura por cartão e concilia o que foi de fato gasto, sem confundir despesa com pagamento.',
        image: {
          src: '/modulos/controle-financeiro/3.webp',
          alt: 'Pessoa fazendo pagamento por aproximação com cartão de crédito em uma maquininha',
        },
      },
    ],
    featuresHeading: 'O financeiro da sua empresa, organizado',
    featuresSubheading: 'Saiba quanto entra, quanto sai e quanto sobra',
    features: [
      { icon: CalendarClock, title: 'Contas a pagar', desc: 'Vencimentos organizados, com aviso do que está perto de vencer.' },
      { icon: HandCoins, title: 'Contas a receber', desc: 'Saiba o que cada cliente deve e cobre no dia certo.' },
      { icon: TrendingUp, title: 'Fluxo de caixa', desc: 'Entradas, saídas e saldo projetado em tempo real.' },
      { icon: BarChart3, title: 'DRE automático', desc: 'Resultado do mês com receitas, custos e despesas categorizados.' },
      { icon: CreditCard, title: 'Gestão de cartão', desc: 'Despesa prevista e fatura agregada, sem bagunçar o saldo.' },
      { icon: Receipt, title: 'Categorias', desc: 'Classifique cada lançamento e enxergue para onde o dinheiro vai.' },
      { icon: Landmark, title: 'Caixas e bancos', desc: 'Acompanhe o saldo de cada conta e caixa da empresa.' },
      { icon: FileCheck2, title: 'Conciliação', desc: 'Bata o que foi previsto com o que de fato entrou e saiu.' },
    ],
    testimonialsHeading: 'Quem mede, decide melhor',
    testimonials: [
      { quote: 'Eu fechava o mês no susto. Agora vejo o fluxo de caixa e o DRE e sei se deu lucro antes do contador.', name: 'Rafael G.', role: 'Sócio', company: 'empresa de serviços' },
      { quote: 'Conta a pagar não passa mais batido. O sistema avisa e parei de pagar juro por esquecimento.', name: 'Camila V.', role: 'Financeiro', company: 'manutenção e instalação' },
      { quote: 'A fatura do cartão bagunçava meu saldo. Hoje a despesa é prevista e a fatura é o que conta. Faz sentido.', name: 'Lucas R.', role: 'Administrador', company: 'serviços de campo' },
    ],
    faq: [
      { q: 'O que o controle financeiro do Dominex faz?', a: 'Ele organiza contas a pagar e a receber, mostra o fluxo de caixa em tempo real, fecha o DRE do mês, trata o cartão de crédito separadamente e ajuda na conciliação — para você decidir com número, não no chute.' },
      { q: 'Como funciona o fluxo de caixa?', a: 'O fluxo consolida todas as entradas e saídas e projeta o saldo dos próximos dias. Você enxerga quanto entrou, quanto vai sair e quanto sobra, em tempo real.' },
      { q: 'O sistema gera DRE?', a: 'Sim. O DRE (Demonstração do Resultado) fecha o mês automaticamente com receitas, custos e despesas categorizados, mostrando a margem real do negócio sem montar planilha.' },
      { q: 'Como o Dominex trata o cartão de crédito?', a: 'A despesa de cartão entra como prevista (não como pagamento), e quem de fato vira pagamento é a fatura agregada. Assim o saldo da sua conta nunca aparece menor do que realmente é.' },
      { q: 'Consigo controlar contas a pagar e a receber com vencimento?', a: 'Sim. Cada conta tem vencimento, categoria e cliente ou fornecedor. O sistema organiza por data e avisa o que está perto de vencer.' },
      { q: 'Dá para acompanhar o saldo de várias contas e caixas?', a: 'Sim. Você acompanha o saldo de cada caixa e conta bancária da empresa e concilia o que foi previsto com o que de fato entrou e saiu.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você lança suas contas e já enxerga o fluxo de caixa e o resultado do mês.' },
    ],
    finalCta: {
      title: 'Saiba se o mês fechou no azul',
      subtitle: '14 dias grátis, sem cartão. Organize as contas, veja o fluxo de caixa e feche o DRE sem planilha.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 5. Ponto & Folha (RH)
  // ────────────────────────────────────────────────────────────────────────
  'ponto-e-folha': {
    metaTitle: 'Ponto eletrônico e folha de pagamento para equipes de campo | Dominex',
    metaDescription:
      'Ponto eletrônico e folha de pagamento para equipes de campo: registro de ponto com selfie e geolocalização, banco de horas, folha, vales e gestão de funcionários — tudo num só lugar. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'Ponto & Folha (RH)',
      h1: 'Ponto eletrônico e folha de pagamento para equipes de campo',
      h1Highlight: 'Ponto eletrônico e folha de pagamento',
      subtitle:
        'Sua equipe começa o dia no cliente, não no escritório — então o ponto de papel não serve. O Dominex registra o ponto com selfie e localização, calcula o banco de horas e fecha a folha com vales descontados.',
    },
    metrics: [
      { value: 'Selfie + GPS', label: 'ponto registrado de onde o técnico está' },
      { value: 'Banco de horas', label: 'extras e faltas calculados sozinhos' },
      { value: 'Folha + vales', label: 'fechamento do mês por funcionário' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'Controlar a jornada de quem vive na rua é difícil',
    painsSubheading: 'Onde a folha de ponto de papel não chega, o Dominex registra',
    pains: [
      {
        pain: 'Técnico começa o dia no cliente e o ponto fica sem registro',
        solution:
          'O ponto é batido pelo celular, de onde o funcionário estiver, com selfie e geolocalização. Você sabe quem entrou, a que horas e de onde.',
      },
      {
        pain: 'Banco de horas calculado à mão, sempre com erro',
        solution:
          'O sistema calcula horas trabalhadas, extras e faltas a partir das batidas. O banco de horas fecha sozinho, sem planilha.',
      },
      {
        pain: 'Vale dado no improviso e esquecido no fechamento da folha',
        solution:
          'Cada vale é registrado e descontado automaticamente no pagamento do salário. A folha fecha com o líquido certo.',
      },
      {
        pain: 'Dados dos funcionários espalhados em papéis e mensagens',
        solution:
          'O cadastro de funcionários centraliza salário, função, vales e extrato. Você vê a vida financeira de cada um num lugar só.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'Ponto com selfie e geolocalização',
        body: 'O funcionário registra entrada, saída e intervalos pelo celular, de onde estiver. Cada batida guarda uma selfie e a localização, então você comprova quem bateu o ponto e de onde — ideal para equipes que começam o dia direto no cliente, sem passar pela empresa.',
        image: {
          src: '/modulos/ponto-e-folha/1.webp',
          alt: 'Trabalhador de campo com equipamento de segurança consultando o celular na obra',
        },
      },
      {
        icon: Clock,
        title: 'Banco de horas calculado sozinho',
        body: 'A partir das batidas, o sistema calcula as horas trabalhadas, as horas extras e as faltas, mantendo o banco de horas atualizado. No fim do mês você tem o saldo de cada funcionário pronto, sem somar nada na mão nem brigar com planilha.',
        image: {
          src: '/modulos/ponto-e-folha/2.webp',
          alt: 'Gestor sentado à mesa conferindo informações em uma prancheta no escritório',
        },
      },
      {
        icon: Banknote,
        title: 'Folha de pagamento com vales descontados',
        body: 'O fechamento da folha consolida salário, banco de horas e os vales que o funcionário pegou ao longo do mês, descontando-os automaticamente do líquido. O recibo de pagamento e o recibo de vale saem prontos, e o extrato do funcionário mostra cada entrada e saída com o sinal certo.',
        image: {
          src: '/modulos/ponto-e-folha/3.webp',
          alt: 'Mulher contando notas de dinheiro no escritório, fechando o pagamento',
        },
      },
    ],
    featuresHeading: 'O RH da operação de campo, num só lugar',
    featuresSubheading: 'Do ponto na rua ao fechamento da folha',
    features: [
      { icon: Smartphone, title: 'Ponto pelo celular', desc: 'Entrada, saída e intervalos registrados de onde o funcionário estiver.' },
      { icon: Camera, title: 'Selfie no registro', desc: 'Cada batida guarda uma selfie, comprovando quem bateu o ponto.' },
      { icon: MapPin, title: 'Geolocalização', desc: 'A localização da batida fica registrada junto ao ponto.' },
      { icon: Clock, title: 'Banco de horas', desc: 'Extras e faltas calculados a partir das batidas, sem planilha.' },
      { icon: Banknote, title: 'Folha de pagamento', desc: 'Fechamento por funcionário com recibo pronto.' },
      { icon: HandCoins, title: 'Vales descontados', desc: 'Cada vale registrado é descontado no pagamento do salário.' },
      { icon: Users, title: 'Cadastro de funcionários', desc: 'Salário, função, vales e extrato centralizados por pessoa.' },
      { icon: FileText, title: 'Extrato do funcionário', desc: 'Entradas e saídas em cards, com o sinal certo de cada lançamento.' },
    ],
    testimonialsHeading: 'Quem controla a jornada, fecha a folha em paz',
    testimonials: [
      { quote: 'Minha equipe começa o dia no cliente. Com o ponto por selfie e GPS, eu sei quem entrou e de onde, sem papel.', name: 'Diego F.', role: 'Gestor', company: 'serviços de campo' },
      { quote: 'O banco de horas era uma dor de cabeça mensal. Agora fecha sozinho a partir das batidas.', name: 'Aline R.', role: 'RH', company: 'manutenção predial' },
      { quote: 'Vale a gente dava e esquecia no fechamento. Hoje desconta automático na folha. O líquido fecha certo.', name: 'Thiago P.', role: 'Administrador', company: 'instalações elétricas' },
    ],
    faq: [
      { q: 'Como funciona o ponto eletrônico do Dominex?', a: 'O funcionário registra entrada, saída e intervalos pelo celular, de onde estiver, com selfie e geolocalização em cada batida. Ideal para equipes de campo que começam o dia direto no cliente.' },
      { q: 'O ponto comprova quem bateu e de onde?', a: 'Sim. Cada batida guarda uma selfie do funcionário e a localização, dando comprovação de quem registrou o ponto e onde.' },
      { q: 'O banco de horas é calculado automaticamente?', a: 'Sim. A partir das batidas, o sistema calcula horas trabalhadas, extras e faltas, mantendo o banco de horas atualizado sem planilha.' },
      { q: 'Dá para fechar a folha de pagamento no sistema?', a: 'Sim. O fechamento consolida salário, banco de horas e vales, descontando os vales automaticamente. O recibo de pagamento sai pronto.' },
      { q: 'Como funcionam os vales?', a: 'Cada vale é registrado e descontado automaticamente no pagamento do salário. O extrato do funcionário mostra cada entrada e saída com o sinal correto.' },
      { q: 'Onde ficam os dados dos funcionários?', a: 'No cadastro de funcionários, que centraliza salário, função, vales e extrato. Você enxerga a vida financeira de cada um num lugar só.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você cadastra a equipe e já começa a registrar o ponto e fechar a folha.' },
    ],
    finalCta: {
      title: 'Controle a jornada de quem vive na rua',
      subtitle: '14 dias grátis, sem cartão. Registre o ponto com selfie e localização e feche a folha sem planilha.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 6. NFS-e
  // ────────────────────────────────────────────────────────────────────────
  'emissao-de-nfse': {
    metaTitle: 'Emissão de NFS-e para empresas de serviço | Dominex',
    metaDescription:
      'Emissão de NFS-e para empresas de serviço: emita a nota fiscal de serviço por cliente, com conformidade municipal, direto da plataforma. Sem sistema fiscal à parte. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'NFS-e',
      h1: 'Emissão de NFS-e para empresas de serviço',
      h1Highlight: 'NFS-e',
      subtitle:
        'Prestou o serviço e ainda precisa abrir outro sistema para emitir a nota? O Dominex emite a NFS-e por cliente, com a conformidade do seu município, sem sair da plataforma onde você já trabalha.',
    },
    metrics: [
      { value: 'NFS-e', label: 'nota fiscal de serviço emitida na plataforma' },
      { value: 'Por cliente', label: 'emissão amarrada ao cadastro do cliente' },
      { value: 'Municipal', label: 'conformidade com a prefeitura do município' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'A nota fiscal não pode ser um sistema à parte',
    painsSubheading: 'Onde o emissor avulso atrapalha, o Dominex integra',
    pains: [
      {
        pain: 'Emitir nota em outro sistema, com outro login e outra senha',
        solution:
          'A NFS-e é emitida dentro do Dominex, por cliente, sem abrir emissor separado nem redigitar dados. Menos troca de tela, menos erro.',
      },
      {
        pain: 'Dados do cliente digitados de novo só para a nota',
        solution:
          'A emissão puxa os dados do cadastro do cliente que você já tem na plataforma. Você seleciona o cliente e emite.',
      },
      {
        pain: 'Dúvida se o município aceita a emissão',
        solution:
          'O sistema verifica a cobertura do município antes de emitir, respeitando as regras da prefeitura. Você sabe se dá para emitir ali.',
      },
      {
        pain: 'Nota emitida e perdida, sem controle do que já foi faturado',
        solution:
          'As NFS-e ficam registradas e organizadas por cliente, com o que já foi emitido. Você acompanha o faturamento sem garimpar e-mail.',
      },
    ],
    deepDives: [
      {
        icon: FileText,
        title: 'NFS-e emitida sem sair da plataforma',
        body: 'A NFS-e (Nota Fiscal de Serviço eletrônica) é emitida de dentro do Dominex, na mesma plataforma onde você gerencia clientes e serviços. Você seleciona o cliente, confere os dados que já estão no cadastro e emite — sem abrir um emissor avulso, sem outro login, sem redigitar nada.',
        image: {
          src: '/modulos/emissao-de-nfse/1.webp',
          alt: 'Pessoa organizando documentos e usando um notebook na mesa do escritório',
        },
      },
      {
        icon: Building2,
        title: 'Conformidade municipal por cidade',
        body: 'O ISS é municipal e cada prefeitura tem suas regras. O Dominex verifica a cobertura do seu município antes de emitir, respeitando o padrão da cidade. Onde a emissão é suportada, você emite a NFS-e com tranquilidade, sabendo que a nota está conforme as exigências da prefeitura.',
        image: {
          src: '/modulos/emissao-de-nfse/2.webp',
          alt: 'Profissional conferindo documentos fiscais e formulários de imposto sobre a mesa de madeira',
        },
      },
      {
        icon: Receipt,
        title: 'Emissão por cliente, com histórico organizado',
        body: 'Cada NFS-e é emitida a partir do cadastro do cliente e fica registrada no histórico, organizada por quem foi faturado. Você acompanha o que já foi emitido, evita nota duplicada e mantém o controle do faturamento sem depender de planilha ou caixa de e-mail.',
        image: {
          src: '/modulos/emissao-de-nfse/3.webp',
          alt: 'Pessoa manuseando e organizando recibos e notas em papel, mantendo o histórico em ordem',
        },
      },
    ],
    featuresHeading: 'Nota fiscal de serviço, sem sistema à parte',
    featuresSubheading: 'A NFS-e onde você já gerencia a operação',
    features: [
      { icon: FileText, title: 'Emissão de NFS-e', desc: 'Emita a nota fiscal de serviço direto na plataforma, sem emissor avulso.' },
      { icon: UserCircle, title: 'Emissão por cliente', desc: 'A nota puxa os dados do cadastro do cliente que você já tem.' },
      { icon: Building2, title: 'Conformidade municipal', desc: 'O sistema respeita as regras do seu município ao emitir.' },
      { icon: CheckSquare, title: 'Verificação de cobertura', desc: 'Antes de emitir, o sistema confere se o município é suportado.' },
      { icon: Receipt, title: 'Histórico por cliente', desc: 'Acompanhe as NFS-e emitidas, organizadas por quem foi faturado.' },
      { icon: ShieldCheck, title: 'Padrão nacional', desc: 'Aderência ao padrão exigido das notas de serviço, conforme o município.' },
      { icon: BarChart3, title: 'Controle do faturamento', desc: 'Veja o que já foi emitido e mantenha o faturamento sob controle.' },
      { icon: FileCheck2, title: 'Documento pronto', desc: 'A NFS-e emitida fica disponível para enviar ao cliente.' },
    ],
    testimonialsHeading: 'Quem integrou a nota, ganhou tempo',
    testimonials: [
      { quote: 'Eu emitia a nota em outro sistema, com outro login. Agora emito direto no Dominex, pelo cadastro do cliente.', name: 'Rodrigo A.', role: 'Sócio', company: 'empresa de serviços' },
      { quote: 'Parei de redigitar dado de cliente só pra nota. Seleciono o cliente e emito a NFS-e.', name: 'Fábio M.', role: 'Administrador', company: 'manutenção e instalação' },
      { quote: 'Saber se meu município aceita antes de emitir evita dor de cabeça. O sistema confere por mim.', name: 'Bruno S.', role: 'Proprietário', company: 'serviços de campo' },
    ],
    faq: [
      { q: 'O que é NFS-e?', a: 'NFS-e é a Nota Fiscal de Serviço eletrônica, o documento fiscal de quem presta serviço (cujo imposto, o ISS, é municipal). É diferente da NF-e, que é da venda de produtos. O Dominex emite NFS-e, voltada para empresas prestadoras de serviço.' },
      { q: 'Preciso de outro sistema para emitir a nota?', a: 'Não. A NFS-e é emitida de dentro do Dominex, por cliente, sem abrir um emissor avulso nem usar outro login. Você seleciona o cliente e emite na mesma plataforma onde já trabalha.' },
      { q: 'A emissão respeita as regras do meu município?', a: 'Sim. O ISS é municipal e o Dominex verifica a cobertura do seu município antes de emitir, respeitando o padrão da prefeitura. Onde a emissão é suportada, a nota sai conforme as exigências da cidade.' },
      { q: 'A nota puxa os dados do cliente automaticamente?', a: 'Sim. A emissão usa os dados do cadastro do cliente que você já tem na plataforma, sem redigitar nada.' },
      { q: 'Consigo acompanhar as notas que emiti?', a: 'Sim. As NFS-e ficam registradas e organizadas por cliente, com o histórico do que já foi emitido, ajudando a controlar o faturamento e a evitar duplicidade.' },
      { q: 'Todos os municípios são suportados?', a: 'A cobertura é municipal e o sistema verifica seu município antes de emitir. Algumas cidades mantêm emissor próprio fora do padrão nacional; nesses casos o sistema sinaliza a situação na verificação de cobertura.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você ativa o módulo de notas e emite a NFS-e pelo cadastro do cliente.' },
    ],
    finalCta: {
      title: 'Emita a NFS-e onde você já trabalha',
      subtitle: '14 dias grátis, sem cartão. Emita a nota fiscal de serviço por cliente, sem sistema à parte.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 7. Portal do Cliente
  // ────────────────────────────────────────────────────────────────────────
  'portal-do-cliente': {
    metaTitle: 'Portal do cliente para empresas de serviço | Dominex',
    metaDescription:
      'Portal do cliente para empresas de serviço: seu cliente acompanha a ordem de serviço, vê o histórico de atendimentos, acessa documentos e aprova o orçamento por link — sem precisar ligar para o escritório. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'Portal do Cliente',
      h1: 'Portal do cliente para empresas de serviço',
      h1Highlight: 'Portal do cliente',
      subtitle:
        'Seu cliente liga toda hora pra saber se o técnico já foi? Com o Portal do Cliente, ele acompanha a ordem de serviço, vê o histórico, acessa os documentos e aprova o orçamento por link — sozinho.',
    },
    metrics: [
      { value: 'Por link', label: 'cliente acessa sem instalar nada' },
      { value: 'Acompanha a OS', label: 'status e histórico em tempo real' },
      { value: 'Aprova orçamento', label: 'sem telefonema, sem e-mail perdido' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'O telefone toca o dia todo com a mesma pergunta',
    painsSubheading: 'Onde o cliente precisa ligar para saber, o portal mostra sozinho',
    pains: [
      {
        pain: '"O técnico já foi? Já resolveu?"',
        solution:
          'O cliente abre o portal por link e vê o status da ordem de serviço em tempo real — agendada, em andamento, concluída. O telefone para de tocar pela mesma coisa.',
      },
      {
        pain: 'Cliente pede o histórico de atendimentos e ninguém acha',
        solution:
          'O portal mostra todo o histórico de OS do cliente, com datas e o que foi feito. Ele consulta sozinho, sem acionar o escritório.',
      },
      {
        pain: 'Orçamento aprovado por mensagem que some no WhatsApp',
        solution:
          'O cliente aprova o orçamento direto no portal, com registro de quando aprovou. Sem "me manda de novo", sem aprovação que se perde.',
      },
      {
        pain: 'Relatório e documentos enviados e perdidos no e-mail',
        solution:
          'Relatórios de OS e documentos ficam disponíveis no portal para o cliente acessar a qualquer momento, sem reenvio.',
      },
    ],
    deepDives: [
      {
        icon: Eye,
        title: 'O cliente acompanha a ordem de serviço sozinho',
        body: 'Pelo Portal do Cliente, acessado por um link (sem instalar app), o cliente vê em que pé está a ordem de serviço: agendada, técnico a caminho, em andamento, concluída. Ele acompanha o atendimento em tempo real e para de ligar para o escritório a cada hora — sua equipe ganha sossego para trabalhar.',
        image: {
          src: '/modulos/portal-do-cliente/1.webp',
          alt: 'Cliente sorrindo acompanhando o atendimento pelo celular em casa',
        },
      },
      {
        icon: BookOpen,
        title: 'Histórico e documentos sempre à mão',
        body: 'Todo o histórico de atendimentos do cliente fica no portal: as OS anteriores, as datas, o que foi feito e os relatórios em PDF. Os documentos ficam disponíveis para consulta a qualquer momento, então o cliente não precisa pedir "manda de novo aquele relatório" — está tudo lá.',
        image: {
          src: '/modulos/portal-do-cliente/2.webp',
          alt: 'Mãos consultando documentos impressos ao lado de um notebook sobre a mesa',
        },
      },
      {
        icon: CheckSquare,
        title: 'Aprovação de orçamento por link',
        body: 'O orçamento chega ao cliente por link e ele aprova direto no portal, com registro de quando aprovou. A aprovação não se perde no WhatsApp nem no e-mail, e o que foi aprovado segue para virar ordem de serviço — fechando o ciclo do comercial à execução sem fricção.',
        image: {
          src: '/modulos/portal-do-cliente/3.webp',
          alt: 'Homem sorrindo aprovando algo no notebook',
        },
      },
    ],
    featuresHeading: 'Autonomia para o cliente, sossego para você',
    featuresSubheading: 'O cliente resolve sozinho o que hoje vira telefonema',
    features: [
      { icon: Eye, title: 'Acompanhamento da OS', desc: 'O cliente vê o status da ordem de serviço em tempo real.' },
      { icon: BookOpen, title: 'Histórico de atendimentos', desc: 'Todas as OS anteriores, com datas e o que foi feito.' },
      { icon: FileText, title: 'Acesso a documentos', desc: 'Relatórios e documentos disponíveis para consulta a qualquer hora.' },
      { icon: CheckSquare, title: 'Aprovação de orçamento', desc: 'O cliente aprova o orçamento por link, com registro.' },
      { icon: Send, title: 'Acesso por link', desc: 'Sem instalar app: o cliente entra por um link.' },
      { icon: UserCircle, title: 'Identidade da sua empresa', desc: 'O portal pode levar a sua logo e cores, no plano White Label.' },
      { icon: BarChart3, title: 'Menos telefonemas', desc: 'O cliente consulta sozinho o que hoje vira ligação.' },
      { icon: ShieldCheck, title: 'Cada um vê só o seu', desc: 'O cliente acessa apenas os próprios atendimentos e documentos.' },
    ],
    testimonialsHeading: 'Quem abriu o portal, parou de atender o mesmo telefonema',
    testimonials: [
      { quote: 'O cliente ligava o dia todo pra saber se o técnico ia. Agora ele acompanha no portal e a gente trabalha em paz.', name: 'Juliana C.', role: 'Atendimento', company: 'empresa de serviços' },
      { quote: 'A aprovação de orçamento sumia no WhatsApp. No portal, ele aprova e fica registrado.', name: 'Marcelo T.', role: 'Sócio', company: 'manutenção predial' },
      { quote: 'O histórico de atendimentos no portal deu autonomia pro cliente. Ele consulta sem precisar da gente.', name: 'Patrícia L.', role: 'Gestora', company: 'instalações e serviços' },
    ],
    faq: [
      { q: 'O que é o Portal do Cliente?', a: 'É uma área onde o seu cliente acompanha as ordens de serviço, vê o histórico de atendimentos, acessa documentos e aprova orçamentos — sozinho, sem ligar para o escritório.' },
      { q: 'O cliente precisa instalar um aplicativo?', a: 'Não. O acesso é por link: o cliente abre no navegador e já enxerga o status da OS, o histórico e os documentos.' },
      { q: 'O cliente consegue acompanhar a ordem de serviço em tempo real?', a: 'Sim. Ele vê o status da OS (agendada, em andamento, concluída) em tempo real, o que reduz drasticamente os telefonemas para o escritório.' },
      { q: 'Dá para o cliente aprovar orçamento pelo portal?', a: 'Sim. O orçamento chega por link e o cliente aprova direto no portal, com registro de quando aprovou. A aprovação não se perde no WhatsApp.' },
      { q: 'O cliente vê o histórico e os documentos dos atendimentos?', a: 'Sim. Todo o histórico de OS, com datas e o que foi feito, mais os relatórios e documentos, fica disponível no portal para consulta a qualquer momento.' },
      { q: 'Cada cliente vê só os próprios dados?', a: 'Sim. No portal, cada cliente acessa apenas os próprios atendimentos e documentos.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você ativa o portal e compartilha o link com seus clientes.' },
    ],
    finalCta: {
      title: 'Dê autonomia ao cliente e sossego à equipe',
      subtitle: '14 dias grátis, sem cartão. Deixe o cliente acompanhar a OS e aprovar o orçamento sozinho.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 8. Estoque
  // ────────────────────────────────────────────────────────────────────────
  'controle-de-estoque': {
    metaTitle: 'Controle de estoque para equipes de campo | Dominex',
    metaDescription:
      'Controle de estoque para equipes de campo: cadastro de peças e materiais, entrada e saída, baixa automática por ordem de serviço e inventário. Saiba o que tem, o que saiu e em qual OS. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'Estoque',
      h1: 'Controle de estoque para equipes de campo',
      h1Highlight: 'Controle de estoque',
      subtitle:
        'A peça acabou bem na hora do atendimento e ninguém viu? O Dominex controla peças e materiais, dá baixa automática a cada ordem de serviço e mostra o que tem em estoque de verdade.',
    },
    metrics: [
      { value: 'Entrada/saída', label: 'movimentação de peças sob controle' },
      { value: 'Baixa por OS', label: 'consumo lançado na ordem de serviço' },
      { value: 'Inventário', label: 'saldo real conferido quando você quiser' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'Estoque no escuro trava o atendimento',
    painsSubheading: 'Onde a peça some sem registro, o Dominex dá baixa certa',
    pains: [
      {
        pain: 'Técnico chega no cliente e a peça não tinha mais no estoque',
        solution:
          'O saldo de cada peça fica atualizado a cada entrada e saída. Você sabe o que tem antes de mandar o técnico, sem surpresa no atendimento.',
      },
      {
        pain: 'Material usado na OS e ninguém deu baixa',
        solution:
          'O consumo é lançado na própria ordem de serviço e o estoque baixa automaticamente. Você sabe o que saiu e em qual atendimento.',
      },
      {
        pain: 'Não sabe quanto gastou de material em cada serviço',
        solution:
          'Como a baixa está amarrada à OS, você enxerga o custo de material por atendimento. O orçamento do próximo serviço fica mais preciso.',
      },
      {
        pain: 'Inventário só descobre o furo depois que falta',
        solution:
          'Faça o inventário quando quiser e ajuste o saldo real. O sistema mostra a divergência e mantém o estoque confiável.',
      },
    ],
    deepDives: [
      {
        icon: Package,
        title: 'Peças e materiais com saldo sempre atualizado',
        body: 'Cadastre cada peça e material com código, unidade e quantidade. Toda entrada (compra, reposição) e toda saída (uso, perda) atualiza o saldo na hora. Você consulta o estoque e enxerga o que tem de verdade, evitando mandar o técnico para um atendimento sem a peça necessária.',
        image: {
          src: '/modulos/controle-de-estoque/1.webp',
          alt: 'Prateleiras identificadas com divisórias numeradas em um almoxarifado',
        },
      },
      {
        icon: PackageMinus,
        title: 'Baixa automática por ordem de serviço',
        body: 'O material usado no atendimento é lançado na própria ordem de serviço e o estoque baixa sozinho. Isso amarra o consumo à OS: você sabe o que saiu, em qual serviço e para qual cliente — e ainda enxerga o custo de material por atendimento, deixando os próximos orçamentos mais precisos.',
        image: {
          src: '/modulos/controle-de-estoque/2.webp',
          alt: 'Funcionário de estoque registrando itens com leitor e tablet no galpão',
        },
      },
      {
        icon: ClipboardList,
        title: 'Inventário para manter o saldo confiável',
        body: 'Quando precisar, rode o inventário: confira a contagem física contra o saldo do sistema e ajuste a divergência. O estoque volta a refletir a realidade, e você descobre furo ou perda antes que ele atrapalhe o próximo atendimento — não depois que a peça faltou no cliente.',
        image: {
          src: '/modulos/controle-de-estoque/3.webp',
          alt: 'Funcionário conferindo o inventário do estoque com um tablet no galpão',
        },
      },
    ],
    featuresHeading: 'O estoque que conversa com o campo',
    featuresSubheading: 'Saiba o que tem, o que saiu e em qual ordem de serviço',
    features: [
      { icon: Package, title: 'Cadastro de peças', desc: 'Peças e materiais com código, unidade e quantidade.' },
      { icon: TrendingUp, title: 'Entrada de estoque', desc: 'Registre compras e reposições e atualize o saldo na hora.' },
      { icon: PackageMinus, title: 'Saída de estoque', desc: 'Lance o uso e a perda, com o saldo sempre certo.' },
      { icon: ClipboardList, title: 'Baixa por OS', desc: 'O consumo é lançado na ordem de serviço e baixa automático.' },
      { icon: Receipt, title: 'Custo de material por OS', desc: 'Veja quanto de material cada atendimento consumiu.' },
      { icon: CheckSquare, title: 'Inventário', desc: 'Confira a contagem física e ajuste a divergência quando quiser.' },
      { icon: ShieldCheck, title: 'Saldo confiável', desc: 'O estoque reflete a realidade, sem furo escondido.' },
      { icon: BarChart3, title: 'O que está acabando', desc: 'Enxergue as peças com saldo baixo antes de faltar.' },
    ],
    testimonialsHeading: 'Quem controlou o estoque, parou de furar atendimento',
    testimonials: [
      { quote: 'O técnico chegava no cliente e a peça tinha acabado. Agora o saldo é certo e a gente repõe antes de faltar.', name: 'Rafael G.', role: 'Sócio', company: 'manutenção e instalação' },
      { quote: 'Material saía e ninguém dava baixa. Hoje baixa na OS, automático. Sei o que saiu e em qual serviço.', name: 'Camila V.', role: 'Almoxarifado', company: 'serviços de campo' },
      { quote: 'Como a baixa fica na ordem de serviço, eu enxergo o custo de material por atendimento. O orçamento ficou mais preciso.', name: 'Lucas R.', role: 'Gestor', company: 'empresa de serviços' },
    ],
    faq: [
      { q: 'O que o controle de estoque do Dominex faz?', a: 'Ele cadastra peças e materiais, registra entradas e saídas, dá baixa automática por ordem de serviço e permite inventário — para você saber o que tem, o que saiu e em qual atendimento.' },
      { q: 'A baixa de estoque acontece automaticamente?', a: 'Sim. O material usado é lançado na própria ordem de serviço e o estoque baixa sozinho, amarrando o consumo à OS e ao cliente.' },
      { q: 'Consigo saber o custo de material por atendimento?', a: 'Sim. Como a baixa está vinculada à OS, você enxerga quanto de material cada atendimento consumiu, deixando os próximos orçamentos mais precisos.' },
      { q: 'Como funciona o inventário?', a: 'Você faz a contagem física quando quiser, compara com o saldo do sistema e ajusta a divergência. O estoque volta a refletir a realidade.' },
      { q: 'O saldo fica atualizado em tempo real?', a: 'Sim. Toda entrada e saída atualiza o saldo na hora, então você consulta o estoque e vê o que tem de verdade.' },
      { q: 'Dá para ver as peças que estão acabando?', a: 'Sim. Você enxerga as peças com saldo baixo e repõe antes de faltar no atendimento.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você cadastra suas peças e já começa a controlar entradas, saídas e baixas por OS.' },
    ],
    finalCta: {
      title: 'Pare de furar atendimento por falta de peça',
      subtitle: '14 dias grátis, sem cartão. Controle o estoque e dê baixa automática a cada ordem de serviço.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 9. Orçamentos & Contratos
  // ────────────────────────────────────────────────────────────────────────
  'orcamentos-e-contratos': {
    metaTitle: 'Orçamentos e contratos para empresas de serviço | Dominex',
    metaDescription:
      'Orçamentos e contratos para empresas de serviço: monte orçamentos profissionais, envie como proposta por link, feche contratos recorrentes que geram ordens de serviço sozinhos e converta a aprovação em OS. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'Orçamentos & Contratos',
      h1: 'Orçamentos e contratos para empresas de serviço',
      h1Highlight: 'Orçamentos e contratos',
      subtitle:
        'Orçamento feito de cabeça e contrato esquecido até o cliente reclamar? O Dominex monta orçamentos profissionais, vira proposta por link e fecha contratos recorrentes que geram as ordens de serviço sozinhos.',
    },
    metrics: [
      { value: 'Proposta por link', label: 'cliente aprova de onde estiver' },
      { value: 'Recorrente', label: 'contrato que gera as OS sozinho' },
      { value: 'Aprovou → OS', label: 'orçamento vira ordem de serviço' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'Orçamento e contrato no improviso travam a receita',
    painsSubheading: 'Onde falta padrão, o Dominex profissionaliza e automatiza',
    pains: [
      {
        pain: 'Orçamento feito de cabeça, sem padrão e sem rastro',
        solution:
          'Monte orçamentos com itens, mão de obra e material em um modelo profissional com a sua marca. Cada orçamento fica registrado e ligado ao cliente.',
      },
      {
        pain: 'Proposta enviada por mensagem e aprovada por "ok" que some',
        solution:
          'A proposta vai por link e o cliente aprova com registro de quando aprovou. Você acompanha quem abriu e quem fechou.',
      },
      {
        pain: 'Contrato de preventiva esquecido até o cliente cobrar',
        solution:
          'Contratos recorrentes (mensal, trimestral) geram as ordens de serviço sozinhos no intervalo certo. Você nunca mais fura um SLA por esquecimento.',
      },
      {
        pain: 'Fechou o serviço e a execução começou do zero',
        solution:
          'O orçamento aprovado vira ordem de serviço com um clique, levando o escopo para o campo. Comercial e operação trabalham com os mesmos dados.',
      },
    ],
    deepDives: [
      {
        icon: FileText,
        title: 'Orçamento profissional com a sua marca',
        body: 'Monte o orçamento com itens, mão de obra e material, organizados em um documento com a sua logo e cores. O orçamento fica ligado ao cliente e à oportunidade, com valor calculado, condições e validade. Você passa uma imagem profissional e para de perder venda por orçamento feito no improviso.',
        image: {
          src: '/modulos/orcamentos-e-contratos/1.webp',
          alt: 'Profissional escrevendo e montando um orçamento sobre a mesa',
        },
      },
      {
        icon: Send,
        title: 'Proposta por link, aprovação registrada',
        body: 'O orçamento vira proposta enviada por link: o cliente abre no celular, confere e aprova — com registro de quando aprovou. Você acompanha o status (enviada, vista, aprovada) e para de depender do "ok" no WhatsApp que some. A aprovação fica documentada, pronta para virar contrato ou ordem de serviço.',
        image: {
          src: '/modulos/orcamentos-e-contratos/2.webp',
          alt: 'Pessoa sorrindo aprovando uma proposta pelo celular',
        },
      },
      {
        icon: Repeat,
        title: 'Contratos recorrentes que geram as OS sozinhos',
        body: 'Para manutenção preventiva e atendimento periódico, cadastre o contrato com a recorrência certa (mensal, bimestral, trimestral). O Dominex gera as ordens de serviço automaticamente no intervalo combinado, já com o escopo do contrato. A receita recorrente roda sem depender da memória de ninguém e nenhum SLA fura.',
        image: {
          src: '/modulos/orcamentos-e-contratos/3.webp',
          alt: 'Mão assinando um contrato com caneta sobre a mesa de madeira',
        },
      },
    ],
    featuresHeading: 'Do orçamento ao contrato, sem perder venda',
    featuresSubheading: 'Profissionalize a proposta e automatize a recorrência',
    features: [
      { icon: FileText, title: 'Orçamentos profissionais', desc: 'Itens, mão de obra e material num documento com a sua marca.' },
      { icon: Send, title: 'Proposta por link', desc: 'Envie por link e acompanhe quando o cliente abre e aprova.' },
      { icon: CheckSquare, title: 'Aprovação registrada', desc: 'A aprovação do cliente fica documentada, com data.' },
      { icon: FileSignature, title: 'Contratos', desc: 'Feche o negócio em contrato ligado ao cliente.' },
      { icon: Repeat, title: 'Recorrência automática', desc: 'Contratos que geram as ordens de serviço sozinhos no intervalo certo.' },
      { icon: TrendingUp, title: 'Conversão em OS', desc: 'O orçamento aprovado vira ordem de serviço com um clique.' },
      { icon: UserCircle, title: 'Ligado ao cliente', desc: 'Cada orçamento e contrato fica no histórico do cliente.' },
      { icon: BarChart3, title: 'Acompanhamento', desc: 'Veja propostas enviadas, vistas e aprovadas em um painel.' },
    ],
    testimonialsHeading: 'Quem padronizou a proposta, fecha mais',
    testimonials: [
      { quote: 'Meu orçamento era um texto no WhatsApp. Agora é um documento com a minha marca, e o cliente aprova por link.', name: 'Diego F.', role: 'Sócio', company: 'instalações e serviços' },
      { quote: 'O contrato de preventiva gerava OS de cabeça. Hoje o sistema gera sozinho no intervalo certo. Acabou o SLA furado.', name: 'Aline R.', role: 'Coordenadora', company: 'manutenção predial' },
      { quote: 'Aprovou a proposta, virou ordem de serviço com um clique. O campo já recebe o escopo pronto.', name: 'Thiago P.', role: 'Gestor', company: 'serviços de campo' },
    ],
    faq: [
      { q: 'Como funcionam os orçamentos no Dominex?', a: 'Você monta orçamentos com itens, mão de obra e material num documento profissional com a sua marca, ligado ao cliente. O orçamento fica registrado e pode virar proposta, contrato ou ordem de serviço.' },
      { q: 'O cliente aprova a proposta por link?', a: 'Sim. A proposta vai por link, o cliente abre no celular e aprova com registro de quando aprovou. Você acompanha quem abriu e quem fechou, sem depender do "ok" no WhatsApp.' },
      { q: 'O que são contratos recorrentes?', a: 'São contratos de manutenção preventiva ou atendimento periódico com recorrência configurável (mensal, bimestral, trimestral). O Dominex gera as ordens de serviço automaticamente no intervalo certo, com o escopo do contrato pronto.' },
      { q: 'Os contratos geram ordens de serviço sozinhos?', a: 'Sim. Cadastrado o contrato com a recorrência, as OS são geradas pelo sistema no intervalo combinado, sem você precisar lembrar — nenhum SLA fura por esquecimento.' },
      { q: 'O orçamento aprovado vira ordem de serviço?', a: 'Sim. Com um clique, o orçamento aprovado vira ordem de serviço, levando o escopo vendido para o campo. Comercial e operação trabalham com os mesmos dados.' },
      { q: 'Os orçamentos e contratos ficam ligados ao cliente?', a: 'Sim. Cada orçamento e contrato fica no histórico do cliente, organizado, para consulta e acompanhamento.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você monta seu primeiro orçamento e já envia a proposta por link.' },
    ],
    finalCta: {
      title: 'Profissionalize a proposta e automatize o contrato',
      subtitle: '14 dias grátis, sem cartão. Monte orçamentos com a sua marca e deixe o contrato gerar as OS sozinho.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 10. Rastreamento & Agenda
  // ────────────────────────────────────────────────────────────────────────
  'rastreamento-de-equipes': {
    metaTitle: 'Rastreamento de equipes e agenda para serviços de campo | Dominex',
    metaDescription:
      'Rastreamento de equipes e agenda para serviços de campo: localização em tempo real no mapa, agenda e roteirização, check-in e check-out validados por endereço e histórico de deslocamento. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'Rastreamento & Agenda',
      h1: 'Rastreamento de equipes e agenda para serviços de campo',
      h1Highlight: 'Rastreamento de equipes',
      subtitle:
        'Fica ligando para saber onde cada técnico está? O Dominex mostra a equipe no mapa em tempo real, organiza a agenda do dia e valida o check-in pelo endereço do cliente.',
    },
    metrics: [
      { value: 'Tempo real', label: 'equipe no mapa enquanto trabalha' },
      { value: 'Check-in/out', label: 'validados pelo endereço do cliente' },
      { value: 'Agenda', label: 'rota do dia organizada por técnico' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'Não saber onde a equipe está custa caro',
    painsSubheading: 'Onde o telefone não responde, o mapa mostra',
    pains: [
      {
        pain: '"Onde está o técnico agora? Já chegou no cliente?"',
        solution:
          'O mapa ao vivo mostra onde cada técnico está enquanto trabalha. Você acompanha a equipe sem ficar ligando.',
      },
      {
        pain: 'Agenda do dia na cabeça e técnico atravessando a cidade à toa',
        solution:
          'A agenda organiza os atendimentos do dia e ajuda a roteirizar, distribuindo pelo técnico mais próximo. Menos deslocamento, mais serviço.',
      },
      {
        pain: '"Será que ele foi mesmo no cliente?"',
        solution:
          'O check-in e o check-out são validados pelo endereço do cliente, com horário registrado. Você comprova a presença na visita.',
      },
      {
        pain: 'Sem histórico de deslocamento para conferir a rota',
        solution:
          'O histórico de deslocamento guarda os pontos-chave do dia. Você confere por onde a equipe passou e justifica o tempo em campo.',
      },
    ],
    deepDives: [
      {
        icon: Navigation,
        title: 'Equipe no mapa em tempo real',
        body: 'O mapa ao vivo mostra onde cada técnico está enquanto a equipe trabalha. Você acompanha a operação de campo de um só lugar, sabe quem está perto do próximo chamado e para de ligar para perguntar localização. A visibilidade do dia inteiro fica na tela, não no telefone.',
        image: {
          src: '/modulos/rastreamento-de-equipes/1.webp',
          alt: 'Frota de vans de serviço enfileiradas, equipe de campo acompanhada como num mapa ao vivo',
        },
      },
      {
        icon: Calendar,
        title: 'Agenda e roteirização do dia',
        body: 'Monte a agenda do dia com os atendimentos de cada técnico e organize a rota para reduzir deslocamento. Distribua o chamado pelo técnico mais próximo do endereço e evite conflito de horário. Menos tempo no trânsito significa mais atendimentos por dia e cliente com janela mais previsível.',
        image: {
          src: '/modulos/rastreamento-de-equipes/2.webp',
          alt: 'Motorista usando navegação GPS no carro para seguir a rota do dia',
        },
      },
      {
        icon: MapPin,
        title: 'Check-in/out validado e histórico de deslocamento',
        body: 'O técnico faz check-in e check-out na visita, validados pelo endereço do cliente, com horário registrado — comprovando a presença no atendimento. O histórico de deslocamento guarda os pontos-chave do percurso, então você confere por onde a equipe passou e justifica o tempo gasto em campo.',
        image: {
          src: '/modulos/rastreamento-de-equipes/3.webp',
          alt: 'Técnico saindo da van de serviço ao chegar no endereço do cliente para o check-in',
        },
      },
    ],
    featuresHeading: 'Veja a operação de campo, não imagine',
    featuresSubheading: 'Localização, agenda e comprovação de presença num só lugar',
    features: [
      { icon: Navigation, title: 'Mapa ao vivo', desc: 'Localização da equipe em tempo real enquanto trabalha.' },
      { icon: Calendar, title: 'Agenda do dia', desc: 'Atendimentos organizados por técnico, sem conflito de horário.' },
      { icon: RouteIcon, title: 'Roteirização', desc: 'Distribua o chamado pelo técnico mais próximo e reduza deslocamento.' },
      { icon: MapPin, title: 'Check-in validado', desc: 'Entrada na visita validada pelo endereço do cliente.' },
      { icon: CheckSquare, title: 'Check-out registrado', desc: 'Saída com horário, comprovando o tempo no atendimento.' },
      { icon: BookOpen, title: 'Histórico de deslocamento', desc: 'Pontos-chave do percurso guardados para conferência.' },
      { icon: Clock, title: 'Tempo em campo', desc: 'Justifique o tempo gasto em cada visita com dado, não palpite.' },
      { icon: BarChart3, title: 'Produtividade', desc: 'Acompanhe atendimentos por técnico e por dia.' },
    ],
    testimonialsHeading: 'Quem vê a equipe no mapa, parou de ligar',
    testimonials: [
      { quote: 'Eu vivia ligando pra saber onde cada técnico estava. Agora vejo todos no mapa e organizo a rota do dia.', name: 'Rodrigo A.', role: 'Gestor de Operações', company: 'serviços de campo' },
      { quote: 'O check-in pelo endereço do cliente acabou com a dúvida se o técnico foi mesmo. Tenho a comprovação.', name: 'Fábio M.', role: 'Coordenador', company: 'manutenção predial' },
      { quote: 'Com a agenda e a roteirização, a equipe faz mais atendimentos por dia e atravessa menos a cidade à toa.', name: 'Bruno S.', role: 'Sócio', company: 'instalações e serviços' },
    ],
    faq: [
      { q: 'O Dominex mostra onde minha equipe está em tempo real?', a: 'Sim. O mapa ao vivo mostra onde cada técnico está enquanto trabalha, para você acompanhar a operação de campo sem ficar ligando.' },
      { q: 'Como funciona a agenda e a roteirização?', a: 'A agenda organiza os atendimentos do dia por técnico e ajuda a roteirizar, distribuindo o chamado pelo técnico mais próximo do endereço, reduzindo deslocamento e evitando conflito de horário.' },
      { q: 'O check-in comprova que o técnico foi ao cliente?', a: 'Sim. O check-in e o check-out são validados pelo endereço do cliente, com horário registrado, comprovando a presença na visita e o tempo no atendimento.' },
      { q: 'Tem histórico de deslocamento?', a: 'Sim. O histórico guarda os pontos-chave do percurso do dia, para você conferir por onde a equipe passou e justificar o tempo em campo.' },
      { q: 'A roteirização ajuda a fazer mais atendimentos por dia?', a: 'Sim. Ao distribuir pelo técnico mais próximo e organizar a rota, a equipe atravessa menos a cidade à toa e atende mais clientes no mesmo dia.' },
      { q: 'O cliente ganha previsibilidade de horário?', a: 'Sim. Com a agenda organizada, você dá ao cliente uma janela de atendimento mais previsível e reduz visitas furadas.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Você cadastra a equipe e já acompanha o mapa ao vivo e a agenda do dia.' },
    ],
    finalCta: {
      title: 'Veja sua equipe de campo no mapa',
      subtitle: '14 dias grátis, sem cartão. Acompanhe a equipe em tempo real, organize a agenda e comprove cada visita.',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 11. Área do Técnico™
  // ────────────────────────────────────────────────────────────────────────
  'area-do-tecnico': {
    metaTitle: 'Área do Técnico™: o app de campo da sua equipe | Dominex',
    metaDescription:
      'Área do Técnico™: o app de campo da sua equipe. Ordem de serviço no celular, ferramentas técnicas (cálculo de gás, superaquecimento, dimensionamento de contator), catálogo de equipamentos e app instalável no celular. Teste grátis 14 dias, sem cartão.',
    hero: {
      eyebrow: 'Área do Técnico™',
      h1: 'Área do Técnico™: o app de campo da sua equipe',
      h1Highlight: 'Área do Técnico™',
      subtitle:
        'O técnico não trabalha sentado no escritório — ele precisa de tudo no celular. A Área do Técnico™ é um app instalável no celular que traz a ordem de serviço, as ferramentas de cálculo e o catálogo na palma da mão, em campo.',
    },
    metrics: [
      { value: 'PWA', label: 'app instalável no celular do técnico' },
      { value: 'Ferramentas', label: 'cálculos técnicos no bolso da equipe' },
      { value: 'No bolso', label: 'tudo no celular do técnico, em campo' },
      { value: '4,9/5', label: 'satisfação das empresas que usam' },
    ],
    painsHeading: 'O técnico precisa de tudo no campo, não no escritório',
    painsSubheading: 'Onde a equipe trabalha sem ferramenta na mão, a Área do Técnico™ entrega',
    pains: [
      {
        pain: 'Técnico abre a OS no celular e falta metade da informação',
        solution:
          'Na Área do Técnico™, a ordem de serviço chega completa: cliente, endereço, equipamento, histórico e checklist. Ele executa do celular, sem ligar pro escritório.',
      },
      {
        pain: 'Cálculo de gás e superaquecimento feito de cabeça, com risco de erro',
        solution:
          'As ferramentas técnicas trazem cálculo de carga de gás, superaquecimento e tabelas de pressão por temperatura no bolso. Menos erro, mais precisão no campo.',
      },
      {
        pain: 'Dimensionar contator no improviso, sem referência',
        solution:
          'O dimensionamento de contator e relé térmico está na própria ferramenta, com o passo a passo. O técnico calcula certo na hora.',
      },
      {
        pain: 'Técnico carrega manual e tabela impressos para consultar no cliente',
        solution:
          'O catálogo de equipamentos, com fotos e manuais, fica no celular do técnico. Ele consulta o modelo e a especificação na hora, em campo, sem papel nem ligar pro escritório.',
      },
    ],
    deepDives: [
      {
        icon: Smartphone,
        title: 'O app de campo (PWA) com a OS na palma da mão',
        body: 'A Área do Técnico™ é um app instalável no celular (PWA), sem loja de aplicativos. O técnico vê a fila do dia, abre a ordem de serviço completa — cliente, endereço com mapa, equipamento e histórico — executa o checklist, tira foto, colhe a assinatura e fecha o serviço. Tudo de campo, sem voltar ao escritório.',
        image: {
          src: '/modulos/area-do-tecnico/1.webp',
          alt: 'Técnico de macacão usando o celular em campo para abrir a ordem de serviço',
        },
      },
      {
        icon: Calculator,
        title: 'Ferramentas técnicas no bolso do técnico',
        body: 'A equipe leva no celular as calculadoras do dia a dia: carga e curvas de pressão por temperatura dos gases refrigerantes, cálculo de superaquecimento, dimensionamento de contator e relé térmico (com partida direta) e um catálogo de equipamentos com fotos e manuais. O cálculo sai certo na hora, no campo, sem depender da memória nem de planilha.',
        image: {
          src: '/modulos/area-do-tecnico/2.webp',
          alt: 'Técnico de refrigeração usando manifold e ferramentas no ar-condicionado',
        },
      },
      {
        icon: Download,
        title: 'App instalável no celular, sem loja de aplicativos',
        body: 'A Área do Técnico™ é um app instalável (PWA): o técnico adiciona ao celular direto pelo navegador, sem passar por loja de aplicativos, e abre como qualquer outro app — leve e rápido. A ordem de serviço, as ferramentas de cálculo e o catálogo ficam na palma da mão, prontos para usar no cliente, em campo.',
        image: {
          src: '/modulos/area-do-tecnico/3.webp',
          alt: 'Profissional com capacete consultando o app num tablet no local de trabalho',
        },
      },
    ],
    featuresHeading: 'O campo inteiro no celular do técnico',
    featuresSubheading: 'OS, ferramentas e catálogo na palma da mão, em campo',
    features: [
      { icon: Smartphone, title: 'App PWA instalável', desc: 'Instala no celular sem loja de aplicativos, leve e rápido.' },
      { icon: ClipboardList, title: 'OS no celular', desc: 'Ordem de serviço completa, com checklist, foto e assinatura.' },
      { icon: Gauge, title: 'Cálculo de gás', desc: 'Carga e curvas de pressão por temperatura dos refrigerantes.' },
      { icon: Calculator, title: 'Superaquecimento', desc: 'Cálculo de superaquecimento direto no app.' },
      { icon: Wrench, title: 'Dimensionamento de contator', desc: 'Contator e relé térmico com partida direta, passo a passo.' },
      { icon: BookOpen, title: 'Catálogo de equipamentos', desc: 'Fotos e manuais de equipamentos para consulta no campo.' },
      { icon: Camera, title: 'Foto antes e depois', desc: 'Registro fotográfico anexado à OS, tirado do celular no cliente.' },
      { icon: PenLine, title: 'Assinatura digital', desc: 'O cliente assina na tela do celular e entra direto no relatório.' },
    ],
    testimonialsHeading: 'O técnico no controle, direto do celular',
    testimonials: [
      { quote: 'A Área do Técnico™ virou o app oficial da equipe. OS, foto, assinatura — tudo do celular, no cliente.', name: 'Diego F.', role: 'Gestor', company: 'refrigeração e climatização' },
      { quote: 'As ferramentas de cálculo de gás e superaquecimento no bolso reduziram erro no campo. O técnico calcula certo na hora.', name: 'Aline R.', role: 'Coordenadora Técnica', company: 'manutenção de ar-condicionado' },
      { quote: 'Ter a OS, as calculadoras e o catálogo todos no celular mudou o dia do técnico. Ele resolve no cliente, sem voltar pra base nem carregar manual impresso.', name: 'Thiago P.', role: 'Fundador', company: 'serviços de refrigeração' },
    ],
    faq: [
      { q: 'O que é a Área do Técnico™?', a: 'É o app de campo da sua equipe: um aplicativo instalável no celular (PWA) com a ordem de serviço, as ferramentas técnicas de cálculo e o catálogo de equipamentos, tudo na palma da mão do técnico para usar no cliente.' },
      { q: 'Preciso baixar na loja de aplicativos?', a: 'Não. A Área do Técnico™ é um PWA: instala direto pelo navegador no celular do técnico, sem passar por loja de aplicativos, e fica leve e rápida.' },
      { q: 'Quais ferramentas técnicas estão disponíveis?', a: 'Cálculo de carga e curvas de pressão por temperatura dos gases refrigerantes, cálculo de superaquecimento, dimensionamento de contator e relé térmico com partida direta, e um catálogo de equipamentos com fotos e manuais — tudo no celular.' },
      { q: 'O técnico consegue executar a ordem de serviço pelo app?', a: 'Sim. Ele abre a OS completa (cliente, endereço, equipamento, histórico), preenche o checklist, tira fotos, colhe a assinatura e fecha o serviço, tudo do celular.' },
      { q: 'A equipe usa tudo direto do celular, em campo?', a: 'Sim. A ordem de serviço, as ferramentas de cálculo e o catálogo de equipamentos ficam no celular do técnico, prontos para usar no cliente. Ele executa a OS, faz os cálculos e consulta o catálogo em campo, sem voltar ao escritório nem carregar manual impresso.' },
      { q: 'As ferramentas de cálculo servem para refrigeração e climatização?', a: 'Sim. As calculadoras de gás, superaquecimento e curvas de pressão são voltadas ao dia a dia de refrigeração e climatização, e o dimensionamento de contator atende instalação e partida de equipamentos.' },
      { q: 'Como começo a usar? Precisa de cartão?', a: 'É só criar a conta e usar 14 dias grátis, sem cartão de crédito. Sua equipe instala a Área do Técnico™ no celular e já começa a trabalhar no campo.' },
    ],
    finalCta: {
      title: 'Ponha o campo inteiro no celular da equipe',
      subtitle: '14 dias grátis, sem cartão. OS, ferramentas técnicas e catálogo na Área do Técnico™, no celular da equipe.',
    },
  },
};

export default ptBr;
