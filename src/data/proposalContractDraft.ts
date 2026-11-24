import { DOMINEX_LEGAL, TERMS_LAST_UPDATED, TERMS_VERSION } from '@/data/termsOfUse';
import type { GenerateProposalPdfInput } from '@/utils/proposalSimulatorPdf';

export interface ProposalContractParagraph {
  number: string;
  text: string;
}

export interface ProposalContractSection {
  number: string;
  title: string;
  paragraphs: ProposalContractParagraph[];
}

export const PROPOSAL_CONTRACT_DRAFT_NOTICE =
  'MINUTA PARA NEGOCIAÇÃO — documento preliminar, sujeito à conferência dos dados, negociação entre as partes e revisão jurídica antes da assinatura.';

function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0).replace(/\u00a0/g, ' ');
}

function unitScope(input: GenerateProposalPdfInput): ProposalContractParagraph[] {
  return input.units.map((unit, index) => ({
    number: `2.${index + 2}`,
    text: `${unit.name}: plano ${unit.planName}, ${unit.users} ${unit.users === 1 ? 'usuário' : 'usuários'} e os seguintes recursos: ${unit.modules.join('; ')}.`,
  }));
}

function commercialTerms(input: GenerateProposalPdfInput): ProposalContractParagraph[] {
  const paragraphs: ProposalContractParagraph[] = [
    {
      number: '3.1',
      text: `Pelo plano anual, a CONTRATANTE pagará ${money(input.totals.yearlyDiscounted)} por ano, conforme a composição comercial desta minuta. O valor anual cheio de referência é ${money(input.totals.yearlyFull)}.`,
    },
  ];

  if (input.showMonthlyPrice !== false) {
    paragraphs.push({
      number: '3.2',
      text: `Como alternativa de contratação mensal, o valor negociado é de ${money(input.totals.monthly)} por mês, em cobrança recorrente.`,
    });
  }

  if (input.showPixInstallments !== false) {
    paragraphs.push({
      number: `3.${paragraphs.length + 1}`,
      text: `Quando escolhida a contratação anual com parcelamento no Pix, o total poderá ser pago em até ${input.totals.installments} parcelas de ${money(input.totals.pixInstallment)}, observadas as datas confirmadas na contratação.`,
    });
  }

  paragraphs.push(
    {
      number: `3.${paragraphs.length + 1}`,
      text: 'A modalidade final de cobrança, vencimento e meio de pagamento serão confirmados no aceite comercial ou instrumento de assinatura. O atraso poderá suspender o acesso até a regularização, sem afastar os valores vencidos.',
    },
    {
      number: `3.${paragraphs.length + 2}`,
      text: 'Os valores consideram o escopo descrito neste documento. Alterações de unidades, usuários, módulos, integrações ou serviços adicionais poderão exigir nova proposta ou aditivo.',
    },
  );

  return paragraphs;
}

export function buildProposalContractSections(
  input: GenerateProposalPdfInput,
): ProposalContractSection[] {
  return [
    {
      number: '1',
      title: 'OBJETO E PARTES',
      paragraphs: [
        {
          number: '1.1',
          text: `${DOMINEX_LEGAL.razaoSocial}, inscrita no CNPJ sob nº ${DOMINEX_LEGAL.cnpj}, doravante CONTRATADA, disponibilizará à pessoa jurídica identificada como ${input.clientName.trim() || 'CONTRATANTE'}, doravante CONTRATANTE, acesso à plataforma Dominex, na modalidade software como serviço (SaaS).`,
        },
        {
          number: '1.2',
          text: 'A plataforma apoia a gestão empresarial conforme os módulos contratados. Ela organiza e armazena informações inseridas pela CONTRATANTE, sem substituir controles internos nem orientação fiscal, contábil, trabalhista, técnica ou jurídica especializada.',
        },
      ],
    },
    {
      number: '2',
      title: 'ESCOPO, UNIDADES, MÓDULOS E USUÁRIOS',
      paragraphs: [
        {
          number: '2.1',
          text: `O escopo comercial compreende ${input.units.length} ${input.units.length === 1 ? 'unidade' : 'unidades'}, conforme detalhamento abaixo.`,
        },
        ...unitScope(input),
        {
          number: `2.${input.units.length + 2}`,
          text: 'Implantações, migrações, customizações, integrações, treinamentos ou serviços não descritos expressamente não integram o preço e dependerão de orçamento ou ajuste específico.',
        },
      ],
    },
    {
      number: '3',
      title: 'VALORES E PAGAMENTO',
      paragraphs: commercialTerms(input),
    },
    {
      number: '4',
      title: 'VIGÊNCIA, RENOVAÇÃO E CANCELAMENTO',
      paragraphs: [
        {
          number: '4.1',
          text: 'A contratação passa a produzir efeitos com o aceite eletrônico, assinatura ou ativação do acesso, prevalecendo o evento que ocorrer primeiro, e seguirá o ciclo de cobrança mensal ou anual escolhido.',
        },
        {
          number: '4.2',
          text: 'A assinatura é recorrente no ciclo contratado até solicitação de cancelamento. O cancelamento interrompe cobranças futuras e não gera devolução proporcional do período vigente já pago, salvo obrigação legal ou acordo escrito entre as partes.',
        },
        {
          number: '4.3',
          text: 'Após o encerramento, a CONTRATANTE deverá exportar os dados que pretenda conservar. A CONTRATADA poderá manter dados pelo prazo necessário ao cumprimento de obrigações legais e, depois, eliminá-los ou anonimizá-los nos termos da legislação aplicável.',
        },
      ],
    },
    {
      number: '5',
      title: 'IMPLANTAÇÃO, SUPORTE E DISPONIBILIDADE',
      paragraphs: [
        {
          number: '5.1',
          text: `O suporte será prestado pelo canal ${DOMINEX_LEGAL.email}, em horário comercial e conforme a disponibilidade da equipe, salvo nível de serviço contratado em instrumento específico.`,
        },
        {
          number: '5.2',
          text: 'A CONTRATADA empregará esforços razoáveis para manter a plataforma disponível, mas não garante operação ininterrupta, ausência absoluta de erros ou disponibilidade de 100%. Poderão ocorrer manutenções, instabilidades e indisponibilidades de fornecedores de infraestrutura ou integrações.',
        },
      ],
    },
    {
      number: '6',
      title: 'RESPONSABILIDADES DA CONTRATANTE',
      paragraphs: [
        {
          number: '6.1',
          text: 'A CONTRATANTE é responsável pela veracidade, licitude, atualização e conferência dos dados e operações registrados, pela gestão das permissões de seus usuários e pela segurança de credenciais e dispositivos de acesso.',
        },
        {
          number: '6.2',
          text: 'Cabe à CONTRATANTE obter as autorizações e bases legais necessárias para inserir e tratar dados de clientes, funcionários, fornecedores, parceiros, prestadores e demais terceiros na plataforma, bem como atender solicitações dos titulares quando atuar como Controladora.',
        },
      ],
    },
    {
      number: '7',
      title: 'CONFIDENCIALIDADE, PRIVACIDADE E PROTEÇÃO DE DADOS',
      paragraphs: [
        {
          number: '7.1',
          text: 'As partes obrigam-se a manter confidencialidade e sigilo sobre informações não públicas conhecidas em razão da contratação, incluindo dados pessoais, comerciais, financeiros, operacionais, técnicos e estratégicos da outra parte ou de seus clientes, funcionários, fornecedores, parceiros, prestadores e demais terceiros.',
        },
        {
          number: '7.2',
          text: 'As informações confidenciais somente poderão ser usadas para execução, suporte, manutenção, segurança e evolução dos serviços contratados, ou para cumprimento de obrigação legal ou regulatória, sendo vedado seu uso para finalidade incompatível ou sua divulgação indevida.',
        },
        {
          number: '7.3',
          text: 'O acesso será limitado a pessoas autorizadas que necessitem das informações para cumprir suas funções. Fornecedores indispensáveis à operação poderão ter acesso estritamente necessário, sujeitos a obrigações de proteção de dados, segurança e confidencialidade compatíveis.',
        },
        {
          number: '7.4',
          text: 'Nos tratamentos de dados pessoais inseridos pela CONTRATANTE, esta atuará como Controladora e a CONTRATADA como Operadora, tratando os dados conforme instruções lícitas, finalidades documentadas e a Lei nº 13.709/2018 (LGPD). Cada parte responderá pelas obrigações que a legislação atribuir ao seu papel.',
        },
        {
          number: '7.5',
          text: 'A CONTRATADA adotará medidas técnicas e administrativas razoáveis e proporcionais aos riscos, incluindo controles de acesso, proteção de credenciais, criptografia em trânsito e em repouso e rotinas de backup. Tais medidas reduzem riscos, mas não representam garantia absoluta contra ataques sofisticados, falhas de terceiros ou força maior.',
        },
        {
          number: '7.6',
          text: 'A CONTRATADA comunicará à CONTRATANTE, sem demora indevida, incidente confirmado sob sua responsabilidade que possa afetar de modo relevante os dados tratados, fornecendo as informações disponíveis para avaliação, contenção e cumprimento das comunicações legais. A CONTRATANTE, como Controladora, decidirá e realizará as comunicações à ANPD e aos titulares quando exigidas, com a cooperação da CONTRATADA.',
        },
        {
          number: '7.7',
          text: `As obrigações de sigilo permanecem enquanto as informações conservarem natureza confidencial e, quanto a dados pessoais, durante todo o tratamento e retenção aplicável. Solicitações de privacidade poderão ser encaminhadas a ${DOMINEX_LEGAL.email}.`,
        },
      ],
    },
    {
      number: '8',
      title: 'PROPRIEDADE INTELECTUAL E TITULARIDADE DOS DADOS',
      paragraphs: [
        {
          number: '8.1',
          text: 'O software, marca, layout, design, funcionalidades, documentação e código da plataforma pertencem à CONTRATADA ou a seus licenciadores. A contratação concede licença limitada, não exclusiva, intransferível e revogável durante a vigência.',
        },
        {
          number: '8.2',
          text: 'Os dados inseridos pela CONTRATANTE permanecem sob sua titularidade ou responsabilidade. A CONTRATADA recebe autorização limitada ao necessário para hospedar, processar, proteger, manter e prestar os serviços contratados.',
        },
      ],
    },
    {
      number: '9',
      title: 'TERMOS DE USO E LIMITAÇÃO DE RESPONSABILIDADE',
      paragraphs: [
        {
          number: '9.1',
          text: `Esta minuta é complementada pelos Termos de Uso do Dominex, versão ${TERMS_VERSION}, atualizados em ${TERMS_LAST_UPDATED}, disponíveis na plataforma e em ${DOMINEX_LEGAL.site}. Em conflito com condição comercial expressamente assinada, prevalecerá o instrumento específico apenas quanto ao ponto conflitante.`,
        },
        {
          number: '9.2',
          text: 'A plataforma é ferramenta de apoio. A CONTRATADA não audita os dados inseridos nem responde por decisões, registros incorretos, falhas de conexão ou de serviços de terceiros, observados os limites da lei e dos Termos de Uso.',
        },
      ],
    },
    {
      number: '10',
      title: 'DISPOSIÇÕES FINAIS E FORO',
      paragraphs: [
        {
          number: '10.1',
          text: 'Comunicações e aceites por meios eletrônicos serão válidos. A tolerância quanto a descumprimento não constitui renúncia, e eventual nulidade de uma disposição não prejudicará as demais.',
        },
        {
          number: '10.2',
          text: `Fica eleito o foro da ${DOMINEX_LEGAL.foro}, com renúncia a qualquer outro, ressalvadas as hipóteses legais de competência obrigatória.`,
        },
      ],
    },
  ];
}
