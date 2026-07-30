import { useState, useMemo, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, Clock } from 'lucide-react';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { useFiscalSettings } from '@/hooks/useFiscalSettings';
import { calculateEmployeeCost } from '@/utils/employeeCostProvisions';

export interface MonthlyCostBreakdown {
  baseSalary: number;
  // --- Adicional (mutuamente exclusivo) ---
  adicionalTipo: 'nenhum' | 'periculosidade' | 'insalubridade';
  periculosidadePercent: number;   // % do salário (default 30)
  insalubridadeGrau: 10 | 20 | 40; // % do salário mínimo (default 40)
  salarioMinimo: number;
  horaExtra: number;
  // --- Regime / INSS patronal ---
  regime: 'simples' | 'lucro_real';
  inssPatronalPercent: number;     // default 28.8
  // --- Benefícios e anuais (inalterados) ---
  planoSaude: number;
  planoOdonto: number;
  seguroVida: number;
  transporte: number;
  refeicao: number;
  treinamentosAnual: number;
  asoAnual: number;
  epiAnual: number;
  celularAnual: number;
  monthlyHours: number;
  // --- LEGADO (compat de leitura de breakdowns antigos; não usar em cálculo novo) ---
  periculosidade?: number;
  periculosidadeMode?: 'percent' | 'fixed';
  leisSociais?: number;
  leisSociaisMode?: 'percent' | 'fixed';
}

export const defaultBreakdown: MonthlyCostBreakdown = {
  baseSalary: 0,
  adicionalTipo: 'nenhum',
  periculosidadePercent: 30,
  insalubridadeGrau: 40,
  salarioMinimo: 1518,
  horaExtra: 0,
  regime: 'simples',
  inssPatronalPercent: 28.8,
  planoSaude: 0,
  planoOdonto: 0,
  seguroVida: 0,
  transporte: 0,
  refeicao: 0,
  treinamentosAnual: 0,
  asoAnual: 0,
  epiAnual: 0,
  celularAnual: 0,
  monthlyHours: 176,
};

interface MonthlyCostCalculatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSalary?: number;
  initialBreakdown?: MonthlyCostBreakdown | null;
  onApply: (totalCost: number, breakdown: MonthlyCostBreakdown) => void;
  defaultMonthlyHours?: number;
}

function CurrencyField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={e => onChange(currencyMask(e.target.value))}
        placeholder="R$ 0,00"
        className="h-8 text-sm"
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MonthlyCostCalculatorModal({ open, onOpenChange, initialSalary, initialBreakdown, onApply, defaultMonthlyHours }: MonthlyCostCalculatorModalProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm.costModals;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const [bd, setBd] = useState<MonthlyCostBreakdown>({ ...defaultBreakdown });

  // Auto-detecção do regime da empresa via configurações fiscais
  const { settings: fiscal } = useFiscalSettings();
  // Regime da empresa → regime do motor de custo.
  // Lucro Real e Lucro Presumido compartilham a mesma branch de propósito: ambos
  // recolhem INSS patronal na folha (Simples não). Qualquer outro valor OU empresa
  // sem regime configurado (null) assume 'simples' — default mais barato e o mais
  // provável no ICP (majoritariamente Simples/informal); o usuário pode alternar.
  const regimeFromCompany: 'simples' | 'lucro_real' =
    (fiscal?.regime_tributario === 'lucro_real' || fiscal?.regime_tributario === 'lucro_presumido')
      ? 'lucro_real'
      : 'simples';

  // Currency display states
  const [salaryDisplay, setSalaryDisplay] = useState('');
  const [planoSaudeDisplay, setPlanoSaudeDisplay] = useState('');
  const [planoOdontoDisplay, setPlanoOdontoDisplay] = useState('');
  const [seguroVidaDisplay, setSeguroVidaDisplay] = useState('');
  const [transporteDisplay, setTransporteDisplay] = useState('');
  const [refeicaoDisplay, setRefeicaoDisplay] = useState('');
  const [treinamentosDisplay, setTreinamentosDisplay] = useState('');
  const [asoDisplay, setAsoDisplay] = useState('');
  const [epiDisplay, setEpiDisplay] = useState('');
  const [celularDisplay, setCelularDisplay] = useState('');

  useEffect(() => {
    if (!open) return;
    const resolvedHours = defaultMonthlyHours || 176;
    const b: MonthlyCostBreakdown = initialBreakdown
      ? {
          ...defaultBreakdown,
          ...initialBreakdown,
          // Back-compat: mapear 'adicionalTipo' ausente (breakdown antigo) para 'nenhum'
          adicionalTipo: initialBreakdown.adicionalTipo ?? 'nenhum',
          periculosidadePercent: initialBreakdown.periculosidadePercent ?? 30,
          insalubridadeGrau: initialBreakdown.insalubridadeGrau ?? 40,
          salarioMinimo: initialBreakdown.salarioMinimo ?? 1518,
          horaExtra: initialBreakdown.horaExtra ?? 0,
          // Regime: usar o salvo se existir, senão auto-detectar da empresa
          regime: initialBreakdown.regime ?? regimeFromCompany,
          inssPatronalPercent: initialBreakdown.inssPatronalPercent ?? 28.8,
          monthlyHours: initialBreakdown.monthlyHours || resolvedHours,
        }
      : { ...defaultBreakdown, baseSalary: initialSalary ?? 0, regime: regimeFromCompany, monthlyHours: resolvedHours };
    // Self-heal: remover chaves legadas para não serem re-persistidas ao aplicar.
    // Os campos permanecem opcionais no tipo MonthlyCostBreakdown para leitura de dados antigos.
    delete (b as any).leisSociais;
    delete (b as any).leisSociaisMode;
    delete (b as any).periculosidade;
    delete (b as any).periculosidadeMode;
    setBd(b);
    const fmtCurrency = (v: number) => v > 0 ? currencyMask(String(Math.round(v * 100))) : '';
    setSalaryDisplay(fmtCurrency(b.baseSalary));
    setPlanoSaudeDisplay(fmtCurrency(b.planoSaude));
    setPlanoOdontoDisplay(fmtCurrency(b.planoOdonto));
    setSeguroVidaDisplay(fmtCurrency(b.seguroVida));
    setTransporteDisplay(fmtCurrency(b.transporte));
    setRefeicaoDisplay(fmtCurrency(b.refeicao));
    setTreinamentosDisplay(fmtCurrency(b.treinamentosAnual));
    setAsoDisplay(fmtCurrency(b.asoAnual));
    setEpiDisplay(fmtCurrency(b.epiAnual));
    setCelularDisplay(fmtCurrency(b.celularAnual));
  }, [open, initialBreakdown, initialSalary, defaultMonthlyHours]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep monthlyHours in sync when defaultMonthlyHours resolves after initial render
  useEffect(() => {
    if (!open || !defaultMonthlyHours) return;
    setBd(prev => {
      if (prev.monthlyHours !== defaultMonthlyHours) {
        return { ...prev, monthlyHours: defaultMonthlyHours };
      }
      return prev;
    });
  }, [defaultMonthlyHours, open]);

  const updateCurrencyField = (field: keyof MonthlyCostBreakdown, display: string, setDisplay: (v: string) => void) => {
    setDisplay(display);
    setBd(prev => ({ ...prev, [field]: parseCurrency(display) }));
  };

  // Motor puro de custo do empregador (substitui o cálculo inline anterior)
  const cost = useMemo(() => calculateEmployeeCost({
    baseSalary: bd.baseSalary,
    adicionalTipo: bd.adicionalTipo,
    periculosidadePercent: bd.periculosidadePercent,
    insalubridadeGrau: bd.insalubridadeGrau,
    salarioMinimo: bd.salarioMinimo,
    horaExtra: bd.horaExtra,
    regime: bd.regime,
    inssPatronalPercent: bd.inssPatronalPercent,
    planoSaude: bd.planoSaude,
    planoOdonto: bd.planoOdonto,
    seguroVida: bd.seguroVida,
    transporte: bd.transporte,
    refeicao: bd.refeicao,
    treinamentosAnual: bd.treinamentosAnual,
    asoAnual: bd.asoAnual,
    epiAnual: bd.epiAnual,
    celularAnual: bd.celularAnual,
    monthlyHours: bd.monthlyHours,
  }), [bd]);

  const total = cost.totalMensal;
  const hourlyRate = cost.horaHomem;

  const handleApply = () => {
    onApply(Math.round(total * 100) / 100, bd);
    onOpenChange(false);
  };

  const footer = (
    <div className="flex gap-2 w-full">
      <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{t.monthlyCostCancel}</Button>
      <Button className="flex-1" onClick={handleApply}>
        {t.monthlyCostApply.replace('{amount}', fmt(total))}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t.monthlyCostTitle} className="sm:max-w-lg" footer={footer}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Calculator className="h-4 w-4" />
          <span className="text-sm font-medium">{t.monthlyCostBadge}</span>
        </div>

        {/* Base Salarial */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.monthlyCostSectionSalary}</h4>
          <CurrencyField
            label={t.monthlyCostBaseSalaryLabel}
            value={salaryDisplay}
            onChange={v => updateCurrencyField('baseSalary', v, setSalaryDisplay)}
          />

          {/* Regime Tributário */}
          <div className="space-y-1">
            <Label className="text-xs">
              {t.monthlyCostTaxRegimeLabel}
            </Label>
            <div className="flex rounded-md border overflow-hidden text-xs">
              <button
                type="button"
                className={`flex-1 py-1.5 px-3 transition-colors ${bd.regime === 'simples' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                onClick={() => setBd(prev => ({ ...prev, regime: 'simples' }))}
              >
                {t.monthlyCostSimples}
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 px-3 transition-colors ${bd.regime === 'lucro_real' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                onClick={() => setBd(prev => ({ ...prev, regime: 'lucro_real' }))}
              >
                {t.monthlyCostLucroReal}
              </button>
            </div>
          </div>

          {/* INSS Patronal (só Lucro Real) */}
          {bd.regime === 'lucro_real' && (
            <div className="space-y-1">
              <Label className="text-xs">
                {t.monthlyCostInssPatronalLabel}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step={0.1}
                  value={bd.inssPatronalPercent || ''}
                  onChange={e => setBd(prev => ({ ...prev, inssPatronalPercent: Number(e.target.value) || 0 }))}
                  placeholder="28.8"
                  className="h-8 text-sm pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t.monthlyCostInssPatronalHint}
              </p>
            </div>
          )}

          {/* Adicional (Periculosidade / Insalubridade — mutuamente exclusivos) */}
          <div className="space-y-2">
            <Label className="text-xs">
              {t.monthlyCostAdicionalLabel}
            </Label>
            <div className="flex rounded-md border overflow-hidden text-[10px]">
              <button
                type="button"
                className={`flex-1 py-1.5 px-2 transition-colors ${bd.adicionalTipo === 'nenhum' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                onClick={() => setBd(prev => ({ ...prev, adicionalTipo: 'nenhum' }))}
              >
                {t.monthlyCostAdicionalNone}
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 px-2 transition-colors ${bd.adicionalTipo === 'periculosidade' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                onClick={() => setBd(prev => ({ ...prev, adicionalTipo: 'periculosidade' }))}
              >
                {t.monthlyCostPericulosidade}
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 px-2 transition-colors ${bd.adicionalTipo === 'insalubridade' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                onClick={() => setBd(prev => ({ ...prev, adicionalTipo: 'insalubridade' }))}
              >
                {t.monthlyCostInsalubridade}
              </button>
            </div>

            {/* Periculosidade: campo de % */}
            {bd.adicionalTipo === 'periculosidade' && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {t.monthlyCostPericulosidadePercentLabel}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={bd.periculosidadePercent || ''}
                    onChange={e => setBd(prev => ({ ...prev, periculosidadePercent: Number(e.target.value) || 0 }))}
                    placeholder="30"
                    className="h-8 text-sm pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                {cost.adicional > 0 && (
                  <p className="text-[10px] text-muted-foreground">= {fmt(cost.adicional)}</p>
                )}
              </div>
            )}

            {/* Insalubridade: seletor de grau */}
            {bd.adicionalTipo === 'insalubridade' && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {t.monthlyCostInsalubridadeGrauLabel}
                </Label>
                <Select
                  value={String(bd.insalubridadeGrau)}
                  onValueChange={v => setBd(prev => ({ ...prev, insalubridadeGrau: Number(v) as 10 | 20 | 40 }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">
                      {t.monthlyCostInsalubridadeMin}
                    </SelectItem>
                    <SelectItem value="20">
                      {t.monthlyCostInsalubridadeMid}
                    </SelectItem>
                    <SelectItem value="40">
                      {t.monthlyCostInsalubridadeMax}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {cost.adicional > 0 && (
                  <p className="text-[10px] text-muted-foreground">= {fmt(cost.adicional)}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Benefícios */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.monthlyCostSectionBenefits}</h4>
          <div className="grid grid-cols-2 gap-3">
            <CurrencyField label={t.monthlyCostHealthLabel} value={planoSaudeDisplay} onChange={v => updateCurrencyField('planoSaude', v, setPlanoSaudeDisplay)} />
            <CurrencyField label={t.monthlyCostDentalLabel} value={planoOdontoDisplay} onChange={v => updateCurrencyField('planoOdonto', v, setPlanoOdontoDisplay)} />
            <CurrencyField label={t.monthlyCostLifeInsLabel} value={seguroVidaDisplay} onChange={v => updateCurrencyField('seguroVida', v, setSeguroVidaDisplay)} />
            <CurrencyField label={t.monthlyCostTransportLabel} value={transporteDisplay} onChange={v => updateCurrencyField('transporte', v, setTransporteDisplay)} />
            <CurrencyField label={t.monthlyCostMealLabel} value={refeicaoDisplay} onChange={v => updateCurrencyField('refeicao', v, setRefeicaoDisplay)} />
          </div>
        </div>

        {/* Anuais rateados */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.monthlyCostSectionAnnual}</h4>
          <div className="grid grid-cols-2 gap-3">
            <CurrencyField label={t.monthlyCostTrainingLabel} value={treinamentosDisplay} onChange={v => updateCurrencyField('treinamentosAnual', v, setTreinamentosDisplay)} hint={bd.treinamentosAnual > 0 ? t.monthlyCostAnnualHint.replace('{amount}', fmt(bd.treinamentosAnual / 12)) : undefined} />
            <CurrencyField label={t.monthlyCostAsoLabel} value={asoDisplay} onChange={v => updateCurrencyField('asoAnual', v, setAsoDisplay)} hint={bd.asoAnual > 0 ? t.monthlyCostAnnualHint.replace('{amount}', fmt(bd.asoAnual / 12)) : undefined} />
            <CurrencyField label={t.monthlyCostEpiLabel} value={epiDisplay} onChange={v => updateCurrencyField('epiAnual', v, setEpiDisplay)} hint={bd.epiAnual > 0 ? t.monthlyCostAnnualHint.replace('{amount}', fmt(bd.epiAnual / 12)) : undefined} />
            <CurrencyField label={t.monthlyCostPhoneLabel} value={celularDisplay} onChange={v => updateCurrencyField('celularAnual', v, setCelularDisplay)} hint={bd.celularAnual > 0 ? t.monthlyCostAnnualHint.replace('{amount}', fmt(bd.celularAnual / 12)) : undefined} />
          </div>
        </div>

        {/* Jornada */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.monthlyCostSectionWorkload}</h4>
          <div className="space-y-1">
            <Label className="text-xs">{t.monthlyCostWorkHoursLabel}</Label>
            <div className="relative">
              <NumericInput
                value={bd.monthlyHours ? String(bd.monthlyHours) : ''}
                onValueChange={v => setBd(prev => ({ ...prev, monthlyHours: Number(v) || 0 }))}
                placeholder="176"
                className="h-8 text-sm pr-8"
              />
              <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {defaultMonthlyHours && defaultMonthlyHours !== 176
                ? t.monthlyCostWorkHoursHint.replace('{hours}', String(defaultMonthlyHours))
                : t.monthlyCostWorkHoursDefault}
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground border-l-2 border-amber-400 pl-2">
          {t.monthlyCostDisclaimer}
        </p>

        {/* Resumo itemizado */}
        <div className="rounded-lg border p-3 bg-muted/30 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t.monthlyCostSummaryBase}</span>
            <span>{fmt(bd.baseSalary)}</span>
          </div>
          {cost.adicional > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {t.monthlyCostAdicionalSummary.replace('{tipo}', bd.adicionalTipo === 'periculosidade' ? `${bd.periculosidadePercent}%` : `grau ${bd.insalubridadeGrau}%`)}
              </span>
              <span>{fmt(cost.adicional)}</span>
            </div>
          )}

          {/* Guardar por mês */}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {t.monthlyCostGuardarSummary}
            </span>
            <span>{fmt(cost.guardarPorMes.ferias + cost.guardarPorMes.decimoTerceiro + cost.guardarPorMes.multaRescisoria)}</span>
          </div>

          {/* Encargos do mês */}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {bd.regime === 'lucro_real' && cost.encargosDoMes.inssPatronal > 0
                ? t.monthlyCostEncargosLucro
                : t.monthlyCostEncargosSimples}
            </span>
            <span>{fmt(cost.encargosDoMes.fgts + cost.encargosDoMes.fgtsSobre13Fer + cost.encargosDoMes.inssPatronal)}</span>
          </div>

          {cost.beneficios > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t.monthlyCostSummaryBenefits}</span>
              <span>{fmt(cost.beneficios)}</span>
            </div>
          )}
          {cost.anuaisRateados > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t.monthlyCostSummaryAnnual}</span>
              <span>{fmt(cost.anuaisRateados)}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm font-semibold">{t.monthlyCostSummaryTotal}</span>
            <span className="text-sm font-bold text-primary">{fmt(total)}</span>
          </div>

          {/* Fator multiplicador */}
          {bd.baseSalary > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {t.monthlyCostFatorLabel}
              </span>
              <span className="text-xs font-semibold">
                ×{cost.custoPercentual.toLocaleString(locale === 'pt-br' ? 'pt-BR' : locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {bd.monthlyHours > 0 && total > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">{t.monthlyCostSummaryHH}</span>
              <span className="text-sm font-bold text-primary">{fmt(hourlyRate)}/h</span>
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
