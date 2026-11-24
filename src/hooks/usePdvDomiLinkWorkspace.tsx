import { useEffect, useRef, useState, type RefObject } from 'react';
import { Barcode, Plug, Scale } from 'lucide-react';
import { useDomiLink } from './useDomiLink';
import { useToast } from './use-toast';
import { PdvDomiLinkDeviceAction } from '@/components/pdv/domilink/PdvDomiLinkDeviceAction';
import { canUseDomiLinkWeight, domiLinkWeightQuantity } from '@/lib/domilink/weight';
import { useDomiLinkAccess } from '@/components/settings/domilink/useDomiLinkAccess';
import { DomiLinkSettingsCard } from '@/components/pdv/domilink/DomiLinkSettingsCard';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface WeighableLine { inventoryId: string; name: string; unit?: string | null; availableQuantity: number }

export function usePdvDomiLinkWorkspace({ identity, contextKey, blocked: externallyBlocked, quantityReadOnly, getLine, onSetQuantity, onSearchChange, searchInputRef }: {
  identity: unknown; contextKey?: string; blocked: boolean; quantityReadOnly?: boolean;
  getLine: (id: string) => WeighableLine | undefined;
  onSetQuantity: (id: string, value: number) => void; onSearchChange: (code: string) => void;
  searchInputRef: RefObject<HTMLInputElement>;
}) {
  const hardware = useDomiLink();
  const access = useDomiLinkAccess();
  const connectionScope = JSON.stringify([contextKey, hardware.scopeKey]);
  const [connection, setConnection] = useState({ scope: connectionScope, open: false });
  const connectionOpen = connection.scope === connectionScope && connection.open;
  const setConnectionOpen = (open: boolean) => setConnection({ scope: connectionScope, open });
  useEffect(() => setConnection({ scope: connectionScope, open: false }), [connectionScope]);
  const blocked = externallyBlocked || connectionOpen;
  const { toast } = useToast();
  const operationContextKey = connectionScope;
  const connectedNow = hardware.status === 'connected';
  const current = useRef({ identity, contextKey: operationContextKey, blocked, quantityReadOnly, connectedNow, generation: 0, connectionGeneration: 0, mounted: true });
  const scopeChanged = current.current.identity !== identity || current.current.contextKey !== operationContextKey || current.current.blocked !== blocked || current.current.quantityReadOnly !== quantityReadOnly;
  const connectionChanged = current.current.connectedNow !== connectedNow;
  if (scopeChanged || connectionChanged) {
    current.current = { ...current.current, identity, contextKey: operationContextKey, blocked, quantityReadOnly, connectedNow,
      generation: current.current.generation + (scopeChanged ? 1 : 0),
      connectionGeneration: current.current.connectionGeneration + (connectionChanged ? 1 : 0) };
  }
  useEffect(() => { current.current.mounted = true; return () => { current.current.mounted = false; current.current.generation += 1; }; }, []);
  const capture = (requireConnection = true) => {
    const { generation, connectionGeneration } = current.current;
    return () => current.current.mounted && generation === current.current.generation && !current.current.blocked
      && (!requireConnection || connectionGeneration === current.current.connectionGeneration);
  };
  const connected = hardware.status === 'connected' && !blocked;
  const scannerControl = connected ? <PdvDomiLinkDeviceAction devices={hardware.devices.barcodes} label="Ler código" icon={<Barcode className="h-4 w-4" />} busy={!!hardware.busyAction} onSelect={async device => {
    const isCurrent = capture();
    const searchAtStart = searchInputRef.current?.value;
    try {
      const code = await hardware.readBarcode(device.id);
      if (!isCurrent() || !code) return;
      if (searchInputRef.current?.value !== searchAtStart) return;
      onSearchChange(code);
      requestAnimationFrame(() => { if (isCurrent()) searchInputRef.current?.focus({ preventScroll: true }); });
    } catch (error) { if (isCurrent()) toast({ title: 'Não foi possível ler o código', description: error instanceof Error ? error.message : 'Confira o leitor e tente novamente.', variant: 'destructive' }); }
  }} /> : null;
  const weighControl = connected && !quantityReadOnly ? (id: string) => {
    const line = getLine(id);
    if (!line || !canUseDomiLinkWeight(line.unit)) return null;
    return <PdvDomiLinkDeviceAction compact devices={hardware.devices.scales} label={`Usar peso em ${line.name}`} icon={<Scale className="h-4 w-4" />} busy={!!hardware.busyAction} onSelect={async device => {
      const isCurrent = capture();
      try {
        const reading = await hardware.readScale(device.id);
        if (!isCurrent()) return;
        const quantity = domiLinkWeightQuantity(reading, line.unit, line.availableQuantity);
        onSetQuantity(id, quantity);
        searchInputRef.current?.focus({ preventScroll: true });
      } catch (error) { if (isCurrent()) toast({ title: 'Peso não aplicado', description: error instanceof Error ? error.message : 'Confira a balança e tente novamente.', variant: 'destructive' }); }
    }} />;
  } : undefined;
  const connectionControl = access.allowed && !externallyBlocked ? <>
    <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Equipamentos deste computador" onClick={() => setConnectionOpen(true)}><Plug className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Equipamentos deste computador</TooltipContent></Tooltip></TooltipProvider>
    <ResponsiveModal open={connectionOpen} onOpenChange={open => { setConnectionOpen(open); if (!open && hardware.enabled) void hardware.retry(); }} title="Conectar equipamentos" className="sm:max-w-2xl"><DomiLinkSettingsCard key={connectionScope} /></ResponsiveModal>
  </> : null;
  return { scannerControl: <>{connectionControl}{scannerControl}</>, weighControl, capture };
}
