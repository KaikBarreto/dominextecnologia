import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  BTUS_PADRAO,
  TENSOES,
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
  const [modo, setModo] = useState<Modo>('btu');

  // Default: primeiro BTU padrão e 220V (mais comum em campo).
  const [btu, setBtu] = useState<string>(String(BTUS_PADRAO[0] ?? ''));
  const [btuPersonalizado, setBtuPersonalizado] = useState<string>('');
  const [tensao, setTensao] = useState<string>('220');

  // Modo preciso: LRA do compressor (string crua, igual aos demais inputs).
  const [lra, setLra] = useState<string>('');

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

      {/* Toggle de modo — segmented control de 2 botões */}
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setModo('btu')}
          className={cn(
            'rounded-md px-3 py-2.5 text-sm font-semibold transition-colors',
            modo === 'btu'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Estimativa (BTU)
        </button>
        <button
          type="button"
          onClick={() => setModo('lra')}
          className={cn(
            'rounded-md px-3 py-2.5 text-sm font-semibold transition-colors',
            modo === 'lra'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Preciso (LRA)
        </button>
      </div>

      {modo === 'btu' ? (
        <>
          {/* Seleções — grid 2 colunas no desktop, 1 no mobile */}
          <div className="rounded-lg border border-border bg-card p-4">
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
                <Select value={tensao} onValueChange={setTensao}>
                  <SelectTrigger className="h-14 text-lg md:h-14 md:text-lg">
                    <SelectValue placeholder="Tensão" />
                  </SelectTrigger>
                  <SelectContent>
                    {TENSOES.map((t) => (
                      <SelectItem key={t} value={String(t)}>
                        {t}V
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Resultado ao vivo — card fixo no fim do conteúdo */}
          <div className="rounded-lg border border-border bg-background p-5">
            {resultado ? (
              <div className="space-y-4">
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
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Selecione o BTU e a tensão para ver o capacitor recomendado.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Entrada LRA */}
          <div className="rounded-lg border border-border bg-card p-4">
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
          </div>

          {/* Resultado ao vivo — só µF */}
          <div className="rounded-lg border border-border bg-background p-5">
            {capacitorLRA !== null ? (
              <div className="space-y-2 text-center">
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
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Informe o LRA do compressor para ver o capacitor recomendado.
              </p>
            )}
          </div>
        </>
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
