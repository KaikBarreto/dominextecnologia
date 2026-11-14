import { useEffect, useState } from 'react';
import { ChevronDown, FileText, MonitorSmartphone, Printer, Save, Settings, Store } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { PdvReceiptPreview } from '@/components/pdv/receipt/PdvReceiptPreview';
import { PDV_RECEIPT_PREVIEW_FIXTURE } from '@/lib/pdv/receipt/fixture';
import { readDeviceReceiptFormat, writeDeviceReceiptFormat } from '@/lib/pdv/receipt/devicePreference';
import type { PdvReceiptFormat } from '@/lib/pdv/receipt/model';
import { cn } from '@/lib/utils';
import {
  usePdvWorkflowSettings,
  type PdvFulfillmentMode,
  type PdvWorkflowMode,
} from '@/hooks/usePdvCounterFlow';
import { useAuth } from '@/contexts/AuthContext';
import { DomiLinkSettingsCard } from '@/components/pdv/domilink/DomiLinkSettingsCard';
import { PdvTerminalSettings } from '@/components/pdv/settings/PdvTerminalSettings';
import { PdvCashAccountSettings } from '@/components/pdv/settings/PdvCashAccountSettings';

/** Configuração simples, por empresa, do comprovante não fiscal do PDV. */
export default function PdvSettings() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();
  const canManageWorkflow = isAdminOrGestor() || (hasPermissionRecord && hasPermission('fn:manage_pdv_settings'));
  const settings = usePdvReceiptSettings();
  const workflow = usePdvWorkflowSettings();
  const [pdvMode, setPdvMode] = useState<PdvWorkflowMode>('simples');
  const [fulfillmentMode, setFulfillmentMode] = useState<PdvFulfillmentMode>('dispatch');
  const [format, setFormat] = useState<PdvReceiptFormat>('80mm');
  const [autoPrint, setAutoPrint] = useState(false);
  const [copies, setCopies] = useState<1 | 2 | 3>(1);
  const [deviceFormat, setDeviceFormat] = useState<PdvReceiptFormat | 'company'>('company');

  useEffect(() => {
    if (!settings.data) return;
    setFormat(settings.data.defaultFormat);
    setAutoPrint(settings.data.autoPrint);
    setCopies(settings.data.copies);
  }, [settings.data]);

  useEffect(() => {
    if (!workflow.data) return;
    setPdvMode(workflow.data.pdvMode);
    setFulfillmentMode(workflow.data.fulfillmentMode);
  }, [workflow.data]);

  useEffect(() => { setDeviceFormat(readDeviceReceiptFormat() ?? 'company'); }, []);

  async function saveReceipt() {
    try {
      await settings.save.mutateAsync({ defaultFormat: format, autoPrint, copies });
      writeDeviceReceiptFormat(deviceFormat === 'company' ? null : deviceFormat);
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

  const directSaleSelected = pdvMode === 'simples';
  const cashierDeliverySelected = pdvMode === 'balcao' && fulfillmentMode === 'cashier';
  const dispatchSelected = pdvMode === 'balcao' && fulfillmentMode === 'dispatch';
  const workflowCardClass = (selected: boolean) => cn(
    'min-h-28 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    selected
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-background hover:bg-muted',
  );
  const workflowDescriptionClass = (selected: boolean) => cn(
    'mt-1 block text-sm',
    selected ? 'text-primary-foreground/80' : 'text-muted-foreground',
  );

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24 space-y-4')} data-pdv-ui>
      <PageHeader title="Caixas e equipamentos" subtitle="Escolha como a loja atende, imprime e conecta os equipamentos de cada caixa." icon={Settings} actions={<Button onClick={() => void saveReceipt()} disabled={settings.save.isPending || settings.isLoading || settings.isError}><Save className="mr-2 h-4 w-4" />{settings.save.isPending ? 'Salvando...' : 'Salvar comprovante'}</Button>} />

      {settings.isError && <NoticeBanner variant="warning" onClick={() => void settings.refetch()} action="Tentar novamente">Não foi possível carregar a configuração da empresa. Salvar ficará bloqueado até recarregar.</NoticeBanner>}
      {workflow.isError && <NoticeBanner variant="warning" onClick={() => void workflow.refetch()} action="Tentar novamente">Não foi possível carregar o modo de operação. Salvar ficará bloqueado até recarregar.</NoticeBanner>}
      {settings.isLoading || workflow.isLoading ? <Skeleton className="h-72 w-full rounded-xl" /> : <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="space-y-8">
          <PdvCashAccountSettings canManage={canManageWorkflow} />
          <PdvTerminalSettings canManage={canManageWorkflow} />

          <div>
            <div className="mb-4 flex items-start gap-3"><div className="rounded-lg bg-primary p-2 text-primary-foreground"><Store className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold">Fluxo de atendimento</h2><p className="text-sm text-muted-foreground">Escolha somente as etapas que sua loja realmente usa.</p></div></div>
            <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Fluxo de atendimento do PDV">
              <button type="button" role="radio" aria-checked={directSaleSelected} disabled={!canManageWorkflow} onClick={() => setPdvMode('simples')} className={workflowCardClass(directSaleSelected)}><span className="block font-semibold">Venda direta</span><span className={workflowDescriptionClass(directSaleSelected)}>Venda, pagamento e entrega acontecem no mesmo atendimento.</span></button>
              <button type="button" role="radio" aria-checked={cashierDeliverySelected} disabled={!canManageWorkflow} onClick={() => { setPdvMode('balcao'); setFulfillmentMode('cashier'); }} className={workflowCardClass(cashierDeliverySelected)}><span className="block font-semibold">Balcão + caixa</span><span className={workflowDescriptionClass(cashierDeliverySelected)}>O balcão monta; o caixa recebe ou aprova o fiado e entrega na hora.</span></button>
              <button type="button" role="radio" aria-checked={dispatchSelected} disabled={!canManageWorkflow} onClick={() => { setPdvMode('balcao'); setFulfillmentMode('dispatch'); }} className={workflowCardClass(dispatchSelected)}><span className="block font-semibold">Balcão + caixa + retirada</span><span className={workflowDescriptionClass(dispatchSelected)}>O balcão monta; o caixa libera; a retirada entrega depois.</span></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{canManageWorkflow ? 'A mudança vale para todos os caixas.' : 'Seu perfil pode consultar, mas não alterar o fluxo.'}</p><Button type="button" variant="outline" onClick={() => void saveWorkflow()} disabled={!canManageWorkflow || workflow.save.isPending || workflow.isError}>{workflow.save.isPending ? 'Salvando...' : 'Salvar fluxo'}</Button></div>
          </div>

          <div className="border-t pt-7">
          <div>
            <div className="mb-4 flex items-start gap-3"><div className="rounded-lg bg-primary p-2 text-primary-foreground"><FileText className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold">Formato padrão</h2><p className="text-sm text-muted-foreground">A4 usa folha comum. 58 e 80 mm servem para impressoras térmicas.</p></div></div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Formato padrão do comprovante">
              {(['a4','58mm','80mm'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={format === value} onClick={() => setFormat(value)} className={cn('min-h-12 rounded-lg border px-3 text-sm font-semibold transition-colors',format === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted')}>{value === 'a4' ? 'A4' : value.replace('mm',' mm')}</button>)}
            </div>
            </div>
          </div>

          <div className="border-t pt-7">
            <div className="flex items-center justify-between gap-4"><div><Label htmlFor="receipt-auto-print" className="text-base font-semibold">Imprimir ao finalizar</Label><p className="mt-1 text-sm text-muted-foreground">O navegador ainda pedirá confirmação quando necessário.</p></div><Switch id="receipt-auto-print" checked={autoPrint} onCheckedChange={setAutoPrint} /></div>
            <div className="mt-5 max-w-xs"><Label htmlFor="receipt-copies">Número de vias</Label><Select value={String(copies)} onValueChange={(value) => setCopies(Number(value) as 1 | 2 | 3)}><SelectTrigger id="receipt-copies" className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1 via</SelectItem><SelectItem value="2">2 vias</SelectItem><SelectItem value="3">3 vias</SelectItem></SelectContent></Select></div>
          </div>

          <Collapsible className="border-t pt-7">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left"><span className="flex items-center gap-3"><MonitorSmartphone className="h-5 w-5 text-muted-foreground" /><span><span className="block font-semibold">Preferência deste dispositivo</span><span className="block text-sm font-normal text-muted-foreground">Opcional. Não muda os outros caixas.</span></span></span><ChevronDown className="h-4 w-4" /></CollapsibleTrigger>
            <CollapsibleContent className="pt-4"><Label htmlFor="device-format">Formato neste aparelho</Label><Select value={deviceFormat} onValueChange={(value) => setDeviceFormat(value as PdvReceiptFormat | 'company')}><SelectTrigger id="device-format" className="mt-2 max-w-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="company">Usar padrão da empresa</SelectItem><SelectItem value="a4">A4</SelectItem><SelectItem value="58mm">58 mm</SelectItem><SelectItem value="80mm">80 mm</SelectItem></SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">Fica salvo somente neste navegador.</p></CollapsibleContent>
          </Collapsible>

          <DomiLinkSettingsCard />

          <div className="flex items-start gap-3 rounded-xl border bg-background p-4"><Printer className="mt-0.5 h-5 w-5 text-muted-foreground" /><p className="text-sm text-muted-foreground"><strong className="text-foreground">Sempre não fiscal.</strong> Este comprovante não substitui nota fiscal. Reimprimir não altera pagamento, estoque ou saldo.</p></div>
        </section>

        <aside className="rounded-xl border bg-background p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Prévia</h2><p className="text-xs text-muted-foreground">Dados fictícios</p></div><span className="rounded-full border px-2 py-1 text-xs font-semibold">{format === 'a4' ? 'A4' : format.replace('mm',' mm')}</span></div><div className="max-h-[650px] overflow-auto rounded-lg bg-zinc-200 p-4"><PdvReceiptPreview snapshot={PDV_RECEIPT_PREVIEW_FIXTURE} format={format} /></div></aside>
      </div>}
    </div>
  );
}
