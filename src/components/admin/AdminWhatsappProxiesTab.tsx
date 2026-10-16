import { useState } from 'react';
import {
  Activity,
  Ban,
  CircleCheck,
  CircleSlash,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  Unplug,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { NumericInput } from '@/components/ui/numeric-input';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminWhatsappProxies,
  type WhatsappProxy,
  type WhatsappProxyInput,
  type WhatsappProxyKind,
  type WhatsappProxyProtocol,
} from '@/hooks/useAdminWhatsappProxies';
import { formatBRL } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errorMessages';

const KIND_LABEL: Record<WhatsappProxyKind, string> = {
  residential_static: 'Residencial estático',
  mobile: 'Móvel (4G)',
  datacenter_tunnel: 'Túnel próprio (datacenter)',
};

/**
 * Porta e custo vivem como string crua no rascunho: é o contrato do
 * `NumericInput` (passar `number` nele come a vírgula durante a digitação).
 * O parse pra número acontece só no envio.
 */
interface ProxyDraft {
  label: string;
  kind: WhatsappProxyKind;
  host: string;
  port: string;
  protocol: WhatsappProxyProtocol;
  region: string;
  monthlyCost: string;
  notes: string;
  username: string;
  password: string;
}

const EMPTY_DRAFT: ProxyDraft = {
  label: '',
  kind: 'residential_static',
  host: '',
  port: '',
  protocol: 'http',
  region: '',
  monthlyCost: '',
  notes: '',
  username: '',
  password: '',
};

/** "15,90" → 15.9 · "" → null. Vírgula é o separador decimal em PT-BR. */
function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\./g, '').replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function StatusBadge({ proxy }: { proxy: WhatsappProxy }) {
  if (proxy.status === 'assigned') {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Em uso</Badge>;
  }
  if (proxy.status === 'blocked') {
    return <Badge className="bg-red-600 text-white hover:bg-red-600">Bloqueado</Badge>;
  }
  return <Badge className="bg-sky-600 text-white hover:bg-sky-600">Livre</Badge>;
}

function HealthBadge({ proxy }: { proxy: WhatsappProxy }) {
  if (proxy.last_check_at === null) {
    return <span className="text-xs text-muted-foreground">Nunca verificado</span>;
  }
  const when = new Date(proxy.last_check_at).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return proxy.last_check_ok ? (
    <span className="flex items-center gap-1.5 text-xs text-emerald-600">
      <CircleCheck className="h-3.5 w-3.5 shrink-0" />
      {when}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs text-red-600">
      <CircleSlash className="h-3.5 w-3.5 shrink-0" />
      {proxy.last_error?.slice(0, 60) || when}
    </span>
  );
}

/**
 * Pool de IPs residenciais do add-on de WhatsApp, no painel master Auctus.
 *
 * O tenant não compra nem vê proxy: a Dominex compra, cadastra aqui e atribui.
 * Duas regras de ouro, documentadas em `infra/whatsapp-evolution/README.md`
 * seção 5, e que a UI deixa visíveis de propósito:
 *  1. Um IP por instância, nunca compartilhado entre empresas (IP residencial
 *     com várias contas de WhatsApp é um cluster de spam perfeito, pior que o
 *     IP de datacenter da VPS). O banco impõe isso com UNIQUE.
 *  2. O IP nunca muda depois de conectado. Por isso trocar host/porta de um IP
 *     em uso é recusado pela edge: libera primeiro, reconecta consciente.
 */
export function AdminWhatsappProxiesTab() {
  const { proxies, isLoading, error, create, update, remove, release, healthcheck } =
    useAdminWhatsappProxies();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<ProxyDraft>(EMPTY_DRAFT);
  const [deleting, setDeleting] = useState<WhatsappProxy | null>(null);

  const assigned = proxies.filter((proxy) => proxy.status === 'assigned').length;
  const free = proxies.filter((proxy) => proxy.status === 'free').length;
  const monthlyTotal = proxies.reduce((sum, proxy) => sum + (proxy.monthly_cost ?? 0), 0);

  const port = Number(draft.port);
  const canSubmit =
    draft.label.trim().length > 0 &&
    draft.host.trim().length > 0 &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535;

  const openForm = () => {
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
  };

  const handleCreate = async () => {
    const input: WhatsappProxyInput = {
      label: draft.label.trim(),
      kind: draft.kind,
      host: draft.host.trim(),
      port,
      protocol: draft.protocol,
      region: draft.region.trim() || null,
      monthly_cost: parseAmount(draft.monthlyCost),
      notes: draft.notes.trim() || null,
      username: draft.username.trim() || undefined,
      password: draft.password || undefined,
    };
    try {
      await create.mutateAsync(input);
      toast({ title: 'IP cadastrado no pool.' });
      setFormOpen(false);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao cadastrar', description: getErrorMessage(err) });
    }
  };

  const runAction = async (promise: Promise<unknown>, success: string) => {
    try {
      await promise;
      toast({ title: success });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não deu certo', description: getErrorMessage(err) });
    }
  };

  const rowActions = (proxy: WhatsappProxy): RowAction[] => [
    {
      label: 'Verificar agora',
      icon: Activity,
      onClick: () => runAction(healthcheck.mutateAsync(proxy.id), 'Verificação concluída.'),
    },
    {
      label: 'Liberar do tenant',
      icon: Unplug,
      hidden: proxy.status !== 'assigned' || !proxy.assigned_connection_id,
      onClick: () =>
        runAction(
          release.mutateAsync(proxy.assigned_connection_id as string),
          'IP liberado. A conexão precisa de um QR novo para voltar a enviar.',
        ),
    },
    {
      label: proxy.status === 'blocked' ? 'Devolver ao pool' : 'Marcar como bloqueado',
      icon: Ban,
      hidden: proxy.status === 'assigned',
      onClick: () =>
        runAction(
          update.mutateAsync({
            proxy_id: proxy.id,
            status: proxy.status === 'blocked' ? 'free' : 'blocked',
          }),
          proxy.status === 'blocked' ? 'IP devolvido ao pool.' : 'IP marcado como bloqueado.',
        ),
    },
    {
      label: 'Excluir',
      icon: Trash2,
      variant: 'delete',
      disabled: proxy.status === 'assigned',
      onClick: () => setDeleting(proxy),
    },
  ];

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">IPs do WhatsApp</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">
            Pool de IPs residenciais que a Dominex compra e atribui. Cada instância sai por um IP
            próprio e fixo. O tenant não vê nada disso.
          </CardDescription>
        </div>
        <Button size="sm" onClick={openForm} className="w-full shrink-0 sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Cadastrar IP
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && <NoticeBanner variant="destructive">{getErrorMessage(error)}</NoticeBanner>}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : proxies.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
            <KeyRound className="mx-auto h-6 w-6 text-sky-600" />
            <p className="mt-3 text-sm font-semibold">Nenhum IP cadastrado</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Enquanto o pool estiver vazio, as conexões novas continuam sendo criadas sem proxy.
              Compre IPs residenciais estáticos no Brasil, valide cada um pelo passo 10 do runbook e
              cadastre aqui.
            </p>
            <Button size="sm" variant="outline" className="mt-4" onClick={openForm}>
              <Plus className="mr-2 h-4 w-4" />
              Cadastrar o primeiro
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="h-7 px-2.5">
                {assigned} em uso
              </Badge>
              <Badge variant="outline" className="h-7 px-2.5">
                {free} livres
              </Badge>
              <Badge variant="outline" className="h-7 px-2.5">
                Custo mensal: {formatBRL(monthlyTotal)}
              </Badge>
            </div>

            <div className="space-y-2">
              {proxies.map((proxy) => (
                <div
                  key={proxy.id}
                  className="flex items-start justify-between gap-3 rounded-lg border bg-background px-3 py-2.5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{proxy.label}</span>
                      <StatusBadge proxy={proxy} />
                      {!proxy.has_credential && (
                        <Badge variant="outline" className="text-xs">
                          Sem senha
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {proxy.protocol}://{proxy.host}:{proxy.port}
                      {proxy.region ? ` · ${proxy.region}` : ''} · {KIND_LABEL[proxy.kind]}
                      {proxy.monthly_cost ? ` · ${formatBRL(proxy.monthly_cost)}/mês` : ''}
                    </p>
                    <p className="truncate text-xs">
                      {proxy.assigned_company_name ? (
                        <span className="text-foreground">{proxy.assigned_company_name}</span>
                      ) : (
                        <span className="text-muted-foreground">Sem empresa</span>
                      )}
                    </p>
                    <HealthBadge proxy={proxy} />
                  </div>
                  <RowActionsMenu actions={rowActions(proxy)} ariaLabel={`Ações do IP ${proxy.label}`} />
                </div>
              ))}
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={healthcheck.isPending}
              onClick={() => runAction(healthcheck.mutateAsync(undefined), 'Verificação concluída.')}
            >
              {healthcheck.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Activity className="mr-2 h-4 w-4" />
              )}
              Verificar todos os IPs em uso
            </Button>
          </>
        )}
      </CardContent>

      <ResponsiveModal
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Cadastrar IP no pool"
        description="A senha vai para o Vault, nunca para o banco. Valide o IP pelos passos 10 e 11 do runbook antes de cadastrar."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={create.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!canSubmit || create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cadastrar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="proxy-label">Apelido</Label>
            <Input
              id="proxy-label"
              value={draft.label}
              placeholder="Residencial SP 01"
              onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={draft.kind}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, kind: value as WhatsappProxyKind }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential_static">{KIND_LABEL.residential_static}</SelectItem>
                  <SelectItem value="mobile">{KIND_LABEL.mobile}</SelectItem>
                  <SelectItem value="datacenter_tunnel">{KIND_LABEL.datacenter_tunnel}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Protocolo</Label>
              <Select
                value={draft.protocol}
                onValueChange={(value) =>
                  setDraft((prev) => ({ ...prev, protocol: value as WhatsappProxyProtocol }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="https">https</SelectItem>
                  <SelectItem value="socks5">socks5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="proxy-host">Endereço</Label>
              <Input
                id="proxy-host"
                value={draft.host}
                placeholder="177.0.0.0"
                onChange={(event) => setDraft((prev) => ({ ...prev, host: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proxy-port">Porta</Label>
              <NumericInput
                id="proxy-port"
                value={draft.port}
                placeholder="8080"
                onValueChange={(value) => setDraft((prev) => ({ ...prev, port: value }))}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="proxy-region">Região</Label>
              <Input
                id="proxy-region"
                value={draft.region}
                placeholder="SP"
                onChange={(event) => setDraft((prev) => ({ ...prev, region: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proxy-cost">Custo mensal</Label>
              <NumericInput
                id="proxy-cost"
                decimal
                maxDecimals={2}
                value={draft.monthlyCost}
                placeholder="18,50"
                onValueChange={(value) => setDraft((prev) => ({ ...prev, monthlyCost: value }))}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="proxy-user">Usuário</Label>
              <Input
                id="proxy-user"
                autoComplete="off"
                value={draft.username}
                onChange={(event) => setDraft((prev) => ({ ...prev, username: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proxy-pass">Senha</Label>
              <Input
                id="proxy-pass"
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(event) => setDraft((prev) => ({ ...prev, password: event.target.value }))}
              />
            </div>
          </div>

          <NoticeBanner variant="neutral">
            Deixe usuário e senha em branco se o fornecedor autentica pelo IP de origem da VPS.
          </NoticeBanner>

          <div className="space-y-1.5">
            <Label htmlFor="proxy-notes">Observações</Label>
            <Textarea
              id="proxy-notes"
              rows={2}
              value={draft.notes}
              placeholder="Fornecedor, data da compra, vencimento"
              onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Excluir IP do pool"
        description={
          deleting
            ? `O IP ${deleting.label} sai do pool e a senha dele é apagada do Vault. Não dá para desfazer.`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={remove.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                if (!deleting) return;
                await runAction(remove.mutateAsync(deleting.id), 'IP excluído do pool.');
                setDeleting(null);
              }}
            >
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Se este IP foi bloqueado pelo WhatsApp, prefira marcar como bloqueado em vez de excluir:
          assim ele não volta pro pool por engano e o histórico fica registrado.
        </p>
      </ResponsiveModal>
    </Card>
  );
}
