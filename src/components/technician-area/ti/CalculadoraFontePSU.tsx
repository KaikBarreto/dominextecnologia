import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
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

// ── Consumo típico por componente (W) ──────────────────────────────────────
const CPU_OPTIONS = [
  { label: 'Baixo consumo (35–65 W) — ex.: i3, Ryzen 3', w: 65 },
  { label: 'Consumo médio (65–95 W) — ex.: i5, Ryzen 5', w: 95 },
  { label: 'Alto consumo (95–125 W) — ex.: i7, Ryzen 7', w: 125 },
  { label: 'Muito alto (125–180 W) — ex.: i9, Ryzen 9', w: 180 },
  { label: 'Extreme / Workstation (> 180 W)', w: 250 },
];

const GPU_OPTIONS = [
  { label: 'Sem GPU dedicada (integrado)', w: 0 },
  { label: 'GPU de entrada (50–80 W) — ex.: GTX 1650, RX 6500', w: 80 },
  { label: 'GPU intermediária (100–150 W) — ex.: RTX 3060, RX 6600', w: 150 },
  { label: 'GPU alta (200–250 W) — ex.: RTX 3080, RX 6800 XT', w: 250 },
  { label: 'GPU topo (300–400 W) — ex.: RTX 4090, RX 7900 XTX', w: 400 },
];

const MOBO_OPTIONS = [
  { label: 'Mini-ITX / Micro-ATX', w: 30 },
  { label: 'ATX padrão', w: 50 },
  { label: 'EATX / High-end', w: 80 },
];

const RAM_PER_STICK_W = 5; // W por módulo
const HDD_W = 10; // W por HDD
const SSD_W = 3;  // W por SSD (SATA/NVMe)
const COOLER_W = 10; // W por cooler adicional (já incluso no TDP da CPU; este é extra case fan)

const MARGIN_FACTOR = 1.30; // +30% de folga recomendada

function tierLabel(watt: number): { label: string; color: string } {
  if (watt <= 350) return { label: '80 Plus Bronze', color: 'hsl(30 90% 50%)' };
  if (watt <= 550) return { label: '80 Plus Gold', color: 'hsl(45 100% 45%)' };
  if (watt <= 750) return { label: '80 Plus Gold / Platinum', color: 'hsl(200 80% 45%)' };
  return { label: '80 Plus Platinum / Titanium', color: 'hsl(262 80% 55%)' };
}

function roundUpPsu(w: number): number {
  const tiers = [350, 450, 550, 650, 750, 850, 1000, 1200, 1600];
  return tiers.find((t) => t >= w) ?? 1600;
}

export function CalculadoraFontePSU() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.psuCalc;

  const [cpuIdx, setCpuIdx] = useState(1);
  const [gpuIdx, setGpuIdx] = useState(0);
  const [moboIdx, setMoboIdx] = useState(1);
  const [ramSticks, setRamSticks] = useState('2');
  const [hdds, setHdds] = useState('0');
  const [ssds, setSsds] = useState('1');
  const [coolers, setCoolers] = useState('0');

  const { totalW, recW, psuSize, tier } = useMemo(() => {
    const ram = Math.max(0, Number(ramSticks) || 0);
    const hdd = Math.max(0, Number(hdds) || 0);
    const ssd = Math.max(0, Number(ssds) || 0);
    const fan = Math.max(0, Number(coolers) || 0);

    const totalW =
      CPU_OPTIONS[cpuIdx].w +
      GPU_OPTIONS[gpuIdx].w +
      MOBO_OPTIONS[moboIdx].w +
      ram * RAM_PER_STICK_W +
      hdd * HDD_W +
      ssd * SSD_W +
      fan * COOLER_W;

    const recW = Math.ceil(totalW * MARGIN_FACTOR);
    const psuSize = roundUpPsu(recW);
    const tier = tierLabel(psuSize);
    return { totalW, recW, psuSize, tier };
  }, [cpuIdx, gpuIdx, moboIdx, ramSticks, hdds, ssds, coolers]);

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">{t.title}</h2>
        <p className="text-sm text-muted-foreground md:text-base">{t.subtitle}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        {/* CPU */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.cpuLabel}</Label>
          <Select value={String(cpuIdx)} onValueChange={(v) => setCpuIdx(Number(v))}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CPU_OPTIONS.map((o, i) => (
                <SelectItem key={i} value={String(i)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t.cpuWattNote.replace('{w}', String(CPU_OPTIONS[cpuIdx].w))}</p>
        </div>

        {/* GPU */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.gpuLabel}</Label>
          <Select value={String(gpuIdx)} onValueChange={(v) => setGpuIdx(Number(v))}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GPU_OPTIONS.map((o, i) => (
                <SelectItem key={i} value={String(i)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {GPU_OPTIONS[gpuIdx].w > 0 && (
            <p className="text-xs text-muted-foreground">{t.gpuWattNote.replace('{w}', String(GPU_OPTIONS[gpuIdx].w))}</p>
          )}
        </div>

        {/* Placa-mãe */}
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{t.moboLabel}</Label>
          <Select value={String(moboIdx)} onValueChange={(v) => setMoboIdx(Number(v))}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOBO_OPTIONS.map((o, i) => (
                <SelectItem key={i} value={String(i)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Contagens */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">{t.ramLabel}</Label>
            <NumericInput
              value={ramSticks}
              onValueChange={setRamSticks}
              className="h-14 text-lg"
            />
            <p className="text-xs text-muted-foreground">{t.ramNote.replace('{w}', String(RAM_PER_STICK_W))}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">{t.hddLabel}</Label>
            <NumericInput
              value={hdds}
              onValueChange={setHdds}
              className="h-14 text-lg"
            />
            <p className="text-xs text-muted-foreground">{t.hddNote.replace('{w}', String(HDD_W))}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">{t.ssdLabel}</Label>
            <NumericInput
              value={ssds}
              onValueChange={setSsds}
              className="h-14 text-lg"
            />
            <p className="text-xs text-muted-foreground">{t.ssdNote.replace('{w}', String(SSD_W))}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">{t.coolerLabel}</Label>
            <NumericInput
              value={coolers}
              onValueChange={setCoolers}
              className="h-14 text-lg"
            />
            <p className="text-xs text-muted-foreground">{t.coolerNote.replace('{w}', String(COOLER_W))}</p>
          </div>
        </div>
      </div>

      {/* Resultado */}
      <div className="rounded-lg border border-border bg-background p-5 text-center space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t.resultLabel}
        </p>
        <div>
          <p className="text-5xl font-bold leading-none text-primary sm:text-7xl">
            {psuSize}
            <span className="ml-2 text-2xl font-semibold sm:text-3xl">W</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.resultSuggested}: {psuSize} W
          </p>
        </div>

        {/* Grade de detalhes */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3">
          <div className="text-center">
            <p className="text-xs font-medium text-muted-foreground">{t.totalConsumption}</p>
            <p className="text-lg font-semibold">{totalW} W</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-muted-foreground">{t.withMargin}</p>
            <p className="text-lg font-semibold">{recW} W</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-muted-foreground">{t.efficiency}</p>
            <p
              className={cn('text-base font-semibold leading-tight')}
              style={{ color: tier.color }}
            >
              {tier.label}
            </p>
          </div>
        </div>

        <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
          <div className="flex items-start gap-2">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t.marginNote}
            </p>
          </div>
        </div>
      </div>

      <ToolDisclaimer texto={t.disclaimer} />
    </div>
  );
}
