import { useMemo, useRef, useState } from 'react';
import {
  FileUp,
  Building2,
  PackagePlus,
  PackageCheck,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useNfeImport, type NfeImportLine } from '@/hooks/useNfeImport';
import {
  parseNfeXml,
  NfeParseError,
  type NfeParseResult,
} from '@/lib/nfeParser';
import { cpfCnpjMask } from '@/utils/masks';
import { fuzzyIncludes } from '@/lib/utils';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDateBR = (iso: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return iso;
  }
};

/** Sugere o melhor item de estoque para casar com um nome de produto. */
function suggestMatch(name: string, items: InventoryItem[]): string | null {
  const hit = items.find((i) => fuzzyIncludes(i.name, name) || fuzzyIncludes(name, i.name));
  return hit?.id ?? null;
}

/** Estado editável de cada linha na revisão. */
interface ReviewLine {
  /** Chave estável (índice do det). */
  key: string;
  cProd: string;
  ean: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  total: number;
  include: boolean;
  /** '' = criar novo; senão = id do item de estoque. */
  matchId: string;
}

interface NfeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NfeImportDialog({ open, onOpenChange }: NfeImportDialogProps) {
  const { toast } = useToast();
  const { items } = useInventory();
  const { suppliers } = useSuppliers();
  const { checkDuplicate, runImport, importing } = useNfeImport();

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guard síncrono contra duplo-clique: o `disabled` do botão depende do estado
  // assíncrono e não fecha a corrida entre dois cliques rápidos.
  const submittingRef = useRef(false);
  const [parsed, setParsed] = useState<NfeParseResult | null>(null);
  const [lines, setLines] = useState<ReviewLine[]>([]);
  // Confirmação de duplicidade pendente (data da importação anterior).
  const [dupConfirm, setDupConfirm] = useState<{ importedAt: string | null } | null>(null);

  // Fornecedor casado por CNPJ (se houver).
  const matchedSupplier = useMemo(() => {
    if (!parsed?.supplier.cnpj) return null;
    const target = parsed.supplier.cnpj.replace(/\D/g, '');
    // M5 — só casa com documento válido (CPF 11 / CNPJ 14 dígitos).
    // Sem isso, '' casaria com qualquer fornecedor cadastrado sem documento.
    if (target.length < 11) return null;
    return (
      suppliers.find((s) => {
        const doc = (s.cpf_cnpj ?? '').replace(/\D/g, '');
        return doc.length >= 11 && doc === target;
      }) ?? null
    );
  }, [parsed, suppliers]);

  const resetState = () => {
    setParsed(null);
    setLines([]);
    setDupConfirm(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const buildReview = (result: NfeParseResult) => {
    setParsed(result);
    setLines(
      result.items.map((it, idx) => {
        const matchId = suggestMatch(it.name, items) ?? '';
        return {
          key: String(idx),
          cProd: it.cProd,
          ean: it.ean,
          name: it.name,
          unit: it.unit,
          quantity: it.quantity,
          unitCost: it.unitCost,
          total: it.total,
          include: true,
          matchId,
        };
      }),
    );
  };

  const handleFile = async (file: File) => {
    let result: NfeParseResult;
    try {
      // Detecta o encoding pela declaração do XML (muitas NF-e vêm em ISO-8859-1).
      // Ler como UTF-8 fixo corromperia os acentos (mojibake) no nome do produto.
      const buf = await file.arrayBuffer();
      const head = new TextDecoder('ascii').decode(buf.slice(0, 256)).toLowerCase();
      const enc = /encoding=["']?\s*(iso-8859-1|latin1|windows-1252)/.test(head)
        ? 'iso-8859-1'
        : 'utf-8';
      const text = new TextDecoder(enc).decode(buf);
      result = parseNfeXml(text);
    } catch (err) {
      const msg =
        err instanceof NfeParseError ? err.message : 'XML de NF-e inválido.';
      toast({ title: msg, variant: 'destructive' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Dup-check antes de mostrar a revisão.
    const dup = await checkDuplicate(result.accessKey);
    if (dup.duplicate) {
      // Guarda o resultado e pede confirmação.
      setParsed(result);
      setLines([]);
      setDupConfirm({ importedAt: dup.importedAt });
      // Pré-monta a revisão em segundo plano para usar caso confirme.
      return;
    }
    buildReview(result);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const confirmDuplicate = () => {
    if (parsed) buildReview(parsed);
    setDupConfirm(null);
  };

  const cancelDuplicate = () => {
    resetState();
  };

  const updateLine = (key: string, patch: Partial<ReviewLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  // Mapa id → item de estoque (para detectar divergência de unidade — B12).
  const itemsById = useMemo(() => {
    const m = new Map<string, InventoryItem>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  const includedLines = lines.filter((l) => l.include);
  const includedTotal = includedLines.reduce(
    (acc, l) => acc + l.quantity * l.unitCost,
    0,
  );
  const newCount = includedLines.filter((l) => !l.matchId).length;

  const handleConfirm = async () => {
    if (!parsed || includedLines.length === 0) return;
    // Guard síncrono: ignora o 2º clique antes do estado propagar (evita import duplicado).
    if (submittingRef.current) return;

    // M6 — quantidade ≤ 0 geraria movimento inútil (lixo no Kardex). Bloqueia.
    const invalidQty = includedLines.filter((l) => !(l.quantity > 0));
    if (invalidQty.length > 0) {
      toast({
        title: 'Quantidade inválida',
        description: `Corrija a quantidade (maior que zero) de ${
          invalidQty.length === 1 ? '1 item' : `${invalidQty.length} itens`
        } ou desmarque ${invalidQty.length === 1 ? 'esse item' : 'esses itens'} antes de importar.`,
        variant: 'destructive',
      });
      return;
    }

    submittingRef.current = true;
    const importLines: NfeImportLine[] = includedLines.map((l) => ({
      name: l.name,
      unit: l.unit,
      quantity: l.quantity,
      unitCost: l.unitCost,
      matchInventoryId: l.matchId || null,
    }));

    try {
      const res = await runImport({
        accessKey: parsed.accessKey,
        supplier: parsed.supplier,
        matchedSupplierId: matchedSupplier?.id ?? null,
        total: parsed.total,
        lines: importLines,
      });

      const parts = [`${res.imported} ite${res.imported === 1 ? 'm' : 'ns'} importado${res.imported === 1 ? '' : 's'}`];
      if (res.created > 0) parts.push(`${res.created} novo${res.created === 1 ? '' : 's'}`);
      if (res.failed > 0) parts.push(`${res.failed} com falha`);

      toast({
        title: res.failed > 0 ? 'Importação concluída com avisos' : 'NF-e importada',
        description: parts.join(' • ') + '. Entrada registrada no estoque.',
        variant: res.failed > 0 ? 'default' : undefined,
      });
      handleClose(false);
    } catch {
      // erro já foi exibido pelo hook
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={handleClose}
        title="Importar XML (NF-e)"
        footer={
          parsed && lines.length > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{includedLines.length}</span> ite
                {includedLines.length === 1 ? 'm' : 'ns'} • {formatCurrency(includedTotal)}
              </div>
              <Button
                onClick={handleConfirm}
                disabled={importing || includedLines.length === 0}
                className="min-h-11 rounded-xl gap-2"
              >
                <Check className="h-4 w-4" />
                {importing ? 'Importando...' : 'Confirmar entrada'}
              </Button>
            </div>
          ) : undefined
        }
      >
        {/* ETAPA 1: escolher arquivo (antes de parsear). */}
        {!parsed || lines.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
              <FileUp className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Selecione o arquivo <span className="font-medium text-foreground">.xml</span> da
                nota fiscal eletrônica para dar entrada no estoque.
              </p>
              <Button
                variant="outline"
                className="min-h-11 rounded-xl gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-4 w-4" />
                Escolher arquivo XML
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              className="hidden"
              onChange={onFileChange}
            />
          </div>
        ) : (
          /* ETAPA 2: revisão. */
          <div className="space-y-4">
            {/* Fornecedor */}
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Fornecedor</p>
                  <p className="truncate text-sm font-medium">
                    {parsed.supplier.name || 'Não identificado'}
                  </p>
                  {parsed.supplier.cnpj && (
                    <p className="text-xs text-muted-foreground">
                      {cpfCnpjMask(parsed.supplier.cnpj)}
                    </p>
                  )}
                </div>
                {matchedSupplier ? (
                  <Badge variant="secondary" className="shrink-0 gap-1 text-[11px]">
                    <PackageCheck className="h-3 w-3" /> Vinculado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 gap-1 text-[11px]">
                    <PackagePlus className="h-3 w-3" /> Novo
                  </Badge>
                )}
              </div>
              {!matchedSupplier && parsed.supplier.name && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Será criado o fornecedor "{parsed.supplier.name}".
                </p>
              )}
            </div>

            {/* B10 — sem chave de acesso não dá pra detectar reimportação */}
            {!parsed.accessKey && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                Esta nota não tem chave de acesso. Não será possível avisar se ela for
                importada de novo.
              </p>
            )}

            {/* Produtos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Produtos da nota</Label>
                <span className="text-xs text-muted-foreground">
                  {newCount > 0 && `${newCount} novo${newCount === 1 ? '' : 's'} • `}
                  {lines.length} no total
                </span>
              </div>

              <div className="space-y-2">
                {lines.map((line) => (
                  <div
                    key={line.key}
                    className={`rounded-xl border p-3 transition-colors ${
                      line.include ? 'bg-card' : 'bg-muted/40 opacity-60'
                    }`}
                  >
                    {/* Linha 1: checkbox incluir + nome editável */}
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={line.include}
                        onCheckedChange={(v) => updateLine(line.key, { include: v === true })}
                        aria-label={`Incluir ${line.name}`}
                        className="mt-2"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          value={line.name}
                          onChange={(e) => updateLine(line.key, { name: e.target.value })}
                          disabled={!line.include}
                          className="h-9 text-sm font-medium"
                          aria-label="Nome do produto"
                        />
                        {/* Referência discreta cProd / EAN */}
                        {(line.cProd || line.ean) && (
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {line.cProd && `cód ${line.cProd}`}
                            {line.cProd && line.ean && ' • '}
                            {line.ean && `EAN ${line.ean}`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Linha 2: qtd + unidade + custo unit. */}
                    <div className="mt-2 grid grid-cols-3 gap-2 pl-7">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Qtd</Label>
                        <NumericInput
                          decimal
                          value={line.quantity ? String(line.quantity) : ''}
                          onValueChange={(v) =>
                            updateLine(line.key, {
                              quantity: Number(v.replace(',', '.')) || 0,
                            })
                          }
                          disabled={!line.include}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Unidade</Label>
                        <Input
                          value={line.unit}
                          onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                          disabled={!line.include}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Custo un.</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.unitCost}
                          onChange={(e) =>
                            updateLine(line.key, {
                              unitCost: Number(String(e.target.value).replace(',', '.')) || 0,
                            })
                          }
                          disabled={!line.include}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>

                    {/* Linha 3: casar com item existente ou criar novo */}
                    <div className="mt-2 pl-7">
                      <Label className="text-[11px] text-muted-foreground">
                        Destino no estoque
                      </Label>
                      <Select
                        value={line.matchId || 'new'}
                        onValueChange={(v) =>
                          updateLine(line.key, { matchId: v === 'new' ? '' : v })
                        }
                        disabled={!line.include}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">
                            <span className="flex items-center gap-2">
                              <PackagePlus className="h-3.5 w-3.5" /> Criar novo item
                            </span>
                          </SelectItem>
                          {items.map((it) => (
                            <SelectItem key={it.id} value={it.id}>
                              {it.name}
                              {it.sku ? ` (${it.sku})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Avisos discretos por linha */}
                    {line.include && (() => {
                      const matched = line.matchId ? itemsById.get(line.matchId) : null;
                      const matchedUnit = (matched?.unit ?? '').trim().toLowerCase();
                      const lineUnit = (line.unit ?? '').trim().toLowerCase();
                      const qtyInvalid = !(line.quantity > 0);
                      const unitDiverges =
                        !!matched && !!matchedUnit && !!lineUnit && matchedUnit !== lineUnit;
                      if (!qtyInvalid && !unitDiverges) return null;
                      return (
                        <div className="mt-2 space-y-1 pl-7">
                          {qtyInvalid && (
                            <p className="flex items-center gap-1 text-[11px] text-destructive">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              Quantidade precisa ser maior que zero.
                            </p>
                          )}
                          {unitDiverges && (
                            <p className="flex items-center gap-1 text-[11px] text-warning">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              Unidade da nota: {line.unit.toUpperCase()} ≠ cadastro:{' '}
                              {(matched?.unit ?? '').toUpperCase()}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Aviso de duplicidade */}
      <AlertDialog open={dupConfirm !== null} onOpenChange={(o) => !o && cancelDuplicate()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Nota já importada
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta nota já foi importada
              {dupConfirm?.importedAt ? ` em ${formatDateBR(dupConfirm.importedAt)}` : ''}.
              Importar de novo vai duplicar a entrada no estoque. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDuplicate}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDuplicate}>
              Importar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
