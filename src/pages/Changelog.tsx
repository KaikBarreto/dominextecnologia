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
