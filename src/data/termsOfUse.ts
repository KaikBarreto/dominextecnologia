/**
 * ⚠️ ATENÇÃO — RASCUNHO JURÍDICO (NÃO VALIDADO)
 * ───────────────────────────────────────────────────────────────────────────
 * Este texto é um RASCUNHO redigido para fins de produto. Ele NÃO substitui a
 * análise de um advogado e DEVE ser revisado e aprovado pelo responsável legal
 * do Dominex ANTES de ir para produção. As cláusulas foram escritas para
 * resguardar o Dominex, mas a redação final precisa de validação jurídica.
 *
 * FONTE ÚNICA: este arquivo é consumido tanto pelo modal de Termos de Uso
 * (src/components/TermsOfServiceModal.tsx) quanto pelo gerador de PDF
 * (src/utils/termsOfUsePdfGenerator.ts). Qualquer mudança de conteúdo é feita
 * AQUI e reflete automaticamente nas duas saídas (tela e PDF).
 *
 * NEGRITO INLINE: use `**texto**` dentro de `text` e dos itens de `list` para
 * marcar trechos em negrito. Tanto o JSX quanto o jsPDF interpretam esse marcador.
 */

export type TermsItem = {
  /** Numeração da cláusula (ex.: "1.1.", "5.3."). Opcional. */
  subtitle?: string;
  /** Parágrafo principal do item. Aceita **negrito inline**. */
  text?: string;
  /** Itens de lista com marcador. Cada item aceita **negrito inline**. */
  list?: string[];
};

export type TermsSection = {
  title: string;
  items: TermsItem[];
};

/** Metadados jurídicos canônicos do Dominex (NUNCA usar dados de outra marca). */
export const DOMINEX_LEGAL = {
  razaoSocial: 'DOMINEX TECNOLOGIA LTDA',
  cnpj: '66.730.202/0001-05',
  site: 'www.dominex.app',
  email: 'suporte@dominex.app',
  foro: 'Comarca do Rio de Janeiro — RJ',
} as const;

export const TERMS_VERSION = '1.0';
/**
 * Data da última revisão do TEXTO destes Termos (formato DD/MM/YYYY).
 * Atualize SEMPRE que o conteúdo das cláusulas mudar (junto com TERMS_VERSION).
 */
export const TERMS_LAST_UPDATED = '15/06/2026';

/**
 * Linha única de metadados (versão + data) exibida na tela e no PDF.
 * Fonte única: tela e PDF leem a MESMA string pra nunca divergirem.
 */
export const TERMS_META_LINE = `Versão ${TERMS_VERSION} · Atualizado pela última vez em: ${TERMS_LAST_UPDATED}`;

/** Subtítulo introdutório curto (centralizado na tela e no PDF). */
export const TERMS_INTRO =
  'Ao acessar e utilizar o Dominex, você declara que leu, compreendeu e concorda integralmente com os Termos de Uso abaixo.';

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: '1. OBJETO',
    items: [
      {
        subtitle: '1.1.',
        text: 'O **Dominex** é uma plataforma digital (software como serviço — SaaS) de gestão para empresas de serviços, oferecendo recursos como ordens de serviço, gestão de equipes de campo, cadastro de clientes e equipamentos, controle financeiro, PMOC, ferramentas técnicas, agenda, contratos e demais funcionalidades disponíveis no sistema.',
      },
      {
        subtitle: '1.2.',
        text: 'Estes Termos de Uso regulam o acesso e a utilização do Dominex por você (o **usuário**), estabelecendo direitos, deveres e responsabilidades de ambas as partes.',
      },
      {
        subtitle: '1.3.',
        text: 'O Dominex é uma **ferramenta de apoio à gestão**. Ele organiza e armazena as informações que você insere, mas não substitui processos internos, controles fiscais, contábeis, trabalhistas ou a orientação de profissionais habilitados.',
      },
    ],
  },
  {
    title: '2. CADASTRO E ACESSO',
    items: [
      {
        subtitle: '2.1.',
        text: 'Para usar o Dominex é necessário um cadastro com dados verdadeiros, completos e atualizados. Você é responsável pela **veracidade e atualização** das informações fornecidas.',
      },
      {
        subtitle: '2.2.',
        text: 'O acesso é pessoal e intransferível. Você é responsável por **guardar com segurança** suas credenciais (e-mail e senha) e por todas as atividades realizadas em sua conta.',
      },
      {
        subtitle: '2.3.',
        text: 'Quando a conta da empresa permite múltiplos usuários, cabe ao administrador da empresa autorizar quem pode acessar e definir as permissões de cada pessoa. Todo acesso e operação feitos por usuários autorizados pela empresa são de **responsabilidade da própria empresa**.',
      },
      {
        subtitle: '2.4.',
        text: 'Você deve comunicar imediatamente qualquer uso não autorizado da sua conta ou suspeita de violação de segurança.',
      },
    ],
  },
  {
    title: '3. RESPONSABILIDADE DO USUÁRIO',
    items: [
      {
        subtitle: '3.1.',
        text: 'O usuário é **integralmente responsável** por todas as informações que insere e pelas operações que registra no sistema, incluindo, sem se limitar a:',
        list: [
          'dados de clientes, equipamentos, ordens de serviço e demais cadastros;',
          'lançamentos financeiros, valores, cobranças, pagamentos e recebimentos;',
          'obrigações fiscais, tributárias e trabalhistas relacionadas à sua operação;',
          'conferência e validação dos valores, cálculos e relatórios gerados.',
        ],
      },
      {
        subtitle: '3.2.',
        text: 'O usuário deve utilizar o Dominex em **conformidade com a legislação vigente**, abstendo-se de qualquer uso ilícito, fraudulento ou que viole direitos de terceiros.',
      },
      {
        subtitle: '3.3.',
        text: 'O Dominex **não valida, não audita e não fiscaliza** os dados inseridos manualmente pelo usuário. A correção das informações é responsabilidade exclusiva de quem as registra.',
      },
      {
        subtitle: '3.4.',
        text: 'Recomenda-se que o usuário mantenha seus próprios **backups e registros** das informações essenciais à sua operação, sem prejuízo das rotinas de backup mantidas pelo Dominex.',
      },
    ],
  },
  {
    title: '4. LIMITAÇÃO DE RESPONSABILIDADE DO DOMINEX',
    items: [
      {
        subtitle: '4.1.',
        text: 'O Dominex é fornecido **"no estado em que se encontra"** (as is), de acordo com as funcionalidades disponíveis no momento do uso, sem garantias de adequação a finalidades específicas além das descritas.',
      },
      {
        subtitle: '4.2.',
        text: 'O Dominex **não se responsabiliza** por:',
        list: [
          'decisões tomadas pelo usuário com base nas informações ou relatórios do sistema;',
          'erros de digitação, registros incorretos ou alterações indevidas feitas pelo usuário ou por seus colaboradores;',
          'prejuízos, lucros cessantes, perda de receita ou de dados decorrentes do uso ou da impossibilidade de uso da plataforma;',
          'falhas em equipamentos, dispositivos, redes ou conexão de internet do usuário;',
          'indisponibilidades ou falhas causadas por serviços de terceiros (provedores de internet, servidores em nuvem, gateways de pagamento, serviços de e-mail e demais integrações).',
        ],
      },
      {
        subtitle: '4.3.',
        text: 'Em nenhuma hipótese a responsabilidade do Dominex excederá os valores efetivamente pagos pelo usuário pela assinatura nos 12 (doze) meses anteriores ao evento que originou a reclamação.',
      },
    ],
  },
  {
    title: '5. FERRAMENTAS E CALCULADORAS',
    items: [
      {
        subtitle: '5.1.',
        text: 'As ferramentas, calculadoras, conversores e estimativas disponibilizados pelo Dominex têm caráter **meramente auxiliar e informativo**. Os resultados são aproximações baseadas nos dados inseridos pelo usuário e nos parâmetros padrão da ferramenta.',
      },
      {
        subtitle: '5.2.',
        text: 'Tais recursos **NÃO substituem os manuais, catálogos, fichas técnicas e instruções dos fabricantes**, tampouco as normas técnicas aplicáveis (p. ex. ABNT, ISO, INMETRO) ou o julgamento de um profissional qualificado.',
      },
      {
        subtitle: '5.3.',
        text: 'É **responsabilidade exclusiva do usuário** conferir e validar qualquer resultado das ferramentas e calculadoras junto às fontes oficiais (manual do fabricante, norma técnica vigente, engenheiro ou técnico habilitado) ANTES de aplicá-lo em qualquer situação real, sobretudo quando houver risco à segurança, ao patrimônio ou a pessoas.',
      },
      {
        subtitle: '5.4.',
        text: 'O Dominex **não se responsabiliza** por danos, prejuízos, perdas materiais, falhas, acidentes ou decisões tomadas com base exclusiva nos resultados das ferramentas e calculadoras, nem por uso em desacordo com as especificações do fabricante.',
      },
      {
        subtitle: '5.5.',
        text: 'Os valores padrão, coeficientes e tabelas embutidos nas ferramentas podem **não refletir o modelo, a versão ou as condições específicas** do equipamento do usuário. Cabe ao usuário ajustar os parâmetros e confirmar a adequação ao seu caso concreto.',
      },
    ],
  },
  {
    title: '6. DISPONIBILIDADE DO SISTEMA',
    items: [
      {
        subtitle: '6.1.',
        text: 'O Dominex emprega esforços razoáveis para manter a plataforma disponível, mas **não garante disponibilidade ininterrupta ou livre de erros** (100% de uptime).',
      },
      {
        subtitle: '6.2.',
        text: 'O sistema pode passar por **manutenções programadas ou emergenciais** e por períodos de instabilidade, podendo haver indisponibilidade temporária sem aviso prévio quando necessário para correções urgentes.',
      },
      {
        subtitle: '6.3.',
        text: 'O usuário reconhece que a operação do Dominex depende de **serviços de terceiros** (hospedagem, banco de dados em nuvem, provedores de internet, serviços de e-mail e gateways de pagamento) e que falhas nesses serviços estão fora do controle do Dominex.',
      },
    ],
  },
  {
    title: '7. SEGURANÇA E PRIVACIDADE (LGPD)',
    items: [
      {
        subtitle: '7.1.',
        text: 'O tratamento de dados pessoais no Dominex observa a **Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD)**.',
      },
      {
        subtitle: '7.2.',
        text: 'Em relação aos dados pessoais que o usuário insere na plataforma (de seus clientes, funcionários e terceiros), o **usuário atua como Controlador** desses dados e o **Dominex atua como Operador**, tratando-os conforme as instruções e finalidades definidas pelo próprio usuário.',
      },
      {
        subtitle: '7.3.',
        text: 'O Dominex adota **medidas de segurança razoáveis** para proteger os dados, incluindo criptografia em trânsito e em repouso, autenticação por sessão, armazenamento seguro de senhas e backups regulares. Nenhuma medida, contudo, garante proteção absoluta contra ataques sofisticados ou eventos de força maior.',
      },
      {
        subtitle: '7.4.',
        text: 'O usuário é responsável por **manter a segurança de suas credenciais** e dos dispositivos que utiliza para acessar o sistema, bem como por garantir base legal para o tratamento dos dados de terceiros que insere na plataforma.',
      },
      {
        subtitle: '7.5.',
        text: `Solicitações relacionadas à privacidade e à proteção de dados podem ser encaminhadas para **${DOMINEX_LEGAL.email}**.`,
      },
    ],
  },
  {
    title: '8. PAGAMENTOS E PLANOS',
    items: [
      {
        subtitle: '8.1.',
        text: 'O uso do Dominex está sujeito à contratação de um **plano de assinatura**, com cobrança recorrente conforme o ciclo escolhido (mensal ou outro previsto na contratação).',
      },
      {
        subtitle: '8.2.',
        text: 'O **não pagamento** na data de vencimento poderá acarretar a **suspensão automática do acesso** até a regularização. A suspensão por inadimplência não exclui a obrigação de pagar os valores devidos.',
      },
      {
        subtitle: '8.3.',
        text: 'Por se tratar de **serviço digital de acesso imediato**, os valores já pagos relativos a período em curso não são reembolsáveis de forma proporcional, salvo disposição legal em contrário ou acordo específico entre as partes.',
      },
      {
        subtitle: '8.4.',
        text: 'O cancelamento da assinatura interrompe as cobranças futuras, mas não gera devolução de valores já pagos pelo período vigente.',
      },
    ],
  },
  {
    title: '9. SUPORTE',
    items: [
      {
        subtitle: '9.1.',
        text: `O suporte ao usuário é oferecido pelo canal **${DOMINEX_LEGAL.email}**, em horário comercial e conforme a disponibilidade da equipe.`,
      },
      {
        subtitle: '9.2.',
        text: 'O Dominex empenha-se em responder com agilidade, mas **não garante um tempo de resposta específico**, plantão ou atendimento emergencial, salvo se contratado à parte por instrumento próprio.',
      },
    ],
  },
  {
    title: '10. PROPRIEDADE INTELECTUAL',
    items: [
      {
        subtitle: '10.1.',
        text: `Todo o **software, marca, layout, design, funcionalidades e código** do Dominex são de propriedade exclusiva da ${DOMINEX_LEGAL.razaoSocial} (CNPJ ${DOMINEX_LEGAL.cnpj}) ou de seus licenciadores.`,
      },
      {
        subtitle: '10.2.',
        text: 'O usuário recebe uma **licença de uso limitada, não exclusiva, intransferível e revogável**, restrita à utilização da plataforma conforme estes Termos, durante a vigência da assinatura.',
      },
      {
        subtitle: '10.3.',
        text: 'É **proibido** copiar, modificar, distribuir, replicar, vender, licenciar, sublicenciar ou fazer engenharia reversa do sistema, no todo ou em parte.',
      },
      {
        subtitle: '10.4.',
        text: 'Os **dados inseridos pelo usuário permanecem de titularidade do usuário**. A licença concedida ao Dominex limita-se ao necessário para operar, manter e melhorar a plataforma.',
      },
    ],
  },
  {
    title: '11. ENCERRAMENTO DE CONTA',
    items: [
      {
        subtitle: '11.1.',
        text: 'O usuário pode solicitar o **encerramento de sua conta** a qualquer momento, mediante comunicação ao Dominex.',
      },
      {
        subtitle: '11.2.',
        text: 'O Dominex poderá **suspender ou encerrar** contas em caso de inadimplência, violação destes Termos, uso indevido ou determinação legal.',
      },
      {
        subtitle: '11.3.',
        text: 'Após o encerramento, os dados poderão ser **mantidos pelo período necessário** ao cumprimento de obrigações legais e, em seguida, eliminados ou anonimizados, conforme a LGPD. Cabe ao usuário exportar previamente os dados que deseja preservar.',
      },
    ],
  },
  {
    title: '12. DISPOSIÇÕES GERAIS',
    items: [
      {
        subtitle: '12.1.',
        text: 'O Dominex poderá **atualizar estes Termos** periodicamente. As atualizações relevantes serão **informadas por meio de aviso dentro do sistema**, e o uso continuado da plataforma após a publicação das alterações implica **aceite automático** da versão atualizada.',
      },
      {
        subtitle: '12.2.',
        text: 'Caso qualquer cláusula destes Termos seja considerada inválida ou inexequível, as demais permanecem em **pleno vigor** (nulidade parcial).',
      },
      {
        subtitle: '12.3.',
        text: 'As comunicações entre as partes poderão ser feitas por **meios eletrônicos** (e-mail e avisos dentro do sistema), que terão validade e eficácia.',
      },
      {
        subtitle: '12.4.',
        text: 'A tolerância quanto ao descumprimento de qualquer cláusula não significa renúncia ou novação, podendo o Dominex exigir seu cumprimento a qualquer tempo.',
      },
      {
        subtitle: '12.5.',
        text: 'Estes Termos de Uso ficam **permanentemente disponíveis para consulta dentro do próprio sistema**, podendo o usuário acessá-los e baixá-los a qualquer momento na área de Configurações.',
      },
    ],
  },
  {
    title: '13. FORO',
    items: [
      {
        subtitle: '13.1.',
        text: `Fica eleito o foro da **${DOMINEX_LEGAL.foro}** para dirimir quaisquer controvérsias decorrentes destes Termos, com renúncia a qualquer outro, por mais privilegiado que seja.`,
      },
    ],
  },
];
