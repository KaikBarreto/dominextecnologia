import { useMemo, useState } from 'react';
import { AlertTriangle, CircuitBoard, Settings2, Zap } from 'lucide-react';
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
import { ToolDisclaimer } from './ToolDisclaimer';
import {
  BTUS_PADRAO,
  calcularCapacitor,
  calcularCapacitorPorLRA,
  formatarNumero,
} from '@/lib/capacitor';
import {
  correnteNominalPorCV,
  dimensionarContator,
  RENDIMENTO_PADRAO,
  COSPHI_PADRAO,
  FATOR_SERVICO,
} from '@/lib/contator';

/** Valor sentinela do select para o modo de BTU livre. */
const PERSONALIZADO = 'personalizado';

/** Fase da máquina: monofásico (usa capacitor) ou trifásico (usa contator). */
type Fase = 'mono' | 'tri';

/** Modo de cálculo monofásico: estimativa por BTU (atual) ou preciso por LRA. */
type Modo = 'btu' | 'lra';

/** Modo de entrada trifásico: corrente direta da placa (A) ou potência (CV). */
type ModoTri = 'corrente' | 'cv';

/** Props compartilhadas pelos ramos: o switch de Fase mora no topo de cada ramo. */
interface RamoProps {
  fase: Fase;
  setFase: (v: Fase) => void;
}

/** Converte string crua em número, com fallback (padrão do projeto p/ inputs numéricos). */
function num(s: string, fallback = 0): number {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function CalculoCapacitor() {
  // Fase da máquina. Default: monofásico (mantém o comportamento atual).
  const [fase, setFase] = usePersistedState<Fase>('tt:state:capacitor:fase', 'mono');

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Cálculo de Capacitor</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          {fase === 'mono'
            ? 'Capacitor recomendado pela fase, BTU/LRA e tensão.'
            : 'Máquina trifásica não usa capacitor: dimensione contatora e relé térmico.'}
        </p>
      </div>

      {fase === 'mono' ? (
        <RamoMonofasico fase={fase} setFase={setFase} />
      ) : (
        <RamoTrifasico fase={fase} setFase={setFase} />
      )}
    </div>
  );
}

/** Ramo MONOFÁSICO — fluxo original (capacitor por BTU ou LRA). Sem regressão. */
function RamoMonofasico({ fase, setFase }: RamoProps) {
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
    <>
      {/* Card de entrada — linha de controles (Fase + Cálculo) no topo + campos abaixo */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        {/* Dois switches lado a lado, na mesma linha, cada um com seu rótulo */}
        <div className="grid grid-cols-2 gap-3 border-b border-border pb-4">
          <div className="flex flex-col items-center gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fase</Label>
            <LabeledSwitch
              value={fase}
              onChange={(v) => setFase(v)}
              off={{ value: 'mono', label: 'Monofásico' }}
              on={{ value: 'tri', label: 'Trifásico' }}
              aria-label="Fase da máquina"
            />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cálculo</Label>
            <LabeledSwitch
              value={modo}
              onChange={(v) => setModo(v)}
              off={{ value: 'btu', label: 'Estimativa (BTU)' }}
              on={{ value: 'lra', label: 'Preciso (LRA)' }}
              aria-label="Modo de cálculo do capacitor"
            />
          </div>
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

      <ToolDisclaimer texto="Ferramenta de apoio. O cálculo por BTU é uma estimativa de mercado (média de potência dos 10 principais modelos de ar condicionado no Brasil); o modo Preciso usa o LRA da etiqueta do compressor. Confira sempre a placa do equipamento, os manuais do fabricante e as normas técnicas aplicáveis antes de executar." />
    </>
  );
}

/** Ramo TRIFÁSICO — sem capacitor: dimensiona contator AC-3 + relé térmico. */
function RamoTrifasico({ fase, setFase }: RamoProps) {
  const [avancadoAberto, setAvancadoAberto] = useState(false);

  // Modo de entrada. Default: corrente direta da placa (preferido).
  const [modoTri, setModoTri] = usePersistedState<ModoTri>(
    'tt:state:capacitor:modoTri',
    'corrente',
  );

  // Corrente nominal lida direto da placa (A).
  const [correnteStr, setCorrenteStr] = usePersistedState<string>(
    'tt:state:capacitor:correnteTri',
    '',
  );

  // Potência (CV) + tensão trifásica (modo CV).
  const [cvStr, setCvStr] = usePersistedState<string>('tt:state:capacitor:cv', '');
  const [tensaoTri, setTensaoTri] = usePersistedState<string>(
    'tt:state:capacitor:tensaoTri',
    '220',
  );

  // Parâmetros avançados de placa (defaults WEG W22).
  const [rendimentoStr, setRendimentoStr] = usePersistedState<string>(
    'tt:state:capacitor:rendimento',
    String(RENDIMENTO_PADRAO),
  );
  const [cosphiStr, setCosphiStr] = usePersistedState<string>(
    'tt:state:capacitor:cosphi',
    String(COSPHI_PADRAO),
  );

  // Corrente nominal: direta (modo corrente) ou derivada do CV (modo cv).
  const correnteNominal = useMemo(() => {
    if (modoTri === 'corrente') {
      const inA = num(correnteStr);
      return inA > 0 ? inA : null;
    }
    return correnteNominalPorCV(
      num(cvStr),
      num(tensaoTri),
      num(rendimentoStr, RENDIMENTO_PADRAO),
      num(cosphiStr, COSPHI_PADRAO),
    );
  }, [modoTri, correnteStr, cvStr, tensaoTri, rendimentoStr, cosphiStr]);

  const resultado = useMemo(
    () => (correnteNominal !== null ? dimensionarContator(correnteNominal) : null),
    [correnteNominal],
  );

  return (
    <>
      {/* Card de entrada — linha de controles (Fase + Entrada) no topo + campos abaixo */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        {/* Dois switches lado a lado, na mesma linha, cada um com seu rótulo */}
        <div className="grid grid-cols-2 gap-3 border-b border-border pb-4">
          <div className="flex flex-col items-center gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fase</Label>
            <LabeledSwitch
              value={fase}
              onChange={(v) => setFase(v)}
              off={{ value: 'mono', label: 'Monofásico' }}
              on={{ value: 'tri', label: 'Trifásico' }}
              aria-label="Fase da máquina"
            />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Entrada</Label>
            <LabeledSwitch
              value={modoTri}
              onChange={(v) => setModoTri(v)}
              off={{ value: 'corrente', label: 'Corrente (A)' }}
              on={{ value: 'cv', label: 'Potência (CV)' }}
              aria-label="Modo de entrada trifásico"
            />
          </div>
        </div>

        {modoTri === 'corrente' ? (
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">
              Corrente nominal (A) — do motor/compressor
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              value={correnteStr}
              onChange={(e) => setCorrenteStr(e.target.value)}
              placeholder="Ex: 2,9"
              className="h-14 text-lg md:h-14 md:text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Use o valor de corrente (In) impresso na placa do motor/compressor.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-base text-muted-foreground md:text-lg">Potência (CV)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={cvStr}
                  onChange={(e) => setCvStr(e.target.value)}
                  placeholder="Ex: 1"
                  className="h-14 text-lg md:h-14 md:text-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-base text-muted-foreground md:text-lg">
                  Tensão trifásica
                </Label>
                <div className="flex h-14 items-center justify-center rounded-lg border border-border bg-background">
                  <LabeledSwitch
                    value={tensaoTri}
                    onChange={setTensaoTri}
                    off={{ value: '220', label: '220V' }}
                    on={{ value: '380', label: '380V' }}
                    size="lg"
                    aria-label="Tensão trifásica da rede"
                  />
                </div>
              </div>
            </div>

            {/* Avançado: η e cosφ (defaults de placa WEG) */}
            <div>
              <button
                type="button"
                onClick={() => setAvancadoAberto((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Settings2 className="h-4 w-4" />
                Parâmetros de placa (avançado)
              </button>
              {avancadoAberto && (
                <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">Rendimento (η)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      value={rendimentoStr}
                      onChange={(e) => setRendimentoStr(e.target.value)}
                      placeholder={String(RENDIMENTO_PADRAO)}
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">Fator de potência (cosφ)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={cosphiStr}
                      onChange={(e) => setCosphiStr(e.target.value)}
                      placeholder={String(COSPHI_PADRAO)}
                      className="h-12 text-base"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground md:col-span-2">
                    Padrões de placa WEG W22 premium. Ajuste se a placa do motor trouxer valores
                    diferentes.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Resultado ao vivo */}
      <div className="mx-auto max-w-4xl rounded-lg border border-border bg-background p-5">
        {resultado ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contator recomendado
                </p>
                <p className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">
                  Contator de{' '}
                  <span className="whitespace-nowrap text-primary">
                    {formatarNumero(resultado.contatorAC3)} A
                  </span>
                </p>
                <p className="text-base font-medium leading-tight text-muted-foreground sm:text-lg">
                  categoria AC-3
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tripolar, para motor trifásico.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Corrente nominal
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                    {formatarNumero(resultado.correnteNominal)}
                    <span className="ml-1 text-base font-semibold sm:text-lg">A</span>
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Corrente de emprego
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                    {formatarNumero(resultado.correnteEmprego)}
                    <span className="ml-1 text-base font-semibold sm:text-lg">A</span>
                  </p>
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                Ie = In {formatarNumero(resultado.correnteNominal)} A × {formatarNumero(FATOR_SERVICO)}{' '}
                (fator de serviço).
              </p>

              {resultado.acimaDaLinha && (
                <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-xs leading-relaxed text-foreground">
                    Corrente acima da linha comercial padrão. Consulte dimensionamento
                    especializado.
                  </p>
                </div>
              )}
            </div>

            <SpecPhotoCard
              className="lg:order-first lg:w-[22rem] lg:shrink-0"
              titulo="Manobra trifásica"
              fotoSrc="/images/contatora.png"
              fotoAlt="Contatora tripolar AC-3"
              fallbackIcon={Zap}
              specs={
                [
                  { label: 'Contator', value: `${formatarNumero(resultado.contatorAC3)} A AC-3` },
                  { label: 'Tipo', value: 'Tripolar (potência)' },
                  {
                    label: 'Relé térmico',
                    value: `regular ~${formatarNumero(resultado.releTermico)} A`,
                  },
                ] satisfies Spec[]
              }
            />
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {modoTri === 'corrente'
              ? 'Informe a corrente nominal (A) da placa para dimensionar o contator.'
              : 'Informe a potência (CV) e a tensão para dimensionar o contator.'}
          </p>
        )}
      </div>

      {/* Relé térmico — instrução de regulagem */}
      {resultado && (
        <div className="mx-auto flex max-w-4xl gap-2.5 rounded-lg border border-border bg-card p-3">
          <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-foreground">
            <span className="font-semibold">Relé térmico: </span>regule para a corrente nominal do
            motor (~{formatarNumero(resultado.releTermico)} A).
          </p>
        </div>
      )}

      {/* Nota destacada — trifásico não usa capacitor */}
      <div className="mx-auto flex max-w-4xl gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-semibold">Máquina trifásica não usa capacitor.</span> A partida é
          feita pelas 3 fases e a manobra/proteção por contatora (AC-3) + relé térmico.
        </p>
      </div>

      <ToolDisclaimer />
    </>
  );
}
