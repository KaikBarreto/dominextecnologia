import { useState, useMemo } from 'react';
import { Search, History, Sparkles, Wrench, Bug, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { APP_VERSION } from '@/config/version';
import { cn } from '@/lib/utils';

type ChangeCategory = 'recurso' | 'melhoria' | 'correcao' | 'seguranca';

interface Change {
  title: string;
  description: string;
  category: ChangeCategory;
}

interface ChangelogEntry {
  version: string;
  date: string;
  type: 'major' | 'minor' | 'patch';
  changes: Change[];
}

const categoryConfig: Record<ChangeCategory, { label: string; icon: any; className: string }> = {
  recurso: { label: 'Nova Funcionalidade', icon: Sparkles, className: 'bg-success text-white hover:bg-success' },
  melhoria: { label: 'Melhoria', icon: Wrench, className: 'bg-info text-white hover:bg-info' },
  correcao: { label: 'Correção', icon: Bug, className: 'bg-destructive text-white hover:bg-destructive' },
  seguranca: { label: 'Segurança', icon: Shield, className: 'bg-secondary text-secondary-foreground hover:bg-secondary' },
};

const filterConfig: { value: ChangeCategory | 'all'; label: string; icon: any }[] = [
  { value: 'all', label: 'Todas', icon: null },
  { value: 'recurso', label: 'Recursos', icon: Sparkles },
  { value: 'melhoria', label: 'Melhorias', icon: Wrench },
  { value: 'correcao', label: 'Correções', icon: Bug },
  { value: 'seguranca', label: 'Segurança', icon: Shield },
];

const changelog: ChangelogEntry[] = [
  {
    version: '1.5.12',
    date: '24 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Contas bancárias e centros de custo',
        description: 'Nova aba "Caixas e Bancos" no financeiro para cadastrar contas (caixa, banco, cartão), acompanhar saldo individual por conta e realizar transferências internas entre contas.',
        category: 'recurso',
      },
      {
        title: 'Categorias com drag & drop',
        description: 'As categorias financeiras agora podem ser reordenadas via arrastar e soltar, com ícones de editar/excluir visíveis apenas ao passar o mouse.',
        category: 'melhoria',
      },
      {
        title: 'Preferências do formulário financeiro',
        description: 'O formulário de nova transação agora lembra automaticamente a última forma de pagamento e a última conta utilizada.',
        category: 'melhoria',
      },
      {
        title: 'Centralização de movimentações',
        description: 'As abas separadas de Receitas e Despesas foram unificadas na aba Movimentações com filtro integrado por tipo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.11',
    date: '24 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Parcelamento de transações',
        description: 'Ao criar uma receita ou despesa, agora é possível parcelar em N vezes. O sistema gera automaticamente as parcelas com vencimentos mensais e indicação visual (ex: 2/6).',
        category: 'recurso',
      },
      {
        title: 'Upload de comprovantes',
        description: 'Transações financeiras agora permitem anexar comprovantes e notas fiscais (imagens ou PDF). Comprovantes ficam visíveis na listagem com ícone clicável.',
        category: 'recurso',
      },
      {
        title: 'Método de pagamento',
        description: 'Novo campo para registrar a forma de pagamento (PIX, boleto, cartão de crédito/débito, dinheiro, transferência) com filtro na listagem.',
        category: 'recurso',
      },
      {
        title: 'Exportação CSV com filtros',
        description: 'Transações financeiras agora podem ser exportadas em CSV respeitando os filtros ativos (busca, categoria, status, método de pagamento).',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.5.10',
    date: '24 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Gráfico de fluxo de caixa mensal',
        description: 'A visão geral do financeiro agora inclui um gráfico de barras com entradas vs saídas por mês, facilitando a análise de tendências.',
        category: 'recurso',
      },
      {
        title: 'Máscara monetária no valor',
        description: 'O campo de valor nas transações financeiras agora usa máscara automática no formato R$ (ex: 1.234,56) ao invés de input numérico simples.',
        category: 'melhoria',
      },
      {
        title: 'Campo de observações nas transações',
        description: 'Adicionado campo de notas/observações no formulário de criação e edição de transações financeiras.',
        category: 'melhoria',
      },
      {
        title: 'Filtros avançados na listagem',
        description: 'Listagem de transações agora conta com filtros por categoria e status (pago/pendente) além da busca textual.',
        category: 'melhoria',
      },
      {
        title: 'Cards clicáveis A Pagar / A Receber',
        description: 'Cards de resumo "A Pagar" e "A Receber" na visão geral agora são clicáveis e direcionam para a aba de contas.',
        category: 'melhoria',
      },
      {
        title: 'Categorias financeiras padrão por empresa',
        description: 'Toda nova empresa já recebe categorias financeiras padrão personalizáveis, com "Impostos e Taxas" fixa e integrada ao DRE como deduções.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.5.9',
    date: '23 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Correção de erro ao abrir OS pelo técnico',
        description: 'Corrigido erro "a is not a function" que impedia a abertura da OS em alguns cenários, causado por dados de questionário retornados em formato inesperado.',
        category: 'correcao',
      },
      {
        title: 'Correção de respostas duplicadas entre equipamentos',
        description: 'Respostas de questionário agora são filtradas corretamente por template, evitando que respostas de um equipamento apareçam em outro.',
        category: 'correcao',
      },
      {
        title: 'Fotos clicáveis em tela cheia no link público',
        description: 'Fotos de respostas de questionários e fotos da OS no link de acompanhamento do cliente agora podem ser ampliadas ao clicar.',
        category: 'melhoria',
      },
      {
        title: 'Foto e dados do cliente no link público',
        description: 'O card de cliente no link de acompanhamento agora exibe a foto do cliente (clicável para ampliar) ao lado do nome.',
        category: 'melhoria',
      },
      {
        title: 'Técnico identificado no check-in público',
        description: 'A seção de check-in no link de acompanhamento do cliente agora mostra nome e foto do técnico responsável.',
        category: 'melhoria',
      },
      {
        title: 'Edição e remoção de respostas e fotos',
        description: 'Técnicos agora podem editar respostas já dadas (ícone de lápis) e remover fotos adicionadas a perguntas do questionário.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.5.8',
    date: '23 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Exclusão de OS recorrentes',
        description: 'Ao excluir uma OS que pertence a um grupo de recorrência, o sistema pergunta se deseja excluir apenas aquela ou todas as OS da recorrência.',
        category: 'recurso',
      },
      {
        title: 'Permissão para reabrir OS',
        description: 'Nova permissão "Reabrir OS" (fn:reopen_os) na categoria Serviços. Usuários com essa permissão podem reabrir OS concluídas para edição dos campos preenchidos.',
        category: 'recurso',
      },
      {
        title: 'Botão de reabrir na agenda',
        description: 'No resumo lateral da agenda, OS concluídas exibem o botão "Reabrir OS" para usuários com a permissão correspondente.',
        category: 'melhoria',
      },
      {
        title: 'Assinatura com fundo branco no tema escuro',
        description: 'O campo de assinatura agora mantém fundo branco e traço preto independentemente do tema do usuário, garantindo legibilidade.',
        category: 'correcao',
      },
      {
        title: 'Botão finalizar OS reposicionado',
        description: 'O botão "Finalizar OS" agora aparece ao final do formulário, após as assinaturas obrigatórias, em vez de ficar fixo no rodapé.',
        category: 'melhoria',
      },
      {
        title: 'Recorrência ao criar OS e tarefas',
        description: 'Ao criar uma nova OS ou tarefa, é possível ativar recorrência (diária, semanal, quinzenal, mensal ou personalizada) para gerar automaticamente eventos futuros.',
        category: 'recurso',
      },
      {
        title: 'Propagação de datas em contratos',
        description: 'Ao editar a data de uma OS de contrato, o sistema pergunta se deseja alterar apenas aquela ou todas as ocorrências futuras da recorrência.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.7',
    date: '23 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Sincronização de equipes com OSs',
        description: 'Ao adicionar ou remover membros de uma equipe, todas as OSs vinculadas à equipe são atualizadas automaticamente, garantindo que apenas membros ativos vejam as ordens de serviço.',
        category: 'recurso',
      },
      {
        title: 'Visibilidade de OS para técnicos em contratos',
        description: 'OSs geradas por contratos agora criam assignees automaticamente, permitindo que técnicos e equipes vejam as OS mesmo sem perfil "interno".',
        category: 'correcao',
      },
      {
        title: 'Check-in em OS agendadas',
        description: 'Técnicos agora podem fazer check-in e iniciar deslocamento em ordens de serviço com status "Agendada".',
        category: 'correcao',
      },
      {
        title: 'Questionários em accordion na OS do técnico',
        description: 'O preenchimento da OS exibe questionários por equipamento em formato de accordion com indicador visual de conclusão, foto e local do equipamento.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.6',
    date: '21 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Checkout de renovação direto',
        description: 'Ao clicar em "Pagar agora" com assinatura ativa, o checkout pula a seleção de plano e vai direto para o pagamento.',
        category: 'melhoria',
      },
      {
        title: 'Busca inteligente com espaços',
        description: 'Todos os campos de pesquisa do sistema agora tratam espaços extras e permitem buscar termos concatenados (ex: "daluz" encontra "da luz").',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.5',
    date: '21 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Foto do cliente e técnico na OS',
        description: 'O relatório da OS agora exibe a foto do cliente ao lado dos dados e a foto/nome do técnico nas seções de check-in e check-out.',
        category: 'melhoria',
      },
      {
        title: 'Branding Dominex fora do relatório',
        description: 'O logo e site da Dominex agora aparecem abaixo dos botões de ação, fora do corpo do relatório, para uma apresentação mais limpa.',
        category: 'melhoria',
      },
      {
        title: 'Cor personalizada do fundo do logo',
        description: 'Na personalização do cabeçalho da OS, agora é possível escolher a cor de fundo atrás do logo ao invés de apenas branco.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.5.4',
    date: '21 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Resumo do orçamento sem módulo de precificação',
        description: 'O resumo financeiro do orçamento agora aparece para todos os planos, exibindo subtotais de serviços, materiais, desconto e total. O detalhamento de BDI permanece exclusivo do módulo de Precificação Avançada.',
        category: 'melhoria',
      },
      {
        title: 'Materiais manuais no orçamento',
        description: 'Agora é possível adicionar materiais digitando o nome livremente, sem necessidade de cadastrar previamente no estoque.',
        category: 'recurso',
      },
      {
        title: 'White Label — imagem social personalizada',
        description: 'Ao compartilhar links de propostas no WhatsApp ou Instagram, a imagem de pré-visualização usa o logo da empresa ao invés do logo padrão quando White Label está ativo.',
        category: 'recurso',
      },
      {
        title: 'Download de fotos no relatório do serviço',
        description: 'Adicionado botão de download ao visualizar fotos no relatório de OS, disponível no desktop e mobile.',
        category: 'melhoria',
      },
      {
        title: 'Custos dos serviços — seleção automática',
        description: 'A aba de custos dos serviços agora abre com o primeiro tipo de serviço já selecionado automaticamente.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.3',
    date: '21 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Sistema modular de assinatura',
        description: 'Novo sistema de módulos contratáveis (Básico, RH, CRM, NF-e, Financeiro Avançado, Precificação, Portal do Cliente, White Label) com planos pré-montados e personalizado.',
        category: 'recurso',
      },
      {
        title: 'Feature gating por módulo',
        description: 'Telas e funcionalidades habilitadas/desabilitadas conforme módulos contratados, com modal de upsell ao acessar recurso não contratado.',
        category: 'recurso',
      },
      {
        title: 'Checkout modular',
        description: 'Checkout reformulado com planos pré-montados (Essencial, Avançado, Master) ou montagem personalizada com cálculo automático.',
        category: 'recurso',
      },
      {
        title: 'Gating financeiro e precificação',
        description: 'Abas de DRE e Contas exigem Financeiro Avançado. BDI, custos globais e precificação exigem Precificação Avançada.',
        category: 'melhoria',
      },
      {
        title: 'Gating de CRM, RH e Portal do Cliente',
        description: 'Menu, rotas e botões de CRM, Funcionários e Portal do Cliente ocultados quando o módulo não está ativo.',
        category: 'melhoria',
      },
      {
        title: 'Correção do PDF de relatório de OS',
        description: 'Corrigido problema que gerava PDFs com páginas em branco ao finalizar uma OS.',
        category: 'correcao',
      },
      {
        title: 'Correção na conversão de orçamento em OS',
        description: 'Removido campo inexistente do payload de criação de OS a partir de orçamento aprovado.',
        category: 'correcao',
      },
      {
        title: 'Correção de títulos duplicados em Orçamentos',
        description: 'Removida duplicação de título e ícone na tela de orçamentos sem módulo de precificação.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.5.12',
    date: '19 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Permissão de financeiro do cliente',
        description: 'Nova permissão "Ver Financeiro do Cliente" controla a visibilidade da aba financeira na ficha do cliente.',
        category: 'recurso',
      },
      {
        title: 'Correção ao salvar White Label no mobile',
        description: 'Corrigido erro "Cannot coerce to single JSON object" ao salvar configurações de white label pelo celular.',
        category: 'correcao',
      },
      {
        title: 'Soft delete de questionários',
        description: 'Questionários agora são desativados em vez de excluídos, preservando o histórico de OS vinculadas.',
        category: 'melhoria',
      },
      {
        title: 'Scroll no modal de cargos',
        description: 'Corrigido o scroll vertical no modal de configuração de cargos em dispositivos móveis.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.5.11',
    date: '19 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Exclusão de questionários com mensagem tratada',
        description: 'Erros de vínculo ao tentar excluir questionários agora são interpretados corretamente e exibidos com mensagem amigável em português.',
        category: 'correcao',
      },
      {
        title: 'Leitura mais robusta de erros do banco',
        description: 'O sistema agora considera detalhes adicionais do erro técnico para mapear melhor constraints e evitar mensagens cruas na interface.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.10',
    date: '16 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Múltiplos responsáveis em OS e Tarefas',
        description: 'Agora é possível atribuir vários técnicos e equipes a uma OS ou tarefa usando a nova seleção múltipla.',
        category: 'recurso',
      },
      {
        title: 'Recorrência personalizada',
        description: 'Adicionada opção "Personalizado" na recorrência de tarefas, permitindo escolher dias específicos da semana.',
        category: 'recurso',
      },
      {
        title: 'Diferenciação visual OS vs Tarefas',
        description: 'Cards de tarefas na agenda agora exibem borda roxa e ícone distinto para fácil identificação.',
        category: 'melhoria',
      },
      {
        title: 'Filtro de agenda por perfil',
        description: 'Técnicos veem apenas suas OS/tarefas atribuídas, enquanto gestores e admins veem toda a agenda.',
        category: 'melhoria',
      },
      {
        title: 'Edição de OS em etapas',
        description: 'O modal de edição de OS agora segue o mesmo fluxo em etapas da criação (Cliente, Equipamento, Detalhes).',
        category: 'melhoria',
      },
      {
        title: 'Validação de rascunhos aprimorada',
        description: 'O modal de "rascunho encontrado" não aparece mais quando nenhum dado foi preenchido.',
        category: 'correcao',
      },
      {
        title: 'Responsáveis expandidos',
        description: 'Qualquer usuário da empresa pode ser atribuído como responsável, não apenas técnicos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.9',
    date: '16 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Dashboard otimizado com 3 KPIs',
        description: 'Removidos os cards "Clientes Ativos" e "Em Campo Agora" para dar mais espaço aos KPIs principais (OS Abertas, Taxa de Conclusão e Faturamento).',
        category: 'melhoria',
      },
      {
        title: 'Técnicos em campo no gráfico de equipe',
        description: 'A informação de técnicos ativos em campo agora aparece no canto inferior do card "Desempenho da Equipe" com indicador pulsante em tempo real.',
        category: 'melhoria',
      },
      {
        title: 'Inputs visíveis no teclado mobile',
        description: 'Ao focar em campos dentro de drawers no mobile, o input agora rola automaticamente para o centro da tela, permanecendo sempre visível sobre o teclado.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.5.8',
    date: '16 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Finalizar OS pela agenda',
        description: 'Gestores agora podem finalizar ordens de serviço diretamente pelo resumo da OS na agenda, independentemente do status atual.',
        category: 'recurso',
      },
      {
        title: 'Selecionar todos os equipamentos',
        description: 'Opção "Selecionar todos" adicionada nos seletores de equipamentos ao criar OS, contratos e outros formulários.',
        category: 'melhoria',
      },
      {
        title: 'Equipamentos do Contrato com paginação',
        description: 'A seção de itens do contrato foi renomeada para "Equipamentos do Contrato" e agora exibe os equipamentos com paginação (5 por página).',
        category: 'melhoria',
      },
      {
        title: 'Foto nos recursos de custos globais',
        description: 'Agora é possível adicionar uma foto opcional ao cadastrar veículos, ferramentas, EPIs e outros recursos globais.',
        category: 'recurso',
      },
      {
        title: 'Custos completos no orçamento',
        description: 'Ao inserir um serviço no orçamento, agora são puxados também os custos de recursos vinculados (veículos, ferramentas, EPIs) e brindes configurados.',
        category: 'correcao',
      },
      {
        title: 'Calculadora de depreciação corrigida',
        description: 'Os campos da calculadora de depreciação agora aceitam formato brasileiro (200.000) e exibem o valor interpretado para confirmação.',
        category: 'correcao',
      },
      {
        title: 'Cards responsivos em custos',
        description: 'Os cards de custos globais e custos dos serviços agora se ajustam melhor em telas menores, exibindo 1 ou 2 por linha conforme o espaço disponível.',
        category: 'melhoria',
      },
      {
        title: 'Mensagens de erro em português',
        description: 'Erros do sistema como violações de chave estrangeira e campos calculados agora exibem mensagens claras em português do Brasil.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.7',
    date: '15 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Fotos de técnicos nos cards da agenda',
        description: 'Os cards de OS na agenda agora exibem os avatares dos técnicos e membros de equipe atribuídos. O resumo da OS também mostra a seção "Responsáveis" com fotos.',
        category: 'recurso',
      },
      {
        title: 'Upload de foto e seletor de ícone para equipes',
        description: 'Ao criar ou editar uma equipe, é possível enviar uma foto personalizada ou escolher entre 17 ícones temáticos. O visual agora usa fundo saturado com ícone branco.',
        category: 'recurso',
      },
      {
        title: 'Logo corrigido no modo escuro (checkout e mobile)',
        description: 'O logo no checkout e no header mobile agora usa a versão verde horizontal quando o tema escuro está ativo, consistente com o sidebar.',
        category: 'correcao',
      },
      {
        title: 'Dashboard responsivo para telas menores',
        description: 'KPIs adaptados com grid progressivo (2→3→5 colunas), seletor de período padrão (DateRangeFilter), títulos centralizados no mobile e cards sem overflow.',
        category: 'melhoria',
      },
      {
        title: 'Coluna "Criador" na lista de OS',
        description: 'Nova coluna com avatar do usuário que criou a OS, com nome exibido no hover.',
        category: 'melhoria',
      },
      {
        title: 'Combobox com busca nos selects de OS',
        description: 'Os campos de técnico/equipe e tipo de serviço no formulário de OS agora são pesquisáveis, com avatares e cores inline.',
        category: 'melhoria',
      },
      {
        title: 'Mapas com tema escuro automático',
        description: 'Os mapas agora detectam automaticamente o tema do sistema e aplicam tiles escuros quando o modo noturno está ativo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.6',
    date: '13 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Atalhos de teclado configuráveis',
        description: 'Nova aba "Atalhos" nas Configurações com navegação rápida via Shift + letra (ex: Shift+D para Dashboard, Shift+O para OS). Atalhos podem ser ativados/desativados.',
        category: 'recurso',
      },
      {
        title: 'Títulos dinâmicos na aba do navegador',
        description: 'O título da aba do navegador agora reflete a tela atual (ex: "Dashboard | Dominex", "Clientes | Dominex").',
        category: 'melhoria',
      },
      {
        title: 'Novo favicon e logo atualizado',
        description: 'Favicon atualizado para o ícone verde da Dominex. Logo no login e cadastro agora usa a versão horizontal verde, igual ao header da landing page.',
        category: 'melhoria',
      },
      {
        title: 'Origem automática no cadastro',
        description: 'A etapa de origem no cadastro é pulada automaticamente, registrando "Site/Google" por padrão. Parâmetros de URL (?origem=...) sobrescrevem o valor.',
        category: 'melhoria',
      },
      {
        title: 'Botão "Criar Conta" na landing page',
        description: 'O botão "Agendar Demo" no header da landing page foi alterado para "Criar Conta" com link direto ao cadastro.',
        category: 'melhoria',
      },
      {
        title: 'Skeleton loading no login',
        description: 'Tela de login agora exibe skeletons animados enquanto o estado de autenticação carrega, em vez de um spinner simples.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.5',
    date: '12 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Colunas ordenáveis na lista de equipamentos',
        description: 'A tabela de equipamentos agora permite ordenar por nome, cliente, categoria e status clicando nos cabeçalhos das colunas.',
        category: 'melhoria',
      },
      {
        title: 'Seleção de cliente com busca (Combobox)',
        description: 'Os campos de seleção de cliente em OS, Equipamentos, CRM e PMOC agora possuem busca integrada, facilitando encontrar clientes pelo nome, documento ou e-mail.',
        category: 'melhoria',
      },
      {
        title: 'Correção de scroll em selects dentro de modais',
        description: 'Corrigido problema onde a lista de opções do select de cliente não permitia rolar verticalmente em dispositivos móveis dentro de modais e drawers.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.5.4',
    date: '12 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Correção de upload de anexos em equipamentos',
        description: 'Corrigido erro "Invalid key" ao anexar arquivos com caracteres especiais ou acentos no nome (ex: imagens do WhatsApp). Os nomes são agora sanitizados automaticamente.',
        category: 'correcao',
      },
      {
        title: 'Persistência da foto ao criar/editar equipamento',
        description: 'Corrigido problema onde a foto selecionada desaparecia durante o cadastro ou edição do equipamento. A imagem agora é mantida corretamente até o envio do formulário.',
        category: 'correcao',
      },
      {
        title: 'Padronização de caminhos de storage',
        description: 'Criado utilitário centralizado para geração de caminhos seguros no storage, eliminando falhas com nomes de arquivo problemáticos em todo o sistema.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.3',
    date: '10 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Error Boundary global',
        description: 'Adicionada proteção contra tela branca: quando ocorre um erro inesperado, o sistema exibe uma mensagem amigável com botão para recarregar ao invés de travar completamente.',
        category: 'melhoria',
      },
      {
        title: 'Correção de tela branca ao abrir diálogos',
        description: 'Corrigido problema que podia causar tela em branco ao abrir formulários como "Novo Cliente". Ajustada compatibilidade com Radix UI e importação de ícones.',
        category: 'correcao',
      },
      {
        title: 'Feriados na agenda com melhor contraste',
        description: 'Os feriados na agenda agora usam fundo escuro com texto branco e ícone de estrela para melhor legibilidade. Adicionado item "Feriado" na legenda.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.2',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Feriados nacionais e municipais na agenda',
        description: 'A agenda exibe automaticamente feriados nacionais e municipais (baseados na cidade/UF da empresa). Configurável em Usabilidade > Agenda.',
        category: 'recurso',
      },
      {
        title: 'Base da empresa no mapa ao vivo',
        description: 'O mapa ao vivo agora exibe a localização da sede da empresa com um marcador distinto, calculado a partir do endereço cadastrado.',
        category: 'recurso',
      },
      {
        title: 'Tooltips persistentes no mapa',
        description: 'Ao clicar em um ponto no mapa ao vivo, o popup permanece fixo até o usuário fechar. Hover continua mostrando preview rápido.',
        category: 'melhoria',
      },
      {
        title: 'Ordenação por colunas em todas as tabelas restantes',
        description: 'Adicionada ordenação por colunas em Questionários, Detalhe do Cliente, Detalhe do Equipamento, Detalhe do Contrato, Tipos de Serviço e Extrato de Funcionários.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.0',
    date: '09 de março de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Tela dedicada de Ponto Eletrônico',
        description: 'Nova tela "Ponto Eletrônico" no menu Operacional, exclusiva para o usuário registrar seu ponto. Acessível automaticamente por qualquer usuário vinculado a um funcionário, sem necessidade de permissão específica.',
        category: 'recurso',
      },
      {
        title: 'Controle de Ponto na tela de Funcionários',
        description: 'A aba "Controle de Ponto" com todas as subabas administrativas (Hoje, Histórico, Relatórios, Configurações) agora fica dentro da tela Funcionários, visível apenas para quem tem permissão de gestão.',
        category: 'recurso',
      },
      {
        title: 'Filtro de data padrão no Histórico de Ponto',
        description: 'O histórico de ponto agora utiliza o componente DateRangeFilter padrão do sistema, com preset "Este mês" por padrão, mantendo consistência visual com Dashboard e Financeiro.',
        category: 'melhoria',
      },
      {
        title: 'Botão de visualizar detalhes no Histórico',
        description: 'Adicionado botão de visualização na coluna de ações do histórico de ponto, abrindo o mesmo modal de detalhes disponível na aba "Hoje".',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.20',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Correção do botão de ação após jornada concluída',
        description: 'Corrigido bug que exibia o botão "Iniciar Intervalo" mesmo após a jornada ser concluída. Agora nenhum botão de ação é exibido após o encerramento.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.4.19',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Vinculação automática de funcionário no registro de ponto',
        description: 'Os registros de ponto agora incluem automaticamente o employee_id do funcionário vinculado ao usuário, garantindo que o histórico apareça corretamente na gestão administrativa.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.4.18',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Correção de perfil de usuário sem empresa',
        description: 'Corrigido problema onde perfis de usuários vinculados a funcionários não tinham company_id definido, impedindo o registro de ponto.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.4.17',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Automação de criação de usuário para funcionário',
        description: 'Ao criar um funcionário, o sistema permite criar automaticamente um usuário vinculado com preset de permissões e role, sincronizando e-mail e foto de perfil.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.16',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Sincronia bidirecional de fotos',
        description: 'Fotos de perfil são sincronizadas automaticamente entre o cadastro de funcionário e o perfil de usuário vinculado, em ambas as direções.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.15',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Resolução de conflito de e-mail',
        description: 'Ao vincular funcionário e usuário com e-mails diferentes, o administrador pode escolher qual endereço prevalecerá em ambos os cadastros.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.14',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Dashboard de funcionários aprimorado',
        description: 'Dashboard com métricas de total de funcionários, salário médio, folha mensal e contagem de inativos, com cards visuais e indicadores.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.13',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Extrato financeiro do funcionário',
        description: 'Extrato detalhado com paginação mostrando vales, bônus, faltas e pagamentos, com cálculo automático de saldo acumulado.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.4.12',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Pagamento mensal de funcionário',
        description: 'Modal de pagamento que calcula automaticamente salário base + bônus - vales - faltas, com seleção de método de pagamento.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.4.11',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Movimentações financeiras de funcionários',
        description: 'Registro de adiantamentos, bônus, faltas e descontos com histórico completo e atualização automática de saldo.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.4.10',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Relatório mensal de ponto com calendário visual',
        description: 'Calendário visual colorido no relatório mensal mostrando status de cada dia com gráficos de resumo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.9',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Exportação de folha de ponto em CSV',
        description: 'Botão de exportação CSV no histórico de ponto com dados de funcionário, data, entrada, saída, trabalhado e saldo.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.4.8',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Configurações de jornada de trabalho',
        description: 'Painel de configurações com horário padrão, tolerância de atraso, exigência de selfie/geolocalização e raio máximo.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.4.7',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Escalas individuais por funcionário',
        description: 'Configuração de escala semanal personalizada por funcionário, definindo dias úteis, horários e duração de intervalo.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.4.6',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Registro manual de ponto pelo admin',
        description: 'Administradores podem registrar pontos manualmente para funcionários com justificativa obrigatória.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.4.5',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Modal de detalhes do dia',
        description: 'Ao clicar no ícone de visualização de um funcionário, abre modal com timeline de todos os registros do dia, incluindo horário, tipo, localização e foto.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.4',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'KPIs de presença em tempo real',
        description: 'Painel administrativo com contadores em tempo real de presentes, ausentes, em intervalo e jornadas concluídas, atualizado via Realtime.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.3',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Histórico de ponto com filtros',
        description: 'Subaba "Histórico" no controle de ponto com filtros por funcionário, período e status, exibindo saldos acumulados.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.4.2',
    date: '09 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Painel administrativo de ponto por funcionário',
        description: 'Aba "Controle de Ponto" movida para a tela Funcionários, organizando o gerenciamento de ponto por vínculo empregatício.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.1',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Persistência dos dados da empresa',
        description: 'Corrigido salvamento dos campos bairro, complemento e white label nas configurações. Valores vazios agora limpam corretamente no banco de dados.',
        category: 'correcao',
      },
      {
        title: 'Menu topbar alinhado ao sidebar',
        description: 'O menu superior (topbar) agora possui a mesma estrutura do sidebar, com os grupos "Operacional" e "Gestão" e todos os itens idênticos.',
        category: 'correcao',
      },
      {
        title: 'Aba de configurações persistente',
        description: 'Ao trocar entre sidebar e topbar na aba Aparência, a aba ativa das configurações é mantida via URL, sem resetar para "Empresa".',
        category: 'correcao',
      },
      {
        title: 'Loading skeleton nos logos',
        description: 'Adicionado skeleton animado no sidebar, topbar e headers mobile enquanto os dados da empresa carregam, evitando piscadas de logo.',
        category: 'melhoria',
      },
      {
        title: 'Botão único de salvar na empresa',
        description: 'Removido botão separado "Salvar White Label". Todas as configurações da empresa e white label são salvas por um único botão.',
        category: 'melhoria',
      },
      {
        title: 'Remoção de botão duplicado no sidebar',
        description: 'Removido botão duplicado de collapse/expand do sidebar, mantendo apenas o do cabeçalho.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.4.0',
    date: '08 de março de 2026',
    type: 'major',
    changes: [
      {
        title: 'Controle de Ponto Eletrônico',
        description: 'Módulo completo de ponto na aba "Controle de Ponto" dentro de Usuários. Registro via geolocalização + selfie, painel admin com KPIs em tempo real, histórico, relatórios mensais com calendário visual e gráficos, configurações de jornada e exportação CSV.',
        category: 'recurso',
      },
      {
        title: 'Interface Mobile para Técnicos',
        description: 'Tela mobile-first com botão grande por estado (entrada, intervalo, saída), fluxo de 3 etapas (localização → selfie → confirmação), histórico recente e vibração ao confirmar.',
        category: 'recurso',
      },
      {
        title: 'Modais responsivos aprimorados',
        description: 'ResponsiveModal agora suporta footer fixo e max-width customizável. Modais no desktop, drawers no mobile.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.3.0',
    date: '08 de março de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Portal do Cliente (Self-Service)',
        description: 'Página pública acessível via link gerado na tela do cliente. Abertura de chamados, acompanhamento de OS em tempo real e histórico de equipamentos.',
        category: 'recurso',
      },
      {
        title: 'Editar e excluir contratos',
        description: 'Botões de editar e excluir no topo da tela de contrato, com modal de confirmação listando tudo que será apagado (OSs, ocorrências, transações).',
        category: 'recurso',
      },
      {
        title: 'Renovar contrato',
        description: 'Botão de renovação no resumo do contrato que clona as configurações com nova data de início.',
        category: 'recurso',
      },
      {
        title: 'Câmera obrigatória em fotos',
        description: 'Toggle para exigir que a foto seja tirada com a câmera do dispositivo, bloqueando upload da galeria.',
        category: 'recurso',
      },
      {
        title: 'Edição de perguntas por modal',
        description: 'Ao editar uma pergunta do questionário, abre um modal completo ao invés de edição inline.',
        category: 'melhoria',
      },
      {
        title: 'WhatsApp nos contatos do cliente',
        description: 'Botão com ícone oficial do WhatsApp nos responsáveis no local, quando há telefone preenchido.',
        category: 'melhoria',
      },
      {
        title: 'Scrollbar personalizada',
        description: 'Scroll customizado com cor da marca em todas as áreas roláveis do sistema.',
        category: 'melhoria',
      },
      {
        title: 'Paginação padrão de 10 itens',
        description: 'Todas as tabelas paginadas agora exibem 10 itens por padrão.',
        category: 'melhoria',
      },
      {
        title: 'Correção na edição de contrato',
        description: 'Ao clicar em editar contrato, agora os dados reais do contrato são carregados no formulário.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.2.10',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Contatos do Cliente (Responsável no Local)',
        description: 'Novo campo "Responsável no Local (falar com)" na aba Geral do cliente, com nome, telefone e email corporativo. Modal para adicionar, editar e excluir contatos.',
        category: 'recurso',
      },
      {
        title: 'Remoção do banner de instalação PWA',
        description: 'Removido o toast/banner de instalação do PWA que aparecia ao acessar o sistema.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.2.9',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Correção do gerenciamento de sessões',
        description: 'Corrigido o fluxo de login com detecção de sessões ativas. Agora ao logar com sessão ativa em outro dispositivo, o sistema exibe o aviso corretamente antes de prosseguir.',
        category: 'correcao',
      },
      {
        title: 'Desconectar outras sessões',
        description: 'Opção de desconectar todos os outros dispositivos ao fazer login, com encerramento forçado via realtime.',
        category: 'seguranca',
      },
    ],
  },
  {
    version: '1.2.8',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Mapa do cliente com Google Maps',
        description: 'Embed do Google Maps na aba Geral do cliente, com links diretos para rota no Google Maps e Waze.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.2.7',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'PWA — Progressive Web App',
        description: 'Sistema transformado em PWA instalável com suporte offline, cache inteligente (Workbox) e indicador de status de conexão.',
        category: 'recurso',
      },
      {
        title: 'Botão de limpar cache no rodapé',
        description: 'Ícone de refresh no rodapé que limpa cache, service workers e faz hard reload do sistema.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.2.6',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Monitoramento de sessões ativas',
        description: 'Tabela de sessões ativas com detecção de login simultâneo, device info e último acesso. Forced logout em tempo real via Supabase Realtime.',
        category: 'seguranca',
      },
    ],
  },
  {
    version: '1.2.5',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Módulo de Funcionários',
        description: 'CRUD completo de funcionários com foto, CPF, cargo, salário, Pix e endereço. Dashboard com métricas e extrato financeiro individual.',
        category: 'recurso',
      },
      {
        title: 'Movimentações de Funcionários',
        description: 'Registro de adiantamentos, pagamentos e descontos com cálculo automático de saldo e histórico completo.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.2.4',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Rastreamento de Técnicos em tempo real',
        description: 'Mapa ao vivo com localização dos técnicos em campo, atualizado em tempo real via geolocalização.',
        category: 'recurso',
      },
      {
        title: 'Distância do técnico ao cliente',
        description: 'Badge com distância estimada entre técnico e endereço do cliente na criação/edição de OS.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.2.3',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Equipes de Técnicos',
        description: 'Criação e gestão de equipes com membros, cores e atribuição de OS por equipe.',
        category: 'recurso',
      },
      {
        title: 'SLA por tipo de serviço',
        description: 'Configuração de prazo máximo (em horas) para atendimento por tipo de serviço, com indicador visual de SLA na agenda.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.2.2',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Status de OS personalizáveis',
        description: 'Gerenciador de status com cores, posição e campos obrigatórios por status. Status padrão configurável.',
        category: 'recurso',
      },
      {
        title: 'Campos obrigatórios por status',
        description: 'Configuração de quais campos devem ser preenchidos para que uma OS possa avançar para determinado status.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.2.1',
    date: '08 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Contas a Pagar e Receber',
        description: 'Visão separada de contas a pagar e a receber no módulo financeiro, com filtros de período e status de pagamento.',
        category: 'recurso',
      },
      {
        title: 'Ícones nas categorias financeiras',
        description: 'Seletor de ícones (Lucide) para categorias financeiras, exibidos na listagem e nos gráficos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.2.0',
    date: '08 de março de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Módulo Financeiro Completo',
        description: 'Redesign do módulo financeiro com navegação lateral (sidebar), visão geral com gráficos, receitas, despesas e DRE.',
        category: 'recurso',
      },
      {
        title: 'Categorias Financeiras',
        description: 'CRUD de categorias para organizar receitas e despesas, com cores e tipos personalizáveis.',
        category: 'recurso',
      },
      {
        title: 'DRE - Demonstrativo de Resultado',
        description: 'Demonstrativo financeiro automático com cálculo de receita bruta, líquida, lucro bruto, OPEX e resultado final (EBITDA).',
        category: 'recurso',
      },
      {
        title: 'Gráficos Financeiros',
        description: 'Gráfico de distribuição por categoria (donut) e evolução receita × despesas ao longo dos meses.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '08 de março de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Sistema de Permissões Granulares',
        description: 'Controle de acesso por telas e funções com chaves de permissão individuais por usuário.',
        category: 'recurso',
      },
      {
        title: 'Gestão de Cargos (Presets)',
        description: 'Criação de cargos com kits de permissões pré-definidos que podem ser atribuídos aos usuários.',
        category: 'recurso',
      },
      {
        title: 'CRUD completo de Usuários',
        description: 'Interface moderna para criar, editar, ativar/desativar usuários e configurar permissões individuais.',
        category: 'recurso',
      },
      {
        title: 'Criação de usuários via admin',
        description: 'Administradores podem criar usuários diretamente com e-mail e senha, sem necessidade de confirmação por e-mail.',
        category: 'recurso',
      },
      {
        title: 'Menu filtrado por permissões',
        description: 'Itens do menu lateral e da navegação mobile são exibidos dinamicamente conforme as permissões do usuário.',
        category: 'melhoria',
      },
      {
        title: 'Layout mobile do login corrigido',
        description: '"Lembrar-me" e "Esqueci minha senha" agora aparecem em linhas separadas no mobile, evitando sobreposição.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.0.15',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Contraste de cores em eventos sobrepostos',
        description: 'Eventos do mesmo tipo de serviço sobrepostos na visão semanal agora exibem tons levemente diferentes para melhor diferenciação visual.',
        category: 'melhoria',
      },
      {
        title: 'Cascata vertical ampliada na visão semanal',
        description: 'Aumento do deslocamento vertical entre eventos sobrepostos na visão semanal para melhor legibilidade.',
        category: 'melhoria',
      },
      {
        title: 'Ocultar descrição e detalhes em OS concluída',
        description: 'O relatório de OS finalizada não exibe mais "Descrição do Chamado" e "Detalhes do Serviço", que são visíveis apenas durante o preenchimento.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.0.14',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Drag & Drop sobre eventos sobrepostos',
        description: 'O reagendamento via arraste agora funciona mesmo ao soltar sobre outro card, calculando o horário pela posição vertical do mouse.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.0.13',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Eventos lado a lado na visão diária',
        description: 'Quando duas ou mais OS se sobrepõem no horário, elas são exibidas em colunas lado a lado na visão diária da agenda.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.12',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cascata vertical na visão semanal',
        description: 'Eventos sobrepostos na visão semanal são exibidos em cascata vertical com deslocamento progressivo.',
        category: 'recurso',
      },
      {
        title: 'Drag & Drop na visão semanal',
        description: 'Suporte completo a drag & drop para reagendamento de OS na visão semanal, incluindo sobre cards sobrepostos.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.11',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Duração proporcional nos calendários',
        description: 'Eventos nas visões diária e semanal agora ocupam espaço proporcional à duração configurada da OS.',
        category: 'melhoria',
      },
      {
        title: 'Layout do resumo lateral corrigido',
        description: 'Correção de overflow no painel de resumo da OS na agenda, evitando que textos longos ultrapassem a largura.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.0.10',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tipo de serviço no relatório',
        description: 'O nome do tipo de serviço agora aparece na seção "Descrição do Chamado" do relatório da OS.',
        category: 'melhoria',
      },
      {
        title: 'Múltiplos questionários no relatório',
        description: 'O relatório de OS concluída agora exibe respostas de todos os questionários vinculados, não apenas o primeiro.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.0.9',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Auto-preenchimento de cliente em equipamento',
        description: 'Ao criar equipamento pela aba de um cliente, o campo de cliente é preenchido automaticamente.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.0.8',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Relatório profissional de OS',
        description: 'Relatório completo com layout profissional para OS concluídas, incluindo cabeçalho da empresa, fotos, checklist e assinaturas.',
        category: 'recurso',
      },
      {
        title: 'Exportação para PDF',
        description: 'Download do relatório de OS em PDF formatado para A4 com alta qualidade de impressão.',
        category: 'recurso',
      },
      {
        title: 'Link de compartilhamento',
        description: 'Botão para copiar o link direto do relatório da OS para compartilhamento.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.7',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Execução de OS pelo técnico',
        description: 'Fluxo completo de execução: check-in com geolocalização, preenchimento de formulário dinâmico, fotos antes/durante/depois e check-out.',
        category: 'recurso',
      },
      {
        title: 'Assinatura digital',
        description: 'Captura de assinatura do técnico e do cliente diretamente na tela de execução da OS.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.6',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Formulários dinâmicos (Questionários)',
        description: 'Criação de templates de formulário com perguntas de múltiplos tipos: texto, número, booleano, seleção, foto e assinatura.',
        category: 'recurso',
      },
      {
        title: 'Vinculação de formulários a tipos de serviço',
        description: 'Templates de formulário podem ser associados a tipos de serviço para aplicação automática nas OS.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.5',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'PMOC — Planos e Contratos',
        description: 'Gestão de contratos PMOC com frequência configurável e geração automática de OS de manutenção preventiva.',
        category: 'recurso',
      },
      {
        title: 'Geração automática de OS via PMOC',
        description: 'Edge function para criação automática de ordens de serviço com base nos planos PMOC ativos.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.4',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Módulo Financeiro',
        description: 'Controle de entradas e saídas financeiras vinculadas a clientes e OS, com filtros por período e categoria.',
        category: 'recurso',
      },
      {
        title: 'Módulo de Estoque',
        description: 'Gestão de inventário com controle de quantidade mínima, movimentações e vínculo com OS.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.3',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'CRM — Pipeline de Vendas',
        description: 'Kanban de leads com estágios personalizáveis, registro de interações e conversão para cliente.',
        category: 'recurso',
      },
      {
        title: 'Categorias de Equipamento',
        description: 'Organização de equipamentos por categorias com cores personalizáveis.',
        category: 'recurso',
      },
      {
        title: 'Campos customizados em equipamentos',
        description: 'Configuração de campos adicionais dinâmicos para fichas de equipamento.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.2',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Agenda Técnica Inteligente',
        description: 'Calendário com visões Mês, Semana e Dia, filtros por técnico/cliente/status, drag & drop e Quick Action.',
        category: 'recurso',
      },
      {
        title: 'Tipos de Serviço Configuráveis',
        description: 'Cadastro de tipos de serviço com cores personalizáveis e vinculação com formulários.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.1',
    date: '28 de fevereiro de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Sistema de Versionamento e Changelog',
        description: 'Histórico de versões com changelog filtrável por categoria, acessível pelo rodapé do sistema.',
        category: 'melhoria',
      },
      {
        title: 'Background animado no Login',
        description: 'Substituição de imagem estática por animação WebGL DarkVeil nas telas de autenticação.',
        category: 'melhoria',
      },
      {
        title: 'Gestão de Usuários e Perfis',
        description: 'Cadastro de usuários com papéis (admin, gestor, técnico, comercial, financeiro) e gerenciamento de acessos.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.0.0',
    date: '28 de fevereiro de 2026',
    type: 'major',
    changes: [
      {
        title: 'Lançamento do Sistema',
        description: 'Versão inicial com estrutura base, autenticação, layout responsivo e navegação principal.',
        category: 'recurso',
      },
      {
        title: 'Módulo de Clientes',
        description: 'Cadastro completo de clientes PF/PJ com endereço, documentos, e detalhamento individual.',
        category: 'recurso',
      },
      {
        title: 'Módulo de Equipamentos',
        description: 'Registro de equipamentos vinculados a clientes com dados técnicos, fotos e anexos.',
        category: 'recurso',
      },
      {
        title: 'Ordens de Serviço',
        description: 'Criação e gestão de OS com tipos (preventiva, corretiva, instalação, visita), status configuráveis e vínculo com clientes e equipamentos.',
        category: 'recurso',
      },
      {
        title: 'Configurações da Empresa',
        description: 'Painel de configuração com dados da empresa, logo e informações de contato exibidas nos relatórios.',
        category: 'recurso',
      },
      {
        title: 'Autenticação e Segurança',
        description: 'Login seguro com confirmação de e-mail, recuperação de senha e controle de acesso baseado em papéis (RLS).',
        category: 'seguranca',
      },
    ],
  },
];

export default function Changelog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<ChangeCategory | 'all'>('all');
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set(['1.2.10']));

  const filteredChangelog = useMemo(() => {
    return changelog
      .map((entry) => {
        const filtered = entry.changes.filter((change) => {
          const matchesFilter = activeFilter === 'all' || change.category === activeFilter;
          const matchesSearch =
            !searchTerm ||
            change.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            change.description.toLowerCase().includes(searchTerm.toLowerCase());
          return matchesFilter && matchesSearch;
        });
        return { ...entry, changes: filtered };
      })
      .filter((entry) => entry.changes.length > 0);
  }, [searchTerm, activeFilter]);

  const totalResults = filteredChangelog.reduce((acc, e) => acc + e.changes.length, 0);

  const toggleVersion = (version: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  const typeLabel: Record<string, string> = {
    major: 'Lançamento',
    minor: 'Atualização',
    patch: 'Correção',
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Histórico de Versões</p>
        <div className="flex items-center gap-2">
          <History className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Histórico de Versões</h1>
        </div>
        <p className="text-muted-foreground">
          Veja todas as mudanças e melhorias que fizemos no sistema
        </p>
        <Badge className="bg-success text-white hover:bg-success">Versão Atual: {APP_VERSION}</Badge>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar mudanças..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filterConfig.map((f) => {
              const isActive = activeFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setActiveFilter(f.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                    isActive
                      ? f.value === 'all'
                        ? 'bg-foreground text-background'
                        : f.value === 'recurso'
                        ? 'bg-success text-white'
                        : f.value === 'melhoria'
                        ? 'bg-info text-white'
                        : f.value === 'correcao'
                        ? 'bg-destructive text-white'
                        : 'bg-secondary text-secondary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
                  )}
                >
                  {f.icon && <f.icon className="h-3 w-3" />}
                  {f.label}
                </button>
              );
            })}
          </div>
          {(searchTerm || activeFilter !== 'all') && (
            <p className="text-xs text-muted-foreground">
              {totalResults} resultado{totalResults !== 1 ? 's' : ''} encontrado{totalResults !== 1 ? 's' : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Changelog Entries */}
      <div className="space-y-4">
        {filteredChangelog.map((entry) => {
          const isExpanded = expandedVersions.has(entry.version);
          const isCurrent = entry.version === APP_VERSION;

          return (
            <Card key={entry.version} className={cn(isCurrent && 'ring-2 ring-success/30')}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleVersion(entry.version)}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted rounded-t-lg transition-colors">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-lg font-bold text-foreground">Versão {entry.version}</h2>
                      <Badge className="bg-success text-white hover:bg-success">{typeLabel[entry.type]}</Badge>
                      {isCurrent && <Badge className="bg-primary text-primary-foreground hover:bg-primary">Atual</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground hidden sm:inline">{entry.date}</span>
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4">
                    <p className="text-sm text-muted-foreground mb-4 sm:hidden">{entry.date}</p>
                    <div className="space-y-4">
                      {entry.changes.map((change, i) => {
                        const config = categoryConfig[change.category];
                        return (
                          <div key={i} className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{change.title}</span>
                              <Badge className={config.className}>
                                <config.icon className="h-3 w-3 mr-1" />
                                {config.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{change.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}

        {filteredChangelog.length === 0 && (
          <div className="text-center py-12">
            <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">Nenhum resultado encontrado</h3>
            <p className="text-muted-foreground">Tente outros filtros ou termos de busca</p>
          </div>
        )}
      </div>

      {/* Versioning explanation */}
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <h3 className="text-base font-bold text-foreground">Como funciona o versionamento?</h3>
          <div className="space-y-4 divide-y divide-border">
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-success">Versão Principal (X.0.0)</p>
              <p className="text-sm text-muted-foreground">Mudanças grandes no sistema, como redesign completo ou novas funcionalidades principais.</p>
            </div>
            <div className="space-y-0.5 pt-4">
              <p className="text-sm font-bold text-primary">Nova Versão (0.X.0)</p>
              <p className="text-sm text-muted-foreground">Novas funcionalidades e melhorias importantes no sistema.</p>
            </div>
            <div className="space-y-0.5 pt-4">
              <p className="text-sm font-bold text-warning">Atualização (0.0.X)</p>
              <p className="text-sm text-muted-foreground">Correções de bugs e pequenas melhorias de usabilidade.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
