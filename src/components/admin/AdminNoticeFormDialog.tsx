import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker, toIsoDate } from '@/components/ui/DatePicker';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { AdminCompanyMultiSelect } from '@/components/admin/AdminCompanyMultiSelect';
import { cn } from '@/lib/utils';
import type { AdminNotice, AdminNoticeInput } from '@/hooks/useAdminNotices';
import type { NoticeVariant } from '@/lib/systemNotices';

/**
 * Formulário de aviso do painel master. Cria E edita, então usa ABAS com o
 * salvar fixo no rodapé (não stepper) — régua de UI do projeto. No mobile o
 * `ResponsiveModal` vira drawer e não fecha ao clicar fora.
 */

const VARIANTS: { value: NoticeVariant; label: string; icon: typeof Info }[] = [
  { value: 'info', label: 'Informação', icon: Info },
  { value: 'warning', label: 'Atenção', icon: AlertTriangle },
  { value: 'destructive', label: 'Crítico', icon: XCircle },
  { value: 'success', label: 'Boa notícia', icon: CheckCircle2 },
  { value: 'neutral', label: 'Neutro', icon: Info },
];

/** `yyyy-MM-dd` → início do dia LOCAL em ISO (o banco guarda timestamptz). */
function startOfDayIso(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0).toISOString();
}

/** `yyyy-MM-dd` → fim do dia LOCAL em ISO (vigência inclui o dia escolhido). */
function endOfDayIso(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).toISOString();
}

/** timestamptz do banco → `yyyy-MM-dd` local pro DatePicker. */
function isoToDateField(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : toIsoDate(d);
}

interface AdminNoticeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notice: AdminNotice | null;
  onSubmit: (input: AdminNoticeInput & { id?: string }) => void;
  isSaving: boolean;
}

export function AdminNoticeFormDialog({
  open,
  onOpenChange,
  notice,
  onSubmit,
  isSaving,
}: AdminNoticeFormDialogProps) {
  const [tab, setTab] = useState('conteudo');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [variant, setVariant] = useState<NoticeVariant>('warning');
  const [actionLabel, setActionLabel] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [audience, setAudience] = useState<'all' | 'specific_companies'>('specific_companies');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [scope, setScope] = useState<'dashboard' | 'global'>('dashboard');
  const [dismissible, setDismissible] = useState<'yes' | 'no'>('yes');
  const [active, setActive] = useState<'yes' | 'no'>('yes');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Reseta o formulário a cada abertura (criar = em branco; editar = carregado).
  useEffect(() => {
    if (!open) return;
    setTab('conteudo');
    setTitle(notice?.title ?? '');
    setMessage(notice?.message ?? '');
    setVariant(notice?.variant ?? 'warning');
    setActionLabel(notice?.action_label ?? '');
    setActionUrl(notice?.action_url ?? '');
    setAudience(notice?.target_audience === 'all' ? 'all' : 'specific_companies');
    setTargetIds(notice?.target_ids ?? []);
    setScope(notice?.scope ?? 'dashboard');
    setDismissible(notice?.is_dismissible === false ? 'no' : 'yes');
    setActive(notice?.is_active === false ? 'no' : 'yes');
    setStartsAt(isoToDateField(notice?.starts_at ?? null));
    setEndsAt(isoToDateField(notice?.ends_at ?? null));
  }, [open, notice]);

  const erro = useMemo(() => {
    if (!title.trim()) return 'Dê um título ao aviso.';
    if (!message.trim()) return 'Escreva o corpo do aviso.';
    if (audience === 'specific_companies' && targetIds.length === 0) {
      return 'Escolha ao menos uma empresa, senão ninguém vê o aviso.';
    }
    if (actionUrl.trim() && !/^https?:\/\//i.test(actionUrl.trim())) {
      return 'O link precisa começar com http:// ou https://';
    }
    if (startsAt && endsAt && startsAt > endsAt) return 'A data de fim é anterior à de início.';
    return null;
  }, [title, message, audience, targetIds, actionUrl, startsAt, endsAt]);

  const submit = () => {
    if (erro) return;
    onSubmit({
      ...(notice ? { id: notice.id } : {}),
      title: title.trim(),
      message: message.trim(),
      variant,
      scope,
      is_dismissible: dismissible === 'yes',
      is_active: active === 'yes',
      starts_at: startsAt ? startOfDayIso(startsAt) : null,
      ends_at: endsAt ? endOfDayIso(endsAt) : null,
      target_audience: audience,
      target_ids: audience === 'all' ? [] : targetIds,
      action_label: actionLabel.trim() || null,
      action_url: actionUrl.trim() || null,
    });
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={notice ? 'Editar aviso' : 'Novo aviso'}
      description="O aviso aparece como faixa colorida dentro do sistema do cliente."
      footer={
        <div className="flex flex-col gap-2">
          {erro && <p className="text-xs text-destructive">{erro}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={submit} disabled={!!erro || isSaving}>
              {isSaving ? 'Salvando...' : notice ? 'Salvar' : 'Publicar aviso'}
            </Button>
          </div>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList variant="underline">
          <TabsTrigger variant="underline" value="conteudo">Conteúdo</TabsTrigger>
          <TabsTrigger variant="underline" value="destino">Destino</TabsTrigger>
          <TabsTrigger variant="underline" value="exibicao">Exibição</TabsTrigger>
        </TabsList>

        {/* ── Conteúdo ─────────────────────────────────────────────── */}
        <TabsContent value="conteudo" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="notice-title">Título</Label>
            <Input
              id="notice-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Correção nos valores de custo"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notice-message">Mensagem</Label>
            <Textarea
              id="notice-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escreva em português claro, como você falaria no WhatsApp."
              rows={5}
              maxLength={600}
            />
          </div>

          <div className="space-y-2">
            <Label>Cor do aviso</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {VARIANTS.map((item) => {
                const Icon = item.icon;
                const selected = variant === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setVariant(item.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      selected ? 'border-foreground' : 'border-border hover:bg-accent',
                    )}
                  >
                    {/* Amostra SATURADA da cor: fundo cheio + ícone na cor de
                        foreground. Nada de bolinha pastel. */}
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded',
                        item.value === 'info' && 'bg-info text-info-foreground',
                        item.value === 'warning' && 'bg-warning text-warning-foreground',
                        item.value === 'destructive' && 'bg-destructive text-destructive-foreground',
                        item.value === 'success' && 'bg-success text-success-foreground',
                        item.value === 'neutral' && 'bg-muted text-foreground',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Prévia</Label>
            <NoticeBanner variant={variant} title={title || 'Título do aviso'} className="items-start">
              {message || 'Corpo do aviso.'}
            </NoticeBanner>
          </div>
        </TabsContent>

        {/* ── Destino ──────────────────────────────────────────────── */}
        <TabsContent value="destino" className="space-y-4 pt-4">
          <div className="flex flex-col items-start gap-2">
            <Label>Quem vê</Label>
            <LabeledSwitch<'all' | 'specific_companies'>
              value={audience}
              onChange={setAudience}
              off={{ value: 'specific_companies', label: 'Empresas escolhidas' }}
              on={{ value: 'all', label: 'Base toda' }}
              aria-label="Público do aviso"
            />
          </div>

          {audience === 'specific_companies' ? (
            <div className="space-y-2">
              <Label>Empresas</Label>
              <AdminCompanyMultiSelect value={targetIds} onChange={setTargetIds} />
              <p className="text-xs text-muted-foreground">
                Só os usuários dessas empresas enxergam o aviso. Nenhum outro cliente recebe.
              </p>
            </div>
          ) : (
            <NoticeBanner variant="warning" title="Aviso para todos os clientes">
              Toda a base vai ver esta faixa. Confira o texto antes de publicar.
            </NoticeBanner>
          )}

          <div className="space-y-2">
            <Label htmlFor="notice-action-label">Botão (opcional)</Label>
            <Input
              id="notice-action-label"
              value={actionLabel}
              onChange={(e) => setActionLabel(e.target.value)}
              placeholder="Ex: Saiba mais"
              maxLength={40}
            />
            <Input
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
              placeholder="https://..."
              aria-label="Link do botão"
            />
          </div>
        </TabsContent>

        {/* ── Exibição ─────────────────────────────────────────────── */}
        <TabsContent value="exibicao" className="space-y-4 pt-4">
          <div className="flex flex-col items-start gap-2">
            <Label>Onde aparece</Label>
            <LabeledSwitch<'dashboard' | 'global'>
              value={scope}
              onChange={setScope}
              off={{ value: 'dashboard', label: 'Só no painel inicial' }}
              on={{ value: 'global', label: 'Em todas as telas' }}
              aria-label="Onde o aviso aparece"
            />
            <p className="text-xs text-muted-foreground">
              Em todas as telas é para assunto crítico. Para recado comum, o painel inicial já basta.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2">
            <Label>O cliente pode dispensar</Label>
            <LabeledSwitch<'yes' | 'no'>
              value={dismissible}
              onChange={setDismissible}
              off={{ value: 'no', label: 'Não' }}
              on={{ value: 'yes', label: 'Sim' }}
              aria-label="Permitir dispensar o aviso"
            />
            <p className="text-xs text-muted-foreground">
              Aviso que não sai da frente incomoda mais do que informa. Deixe "Sim" salvo exceção.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2">
            <Label>Situação</Label>
            <LabeledSwitch<'yes' | 'no'>
              value={active}
              onChange={setActive}
              off={{ value: 'no', label: 'Pausado' }}
              on={{ value: 'yes', label: 'Publicado' }}
              aria-label="Situação do aviso"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Começa em (opcional)</Label>
              <DatePicker
                value={startsAt}
                onValueChange={setStartsAt}
                clearable
                placeholder="Imediatamente"
                ariaLabel="Data de início do aviso"
              />
            </div>
            <div className="space-y-2">
              <Label>Termina em (opcional)</Label>
              <DatePicker
                value={endsAt}
                onValueChange={setEndsAt}
                clearable
                placeholder="Sem prazo"
                ariaLabel="Data de fim do aviso"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </ResponsiveModal>
  );
}
