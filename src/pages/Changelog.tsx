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
        description: 'Auditamos as telas de detalhe e duas estavam com visual desktop no celular: detalhe da Empresa (painel master Auctus) tinha título grande de 3rem que dominava a tela e abas em barra desktop, e detalhe do Vendedor tinha 4 abas em grid apertado. Agora as duas usam pílulas horizontais pra trocar de aba (mesmo padrão do resto do sistema), os botões de ação (Voltar/WhatsApp/Editar/Excluir) virou ícones compactos no mobile (com label só no computador), e o título reduziu pra "text-xl" no celular. Detalhe de Cliente, Equipamento, Contrato e Questionário já estavam OK.',
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
        description: 'Aplicamos o visual de aplicativo nativo nos últimos pedaços que ficaram fora das ondas anteriores: o Controle de Ponto Eletrônico (dentro de Funcionários), as Faturas de Cartão (dentro do Financeiro), as Temporadas e Episódios do Domiflix (quando o admin abre o detalhe de um título-série), o painel compartilhado de Questionários, os Custos Globais (dentro de Orçamentos) e a gestão de Categorias e Campos Customizados de Equipamento. Em todos os casos, o celular ganhou cabeçalho compacto, lista no estilo iOS/Android com arrastar pra editar/excluir e ícone de três pontinhos, e botão flutuante de "Novo X" quando aplicável. No computador, tudo continua exatamente como antes.',
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
        description: 'Fechamos o capítulo mobile-first do Dominex: 18 telas foram redesenhadas pra ter o mesmo visual de aplicativo nativo que Ordens de Serviço, Clientes e Equipamentos já tinham. As telas atualizadas agora têm cabeçalho compacto, lista no estilo iOS/Android (arrastar pra editar/excluir + ícone de três pontinhos com menu), botão flutuante de "Novo X" no canto inferior direito, filtros agrupados em gaveta de baixo, e contadores em chips coloridos que rolam de lado. Telas refatoradas: Agenda, PMOC, Rastreamento de Técnicos, Catálogo de Serviços, Estoque, Questionários, Financeiro (tabs de listagem), Orçamentos, Contratos, CRM (kanban + opção de lista), Funcionários, Usuários, Equipes, e os painéis de administração da Auctus (Empresas, Vendedores, Financeiro Auctus, CRM Auctus, Catálogo Domiflix). No computador, todas continuam exatamente como antes. Listagens com kanban (CRM) e árvores aninhadas (Domiflix) foram tratadas com cuidado pra preservar a funcionalidade existente.',
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
        description: 'Antes, ao tocar em uma foto na visualização da Ordem de Serviço, o navegador abria a imagem em uma nova aba — quebrava o fluxo, especialmente no celular. Agora a foto abre em um visualizador sutil em cima da tela: imagem grande centralizada, fundo escurecido, setas para passar entre fotos do mesmo grupo, botão para baixar e botão para fechar. Vale tanto para as fotos uploadadas direto na OS quanto para as fotos enviadas nas respostas do questionário do técnico.',
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
        title: 'Vários questionários no mesmo equipamento',
        description: 'Ao criar ou editar uma OS, agora dá pra adicionar mais de um questionário no mesmo equipamento — igual já funcionava em OS sem equipamento vinculado. Útil quando o atendimento exige checklists separados no mesmo aparelho (por exemplo: PMOC obrigatório por lei + checklist interno da empresa + NPS final). Cada questionário fica como um "badge" que pode ser adicionado ou removido livremente. O app do técnico em campo, o modal "Ver OS" e o relatório final mostram cada questionário separadamente, sem misturar respostas. OS antigas com um único questionário continuam funcionando normalmente, sem alteração.',
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
        description: 'OSs pausadas exibem botão para retomar o atendimento, voltando ao status "Em Andamento" e permitindo continuar questionários e assinaturas.',
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
        title: 'Categoria e marca no cabeçalho dos questionários',
        description: 'O cabeçalho de cada equipamento nos questionários agora exibe badge colorido da categoria, marca/modelo e localização — tanto na visão do técnico, link público e relatório PDF.',
        category: 'melhoria',
      },
      {
        title: 'Equipamentos com accordion no link público',
        description: 'Quando a OS tem mais de 3 equipamentos, a lista é exibida dentro de um accordion fechado por padrão. Agora também mostra foto clicável, categoria, marca e local.',
        category: 'melhoria',
      },
      {
        title: 'Ordenação correta dos questionários',
        description: 'As respostas dos questionários no link público e na visualização interna agora respeitam a ordem de posição configurada no template.',
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
