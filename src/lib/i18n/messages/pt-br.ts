// ─────────────────────────────────────────────────────────────────────────────
// i18n — strings de UI do SITE PÚBLICO (pt-br é a FONTE da verdade do shape).
//
// pt-br carrega o texto EXATO que hoje está cravado no JSX (nada reescrito aqui:
// é só mover string pra chave). en traduz; es/fr caem no fallback pt-br por ora.
//
// Organização por ÁREA (sustentável conforme o site cresce):
//   • nav        → LandingNavbar (labels, mega-menus, taglines, CTAs)
//   • footer     → LandingFooter (colunas, copy, tagline)
//   • segmentLabels / moduleLabels → nomes exibidos no mega-menu/rodapé,
//     chaveados pelo SLUG (estável entre idiomas; o slug NUNCA muda).
//   • home       → seções da Landing (hero, features, pricing, faq, etc.)
//   • quemSomos  → página institucional /quem-somos
//   • privacidade / termos → páginas legais (tradução automática; ver relatório)
//
// Conteúdo longo de segmento/módulo/blog NÃO vem por aqui — é dados por idioma
// em content/<locale>.ts (outra frente).
// ─────────────────────────────────────────────────────────────────────────────

export const ptBr = {
  languageSelector: {
    label: 'Idioma',
    ariaLabel: 'Selecionar idioma',
  },

  // ── Navbar ──────────────────────────────────────────────────────────────
  nav: {
    platform: 'Plataforma',
    solutions: 'Soluções',
    segments: 'Segmentos',
    pricing: 'Preços',
    blog: 'Blog',
    login: 'Entrar',
    signup: 'Criar Conta',
    trialSticky: 'Testar grátis por 14 dias',
    openMenu: 'Menu',
    openMenuAria: 'Abrir menu',
    closeMenuAria: 'Fechar menu',
    solutionsMenuAria: 'Nossas soluções',
    solutionsMenuHeader: 'Tudo o que a plataforma faz',
    segmentsMenuAria: 'Nossos segmentos',
    segmentsMenuHeader: 'Nossos segmentos',
    // Taglines do mega-menu Soluções, chaveadas pelo slug do módulo.
    solutionTaglines: {
      'os-digital': 'OS no app, com foto, checklist e assinatura do cliente.',
      'sistema-pmoc': 'Relatório PMOC automático pela Lei 13.589/2018.',
      'sistema-crm': 'Funil de clientes e propostas até fechar o negócio.',
      'controle-financeiro': 'Contas a pagar, a receber e fluxo de caixa no controle.',
      'ponto-e-folha': 'Ponto da equipe, vales e folha sem planilha paralela.',
      'emissao-de-nfse': 'Emita a nota fiscal de serviço direto pela plataforma.',
      'portal-do-cliente': 'Seu cliente acompanha OS, orçamentos e histórico online.',
      'controle-de-estoque': 'Peças e materiais com baixa automática a cada OS.',
      'orcamentos-e-contratos': 'Orçamento aprovado por link vira contrato e OS recorrente.',
      'rastreamento-de-equipes': 'Equipe no mapa ao vivo e rota do dia organizada.',
      'area-do-tecnico': 'Calculadoras, gases e catálogo de equipamentos no bolso.',
    },
    // Taglines do mega-menu Segmentos, chaveadas pelo slug do segmento.
    segmentTaglines: {
      'sistema-para-refrigeracao': 'OS, PMOC e controle de gás por equipamento.',
      'sistema-para-eletricistas': 'Laudos, ART e instalações sob controle.',
      'sistema-para-energia-solar': 'Projeto, instalação e O&M de usinas.',
      'sistema-para-provedores': 'Instalação, suporte e visita técnica de FTTH.',
      'sistema-para-cftv': 'Câmeras, alarmes e ronda com histórico.',
      'sistema-para-construcao-civil': 'Obras, equipes e medições no campo.',
      'sistema-para-elevadores': 'Manutenção preventiva e chamados em dia.',
      'sistema-para-limpeza-conservacao': 'Postos, rondas e equipes organizados.',
      'sistema-para-dedetizacao': 'Certificados, MIP e contratos recorrentes.',
    },
  },

  // ── Nomes exibidos dos módulos no menu/rodapé, chaveados pelo slug ────────
  moduleLabels: {
    'os-digital': 'Ordem de Serviço Digital',
    'sistema-pmoc': 'PMOC',
    'sistema-crm': 'CRM & Vendas',
    'controle-financeiro': 'Financeiro',
    'ponto-e-folha': 'Ponto & Folha (RH)',
    'emissao-de-nfse': 'NFS-e',
    'portal-do-cliente': 'Portal do Cliente',
    'controle-de-estoque': 'Estoque',
    'orcamentos-e-contratos': 'Orçamentos & Contratos',
    'rastreamento-de-equipes': 'Rastreamento & Agenda',
    'area-do-tecnico': 'Área do Técnico™',
  },

  // ── Nomes exibidos dos segmentos no menu/rodapé/home, pelo slug ───────────
  segmentLabels: {
    'sistema-para-refrigeracao': 'Refrigeração e Climatização',
    'sistema-para-eletricistas': 'Instalações Elétricas',
    'sistema-para-energia-solar': 'Energia Solar',
    'sistema-para-provedores': 'Telecomunicações / Provedores',
    'sistema-para-cftv': 'CFTV e Segurança Eletrônica',
    'sistema-para-construcao-civil': 'Construção Civil',
    'sistema-para-elevadores': 'Elevadores',
    'sistema-para-limpeza-conservacao': 'Limpeza e Conservação',
    'sistema-para-dedetizacao': 'Dedetização',
  },

  // ── Rodapé ────────────────────────────────────────────────────────────────
  footer: {
    tagline: 'Domine a execução do seu negócio.',
    solutions: 'Soluções',
    segments: 'Segmentos',
    institutional: 'Institucional',
    linkAbout: 'Quem somos',
    linkBlog: 'Blog',
    linkTerms: 'Termos de uso',
    linkPrivacy: 'Política de Privacidade',
    copyright: 'Todos os direitos reservados. Feito para quem domina o campo.',
    madeBy: 'Criado por',
  },

  // ── Chrome das páginas de segmento/módulo (strings cravadas no JSX) ────────
  // Reutilizado por SegmentLandingPage e ModuleLandingPage. Só o "chrome"
  // (headings/labels de seção/CTAs); o conteúdo dos itens vem de content/<locale>.
  pageChrome: {
    ctaTrial: 'Teste grátis 14 dias, sem cartão',
    seePlans: 'Ver planos',
    seeAllPlans: 'Ver todos os planos',
    faqHeading: 'Perguntas frequentes',
    problemLabel: 'O problema',
    withDominex: 'Com o Dominex',
    // Preços (ponte). Generalizado no en (sem R$/OS); pt-br mantém o texto atual.
    pricing: {
      heading: 'Preços transparentes, sem surpresa',
      subtitle:
        'Planos a partir de R$ 197/mês com OS ilimitadas. Veja a tabela completa e escolha o que cabe na sua operação.',
    },
    // Só do SEGMENTO (no módulo essas seções vêm do data.*).
    segment: {
      painsHeading: 'As dores do dia a dia, resolvidas',
      painsSubheading: 'Onde a operação trava no improviso, o Dominex entra no controle',
      featuresHeading: 'Tudo que sua operação precisa, em um só lugar',
      featuresSubheading:
        'Do chamado ao relatório, o Dominex cobre cada etapa do serviço em campo',
      testimonialsHeading: 'Quem usa o Dominex, não volta para o improviso',
    },
    // Seletor de nicho (Área do Técnico™).
    nicheSearchPlaceholder: 'Buscar nicho...',
    nicheEmpty: 'Nenhum nicho encontrado.',
  },

  // ── Home ────────────────────────────────────────────────────────────────
  home: {
    hero: {
      typedPre: 'Domine a execução do ',
      typedHighlight: 'seu negócio.',
      srHeadline:
        'Sistema de ordem de serviço, PMOC e gestão para refrigeração e equipes de campo. Domine a execução do seu negócio.',
      subtitle:
        'Chega de planilha, WhatsApp e retrabalho. O Dominex centraliza suas OS, rastreia sua equipe e entrega dados reais para você crescer.',
      ctaPrimary: 'Começar grátis por 14 dias',
      ctaSecondary: 'Ver planos',
      videoUnsupported: 'Seu navegador não suporta vídeo HTML5.',
      videoLabel: 'Demonstração do Dominex',
    },
    logos: {
      eyebrow: 'Empresas que já dominam suas operações com o Dominex',
    },
    problemSolution: {
      problemsTitle: 'Sua operação travada no improviso?',
      solutionsTitle: 'Com o Dominex, você tem controle total',
      problems: [
        'OS em papel ou Excel perdido',
        'Técnico sem informação no campo',
        'Cliente ligando "cadê meu técnico?"',
        'Relatórios feitos na mão, horas depois',
        'Sem visibilidade do que está acontecendo agora',
      ],
      solutions: [
        'OS digital criada em segundos',
        'App para o técnico com tudo que precisa',
        'Rastreamento em tempo real no mapa',
        'Relatórios automáticos ao finalizar',
        'Dashboard com KPIs ao vivo',
      ],
    },
    features: {
      heading: 'Tudo que sua operação precisa, em um só lugar',
      subheading: 'Do chamado ao faturamento, o Dominex cobre cada etapa do serviço',
      cta: 'Teste grátis 14 dias, sem cartão',
      items: [
        {
          title: 'Ordens de serviço digitais',
          description:
            'Crie, atribua e acompanhe OS com foto, checklist, assinatura digital e histórico completo. Acabou o papel e o retrabalho.',
        },
        {
          title: 'App do técnico em campo',
          description:
            'Aplicativo instalável no celular: o técnico recebe a OS, faz check-in, tira fotos e coleta a assinatura do cliente, direto do campo.',
        },
        {
          title: 'Agenda e rastreamento de equipes',
          description:
            'Veja a equipe no mapa ao vivo, organize a rota do dia e distribua chamados pelo técnico mais próximo, sem conflito de horário.',
        },
        {
          title: 'PMOC automático',
          description:
            'Gere o PMOC pela Lei 13.589/2018 por equipamento, com visitas, checklist e a planilha pronta. Preventivas recorrentes no piloto automático.',
        },
        {
          title: 'CRM e vendas',
          description:
            'Funil de clientes, orçamentos e propostas até fechar o negócio. Acompanhe cada oportunidade sem perder o ponto do follow-up.',
        },
        {
          title: 'Financeiro completo',
          description:
            'Contas a pagar e a receber, fluxo de caixa, cartões e categorias. Saiba quanto entra, quanto sai e o que sobra de verdade.',
        },
        {
          title: 'Ponto e folha (RH)',
          description:
            'Controle de ponto da equipe, vales, bônus e folha de pagamento. Recibos prontos, sem planilha paralela.',
        },
        {
          title: 'NFS-e',
          description:
            'Emita a nota fiscal de serviço direto pela plataforma, por cliente, com o código fiscal do seu município.',
        },
        {
          title: 'Portal do cliente',
          description:
            'Seu cliente acompanha OS, orçamentos e histórico por link, sem precisar ligar. Mais transparência, menos telefone tocando.',
        },
        {
          title: 'Controle de estoque',
          description:
            'Peças e materiais com baixa automática a cada OS. Saiba o que tem em mãos antes de prometer prazo ao cliente.',
        },
        {
          title: 'Orçamentos e contratos',
          description:
            'Orçamento aprovado por link vira contrato e OS recorrente. Do "fechou" ao serviço agendado sem digitar tudo de novo.',
        },
        {
          title: 'Área do Técnico™',
          description:
            'Calculadoras, tabelas de gases e catálogo de equipamentos no bolso do técnico — a caixa de ferramentas que faltava no celular dele.',
        },
        {
          title: 'Relatórios e indicadores',
          description:
            'Painel com OS por status, tempo médio de atendimento e avaliação dos clientes. Decisões baseadas em dados, não no achismo.',
        },
      ],
    },
    howItWorks: {
      heading: 'Simples de começar, poderoso para escalar',
      steps: [
        {
          title: 'Cadastre seus clientes e técnicos',
          desc: 'Importe ou cadastre em minutos. Configure grupos, regiões e permissões para cada perfil.',
        },
        {
          title: 'Crie e distribua ordens de serviço',
          desc: 'Abra uma OS em segundos, atribua ao técnico certo e acompanhe em tempo real no painel.',
        },
        {
          title: 'Analise e cresça',
          desc: 'Relatórios automáticos, avaliações de clientes e métricas de desempenho para decisões mais rápidas.',
        },
      ],
    },
    productMockup: {
      heading: 'O painel que seu time vai amar usar',
      subheading:
        'Interface intuitiva e poderosa, projetada para gestores de equipes de campo',
      searchPlaceholder: 'Buscar OS...',
      filters: 'Filtros',
      liveMap: 'Mapa ao vivo',
      sidebar: {
        dashboard: 'Dashboard',
        serviceOrders: 'Ordens de Serviço',
        schedule: 'Agenda',
        clients: 'Clientes',
        settings: 'Configurações',
      },
      status: {
        open: 'Aberta',
        inProgress: 'Em andamento',
        done: 'Concluída',
        blocked: 'Impedida',
      },
    },
    testimonials: {
      heading: 'Quem usa o Dominex, não volta para o improviso',
      items: [
        {
          quote:
            'Antes perdíamos 3 horas por dia com relatórios manuais. Hoje fechamos tudo em 15 minutos. Resultado real.',
          role: 'Gestor de Operações',
        },
        {
          quote:
            'A equipe de campo ganhou autonomia e nosso cliente passou a confiar mais no nosso serviço.',
          role: 'Diretora',
        },
        {
          quote:
            'Em 2 semanas já tínhamos visibilidade total das OS. Nunca mais um chamado perdido.',
          role: 'Fundador',
        },
      ],
    },
    segments: {
      heading: 'Para qualquer empresa com equipe em campo',
      subheading: 'Atendemos diversos segmentos de serviços externos',
      hoverHint: 'Clique para ver mais',
      ariaSuffix: 'ver Dominex para esse segmento',
      imageAltPrefix: 'Dominex para',
    },
    pricing: {
      heading: 'Planos que crescem com a sua operação',
      monthly: 'Mensal',
      annual: 'Anual',
      annualDiscount: '-20%',
      mostPopular: '⭐ Mais popular',
      priceEquivalent: 'equivalente a',
      priceFrom: 'a partir de',
      perMonth: '/mês',
      featuresLabel: 'Recursos',
      currencyPrefix: 'R$',
      annualStrike: (monthly: number) => `R$ ${monthly}/mês`,
      annualTotal: (total: number) => `Total: R$ ${total}/ano · Economize 20%`,
      ctaTrial: 'Testar 14 Dias Grátis',
      enterpriseBadge: 'Enterprise',
      plans: {
        start: {
          name: 'Essencial',
          desc: 'Gestão básica para pequenas equipes',
          features: [
            'OS ilimitadas',
            '5 usuários inclusos',
            'App para técnicos',
            'Agenda e calendário',
            'Portal do cliente',
            'Relatórios básicos',
            'Suporte por email',
          ],
        },
        avancado: {
          name: 'Pro',
          desc: 'Para empresas que precisam de RH e finanças',
          features: [
            'Tudo do Essencial +',
            '10 usuários inclusos',
            'Módulo Funcionários / RH',
            'Financeiro avançado',
            'Contas a pagar/receber',
            'DRE e relatórios financeiros',
            'Gestão de Contratos e PMOC',
          ],
        },
        master: {
          name: 'Business',
          desc: 'Operação completa com CRM e portal',
          features: [
            'Tudo do Pro +',
            '15 usuários inclusos',
            'CRM / Funil de vendas',
            'NFS-e integrada',
            'Precificação avançada (BDI)',
            'Gestão de Contratos e PMOC',
            'Portal do Cliente/Portal do Contrato',
            'White Label (sua marca)',
            'Suporte prioritário',
          ],
        },
        enterprise: {
          name: 'Plano Enterprise',
          desc: 'Personalize seu plano sob medida para a sua operação.',
          cta: 'Falar com Consultor',
        },
      },
    },
    faq: {
      heading: 'Perguntas frequentes',
      items: [
        {
          q: 'O Dominex serve para qual tipo de empresa?',
          a: 'Para empresas que prestam serviços técnicos em campo: refrigeração e climatização, PMOC, manutenção predial, elétrica, dedetização, telecom, segurança eletrônica, instalações, assistência técnica e qualquer operação que envolva equipes externas e ordens de serviço.',
        },
        {
          q: 'Funciona em celular? Tem app para o técnico?',
          a: 'Sim. A plataforma é 100% web e responsiva (funciona em qualquer navegador) e o técnico acessa por um app PWA instalável no Android e iOS, com check-in/out, fotos, assinatura digital e checklists.',
        },
        {
          q: 'Como funciona o teste grátis?',
          a: 'São 14 dias com acesso completo ao plano escolhido, sem precisar de cartão de crédito. Você pode cancelar a qualquer momento e seus dados ficam preservados caso decida assinar depois.',
        },
        {
          q: 'Os dados das ordens de serviço ficam guardados para sempre?',
          a: 'Sim. Mantemos o histórico completo de OS, equipamentos, clientes e relatórios sem limite de retenção enquanto sua assinatura estiver ativa, garantindo rastreabilidade para garantias, auditorias e PMOC.',
        },
        {
          q: 'Consigo controlar PMOC e contratos recorrentes?',
          a: 'Sim. O Dominex gera automaticamente as ordens de serviço dos contratos de manutenção (mensal, bimestral, trimestral etc.) e mantém o calendário PMOC organizado por equipamento e cliente.',
        },
        {
          q: 'Posso personalizar formulários, checklists e relatórios?',
          a: 'Sim. Você cria templates de checklists por tipo de serviço, define campos obrigatórios, fotos e assinatura. Os relatórios de OS são gerados em PDF com a sua marca, cores e logotipo.',
        },
        {
          q: 'Tem CRM e funil de vendas integrado?',
          a: 'Sim. O plano Business inclui um CRM completo com funil Kanban, etapas customizáveis, webhooks para captação de leads e conversão direta em orçamentos e ordens de serviço.',
        },
        {
          q: 'Consigo controlar o financeiro, contas a pagar e DRE?',
          a: 'Sim. A partir do plano Pro você tem contas a pagar/receber, múltiplas contas bancárias, fluxo de caixa, recorrências, conciliação por categoria e DRE para análise de resultado.',
        },
        {
          q: 'Como funciona o controle de ponto e folha dos funcionários?',
          a: 'O módulo de RH permite registro de ponto pelo próprio funcionário, controle de horas, faltas, vales, bônus e geração de extratos individuais com cálculo proporcional à jornada.',
        },
        {
          q: 'Posso ter mais usuários do que o plano permite?',
          a: 'Sim. Você pode adicionar usuários extras a qualquer plano por uma taxa mensal adicional, ou migrar para um plano superior quando precisar de mais recursos.',
        },
        {
          q: 'Como é o suporte? Falo com gente de verdade?',
          a: 'Sim. Atendimento humano via WhatsApp e e-mail em horário comercial. Os planos Business e Enterprise contam com suporte prioritário e gestor de conta dedicado.',
        },
        {
          q: 'Meus dados estão seguros? E a LGPD?',
          a: 'Utilizamos infraestrutura em nuvem (Supabase) com criptografia em trânsito e em repouso, backups automáticos e isolamento entre empresas (multi-tenant). Estamos em processo de adequação contínua à LGPD — você pode acessar nossa Política de Privacidade para detalhes sobre coleta, uso e seus direitos como titular.',
        },
      ],
    },
    ctaFinal: {
      heading: 'Comece hoje. Resultados em dias.',
      subtitle:
        '14 dias grátis, sem cartão, sem burocracia. Configure em minutos e veja sua equipe ganhar produtividade.',
      ctaPrimary: 'Criar minha conta grátis',
      ctaSecondary: 'Ou agendar uma demo',
    },
  },

  // ── Quem somos ────────────────────────────────────────────────────────────
  quemSomos: {
    heroBadge: 'Sobre a Dominex',
    heroTitlePre: 'Quem domina o campo,',
    heroTitleHighlight: 'domina a operação',
    heroSubtitle:
      'A Dominex existe para tirar da papelada o trabalho de quem presta serviço de campo. Um sistema só, no celular e no computador, pra conduzir a operação do orçamento ao recibo.',
    ctaTrial: 'Teste grátis 14 dias, sem cartão',
    ctaPricing: 'Ver planos',
    missionTitle: 'Nossa missão',
    missionP1Strong: 'ordem de serviço, PMOC e gestão',
    missionP1:
      'A Dominex é um sistema de {strong} feito para empresas de serviço e equipes de campo — refrigeração e climatização, elétrica, energia solar, CFTV, provedores de internet, elevadores, dedetização, limpeza e conservação, construção e muito mais.',
    missionP2:
      'Acreditamos que o técnico não deveria perder tempo com ordem de serviço em papel, nem o gestor deveria ficar no escuro sobre o que acontece na rua. Por isso reunimos num lugar só o que antes vivia espalhado em caderno, grupo de WhatsApp e planilha: CRM, orçamento, contrato, ordem de serviço, PMOC, rastreamento de equipe, controle de estoque, financeiro e folha.',
    missionP3:
      'Nosso compromisso é simples: deixar a operação organizada, rastreável e fácil de tocar — pra você focar no serviço bem feito, não na burocracia.',
    valuesTitle: 'No que a gente acredita',
    valuesSubtitle: 'Os princípios que guiam cada decisão sobre o produto.',
    values: [
      {
        title: 'Tudo no celular do técnico',
        body: 'Equipe em campo precisa de tudo na mão. O app é instalável no celular e o técnico abre a ordem de serviço, registra foto, checklist e assinatura direto no local do serviço — sem papel e sem voltar pro escritório.',
      },
      {
        title: 'Feito pra quem domina o campo',
        body: 'Nascemos perto da operação de serviço, não da planilha. Cada tela é pensada pro técnico na rua e pro gestor que precisa enxergar tudo de longe.',
      },
      {
        title: 'Rápido de começar',
        body: 'Sem implantação interminável. Você cria a conta, cadastra sua equipe e já está emitindo ordem de serviço no mesmo dia — sem cartão pra testar.',
      },
      {
        title: 'Seus dados são seus',
        body: 'Isolamento por empresa, controle de acesso por permissão e documentos sempre rastreáveis. Cada cliente vê só o que é dele.',
      },
      {
        title: 'Do orçamento ao recibo',
        body: 'CRM, orçamento, ordem de serviço, PMOC, financeiro e folha no mesmo lugar. Um sistema só pra conduzir o serviço de ponta a ponta.',
      },
      {
        title: 'Suporte que entende o ramo',
        body: 'Falamos a língua de quem presta serviço de campo. Quando você chama, do outro lado tem gente que conhece a sua rotina.',
      },
    ],
    finalCtaTitle: 'Experimente a Dominex na sua operação',
    finalCtaSubtitle:
      'São 14 dias grátis, sem cartão de crédito. Cadastre sua equipe e comece a emitir ordem de serviço hoje mesmo.',
  },

  // ── Política de Privacidade (texto jurídico — validar antes de oficializar) ─
  privacidade: {
    back: '← Voltar',
    title: 'Política de Privacidade',
    version: 'Versão 1.0 — última atualização: abril de 2026',
    s1Title: '1. Identificação do Controlador',
    s1P1Strong: 'Dominex Tecnologia',
    s1P1: '{strong} é a controladora dos dados pessoais tratados nesta plataforma, nos termos da Lei nº 13.709/2018 (LGPD).',
    s1DpoStrong: 'Encarregado de Dados (DPO):',
    s1Dpo: 'Em processo de nomeação conforme Art. 41 da LGPD.',
    s1Contact: 'Canal de contato:',
    s2Title: '2. Dados Pessoais Coletados',
    s2Intro: 'Coletamos as seguintes categorias de dados pessoais:',
    s2Items: [
      { strong: 'Cadastrais:', rest: 'nome, e-mail, telefone, CPF/CNPJ' },
      { strong: 'De acesso:', rest: 'logs de login, endereço IP, user-agent, sessões ativas' },
      { strong: 'De funcionários:', rest: 'nome, CPF, telefone, endereço, chave PIX, salário, jornada' },
      { strong: 'De geolocalização:', rest: 'coordenadas GPS dos técnicos durante atendimentos (a cada 30s)' },
      { strong: 'Biométricos/imagem:', rest: 'selfies para registro de ponto eletrônico e fotos de equipamentos' },
      { strong: 'De clientes da empresa-usuária:', rest: 'nome, CPF/CNPJ, e-mail, telefone, endereço, equipamentos' },
      { strong: 'Financeiros:', rest: 'registros de transações (sem dados de cartão de crédito — processados por gateways externos)' },
    ],
    s3Title: '3. Finalidades e Bases Legais (Art. 7º e 11 LGPD)',
    s3ColPurpose: 'Finalidade',
    s3ColBasis: 'Base Legal',
    s3Rows: [
      ['Prestação do serviço de gestão de OS e equipes', 'Execução de contrato (Art. 7º V)'],
      ['Controle de ponto e jornada de trabalho', 'Cumprimento de obrigação legal (Art. 7º II)'],
      ['Rastreamento de técnicos em campo durante atendimentos', 'Legítimo interesse + consentimento (Art. 7º IX e I)'],
      ['Registro de ponto com selfie (biometria)', 'Consentimento específico (Art. 11 I)'],
      ['Comunicação sobre o serviço contratado', 'Execução de contrato (Art. 7º V)'],
      ['Melhoria e segurança da plataforma', 'Legítimo interesse (Art. 7º IX)'],
      ['Cumprimento de obrigações fiscais e contábeis', 'Cumprimento de obrigação legal (Art. 7º II)'],
    ] as [string, string][],
    s4Title: '4. Compartilhamento com Terceiros (Sub-processadores)',
    s4Items: [
      { strong: 'Supabase Inc.', rest: '(EUA) — banco de dados, autenticação e armazenamento de arquivos. Transferência internacional baseada em cláusulas contratuais padrão (Art. 33 LGPD).' },
      { strong: 'OpenStreetMap/Nominatim', rest: '— geocodificação de endereços (proxiado pelo servidor, sem envio direto do IP do usuário).' },
      { strong: 'ViaCEP', rest: '— consulta de CEP para autopreenchimento de endereço.' },
      { strong: 'Gateways de pagamento', rest: '(Stripe/Pagar.me/Mercado Pago) — processamento de cobranças. Não temos acesso a dados de cartão.' },
    ],
    s4Note: 'Não vendemos, alugamos ou compartilhamos dados pessoais com terceiros para fins publicitários.',
    s5Title: '5. Retenção de Dados',
    s5Items: [
      'Dados da conta: enquanto o contrato estiver ativo + 90 dias após encerramento',
      'Registros fiscais e financeiros: 5 anos (obrigação legal)',
      'Logs de acesso: 6 meses',
      'Dados de geolocalização: 12 meses',
      'Dados de ponto eletrônico: 5 anos (obrigação trabalhista)',
    ],
    s6Title: '6. Direitos do Titular (Art. 18 LGPD)',
    s6Intro: 'Você tem os seguintes direitos em relação aos seus dados pessoais:',
    s6Items: [
      'Confirmação da existência de tratamento',
      'Acesso aos dados',
      'Correção de dados incompletos, inexatos ou desatualizados',
      'Anonimização, bloqueio ou eliminação de dados desnecessários',
      'Portabilidade dos dados (formato estruturado)',
      'Eliminação dos dados tratados com base em consentimento',
      'Informação sobre compartilhamento com terceiros',
      'Revogação do consentimento',
    ],
    s6OutroPre: 'Para exercer seus direitos, acesse a ',
    s6OutroLink: 'Central de Dados',
    s6OutroMid: ' ou envie e-mail para ',
    s6OutroPost: '.',
    s7Title: '7. Cookies e Tecnologias de Rastreamento',
    s7P: 'Utilizamos apenas cookies essenciais para funcionamento da plataforma (autenticação e preferências de sessão). Não utilizamos cookies de rastreamento ou publicidade. A fonte Montserrat é carregada localmente, sem conexão ao Google Fonts.',
    s8Title: '8. Segurança',
    s8P: 'Adotamos medidas técnicas e organizacionais para proteger seus dados: criptografia TLS em trânsito, controle de acesso por empresa (multi-tenant com RLS no banco), autenticação segura e monitoramento de segurança.',
    s9Title: '9. Alterações nesta Política',
    s9P: 'Esta política pode ser atualizada periodicamente. Quando ocorrerem mudanças significativas, notificaremos por e-mail ou aviso na plataforma. A versão e data de atualização estão sempre indicadas no topo.',
    s10Title: '10. Contato e DPO',
    s10P: 'Para dúvidas, solicitações ou reclamações relacionadas à privacidade e proteção de dados:',
    s10NotePre: 'Você também pode registrar reclamação junto à ANPD (Autoridade Nacional de Proteção de Dados) em ',
    s10NoteUrl: 'https://www.gov.br/anpd',
    s10NoteUrlLabel: 'www.gov.br/anpd',
    s10NotePost: '.',
  },

  // ── Termos de Uso (texto jurídico — validar antes de oficializar) ──────────
  termos: {
    back: '← Voltar',
    title: 'Termos de Uso',
    version: 'Versão 1.0 — última atualização: abril de 2026',
    s1Title: '1. Aceitação dos Termos',
    s1Pre: 'Ao se cadastrar e utilizar a plataforma Dominex, você ("Usuário") concorda com estes Termos de Uso e com nossa ',
    s1Link: 'Política de Privacidade',
    s1Post: '. Caso não concorde, não utilize o serviço.',
    s2Title: '2. Descrição do Serviço',
    s2P: 'O Dominex é uma plataforma SaaS (Software as a Service) para gestão de equipes de campo, ordens de serviço, clientes, equipamentos, financeiro e recursos humanos, destinada a empresas prestadoras de serviços técnicos.',
    s3Title: '3. Cadastro e Conta',
    s3Items: [
      'O Usuário é responsável pela veracidade das informações fornecidas no cadastro.',
      'A conta é pessoal e intransferível. Não compartilhe suas credenciais.',
      'O Usuário é responsável por todas as atividades realizadas com sua conta.',
      'Informe imediatamente qualquer acesso não autorizado à sua conta.',
    ],
    s4Title: '4. Período de Teste',
    s4P: 'Oferecemos um período gratuito de 14 dias com acesso ao plano selecionado. Ao término do período, a conta é suspensa automaticamente caso não haja assinatura ativa. Os dados são mantidos por 90 dias adicionais para eventual reativação.',
    s5Title: '5. Propriedade dos Dados',
    s5Pre: 'Os dados inseridos na plataforma (clientes, ordens de serviço, funcionários, financeiro) são de propriedade da empresa-usuária. O Dominex os processa exclusivamente para prestar o serviço contratado, nos termos da ',
    s5Link: 'Política de Privacidade',
    s5Post: '.',
    s6Title: '6. Uso Aceitável',
    s6Intro: 'É vedado utilizar a plataforma para:',
    s6Items: [
      'Atividades ilegais ou que violem direitos de terceiros',
      'Envio de spam ou conteúdo malicioso',
      'Tentativas de acesso não autorizado a sistemas ou dados',
      'Revenda ou sublicenciamento do serviço sem autorização',
      'Engenharia reversa ou extração do código-fonte',
    ],
    s7Title: '7. Disponibilidade e SLA',
    s7P: 'Nos esforçamos para manter a plataforma disponível 24/7, porém não garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas com antecedência mínima de 24 horas.',
    s8Title: '8. Suspensão e Cancelamento',
    s8P: 'Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos, após notificação ao Usuário. O cancelamento voluntário pode ser feito a qualquer momento nas configurações da conta.',
    s9Title: '9. Limitação de Responsabilidade',
    s9P: 'O Dominex não se responsabiliza por danos indiretos, perda de dados por falha do Usuário em realizar backups próprios, ou interrupções causadas por força maior ou falhas de terceiros (provedores de internet, infraestrutura de nuvem).',
    s10Title: '10. Alterações nos Termos',
    s10P: 'Podemos atualizar estes Termos periodicamente. Alterações significativas serão comunicadas com antecedência mínima de 30 dias por e-mail. O uso continuado do serviço após as alterações implica aceitação.',
    s11Title: '11. Foro e Lei Aplicável',
    s11P: 'Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da Comarca de São Paulo — SP para dirimir quaisquer controvérsias.',
    s12Title: '12. Contato',
    s12Pre: 'Dúvidas sobre estes Termos: ',
  },
} as const;

/** Shape canônico das mensagens de UI. en/es/fr fazem fallback pra ele. */
export type Messages = typeof ptBr;

export default ptBr;
