import { useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole, RefreshCw, Save, Vault } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { usePdvCashAccountSettings } from '@/hooks/usePdvCashAccountSettings';

interface Props {
  canManage: boolean;
}

export function PdvCashAccountSettings({ canManage }: Props) {
  const { toast } = useToast();
  const settings = usePdvCashAccountSettings();
  const [accountId, setAccountId] = useState('');

  useEffect(() => {
    setAccountId(settings.selectedAccount?.id ?? '');
  }, [settings.selectedAccount?.id]);

  const hasOpenCash = settings.openSessions > 0;
  const changed = Boolean(accountId && accountId !== settings.selectedAccount?.id);

  async function save() {
    if (!accountId || hasOpenCash) return;
    try {
      const account = await settings.save.mutateAsync(accountId);
      toast({ title: 'Conta de dinheiro salva', description: `${account.name} será usada por todos os caixas.` });
    } catch (error) {
      toast({
        title: 'Não foi possível salvar a conta',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <section id="conta-do-dinheiro" className="scroll-mt-24 border-b pb-8" aria-labelledby="pdv-cash-account-title">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-emerald-600 p-2 text-white"><Vault className="h-5 w-5" /></div>
        <div>
          <h2 id="pdv-cash-account-title" className="text-lg font-semibold">Conta do dinheiro</h2>
          <p className="text-sm text-muted-foreground">Escolha onde o Financeiro registra todo o dinheiro em espécie da loja.</p>
        </div>
      </div>

      {settings.isLoading ? <Skeleton className="h-24 w-full max-w-xl" /> : null}
      {settings.isError ? (
        <div className="max-w-xl rounded-lg border bg-background px-4 py-6 text-center">
          <p className="font-semibold text-destructive">Não foi possível carregar a conta de dinheiro</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => void settings.refetch()}><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>
        </div>
      ) : null}

      {!settings.isLoading && !settings.isError && settings.accounts.length === 0 ? (
        <NoticeBanner variant="warning" title="Nenhuma conta do tipo Caixa disponível">
          Crie uma conta do tipo Caixa no Financeiro e depois volte aqui para escolhê-la.
        </NoticeBanner>
      ) : null}

      {!settings.isLoading && !settings.isError && settings.accounts.length > 0 ? (
        <div className="max-w-xl space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="pdv-cash-account" className="text-sm font-medium">Conta usada pelo PDV</label>
              <Select value={accountId} onValueChange={setAccountId} disabled={!canManage || hasOpenCash}>
                <SelectTrigger id="pdv-cash-account" className="mt-2"><SelectValue placeholder="Escolha a conta de dinheiro" /></SelectTrigger>
                <SelectContent>{settings.accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {canManage ? <Button type="button" variant="outline" onClick={() => void save()} disabled={!changed || hasOpenCash || settings.save.isPending}><Save className="h-4 w-4" /> {settings.save.isPending ? 'Salvando...' : 'Salvar conta'}</Button> : null}
          </div>

          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            <span><strong className="text-foreground">1.</strong> O saldo total fica nesta conta.</span>
            <ArrowRight className="hidden h-4 w-4 sm:block" />
            <span><strong className="text-foreground">2.</strong> Ao abrir, uma parte fica separada no caixa.</span>
            <ArrowRight className="hidden h-4 w-4 sm:block" />
            <span><strong className="text-foreground">3.</strong> Ao fechar, volta a ficar livre.</span>
          </div>

          {hasOpenCash ? <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400"><LockKeyhole className="h-4 w-4" /> Feche todos os caixas antes de trocar esta conta.</p> : null}
          {!canManage ? <p className="text-xs text-muted-foreground">Seu perfil pode consultar, mas não alterar esta conta.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
