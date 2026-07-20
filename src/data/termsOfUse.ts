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
 *
 * MULTI-LOCALE: `getTermsSections(locale)` devolve as seções no idioma pedido.
 * pt-br é a fonte da verdade (byte-idêntico ao original). Idioma sem tradução
 * cai no pt-br (fallback defensivo).
 *
 * METADADOS LEGAIS (DOMINEX_LEGAL): NUNCA traduzir — são dados da entidade
 * brasileira (razão social, CNPJ, foro) e permanecem em português em todos os
 * idiomas, pois o contrato é regido pela lei brasileira.
 */

import type { LocaleCode } from '@/lib/i18n/locales';

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
 * Retorna a string no idioma pedido.
 */
export function getTermsMetaLine(locale: LocaleCode = 'pt-br'): string {
  switch (locale) {
    case 'en':
      return `Version ${TERMS_VERSION} · Last updated: ${TERMS_LAST_UPDATED}`;
    case 'es':
      return `Versión ${TERMS_VERSION} · Última actualización: ${TERMS_LAST_UPDATED}`;
    case 'fr':
      return `Version ${TERMS_VERSION} · Dernière mise à jour : ${TERMS_LAST_UPDATED}`;
    default:
      return `Versão ${TERMS_VERSION} · Atualizado pela última vez em: ${TERMS_LAST_UPDATED}`;
  }
}

/**
 * COMPAT: constante original — mantida para não quebrar imports existentes.
 * Sempre devolve o texto em pt-br.
 */
export const TERMS_META_LINE = getTermsMetaLine('pt-br');

/** Subtítulo introdutório curto — retorna no idioma pedido. */
export function getTermsIntro(locale: LocaleCode = 'pt-br'): string {
  switch (locale) {
    case 'en':
      return 'By accessing and using Dominex, you declare that you have read, understood and fully agree to the Terms of Use below.';
    case 'es':
      return 'Al acceder y utilizar Dominex, declaras que has leído, comprendido y aceptas íntegramente los Términos de Uso a continuación.';
    case 'fr':
      return "En accédant à Dominex et en l'utilisant, vous déclarez avoir lu, compris et accepté intégralement les Conditions d'utilisation ci-dessous.";
    default:
      return 'Ao acessar e utilizar o Dominex, você declara que leu, compreendeu e concorda integralmente com os Termos de Uso abaixo.';
  }
}

/**
 * COMPAT: constante original — mantida para não quebrar imports existentes.
 * Sempre devolve o texto em pt-br.
 */
export const TERMS_INTRO = getTermsIntro('pt-br');

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÕES EM PORTUGUÊS (pt-br) — FONTE DA VERDADE — byte-idêntico ao original
// ─────────────────────────────────────────────────────────────────────────────
const TERMS_PT_BR: TermsSection[] = [
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

// ─────────────────────────────────────────────────────────────────────────────
// ENGLISH
// ─────────────────────────────────────────────────────────────────────────────
const TERMS_EN: TermsSection[] = [
  {
    title: '1. SUBJECT MATTER',
    items: [
      {
        subtitle: '1.1.',
        text: '**Dominex** is a digital service-management platform (software as a service — SaaS) for service companies, offering features such as work orders, field team management, customer and equipment registration, financial control, preventive maintenance plans, technical tools, scheduling, contracts and other functionalities available in the system.',
      },
      {
        subtitle: '1.2.',
        text: 'These Terms of Use govern your access to and use of Dominex (the **user**), establishing the rights, obligations and responsibilities of both parties.',
      },
      {
        subtitle: '1.3.',
        text: 'Dominex is a **management support tool**. It organises and stores the information you enter, but does not replace internal processes, tax, accounting or labour controls, or the guidance of qualified professionals.',
      },
    ],
  },
  {
    title: '2. REGISTRATION AND ACCESS',
    items: [
      {
        subtitle: '2.1.',
        text: 'To use Dominex you must create an account with accurate, complete and up-to-date information. You are responsible for the **accuracy and currency** of the details provided.',
      },
      {
        subtitle: '2.2.',
        text: 'Access is personal and non-transferable. You are responsible for **keeping your credentials secure** (email and password) and for all activities carried out under your account.',
      },
      {
        subtitle: '2.3.',
        text: 'Where a company account allows multiple users, it is the company administrator\'s responsibility to authorise who may access the system and to define each person\'s permissions. All access and operations performed by users authorised by the company are the **responsibility of the company itself**.',
      },
      {
        subtitle: '2.4.',
        text: 'You must immediately notify Dominex of any unauthorised use of your account or suspected security breach.',
      },
    ],
  },
  {
    title: '3. USER RESPONSIBILITIES',
    items: [
      {
        subtitle: '3.1.',
        text: 'The user is **solely and fully responsible** for all information entered and all operations recorded in the system, including but not limited to:',
        list: [
          'customer data, equipment records, work orders and other registrations;',
          'financial entries, amounts, charges, payments and receipts;',
          'tax, fiscal and labour obligations related to their business;',
          'verification and validation of figures, calculations and generated reports.',
        ],
      },
      {
        subtitle: '3.2.',
        text: 'The user must use Dominex **in compliance with applicable law**, refraining from any unlawful, fraudulent or third-party-rights-infringing use.',
      },
      {
        subtitle: '3.3.',
        text: 'Dominex **does not validate, audit or monitor** data entered manually by the user. The accuracy of the information is the exclusive responsibility of whoever records it.',
      },
      {
        subtitle: '3.4.',
        text: 'Users are advised to maintain their own **backups and records** of information essential to their operations, without prejudice to the backup routines maintained by Dominex.',
      },
    ],
  },
  {
    title: '4. LIMITATION OF DOMINEX\'S LIABILITY',
    items: [
      {
        subtitle: '4.1.',
        text: 'Dominex is provided **"as is"**, in accordance with the features available at the time of use, without warranties of fitness for purposes beyond those described.',
      },
      {
        subtitle: '4.2.',
        text: 'Dominex **is not liable** for:',
        list: [
          'decisions made by the user based on information or reports from the system;',
          'typing errors, incorrect records or unauthorised changes made by the user or their staff;',
          'losses, lost profits, loss of revenue or data arising from the use of or inability to use the platform;',
          'failures in the user\'s equipment, devices, networks or internet connection;',
          'outages or failures caused by third-party services (internet providers, cloud servers, payment gateways, email services and other integrations).',
        ],
      },
      {
        subtitle: '4.3.',
        text: 'Under no circumstances shall Dominex\'s liability exceed the amounts actually paid by the user for their subscription during the 12 (twelve) months preceding the event giving rise to the claim.',
      },
    ],
  },
  {
    title: '5. TOOLS AND CALCULATORS',
    items: [
      {
        subtitle: '5.1.',
        text: 'The tools, calculators, converters and estimates provided by Dominex are **for informational and auxiliary purposes only**. Results are approximations based on the data entered by the user and the default parameters of each tool.',
      },
      {
        subtitle: '5.2.',
        text: 'These resources **do NOT replace manufacturers\' manuals, catalogues, technical data sheets and instructions**, applicable technical standards (e.g. ABNT, ISO, INMETRO) or the judgement of a qualified professional.',
      },
      {
        subtitle: '5.3.',
        text: 'It is the **exclusive responsibility of the user** to verify and validate any tool or calculator result against official sources (manufacturer\'s manual, current technical standard, licensed engineer or technician) BEFORE applying it in any real-world situation, especially where there is risk to safety, property or persons.',
      },
      {
        subtitle: '5.4.',
        text: 'Dominex **is not liable** for damages, losses, material harm, failures, accidents or decisions made based solely on tool or calculator results, or for use inconsistent with manufacturer specifications.',
      },
      {
        subtitle: '5.5.',
        text: 'The default values, coefficients and tables embedded in the tools may **not reflect the specific model, version or conditions** of the user\'s equipment. It is the user\'s responsibility to adjust parameters and confirm suitability to their specific situation.',
      },
    ],
  },
  {
    title: '6. SYSTEM AVAILABILITY',
    items: [
      {
        subtitle: '6.1.',
        text: 'Dominex makes reasonable efforts to keep the platform available, but **does not guarantee uninterrupted or error-free availability** (100% uptime).',
      },
      {
        subtitle: '6.2.',
        text: 'The system may undergo **scheduled or emergency maintenance** and periods of instability, and may be temporarily unavailable without prior notice when required for urgent fixes.',
      },
      {
        subtitle: '6.3.',
        text: 'The user acknowledges that Dominex\'s operation depends on **third-party services** (hosting, cloud databases, internet providers, email services and payment gateways) and that failures in those services are beyond Dominex\'s control.',
      },
    ],
  },
  {
    title: '7. SECURITY AND PRIVACY (LGPD)',
    items: [
      {
        subtitle: '7.1.',
        text: 'The processing of personal data in Dominex complies with the **Brazilian General Data Protection Law (Lei nº 13.709/2018 — LGPD)**.',
      },
      {
        subtitle: '7.2.',
        text: 'With regard to personal data the user enters on the platform (relating to their customers, employees and third parties), the **user acts as Controller** of that data and **Dominex acts as Processor**, handling it in accordance with the instructions and purposes defined by the user.',
      },
      {
        subtitle: '7.3.',
        text: 'Dominex adopts **reasonable security measures** to protect data, including encryption in transit and at rest, session-based authentication, secure password storage and regular backups. No measure, however, guarantees absolute protection against sophisticated attacks or force majeure events.',
      },
      {
        subtitle: '7.4.',
        text: 'The user is responsible for **keeping their credentials and access devices secure**, as well as for ensuring a lawful basis for processing any third-party data entered on the platform.',
      },
      {
        subtitle: '7.5.',
        text: `Privacy and data protection requests may be sent to **${DOMINEX_LEGAL.email}**.`,
      },
    ],
  },
  {
    title: '8. PAYMENTS AND PLANS',
    items: [
      {
        subtitle: '8.1.',
        text: 'Use of Dominex is subject to the purchase of a **subscription plan**, with recurring charges according to the chosen cycle (monthly or as otherwise agreed at the time of contracting).',
      },
      {
        subtitle: '8.2.',
        text: '**Non-payment** on the due date may result in the **automatic suspension of access** until the account is brought up to date. Suspension for non-payment does not extinguish the obligation to pay outstanding amounts.',
      },
      {
        subtitle: '8.3.',
        text: 'Because this is an **immediately accessible digital service**, amounts already paid for the current period are non-refundable on a pro-rata basis, unless otherwise required by law or agreed between the parties.',
      },
      {
        subtitle: '8.4.',
        text: 'Cancelling the subscription stops future charges but does not entitle the user to a refund of amounts already paid for the current period.',
      },
    ],
  },
  {
    title: '9. SUPPORT',
    items: [
      {
        subtitle: '9.1.',
        text: `User support is provided via **${DOMINEX_LEGAL.email}**, during business hours and subject to team availability.`,
      },
      {
        subtitle: '9.2.',
        text: 'Dominex endeavours to respond promptly, but **does not guarantee a specific response time**, on-call service or emergency support, unless separately contracted by a dedicated instrument.',
      },
    ],
  },
  {
    title: '10. INTELLECTUAL PROPERTY',
    items: [
      {
        subtitle: '10.1.',
        text: `All **software, trademarks, layout, design, features and code** of Dominex are the exclusive property of ${DOMINEX_LEGAL.razaoSocial} (CNPJ ${DOMINEX_LEGAL.cnpj}) or its licensors.`,
      },
      {
        subtitle: '10.2.',
        text: 'The user receives a **limited, non-exclusive, non-transferable and revocable licence** to use the platform in accordance with these Terms, for the duration of the subscription.',
      },
      {
        subtitle: '10.3.',
        text: 'It is **prohibited** to copy, modify, distribute, replicate, sell, license, sublicense or reverse-engineer the system, in whole or in part.',
      },
      {
        subtitle: '10.4.',
        text: '**Data entered by the user remains the property of the user**. The licence granted to Dominex is limited to what is necessary to operate, maintain and improve the platform.',
      },
    ],
  },
  {
    title: '11. ACCOUNT TERMINATION',
    items: [
      {
        subtitle: '11.1.',
        text: 'The user may request **closure of their account** at any time by notifying Dominex.',
      },
      {
        subtitle: '11.2.',
        text: 'Dominex may **suspend or terminate** accounts in the event of non-payment, breach of these Terms, misuse or legal requirement.',
      },
      {
        subtitle: '11.3.',
        text: 'Following termination, data may be **retained for the period required** to fulfil legal obligations and then deleted or anonymised in accordance with the LGPD. Users are responsible for exporting in advance any data they wish to keep.',
      },
    ],
  },
  {
    title: '12. GENERAL PROVISIONS',
    items: [
      {
        subtitle: '12.1.',
        text: 'Dominex may **update these Terms** periodically. Material updates will be **notified via an in-system notice**, and continued use of the platform after publication of changes constitutes **automatic acceptance** of the updated version.',
      },
      {
        subtitle: '12.2.',
        text: 'If any clause of these Terms is found to be invalid or unenforceable, the remaining clauses continue in **full force and effect** (partial invalidity).',
      },
      {
        subtitle: '12.3.',
        text: 'Communications between the parties may be conducted by **electronic means** (email and in-system notices), which shall be valid and effective.',
      },
      {
        subtitle: '12.4.',
        text: 'Tolerance of any breach of a clause shall not constitute waiver or novation, and Dominex may enforce compliance at any time.',
      },
      {
        subtitle: '12.5.',
        text: 'These Terms of Use are **permanently available for reference within the system itself**, and the user may access and download them at any time from the Settings area.',
      },
    ],
  },
  {
    title: '13. GOVERNING LAW AND JURISDICTION',
    items: [
      {
        subtitle: '13.1.',
        text: `The courts of the **${DOMINEX_LEGAL.foro}** (Brazil) are elected as the exclusive jurisdiction for resolving any disputes arising from these Terms, to the exclusion of any other, however privileged.`,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ESPAÑOL
// ─────────────────────────────────────────────────────────────────────────────
const TERMS_ES: TermsSection[] = [
  {
    title: '1. OBJETO',
    items: [
      {
        subtitle: '1.1.',
        text: '**Dominex** es una plataforma digital de gestión para empresas de servicios (software como servicio — SaaS), que ofrece funciones como órdenes de trabajo, gestión de equipos de campo, registro de clientes y equipos, control financiero, planes de mantenimiento preventivo, herramientas técnicas, agenda, contratos y demás funcionalidades disponibles en el sistema.',
      },
      {
        subtitle: '1.2.',
        text: 'Estos Términos de Uso regulan el acceso y el uso de Dominex por parte de usted (el **usuario**), estableciendo los derechos, obligaciones y responsabilidades de ambas partes.',
      },
      {
        subtitle: '1.3.',
        text: 'Dominex es una **herramienta de apoyo a la gestión**. Organiza y almacena la información que usted ingresa, pero no reemplaza procesos internos, controles fiscales, contables, laborales ni la orientación de profesionales habilitados.',
      },
    ],
  },
  {
    title: '2. REGISTRO Y ACCESO',
    items: [
      {
        subtitle: '2.1.',
        text: 'Para usar Dominex es necesario un registro con datos verdaderos, completos y actualizados. Usted es responsable de la **veracidad y actualización** de la información proporcionada.',
      },
      {
        subtitle: '2.2.',
        text: 'El acceso es personal e intransferible. Usted es responsable de **guardar de forma segura** sus credenciales (correo y contraseña) y de todas las actividades realizadas en su cuenta.',
      },
      {
        subtitle: '2.3.',
        text: 'Cuando la cuenta de la empresa permite múltiples usuarios, corresponde al administrador autorizar quién puede acceder y definir los permisos de cada persona. Todo acceso y operación realizado por usuarios autorizados por la empresa es de **responsabilidad de la propia empresa**.',
      },
      {
        subtitle: '2.4.',
        text: 'Usted debe comunicar de inmediato cualquier uso no autorizado de su cuenta o sospecha de vulneración de seguridad.',
      },
    ],
  },
  {
    title: '3. RESPONSABILIDAD DEL USUARIO',
    items: [
      {
        subtitle: '3.1.',
        text: 'El usuario es **íntegramente responsable** de toda la información que ingresa y de las operaciones que registra en el sistema, incluyendo, sin limitarse a:',
        list: [
          'datos de clientes, equipos, órdenes de trabajo y demás registros;',
          'asientos financieros, montos, cobros, pagos y cobros recibidos;',
          'obligaciones fiscales, tributarias y laborales relacionadas con su operación;',
          'verificación y validación de los valores, cálculos e informes generados.',
        ],
      },
      {
        subtitle: '3.2.',
        text: 'El usuario debe utilizar Dominex **de conformidad con la legislación vigente**, absteniéndose de cualquier uso ilícito, fraudulento o que vulnere derechos de terceros.',
      },
      {
        subtitle: '3.3.',
        text: 'Dominex **no valida, no audita ni fiscaliza** los datos ingresados manualmente por el usuario. La exactitud de la información es responsabilidad exclusiva de quien la registra.',
      },
      {
        subtitle: '3.4.',
        text: 'Se recomienda que el usuario mantenga sus propias **copias de seguridad y registros** de la información esencial para su operación, sin perjuicio de las rutinas de respaldo mantenidas por Dominex.',
      },
    ],
  },
  {
    title: '4. LIMITACIÓN DE RESPONSABILIDAD DE DOMINEX',
    items: [
      {
        subtitle: '4.1.',
        text: 'Dominex se proporciona **"tal como está"** (as is), de acuerdo con las funcionalidades disponibles en el momento del uso, sin garantías de idoneidad para fines específicos más allá de los descritos.',
      },
      {
        subtitle: '4.2.',
        text: 'Dominex **no se hace responsable** de:',
        list: [
          'decisiones tomadas por el usuario con base en la información o los informes del sistema;',
          'errores tipográficos, registros incorrectos o modificaciones indebidas realizadas por el usuario o sus colaboradores;',
          'pérdidas, lucro cesante, pérdida de ingresos o de datos derivados del uso o de la imposibilidad de uso de la plataforma;',
          'fallos en equipos, dispositivos, redes o conexión a internet del usuario;',
          'interrupciones o fallos causados por servicios de terceros (proveedores de internet, servidores en la nube, pasarelas de pago, servicios de correo e integraciones).',
        ],
      },
      {
        subtitle: '4.3.',
        text: 'En ningún caso la responsabilidad de Dominex excederá los valores efectivamente pagados por el usuario por la suscripción en los 12 (doce) meses anteriores al evento que originó la reclamación.',
      },
    ],
  },
  {
    title: '5. HERRAMIENTAS Y CALCULADORAS',
    items: [
      {
        subtitle: '5.1.',
        text: 'Las herramientas, calculadoras, conversores y estimaciones disponibles en Dominex tienen carácter **meramente auxiliar e informativo**. Los resultados son aproximaciones basadas en los datos ingresados por el usuario y en los parámetros predeterminados de cada herramienta.',
      },
      {
        subtitle: '5.2.',
        text: 'Estos recursos **NO reemplazan los manuales, catálogos, fichas técnicas e instrucciones de los fabricantes**, ni las normas técnicas aplicables (p. ej. ABNT, ISO, INMETRO) ni el criterio de un profesional calificado.',
      },
      {
        subtitle: '5.3.',
        text: 'Es **responsabilidad exclusiva del usuario** verificar y validar cualquier resultado de las herramientas y calculadoras con las fuentes oficiales (manual del fabricante, norma técnica vigente, ingeniero o técnico habilitado) ANTES de aplicarlo en cualquier situación real, en especial cuando exista riesgo para la seguridad, el patrimonio o las personas.',
      },
      {
        subtitle: '5.4.',
        text: 'Dominex **no se hace responsable** de daños, perjuicios, pérdidas materiales, fallos, accidentes o decisiones tomadas con base exclusiva en los resultados de las herramientas y calculadoras, ni por el uso en desacuerdo con las especificaciones del fabricante.',
      },
      {
        subtitle: '5.5.',
        text: 'Los valores predeterminados, coeficientes y tablas integrados en las herramientas pueden **no reflejar el modelo, la versión o las condiciones específicas** del equipo del usuario. Corresponde al usuario ajustar los parámetros y confirmar la adecuación a su caso concreto.',
      },
    ],
  },
  {
    title: '6. DISPONIBILIDAD DEL SISTEMA',
    items: [
      {
        subtitle: '6.1.',
        text: 'Dominex realiza esfuerzos razonables para mantener la plataforma disponible, pero **no garantiza disponibilidad ininterrumpida ni libre de errores** (100% de uptime).',
      },
      {
        subtitle: '6.2.',
        text: 'El sistema puede someterse a **mantenimientos programados o de emergencia** y a períodos de inestabilidad, pudiendo haber indisponibilidad temporal sin previo aviso cuando sea necesario para correcciones urgentes.',
      },
      {
        subtitle: '6.3.',
        text: 'El usuario reconoce que la operación de Dominex depende de **servicios de terceros** (alojamiento, bases de datos en la nube, proveedores de internet, servicios de correo y pasarelas de pago) y que los fallos en esos servicios están fuera del control de Dominex.',
      },
    ],
  },
  {
    title: '7. SEGURIDAD Y PRIVACIDAD (LGPD)',
    items: [
      {
        subtitle: '7.1.',
        text: 'El tratamiento de datos personales en Dominex cumple con la **Ley General de Protección de Datos de Brasil (Lei nº 13.709/2018 — LGPD)**.',
      },
      {
        subtitle: '7.2.',
        text: 'Respecto a los datos personales que el usuario ingresa en la plataforma (de sus clientes, empleados y terceros), el **usuario actúa como Controlador** de esos datos y **Dominex actúa como Encargado del Tratamiento**, procesándolos conforme a las instrucciones y finalidades definidas por el propio usuario.',
      },
      {
        subtitle: '7.3.',
        text: 'Dominex adopta **medidas de seguridad razonables** para proteger los datos, incluida la cifrado en tránsito y en reposo, autenticación por sesión, almacenamiento seguro de contraseñas y copias de seguridad regulares. Ninguna medida garantiza, sin embargo, protección absoluta contra ataques sofisticados o eventos de fuerza mayor.',
      },
      {
        subtitle: '7.4.',
        text: 'El usuario es responsable de **mantener la seguridad de sus credenciales** y de los dispositivos que utiliza para acceder al sistema, así como de garantizar la base legal para el tratamiento de los datos de terceros que ingresa en la plataforma.',
      },
      {
        subtitle: '7.5.',
        text: `Las solicitudes relacionadas con la privacidad y la protección de datos pueden enviarse a **${DOMINEX_LEGAL.email}**.`,
      },
    ],
  },
  {
    title: '8. PAGOS Y PLANES',
    items: [
      {
        subtitle: '8.1.',
        text: 'El uso de Dominex está sujeto a la contratación de un **plan de suscripción**, con cobro recurrente según el ciclo elegido (mensual u otro previsto en la contratación).',
      },
      {
        subtitle: '8.2.',
        text: 'El **impago** en la fecha de vencimiento podrá acarrear la **suspensión automática del acceso** hasta la regularización. La suspensión por impago no extingue la obligación de pagar los importes adeudados.',
      },
      {
        subtitle: '8.3.',
        text: 'Por tratarse de un **servicio digital de acceso inmediato**, los importes ya pagados correspondientes al período en curso no son reembolsables de forma proporcional, salvo disposición legal contraria o acuerdo específico entre las partes.',
      },
      {
        subtitle: '8.4.',
        text: 'La cancelación de la suscripción interrumpe los cobros futuros, pero no genera devolución de los importes ya pagados por el período vigente.',
      },
    ],
  },
  {
    title: '9. SOPORTE',
    items: [
      {
        subtitle: '9.1.',
        text: `El soporte al usuario se ofrece a través del canal **${DOMINEX_LEGAL.email}**, en horario comercial y según la disponibilidad del equipo.`,
      },
      {
        subtitle: '9.2.',
        text: 'Dominex se esfuerza por responder con agilidad, pero **no garantiza un tiempo de respuesta específico**, guardia permanente ni atención de emergencia, salvo que se contrate por separado mediante instrumento propio.',
      },
    ],
  },
  {
    title: '10. PROPIEDAD INTELECTUAL',
    items: [
      {
        subtitle: '10.1.',
        text: `Todo el **software, marca, diseño, funcionalidades y código** de Dominex son propiedad exclusiva de ${DOMINEX_LEGAL.razaoSocial} (CNPJ ${DOMINEX_LEGAL.cnpj}) o de sus licenciantes.`,
      },
      {
        subtitle: '10.2.',
        text: 'El usuario recibe una **licencia de uso limitada, no exclusiva, intransferible y revocable**, restringida a la utilización de la plataforma conforme a estos Términos, durante la vigencia de la suscripción.',
      },
      {
        subtitle: '10.3.',
        text: 'Queda **prohibido** copiar, modificar, distribuir, replicar, vender, licenciar, sublicenciar o realizar ingeniería inversa del sistema, total o parcialmente.',
      },
      {
        subtitle: '10.4.',
        text: 'Los **datos ingresados por el usuario permanecen bajo la titularidad del usuario**. La licencia otorgada a Dominex se limita a lo necesario para operar, mantener y mejorar la plataforma.',
      },
    ],
  },
  {
    title: '11. CIERRE DE CUENTA',
    items: [
      {
        subtitle: '11.1.',
        text: 'El usuario puede solicitar el **cierre de su cuenta** en cualquier momento, mediante comunicación a Dominex.',
      },
      {
        subtitle: '11.2.',
        text: 'Dominex podrá **suspender o cerrar** cuentas en caso de impago, violación de estos Términos, uso indebido o mandato legal.',
      },
      {
        subtitle: '11.3.',
        text: 'Tras el cierre, los datos podrán **conservarse por el período necesario** para cumplir obligaciones legales y, posteriormente, eliminarse o anonimizarse conforme a la LGPD. Corresponde al usuario exportar previamente los datos que desee preservar.',
      },
    ],
  },
  {
    title: '12. DISPOSICIONES GENERALES',
    items: [
      {
        subtitle: '12.1.',
        text: 'Dominex podrá **actualizar estos Términos** periódicamente. Las actualizaciones relevantes serán **comunicadas mediante aviso dentro del sistema**, y el uso continuado de la plataforma tras la publicación de los cambios implica la **aceptación automática** de la versión actualizada.',
      },
      {
        subtitle: '12.2.',
        text: 'Si alguna cláusula de estos Términos se considera inválida o inaplicable, las demás permanecerán en **plena vigencia** (nulidad parcial).',
      },
      {
        subtitle: '12.3.',
        text: 'Las comunicaciones entre las partes podrán realizarse por **medios electrónicos** (correo y avisos dentro del sistema), que tendrán plena validez y eficacia.',
      },
      {
        subtitle: '12.4.',
        text: 'La tolerancia ante el incumplimiento de cualquier cláusula no implica renuncia ni novación, pudiendo Dominex exigir su cumplimiento en cualquier momento.',
      },
      {
        subtitle: '12.5.',
        text: 'Estos Términos de Uso están **permanentemente disponibles para consulta dentro del propio sistema**, y el usuario puede acceder a ellos y descargarlos en cualquier momento desde el área de Configuración.',
      },
    ],
  },
  {
    title: '13. JURISDICCIÓN',
    items: [
      {
        subtitle: '13.1.',
        text: `Se elige el foro de la **${DOMINEX_LEGAL.foro}** (Brasil) para dirimir cualquier controversia derivada de estos Términos, con renuncia a cualquier otro, por más privilegiado que sea.`,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FRANÇAIS
// Note: toutes les chaînes françaises utilisent des guillemets doubles ou des
// backticks pour éviter tout conflit avec les apostrophes françaises dans le
// contenu. Les apostrophes droites (') dans les strings template sont échappées.
// ─────────────────────────────────────────────────────────────────────────────
const TERMS_FR: TermsSection[] = [
  {
    title: '1. OBJET',
    items: [
      {
        subtitle: '1.1.',
        text: "**Dominex** est une plateforme numérique de gestion pour les entreprises de services (logiciel en tant que service — SaaS), proposant des fonctionnalités telles que les bons de travail, la gestion des équipes sur le terrain, l'enregistrement des clients et des équipements, le contrôle financier, les plans de maintenance préventive, les outils techniques, l'agenda, les contrats et les autres fonctionnalités disponibles dans le système.",
      },
      {
        subtitle: '1.2.',
        text: "Les présentes Conditions d'utilisation régissent votre accès à Dominex et votre utilisation de celui-ci (l'**utilisateur**), en établissant les droits, obligations et responsabilités des deux parties.",
      },
      {
        subtitle: '1.3.',
        text: "Dominex est un **outil d'aide à la gestion**. Il organise et stocke les informations que vous saisissez, mais ne remplace pas les processus internes, les contrôles fiscaux, comptables ou sociaux, ni les conseils de professionnels qualifiés.",
      },
    ],
  },
  {
    title: '2. INSCRIPTION ET ACCÈS',
    items: [
      {
        subtitle: '2.1.',
        text: "Pour utiliser Dominex, vous devez créer un compte avec des informations exactes, complètes et à jour. Vous êtes responsable de l'**exactitude et de la mise à jour** des informations fournies.",
      },
      {
        subtitle: '2.2.',
        text: "L'accès est personnel et non transférable. Vous êtes responsable de la **sécurité de vos identifiants** (adresse e-mail et mot de passe) et de toutes les activités effectuées sous votre compte.",
      },
      {
        subtitle: '2.3.',
        text: "Lorsque le compte de l'entreprise permet plusieurs utilisateurs, il incombe à l'administrateur d'autoriser les accès et de définir les permissions de chaque personne. Tout accès et toute opération effectués par des utilisateurs autorisés par l'entreprise relèvent de la **responsabilité de l'entreprise elle-même**.",
      },
      {
        subtitle: '2.4.',
        text: "Vous devez signaler immédiatement toute utilisation non autorisée de votre compte ou toute suspicion de violation de sécurité.",
      },
    ],
  },
  {
    title: "3. RESPONSABILITÉS DE L'UTILISATEUR",
    items: [
      {
        subtitle: '3.1.',
        text: "L'utilisateur est **entièrement responsable** de toutes les informations saisies et de toutes les opérations enregistrées dans le système, y compris, sans s'y limiter :",
        list: [
          "données clients, équipements, bons de travail et autres enregistrements ;",
          "saisies financières, montants, factures, paiements et encaissements ;",
          "obligations fiscales, sociales et en matière de travail liées à son activité ;",
          "vérification et validation des chiffres, calculs et rapports générés.",
        ],
      },
      {
        subtitle: '3.2.',
        text: "L'utilisateur doit utiliser Dominex **en conformité avec la législation en vigueur**, en s'abstenant de tout usage illicite, frauduleux ou portant atteinte aux droits de tiers.",
      },
      {
        subtitle: '3.3.',
        text: "Dominex **ne valide, n'audite ni ne contrôle** les données saisies manuellement par l'utilisateur. L'exactitude des informations relève de la responsabilité exclusive de celui qui les enregistre.",
      },
      {
        subtitle: '3.4.',
        text: "Il est recommandé à l'utilisateur de conserver ses propres **sauvegardes et enregistrements** des informations essentielles à son activité, sans préjudice des routines de sauvegarde maintenues par Dominex.",
      },
    ],
  },
  {
    title: '4. LIMITATION DE RESPONSABILITÉ DE DOMINEX',
    items: [
      {
        subtitle: '4.1.',
        text: 'Dominex est fourni **"en l\'état"** (as is), selon les fonctionnalités disponibles au moment de l\'utilisation, sans garantie d\'adéquation à des fins spécifiques au-delà de celles décrites.',
      },
      {
        subtitle: '4.2.',
        text: "Dominex **n'est pas responsable** de :",
        list: [
          "décisions prises par l'utilisateur sur la base des informations ou rapports du système ;",
          "erreurs de saisie, enregistrements incorrects ou modifications indues effectués par l'utilisateur ou ses collaborateurs ;",
          "pertes, manques à gagner, perte de revenus ou de données résultant de l'utilisation ou de l'impossibilité d'utiliser la plateforme ;",
          "défaillances des équipements, appareils, réseaux ou connexion internet de l'utilisateur ;",
          "interruptions ou défaillances causées par des services tiers (fournisseurs d'accès, serveurs cloud, passerelles de paiement, services d'e-mail et autres intégrations).",
        ],
      },
      {
        subtitle: '4.3.',
        text: "En aucun cas la responsabilité de Dominex ne pourra excéder les sommes effectivement payées par l'utilisateur pour son abonnement au cours des 12 (douze) mois précédant l'événement à l'origine du litige.",
      },
    ],
  },
  {
    title: '5. OUTILS ET CALCULATEURS',
    items: [
      {
        subtitle: '5.1.',
        text: "Les outils, calculateurs, convertisseurs et estimations mis à disposition par Dominex ont un caractère **purement auxiliaire et informatif**. Les résultats sont des approximations basées sur les données saisies par l'utilisateur et les paramètres par défaut de chaque outil.",
      },
      {
        subtitle: '5.2.',
        text: "Ces ressources **NE remplacent PAS les manuels, catalogues, fiches techniques et instructions des fabricants**, ni les normes techniques applicables (p. ex. ABNT, ISO, INMETRO) ni le jugement d'un professionnel qualifié.",
      },
      {
        subtitle: '5.3.',
        text: "Il est de la **responsabilité exclusive de l'utilisateur** de vérifier et valider tout résultat fourni par les outils et calculateurs auprès des sources officielles (manuel du fabricant, norme technique en vigueur, ingénieur ou technicien habilité) AVANT de l'appliquer dans toute situation réelle, en particulier en cas de risque pour la sécurité, le patrimoine ou les personnes.",
      },
      {
        subtitle: '5.4.',
        text: "Dominex **n'est pas responsable** des dommages, préjudices, pertes matérielles, défaillances, accidents ou décisions pris sur la seule base des résultats des outils et calculateurs, ni d'une utilisation contraire aux spécifications du fabricant.",
      },
      {
        subtitle: '5.5.',
        text: "Les valeurs par défaut, coefficients et tableaux intégrés dans les outils peuvent **ne pas refléter le modèle, la version ou les conditions spécifiques** de l'équipement de l'utilisateur. Il appartient à l'utilisateur d'ajuster les paramètres et de confirmer l'adéquation à sa situation concrète.",
      },
    ],
  },
  {
    title: '6. DISPONIBILITÉ DU SYSTÈME',
    items: [
      {
        subtitle: '6.1.',
        text: "Dominex met en oeuvre des efforts raisonnables pour maintenir la plateforme disponible, mais **ne garantit pas une disponibilité ininterrompue ou sans erreur** (100% de temps de fonctionnement).",
      },
      {
        subtitle: '6.2.',
        text: "Le système peut faire l'objet de **maintenances planifiées ou d'urgence** et de périodes d'instabilité ; il peut être temporairement indisponible sans préavis lorsque cela est nécessaire pour des corrections urgentes.",
      },
      {
        subtitle: '6.3.',
        text: "L'utilisateur reconnaît que le fonctionnement de Dominex dépend de **services tiers** (hébergement, bases de données cloud, fournisseurs d'accès, services d'e-mail et passerelles de paiement) et que les défaillances de ces services échappent au contrôle de Dominex.",
      },
    ],
  },
  {
    title: '7. SÉCURITÉ ET PROTECTION DES DONNÉES (LGPD)',
    items: [
      {
        subtitle: '7.1.',
        text: "Le traitement des données personnelles dans Dominex est conforme à la **Loi générale sur la protection des données du Brésil (Lei nº 13.709/2018 — LGPD)**.",
      },
      {
        subtitle: '7.2.',
        text: "En ce qui concerne les données personnelles que l'utilisateur saisit sur la plateforme (relatives à ses clients, employés et tiers), l'**utilisateur agit en tant que Responsable du traitement** de ces données et **Dominex agit en tant que Sous-traitant**, les traitant conformément aux instructions et finalités définies par l'utilisateur lui-même.",
      },
      {
        subtitle: '7.3.',
        text: "Dominex adopte des **mesures de sécurité raisonnables** pour protéger les données, notamment le chiffrement en transit et au repos, l'authentification par session, le stockage sécurisé des mots de passe et des sauvegardes régulières. Aucune mesure ne garantit toutefois une protection absolue contre des attaques sophistiquées ou des événements de force majeure.",
      },
      {
        subtitle: '7.4.',
        text: "L'utilisateur est responsable de la **sécurité de ses identifiants** et des appareils qu'il utilise pour accéder au système, ainsi que de s'assurer d'une base légale pour le traitement des données de tiers qu'il saisit sur la plateforme.",
      },
      {
        subtitle: '7.5.',
        text: `Les demandes relatives à la confidentialité et à la protection des données peuvent être adressées à **${DOMINEX_LEGAL.email}**.`,
      },
    ],
  },
  {
    title: '8. PAIEMENTS ET PLANS',
    items: [
      {
        subtitle: '8.1.',
        text: "L'utilisation de Dominex est soumise à la souscription d'un **plan d'abonnement**, avec facturation récurrente selon le cycle choisi (mensuel ou autre prévu lors de la souscription).",
      },
      {
        subtitle: '8.2.',
        text: "Le **non-paiement** à la date d'échéance peut entraîner la **suspension automatique de l'accès** jusqu'à régularisation. La suspension pour non-paiement n'éteint pas l'obligation de régler les sommes dues.",
      },
      {
        subtitle: '8.3.',
        text: "S'agissant d'un **service numérique à accès immédiat**, les sommes déjà payées pour la période en cours ne sont pas remboursables au prorata, sauf disposition légale contraire ou accord spécifique entre les parties.",
      },
      {
        subtitle: '8.4.',
        text: "La résiliation de l'abonnement met fin aux prélèvements futurs, mais ne donne pas lieu au remboursement des sommes déjà payées pour la période en cours.",
      },
    ],
  },
  {
    title: '9. SUPPORT',
    items: [
      {
        subtitle: '9.1.',
        text: `Le support utilisateur est accessible via **${DOMINEX_LEGAL.email}**, pendant les heures ouvrables et selon la disponibilité de l'équipe.`,
      },
      {
        subtitle: '9.2.',
        text: "Dominex s'efforce de répondre rapidement, mais **ne garantit pas de délai de réponse spécifique**, ni de permanence ni de support d'urgence, sauf s'ils sont contractés séparément par un instrument dédié.",
      },
    ],
  },
  {
    title: '10. PROPRIÉTÉ INTELLECTUELLE',
    items: [
      {
        subtitle: '10.1.',
        text: `L'ensemble des **logiciels, marques, mises en page, conceptions, fonctionnalités et codes** de Dominex sont la propriété exclusive de ${DOMINEX_LEGAL.razaoSocial} (CNPJ ${DOMINEX_LEGAL.cnpj}) ou de ses concédants de licence.`,
      },
      {
        subtitle: '10.2.',
        text: "L'utilisateur reçoit une **licence d'utilisation limitée, non exclusive, non transférable et révocable**, limitée à l'utilisation de la plateforme conformément aux présentes Conditions, pour la durée de l'abonnement.",
      },
      {
        subtitle: '10.3.',
        text: "Il est **interdit** de copier, modifier, distribuer, reproduire, vendre, concéder sous licence, sous-licencier ou procéder à l'ingénierie inverse du système, en tout ou en partie.",
      },
      {
        subtitle: '10.4.',
        text: "Les **données saisies par l'utilisateur restent la propriété de l'utilisateur**. La licence accordée à Dominex se limite à ce qui est nécessaire pour exploiter, maintenir et améliorer la plateforme.",
      },
    ],
  },
  {
    title: '11. RÉSILIATION DU COMPTE',
    items: [
      {
        subtitle: '11.1.',
        text: "L'utilisateur peut demander la **clôture de son compte** à tout moment, en informant Dominex.",
      },
      {
        subtitle: '11.2.',
        text: "Dominex peut **suspendre ou résilier** des comptes en cas de non-paiement, de violation des présentes Conditions, d'utilisation abusive ou d'exigence légale.",
      },
      {
        subtitle: '11.3.',
        text: "Après la clôture, les données pourront être **conservées pendant la période nécessaire** pour satisfaire aux obligations légales, puis supprimées ou anonymisées conformément à la LGPD. Il appartient à l'utilisateur d'exporter au préalable les données qu'il souhaite conserver.",
      },
    ],
  },
  {
    title: '12. DISPOSITIONS GÉNÉRALES',
    items: [
      {
        subtitle: '12.1.',
        text: "Dominex peut **mettre à jour les présentes Conditions** périodiquement. Les mises à jour importantes seront **notifiées par un avis dans le système**, et la poursuite de l'utilisation de la plateforme après publication des modifications vaut **acceptation automatique** de la version mise à jour.",
      },
      {
        subtitle: '12.2.',
        text: "Si une clause des présentes Conditions est jugée invalide ou inapplicable, les autres clauses restent en **pleine vigueur** (nullité partielle).",
      },
      {
        subtitle: '12.3.',
        text: "Les communications entre les parties pourront être effectuées par **voie électronique** (e-mail et avis dans le système), qui auront pleine valeur et efficacité.",
      },
      {
        subtitle: '12.4.',
        text: "La tolérance à l'égard du non-respect d'une clause ne constitue pas une renonciation ni une novation, Dominex pouvant en exiger le respect à tout moment.",
      },
      {
        subtitle: '12.5.',
        text: "Les présentes Conditions d'utilisation sont **disponibles en permanence pour consultation dans le système lui-même**, et l'utilisateur peut y accéder et les télécharger à tout moment depuis la section Paramètres.",
      },
    ],
  },
  {
    title: '13. JURIDICTION',
    items: [
      {
        subtitle: '13.1.',
        text: `Le tribunal de la **${DOMINEX_LEGAL.foro}** (Brésil) est élu comme juridiction exclusive pour résoudre tout litige découlant des présentes Conditions, à l'exclusion de tout autre, si privilégié soit-il.`,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// API PÚBLICA — getTermsSections(locale)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna as seções dos Termos de Uso no idioma pedido.
 * Fallback: idioma sem tradução cai no pt-br.
 */
export function getTermsSections(locale: LocaleCode = 'pt-br'): TermsSection[] {
  switch (locale) {
    case 'en':
      return TERMS_EN;
    case 'es':
      return TERMS_ES;
    case 'fr':
      return TERMS_FR;
    default:
      return TERMS_PT_BR;
  }
}

/**
 * COMPAT: constante original — mantida para não quebrar imports existentes.
 * Componentes novos devem usar `getTermsSections(locale)`.
 */
export const TERMS_SECTIONS: TermsSection[] = TERMS_PT_BR;
