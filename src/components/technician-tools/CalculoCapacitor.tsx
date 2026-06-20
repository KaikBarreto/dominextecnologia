import { useMemo } from 'react';
import { AlertTriangle, CircuitBoard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { usePersistedState } from '@/hooks/usePersistedState';
import { SpecPhotoCard, type Spec } from './SpecPhotoCard';
import {
  BTUS_PADRAO,
  calcularCapacitor,
  calcularCapacitorPorLRA,
  formatarNumero,
} from '@/lib/capacitor';

/** Valor sentinela do select para o modo de BTU livre. */
const PERSONALIZADO = 'personalizado';

/** Modo de cálculo: estimativa por BTU (atual) ou preciso por LRA do compressor. */
type Modo = 'btu' | 'lra';

/** Converte string crua em número, com fallback (padrão do projeto p/ inputs numéricos). */
function num(s: string, fallback = 0): number {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function CalculoCapacitor() {
  // Modo de cálculo. Default: estimativa por BTU (comportamento atual).
  const [modo, setModo] = usePersistedState<Modo>('tt:state:capacitor:modo', 'btu');

  // Default: primeiro BTU padrão e 220V (mais comum em campo).
  const [btu, setBtu] = usePersistedState<string>(
    'tt:state:capacitor:btu',
    String(BTUS_PADRAO[0] ?? ''),
  );
  const [btuPersonalizado, setBtuPersonalizado] = usePersistedState<string>(
    'tt:state:capacitor:btuPersonalizado',
    '',
  );
  const [tensao, setTensao] = usePersistedState<string>('tt:state:capacitor:tensao', '220');

  // Modo preciso: LRA do compressor (string crua, igual aos demais inputs).
  const [lra, setLra] = usePersistedState<string>('tt:state:capacitor:lra', '');

  const isPersonalizado = btu === PERSONALIZADO;

  // Cálculo ao vivo (modo BTU): recalcula a cada troca de BTU/tensão.
  const resultado = useMemo(() => {
    const b = isPersonalizado ? num(btuPersonalizado) : num(btu);
    const t = num(tensao);
    if (!b || !t) return null;
    return calcularCapacitor(b, t);
  }, [btu, btuPersonalizado, tensao, isPersonalizado]);

  // Cálculo ao vivo (modo LRA): só µF, a partir do LRA da etiqueta.
  const lraNum = num(lra);
  const capacitorLRA = useMemo(() => calcularCapacitorPorLRA(lraNum), [lraNum]);

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Cálculo de Capacitor</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          {modo === 'btu'
            ? 'Capacitor recomendado a partir do BTU e da tensão.'
            : 'Capacitor calculado a partir do LRA do compressor.'}
        </p>
      </div>

      {/* Card de entrada — alavanca de modo no topo + campos abaixo */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        {/* Alavanca on/off: Estimativa (BTU) ←→ Preciso (LRA) */}
        <div className="flex justify-center border-b border-border pb-4">
          <LabeledSwitch
            value={modo}
            onChange={setModo}
            off={{ value: 'btu', label: 'Estimativa (BTU)' }}
            on={{ value: 'lra', label: 'Preciso (LRA)' }}
            size="lg"
            aria-label="Modo de cálculo do capacitor"
          />
        </div>

        {modo === 'btu' ? (
          /* Seleções — grid 2 colunas no desktop, 1 no mobile */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-base text-muted-foreground md:text-lg">Selecione o BTU</Label>
              <Select value={btu} onValueChange={setBtu}>
                <SelectTrigger className="h-14 text-lg md:h-14 md:text-lg">
                  <SelectValue placeholder="BTU" />
                </SelectTrigger>
                <SelectContent>
                  {BTUS_PADRAO.map((b) => (
                    <SelectItem key={b} value={String(b)}>
                      {b.toLocaleString('pt-BR')} BTUs
                    </SelectItem>
                  ))}
                  <SelectItem value={PERSONALIZADO}>Personalizado</SelectItem>
                </SelectContent>
              </Select>
              {isPersonalizado && (
                <Input
                  type="number"
                  inputMode="numeric"
                  value={btuPersonalizado}
                  onChange={(e) => setBtuPersonalizado(e.target.value)}
                  placeholder="Ex: 27000"
                  className="mt-2 h-14 text-lg md:h-14 md:text-lg"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-base text-muted-foreground md:text-lg">
                Selecione a tensão
              </Label>
              <div className="flex h-14 items-center justify-center rounded-lg border border-border bg-background">
                <LabeledSwitch
                  value={tensao}
                  onChange={setTensao}
                  off={{ value: '110', label: '110V' }}
                  on={{ value: '220', label: '220V' }}
                  size="lg"
                  aria-label="Tensão da rede"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Entrada LRA */
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">
              LRA (Locked Rotor Amps)
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              value={lra}
              onChange={(e) => setLra(e.target.value)}
              placeholder="Ex: 40"
              className="h-14 text-lg md:h-14 md:text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Está na etiqueta do compressor (LRA).
            </p>
          </div>
        )}
      </div>

      {/* Resultado ao vivo — card fixo no fim do conteúdo */}
      {modo === 'btu' ? (
        <div className="mx-auto max-w-4xl rounded-lg border border-border bg-background p-5">
          {resultado ? (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
              <div className="min-w-0 flex-1 space-y-4">
                <div className="text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Capacitor recomendado
                  </p>
                  <p className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">
                    Use o capacitor de{' '}
                    <span className="text-primary">{formatarNumero(resultado.capacitorUF)} µF</span>{' '}
                    à 380/440v
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Amper
                    </p>
                    <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                      {formatarNumero(resultado.amper)}
                      <span className="ml-1 text-base font-semibold sm:text-lg">A</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Potência
                    </p>
                    <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                      {formatarNumero(resultado.potenciaWatts)}
                      <span className="ml-1 text-base font-semibold sm:text-lg">watts</span>
                    </p>
                  </div>
                </div>
              </div>

              <SpecPhotoCard
                className="lg:order-first lg:w-[22rem] lg:shrink-0"
                titulo="Capacitor recomendado"
                fotoSrc="/images/capacitores/capacitor.png"
                fotoAlt="Capacitor permanente"
                fallbackIcon={CircuitBoard}
                specs={
                  [
                    { label: 'Capacitância', value: `${formatarNumero(resultado.capacitorUF)} µF` },
                    { label: 'Tensão', value: '380/440 VAC' },
                    { label: 'Tipo', value: 'Permanente (regime)' },
                  ] satisfies Spec[]
                }
              />
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Selecione o BTU e a tensão para ver o capacitor recomendado.
            </p>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-4xl rounded-lg border border-border bg-background p-5">
          {capacitorLRA !== null ? (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
              <div className="min-w-0 flex-1 space-y-2 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Capacitor recomendado
                </p>
                <p className="text-2xl font-semibold leading-tight sm:text-3xl">
                  Use o capacitor de{' '}
                  <span className="text-primary">{formatarNumero(capacitorLRA)} µF</span> à 380/440v
                </p>
                <p className="text-xs text-muted-foreground">
                  Calculado a partir de LRA {formatarNumero(lraNum)} A.
                </p>
              </div>

              <SpecPhotoCard
                className="lg:order-first lg:w-[22rem] lg:shrink-0"
                titulo="Capacitor recomendado"
                fotoSrc="/images/capacitores/capacitor.png"
                fotoAlt="Capacitor permanente"
                fallbackIcon={CircuitBoard}
                specs={
                  [
                    { label: 'Capacitância', value: `${formatarNumero(capacitorLRA)} µF` },
                    { label: 'Tensão', value: '380/440 VAC' },
                    { label: 'Tipo', value: 'Permanente (regime)' },
                  ] satisfies Spec[]
                }
              />
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Informe o LRA do compressor para ver o capacitor recomendado.
            </p>
          )}
        </div>
      )}

      {/* Alerta sutil — abaixo do resultado */}
      <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <p className="text-xs leading-relaxed">
          <span className="font-semibold text-foreground">Atenção: </span>A presente simulação de
          cálculo de capacitor corresponde à média de potência em watts dos 10 principais modelos de
          ar condicionado no mercado brasileiro. O modo Preciso usa o LRA da etiqueta do compressor;
          o cálculo por BTU é uma estimativa de mercado.
        </p>
      </div>
    </div>
  );
}
