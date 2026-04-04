import { useState, useMemo, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, Clock } from 'lucide-react';
import { formatBRL } from '@/utils/currency';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';

export interface MonthlyCostBreakdown {
  baseSalary: number;
  periculosidade: number;
  periculosidadeMode: 'percent' | 'fixed';
  leisSociais: number;
  leisSociaisMode: 'percent' | 'fixed';
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
}

export const defaultBreakdown: MonthlyCostBreakdown = {
  baseSalary: 0,
  periculosidade: 30,
  periculosidadeMode: 'percent',
  leisSociais: 80,
  leisSociaisMode: 'percent',
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

function ModeToggleField({
  label,
  percentValue,
  fixedValue,
  mode,
  onPercentChange,
  onFixedChange,
  onModeChange,
  computedValue,
}: {
  label: string;
  percentValue: number;
  fixedValue: string;
  mode: 'percent' | 'fixed';
  onPercentChange: (v: number) => void;
  onFixedChange: (v: string) => void;
  onModeChange: (m: 'percent' | 'fixed') => void;
  computedValue: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <div className="flex rounded-md border overflow-hidden text-[10px]">
          <button
            type="button"
            className={`px-2 py-0.5 transition-colors ${mode === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            onClick={() => onModeChange('percent')}
          >
            %
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 transition-colors ${mode === 'fixed' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            onClick={() => onModeChange('fixed')}
          >
            R$
          </button>
        </div>
      </div>
      {mode === 'percent' ? (
        <div className="relative">
          <Input
            type="number" min={0} max={200} step={1}
            value={percentValue || ''}
            onChange={e => onPercentChange(Number(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-sm pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
        </div>
      ) : (
        <Input
          value={fixedValue}
          onChange={e => onFixedChange(currencyMask(e.target.value))}
          placeholder="R$ 0,00"
          className="h-8 text-sm"
        />
      )}
      {computedValue > 0 && (
        <p className="text-[10px] text-muted-foreground">
          = R$ {formatBRL(computedValue)}
        </p>
      )}
    </div>
  );
}

export function MonthlyCostCalculatorModal({ open, onOpenChange, initialSalary, initialBreakdown, onApply, defaultMonthlyHours }: MonthlyCostCalculatorModalProps) {
  const [bd, setBd] = useState<MonthlyCostBreakdown>({ ...defaultBreakdown });

  // Currency display states
  const [salaryDisplay, setSalaryDisplay] = useState('');
  const [pericFixedDisplay, setPericFixedDisplay] = useState('');
  const [leisFixedDisplay, setLeisFixedDisplay] = useState('');
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
      ? { ...defaultBreakdown, ...initialBreakdown, monthlyHours: initialBreakdown.monthlyHours || resolvedHours }
      : { ...defaultBreakdown, baseSalary: initialSalary ?? 0, monthlyHours: resolvedHours };
    setBd(b);
    const fmt = (v: number) => v > 0 ? currencyMask(String(Math.round(v * 100))) : '';
    setSalaryDisplay(fmt(b.baseSalary));
    setPericFixedDisplay(b.periculosidadeMode === 'fixed' ? fmt(b.periculosidade) : '');
    setLeisFixedDisplay(b.leisSociaisMode === 'fixed' ? fmt(b.leisSociais) : '');
    setPlanoSaudeDisplay(fmt(b.planoSaude));
    setPlanoOdontoDisplay(fmt(b.planoOdonto));
    setSeguroVidaDisplay(fmt(b.seguroVida));
    setTransporteDisplay(fmt(b.transporte));
    setRefeicaoDisplay(fmt(b.refeicao));
    setTreinamentosDisplay(fmt(b.treinamentosAnual));
    setAsoDisplay(fmt(b.asoAnual));
    setEpiDisplay(fmt(b.epiAnual));
    setCelularDisplay(fmt(b.celularAnual));
  }, [open, initialBreakdown, initialSalary]);

  const updateCurrencyField = (field: keyof MonthlyCostBreakdown, display: string, setDisplay: (v: string) => void) => {
    setDisplay(display);
    setBd(prev => ({ ...prev, [field]: parseCurrency(display) }));
  };

  // Computed values
  const periculosidadeVal = useMemo(() => {
    if (bd.periculosidadeMode === 'percent') return bd.baseSalary * (bd.periculosidade / 100);
    return bd.periculosidade;
  }, [bd.baseSalary, bd.periculosidade, bd.periculosidadeMode]);

  const subtotalComPeric = bd.baseSalary + periculosidadeVal;

  const leisSociaisVal = useMemo(() => {
    if (bd.leisSociaisMode === 'percent') return subtotalComPeric * (bd.leisSociais / 100);
    return bd.leisSociais;
  }, [subtotalComPeric, bd.leisSociais, bd.leisSociaisMode]);

  const beneficios = bd.planoSaude + bd.planoOdonto + bd.seguroVida + bd.transporte + bd.refeicao;
  const anuaisRateados = (bd.treinamentosAnual + bd.asoAnual + bd.epiAnual + bd.celularAnual) / 12;
  const total = subtotalComPeric + leisSociaisVal + beneficios + anuaisRateados;
  const hourlyRate = bd.monthlyHours > 0 ? total / bd.monthlyHours : 0;

  const handleApply = () => {
    onApply(Math.round(total * 100) / 100, bd);
    onOpenChange(false);
  };

  const footer = (
    <div className="flex gap-2 w-full">
      <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
      <Button className="flex-1" onClick={handleApply}>
        Aplicar R$ {formatBRL(total)}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Calcular Custo Mensal" className="sm:max-w-lg" footer={footer}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Calculator className="h-4 w-4" />
          <span className="text-sm font-medium">Composição do custo mensal</span>
        </div>

        {/* Base + Encargos */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Salário e Encargos</h4>
          <CurrencyField
            label="Salário base"
            value={salaryDisplay}
            onChange={v => updateCurrencyField('baseSalary', v, setSalaryDisplay)}
          />
          <div className="grid grid-cols-2 gap-3">
            <ModeToggleField
              label="Periculosidade"
              percentValue={bd.periculosidadeMode === 'percent' ? bd.periculosidade : 0}
              fixedValue={pericFixedDisplay}
              mode={bd.periculosidadeMode}
              onPercentChange={v => setBd(prev => ({ ...prev, periculosidade: v }))}
              onFixedChange={v => {
                setPericFixedDisplay(v);
                setBd(prev => ({ ...prev, periculosidade: parseCurrency(v) }));
              }}
              onModeChange={m => {
                setBd(prev => ({ ...prev, periculosidadeMode: m, periculosidade: m === 'percent' ? 30 : 0 }));
                if (m === 'fixed') setPericFixedDisplay('');
              }}
              computedValue={periculosidadeVal}
            />
            <ModeToggleField
              label="Leis sociais"
              percentValue={bd.leisSociaisMode === 'percent' ? bd.leisSociais : 0}
              fixedValue={leisFixedDisplay}
              mode={bd.leisSociaisMode}
              onPercentChange={v => setBd(prev => ({ ...prev, leisSociais: v }))}
              onFixedChange={v => {
                setLeisFixedDisplay(v);
                setBd(prev => ({ ...prev, leisSociais: parseCurrency(v) }));
              }}
              onModeChange={m => {
                setBd(prev => ({ ...prev, leisSociaisMode: m, leisSociais: m === 'percent' ? 80 : 0 }));
                if (m === 'fixed') setLeisFixedDisplay('');
              }}
              computedValue={leisSociaisVal}
            />
          </div>
        </div>

        {/* Benefícios */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Benefícios mensais</h4>
          <div className="grid grid-cols-2 gap-3">
            <CurrencyField label="Plano de saúde" value={planoSaudeDisplay} onChange={v => updateCurrencyField('planoSaude', v, setPlanoSaudeDisplay)} />
            <CurrencyField label="Plano odontológico" value={planoOdontoDisplay} onChange={v => updateCurrencyField('planoOdonto', v, setPlanoOdontoDisplay)} />
            <CurrencyField label="Seguro de vida" value={seguroVidaDisplay} onChange={v => updateCurrencyField('seguroVida', v, setSeguroVidaDisplay)} />
            <CurrencyField label="Transporte" value={transporteDisplay} onChange={v => updateCurrencyField('transporte', v, setTransporteDisplay)} />
            <CurrencyField label="Refeição / alimentação" value={refeicaoDisplay} onChange={v => updateCurrencyField('refeicao', v, setRefeicaoDisplay)} />
          </div>
        </div>

        {/* Anuais rateados */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custos anuais (rateado ÷ 12)</h4>
          <div className="grid grid-cols-2 gap-3">
            <CurrencyField label="Treinamentos e NRs" value={treinamentosDisplay} onChange={v => updateCurrencyField('treinamentosAnual', v, setTreinamentosDisplay)} hint={bd.treinamentosAnual > 0 ? `Mensal: R$ ${formatBRL(bd.treinamentosAnual / 12)}` : undefined} />
            <CurrencyField label="ASO / Saúde ocupacional" value={asoDisplay} onChange={v => updateCurrencyField('asoAnual', v, setAsoDisplay)} hint={bd.asoAnual > 0 ? `Mensal: R$ ${formatBRL(bd.asoAnual / 12)}` : undefined} />
            <CurrencyField label="EPI e uniformes" value={epiDisplay} onChange={v => updateCurrencyField('epiAnual', v, setEpiDisplay)} hint={bd.epiAnual > 0 ? `Mensal: R$ ${formatBRL(bd.epiAnual / 12)}` : undefined} />
            <CurrencyField label="Celular e internet" value={celularDisplay} onChange={v => updateCurrencyField('celularAnual', v, setCelularDisplay)} hint={bd.celularAnual > 0 ? `Mensal: R$ ${formatBRL(bd.celularAnual / 12)}` : undefined} />
          </div>
        </div>

        {/* Horas mensais */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Jornada</h4>
          <div className="space-y-1">
            <Label className="text-xs">Horas trabalhadas por mês</Label>
            <div className="relative">
              <Input
                type="number" min={1} step={1}
                value={bd.monthlyHours || ''}
                onChange={e => setBd(prev => ({ ...prev, monthlyHours: Number(e.target.value) || 0 }))}
                placeholder="176"
                className="h-8 text-sm pr-8"
              />
              <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-[10px] text-muted-foreground">Padrão: 176h (22 dias × 8h)</p>
          </div>
        </div>

        {/* Resumo */}
        <div className="rounded-lg border p-3 bg-muted/30 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Salário base</span>
            <span>R$ {formatBRL(bd.baseSalary)}</span>
          </div>
          {periculosidadeVal > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                + Periculosidade {bd.periculosidadeMode === 'percent' ? `(${bd.periculosidade}%)` : ''}
              </span>
              <span>R$ {formatBRL(periculosidadeVal)}</span>
            </div>
          )}
          {leisSociaisVal > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                + Leis sociais {bd.leisSociaisMode === 'percent' ? `(${bd.leisSociais}%)` : ''}
              </span>
              <span>R$ {formatBRL(leisSociaisVal)}</span>
            </div>
          )}
          {beneficios > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">+ Benefícios</span>
              <span>R$ {formatBRL(beneficios)}</span>
            </div>
          )}
          {anuaisRateados > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">+ Custos anuais (÷12)</span>
              <span>R$ {formatBRL(anuaisRateados)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm font-semibold">Custo Total Mensal</span>
            <span className="text-sm font-bold text-primary">R$ {formatBRL(total)}</span>
          </div>
          {bd.monthlyHours > 0 && total > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Hora Homem (HH)</span>
              <span className="text-sm font-bold text-primary">R$ {formatBRL(hourlyRate)}/h</span>
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
