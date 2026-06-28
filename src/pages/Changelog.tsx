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
    version: '1.15.19',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'PMOC: checklists personalizados respeitam a frequência por pergunta',
        description: 'Nos contratos PMOC, quando você adiciona um checklist personalizado a uma máquina, cada pergunta dele passa a respeitar a sua própria frequência. Assim, uma pergunta configurada para "a cada 40 dias", por exemplo, aparece apenas nas visitas em que vence, em vez de aparecer em toda visita. As atividades do catálogo da norma continuam com a periodicidade da norma, sem mudança.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.18',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ajustes em "Atrasada" e no contador de checklist',
        description: 'Uma visita do contrato só passa a aparecer como "Atrasada" depois que o dia agendado realmente passa — no próprio dia ela fica apenas "Agendada". E o contador de progresso de cada checklist na visita do técnico passou a refletir o total de perguntas (por exemplo, 0 de 48), em vez de mostrar só as obrigatórias.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.15.17',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Relatório de Visitas do contrato',
        description: 'Agora todo contrato gera um Relatório de Visitas, pronto para imprimir ou salvar em PDF. Ele consolida tudo o que aconteceu no período: total de visitas e quantas foram concluídas, a porcentagem de conclusão, e visita por visita a data, o técnico responsável, os equipamentos atendidos e o resumo de conformidade (itens conformes, não conformes e respondidos). É o comprovante de manutenção do contrato reunido num único documento.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.15.16',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Contratos comuns mais completos na visita e no relatório',
        description: 'Trouxemos para os contratos comuns vários recursos que antes eram só do PMOC: na visita, o técnico passa a ver a orientação de cada item do checklist, o progresso (quantas de quantas já respondeu), a frequência de cada pergunta e, ao finalizar, pode marcar de uma vez os itens de conformidade que sobraram. Os checklists de cada equipamento também podem ser editados direto na tela do contrato (não só na criação). No relatório e na visualização da OS, os checklists ficam agrupados por equipamento e as perguntas de medição mostram a faixa esperada, sinalizando quando o valor está fora dela. Por fim, gerar ordens de serviço de períodos anteriores passou a respeitar o plano e os checklists corretos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.15',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Visita e contrato com vários checklists mais organizados',
        description: 'Quando um equipamento tem mais de um checklist, a visita agora mostra um único cabeçalho por equipamento, com os checklists agrupados e que abrem e fecham individualmente — sem cabeçalhos repetidos. Na criação do contrato, os checklists de um equipamento ficam em acordeão (abrir um fecha os outros), e o campo de assinatura ficou mais claro: o botão de confirmar só aparece depois que há uma assinatura.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.14',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Vários checklists por equipamento no contrato',
        description: 'Cada equipamento do contrato agora pode ter mais de um checklist. Ao montar o contrato, você adiciona quantos checklists quiser a um equipamento — cada um aparece no seu próprio bloco, com suas perguntas, frequências e a escolha do que entra na primeira visita. Na hora da visita, o técnico vê todos os checklists do equipamento, e o documento de Plano de Manutenção reflete todos eles. Também ficou mais fácil abrir os equipamentos: basta clicar em qualquer parte do card.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.15.13',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Acertos no checklist e no documento de manutenção',
        description: 'Corrigimos a opção "Personalizado" da frequência na tela de criar pergunta (agora abre os campos certos e dá para usar "começa vencida" em qualquer frequência), fizemos o documento de Plano de Manutenção refletir o checklist de cada equipamento exatamente como o técnico vê em campo, e garantimos que as escolhas do que entra na primeira visita não se percam ao salvar o contrato rapidamente.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.15.12',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Checklist por equipamento e controle da primeira visita',
        description: 'Cada equipamento do contrato passa a ter o seu próprio checklist, e ao montar o contrato você decide, pergunta por pergunta, o que já entra na primeira visita. O que você deixar de fora aparece só quando a frequência daquele item vencer pela primeira vez; os itens de "toda visita" entram sempre. Dá para marcar e desmarcar em massa por frequência, e a etapa de revisão do contrato explica em texto claro o que vai acontecer na primeira visita.',
        category: 'recurso',
      },
      {
        title: 'Tela de criar pergunta mais clara',
        description: 'No cadastro de uma pergunta de checklist, a frequência virou um seletor compacto (as opções avançadas só aparecem em "Personalizado"), os tipos de resposta ficaram mais fáceis de entender e o modo de resposta múltipla agora explica, em texto, o que cada opção faz.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.11',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Erro ao abrir uma ocorrência do contrato',
        description: 'Corrigimos uma falha que, em alguns casos, travava a tela ao clicar em uma ocorrência dentro de um contrato. Agora a ocorrência abre normalmente.',
        category: 'correcao',
      },
      {
        title: 'Mais controle de frequência e cadência nos contratos',
        description: 'Ficou mais fácil planejar a manutenção: a frequência de cada pergunta já pode ser definida na própria tela de criar a pergunta; importar um checklist do catálogo passa a preservar a frequência de cada item; o contrato pode usar cadências personalizadas de visita (a cada X dias, quinzenal, etc., além de mensal); e a seleção de quais serviços usam o checklist virou um seletor com busca e marcação múltipla.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.10',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Contratos mais focados no seu segmento',
        description: 'A criação de contratos ficou mais enxuta e adequada a cada tipo de empresa: o PMOC, que é específico de refrigeração e climatização, agora aparece apenas para esse segmento. Os demais segmentos passam a ter contratos sempre personalizáveis — com checklist e a frequência de cada item — sem opções avançadas que não se aplicam ao seu serviço.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.9',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Plano de Manutenção do contrato em documento',
        description: 'Agora qualquer contrato gera um documento de Plano de Manutenção, pronto para imprimir ou salvar em PDF direto do navegador. Ele reúne os dados da sua empresa e do cliente, os ambientes e os equipamentos de cada um, a lista de serviços do checklist com a frequência de cada item, e uma grade das próximas visitas indicando o que vence em cada uma. É só abrir o contrato e clicar em "Plano de Manutenção".',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.15.8',
    date: '28 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Frequência por item do checklist nos contratos',
        description: 'Agora cada pergunta de um checklist pode ter a sua própria frequência dentro de um contrato: mensal, bimestral, trimestral, semestral, anual, a cada N visitas ou personalizado (a cada X dias). Em cada visita, o técnico vê só os itens que vencem naquele momento, sem poluir a tela com o que não é da vez — e o que não estiver dentro do prazo entra na próxima visita, sem se perder. Itens sem frequência definida continuam aparecendo em toda visita, como antes.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.15.7',
    date: '27 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tela de checklists mais limpa',
        description: 'A tela de um checklist ganhou uma lista de perguntas mais enxuta e organizada: cada pergunta fica numa linha clara, mais fácil de ler, reordenar (arrastando) e gerenciar — uma diferença e tanto em checklists com muitas perguntas.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.6',
    date: '27 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Equipamentos organizados por ambiente em qualquer contrato',
        description: 'Agora qualquer contrato (não só os de manutenção) pode organizar os equipamentos por ambiente — sala, área, andar, o que fizer sentido. Cada ambiente virou uma lista; ao clicar, abre a tela daquele ambiente pra gerir os equipamentos com calma: adicionar buscando pelo nome, cadastrar um equipamento novo na hora, ver a foto, e abrir/fechar os detalhes de cada um sem o risco de remover sem querer. Equipamentos que ainda não estão em nenhum ambiente ficam num grupo "Sem ambiente" e podem ser movidos quando você quiser.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.5',
    date: '27 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Equipamentos do contrato com foto e busca',
        description: 'A aba de Equipamentos do contrato ficou mais visual: cada equipamento aparece com a foto, a marca, o modelo e a capacidade, e você pode buscar pelo nome, marca ou modelo. A lista saiu da Visão Geral para não aparecer duplicada, e nos contratos de manutenção a aba passou a se chamar Ambientes e Equipamentos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.4',
    date: '27 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Calcular carga térmica direto no ambiente do contrato',
        description: 'Ao cadastrar ou editar um ambiente no contrato de manutenção, agora dá pra calcular a carga térmica ali mesmo: clique em Calcular, informe as medidas do ambiente, a quantidade de pessoas, eletrônicos e janelas, e se há incidência de sol — o valor já entra preenchido no campo. É a mesma calculadora que o técnico usa nas ferramentas de campo.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.15.3',
    date: '26 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cadastro de funcionário reorganizado em abas',
        description: 'O cadastro e a edição de funcionário ficaram mais simples: os campos agora estão separados em duas abas — Dados e Remuneração & Acesso — e você pode salvar a qualquer momento, em qualquer aba. A foto ficou mais fácil de adicionar, os campos foram reorganizados e o botão de ponto eletrônico agora mostra Ativado/Desativado.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.2',
    date: '26 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tela de ponto por link repaginada',
        description: 'A tela onde o funcionário bate o ponto pelo link ficou com a cara de app: cabeçalho com a foto e o nome do funcionário, identidade visual da sua empresa, e as batidas do dia em uma linha do tempo. Em quem ainda não bateu o ponto, uma tela inicial mais limpa.',
        category: 'melhoria',
      },
      {
        title: 'Funcionários em lista ou cards',
        description: 'A tela de Funcionários agora deixa você ver a equipe em lista (padrão) ou em cards, do jeito que preferir — e sua escolha fica salva. O cartão de cada funcionário ficou mais compacto, com saldo, vales, bônus e faltas à vista.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.1',
    date: '26 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Extrato do funcionário repaginado, com recibos',
        description: 'O extrato de cada funcionário ficou mais claro: cada lançamento aparece em cartão, com cor e sinal certos — o que entra soma (+) e o que sai desconta (−). Você também gera recibo de pagamento e de vale, escolhendo entre folha A4 ou bobina térmica 80mm, já com os dados da sua empresa no cabeçalho.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.15.0',
    date: '26 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Ponto eletrônico por link, sem precisar de login',
        description: 'Agora cada funcionário registra o ponto por um link próprio, aberto direto no celular, sem precisar ter acesso ao sistema. Você ativa o ponto na ficha do funcionário e o link já é copiado na hora pra você enviar (no WhatsApp, por exemplo). A tela de registro mostra o nome do funcionário, fica com a identidade visual da sua empresa e tem entrada, intervalo, saída, selfie e localização. As fotos do ponto ficam bem mais leves e protegidas, e cada link exibe apenas o necessário.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.14.49',
    date: '25 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ordem de Serviço com visual repaginado',
        description: 'A tela de preenchimento e o relatório da OS ganharam um visual novo e mais consistente: cabeçalho centralizado, rodapé de ações em estilo gaveta, botões de checklist mais claros (Conforme em verde, Não-conforme em vermelho, N/A em laranja), contrato exibido dentro dos dados do cliente, check-in/check-out com endereço e técnico, e o relatório seguindo o mesmo padrão.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.48',
    date: '25 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ferramentas do Técnico virou Área do Técnico™',
        description: 'A função "Ferramentas do Técnico" passou a se chamar "Área do Técnico™". Os links e atalhos antigos continuam funcionando normalmente.',
        category: 'melhoria',
      },
      {
        title: 'Selo PMOC e detalhes do criador nas listas',
        description: 'O selo de conformidade da Lei 13.589 (PMOC) ficou mais visível com uma explicação ao passar o mouse, e nas listas você vê o nome e o e-mail de quem criou o registro ao passar o mouse na foto.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.47',
    date: '25 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Fluxo de Caixa que acompanha o período',
        description: 'O gráfico de Fluxo de Caixa do início virou linhas mais bonitas e agora muda conforme o período escolhido: dia a dia dentro de um mês, mês a mês em períodos maiores — e sem mostrar meses futuros vazios.',
        category: 'melhoria',
      },
      {
        title: 'Menu lateral recolhido alinhado',
        description: 'Ao recolher o menu lateral, os ícones voltaram a ficar centralizados e alinhados.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.46',
    date: '24 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Proposta com a marca certa no link público',
        description: 'Corrigido: o link da proposta abria com dados genéricos. Agora mostra corretamente o nome, o logo, as cores e o contato da sua empresa.',
        category: 'correcao',
      },
      {
        title: 'Botão de baixar PDF mais prático',
        description: 'Na proposta, o botão "Baixar PDF" agora flutua no canto da tela e fica sempre legível.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.45',
    date: '24 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Baixar proposta em PDF',
        description: 'A proposta ganhou o botão "Baixar PDF": cada página sai no tamanho A4 certinho, com os fundos e a marca da sua empresa, pronta pra enviar ao cliente.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.14.44',
    date: '24 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Novos modelos de proposta',
        description: 'Agora você escolhe entre modelos de proposta modernos — Vanguarda, Aurora e Prisma — em página A4, com o logo e as cores da sua empresa. Propostas longas se distribuem em várias páginas sem cortar nenhum item.',
        category: 'recurso',
      },
      {
        title: 'Configuração de proposta em etapas',
        description: 'Configurar a proposta virou um passo-a-passo com pré-visualização do documento, escolha do modelo e opções pra mostrar ou ocultar deslocamento, brindes e a numeração de páginas.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.43',
    date: '24 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Link compartilhável da proposta',
        description: 'Agora dá pra gerar um link da proposta e enviar pro cliente: ele abre direto no navegador, no celular ou no computador, sem precisar de PDF.',
        category: 'recurso',
      },
      {
        title: 'Veja quando o cliente abriu a proposta',
        description: 'Cada proposta passou a mostrar quantas vezes foi visualizada e quando foi a última vez — pra você acompanhar o interesse do cliente.',
        category: 'recurso',
      },
      {
        title: 'Logo próprio na proposta',
        description: 'Dá pra escolher um logo específico pra usar nas propostas, separado do logo da empresa.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.42',
    date: '24 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Criar orçamento em etapas',
        description: 'Criar um orçamento agora é um passo-a-passo guiado — destinatário, serviços, materiais, desconto e revisão — mais fácil de preencher tanto no celular quanto no computador.',
        category: 'melhoria',
      },
      {
        title: 'Rascunho de orçamento',
        description: 'Agora dá pra salvar um orçamento como rascunho e continuar depois: ele fica guardado na sua lista com o selo "Rascunho", de qualquer aparelho.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.14.41',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cor da marca sem piscar no carregamento',
        description: 'A cor da sua marca não pisca mais para o padrão durante os carregamentos — nas telas internas, na tela de OS e no relatório de serviço.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.40',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Telas de carregamento mais informativas',
        description: 'As telas de carregamento agora mostram o que o sistema está preparando (por exemplo, "Buscando ordens de serviço…" ou "Carregando agenda…"), com uma animação mais fluida.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.38',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Assinaturas centralizadas',
        description: 'A seção de assinaturas (título e conteúdo) passou a ficar centralizada na tela de preenchimento da OS e no relatório: uma assinatura aparece no centro do card; duas ficam lado a lado, centralizadas.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.37',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Título da seção de checklists mais correto',
        description: 'No relatório, a seção de checklists só se chama "Checklists por Equipamento" quando há equipamento de verdade. Quando a OS tem apenas checklist geral (sem equipamento), o título passa a ser simplesmente "Checklists".',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.36',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cabeçalho do checklist geral com o nome do checklist',
        description: 'No grupo de checklist sem equipamento, o cabeçalho passou a exibir o nome do próprio checklist com um ícone de checklist (no lugar do genérico "Geral / Local"), e nomes longos quebram linha em vez de cortar com "...".',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.35',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Checklist geral mais limpo',
        description: 'O grupo de checklist "Geral / Local" (checklists que não são de um equipamento específico) deixou de exibir o quadrado de foto de equipamento — aparece como um checklist limpo, na tela de preenchimento da OS e no relatório.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.34',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Correção do relatório no computador',
        description: 'Corrigido o relatório de serviço que aparecia espremido num canto no computador, em Ordens de Serviço sem equipamento vinculado (só com checklist geral). Agora ele aparece centralizado normalmente.',
        category: 'correcao',
      },
      {
        title: 'Relatório de OS comum mais limpo',
        description: 'Em OS que não são de contrato PMOC, o relatório deixou de exibir o cabeçalho "Checklists Personalizados" (que era redundante) e passou a mostrar os equipamentos e seus checklists diretamente.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.33',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Endereço no histórico de localização',
        description: 'No histórico de localização (rastreamento) da OS, os pontos de chegada, saída e "a caminho" passaram a registrar o endereço (rua, cidade e estado), exibido junto da coordenada — no computador e no celular. A busca de endereços também ficou mais robusta para não falhar quando há muitos pontos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.32',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Endereço do local no check-in, check-out e assinaturas',
        description: 'Além da coordenada, a OS passou a registrar o endereço do local (rua, cidade e estado) no check-in, no check-out e nas assinaturas. No relatório, o check-in e o check-out mostram o endereço junto da coordenada, e o selo da assinatura passa a exibir o endereço.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.31',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Histórico de PMOC no contrato (prova tarefa a tarefa)',
        description: 'No detalhe de um contrato PMOC, uma nova aba "Histórico PMOC" mostra, visita a visita e equipamento por equipamento, cada tarefa realizada — com a frequência (mensal, trimestral, etc.), o resultado (Conforme, Não Conforme ou N/A) e quando e por quem foi feita. É a comprovação, item a item, de que a Planilha PMOC está sendo cumprida ao longo do tempo.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.14.30',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Selo da assinatura mais preciso',
        description: 'O selo abaixo da assinatura agora mostra apenas a data, a hora e a localização exatas do momento em que foi confirmada (sem nome). Assim fica correto mesmo quando o cliente assina no aparelho do técnico.',
        category: 'melhoria',
      },
      {
        title: 'Telas de carregamento com mensagens',
        description: 'As telas de carregamento do sistema passaram a mostrar mensagens (Carregando, Sincronizando, Processando) abaixo da roda, deixando mais claro que algo está acontecendo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.29',
    date: '23 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Assinatura da OS mais completa',
        description: 'Agora dá para assinar com vários traços e confirmar ao final, desfazer e refazer o último traço, e o campo de assinatura e a tela cheia mostram sempre o mesmo desenho. O selo da assinatura registra a data, a hora e a localização exatas do momento da confirmação.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.28',
    date: '22 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Selo de identificação na assinatura da OS',
        description: 'Cada assinatura da Ordem de Serviço (técnico e cliente) passou a exibir um selo logo abaixo com quem assinou, o documento do cliente, a data e a hora, e a localização do atendimento — na tela e no PDF. Reforça a OS como documento, principalmente nos contratos PMOC.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.14.27',
    date: '22 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Classificação de conformidade PMOC mais clara',
        description: 'Na finalização de Ordens de Serviço de contratos PMOC, a escolha de conformidade (Conforme, Parcial ou Não-conforme) ficou mais limpa: as opções aparecem discretas, com uma cor só indicando a gravidade, e a cor cheia destaca apenas a opção que você selecionar — deixando óbvio o que foi marcado.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.26',
    date: '22 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Assinatura em tela cheia mais prática',
        description: 'A assinatura em tela cheia agora abre sempre na horizontal, segue o tema do app (claro ou escuro) com a área de assinatura sempre branca, e os botões ficaram mais claros (Limpar e Confirmar).',
        category: 'melhoria',
      },
      {
        title: 'Avisos no rodapé com botão de fechar',
        description: 'No celular, os avisos do sistema passaram a aparecer na parte de baixo da tela, com uma margem da borda e um botão de fechar (X) sempre visível.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.25',
    date: '22 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Assinatura em tela cheia na OS',
        description: 'Nos campos de assinatura da Ordem de Serviço, além de assinar direto no campo, agora dá para abrir a assinatura em tela cheia — na horizontal no celular — para assinar com mais espaço e conforto.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.24',
    date: '22 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tela de preenchimento da OS repaginada',
        description: 'O botão de Ferramentas do Técnico ganhou um novo visual, o menu de ações do rodapé ficou mais claro — com escurecimento do fundo para dar foco e botões maiores e mais fáceis de tocar — e os botões de finalizar ganharam hierarquia (Finalizar OS em destaque). A tela também passou a mostrar o rodapé com a versão do sistema.',
        category: 'melhoria',
      },
      {
        title: 'Confirmação ao finalizar a OS',
        description: 'Ao finalizar uma OS agora aparece uma confirmação, evitando concluir por engano com um toque acidental.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.23',
    date: '22 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cabeçalho do equipamento mais polido nas telas de OS',
        description: 'O cabeçalho de cada equipamento (foto, nome e tipo) ficou no mesmo formato em todas as telas de OS — preenchimento, relatório e resumo — e fixa de forma mais suave ao rolar, ocupando a largura toda da tela. A foto ficou padronizada e ajustada ao conteúdo.',
        category: 'melhoria',
      },
      {
        title: 'Informações do contrato em card padronizado',
        description: 'As informações do contrato agora aparecem em um card limpo e consistente também na execução e no acompanhamento da OS (antes só no relatório), com a referência à Lei Federal 13.589/2018 quando a OS é PMOC.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.22',
    date: '22 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Relatório de serviço mais limpo',
        description: 'As informações do contrato no relatório agora ficam reunidas em um único card, no mesmo estilo das demais seções (com a referência à Lei Federal 13.589/2018 quando a OS é PMOC). O cabeçalho do equipamento gruda rente ao topo ao rolar, e a lista de equipamentos ficou mais enxuta.',
        category: 'melhoria',
      },
      {
        title: '"Checklists da Máquina" no cadastro de contrato',
        description: 'No cadastro de contrato PMOC, o botão de checklists de cada equipamento agora se chama "Checklists da Máquina" e organiza as opções em duas seções destacadas: os modelos do catálogo PMOC e os checklists personalizados da empresa.',
        category: 'melhoria',
      },
      {
        title: 'Preenchimento da OS mais consistente',
        description: 'O cabeçalho do equipamento na tela de preenchimento da OS agora segue o mesmo padrão visual em todo tipo de OS (não só nas de contrato PMOC), e ao rolar ele ocupa a largura toda da tela para ficar mais fácil de acompanhar.',
        category: 'melhoria',
      },
      {
        title: 'Correções nas Ferramentas do Técnico',
        description: 'Corrigimos o seletor de segmento das Ferramentas do Técnico, que não abria as opções quando aberto pela tela de preenchimento da OS. No computador, o seletor ficou melhor posicionado, e o botão flutuante some enquanto as ferramentas estão abertas.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.21',
    date: '22 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ambiente do equipamento no checklist',
        description: 'No checklist da ordem de serviço e no relatório, cada equipamento agora mostra ao lado do nome o ambiente onde ele está instalado — por exemplo, "Cassete 1 | 1º Andar". Ajuda a identificar o aparelho certo em locais com vários equipamentos parecidos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.20',
    date: '22 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Relatório com botões fixos e preenchimento mais polido',
        description: 'No relatório de serviço, os botões agora ficam num rodapé fixo sempre acessível — "Baixar PDF" em destaque e "Imprimir"/"Copiar link" no menu de opções. E ao preencher a ordem de serviço, apenas o cabeçalho do equipamento aberto fica fixo no topo de cada vez (com uma leve sombra ao grudar), e o botão de Ferramentas do Técnico ganhou um lugar próprio que não atrapalha o rodapé.',
        category: 'melhoria',
      },
      {
        title: 'Nomes das seções do checklist com acento',
        description: 'Corrigimos os nomes das seções do checklist PMOC que apareciam sem acento (por exemplo, "Medições" aparecia como "Medicoes").',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.19',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Finalizar uma OS parcialmente',
        description: 'Quando não dá para concluir tudo na visita, o técnico agora pode "Finalizar Parcialmente" a OS: ela fica marcada como "Parcialmente Concluída" e aparece na lista de OS pausadas da agenda, até ser retomada e concluída de vez.',
        category: 'recurso',
      },
      {
        title: 'Cabeçalho do equipamento fixo ao preencher a OS',
        description: 'Ao preencher uma Ordem de Serviço, o cabeçalho do equipamento aberto passou a ficar fixo no topo enquanto você rola as perguntas — assim você sempre sabe em qual equipamento está.',
        category: 'melhoria',
      },
      {
        title: 'Prévia das visitas em calendário',
        description: 'Na criação de contrato, a prévia das visitas agora pode ser vista em lista ou em calendário, destacando os dias que terão visita.',
        category: 'melhoria',
      },
      {
        title: 'Revisão do contrato mais detalhada',
        description: 'A etapa final da criação de contrato agora explica em texto toda a dinâmica do contrato: unidade, ambientes, equipamentos, plano por máquina, frequência, quantas visitas e quando começam.',
        category: 'melhoria',
      },
      {
        title: 'Criação de checklist e cadastro de ambiente mais práticos',
        description: 'No Catálogo de Checklists, ao criar um checklist a partir de um modelo, o nome já vem sugerido. E no cadastro de ambientes do contrato, a foto do ambiente virou o primeiro campo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.18',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Novo tipo de resposta "Conformidade" nos checklists',
        description: 'As perguntas de checklist agora podem ser respondidas como Conforme, Não Conforme ou N/A. Os itens importados do catálogo PMOC já chegam nesse formato, em vez de "verdadeiro/falso".',
        category: 'melhoria',
      },
      {
        title: 'Foto do ambiente nos contratos',
        description: 'Cada ambiente do contrato passou a aceitar uma foto, tanto na criação quanto na edição — útil para registrar e identificar o local atendido.',
        category: 'melhoria',
      },
      {
        title: 'Catálogo de Checklists mais acessível',
        description: 'O botão "Catálogo de Checklists" agora também aparece na lista de checklists: dá para escolher os modelos, dar um nome e já criar um checklist novo pronto. O visual do catálogo ficou mais claro, e a lista de checklists ganhou título e descrição.',
        category: 'melhoria',
      },
      {
        title: 'Local do equipamento na lista do contrato',
        description: 'Na lista de equipamentos de um ambiente, o local de cada equipamento aparece ao lado do nome, facilitando identificar qual é.',
        category: 'melhoria',
      },
      {
        title: 'Foto ampliada não fechava ao clicar fora',
        description: 'Ao ampliar uma foto, clicar fora da imagem (ou apertar Esc) volta a fechar a visualização normalmente.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.17',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Checklists personalizados dentro de cada equipamento',
        description: 'No relatório de serviço PMOC, os checklists personalizados agora aparecem dentro do equipamento a que pertencem — com o nome real do checklist e logo depois dos itens da visita, organizados em seções com rótulo e divisória. No computador, a lista lateral de equipamentos passou a mostrar a foto de cada um, e clicar em um equipamento abre o checklist dele já na primeira pergunta.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.16',
    date: '21 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Catálogo de Checklists ao criar um checklist',
        description: 'Na tela de Serviços, ao montar um checklist, há agora um botão "Catálogo de Checklists" com modelos prontos para importar e ajustar. Para empresas de refrigeração/climatização, inclui os checklists do catálogo PMOC (por seção da norma) e modelos de serviço como Instalação de Split, Higienização de Split, Manutenção Preventiva e Carga de Gás — já com perguntas e descrições de exemplo. Um aviso lembra que são apenas sugestões, para cada empresa adequar aos seus processos.',
        category: 'recurso',
      },
      {
        title: 'Etapa de Ambientes do contrato mais prática',
        description: 'No cadastro de contrato PMOC: o campo de Área climatizada ganhou uma calculadora (largura × comprimento); cada equipamento aparece com a sua foto em círculo (toque para ampliar); e o botão de checklists do equipamento ficou ao lado de "Começa na visita". A separação entre ambientes e seus equipamentos também ficou mais clara.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.15',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Abrir um checklist leva você direto até ele',
        description: 'Na ordem de serviço (e no relatório), ao abrir o checklist de um equipamento, a tela rola automaticamente até o início dele, deixando o nome no topo e já mostrando as primeiras perguntas — sem precisar procurar onde abriu.',
        category: 'melhoria',
      },
      {
        title: 'Cadastro de contrato mais à prova de erro',
        description: 'No cadastro de contrato: a carga térmica agora mostra o equivalente em BTUs dentro do próprio campo; o modal não fecha mais sem querer quando você clica fora dele (fecha só no X ou nos botões); e o catálogo de checklists da máquina ficou com a hierarquia mais clara entre cada seção e os seus itens.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.14',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Checklist do relatório mais fácil de ler',
        description: 'No relatório da ordem de serviço, agora vem aberto por padrão apenas o primeiro equipamento, e abrir outro fecha o anterior — um de cada vez, para você não se perder. O nome do equipamento (ou do checklist) em foco fica fixo no topo enquanto você rola a tela. E a seção da visita PMOC ficou mais limpa, sem caixas em volta de cada equipamento.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.13',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Checklist da visita PMOC mais claro no relatório',
        description: 'Os selos de Conforme, Não Conforme e N/A de cada item ficaram mais nítidos e compactos. Cada equipamento agora mostra a sua própria foto no checklist (toque para ampliar), com nome maior e em destaque. E, no computador, ao clicar num equipamento na lista lateral, o checklist dele já abre automaticamente — tanto na ordem de serviço quanto no relatório.',
        category: 'melhoria',
      },
      {
        title: 'Preenchimento da ordem de serviço mais prático',
        description: 'Ao preencher uma ordem de serviço, abrir o checklist de um equipamento agora fecha os outros, para você focar em um de cada vez, e o nome do equipamento fica fixo no topo enquanto você desce pela lista. No celular, uma barra fixa na parte de baixo traz o botão "Finalizar OS" sempre à mão, com um menu de três pontinhos para pausar, retomar e outras ações.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.12',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Campos de número mais corretos em todo o sistema',
        description: 'Campos que devem conter apenas números (quantidades, medidas, área, carga térmica, ocupantes, distância, etc.) não aceitam mais texto. E foi corrigido o "0 grudado": ao apagar o conteúdo, o campo fica realmente vazio — antes sobrava um "0" que não dava para remover e fazia o valor virar, por exemplo, "048". Aplicado em todo o sistema (contratos, ambientes, estoque, orçamentos, ferramentas do técnico e mais).',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.11',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Relatório de serviço mais organizado',
        description: 'No relatório da ordem de serviço, o checklist da visita PMOC agora aparece junto com o restante do relatório, e não mais numa seção separada à parte. Cada checklist personalizado passa a ser mostrado com o seu próprio nome, em vez de tudo aparecer agrupado como "Outros". E os campos de assinatura ficaram centralizados, tanto no preenchimento quanto no relatório.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.10',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Status correto das faturas de cartão de crédito',
        description: 'Faturas cujo dia de fechamento já passou agora aparecem como "Fechada". Antes elas continuavam marcadas como "Aberta" mesmo depois de fechar. A fatura do mês atual, em andamento, segue como "Aberta", como esperado.',
        category: 'correcao',
      },
      {
        title: 'Ajustes visuais no app pelo celular',
        description: 'A aba selecionada de contas e cartões agora fica destacada na cor da própria conta, ficando mais fácil de identificar qual está aberta. E, na calculadora de capacitor, os seletores passaram a ficar um abaixo do outro no celular, sem texto sobreposto.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.9',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Link da OS sobrevive à edição do contrato',
        description: 'Antes, ao editar um contrato, as visitas eram recriadas com links novos e os links que você já tinha enviado ao cliente paravam de funcionar. Agora o link de cada mês é preservado: ao recalcular as visitas, o mesmo link passa a apontar para a visita atualizada daquele mês. (Links antigos no formato comprido/UUID seguem a visita antiga; use os links atuais.)',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.8',
    date: '21 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Check-in pelo link curto da OS corrigido',
        description: 'Corrigido um erro ("formato inválido") que impedia o técnico de fazer check-in (e marcar "a caminho", pausar, retomar e finalizar) ao abrir a ordem de serviço pelo novo link curto. As respostas dos checklists e a avaliação do cliente abertas por esses links também voltaram a salvar corretamente.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.7',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Links mais curtos e fáceis de reconhecer',
        description: 'Os links de contratos, ordens de serviço, clientes e equipamentos agora trazem o nome de quem se referem — o cliente, o serviço, o contrato ou o equipamento — no lugar de um código comprido e sem sentido. Ficam mais bonitos e fáceis de identificar na hora de compartilhar pelo WhatsApp. E o mais importante: todos os links antigos que você já enviou ou imprimiu, incluindo os QR Codes, continuam funcionando normalmente.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.6',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Edição e exclusão de contratos PMOC mais seguras',
        description: 'Ao editar um contrato e recalcular as visitas, as novas passam a ser geradas antes de remover as antigas — assim o contrato nunca fica sem visitas se algo der errado no meio. Excluir um ambiente agora remove os equipamentos dele do contrato e das próximas visitas (com confirmação antes). E, se o mesmo contrato for alterado em outra aba ao mesmo tempo, o sistema avisa para você recarregar em vez de sobrescrever.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.14.5',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Contrato PMOC sem visitas se conserta ao salvar',
        description: 'Corrigido: se um contrato PMOC ativo ficar sem visitas agendadas, agora basta abrir e salvar que as visitas são geradas automaticamente. E se algo falhar ao gerar as visitas, o sistema avisa, em vez de concluir o salvamento em silêncio com visitas faltando.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.4',
    date: '20 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Checklists personalizados por equipamento no PMOC',
        description: 'Agora, além dos checklists da norma, cada equipamento do contrato PMOC pode ter os seus próprios checklists. No menu de checklists da máquina há uma aba "Personalizados" com os checklists que você cria em Checklists — marque os que quiser e eles passam a ser feitos em toda visita daquele equipamento, junto com os do PMOC. No app do técnico, as perguntas aparecem no mesmo estilo do checklist da norma (conformidade, medição, foto, etc.).',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.14.3',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Montar contrato PMOC ficou mais fácil e rápido',
        description: 'Os checklists do catálogo aparecem separados por tipo (ar-condicionado e grande porte), conforme o tipo de cada equipamento. A etapa de ambientes ficou mais organizada: busca de equipamento, rolagem (sem lista gigante), um ambiente/equipamento aberto por vez, e equipamentos já usados não se repetem entre ambientes. Dá para navegar clicando direto nas etapas, o campo de data tem um seletor próprio e o salvamento ficou bem mais rápido.',
        category: 'melhoria',
      },
      {
        title: 'Edição de contrato puxando todos os dados',
        description: 'Corrigido: ao editar um contrato, a carga térmica e o número de ocupantes dos ambientes voltam preenchidos com o que estava salvo.',
        category: 'correcao',
      },
      {
        title: 'Selo de PMOC na agenda',
        description: 'As ordens de serviço de contratos PMOC agora aparecem com um selo azul "PMOC" na agenda (no card, no resumo e no detalhe), facilitando identificar de relance.',
        category: 'melhoria',
      },
      {
        title: 'Relatório do cliente em OS pausada',
        description: 'Ao pausar uma ordem de serviço, o link do cliente já mostra o relatório dos equipamentos que foram concluídos (sem data de conclusão). Os equipamentos ainda não finalizados só aparecem quando o serviço é retomado e concluído.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.14.2',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Correção na geração de visitas do PMOC',
        description: 'Corrigido um problema em contratos PMOC onde, ao editar o contrato, as visitas podiam ser geradas com atividades repetidas e com equipamentos faltando. Agora cada equipamento recebe exatamente a sua rotina, sem repetições. Além disso, o checklist de visitas grandes passou a mostrar todos os itens (antes podia cortar a lista em ordens muito extensas).',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.1',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Navegação entre equipamentos nas visitas PMOC',
        description: 'No computador, as ordens de serviço de visita de contrato PMOC voltaram a mostrar a navegação lateral de equipamentos. Cada máquina aparece com foto e situação (concluído, pendente ou com pendência); ao clicar, a tela rola até ela e já abre o seu checklist — do mesmo jeito que acontece nas demais ordens de serviço.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.14.0',
    date: '20 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'PMOC com rotina por equipamento',
        description: 'O contrato PMOC ficou muito mais fiel à realidade: agora cada equipamento tem a sua própria rotina. Para cada máquina você define se ela segue só a parte de ar-condicionado (split comum) ou toda a norma (grande porte, como VRF, Chiller e torres de resfriamento), e em qual visita do ciclo ela começa — por padrão na revisão anual completa, mas você pode escolher começar pelo mensal, trimestral ou semestral. Cada máquina pode ainda ter os seus próprios checklists, escolhidos do catálogo PMOC (com "marcar todos" por categoria). Tudo configurável tanto na criação quanto na edição do contrato (inclusive pela aba Ambientes).',
        category: 'recurso',
      },
      {
        title: 'Planilha PMOC com frequências por equipamento',
        description: 'A Planilha PMOC em PDF passou a apresentar as rotinas e as frequências separadas por equipamento, mostrando o que cada máquina faz em cada visita do ano.',
        category: 'melhoria',
      },
      {
        title: 'Contrato não perde mais o preenchimento',
        description: 'Ao criar um contrato, o que você preenche (incluindo ambientes, equipamentos e a configuração de cada máquina) passa a ser guardado automaticamente. Se o app fechar sem querer, ao reabrir você retoma de onde parou.',
        category: 'melhoria',
      },
      {
        title: 'Planilha PMOC: rodapé corrigido',
        description: 'Corrigido um detalhe visual no rodapé da Planilha PMOC, onde uma linha aparecia sobre o logotipo.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.13.16',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tarefas: editar data e repetição em qualquer lugar',
        description: 'Agora dá para editar uma tarefa — data, repetição e demais campos — tanto na Agenda quanto na aba Tarefas da ficha do cliente. Ao mudar a repetição de uma tarefa que se repete, as próximas ocorrências são refeitas automaticamente com a nova frequência (as que já passaram ou foram concluídas ficam como estão). A aba Tarefas do cliente também ganhou editar e excluir.',
        category: 'melhoria',
      },
      {
        title: 'Financeiro do cliente com "A vencer" e detalhes',
        description: 'Na ficha do cliente, a aba Financeiro agora separa em Tudo, A vencer e Pagas — incluindo as contas a vencer lançadas para aquele cliente. Cada lançamento tem um botão de "olho" que abre todos os detalhes (valor, vencimento, forma de pagamento, parcela, observações e mais).',
        category: 'melhoria',
      },
      {
        title: 'Origem padronizada entre Clientes e Oportunidades',
        description: 'O campo Origem passou a usar a mesma lista no cadastro de cliente e no cadastro de oportunidade do CRM, gerenciável também em Configurações → Usabilidade. Quem está começando pode criar um conjunto de origens padrão com um clique e editar ou excluir cada uma à vontade.',
        category: 'melhoria',
      },
      {
        title: 'CRM mais fácil de começar',
        description: 'Quando o CRM ainda não tem colunas, a tela passou a oferecer um botão que cria as etapas padrão na hora, para você já começar a arrastar as oportunidades.',
        category: 'melhoria',
      },
      {
        title: 'WhatsApp direto na oportunidade',
        description: 'Ao abrir uma oportunidade no CRM, um botão leva direto para a conversa de WhatsApp do contato, igual já acontece na tela de clientes.',
        category: 'melhoria',
      },
      {
        title: 'Telas e listas vazias mais claras',
        description: 'Em todo o sistema, listas, abas e colunas sem registros agora mostram uma mensagem clara — muitas com um atalho para a próxima ação — em vez de aparecerem em branco.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.15',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cálculo de Capacitor agora entende máquinas trifásicas',
        description: 'Ao escolher "Trifásico", a ferramenta para de sugerir capacitor (que essas máquinas não usam) e passa a calcular a contatora certa e o ajuste do relé térmico, a partir da corrente do motor/compressor ou da potência em CV.',
        category: 'recurso',
      },
      {
        title: 'Foto do componente em tela cheia',
        description: 'Nas ferramentas de Cálculo de Capacitor e Cabo Elétrico, basta tocar na foto do capacitor, da contatora ou do disjuntor para vê-la ampliada em tela cheia.',
        category: 'melhoria',
      },
      {
        title: 'Aviso de apoio nas ferramentas de cálculo',
        description: 'As ferramentas do técnico passaram a trazer um lembrete discreto no rodapé: os valores são estimativas de referência e devem ser conferidos com a placa do equipamento, os manuais do fabricante e as normas técnicas aplicáveis.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.14',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Busca de código de erro no catálogo mais enxuta',
        description: 'Ao pesquisar um código de erro que aparece em muitos modelos (por exemplo "F1"), o catálogo agora mostra as primeiras máquinas e um botão "+N mais" para abrir o restante quando você quiser — sem aquele paredão de itens de uma vez só.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.13',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Checklist da visita no relatório de serviço',
        description: 'O relatório de serviço da OS agora mostra o checklist da visita: cada item com a sua resposta (Conforme, Não-conforme ou N/A), os valores medidos e as fotos anexadas — visível também no link público compartilhado com o cliente.',
        category: 'recurso',
      },
      {
        title: 'Link da OS abre direto para o cliente',
        description: 'Quando o cliente abre o link da Ordem de Serviço sem estar logado, o sistema já entende que é a visão do cliente e abre a página pública automaticamente, com os dados da empresa e a pesquisa de satisfação.',
        category: 'correcao',
      },
      {
        title: 'Finalizar OS de PMOC com itens pendentes',
        description: 'Ao concluir uma OS de contrato PMOC que ainda tem itens do checklist sem resposta, o sistema avisa quantos faltam e deixa você escolher: voltar para preencher ou marcar os restantes como Conforme para concluir.',
        category: 'melhoria',
      },
      {
        title: 'Selos do contrato e da norma PMOC em destaque',
        description: 'No relatório de serviço, o selo do contrato e o selo de conformidade com a Lei Federal 13.589/2018 ganharam um azul mais forte, ficando mais visíveis.',
        category: 'melhoria',
      },
      {
        title: 'Pesquisa de satisfação mais clara',
        description: 'A nota de 0 a 10 da pesquisa de satisfação agora traz uma dica "Arraste aqui" abaixo do controle, ajudando o cliente a avaliar.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.12',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Nova ferramenta: calculadora de Diluição de Produto',
        description: 'Chegou a calculadora de Diluição de Produto (nas Ferramentas do Técnico, disponível na Refrigeração e no novo segmento Estética Automotiva): informe a proporção (1:N) e o volume que você quer preparar e veja na hora quanto de produto e quanto de água usar — com uma ilustração do galão mostrando as partes. Também dá para fazer o caminho inverso, partindo da quantidade de produto que você já tem.',
        category: 'recurso',
      },
      {
        title: 'Novo segmento: Estética Automotiva',
        description: 'Adicionamos o segmento Estética Automotiva na escolha de área de atuação da empresa (nas Configurações e no cadastro), com suas próprias ferramentas.',
        category: 'recurso',
      },
      {
        title: 'Retrofit de Gás: substituto mais indicado em destaque',
        description: 'Na ferramenta de Retrofit de Gás, o substituto mais recomendado para cada gás agora aparece em primeiro e com um selo "Mais Indicado" — fica mais rápido escolher a troca certa.',
        category: 'melhoria',
      },
      {
        title: 'Catálogo de fluidos mais didático',
        description: 'Os fluidos refrigerantes agora vêm separados em "Puros" e "Misturas", com explicações ao toque sobre os tipos (HFC, HCFC, HFO, blends) e classes de segurança, além de um novo glossário de nomenclatura no início das Ferramentas. O campo "Substitui" foi reescrito para deixar claro quando é troca de geração (equipamento novo) e quando é troca direta no mesmo aparelho, e os botões de ficha técnica ficaram mais visíveis.',
        category: 'melhoria',
      },
      {
        title: 'Links e atualização de página nas Ferramentas do Técnico',
        description: 'Agora você pode compartilhar o link de uma ferramenta ou de um fluido/equipamento específico, e atualizar a página sem cair no início — a tela em que você está é mantida, e o voltar do celular funciona certinho.',
        category: 'melhoria',
      },
      {
        title: 'Agenda mostra a fatura do cartão, não cada compra',
        description: 'As compras parceladas no cartão de crédito deixaram de aparecer uma a uma na agenda. Agora aparece apenas a fatura do cartão, no dia do vencimento, com o valor total a pagar — as compras seguem registradas normalmente no Financeiro.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.13.11',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ilustração do Ciclo Básico mais clara',
        description: 'Na ferramenta Ciclo Básico de Refrigeração, o diagrama foi reorganizado: o compressor agora aparece na parte de baixo e os trocadores (evaporador e condensador) ficaram centralizados, com os rótulos mais bem distribuídos — fica mais fácil acompanhar o caminho do gás pelo sistema.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.10',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ambientes do contrato voltam a aparecer',
        description: 'Na tela do contrato PMOC, a aba Ambientes voltou a listar corretamente os ambientes cadastrados e os equipamentos vinculados a cada um.',
        category: 'correcao',
      },
      {
        title: 'Cronograma anual em formato de relatório',
        description: 'Ao imprimir o cronograma de 12 meses do contrato, o PDF agora vem como um relatório em tabela — data prevista, número da OS, situação e técnico de cada visita — bem mais fácil de ler e arquivar do que o calendário anterior.',
        category: 'melhoria',
      },
      {
        title: 'Criação de contrato mais clara',
        description: 'A etapa de Frequência ficou mais simples de entender, a janela abre maior no computador, e agora é preciso indicar ao menos um técnico ou equipe responsável pela execução antes de salvar.',
        category: 'melhoria',
      },
      {
        title: 'Padrão da norma PMOC protegido',
        description: 'Ao optar por seguir o padrão da norma, as atividades ficam travadas para garantir a conformidade. Para ajustar item a item, basta desativar o padrão e personalizar as atividades.',
        category: 'melhoria',
      },
      {
        title: 'Checklist da visita organizado por equipamento',
        description: 'Durante a visita PMOC, o checklist agora separa cada equipamento em um bloco que abre e fecha (o primeiro já vem aberto), com o nome em destaque e a foto do equipamento quando houver — fica mais rápido encontrar onde marcar.',
        category: 'melhoria',
      },
      {
        title: 'Botão Voltar sempre à mão na Ordem de Serviço',
        description: 'O cabeçalho com o número da OS agora fica fixo no topo ao rolar a tela, deixando o botão Voltar sempre acessível, tanto no celular quanto no computador.',
        category: 'melhoria',
      },
      {
        title: 'Trocar o responsável do contrato atualiza as visitas pendentes',
        description: 'Ao alterar o técnico ou a equipe responsável de um contrato, as ordens de serviço ainda não realizadas passam automaticamente para o novo responsável.',
        category: 'melhoria',
      },
      {
        title: 'Aviso mais claro do que falta para os documentos PMOC',
        description: 'Quando faltam dados para gerar a Planilha PMOC, o sistema agora avisa também quando é preciso vincular o cliente ao contrato ou completar o CNPJ e o endereço dele.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.9',
    date: '20 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ferramentas do Técnico com o segmento da empresa',
        description: 'As Ferramentas do Técnico agora exibem, ao lado do título, o segmento da sua empresa. Tocando nele, abre um seletor com os demais segmentos da plataforma, para você conhecer o que mais dá para contratar.',
        category: 'melhoria',
      },
      {
        title: 'Escolha de tensão mais rápida nas calculadoras',
        description: 'Nas calculadoras de Cálculo de Capacitor e Cabo Elétrico, a tensão (110V/220V) virou uma alavanca: um toque para alternar, em vez de abrir uma lista.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.8',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Importar estoque pela NF-e do fornecedor',
        description: 'No Estoque, o botão "Importar XML (NF-e)" lê a nota fiscal de compra do fornecedor: o sistema identifica o fornecedor (pelo CNPJ) e os produtos da nota, e abre uma tela de revisão onde você confirma cada item — casando com um material que já existe ou criando um novo, com quantidade e custo. Ao confirmar, os itens recebem entrada no estoque com o custo da nota e o fornecedor é vinculado. Se a mesma nota já tiver sido importada, o sistema avisa antes de duplicar.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.13.7',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tela de Compras repaginada',
        description: 'A tela de uma compra ficou com hierarquia mais clara (nome da compra em destaque, seções organizadas) e, em cada cotação, o fornecedor aparece em destaque e as ações ficam reunidas num menu "Ações". A lista de compras também ganhou um layout mais limpo, mostrando o fornecedor aceito quando houver.',
        category: 'melhoria',
      },
      {
        title: 'Filtro por situação e código das compras',
        description: 'A lista de Compras de Material agora pode ser filtrada por situação (aberta, concluída, cancelada) e cada compra passou a ter um código sequencial próprio (#1, #2, #3...), que também serve para busca.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.6',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Criar cotação de compra mais rápido',
        description: 'Na compra, criar uma cotação agora é um único botão "Nova cotação" que abre tudo numa tela só: você escolhe (ou cadastra na hora) o fornecedor e já preenche os preços dos materiais — informando o valor unitário ou o total. Antes era preciso adicionar o fornecedor e depois editar os preços em uma etapa separada.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.5',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Configurar campos do equipamento mais completo',
        description: 'A tela de configurar campos do equipamento foi repaginada: arraste para reordenar os campos, crie campos do tipo lista de opções (com os valores que você definir), edite o tipo de um campo já criado e marque campos como obrigatórios — agora exigidos de verdade no cadastro. Renomear ficou mais claro e, no celular, dá para configurar os campos direto pela tela de Equipamentos.',
        category: 'recurso',
      },
      {
        title: 'Campos personalizados no Portal do Cliente',
        description: 'Os campos personalizados que você cadastra no equipamento agora também aparecem no Portal do Cliente, com o nome e a ordem que você definiu.',
        category: 'melhoria',
      },
      {
        title: 'Emissão de NFS-e mais simples',
        description: 'Ao salvar os dados da empresa nas configurações fiscais, o registro para emissão passa a ser feito automaticamente. Os impostos por nota saíram da configuração da empresa e agora cada serviço guarda os próprios códigos fiscais: ao emitir uma nota, basta escolher o serviço que os códigos vêm preenchidos — e se você completar algum na hora, ele fica salvo no serviço para a próxima vez.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.4',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Compra em tela própria e preços mais claros',
        description: 'Ao abrir uma compra, ela agora aparece em uma tela dedicada dentro de Compras de Material, com botão para voltar à lista — mais espaço e leitura melhor que a janela anterior. E o preenchimento de preços da cotação ficou mais intuitivo: o valor unitário e o valor total aparecem lado a lado e um é calculado automaticamente a partir do outro.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.3',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Compras de Material reorganizado',
        description: 'A área de Compras agora trabalha por Compra: você cria uma compra com a lista de materiais (do estoque ou avulsos, com quantidade e unidade) e adiciona uma cotação para cada fornecedor. Em cada cotação, os preços são preenchidos numa planilha — informando valor unitário ou total, com o total calculado na hora. Compare as cotações, aceite ou recuse cada uma e, ao aceitar, registre a entrada no estoque com um clique.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.2',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Filtro de materiais no histórico do estoque',
        description: 'No Histórico de Materiais (Kardex), o filtro por material agora lista todos os materiais cadastrados — inclusive os que ainda não tiveram nenhuma movimentação. Sem nada selecionado, continua mostrando tudo.',
        category: 'melhoria',
      },
      {
        title: 'Ações do estoque mais à mão',
        description: 'No computador, os botões de Cadastrar Material e Exportar passaram para a linha da busca, dentro da aba Estoque Atual, deixando o topo da tela mais limpo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.1',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cotações de compra mais completas',
        description: 'Na cotação de compra agora você pode incluir materiais que ainda não estão no estoque (basta informar o nome e a unidade), definir a quantidade e preencher o valor unitário OU o valor total — um calcula o outro automaticamente. Também dá para duplicar uma cotação. Ao registrar a entrada, os materiais novos são criados no estoque na hora.',
        category: 'melhoria',
      },
      {
        title: 'Navegação do Estoque mais organizada',
        description: 'A tela de Estoque passou a usar um menu lateral no computador e abas deslizantes no celular, com o título de cada seção sempre visível.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.13.0',
    date: '19 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Histórico de movimentações do estoque (Kardex)',
        description: 'O Estoque agora tem abas. Na nova aba "Histórico (Kardex)" você vê cada movimentação de cada material — entradas, saídas, ajustes e transferências — com quem fez, a data e o saldo antes e depois. Toda edição manual de quantidade passa a ficar registrada como ajuste, com filtros por período, material e tipo.',
        category: 'recurso',
      },
      {
        title: 'Compras de Material com cotação de fornecedores',
        description: 'Nova aba "Compras de Material": cadastre seus fornecedores e crie cotações lançando os materiais e o preço de cada fornecedor lado a lado. O sistema destaca o mais barato e você aprova a melhor proposta. Quando o material chega, um clique registra a entrada no estoque.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.53',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Exportar o estoque em PDF ou Excel',
        description: 'A tela de Estoque ganhou um botão Exportar. Ao escolher PDF ou Excel, você seleciona quais materiais incluir (todos vêm marcados por padrão) e gera o relatório na hora. O PDF traz os dados da sua empresa no topo, a lista completa dos materiais com quantidades e preços, e o valor total em estoque.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.52',
    date: '19 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Fotos no checklist da visita de PMOC',
        description: 'Durante o preenchimento do checklist de uma visita de PMOC, o técnico agora pode anexar fotos em cada item para comprovar o serviço — quantas precisar, pela câmera ou pela galeria. Quando o item é marcado como não-conforme, o sistema destaca o anexo de foto como evidência recomendada.',
        category: 'recurso',
      },
      {
        title: 'Instruções de como executar cada atividade do PMOC',
        description: 'Cada atividade do checklist da visita de PMOC agora traz uma orientação curta de como executá-la, exibida logo abaixo do título — visível apenas para o técnico durante o preenchimento. Ajuda a padronizar o serviço em campo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.51',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Foto do disjuntor e do capacitor recomendado',
        description: 'Nas ferramentas Cabo Elétrico e Cálculo de Capacitor, agora aparece uma foto do componente recomendado (disjuntor ou capacitor) junto com as especificações — tipo, corrente/capacitância, tensão e padrão. Fica mais fácil reconhecer a peça certa na hora da compra.',
        category: 'melhoria',
      },
      {
        title: 'Barra de ferramentas centraliza no celular',
        description: 'Ao abrir uma ferramenta do técnico pelo celular, a barra de navegação agora rola sozinha para deixar a ferramenta atual à vista, em vez de ficar presa no começo.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.12.50',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Retrofit de Gás virou ferramenta própria',
        description: 'O Retrofit de Gás saiu de dentro da Conversão e agora é uma ferramenta separada nas Ferramentas do Técnico, listada logo depois da Régua de Gases. Mesmo conteúdo, mais fácil de encontrar.',
        category: 'melhoria',
      },
      {
        title: 'Régua de Gases: alavanca Dew/Bubble mais clara',
        description: 'A alavanca de fórmula agora fica travada quando o gás não tem glide — nesses casos Dew e Bubble dão o mesmo resultado, então não fazia diferença alterná-la. A observação sobre quais gases têm glide também foi corrigida.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.12.49',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Navegue entre marcas com setas no Catálogo',
        description: 'No Catálogo de Equipamentos, a faixa de marcas ganhou setas para os lados — dá pra passar de uma marca para a outra com um toque, sem precisar arrastar.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.48',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Gases do compressor com cores e alerta de inflamável',
        description: 'Na ficha técnica de cada compressor, os gases compatíveis passaram a aparecer como badges individuais, cada um na cor do gás, com ícone de fogo (e aviso "Inflamável") quando o gás é inflamável. Na lista de compressores, os de câmara fria deixaram de exibir a longa lista de gases amontoada, deixando o card mais limpo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.47',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Selo "Câmara frigorífica" nos compressores',
        description: 'Os compressores de refrigeração comercial (semi-herméticos, scroll e herméticos comerciais) agora aparecem com um selo "Câmara frigorífica" no Catálogo de Equipamentos, separando-os dos de geladeira e de ar-condicionado. Também completamos a foto de mais modelos de compressor.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.46',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Criação de contrato ainda mais organizada',
        description: 'Agora você define os equipamentos antes de escolher a frequência — a ordem natural: primeiro o que será mantido, depois com que frequência. Os campos de equipe e cobrança ganharam uma etapa só deles, e a primeira tela ficou bem enxuta.',
        category: 'melhoria',
      },
      {
        title: 'Transições suaves entre etapas',
        description: 'As telas que têm várias etapas — criação de contrato, ordem de serviço, cadastro e recuperação de senha — agora deslizam suavemente de uma etapa para a outra, deixando a navegação mais agradável. Quem prefere menos animações no aparelho continua sendo respeitado.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.45',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Criação de contrato mais clara, passo a passo',
        description: 'Ao montar um contrato PMOC, o Responsável Técnico e o endereço da unidade agora ficam em uma etapa só deles — a primeira tela ficou mais enxuta e fácil de preencher, na ordem certa.',
        category: 'melhoria',
      },
      {
        title: 'Cadastre o equipamento na hora, dentro do ambiente',
        description: 'Ao definir os ambientes de um contrato, dá pra cadastrar um equipamento novo do cliente sem sair da tela — ele já entra vinculado àquele ambiente. Antes era preciso cadastrar o equipamento à parte primeiro.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.44',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Alerta de gás inflamável e mais fotos de compressores',
        description: 'Na seção Fluidos Refrigerantes, os gases inflamáveis (como R-290, R-32, R-600a e R-1234yf) agora exibem um ícone de fogo na lista e no detalhe, deixando claro o cuidado necessário. Também completamos logos de fabricantes e fotos de mais compressores no catálogo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.43',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Contratos com serviços de frequências diferentes',
        description: 'Agora um mesmo contrato pode ter vários serviços com periodicidades diferentes — por exemplo, limpar o filtro todo mês, lavar a serpentina a cada trimestre e verificar o gás uma vez por ano. O sistema monta sozinho o calendário de visitas, juntando numa única visita do mês tudo que vence ali (a visita do 12º mês, por exemplo, já traz o mensal, o trimestral, o semestral e o anual de uma vez). Cada visita nasce com o checklist certo daquele período. Vale para qualquer contrato, não só PMOC.',
        category: 'recurso',
      },
      {
        title: 'Checklist por equipamento no app do técnico',
        description: 'Na ordem de serviço da visita, o técnico vê o checklist agrupado por equipamento, com as atividades daquele mês, campos de medição com a faixa esperada (avisa quando o valor sai da faixa) e a marcação de conforme / não conforme. O status de conformidade da ordem se atualiza sozinho.',
        category: 'recurso',
      },
      {
        title: 'PMOC pela norma + Planilha PMOC em PDF',
        description: 'Ao marcar um contrato como PMOC, o plano de manutenção já vem preenchido com as atividades e periodicidades previstas na norma (filtros, serpentinas, medições, etc.), tudo editável. E dá para gerar a Planilha PMOC em PDF — com a identificação, o responsável técnico, a relação dos equipamentos e o plano de manutenção por periodicidade ao longo de 12 meses — disponível avulsa e dentro do dossiê.',
        category: 'recurso',
      },
      {
        title: 'Gestão de contrato mais completa',
        description: 'Nova aba de Equipamentos no contrato (adicionar e remover aparelhos), botão de Renovar / Estender o contrato com um clique e um aviso quando o contrato está chegando ao fim. Ao editar datas ou frequência, as visitas futuras são recalculadas automaticamente — preservando as que já foram realizadas ou estão em andamento.',
        category: 'melhoria',
      },
      {
        title: 'Excluir contrato preserva os recebimentos',
        description: 'Ao excluir um contrato, os pagamentos já recebidos deixam de ser apagados — continuam no seu caixa e nos relatórios. Apenas as cobranças ainda em aberto são removidas.',
        category: 'correcao',
      },
      {
        title: 'Correções no app e na geração de documentos',
        description: 'Corrigimos o logo que podia aparecer invisível no topo do app no tema claro (celular) e uma falha que impedia gerar o dossiê PMOC quando a logomarca da empresa era um arquivo muito grande.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.12.42',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Nova seção: Fluidos Refrigerantes',
        description: 'O Catálogo de Equipamentos ganhou a aba Fluidos Refrigerantes, com os gases mais usados (R-410A, R-32, R-22, R-404A, R-134a, R-290, R-600a, R-1234yf, amônia, CO2 e outros). Cada gás traz suas especificidades — composição, tipo, GWP, ODP, ponto de ebulição, classe de segurança, óleo compatível e qual gás ele substitui — e tem download da ficha técnica; quando disponível, também o guia oficial do fabricante.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.41',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Manual técnico/de instalação no Catálogo de Equipamentos',
        description: 'Trocamos o manual da maioria dos ar-condicionados pelo manual técnico/de instalação oficial do fabricante — o documento que o técnico usa em campo, no lugar do manual do usuário. Também adicionamos o manual oficial em geladeiras e lavadoras que estavam sem. Cada item mostra que tipo de manual está disponível.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.40',
    date: '18 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ferramentas do Técnico mais agradáveis no computador',
        description: 'No computador, os campos e resultados das Ferramentas do Técnico (Carga Térmica, Superaquecimento, Conversão, Capacitor, Cabo Elétrico, Régua de Gases e Ciclo de Refrigeração) deixaram de esticar por toda a largura da tela. Agora aparecem numa largura confortável e centralizada, mais fáceis de ler e preencher. O Catálogo de Equipamentos segue usando a tela inteira, por ser uma grade de itens.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.39',
    date: '17 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Lista de gás organizada em seções no Superaquecimento',
        description: 'A lista de fluido refrigerante da ferramenta de Superaquecimento agora vem organizada em seções (Atuais, Gases Legado e Substitutos), do mesmo jeito que já acontece na Régua de Gases. Assim fica mais fácil e rápido encontrar o gás certo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.38',
    date: '17 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Diagnóstico passo a passo e Solução nos códigos de erro',
        description: 'Cada código de erro do Catálogo de Equipamentos agora traz um diagnóstico em passos — o que verificar e o que fazer, do mais provável e barato ao mais caro — e uma seção "Solução" com a ação final. Vale para ar-condicionado e linha branca (geladeiras e lavadoras), pensado para resolver mais rápido no campo.',
        category: 'recurso',
      },
      {
        title: 'Compressores de câmara frigorífica no catálogo',
        description: 'A seção de Compressores ganhou os modelos de refrigeração comercial e câmara frigorífica (Bitzer, Copeland, Danfoss/Maneurop e outros), separados por tipo (semi-hermético, scroll), com a aplicação (baixa ou média temperatura), o gás e a ficha técnica.',
        category: 'recurso',
      },
      {
        title: 'Consumo de energia revisado',
        description: 'Revisamos a potência (W) e o consumo (kWh/mês) de todos os ares-condicionados e geladeiras do catálogo, corrigindo valores fora do padrão para ficarem coerentes por capacidade e tecnologia — inverter consumindo menos que convencional de mesma capacidade.',
        category: 'melhoria',
      },
      {
        title: 'Tipo do manual em destaque',
        description: 'Cada equipamento agora indica que tipo de manual está disponível — Instalação, Serviço, Usuário, Guia Rápido ou Datasheet — direto no botão de download.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.37',
    date: '17 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'As ferramentas do técnico não perdem mais o cálculo',
        description: 'Antes, ao sair de uma ferramenta (como a de Carga Térmica) e voltar, os valores digitados sumiam e o cálculo era perdido. Agora as ferramentas — Carga Térmica, Superaquecimento, Régua de Gases, Capacitor, Cabo Elétrico, Conversão e Ciclo de Refrigeração — guardam o que você preencheu. Ao trocar de ferramenta e voltar, os valores e o resultado continuam lá. O conteúdo fica salvo enquanto o app está aberto.',
        category: 'correcao',
      },
      {
        title: 'Régua de Gases: digite a temperatura OU a pressão',
        description: 'Na Régua de Gases, agora você pode digitar tanto a temperatura quanto a pressão. Ao informar a pressão, a temperatura e a régua se ajustam sozinhas (e ao informar a temperatura, a pressão acompanha, como antes). Com isso, a consulta de "pressão para temperatura" — que ficava em uma aba separada no Superaquecimento — passa a viver na própria Régua, de forma mais simples e direta. A aba "Consulta P×T" do Superaquecimento foi removida.',
        category: 'melhoria',
      },
      {
        title: 'Retrofit de gás repaginado, com pressões de trabalho',
        description: 'A ferramenta de troca de gás (retrofit), dentro de Conversão, foi reformulada. Agora você escolhe o gás antigo (R-22, R-404A, R-12 ou R-502) e vê na hora quais refrigerantes podem substituí-lo, e — para os gases com dados confirmados — a pressão de trabalho de cada substituto na baixa (evaporação) e na alta (condensação), facilitando a comparação com o manifold. Vários desses gases também entraram na Régua de Gases, agora organizada em seções (Atuais, Gases Legado e Substitutos) para achar mais rápido.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.36',
    date: '17 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Selo da Lei do PMOC nas ordens de serviço',
        description: 'As ordens de serviço que fazem parte de um contrato de PMOC agora exibem o selo de conformidade com a Lei Federal 13.589/2018. Ele aparece tanto na hora de preencher ou abrir a ordem quanto no link público que o cliente recebe, deixando claro para todos que aquele atendimento faz parte de um plano de manutenção em conformidade com a lei. Ordens que não pertencem a um contrato de PMOC continuam sem o selo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.35',
    date: '17 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Concluir cobranças direto na agenda',
        description: 'Os lembretes de cobrança dos contratos que aparecem na agenda (como "A Receber: Mensalidade") agora têm o botão "Concluir Cobrança". Assim, quem cuida das cobranças pode marcar um lembrete como resolvido — e reabrir, se precisar — sem precisar excluí-lo. O lembrete continua na agenda, agora marcado como concluído, igual a uma tarefa finalizada. Importante: concluir o lembrete não dá baixa no financeiro; a parcela continua normalmente em Contas a Receber.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.34',
    date: '17 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Endereço de serviço diferente do cadastro do cliente',
        description: 'Ao criar ou editar uma ordem de serviço, você agora pode informar um endereço de serviço próprio para aquele atendimento — útil quando o cliente é cadastrado em um endereço (a matriz, por exemplo) mas o serviço acontece em outro local, como uma filial, obra ou evento. Quando preenchido, o mapa da rota, o endereço exibido e os atalhos do Waze e do Google Maps passam a usar o endereço do atendimento; quando não, continuam usando o endereço do cliente, como antes.',
        category: 'recurso',
      },
      {
        title: 'Mapa da rota mais rápido',
        description: 'O endereço dos clientes passou a ser localizado e guardado, então o mapa da rota até o cliente abre na hora, sem precisar recalcular a localização a cada vez.',
        category: 'melhoria',
      },
      {
        title: 'Correção ao abrir ordens de serviço',
        description: 'Corrigimos um problema que, em alguns casos, impedia abrir uma ordem de serviço (a tela mostrava "Erro ao carregar"). Agora as OS abrem normalmente.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.12.33',
    date: '17 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Rota até o cliente ao iniciar o deslocamento',
        description: 'Ao marcar que está a caminho em uma ordem de serviço, o técnico agora vê o mapa da rota até o endereço do cliente — com um botão para abrir em tela cheia — e atalhos para abrir a navegação direto no Waze ou no Google Maps. (O mapa do app é uma prévia do trajeto; a navegação guiada por voz é feita pelo Waze/Google Maps.)',
        category: 'recurso',
      },
      {
        title: 'Melhorias de uso no celular e no Catálogo',
        description: 'A lista de OS Pausadas agora rola normalmente no celular; telas deixaram de ficar cobertas pela barra de status do iPhone; e, no Catálogo de Equipamentos, o consumo de energia ganhou ajuste de horas de uso por dia (com geladeiras consideradas em uso contínuo) e leitura mais clara.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.32',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Consumo de energia mais coerente e que responde ao uso',
        description: 'No Catálogo de Equipamentos, o consumo por hora e por mês agora andam sempre juntos e respondem às horas de uso por dia: ao mudar a tarifa ou as horas no botão Ajustar de um equipamento, todos os equipamentos abertos recalculam na hora. As logos das marcas também ficaram padronizadas, com tamanho uniforme.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.31',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Filtro por gás no Catálogo de Ar-Condicionado',
        description: 'A seção de ar-condicionado do Catálogo de Equipamentos agora tem um filtro por gás refrigerante: marque um ou mais gases para ver só os modelos que usam aquele fluido. Cada gás aparece com a sua cor e, quando é inflamável, com o ícone de fogo. Sem nada marcado, a lista mostra todos os modelos.',
        category: 'melhoria',
      },
      {
        title: 'Aba Retrofit de Gás mais fácil de usar',
        description: 'A aba Retrofit de Gás (na ferramenta de Conversão) foi reorganizada: você escolhe o gás atual em uma chave (R-22 ou R-404A) e vê apenas as opções de troca daquele gás, em cartões mais limpos, com o que pode ser trocado no próprio equipamento, o tipo de óleo, o comportamento de pressão e os cuidados.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.30',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Aviso de gás inflamável nas Ferramentas do Técnico',
        description: 'Em todas as telas que mostram o gás refrigerante (Régua de Gases, Superaquecimento, Catálogo de Equipamentos, ficha de compressor e Retrofit de Gás), os gases inflamáveis passam a exibir um ícone de fogo ao lado do nome: vermelho para os altamente inflamáveis (como o R-290) e âmbar para os levemente inflamáveis (como o R-32). Toque no ícone para ver o aviso. Os gases não inflamáveis continuam sem marcação.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.29',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Consumo de energia no Catálogo de Equipamentos',
        description: 'Ao abrir um ar-condicionado ou uma geladeira/lavadora no Catálogo de Equipamentos, agora aparece o consumo de energia do aparelho — por hora e por mês, em kWh e com o gasto estimado em reais. Você pode ajustar a tarifa (R$/kWh) e as horas de uso por dia, e essa preferência fica salva no seu aparelho. Quando o consumo de um modelo ainda não está cadastrado, o catálogo mostra "não informado" em vez de um valor estimado.',
        category: 'recurso',
      },
      {
        title: 'Retrofit de Gás na ferramenta de Conversão',
        description: 'A ferramenta de Conversão ganhou a aba Retrofit de Gás: uma tabela de consulta rápida para a troca de refrigerante do R-22 e do R-404A. Ela mostra quais gases substituem cada um, deixando claro o que pode ser trocado no próprio equipamento e o que só funciona em equipamento novo, além do tipo de óleo, do comportamento de pressão, dos cuidados e do aviso de gases inflamáveis.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.28',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Catálogo de Equipamentos com carregamento de fotos mais suave',
        description: 'As fotos de marcas e equipamentos do Catálogo de Equipamentos agora carregam com mais elegância: enquanto a imagem chega, aparece um indicador discreto no lugar dela, e a foto surge com uma transição suave em vez de pular de repente na tela. Uma experiência mais agradável, principalmente em conexões mais lentas.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.27',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Domiflix com visual renovado e navegação mais fácil no celular',
        description: 'A Domiflix ganhou um acabamento mais bonito e ficou mais fácil de usar no celular: agora tem uma barra de navegação na parte de baixo da tela e um menu rápido para chegar nos vídeos com menos toques. As capas dos conteúdos, o player de vídeo, a tela de detalhes e a página de perfil também foram atualizados para uma experiência mais agradável.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.26',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Linha Branca com mais modelos e busca por código de erro',
        description: 'Adicionamos várias geladeiras e lavadoras das marcas mais conhecidas (Brastemp, Consul, Electrolux, LG e Samsung) à Linha Branca do Catálogo de Equipamentos, e as marcas mais populares agora aparecem primeiro na lista. Também corrigimos a busca por código de erro na Linha Branca: digite o código e veja na hora o significado e o modelo correspondente, como já acontece no Ar Condicionado.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.25',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Catálogo de Equipamentos agora com Linha Branca',
        description: 'O Catálogo de Equipamentos, nas Ferramentas do Técnico, ganhou a seção de Linha Branca: geladeiras, lavadoras e lava e seca das marcas mais comuns. Cada equipamento traz foto, manual para baixar e a tabela de códigos de erro com o significado de cada código — para diagnosticar mais rápido. Quando um modelo não tem códigos publicados pelo fabricante, o catálogo deixa isso claro em vez de abrir uma lista vazia.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.24',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Critérios da pesquisa de satisfação agora são seus',
        description: 'Nas Configurações de NPS você passa a montar os próprios critérios de estrela que aparecem na avaliação: pode criar novos, renomear, reordenar, ativar/desativar e remover. Os critérios de qualidade, pontualidade e profissionalismo já vêm prontos para você ajustar como quiser.',
        category: 'recurso',
      },
      {
        title: 'Avaliação do cliente mais simples e bonita',
        description: 'Ao abrir o link de acompanhamento de uma ordem de serviço concluída, a pesquisa de satisfação agora aparece já aberta para o cliente. E a nota de 0 a 10 ganhou um visual mais amigável: uma carinha que reage conforme a nota e uma régua colorida, bem mais fácil e agradável de responder no celular.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.23',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Pesquisa de satisfação no acompanhamento da OS',
        description: 'Agora, quando uma ordem de serviço é concluída, o próprio link de acompanhamento que o cliente já tem passa a exibir uma avaliação rápida: ele dá uma nota de 0 a 10 com um toque e, se quiser, avalia qualidade, pontualidade e profissionalismo e deixa um comentário. Você define o texto da pergunta, escolhe se as estrelas são obrigatórias e decide se cada ordem de serviço gera a pesquisa ao ser finalizada — tudo nas Configurações de NPS.',
        category: 'recurso',
      },
      {
        title: 'Painel de NPS com ranking de técnicos',
        description: 'A aba NPS e Satisfação ficou mais completa: além das notas e gráficos, você acompanha o ranking dos técnicos (com média de nota e taxa de resposta), um feed de feedbacks que dá para filtrar por promotores, neutros e detratores, e um espaço com os clientes insatisfeitos que precisam de um retorno.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.22',
    date: '16 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Catálogo de Equipamentos com Compressores e Controles Remotos',
        description: 'O Catálogo de Equipamentos, nas Ferramentas do Técnico, cresceu. Além dos aparelhos de ar-condicionado, agora tem uma seção de Compressores — com ficha técnica completa (gás, capacidade, tensão, capacitores e mais) — e uma seção de Controles Remotos, com os detalhes técnicos de cada um: como configurar, como destravar, códigos para controle universal, explicação dos modos e símbolos e dicas para quando o controle não responde. Cada item com foto para facilitar a identificação.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.21',
    date: '15 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Níveis no módulo de Notas Fiscais',
        description: 'O módulo de Notas Fiscais agora trabalha com níveis, cada um com uma quantidade de notas fiscais por mês. Na tela de Notas Fiscais você acompanha quantas já emitiu no mês. Se atingir o limite do seu nível, dá para subir de nível na hora, com um clique — e a nota que você estava emitindo é concluída automaticamente, sem precisar digitar tudo de novo. Quem precisa de volume ilimitado também tem um nível para isso.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.20',
    date: '15 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Distribuição do saldo entre contas na Visão Geral',
        description: 'A Visão Geral do Financeiro agora mostra um gráfico de distribuição do seu saldo entre as contas, acompanhado de etiquetas coloridas com o valor de cada conta. Passe o mouse sobre uma fatia para ver o valor e o percentual que ela representa. No computador, o gráfico aparece ao lado do saldo total; no celular, logo abaixo dele.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.19',
    date: '15 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Termos de Uso disponíveis no sistema',
        description: 'Os Termos de Uso do Dominex agora ficam sempre disponíveis para consulta dentro do sistema, em Configurações › Empresa, com opção de baixar em PDF a qualquer momento. No primeiro acesso, pedimos a leitura e o aceite dos termos para continuar usando a plataforma — e a data do seu aceite fica registrada e visível.',
        category: 'recurso',
      },
      {
        title: 'Sino de notificações mais útil',
        description: 'O sino de notificações agora avisa você sobre novidades importantes — começando pelos Termos de Uso — com as notificações organizadas por data (Hoje, Ontem, Esta semana e Anteriores) para você encontrar tudo mais fácil.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.18',
    date: '15 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Catálogo de Equipamentos mais fácil de navegar',
        description: 'Dentro de uma marca você agora troca de marca por um carrossel (deslize para o lado) e pode buscar e filtrar por potência (BTUs) e tipo ali mesmo, com os modelos ordenados da menor para a maior potência. Cada equipamento ganhou um selo de tipo (Hi-Wall, Cassete, Piso-Teto, Janela...) e a tela mostra o total de equipamentos catalogados. Também adicionamos os aparelhos de janela (ACJ) ao catálogo.',
        category: 'melhoria',
      },
      {
        title: 'Novo ícone do aplicativo',
        description: 'O aplicativo ganhou um novo ícone. Se você já instalou o Dominex na tela inicial, pode ser necessário remover e adicionar novamente o atalho para ver o ícone atualizado.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.17',
    date: '14 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Catálogo de Equipamentos completo',
        description: 'O Catálogo de Equipamentos (Ferramentas do Técnico) agora traz a foto de cada modelo em destaque (toque para ampliar), manuais em PDF para baixar e códigos de erro com diagnóstico de 17 marcas populares. Você pode buscar e filtrar por potência (BTUs) e tipo (Hi-Wall, Cassete, Piso-Teto, Multi-Split) tanto no catálogo todo quanto dentro de uma marca, com os modelos ordenados da menor para a maior potência. Cada equipamento mostra marca, categoria e potência, com botões diretos de "Códigos de erro" e "Baixar manual".',
        category: 'recurso',
      },
      {
        title: 'Segmento de Atuação da empresa',
        description: 'Em Configurações › Empresa você agora define o Segmento de Atuação da sua empresa. As ferramentas específicas de refrigeração e climatização aparecem para empresas desse segmento.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.16',
    date: '14 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Termos de elétrica no glossário',
        description: 'A seção de termos técnicos (tela inicial das Ferramentas do Técnico) ganhou o grupo "Elétrica e Instalação", explicando em linguagem simples bitola do cabo, disjuntor, monopolar/bipolar, queda de tensão, ampacidade, corrente de projeto e NBR 5410 — os conceitos usados na ferramenta de Cabo Elétrico.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.15',
    date: '14 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cabo Elétrico nas Ferramentas do Técnico',
        description: 'Nova ferramenta "Cabo Elétrico": informe a capacidade (BTU), a tensão e a distância até o quadro elétrico, e veja a bitola do cabo (mm²) e o disjuntor recomendados, com base na NBR 5410. O campo de BTU permite escolher uma capacidade comum ou digitar uma personalizada, e a Conversão agora já abre com o valor "1" convertido para você ajustar a partir daí.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.14',
    date: '14 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Validade nos documentos do contrato (TRT e Certificado)',
        description: 'Os documentos de conformidade do contrato — TRT e Certificado de Conformidade — agora têm prazo de validade (por padrão, 1 ano a partir da emissão). Cada documento mostra "válido até" com um selo colorido indicando se está em dia, se vence em breve (faltando 30 dias) ou se já venceu, e o contrato exibe um aviso quando há algum documento vencido. Essa validade também aparece para o cliente no portal e entra automaticamente no texto do documento. Nas Configurações de documentos, você pode definir a duração da validade de cada tipo.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.13',
    date: '14 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ciclo de Refrigeração nas Ferramentas do Técnico',
        description: 'Nova aba "Ciclo de Refrigeração": um diagrama interativo do ciclo — toque em cada parte (compressor, evaporador, condensador, válvula, linhas) para entender o que faz — com uma versão em imagem 2D que acompanha o tema, mais um glossário do ciclo. A seção de termos técnicos da tela inicial passou a agrupar por categorias e ganhou busca.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.12',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Superaquecimento por modelo/fabricante',
        description: 'No Superaquecimento, escolha o modelo/fabricante do equipamento e o app indica a faixa ideal de superaquecimento e subresfriamento conforme a referência daquele fabricante — avisando quando a marca não publica esse dado. A tela ganhou uma ilustração do ciclo de refrigeração e avisos reforçados de que os valores são estimativas; sempre confira o manual do fabricante.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.11',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Régua de Gases e Superaquecimento aprimorados',
        description: 'A Régua de Gases ganhou escala dupla (pressão e temperatura juntas), com seleção de gás e de fórmula (bolha/orvalho). E no Superaquecimento, quando a pressão informada está fora da faixa na unidade escolhida, o app avisa e oferece recalcular na unidade certa.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.10',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Régua de Gases',
        description: 'Nova ferramenta: escolha a temperatura e veja na hora a pressão de saturação dos principais gases refrigerantes (R-410A, R-22, R-32, R-134a, R-290 e R-404A) — a régua do manômetro, agora digital. Também converte pressão em temperatura.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.9',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Superaquecimento e Subresfriamento',
        description: 'Nova ferramenta para calcular o superaquecimento e o subresfriamento a partir da pressão e da temperatura medidas em campo, já indicando se está na faixa ideal — apoiada em tabelas de saturação dos principais refrigerantes.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.8',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cálculo de Capacitor mais preciso',
        description: 'O Cálculo de Capacitor ganhou o modo Preciso: informe o LRA do compressor (na etiqueta) e veja o capacitor exato. O modo por BTU continua disponível como estimativa rápida.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.7',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Atalhos nas Ferramentas do Técnico',
        description: 'A tela inicial das Ferramentas do Técnico passou a mostrar seus Favoritos e itens Recentes (conversões feitas e equipamentos abertos) para acesso rápido, e a Conversão ganhou atalhos para os pares mais usados (°C→°F, bar→psi, HP→BTU/h, mm→pol).',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.6',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tipo de serviço correto na agenda e nas ordens',
        description: 'Ao escolher o tipo de serviço de uma ordem (como Instalação Split, Garantia ou PMOC), agora é esse tipo que aparece na agenda, na lista de ordens, no app do técnico e no relatório — em vez de um tipo genérico. A cor do tipo continua a mesma.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.12.5',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Segurança ao preencher OS pausada',
        description: 'Enquanto uma ordem de serviço estiver pausada, o preenchimento fica bloqueado com um aviso claro — é preciso retomar o atendimento antes de continuar, evitando registros por engano.',
        category: 'melhoria',
      },
      {
        title: 'Calculadoras com resultado em tempo real',
        description: 'A carga térmica e a conversão de unidades agora mostram o resultado na hora, conforme você digita ou ajusta os valores — sem precisar tocar em calcular.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.4',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tela inicial e Glossário nas Ferramentas do Técnico',
        description: 'A área de Ferramentas do Técnico ganhou uma tela inicial com acesso rápido a cada ferramenta e um glossário que explica os termos e unidades técnicas (BTU, capacitor, HP, pressão, temperatura e mais) com exemplos práticos.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.3',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Busca no catálogo de equipamentos',
        description: 'No catálogo de equipamentos, agora dá para buscar por marca, modelo ou código de erro de uma vez — e ver em quais máquinas cada código de erro acontece.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.2',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cálculo de Capacitor',
        description: 'Nova ferramenta: informe o BTU (modelos padrão ou personalizado) e a tensão e veja o capacitor recomendado, a corrente (amperagem) e a potência do equipamento.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.12.1',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ferramentas do Técnico dentro da ordem de serviço',
        description: 'Durante o preenchimento de uma OS, um botão abre as Ferramentas do Técnico em tela cheia sem sair da ordem — ao voltar, você retorna exatamente de onde parou, sem perder nada.',
        category: 'melhoria',
      },
      {
        title: 'Copiar link do cliente no menu de ações',
        description: 'O link público de acompanhamento da ordem de serviço passou para o menu de ações (três pontinhos) durante o preenchimento, deixando a tela mais limpa.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.12.0',
    date: '13 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Ferramentas do Técnico',
        description: 'Nova área no menu Operacional com utilidades para o dia a dia em campo: calcule a capacidade de BTUs ideal para o ambiente (carga térmica), converta unidades de temperatura, pressão, potência e comprimento, e consulte o catálogo de equipamentos de ar-condicionado com os códigos de erro e o diagnóstico. As calculadoras funcionam mesmo sem internet.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.11.31',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Fotos da OS em carrossel',
        description: 'No preenchimento da ordem de serviço, as fotos já enviadas agora aparecem quadradas e, quando há mais de uma, em carrossel deslizável (igual ao relatório). Tocar na foto amplia em tela cheia.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.30',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ajuda para salvar a foto no iPhone',
        description: 'Ao salvar uma foto da ordem de serviço no iPhone, o app agora mostra uma ilustração indicando onde tocar em "Salvar Imagem".',
        category: 'melhoria',
      },
      {
        title: 'Ajustes visuais no celular',
        description: 'O rodapé com a versão do sistema agora tem o espaçamento certo em relação ao menu inferior em todas as telas — e a Agenda, que não exibia esse rodapé, passou a mostrá-lo como as demais.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.29',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Campos de preço deixam digitar e apagar normalmente',
        description: 'Na tela de precificação de serviços, os campos de valores (impostos, lucro, custo por KM, desconto à vista e parcelas) agora deixam apagar o conteúdo e digitar à vontade — acabou aquele "0" que ficava preso na frente do número.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.28',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Confirmação ao remover foto',
        description: 'Agora, ao tocar no "X" para remover uma foto da ordem de serviço, o app pede uma confirmação antes de apagar — para evitar perder uma foto sem querer no campo.',
        category: 'melhoria',
      },
      {
        title: 'Salvar foto no aparelho ficou mais claro',
        description: 'Ao tirar uma foto na ordem de serviço (com a opção ligada), o app pergunta na hora se você quer guardá-la no aparelho. No iPhone abre a opção "Salvar Imagem"; no Android baixa direto.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.27',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Salvar foto da OS no aparelho ficou confiável',
        description: 'Agora cada foto tem um botão de salvar. Ao tocar, no iPhone abre a opção "Salvar Imagem" para guardar nas Fotos; no Android e no computador a imagem é baixada na hora.',
        category: 'correcao',
      },
      {
        title: 'Ajuste visual no checklist da OS',
        description: 'Corrigimos o selo "Concluído" que aparecia cortado no cabeçalho do checklist em telas estreitas.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.26',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Salvar foto da OS no iPhone ficou direto',
        description: 'No iPhone, ao tirar uma foto durante o preenchimento da ordem de serviço com a opção de salvar no aparelho ligada, agora abre direto a tela para salvar a imagem nas suas Fotos — em vez de mostrar uma pré-visualização do arquivo. No Android e no computador, a foto continua sendo baixada normalmente.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.25',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Sua identidade visual aparece na hora',
        description: 'Para empresas com cores e logo personalizados, corrigimos um detalhe em que, ao puxar a tela para atualizar, as cores da sua marca demoravam um instante para carregar. Agora elas aparecem imediatamente.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.24',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'App se recupera sozinho após atualizações',
        description: 'Corrigimos um erro que, logo depois de uma atualização do sistema, podia travar a tela com uma mensagem técnica ao abrir uma ordem de serviço. Agora o aplicativo detecta isso e se recarrega sozinho, sem atrapalhar o atendimento.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.23',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Salve as fotos da OS no seu aparelho',
        description: 'Agora, ao tirar uma foto durante o preenchimento de uma ordem de serviço, você pode guardar automaticamente uma cópia no seu celular. A opção já vem ligada e fica em Configurações › Usabilidade — é só desligar se não quiser que as fotos sejam salvas no aparelho.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.11.22',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'A Agenda lembra como você gosta de visualizar',
        description: 'Agora a Agenda guarda, para cada pessoa, a forma de visualização escolhida — Dia, Semana ou Mês — e separada por aparelho: o jeito do seu celular e o do seu computador ficam independentes. Na próxima vez que você abrir, ela já aparece do seu jeito. Quem ainda não escolheu continua abrindo em Dia no celular e Mês no computador.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.11.21',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Saldo após cada movimentação na conta',
        description: 'Ao abrir uma conta bancária, cada movimentação agora mostra o saldo que ficou na conta depois dela. A movimentação mais recente exibe o saldo atual da conta, e as anteriores mostram como o saldo estava a cada passo — fácil de acompanhar o extrato linha a linha.',
        category: 'recurso',
      },
      {
        title: 'Voltamos a gerar os documentos do contrato para quem tem acesso',
        description: 'Corrigimos um problema que impedia alguns usuários com acesso aos contratos de gerar e editar os documentos do contrato (Termo de Responsabilidade Técnica, Certificado de Conformidade, Cronograma Anual e Dossiê PMOC) e de atualizar o link do portal do cliente. Agora qualquer usuário com acesso aos contratos consegue.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.20',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Movimentações mostra só o que já aconteceu',
        description: 'A tela de Movimentações passou a listar apenas o que já entrou ou saiu de fato (recebido ou pago). Tudo que ainda está por vencer — parcelas de contrato, contas a pagar e compras de cartão em aberto — fica na tela de Contas a Pagar/Receber. Assim os totais e as exportações em PDF e Excel refletem só o dinheiro que realmente movimentou.',
        category: 'correcao',
      },
      {
        title: 'Mensalidades de contrato aparecem no mês certo',
        description: 'As parcelas geradas a partir de um contrato passaram a aparecer no mês de cada vencimento, e não mais todas concentradas no mês em que foram criadas. Também acertamos as parcelas que já estavam cadastradas, sem alterar nenhum valor.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.19',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Veja quem lançou cada movimentação',
        description: 'A lista de movimentações do Financeiro agora mostra a foto de quem cadastrou cada lançamento, logo depois da data. Ao passar o mouse sobre a foto, aparece o nome e o e-mail da pessoa — fica fácil saber a origem de cada entrada e saída.',
        category: 'recurso',
      },
      {
        title: 'Financeiro com cabeçalho colorido e saldo em destaque',
        description: 'O topo de cada conta e da Visão Geral virou um cartão colorido com o saldo bem grande: usa a cor da conta quando o saldo está positivo, fica escuro quando está zerado e vermelho quando está negativo — você bate o olho e entende a situação na hora.',
        category: 'melhoria',
      },
      {
        title: 'Contas e cartões de cor clara não somem mais',
        description: 'Quando uma conta ou cartão tinha uma cor clara, ao selecionar ou passar o mouse o nome e o valor ficavam ilegíveis (texto claro sobre fundo claro). Agora o texto se ajusta automaticamente para continuar sempre legível, com qualquer cor que você escolher.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.18',
    date: '13 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Faturamento e total recebido agora batem entre as telas',
        description: 'O "Faturamento" do início e o "Total Recebido / Total Pago" da tela de Contas a Pagar/Receber podiam mostrar valores diferentes, porque um contava pela data em que o dinheiro entrou e o outro pela data de vencimento. Padronizamos: agora os dois seguem sempre a data em que o valor foi recebido ou pago, então os números conversam entre si. Os totais de "Pendente", "Vencido" e "Próximos 7 dias" continuam olhando o vencimento, como antes.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.17',
    date: '12 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Dados da Empresa agora salvam de verdade, automaticamente',
        description: 'Em algumas empresas, as alterações feitas em Configurações → Dados da Empresa não eram gravadas — você editava, saía da tela e ao voltar estava tudo como antes, sem nenhum aviso. Corrigimos a causa: agora tudo que você digita é salvo automaticamente enquanto edita, e se algo impedir a gravação aparece um aviso claro em vez de silêncio.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.16',
    date: '12 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Entrar em um novo aparelho não desconecta mais os outros',
        description: 'Ao entrar ou sair da sua conta em um aparelho, as sessões abertas nos seus outros dispositivos eram encerradas sem você pedir. Corrigimos: agora suas outras sessões só são desconectadas se você marcar a opção "desconectar outras sessões" na hora do login.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.15',
    date: '11 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Portal do Contrato para todos os contratos, com link que você liga e desliga',
        description: 'Agora todo contrato — não só os de PMOC — pode ter um portal próprio com link e QR Code para o seu cliente acompanhar. Você liga ou desliga esse portal quando quiser, direto na tela do contrato. O cliente vê o cronograma, as ocorrências e o status do contrato (em dia, atenção ou atrasado); os contratos de PMOC continuam mostrando também os documentos. E quem é da sua equipe, logado, pode abrir e preencher as OSs direto pelo portal.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.11.14',
    date: '10 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Mapa de Rastreamento corrigido no computador',
        description: 'A tela "Mapa e Rastreamento" abria com o mapa em branco no computador, mesmo havendo técnicos em campo. Corrigimos a falha: agora o mapa carrega normalmente e continua acompanhando o tema claro ou escuro que você usa no sistema.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.13',
    date: '10 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Mapa de Rastreamento corrigido no celular',
        description: 'Em alguns celulares, a tela "Mapa e Rastreamento" abria com o mapa em branco — um quadrado cinza vazio. Agora o mapa se ajusta sozinho assim que a tela termina de abrir, toda vez que você volta para a aba do mapa e também quando você gira o aparelho ou abre o teclado. A posição dos técnicos volta a aparecer normalmente.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.12',
    date: '10 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tela de Movimentações Financeiras mais enxuta',
        description: 'Demos uma faxina na tela: tiramos os botões repetidos do topo, deixando lá apenas o atalho de Categorias. Os botões para adicionar conta e cartão ficam agora no menu lateral, ao lado de cada seção — e a seção de Cartões aparece sempre, com o botão "Novo Cartão" à mão mesmo antes de você cadastrar o primeiro. Ao abrir uma conta, o cabeçalho fica limpo (só nome e saldo) e todas as ações — transferir, editar, ajustar saldo e excluir — ficam reunidas no menu de opções da conta.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.11',
    date: '10 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tarefas na agenda agora respeitam quem pode ver',
        description: 'As tarefas da agenda passam a aparecer apenas para o responsável por elas e para quem tem acesso total à agenda. Criamos a permissão "Ver Toda a Agenda", que você liga ou desliga por usuário na tela de Usuários — assim cada pessoa vê só as tarefas que lhe dizem respeito, e quem precisa enxergar tudo continua enxergando.',
        category: 'melhoria',
      },
      {
        title: 'Perfil "Acesso Total" passa a incluir novidades automaticamente',
        description: 'Quem está no perfil de acesso "Acesso Total" agora recebe automaticamente as novas permissões sempre que lançamos um recurso novo — sem precisar reconfigurar usuário por usuário.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.10',
    date: '10 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tela de Movimentações Financeiras mais clara e organizada',
        description: 'Reorganizamos a tela de movimentações: agora há uma aba "Visão Geral" que mostra de uma vez o saldo das suas contas e o total das faturas dos cartões. Ao escolher uma conta ou cartão, ele fica destacado na própria cor e a lista exibe só as movimentações daquela conta — mais limpa e direta. E os botões para adicionar conta e cartão ficaram junto de cada seção, mais fáceis de achar.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.9',
    date: '10 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Portal do cliente automático + QR da etiqueta abre o portal',
        description: 'Cada cliente já tem o portal pronto automaticamente — não precisa mais "gerar". E o QR Code da etiqueta de identificação do equipamento, ao ser escaneado, abre direto o portal do cliente já naquele equipamento (antes o código só levava a uma busca na internet). Na ficha do cliente é só copiar ou abrir o link do portal.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.11.8',
    date: '10 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Numeração de equipamentos agora é automática e nunca repete',
        description: 'O número de identificação de cada equipamento passou a ser gerado automaticamente de forma sequencial dentro da sua empresa (0001, 0002, 0003...). Corrigimos uma falha em que equipamentos diferentes podiam acabar com o mesmo número, e organizamos a numeração dos equipamentos já cadastrados.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.7',
    date: '10 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Correção: remover a permissão de Agenda de um técnico não tira mais o acesso dele',
        description: 'Quando o administrador desmarcava a permissão de "Agenda" de um técnico, ele acabava perdendo o acesso às demais telas (caía numa tela em branco). Corrigido: agora o técnico é levado para a primeira tela que tem permissão e continua acessando normalmente todas as suas funções.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.6',
    date: '10 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Desative usuários sem excluir',
        description: 'Agora dá pra desativar um usuário em vez de excluir de vez: ele perde o acesso na hora e libera uma vaga no seu plano, mas continua na lista e pode ser reativado quando você quiser (se houver vaga). A exclusão definitiva continua como uma opção separada.',
        category: 'recurso',
      },
      {
        title: 'Ao reduzir o plano, você escolhe quem fica',
        description: 'Se você baixar para um plano com menos usuários do que tem hoje, o sistema avisa e deixa você escolher quais usuários continuam — os demais são apenas desativados (reativáveis depois), nunca excluídos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.5',
    date: '09 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Financeiro reorganizado em telas separadas',
        description: 'O menu "Financeiro" agora abre três telas: Relatório Financeiro (com Visão Geral e DRE), Contas a Pagar/Receber e Movimentações Financeiras. No celular ficou mais leve, sem telas empilhadas, e o carrossel de contas aparece na cor de cada conta.',
        category: 'melhoria',
      },
      {
        title: 'Relatório de movimentações em PDF',
        description: 'Ao exportar as movimentações em PDF, agora sai um relatório em páginas A4 (tudo junto no arquivo), com a logo e os dados da sua empresa, botão de voltar no celular, e respeitando o filtro que estiver na tela (conta, período e busca).',
        category: 'melhoria',
      },
      {
        title: 'Contrato já sai vinculado no financeiro',
        description: 'Ao lançar as parcelas de um contrato você define a conta, a categoria e o cliente de uma vez, e isso vale para todas as parcelas — com o botão "Aplicar a todas" para acertar contratos que já existem. O detalhe do contrato também ganhou uma aba "Financeiro" com o resumo do que foi previsto, recebido, pendente e em atraso.',
        category: 'melhoria',
      },
      {
        title: 'Correção: contrato aparecia "Sem cliente"',
        description: 'Ao vincular um contrato a um lançamento financeiro, o nome do cliente do contrato não aparecia. Corrigido — agora mostra o cliente certo.',
        category: 'correcao',
      },
      {
        title: 'Busca nas listas grandes',
        description: 'Campos de seleção com muitas opções (como equipamentos) agora têm busca, para você achar mais rápido sem rolar a lista inteira.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.4',
    date: '09 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Gerencie seu plano direto pelo sistema',
        description: 'Na tela de Assinatura, em "Gerenciar Meu Plano", você troca de plano (Start, Avançado ou Master) ou monta um plano personalizado escolhendo os módulos e a quantidade de usuários que precisa, no ciclo mensal ou anual. Subir de plano vale já na próxima cobrança; descer passa a valer no fim do período que você já pagou.',
        category: 'recurso',
      },
      {
        title: 'Histórico de pagamentos na sua Assinatura',
        description: 'A tela de Assinatura agora mostra o histórico dos seus pagamentos — data, valor, forma de pagamento e situação (pago, pendente, vencido) — com paginação.',
        category: 'recurso',
      },
      {
        title: 'Adicione módulos e usuários na hora que precisar',
        description: 'Quando você abrir uma tela que depende de um módulo que seu plano não inclui, dá pra adicionar aquele módulo direto pela tela de planos. E na tela de Usuários, ao chegar no limite, você pode contratar mais usuários — além de alternar a visualização entre lista e cards.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.3',
    date: '09 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ajuste o saldo da conta sem criar despesa ou receita',
        description: 'Na conta, em "Ajustar saldo", você digita o valor que ela deveria ter e o sistema cria sozinho um lançamento de ajuste pra bater o saldo — sem precisar inventar uma despesa ou receita. Esse ajuste aparece no extrato da conta, mas não entra no seu resultado (DRE).',
        category: 'recurso',
      },
      {
        title: 'Financeiro mais organizado: tudo da conta num lugar só',
        description: 'As telas "Movimentações" e "Contas e Cartões" viraram uma só. Agora tem um menu com cada conta e cartão — é só clicar pra ver o extrato daquela conta na hora, editar, excluir ou transferir, tudo no mesmo lugar.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.2',
    date: '09 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Exporte suas movimentações em PDF e Excel',
        description: 'Na tela de Movimentações, o botão de exportar agora deixa você baixar em PDF — um relatório pronto pra imprimir, com a logo e os dados da sua empresa — ou em Excel, pra trabalhar a planilha no computador.',
        category: 'recurso',
      },
      {
        title: 'Busca nas Contas a pagar e a receber',
        description: 'Agora dá pra procurar uma conta pelo nome do cliente ou fornecedor, pela descrição ou pelo valor — mesmo que ela esteja em outro mês ou com outro status. Antes só era possível filtrar por categoria.',
        category: 'melhoria',
      },
      {
        title: 'Filtro de categoria mais organizado no Financeiro',
        description: 'O filtro de categoria virou um botão que abre as opções quando você clica, deixando a tela mais limpa em vez de mostrar todas as categorias abertas de uma vez.',
        category: 'melhoria',
      },
      {
        title: 'Correção no lançamento de despesas parceladas no cartão',
        description: 'Corrigimos um caso em que uma despesa parcelada no cartão podia ser registrada em duplicidade se você clicasse em salvar duas vezes seguidas.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.11.1',
    date: '09 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Copie ou abra o link do equipamento sem escanear o QR Code',
        description: 'Ao lado do QR Code de cada equipamento agora há dois botões: "Abrir link" e "Copiar link". Assim você compartilha com o seu cliente o acesso direto ao histórico daquele equipamento no portal, sem precisar escanear o código. Para clientes que ainda não têm portal ativo, os botões aparecem indisponíveis com um aviso.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.11.0',
    date: '08 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Assine e pague online, com ativação automática',
        description: 'Agora você contrata e paga sua assinatura direto pelo sistema — por PIX, cartão de crédito ou boleto. Assim que o pagamento é confirmado, seu acesso é liberado automaticamente e o vencimento é atualizado, sem precisar falar com ninguém. Quando o seu período acaba, é só escolher o plano e pagar pela própria tela.',
        category: 'recurso',
      },
      {
        title: 'Acompanhe e cancele sua assinatura quando quiser',
        description: 'Na tela de Assinatura você vê seu plano, o vencimento e pode cancelar a qualquer momento. Ao cancelar, as cobranças futuras param e você mantém o acesso normalmente até o fim do período que já pagou.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.10.5',
    date: '08 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Configurações da empresa salvam sozinhas e mostram o status',
        description: 'Na tela de Configurações, agora aparece na hora se suas alterações estão sendo salvas ("Salvando…") ou já foram guardadas ("Salvo"). E se você sair da tela logo depois de digitar, seus dados não se perdem mais — eles são salvos automaticamente antes de você sair.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.10.4',
    date: '07 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Documentos do contrato gerados automaticamente',
        description: 'Ao criar um contrato PMOC, o sistema já gera sozinho a primeira versão dos documentos — Termo de Responsabilidade Técnica, Certificado de Conformidade, Cronograma Anual e Dossiê PMOC. Você não precisa mais gerar cada um manualmente logo após criar o contrato (se algum dado obrigatório ainda estiver faltando, é só completar e gerar aquele documento).',
        category: 'recurso',
      },
      {
        title: 'Você controla quando o cliente vê os documentos no portal',
        description: 'Agora os documentos PMOC só aparecem no portal público da unidade quando você libera. Na aba Documentos do contrato, use "Liberar documentos no portal do cliente" (e "Ocultar documentos do portal" para esconder de novo). Enquanto não liberar, o cliente continua vendo o painel da unidade — status, próxima manutenção e histórico —, mas não os documentos.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.10.3',
    date: '07 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Geração de documentos PMOC corrigida',
        description: 'Corrigimos um erro que, em alguns casos, impedia a geração do Termo de Responsabilidade Técnica, do Certificado de Conformidade e do Dossiê PMOC. Agora os documentos voltam a ser gerados normalmente.',
        category: 'correcao',
      },
      {
        title: 'Certificado de Conformidade com geração e download individual',
        description: 'Agora você pode gerar e baixar o Certificado de Conformidade separadamente, direto pelo contrato, do mesmo jeito que já fazia com o Termo de Responsabilidade Técnica.',
        category: 'recurso',
      },
      {
        title: 'Cronograma anual agora faz parte do Dossiê PMOC',
        description: 'O cronograma de 12 meses passou a ser incluído automaticamente dentro do Dossiê PMOC, junto da capa, do Termo de Responsabilidade Técnica e do Certificado de Conformidade. Ele deixou de ser um documento separado.',
        category: 'melhoria',
      },
      {
        title: 'Modelos de documentos com visual mais claro',
        description: 'Na tela de Configurações de Contrato, os cards dos modelos padrão (Termo e Certificado) ficaram mais organizados e mostram se o texto está no padrão ou foi personalizado pela sua empresa.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.10.2',
    date: '06 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Prévia dos documentos mais realista',
        description: 'A prévia dos documentos PMOC agora mostra os campos preenchidos com dados de exemplo (como "NOME DA EMPRESA" e "(99) 99999-9999"), em vez de linhas em branco, e marca com um "X" o local onde fica a assinatura do Responsável Técnico. Assim fica mais fácil visualizar como o documento vai ficar de verdade. Quando você abre a prévia dentro de um contrato, os dados reais já cadastrados aparecem normalmente.',
        category: 'melhoria',
      },
      {
        title: 'Mais respiro nos documentos PMOC',
        description: 'Ajustamos o espaçamento entre as seções do Termo de Responsabilidade Técnica e do Certificado de Conformidade, aproveitando melhor o espaço em branco da página — mantendo o documento em uma única folha.',
        category: 'melhoria',
      },
      {
        title: 'Filtros mais flexíveis: escolha vários de uma vez',
        description: 'Os filtros das listas (como em Contratos, Financeiro e Ponto) agora começam vazios — mostrando tudo — e você marca quantas opções quiser para filtrar por elas. Dá para selecionar mais de um status, categoria, conta ou pessoa ao mesmo tempo; deixando tudo desmarcado, a lista volta a mostrar todos os itens.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.10.1',
    date: '06 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Prévia dos documentos antes de salvar',
        description: 'Ao editar os modelos de documento PMOC (Termo de Responsabilidade Técnica e Certificado de Conformidade), agora há um botão "Prévia" que abre uma folha A4 mostrando exatamente como o documento vai ficar, já com os dados preenchidos. Vale tanto nas Configurações de Contrato quanto no documento de um contrato específico.',
        category: 'recurso',
      },
      {
        title: 'Navegação das Configurações de Contrato mais prática',
        description: 'No computador, as seções (Documentos e Responsáveis Técnicos) agora aparecem em um menu lateral, mais fácil de navegar. No celular, um botão de engrenagem no topo da tela de Contratos leva direto para as configurações. E foi adicionado um botão "Voltar" para retornar à lista de contratos.',
        category: 'melhoria',
      },
      {
        title: 'Aviso de alterações não salvas só quando há mudança de verdade',
        description: 'Antes, ao abrir e fechar um documento sem editar nada, o sistema às vezes perguntava "Descartar alterações?" sem necessidade. Agora esse aviso só aparece quando você realmente alterou o texto.',
        category: 'correcao',
      },
      {
        title: 'Indicadores da tela de Orçamentos no novo visual',
        description: 'Os cartões de indicadores da tela de Orçamentos passaram para o mesmo visual moderno já usado na tela de Ordens de Serviço. Os valores em reais agora aparecem formatados corretamente (com o símbolo R$).',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.10.0',
    date: '06 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Nova tela "Configurações de Contrato" com modelos de documentos por empresa',
        description: 'Agora você define em um só lugar os modelos dos documentos PMOC da sua empresa — o Termo de Responsabilidade Técnica e o Certificado de Conformidade. Todo contrato novo já nasce com esses modelos prontos, e você ainda pode ajustar o texto de um contrato específico quando precisar, com um botão para puxar o modelo padrão da empresa de volta. Os Responsáveis Técnicos passaram a ficar nessa mesma tela, agora acessível pelo botão "Configurações de Contrato" na tela de Contratos.',
        category: 'recurso',
      },
      {
        title: 'Documentos PMOC mais limpos e com os dados do cliente',
        description: 'O Termo de Responsabilidade Técnica e o Certificado de Conformidade agora trazem os dados do cliente (nome, CNPJ e endereço) ao lado dos dados da sua empresa. Apenas o Responsável Técnico assina os documentos — removemos os campos de assinatura repetidos e os campos de assinatura da contratante e da contratada. O Certificado deixa claro que a sua empresa certifica o cliente, e o cabeçalho do Termo ficou mais limpo e padronizado.',
        category: 'melhoria',
      },
      {
        title: 'Link do painel público da unidade mais claro',
        description: 'O endereço do painel público que você compartilha com o cliente (ou exibe no QR Code da unidade) agora começa por "/contrato/unidade". Os QR Codes e links antigos que você já imprimiu ou enviou continuam funcionando normalmente.',
        category: 'melhoria',
      },
      {
        title: 'Concluir a ordem de serviço agora atualiza o andamento do contrato',
        description: 'Quando o técnico concluía uma ordem de serviço ligada a um contrato recorrente, a visita continuava marcada como "Agendada" e as barras de progresso do contrato ficavam zeradas. Agora, ao concluir (ou cancelar) a ordem de serviço, a manutenção correspondente do contrato é atualizada automaticamente — o andamento e o histórico do contrato passam a refletir o que já foi realizado. Ajustes manuais que você fez nas manutenções (remarcadas ou puladas) continuam preservados.',
        category: 'correcao',
      },
      {
        title: 'Ocorrências do contrato agora abrem a ordem de serviço e mostram a situação real',
        description: 'Na tela do contrato, a aba "Ocorrências" passou a listar as próprias ordens de serviço daquela unidade, com a situação real de cada uma sempre atualizada (agendada, em andamento, concluída, cancelada). Basta clicar em uma ocorrência para abrir a ordem de serviço daquela visita. E o botão de pular uma visita agora cancela a ordem de serviço correspondente, com confirmação, para que ela não continue aparecendo como pendente.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.40',
    date: '06 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'A busca de ordens de serviço agora encontra qualquer OS',
        description: 'Antes, ao pesquisar na lista de ordens de serviço, o sistema só procurava dentro do período e do status que estavam selecionados — então uma OS de outro mês ou de outra situação parecia ter sumido. Agora a busca é universal: ao digitar nome do cliente, número ou código da OS, tipo de serviço, equipamento ou título da tarefa, o sistema procura em todas as suas ordens de serviço, de qualquer mês e qualquer situação. Enquanto você pesquisa, um aviso indica que os filtros ficam pausados; ao apagar a busca, a lista volta a mostrar o período e os filtros que você escolheu.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.39',
    date: '06 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: '"Questionário" agora se chama "Checklist"',
        description: 'Renomeamos o recurso de "Questionário" para "Checklist" em todo o sistema — na tela de Serviços, no preenchimento e no resumo da ordem de serviço, no aplicativo do técnico, nos contratos e nas permissões. É exatamente o mesmo recurso, com um nome mais direto e fácil de entender. Tudo o que você já criou continua igual, só o nome mudou.',
        category: 'melhoria',
      },
      {
        title: 'Equipamentos e checklists do resumo da OS agora abrem e fecham',
        description: 'No resumo de uma ordem de serviço, cada equipamento/checklist virou uma seção recolhível. Por padrão, só a primeira já vem aberta (no celular e no computador) — as demais você abre tocando no título, e a setinha mostra se está aberta ou fechada. Fica bem mais fácil navegar em ordens de serviço com vários equipamentos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.38',
    date: '06 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Fotos da ordem de serviço agora em carrossel deslizante no celular',
        description: 'No celular, ao abrir o resumo de uma ordem de serviço, as fotos não aparecem mais empilhadas em miniaturas pequenas. Agora cada foto aparece grande, uma de cada vez, e você arrasta para o lado para ver as próximas — com bolinhas indicando em qual você está. Vale tanto para as fotos gerais da OS quanto para as fotos de cada pergunta do checklist (antes, durante e depois do serviço). Tocar em qualquer foto continua abrindo ela em tela cheia.',
        category: 'melhoria',
      },
      {
        title: 'Aviso de conformidade PMOC mais destacado no preenchimento da OS',
        description: 'Quando a ordem de serviço pertence a um contrato PMOC, o bloco de classificação de conformidade que aparece no preenchimento agora tem um destaque azul mais forte, ficando mais fácil de notar que aquela OS exige a indicação de conformidade.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.37',
    date: '05 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Relógio com data e hora ao vivo no topo do sistema',
        description: 'Adicionamos um relógio ao vivo no topo do sistema, que mostra o dia da semana, a data e a hora atualizando a cada segundo — por exemplo, "qui., 04/06 19:12:16". A hora respeita o fuso horário do estado da sua empresa, então quem está em Manaus, Cuiabá, Rio Branco ou em qualquer outro estado vê sempre o horário local correto. Aparece na versão para computador quando você usa o menu lateral.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.36',
    date: '04 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Código do estoque agora é único por empresa (era único no sistema inteiro)',
        description: 'Bug crítico: ao tentar cadastrar um item no estoque com o código sugerido por padrão (EST-001), aparecia "Já existe um registro com esses dados" — mesmo se sua empresa não tinha nenhum item ainda. Isso acontecia porque o código (SKU) era único no banco INTEIRO, não por empresa. Como o sistema sugere EST-001 pra toda empresa nova, a primeira empresa que cadastrava EST-001 trancava esse código pra todas as outras. Agora cada empresa tem sua própria numeração independente — sua EST-001 não conflita com a de ninguém. Também ajustamos a mesma família de bug em outras duas configurações (campos de equipamento personalizados e status de OS personalizados) que tinham o mesmo problema latente esperando acontecer.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.35',
    date: '03 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Toque numa OS na Agenda mobile rola pro detalhe (era ativar modo "mover")',
        description: 'No celular, ao tocar numa OS ou tarefa no calendário, antes ativava por engano o modo "Toque no horário para mover" — bloqueando a navegação pro painel de detalhe. Agora um toque simples rola direto pro painel de detalhe abaixo do calendário, com cliente, horário, endereço e tudo. Pra reagendar a OS no celular, agora é toque longo + arrastar (mesmo padrão de apps de calendário nativos do iPhone e Android). Aplicado tanto na visão de Dia quanto de Semana.',
        category: 'correcao',
      },
      {
        title: 'Resumo do Dia não aparece mais duplicado na visão Dia',
        description: 'Na visão de Dia da Agenda mobile, embaixo do calendário do dia aparecia um "Resumo do Dia" com as MESMAS OSs já listadas em cima — informação repetida ocupando espaço da tela. Agora esse Resumo só aparece nas visões Semana e Mês (onde ajuda a ver o que tem pro dia selecionado). E o título dele ficou mais claro: "Resumo do Dia: 03 de junho de 2026" em vez de só a data solta.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.34',
    date: '03 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tarefas no mesmo horário ficam lado a lado na Agenda do celular',
        description: 'Antes, na visão de Dia da Agenda no celular, quando 2 ou 3 OSs/tarefas estavam marcadas pro mesmo horário (ex: três tarefas às 08:00), elas apareciam empilhadas em cascata vertical — cada uma deslocada 48 pixels pra baixo. Resultado: parecia que estavam em horários diferentes (08:00, 08:48, 09:36 visualmente) e o texto de cada card ficava cortado. Agora ficam lado a lado, dividindo a largura igualmente — mesmo padrão do Google Calendar e Apple Calendar. Fica claro que são simultâneas e não corta texto.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.33',
    date: '03 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Agenda no celular com UX de app de calendário nativo',
        description: 'Três melhorias na Agenda pra ficar com cara de app de calendário no celular: (1) ao abrir a Agenda no mobile, começa direto na visão de Dia (antes começava em Mês — Mês fica reservado pro desktop, onde tem espaço pra visualizar 30+ células). Se você trocar manualmente pra Semana ou Mês depois, sua escolha é respeitada. (2) Arrastar o calendário pra um lado muda o dia (na visão Dia) ou a semana (na visão Semana). Igual a app de banco e calendário. (3) Ao clicar numa OS/tarefa no calendário, a tela rola sozinha pro painel de detalhe abaixo — você não precisa rolar pra ver as informações. Desktop continua exatamente igual.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.32',
    date: '03 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Última camada do padrão de pílulas no mobile aplicada',
        description: 'Mais 4 áreas com navegação por abas internas migradas pro padrão de pílulas roláveis no celular: Mapa ao Vivo (Mapa / Histórico), Curadoria Domiflix do painel master, Ponto Eletrônico administrativo e Sub-abas de Custos do orçamento (Mão de obra / Recursos / Materiais / Resumo). No Mapa ao Vivo, o botão Atualizar virou ícone e a contagem de técnicos ativos vira chip abaixo das abas — fica tudo no padrão app nativo. View-mode pickers (Dia / Semana / Mês na Agenda e Cronograma do contrato), micro toggles de gráficos (Mensal / Semanal etc.) e abas dentro de modais ficaram como estão — são padrões diferentes de UX. Agora 100% das telas full-page com navegação de abas internas estão consistentes no mobile.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.31',
    date: '03 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Abas internas padronizadas no mobile em mais 3 telas',
        description: 'O Portal do Cliente (Minhas OS / Equipamentos), a Agenda (Dia / Semana / Mês) e o Gerenciamento de Usuários (Usuários / Cargos) agora usam o mesmo formato de pílulas roláveis no celular que o resto do app já usa. Visual consistente em todas as telas com navegação interna. Desktop continua igual.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.30',
    date: '03 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Placeholder amigável quando uma foto não carrega',
        description: 'Antes, quando uma foto da OS não carregava (por algum motivo — link expirou, arquivo foi apagado, falha temporária de conexão), aparecia um "Erro" cru, parecendo problema do sistema. Agora aparece um quadradinho cinza com ícone de imagem riscada e o texto "Imagem indisponível", muito mais claro pro cliente entender que é só uma foto que não veio, não um problema no app. Aplicado em todas as fotos da tela de OS — do cliente, do equipamento, do técnico responsável, das respostas técnicas e da galeria de fotos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.29',
    date: '03 de junho de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Hotfix: fotos da OS voltam a aparecer no link público do cliente',
        description: 'Em v1.9.27 fechamos pelo lado da segurança o armazenamento das fotos enviadas pelo técnico em respostas de OS. Mas o portal público de OS (link que o cliente acessa sem login pra acompanhar o serviço) precisa exibir essas fotos sem autenticação — viraram "Erro" nas miniaturas pra todos os clientes. Reabrimos o armazenamento dessas fotos pra recuperar a visualização. Vamos voltar a fechar esse armazenamento via edge function autenticada por token de OS numa próxima release com cuidado pra não quebrar mais nada.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.28',
    date: '03 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Bug do BDI / Precificação corrigido',
        description: 'Ao salvar as taxas do BDI em Orçamentos → Precificação, alguns clientes recebiam um erro técnico em inglês ("ON CONFLICT specification") e as alterações não eram salvas. Corrigimos o problema na estrutura do banco que causava isso. Agora salvar funciona normalmente em qualquer empresa.',
        category: 'correcao',
      },
      {
        title: 'Erros do sistema agora aparecem sempre em português',
        description: 'Antes, alguns erros do banco (problemas de permissão, valores duplicados, conexão perdida, etc.) vazavam pra tela como texto técnico em inglês — "row-level security violation", "duplicate key value", "PGRST116", coisas assim. Confuso pra qualquer um. Agora um interpretador interno reconhece esses códigos e devolve mensagens claras em PT-BR ("Você não tem permissão para realizar esta ação", "Já existe um registro com esses dados", "Sessão expirou — faça login novamente", etc.). Cobre 17 categorias de erro do banco mais um detector de "isso parece inglês técnico" que captura qualquer caso não previsto e devolve uma mensagem genérica amigável. Revisamos 39 telas e hooks, com atenção especial pros fluxos mais sensíveis: reset de senha, OS no campo (técnico mobile), pagamento de folha, criação de orçamento.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.27',
    date: '03 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Fotos de equipe e de OS exigem login pra acessar',
        description: 'Auditoria de segurança identificou que algumas fotos do sistema (foto da equipe, fotos enviadas pelo técnico em respostas de OS) ficavam disponíveis via URL pública — em teoria, qualquer pessoa com o link acessava sem estar logado. Agora essas fotos só carregam pra quem está autenticado no sistema. Imagens são geradas com link temporário que expira automaticamente. Fotos de equipamento, foto do cliente e logo da empresa continuam públicas por design (precisam aparecer em portais públicos de OS e PDFs de orçamento, onde o cliente final acessa sem login).',
        category: 'seguranca',
      },
      {
        title: 'Selfie do Ponto Eletrônico volta a aparecer no detalhe do dia',
        description: 'Bug silencioso descoberto durante a auditoria: a foto do colaborador batendo ponto não aparecia mais no modal de detalhe do dia desde quando esse bucket virou privado. A miniatura ficava como um quadradinho quebrado. Agora renderiza normalmente via link temporário autenticado.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.26',
    date: '03 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Notificações em tempo real isoladas por empresa',
        description: 'Auditoria de segurança identificou que algumas notificações em tempo real (Ponto Eletrônico administrativo, Mapa ao Vivo dos técnicos e rastreamento público da OS) chegavam ao navegador sem filtro de empresa — em teoria, um usuário mal-intencionado poderia abusar pra ver eventos de outras empresas. Aplicamos filtro no servidor que garante que cada empresa só recebe os eventos dela. Mais leve no tráfego, mais seguro na privacidade.',
        category: 'seguranca',
      },
      {
        title: 'Tabelas do painel master com regras de acesso reforçadas',
        description: 'No painel administrativo do Auctus, as tabelas internas (CRM master, financeiro interno do Auctus, etapas de CRM) tinham brechas onde algumas operações exigiam ser super admin mesmo pra usuários autorizados no painel. Reapertamos: agora qualquer operação nessas tabelas exige super admin OU usuário com permissão explícita no painel (admin_permissions). Impossível usuário tenant comum ler/escrever lá.',
        category: 'seguranca',
      },
    ],
  },
  {
    version: '1.9.25',
    date: '02 de junho de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Usuário Master volta a conseguir cadastrar em todas as telas',
        description: 'Bug crítico corrigido: ao tentar cadastrar um item de estoque (ou cliente, equipamento, ordem de serviço, funcionário, etc.), o usuário Master (admin da empresa) tomava o erro "Você não tem permissão para realizar esta ação", mesmo tendo todas as permissões. O problema acontecia porque o sistema esquecia de mandar uma etiqueta interna que identifica de qual empresa o cadastro pertence — e a regra de segurança do banco bloqueava por precaução. Aplicamos uma rede de segurança no banco que preenche essa etiqueta automaticamente em TODAS as operações de cadastro (43 tabelas cobertas de uma vez). Previne qualquer erro deste tipo no futuro.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.24',
    date: '27 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Faturas de cartão agora respeitam o filtro de período',
        description: 'Em Contas a Pagar, ao selecionar "Este mês" (por exemplo, maio), antes apareciam faturas de TODOS os meses (maio, junho, julho...). Agora só aparecem as faturas cujo vencimento cai dentro do período selecionado. Os cards de resumo no topo (Pendente, Vencido, Próximos 7 dias, Pago) também foram corrigidos pra respeitar o mesmo filtro.',
        category: 'correcao',
      },
      {
        title: 'Filtro por categoria em Contas a Pagar/Receber',
        description: 'Agora tem um seletor de categoria acima da lista de transações. Escolha uma categoria (ex: "Funcionários") e a lista filtra na hora, mostrando um resumo com o total pago e a quantidade de lançamentos daquela categoria. Útil pra conferir rapidinho "quanto gastei com funcionários esse mês". Ao selecionar uma categoria, as faturas de cartão ficam ocultas (porque cada fatura agrupa várias categorias — filtra só as transações individuais).',
        category: 'recurso',
      },
      {
        title: 'Vendedores Auctus agora veem a aba Atividade das empresas',
        description: 'No painel administrativo, ao abrir uma empresa e ir na aba "Atividade", vendedores (que não são super admin) agora conseguem ver os dados de atividade normalmente. Antes aparecia tudo zerado porque a permissão de leitura dos eventos de uso estava restrita a super admins.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.23',
    date: '24 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Cards no topo da tela Ordens de Serviço repensados',
        description: 'Antes apareciam 7 cards de status (Agendada, Pendente, A Caminho, Em Andamento, Pausada, Concluída, Cancelada) lado a lado — visualmente bagunçado e pouco acionável. Agora são 4 cards grandes no mesmo estilo dos do Dashboard (cor sólida, valor em destaque, halo decorativo): OS Abertas (laranja — tudo que não está concluído nem cancelado), Concluídas (verde — feitas no período), Atrasadas (vermelho — passou da data e ainda não foi feita) e Próximos 7 dias (azul — agendadas pros próximos dias). Os 4 cards respeitam o filtro de período. No mobile, carrossel horizontal com snap; no desktop, grade de 4 colunas.',
        category: 'melhoria',
      },
      {
        title: 'Filtro por status migrado pro botão Filtros',
        description: 'Os 7 status (Agendada, Pendente, A Caminho, Em Andamento, Pausada, Concluída, Cancelada) deixaram de ser cards clicáveis no topo da tela e ficam agora dentro do botão Filtros (onde já estavam disponíveis também). Você seleciona quais status quer ver pelos checkboxes do painel de filtros — comportamento idêntico ao que já existia, só consolidou num lugar só.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.22',
    date: '24 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Categorias do Financeiro deixou de ser tela dedicada',
        description: 'A aba "Configurações" do Financeiro (que só tinha a gestão de categorias) saiu do menu. Agora em "Contas e Cartões" tem um botão "Categorias" no header — clica nele e abre uma janela com toda a lista de categorias de receita e despesa pra você gerenciar (criar, editar, excluir, reordenar). O módulo Financeiro foi de 6 abas pra 5, mais limpo e direto. Quem tinha link salvo pra /financeiro/configuracoes cai automaticamente em "Contas e Cartões" (onde o botão Categorias está visível).',
        category: 'melhoria',
      },
      {
        title: 'Criar categoria nova direto do lançamento de transação',
        description: 'Em "Nova Transação", ao lado do campo "Categoria" agora tem um botão "+". Clica nele pra criar uma categoria nova na hora, sem precisar fechar o formulário e ir até a tela de categorias. Quando você salva, a categoria nova já vem selecionada na transação que estava criando. Funciona pra receita e despesa.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.9.21',
    date: '24 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Abas laterais do Financeiro e do Contrato PMOC padronizadas com o resto do sistema',
        description: 'Antes, as abas laterais do módulo Financeiro e do detalhe do Contrato PMOC tinham um visual diferente do resto do sistema (borda fina à esquerda + fundo bem suave). Agora estão idênticas às demais telas que já usam barra lateral de abas (Configurações, Funcionários, Orçamentos, Ordens de Serviço, Serviços, Painel Auctus): item ativo com fundo primário sólido e texto branco. Mobile mantém o padrão de pílulas roláveis no topo. Mesma cara em todo o app — fica mais fácil bater o olho e saber onde está.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.20',
    date: '24 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Criar contrato com OSs agora cria as OSs de verdade',
        description: 'Antes, ao criar um contrato (PMOC ou comum) com várias ocorrências — por exemplo, 17 manutenções trimestrais em 48 meses — o sistema mostrava "17 ocorrências" no resumo do contrato, mas nenhuma OS aparecia na agenda, no portal PMOC ou em Contas a Receber. As OSs eram bloqueadas silenciosamente por uma regra de segurança interna porque faltava a referência da empresa no momento da criação. Agora cada OS é criada com a referência correta e aparece tudo certinho. Mesma correção aplicada ao botão "Gerar OSs agora" da aba Cronograma do contrato — se você tem contratos antigos sem as OSs criadas, basta abrir o contrato, ir na aba Cronograma e clicar nesse botão, que ele recupera tudo de uma vez.',
        category: 'correcao',
      },
      {
        title: 'Aba Cronograma do contrato com painel lateral no desktop',
        description: 'Ao abrir um contrato e ir na aba Cronograma, agora o calendário fica à esquerda e um painel lateral à direita mostra as OSs do dia selecionado — com informações do cliente, equipamento, status, técnico responsável e botão pra ir direto preencher a OS. Mesma experiência da tela de Agenda principal. Clica num dia do calendário pra ver tudo daquele dia. No celular, clicar numa OS continua abrindo direto o detalhe.',
        category: 'melhoria',
      },
      {
        title: 'Cores semânticas no calendário do contrato',
        description: 'As OSs no calendário da aba Cronograma agora aparecem coloridas pelo status: verde quando concluída, laranja quando pendente (no prazo) e vermelho quando atrasada (passou da data e ainda não foi feita). Texto branco em todos os casos pra ficar legível. Bate a olho qual OS precisa de atenção imediata.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.19',
    date: '24 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Módulo Financeiro reunido numa única tela com abas',
        description: 'Antes, o Financeiro abria como 6 telas separadas no menu lateral (Visão Geral, Movimentações, Contas a Pagar/Receber, Contas e Cartões, DRE, Configurações), cada uma com suas próprias sub-abas e filtros — dava sensação de tudo espalhado. Agora vira UMA tela "Financeiro" com 6 abas. No computador, as abas ficam numa barra lateral à esquerda (igual ao detalhe do contrato PMOC). No celular, viram pílulas roláveis fixas no topo. Toda a lógica de cada tela continua exatamente igual — você não perde nenhum filtro nem funcionalidade.',
        category: 'melhoria',
      },
      {
        title: 'Menu lateral, menu superior e drawer mobile mais limpos',
        description: 'O grupo "Financeiro" no menu lateral (e nos menus do topo e do drawer mobile) deixou de ser um grupo expansível com 6 sub-itens. Agora é só 1 item "Financeiro" que leva direto pra tela unificada. A navegação entre as áreas (Visão Geral, Movimentações, Contas, Cartões, DRE, Configurações) acontece dentro da própria tela, pelas abas. Menu lateral fica visualmente menos pesado.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.18',
    date: '24 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Botão "Zerar Sistema" pro dono da empresa (Configurações → Empresa)',
        description: 'No final da aba "Empresa" em Configurações aparece uma nova "Zona de Perigo" — visível apenas pro administrador da empresa. Lá tem o botão "Zerar Sistema" que abre uma janela com 11 caixinhas pra escolher exatamente o que apagar: Clientes, Equipamentos, Orçamentos, Contratos, Ordens de Serviço, Cadastro de Materiais, Estoque, Movimentações Financeiras, Categorias Financeiras, Funcionários e RH, e Configurações Personalizadas. Tem "Selecionar tudo" e exige digitar o nome da empresa pra confirmar (proteção contra clique acidental). Marcar "Cadastro de Materiais" auto-marca "Estoque" (não dá pra ter movimentação sem material). A empresa, seus usuários e o histórico de pagamentos da assinatura nunca são tocados — o sistema volta ao estado inicial, como se a empresa tivesse acabado de ser criada. Toda zerada fica registrada em log de auditoria.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.9.17',
    date: '24 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Visão Geral mostra o saldo certo do cartão de crédito',
        description: 'Antes, o quadro do cartão de crédito na Visão Geral do Financeiro aparecia sempre zerado, mesmo com fatura em aberto e várias despesas lançadas. Agora mostra o valor real da fatura aberta (despesas - reembolsos), em vermelho quando há saldo a pagar. Bate certinho com o que a tela "Caixas e Cartões" já mostrava.',
        category: 'correcao',
      },
      {
        title: 'Parcela (1/6) de despesa no cartão para de "sumir" do filtro Pendentes',
        description: 'Antes, ao lançar uma despesa parcelada (ex: 6x no cartão), o sistema marcava automaticamente a primeira parcela como "paga", e ela sumia do filtro Pendentes em Contas a Pagar — você via só (2/6) a (6/6) e ficava com a impressão de que o sistema pulou a primeira. Agora nenhuma parcela de cartão entra como paga. Quem fica "pago" é a fatura inteira, quando você quita ela. Todas as parcelas aparecem direitinho.',
        category: 'correcao',
      },
      {
        title: 'Contas a Pagar agora agrupa despesas de cartão como UMA linha de fatura',
        description: 'Antes, se você tinha 30 compras no cartão num mês, apareciam 30 linhas em Contas a Pagar — virava bagunça pra rolar. Agora aparece um bloco "Faturas de Cartão" no topo, com uma linha destacada por fatura (ícone do cartão, etiqueta com a quantidade de despesas, valor total). Clicar abre o detalhe com a lista completa de despesas dentro daquela fatura. O botão "Pagar Fatura" fica bloqueado (com cadeado e dica explicando) até a data de fechamento do cartão — depois dela libera, e você paga a fatura inteira escolhendo de qual conta sai o dinheiro.',
        category: 'recurso',
      },
      {
        title: 'Faturas em Contas e Cartões ordenadas da mais próxima vencer pro fim',
        description: 'Ao clicar em "Ver Faturas" de um cartão na tela Caixas e Cartões, as faturas agora aparecem em ordem crescente de vencimento — a próxima a vencer fica no topo, e as faturas já pagas vão pro fim. Antes vinham da mais recente pra mais antiga, o que não ajudava a priorizar o que pagar primeiro.',
        category: 'melhoria',
      },
      {
        title: 'Faturas em 2 colunas no desktop',
        description: 'Na tela Caixas e Cartões, ao ver as faturas de um cartão no desktop, agora aparecem em grade de 2 colunas (em vez de uma linha por fatura ocupando a tela inteira). Você vê mais faturas de uma vez, sem rolar tanto. Mobile mantém o formato em coluna única.',
        category: 'melhoria',
      },
      {
        title: 'Card "Pago" e "Recebido" agora considera valor já quitado das faturas',
        description: 'Em Contas a Pagar e a Receber, o card verde "Total Pago/Recebido" agora soma também o que você já pagou das faturas de cartão (não só as despesas comuns). Antes, quem pagava tudo via cartão via "R$ 0 pago" no card mesmo depois de quitar várias faturas — agora reflete o movimento financeiro real.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.16',
    date: '24 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Etiquetas coloridas pras variáveis no editor dos documentos PMOC',
        description: 'No editor do Termo de Responsabilidade Técnica e do Certificado, onde antes apareciam valores tipo "Glacial Cold Brasil" ou "34.901.457/0001-99" misturados ao texto, agora aparecem etiquetas coloridas: azul quando o sistema tem o dado cadastrado, vermelho quando o dado está em branco no cadastro (ex: CFT/CREA do RT não preenchido). Fica visualmente óbvio o que vai aparecer no PDF e o que precisa ser cadastrado antes de gerar.',
        category: 'recurso',
      },
      {
        title: 'Botão "Inserir variável" com 19 variáveis disponíveis',
        description: 'A barra de ferramentas do editor ganhou um botão "Inserir variável" (ícone de etiqueta). Toque pra abrir um menu agrupado: Empresa (nome, razão social, CNPJ, endereço, cidade, estado, telefone, email), Responsável Técnico (nome, modalidade, CFT/CREA, registro), Cliente (nome, endereço, cidade), Contrato (nome, vigência, frequência) e Data (data de hoje por extenso). Escolha onde inserir uma variável: ela vira uma etiqueta que troca pelo valor real só na hora de gerar o PDF.',
        category: 'recurso',
      },
      {
        title: 'Espaçamento maior entre blocos de assinatura no PDF do Termo RT',
        description: 'Os 3 blocos de assinatura no PDF (CONTRATANTE / EMPRESA / RESPONSÁVEL TÉCNICO) ficavam visualmente apertados — sem espaço pra assinar à caneta no papel impresso. Aumentamos o respiro entre eles. Quando o RT tem assinatura cadastrada (upload de imagem ou desenho), a imagem continua aparecendo embedada acima da linha do bloco do RT como antes.',
        category: 'melhoria',
      },
      {
        title: 'Substituição de variáveis acontece no servidor (cache forçado a regenerar)',
        description: 'A substituição das variáveis pelos valores reais agora acontece no momento exato em que o PDF é gerado, no servidor. Como a lógica mudou, todos os documentos PMOC vão regenerar automaticamente da próxima vez que você clicar em "Gerar TRT" ou "Gerar Dossiê" (vai aparecer "Versão 2" mesmo sem mudança no texto editado). Versões antigas continuam baixáveis no histórico de versões.',
        category: 'seguranca',
      },
    ],
  },
  {
    version: '1.9.15',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Receber uma conta a receber parcialmente',
        description: 'Antes, ao marcar uma conta a receber como recebida, só dava pra confirmar o valor cheio — se o cliente pagasse só uma parte, você não tinha como registrar sem trapacear. Agora aparece um campo "Valor recebido" no modal (já preenchido com o que falta receber). Se você digitar menos que o total, o sistema pede o novo vencimento do saldo restante e mostra um resumo em tempo real: Valor da conta / Já recebido / Recebendo agora / Restante após este recebimento. A conta continua na listagem com um badge amarelo "Parcial" e o texto "Recebido: R$ X de R$ Y" abaixo do valor. Quando você marcar os restantes, ela vira "Paga" automaticamente. Dentro do detalhe da conta parcial, você vê o histórico de todos os recebimentos (data, valor, forma de pagamento, conta destino) com botão pra estornar qualquer um — o saldo volta a ficar pendente. Vale só pra contas únicas; parceladas continuam quitando parcela por parcela. Funciona em mobile e desktop.',
        category: 'recurso',
      },
      {
        title: 'Tarifas de máquina não aparecem mais como linhas soltas na listagem',
        description: 'Quando você marcava uma conta como recebida com tarifa de máquina (ex: 2% no Pix, taxa do cartão), aparecia uma linha separada na listagem chamada "Tarifa do recebimento" que confundia — parecia uma conta a pagar autônoma. Agora a tarifa fica vinculada à conta-mãe e aparece só dentro do detalhe dela (e continua no histórico de transações relacionadas). A listagem principal de Contas a Pagar/a Receber fica mais limpa. O cálculo de receitas/despesas no DRE e no saldo das contas bancárias segue somando tudo normalmente — zero perda de informação contábil.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.14',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Vale na tela de Funcionários agora pergunta de qual conta sai o dinheiro',
        description: 'Ao registrar um vale para um colaborador, o sistema agora pede pra você escolher de qual conta ou caixa o dinheiro está saindo (cartão de crédito não aparece — vale sai de dinheiro real). Antes, o vale criava uma despesa "solta", sem vínculo com conta, e por isso sumia do extrato da conta. Agora aparece direitinho no extrato e no saldo. Se algo der errado (ex: nenhuma conta cadastrada), aparece uma mensagem clara em vermelho explicando o motivo, em vez de falhar em silêncio.',
        category: 'correcao',
      },
      {
        title: 'Bônus não cria mais entrada fantasma no financeiro',
        description: 'Antes, ao registrar um bônus para um funcionário, o sistema criava uma "entrada" fantasma no financeiro que não fazia sentido — bônus não é receita da empresa, é um crédito interno do colaborador. Agora o bônus fica só no saldo do funcionário e entra na conta apenas na hora do pagamento do salário (somado ao subtotal, como sempre foi).',
        category: 'correcao',
      },
      {
        title: 'Editar uma transação financeira agora permite trocar a forma de pagamento',
        description: 'Em Movimentações, ao editar uma transação, agora aparece um campo "Forma de pagamento" pra você poder trocar (ex: lançou como PIX e era cartão, ou vice-versa). Quando você troca, o sistema confirma com um aviso explicando que vai recriar a despesa, apaga TODAS as parcelas antigas do grupo (sem deixar parcela órfã), e cria as novas com a forma de pagamento certa — preservando os comprovantes anexados. Resolve o caso clássico de "lancei errado e não conseguia mais consertar".',
        category: 'recurso',
      },
      {
        title: 'Novo card "Total Pago" e "Total Recebido" em Contas a Pagar / a Receber',
        description: 'Em Contas a Pagar e Contas a Receber, agora aparece um 4º card verde (com ícone de check) somando o total já pago (na aba A Pagar) ou já recebido (na aba A Receber) no período selecionado. Útil pra ver rapidinho "quanto já saiu/entrou esse mês" mesmo quando você está olhando a aba de Pendentes. Funciona em mobile (no carrossel de cards) e em desktop (na grade de cards).',
        category: 'recurso',
      },
      {
        title: 'Editor de textos do PMOC agora respeita parágrafos e títulos',
        description: 'Ao editar o Termo de Responsabilidade Técnica ou o Certificado de Conformidade no contrato PMOC, o texto ficava todo grudado — parágrafos colados, títulos sem espaço acima, seções sem respiro visual. Faltava ativar o módulo de tipografia do sistema. Corrigido: agora os blocos têm o espaçamento natural entre eles, e o texto fica legível tanto no editor quanto nos Termos de Uso e Política de Privacidade (que herdavam o mesmo problema).',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.13',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Navegação lateral no detalhe do contrato PMOC (desktop)',
        description: 'No desktop, abrir um contrato PMOC agora mostra uma barra lateral à esquerda com as abas (Visão Geral / Documentos / Cronograma). Item ativo destacado com borda primary à esquerda e fundo translúcido. Conteúdo principal preenche o resto da tela. Mobile mantém abas no topo (espaço vertical é valioso no celular).',
        category: 'melhoria',
      },
      {
        title: 'Editor de textos dos documentos PMOC com largura grande no desktop',
        description: 'Ao editar o Termo de Responsabilidade Técnica ou o Certificado, o editor agora abre num modal de ~1024px (em vez dos ~600px antigos), com 520px de altura mínima e barra de ferramentas fixa no topo (não some ao rolar texto longo). Edição mais confortável pra textos jurídicos longos. Mobile continua como drawer full-height.',
        category: 'melhoria',
      },
      {
        title: '"Imprimir PDF Anual" do Cronograma agora gera o PDF de verdade',
        description: 'Antes, clicar em "Imprimir PDF Anual" na aba Cronograma só navegava de volta pra aba Documentos sem gerar nada. Agora chama diretamente o gerador, mostra loader enquanto trabalha, e abre o PDF de 12 meses em uma nova aba. Sem desvio.',
        category: 'correcao',
      },
      {
        title: '"Responsável Técnico" e "Técnico Executor" são campos distintos no contrato',
        description: 'Antes, o formulário de contrato tinha 2 campos com o mesmo nome "Responsável Técnico" — um era pra escolher quem executa as OSs em campo, e o outro era o RT do PMOC (com CFT/CREA). Confuso. Agora ficam claros: "Técnicos Executores" pra quem vai a campo, e "Responsável Técnico (RT)" só na seção PMOC com tooltip explicando a Lei 13.589/2018. Na revisão (passo 4 do wizard), os dois campos aparecem em linhas separadas com seus dados respectivos.',
        category: 'melhoria',
      },
      {
        title: 'Mensagens de erro humanas ao gerar documentos PMOC',
        description: 'Antes, se você tentava gerar um TRT sem CNPJ cadastrado, aparecia um toast vermelho com a palavra técnica "cnpj_missing". Agora aparece "CNPJ da empresa não cadastrado" como título, com descrição explicando o motivo (Lei 13.589/2018 exige) e botão "Ir pra Configurações" que leva direto pra resolver. Mesma melhoria pra 12 outros erros: RT não atribuído, RT sem CFT, contrato sem cliente, permissão insuficiente, sessão expirada, etc. E quando o PDF é gerado mas com algum campo opcional em branco (CFT, endereço), aparece um aviso amarelo dizendo "PDF gerado, mas o CFT está em branco — aparece como linha pontilhada no documento".',
        category: 'melhoria',
      },
      {
        title: 'Aviso quando vai abrir o editor sem dados completos',
        description: 'Na aba "Documentos" do contrato PMOC, se faltar algum campo obrigatório dos textos (CNPJ da empresa, nome ou modalidade do RT), aparece um banner amarelo no topo listando exatamente o que falta, com links clicáveis pra ir resolver. Evita que você abra o editor, escreva tudo, e só descubra na hora de gerar o PDF que tem dado faltando.',
        category: 'melhoria',
      },
      {
        title: 'Caixas de confirmação não abrem mais vazias no computador',
        description: 'Em alguns momentos — por exemplo ao tentar abrir uma nova movimentação no Financeiro com um rascunho salvo, ou ao confirmar exclusões — a janela de confirmação podia abrir totalmente vazia no desktop, travando a tela e exigindo recarregar a página. Corrigido: agora o conteúdo aparece normalmente em todas as confirmações do sistema.',
        category: 'correcao',
      },
      {
        title: 'Ícone do calendário visível no modo escuro',
        description: 'O ícone do calendário ao lado dos campos de data (em "Novo Contrato", "Nova Movimentação", filtros de período, etc.) aparecia preto sobre fundo preto no tema escuro, ficando quase invisível. Agora todo o sistema avisa o navegador que está no tema escuro, e os controles nativos — ícone de calendário, seletor de data, barras de rolagem — usam automaticamente a paleta clara apropriada.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.12',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Contratos PMOC agora geram OSs imediatamente, igual contratos comuns',
        description: 'Antes, contratos PMOC esperavam um processo automático diário pra criar as Ordens de Serviço aos poucos. Agora, ao criar um contrato PMOC (com horizonte de 12 meses e frequência mensal, por exemplo), o sistema gera as 12 OSs na hora — exatamente igual a um contrato comum. Você vê as próximas manutenções na agenda imediatamente após cadastrar o contrato. O alerta antigo que aparecia no toggle "É PMOC?" sobre "geração automática pelo cron" foi substituído por um alerta novo listando o que o PMOC desbloqueia (RT, Dossiê, Cronograma, portal público, QR Code, selo Lei 13.589).',
        category: 'recurso',
      },
      {
        title: 'Botão "Responsáveis Técnicos" no topo da tela de Contratos',
        description: 'Adicionamos um botão "Responsáveis Técnicos" ao lado de "+ Novo Contrato" no topo da tela de Contratos (no desktop). Acesso direto à tela completa de gestão de RTs (com upload de assinatura, carimbo, edição completa). O cadastro rápido pelo botão "+" dentro do modal de contrato continua disponível pra criação ágil.',
        category: 'melhoria',
      },
      {
        title: 'Contador de OSs antes de excluir contrato',
        description: 'Ao excluir um contrato (PMOC ou comum), o pop-up de confirmação agora mostra um aviso: "X OSs vinculadas serão apagadas junto." Após confirmar, a mensagem de sucesso detalha: "Y OSs futuras apagadas · Z OSs passadas mantidas no histórico". Mais transparência sobre o impacto da exclusão.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.11',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'TRT como documento separado no contrato PMOC',
        description: 'O Termo de Responsabilidade Técnica (TRT) agora é um documento próprio na aba "Documentos" do contrato PMOC — você baixa ele individualmente (PDF de 1 página, mais leve que o Dossiê inteiro). Continua também presente como página 2 do Dossiê PMOC consolidado pra quem quer tudo num documento só. Versionado igual aos outros: cada geração fica salva como v1, v2, v3...',
        category: 'recurso',
      },
      {
        title: 'Assinatura digital do RT embedada automaticamente em todos os PDFs',
        description: 'Quando o Responsável Técnico tem assinatura cadastrada (upload de imagem ou desenhada no canvas), agora ela aparece automaticamente impressa em TODOS os documentos PMOC gerados: TRT, Termo no Dossiê e Certificado. Sem precisar imprimir e assinar à mão. Você define a assinatura uma vez, e ela vai pra todos os documentos daquele contrato. Se atualizar a assinatura do RT, todos os PDFs do contrato regeneram automaticamente na próxima vez que forem solicitados (versão+1).',
        category: 'recurso',
      },
      {
        title: 'Botão "Adicionar assinatura agora" direto do contrato',
        description: 'Se o TRT foi gerado mas o RT desse contrato não tinha assinatura cadastrada, o card mostra um aviso amarelo "Sem assinatura — pendente" com botão laranja "Adicionar assinatura agora". Toque → abre uma janela com 2 opções: enviar imagem (foto da assinatura no papel — recomendado juridicamente) ou desenhar agora (mouse/dedo). Salvou? O TRT e o Dossiê viram disponíveis pra regerar com a assinatura aplicada.',
        category: 'recurso',
      },
      {
        title: 'Status visual de assinatura em cada documento',
        description: 'Cada card de documento PMOC agora mostra um pequeno badge indicando o status da assinatura: verde "Assinado" (quando a assinatura está embedada no PDF), amarelo "Sem assinatura" (gerado mas pendente — RT pode assinar à mão depois de imprimir), cinza "Não gerado" (ainda não foi gerado). Vale pro TRT e pro Dossiê. O Cronograma não tem campo de assinatura (são 12 páginas de calendário), então não mostra badge.',
        category: 'melhoria',
      },
      {
        title: 'Portal público mostra status de assinatura',
        description: 'Quando o cliente final escaneia o QR Code e abre o portal PMOC público da unidade, agora ele vê 3 cards de documentos disponíveis (TRT, Dossiê, Cronograma). Se algum tem assinatura pendente, aparece um chip discreto "Assinatura pendente" — mas o download continua liberado (cliente final pode imprimir e levar pro RT assinar à mão se preferir). Transparência total pra fiscalização.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.10',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Botão "Filtros" único em 10 telas do sistema',
        description: 'Replicamos sistema-wide o padrão que já existia em Contratos: telas com vários filtros agora têm um único botão "Filtros" no canto direito da busca, com badge mostrando quantos filtros ativos. Toque pra abrir a gaveta lateral com tudo agrupado. Telas atualizadas: Ordens de Serviço, Estoque, Agenda, Live Tracking (mapa de técnicos), CRM (pipeline), Orçamentos, Equipamentos, Movimentações Financeiras, Relatório de Ponto e Histórico de Ponto. Mais limpo, mais consistente entre as telas.',
        category: 'melhoria',
      },
      {
        title: 'Tabelas ordenáveis em mais 5 telas',
        description: 'Adicionamos ordenação clicável nos títulos das colunas em mais 5 listagens: tabela de Contas a Pagar/Receber (ordene por vencimento, valor, status), Histórico de Ponto (data, funcionário, entrada/saída), tabela de Empresas no painel master Auctus (vencimento, valor mensal, plano, segmento), tabela de Vendedores no painel Auctus (comissão, meta, saldo), e Ordens de Serviço agora ordena Data e Status pela ordem correta (data por timestamp real, status pela ordem natural do fluxo). Toque uma vez sobe, outra desce.',
        category: 'melhoria',
      },
      {
        title: '30 gráficos refeitos com degradês suaves',
        description: 'Os gráficos do sistema (barras, pizzas, linhas, áreas) agora usam degradês leves no lugar de cores chapadas — bate o olho e parece mais moderno, sem perder legibilidade. Gráficos refeitos: Distribuição NPS, OS por Status, OS por Tipo, Volume ao Longo do Tempo, Faturamento, OS por Dia da Semana, Fluxo de Caixa, Distribuição por Categoria, Evolução Receita × Despesas (DRE), Distribuição por Cargo, Horas por dia, Origem dos Novos Clientes, Forma de Pagamento, Receita Mensal/Semanal, Churn Rate, Clientes por Segmento, Clientes por Plano, DRE Evolution, Vendas vs Meta, Origem dos Clientes, Evolução de Vendas, Atividade por Dia. Cores semânticas (verde sucesso, vermelho perigo, amarelo atenção) preservadas.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.9',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Cabeçalho do app no computador com sino de notificações',
        description: 'No computador agora aparece uma barra fixa no topo (mesmo que em apps de gestão modernos) com o sino de notificações no canto direito — você vê quantas novidades têm sem precisar abrir nenhum menu. Atalhos pra perfil e sair também ficaram no topo, sempre acessíveis. No celular tudo continua igual.',
        category: 'melhoria',
      },
      {
        title: 'Dashboard repaginado com cards coloridos e gráficos com degradê',
        description: 'Os cards principais (OS Abertas, Taxa de Conclusão, Faturamento) agora têm fundo colorido saturado com ícone branco — bate o olho e você lê os números mais rápido. Os gráficos de barras e pizza ganharam degradês suaves (em vez de cores chapadas) — visual mais moderno, sem perder legibilidade. E o mapa de "Equipe em Campo" agora aparece sempre, com aviso flutuante quando ninguém está em campo no momento.',
        category: 'melhoria',
      },
      {
        title: 'Tela de Contratos: filtros num botão único, lupa no lugar certo, colunas ordenáveis',
        description: 'A tela de Contratos ganhou 3 ajustes: (1) a lupa de busca agora vive dentro da barra de busca (antes ficava solta na tela), (2) os 3 filtros de Status/Saúde/Tipo foram consolidados num único botão "Filtros" que abre uma gaveta lateral (igual no celular), com badge mostrando quantos filtros ativos, (3) todos os títulos da tabela (Contrato, Cliente, Frequência, Status, Saúde, Próxima OS, Itens) agora são clicáveis pra ordenar — uma vez sobe, outra desce.',
        category: 'melhoria',
      },
      {
        title: 'Cadastro rápido de Responsável Técnico direto no contrato',
        description: 'Ao criar um contrato PMOC, se você ainda não cadastrou o Responsável Técnico, agora aparece um botão "+" ao lado do select. Toque e abre um cadastro enxuto com só os campos essenciais (nome, CFT/CREA, modalidade, registro). Cadastra, e o novo RT já fica selecionado no contrato — sem precisar sair da tela. Removemos "Responsáveis Técnicos" do menu lateral porque o cadastro rápido aqui resolve 90% dos casos. A tela completa de gestão (com upload de assinatura, carimbo, etc) continua acessível pela URL direta.',
        category: 'recurso',
      },
      {
        title: 'Assinatura do Responsável Técnico: agora dá pra desenhar à mão',
        description: 'Ao cadastrar/editar um Responsável Técnico, a assinatura tem 2 modos: (1) Upload de imagem — fotografe a assinatura no papel e envie (recomendado pra fins jurídicos), (2) Desenhar agora — desenhe com o dedo no celular ou mouse no computador. Pra carimbo, mantemos só o upload (carimbo desenhado não faz sentido).',
        category: 'recurso',
      },
      {
        title: 'Busca de OS na Agenda do computador com modal paginado',
        description: 'Na Agenda do computador agora tem uma lupa no topo (faltava antes — só tinha no celular). Toque na lupa: abre um modal com campo de busca focado, e os resultados aparecem em cards paginados (10 por vez) mostrando número da OS, cliente, data e status colorido. A busca cobre número da OS, cliente, descrição, técnico atribuído, título de tarefa e tipo de serviço. Toque num resultado: o modal fecha, o calendário pula pro mês/dia correto, e o detalhe da OS aparece no painel lateral. Útil quando você sabe que a OS existe mas não lembra exatamente quando foi.',
        category: 'recurso',
      },
      {
        title: 'Legendas da Agenda no computador agora ficam abaixo do calendário',
        description: 'Pequeno ajuste: as legendas de cores por tipo de serviço (chips coloridos + Feriado) agora aparecem abaixo do calendário no computador, em vez de espremidas acima. Mais respiração visual e ordem natural de leitura. No celular continua igual (sheet de baixo).',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.8',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Checklist sanitário PMOC nas Ordens de Serviço',
        description: 'OSs vinculadas a contratos PMOC agora capturam dados técnicos exigidos pela Lei 13.589/2018: temperatura de insuflamento e retorno, tensão, corrente, pressão de gás refrigerante e vazão. Quando o técnico digita um valor fora da faixa esperada do equipamento, o app mostra um aviso amarelo discreto pedindo conferência — sem bloquear o salvamento. Os 3 templates padrão (Split, Central de Água Gelada, Fancoil) já vêm prontos pra cada empresa, e você pode duplicar e personalizar.',
        category: 'recurso',
      },
      {
        title: 'Classificação de conformidade ao finalizar OS PMOC',
        description: 'Antes de fechar uma OS PMOC, o técnico classifica se o serviço ficou "Conforme" (tudo dentro do esperado), "Parcial" (alguma medida fora da faixa mas operacional) ou "Não-conforme" (problema técnico a registrar). Nos casos parcial ou não-conforme, o app pede uma nota explicativa obrigatória. O status fica visível no card de detalhes da OS e no histórico do portal público.',
        category: 'recurso',
      },
      {
        title: 'Limpeza definitiva do PMOC antigo',
        description: 'Removemos definitivamente as tabelas internas do sistema PMOC antigo (que estavam em modo somente-leitura desde a versão 1.9.0, quando migramos tudo pra Contratos). Nenhum dado se perdeu — tudo já vivia no formato novo. Liberamos espaço e simplificamos o banco.',
        category: 'melhoria',
      },
      {
        title: 'Correção de vazamento entre empresas em templates de formulários',
        description: 'Auditoria de segurança identificou e corrigiu uma falha onde um administrador de uma empresa poderia, em tese, editar templates de formulários de outra empresa se conhecesse o ID. A regra de acesso (Row Level Security) agora obriga conferência da empresa antes de qualquer alteração em templates ou perguntas. Vetor de vazamento entre tenants fechado.',
        category: 'seguranca',
      },
    ],
  },
  {
    version: '1.9.7',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Dossiê PMOC em PDF — Capa + Termo + Certificado, com 1 toque',
        description: 'Cada contrato PMOC agora gera o Dossiê em PDF (3 páginas): uma capa preta profissional com sua marca, o Termo de Responsabilidade Técnica preenchido com seus dados (empresa, CNPJ, RT, CFT, cidade) puxados do banco, e o Certificado de Conformidade com a Lei Federal 13.589/2018. Pronto pra entregar ao cliente final ou ao fiscal sanitário. Cada geração fica salva com versão (v1, v2, v3...) — você sempre pode baixar versões antigas.',
        category: 'recurso',
      },
      {
        title: 'Edição livre dos textos antes de gerar o PDF',
        description: 'Você não fica preso ao texto padrão. Na aba "Documentos" do contrato PMOC, toque em "Editar" no Termo de Responsabilidade Técnica ou no Certificado — abre um editor estilo Word/Notion (negrito, itálico, listas, títulos, links). Os dados da sua empresa já vêm preenchidos automaticamente, mas você pode corrigir cláusulas, adicionar observações, reescrever frases ou personalizar como quiser. Cada contrato tem seu texto independente. Mudou de ideia? Botão "Restaurar texto padrão" volta tudo ao original.',
        category: 'recurso',
      },
      {
        title: 'Cronograma Anual em PDF — 12 meses de uma vez',
        description: 'Toque em "Gerar PDF Anual" e baixe um PDF de 12 páginas (1 mês por página) com todas as manutenções daquele contrato marcadas no calendário, com cores por status (verde = concluída, vermelho = atrasada, azul = agendada). Pronto pra entregar pra fiscalização anual ou planejamento interno. Também versionado.',
        category: 'recurso',
      },
      {
        title: 'Aba "Cronograma" no contrato PMOC com calendário interativo',
        description: 'Dentro de qualquer contrato PMOC, abra a aba "Cronograma" e veja o calendário visual (mês/semana/dia) com todas as OSs daquele contrato — igual à tela de Agenda que você já conhece, mas filtrado pelo contrato. Toque numa OS pra ver detalhes. No celular o calendário se adapta com altura confortável e scroll vertical interno.',
        category: 'recurso',
      },
      {
        title: 'Portal PMOC público mostra PDFs reais e cronograma do cliente',
        description: 'Os 4 cards "Disponível em breve" no portal público (URL única do contrato) viraram 2 cards reais com botão "Baixar PDF": Dossiê PMOC e Cronograma Anual. Cada link de download é seguro e expira em 24h — quem tem o QR Code físico baixa direto. O portal também ganhou uma seção "Cronograma de manutenções" mostrando o calendário do contrato em modo somente-leitura, pro cliente final acompanhar quando vão ser as próximas visitas.',
        category: 'recurso',
      },
      {
        title: 'Segurança reforçada nos termos editados',
        description: 'O editor de texto bloqueia automaticamente qualquer tentativa de injetar código malicioso (HTML perigoso, scripts, iframes). A sanitização acontece em 2 camadas: no navegador antes de salvar, e novamente no servidor antes de gerar o PDF. Mesmo se algo escapar pela UI, o servidor descarta. Também limitamos o tamanho do texto em 50KB por documento (proteção contra abuso).',
        category: 'seguranca',
      },
    ],
  },
  {
    version: '1.9.6',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Seta de voltar no topo do app celular',
        description: 'Agora no celular aparece uma seta no canto superior esquerdo do app que te leva pra tela anterior, igual aplicativos nativos de iPhone e Android. A seta some quando você está na tela Início (não tem pra onde voltar).',
        category: 'recurso',
      },
      {
        title: 'Puxar a tela pra baixo recarrega o conteúdo (pull-to-refresh)',
        description: 'Padrão clássico de aplicativos nativos: agora, em qualquer tela do app no celular, basta puxar a página pra baixo a partir do topo que o conteúdo recarrega automaticamente — útil pra ver dados atualizados (novas OS, novos pagamentos, novos leads, etc.) sem precisar voltar ao menu e abrir de novo. Aparece um indicador circular que cresce conforme você puxa; ao soltar passado o limite, ele gira indicando que tá carregando.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.9.5',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Portal PMOC público — cada contrato PMOC tem um link só dele',
        description: 'Toda contrato PMOC agora gera automaticamente uma URL pública única (algo como /pmoc/unidade/abc123...). Compartilhe esse link com seu cliente ou exiba na parede da loja: qualquer pessoa que abrir vê o painel completo da unidade — nome da unidade, status atual (Em dia / Manutenção pendente / Necessita atenção), Responsável Técnico com CFT/CREA, próxima manutenção agendada e histórico completo de manutenções realizadas com fotos. Tudo sem precisar de login. O portal funciona perfeito no celular pra quem escanear pelo QR Code físico.',
        category: 'recurso',
      },
      {
        title: 'QR Code imprimível em A4 pra colar no quadro físico da unidade',
        description: 'Dentro do contrato PMOC, na aba "Portal Público", você gera um PDF profissional pronto pra impressão: logo da sua empresa no topo, nome da unidade, QR Code grande no centro (7,8cm), URL legível embaixo (pra quem prefere digitar), e selo "Conforme Lei Federal 13.589/2018" no rodapé. O cliente cola na parede e qualquer fiscal sanitário/anvisa que passar escaneia direto e vê tudo.',
        category: 'recurso',
      },
      {
        title: 'Acesso público é por token — pode regenerar se vazar',
        description: 'A URL do portal tem um token único de 128 bits (impossível de adivinhar). Mas se algum dia você quiser invalidar — exemplo: o cliente cancelou contrato, ou o QR Code físico ficou perdido por aí — basta tocar em "Regenerar token" no contrato (só admin e gestor podem). O QR antigo deixa de funcionar instantaneamente e você imprime um novo. Toda confirmação destrutiva tem aviso claro pra evitar acidente.',
        category: 'seguranca',
      },
      {
        title: 'Selo "Conforme Lei 13.589/2018" no portal e nas OSs PMOC',
        description: 'O portal público da unidade exibe o selo de conformidade legal no topo (faixa horizontal) e no rodapé. As Ordens de Serviço vinculadas a contratos PMOC já mostravam o selo desde a versão anterior — agora ele também aparece em todos os documentos públicos. Marketing orgânico: o fiscal lê o selo, e quem vê o portal sabe que o sistema garante a conformidade.',
        category: 'recurso',
      },
      {
        title: 'Aviso ao editar descrição de OS PMOC',
        description: 'Quando você edita uma Ordem de Serviço que pertence a um contrato PMOC, agora aparece um aviso amarelo discreto acima do campo "Descrição": "Os primeiros 200 caracteres podem aparecer no portal público — escreva pensando em quem está do outro lado (cliente, fiscal)". O aviso não bloqueia salvar nada — é só um lembrete pra evitar que linguagem interna ("cliente chato", gírias) acabe no portal público.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.4',
    date: '23 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Login no celular ganha título "LOGIN", rodapé com versão, e textos em CAPS',
        description: 'Pequenos ajustes no novo login mobile: agora aparece o título "LOGIN" em cima do formulário (igual a versão do computador), os links "ESQUECI MINHA SENHA" e "AINDA NÃO TEM CONTA? CADASTRE-SE" estão em caixa alta com espaçamento de letras, e o rodapé com versão do sistema, link "Desenvolvido por Auctus", copyright e botão de atualizar voltou pro fim da gaveta de login. A gaveta também ganhou uma margem inferior um pouco maior pra ficar mais confortável visualmente.',
        category: 'melhoria',
      },
      {
        title: 'Tela de Cadastro com mesmo visual de aplicativo no celular',
        description: 'A tela de cadastro de empresa nova no celular agora segue o mesmo padrão da tela de login: o formulário aparece em uma "gaveta" que desliza de baixo com cantos arredondados, alça de toque no topo, e o logo do Dominex flutua sobre o fundo escuro animado. As 4 etapas do cadastro (Telefone, Email, Dados, Senha) continuam funcionando exatamente como antes, só ganharam visual mais nativo.',
        category: 'melhoria',
      },
      {
        title: 'Fluxo de "Esqueci minha senha" no celular agora aparece legível',
        description: 'Quando você toca em "Esqueci minha senha" no celular, o fluxo de recuperação de senha (informar email → receber código → criar nova senha) aparece dentro da mesma gaveta do login. Antes os textos ficavam quase invisíveis porque estavam herdando estilo de tela escura mas o fundo da gaveta é claro. Agora todos os textos, inputs e botões usam estilo claro consistente.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.3',
    date: '23 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Detalhe de Empresa e Vendedor (painel Auctus) também ganham visual de aplicativo no celular',
        description: 'Auditamos as telas de detalhe e duas estavam com visual desktop no celular: detalhe da Empresa (painel master Auctus) tinha título grande de 3rem que dominava a tela e abas em barra desktop, e detalhe do Vendedor tinha 4 abas em grid apertado. Agora as duas usam pílulas horizontais pra trocar de aba (mesmo padrão do resto do sistema), os botões de ação (Voltar/WhatsApp/Editar/Excluir) virou ícones compactos no mobile (com label só no computador), e o título reduziu pra "text-xl" no celular. Detalhe de Cliente, Equipamento, Contrato e Checklist já estavam OK.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.2',
    date: '23 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Abas em pílulas também nas telas de detalhe de Cliente, Equipamento e listagem de Equipamentos',
        description: 'O novo visual de pílulas horizontais pra trocar de aba que entrou em 1.9.1 agora também aparece nas telas que ainda estavam com o menu suspenso: detalhe do Cliente (abas Geral, Equipamentos, Histórico de OS, Tarefas, Chamados, Contratos, Financeiro), detalhe do Equipamento (Geral, Anexos, Tarefas) e listagem de Equipamentos (Equipamentos, Categorias). Tudo padronizado agora — o sistema inteiro usa o mesmo padrão de troca de aba no celular.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.9.1',
    date: '23 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Busca de tarefa/OS direto na Agenda no celular',
        description: 'No celular, ao tocar no ícone de lupa no topo da Agenda, agora a busca abre direto na própria tela — em vez de te jogar pra tela de Ordens de Serviço. Aparece um campo onde você digita parte do título da tarefa, nome do cliente, tipo de serviço, número da OS ou nome do equipamento, e a agenda filtra os eventos visíveis na hora. Toque no X pra fechar e voltar pro título "Agenda".',
        category: 'melhoria',
      },
      {
        title: 'Trocas de aba no celular com visual mais de aplicativo',
        description: 'Telas que têm várias abas internas (Ordens de Serviço, Equipamentos, Orçamentos, Funcionários, Usuários, Catálogo de Serviços, Financeiro, Contratos PMOC, Admin de Empresas, Admin Financeiro, Admin CRM, Admin Domiflix) usavam um menu suspenso pra trocar de aba no celular. Agora viraram pílulas horizontais que você rola de lado e toca pra trocar — visual mais nativo e direto, sem precisar abrir um menu suspenso.',
        category: 'melhoria',
      },
      {
        title: 'Ícones de ação do detalhe da OS agora respeitam o tema claro',
        description: 'No tema claro, os ícones de ação no detalhe de uma Ordem de Serviço (Pausar, Finalizar, Editar, Excluir, Link, etc.) tinham fundo levemente colorido que ficava parecendo "lavado". Agora no tema claro o fundo é branco com borda fina colorida e ícone saturado da cor da ação, deixando o visual mais limpo. No tema escuro, o fundo colorido continua igual.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.9.0',
    date: '23 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Contratos PMOC chegaram (Lei Federal 13.589/2018)',
        description: 'Agora você pode marcar qualquer contrato como PMOC ligando o toggle "É um contrato PMOC?" no formulário. Ao ativar, você escolhe o Responsável Técnico (engenheiro/técnico com CFT/CREA que supervisiona o PMOC) e o contrato passa a operar no modo PMOC: as ordens de serviço são geradas automaticamente pelo nosso sistema todo dia (conforme a periodicidade que você definiu) e saem com o selo "Conforme Lei Federal 13.589/2018". Não precisa mais ficar criando OS manualmente.',
        category: 'recurso',
      },
      {
        title: 'Cadastro de Responsáveis Técnicos da sua empresa',
        description: 'Nova tela em Gestão → Responsáveis Técnicos. Cadastre uma vez cada engenheiro/técnico com nome, CFT/CREA, modalidade, número de registro ART/TRT, foto de assinatura e carimbo. Depois é só selecionar em cada contrato PMOC. Pode ativar e desativar conforme o profissional entra e sai da equipe — ninguém precisa preencher esses dados de novo a cada contrato.',
        category: 'recurso',
      },
      {
        title: 'Indicador de saúde em todos os contratos',
        description: 'Cada contrato agora mostra um indicador de saúde calculado em tempo real, baseado nas ordens de serviço em atraso vinculadas a ele: 🟢 Em dia (nenhuma OS atrasada), 🟡 Manutenção pendente (1 OS atrasada), 🔴 Necessita atenção (2 ou mais OSs atrasadas). Vale pra contrato PMOC e comum. Bate o olho na lista e já sabe quais contratos pedem atenção sua.',
        category: 'recurso',
      },
      {
        title: 'Selo "Conforme Lei Federal 13.589/2018" nas OSs PMOC',
        description: 'Toda ordem de serviço vinculada a um contrato PMOC agora exibe o selo de conformidade — no card da OS na lista e no detalhe completo. É um sinal visual rápido que essa OS faz parte de um plano de manutenção regulado por lei. Nas próximas versões esse selo vai sair também nos relatórios em PDF e no portal público do PMOC.',
        category: 'recurso',
      },
      {
        title: 'Filtros novos na tela de Contratos',
        description: 'Adicionamos dois filtros: "Saúde" (todas, em dia, pendente, atenção) e "Tipo" (todos, PMOC, comum). Combine com o filtro de status que já existia. No celular, tudo entra no mesmo painel de filtros. O link da tela aceita parâmetros, ex: /contratos?tipo=pmoc abre direto filtrando só PMOC — útil pra compartilhar entre equipe.',
        category: 'melhoria',
      },
      {
        title: 'A tela antiga de PMOC virou atalho',
        description: 'A página antiga de PMOC (que vivia separada) agora redireciona automaticamente pra tela de Contratos com filtro PMOC ligado. Tudo num lugar só. Os links que você tinha salvos pra /pmoc continuam funcionando.',
        category: 'melhoria',
      },
      {
        title: 'Geração de OS PMOC pelo sistema diariamente',
        description: 'Um serviço automático nosso roda todo dia e verifica quais contratos PMOC têm OSs a gerar (com base na periodicidade e na data da próxima geração). Quando chega a hora, ele cria a OS sozinho, com o técnico responsável já vinculado e o selo de conformidade aplicado. Você acompanha tudo na tela de Ordens de Serviço como sempre.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.8.51',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Fim do "flash" do cabeçalho grande ao recarregar a Agenda',
        description: 'Ao dar refresh na Agenda no celular, o cabeçalho grande de computador aparecia por um instante antes do cabeçalho compacto de aplicativo tomar conta. Isso acontecia porque a tela de carregamento usava o cabeçalho antigo. Agora ela usa o mesmo cabeçalho compacto direto, sem piscada.',
        category: 'correcao',
      },
      {
        title: 'Foco automático da busca ao vir da Agenda funciona de verdade',
        description: 'O atalho da lupa na Agenda agora foca corretamente na caixa de busca da tela de Ordens de Serviço quando a tela acaba de carregar — antes o foco tentava acontecer antes do campo existir e falhava silenciosamente. Pequeno delay de 80ms espera o campo aparecer e foca.',
        category: 'correcao',
      },
      {
        title: 'Busca de OS encontra também tarefas e equipamentos',
        description: 'A busca de Ordens de Serviço agora cobre, além de cliente e número da OS, o tipo de serviço (ex: "Geladeira", "Higienização"), o título da tarefa e o nome do equipamento. Útil pra encontrar rápido todas as OS de um tipo específico, todas as tarefas com determinado título, ou todas as visitas a um equipamento específico.',
        category: 'melhoria',
      },
      {
        title: 'Transição suave entre telas no app',
        description: 'Ao navegar entre telas do sistema, agora a tela nova entra com um leve efeito de fade (200ms), em vez de "trocar instantaneamente". Detalhe sutil que ajuda na sensação de aplicativo nativo. Vale pra todas as telas do sistema.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.50',
    date: '21 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Tela de login no celular com cara de aplicativo nativo',
        description: 'A tela de login no celular foi redesenhada pro pattern de bottom sheet: o fundo continua com o efeito "veil" escuro animado da marca, o logo aparece flutuando na parte superior, e o formulário sobe como uma gaveta arredondada de baixo (com handle de toque e tema claro de app nativo). Inputs ganharam altura confortável pra toque (48px), o botão "Entrar" ficou grande e centralizado, e o link "Esqueci minha senha" ficou ao lado do "Lembrar-me". No computador, a tela de login continua exatamente como era (card escuro centralizado).',
        category: 'melhoria',
      },
      {
        title: 'Atalho de busca de OS direto da Agenda',
        description: 'Na tela de Agenda no celular, ao lado do ícone de OS Pausadas, agora aparece um ícone de lupa. Toque nele e o app abre a tela de Ordens de Serviço já com a caixa de busca aberta e o teclado pronto pra digitar — útil pra encontrar rápido uma OS específica sem precisar abrir o menu OS e tocar na busca depois.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.49',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Agenda Dia e Semana com altura menor e rolagem por horário no celular',
        description: 'A visão de Dia e a visão de Semana da Agenda estavam ocupando a tela inteira no celular (com 14 horários em cards altos), forçando o usuário a rolar muito. Agora a agenda fica numa altura fixa (60% da tela), com rolagem vertical interna pra navegar pelos horários — fica mais compacta e dá pra ver o resumo do dia mais rápido. Os horários ficaram um pouco mais baixos (de 80 pra 56 pixels) também, pra caber mais conteúdo na tela sem perder legibilidade. Na visão de Mês e no computador, tudo segue como antes.',
        category: 'melhoria',
      },
      {
        title: 'Botões do detalhe da OS no celular ficaram com cara de app',
        description: 'Refinamos o detalhe da OS (que abre ao tocar numa Ordem de Serviço na lista): em vez de 6 botões grandes empilhados verticalmente, agora as ações secundárias (Pausar, Retomar, Finalizar, Reabrir, Editar, Excluir, Link, Avaliação) aparecem como ícones coloridos compactos em uma grade de 4 colunas. O botão principal "Preencher OS" continua grande no rodapé. Resultado: o detalhe respira mais e tem visual de aplicativo nativo (iOS Mail / iFood / banco) em vez de formulário web empilhado.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.48',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Ao tocar em uma OS, dá pra agir direto sem fechar o detalhe',
        description: 'Antes, ao tocar em uma Ordem de Serviço para ver os detalhes no celular, só aparecia o botão de copiar link de avaliação (e só pra OS concluída). Agora o detalhe traz o mesmo conjunto de botões que aparece no painel da Agenda: Preencher OS (ou Relatório de Serviço se já concluída), Finalizar OS, Reabrir OS, Pausar/Retomar OS, Editar, Excluir, e Copiar link de acompanhamento. Cada botão aparece só nos status onde faz sentido (ex: Pausar só se a OS está em andamento). Permissões respeitadas: quem não pode editar/excluir não vê os botões.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.47',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Legenda da Agenda no celular para de entulhar a tela',
        description: 'A lista de cores e tipos de serviço que aparece no rodapé da Agenda estava ocupando metade da tela no celular quando havia muitos tipos cadastrados. Agora aparece um botão compacto "Legenda" com um número mostrando quantos tipos existem; toque pra abrir uma gaveta de baixo com a lista organizada em duas colunas. No computador, a legenda continua aparecendo inline como antes.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.46',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cartões de status e botão flutuante mais bonitos no celular',
        description: 'Refinamos dois pontos visuais do celular em todas as telas: (1) Os cartões coloridos de status no topo das telas (Ordens de Serviço, Estoque, Orçamentos, etc.) agora têm o ícone centralizado em cima, a etiqueta no meio e o número embaixo, todos alinhados ao centro — visual mais limpo e mais "app de verdade". Ficaram um pouco mais altos para dar espaço, mas a leitura ficou mais clara. (2) O botão flutuante de "Novo X" no canto inferior direito ficou mais minimalista, com nome curto: agora aparece "Cliente", "Material", "OS", "Funcionário", "Orçamento", etc. (em vez de "Novo Cliente", "Cadastrar Material", "Nova OS"...) — o ícone de + à esquerda já deixa claro que é pra criar.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.45',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Polish final do visual mobile no sistema',
        description: 'Aplicamos o visual de aplicativo nativo nos últimos pedaços que ficaram fora das ondas anteriores: o Controle de Ponto Eletrônico (dentro de Funcionários), as Faturas de Cartão (dentro do Financeiro), as Temporadas e Episódios do Domiflix (quando o admin abre o detalhe de um título-série), o painel compartilhado de Checklists, os Custos Globais (dentro de Orçamentos) e a gestão de Categorias e Campos Customizados de Equipamento. Em todos os casos, o celular ganhou cabeçalho compacto, lista no estilo iOS/Android com arrastar pra editar/excluir e ícone de três pontinhos, e botão flutuante de "Novo X" quando aplicável. No computador, tudo continua exatamente como antes.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.44',
    date: '21 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Todas as telas do sistema com visual de aplicativo nativo no celular',
        description: 'Fechamos o capítulo mobile-first do Dominex: 18 telas foram redesenhadas pra ter o mesmo visual de aplicativo nativo que Ordens de Serviço, Clientes e Equipamentos já tinham. As telas atualizadas agora têm cabeçalho compacto, lista no estilo iOS/Android (arrastar pra editar/excluir + ícone de três pontinhos com menu), botão flutuante de "Novo X" no canto inferior direito, filtros agrupados em gaveta de baixo, e contadores em chips coloridos que rolam de lado. Telas refatoradas: Agenda, PMOC, Rastreamento de Técnicos, Catálogo de Serviços, Estoque, Checklists, Financeiro (tabs de listagem), Orçamentos, Contratos, CRM (kanban + opção de lista), Funcionários, Usuários, Equipes, e os painéis de administração da Auctus (Empresas, Vendedores, Financeiro Auctus, CRM Auctus, Catálogo Domiflix). No computador, todas continuam exatamente como antes. Listagens com kanban (CRM) e árvores aninhadas (Domiflix) foram tratadas com cuidado pra preservar a funcionalidade existente.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.43',
    date: '21 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Clientes e Equipamentos no celular ganharam cara de aplicativo',
        description: 'As telas de Clientes e Equipamentos no celular foram redesenhadas para terem o mesmo visual de aplicativo nativo que a tela de Ordens de Serviço já tem: cabeçalho compacto, busca fixa no topo, lista no estilo iOS/Android (cada cliente/equipamento como uma linha alta com foto ou ícone à esquerda, nome em destaque, telefone+cidade ou categoria+cliente embaixo). Arrasta um item pra esquerda → aparecem os botões Editar (laranja) e Excluir (vermelho); ou toca no ícone de três pontinhos para abrir o menu de ações. Botão "Novo Cliente" e "Novo Equipamento" viraram botão flutuante no canto inferior direito. Em Equipamentos, os contadores por categoria viram chips coloridos que rolam de lado no topo, e o filtro por categoria/cliente entra numa gaveta de baixo. As permissões de criar/editar/excluir agora aparecem corretamente — quem não tem permissão não vê os botões. No computador, ambas as telas continuam exatamente como antes.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.42',
    date: '21 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Todas as janelas do app no celular agora deslizam de baixo',
        description: 'Antes, ao confirmar uma exclusão, abrir um cadastro ou ver detalhes de algo no celular, aparecia uma janela retangular no meio da tela — comum em sites, mas estranha em aplicativo. Agora todas essas janelas (de confirmação, formulário, alerta) deslizam de baixo pra cima como gaveta, com cantos arredondados no topo e botões cheios espalmados — igual app nativo de iOS e Android. Os botões de Cancelar e Confirmar ficam empilhados, com a ação principal embaixo, mais perto do polegar. No computador, as janelas continuam aparecendo no centro como antes. Mudança vale automaticamente pra todas as janelas do sistema, sem precisar atualizar tela por tela.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.41',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Fotos da Ordem de Serviço abrem dentro do app',
        description: 'Antes, ao tocar em uma foto na visualização da Ordem de Serviço, o navegador abria a imagem em uma nova aba — quebrava o fluxo, especialmente no celular. Agora a foto abre em um visualizador sutil em cima da tela: imagem grande centralizada, fundo escurecido, setas para passar entre fotos do mesmo grupo, botão para baixar e botão para fechar. Vale tanto para as fotos uploadadas direto na OS quanto para as fotos enviadas nas respostas do checklist do técnico.',
        category: 'correcao',
      },
      {
        title: 'Carrossel de status da OS no celular mais polido',
        description: 'Os cartões coloridos de status no topo da tela de Ordens de Serviço (no celular) ficaram um pouco mais altos, com layout redesenhado: ícone colorido no canto superior esquerdo, nome do status na direita e o número grande embaixo em destaque. O cartão ativo ganhou uma sombra suave para ficar mais óbvio. E agora o próximo cartão aparece "cortado pela metade" na borda direita — fica claro que dá pra rolar de lado pra ver mais status.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.40',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Botão Editar volta para a cor laranja da marca',
        description: 'O botão Editar no menu de três pontinhos e no swipe das Ordens de Serviço no celular estava aparecendo em azul, fora do padrão visual do Dominex. Voltou para o laranja oficial da marca, igual aos botões Editar das outras telas do sistema.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.39',
    date: '21 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Atalhos rápidos nas Ordens de Serviço no celular',
        description: 'Cada Ordem de Serviço na lista do celular agora tem duas formas de acessar as ações sem precisar abrir o detalhe: (1) Toque no ícone de três pontinhos (⋮) no canto direito do item — abre um menu com Visualizar, Abrir como técnico, Editar (se você tem permissão) e Excluir (se você tem permissão). (2) Arraste o item pra esquerda — aparecem dois botões coloridos: Editar (azul) e Excluir (vermelho), basta tocar pra disparar. Padrão de Gmail, iOS Mail e Telegram. Tocar na linha continua abrindo a tela de detalhes como antes.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.38',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Novo loading com a cor da marca',
        description: 'O carregamento de telas e do app inteiro foi atualizado: agora aparece um círculo verde Dominex girando de forma mais elegante (anel completo, mais fluido), no lugar do spinner de borda tracejada anterior. O visual fica mais consistente com a identidade da marca e parece mais com aplicativo nativo.',
        category: 'melhoria',
      },
      {
        title: 'Acertos visuais da tela de Ordens de Serviço no celular',
        description: 'Três ajustes finos no celular: (1) o botão flutuante "Nova OS" sumia atrás do menu "Mais" e de outras janelas — agora desaparece automaticamente quando qualquer menu, gaveta ou diálogo é aberto. (2) Subimos o botão flutuante um pouco mais alto para não ficar colado no menu inferior. (3) Aumentamos o espaço entre as Ordens de Serviço na lista para dar visual mais de aplicativo nativo, com cada item respirando melhor.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.37',
    date: '21 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Tela de Ordens de Serviço com cara de aplicativo no celular',
        description: 'A tela de Ordens de Serviço foi redesenhada pra ficar com visual de aplicativo no celular: cabeçalho mais compacto, os contadores de status (Agendada, Pendente, A Caminho, Em Andamento, Pausada, Concluída, Cancelada) agora ficam numa fileira que desliza pro lado, os filtros foram agrupados num botão "Filtros" que abre uma gaveta de baixo (com período, status, alternar entre Lista/Kanban e gerenciar status, tudo num só lugar), a busca fica fixa no topo, e o botão "Nova OS" virou um botão flutuante no canto inferior direito. A lista de OS ficou mais limpa: cada item mostra o número, cliente, tipo de serviço e data — toque na linha pra abrir os detalhes e trocar status, editar ou excluir. No computador, a tela continua exatamente como era antes, com a tabela completa e todos os botões inline.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.35',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Rodapé com versão e botão de atualizar voltou no celular',
        description: 'O rodapé com a versão do sistema, link "Desenvolvido por Auctus", copyright e botão de atualizar (limpa cache e recarrega) tinha sumido do celular e tablet depois da reformulação do menu lateral. Agora voltou em dois lugares: no fim de cada tela do app (rolando até o final) e no rodapé do menu "Mais". Quem usa no computador continua vendo o rodapé como antes.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.34',
    date: '21 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Erro de localização ao finalizar OS em locais com sinal fraco',
        description: 'Quando o técnico estava num local com sinal de celular fraco ou em ambiente fechado, o app esperava 15 segundos pelo GPS e mostrava erro "A localização demorou demais para responder", impedindo a finalização da OS. Agora o app tenta uma segunda estratégia automaticamente: se o GPS não responde no tempo, busca a localização via rede do celular/Wi-Fi com tolerância maior (até 30 segundos e aceitando posição capturada nos últimos 60 segundos). Só mostra erro se as duas tentativas falharem — o que cobre praticamente todos os casos reais de campo.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.32',
    date: '20 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Item "Configurações" duplicado removido do menu lateral',
        description: 'O item "Configurações" foi removido da lista de navegação do menu lateral porque já existe um botão de Configurações maior, lado a lado com o botão Sair, no rodapé do próprio menu. A funcionalidade segue a mesma — só tirou a duplicação.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.31',
    date: '20 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Troca de conta no menu de perfil funcionando direito',
        description: 'Corrigida uma condição de corrida que afetava o switcher de contas: ao clicar numa conta salva, em alguns casos a sessão recém-aberta era apagada e você voltava pra tela de login. Agora a troca funciona como esperado — clique numa conta e ela carrega imediatamente. Se uma conta estiver expirada, ela é removida da lista e você vai pra tela de login com o email já preenchido (comportamento que já existia, agora confiável).',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.30',
    date: '20 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Menu de troca de contas mais bonito e sempre disponível',
        description: 'O switcher de contas foi reformulado: agora abre direto dentro do menu do perfil quando você clica no avatar, com layout mais limpo (sua conta no topo, outras embaixo, "+ Adicionar conta" e "Sair de todas"). Disponível pra qualquer usuário do sistema (não só para administradores). Ao clicar em "Adicionar conta", você vai direto pra tela de login pra entrar com a outra credencial. Sessões expiradas somem da lista automaticamente, e se você clicar em uma conta que precisa relogin, a tela de login já abre com o email preenchido. Limite de 5 contas salvas por navegador, agora com criptografia simples no armazenamento.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.29',
    date: '20 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Várias contas no mesmo navegador, troca com 1 clique',
        description: 'Se você usa o Dominex com mais de uma conta — administrador e técnico, conta principal e conta de demonstração — agora dá pra salvar até 5 contas no menu do perfil e alternar entre elas com um único clique, sem precisar fazer logout e login de novo. A conta que você está usando agora aparece no topo do menu; as outras ficam listadas embaixo. Clique em "Adicionar conta" pra incluir mais uma. As contas salvas ficam só nesse navegador (não sincronizam entre dispositivos) e podem ser removidas quando você quiser.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.8.28',
    date: '20 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Cabeçalho padronizado em todas as telas principais',
        description: 'Os títulos e subtítulos das telas principais (Dashboard, Ordens de Serviço, Clientes, Equipamentos, Agenda, Financeiro, CRM, Estoque, Orçamentos, Contratos, Configurações e Perfil) agora seguem um padrão visual único — mesmo tamanho, peso e espaçamento em todas elas. Cada tela ganhou também um ícone identificador no cabeçalho, deixando mais fácil reconhecer onde você está. Mudança puramente visual, não altera nenhuma função.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.26',
    date: '20 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Nova navegação no app: barra lateral, barra superior e atalho de Agenda no celular',
        description: 'A navegação do sistema foi redesenhada para ficar mais rápida e consistente em qualquer dispositivo. No computador, você pode escolher entre a barra lateral à esquerda (padrão) ou uma barra horizontal no topo (alternativa), alternando em Configurações → Aparência — a preferência agora fica salva na sua conta e segue você entre dispositivos. No tablet, um botão de Menu no topo abre o menu completo em painel lateral. No celular, uma barra fixa na parte inferior dá acesso direto às telas principais (Início, OS, Clientes), com um botão destacado em verde no centro que leva direto pra Agenda, e um botão Menu que abre uma gaveta com todas as outras opções e o seu perfil. A página antiga /menu foi substituída por essa gaveta — não tem mais reload, abre por cima da tela.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.22',
    date: '18 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Nome da empresa não aparece mais errado no cabeçalho da OS',
        description: 'Em alguns casos, ao trocar de uma OS para outra pela agenda sem recarregar a página, o cabeçalho da tela continuava mostrando o nome da empresa anterior por alguns instantes — ou até persistia, caso a próxima OS não tivesse uma empresa vinculada. Corrigido: agora o cabeçalho sempre limpa primeiro e mostra apenas a empresa correta da OS aberta.',
        category: 'correcao',
      },
      {
        title: 'Erros do GPS no check-in agora aparecem em português',
        description: 'Quando o técnico tentava fazer check-in e o GPS falhava (sem sinal, sem permissão ou demorando demais), o sistema mostrava uma mensagem em inglês como "Position update is unavailable". Agora aparecem mensagens em português com orientação prática para cada caso: "verifique se o GPS está ligado", "libere a permissão de localização", "tente daqui a alguns segundos". Também foi adicionado um tempo limite de 15 segundos para evitar espera infinita quando o sinal está ruim.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.21',
    date: '18 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Vários checklists no mesmo equipamento',
        description: 'Ao criar ou editar uma OS, agora dá pra adicionar mais de um checklist no mesmo equipamento — igual já funcionava em OS sem equipamento vinculado. Útil quando o atendimento exige checklists separados no mesmo aparelho (por exemplo: PMOC obrigatório por lei + checklist interno da empresa + NPS final). Cada checklist fica como um "badge" que pode ser adicionado ou removido livremente. O app do técnico em campo, o modal "Ver OS" e o relatório final mostram cada checklist separadamente, sem misturar respostas. OS antigas com um único checklist continuam funcionando normalmente, sem alteração.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.20',
    date: '18 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Foto na OS agora abre a câmera no Android',
        description: 'No campo de foto de uma pergunta da OS, o botão único "Enviar Foto" foi substituído por dois botões lado a lado: "Tirar Foto" (abre a câmera do celular direto) e "Galeria" (escolhe uma foto já existente). Antes, no Chrome do Android, o botão único abria apenas a galeria, o que obrigava o técnico a tirar a foto fora do aplicativo e depois voltar. Quando a pergunta foi configurada para exigir câmera, segue aparecendo só o botão "Tirar Foto" (o de galeria some).',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.19',
    date: '16 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Botões da página de preços agora dizem "14 dias grátis"',
        description: 'Os três botões "Testar X Dias Grátis" da seção de preços da página pública ainda diziam "7 dias", desalinhados com a duração real do teste gratuito (14 dias) e com o restante da landing — o FAQ já havia sido corrigido na versão anterior. Agora todos os botões mostram "Testar 14 Dias Grátis", coerentes com o tempo real de trial.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.18',
    date: '15 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Teste gratuito agora libera todos os módulos',
        description: 'Empresas no período de teste gratuito passam a ter acesso a todos os módulos do Dominex enquanto o trial estiver ativo. Quando o teste acaba ou a empresa contrata um plano, o acesso volta a respeitar os módulos contratados. Antes, o acesso durante o teste já era limitado ao que estava configurado para o plano escolhido — agora você pode experimentar tudo antes de decidir.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.17',
    date: '13 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'CRM do painel master mostra todos os leads ao abrir',
        description: 'A tela do CRM master abria com um filtro de data ativo ("este mês") que escondia leads criados em outros períodos — mas os contadores no topo (Total de Leads, Em Negociação) ignoravam esse filtro e somavam todos os leads, criando inconsistência: o card dizia "3 leads" enquanto o kanban mostrava "Nenhum lead". Corrigido. Agora a tela abre mostrando todos os leads e, quando você aplica um filtro, contadores e kanban refletem o mesmo conjunto.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.16',
    date: '13 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'FAQ da página pública agora menciona 14 dias de teste grátis',
        description: 'O FAQ da landing page ainda dizia "7 dias" no card "Como funciona o teste grátis?", desalinhado com o resto da página e com a duração real do trial (14 dias). Corrigido.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.15',
    date: '12 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Vendedores voltam a aparecer nos dropdowns do painel master',
        description: 'No painel administrativo, vendedores admin não conseguiam mais ver a lista de vendedores ao gerar links de cadastro, criar ou editar empresas, ou vincular usuários admin a vendedores. Os dropdowns vinham vazios. Corrigido — agora qualquer administrador do painel master enxerga a lista de vendedores para fazer essas operações de rotina, mantendo dados sensíveis (salário, meta) acessíveis somente para super administrador.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.14',
    date: '05 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Compras no dia do fechamento do cartão agora vão para a fatura correta',
        description: 'Antes, uma compra feita exatamente no dia em que o cartão fecha entrava na fatura corrente — quando deveria entrar na próxima (regra padrão dos bancos). Em alguns casos, isso fazia parcelas sumirem do mês esperado. Corrigimos: agora compras feitas no próprio dia do fechamento ou depois entram na próxima fatura, igual ao seu banco faz. Compras feitas no dia anterior ao fechamento continuam na fatura corrente.',
        category: 'correcao',
      },
      {
        title: 'Vencimento da fatura agora respeita o dia configurado no cartão',
        description: 'Em alguns cenários, o vencimento da fatura agregada do cartão estava sendo calculado pela quantidade de dias após o fechamento em vez do dia configurado de vencimento. Despesas individuais já apareciam no mês correto, mas a fatura "fechada" mostrava data de vencimento divergente. Corrigido.',
        category: 'correcao',
      },
      {
        title: 'Botão "Recalcular faturas" nos cartões existentes',
        description: 'Cartões cadastrados antes desta correção podem ter despesas em faturas erradas. Adicionamos um botão "Recalcular faturas" no card de cada cartão de crédito (em Contas e Cartões) que reorganiza automaticamente as despesas para a fatura certa. Os valores e as despesas em si não mudam — só a fatura em que cada uma aparece. Pode ser executado quantas vezes quiser; rodar duas vezes seguidas não muda nada.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.8.13',
    date: '05 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Veja as movimentações de cada conta com 1 clique',
        description: 'No card de cada conta bancária na tela "Contas e Cartões", agora aparece um botão "Ver movimentações" que leva direto para o histórico filtrado por aquela conta. Aparece um resumo no topo com saldo inicial, entradas e saídas no período e saldo atual — assim você entende exatamente de onde veio o saldo da conta. O filtro pode ser combinado com período, categoria, status e tipo, e o link da página pode ser compartilhado: o filtro é preservado.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.8.12',
    date: '05 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Parcelas de cartão aparecem no mês correto também em Contas a Pagar/Receber',
        description: 'A correção que aplicamos na tela de Movimentações na versão anterior (parcelas aparecerem no mês da fatura do cartão) agora vale também para Contas a Pagar/Receber, DRE e Visão Geral. Antes, uma compra parcelada feita em abril aparecia em Contas a Pagar do mês de maio com a numeração da segunda parcela; agora aparece com a primeira parcela, junto com as outras compras que entram na mesma fatura. A lógica foi centralizada para evitar que esse problema apareça em outras telas no futuro.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.11',
    date: '05 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Comprovantes em despesas parceladas vão para todas as parcelas',
        description: 'Ao registrar uma despesa parcelada (no cartão ou recorrente), o sistema bloqueava o envio de anexos na criação e pedia para você editar parcela por parcela — e mesmo assim o anexo ficava só na parcela que você editava. Agora você anexa os comprovantes diretamente na hora de criar a despesa parcelada e o sistema vincula o mesmo arquivo a todas as parcelas automaticamente. Ao remover um anexo, ele some apenas da parcela em que foi removido — as outras continuam com o comprovante intacto.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.10',
    date: '05 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Veja todas as OS pausadas em qualquer data e retome com 1 clique',
        description: 'Agora você consegue ver todas as OS pausadas em qualquer mês ou ano sem precisar voltar pela agenda. Use o botão "OS Pausadas" no topo da agenda para abrir a lista completa, busque pelo cliente ou número da OS e retome quando quiser. Ao retomar uma OS antiga, ela passa a aparecer tanto na data original (preservando o histórico) quanto na agenda do dia atual, com um destaque visual para você não confundir.',
        category: 'recurso',
      },
      {
        title: 'Linha do tempo completa em cada OS',
        description: 'No detalhe de cada OS você passa a ver a linha do tempo completa: quando começou a obra, quando foi pausada, quando foi retomada e quando foi finalizada. Útil para auditoria e para acompanhar o progresso de obras longas.',
        category: 'recurso',
      },
      {
        title: 'Múltiplos comprovantes em uma transação financeira',
        description: 'Ao registrar uma transação financeira você passa a poder anexar várias fotos e PDFs (nota fiscal, recibo, foto do produto) em vez de só um arquivo. Também é possível adicionar ou remover anexos depois, ao editar a transação.',
        category: 'recurso',
      },
      {
        title: 'Parcelas de cartão aparecem no mês correto em Movimentações',
        description: 'Despesas parceladas no cartão de crédito apareciam com a numeração e o mês trocados na lista de Movimentações. Agora a parcela aparece no mês da fatura correspondente, com indicação clara de que é uma despesa de cartão. Ao passar o mouse, você vê a data original da compra.',
        category: 'correcao',
      },
      {
        title: 'Atualizações chegam automaticamente sem precisar limpar cache',
        description: 'Algumas instalações ficavam com versões antigas do app armazenadas e exigiam limpeza manual de cache toda vez que saía uma atualização. A partir desta versão, qualquer atualização nova é baixada e ativada automaticamente quando o app é aberto, sem nenhuma ação sua.',
        category: 'correcao',
      },
      {
        title: 'Modal de edição de conta a pagar agora rola em telas pequenas',
        description: 'Ao editar uma conta a pagar ou a receber em telas menores (celular, tablet, notebook compacto), o conteúdo do modal cortava o botão Salvar. Agora o miolo do modal rola e os botões Cancelar e Salvar ficam sempre visíveis.',
        category: 'melhoria',
      },
      {
        title: 'Tela de login mais resistente a travamentos',
        description: 'Reforçamos de vez a tela de login para eliminar o problema do carregamento infinito em situações específicas (login em outra aba, troca rápida de usuário, conexão lenta). Agora o sistema descarta dados de carregamento que ficaram pra trás e libera a tela em até 5 segundos mesmo se algum serviço externo demorar.',
        category: 'correcao',
      },
      {
        title: 'Ícone do app aparece corretamente em todos os navegadores',
        description: 'Em alguns navegadores e instalações, o ícone (favicon) do Dominex não carregava na aba do navegador. Adicionamos referências adicionais para garantir que o ícone apareça em todos os contextos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.9',
    date: '05 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Tela de login não trava mais em carregamento',
        description: 'Para alguns usuários, a tela de login ficava presa no estado de carregamento (com os campos em cinza) e nunca aparecia o formulário. O problema foi corrigido. Também adicionamos uma proteção que garante que a tela sempre saia do carregamento mesmo se ocorrer qualquer falha inesperada no futuro.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.8',
    date: '04 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Página inicial mais focada no vídeo',
        description: 'No celular, o vídeo de demonstração agora aparece antes do texto, e o título principal ficou maior e centralizado. No computador, o vídeo passa a ser exibido em um quadro vertical à direita, valorizando a apresentação.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.7',
    date: '04 de maio de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Vídeo de demonstração no destaque da página inicial',
        description: 'O destaque da página pública passou a exibir um vídeo de apresentação do Dominex no lugar do mockup ilustrativo. Funciona em celular e computador, com áudio ao dar play.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.8.6',
    date: '04 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Editar funcionário não trava mais ao salvar',
        description: 'Ao editar um funcionário e clicar em Salvar, a tela fechava e o botão ficava carregando para sempre, deixando a página escura. Agora o salvamento conclui imediatamente — a sincronização da foto com o usuário vinculado roda em segundo plano sem prender a tela.',
        category: 'correcao',
      },
      {
        title: 'Texto digitado no funcionário não é mais reiniciado',
        description: 'O formulário de edição de funcionário deixou de ser reiniciado quando uma atualização chega em segundo plano. Você pode digitar tranquilamente sem perder o que estava preenchendo.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.5',
    date: '01 de maio de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Edição de leads do painel master unificada',
        description: 'Ao clicar em Editar no detalhe do lead, agora abre a mesma tela usada para criar um novo lead — com todos os campos visíveis, sem duplicação. Antes, dois formulários diferentes podiam ficar fora de sincronia.',
        category: 'melhoria',
      },
      {
        title: 'Não perde mais o que está digitando no lead',
        description: 'A edição de leads no painel master deixou de ser reiniciada quando uma atualização chega em segundo plano. Você pode digitar Observações tranquilamente sem o texto sumir.',
        category: 'correcao',
      },
      {
        title: 'Campo Motivo da perda',
        description: 'Quando a etapa do lead é de perda, aparece um campo dedicado para registrar o motivo. O detalhe do lead também passa a exibir esse motivo logo abaixo das observações.',
        category: 'recurso',
      },
      {
        title: 'Confirmação visível ao salvar lead',
        description: 'Cada salvamento de lead no painel master agora mostra um aviso de sucesso. Em caso de erro, a tela continua aberta para você tentar de novo sem perder o que digitou.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.8.4',
    date: '29 de abril de 2026',
    type: 'patch',
    changes: [
      {
        title: 'CRM admin liberado para vendedores com permissão',
        description: 'Usuários admin não-master com a permissão admin_crm agora veem e gerenciam todas as oportunidades do CRM (leads, etapas e interações), independentemente de estarem ou não atribuídos como responsáveis. Antes a RLS limitava o acesso apenas ao master, deixando a tela vazia.',
        category: 'correcao',
      },
      {
        title: 'White-label não vaza mais entre empresas',
        description: 'O painel do master deixou de carregar branding de outro tenant durante hard refresh — a query de company_settings espera as roles carregarem e ignora dados de tenant para super_admin. Cache passou a ser por usuário, evitando reuso entre contas.',
        category: 'seguranca',
      },
      {
        title: 'Logout limpa branding e tema',
        description: 'Ao sair, as variáveis CSS de white-label, o tema escuro e o cache de queries são reiniciados. A tela de login volta ao branding padrão do Dominex em vez de manter a aparência da empresa anterior.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.8.3',
    date: '29 de abril de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Vendedores admin enxergam o painel administrativo',
        description: 'Usuários admin não-master (vendedores) agora veem a sidebar do painel administrativo filtrada pelas suas permissões em admin_permissions, e são redirecionados para a primeira tela admin disponível ao logar — antes ficavam com sidebar vazia em /perfil.',
        category: 'correcao',
      },
      {
        title: 'Botão Sair fora do menu de perfil',
        description: 'O botão Sair foi movido do dropdown do perfil para um ícone dedicado ao lado do avatar na sidebar (com tooltip e destaque vermelho no hover), tornando o logout um clique mais rápido. Vale para sidebar do tenant e do admin.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.7.0',
    date: '18 de abril de 2026',
    type: 'minor',
    changes: [
      {
        title: 'CRUD de usuários admin com permissões',
        description: 'Nova aba em Configurações do admin para criar, editar permissões e remover usuários do painel administrativo. Permissões granulares por tela (Dashboard, CRM, Empresas, Vendedores, Assinaturas, Financeiro, Configurações, Usuários) e por função (lançamentos, totais, ver todos os vendedores).',
        category: 'recurso',
      },
      {
        title: 'Vendedor vinculado a usuário admin',
        description: 'No formulário de vendedor é possível vincular um usuário admin. Quando vinculado e sem a permissão "ver todos os vendedores", o usuário acessa diretamente o próprio dashboard, sem ver os demais.',
        category: 'recurso',
      },
      {
        title: 'Financeiro admin completo (DRE, gráficos e categorias)',
        description: 'Novo financeiro com filtro de período padronizado, gráfico de pizza por categoria (receitas/despesas), seções dedicadas com mini-stats de Vendas e Renovações, DRE colapsável (Receita Bruta → Impostos → Receita Líquida → OPEX → EBITDA) com exportação HTML, e CRUD de categorias dinâmicas.',
        category: 'recurso',
      },
      {
        title: 'Categorias financeiras admin dinâmicas',
        description: 'O modal de nova movimentação agora usa as categorias cadastradas pelo admin, permitindo personalizar receitas e despesas usadas no DRE e nos gráficos.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.6.0',
    date: '18 de abril de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Dashboard avançado de vendedores',
        description: 'Nova página de detalhes do vendedor com filtro por período, gráficos de desempenho (vendas vs. meta, origem dos clientes, evolução semanal) e estatísticas detalhadas.',
        category: 'recurso',
      },
      {
        title: 'Controle de pagamento de vendedores',
        description: 'Gestão financeira mensal com comparativo lado a lado, edição inline de salário, registro de vales e modal de confirmação que calcula salário + comissão - vales.',
        category: 'recurso',
      },
      {
        title: 'Links de venda com checkout direto',
        description: 'Gerador de links de afiliado com parâmetros de plano, preço, meses promocionais e vendedor. Após cadastro, o usuário é levado direto para o pagamento; se não pagar, ao logar é redirecionado novamente para finalizar.',
        category: 'recurso',
      },
      {
        title: 'Preços personalizados em empresas',
        description: 'Modal de empresa permite definir valor personalizado, com opção de promoção por X meses ou permanente. Após o período, retorna automaticamente ao valor original do plano.',
        category: 'recurso',
      },
      {
        title: 'Limpeza automática ao excluir funcionário',
        description: 'Ao excluir um funcionário, ele agora é removido automaticamente das equipes e das ordens de serviço em que estava vinculado.',
        category: 'melhoria',
      },
      {
        title: 'Limites de plano corrigidos',
        description: 'Plano Master ajustado para 15 usuários. Campo "máx. usuários" passa a refletir o limite real do plano em vez de valores genéricos.',
        category: 'melhoria',
      },
      {
        title: 'Senha aleatória sob demanda',
        description: 'Removido preenchimento automático de senha aleatória nos formulários de criação de empresa/usuário. A senha só é gerada ao clicar em "Gerar".',
        category: 'melhoria',
      },
      {
        title: 'UI alinhada e responsiva no admin',
        description: 'Padronização de altura e espaçamento dos inputs e selects nos modais de empresa, com layout totalmente responsivo no painel administrativo.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.23',
    date: '9 de abril de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Controle de cobranças na agenda',
        description: 'Novo toggle na tela de contrato para mostrar ou ocultar as contas a receber na agenda. Cobranças agora aparecem como Tarefas (não como OS).',
        category: 'recurso',
      },
      {
        title: 'Exclusão completa de contrato',
        description: 'Ao excluir um contrato, todas as OSs, transações financeiras, ocorrências e itens são removidos automaticamente. Modal de confirmação exige digitar o nome do contrato.',
        category: 'melhoria',
      },
      {
        title: 'Correção de upload de fotos no celular',
        description: 'Corrigido erro "Load failed" ao enviar fotos durante o preenchimento de OS em dispositivos móveis.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.5.22',
    date: '8 de abril de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Múltiplos responsáveis no contrato',
        description: 'Agora é possível selecionar vários técnicos e/ou equipes como responsáveis ao criar ou editar um contrato. Todos os selecionados recebem as OSs geradas em suas agendas automaticamente.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.5.21',
    date: '8 de abril de 2026',
    type: 'minor',
    changes: [
      {
        title: 'Status "Pausada" para Ordens de Serviço',
        description: 'Novo status que permite ao técnico pausar uma OS em andamento para continuar o preenchimento em outro dia. Disponível na agenda, resumo da OS e na tela de preenchimento do técnico.',
        category: 'recurso',
      },
      {
        title: 'Botão de retomar OS pausada',
        description: 'OSs pausadas exibem botão para retomar o atendimento, voltando ao status "Em Andamento" e permitindo continuar checklists e assinaturas.',
        category: 'recurso',
      },
      {
        title: 'Filtro por status "Pausada" na agenda',
        description: 'Adicionado o filtro "Pausada" nos filtros de status da agenda para facilitar a visualização de OSs que precisam ser retomadas.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.20',
    date: '7 de abril de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Correção do filtro "Este ano" no financeiro',
        description: 'O filtro anual agora inclui datas futuras até o final do ano, corrigindo o cálculo de totais pendentes.',
        category: 'correcao',
      },
      {
        title: 'Recorrência anual em tarefas e OSs',
        description: 'Adicionada opção de recorrência anual na criação de tarefas e ordens de serviço na agenda.',
        category: 'recurso',
      },
    ],
  },
  {
    version: '1.5.19',
    date: '7 de abril de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Aba de Tarefas no perfil do cliente',
        description: 'Agora é possível criar e visualizar tarefas diretamente pelo perfil do cliente, já vinculadas automaticamente.',
        category: 'recurso',
      },
      {
        title: 'Editar e excluir contas a receber no contrato',
        description: 'Adicionados botões de editar, excluir e marcar como pago nas contas a receber dentro do detalhe do contrato, com opção de edição em lote.',
        category: 'recurso',
      },
      {
        title: 'Paginação no financeiro',
        description: 'Lista de contas a pagar e receber agora possui paginação para melhor navegação.',
        category: 'melhoria',
      },
      {
        title: 'Responsividade da tela de contratos',
        description: 'Tela de detalhe do contrato agora é 100% responsiva em dispositivos móveis.',
        category: 'melhoria',
      },
      {
        title: 'Correção de datas com fuso horário',
        description: 'Corrigido bug onde datas de vencimento apareciam um dia antes do correto (ex: dia 15 exibido como 14).',
        category: 'correcao',
      },
      {
        title: 'Filtro de datas no financeiro',
        description: 'Filtro de período agora filtra corretamente por data de vencimento.',
        category: 'correcao',
      },
      {
        title: 'Upload de foto de funcionário',
        description: 'Corrigido erro ao anexar foto na criação do perfil do funcionário.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.5.18',
    date: '7 de abril de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Selecionar todos os equipamentos na OS',
        description: 'Adicionado botão "Selecionar todos" na etapa de equipamentos ao criar ou editar uma Ordem de Serviço.',
        category: 'recurso',
      },
      {
        title: 'Indicador visual de OS concluída na agenda',
        description: 'Ordens de Serviço finalizadas agora exibem ícone de check e opacidade reduzida nos cards da agenda para fácil identificação.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.17',
    date: '4 de abril de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Salvamento automático nas configurações',
        description: 'Os dados da empresa agora são salvos automaticamente ao alterar qualquer campo, sem necessidade de clicar em botão.',
        category: 'melhoria',
      },
      {
        title: 'Cabeçalho White Label nos documentos',
        description: 'Recibos e extratos de funcionários agora utilizam o mesmo cabeçalho personalizado do relatório de OS quando a empresa possui White Label ativo.',
        category: 'recurso',
      },
      {
        title: 'Detalhamento de pagamento no extrato',
        description: 'A linha de pagamento no extrato do funcionário agora exibe o detalhamento completo (salário, bônus, vales, faltas) expandido por padrão, com botão para gerar recibo.',
        category: 'melhoria',
      },
      {
        title: 'Correção de visibilidade nos documentos',
        description: 'Corrigido bug onde o endereço aparecia nos documentos gerados mesmo com a opção "Exibir em documentos" desativada nas configurações.',
        category: 'correcao',
      },
      {
        title: 'Preview de tema escuro corrigido',
        description: 'O preview do tema escuro nas configurações de aparência agora utiliza as cores reais do sistema.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.5.15',
    date: '4 de abril de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Pagamento de funcionário redesenhado',
        description: 'Novo modal de pagamento com resumo financeiro completo (salário, bônus, faltas), campo editável para escolher quanto descontar dos vales e seleção da conta financeira para débito.',
        category: 'recurso',
      },
      {
        title: 'Reset automático de saldo após pagamento',
        description: 'Ao confirmar o pagamento, o sistema registra o pagamento, faz um ajuste automático para resetar o saldo ao salário base e relança eventuais vales não descontados.',
        category: 'melhoria',
      },
      {
        title: 'Integração financeira no pagamento',
        description: 'O pagamento de funcionário agora registra a saída diretamente na conta bancária/caixa selecionada, mantendo o saldo atualizado.',
        category: 'melhoria',
      },
    ],
  },
  {
    version: '1.5.14',
    date: '26 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Texto preservado em perguntas combinadas',
        description: 'Corrigido bug onde o envio de foto em perguntas com múltiplos tipos de resposta (foto + texto) apagava o texto já digitado pelo técnico.',
        category: 'correcao',
      },
      {
        title: 'Categoria e marca no cabeçalho dos checklists',
        description: 'O cabeçalho de cada equipamento nos checklists agora exibe badge colorido da categoria, marca/modelo e localização — tanto na visão do técnico, link público e relatório PDF.',
        category: 'melhoria',
      },
      {
        title: 'Equipamentos com accordion no link público',
        description: 'Quando a OS tem mais de 3 equipamentos, a lista é exibida dentro de um accordion fechado por padrão. Agora também mostra foto clicável, categoria, marca e local.',
        category: 'melhoria',
      },
      {
        title: 'Ordenação correta dos checklists',
        description: 'As respostas dos checklists no link público e na visualização interna agora respeitam a ordem de posição configurada no template.',
        category: 'correcao',
      },
    ],
  },
  {
    version: '1.5.13',
    date: '24 de março de 2026',
    type: 'patch',
    changes: [
      {
        title: 'Financeiro como seção no menu',
        description: 'O módulo financeiro agora é uma seção expansível no menu lateral (como Operacional e Gestão), com cada sub-área (Visão Geral, Movimentações, Contas, Caixas e Bancos, Categorias, DRE) acessível por rota própria.',
        category: 'melhoria',
      },
      {
        title: 'Títulos individuais por página financeira',
        description: 'Cada sub-página do financeiro agora exibe título e descrição próprios no cabeçalho e na aba do navegador, facilitando a identificação.',
        category: 'melhoria',
      },
      {
        title: 'Remoção da forma de pagamento',
        description: 'Campo "Forma de Pagamento" removido do formulário de transação. A informação relevante agora é apenas a conta bancária/caixa utilizada.',
        category: 'melhoria',
      },
      {
        title: 'Coluna "Conta" nas movimentações',
        description: 'A listagem de transações agora exibe a conta bancária/caixa associada com cor e ícone, substituindo a antiga coluna de pagamento.',
        category: 'melhoria',
      },
    ],
  },
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
        description: 'Corrigido erro "a is not a function" que impedia a abertura da OS em alguns cenários, causado por dados de checklist retornados em formato inesperado.',
        category: 'correcao',
      },
      {
        title: 'Correção de respostas duplicadas entre equipamentos',
        description: 'Respostas de checklist agora são filtradas corretamente por template, evitando que respostas de um equipamento apareçam em outro.',
        category: 'correcao',
      },
      {
        title: 'Fotos clicáveis em tela cheia no link público',
        description: 'Fotos de respostas de checklists e fotos da OS no link de acompanhamento do cliente agora podem ser ampliadas ao clicar.',
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
        description: 'Técnicos agora podem editar respostas já dadas (ícone de lápis) e remover fotos adicionadas a perguntas do checklist.',
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
        title: 'Checklists em accordion na OS do técnico',
        description: 'O preenchimento da OS exibe checklists por equipamento em formato de accordion com indicador visual de conclusão, foto e local do equipamento.',
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
        description: 'Novo sistema de módulos contratáveis (Básico, RH, CRM, NFS-e, Financeiro Avançado, Precificação, Portal do Cliente, White Label) com planos pré-montados e personalizado.',
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
        title: 'Soft delete de checklists',
        description: 'Checklists agora são desativados em vez de excluídos, preservando o histórico de OS vinculadas.',
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
        title: 'Exclusão de checklists com mensagem tratada',
        description: 'Erros de vínculo ao tentar excluir checklists agora são interpretados corretamente e exibidos com mensagem amigável em português.',
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
        description: 'Adicionada ordenação por colunas em Checklists, Detalhe do Cliente, Detalhe do Equipamento, Detalhe do Contrato, Tipos de Serviço e Extrato de Funcionários.',
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
        description: 'Ao editar uma pergunta do checklist, abre um modal completo ao invés de edição inline.',
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
        title: 'Múltiplos checklists no relatório',
        description: 'O relatório de OS concluída agora exibe respostas de todos os checklists vinculados, não apenas o primeiro.',
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
        title: 'Formulários dinâmicos (Checklists)',
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
