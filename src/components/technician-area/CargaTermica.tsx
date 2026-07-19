import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Calculator } from 'lucide-react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { calcularCargaTermica, formatarBtus } from '@/lib/cargaTermica';
import { ToolDisclaimer } from './ToolDisclaimer';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface CargaTermicaProps {
  /**
   * Quando presente, exibe um botão "Usar resultado" que devolve o valor
   * calculado em TR (Tonelada de Refrigeração), formatado em padrão BR (vírgula).
   * Sem essa prop, a ferramenta se comporta de forma idêntica ao standalone.
   */
  onApply?: (trBR: string) => void;
}

/** Converte string crua de input numérico em number, com default seguro. */
function num(str: string, def = 0): number {
  const parsed = Number(str.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : def;
}

type TThermalLoad = (typeof MESSAGES)['pt-br']['app']['technicianTools']['thermalLoad'];

interface CampoNum {
  id: string;
  fieldKey: keyof TThermalLoad['fields'];
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric';
}

const CAMPOS: CampoNum[] = [
  { id: 'altura', fieldKey: 'height', placeholder: 'Ex: 2,8', inputMode: 'decimal' },
  { id: 'largura', fieldKey: 'width', placeholder: 'Ex: 4', inputMode: 'decimal' },
  { id: 'comprimento', fieldKey: 'length', placeholder: 'Ex: 5', inputMode: 'decimal' },
  { id: 'pessoas', fieldKey: 'people', placeholder: 'Ex: 2', inputMode: 'numeric' },
  { id: 'eletronicos', fieldKey: 'electronics', placeholder: 'Ex: 3', inputMode: 'numeric' },
  { id: 'janelas', fieldKey: 'windows', placeholder: 'Ex: 1', inputMode: 'numeric' },
];

export function CargaTermica({ onApply }: CargaTermicaProps = {}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.thermalLoad;
  // Estado em string crua — convertido com num() só no cálculo.
  const [valores, setValores] = usePersistedState<Record<string, string>>(
    'tt:state:carga-termica:valores',
    {
      altura: '',
      largura: '',
      comprimento: '',
      pessoas: '',
      eletronicos: '',
      janelas: '',
    },
  );
  const [ensolarado, setEnsolarado] = usePersistedState<boolean>(
    'tt:state:carga-termica:ensolarado',
    false,
  );
  // Unidade do resultado: BTU (padrão) ou TR (Tonelada de Refrigeração). 1 TR = 12.000 BTU/h.
  const [unidadeResultado, setUnidadeResultado] = usePersistedState<'btu' | 'tr'>(
    'tt:state:carga-termica:unidadeResultado',
    'btu',
  );

  const setCampo = (id: string, v: string) => setValores((prev) => ({ ...prev, [id]: v }));

  // Cálculo ao vivo: recalcula a cada digitação/toggle.
  const { btus, temArea } = useMemo(() => {
    const largura = num(valores.largura);
    const comprimento = num(valores.comprimento);
    const resultado = calcularCargaTermica({
      altura: num(valores.altura),
      largura,
      comprimento,
      pessoas: num(valores.pessoas),
      eletronicos: num(valores.eletronicos),
      janelas: num(valores.janelas),
      ensolarado,
    });
    return { btus: resultado, temArea: largura * comprimento > 0 };
  }, [valores, ensolarado]);

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">{t.title}</h2>
        <p className="text-sm text-muted-foreground md:text-base">{t.subtitle}</p>
      </div>

      {/* Form agrupado num card — grid 2 colunas no desktop, 1 no mobile */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CAMPOS.map((campo) => (
            <div key={campo.id} className="space-y-1.5">
              <Label htmlFor={campo.id} className="text-base text-muted-foreground md:text-lg">
                {t.fields[campo.fieldKey]}
              </Label>
              <Input
                id={campo.id}
                type="text"
                inputMode={campo.inputMode}
                placeholder={campo.placeholder}
                value={valores[campo.id]}
                onChange={(e) => setCampo(campo.id, e.target.value)}
                className="h-14 text-lg"
              />
            </div>
          ))}

          {/* Toggle ocupa a linha inteira no fim do grid */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 md:col-span-2">
            <Label htmlFor="ensolarado" className="cursor-pointer text-base text-foreground">
              {t.sunny}
            </Label>
            <div className="flex items-center gap-2.5">
              <span className={`text-sm font-medium ${!ensolarado ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t.no}
              </span>
              <Switch id="ensolarado" checked={ensolarado} onCheckedChange={setEnsolarado} />
              <span className={`text-sm font-medium ${ensolarado ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t.yes}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Resultado ao vivo — card fixo no fim do conteúdo */}
      <div className="rounded-lg border border-border bg-background p-5 text-center">
        {/* Switch BTU ↔ TR no canto */}
        <div className="mb-1 flex justify-end">
          <LabeledSwitch
            value={unidadeResultado}
            onChange={setUnidadeResultado}
            off={{ value: 'btu', label: 'BTU' }}
            on={{ value: 'tr', label: 'TR' }}
            aria-label="Unidade do resultado: BTU ou Tonelada de Refrigeração"
          />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t.resultLabel}
        </p>
        <p className="mt-2 text-5xl font-bold leading-none text-primary sm:text-7xl">
          {unidadeResultado === 'btu' ? (
            <>
              {formatarBtus(temArea ? btus : 0)}
              <span className="ml-2 text-2xl font-semibold sm:text-3xl">BTUs</span>
            </>
          ) : (
            <>
              {(temArea ? btus / 12000 : 0).toLocaleString('pt-BR', {
                maximumFractionDigits: 2,
              })}
              <span className="ml-2 text-2xl font-semibold sm:text-3xl">TR</span>
            </>
          )}
        </p>
        {temArea && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {unidadeResultado === 'tr' ? t.trNote : t.btuNote}
          </p>
        )}
      </div>

      {/* Botão de aplicar — só aparece quando a ferramenta roda embutida (ex: contrato PMOC).
          Devolve sempre em TR, independente do switch de exibição. */}
      {onApply && (
        <Button
          type="button"
          className="w-full"
          disabled={!temArea}
          onClick={() => {
            const tr = btus / 12000;
            const trBR = String(Number(tr.toFixed(2))).replace('.', ',');
            onApply(trBR);
          }}
        >
          <Calculator className="mr-1.5 h-4 w-4" /> {t.useResult}
        </Button>
      )}

      <ToolDisclaimer texto={t.disclaimer} />
    </div>
  );
}
