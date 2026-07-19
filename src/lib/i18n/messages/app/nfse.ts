// i18n do APP — domínio NOTAS FISCAIS (NFS-e). Preencha nos 4 locales (pt-br base;
// ausência cai no pt-br pelo deepMerge). Ver app/index.ts.
//
// REGRA: dado do banco (número da nota, nome do cliente, chave de acesso,
// descrição do serviço) NÃO se traduz. Só chrome/UI.
// NFS-e é um documento brasileiro — em outros idiomas vira o CONCEITO:
//   en  → "service invoice"
//   es  → "factura de servicio"
//   fr  → "facture de service"
// Termos fiscais ficam no idioma-alvo (ISS → SST em inglês, etc.).
export const nfse = {
  'pt-br': {
    page: {
      title: 'Notas Fiscais',
      subtitle: 'Emita e acompanhe suas NFS-e.',
    },
    access: {
      noAccess:
        'Você não tem acesso ao módulo de Notas Fiscais. Fale com o administrador da sua empresa.',
    },
    tabs: {
      overview: 'Visão Geral',
      list: 'NFS-e',
    },
    quota: {
      unlimited: 'Notas ilimitadas',
      used: '{used} / {limit} emitidas este mês',
    },
    actions: {
      newNote: 'Nova Nota',
      fiscalSettings: 'Configurações fiscais',
      viewDetail: 'Ver detalhe',
      refreshStatus: 'Atualizar status',
      downloadPdf: 'Baixar PDF',
      downloadXml: 'Baixar XML',
      history: 'Histórico',
      cancel: 'Cancelar',
      apply: 'Aplicar',
      clear: 'Limpar',
    },
    filters: {
      button: 'Filtros',
      title: 'Filtros',
      status: 'Status',
      allLabel: 'Todos',
    },
    search: {
      placeholder: 'Buscar por número, cliente, descrição, chave...',
      filterSuspended:
        'Buscando em todas as notas — o filtro de status fica suspenso enquanto há busca.',
    },
    list: {
      notePrefix: 'Nota nº',
      empty: 'Nenhuma nota encontrada com esses filtros.',
      customerFallback: 'Cliente',
    },
    // ── Status das notas ────────────────────────────────────────────────────
    status: {
      pendente: 'Pendente',
      processando: 'Processando',
      autorizada: 'Autorizada',
      rejeitada: 'Rejeitada',
      cancelada: 'Cancelada',
      falhou: 'Falhou',
      unknown: 'Desconhecido',
    },
    // ── Visão Geral ─────────────────────────────────────────────────────────
    overview: {
      totalIssued: 'Total emitido no período',
      totalIssuedSub: 'Soma das notas autorizadas ({count}).',
      countAuthorized: 'Autorizadas',
      countProcessing: 'Processando',
      countRejected: 'Rejeitadas',
      countCancelled: 'Canceladas',
      recentTitle: 'Últimas emissões',
      empty: 'Nenhuma nota fiscal emitida ainda. Clique em "Nova Nota" para começar.',
    },
    // ── Estados vazios ───────────────────────────────────────────────────────
    empty: {
      configTitle: 'Configure seus dados fiscais',
      configDescription: 'Configure seus dados fiscais para começar a emitir notas.',
      configAction: 'Configurações fiscais',
      noNotesTitle: 'Nenhuma nota emitida ainda',
      noNotesDescription: 'Emita sua primeira nota fiscal para acompanhá-la aqui.',
      noNotesAction: 'Nova Nota',
    },
    // ── Modal: Nova Nota ─────────────────────────────────────────────────────
    newNote: {
      title: 'Nova Nota Fiscal',
      cancelBtn: 'Cancelar',
      submitBtn: 'Emitir nota',
      customer: {
        label: 'Cliente (tomador)',
        placeholder: 'Selecione o cliente',
        searchPlaceholder: 'Buscar cliente...',
        emptyMessage: 'Nenhum cliente encontrado.',
        missingDoc:
          'Este cliente está sem CPF/CNPJ. Complete os dados fiscais do cliente (aba Fiscal) antes de emitir a nota.',
      },
      serviceType: {
        label: 'Tipo de serviço (opcional)',
        placeholder: 'Selecione um tipo de serviço',
        searchPlaceholder: 'Buscar tipo de serviço...',
        emptyMessage: 'Nenhum tipo de serviço encontrado.',
        hint: 'Preenche código de serviço, NBS e ISS automaticamente. Você pode ajustar cada campo abaixo.',
      },
      description: {
        label: 'Descrição do serviço',
        placeholder: 'Ex: Manutenção preventiva de ar-condicionado split...',
      },
      value: {
        label: 'Valor do serviço',
        placeholder: '350,00',
      },
      iss: {
        label: 'Alíquota de ISS (%)',
        optional: '(opcional)',
        placeholder: '5,00',
      },
      fiscalClassification: {
        sectionTitle: 'Classificação fiscal',
        serviceCode: {
          label: 'Código de serviço (cTribNac)',
          optional: '(opcional)',
          placeholder: 'Buscar por código ou descrição...',
        },
        nbs: {
          label: 'Código NBS',
          optional: '(opcional)',
          placeholder: 'Buscar por código ou descrição...',
          hint: 'Nomenclatura Brasileira de Serviços. Digite ao menos 2 caracteres pra buscar.',
        },
      },
      quotaBlock: {
        tierFallback: 'Nível {tier}',
      },
      toasts: {
        noCustomer: 'Selecione o cliente.',
        missingDoc:
          'O cliente está sem CPF/CNPJ. Complete os dados fiscais do cliente antes de emitir.',
        noDescription: 'Descreva o serviço prestado.',
        invalidValue: 'Informe um valor de serviço válido.',
        emitSuccess: 'Nota fiscal enviada para emissão.',
        emitError: 'Não foi possível emitir a nota fiscal.',
      },
    },
    // ── Modal: Detalhe da nota ───────────────────────────────────────────────
    detail: {
      titleFallback: 'Nota fiscal',
      notePrefix: 'Nota nº',
      processing: 'Processando…',
      stillProcessing: 'Ainda em processamento — toque para atualizar.',
      viewerTitlePdf: 'PDF da nota',
      viewerTitleXml: 'XML da nota',
      back: 'Voltar',
      viewPdf: 'Ver PDF',
      viewXml: 'Ver XML',
      cancelNote: 'Cancelar nota',
      refreshStatus: 'Atualizar status',
      fields: {
        serviceValue: 'Valor do serviço',
        iss: 'ISS',
        issuedAt: 'Emitida em',
        createdAt: 'Criada em',
        protocol: 'Protocolo',
        accessKey: 'Chave de acesso',
        description: 'Descrição',
      },
      history: {
        title: 'Histórico',
        loading: 'Carregando histórico…',
        empty: 'Nenhum evento registrado ainda.',
        eventFallback: 'Evento',
      },
      confirmCancel: {
        title: 'Cancelar esta nota fiscal?',
        description:
          'O cancelamento é registrado junto à prefeitura e não pode ser desfeito.',
        motivoLabel: 'Motivo (opcional)',
        motivoPlaceholder: 'Ex: Serviço não realizado / valor incorreto...',
        confirmBtn: 'Cancelar nota',
        backBtn: 'Voltar',
      },
      toasts: {
        refreshError: 'Não foi possível atualizar o status.',
        refreshSuccess: 'Status atualizado.',
        cancelError: 'Não foi possível cancelar a nota.',
        cancelSuccess: 'Cancelamento solicitado.',
      },
    },
    // ── Modal: Bloqueio de cota ──────────────────────────────────────────────
    quotaBlock: {
      title: 'Limite de notas atingido',
      warning:
        'Você emitiu {used} de {limit} notas fiscais este mês no seu nível atual. Para emitir mais notas ainda este mês, suba de nível.',
      nextTierLabel: 'Próximo nível',
      unlimitedNotes: 'ilimitadas',
      limitedNotes: '{limit} notas/mês',
      upgradeNote:
        'O upgrade libera a cota maior na hora e a nota que você estava emitindo é concluída automaticamente. O novo valor entra na próxima cobrança.',
      maxTierReached:
        'Você já está no nível máximo. Se precisa de mais capacidade, fale com o suporte.',
      upgradeBtn: 'Fazer upgrade para {name}',
      priceMonth: '/mês',
      notNow: 'Agora não',
      close: 'Fechar',
      toasts: {
        upgraded: 'Nível atualizado! Você já pode emitir.',
        error: 'Não foi possível atualizar o nível.',
      },
    },
    // ── Modal: Configurações fiscais ─────────────────────────────────────────
    settings: {
      title: 'Configurações fiscais',
      readyBadge: 'Apto a emitir',
      sections: {
        empresa: 'Empresa',
        certificado: 'Certificado A1',
        impostos: 'Tributação',
      },
      steps: {
        hintEmpresa:
          'Passo 1 de 2: preencha os dados e registre a empresa. Só depois libera o certificado.',
        hintCertificado:
          'Passo 2 de 2: com a empresa já registrada, envie o certificado A1 (.pfx/.p12).',
      },
      empresa: {
        companyName: 'Razão social / Nome',
        companyNamePlaceholder: 'Nome da empresa',
        cnpj: 'CNPJ',
        cnpjPlaceholder: '00.000.000/0000-00',
        addressSection: 'Endereço fiscal',
        cep: 'CEP',
        cepHint: 'Preenche endereço, cidade e o código do município automaticamente.',
        street: 'Logradouro',
        number: 'Número',
        complement: 'Complemento',
        neighborhood: 'Bairro',
        cityUf: 'Cidade / UF',
        environment: 'Ambiente de emissão de NFS-e',
        environmentProduction: 'Produção: as notas valem de verdade (têm efeito fiscal).',
        environmentHomologation: 'Homologação: notas de teste, sem valor fiscal.',
        environmentOff: 'Homologação',
        environmentOn: 'Produção',
        saveBtn: 'Salvar dados da empresa',
        statusSection: 'Status da emissão',
        statusCompanyRegistered: 'Empresa: registrada',
        statusCompanyPending: 'Empresa: não registrada',
        statusCertSent: 'Certificado: enviado',
        statusCertPending: 'Certificado: pendente',
        nextBtn: 'Próximo: enviar certificado',
      },
      certificado: {
        notRegisteredWarning:
          'Registre a empresa antes de subir o certificado. Volte ao passo {link} e registre a empresa primeiro.',
        notRegisteredLink: '1. Empresa',
        certExpired: 'Certificado vencido em {date}. Envie um novo.',
        certValidUntil: 'Certificado válido até {date}',
        certExpiringSoon: ' — vence em {days} dia(s).',
        certSent: 'Certificado enviado.',
        fileLabel: 'Arquivo do certificado',
        fileBtn: 'Selecionar arquivo (.pfx / .p12)',
        nameLabel: 'Nome do certificado (opcional)',
        namePlaceholder: 'Ex: Certificado da empresa',
        passwordLabel: 'Senha do certificado',
        passwordPlaceholder: 'Senha do arquivo .pfx/.p12',
        passwordHint: 'Use a senha do próprio certificado, não a senha do sistema.',
        showPassword: 'Mostrar senha',
        hidePassword: 'Ocultar senha',
        uploadBtn: 'Enviar certificado',
        toasts: {
          noFile: 'Selecione o arquivo do certificado.',
          noPassword: 'Informe a senha do certificado.',
          invalidFile: 'O certificado deve ser um arquivo .pfx ou .p12.',
          uploadSuccess: 'Certificado enviado com sucesso.',
          uploadError: 'Falha ao enviar o certificado.',
          saveError: 'Não foi possível salvar os dados da empresa.',
          saveSuccess: 'Dados da empresa salvos.',
          registerWarning:
            'Dados salvos, mas o registro para emissão falhou: {error}. Revise os dados e salve novamente.',
        },
      },
      impostos: {
        regime: 'Regime tributário',
        regimePlaceholder: 'Selecione',
        regimes: {
          simplesNacional: 'Simples Nacional',
          lucroPresumido: 'Lucro Presumido',
          lucroReal: 'Lucro Real',
          mei: 'MEI',
        },
        inscricaoMunicipal: 'Inscrição Municipal',
        inscricaoEstadual: 'Inscrição Estadual',
        saveBtn: 'Salvar tributação',
        toasts: {
          saveSuccess: 'Configurações fiscais salvas.',
          saveError: 'Não foi possível salvar as configurações fiscais.',
        },
      },
    },
    // ── Combobox de códigos fiscais (TaxCodeCombobox) ────────────────────────
    taxCode: {
      selectPlaceholder: 'Selecione o código...',
      searching: 'Buscando...',
      minCharsHint: 'Digite ao menos {min} caracteres para buscar.',
      fetchError: 'Não foi possível buscar os códigos agora.',
      retryBtn: 'Tentar novamente',
      useTypedCode: 'Ou usar o código "{code}" digitado',
      emptyResult: 'Nenhum código encontrado.',
      useTypedEmpty: 'Toque para usar "{code}".',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ENGLISH
  // "NFS-e" → "service invoice" (Brazilian e-invoice for services — concept)
  // ──────────────────────────────────────────────────────────────────────────
  en: {
    page: {
      title: 'Service Invoices',
      subtitle: 'Issue and track your service invoices.',
    },
    access: {
      noAccess:
        "You don't have access to the Service Invoices module. Contact your company's administrator.",
    },
    tabs: {
      overview: 'Overview',
      list: 'Invoices',
    },
    quota: {
      unlimited: 'Unlimited invoices',
      used: '{used} / {limit} issued this month',
    },
    actions: {
      newNote: 'New Invoice',
      fiscalSettings: 'Tax settings',
      viewDetail: 'View detail',
      refreshStatus: 'Refresh status',
      downloadPdf: 'Download PDF',
      downloadXml: 'Download XML',
      history: 'History',
      cancel: 'Cancel',
      apply: 'Apply',
      clear: 'Clear',
    },
    filters: {
      button: 'Filters',
      title: 'Filters',
      status: 'Status',
      allLabel: 'All',
    },
    search: {
      placeholder: 'Search by number, customer, description, key...',
      filterSuspended:
        'Searching across all invoices — status filter is suspended while there is a search term.',
    },
    list: {
      notePrefix: 'Invoice #',
      empty: 'No invoices found for these filters.',
      customerFallback: 'Customer',
    },
    status: {
      pendente: 'Pending',
      processando: 'Processing',
      autorizada: 'Authorized',
      rejeitada: 'Rejected',
      cancelada: 'Cancelled',
      falhou: 'Failed',
      unknown: 'Unknown',
    },
    overview: {
      totalIssued: 'Total issued this period',
      totalIssuedSub: 'Sum of authorized invoices ({count}).',
      countAuthorized: 'Authorized',
      countProcessing: 'Processing',
      countRejected: 'Rejected',
      countCancelled: 'Cancelled',
      recentTitle: 'Recent invoices',
      empty: 'No service invoices issued yet. Click "New Invoice" to get started.',
    },
    empty: {
      configTitle: 'Set up your tax information',
      configDescription: 'Configure your tax details to start issuing invoices.',
      configAction: 'Tax settings',
      noNotesTitle: 'No invoices issued yet',
      noNotesDescription: 'Issue your first service invoice to track it here.',
      noNotesAction: 'New Invoice',
    },
    newNote: {
      title: 'New Service Invoice',
      cancelBtn: 'Cancel',
      submitBtn: 'Issue invoice',
      customer: {
        label: 'Customer (service recipient)',
        placeholder: 'Select a customer',
        searchPlaceholder: 'Search customer...',
        emptyMessage: 'No customer found.',
        missingDoc:
          'This customer has no tax ID (CPF/CNPJ). Complete the customer tax details (Tax tab) before issuing the invoice.',
      },
      serviceType: {
        label: 'Service type (optional)',
        placeholder: 'Select a service type',
        searchPlaceholder: 'Search service type...',
        emptyMessage: 'No service type found.',
        hint: 'Auto-fills service code, NBS and SST rate. You can adjust each field below.',
      },
      description: {
        label: 'Service description',
        placeholder: 'E.g.: Preventive maintenance of split air conditioner...',
      },
      value: {
        label: 'Service amount',
        placeholder: '350.00',
      },
      iss: {
        label: 'SST rate (%)',
        optional: '(optional)',
        placeholder: '5.00',
      },
      fiscalClassification: {
        sectionTitle: 'Tax classification',
        serviceCode: {
          label: 'Service code (cTribNac)',
          optional: '(optional)',
          placeholder: 'Search by code or description...',
        },
        nbs: {
          label: 'NBS code',
          optional: '(optional)',
          placeholder: 'Search by code or description...',
          hint: 'Brazilian Services Nomenclature. Type at least 2 characters to search.',
        },
      },
      quotaBlock: {
        tierFallback: 'Plan {tier}',
      },
      toasts: {
        noCustomer: 'Please select a customer.',
        missingDoc: 'Customer has no tax ID. Complete their tax details before issuing.',
        noDescription: 'Please describe the service provided.',
        invalidValue: 'Enter a valid service amount.',
        emitSuccess: 'Invoice submitted for issuance.',
        emitError: 'Could not issue the invoice.',
      },
    },
    detail: {
      titleFallback: 'Service invoice',
      notePrefix: 'Invoice #',
      processing: 'Processing…',
      stillProcessing: 'Still processing — tap to refresh.',
      viewerTitlePdf: 'Invoice PDF',
      viewerTitleXml: 'Invoice XML',
      back: 'Back',
      viewPdf: 'View PDF',
      viewXml: 'View XML',
      cancelNote: 'Cancel invoice',
      refreshStatus: 'Refresh status',
      fields: {
        serviceValue: 'Service amount',
        iss: 'SST',
        issuedAt: 'Issued at',
        createdAt: 'Created at',
        protocol: 'Protocol',
        accessKey: 'Access key',
        description: 'Description',
      },
      history: {
        title: 'History',
        loading: 'Loading history…',
        empty: 'No events recorded yet.',
        eventFallback: 'Event',
      },
      confirmCancel: {
        title: 'Cancel this service invoice?',
        description:
          'Cancellation is registered with the tax authority and cannot be undone.',
        motivoLabel: 'Reason (optional)',
        motivoPlaceholder: 'E.g.: Service not rendered / incorrect amount...',
        confirmBtn: 'Cancel invoice',
        backBtn: 'Go back',
      },
      toasts: {
        refreshError: 'Could not refresh status.',
        refreshSuccess: 'Status updated.',
        cancelError: 'Could not cancel the invoice.',
        cancelSuccess: 'Cancellation requested.',
      },
    },
    quotaBlock: {
      title: 'Invoice limit reached',
      warning:
        'You have issued {used} of {limit} service invoices this month on your current plan. To issue more invoices this month, upgrade your plan.',
      nextTierLabel: 'Next plan',
      unlimitedNotes: 'unlimited',
      limitedNotes: '{limit} invoices/month',
      upgradeNote:
        'The upgrade unlocks the higher quota immediately and the invoice you were issuing is completed automatically. The new amount takes effect on your next billing cycle.',
      maxTierReached:
        'You are already on the highest plan. If you need more capacity, contact support.',
      upgradeBtn: 'Upgrade to {name}',
      priceMonth: '/month',
      notNow: 'Not now',
      close: 'Close',
      toasts: {
        upgraded: 'Plan upgraded! You can now issue invoices.',
        error: 'Could not upgrade the plan.',
      },
    },
    settings: {
      title: 'Tax settings',
      readyBadge: 'Ready to issue',
      sections: {
        empresa: 'Company',
        certificado: 'Digital Certificate',
        impostos: 'Taxation',
      },
      steps: {
        hintEmpresa:
          'Step 1 of 2: fill in your company details and register. The certificate step unlocks after this.',
        hintCertificado:
          'Step 2 of 2: with your company registered, upload your A1 digital certificate (.pfx/.p12).',
      },
      empresa: {
        companyName: 'Company name / Legal name',
        companyNamePlaceholder: 'Company name',
        cnpj: 'Tax ID (CNPJ)',
        cnpjPlaceholder: '00.000.000/0000-00',
        addressSection: 'Registered address',
        cep: 'ZIP code',
        cepHint: 'Auto-fills street, city and municipality code.',
        street: 'Street',
        number: 'Number',
        complement: 'Complement',
        neighborhood: 'Neighborhood',
        cityUf: 'City / State',
        environment: 'Invoice issuance environment',
        environmentProduction: 'Production: invoices have real tax effect.',
        environmentHomologation: 'Sandbox: test invoices, no tax effect.',
        environmentOff: 'Sandbox',
        environmentOn: 'Production',
        saveBtn: 'Save company details',
        statusSection: 'Issuance status',
        statusCompanyRegistered: 'Company: registered',
        statusCompanyPending: 'Company: not registered',
        statusCertSent: 'Certificate: uploaded',
        statusCertPending: 'Certificate: pending',
        nextBtn: 'Next: upload certificate',
      },
      certificado: {
        notRegisteredWarning:
          'Register your company before uploading the certificate. Go back to step {link} and register the company first.',
        notRegisteredLink: '1. Company',
        certExpired: 'Certificate expired on {date}. Please upload a new one.',
        certValidUntil: 'Certificate valid until {date}',
        certExpiringSoon: ' — expires in {days} day(s).',
        certSent: 'Certificate uploaded.',
        fileLabel: 'Certificate file',
        fileBtn: 'Select file (.pfx / .p12)',
        nameLabel: 'Certificate name (optional)',
        namePlaceholder: 'E.g.: Company certificate',
        passwordLabel: 'Certificate password',
        passwordPlaceholder: 'Password for the .pfx/.p12 file',
        passwordHint: 'Use the certificate password, not your system login password.',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        uploadBtn: 'Upload certificate',
        toasts: {
          noFile: 'Please select the certificate file.',
          noPassword: 'Please enter the certificate password.',
          invalidFile: 'The certificate must be a .pfx or .p12 file.',
          uploadSuccess: 'Certificate uploaded successfully.',
          uploadError: 'Failed to upload the certificate.',
          saveError: 'Could not save company details.',
          saveSuccess: 'Company details saved.',
          registerWarning:
            'Details saved, but issuance registration failed: {error}. Review the data and save again.',
        },
      },
      impostos: {
        regime: 'Tax regime',
        regimePlaceholder: 'Select',
        regimes: {
          simplesNacional: 'Simples Nacional',
          lucroPresumido: 'Presumed Profit',
          lucroReal: 'Actual Profit',
          mei: 'MEI (Microentrepreneur)',
        },
        inscricaoMunicipal: 'Municipal Registration',
        inscricaoEstadual: 'State Registration',
        saveBtn: 'Save taxation',
        toasts: {
          saveSuccess: 'Tax settings saved.',
          saveError: 'Could not save tax settings.',
        },
      },
    },
    // ── Tax code combobox (TaxCodeCombobox) ──────────────────────────────────
    taxCode: {
      selectPlaceholder: 'Select a code...',
      searching: 'Searching...',
      minCharsHint: 'Type at least {min} characters to search.',
      fetchError: 'Could not load tax codes right now.',
      retryBtn: 'Try again',
      useTypedCode: 'Or use the typed code "{code}"',
      emptyResult: 'No codes found.',
      useTypedEmpty: 'Tap to use "{code}".',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ESPAÑOL
  // "NFS-e" → "factura de servicio" (concepto)
  // ──────────────────────────────────────────────────────────────────────────
  es: {
    page: {
      title: 'Facturas de Servicio',
      subtitle: 'Emite y realiza el seguimiento de tus facturas de servicio.',
    },
    access: {
      noAccess:
        'No tienes acceso al módulo de Facturas de Servicio. Habla con el administrador de tu empresa.',
    },
    tabs: {
      overview: 'Resumen',
      list: 'Facturas',
    },
    quota: {
      unlimited: 'Facturas ilimitadas',
      used: '{used} / {limit} emitidas este mes',
    },
    actions: {
      newNote: 'Nueva Factura',
      fiscalSettings: 'Configuración fiscal',
      viewDetail: 'Ver detalle',
      refreshStatus: 'Actualizar estado',
      downloadPdf: 'Descargar PDF',
      downloadXml: 'Descargar XML',
      history: 'Historial',
      cancel: 'Cancelar',
      apply: 'Aplicar',
      clear: 'Limpiar',
    },
    filters: {
      button: 'Filtros',
      title: 'Filtros',
      status: 'Estado',
      allLabel: 'Todos',
    },
    search: {
      placeholder: 'Buscar por número, cliente, descripción, clave...',
      filterSuspended:
        'Buscando en todas las facturas — el filtro de estado queda suspendido mientras hay texto de búsqueda.',
    },
    list: {
      notePrefix: 'Factura nº',
      empty: 'No se encontraron facturas con estos filtros.',
      customerFallback: 'Cliente',
    },
    status: {
      pendente: 'Pendiente',
      processando: 'Procesando',
      autorizada: 'Autorizada',
      rejeitada: 'Rechazada',
      cancelada: 'Cancelada',
      falhou: 'Fallida',
      unknown: 'Desconocido',
    },
    overview: {
      totalIssued: 'Total emitido en el período',
      totalIssuedSub: 'Suma de facturas autorizadas ({count}).',
      countAuthorized: 'Autorizadas',
      countProcessing: 'Procesando',
      countRejected: 'Rechazadas',
      countCancelled: 'Canceladas',
      recentTitle: 'Últimas emisiones',
      empty: 'Aún no se han emitido facturas de servicio. Haz clic en "Nueva Factura" para comenzar.',
    },
    empty: {
      configTitle: 'Configura tus datos fiscales',
      configDescription: 'Configura tus datos fiscales para comenzar a emitir facturas.',
      configAction: 'Configuración fiscal',
      noNotesTitle: 'Aún no se ha emitido ninguna factura',
      noNotesDescription: 'Emite tu primera factura de servicio para hacer el seguimiento aquí.',
      noNotesAction: 'Nueva Factura',
    },
    newNote: {
      title: 'Nueva Factura de Servicio',
      cancelBtn: 'Cancelar',
      submitBtn: 'Emitir factura',
      customer: {
        label: 'Cliente (receptor del servicio)',
        placeholder: 'Selecciona el cliente',
        searchPlaceholder: 'Buscar cliente...',
        emptyMessage: 'No se encontró ningún cliente.',
        missingDoc:
          'Este cliente no tiene número de identificación fiscal. Completa sus datos fiscales (pestaña Fiscal) antes de emitir la factura.',
      },
      serviceType: {
        label: 'Tipo de servicio (opcional)',
        placeholder: 'Selecciona un tipo de servicio',
        searchPlaceholder: 'Buscar tipo de servicio...',
        emptyMessage: 'No se encontró ningún tipo de servicio.',
        hint: 'Completa automáticamente el código de servicio, NBS y tasa ISS. Puedes ajustar cada campo a continuación.',
      },
      description: {
        label: 'Descripción del servicio',
        placeholder: 'Ej.: Mantenimiento preventivo de aire acondicionado split...',
      },
      value: {
        label: 'Valor del servicio',
        placeholder: '350,00',
      },
      iss: {
        label: 'Tasa ISS (%)',
        optional: '(opcional)',
        placeholder: '5,00',
      },
      fiscalClassification: {
        sectionTitle: 'Clasificación fiscal',
        serviceCode: {
          label: 'Código de servicio (cTribNac)',
          optional: '(opcional)',
          placeholder: 'Buscar por código o descripción...',
        },
        nbs: {
          label: 'Código NBS',
          optional: '(opcional)',
          placeholder: 'Buscar por código o descripción...',
          hint: 'Nomenclatura Brasileña de Servicios. Escribe al menos 2 caracteres para buscar.',
        },
      },
      quotaBlock: {
        tierFallback: 'Plan {tier}',
      },
      toasts: {
        noCustomer: 'Selecciona el cliente.',
        missingDoc:
          'El cliente no tiene identificación fiscal. Completa sus datos antes de emitir.',
        noDescription: 'Describe el servicio prestado.',
        invalidValue: 'Ingresa un valor de servicio válido.',
        emitSuccess: 'Factura enviada para emisión.',
        emitError: 'No se pudo emitir la factura.',
      },
    },
    detail: {
      titleFallback: 'Factura de servicio',
      notePrefix: 'Factura nº',
      processing: 'Procesando…',
      stillProcessing: 'Aún en proceso — toca para actualizar.',
      viewerTitlePdf: 'PDF de la factura',
      viewerTitleXml: 'XML de la factura',
      back: 'Volver',
      viewPdf: 'Ver PDF',
      viewXml: 'Ver XML',
      cancelNote: 'Cancelar factura',
      refreshStatus: 'Actualizar estado',
      fields: {
        serviceValue: 'Valor del servicio',
        iss: 'ISS',
        issuedAt: 'Emitida el',
        createdAt: 'Creada el',
        protocol: 'Protocolo',
        accessKey: 'Clave de acceso',
        description: 'Descripción',
      },
      history: {
        title: 'Historial',
        loading: 'Cargando historial…',
        empty: 'Aún no hay eventos registrados.',
        eventFallback: 'Evento',
      },
      confirmCancel: {
        title: '¿Cancelar esta factura de servicio?',
        description:
          'La cancelación se registra ante la autoridad fiscal y no se puede deshacer.',
        motivoLabel: 'Motivo (opcional)',
        motivoPlaceholder: 'Ej.: Servicio no realizado / importe incorrecto...',
        confirmBtn: 'Cancelar factura',
        backBtn: 'Volver',
      },
      toasts: {
        refreshError: 'No se pudo actualizar el estado.',
        refreshSuccess: 'Estado actualizado.',
        cancelError: 'No se pudo cancelar la factura.',
        cancelSuccess: 'Cancelación solicitada.',
      },
    },
    quotaBlock: {
      title: 'Límite de facturas alcanzado',
      warning:
        'Has emitido {used} de {limit} facturas de servicio este mes en tu plan actual. Para emitir más facturas este mes, sube de plan.',
      nextTierLabel: 'Siguiente plan',
      unlimitedNotes: 'ilimitadas',
      limitedNotes: '{limit} facturas/mes',
      upgradeNote:
        'La actualización desbloquea la cuota mayor de inmediato y la factura que intentabas emitir se completa automáticamente. El nuevo importe entra en tu próxima facturación.',
      maxTierReached:
        'Ya estás en el plan máximo. Si necesitas más capacidad, contacta con soporte.',
      upgradeBtn: 'Actualizar al plan {name}',
      priceMonth: '/mes',
      notNow: 'Ahora no',
      close: 'Cerrar',
      toasts: {
        upgraded: '¡Plan actualizado! Ya puedes emitir facturas.',
        error: 'No se pudo actualizar el plan.',
      },
    },
    settings: {
      title: 'Configuración fiscal',
      readyBadge: 'Listo para emitir',
      sections: {
        empresa: 'Empresa',
        certificado: 'Certificado Digital',
        impostos: 'Tributación',
      },
      steps: {
        hintEmpresa:
          'Paso 1 de 2: completa los datos y registra la empresa. El certificado se desbloquea después.',
        hintCertificado:
          'Paso 2 de 2: con la empresa registrada, sube el certificado digital A1 (.pfx/.p12).',
      },
      empresa: {
        companyName: 'Razón social / Nombre',
        companyNamePlaceholder: 'Nombre de la empresa',
        cnpj: 'CNPJ',
        cnpjPlaceholder: '00.000.000/0000-00',
        addressSection: 'Domicilio fiscal',
        cep: 'Código postal',
        cepHint: 'Completa dirección, ciudad y código de municipio automáticamente.',
        street: 'Calle',
        number: 'Número',
        complement: 'Complemento',
        neighborhood: 'Colonia / Barrio',
        cityUf: 'Ciudad / Estado',
        environment: 'Entorno de emisión de facturas',
        environmentProduction: 'Producción: las facturas tienen efecto fiscal real.',
        environmentHomologation: 'Homologación: facturas de prueba, sin efecto fiscal.',
        environmentOff: 'Homologación',
        environmentOn: 'Producción',
        saveBtn: 'Guardar datos de la empresa',
        statusSection: 'Estado de la emisión',
        statusCompanyRegistered: 'Empresa: registrada',
        statusCompanyPending: 'Empresa: no registrada',
        statusCertSent: 'Certificado: enviado',
        statusCertPending: 'Certificado: pendiente',
        nextBtn: 'Siguiente: enviar certificado',
      },
      certificado: {
        notRegisteredWarning:
          'Registra la empresa antes de subir el certificado. Vuelve al paso {link} y registra la empresa primero.',
        notRegisteredLink: '1. Empresa',
        certExpired: 'Certificado vencido el {date}. Sube uno nuevo.',
        certValidUntil: 'Certificado válido hasta {date}',
        certExpiringSoon: ' — vence en {days} día(s).',
        certSent: 'Certificado enviado.',
        fileLabel: 'Archivo del certificado',
        fileBtn: 'Seleccionar archivo (.pfx / .p12)',
        nameLabel: 'Nombre del certificado (opcional)',
        namePlaceholder: 'Ej.: Certificado de la empresa',
        passwordLabel: 'Contraseña del certificado',
        passwordPlaceholder: 'Contraseña del archivo .pfx/.p12',
        passwordHint:
          'Usa la contraseña del propio certificado, no la contraseña del sistema.',
        showPassword: 'Mostrar contraseña',
        hidePassword: 'Ocultar contraseña',
        uploadBtn: 'Enviar certificado',
        toasts: {
          noFile: 'Selecciona el archivo del certificado.',
          noPassword: 'Ingresa la contraseña del certificado.',
          invalidFile: 'El certificado debe ser un archivo .pfx o .p12.',
          uploadSuccess: 'Certificado enviado con éxito.',
          uploadError: 'Error al enviar el certificado.',
          saveError: 'No se pudieron guardar los datos de la empresa.',
          saveSuccess: 'Datos de la empresa guardados.',
          registerWarning:
            'Datos guardados, pero el registro para emisión falló: {error}. Revisa los datos y guarda de nuevo.',
        },
      },
      impostos: {
        regime: 'Régimen tributario',
        regimePlaceholder: 'Selecciona',
        regimes: {
          simplesNacional: 'Simples Nacional',
          lucroPresumido: 'Renta Presunta',
          lucroReal: 'Renta Real',
          mei: 'MEI (Microempresario)',
        },
        inscricaoMunicipal: 'Registro Municipal',
        inscricaoEstadual: 'Registro Estatal',
        saveBtn: 'Guardar tributación',
        toasts: {
          saveSuccess: 'Configuración fiscal guardada.',
          saveError: 'No se pudo guardar la configuración fiscal.',
        },
      },
    },
    // ── Combobox de códigos fiscales (TaxCodeCombobox) ───────────────────────
    taxCode: {
      selectPlaceholder: 'Selecciona el código...',
      searching: 'Buscando...',
      minCharsHint: 'Escribe al menos {min} caracteres para buscar.',
      fetchError: 'No se pudieron cargar los códigos en este momento.',
      retryBtn: 'Intentar de nuevo',
      useTypedCode: 'O usar el código "{code}" escrito',
      emptyResult: 'No se encontraron códigos.',
      useTypedEmpty: 'Toca para usar "{code}".',
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // FRANÇAIS
  // "NFS-e" → "facture de service" (concept)
  // ──────────────────────────────────────────────────────────────────────────
  fr: {
    page: {
      title: 'Factures de Service',
      subtitle: 'Émettez et suivez vos factures de service.',
    },
    access: {
      noAccess:
        "Vous n'avez pas accès au module Factures de Service. Contactez l'administrateur de votre entreprise.",
    },
    tabs: {
      overview: 'Vue d\'ensemble',
      list: 'Factures',
    },
    quota: {
      unlimited: 'Factures illimitées',
      used: '{used} / {limit} émises ce mois-ci',
    },
    actions: {
      newNote: 'Nouvelle Facture',
      fiscalSettings: 'Paramètres fiscaux',
      viewDetail: 'Voir le détail',
      refreshStatus: 'Actualiser le statut',
      downloadPdf: 'Télécharger le PDF',
      downloadXml: 'Télécharger le XML',
      history: 'Historique',
      cancel: 'Annuler',
      apply: 'Appliquer',
      clear: 'Effacer',
    },
    filters: {
      button: 'Filtres',
      title: 'Filtres',
      status: 'Statut',
      allLabel: 'Tous',
    },
    search: {
      placeholder: 'Rechercher par numéro, client, description, clé...',
      filterSuspended:
        'Recherche sur toutes les factures — le filtre de statut est suspendu pendant la recherche.',
    },
    list: {
      notePrefix: 'Facture n°',
      empty: 'Aucune facture trouvée avec ces filtres.',
      customerFallback: 'Client',
    },
    status: {
      pendente: 'En attente',
      processando: 'En cours',
      autorizada: 'Autorisée',
      rejeitada: 'Rejetée',
      cancelada: 'Annulée',
      falhou: 'Échouée',
      unknown: 'Inconnu',
    },
    overview: {
      totalIssued: 'Total émis sur la période',
      totalIssuedSub: 'Somme des factures autorisées ({count}).',
      countAuthorized: 'Autorisées',
      countProcessing: 'En cours',
      countRejected: 'Rejetées',
      countCancelled: 'Annulées',
      recentTitle: 'Dernières émissions',
      empty: 'Aucune facture de service émise pour l\'instant. Cliquez sur "Nouvelle Facture" pour commencer.',
    },
    empty: {
      configTitle: 'Configurez vos informations fiscales',
      configDescription: 'Configurez vos données fiscales pour commencer à émettre des factures.',
      configAction: 'Paramètres fiscaux',
      noNotesTitle: 'Aucune facture émise pour l\'instant',
      noNotesDescription: 'Émettez votre première facture de service pour la suivre ici.',
      noNotesAction: 'Nouvelle Facture',
    },
    newNote: {
      title: 'Nouvelle Facture de Service',
      cancelBtn: 'Annuler',
      submitBtn: 'Émettre la facture',
      customer: {
        label: 'Client (bénéficiaire du service)',
        placeholder: 'Sélectionnez le client',
        searchPlaceholder: 'Rechercher un client...',
        emptyMessage: 'Aucun client trouvé.',
        missingDoc:
          "Ce client n'a pas de numéro d'identification fiscale. Complétez ses données fiscales (onglet Fiscal) avant d'émettre la facture.",
      },
      serviceType: {
        label: 'Type de service (facultatif)',
        placeholder: 'Sélectionnez un type de service',
        searchPlaceholder: 'Rechercher un type de service...',
        emptyMessage: 'Aucun type de service trouvé.',
        hint: 'Remplit automatiquement le code de service, NBS et taux de taxe. Vous pouvez ajuster chaque champ ci-dessous.',
      },
      description: {
        label: 'Description du service',
        placeholder: 'Ex. : Maintenance préventive de climatiseur split...',
      },
      value: {
        label: 'Montant du service',
        placeholder: '350,00',
      },
      iss: {
        label: 'Taux de taxe de service (%)',
        optional: '(facultatif)',
        placeholder: '5,00',
      },
      fiscalClassification: {
        sectionTitle: 'Classification fiscale',
        serviceCode: {
          label: 'Code de service (cTribNac)',
          optional: '(facultatif)',
          placeholder: 'Rechercher par code ou description...',
        },
        nbs: {
          label: 'Code NBS',
          optional: '(facultatif)',
          placeholder: 'Rechercher par code ou description...',
          hint: 'Nomenclature brésilienne des services. Saisissez au moins 2 caractères pour lancer la recherche.',
        },
      },
      quotaBlock: {
        tierFallback: 'Niveau {tier}',
      },
      toasts: {
        noCustomer: 'Veuillez sélectionner le client.',
        missingDoc:
          "Le client n'a pas de numéro d'identification fiscale. Complétez ses données avant d'émettre.",
        noDescription: 'Veuillez décrire le service fourni.',
        invalidValue: 'Veuillez saisir un montant de service valide.',
        emitSuccess: 'Facture envoyée pour émission.',
        emitError: "Impossible d'émettre la facture.",
      },
    },
    detail: {
      titleFallback: 'Facture de service',
      notePrefix: 'Facture n°',
      processing: 'En cours…',
      stillProcessing: 'Toujours en cours de traitement — touchez pour actualiser.',
      viewerTitlePdf: 'PDF de la facture',
      viewerTitleXml: 'XML de la facture',
      back: 'Retour',
      viewPdf: 'Voir le PDF',
      viewXml: 'Voir le XML',
      cancelNote: 'Annuler la facture',
      refreshStatus: 'Actualiser le statut',
      fields: {
        serviceValue: 'Montant du service',
        iss: 'Taxe de service',
        issuedAt: 'Émise le',
        createdAt: 'Créée le',
        protocol: 'Protocole',
        accessKey: "Clé d'accès",
        description: 'Description',
      },
      history: {
        title: 'Historique',
        loading: "Chargement de l'historique…",
        empty: "Aucun événement enregistré pour l'instant.",
        eventFallback: 'Événement',
      },
      confirmCancel: {
        title: 'Annuler cette facture de service ?',
        description:
          "L'annulation est enregistrée auprès de l'administration fiscale et ne peut pas être annulée.",
        motivoLabel: 'Motif (facultatif)',
        motivoPlaceholder: 'Ex. : Service non rendu / montant incorrect...',
        confirmBtn: 'Annuler la facture',
        backBtn: 'Retour',
      },
      toasts: {
        refreshError: 'Impossible de mettre à jour le statut.',
        refreshSuccess: 'Statut mis à jour.',
        cancelError: "Impossible d'annuler la facture.",
        cancelSuccess: 'Annulation demandée.',
      },
    },
    quotaBlock: {
      title: 'Limite de factures atteinte',
      warning:
        'Vous avez émis {used} sur {limit} factures de service ce mois-ci dans votre abonnement actuel. Pour émettre davantage de factures ce mois-ci, passez à un abonnement supérieur.',
      nextTierLabel: 'Abonnement suivant',
      unlimitedNotes: 'illimitées',
      limitedNotes: '{limit} factures/mois',
      upgradeNote:
        "La mise à niveau débloque immédiatement le quota supérieur et la facture que vous tentiez d'émettre est finalisée automatiquement. Le nouveau montant s'applique à votre prochain cycle de facturation.",
      maxTierReached:
        "Vous êtes déjà au niveau le plus élevé. Si vous avez besoin de plus de capacité, contactez le support.",
      upgradeBtn: "Passer à l'abonnement {name}",
      priceMonth: '/mois',
      notNow: 'Pas maintenant',
      close: 'Fermer',
      toasts: {
        upgraded: 'Abonnement mis à jour ! Vous pouvez maintenant émettre des factures.',
        error: "Impossible de mettre à jour l'abonnement.",
      },
    },
    settings: {
      title: 'Paramètres fiscaux',
      readyBadge: 'Prêt à émettre',
      sections: {
        empresa: 'Entreprise',
        certificado: 'Certificat numérique',
        impostos: 'Fiscalité',
      },
      steps: {
        hintEmpresa:
          'Étape 1 sur 2 : renseignez les données et enregistrez l\'entreprise. Le certificat se débloque ensuite.',
        hintCertificado:
          'Étape 2 sur 2 : avec l\'entreprise enregistrée, envoyez le certificat numérique A1 (.pfx/.p12).',
      },
      empresa: {
        companyName: 'Raison sociale / Nom',
        companyNamePlaceholder: "Nom de l'entreprise",
        cnpj: 'CNPJ',
        cnpjPlaceholder: '00.000.000/0000-00',
        addressSection: 'Siège social',
        cep: 'Code postal',
        cepHint: 'Remplit automatiquement l\'adresse, la ville et le code de commune.',
        street: 'Rue',
        number: 'Numéro',
        complement: 'Complément',
        neighborhood: 'Quartier',
        cityUf: 'Ville / Département',
        environment: "Environnement d'émission de factures",
        environmentProduction: 'Production : les factures ont un effet fiscal réel.',
        environmentHomologation: 'Homologation : factures de test, sans effet fiscal.',
        environmentOff: 'Homologation',
        environmentOn: 'Production',
        saveBtn: "Enregistrer les données de l'entreprise",
        statusSection: "Statut de l'émission",
        statusCompanyRegistered: 'Entreprise : enregistrée',
        statusCompanyPending: 'Entreprise : non enregistrée',
        statusCertSent: 'Certificat : envoyé',
        statusCertPending: 'Certificat : en attente',
        nextBtn: 'Suivant : envoyer le certificat',
      },
      certificado: {
        notRegisteredWarning:
          "Enregistrez l'entreprise avant d'envoyer le certificat. Revenez à l'étape {link} et enregistrez l'entreprise d'abord.",
        notRegisteredLink: '1. Entreprise',
        certExpired: 'Certificat expiré le {date}. Veuillez en envoyer un nouveau.',
        certValidUntil: 'Certificat valide jusqu\'au {date}',
        certExpiringSoon: ' — expire dans {days} jour(s).',
        certSent: 'Certificat envoyé.',
        fileLabel: 'Fichier du certificat',
        fileBtn: 'Sélectionner un fichier (.pfx / .p12)',
        nameLabel: 'Nom du certificat (facultatif)',
        namePlaceholder: "Ex. : Certificat de l'entreprise",
        passwordLabel: 'Mot de passe du certificat',
        passwordPlaceholder: 'Mot de passe du fichier .pfx/.p12',
        passwordHint:
          'Utilisez le mot de passe du certificat lui-même, pas le mot de passe du système.',
        showPassword: 'Afficher le mot de passe',
        hidePassword: 'Masquer le mot de passe',
        uploadBtn: 'Envoyer le certificat',
        toasts: {
          noFile: 'Veuillez sélectionner le fichier du certificat.',
          noPassword: 'Veuillez saisir le mot de passe du certificat.',
          invalidFile: 'Le certificat doit être un fichier .pfx ou .p12.',
          uploadSuccess: 'Certificat envoyé avec succès.',
          uploadError: "Échec de l'envoi du certificat.",
          saveError: "Impossible d'enregistrer les données de l'entreprise.",
          saveSuccess: "Données de l'entreprise enregistrées.",
          registerWarning:
            "Données enregistrées, mais l'enregistrement pour émission a échoué : {error}. Vérifiez les données et enregistrez à nouveau.",
        },
      },
      impostos: {
        regime: 'Régime fiscal',
        regimePlaceholder: 'Sélectionnez',
        regimes: {
          simplesNacional: 'Simples Nacional',
          lucroPresumido: 'Bénéfice présumé',
          lucroReal: 'Bénéfice réel',
          mei: 'MEI (Micro-entrepreneur)',
        },
        inscricaoMunicipal: 'Inscription municipale',
        inscricaoEstadual: 'Inscription départementale',
        saveBtn: 'Enregistrer la fiscalité',
        toasts: {
          saveSuccess: 'Paramètres fiscaux enregistrés.',
          saveError: "Impossible d'enregistrer les paramètres fiscaux.",
        },
      },
    },
    // ── Combobox de codes fiscaux (TaxCodeCombobox) ───────────────────────────
    taxCode: {
      selectPlaceholder: 'Sélectionnez un code...',
      searching: 'Recherche en cours...',
      minCharsHint: 'Saisissez au moins {min} caracteres pour lancer la recherche.',
      fetchError: 'Impossible de charger les codes fiscaux pour le moment.',
      retryBtn: 'Réessayer',
      useTypedCode: 'Ou utiliser le code "{code}" saisi',
      emptyResult: 'Aucun code trouvé.',
      useTypedEmpty: 'Touchez pour utiliser "{code}".',
    },
  },
};
