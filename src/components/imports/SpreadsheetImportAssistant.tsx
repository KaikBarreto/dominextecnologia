import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileDown,
  FileSpreadsheet,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormWizardStepper } from '@/components/ui/FormWizardStepper';
import { FullscreenWizard, FullscreenWizardAction } from '@/components/ui/FullscreenWizard';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  type SpreadsheetImportEntity,
  type SpreadsheetImportGateway,
  type SpreadsheetImportSource,
  useSpreadsheetImportAssistant,
} from '@/hooks/useSpreadsheetImportAssistant';

export interface SpreadsheetImportStockOption {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface SpreadsheetImportAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: SpreadsheetImportEntity;
  initialSource?: SpreadsheetImportSource;
  sourceLocked?: boolean;
  disabledSources?: Partial<Record<SpreadsheetImportSource, string>>;
  stocks?: SpreadsheetImportStockOption[];
  defaultStockId?: string;
  gateway?: SpreadsheetImportGateway;
  onCompleted?: () => void;
}

const ENTITY_COPY: Record<SpreadsheetImportEntity, { singular: string; plural: string }> = {
  customers: { singular: 'cliente', plural: 'clientes' },
  suppliers: { singular: 'fornecedor', plural: 'fornecedores' },
  inventory: { singular: 'material', plural: 'materiais' },
  equipment: { singular: 'equipamento', plural: 'equipamentos' },
};

const AUVO_SYMBOL_URL = 'https://3315135.fs1.hubspotusercontent-na1.net/hubfs/3315135/novo-site-auvo/v1/img/logos/simbolo-auvo.webp';

function AuvoIdentity({ selected }: { selected: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <span className="flex h-8 items-center gap-2" aria-label="Auvo">
      {!imageFailed && <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-1"><img src={AUVO_SYMBOL_URL} alt="" className="h-full w-full object-contain" onError={() => setImageFailed(true)} /></span>}
      <span className={cn('text-base font-bold', selected ? 'text-white' : 'text-[#6f3cff]')}>Auvo</span>
    </span>
  );
}

const SOURCE_COPY: Record<SpreadsheetImportSource, { title: string; description: string }> = {
  dominex: {
    title: 'Modelo Dominex',
    description: 'Use a planilha preparada para os campos do sistema.',
  },
  auvo: {
    title: 'Exportação da Auvo',
    description: 'Selecione o arquivo exportado diretamente do sistema antigo.',
  },
};

const STEPS = [
  { key: 'source', label: 'Origem e destino' },
  { key: 'file', label: 'Selecionar planilha' },
  { key: 'review', label: 'Conferir e importar' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SpreadsheetImportAssistant({
  open,
  onOpenChange,
  entity,
  initialSource = 'dominex',
  sourceLocked = false,
  disabledSources = {},
  stocks = [],
  defaultStockId,
  gateway,
  onCompleted,
}: SpreadsheetImportAssistantProps) {
  const copy = ENTITY_COPY[entity];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [maxReachedStep, setMaxReachedStep] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const assistant = useSpreadsheetImportAssistant({ entity, initialSource, gateway });
  const busy = assistant.phase === 'loading' || assistant.phase === 'submitting';
  const hasPreparedFile = !!assistant.preview;
  const requiresStock = entity === 'inventory';
  const visibleSteps = sourceLocked ? STEPS.slice(1) : STEPS;

  useEffect(() => {
    if (!open) return;
    if (requiresStock && !assistant.stockId && defaultStockId) assistant.setStockId(defaultStockId);
  }, [assistant, defaultStockId, open, requiresStock]);

  useEffect(() => {
    if (!open) return;
    assistant.resetAll(initialSource);
    setStep(sourceLocked ? 1 : 0);
    setMaxReachedStep(sourceLocked ? 1 : 0);
    // O reset deve ocorrer somente ao abrir um novo fluxo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (assistant.phase === 'success') onCompleted?.();
  }, [assistant.phase, onCompleted]);

  const canLeaveSource = !requiresStock || !!assistant.stockId;
  const canGoNext = step === 0 ? canLeaveSource : step === 1 ? hasPreparedFile : false;
  const canSelectFile = !requiresStock || !!assistant.stockId;
  const stockSelector = requiresStock ? (
    <div className="max-w-xl space-y-2">
      <label className="text-base font-semibold" htmlFor="spreadsheet-import-stock">Local de destino do saldo</label>
      <Select value={assistant.stockId} onValueChange={(stockId) => { assistant.setStockId(stockId); setMaxReachedStep(sourceLocked ? 1 : 0); }}>
        <SelectTrigger id="spreadsheet-import-stock" className="h-12"><SelectValue placeholder="Selecione um local de estoque" /></SelectTrigger>
        <SelectContent>
          {stocks.map((stock) => <SelectItem key={stock.id} value={stock.id}>{stock.name}{stock.isDefault ? ' · principal' : ''}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="flex gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />Todo saldo inicial desta planilha será direcionado ao local escolhido.</p>
      {stocks.length === 0 && <p className="text-sm text-destructive" role="alert">Cadastre ou solicite acesso a um local de estoque antes de importar.</p>}
    </div>
  ) : null;

  const moveTo = (nextStep: number) => {
    if (nextStep < 0 || nextStep >= STEPS.length || nextStep > maxReachedStep + 1) return;
    if (nextStep > step && !canGoNext) return;
    setStep(nextStep);
    setMaxReachedStep((current) => Math.max(current, nextStep));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy) return;
    onOpenChange(nextOpen);
  };

  const selectFile = async (file?: File) => {
    if (!file || !canSelectFile) return;
    setMaxReachedStep(1);
    const prepared = await assistant.prepare(file);
    if (prepared) setMaxReachedStep((current) => Math.max(current, 2));
  };

  const openFilePicker = () => {
    if (!canSelectFile) return;
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.click();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    void selectFile(event.dataTransfer.files[0]);
  };

  const retryPrepare = () => {
    if (assistant.file) void selectFile(assistant.file);
  };

  const footer = assistant.phase === 'success' ? (
    <div className="flex justify-end">
      <FullscreenWizardAction onClick={() => handleOpenChange(false)} className="w-full !bg-black !text-white hover:!bg-zinc-800 sm:w-auto sm:min-w-48">
        Concluir
      </FullscreenWizardAction>
    </div>
  ) : (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:justify-end sm:gap-3">
      <FullscreenWizardAction
        variant="cancel"
        onClick={() => step === (sourceLocked ? 1 : 0) ? handleOpenChange(false) : moveTo(step - 1)}
        disabled={busy}
        className="px-3 sm:min-w-36 sm:px-7"
      >
        {step === (sourceLocked ? 1 : 0) ? 'Cancelar' : <><ChevronLeft className="mr-1 h-4 w-4" />Voltar</>}
      </FullscreenWizardAction>
      {step < 2 ? (
        <FullscreenWizardAction
          onClick={() => moveTo(step + 1)}
          disabled={!canGoNext || busy}
          className="!bg-black !text-white hover:!bg-zinc-800 disabled:!text-white sm:min-w-48"
        >
          Continuar<ChevronRight className="ml-1 h-4 w-4" />
        </FullscreenWizardAction>
      ) : (
        <FullscreenWizardAction
          onClick={() => void assistant.execute()}
          disabled={busy || !assistant.preview?.canImport}
          className="!bg-black !text-white hover:!bg-zinc-800 disabled:!text-white sm:min-w-56"
          title={assistant.preview?.blockedReason}
        >
          {assistant.phase === 'submitting' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          Importar {copy.plural}
        </FullscreenWizardAction>
      )}
    </div>
  );

  return (
    <FullscreenWizard
      open={open}
      onOpenChange={handleOpenChange}
      title={`Importar ${copy.plural}`}
      description="Confira a origem, o arquivo e os possíveis conflitos antes de alterar os cadastros."
      exitLabel="Sair da importação"
      footer={footer}
      headerActions={<span className="text-xs font-black tracking-[0.2em] text-foreground sm:text-sm">DOMINEX</span>}
      overlayId={`spreadsheet-import-${entity}`}
      className="[&_*:focus-visible]:!ring-black"
    >
      <div className="flex min-h-full flex-col">
        <FormWizardStepper
          steps={visibleSteps}
          currentIndex={sourceLocked ? step - 1 : step}
          maxReachedIndex={sourceLocked ? maxReachedStep - 1 : maxReachedStep}
          onStepChange={(index) => {
            const actualIndex = sourceLocked ? index + 1 : index;
            if (!busy && actualIndex <= maxReachedStep) setStep(actualIndex);
          }}
          ariaLabel="Etapas da importação"
          tone="contrast"
          accent="black"
          className="sticky top-0 z-20 -mx-4 border-b bg-background px-4 pb-4 pt-4 sm:-mx-10 sm:px-10 sm:pt-6"
        />

        <main className="mx-auto mt-7 w-full max-w-5xl flex-1 pb-6 sm:mt-10">
          {assistant.phase === 'success' && assistant.result ? (
            <section className="mx-auto max-w-2xl space-y-6 text-center" aria-live="polite">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black text-white">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">Importação concluída</h2>
                <p className="mt-2 text-muted-foreground">{assistant.result.message ?? `Os ${copy.plural} foram processados com segurança.`}</p>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-left">
                <div className="rounded-2xl bg-muted p-5"><dt className="text-sm text-muted-foreground">Inseridos</dt><dd className="mt-1 text-3xl font-semibold">{assistant.result.inserted}</dd></div>
                <div className="rounded-2xl bg-muted p-5"><dt className="text-sm text-muted-foreground">Atualizados</dt><dd className="mt-1 text-3xl font-semibold">{assistant.result.updated}</dd></div>
                <div className="rounded-2xl bg-muted p-5"><dt className="text-sm text-muted-foreground">Ignorados</dt><dd className="mt-1 text-3xl font-semibold">{assistant.result.skipped}</dd></div>
              </dl>
            </section>
          ) : (
            <>
              {step === 0 && (
                <section className="space-y-7">
                  <div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">De onde vêm os dados?</h2><p className="mt-2 max-w-3xl text-muted-foreground">A origem define os campos esperados e as conferências aplicadas.</p></div>
                  <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label="Origem da planilha">
                    {(Object.keys(SOURCE_COPY) as SpreadsheetImportSource[]).map((source) => {
                      const selected = assistant.source === source;
                      const disabledReason = disabledSources[source];
                      return (
                        <button
                          key={source}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-disabled={!!disabledReason}
                          disabled={!!disabledReason}
                          onClick={() => { assistant.setSource(source); setMaxReachedStep(0); }}
                          className={cn('rounded-2xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black', selected ? 'border-black bg-black text-white' : 'bg-card hover:border-foreground/30', disabledReason && 'cursor-not-allowed opacity-60')}
                        >
                          {source === 'auvo' ? <AuvoIdentity selected={selected} /> : <FileSpreadsheet className="h-6 w-6" />}
                          <span className="mt-5 block text-xl font-semibold">{SOURCE_COPY[source].title}</span>
                          <span className={cn('mt-2 block text-sm leading-relaxed', selected ? 'text-white/75' : 'text-muted-foreground')}>{SOURCE_COPY[source].description}</span>
                          {disabledReason && <span className="mt-3 block text-sm font-medium text-foreground">{disabledReason}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {stockSelector}
                </section>
              )}

              {step === 1 && (
                <section className="space-y-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Selecione a planilha</h2><div className="mt-2 flex items-center gap-2 text-muted-foreground"><span>Origem:</span>{assistant.source === 'auvo' ? <AuvoIdentity selected={false} /> : <strong className="text-foreground">{SOURCE_COPY[assistant.source].title}</strong>}</div></div>
                    {assistant.downloadTemplate && assistant.source === 'dominex' && <Button variant="outline" onClick={() => void assistant.downloadTemplate?.()}><FileDown className="mr-2 h-4 w-4" />Baixar modelo</Button>}
                  </div>
                  {sourceLocked && stockSelector}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="sr-only"
                    aria-label="Selecionar planilha Excel"
                    onChange={(event) => void selectFile(event.target.files?.[0])}
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    aria-disabled={!canSelectFile}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFilePicker(); } }}
                    onClick={openFilePicker}
                    onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    className={cn('flex min-h-64 flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black', canSelectFile ? 'cursor-pointer' : 'cursor-not-allowed opacity-50', dragActive ? 'border-black bg-black/5' : 'border-border hover:border-foreground/40')}
                  >
                    {assistant.phase === 'loading' ? <Loader2 className="h-10 w-10 animate-spin" /> : <UploadCloud className="h-10 w-10" />}
                    <p className="mt-5 text-xl font-semibold">{assistant.phase === 'loading' ? 'Conferindo o arquivo…' : 'Arraste a planilha ou escolha no dispositivo'}</p>
                    <p className="mt-2 text-sm text-muted-foreground">Formatos aceitos: .xlsx e .xls</p>
                  </div>
                  {assistant.phase === 'loading' && <Progress value={60} aria-label="Conferindo planilha" className="h-2 [&>div]:bg-black" />}
                  {assistant.preview && (
                    <div className="flex items-center gap-3 rounded-2xl bg-muted p-4" aria-live="polite">
                      <FileCheck2 className="h-6 w-6 shrink-0" />
                      <div className="min-w-0 flex-1"><p className="truncate font-semibold">{assistant.preview.fileName}</p><p className="text-sm text-muted-foreground">{formatFileSize(assistant.preview.fileSize)}</p></div>
                      <Badge className="bg-black text-white hover:bg-black">Selecionado</Badge>
                    </div>
                  )}
                  {assistant.phase === 'error' && (
                    <Alert variant="destructive"><AlertCircle /><AlertTitle>Não foi possível conferir a planilha</AlertTitle><AlertDescription><p>{assistant.error}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={retryPrepare}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button><Button size="sm" variant="outline" onClick={openFilePicker}>Escolher outro arquivo</Button></div><p className="mt-3">Sua seleção ficou preservada para recuperação. Nenhum dado foi alterado.</p></AlertDescription></Alert>
                  )}
                </section>
              )}

              {step === 2 && assistant.preview && (
                <section className="space-y-7">
                  <div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Confira antes de importar</h2><p className="mt-2 text-muted-foreground">Revise o arquivo e resolva os conflitos indicados.</p></div>
                  <dl className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-muted p-4"><dt className="text-sm text-muted-foreground">Arquivo</dt><dd className="mt-1 break-all font-semibold">{assistant.preview.fileName}</dd></div>
                    <div className="rounded-2xl bg-muted p-4"><dt className="text-sm text-muted-foreground">Linhas reconhecidas</dt><dd className="mt-1 text-2xl font-semibold">{assistant.preview.totalRows ?? '—'}</dd></div>
                    <div className="rounded-2xl bg-muted p-4"><dt className="text-sm text-muted-foreground">Prontas para importar</dt><dd className="mt-1 text-2xl font-semibold">{assistant.preview.validRows ?? '—'}</dd></div>
                  </dl>
                  {assistant.preview.counts && <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl border p-4"><dt className="text-sm text-muted-foreground">Novos</dt><dd className="mt-1 text-2xl font-semibold">{assistant.preview.counts.create}</dd></div><div className="rounded-2xl border p-4"><dt className="text-sm text-muted-foreground">Atualizações</dt><dd className="mt-1 text-2xl font-semibold">{assistant.preview.counts.update}</dd></div><div className="rounded-2xl border p-4"><dt className="text-sm text-muted-foreground">Conflitos</dt><dd className="mt-1 text-2xl font-semibold">{assistant.preview.counts.conflict}</dd></div><div className="rounded-2xl border p-4"><dt className="text-sm text-muted-foreground">Bloqueados</dt><dd className="mt-1 text-2xl font-semibold">{assistant.preview.counts.blocked}</dd></div></dl>}
                  {assistant.preview.issues.map((issue) => (
                    <Alert key={issue.id} variant={issue.severity === 'error' ? 'destructive' : issue.severity === 'conflict' ? 'warning' : 'info'}>
                      {issue.severity === 'conflict' ? <TriangleAlert /> : <AlertCircle />}
                      <AlertTitle>{issue.title}{issue.row ? ` · linha ${issue.row}` : ''}</AlertTitle>
                      <AlertDescription>{issue.description}</AlertDescription>
                    </Alert>
                  ))}
                  {assistant.preview.rows?.length ? (
                    <div className="overflow-hidden rounded-2xl border">
                      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted"><tr>{assistant.preview.columns?.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 text-left font-semibold">{column}</th>)}</tr></thead><tbody>{assistant.preview.rows.slice(0, 5).map((row, index) => <tr key={index} className="border-t">{assistant.preview.columns?.map((column) => <td key={column} className="max-w-64 break-words px-4 py-3">{row[column] ?? '—'}</td>)}</tr>)}</tbody></table></div>
                    </div>
                  ) : null}
                  {assistant.preview.blockedReason && <p className="flex gap-2 rounded-2xl border p-4 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 shrink-0 text-foreground" />{assistant.preview.blockedReason} Nenhum cadastro será alterado enquanto essa validação estiver pendente.</p>}
                  {assistant.phase === 'recovery' && <Alert variant="destructive"><AlertCircle /><AlertTitle>A importação não foi concluída</AlertTitle><AlertDescription><p>{assistant.error}</p><p className="mt-2">O arquivo e as escolhas foram preservados. Você pode tentar novamente sem recomeçar.</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void assistant.execute()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></AlertDescription></Alert>}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </FullscreenWizard>
  );
}
