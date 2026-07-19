// ─────────────────────────────────────────────────────────────────────────────
// i18n do APP LOGADO — domínio CONFIGURAÇÕES (Settings) + Central de Ajuda.
//
// Sub-namespaces por seção:
//   page        — cabeçalho da página + abas do sidebar
//   saveStatus  — indicador de auto-save
//   company     — aba Empresa (identidade visual, dados cadastrais, contato, endereço, white-label, documentos legais)
//   usability   — aba Usabilidade + card de Origens
//   regional    — aba Regional (idioma pessoal + padrões da empresa)
//   appearance  — aba Aparência
//   shortcuts   — aba Atalhos de Teclado + labels dos atalhos
//   dangerZone  — Zona de Perigo (DangerZoneCard)
//   resetSystem — modal Zerar Sistema (ResetSystemDialog)
//   help        — Central de Ajuda (HelpCenterDrawer)
//
// FORMATO: as 4 traduções JUNTAS, chaveadas por locale (ver app/index.ts).
// pt-br é a FONTE — texto EXATO que hoje está no código, corrigindo apenas
// acentos/encoding que estavam faltando nas strings hardcoded.
// Tradução SEMÂNTICA: termos de mercado por idioma, não palavra a palavra.
// ─────────────────────────────────────────────────────────────────────────────

export const settings = {
  'pt-br': {
    // ── Cabeçalho da página e abas do sidebar ────────────────────────────────
    page: {
      title: 'Configurações',
      subtitle: 'Gerencie as configurações do sistema',
      tabs: {
        empresa: 'Empresa',
        regional: 'Regional',
        usuarios: 'Usuários e Permissões',
        usabilidade: 'Usabilidade',
        atalhos: 'Atalhos',
        aparencia: 'Aparência',
      },
    },

    // ── Indicador de auto-save ────────────────────────────────────────────────
    saveStatus: {
      saving: 'Salvando…',
      unsaved: 'Alterações não salvas',
      saved: 'Salvo',
    },

    // ── Aba Empresa ───────────────────────────────────────────────────────────
    company: {
      cardTitle: 'Dados da Empresa',
      cardDescription: 'Informações da empresa que aparecem em etiquetas e documentos',

      // Identidade Visual
      visualIdentity: {
        sectionTitle: 'Identidade Visual',
        sectionDescription: 'Logo da empresa para documentos e sistema',
        replace: 'Substituir',
        remove: 'Remover',
        removeLogoTitle: 'Remover logo?',
        removeLogoDesc: 'O logo atual será removido permanentemente.',
        uploadPrompt: 'Clique para enviar o logo',
        uploadHint: 'PNG, JPG até 5MB',
        errorFileSize: 'Arquivo muito grande (máx 5MB)',
        errorFileType: 'Apenas imagens são permitidas',
        errorUpload: 'Erro ao enviar logo',
        errorIconUpload: 'Erro ao enviar ícone',
      },

      // Dados Cadastrais
      registrationData: {
        sectionTitle: 'Dados Cadastrais',
        sectionDescription: 'Razão social, documento e informações oficiais',
        companyName: 'Nome da Empresa',
        companyNamePlaceholder: 'Nome da sua empresa',
        cnpj: 'CNPJ/CPF',
        cnpjPlaceholder: '00.000.000/0000-00',
        showInDocs: 'Exibir em documentos',
        segment: 'Segmento de Atuação da Empresa',
        segmentNotDefined: 'Não definido',
        segmentHint: 'Define quais ferramentas e recursos do seu segmento aparecem no sistema. Para alterar, fale com a Dominex.',
      },

      // Contato
      contact: {
        sectionTitle: 'Contato',
        sectionDescription: 'Telefone e e-mail da empresa',
        phone: 'Telefone',
        phonePlaceholder: '(00) 0000-0000',
        email: 'Email',
        emailPlaceholder: 'contato@empresa.com',
        showInDocs: 'Exibir em documentos',
      },

      // Endereço
      address: {
        sectionTitle: 'Endereço',
        sectionDescription: 'Localização física da empresa',
        showInDocs: 'Exibir em documentos',
        zip: 'CEP',
        street: 'Endereço',
        streetPlaceholder: 'Rua, Avenida…',
        number: 'Número',
        numberPlaceholder: 'Nº',
        complement: 'Complemento',
        complementPlaceholder: 'Sala, Andar…',
        neighborhood: 'Bairro',
        neighborhoodPlaceholder: 'Bairro',
        stateCity: 'UF / Cidade',
      },

      // White Label
      whiteLabelSection: {
        sectionTitle: 'White Label',
        sectionDescription: 'Personalize o sistema com a identidade visual da sua marca',
        moduleUnavailable: 'Módulo não disponível no seu plano atual',
        hire: 'Contratar',
        enableLabel: 'Ativar White Label',
        enableDescription: 'Substitui o logo e a cor padrão do sistema',
        fullLogo: 'Logo completo',
        fullLogoConfigured: 'Logo personalizado configurado',
        fullLogoUsingCompany: 'Usando o logo da empresa por padrão',
        fullLogoFallback: 'Será utilizado o logo da empresa',
        uploadLogoPrompt: 'Enviar logo (opcional)',
        icon: 'Ícone (1:1)',
        iconDescription: 'Ícone quadrado para o menu lateral recolhido. 128×128px.',
        uploadIconPrompt: 'Enviar ícone',
        primaryColor: 'Cor primária',
        primaryColorDescription: 'Substitui a cor verde padrão do sistema',
        reportHeader: 'Cabeçalho do Relatório de Serviço',
        reportHeaderDescription: 'Personalize o visual do cabeçalho que aparece no relatório da OS concluída',
        reportBgColor: 'Cor de fundo do cabeçalho',
        reportTextColor: 'Cor do texto',
        reportStatusBarColor: 'Cor da barra de status',
        reportLogoSize: 'Tamanho do logo ({size}px)',
        reportLogoBg: 'Fundo atrás do logo',
        reportLogoBgDescription: 'Remove o fundo quando desativado',
        reportLogoBgColor: 'Cor do fundo',
        reportLogoType: 'Tipo de logo no relatório',
        reportLogoTypeFull: 'Logo Completo',
        reportLogoTypeIcon: 'Ícone',
        reportLogoTypeHintFull: 'Usa o logo completo da empresa',
        reportLogoTypeHintIcon: 'Usa o ícone configurado no White Label',
      },

      // Documentos Legais
      legalDocs: {
        sectionTitle: 'Documentos Legais',
        sectionDescription: 'Consulte e baixe os termos que regem o uso do Dominex',
        viewTerms: 'Ver termos de uso',
        acceptedAt: 'Aceito em {date}',
      },
    },

    // ── Aba Usabilidade ───────────────────────────────────────────────────────
    usability: {
      cardTitle: 'Usabilidade',
      cardDescription: 'Preferências de comportamento do sistema',
      preferenceSaved: 'Preferência salva!',

      sections: {
        os: {
          title: 'Ordens de Serviço',
          description: 'Comportamentos relacionados às ordens de serviço',
          autoSaveOS: {
            title: 'Salvamento Automático',
            description: 'Salvar automaticamente rascunhos de ordens de serviço ao editar',
          },
          showOSValues: {
            title: 'Exibir Valores',
            description: 'Mostrar valores financeiros (mão de obra, peças) nas ordens de serviço',
          },
          requireSignature: {
            title: 'Exigir Assinatura',
            description: 'Tornar obrigatória a assinatura do cliente ao finalizar OS',
          },
          saveOSPhotosToDevice: {
            title: 'Salvar fotos no dispositivo',
            description: 'Mostra um botão para salvar a foto no seu aparelho. No iPhone abre a opção "Salvar Imagem"; no Android baixa direto.',
          },
        },
        interface: {
          title: 'Interface',
          description: 'Preferências visuais de listagens e tabelas',
          compactTables: {
            title: 'Tabelas Compactas',
            description: 'Reduzir espaçamento nas tabelas para exibir mais dados por página',
          },
          showEquipmentPhotos: {
            title: 'Fotos de Equipamentos',
            description: 'Exibir miniaturas de fotos dos equipamentos nas listagens',
          },
        },
        security: {
          title: 'Segurança',
          description: 'Confirmações e validações de segurança',
          confirmDelete: {
            title: 'Confirmar Exclusões',
            description: 'Exibir diálogo de confirmação antes de excluir registros',
          },
        },
        schedule: {
          title: 'Agenda',
          description: 'Configurações da agenda e calendário',
          showHolidays: {
            title: 'Exibir Feriados',
            description: 'Mostrar feriados nacionais e municipais na agenda',
          },
        },
      },

      // Card de Origens
      origins: {
        cardTitle: 'Origens',
        cardDescription: 'Lista de origens usada no cadastro de clientes e nas oportunidades do CRM',
        manage: 'Gerenciar origens',
        empty: 'Nenhuma origem cadastrada. Crie um conjunto inicial e edite à vontade depois.',
        seedButton: 'Criar origens padrão',
        seedLoading: 'Criando…',
        inactive: 'Inativa',
      },
    },

    // ── Aba Regional ──────────────────────────────────────────────────────────
    regional: {
      personalCard: {
        title: 'Meu idioma',
        description: 'O idioma que VOCÊ vê no sistema. Aplica na hora, só para você.',
        languageLabel: 'Idioma',
        languageHint: 'Preferência pessoal. Sobrepõe o idioma padrão da empresa só para você.',
      },
      companyCard: {
        title: 'Padrões da empresa',
        description: 'Idioma padrão, moeda e fuso horário para toda a empresa',
        adminOnly: '(somente admin)',
        languageLabel: 'Idioma padrão da empresa',
        languageHint: 'Idioma aplicado a todos que não escolheram um pessoalmente.',
        localeDefaultsPrompt: 'Usar os padrões de {locale} para moeda e fuso?',
        keepCurrent: 'Manter atuais',
        useDefaults: 'Usar padrões',
        localeDefaultsApplied: 'Padrões de {locale} aplicados',
        currencyLabel: 'Moeda',
        currencyHint: 'Moeda de operação usada nos valores do sistema.',
        currencyChangedWarning: 'A moeda é a de operação da empresa. Trocar não converte os valores já registrados, eles continuam com o número original.',
        timezoneLabel: 'Fuso horário',
        timezoneHint: 'Usado para datas e horários exibidos no sistema.',
        timezonePlaceholder: 'Selecione o fuso',
        timezoneSearchPlaceholder: 'Buscar fuso (ex: Sao Paulo)',
        timezoneEmpty: 'Nenhum fuso encontrado.',
        savingStatus: 'Salvando...',
        unsavedStatus: 'Alterações não salvas',
        savedStatus: 'Salvo',
      },
    },

    // ── Aba Aparência ─────────────────────────────────────────────────────────
    appearance: {
      cardTitle: 'Aparência',
      cardDescription: 'Personalize a interface visual do sistema',
      navigationStyle: {
        sectionTitle: 'Estilo de Navegação (Desktop)',
        sectionDescription: 'Escolha entre menu lateral ou menu superior. Esta opção só afeta a visualização em desktop.',
        sidebar: 'Menu Lateral',
        sidebarDescription: 'Sidebar tradicional à esquerda',
        topbar: 'Menu Superior',
        topbarDescription: 'Barra horizontal no topo',
      },
      theme: {
        sectionTitle: 'Tema do Sistema',
        sectionDescription: 'Escolha entre tema claro ou escuro para a interface.',
        light: 'Tema Claro',
        dark: 'Tema Escuro',
      },
    },

    // ── Aba Atalhos de Teclado ────────────────────────────────────────────────
    shortcuts: {
      pageTitle: 'Atalhos de Teclado',
      pageDescription: 'Use atalhos para acessar funcionalidades rapidamente',
      toggleLabel: 'Atalhos de Teclado',
      toggleEnabled: 'Atalhos estão ativados',
      toggleDisabled: 'Atalhos estão desativados',
      groupNavigation: 'Navegação',
      groupGeneral: 'Geral',
      tips: {
        title: 'Dicas',
        shiftNav: 'Use {modifier} + letra para navegação rápida',
        noTyping: 'Atalhos não funcionam quando você está digitando em campos de texto',
        canDisable: 'Você pode desativar os atalhos a qualquer momento pelo toggle acima',
      },
      // Labels dos atalhos individuais (id → label + description)
      goto_dashboard: { label: 'Dashboard', description: 'Navegar para o painel principal' },
      goto_os: { label: 'Ordens de Serviço', description: 'Navegar para ordens de serviço' },
      goto_agenda: { label: 'Agenda', description: 'Navegar para a agenda' },
      goto_clients: { label: 'Clientes', description: 'Navegar para clientes' },
      goto_equipment: { label: 'Equipamentos', description: 'Navegar para equipamentos' },
      goto_crm: { label: 'CRM', description: 'Navegar para o CRM' },
      goto_finance: { label: 'Financeiro', description: 'Navegar para o financeiro' },
      goto_inventory: { label: 'Estoque', description: 'Navegar para o estoque' },
      goto_quotes: { label: 'Orçamentos', description: 'Navegar para orçamentos' },
      goto_contracts: { label: 'Contratos', description: 'Navegar para contratos' },
      goto_settings: { label: 'Configurações', description: 'Abrir configurações' },
      goto_profile: { label: 'Perfil', description: 'Abrir perfil do usuário' },
    },

    // ── Zona de Perigo ────────────────────────────────────────────────────────
    dangerZone: {
      title: 'Zona de Perigo',
      description: 'Ações irreversíveis. Revise cuidadosamente antes de confirmar.',
      resetSystem: {
        label: 'Zerar Sistema',
        description: 'Exclui dados operacionais selecionados. Dados da empresa e usuários são preservados. Toda operação fica registrada em log de auditoria.',
        button: 'Zerar Sistema',
      },
    },

    // ── Modal Zerar Sistema ───────────────────────────────────────────────────
    resetSystem: {
      modalTitle: 'Zerar Sistema',
      irreversibleWarning: 'Esta ação irá',
      deletePermanently: 'DELETAR PERMANENTEMENTE',
      warningCompany: 'os dados operacionais da empresa',
      chooseWhat: 'Escolha o que deseja remover:',
      selectAll: 'Marcar tudo',
      selectedCount: '{count}/{total} selecionados',
      groupSelectAriaLabel: 'Selecionar tudo em {group}',
      forcedByMaterials: 'Necessário porque o cadastro de materiais foi marcado.',
      preserved: {
        title: 'Serão mantidos:',
        companyData: 'Dados básicos da empresa',
        users: 'Usuários cadastrados',
        paymentHistory: 'Histórico de pagamentos',
      },
      finalWarning: 'Esta ação NÃO PODE ser desfeita!',
      confirmLabel: 'Para confirmar, digite o nome da empresa:',
      confirmPlaceholder: 'Nome da empresa',
      nameMismatch: 'O nome digitado não confere com o nome da empresa.',
      offline: 'Esta ação precisa de conexão com a internet. Você está offline.',
      progressTitle: 'Apagando dados...',
      progressStep: 'Etapa {current} de {total}:',
      cancel: 'Cancelar',
      confirmButton: 'Sim, Zerar Sistema',
      successTitle: 'Sistema zerado com sucesso',
      successDesc: 'Os dados selecionados foram removidos. O log de auditoria foi gerado.',
      errorTitle: 'Não foi possível zerar o sistema',
      errorPermission: 'Você não tem permissão para zerar o sistema. Apenas o administrador da empresa pode fazer isso.',
      errorTimeout: 'Uma etapa demorou demais. Tente novamente, o que já foi apagado continua apagado.',
      errorDependency: 'Não foi possível concluir a etapa por uma dependência inesperada. Avise o suporte com o nome da etapa.',
      errorDuplicate: 'Não foi possível recriar uma configuração padrão. Tente novamente em alguns segundos.',
      errorGeneric: 'Não foi possível zerar o sistema. Tente novamente ou avise o suporte.',
      errorStepPrefix: 'Erro na etapa "{step}".',

      // Grupos de seleção
      groups: {
        operacional: {
          label: 'Operacional',
          delete_service_orders: {
            title: 'Ordens de Serviço',
            description: 'Remove todas as OS, fotos, materiais consumidos, avaliações e formulários respondidos',
          },
          delete_equipment: {
            title: 'Equipamentos',
            description: 'Remove todos os equipamentos cadastrados nos clientes',
          },
          delete_contracts: {
            title: 'Contratos e PMOC',
            description: 'Remove todos os contratos, cronogramas PMOC e documentos PMOC personalizados',
          },
          delete_custom_configs: {
            title: 'Configurações personalizadas',
            description: 'Remove CRM stages personalizados, formulários de OS e recursos de custo',
          },
        },
        comercial: {
          label: 'Comercial (CRM)',
          delete_quotes: {
            title: 'Orçamentos e Propostas',
            description: 'Remove todos os orçamentos e propostas',
          },
          delete_customers: {
            title: 'Clientes e Leads',
            description: 'Remove todos os cadastros de clientes, contatos, portais e leads',
          },
        },
        financeiro: {
          label: 'Financeiro',
          delete_financial_movements: {
            title: 'Movimentações',
            description: 'Remove todas as transações de caixa, banco, cartão, receitas e despesas',
          },
          delete_financial_categories: {
            title: 'Categorias financeiras',
            description: 'Remove as categorias financeiras personalizadas (as padrões são mantidas)',
          },
        },
        rh_inventario: {
          label: 'RH e Inventário',
          delete_employees: {
            title: 'Funcionários e equipe',
            description: 'Remove todos os funcionários, vales, pagamentos, ponto eletrônico e equipes',
          },
          delete_materials: {
            title: 'Materiais',
            description: 'Remove todos os materiais cadastrados (e o estoque deles)',
          },
          delete_stock: {
            title: 'Estoque',
            description: 'Zera o estoque (movimentações), mantém os materiais cadastrados',
          },
        },
      },

      // Mapa de rótulos de steps de progresso
      stepLabels: {
        service_orders: 'Ordens de Serviço',
        contracts: 'Contratos',
        quotes: 'Orçamentos',
        equipment: 'Equipamentos',
        custom_configs: 'Configurações Personalizadas',
        financial_movements: 'Movimentações Financeiras',
        financial_categories: 'Categorias Financeiras',
        employees: 'Funcionários e RH',
        stock: 'Estoque de Materiais',
        materials: 'Cadastro de Materiais',
        customers: 'Clientes',
      },
    },

    // ── Central de Ajuda ──────────────────────────────────────────────────────
    help: {
      title: 'Central de Ajuda',
      intro: 'Dúvidas frequentes sobre o sistema. Caso não encontre sua resposta, entre em contato pelo Suporte via WhatsApp.',
      faqs: [
        {
          q: 'Como criar uma Ordem de Serviço?',
          a: 'Acesse "Ordens de Serviço" no menu lateral, clique em "+ Nova OS", preencha os dados do cliente, tipo de serviço e técnico responsável, depois salve.',
        },
        {
          q: 'Como cadastrar um novo cliente?',
          a: 'Vá em "Clientes" no menu, clique em "Novo Cliente" e preencha os dados. Você pode cadastrar pessoa física (CPF) ou jurídica (CNPJ).',
        },
        {
          q: 'Como funciona o controle financeiro?',
          a: 'No menu "Financeiro" você tem visão geral, movimentações, contas a pagar/receber e DRE. As OS podem gerar lançamentos financeiros automaticamente.',
        },
        {
          q: 'Como funcionam os pagamentos de funcionários?',
          a: 'Em "Funcionários", clique no ícone de pagamento no card do funcionário. O sistema calcula automaticamente salário + bônus - vales - faltas e permite selecionar a conta de débito.',
        },
        {
          q: 'Como configurar o controle de ponto?',
          a: 'Acesse Funcionários > Controle de Ponto. Defina horários padrão, tolerância de atraso e requisitos de selfie/geolocalização nas configurações.',
        },
        {
          q: 'Como criar contratos recorrentes?',
          a: 'Em "Contratos", crie um novo contrato definindo cliente, frequência (mensal, bimestral, etc.) e período. O sistema gera automaticamente as ocorrências programadas.',
        },
        {
          q: 'O que é o CRM e como usar?',
          a: 'O CRM é seu funil de vendas. Crie leads, mova entre etapas (Novo, Contato, Proposta, Ganho/Perdido) e acompanhe o valor do pipeline em tempo real.',
        },
        {
          q: 'Como funciona o módulo de Estoque?',
          a: 'Em "Estoque", cadastre itens com preço de custo/venda, quantidade mínima e unidade. O sistema alerta quando o estoque fica abaixo do mínimo.',
        },
        {
          q: 'Como exportar relatórios?',
          a: 'Diversos módulos possuem botões de exportação (PDF, HTML). No extrato de funcionários, orçamentos e DRE há opções de exportação e impressão.',
        },
        {
          q: 'Como alterar minha senha?',
          a: 'Acesse "Perfil" pelo menu do usuário (canto inferior da sidebar) e clique em "Alterar Senha". Você receberá um email para redefinição.',
        },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGLISH
  // ═══════════════════════════════════════════════════════════════════════════
  en: {
    page: {
      title: 'Settings',
      subtitle: 'Manage system settings',
      tabs: {
        empresa: 'Company',
        regional: 'Regional',
        usuarios: 'Users & Permissions',
        usabilidade: 'Usability',
        atalhos: 'Shortcuts',
        aparencia: 'Appearance',
      },
    },

    saveStatus: {
      saving: 'Saving…',
      unsaved: 'Unsaved changes',
      saved: 'Saved',
    },

    company: {
      cardTitle: 'Company Details',
      cardDescription: 'Company information shown on labels and documents',

      visualIdentity: {
        sectionTitle: 'Visual Identity',
        sectionDescription: 'Company logo for documents and the system',
        replace: 'Replace',
        remove: 'Remove',
        removeLogoTitle: 'Remove logo?',
        removeLogoDesc: 'The current logo will be permanently removed.',
        uploadPrompt: 'Click to upload logo',
        uploadHint: 'PNG, JPG up to 5MB',
        errorFileSize: 'File too large (max 5MB)',
        errorFileType: 'Only images are allowed',
        errorUpload: 'Error uploading logo',
        errorIconUpload: 'Error uploading icon',
      },

      registrationData: {
        sectionTitle: 'Registration Data',
        sectionDescription: 'Legal name, document number and official information',
        companyName: 'Company Name',
        companyNamePlaceholder: 'Your company name',
        cnpj: 'Tax ID',
        cnpjPlaceholder: '00.000.000/0000-00',
        showInDocs: 'Show in documents',
        segment: 'Business Segment',
        segmentNotDefined: 'Not defined',
        segmentHint: 'Defines which tools and features appear for your segment. To change it, contact Dominex.',
      },

      contact: {
        sectionTitle: 'Contact',
        sectionDescription: 'Company phone and email',
        phone: 'Phone',
        phonePlaceholder: '(00) 0000-0000',
        email: 'Email',
        emailPlaceholder: 'contact@company.com',
        showInDocs: 'Show in documents',
      },

      address: {
        sectionTitle: 'Address',
        sectionDescription: 'Physical location of the company',
        showInDocs: 'Show in documents',
        zip: 'ZIP Code',
        street: 'Street',
        streetPlaceholder: 'Street, Avenue…',
        number: 'Number',
        numberPlaceholder: 'No.',
        complement: 'Complement',
        complementPlaceholder: 'Suite, Floor…',
        neighborhood: 'Neighborhood',
        neighborhoodPlaceholder: 'Neighborhood',
        stateCity: 'State / City',
      },

      whiteLabelSection: {
        sectionTitle: 'White Label',
        sectionDescription: 'Customize the system with your brand identity',
        moduleUnavailable: 'Module not available in your current plan',
        hire: 'Upgrade',
        enableLabel: 'Enable White Label',
        enableDescription: 'Replaces the default system logo and color',
        fullLogo: 'Full logo',
        fullLogoConfigured: 'Custom logo configured',
        fullLogoUsingCompany: 'Using company logo by default',
        fullLogoFallback: 'Company logo will be used',
        uploadLogoPrompt: 'Upload logo (optional)',
        icon: 'Icon (1:1)',
        iconDescription: 'Square icon for the collapsed sidebar. 128×128px.',
        uploadIconPrompt: 'Upload icon',
        primaryColor: 'Primary color',
        primaryColorDescription: 'Replaces the default green color of the system',
        reportHeader: 'Service Report Header',
        reportHeaderDescription: 'Customize the header shown on the completed work order report',
        reportBgColor: 'Header background color',
        reportTextColor: 'Text color',
        reportStatusBarColor: 'Status bar color',
        reportLogoSize: 'Logo size ({size}px)',
        reportLogoBg: 'Background behind logo',
        reportLogoBgDescription: 'Removes the background when disabled',
        reportLogoBgColor: 'Background color',
        reportLogoType: 'Logo type in report',
        reportLogoTypeFull: 'Full Logo',
        reportLogoTypeIcon: 'Icon',
        reportLogoTypeHintFull: 'Uses the full company logo',
        reportLogoTypeHintIcon: 'Uses the icon configured in White Label',
      },

      legalDocs: {
        sectionTitle: 'Legal Documents',
        sectionDescription: 'View and download the terms governing the use of Dominex',
        viewTerms: 'View terms of use',
        acceptedAt: 'Accepted on {date}',
      },
    },

    usability: {
      cardTitle: 'Usability',
      cardDescription: 'System behavior preferences',
      preferenceSaved: 'Preference saved!',

      sections: {
        os: {
          title: 'Work Orders',
          description: 'Behaviors related to work orders',
          autoSaveOS: {
            title: 'Auto-save',
            description: 'Automatically save work order drafts while editing',
          },
          showOSValues: {
            title: 'Show Values',
            description: 'Display financial values (labor, parts) on work orders',
          },
          requireSignature: {
            title: 'Require Signature',
            description: 'Make customer signature mandatory when closing a work order',
          },
          saveOSPhotosToDevice: {
            title: 'Save photos to device',
            description: 'Shows a button to save the photo to your device. On iPhone it opens "Save Image"; on Android it downloads directly.',
          },
        },
        interface: {
          title: 'Interface',
          description: 'Visual preferences for lists and tables',
          compactTables: {
            title: 'Compact Tables',
            description: 'Reduce table row spacing to show more data per page',
          },
          showEquipmentPhotos: {
            title: 'Equipment Photos',
            description: 'Show equipment photo thumbnails in lists',
          },
        },
        security: {
          title: 'Security',
          description: 'Confirmations and security validations',
          confirmDelete: {
            title: 'Confirm Deletions',
            description: 'Show a confirmation dialog before deleting records',
          },
        },
        schedule: {
          title: 'Schedule',
          description: 'Calendar and scheduling settings',
          showHolidays: {
            title: 'Show Holidays',
            description: 'Display national and local holidays on the schedule',
          },
        },
      },

      origins: {
        cardTitle: 'Sources',
        cardDescription: 'Source list used in customer registration and CRM opportunities',
        manage: 'Manage sources',
        empty: 'No sources registered. Create an initial set and edit it freely afterwards.',
        seedButton: 'Create default sources',
        seedLoading: 'Creating…',
        inactive: 'Inactive',
      },
    },

    regional: {
      personalCard: {
        title: 'My language',
        description: 'The language YOU see in the system. Applies immediately, for you only.',
        languageLabel: 'Language',
        languageHint: 'Personal preference. Overrides the company default language for you only.',
      },
      companyCard: {
        title: 'Company defaults',
        description: 'Default language, currency and timezone for the entire company',
        adminOnly: '(admin only)',
        languageLabel: 'Default company language',
        languageHint: 'Language applied to all users who have not chosen one personally.',
        localeDefaultsPrompt: 'Apply {locale} defaults for currency and timezone?',
        keepCurrent: 'Keep current',
        useDefaults: 'Use defaults',
        localeDefaultsApplied: '{locale} defaults applied',
        currencyLabel: 'Currency',
        currencyHint: 'Operating currency used for values in the system.',
        currencyChangedWarning: 'The currency is the company operating currency. Changing it does not convert already-recorded values, they keep their original numbers.',
        timezoneLabel: 'Timezone',
        timezoneHint: 'Used for dates and times displayed in the system.',
        timezonePlaceholder: 'Select timezone',
        timezoneSearchPlaceholder: 'Search timezone (e.g. New_York)',
        timezoneEmpty: 'No timezone found.',
        savingStatus: 'Saving...',
        unsavedStatus: 'Unsaved changes',
        savedStatus: 'Saved',
      },
    },

    appearance: {
      cardTitle: 'Appearance',
      cardDescription: 'Customize the visual interface of the system',
      navigationStyle: {
        sectionTitle: 'Navigation Style (Desktop)',
        sectionDescription: 'Choose between a sidebar or a top navigation bar. This option only affects the desktop view.',
        sidebar: 'Sidebar',
        sidebarDescription: 'Traditional left-side sidebar',
        topbar: 'Top Bar',
        topbarDescription: 'Horizontal bar at the top',
      },
      theme: {
        sectionTitle: 'System Theme',
        sectionDescription: 'Choose between light or dark theme for the interface.',
        light: 'Light Theme',
        dark: 'Dark Theme',
      },
    },

    shortcuts: {
      pageTitle: 'Keyboard Shortcuts',
      pageDescription: 'Use shortcuts to quickly access features',
      toggleLabel: 'Keyboard Shortcuts',
      toggleEnabled: 'Shortcuts are enabled',
      toggleDisabled: 'Shortcuts are disabled',
      groupNavigation: 'Navigation',
      groupGeneral: 'General',
      tips: {
        title: 'Tips',
        shiftNav: 'Use {modifier} + key for quick navigation',
        noTyping: 'Shortcuts do not work when you are typing in text fields',
        canDisable: 'You can disable shortcuts at any time using the toggle above',
      },
      goto_dashboard: { label: 'Dashboard', description: 'Navigate to main dashboard' },
      goto_os: { label: 'Work Orders', description: 'Navigate to work orders' },
      goto_agenda: { label: 'Schedule', description: 'Navigate to schedule' },
      goto_clients: { label: 'Customers', description: 'Navigate to customers' },
      goto_equipment: { label: 'Equipment', description: 'Navigate to equipment' },
      goto_crm: { label: 'CRM', description: 'Navigate to CRM' },
      goto_finance: { label: 'Finance', description: 'Navigate to finance' },
      goto_inventory: { label: 'Inventory', description: 'Navigate to inventory' },
      goto_quotes: { label: 'Quotes', description: 'Navigate to quotes' },
      goto_contracts: { label: 'Contracts', description: 'Navigate to contracts' },
      goto_settings: { label: 'Settings', description: 'Open settings' },
      goto_profile: { label: 'Profile', description: 'Open user profile' },
    },

    dangerZone: {
      title: 'Danger Zone',
      description: 'Irreversible actions. Review carefully before confirming.',
      resetSystem: {
        label: 'Reset System',
        description: 'Deletes selected operational data. Company data and users are preserved. Every operation is recorded in an audit log.',
        button: 'Reset System',
      },
    },

    resetSystem: {
      modalTitle: 'Reset System',
      irreversibleWarning: 'This action will',
      deletePermanently: 'PERMANENTLY DELETE',
      warningCompany: 'the operational data of company',
      chooseWhat: 'Choose what you want to remove:',
      selectAll: 'Select all',
      selectedCount: '{count}/{total} selected',
      groupSelectAriaLabel: 'Select all in {group}',
      forcedByMaterials: 'Required because the materials catalog was selected.',
      preserved: {
        title: 'Will be kept:',
        companyData: 'Basic company data',
        users: 'Registered users',
        paymentHistory: 'Payment history',
      },
      finalWarning: 'This action CANNOT be undone!',
      confirmLabel: 'To confirm, type the company name:',
      confirmPlaceholder: 'Company name',
      nameMismatch: 'The name entered does not match the company name.',
      offline: 'This action requires an internet connection. You are offline.',
      progressTitle: 'Deleting data...',
      progressStep: 'Step {current} of {total}:',
      cancel: 'Cancel',
      confirmButton: 'Yes, Reset System',
      successTitle: 'System reset successfully',
      successDesc: 'The selected data has been removed. The audit log has been generated.',
      errorTitle: 'Could not reset the system',
      errorPermission: 'You do not have permission to reset the system. Only the company administrator can do this.',
      errorTimeout: 'A step took too long. Please try again, data already deleted remains deleted.',
      errorDependency: 'Could not complete a step due to an unexpected dependency. Please notify support with the step name.',
      errorDuplicate: 'Could not recreate a default configuration. Please try again in a few seconds.',
      errorGeneric: 'Could not reset the system. Please try again or contact support.',
      errorStepPrefix: 'Error in step "{step}".',

      groups: {
        operacional: {
          label: 'Operations',
          delete_service_orders: {
            title: 'Work Orders',
            description: 'Removes all work orders, photos, consumed materials, ratings and answered forms',
          },
          delete_equipment: {
            title: 'Equipment',
            description: 'Removes all equipment registered for customers',
          },
          delete_contracts: {
            title: 'Contracts & Maintenance Plans',
            description: 'Removes all contracts, maintenance schedules and custom maintenance documents',
          },
          delete_custom_configs: {
            title: 'Custom configurations',
            description: 'Removes custom CRM stages, work order forms and cost resources',
          },
        },
        comercial: {
          label: 'Sales (CRM)',
          delete_quotes: {
            title: 'Quotes & Proposals',
            description: 'Removes all quotes and proposals',
          },
          delete_customers: {
            title: 'Customers & Leads',
            description: 'Removes all customer records, contacts, portals and leads',
          },
        },
        financeiro: {
          label: 'Finance',
          delete_financial_movements: {
            title: 'Transactions',
            description: 'Removes all cash, bank, card, revenue and expense transactions',
          },
          delete_financial_categories: {
            title: 'Financial categories',
            description: 'Removes custom financial categories (default ones are kept)',
          },
        },
        rh_inventario: {
          label: 'HR & Inventory',
          delete_employees: {
            title: 'Employees & Teams',
            description: 'Removes all employees, advances, payments, time records and teams',
          },
          delete_materials: {
            title: 'Materials',
            description: 'Removes all registered materials (and their stock)',
          },
          delete_stock: {
            title: 'Inventory',
            description: 'Clears inventory (movements), keeps registered materials',
          },
        },
      },

      stepLabels: {
        service_orders: 'Work Orders',
        contracts: 'Contracts',
        quotes: 'Quotes',
        equipment: 'Equipment',
        custom_configs: 'Custom Configurations',
        financial_movements: 'Financial Transactions',
        financial_categories: 'Financial Categories',
        employees: 'Employees & HR',
        stock: 'Materials Inventory',
        materials: 'Materials Catalog',
        customers: 'Customers',
      },
    },

    help: {
      title: 'Help Center',
      intro: 'Frequently asked questions about the system. If you cannot find your answer, contact Support via WhatsApp.',
      faqs: [
        {
          q: 'How do I create a Work Order?',
          a: 'Go to "Work Orders" in the sidebar, click "+ New Work Order", fill in the customer, service type and assigned technician, then save.',
        },
        {
          q: 'How do I register a new customer?',
          a: 'Go to "Customers" in the menu, click "New Customer" and fill in the details. You can register an individual (CPF) or a company (CNPJ).',
        },
        {
          q: 'How does financial management work?',
          a: 'In the "Finance" menu you have an overview, transactions, payables/receivables and income statement. Work orders can automatically generate financial entries.',
        },
        {
          q: 'How do employee payments work?',
          a: 'In "Employees", click the payment icon on the employee card. The system automatically calculates salary + bonuses - advances - absences and lets you select the debit account.',
        },
        {
          q: 'How do I set up time tracking?',
          a: 'Go to Employees > Time Tracking. Set default hours, late tolerance and selfie/geolocation requirements in settings.',
        },
        {
          q: 'How do I create recurring contracts?',
          a: 'In "Contracts", create a new contract with the customer, frequency (monthly, bimonthly, etc.) and period. The system automatically generates scheduled occurrences.',
        },
        {
          q: 'What is CRM and how do I use it?',
          a: 'CRM is your sales funnel. Create leads, move them between stages (New, Contact, Proposal, Won/Lost) and track your pipeline value in real time.',
        },
        {
          q: 'How does the Inventory module work?',
          a: 'In "Inventory", register items with cost/sale price, minimum quantity and unit. The system alerts you when stock falls below the minimum.',
        },
        {
          q: 'How do I export reports?',
          a: 'Several modules have export buttons (PDF, HTML). Employee statements, quotes and income statements have export and print options.',
        },
        {
          q: 'How do I change my password?',
          a: 'Go to "Profile" from the user menu (bottom of the sidebar) and click "Change Password". You will receive an email to reset it.',
        },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ESPAÑOL
  // ═══════════════════════════════════════════════════════════════════════════
  es: {
    page: {
      title: 'Configuración',
      subtitle: 'Administra la configuración del sistema',
      tabs: {
        empresa: 'Empresa',
        regional: 'Regional',
        usuarios: 'Usuarios y Permisos',
        usabilidade: 'Usabilidad',
        atalhos: 'Atajos',
        aparencia: 'Apariencia',
      },
    },

    saveStatus: {
      saving: 'Guardando…',
      unsaved: 'Cambios sin guardar',
      saved: 'Guardado',
    },

    company: {
      cardTitle: 'Datos de la Empresa',
      cardDescription: 'Información de la empresa que aparece en etiquetas y documentos',

      visualIdentity: {
        sectionTitle: 'Identidad Visual',
        sectionDescription: 'Logo de la empresa para documentos y el sistema',
        replace: 'Reemplazar',
        remove: 'Eliminar',
        removeLogoTitle: '¿Eliminar logo?',
        removeLogoDesc: 'El logo actual se eliminará permanentemente.',
        uploadPrompt: 'Haz clic para subir el logo',
        uploadHint: 'PNG, JPG hasta 5MB',
        errorFileSize: 'Archivo muy grande (máx 5MB)',
        errorFileType: 'Solo se permiten imágenes',
        errorUpload: 'Error al subir el logo',
        errorIconUpload: 'Error al subir el ícono',
      },

      registrationData: {
        sectionTitle: 'Datos de Registro',
        sectionDescription: 'Razón social, documento e información oficial',
        companyName: 'Nombre de la Empresa',
        companyNamePlaceholder: 'Nombre de tu empresa',
        cnpj: 'NIT/RUC',
        cnpjPlaceholder: '00.000.000/0000-00',
        showInDocs: 'Mostrar en documentos',
        segment: 'Segmento de Negocio',
        segmentNotDefined: 'No definido',
        segmentHint: 'Define qué herramientas y funciones aparecen para tu segmento. Para cambiarlo, contacta a Dominex.',
      },

      contact: {
        sectionTitle: 'Contacto',
        sectionDescription: 'Teléfono y correo de la empresa',
        phone: 'Teléfono',
        phonePlaceholder: '(00) 0000-0000',
        email: 'Correo',
        emailPlaceholder: 'contacto@empresa.com',
        showInDocs: 'Mostrar en documentos',
      },

      address: {
        sectionTitle: 'Dirección',
        sectionDescription: 'Ubicación física de la empresa',
        showInDocs: 'Mostrar en documentos',
        zip: 'Código Postal',
        street: 'Dirección',
        streetPlaceholder: 'Calle, Avenida…',
        number: 'Número',
        numberPlaceholder: 'Nº',
        complement: 'Complemento',
        complementPlaceholder: 'Piso, Oficina…',
        neighborhood: 'Colonia/Barrio',
        neighborhoodPlaceholder: 'Colonia/Barrio',
        stateCity: 'Estado / Ciudad',
      },

      whiteLabelSection: {
        sectionTitle: 'White Label',
        sectionDescription: 'Personaliza el sistema con la identidad de tu marca',
        moduleUnavailable: 'Módulo no disponible en tu plan actual',
        hire: 'Contratar',
        enableLabel: 'Activar White Label',
        enableDescription: 'Reemplaza el logo y el color predeterminado del sistema',
        fullLogo: 'Logo completo',
        fullLogoConfigured: 'Logo personalizado configurado',
        fullLogoUsingCompany: 'Usando el logo de la empresa por defecto',
        fullLogoFallback: 'Se usará el logo de la empresa',
        uploadLogoPrompt: 'Subir logo (opcional)',
        icon: 'Ícono (1:1)',
        iconDescription: 'Ícono cuadrado para el menú lateral plegado. 128×128px.',
        uploadIconPrompt: 'Subir ícono',
        primaryColor: 'Color primario',
        primaryColorDescription: 'Reemplaza el color verde predeterminado del sistema',
        reportHeader: 'Encabezado del Informe de Servicio',
        reportHeaderDescription: 'Personaliza el encabezado que aparece en el informe de la OT finalizada',
        reportBgColor: 'Color de fondo del encabezado',
        reportTextColor: 'Color del texto',
        reportStatusBarColor: 'Color de la barra de estado',
        reportLogoSize: 'Tamaño del logo ({size}px)',
        reportLogoBg: 'Fondo detrás del logo',
        reportLogoBgDescription: 'Elimina el fondo cuando está desactivado',
        reportLogoBgColor: 'Color del fondo',
        reportLogoType: 'Tipo de logo en el informe',
        reportLogoTypeFull: 'Logo Completo',
        reportLogoTypeIcon: 'Ícono',
        reportLogoTypeHintFull: 'Usa el logo completo de la empresa',
        reportLogoTypeHintIcon: 'Usa el ícono configurado en White Label',
      },

      legalDocs: {
        sectionTitle: 'Documentos Legales',
        sectionDescription: 'Consulta y descarga los términos que rigen el uso de Dominex',
        viewTerms: 'Ver términos de uso',
        acceptedAt: 'Aceptado el {date}',
      },
    },

    usability: {
      cardTitle: 'Usabilidad',
      cardDescription: 'Preferencias de comportamiento del sistema',
      preferenceSaved: '¡Preferencia guardada!',

      sections: {
        os: {
          title: 'Órdenes de Trabajo',
          description: 'Comportamientos relacionados con las órdenes de trabajo',
          autoSaveOS: {
            title: 'Guardado automático',
            description: 'Guardar automáticamente los borradores de órdenes de trabajo al editar',
          },
          showOSValues: {
            title: 'Mostrar valores',
            description: 'Mostrar valores financieros (mano de obra, piezas) en las órdenes de trabajo',
          },
          requireSignature: {
            title: 'Requerir firma',
            description: 'Hacer obligatoria la firma del cliente al cerrar una OT',
          },
          saveOSPhotosToDevice: {
            title: 'Guardar fotos en el dispositivo',
            description: 'Muestra un botón para guardar la foto en tu dispositivo. En iPhone abre "Guardar imagen"; en Android descarga directamente.',
          },
        },
        interface: {
          title: 'Interfaz',
          description: 'Preferencias visuales de listas y tablas',
          compactTables: {
            title: 'Tablas compactas',
            description: 'Reducir el espaciado de las tablas para mostrar más datos por página',
          },
          showEquipmentPhotos: {
            title: 'Fotos de equipos',
            description: 'Mostrar miniaturas de fotos de equipos en las listas',
          },
        },
        security: {
          title: 'Seguridad',
          description: 'Confirmaciones y validaciones de seguridad',
          confirmDelete: {
            title: 'Confirmar eliminaciones',
            description: 'Mostrar un diálogo de confirmación antes de eliminar registros',
          },
        },
        schedule: {
          title: 'Agenda',
          description: 'Configuración de agenda y calendario',
          showHolidays: {
            title: 'Mostrar festivos',
            description: 'Mostrar festivos nacionales y locales en la agenda',
          },
        },
      },

      origins: {
        cardTitle: 'Orígenes',
        cardDescription: 'Lista de orígenes usada en el registro de clientes y las oportunidades del CRM',
        manage: 'Gestionar orígenes',
        empty: 'No hay orígenes registrados. Crea un conjunto inicial y edítalo libremente después.',
        seedButton: 'Crear orígenes predeterminados',
        seedLoading: 'Creando…',
        inactive: 'Inactivo',
      },
    },

    regional: {
      personalCard: {
        title: 'Mi idioma',
        description: 'El idioma que TÚ ves en el sistema. Se aplica al instante, solo para ti.',
        languageLabel: 'Idioma',
        languageHint: 'Preferencia personal. Reemplaza el idioma predeterminado de la empresa solo para ti.',
      },
      companyCard: {
        title: 'Valores predeterminados de la empresa',
        description: 'Idioma, moneda y zona horaria predeterminados para toda la empresa',
        adminOnly: '(solo admin)',
        languageLabel: 'Idioma predeterminado de la empresa',
        languageHint: 'Idioma aplicado a todos los usuarios que no han elegido uno personalmente.',
        localeDefaultsPrompt: '¿Aplicar los valores predeterminados de {locale} para moneda y zona horaria?',
        keepCurrent: 'Mantener actuales',
        useDefaults: 'Usar predeterminados',
        localeDefaultsApplied: 'Valores de {locale} aplicados',
        currencyLabel: 'Moneda',
        currencyHint: 'Moneda de operación usada en los valores del sistema.',
        currencyChangedWarning: 'La moneda es la moneda operativa de la empresa. Cambiarla no convierte los valores ya registrados, se mantienen con su número original.',
        timezoneLabel: 'Zona horaria',
        timezoneHint: 'Usada para fechas y horas mostradas en el sistema.',
        timezonePlaceholder: 'Seleccionar zona horaria',
        timezoneSearchPlaceholder: 'Buscar zona horaria (ej: Mexico_City)',
        timezoneEmpty: 'No se encontró ninguna zona horaria.',
        savingStatus: 'Guardando...',
        unsavedStatus: 'Cambios sin guardar',
        savedStatus: 'Guardado',
      },
    },

    appearance: {
      cardTitle: 'Apariencia',
      cardDescription: 'Personaliza la interfaz visual del sistema',
      navigationStyle: {
        sectionTitle: 'Estilo de Navegación (Escritorio)',
        sectionDescription: 'Elige entre menú lateral o menú superior. Esta opción solo afecta la vista de escritorio.',
        sidebar: 'Menú lateral',
        sidebarDescription: 'Barra lateral tradicional a la izquierda',
        topbar: 'Menú superior',
        topbarDescription: 'Barra horizontal en la parte superior',
      },
      theme: {
        sectionTitle: 'Tema del Sistema',
        sectionDescription: 'Elige entre tema claro u oscuro para la interfaz.',
        light: 'Tema claro',
        dark: 'Tema oscuro',
      },
    },

    shortcuts: {
      pageTitle: 'Atajos de Teclado',
      pageDescription: 'Usa atajos para acceder rápidamente a las funciones',
      toggleLabel: 'Atajos de Teclado',
      toggleEnabled: 'Los atajos están activados',
      toggleDisabled: 'Los atajos están desactivados',
      groupNavigation: 'Navegación',
      groupGeneral: 'General',
      tips: {
        title: 'Consejos',
        shiftNav: 'Usa {modifier} + tecla para navegación rápida',
        noTyping: 'Los atajos no funcionan cuando estás escribiendo en campos de texto',
        canDisable: 'Puedes desactivar los atajos en cualquier momento con el interruptor de arriba',
      },
      goto_dashboard: { label: 'Panel', description: 'Navegar al panel principal' },
      goto_os: { label: 'Órdenes de Trabajo', description: 'Navegar a órdenes de trabajo' },
      goto_agenda: { label: 'Agenda', description: 'Navegar a la agenda' },
      goto_clients: { label: 'Clientes', description: 'Navegar a clientes' },
      goto_equipment: { label: 'Equipos', description: 'Navegar a equipos' },
      goto_crm: { label: 'CRM', description: 'Navegar al CRM' },
      goto_finance: { label: 'Finanzas', description: 'Navegar a finanzas' },
      goto_inventory: { label: 'Inventario', description: 'Navegar al inventario' },
      goto_quotes: { label: 'Presupuestos', description: 'Navegar a presupuestos' },
      goto_contracts: { label: 'Contratos', description: 'Navegar a contratos' },
      goto_settings: { label: 'Configuración', description: 'Abrir configuración' },
      goto_profile: { label: 'Perfil', description: 'Abrir perfil de usuario' },
    },

    dangerZone: {
      title: 'Zona de Peligro',
      description: 'Acciones irreversibles. Revisa cuidadosamente antes de confirmar.',
      resetSystem: {
        label: 'Reiniciar Sistema',
        description: 'Elimina los datos operativos seleccionados. Los datos de la empresa y usuarios se conservan. Toda operación queda registrada en el log de auditoría.',
        button: 'Reiniciar Sistema',
      },
    },

    resetSystem: {
      modalTitle: 'Reiniciar Sistema',
      irreversibleWarning: 'Esta acción',
      deletePermanently: 'ELIMINARÁ PERMANENTEMENTE',
      warningCompany: 'los datos operativos de la empresa',
      chooseWhat: 'Elige qué deseas eliminar:',
      selectAll: 'Seleccionar todo',
      selectedCount: '{count}/{total} seleccionados',
      groupSelectAriaLabel: 'Seleccionar todo en {group}',
      forcedByMaterials: 'Necesario porque el catálogo de materiales fue seleccionado.',
      preserved: {
        title: 'Se conservarán:',
        companyData: 'Datos básicos de la empresa',
        users: 'Usuarios registrados',
        paymentHistory: 'Historial de pagos',
      },
      finalWarning: '¡Esta acción NO PUEDE deshacerse!',
      confirmLabel: 'Para confirmar, escribe el nombre de la empresa:',
      confirmPlaceholder: 'Nombre de la empresa',
      nameMismatch: 'El nombre ingresado no coincide con el nombre de la empresa.',
      offline: 'Esta acción requiere conexión a internet. Estás sin conexión.',
      progressTitle: 'Eliminando datos...',
      progressStep: 'Paso {current} de {total}:',
      cancel: 'Cancelar',
      confirmButton: 'Sí, Reiniciar Sistema',
      successTitle: 'Sistema reiniciado con éxito',
      successDesc: 'Los datos seleccionados han sido eliminados. El log de auditoría ha sido generado.',
      errorTitle: 'No fue posible reiniciar el sistema',
      errorPermission: 'No tienes permiso para reiniciar el sistema. Solo el administrador de la empresa puede hacerlo.',
      errorTimeout: 'Un paso tardó demasiado. Inténtalo de nuevo, lo que ya fue eliminado sigue eliminado.',
      errorDependency: 'No fue posible completar el paso por una dependencia inesperada. Avisa al soporte con el nombre del paso.',
      errorDuplicate: 'No fue posible recrear una configuración predeterminada. Inténtalo de nuevo en unos segundos.',
      errorGeneric: 'No fue posible reiniciar el sistema. Inténtalo de nuevo o avisa al soporte.',
      errorStepPrefix: 'Error en el paso "{step}".',

      groups: {
        operacional: {
          label: 'Operativo',
          delete_service_orders: {
            title: 'Órdenes de Trabajo',
            description: 'Elimina todas las OT, fotos, materiales consumidos, evaluaciones y formularios respondidos',
          },
          delete_equipment: {
            title: 'Equipos',
            description: 'Elimina todos los equipos registrados para los clientes',
          },
          delete_contracts: {
            title: 'Contratos y Planes de Mantenimiento',
            description: 'Elimina todos los contratos, cronogramas y documentos de mantenimiento personalizados',
          },
          delete_custom_configs: {
            title: 'Configuraciones personalizadas',
            description: 'Elimina etapas CRM personalizadas, formularios de OT y recursos de costo',
          },
        },
        comercial: {
          label: 'Ventas (CRM)',
          delete_quotes: {
            title: 'Presupuestos y Propuestas',
            description: 'Elimina todos los presupuestos y propuestas',
          },
          delete_customers: {
            title: 'Clientes y Leads',
            description: 'Elimina todos los registros de clientes, contactos, portales y leads',
          },
        },
        financeiro: {
          label: 'Finanzas',
          delete_financial_movements: {
            title: 'Transacciones',
            description: 'Elimina todas las transacciones de caja, banco, tarjeta, ingresos y gastos',
          },
          delete_financial_categories: {
            title: 'Categorías financieras',
            description: 'Elimina las categorías financieras personalizadas (las predeterminadas se mantienen)',
          },
        },
        rh_inventario: {
          label: 'RR.HH. e Inventario',
          delete_employees: {
            title: 'Empleados y Equipos',
            description: 'Elimina todos los empleados, anticipos, pagos, registros de tiempo y equipos',
          },
          delete_materials: {
            title: 'Materiales',
            description: 'Elimina todos los materiales registrados (y su inventario)',
          },
          delete_stock: {
            title: 'Inventario',
            description: 'Limpia el inventario (movimientos), mantiene los materiales registrados',
          },
        },
      },

      stepLabels: {
        service_orders: 'Órdenes de Trabajo',
        contracts: 'Contratos',
        quotes: 'Presupuestos',
        equipment: 'Equipos',
        custom_configs: 'Configuraciones Personalizadas',
        financial_movements: 'Transacciones Financieras',
        financial_categories: 'Categorías Financieras',
        employees: 'Empleados y RR.HH.',
        stock: 'Inventario de Materiales',
        materials: 'Catálogo de Materiales',
        customers: 'Clientes',
      },
    },

    help: {
      title: 'Centro de Ayuda',
      intro: 'Preguntas frecuentes sobre el sistema. Si no encuentras tu respuesta, contacta al Soporte por WhatsApp.',
      faqs: [
        {
          q: '¿Cómo creo una Orden de Trabajo?',
          a: 'Ve a "Órdenes de Trabajo" en el menú lateral, haz clic en "+ Nueva OT", completa los datos del cliente, tipo de servicio y técnico asignado, luego guarda.',
        },
        {
          q: '¿Cómo registro un nuevo cliente?',
          a: 'Ve a "Clientes" en el menú, haz clic en "Nuevo Cliente" y completa los datos. Puedes registrar persona física o jurídica.',
        },
        {
          q: '¿Cómo funciona el control financiero?',
          a: 'En el menú "Finanzas" tienes resumen, movimientos, cuentas a pagar/cobrar y estado de resultados. Las OT pueden generar asientos financieros automáticamente.',
        },
        {
          q: '¿Cómo funcionan los pagos de empleados?',
          a: 'En "Empleados", haz clic en el ícono de pago en la tarjeta del empleado. El sistema calcula automáticamente salario + bonos - anticipos - faltas y permite seleccionar la cuenta de débito.',
        },
        {
          q: '¿Cómo configuro el control de asistencia?',
          a: 'Ve a Empleados > Control de Asistencia. Define horarios estándar, tolerancia de retraso y requisitos de selfie/geolocalización en la configuración.',
        },
        {
          q: '¿Cómo creo contratos recurrentes?',
          a: 'En "Contratos", crea un nuevo contrato con cliente, frecuencia (mensual, bimestral, etc.) y período. El sistema genera automáticamente las ocurrencias programadas.',
        },
        {
          q: '¿Qué es el CRM y cómo se usa?',
          a: 'El CRM es tu embudo de ventas. Crea leads, muévelos entre etapas (Nuevo, Contacto, Propuesta, Ganado/Perdido) y sigue el valor del pipeline en tiempo real.',
        },
        {
          q: '¿Cómo funciona el módulo de Inventario?',
          a: 'En "Inventario", registra artículos con precio de costo/venta, cantidad mínima y unidad. El sistema alerta cuando el stock cae por debajo del mínimo.',
        },
        {
          q: '¿Cómo exporto informes?',
          a: 'Varios módulos tienen botones de exportación (PDF, HTML). En extractos de empleados, presupuestos y estado de resultados hay opciones de exportación e impresión.',
        },
        {
          q: '¿Cómo cambio mi contraseña?',
          a: 'Ve a "Perfil" desde el menú de usuario (parte inferior del menú lateral) y haz clic en "Cambiar Contraseña". Recibirás un correo para restablecerla.',
        },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FRANÇAIS
  // ═══════════════════════════════════════════════════════════════════════════
  fr: {
    page: {
      title: 'Paramètres',
      subtitle: 'Gérez les paramètres du système',
      tabs: {
        empresa: 'Entreprise',
        regional: 'Régional',
        usuarios: 'Utilisateurs et permissions',
        usabilidade: 'Ergonomie',
        atalhos: 'Raccourcis',
        aparencia: 'Apparence',
      },
    },

    saveStatus: {
      saving: 'Enregistrement…',
      unsaved: 'Modifications non enregistrées',
      saved: 'Enregistré',
    },

    company: {
      cardTitle: "Informations de l'entreprise",
      cardDescription: "Informations de l'entreprise affichées sur les étiquettes et documents",

      visualIdentity: {
        sectionTitle: 'Identité visuelle',
        sectionDescription: "Logo de l'entreprise pour les documents et le système",
        replace: 'Remplacer',
        remove: 'Supprimer',
        removeLogoTitle: 'Supprimer le logo ?',
        removeLogoDesc: 'Le logo actuel sera supprimé définitivement.',
        uploadPrompt: 'Cliquez pour télécharger le logo',
        uploadHint: 'PNG, JPG jusqu’à 5Mo',
        errorFileSize: 'Fichier trop volumineux (max 5Mo)',
        errorFileType: 'Seules les images sont autorisées',
        errorUpload: 'Erreur lors du téléchargement du logo',
        errorIconUpload: "Erreur lors du téléchargement de l'icône",
      },

      registrationData: {
        sectionTitle: "Données d'enregistrement",
        sectionDescription: 'Raison sociale, numéro de document et informations officielles',
        companyName: "Nom de l'entreprise",
        companyNamePlaceholder: 'Nom de votre entreprise',
        cnpj: 'Numéro fiscal',
        cnpjPlaceholder: '00.000.000/0000-00',
        showInDocs: 'Afficher dans les documents',
        segment: "Secteur d'activité",
        segmentNotDefined: 'Non défini',
        segmentHint: "Définit quels outils et fonctions apparaissent pour votre secteur. Pour le modifier, contactez Dominex.",
      },

      contact: {
        sectionTitle: 'Contact',
        sectionDescription: "Téléphone et e-mail de l'entreprise",
        phone: 'Téléphone',
        phonePlaceholder: '(00) 0000-0000',
        email: 'E-mail',
        emailPlaceholder: 'contact@entreprise.com',
        showInDocs: 'Afficher dans les documents',
      },

      address: {
        sectionTitle: 'Adresse',
        sectionDescription: "Localisation physique de l'entreprise",
        showInDocs: 'Afficher dans les documents',
        zip: 'Code postal',
        street: 'Adresse',
        streetPlaceholder: 'Rue, Avenue…',
        number: 'Numéro',
        numberPlaceholder: 'N°',
        complement: 'Complément',
        complementPlaceholder: 'Étage, Bureau…',
        neighborhood: 'Quartier',
        neighborhoodPlaceholder: 'Quartier',
        stateCity: 'Région / Ville',
      },

      whiteLabelSection: {
        sectionTitle: 'White Label',
        sectionDescription: "Personnalisez le système avec l'identité de votre marque",
        moduleUnavailable: "Module non disponible dans votre plan actuel",
        hire: 'Souscrire',
        enableLabel: 'Activer le White Label',
        enableDescription: 'Remplace le logo et la couleur par défaut du système',
        fullLogo: 'Logo complet',
        fullLogoConfigured: 'Logo personnalisé configuré',
        fullLogoUsingCompany: "Logo de l'entreprise utilisé par défaut",
        fullLogoFallback: "Le logo de l'entreprise sera utilisé",
        uploadLogoPrompt: 'Télécharger le logo (facultatif)',
        icon: 'Icône (1:1)',
        iconDescription: 'Icône carrée pour le menu latéral réduit. 128×128px.',
        uploadIconPrompt: "Télécharger l'icône",
        primaryColor: 'Couleur principale',
        primaryColorDescription: 'Remplace la couleur verte par défaut du système',
        reportHeader: 'En-tête du rapport de service',
        reportHeaderDescription: "Personnalisez l'en-tête affiché dans le rapport du bon de travail terminé",
        reportBgColor: "Couleur d'arrière-plan de l'en-tête",
        reportTextColor: 'Couleur du texte',
        reportStatusBarColor: 'Couleur de la barre de statut',
        reportLogoSize: 'Taille du logo ({size}px)',
        reportLogoBg: "Fond derrière le logo",
        reportLogoBgDescription: "Supprime le fond quand désactivé",
        reportLogoBgColor: "Couleur du fond",
        reportLogoType: 'Type de logo dans le rapport',
        reportLogoTypeFull: 'Logo complet',
        reportLogoTypeIcon: 'Icône',
        reportLogoTypeHintFull: "Utilise le logo complet de l'entreprise",
        reportLogoTypeHintIcon: 'Utilise l’icône configurée dans le White Label',
      },

      legalDocs: {
        sectionTitle: 'Documents légaux',
        sectionDescription: "Consultez et téléchargez les conditions régissant l'utilisation de Dominex",
        viewTerms: "Voir les conditions d'utilisation",
        acceptedAt: 'Accepté le {date}',
      },
    },

    usability: {
      cardTitle: 'Ergonomie',
      cardDescription: 'Préférences de comportement du système',
      preferenceSaved: 'Préférence enregistrée !',

      sections: {
        os: {
          title: 'Bons de travail',
          description: 'Comportements liés aux bons de travail',
          autoSaveOS: {
            title: 'Sauvegarde automatique',
            description: 'Enregistrer automatiquement les brouillons de bons de travail lors de l’édition',
          },
          showOSValues: {
            title: 'Afficher les montants',
            description: 'Afficher les valeurs financières (main-d’œuvre, pièces) sur les bons de travail',
          },
          requireSignature: {
            title: 'Exiger une signature',
            description: 'Rendre obligatoire la signature du client à la clôture d’un bon de travail',
          },
          saveOSPhotosToDevice: {
            title: "Enregistrer les photos sur l'appareil",
            description: "Affiche un bouton pour enregistrer la photo sur votre appareil. Sur iPhone, ouvre \"Enregistrer l'image\"; sur Android, télécharge directement.",
          },
        },
        interface: {
          title: 'Interface',
          description: 'Préférences visuelles pour les listes et tableaux',
          compactTables: {
            title: 'Tableaux compacts',
            description: 'Réduire l’espacement des tableaux pour afficher plus de données par page',
          },
          showEquipmentPhotos: {
            title: 'Photos des équipements',
            description: 'Afficher des miniatures des photos d’équipements dans les listes',
          },
        },
        security: {
          title: 'Sécurité',
          description: 'Confirmations et validations de sécurité',
          confirmDelete: {
            title: 'Confirmer les suppressions',
            description: 'Afficher une boîte de dialogue de confirmation avant de supprimer des enregistrements',
          },
        },
        schedule: {
          title: 'Agenda',
          description: "Paramètres de l'agenda et du calendrier",
          showHolidays: {
            title: 'Afficher les jours fériés',
            description: 'Afficher les jours fériés nationaux et locaux dans l’agenda',
          },
        },
      },

      origins: {
        cardTitle: 'Sources',
        cardDescription: 'Liste de sources utilisée dans l’inscription des clients et les opportunités CRM',
        manage: 'Gérer les sources',
        empty: 'Aucune source enregistrée. Créez un ensemble initial et modifiez-le librement ensuite.',
        seedButton: 'Créer les sources par défaut',
        seedLoading: 'Création…',
        inactive: 'Inactif',
      },
    },

    regional: {
      personalCard: {
        title: 'Ma langue',
        description: 'La langue que VOUS voyez dans le système. S’applique immédiatement, pour vous seulement.',
        languageLabel: 'Langue',
        languageHint: 'Préférence personnelle. Remplace la langue par défaut de l’entreprise uniquement pour vous.',
      },
      companyCard: {
        title: "Paramètres par défaut de l'entreprise",
        description: "Langue, devise et fuseau horaire par défaut pour toute l'entreprise",
        adminOnly: '(admin uniquement)',
        languageLabel: "Langue par défaut de l'entreprise",
        languageHint: "Langue appliquée à tous les utilisateurs n'ayant pas choisi la leur.",
        localeDefaultsPrompt: 'Appliquer les paramètres par défaut de {locale} pour la devise et le fuseau horaire ?',
        keepCurrent: 'Conserver actuels',
        useDefaults: 'Utiliser les défauts',
        localeDefaultsApplied: 'Paramètres de {locale} appliqués',
        currencyLabel: 'Devise',
        currencyHint: "Devise d'exploitation utilisée pour les valeurs du système.",
        currencyChangedWarning: "La devise est la devise d'exploitation de l'entreprise. La changer ne convertit pas les valeurs déjà enregistrées, elles conservent leur nombre d'origine.",
        timezoneLabel: 'Fuseau horaire',
        timezoneHint: 'Utilisé pour les dates et heures affichées dans le système.',
        timezonePlaceholder: 'Sélectionner le fuseau horaire',
        timezoneSearchPlaceholder: 'Rechercher un fuseau (ex: Paris)',
        timezoneEmpty: 'Aucun fuseau trouvé.',
        savingStatus: 'Enregistrement...',
        unsavedStatus: 'Modifications non enregistrées',
        savedStatus: 'Enregistré',
      },
    },

    appearance: {
      cardTitle: 'Apparence',
      cardDescription: "Personnalisez l'interface visuelle du système",
      navigationStyle: {
        sectionTitle: 'Style de navigation (Bureau)',
        sectionDescription: 'Choisissez entre un menu latéral ou une barre de navigation supérieure. Cette option n’affecte que la vue bureau.',
        sidebar: 'Menu latéral',
        sidebarDescription: 'Barre latérale traditionnelle à gauche',
        topbar: 'Barre supérieure',
        topbarDescription: 'Barre horizontale en haut',
      },
      theme: {
        sectionTitle: 'Thème du système',
        sectionDescription: "Choisissez entre le thème clair ou sombre pour l'interface.",
        light: 'Thème clair',
        dark: 'Thème sombre',
      },
    },

    shortcuts: {
      pageTitle: 'Raccourcis clavier',
      pageDescription: 'Utilisez des raccourcis pour accéder rapidement aux fonctionnalités',
      toggleLabel: 'Raccourcis clavier',
      toggleEnabled: 'Les raccourcis sont activés',
      toggleDisabled: 'Les raccourcis sont désactivés',
      groupNavigation: 'Navigation',
      groupGeneral: 'Général',
      tips: {
        title: 'Astuces',
        shiftNav: 'Utilisez {modifier} + touche pour la navigation rapide',
        noTyping: 'Les raccourcis ne fonctionnent pas lorsque vous saisissez dans des champs de texte',
        canDisable: "Vous pouvez désactiver les raccourcis à tout moment via le bouton ci-dessus",
      },
      goto_dashboard: { label: 'Tableau de bord', description: 'Aller au tableau de bord principal' },
      goto_os: { label: 'Bons de travail', description: 'Aller aux bons de travail' },
      goto_agenda: { label: 'Agenda', description: "Aller à l'agenda" },
      goto_clients: { label: 'Clients', description: 'Aller aux clients' },
      goto_equipment: { label: 'Équipements', description: 'Aller aux équipements' },
      goto_crm: { label: 'CRM', description: 'Aller au CRM' },
      goto_finance: { label: 'Finances', description: 'Aller aux finances' },
      goto_inventory: { label: 'Stock', description: 'Aller au stock' },
      goto_quotes: { label: 'Devis', description: 'Aller aux devis' },
      goto_contracts: { label: 'Contrats', description: 'Aller aux contrats' },
      goto_settings: { label: 'Paramètres', description: 'Ouvrir les paramètres' },
      goto_profile: { label: 'Profil', description: "Ouvrir le profil utilisateur" },
    },

    dangerZone: {
      title: 'Zone dangereuse',
      description: 'Actions irréversibles. Vérifiez attentivement avant de confirmer.',
      resetSystem: {
        label: 'Réinitialiser le système',
        description: "Supprime les données opérationnelles sélectionnées. Les données de l'entreprise et les utilisateurs sont conservés. Toute opération est enregistrée dans un journal d'audit.",
        button: 'Réinitialiser le système',
      },
    },

    resetSystem: {
      modalTitle: 'Réinitialiser le système',
      irreversibleWarning: 'Cette action va',
      deletePermanently: 'SUPPRIMER DÉFINITIVEMENT',
      warningCompany: "les données opérationnelles de l'entreprise",
      chooseWhat: 'Choisissez ce que vous souhaitez supprimer :',
      selectAll: 'Tout sélectionner',
      selectedCount: '{count}/{total} sélectionnés',
      groupSelectAriaLabel: 'Tout sélectionner dans {group}',
      forcedByMaterials: 'Requis car le catalogue de matériaux a été sélectionné.',
      preserved: {
        title: 'Seront conservés :',
        companyData: "Données de base de l'entreprise",
        users: 'Utilisateurs enregistrés',
        paymentHistory: 'Historique des paiements',
      },
      finalWarning: 'Cette action NE PEUT PAS être annulée !',
      confirmLabel: "Pour confirmer, saisissez le nom de l'entreprise :",
      confirmPlaceholder: "Nom de l'entreprise",
      nameMismatch: "Le nom saisi ne correspond pas au nom de l'entreprise.",
      offline: 'Cette action nécessite une connexion Internet. Vous êtes hors ligne.',
      progressTitle: 'Suppression des données...',
      progressStep: 'Étape {current} sur {total} :',
      cancel: 'Annuler',
      confirmButton: 'Oui, réinitialiser le système',
      successTitle: 'Système réinitialisé avec succès',
      successDesc: "Les données sélectionnées ont été supprimées. Le journal d'audit a été généré.",
      errorTitle: "Impossible de réinitialiser le système",
      errorPermission: "Vous n'avez pas la permission de réinitialiser le système. Seul l'administrateur de l'entreprise peut le faire.",
      errorTimeout: "Une étape a pris trop de temps. Réessayez, les données déjà supprimées restent supprimées.",
      errorDependency: "Impossible de terminer l'étape en raison d'une dépendance inattendue. Prévenez le support avec le nom de l'étape.",
      errorDuplicate: "Impossible de recréer une configuration par défaut. Réessayez dans quelques secondes.",
      errorGeneric: "Impossible de réinitialiser le système. Réessayez ou contactez le support.",
      errorStepPrefix: 'Erreur à l’étape "{step}".',

      groups: {
        operacional: {
          label: 'Opérationnel',
          delete_service_orders: {
            title: 'Bons de travail',
            description: 'Supprime tous les bons de travail, photos, matériaux consommés, évaluations et formulaires remplis',
          },
          delete_equipment: {
            title: 'Équipements',
            description: 'Supprime tous les équipements enregistrés pour les clients',
          },
          delete_contracts: {
            title: 'Contrats et plans de maintenance',
            description: 'Supprime tous les contrats, plannings et documents de maintenance personnalisés',
          },
          delete_custom_configs: {
            title: 'Configurations personnalisées',
            description: 'Supprime les étapes CRM personnalisées, les formulaires de bons de travail et les ressources de coût',
          },
        },
        comercial: {
          label: 'Ventes (CRM)',
          delete_quotes: {
            title: 'Devis et propositions',
            description: 'Supprime tous les devis et propositions',
          },
          delete_customers: {
            title: 'Clients et leads',
            description: 'Supprime tous les dossiers clients, contacts, portails et leads',
          },
        },
        financeiro: {
          label: 'Finances',
          delete_financial_movements: {
            title: 'Transactions',
            description: 'Supprime toutes les transactions de caisse, banque, carte, recettes et dépenses',
          },
          delete_financial_categories: {
            title: 'Catégories financières',
            description: 'Supprime les catégories financières personnalisées (les catégories par défaut sont conservées)',
          },
        },
        rh_inventario: {
          label: 'RH et Stock',
          delete_employees: {
            title: 'Employés et équipes',
            description: 'Supprime tous les employés, avances, paiements, pointages et équipes',
          },
          delete_materials: {
            title: 'Matériaux',
            description: 'Supprime tous les matériaux enregistrés (et leur stock)',
          },
          delete_stock: {
            title: 'Stock',
            description: 'Vide le stock (mouvements), conserve les matériaux enregistrés',
          },
        },
      },

      stepLabels: {
        service_orders: 'Bons de travail',
        contracts: 'Contrats',
        quotes: 'Devis',
        equipment: 'Équipements',
        custom_configs: 'Configurations personnalisées',
        financial_movements: 'Transactions financières',
        financial_categories: 'Catégories financières',
        employees: 'Employés et RH',
        stock: 'Stock de matériaux',
        materials: 'Catalogue de matériaux',
        customers: 'Clients',
      },
    },

    help: {
      title: "Centre d'aide",
      intro: "Questions fréquentes sur le système. Si vous ne trouvez pas votre réponse, contactez le support via WhatsApp.",
      faqs: [
        {
          q: 'Comment créer un bon de travail ?',
          a: 'Allez dans "Bons de travail" dans le menu latéral, cliquez sur "+ Nouveau bon", remplissez les informations du client, le type de service et le technicien assigné, puis enregistrez.',
        },
        {
          q: 'Comment enregistrer un nouveau client ?',
          a: 'Allez dans "Clients" dans le menu, cliquez sur "Nouveau client" et remplissez les informations. Vous pouvez enregistrer un particulier ou une entreprise.',
        },
        {
          q: 'Comment fonctionne la gestion financière ?',
          a: 'Dans le menu "Finances", vous avez une vue d’ensemble, les transactions, les comptes à payer/recevoir et le compte de résultat. Les bons de travail peuvent générer automatiquement des écritures financières.',
        },
        {
          q: 'Comment fonctionnent les paiements des employés ?',
          a: "Dans \"Employés\", cliquez sur l'icône de paiement sur la fiche de l'employé. Le système calcule automatiquement salaire + primes - avances - absences et vous permet de sélectionner le compte à débiter.",
        },
        {
          q: 'Comment configurer le suivi des présences ?',
          a: 'Allez dans Employés > Suivi des présences. Définissez les horaires standard, la tolérance de retard et les exigences de selfie/géolocalisation dans les paramètres.',
        },
        {
          q: 'Comment créer des contrats récurrents ?',
          a: "Dans \"Contrats\", créez un nouveau contrat en définissant le client, la fréquence (mensuelle, bimestrielle, etc.) et la période. Le système génère automatiquement les occurrences planifiées.",
        },
        {
          q: "Qu'est-ce que le CRM et comment l'utiliser ?",
          a: "Le CRM est votre entonnoir de vente. Créez des leads, déplacez-les entre les étapes (Nouveau, Contact, Proposition, Gagné/Perdu) et suivez la valeur du pipeline en temps réel.",
        },
        {
          q: 'Comment fonctionne le module de Stock ?',
          a: 'Dans "Stock", enregistrez des articles avec leur prix de revient/vente, la quantité minimale et l’unité. Le système vous alerte quand le stock passe sous le minimum.',
        },
        {
          q: 'Comment exporter des rapports ?',
          a: 'Plusieurs modules disposent de boutons d’exportation (PDF, HTML). Les relevés d’employés, devis et comptes de résultat proposent des options d’exportation et d’impression.',
        },
        {
          q: 'Comment changer mon mot de passe ?',
          a: 'Allez dans "Profil" depuis le menu utilisateur (bas du menu latéral) et cliquez sur "Changer le mot de passe". Vous recevrez un e-mail pour le réinitialiser.',
        },
      ],
    },
  },
};
