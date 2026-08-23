import { useState, useMemo } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ToolDisclaimer } from '../ToolDisclaimer';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

// ── Unidades de armazenamento ────────────────────────────────────────────────
type StorageUnit = 'GB' | 'GiB' | 'TB' | 'TiB' | 'MB' | 'MiB';

// Tudo em bytes como base
const TO_BYTES: Record<StorageUnit, number> = {
  MB:  1_000_000,
  MiB: 1_048_576,
  GB:  1_000_000_000,
  GiB: 1_073_741_824,
  TB:  1_000_000_000_000,
  TiB: 1_099_511_627_776,
};

const STORAGE_UNITS: StorageUnit[] = ['MB', 'MiB', 'GB', 'GiB', 'TB', 'TiB'];

function convertStorage(value: number, from: StorageUnit, to: StorageUnit): number {
  const bytes = value * TO_BYTES[from];
  return bytes / TO_BYTES[to];
}

function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  const decimals = n < 10 ? 4 : n < 100 ? 3 : 2;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: decimals });
}

// ── Unidades de velocidade/transferência ─────────────────────────────────────
type SpeedUnit = 'Mbps' | 'MBps' | 'Kbps' | 'KBps' | 'Gbps';

// Tudo em bits/s como base
const TO_BPS: Record<SpeedUnit, number> = {
  Kbps: 1_000,
  KBps: 8_000,
  Mbps: 1_000_000,
  MBps: 8_000_000,
  Gbps: 1_000_000_000,
};

const SPEED_UNITS: SpeedUnit[] = ['Kbps', 'Mbps', 'Gbps', 'KBps', 'MBps'];

function convertSpeed(value: number, from: SpeedUnit, to: SpeedUnit): number {
  const bps = value * TO_BPS[from];
  return bps / TO_BPS[to];
}

function transferTime(fileSizeMB: number, speedMbps: number): string {
  if (fileSizeMB <= 0 || speedMbps <= 0) return '—';
  const bits = fileSizeMB * 8_000_000;
  const seconds = bits / (speedMbps * 1_000_000);
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(2)} h`;
}

type Tab = 'storage' | 'speed';

export function ConversorArmazenamento() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.storageConverter;

  const [tab, setTab] = useState<Tab>('storage');

  // Storage
  const [storageValue, setStorageValue] = useState('1');
  const [fromUnit, setFromUnit] = useState<StorageUnit>('TB');
  const [toUnit, setToUnit] = useState<StorageUnit>('GiB');

  // Speed
  const [speedValue, setSpeedValue] = useState('100');
  const [speedFrom, setSpeedFrom] = useState<SpeedUnit>('Mbps');
  const [speedTo, setSpeedTo] = useState<SpeedUnit>('MBps');
  const [fileSize, setFileSize] = useState('1000');

  const storageResult = useMemo(() => {
    const v = parseFloat(storageValue.replace(',', '.'));
    if (!isFinite(v) || v < 0) return null;
    return convertStorage(v, fromUnit, toUnit);
  }, [storageValue, fromUnit, toUnit]);

  const speedResult = useMemo(() => {
    const v = parseFloat(speedValue.replace(',', '.'));
    if (!isFinite(v) || v <= 0) return null;
    return convertSpeed(v, speedFrom, speedTo);
  }, [speedValue, speedFrom, speedTo]);

  const timeResult = useMemo(() => {
    const fs = parseFloat(fileSize.replace(',', '.'));
    const v = parseFloat(speedValue.replace(',', '.'));
    if (!isFinite(fs) || !isFinite(v)) return '—';
    // converte tudo pra Mbps p/ calcular
    const mbps = convertSpeed(v, speedFrom, 'Mbps');
    return transferTime(fs, mbps);
  }, [fileSize, speedValue, speedFrom]);

  const swapStorage = () => {
    const tmp = fromUnit;
    setFromUnit(toUnit);
    setToUnit(tmp);
  };

  const swapSpeed = () => {
    const tmp = speedFrom;
    setSpeedFrom(speedTo);
    setSpeedTo(tmp);
  };

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">{t.title}</h2>
        <p className="text-sm text-muted-foreground md:text-base">{t.subtitle}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['storage', 'speed'] as Tab[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={cn(
              'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              tab === v
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {v === 'storage' ? t.tabStorage : t.tabSpeed}
          </button>
        ))}
      </div>

      {tab === 'storage' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-base text-muted-foreground md:text-lg">{t.valueLabel}</Label>
              <NumericInput
                value={storageValue}
                onValueChange={setStorageValue}
                min={0}
                className="h-14 text-lg"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-base text-muted-foreground md:text-lg">{t.fromLabel}</Label>
                <Select value={fromUnit} onValueChange={(v) => setFromUnit(v as StorageUnit)}>
                  <SelectTrigger className="h-14 text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STORAGE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                onClick={swapStorage}
                className="mb-0.5 flex h-14 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted hover:bg-muted/80 transition-colors"
                aria-label={t.swapLabel}
              >
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="flex-1 space-y-1.5">
                <Label className="text-base text-muted-foreground md:text-lg">{t.toLabel}</Label>
                <Select value={toUnit} onValueChange={(v) => setToUnit(v as StorageUnit)}>
                  <SelectTrigger className="h-14 text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STORAGE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Resultado storage */}
          <div className="rounded-lg border border-border bg-background p-5 text-center space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.resultLabel}</p>
            {storageResult !== null ? (
              <>
                <p className="text-5xl font-bold leading-none text-primary sm:text-7xl">
                  {fmt(storageResult)}
                  <span className="ml-2 text-2xl font-semibold sm:text-3xl">{toUnit}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {storageValue} {fromUnit} = {fmt(storageResult)} {toUnit}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">{t.enterValue}</p>
            )}
          </div>

          {/* Dica clássica HD vs SO */}
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground leading-relaxed">{t.hdTip}</p>
          </div>
        </div>
      )}

      {tab === 'speed' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-base text-muted-foreground md:text-lg">{t.speedValueLabel}</Label>
              <NumericInput
                value={speedValue}
                onValueChange={setSpeedValue}
                min={0}
                className="h-14 text-lg"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-base text-muted-foreground md:text-lg">{t.fromLabel}</Label>
                <Select value={speedFrom} onValueChange={(v) => setSpeedFrom(v as SpeedUnit)}>
                  <SelectTrigger className="h-14 text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPEED_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                onClick={swapSpeed}
                className="mb-0.5 flex h-14 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted hover:bg-muted/80 transition-colors"
                aria-label={t.swapLabel}
              >
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="flex-1 space-y-1.5">
                <Label className="text-base text-muted-foreground md:text-lg">{t.toLabel}</Label>
                <Select value={speedTo} onValueChange={(v) => setSpeedTo(v as SpeedUnit)}>
                  <SelectTrigger className="h-14 text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPEED_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Resultado velocidade */}
          <div className="rounded-lg border border-border bg-background p-5 text-center space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.resultLabel}</p>
            {speedResult !== null ? (
              <p className="text-5xl font-bold leading-none text-primary sm:text-7xl">
                {fmt(speedResult)}
                <span className="ml-2 text-2xl font-semibold sm:text-3xl">{speedTo}</span>
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">{t.enterValue}</p>
            )}
          </div>

          {/* Tempo de transferência */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <p className="text-sm font-medium">{t.transferTimeTitle}</p>
            <div className="space-y-1.5">
              <Label className="text-base text-muted-foreground md:text-lg">{t.fileSizeLabel}</Label>
              <div className="flex items-center gap-2">
                <NumericInput
                  value={fileSize}
                  onValueChange={setFileSize}
                  min={0}
                  className="h-14 flex-1 text-lg"
                />
                <span className="text-sm font-medium text-muted-foreground shrink-0">MB</span>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 px-4 py-3 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.timeLabel}</p>
              <p className="text-2xl font-bold text-primary mt-1">{timeResult}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.speedContext.replace('{speed}', speedValue).replace('{unit}', speedFrom)}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground leading-relaxed">{t.speedTip}</p>
          </div>
        </div>
      )}

      <ToolDisclaimer texto={t.disclaimer} />
    </div>
  );
}
