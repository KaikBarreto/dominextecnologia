import { useState, useMemo } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { NumericInput, parseDecimalInputValue } from '@/components/ui/numeric-input';
import { formatNumber } from '@/lib/format';
import { convertStorage, convertSpeed, transferTimeSeconds, STORAGE_UNITS, SPEED_UNITS, type StorageUnit, type SpeedUnit } from '@/lib/technicianItCalculations';
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

type Tab = 'storage' | 'speed';

export function ConversorArmazenamento() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.storageConverter;
  const fmt = (value: number) => formatNumber(value, locale, { maximumSignificantDigits: 8 });
  const fmtTime = (value: number) => formatNumber(value, locale,
    value < 0.01 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 2 });

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
    const v = parseDecimalInputValue(storageValue);
    if (v === null || v < 0) return null;
    return convertStorage(v, fromUnit, toUnit);
  }, [storageValue, fromUnit, toUnit]);

  const speedResult = useMemo(() => {
    const v = parseDecimalInputValue(speedValue);
    if (v === null || v < 0) return null;
    return convertSpeed(v, speedFrom, speedTo);
  }, [speedValue, speedFrom, speedTo]);

  const seconds = useMemo(() => {
    const fs = parseDecimalInputValue(fileSize);
    const speed = parseDecimalInputValue(speedValue);
    return fs === null || speed === null ? null : transferTimeSeconds(fs, speed, speedFrom);
  }, [fileSize, speedValue, speedFrom]);
  const timeResult = seconds === null ? '—'
    : seconds < 60 ? `${fmtTime(seconds)} s`
    : seconds < 3600 ? `${fmtTime(seconds / 60)} min`
    : `${fmtTime(seconds / 3600)} h`;

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
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t.title}</h2>
        <p className="text-sm text-muted-foreground md:text-base">{t.subtitle}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['storage', 'speed'] as Tab[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            aria-pressed={tab === v}
            className={cn(
              'min-h-12 flex-1 rounded-md border px-3 py-2 text-base font-semibold transition-colors',
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
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="storage-value" className="text-base font-medium text-foreground">{t.valueLabel}</Label>
              <NumericInput
                id="storage-value"
                decimal
                value={storageValue}
                onValueChange={setStorageValue}
                min={0}
                className="h-14 text-lg"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="storage-from" className="text-base font-medium text-foreground">{t.fromLabel}</Label>
                <Select value={fromUnit} onValueChange={(v) => setFromUnit(v as StorageUnit)}>
                  <SelectTrigger id="storage-from" className="h-14 text-lg">
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
                <Label htmlFor="storage-to" className="text-base font-medium text-foreground">{t.toLabel}</Label>
                <Select value={toUnit} onValueChange={(v) => setToUnit(v as StorageUnit)}>
                  <SelectTrigger id="storage-to" className="h-14 text-lg">
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
          <div className="space-y-2 rounded-xl bg-muted/40 p-5 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.resultLabel}</p>
            {storageResult !== null ? (
              <>
                <p className="break-all text-4xl font-bold leading-tight tabular-nums text-primary sm:text-6xl">
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
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="speed-value" className="text-base font-medium text-foreground">{t.speedValueLabel}</Label>
              <NumericInput
                id="speed-value"
                decimal
                value={speedValue}
                onValueChange={setSpeedValue}
                min={0}
                className="h-14 text-lg"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="speed-from" className="text-base font-medium text-foreground">{t.fromLabel}</Label>
                <Select value={speedFrom} onValueChange={(v) => setSpeedFrom(v as SpeedUnit)}>
                  <SelectTrigger id="speed-from" className="h-14 text-lg">
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
                <Label htmlFor="speed-to" className="text-base font-medium text-foreground">{t.toLabel}</Label>
                <Select value={speedTo} onValueChange={(v) => setSpeedTo(v as SpeedUnit)}>
                  <SelectTrigger id="speed-to" className="h-14 text-lg">
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
          <div className="space-y-2 rounded-xl bg-muted/40 p-5 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.resultLabel}</p>
            {speedResult !== null ? (
              <p className="break-all text-4xl font-bold leading-tight tabular-nums text-primary sm:text-6xl">
                {fmt(speedResult)}
                <span className="ml-2 text-2xl font-semibold sm:text-3xl">{speedTo}</span>
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">{t.enterValue}</p>
            )}
          </div>

          {/* Tempo de transferência */}
          <div className="space-y-5">
            <p className="text-sm font-medium">{t.transferTimeTitle}</p>
            <div className="space-y-1.5">
              <Label htmlFor="file-size" className="text-base font-medium text-foreground">{t.fileSizeLabel}</Label>
              <div className="flex items-center gap-2">
                <NumericInput
                  id="file-size"
                  decimal
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
