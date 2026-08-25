import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { User, X, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { NfseCustomer } from './types';

interface PessoasStepProps {
  customers: NfseCustomer[];
  isSimples: boolean;

  dataCompetencia: string;
  onDataCompetencia: (v: string) => void;

  regimeApuracao: string;
  onRegimeApuracao: (v: string) => void;

  tomador: NfseCustomer | null;
  onTomadorChange: (c: NfseCustomer | null) => void;

  intermediario: NfseCustomer | null;
  onIntermediarioChange: (c: NfseCustomer | null) => void;

  /** Erros de validação desta etapa (exibidos inline). */
  errors: string[];
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export function PessoasStep({
  customers,
  isSimples,
  dataCompetencia,
  onDataCompetencia,
  regimeApuracao,
  onRegimeApuracao,
  tomador,
  onTomadorChange,
  intermediario,
  onIntermediarioChange,
  errors,
}: PessoasStepProps) {
  const { locale } = useAppLocaleContext();
  const s = MESSAGES[locale].app.nfse.stepper;
  const [showIntermediario, setShowIntermediario] = useState(!!intermediario);

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: c.id,
        label: c.company_name || c.nome_fantasia || c.name,
      })),
    [customers],
  );

  const tomadorId = tomador?.id ?? '';
  const intermediarioId = intermediario?.id ?? '';

  const handleTomadorChange = (id: string) => {
    const found = customers.find((c) => c.id === id) ?? null;
    onTomadorChange(found);
  };

  const handleIntermediarioChange = (id: string) => {
    if (!id) {
      onIntermediarioChange(null);
      return;
    }
    const found = customers.find((c) => c.id === id) ?? null;
    onIntermediarioChange(found);
  };

  const competenciaError = errors.find(
    (e) => e.includes('competência') || e.includes('competencia'),
  );
  const tomadorError = errors.find((e) => e.includes('tomador'));

  return (
    <div className="space-y-5">
      {/* Data de competência + regime (Simples Nacional) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nfse-competencia">
            {s.pessoas.competencia.label}{' '}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="nfse-competencia"
            type="date"
            value={dataCompetencia}
            max={todayISO()}
            onChange={(e) => onDataCompetencia(e.target.value)}
          />
          {competenciaError && (
            <p className="text-sm text-destructive">{competenciaError}</p>
          )}
        </div>

        {isSimples && (
          <div className="space-y-1.5">
            <Label>{s.pessoas.regime.label}</Label>
            <Select value={regimeApuracao} onValueChange={onRegimeApuracao}>
              <SelectTrigger>
                <SelectValue placeholder={s.pessoas.regime.placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="competencia">{s.pessoas.regime.competencia}</SelectItem>
                <SelectItem value="caixa">{s.pessoas.regime.caixa}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {s.pessoas.regime.hint}
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* Tomador */}
      <div className="space-y-1.5">
        <Label>
          {s.pessoas.tomador.label}{' '}
          <span className="text-destructive">*</span>
        </Label>
        <SearchableSelect
          options={customerOptions}
          value={tomadorId}
          onValueChange={handleTomadorChange}
          placeholder={s.pessoas.tomador.placeholder}
          searchPlaceholder={s.pessoas.tomador.searchPlaceholder}
          emptyMessage={s.pessoas.tomador.emptyMessage}
        />
        {tomador && !tomador.document?.trim() && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {s.pessoas.tomador.missingDoc}
          </p>
        )}
        {tomadorError && (
          <p className="text-sm text-destructive">{tomadorError}</p>
        )}
      </div>

      <Separator />

      {/* Intermediário (colapsável) */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowIntermediario((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {showIntermediario ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {s.pessoas.intermediario.toggle}
        </button>

        {showIntermediario && (
          <div className="space-y-2 pl-1">
            {intermediario ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <span className="flex items-center gap-2 truncate text-sm">
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {intermediario.company_name || intermediario.nome_fantasia || intermediario.name}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onIntermediarioChange(null)}
                  className="h-7 w-7 text-muted-foreground hover:bg-red-600 hover:text-white"
                  aria-label={s.pessoas.intermediario.removeAriaLabel}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <SearchableSelect
                  options={customerOptions}
                  value={intermediarioId}
                  onValueChange={handleIntermediarioChange}
                  placeholder={s.pessoas.intermediario.placeholder}
                  searchPlaceholder={s.pessoas.tomador.searchPlaceholder}
                  emptyMessage={s.pessoas.tomador.emptyMessage}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PessoasStep;
