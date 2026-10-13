import { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, Archive, ArrowDown, ArrowUp, Edit, History, Package, Plus, Search, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { NumericInput } from '@/components/ui/numeric-input';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { EmptyState } from '@/components/mobile/EmptyState';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useCustomerStockManagement,
  type CustomerStockItem,
  type CustomerStockItemInput,
} from '@/hooks/useCustomerStockManagement';
import { formatQty } from '@/components/inventory/InventoryMaterialSelect';
import { cn, fuzzyIncludes } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface CustomerStockTabProps {
  customerId: string;
  customerName: string;
}

type StockSubTab = 'materiais' | 'historico';
type MovementKind = 'entrada' | 'saida';

const parseNumber = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function MaterialDialog({
  open,
  onOpenChange,
  item,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CustomerStockItem | null;
  onSubmit: (input: CustomerStockItemInput) => Promise<void>;
  loading: boolean;
}) {
  const { toast } = useToast();
  const formId = useId();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('un');
  const [initialQuantity, setInitialQuantity] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setSku(item?.sku ?? '');
    setUnit(item?.unit ?? 'un');
    setInitialQuantity('');
    setMinQuantity(item?.min_quantity == null ? '' : String(item.min_quantity).replace('.', ','));
    setCostPrice(item?.cost_price == null ? '' : String(item.cost_price).replace('.', ','));
    setNotes(item?.notes ?? '');
  }, [open, item]);

  const submit = async () => {
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Informe o nome do material.' });
      return;
    }
    if (!unit.trim()) {
      toast({ variant: 'destructive', title: 'Informe a unidade do material.' });
      return;
    }
    const initial = parseNumber(initialQuantity);
    if (!item && initial < 0) {
      toast({ variant: 'destructive', title: 'O saldo inicial não pode ser negativo.' });
      return;
    }
    try {
      await onSubmit({
        name,
        sku,
        unit,
        initialQuantity: item ? undefined : initial,
        minQuantity: minQuantity ? parseNumber(minQuantity) : null,
        costPrice: costPrice ? parseNumber(costPrice) : null,
        notes,
      });
      onOpenChange(false);
    } catch {
      // A mutation exibe a mensagem de erro e o formulário permanece aberto.
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={item ? 'Editar material do cliente' : 'Cadastrar material no cliente'}
      description="Este material e seu saldo ficam separados do estoque da sua empresa."
      footer={(
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-11 flex-1">
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={loading} className="h-11 flex-1">
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      )}
    >
      <form id={formId} onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="customer-stock-name">Material *</Label>
          <Input id="customer-stock-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Tinta acrílica branca" disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-stock-sku">Código / SKU</Label>
          <Input id="customer-stock-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Opcional" disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-stock-unit">Unidade *</Label>
          <Input id="customer-stock-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="un, kg, m, L..." disabled={loading} />
        </div>
        {!item && (
          <div className="space-y-2">
            <Label htmlFor="customer-stock-initial-quantity">Saldo inicial</Label>
            <NumericInput id="customer-stock-initial-quantity" decimal value={initialQuantity} onValueChange={setInitialQuantity} placeholder="0" disabled={loading} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="customer-stock-min-quantity">Estoque mínimo</Label>
          <NumericInput id="customer-stock-min-quantity" decimal value={minQuantity} onValueChange={setMinQuantity} placeholder="Opcional" disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-stock-cost-price">Custo de referência</Label>
          <NumericInput id="customer-stock-cost-price" decimal value={costPrice} onValueChange={setCostPrice} placeholder="Opcional" disabled={loading} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="customer-stock-notes">Observações</Label>
          <Textarea id="customer-stock-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Marca, lote, local dentro da obra..." disabled={loading} />
        </div>
      </form>
    </ResponsiveModal>
  );
}

function MovementDialog({
  open,
  onOpenChange,
  item,
  type,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CustomerStockItem | null;
  type: MovementKind;
  onSubmit: (quantity: number, notes: string) => Promise<void>;
  loading: boolean;
}) {
  const { toast } = useToast();
  const formId = useId();
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const parsedQuantity = parseNumber(quantity);
  const exceedsBalance = type === 'saida' && item != null && parsedQuantity > 0 && parsedQuantity > item.quantity;

  useEffect(() => {
    if (!open) return;
    setQuantity('');
    setNotes('');
  }, [open, item, type]);

  const submit = async () => {
    const parsed = parsedQuantity;
    if (parsed <= 0) {
      toast({ variant: 'destructive', title: 'Informe uma quantidade maior que zero.' });
      return;
    }
    try {
      await onSubmit(parsed, notes);
      onOpenChange(false);
    } catch {
      // A mutation exibe a mensagem de erro e o formulário permanece aberto.
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={type === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}
      description={item ? `${item.name} · saldo atual: ${formatQty(item.quantity)} ${item.unit}` : undefined}
      footer={(
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-11 flex-1">Cancelar</Button>
          <Button type="submit" form={formId} disabled={loading} className="h-11 flex-1">
            {loading ? 'Registrando...' : exceedsBalance ? 'Registrar mesmo assim' : 'Confirmar'}
          </Button>
        </div>
      )}
    >
      <form id={formId} onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customer-stock-movement-quantity">Quantidade *</Label>
          <NumericInput id="customer-stock-movement-quantity" decimal value={quantity} onValueChange={setQuantity} placeholder="0" disabled={loading} />
        </div>
        {exceedsBalance && item && (
          <Alert className="border-warning/50 bg-warning/10 text-foreground">
            <TriangleAlert className="h-4 w-4 text-warning" />
            <AlertTitle>O saldo ficará negativo</AlertTitle>
            <AlertDescription>
              A saída supera o saldo atual em {formatQty(parsedQuantity - item.quantity)} {item.unit}. O registro é permitido e deixará o saldo em {formatQty(item.quantity - parsedQuantity)} {item.unit}.
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="customer-stock-movement-notes">Motivo / observação</Label>
          <Textarea id="customer-stock-movement-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={type === 'entrada' ? 'Ex.: Material comprado pelo cliente' : 'Ex.: Uso manual na obra'} disabled={loading} />
        </div>
      </form>
    </ResponsiveModal>
  );
}

export function CustomerStockTab({ customerId, customerName }: CustomerStockTabProps) {
  const { isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();
  const canManageStock = isAdminOrGestor()
    || (hasPermissionRecord && hasPermission('fn:manage_inventory'));
  const {
    items,
    movements,
    isLoading,
    isFetching,
    isError,
    refetch,
    createItem,
    updateItem,
    archiveItem,
    registerMovement,
  } = useCustomerStockManagement(customerId);
  const [subTab, setSubTab] = useState<StockSubTab>('materiais');
  const [search, setSearch] = useState('');
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CustomerStockItem | null>(null);
  const [movementItem, setMovementItem] = useState<CustomerStockItem | null>(null);
  const [movementType, setMovementType] = useState<MovementKind>('entrada');
  const [archiveTarget, setArchiveTarget] = useState<CustomerStockItem | null>(null);

  const filteredItems = useMemo(
    () => items.filter((item) => !search || fuzzyIncludes(`${item.name} ${item.sku ?? ''} ${item.unit}`, search)),
    [items, search],
  );
  const filteredMovements = useMemo(
    () => movements.filter((movement) => !search || fuzzyIncludes(`${movement.material_name} ${movement.notes ?? ''}`, search)),
    [movements, search],
  );
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const belowMinimum = items.filter((item) => item.min_quantity != null && item.quantity < item.min_quantity).length;

  const openMovement = (item: CustomerStockItem, type: MovementKind) => {
    setMovementItem(item);
    setMovementType(type);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar o estoque do cliente</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Confira sua conexão e tente novamente. Nenhum dado foi alterado.</p>
          <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()} className="min-h-11 border-destructive/40">
            {isFetching ? 'Tentando novamente...' : 'Tentar novamente'}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Estoque do cliente</h2>
          <p className="mt-1 text-sm text-muted-foreground">Materiais alocados em {customerName}, separados do estoque da empresa.</p>
        </div>
        {canManageStock && (
          <Button onClick={() => { setEditingItem(null); setMaterialDialogOpen(true); }} className="min-h-11 w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" /> Cadastrar material
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Materiais</p><p className="mt-1 text-2xl font-semibold">{items.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Quantidade total</p><p className="mt-1 text-2xl font-semibold">{formatQty(totalQuantity)}</p></CardContent></Card>
          <Card className="col-span-2 sm:col-span-1"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Abaixo do mínimo</p><p className={cn('mt-1 text-2xl font-semibold', belowMinimum > 0 && 'text-warning')}>{belowMinimum}</p></CardContent></Card>
        </div>
      )}

      <MobilePillTabs
        variant="underline"
        tabs={[
          { value: 'materiais', label: 'Materiais' },
          { value: 'historico', label: 'Histórico de materiais' },
        ]}
        activeTab={subTab}
        onTabChange={(value) => setSubTab(value as StockSubTab)}
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Label htmlFor="customer-stock-search" className="sr-only">{subTab === 'materiais' ? 'Buscar material' : 'Buscar no histórico'}</Label>
        <Input id="customer-stock-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={subTab === 'materiais' ? 'Buscar material...' : 'Buscar no histórico...'} className="min-h-11 pl-9" />
      </div>

      {subTab === 'materiais' && (
        filteredItems.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<Package className="h-10 w-10" />}
            title={search ? 'Nenhum material encontrado' : 'Nenhum material no estoque do cliente'}
            description={search ? 'Tente buscar por outro termo.' : 'Cadastre o primeiro material comprado ou mantido por este cliente.'}
            action={!search && canManageStock ? { label: 'Cadastrar material', onClick: () => { setEditingItem(null); setMaterialDialogOpen(true); } } : undefined}
          />
        ) : (
          <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table>
            <TableHeader><TableRow>
              <TableHead>Material</TableHead><TableHead>Código</TableHead><TableHead>Saldo</TableHead><TableHead>Mínimo</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>{filteredItems.map((item) => {
              const low = item.min_quantity != null && item.quantity < item.min_quantity;
              return (
                <TableRow key={item.id}>
                  <TableCell><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.unit}</p></TableCell>
                  <TableCell>{item.sku || '—'}</TableCell>
                  <TableCell><span className={cn('font-semibold', low && 'text-warning')}>{formatQty(item.quantity)} {item.unit}</span>{low && <Badge variant="warning" className="ml-2">Baixo</Badge>}</TableCell>
                  <TableCell>{item.min_quantity == null ? '—' : `${formatQty(item.min_quantity)} ${item.unit}`}</TableCell>
                  <TableCell className="text-right"><RowActionsMenu triggerClassName="min-h-11 min-w-11" actions={[
                    { label: 'Registrar entrada', icon: ArrowDown, onClick: () => openMovement(item, 'entrada') },
                    { label: 'Registrar saída', icon: ArrowUp, onClick: () => openMovement(item, 'saida') },
                    { label: 'Editar', icon: Edit, variant: 'edit', onClick: () => { setEditingItem(item); setMaterialDialogOpen(true); } },
                    { label: 'Excluir', icon: Archive, variant: 'delete', onClick: () => setArchiveTarget(item) },
                  ].map((action) => ({ ...action, hidden: !canManageStock }))} /></TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table></div></CardContent></Card>
        )
      )}

      {subTab === 'historico' && (
        filteredMovements.length === 0 ? (
          <EmptyState size="compact" icon={<History className="h-10 w-10" />} title="Nenhuma movimentação" description="Entradas, saídas e consumos em OS aparecerão aqui." />
        ) : (
          <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Material</TableHead><TableHead>Movimento</TableHead><TableHead>Quantidade</TableHead><TableHead>Saldo</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
            <TableBody>{filteredMovements.map((movement) => {
              const isEntry = movement.quantity > 0;
              const label = movement.movement_type === 'consumo' ? 'Consumo em OS' : movement.movement_type === 'estorno' ? 'Estorno' : movement.movement_type === 'ajuste' ? 'Ajuste' : isEntry ? 'Entrada' : 'Saída';
              return (
                <TableRow key={movement.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(movement.created_at)}</TableCell>
                  <TableCell><p className="font-medium">{movement.material_name}</p></TableCell>
                  <TableCell><Badge className={cn(isEntry ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white')}>{label}</Badge></TableCell>
                  <TableCell className={cn('font-semibold', isEntry ? 'text-emerald-700' : 'text-blue-700')}>{isEntry ? '+' : ''}{formatQty(movement.quantity)} {movement.material_unit}</TableCell>
                  <TableCell>{formatQty(movement.stock_after)} {movement.material_unit}</TableCell>
                  <TableCell>{movement.service_order_id ? 'Ordem de serviço' : movement.notes || 'Movimentação manual'}</TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table></div></CardContent></Card>
        )
      )}

      <MaterialDialog
        open={materialDialogOpen}
        onOpenChange={setMaterialDialogOpen}
        item={editingItem}
        loading={createItem.isPending || updateItem.isPending}
        onSubmit={async (input) => {
          if (editingItem) await updateItem.mutateAsync({ id: editingItem.id, ...input });
          else await createItem.mutateAsync(input);
        }}
      />

      <MovementDialog
        open={!!movementItem}
        onOpenChange={(open) => { if (!open) setMovementItem(null); }}
        item={movementItem}
        type={movementType}
        loading={registerMovement.isPending}
        onSubmit={async (quantity, notes) => {
          if (!movementItem) return;
          await registerMovement.mutateAsync({ inventoryId: movementItem.id, type: movementType, quantity, notes });
        }}
      />

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget && archiveTarget.quantity !== 0
                ? 'Zere o saldo antes de excluir'
                : 'Excluir material do estoque do cliente?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget && archiveTarget.quantity !== 0
                ? `“${archiveTarget.name}” ainda possui saldo de ${formatQty(archiveTarget.quantity)} ${archiveTarget.unit}. Registre uma saída ou entrada até o saldo chegar a zero; o histórico será preservado.`
                : `“${archiveTarget?.name}” deixará de aparecer para novas movimentações. O histórico e os consumos já registrados serão preservados.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">
              {archiveTarget && archiveTarget.quantity !== 0 ? 'Entendi' : 'Cancelar'}
            </AlertDialogCancel>
            {archiveTarget?.quantity === 0 && (
              <AlertDialogAction
                variant="destructive"
                className="min-h-11"
                disabled={archiveItem.isPending}
                onClick={async () => {
                  await archiveItem.mutateAsync(archiveTarget.id);
                  setArchiveTarget(null);
                }}
              >
                {archiveItem.isPending ? 'Excluindo...' : 'Excluir material'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
