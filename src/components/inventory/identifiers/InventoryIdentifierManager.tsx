import { useMemo, useState } from 'react';
import { Barcode, Loader2, Plus, Printer, RefreshCw, ShieldCheck, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { NumericInput, parseDecimalInputValue } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  InventoryIdentifierError,
  type InventoryIdentifierType,
  type SavedInventoryIdentifier,
  useInventoryIdentifiers,
} from '@/hooks/useInventoryIdentifiers';
import {
  generateInventoryIdentifierLabelPdf,
  type InventoryLabelFormat,
} from '@/lib/pdv/inventoryLabelPdf';
import { openPdfInTab, openPendingPdfTab } from '@/utils/openPdfInTab';
import { InventoryIdentifierCameraScanner } from './InventoryIdentifierCameraScanner';
import { InventoryIdentifierLabelPreview } from './InventoryIdentifierLabelPreview';

const TYPE_LABELS: Record<InventoryIdentifierType, string> = {
  sku: 'SKU',
  barcode: 'Código de barras',
  gtin: 'GTIN/EAN',
  qr: 'QR Code',
  internal: 'Código interno',
  alias: 'Apelido',
};

const EDITABLE_TYPES: InventoryIdentifierType[] = ['barcode', 'gtin', 'qr', 'alias'];

function safeFilename(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function identifierLabel(item: SavedInventoryIdentifier, materialName: string, sku: string | null) {
  return {
    materialName,
    code: item.code,
    unitLabel: item.unitLabel,
    unitFactor: item.unitFactor,
    sku,
  };
}

interface InventoryIdentifierManagerProps {
  inventoryId: string;
  embedded?: boolean;
}

export function InventoryIdentifierManager({ inventoryId, embedded = false }: InventoryIdentifierManagerProps) {
  const { toast } = useToast();
  const identifiers = useInventoryIdentifiers(inventoryId);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<InventoryIdentifierType>('barcode');
  const [code, setCode] = useState('');
  const [unitLabel, setUnitLabel] = useState('un');
  const [unitFactor, setUnitFactor] = useState('1');
  const [format, setFormat] = useState<InventoryLabelFormat>('60x40');
  const [labelIdentifierId, setLabelIdentifierId] = useState('');
  const [labelCopies, setLabelCopies] = useState('1');
  const [printing, setPrinting] = useState(false);

  const activeItems = useMemo(
    () => identifiers.list?.items.filter((item) => item.isActive) ?? [],
    [identifiers.list?.items],
  );
  const defaultLabelItem = activeItems.find((item) => item.isPrimary) ?? activeItems[0] ?? null;
  const previewItem = activeItems.find((item) => item.identifierId === labelIdentifierId) ?? defaultLabelItem;

  function resetForm() {
    setCode('');
    setUnitLabel(identifiers.list?.unit ?? 'un');
    setUnitFactor('1');
    setType('barcode');
    setAdding(false);
  }

  async function save() {
    const factor = parseDecimalInputValue(unitFactor);
    if (!code.trim() || !unitLabel.trim() || factor == null || factor <= 0) return;
    try {
      await identifiers.save.mutateAsync({
        inventoryId,
        identifierType: type,
        code: code.trim(),
        unitLabel: unitLabel.trim(),
        unitFactor: factor,
        isPrimary: false,
        isActive: true,
      });
      toast({ title: 'Código adicionado', description: factor === 1 ? 'O material já pode ser localizado por este código.' : `Cada leitura adicionará ${factor} unidades.` });
      resetForm();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível adicionar o código',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  }

  async function toggle(item: SavedInventoryIdentifier) {
    try {
      await identifiers.save.mutateAsync({
        identifierId: item.identifierId,
        inventoryId,
        identifierType: item.identifierType,
        code: item.code,
        unitLabel: item.unitLabel,
        unitFactor: item.unitFactor,
        isPrimary: item.isPrimary && !item.isActive,
        isActive: !item.isActive,
      });
      toast({ title: item.isActive ? 'Código desativado' : 'Código reativado' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível alterar o código',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  }

  async function generateInternal() {
    try {
      await identifiers.generateInternal.mutateAsync({ inventoryId });
      toast({ title: 'Código interno pronto' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível gerar o código interno',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  }

  async function printLabels() {
    const copies = Math.max(1, Math.min(500, Number.parseInt(labelCopies, 10) || 1));
    if (!identifiers.list || !previewItem) return;
    const target = openPendingPdfTab('Gerando etiquetas...');
    setPrinting(true);
    try {
      const label = identifierLabel(previewItem, identifiers.list.materialName, identifiers.list.sku);
      const pdf = await generateInventoryIdentifierLabelPdf(
        Array.from({ length: copies }, () => label),
        format,
      );
      const filename = `etiquetas-${safeFilename(identifiers.list.materialName) || 'material'}-${format}.pdf`;
      openPdfInTab(pdf.output('blob'), filename, target);
    } catch (error) {
      target?.close();
      toast({
        variant: 'destructive',
        title: 'Não foi possível gerar as etiquetas',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setPrinting(false);
    }
  }

  if (identifiers.isLoading) {
    return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando códigos…</div>;
  }

  if (identifiers.isError || !identifiers.list) {
    return (
      <NoticeBanner
        variant="destructive"
        action="Tentar novamente"
        onClick={() => void identifiers.refetch()}
      >
        {identifiers.error instanceof InventoryIdentifierError
          ? identifiers.error.message
          : 'Não foi possível carregar os códigos deste material.'}
      </NoticeBanner>
    );
  }

  const hasInternal = activeItems.some((item) => item.identifierType === 'internal');

  return (
    <section className="space-y-4 border-t pt-5" aria-labelledby="inventory-identifiers-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="inventory-identifiers-title" className="flex items-center gap-2 text-sm font-semibold"><Barcode className="h-4 w-4" />{embedded ? 'Embalagens e outros códigos' : 'Códigos e etiquetas'}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{embedded ? 'Cadastre caixa, rolo, pacote, QR Code ou outro código deste material.' : 'Use somente se a loja trabalha com leitor, câmera ou embalagens.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="icon" aria-label="Atualizar códigos" title="Atualizar códigos" onClick={() => void identifiers.refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!hasInternal && <Button type="button" size="sm" variant="outline" onClick={() => void generateInternal()} disabled={identifiers.generateInternal.isPending}><Wand2 className="h-4 w-4" />Gerar código interno</Button>}
          <Button type="button" size="sm" variant="outline" onClick={() => { setUnitLabel(identifiers.list?.unit ?? 'un'); setAdding((value) => !value); }}><Plus className="h-4 w-4" />Adicionar código</Button>
        </div>
      </div>

      {adding && (
        <div className="space-y-4 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inventory-identifier-type">Tipo</Label>
              <Select value={type} onValueChange={(value) => setType(value as InventoryIdentifierType)}>
                <SelectTrigger id="inventory-identifier-type"><SelectValue /></SelectTrigger>
                <SelectContent>{EDITABLE_TYPES.map((value) => <SelectItem key={value} value={value}>{TYPE_LABELS[value]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-identifier-code">Código</Label>
              <Input id="inventory-identifier-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" placeholder="Digite, leia ou use a câmera" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-identifier-unit">Nome da unidade</Label>
              <Input id="inventory-identifier-unit" value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)} placeholder="Ex.: caixa, rolo, pacote" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-identifier-factor">Quantidade ao ler</Label>
              <NumericInput id="inventory-identifier-factor" decimal value={unitFactor} onValueChange={setUnitFactor} />
              <p className="text-xs text-muted-foreground">Ex.: caixa com 12 unidades = 12.</p>
            </div>
          </div>
          <InventoryIdentifierCameraScanner onScan={(value) => setCode(value)} disabled={identifiers.save.isPending} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button type="button" onClick={() => void save()} disabled={!code.trim() || !unitLabel.trim() || (parseDecimalInputValue(unitFactor) ?? 0) <= 0 || identifiers.save.isPending}>{identifiers.save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Salvar código</Button>
          </div>
        </div>
      )}

      <div className="divide-y border-y">
        {identifiers.list.items.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">Nenhum código cadastrado.</p> : identifiers.list.items.map((item) => (
          <div key={item.identifierId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={item.isActive ? 'bg-blue-600 text-white' : 'bg-slate-600 text-white'}>{TYPE_LABELS[item.identifierType]}</Badge>
                {item.isPrimary && <Badge className="bg-emerald-600 text-white">Principal</Badge>}
                <span className="break-all font-mono text-sm font-semibold">{item.code}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.unitFactor === 1 ? item.unitLabel : `${item.unitLabel} · adiciona ${item.unitFactor} unidades`}</p>
            </div>
            {!item.isPrimary && (
              <Button type="button" size="sm" variant="ghost" disabled={identifiers.save.isPending} onClick={() => void toggle(item)}>{item.isActive ? 'Desativar' : 'Reativar'}</Button>
            )}
          </div>
        ))}
      </div>

      {previewItem && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-end">
          <InventoryIdentifierLabelPreview label={identifierLabel(previewItem, identifiers.list.materialName, identifiers.list.sku)} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(11rem,1fr)_7rem_auto_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="inventory-label-code">Código da etiqueta</Label>
              <Select value={previewItem.identifierId} onValueChange={setLabelIdentifierId}>
                <SelectTrigger id="inventory-label-code"><SelectValue /></SelectTrigger>
                <SelectContent>{activeItems.map((item) => <SelectItem key={item.identifierId} value={item.identifierId}>{TYPE_LABELS[item.identifierType]} · {item.code}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:w-52">
              <Label htmlFor="inventory-label-format">Folha das etiquetas</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as InventoryLabelFormat)}>
                <SelectTrigger id="inventory-label-format"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="60x40">Etiqueta 60 × 40 mm</SelectItem><SelectItem value="a4">Folha A4 · 24 etiquetas</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-label-copies">Cópias</Label>
              <NumericInput id="inventory-label-copies" value={labelCopies} onValueChange={setLabelCopies} />
            </div>
            <Button type="button" variant="outline" onClick={() => void printLabels()} disabled={printing}>{printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Gerar etiquetas</Button>
          </div>
        </div>
      )}
    </section>
  );
}
