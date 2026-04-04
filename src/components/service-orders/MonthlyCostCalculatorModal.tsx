import { useState, useMemo, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator } from 'lucide-react';
import { formatBRL } from '@/utils/currency';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';

export interface MonthlyCostBreakdown {
  baseSalary: number;
  periculosidade: number; // percentage
  leisSociais: number; // percentage
  planoSaude: number;
  planoOdonto: number;
  seguroVida: number;
  transporte: number;
  refeicao: number;
  treinamentosAnual: number;
  asoAnual: number;
  epiAnual: number;
  celularAnual: number;
}

export const defaultBreakdown: MonthlyCostBreakdown = {
  baseSalary: 0,
  periculosidade: 30,
  leisSociais: 80,
  planoSaude: 0,
  planoOdonto: 0,
  seguroVida: 0,
  transporte: 0,
  refeicao: 0,
  treinamentosAnual: 0,
  asoAnual: 0,
  epiAnual: 0,
  celularAnual: 0,
};

interface MonthlyCostCalculatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSalary?: number;
  initialBreakdown?: MonthlyCostBreakdown | null;
  onApply: (totalCost: number, breakdown: MonthlyCostBreakdown) => void;
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

function PercentField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          type="number" min={0} max={100} step={1}
          value={value || ''}
          onChange={e => onChange(Number(e.target.value) || 0)}
          placeholder="0"
          className="h-8 text-sm pr-8"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MonthlyCostCalculatorModal({ open, onOpenChange, initialSalary, initialBreakdown, onApply }: MonthlyCostCalculatorModalProps) {
  const [bd, setBd] = useState<MonthlyCostBreakdown>({ ...defaultBreakdown });

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
    const b = initialBreakdown ?? { ...defaultBreakdown, baseSalary: initialSalary ?? 0 };
    setBd(b);
    const fmt = (v: number) => v > 0 ? currencyMask(String(Math.round(v * 100))) : '';
    setSalaryDisplay(fmt(b.baseSalary));
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

  const total = useMemo(() => {
    const salarioBase = bd.baseSalary;
    const periculosidadeVal = salarioBase * (bd.periculosidade / 100);
    const subtotalComPeric = salarioBase + periculosidadeVal;
    const leisSociaisVal = subtotalComPeric * (bd.leisSociais / 100);
    const beneficios = bd.planoSaude + bd.planoOdonto + bd.seguroVida + bd.transporte + bd.refeicao;
    const anuaisRateados = (bd.treinamentosAnual + bd.asoAnual + bd.epiAnual + bd.celularAnual) / 12;
    return subtotalComPeric + leisSociaisVal + beneficios + anuaisRateados;
  }, [bd]);

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

  const periculosidadeVal = bd.baseSalary * (bd.periculosidade / 100);
  const subtotalComPeric = bd.baseSalary + periculosidadeVal;
  const leisSociaisVal = subtotalComPeric * (bd.leisSociais / 100);

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
            <PercentField
              label="Periculosidade"
              value={bd.periculosidade}
              onChange={v => setBd(prev => ({ ...prev, periculosidade: v }))}
              hint={periculosidadeVal > 0 ? `= R$ ${formatBRL(periculosidadeVal)}` : undefined}
            />
            <PercentField
              label="Leis sociais"
              value={bd.leisSociais}
              onChange={v => setBd(prev => ({ ...prev, leisSociais: v }))}
              hint={leisSociaisVal > 0 ? `= R$ ${formatBRL(leisSociaisVal)}` : undefined}
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

        {/* Resumo */}
        <div className="rounded-lg border p-3 bg-muted/30 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Salário base</span>
            <span>R$ {formatBRL(bd.baseSalary)}</span>
          </div>
          {periculosidadeVal > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">+ Periculosidade ({bd.periculosidade}%)</span>
              <span>R$ {formatBRL(periculosidadeVal)}</span>
            </div>
          )}
          {leisSociaisVal > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">+ Leis sociais ({bd.leisSociais}%)</span>
              <span>R$ {formatBRL(leisSociaisVal)}</span>
            </div>
          )}
          {(bd.planoSaude + bd.planoOdonto + bd.seguroVida + bd.transporte + bd.refeicao) > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">+ Benefícios</span>
              <span>R$ {formatBRL(bd.planoSaude + bd.planoOdonto + bd.seguroVida + bd.transporte + bd.refeicao)}</span>
            </div>
          )}
          {(bd.treinamentosAnual + bd.asoAnual + bd.epiAnual + bd.celularAnual) > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">+ Custos anuais (÷12)</span>
              <span>R$ {formatBRL((bd.treinamentosAnual + bd.asoAnual + bd.epiAnual + bd.celularAnual) / 12)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm font-semibold">Custo Total Mensal</span>
            <span className="text-sm font-bold text-primary">R$ {formatBRL(total)}</span>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
