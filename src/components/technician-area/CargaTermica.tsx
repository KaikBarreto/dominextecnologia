import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { usePersistedState } from '@/hooks/usePersistedState';
import { calcularCargaTermica, formatarBtus } from '@/lib/cargaTermica';
import { ToolDisclaimer } from './ToolDisclaimer';

/** Converte string crua de input numérico em number, com default seguro. */
function num(str: string, def = 0): number {
  const parsed = Number(str.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : def;
}

interface CampoNum {
  id: string;
  label: string;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric';
}

const CAMPOS: CampoNum[] = [
  { id: 'altura', label: 'Altura (metros)', placeholder: 'Ex: 2,8', inputMode: 'decimal' },
  { id: 'largura', label: 'Largura (metros)', placeholder: 'Ex: 4', inputMode: 'decimal' },
  { id: 'comprimento', label: 'Comprimento (metros)', placeholder: 'Ex: 5', inputMode: 'decimal' },
  { id: 'pessoas', label: 'Quantidade de pessoas', placeholder: 'Ex: 2', inputMode: 'numeric' },
  { id: 'eletronicos', label: 'Eletroeletrônicos', placeholder: 'Ex: 3', inputMode: 'numeric' },
  { id: 'janelas', label: 'Janelas (2 x 1,5 metros)', placeholder: 'Ex: 1', inputMode: 'numeric' },
];

export function CargaTermica() {
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
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Carga Térmica</h2>
        <p className="text-sm text-muted-foreground md:text-base">Dimensione a capacidade em BTUs do ambiente.</p>
      </div>

      {/* Form agrupado num card — grid 2 colunas no desktop, 1 no mobile */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CAMPOS.map((campo) => (
            <div key={campo.id} className="space-y-1.5">
              <Label htmlFor={campo.id} className="text-base text-muted-foreground md:text-lg">
                {campo.label}
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
              Ambiente ensolarado?
            </Label>
            <div className="flex items-center gap-2.5">
              <span className={`text-sm font-medium ${!ensolarado ? 'text-foreground' : 'text-muted-foreground'}`}>
                Não
              </span>
              <Switch id="ensolarado" checked={ensolarado} onCheckedChange={setEnsolarado} />
              <span className={`text-sm font-medium ${ensolarado ? 'text-foreground' : 'text-muted-foreground'}`}>
                Sim
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
          Capacidade necessária
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
            {unidadeResultado === 'tr'
              ? '1 TR (Tonelada de Refrigeração) = 12.000 BTU/h. Recomenda-se não utilizar aparelhos abaixo da potência indicada.'
              : 'Recomenda-se não utilizar aparelhos de ar condicionado abaixo da potência indicada.'}
          </p>
        )}
      </div>

      <ToolDisclaimer texto="Ferramenta de apoio. Esta simulação é uma referência aproximada e não corresponde integralmente às diferentes realidades do local de instalação — confira sempre a placa do equipamento, os manuais do fabricante e as normas técnicas aplicáveis antes de executar." />
    </div>
  );
}
