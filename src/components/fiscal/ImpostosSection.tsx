import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NumericInput } from '@/components/ui/numeric-input';
import { normalizeRegApTribSN, type RegApTribSN } from '@/hooks/useFiscalSettings';
import { MESSAGES } from '@/lib/i18n/messages';

type NfseMessages = (typeof MESSAGES)['pt-br']['app']['nfse'];

export interface ImpostosFormFields {
  regime_tributario: string;
  reg_ap_trib_sn: RegApTribSN;
  percentual_trib_sn: string;
  inscricao_municipal: string;
  inscricao_estadual: string;
}

/**
 * Aviso da consulta de CNPJ sobre a inscrição estadual. Todos os campos são
 * opcionais e meramente informativos: a consulta NUNCA sobrescreve IE digitada.
 * `ausente` é afirmação de que não existe IE ativa; `indisponivel` é falha de
 * consulta (inclui o limite de requisições) e não afirma nada.
 */
export type IeHint =
  | { kind: 'preenchida'; ie: string; uf: string }
  | { kind: 'divergente'; ie: string; uf: string; atual: string }
  | { kind: 'ausente' }
  | { kind: 'indisponivel' };

/**
 * Sugestão de regime tributário vinda da consulta de CNPJ. `applied` = o campo
 * estava vazio e já foi preenchido; `false` = só sugerimos, com botão.
 * `regime` é um literal do select (ver REGIMES abaixo) — nunca texto livre.
 */
export interface RegimeHint {
  regime: string;
  fonte: 'mei' | 'simples' | 'ecf';
  ano: number | null;
  applied: boolean;
}

interface ImpostosSectionProps {
  t: NfseMessages;
  form: ImpostosFormFields;
  onChange: (patch: Partial<ImpostosFormFields>) => void;
  onSave: () => void;
  saving: boolean;
  /** Aditivos: sem eles a seção se comporta exatamente como antes. */
  ieHint?: IeHint | null;
  onUseSintegraIe?: () => void;
  regimeHint?: RegimeHint | null;
  onUseSuggestedRegime?: () => void;
}

/** Seção "Tributação" da tela de Configurações fiscais: regime, apuração do Simples e inscrições. */
export function ImpostosSection({
  t,
  form,
  onChange,
  onSave,
  saving,
  ieHint = null,
  onUseSintegraIe,
  regimeHint = null,
  onUseSuggestedRegime,
}: ImpostosSectionProps) {
  const isSimples = form.regime_tributario === 'simples_nacional';

  const REGIMES = [
    { value: 'simples_nacional', label: t.settings.impostos.regimes.simplesNacional },
    { value: 'lucro_presumido', label: t.settings.impostos.regimes.lucroPresumido },
    { value: 'lucro_real', label: t.settings.impostos.regimes.lucroReal },
    { value: 'mei', label: t.settings.impostos.regimes.mei },
  ];

  const tSintegra = t.settings.impostos.sintegra;
  const regimeLabel = (value: string) => REGIMES.find((r) => r.value === value)?.label ?? value;

  /**
   * Frase de procedência da sugestão de regime. Sempre cita a fonte e, quando a
   * base informa, o ANO — a escrituração mais recente pode estar desatualizada,
   * então o usuário precisa saber de onde veio para conferir com o contador.
   */
  const regimeProcedencia = (hint: RegimeHint): string => {
    const label = regimeLabel(hint.regime);
    const ano = hint.ano != null ? String(hint.ano) : null;
    if (hint.fonte === 'mei') {
      return ano
        ? tSintegra.regimeMei.replace('{ano}', ano)
        : tSintegra.regimeMeiSemAno;
    }
    if (hint.fonte === 'simples') {
      return ano
        ? tSintegra.regimeSimples.replace('{ano}', ano)
        : tSintegra.regimeSimplesSemAno;
    }
    return ano
      ? tSintegra.regimeEcf.replace('{ano}', ano).replace('{regime}', label)
      : tSintegra.regimeEcfSemAno.replace('{regime}', label);
  };

  const REG_AP_TRIB_SN_OPTIONS: { value: RegApTribSN; label: string }[] = [
    { value: '1', label: t.settings.impostos.regApTribSnOptions.opt1 },
    { value: '2', label: t.settings.impostos.regApTribSnOptions.opt2 },
    { value: '3', label: t.settings.impostos.regApTribSnOptions.opt3 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label>{t.settings.impostos.regime}</Label>
          <Select
            value={form.regime_tributario}
            onValueChange={(v) => onChange({ regime_tributario: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t.settings.impostos.regimePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {REGIMES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Procedência da sugestão vinda da consulta de CNPJ. Quando o campo
              já tinha valor, nada é sobrescrito: só oferecemos a troca. */}
          {regimeHint && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{regimeProcedencia(regimeHint)}</p>
              {!regimeHint.applied && regimeHint.regime !== form.regime_tributario && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={onUseSuggestedRegime}
                >
                  {tSintegra.regimeUsar.replace('{regime}', regimeLabel(regimeHint.regime))}
                </Button>
              )}
            </div>
          )}
        </div>
        {/* Apuração de tributos no Simples Nacional — obrigatório no
            layout nacional da NFS-e quando a empresa é optante. */}
        {isSimples && (
          <div className="space-y-2 sm:col-span-2">
            <Label>{t.settings.impostos.regApTribSn}</Label>
            <Select
              value={form.reg_ap_trib_sn}
              onValueChange={(v) => onChange({ reg_ap_trib_sn: normalizeRegApTribSN(v) })}
            >
              <SelectTrigger className="h-auto min-h-10 py-2 text-left [&>span]:line-clamp-none [&>span]:whitespace-normal">
                <SelectValue placeholder={t.settings.impostos.regApTribSnPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {REG_AP_TRIB_SN_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t.settings.impostos.regApTribSnHint}</p>
          </div>
        )}
        {/* Default do percentual de tributos do Simples Nacional — hoje
            o contador tinha que redigitar esse número em TODA nota;
            aqui vira o valor inicial (ainda editável por nota). */}
        {isSimples && (
          <div className="space-y-2 sm:col-span-2">
            <Label>{t.settings.impostos.percentualTribSn.label}</Label>
            <NumericInput
              decimal
              maxDecimals={4}
              value={form.percentual_trib_sn}
              onValueChange={(v) => onChange({ percentual_trib_sn: v })}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground">
              {t.settings.impostos.percentualTribSn.hint}
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label>{t.settings.impostos.inscricaoMunicipal}</Label>
          <Input
            value={form.inscricao_municipal}
            onChange={(e) => onChange({ inscricao_municipal: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t.settings.impostos.inscricaoEstadual}</Label>
          <Input
            value={form.inscricao_estadual}
            onChange={(e) => onChange({ inscricao_estadual: e.target.value })}
          />
          {ieHint?.kind === 'preenchida' && (
            <p className="text-xs text-muted-foreground">
              {tSintegra.iePreenchida.replace('{ie}', ieHint.ie).replace('{uf}', ieHint.uf)}
            </p>
          )}
          {ieHint?.kind === 'divergente' && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                {tSintegra.ieDivergente
                  .replace('{ie}', ieHint.ie)
                  .replace('{uf}', ieHint.uf)
                  .replace('{atual}', ieHint.atual)}
              </p>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={onUseSintegraIe}
              >
                {tSintegra.ieUsar}
              </Button>
            </div>
          )}
          {ieHint?.kind === 'ausente' && (
            <p className="text-xs text-muted-foreground">{tSintegra.ieAusente}</p>
          )}
          {ieHint?.kind === 'indisponivel' && (
            <p className="text-xs text-muted-foreground">{tSintegra.ieIndisponivel}</p>
          )}
        </div>
      </div>

      {/* Barra de ação fixa no rodapé — mesmo tratamento da seção Empresa. */}
      <div className="sticky bottom-[calc(96px+env(safe-area-inset-bottom))] lg:bottom-3 z-20 mt-6 flex flex-wrap items-center gap-2 border-t bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button onClick={onSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {t.settings.impostos.saveBtn}
        </Button>
      </div>
    </div>
  );
}
