import { useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Power, RefreshCw, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { usePdvTerminalSettings, type PdvTerminalSetting } from '@/hooks/usePdvTerminalSettings';

interface Props {
  canManage: boolean;
}

interface FormState {
  id: string | null;
  name: string;
  stockId: string;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: 'Caixa 01',
  stockId: '',
  isActive: true,
  sortOrder: 0,
};

export function PdvTerminalSettings({ canManage }: Props) {
  const { toast } = useToast();
  const settings = usePdvTerminalSettings();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const stockNames = useMemo(
    () => Object.fromEntries(settings.stocks.map((stock) => [stock.id, stock.name])),
    [settings.stocks],
  );

  useEffect(() => {
    if (!formOpen || form.stockId || settings.stocks.length === 0) return;
    const preferred = settings.stocks.find((stock) => stock.isDefault) ?? settings.stocks[0];
    setForm((current) => ({ ...current, stockId: preferred.id }));
  }, [form.stockId, formOpen, settings.stocks]);

  function openCreate() {
    const nextNumber = settings.terminals.length + 1;
    const preferred = settings.stocks.find((stock) => stock.isDefault) ?? settings.stocks[0] ?? null;
    setForm({
      ...EMPTY_FORM,
      name: `Caixa ${String(nextNumber).padStart(2, '0')}`,
      stockId: preferred?.id ?? '',
      sortOrder: nextNumber,
    });
    setFormOpen(true);
  }

  function openEdit(terminal: PdvTerminalSetting) {
    setForm({
      id: terminal.id,
      name: terminal.name,
      stockId: terminal.stockId,
      isActive: terminal.isActive,
      sortOrder: terminal.sortOrder,
    });
    setFormOpen(true);
  }

  async function saveForm() {
    const name = form.name.trim();
    if (name.length < 2 || !form.stockId) return;
    try {
      await settings.save.mutateAsync({ ...form, name });
      toast({ title: form.id ? 'Caixa atualizado' : 'Caixa pronto para abrir' });
      setFormOpen(false);
    } catch (error) {
      toast({
        title: 'Não foi possível salvar o caixa',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  async function toggleTerminal(terminal: PdvTerminalSetting) {
    try {
      await settings.save.mutateAsync({
        id: terminal.id,
        name: terminal.name,
        stockId: terminal.stockId,
        isActive: !terminal.isActive,
        sortOrder: terminal.sortOrder,
      });
      toast({ title: terminal.isActive ? 'Caixa desativado' : 'Caixa reativado' });
    } catch (error) {
      toast({
        title: 'Não foi possível alterar o caixa',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <section id="caixas-da-loja" className="scroll-mt-24 border-b pb-8" aria-labelledby="pdv-cash-registers-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground"><Store className="h-5 w-5" /></div>
          <div>
            <h2 id="pdv-cash-registers-title" className="text-lg font-semibold">Caixas da loja</h2>
            <p className="text-sm text-muted-foreground">Cada caixa usa um local de estoque e pode ter seu próprio operador.</p>
          </div>
        </div>
        {canManage ? <Button type="button" onClick={openCreate} disabled={settings.isLoading || settings.isError || settings.stocks.length === 0}><Plus className="h-4 w-4" /> Novo caixa</Button> : null}
      </div>

      {settings.isLoading ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : null}
      {settings.isError ? (
        <div className="rounded-lg border bg-background px-4 py-6 text-center">
          <p className="font-semibold text-destructive">Não foi possível carregar os caixas</p>
          <p className="mt-1 text-sm text-muted-foreground">Nenhuma alteração foi liberada.</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => void settings.refetch()}><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>
        </div>
      ) : null}

      {!settings.isLoading && !settings.isError && settings.stocks.length === 0 ? (
        <NoticeBanner variant="warning" title="Cadastre um local de estoque primeiro">
          O caixa precisa saber de qual estoque os produtos serão retirados.
        </NoticeBanner>
      ) : null}

      {!settings.isLoading && !settings.isError && settings.terminals.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center">
          <Store className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-semibold">Nenhum caixa cadastrado</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Crie o primeiro caixa para liberar a abertura no PDV.</p>
          {canManage && settings.stocks.length > 0 ? <Button type="button" className="mt-4" onClick={openCreate}><Plus className="h-4 w-4" /> Cadastrar primeiro caixa</Button> : null}
        </div>
      ) : null}

      {!settings.isLoading && !settings.isError && settings.terminals.length > 0 ? (
        <div className="divide-y border-y">
          {settings.terminals.map((terminal) => (
            <div key={terminal.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{terminal.name}</p>
                  <span className={terminal.isActive ? 'rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white' : 'rounded-md bg-zinc-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white'}>{terminal.isActive ? 'Ativo' : 'Desativado'}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Estoque: {stockNames[terminal.stockId] ?? 'Local não disponível'}</p>
              </div>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Ações do ${terminal.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Ações</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => openEdit(terminal)}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void toggleTerminal(terminal)}><Power className="mr-2 h-4 w-4" /> {terminal.isActive ? 'Desativar' : 'Reativar'}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {!canManage ? <p className="mt-3 text-xs text-muted-foreground">Seu perfil pode consultar, mas não alterar os caixas.</p> : null}

      <ResponsiveModal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={form.id ? 'Editar caixa' : 'Cadastrar caixa'}
        description="Escolha o nome mostrado aos operadores e o estoque usado nas vendas."
        footer={<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button type="button" onClick={() => void saveForm()} disabled={settings.save.isPending || form.name.trim().length < 2 || !form.stockId}>{settings.save.isPending ? 'Salvando...' : 'Salvar caixa'}</Button></div>}
      >
        <div className="space-y-5 py-2">
          <div className="space-y-2"><Label htmlFor="pdv-terminal-name">Nome do caixa</Label><Input id="pdv-terminal-name" value={form.name} maxLength={80} autoComplete="off" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Caixa 01" /></div>
          <div className="space-y-2"><Label htmlFor="pdv-terminal-stock">Local de estoque</Label><Select value={form.stockId} onValueChange={(stockId) => setForm((current) => ({ ...current, stockId }))}><SelectTrigger id="pdv-terminal-stock"><SelectValue placeholder="Escolha o estoque" /></SelectTrigger><SelectContent>{settings.stocks.map((stock) => <SelectItem key={stock.id} value={stock.id}>{stock.name}{stock.isDefault ? ' · principal' : ''}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Esse local continuará aparecendo normalmente na tela de estoque.</p></div>
        </div>
      </ResponsiveModal>
    </section>
  );
}
