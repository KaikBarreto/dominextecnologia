import { useState } from 'react';
import { DomiLinkBrand } from './DomiLinkBrand';
import { Barcode, ChevronDown, CircleAlert, Loader2, Printer, Scale, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDomiLink } from '@/hooks/useDomiLink';
import { useToast } from '@/hooks/use-toast';
import type { DomiLinkDevice } from '@/lib/domilink/types';

function DeviceRow({ device, icon, action, actionLabel, busy, secondaryAction }: {
  device: DomiLinkDevice;
  icon: React.ReactNode;
  action: () => void;
  actionLabel: string;
  busy: boolean;
  secondaryAction?: () => void;
}) {
  return <div className="flex flex-col gap-3 border-t py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-center gap-3">{icon}<div className="min-w-0"><p className="break-words text-sm font-medium">{device.label}</p><Badge className="mt-1" variant={device.online ? 'success' : 'outline'}>{device.online ? 'Pronto' : 'Desconectado'}</Badge></div></div>
    <div className="flex flex-wrap gap-2">{secondaryAction && <Button type="button" variant="outline" disabled={!device.online || busy} onClick={secondaryAction}>Zerar balança</Button>}<Button type="button" variant="outline" className="w-full sm:w-auto" disabled={!device.online || busy} onClick={action}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{actionLabel}</Button></div>
  </div>;
}

export function DomiLinkSettingsCard() {
  const domiLink = useDomiLink();
  return <DomiLinkSettingsForm key={domiLink.scopeKey} domiLink={domiLink} />;
}

function DomiLinkSettingsForm({ domiLink }: { domiLink: ReturnType<typeof useDomiLink> }) {
  const { toast } = useToast();
  const [pairCode, setPairCode] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const receiptPrinters = domiLink.devices.printers.filter(device => device.capabilities.print_formats?.includes('pdf'));

  async function pair() {
    try {
      await domiLink.pair(pairCode);
      setPairCode('');
      toast({ title: 'DomiLink conectado neste dispositivo' });
    } catch { /* mensagem segura já é exibida no card */ }
  }

  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast({ title: label });
    } catch (error) {
      toast({ title: 'Não foi possível concluir o teste', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    }
  }

  return <section className="space-y-4" aria-labelledby="domilink-title">
    <div className="flex items-start justify-between gap-4">
      <DomiLinkBrand monochrome={false} caption={<h2 id="domilink-title" className="domilink-brand-caption">Equipamentos deste computador</h2>} />
      <Switch aria-label="Ativar DomiLink neste computador" checked={domiLink.enabled} onCheckedChange={domiLink.setEnabled} />
    </div>

    <p className="text-sm text-muted-foreground">Conecte a impressora, a balança e o leitor deste computador.</p>

    <p className="text-sm text-muted-foreground">A instalação é manual por enquanto. Depois de configurar o DomiLink neste computador, abra o programa e informe o código abaixo para conectar.</p>

    {!domiLink.enabled && <p className="mt-4 text-sm text-muted-foreground">Desligado neste computador. Os equipamentos podem ser conectados quando você precisar.</p>}

    {domiLink.enabled && <div className="mt-4 border-t pt-4">
      {domiLink.status === 'checking' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Procurando o DomiLink neste computador…</div>}

      {(domiLink.status === 'offline' || domiLink.status === 'error') && <div className="space-y-3"><div className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div><p className="text-sm font-medium">DomiLink não conectado</p><p className="text-sm text-muted-foreground">{domiLink.error}</p></div></div><Button type="button" variant="outline" onClick={() => void domiLink.retry()}>Tentar novamente</Button></div>}

      {domiLink.status === 'pairing' && <div className="space-y-4"><div><p className="text-sm font-medium">Digite o código mostrado no DomiLink</p><p className="text-xs text-muted-foreground">O código tem 6 números, vale uma vez e não é a senha da sua conta.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="w-full sm:max-w-48"><Label htmlFor="domilink-code" className="sr-only">Código do DomiLink</Label><Input id="domilink-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className="font-mono text-lg tracking-[0.25em]" value={pairCode} onKeyDown={event => { if (event.key === 'Enter' && !event.repeat && pairCode.length === 6 && domiLink.busyAction !== 'pair') { event.preventDefault(); event.stopPropagation(); void pair(); } }} onChange={(event) => setPairCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></div><Button type="button" disabled={pairCode.length !== 6 || domiLink.busyAction === 'pair'} onClick={() => void pair()}>{domiLink.busyAction === 'pair' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Parear</Button></div>{domiLink.error && <p role="alert" className="text-sm text-destructive">{domiLink.error}</p>}</div>}

      {domiLink.status === 'connected' && domiLink.profile && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Badge variant="success">Pronto</Badge><span className="text-sm font-medium">Equipamentos conectados</span></div><p className="mt-1 text-xs text-muted-foreground">Somente neste computador · comprovantes não fiscais</p></div><Button type="button" variant="outline" disabled={domiLink.busyAction === 'disconnect'} onClick={() => void domiLink.disconnect()}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button></div>

        <dl className="grid grid-cols-3 divide-x border-y py-3 text-center"><div><dd className="text-xl font-bold tabular-nums">{domiLink.devices.printers.length}</dd><dt className="text-xs text-muted-foreground">Impressoras</dt></div><div><dd className="text-xl font-bold tabular-nums">{domiLink.devices.scales.length}</dd><dt className="text-xs text-muted-foreground">Balanças</dt></div><div><dd className="text-xl font-bold tabular-nums">{domiLink.devices.barcodes.length}</dd><dt className="text-xs text-muted-foreground">Leitores</dt></div></dl>
        <div className="space-y-2"><Label htmlFor="domilink-receipt-printer">Destino dos comprovantes neste computador</Label><Select value={domiLink.receiptPrinterId ?? 'destination:pdf'} onValueChange={value => domiLink.setReceiptPrinter(value === 'destination:pdf' ? null : value)}><SelectTrigger id="domilink-receipt-printer"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="destination:pdf">Abrir PDF no navegador</SelectItem>{domiLink.receiptPrinterId && !receiptPrinters.some(device => device.id === domiLink.receiptPrinterId) && <SelectItem value={domiLink.receiptPrinterId} disabled>Impressora indisponível</SelectItem>}{receiptPrinters.map(device => <SelectItem key={device.id} value={device.id} disabled={!device.online}>{device.label}{!device.online ? ' · desconectada' : ''}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Ao gerar um comprovante, use a impressora escolhida ou abra o PDF. A escolha vale para sua conta nesta empresa. Para térmicas, configure uma fila de impressão do sistema no DomiLink.</p></div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-medium">Equipamentos e testes<ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></CollapsibleTrigger><CollapsibleContent className="px-1 pt-2">
          {domiLink.profile.devices.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhum equipamento configurado no DomiLink.</p>}
          {domiLink.devices.printers.map((device) => <DeviceRow key={device.id} device={device} icon={<Printer className="h-5 w-5 shrink-0 text-muted-foreground" />} actionLabel="Imprimir teste" busy={domiLink.busyAction === `print:${device.id}`} action={() => void run('Teste enviado à impressora', () => domiLink.testPrint(device))} />)}
          {domiLink.devices.scales.map((device) => <DeviceRow key={device.id} device={device} icon={<Scale className="h-5 w-5 shrink-0 text-muted-foreground" />} actionLabel={domiLink.lastScaleReading ? `${domiLink.lastScaleReading.weight_kg} kg` : 'Ler peso'} busy={domiLink.busyAction === `scale:${device.id}` || domiLink.busyAction === `tare:${device.id}`} action={() => void run('Peso lido com sucesso', () => domiLink.readScale(device.id))} secondaryAction={device.capabilities.actions?.includes('tare') ? () => void run('Tara enviada à balança', () => domiLink.tareScale(device.id)) : undefined} />)}
          {domiLink.devices.barcodes.map((device) => <DeviceRow key={device.id} device={device} icon={<Barcode className="h-5 w-5 shrink-0 text-muted-foreground" />} actionLabel={domiLink.lastBarcode ?? 'Ler código'} busy={domiLink.busyAction === `barcode:${device.id}`} action={() => void run('Código lido com sucesso', () => domiLink.readBarcode(device.id))} />)}
        </CollapsibleContent></Collapsible>
        <p className="text-xs text-muted-foreground">Leitor USB/HID funciona como teclado. Câmera e QR Code usam a câmera do celular/tablet e não dependem do DomiLink. Emissão fiscal não está incluída.</p>
      </div>}
    </div>}
  </section>;
}
