import '@/components/pdv/PdvWorkspace.css';
import { useEffect, useState } from 'react';
import { ChevronDown, FileText, MonitorSmartphone, Printer, Save, Settings, Store } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PdvPageSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { PdvReceiptPreview } from '@/components/pdv/receipt/PdvReceiptPreview';
import { getPdvReceiptPreviewFixture } from '@/lib/pdv/receipt/fixture';
import { readDeviceReceiptFormat, writeDeviceReceiptFormat } from '@/lib/pdv/receipt/devicePreference';
import type { PdvReceiptFormat } from '@/lib/pdv/receipt/model';
import { resolvePdvReceiptStages, type PdvReceiptStage, type StageReceiptSettings, type StageReceiptPolicy } from '@/lib/pdv/receipt/stagePolicy';
import { cn } from '@/lib/utils';
import {
  usePdvWorkflowSettings,
  type PdvFulfillmentMode,
  type PdvWorkflowMode,
} from '@/hooks/usePdvCounterFlow';
import { useAuth } from '@/contexts/AuthContext';
import { DomiLinkDeviceShortcut } from '@/components/settings/domilink/DomiLinkDeviceShortcut';
import { PdvWorkflowIllustration } from '@/components/pdv/settings/PdvWorkflowIllustration';
import { PdvStoreStockSettings } from '@/components/pdv/settings/PdvStoreStockSettings';
import { PdvTerminalSettings } from '@/components/pdv/settings/PdvTerminalSettings';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import '@/components/pdv/pdv-preview-sale.css';
import '@/components/pdv/pdv-preview-purchase.css';
import { PdvCashAccountSettings } from '@/components/pdv/settings/PdvCashAccountSettings';

/** Configuração simples, por empresa, do comprovante não fiscal do PDV. */
export default function PdvSettings() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();
  const canManageWorkflow = isAdminOrGestor() || (hasPermissionRecord && hasPermission('fn:manage_pdv_settings'));
  const settings = usePdvReceiptSettings();
  const workflow = usePdvWorkflowSettings();
  const [tab, setTab] = useState('operation');
  const [pdvMode, setPdvMode] = useState<PdvWorkflowMode>('simples');
  const [fulfillmentMode, setFulfillmentMode] = useState<PdvFulfillmentMode>('dispatch');
  const [stages, setStages] = useState<StageReceiptSettings>(() => resolvePdvReceiptStages());
  const [previewStage, setPreviewStage] = useState<PdvReceiptStage>('sale');
  const [deviceFormat, setDeviceFormat] = useState<PdvReceiptFormat | 'company'>('company');

  useEffect(() => {
    if (!settings.data) return;
    setStages(settings.data.stages);
  }, [settings.data]);

  useEffect(() => {
    if (!workflow.data) return;
    setPdvMode(workflow.data.pdvMode);
    setFulfillmentMode(workflow.data.fulfillmentMode);
  }, [workflow.data]);

  useEffect(() => { setDeviceFormat(readDeviceReceiptFormat() ?? 'company'); }, []);

  async function saveReceipt() {
    try {
      await settings.save.mutateAsync({ defaultFormat: stages.sale.format, autoPrint: stages.sale.autoPrint, copies: stages.sale.copies, stages });
      toast({ title: 'Configurações do comprovante salvas' });
    } catch (error) {
      toast({ title: 'Não foi possível salvar', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    }
  }

  async function saveWorkflow() {
    try {
      await workflow.save.mutateAsync({ pdvMode, fulfillmentMode });
      toast({ title: 'Fluxo de atendimento salvo' });
    } catch (error) {
      toast({ title: 'Não foi possível salvar o fluxo', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    }
  }

  const separatePickup = workflow.data?.pdvMode === 'balcao' && workflow.data.fulfillmentMode === 'dispatch';
  const usesCounter = workflow.data?.pdvMode === 'balcao';
  const receiptStages = [
    ...(usesCounter ? [{ stage: 'budget' as const, title: 'Orçamento', description: 'Ao enviar o orçamento ao caixa.' }] : []),
    { stage: 'sale' as const, title: 'Pedido', description: 'Ao receber o pagamento ou aprovar o fiado.' },
    ...(separatePickup ? [{ stage: 'delivery' as const, title: 'Retirada', description: 'Ao confirmar uma entrega na retirada, inclusive parcial.' }] : []),
  ];
  const activePreviewStage = receiptStages.some(item => item.stage === previewStage) ? previewStage : 'sale';
  const previewKind = activePreviewStage === 'sale' && separatePickup ? 'pickup' : activePreviewStage;
  const previewFormat = deviceFormat === 'company' ? stages[activePreviewStage].format : deviceFormat;
  function updateStage(stage: PdvReceiptStage, patch: Partial<StageReceiptPolicy>) {
    setStages(current => ({ ...current, [stage]: { ...current[stage], ...patch } }));
  }

  const directSaleSelected = pdvMode === 'simples';
  const cashierDeliverySelected = pdvMode === 'balcao' && fulfillmentMode === 'cashier';
  const dispatchSelected = pdvMode === 'balcao' && fulfillmentMode === 'dispatch';
  const workflowCardClass = (selected: boolean) => cn(
    'flex min-h-[254px] flex-col rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:p-4',
    selected
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card hover:bg-muted',
  );
  const workflowDescriptionClass = (selected: boolean) => cn(
    'mt-1 block text-sm',
    selected ? 'text-primary-foreground/80' : 'text-muted-foreground',
  );

  return (
    <div className={cn('pdv-workspace pdv-preview-page space-y-6', isMobile && 'pb-24 space-y-4')} data-pdv-ui data-testid="pdv-settings-workspace">
      <PageHeader title="Configurações do PDV (Loja)" subtitle="Escolha como sua loja trabalha." icon={Settings} actions={canManageWorkflow ? (tab === 'receipts' ? <Button onClick={() => void saveReceipt()} disabled={settings.save.isPending || settings.isLoading || settings.isError}><Save className="h-4 w-4" />{settings.save.isPending ? 'Salvando...' : 'Salvar comprovante'}</Button> : undefined) : undefined} />
      <MobilePillTabs variant="underline" level="screen" activeTab={tab} onTabChange={setTab} tabs={[{ value: 'operation', label: 'Operação' }, { value: 'cash', label: 'Caixas e dinheiro' }, { value: 'receipts', label: 'Comprovantes' }, { value: 'devices', label: 'Equipamentos' }]} />
      {settings.isError && <NoticeBanner variant="warning" onClick={() => void settings.refetch()} action="Tentar novamente">Não foi possível carregar a configuração da empresa. Salvar ficará bloqueado até recarregar.</NoticeBanner>}
      {workflow.isError && <NoticeBanner variant="warning" onClick={() => void workflow.refetch()} action="Tentar novamente">Não foi possível carregar o modo de operação. Salvar ficará bloqueado até recarregar.</NoticeBanner>}
      {settings.isLoading || workflow.isLoading ? <PdvPageSkeleton variant="settings" settingsSection={tab} label="Carregando configurações do PDV" /> : <>
        {tab === 'operation' && <section className="max-w-5xl space-y-7 rounded-lg border border-border bg-card p-5 sm:p-7" aria-label="Operação do PDV">          <div>
            <div className="mb-4 flex items-start gap-3"><div className="rounded-lg bg-primary p-2 text-primary-foreground"><Store className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold">Fluxo de atendimento</h2><p className="text-sm text-muted-foreground">Escolha somente as etapas que sua loja realmente usa.</p></div></div>
            <div className="grid gap-3 xl:grid-cols-3" role="radiogroup" aria-label="Fluxo de atendimento do PDV">
              <button type="button" role="radio" aria-checked={directSaleSelected} disabled={!canManageWorkflow} onClick={() => setPdvMode('simples')} className={workflowCardClass(directSaleSelected)}><span className="block font-semibold">Venda direta</span><PdvWorkflowIllustration mode="direct" /><span className={workflowDescriptionClass(directSaleSelected)}>Venda, pagamento e entrega acontecem no mesmo atendimento.</span></button>
              <button type="button" role="radio" aria-checked={cashierDeliverySelected} disabled={!canManageWorkflow} onClick={() => { setPdvMode('balcao'); setFulfillmentMode('cashier'); }} className={workflowCardClass(cashierDeliverySelected)}><span className="block font-semibold">Balcão + caixa</span><PdvWorkflowIllustration mode="cashier" /><span className={workflowDescriptionClass(cashierDeliverySelected)}>O balcão monta; o caixa recebe ou aprova o fiado e entrega na hora.</span></button>
              <button type="button" role="radio" aria-checked={dispatchSelected} disabled={!canManageWorkflow} onClick={() => { setPdvMode('balcao'); setFulfillmentMode('dispatch'); }} className={workflowCardClass(dispatchSelected)}><span className="block font-semibold">Balcão + caixa + retirada</span><PdvWorkflowIllustration mode="dispatch" /><span className={workflowDescriptionClass(dispatchSelected)}>O balcão monta; o caixa libera; a retirada entrega depois.</span></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{canManageWorkflow ? 'A mudança vale para todos os caixas.' : 'Seu perfil pode consultar, mas não alterar o fluxo.'}</p><Button type="button" variant="outline" onClick={() => void saveWorkflow()} disabled={!canManageWorkflow || workflow.save.isPending || workflow.isError}>{workflow.save.isPending ? 'Salvando...' : 'Salvar fluxo'}</Button></div>
          </div>

          <PdvStoreStockSettings canManage={canManageWorkflow} />
</section>}
        {tab === 'cash' && <section className="max-w-5xl space-y-7 rounded-lg border border-border bg-card p-5 sm:p-7" aria-label="Caixas e dinheiro"><PdvCashAccountSettings canManage={canManageWorkflow} /><PdvTerminalSettings canManage={canManageWorkflow} /></section>}
        {tab === 'receipts' && <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(300px,440px)]">
          <section className="min-w-0 space-y-6 rounded-lg border border-border bg-card p-5 sm:p-7" aria-label="Comprovantes por etapa">
            <div className="flex items-start gap-3"><FileText className="mt-1 h-5 w-5 shrink-0" /><div><h2 className="text-lg font-semibold">Comprovantes por etapa</h2><p className="mt-1 text-sm text-muted-foreground">Escolha quando abrir cada documento, o formato e o número de vias. Você também pode abrir manualmente depois.</p></div></div>
            {receiptStages.map(({ stage, title, description }) => <section key={stage} className="space-y-4 border-t pt-5" aria-labelledby={`receipt-stage-${stage}`}>
              <div><h3 id={`receipt-stage-${stage}`} className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div>
              <div className="flex items-center justify-between gap-4"><Label htmlFor={`receipt-auto-${stage}`} className="leading-snug">Abrir comprovante automaticamente</Label><Switch id={`receipt-auto-${stage}`} checked={stages[stage].autoPrint} onCheckedChange={autoPrint => updateStage(stage, { autoPrint })} disabled={!canManageWorkflow} /></div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(100px,0.65fr)] gap-3">
                <div><Label htmlFor={`receipt-format-${stage}`}>Formato</Label><Select value={stages[stage].format} disabled={!canManageWorkflow} onValueChange={format => updateStage(stage, { format: format as PdvReceiptFormat })}><SelectTrigger id={`receipt-format-${stage}`} className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="a4">A4 · folha comum</SelectItem><SelectItem value="58mm">58 mm · térmica</SelectItem><SelectItem value="80mm">80 mm · térmica</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor={`receipt-copies-${stage}`}>Vias</Label><Select value={String(stages[stage].copies)} disabled={!canManageWorkflow} onValueChange={copies => updateStage(stage, { copies: Number(copies) as 1 | 2 | 3 })}><SelectTrigger id={`receipt-copies-${stage}`} className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1 via</SelectItem><SelectItem value="2">2 vias</SelectItem><SelectItem value="3">3 vias</SelectItem></SelectContent></Select></div>
              </div>
            </section>)}
            {!separatePickup && <p className="text-sm text-muted-foreground">Neste fluxo, a entrega acontece junto com o pagamento. O comprovante do pedido acompanha esse atendimento; não há uma etapa de retirada separada.</p>}
            <p className="text-xs text-muted-foreground">As vias ficam no mesmo PDF. O navegador pode pedir autorização para abrir o documento; imprimir depende da confirmação na janela de impressão.</p>
            <Collapsible className="border-t pt-5">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left"><span className="flex items-center gap-3"><MonitorSmartphone className="h-5 w-5 shrink-0 text-muted-foreground" /><span><span className="block font-semibold">Formato neste dispositivo</span><span className="block text-sm font-normal text-muted-foreground">Opcional. Vale para todos os comprovantes deste aparelho.</span></span></span><ChevronDown className="h-4 w-4 shrink-0" /></CollapsibleTrigger>
              <CollapsibleContent className="pt-4"><Label htmlFor="device-format">Formato neste aparelho</Label><Select value={deviceFormat} onValueChange={(value) => { const next = value as PdvReceiptFormat | 'company'; setDeviceFormat(next); writeDeviceReceiptFormat(next === 'company' ? null : next); }}><SelectTrigger id="device-format" className="mt-2 max-w-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="company">Usar formato de cada etapa</SelectItem><SelectItem value="a4">A4</SelectItem><SelectItem value="58mm">58 mm</SelectItem><SelectItem value="80mm">80 mm</SelectItem></SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">Fica salvo automaticamente somente neste navegador.</p></CollapsibleContent>
            </Collapsible>
            <p className="flex items-start gap-3 text-sm text-muted-foreground"><Printer className="mt-0.5 h-5 w-5 shrink-0" /><span><strong className="text-foreground">Comprovante não fiscal.</strong> Não substitui nota fiscal. Reimprimir mantém o pedido, o estoque e o pagamento.</span></p>
          </section>
          <aside className="min-w-0 rounded-xl border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Prévia do documento</h2><p className="text-xs text-muted-foreground">Dados fictícios · {stages[activePreviewStage].copies} {stages[activePreviewStage].copies === 1 ? 'via' : 'vias'} no PDF</p></div><span className="shrink-0 rounded-full border px-2 py-1 text-xs font-semibold">{previewFormat === 'a4' ? 'A4' : previewFormat.replace('mm',' mm')}</span></div>
            <Label htmlFor="receipt-preview-stage">Etapa</Label><Select value={activePreviewStage} onValueChange={value => setPreviewStage(value as PdvReceiptStage)}><SelectTrigger id="receipt-preview-stage" className="mb-3 mt-2"><SelectValue /></SelectTrigger><SelectContent>{receiptStages.map(({ stage, title }) => <SelectItem key={stage} value={stage}>{title}</SelectItem>)}</SelectContent></Select>
            {deviceFormat !== 'company' && <p className="mb-3 text-xs text-muted-foreground">Prévia no formato escolhido para este aparelho.</p>}
            <div className="max-h-[650px] overflow-auto rounded-lg bg-muted p-4"><PdvReceiptPreview snapshot={getPdvReceiptPreviewFixture(previewKind)} format={previewFormat} /></div>
          </aside>
        </div>}
        {tab === 'devices' && <section className="max-w-5xl rounded-lg border border-border bg-card p-5 sm:p-7" aria-label="Equipamentos"><DomiLinkDeviceShortcut /></section>}
      </>}
    </div>
  );
}
