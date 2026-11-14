import { useState } from 'react';
import { Barcode, ChevronDown, CircleAlert, Link2, Loader2, Printer, Scale, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDomiLink } from '@/hooks/useDomiLink';
import { useToast } from '@/hooks/use-toast';
import type { DomiLinkDevice } from '@/lib/domilink/types';

function DeviceRow({ device, icon, action, actionLabel, busy }: {
  device: DomiLinkDevice;
  icon: React.ReactNode;
  action: () => void;
  actionLabel: string;
  busy: boolean;
}) {
  return <div className="flex flex-col gap-3 border-t py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-center gap-3">{icon}<div className="min-w-0"><p className="break-words text-sm font-medium">{device.label}</p><Badge className="mt-1" variant={device.online ? 'success' : 'outline'}>{device.online ? 'Pronto' : 'Desconectado'}</Badge></div></div>
    <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={!device.online || busy} onClick={action}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{actionLabel}</Button>
  </div>;
}

export function DomiLinkSettingsCard() {
  const domiLink = useDomiLink();
  const { toast } = useToast();
  const [pairCode, setPairCode] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  return <section className="border-t pt-7" aria-labelledby="domilink-title">
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3"><div className="rounded-lg bg-primary p-2 text-primary-foreground"><Link2 className="h-5 w-5" /></div><div><h2 id="domilink-title" className="text-lg font-semibold">Equipamentos do caixa</h2><p className="text-sm text-muted-foreground">O DomiLink conecta a impressora, a balança e o leitor deste computador.</p></div></div>
      <Switch aria-label="Ativar equipamentos do caixa neste computador" checked={domiLink.enabled} onCheckedChange={domiLink.setEnabled} />
    </div>

    {!domiLink.enabled && <p className="mt-4 text-sm text-muted-foreground">Desligado neste computador. O PDV continua funcionando normalmente pelo navegador.</p>}

    {domiLink.enabled && <div className="mt-4 border-t pt-4">
      {domiLink.status === 'checking' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Procurando o DomiLink neste computador…</div>}

      {(domiLink.status === 'offline' || domiLink.status === 'error') && <div className="space-y-3"><div className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div><p className="text-sm font-medium">DomiLink não conectado</p><p className="text-sm text-muted-foreground">{domiLink.error}</p></div></div><Button type="button" variant="outline" onClick={() => void domiLink.retry()}>Tentar novamente</Button></div>}

      {domiLink.status === 'pairing' && <div className="space-y-4"><div><p className="text-sm font-medium">Digite o código mostrado no DomiLink</p><p className="text-xs text-muted-foreground">O código tem 6 números, vale uma vez e não é a senha da sua conta.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="w-full sm:max-w-48"><Label htmlFor="domilink-code" className="sr-only">Código do DomiLink</Label><Input id="domilink-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className="font-mono text-lg tracking-[0.25em]" value={pairCode} onChange={(event) => setPairCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></div><Button type="button" disabled={pairCode.length !== 6 || domiLink.busyAction === 'pair'} onClick={() => void pair()}>{domiLink.busyAction === 'pair' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Parear</Button></div>{domiLink.error && <p role="alert" className="text-sm text-destructive">{domiLink.error}</p>}</div>}

      {domiLink.status === 'connected' && domiLink.profile && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Badge variant="success">Pronto</Badge><span className="text-sm font-medium">Equipamentos conectados</span></div><p className="mt-1 text-xs text-muted-foreground">Somente neste computador · comprovantes não fiscais</p></div><Button type="button" variant="outline" disabled={domiLink.busyAction === 'disconnect'} onClick={() => void domiLink.disconnect()}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button></div>

        <dl className="grid grid-cols-3 divide-x border-y py-3 text-center"><div><dd className="text-xl font-bold tabular-nums">{domiLink.devices.printers.length}</dd><dt className="text-xs text-muted-foreground">Impressoras</dt></div><div><dd className="text-xl font-bold tabular-nums">{domiLink.devices.scales.length}</dd><dt className="text-xs text-muted-foreground">Balanças</dt></div><div><dd className="text-xl font-bold tabular-nums">{domiLink.devices.barcodes.length}</dd><dt className="text-xs text-muted-foreground">Leitores</dt></div></dl>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-medium">Equipamentos e testes<ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></CollapsibleTrigger><CollapsibleContent className="px-1 pt-2">
          {domiLink.profile.devices.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhum equipamento configurado no DomiLink.</p>}
          {domiLink.devices.printers.map((device) => <DeviceRow key={device.id} device={device} icon={<Printer className="h-5 w-5 shrink-0 text-muted-foreground" />} actionLabel="Imprimir teste" busy={domiLink.busyAction === `print:${device.id}`} action={() => void run('Teste impresso com sucesso', () => domiLink.testPrint(device))} />)}
          {domiLink.devices.scales.map((device) => <DeviceRow key={device.id} device={device} icon={<Scale className="h-5 w-5 shrink-0 text-muted-foreground" />} actionLabel={domiLink.lastScaleReading ? `${domiLink.lastScaleReading.weight_kg} kg` : 'Ler peso'} busy={domiLink.busyAction === `scale:${device.id}`} action={() => void run('Peso lido com sucesso', () => domiLink.readScale(device.id))} />)}
          {domiLink.devices.barcodes.map((device) => <DeviceRow key={device.id} device={device} icon={<Barcode className="h-5 w-5 shrink-0 text-muted-foreground" />} actionLabel={domiLink.lastBarcode ?? 'Ler código'} busy={domiLink.busyAction === `barcode:${device.id}`} action={() => void run('Código lido com sucesso', () => domiLink.readBarcode(device.id))} />)}
        </CollapsibleContent></Collapsible>
        <p className="text-xs text-muted-foreground">Leitor USB/HID funciona como teclado. Câmera e QR Code usam a câmera do celular/tablet e não dependem do DomiLink. Emissão fiscal não está incluída.</p>
      </div>}
    </div>}
  </section>;
}
