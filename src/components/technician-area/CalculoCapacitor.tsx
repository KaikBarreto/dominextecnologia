import { useMemo, useState } from 'react';
import { AlertTriangle, CircuitBoard, Settings2, Zap } from 'lucide-react';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { usePersistedState } from '@/hooks/usePersistedState';
import { SpecPhotoCard, type Spec } from './SpecPhotoCard';
import { ToolDisclaimer } from './ToolDisclaimer';
import { formatarNumero } from '@/lib/capacitor';
import {
  correnteNominalPorCV,
  dimensionarContator,
  RENDIMENTO_PADRAO,
  COSPHI_PADRAO,
  FATOR_SERVICO,
} from '@/lib/contator';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/** Fase da máquina. */
type Fase = 'mono' | 'tri';

/** Modo de entrada trifásico: corrente direta da placa (A) ou potência (CV). */
type ModoTri = 'corrente' | 'cv';

type TCapacitor = (typeof MESSAGES)['pt-br']['app']['technicianTools']['capacitor'];

/** Props compartilhadas pelos ramos: o switch de Fase mora no topo de cada ramo. */
interface RamoProps {
  fase: Fase;
  setFase: (v: Fase) => void;
  t: TCapacitor;
}

/** Converte string crua em número, com fallback (padrão do projeto p/ inputs numéricos). */
function num(s: string, fallback = 0): number {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function CalculoCapacitor() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.capacitor;
  // Fase da máquina. Default: monofásico (mantém o comportamento atual).
  const [fase, setFase] = usePersistedState<Fase>('tt:state:capacitor:fase', 'mono');

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t.title}</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          {fase === 'mono' ? t.subtitleMono : t.subtitleTri}
        </p>
      </div>

      {fase === 'mono' ? (
        <RamoMonofasico fase={fase} setFase={setFase} t={t} />
      ) : (
        <RamoTrifasico fase={fase} setFase={setFase} t={t} />
      )}
    </div>
  );
}

/** BTU/h e LRA não substituem a especificação de capacitor do fabricante. */
function RamoMonofasico({ fase, setFase, t }: RamoProps) {
  return (
    <>
      <div className="flex flex-col items-start gap-3">
        <Label className="text-sm font-medium text-foreground">{t.phaseLabel}</Label>
        <LabeledSwitch
          value={fase}
          onChange={setFase}
          off={{ value: 'mono', label: t.mono }}
          on={{ value: 'tri', label: t.tri }}
          aria-label={t.phaseLabel}
        />
      </div>
      <section className="space-y-6 rounded-xl bg-muted/30 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CircuitBoard className="mt-1 h-6 w-6 shrink-0 text-primary" />
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">{t.guidanceTitle}</h3>
            <p className="max-w-2xl text-base leading-relaxed text-foreground">{t.guidanceDescription}</p>
          </div>
        </div>
        <dl className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <dt className="text-sm font-semibold">{t.specCapacitance}</dt>
            <dd className="text-sm leading-relaxed text-muted-foreground">{t.guidanceCapacitance}</dd>
          </div>
          <div className="space-y-2">
            <dt className="text-sm font-semibold">{t.specVoltage}</dt>
            <dd className="text-sm leading-relaxed text-muted-foreground">{t.guidanceVoltage}</dd>
          </div>
          <div className="space-y-2">
            <dt className="text-sm font-semibold">{t.specType}</dt>
            <dd className="text-sm leading-relaxed text-muted-foreground">{t.guidanceType}</dd>
          </div>
        </dl>
        <p className="text-sm font-medium">{t.guidanceFooter}</p>
      </section>
      <ToolDisclaimer texto={t.disclaimer} />
    </>
  );
}

/** Ramo TRIFÁSICO — sem capacitor: dimensiona contator AC-3 + relé térmico. */
function RamoTrifasico({ fase, setFase, t }: RamoProps) {
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
      num(rendimentoStr),
      num(cosphiStr),
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
        <div className="grid grid-cols-1 gap-4 border-b border-border pb-4 sm:grid-cols-2">
          <div className="flex flex-col items-center gap-1.5">
            <Label className="text-sm font-medium text-foreground">{t.phaseLabel}</Label>
            <LabeledSwitch
              value={fase}
              onChange={(v) => setFase(v)}
              off={{ value: 'mono', label: t.mono }}
              on={{ value: 'tri', label: t.tri }}
              aria-label="Fase da máquina"
            />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Label className="text-sm font-medium text-foreground">{t.entryLabel}</Label>
            <LabeledSwitch
              value={modoTri}
              onChange={(v) => setModoTri(v)}
              off={{ value: 'corrente', label: t.entryCurrent }}
              on={{ value: 'cv', label: t.entryPower }}
              aria-label="Modo de entrada trifásico"
            />
          </div>
        </div>

        {modoTri === 'corrente' ? (
          <div className="space-y-1.5">
            <Label htmlFor="contator-corrente" className="text-base font-medium text-foreground">
              {t.currentLabel}
            </Label>
            <NumericInput
              decimal
              id="contator-corrente"
              value={correnteStr}
              onValueChange={setCorrenteStr}
              placeholder="Ex: 2,9"
              className="h-14 text-lg md:h-14 md:text-lg"
            />
            <p className="text-xs text-muted-foreground">
              {t.currentNote}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="contator-potencia" className="text-base font-medium text-foreground">{t.powerLabel}</Label>
                <NumericInput
                  decimal
                  id="contator-potencia"
                  value={cvStr}
                  onValueChange={setCvStr}
                  placeholder="Ex: 1"
                  className="h-14 text-lg md:h-14 md:text-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-base font-medium text-foreground">
                  {t.triVoltageLabel}
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
                className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                <Settings2 className="h-4 w-4" />
                {t.advancedParams}
              </button>
              {avancadoAberto && (
                <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contator-rendimento" className="text-sm font-medium text-foreground">{t.efficiency}</Label>
                    <NumericInput
                      decimal
                      id="contator-rendimento"
                      value={rendimentoStr}
                      onValueChange={setRendimentoStr}
                      placeholder={String(RENDIMENTO_PADRAO)}
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contator-cosphi" className="text-sm font-medium text-foreground">{t.powerFactor}</Label>
                    <NumericInput
                      decimal
                      id="contator-cosphi"
                      value={cosphiStr}
                      onValueChange={setCosphiStr}
                      placeholder={String(COSPHI_PADRAO)}
                      className="h-12 text-base"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground md:col-span-2">
                    {t.advancedNote}
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
                  {t.contactor}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">
                  {resultado.contatorAC3 === null ? t.aboveCommercial : <>
                    {t.contactorOf}{' '}
                    <span className="whitespace-nowrap text-primary">{formatarNumero(resultado.contatorAC3)} A</span>
                  </>}
                </p>
                <p className="text-base font-medium leading-tight text-muted-foreground sm:text-lg">
                  {t.categoryAC3}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.tripolarNote}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t.nominalCurrent}
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                    {formatarNumero(resultado.correnteNominal)}
                    <span className="ml-1 text-base font-semibold sm:text-lg">A</span>
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t.serviceCurrent}
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
                <NoticeBanner variant="warning">{t.aboveCommercial}</NoticeBanner>
              )}
            </div>

            <SpecPhotoCard
              className="lg:order-first lg:w-[22rem] lg:shrink-0"
              titulo={t.contactor}
              fotoSrc="/images/contatora.png"
              fotoAlt="Contatora tripolar AC-3"
              fallbackIcon={Zap}
              specs={
                [
                  { label: t.triSpec.contactor, value: resultado.contatorAC3 === null ? t.aboveCommercial : `${formatarNumero(resultado.contatorAC3)} A AC-3` },
                  { label: t.triSpec.type, value: t.triSpec.typeTripolar },
                  {
                    label: t.triSpec.thermalRelay,
                    value: t.triSpec.thermalRelayValue.replace('{val}', formatarNumero(resultado.releTermico)),
                  },
                ] satisfies Spec[]
              }
            />
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {modoTri === 'corrente' ? t.enterCurrentTri : t.enterPowerTri}
          </p>
        )}
      </div>

      {/* Relé térmico — instrução de regulagem */}
      {resultado && (
        <div className="mx-auto flex max-w-4xl gap-2.5 rounded-lg border border-border bg-card p-3">
          <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-foreground">
            <span className="font-semibold">{t.thermalRelay} </span>
            {t.thermalRelayNote.replace('{current}', formatarNumero(resultado.releTermico))}
          </p>
        </div>
      )}

      {/* Nota destacada — trifásico não usa capacitor */}
      <NoticeBanner variant="neutral" icon={AlertTriangle} className="mx-auto max-w-4xl">
        <span className="font-semibold">{t.triNoCapacitor}</span> {t.triNoCapacitorNote}
      </NoticeBanner>

      <ToolDisclaimer texto={t.disclaimer} />
    </>
  );
}
