import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { DomiLinkDevice } from '@/lib/domilink/types';

export function PdvDomiLinkDeviceAction({ devices, label, icon, onSelect, busy, compact = false }: {
  devices: DomiLinkDevice[]; label: string; icon: ReactNode; onSelect: (device: DomiLinkDevice) => void; busy: boolean;
  compact?: boolean;
}) {
  if (!devices.length) return null;
  if (devices.length === 1) return <Button type="button" size={compact ? 'icon' : 'sm'} className={compact ? 'h-7 w-7 shrink-0' : undefined} variant="outline" disabled={busy || !devices[0].online} aria-label={label} onClick={() => onSelect(devices[0])}>{icon}{!compact && <span>{label}</span>}</Button>;
  return <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size={compact ? 'icon' : 'sm'} className={compact ? 'h-7 w-7 shrink-0' : undefined} variant="outline" disabled={busy} aria-label={label}>{icon}{!compact && <span>{label}</span>}</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{devices.map(device => <DropdownMenuItem key={device.id} disabled={!device.online} onSelect={() => onSelect(device)}>{device.label}{!device.online ? ' · desconectado' : ''}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}
