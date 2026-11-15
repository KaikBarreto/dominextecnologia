import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Label } from '@/components/ui/label';
import { NumericInput, parseDecimalInputValue } from '@/components/ui/numeric-input';
import { formatNumber } from '@/lib/format';
import { estimatePsu, PSU_PER_UNIT_W } from '@/lib/technicianItCalculations';
import { ToolDisclaimer } from '../ToolDisclaimer';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const copy = {
  'pt-br': { inputNote: 'Informe a potência máxima do componente em watts. Os valores iniciais são apenas exemplos editáveis.', minimum: 'Potência mínima estimada', outsideRange: 'O cálculo excede as faixas desta ferramenta. Não há sugestão de modelo; escolha uma fonte que atenda pelo menos ao mínimo acima e às exigências dos componentes.', empty: 'Preencha as potências para calcular.' },
  en: { inputNote: 'Enter each component’s maximum power in watts. Initial values are editable examples only.', minimum: 'Estimated minimum power', outsideRange: 'The result exceeds this tool’s size ranges. No model is suggested; choose a PSU that meets at least the minimum above and all component requirements.', empty: 'Enter the power values to calculate.' },
  es: { inputNote: 'Indique la potencia máxima de cada componente en vatios. Los valores iniciales son solo ejemplos editables.', minimum: 'Potencia mínima estimada', outsideRange: 'El resultado supera las gamas de esta herramienta. No se sugiere un modelo; elija una fuente que cubra al menos el mínimo indicado y los requisitos de los componentes.', empty: 'Complete las potencias para calcular.' },
  fr: { inputNote: 'Indiquez la puissance maximale de chaque composant en watts. Les valeurs initiales ne sont que des exemples modifiables.', minimum: 'Puissance minimale estimée', outsideRange: 'Le résultat dépasse les plages de cet outil. Aucun modèle n’est proposé ; choisissez une alimentation répondant au minimum indiqué et aux exigences des composants.', empty: 'Renseignez les puissances pour calculer.' },
};

export function CalculadoraFontePSU() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.psuCalc;

  const extra = copy[locale];
  const fmt = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 2 });
  const [cpuW, setCpuW] = useState('95');
  const [gpuW, setGpuW] = useState('0');
  const [moboW, setMoboW] = useState('50');
  const [ramSticks, setRamSticks] = useState('2');
  const [hdds, setHdds] = useState('0');
  const [ssds, setSsds] = useState('1');
  const [coolers, setCoolers] = useState('0');

  const result = useMemo(() => {
    const cpu = parseDecimalInputValue(cpuW);
    const gpu = parseDecimalInputValue(gpuW);
    const mobo = parseDecimalInputValue(moboW);
    if (cpu === null || gpu === null || mobo === null) return null;
    return estimatePsu({ cpuW: cpu, gpuW: gpu, moboW: mobo,
      ramSticks: Number(ramSticks), hdds: Number(hdds), ssds: Number(ssds), coolers: Number(coolers) });
  }, [cpuW, gpuW, moboW, ramSticks, hdds, ssds, coolers]);

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t.title}</h2>
        <p className="text-sm text-muted-foreground md:text-base">{t.subtitle}</p>
      </div>

      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">{extra.inputNote}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { id: 'psu-cpu', label: t.cpuLabel, value: cpuW, set: setCpuW },
            { id: 'psu-gpu', label: t.gpuLabel, value: gpuW, set: setGpuW },
            { id: 'psu-mobo', label: t.moboLabel, value: moboW, set: setMoboW },
          ].map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id} className="text-base font-medium text-foreground">{field.label}</Label>
              <div className="relative">
                <NumericInput id={field.id} decimal value={field.value} onValueChange={field.set} min={0} className="h-14 pr-10 text-lg" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">W</span>
              </div>
            </div>
          ))}
        </div>

        {/* Contagens */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="psu-ramSticks" className="text-base font-medium text-foreground">{t.ramLabel}</Label>
            <NumericInput
              id="psu-ramSticks"
              min={0}
              value={ramSticks}
              onValueChange={setRamSticks}
              className="h-14 text-lg"
            />
            <p className="text-xs text-muted-foreground">{t.ramNote.replace('{w}', String(PSU_PER_UNIT_W.ramSticks))}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="psu-hdds" className="text-base font-medium text-foreground">{t.hddLabel}</Label>
            <NumericInput
              id="psu-hdds"
              min={0}
              value={hdds}
              onValueChange={setHdds}
              className="h-14 text-lg"
            />
            <p className="text-xs text-muted-foreground">{t.hddNote.replace('{w}', String(PSU_PER_UNIT_W.hdds))}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="psu-ssds" className="text-base font-medium text-foreground">{t.ssdLabel}</Label>
            <NumericInput
              id="psu-ssds"
              min={0}
              value={ssds}
              onValueChange={setSsds}
              className="h-14 text-lg"
            />
            <p className="text-xs text-muted-foreground">{t.ssdNote.replace('{w}', String(PSU_PER_UNIT_W.ssds))}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="psu-coolers" className="text-base font-medium text-foreground">{t.coolerLabel}</Label>
            <NumericInput
              id="psu-coolers"
              min={0}
              value={coolers}
              onValueChange={setCoolers}
              className="h-14 text-lg"
            />
            <p className="text-xs text-muted-foreground">{t.coolerNote.replace('{w}', String(PSU_PER_UNIT_W.coolers))}</p>
          </div>
        </div>
      </div>

      {/* Capacidade nominal e eficiência são critérios diferentes. Nenhum
          selo 80 PLUS é inferido a partir dos watts calculados. */}
      <div className="space-y-4 rounded-xl bg-muted/40 p-5 text-center" aria-live="polite">
        {result ? <>
          <p className="text-sm font-semibold text-muted-foreground">
            {result.psuSize === null ? extra.minimum : t.resultLabel}
          </p>
          <p className="break-all text-4xl font-bold leading-tight tabular-nums text-primary sm:text-6xl">
            {fmt(result.psuSize ?? result.recW)} <span className="text-2xl font-semibold">W</span>
          </p>
          {result.psuSize === null ? (
            <p className="text-sm leading-relaxed text-foreground">{extra.outsideRange}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t.resultSuggested}: {fmt(result.psuSize)} W</p>
          )}
          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div><dt className="text-sm text-muted-foreground">{t.totalConsumption}</dt><dd className="mt-1 break-words text-xl font-semibold tabular-nums">{fmt(result.totalW)} W</dd></div>
            <div><dt className="text-sm text-muted-foreground">{t.withMargin}</dt><dd className="mt-1 break-words text-xl font-semibold tabular-nums">{fmt(result.recW)} W</dd></div>
          </dl>
        </> : <p className="text-sm text-muted-foreground">{extra.empty}</p>}
      </div>
      <NoticeBanner variant="neutral" icon={Zap}>{t.marginNote}</NoticeBanner>

      <ToolDisclaimer texto={t.disclaimer} />
    </div>
  );
}
