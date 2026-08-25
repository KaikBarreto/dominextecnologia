import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NumericInput } from '@/components/ui/numeric-input';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import type { NfseValoresState, TpRetIssqn, NfseFisqalTaxResult } from './types';

interface ValoresStepProps {
  valores: NfseValoresState;
  onChange: (patch: Partial<NfseValoresState>) => void;
  taxes: NfseFisqalTaxResult;
  errors: string[];
}

/** Formata número como string PT-BR com vírgula (ex.: "1234,50"). */
function toDisplayBR(v: number): string {
  if (!v) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Converte string PT-BR pra number (ex.: "1.234,50" → 1234.5). */
function fromDisplayBR(s: string): number {
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function ValoresStep({ valores, onChange, taxes, errors }: ValoresStepProps) {
  const { locale, currency } = useAppLocaleContext();
  const s = MESSAGES[locale].app.nfse.stepper;

  // ---- Buffer de texto do campo hero (valorServico) ----
  // Evita reformatar enquanto o usuário digita.
  const [valorText, setValorText] = useState(() =>
    valores.valorServico ? toDisplayBR(valores.valorServico) : '',
  );
  const editingValor = useRef(false);

  useEffect(() => {
    if (editingValor.current) {
      editingValor.current = false;
      return;
    }
    const displayed = fromDisplayBR(valorText);
    if (displayed !== valores.valorServico) {
      setValorText(valores.valorServico ? toDisplayBR(valores.valorServico) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores.valorServico]);

  // ---- Buffers de texto para os campos de retenção federal (R$ absolutos) ----
  const [pisText, setPisText] = useState(() => (valores.valorPis ? toDisplayBR(valores.valorPis) : ''));
  const [cofinsText, setCofinsText] = useState(() => (valores.valorCofins ? toDisplayBR(valores.valorCofins) : ''));
  const [csllText, setCsllText] = useState(() => (valores.valorCsll ? toDisplayBR(valores.valorCsll) : ''));
  const [aliqText, setAliqText] = useState(() => (valores.aliquotaIssqn ? String(valores.aliquotaIssqn).replace('.', ',') : ''));
  const [percSnText, setPercSnText] = useState(() =>
    valores.percentualTribSn ? String(valores.percentualTribSn).replace('.', ',') : '',
  );

  const valorError = errors.find((e) => e.includes('valor') || e.includes('value'));
  const isSimples = valores.percentualTribSn > 0 || !!percSnText;

  const tpRetOptions: { value: TpRetIssqn; label: string }[] = [
    { value: '1', label: s.valores.tpRetIssqn.op1 },
    { value: '2', label: s.valores.tpRetIssqn.op2 },
    { value: '3', label: s.valores.tpRetIssqn.op3 },
  ];

  return (
    <div className="space-y-5">
      {/* Hero: Valor do serviço */}
      <div className="rounded-xl border border-border bg-background p-4 space-y-2">
        <Label htmlFor="nfse-valor" className="text-base font-semibold">
          {s.valores.valorServico.label}{' '}
          <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-muted-foreground shrink-0">R$</span>
          <NumericInput
            id="nfse-valor"
            decimal
            maxDecimals={2}
            value={valorText}
            onValueChange={(v) => {
              editingValor.current = true;
              setValorText(v);
              onChange({ valorServico: fromDisplayBR(v) });
            }}
            className="h-14 text-3xl font-bold tabular-nums px-3"
            placeholder="0,00"
          />
        </div>
        {valorError && <p className="text-sm text-destructive">{valorError}</p>}
        {!valores.valorServico && !valorError && (
          <p className="text-sm text-destructive">{s.valores.valorServico.required}</p>
        )}
      </div>

      <Separator />

      {/* ISS */}
      <div className="space-y-3">
        <Label className="text-base">{s.valores.iss.sectionTitle}</Label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <div className="space-y-1.5">
            <Label htmlFor="nfse-aliq">
              {s.valores.iss.aliquota.label}{' '}
              <span className="text-muted-foreground font-normal text-xs">
                {s.valores.iss.aliquota.optional}
              </span>
            </Label>
            <NumericInput
              id="nfse-aliq"
              decimal
              maxDecimals={4}
              value={aliqText}
              onValueChange={(v) => {
                setAliqText(v);
                onChange({ aliquotaIssqn: fromDisplayBR(v) });
              }}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{s.valores.tpRetIssqn.label}</Label>
            <Select
              value={valores.tpRetIssqn}
              onValueChange={(v) => onChange({ tpRetIssqn: v as TpRetIssqn })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tpRetOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Retenções federais (PIS/COFINS/CSLL — valores em R$) */}
      <div className="space-y-3">
        <Label className="text-base">{s.valores.retencoes.sectionTitle}</Label>
        <p className="text-[11px] text-muted-foreground -mt-1">
          {s.valores.retencoes.hint}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="nfse-pis" className="text-xs text-muted-foreground">
              {s.valores.retencoes.pis}
            </Label>
            <NumericInput
              id="nfse-pis"
              decimal
              maxDecimals={2}
              value={pisText}
              onValueChange={(v) => {
                setPisText(v);
                onChange({ valorPis: fromDisplayBR(v) });
              }}
              placeholder="0,00"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nfse-cofins" className="text-xs text-muted-foreground">
              {s.valores.retencoes.cofins}
            </Label>
            <NumericInput
              id="nfse-cofins"
              decimal
              maxDecimals={2}
              value={cofinsText}
              onValueChange={(v) => {
                setCofinsText(v);
                onChange({ valorCofins: fromDisplayBR(v) });
              }}
              placeholder="0,00"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nfse-csll" className="text-xs text-muted-foreground">
              {s.valores.retencoes.csll}
            </Label>
            <NumericInput
              id="nfse-csll"
              decimal
              maxDecimals={2}
              value={csllText}
              onValueChange={(v) => {
                setCsllText(v);
                onChange({ valorCsll: fromDisplayBR(v) });
              }}
              placeholder="0,00"
              className="h-9"
            />
          </div>
        </div>
      </div>

      {/* Simples Nacional (percentual total de tributos) */}
      <div className="space-y-1.5">
        <Label htmlFor="nfse-perc-sn">
          {s.valores.percTribSn.label}{' '}
          <span className="text-muted-foreground font-normal text-xs">
            {s.valores.percTribSn.optional}
          </span>
        </Label>
        <NumericInput
          id="nfse-perc-sn"
          decimal
          maxDecimals={4}
          value={percSnText}
          onValueChange={(v) => {
            setPercSnText(v);
            onChange({ percentualTribSn: fromDisplayBR(v) });
          }}
          placeholder="0,00"
          className="h-9"
        />
        <p className="text-[11px] text-muted-foreground">
          {s.valores.percTribSn.hint}
        </p>
      </div>

      <Separator />

      {/* Prévia do cálculo */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="bg-muted/60 border-b border-border px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-foreground/80">
          {s.valores.previa.title.replace('{aliq}', String(valores.aliquotaIssqn || 0))}
        </div>
        <div className="divide-y divide-border/60 text-sm">
          <PreviaLinha label={s.valores.previa.valorServico} value={valores.valorServico} currency={currency} locale={locale} />
          <PreviaLinha
            label={s.valores.previa.iss.replace(
              '{tipo}',
              valores.tpRetIssqn === '1'
                ? s.valores.previa.issRetido
                : s.valores.previa.issDue,
            )}
            value={taxes.issValor}
            currency={currency}
            locale={locale}
          />
          {taxes.totalRetencoesFederais > 0 && (
            <PreviaLinha
              label={s.valores.previa.retencoesFederais}
              value={taxes.totalRetencoesFederais}
              currency={currency}
              locale={locale}
            />
          )}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40">
            <span className="font-bold text-foreground">{s.valores.previa.liquido}</span>
            <span className="text-base font-bold text-foreground tabular-nums">
              {formatMoney(taxes.valorLiquido, currency, locale as any)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviaLinha({
  label,
  value,
  currency,
  locale,
}: {
  label: string;
  value: number;
  currency: string;
  locale: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {formatMoney(value, currency, locale as any)}
      </span>
    </div>
  );
}

export default ValoresStep;
