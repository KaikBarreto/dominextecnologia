import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  CalendarDays,
  Calculator,
  CheckCheck,
  Clock3,
  FileText,
  Filter,
  Inbox,
  LockKeyhole,
  Megaphone,
  MessageCircleMore,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  Tag,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';

const SAMPLE_CONTACTS = [
  { initials: 'MS', name: 'Mariana Souza', excerpt: 'Obrigada, já recebi o link.', time: '10:31', active: true },
  { initials: 'RC', name: 'Rafael Costa', excerpt: 'Qual o horário da visita?', time: '09:48', active: false },
  { initials: 'AS', name: 'Ana Silva', excerpt: 'Pagamento realizado.', time: 'Ontem', active: false },
];

export function WhatsappInboxPreview() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-5 w-5 text-primary" />
              Central de atendimento
            </CardTitle>
            <CardDescription className="mt-1">
              Conversas em equipe, vinculadas ao cliente, à OS e às cobranças.
            </CardDescription>
          </div>
          <Badge variant="outline">Prévia funcional da interface</Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid min-h-[560px] lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_250px]">
          <aside className="border-b lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Conversas</h3>
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">3 novas</Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value="" readOnly placeholder="Buscar cliente ou telefone" className="pl-8" aria-label="Buscar conversa" />
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="rounded-md bg-primary px-2 py-1 text-white">Minhas</span>
                <span className="rounded-md border px-2 py-1">Não atribuídas</span>
                <span className="rounded-md border px-2 py-1">Todas</span>
              </div>
            </div>

            <div>
              {SAMPLE_CONTACTS.map((contact) => (
                <div
                  key={contact.name}
                  className={`flex gap-3 border-b px-3 py-3 ${contact.active ? 'bg-muted' : ''}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {contact.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{contact.name}</span>
                      <span className="text-[10px] text-muted-foreground">{contact.time}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{contact.excerpt}</span>
                  </span>
                </div>
              ))}
            </div>
          </aside>

          <section className="flex min-w-0 flex-col border-b lg:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Mariana Souza</p>
                <p className="text-xs text-muted-foreground">Janela de atendimento aberta · 21h restantes</p>
              </div>
              <Badge variant="outline" className="shrink-0 border-emerald-600 text-emerald-700">
                <Clock3 className="mr-1 h-3 w-3" />24 horas
              </Badge>
            </div>

            <div className="flex-1 space-y-3 bg-[#efeae2] p-4 text-slate-900">
              <div className="max-w-[82%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm">
                Olá! Gostaria de confirmar o horário da manutenção.
                <p className="mt-1 text-right text-[10px] text-slate-500">10:24</p>
              </div>
              <div className="ml-auto max-w-[82%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">
                Olá, Mariana! A visita está confirmada para hoje entre 14h e 15h.
                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">10:27 <CheckCheck className="h-3 w-3 text-sky-600" /></p>
              </div>
              <div className="ml-auto max-w-[82%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">
                Você pode acompanhar a OS pelo link enviado na confirmação.
                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">10:29 <CheckCheck className="h-3 w-3 text-sky-600" /></p>
              </div>
              <div className="max-w-[82%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm">
                Obrigada, já recebi o link.
                <p className="mt-1 text-right text-[10px] text-slate-500">10:31</p>
              </div>
            </div>

            <div className="border-t bg-background p-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Button type="button" variant="ghost" size="icon" disabled aria-label="Anexar arquivo">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">Conecte o provedor para responder por aqui</span>
                <Button type="button" size="icon" disabled aria-label="Enviar mensagem">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole className="h-3.5 w-3.5" /> Prévia ilustrativa: nenhum dado ou mensagem real.
              </p>
            </div>
          </section>

          <aside className="p-4 lg:col-span-2 lg:border-t xl:col-span-1 xl:border-t-0">
            <h3 className="text-sm font-semibold">Contexto do atendimento</h3>
            <div className="mt-4 space-y-4 text-sm">
              <ContextLine icon={UserRoundCheck} label="Responsável" value="Carla Mendes" />
              <ContextLine icon={Tag} label="Etiquetas" value="Cliente ativo · PMOC" />
              <ContextLine icon={FileText} label="OS vinculada" value="#1048 · Em andamento" />
              <ContextLine icon={BadgeCheck} label="Consentimento" value="Autorizado em 15/10/2026" />
            </div>
            <Separator className="my-4" />
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-2 text-sm font-medium"><Bot className="h-4 w-4 text-primary" /> Automação com passagem humana</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Bot, respostas rápidas e IA devem permitir assumir a conversa e registrar quem respondeu.
              </p>
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

function ContextLine({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block font-medium leading-tight">{value}</span>
      </span>
    </div>
  );
}

const TEMPLATE_ROWS = [
  ['OS · Técnico a caminho', 'Utilidade', 'Status da OS'],
  ['OS · Serviço iniciado', 'Utilidade', 'Status da OS'],
  ['OS · Concluída', 'Utilidade', 'Status da OS'],
  ['Cobrança · Gerada', 'Utilidade', 'Financeiro'],
  ['Cobrança · Próximo vencimento', 'Utilidade', 'Financeiro'],
  ['Cobrança · Vence hoje', 'Utilidade', 'Financeiro'],
  ['Cobrança · Vencida', 'Utilidade', 'Financeiro'],
];

export function WhatsappTemplatesPreview() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-5 w-5 text-primary" />Modelos de mensagem</CardTitle>
              <CardDescription className="mt-1">Catálogo que será enviado para aprovação e sincronizado com a Meta.</CardDescription>
            </div>
            <Badge variant="outline">7 estruturas previstas</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_120px_140px] gap-3 border-y bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Modelo</span><span>Categoria</span><span>Uso</span><span>Status</span>
          </div>
          {TEMPLATE_ROWS.map(([name, category, use]) => (
            <div key={name} className="grid gap-2 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_110px_120px_140px] sm:items-center sm:gap-3">
              <span className="text-sm font-medium">{name}</span>
              <span className="text-xs text-muted-foreground sm:text-sm">{category}</span>
              <span className="text-xs text-muted-foreground sm:text-sm">{use}</span>
              <Badge variant="secondary" className="w-fit"><Clock3 className="mr-1 h-3 w-3" />Após conectar</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">O editor precisa suportar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Feature icon={MessageCircleMore} text="Cabeçalho, corpo, rodapé e variáveis" />
            <Feature icon={BadgeCheck} text="Categoria, idioma e status de aprovação" />
            <Feature icon={Paperclip} text="Imagem, documento e botões de ação" />
            <Feature icon={ShieldCheck} text="Versão aprovada separada do rascunho" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Regra da Meta</CardTitle></CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            Fora da janela de atendimento, a empresa só inicia ou retoma a conversa usando um modelo aprovado. Reprovação, pausa e qualidade do modelo precisam aparecer aqui.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function WhatsappHistoryPreview() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Enviadas" icon={Send} />
        <Metric label="Entregues" icon={CheckCheck} />
        <Metric label="Lidas" icon={BadgeCheck} />
        <Metric label="Falhas" icon={AlertTriangle} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Histórico e auditoria</CardTitle>
              <CardDescription className="mt-1">Rastreio por cliente, origem, template, custo e status de entrega.</CardDescription>
            </div>
            <Button variant="outline" size="sm" disabled><Filter className="mr-2 h-4 w-4" />Filtros</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><WhatsAppIcon className="h-6 w-6 text-muted-foreground" /></span>
            <p className="mt-3 text-sm font-semibold">O histórico começa após a conexão</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Serão registrados envio, entrega, leitura, falha, tentativa, custo estimado, usuário ou automação responsável e o vínculo com OS ou cobrança.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Custos e franquia</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <CostLine title="Atendimento" description="Regra vigente em out/2026: até 1.000 mensagens de serviço entregues por número/mês; depois disso, há cobrança por mensagem." />
          <CostLine title="Utilidade" description="OS, cobrança e lembretes; a cobrança depende da categoria, janela e país do destinatário." />
          <CostLine title="Parceiro" description="Pode existir mensalidade, taxa por número, atendente ou mensagem além do valor da Meta." />
        </CardContent>
      </Card>
    </div>
  );
}

export function WhatsappCampaignsPreview() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-5 w-5 text-primary" />Campanhas e comunicados</CardTitle>
              <CardDescription className="mt-1">Envios em lote somente para públicos autorizados, com custo conferido antes de disparar.</CardDescription>
            </div>
            <Badge variant="secondary">Etapa futura</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CampaignStep number="1" icon={UsersRound} title="Selecionar público" description="Segmentos, clientes, tags e exclusão automática de opt-out ou telefone inválido." />
          <CampaignStep number="2" icon={FileText} title="Escolher modelo aprovado" description="Categoria, idioma, variáveis e prévia com dados de exemplo." />
          <CampaignStep number="3" icon={CalendarDays} title="Programar o envio" description="Data, horário, fuso, limite por lote e pausa de emergência." />
          <CampaignStep number="4" icon={Calculator} title="Revisar alcance e custo" description="Estimativa da Meta, tarifa do parceiro e confirmação explícita antes do disparo." />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Proteções obrigatórias</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Feature icon={ShieldCheck} text="Consentimento por categoria e prova de opt-in" />
            <Feature icon={AlertTriangle} text="Bloqueio de duplicados, opt-out e listas sem origem" />
            <Feature icon={UserRoundCheck} text="Aprovação por usuário com auditoria" />
            <Feature icon={CheckCheck} text="Métricas de entrega, leitura, resposta e descadastro" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium">Campanha não é automação transacional</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Marketing tem regra, qualidade e preço próprios. A Dominex deve separar campanhas dos avisos de OS e cobrança para evitar bloqueios e custos inesperados.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CampaignStep({
  number,
  icon: Icon,
  title,
  description,
}: {
  number: string;
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{number}</span>
      <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return <div className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{text}</span></div>;
}

function Metric({ label, icon: Icon }: { label: string; icon: typeof FileText }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <span><span className="block text-xs text-muted-foreground">{label}</span><span className="text-2xl font-semibold tabular-nums">—</span></span>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></span>
      </CardContent>
    </Card>
  );
}

function CostLine({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
