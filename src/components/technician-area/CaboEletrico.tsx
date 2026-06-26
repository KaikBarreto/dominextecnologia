import { useEffect, useMemo } from 'react';
import { Zap } from 'lucide-react';
import { NumericInput } from '@/components/ui/numeric-input';
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
  CABO,
  calcularCaboEletrico,
  formatarCaboNumero,
  type TensaoCaboValue,
} from '@/lib/caboEletrico';

/** Valor sentinela do select para o modo de BTU livre. */
const PERSONALIZADO = 'personalizado';

/** Converte string crua em número, com fallback (padrão do projeto p/ inputs numéricos). */
function num(s: string, fallback = 0): number {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function CaboEletrico() {
  // Default: 220v (mais comum em campo) e primeiro BTU disponível dessa tensão.
  const [tensao, setTensao] = usePersistedState<TensaoCaboValue>('tt:state:cabo-eletrico:tensao', '220');
  const [btu, setBtu] = usePersistedState<string>('tt:state:cabo-eletrico:btu', '');
  const [btuPersonalizado, setBtuPersonalizado] = usePersistedState<string>(
    'tt:state:cabo-eletrico:btuPersonalizado',
    '',
  );
  const [distancia, setDistancia] = usePersistedState<string>('tt:state:cabo-eletrico:distancia', '');

  // BTUs disponíveis dependem da tensão escolhida.
  const btusDisponiveis = CABO.BTUS_POR_TENSAO[tensao];

  const isPersonalizado = btu === PERSONALIZADO;

  // Ao trocar a tensão, se o BTU atual não existir na nova lista (e não for
  // personalizado), limpa a seleção.
  useEffect(() => {
    if (btu && !isPersonalizado && !btusDisponiveis.includes(num(btu))) {
      setBtu('');
    }
  }, [tensao, btu, btusDisponiveis, isPersonalizado, setBtu]);

  const resultado = useMemo(() => {
    const b = isPersonalizado ? num(btuPersonalizado) : num(btu);
    const d = num(distancia);
    if (!b || !d) return null;
    return calcularCaboEletrico(b, tensao, d);
  }, [btu, btuPersonalizado, isPersonalizado, tensao, distancia]);

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Cabo Elétrico</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          Seleção de seção do cabo elétrico para ar-condicionado em geral.
        </p>
      </div>

      {/* Seleções */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">
              Selecione a capacidade (BTU)
            </Label>
            <Select value={btu} onValueChange={setBtu}>
              <SelectTrigger className="h-14 text-lg md:h-14 md:text-lg">
                <SelectValue placeholder="BTU" />
              </SelectTrigger>
              <SelectContent>
                {btusDisponiveis.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    {b.toLocaleString('pt-BR')} BTUs
                  </SelectItem>
                ))}
                <SelectItem value={PERSONALIZADO}>Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {isPersonalizado && (
              <div className="relative mt-2">
                <NumericInput
                  value={btuPersonalizado}
                  onValueChange={setBtuPersonalizado}
                  placeholder="Ex: 22000"
                  className="h-14 pr-16 text-lg md:h-14 md:text-lg"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground">
                  BTUs
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">Selecione a tensão</Label>
            <div className="flex h-14 items-center justify-center rounded-lg border border-border bg-background">
              <LabeledSwitch
                value={tensao}
                onChange={(v) => setTensao(v as TensaoCaboValue)}
                off={{ value: '127', label: '110V' }}
                on={{ value: '220', label: '220V' }}
                size="lg"
                aria-label="Tensão da rede"
              />
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-base text-muted-foreground md:text-lg">
              Distância do quadro elétrico (m)
            </Label>
            <div className="relative">
              <NumericInput
                decimal
                value={distancia}
                onValueChange={setDistancia}
                placeholder="Ex: 40"
                className="h-14 pr-10 text-lg md:h-14 md:text-lg"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground">
                m
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Resultado ao vivo — card de destaque */}
      <div className="mx-auto max-w-4xl rounded-lg border border-border bg-background p-5">
        {resultado ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
            <div className="min-w-0 flex-1 space-y-4">
            <div className="text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                É recomendado utilizar
              </p>
              <p className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">
                Cabo elétrico:{' '}
                <span className="whitespace-nowrap text-primary">
                  {formatarCaboNumero(resultado.secaoMM2)} mm²
                </span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                Disjuntor:{' '}
                <span className="whitespace-nowrap text-primary">
                  {resultado.tipo} Din C{resultado.disjuntorA}
                </span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                Tensão do AC:{' '}
                <span className="whitespace-nowrap text-primary">{resultado.tensao}v</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Corrente de projeto
                </p>
                <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                  {formatarCaboNumero(resultado.correnteProjeto)}
                  <span className="ml-1 text-base font-semibold sm:text-lg">A</span>
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Queda de tensão
                </p>
                <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                  {formatarCaboNumero(resultado.quedaPct)}
                  <span className="ml-1 text-base font-semibold sm:text-lg">%</span>
                </p>
              </div>
            </div>

            {resultado.correnteEstimada && (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                Valor estimado: BTU fora da faixa tabelada. A corrente foi aproximada pelo ponto mais
                próximo — confira a etiqueta do equipamento.
              </p>
            )}

            {resultado.alerta127Alto && (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                Evite 127V acima de ~18.000 BTU: a corrente fica alta demais para a rede monofásica.
                Considere usar 220V.
              </p>
            )}

            {resultado.foraDeAlcance && (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                Distância muito grande para as seções disponíveis. Mostrando a maior seção (25 mm²)
                como melhor esforço — valide com um eletricista.
              </p>
            )}
            </div>

            <SpecPhotoCard
              className="lg:order-first lg:w-[22rem] lg:shrink-0"
              titulo="Disjuntor recomendado"
              fotoSrc={
                resultado.tipo === 'Bipolar'
                  ? '/images/disjuntores/din-bipolar.png'
                  : '/images/disjuntores/din-monopolar.png'
              }
              fotoAlt={`Disjuntor ${resultado.tipo}`}
              fallbackIcon={Zap}
              specs={
                [
                  { label: 'Tipo', value: resultado.tipo },
                  { label: 'Curva', value: 'C' },
                  { label: 'Corrente (In)', value: `${resultado.disjuntorA} A` },
                  {
                    label: 'Polos',
                    value: `${resultado.tipo === 'Bipolar' ? 2 : 1} (${resultado.tipo})`,
                  },
                  { label: 'Tensão', value: `${tensao}V` },
                  { label: 'Padrão', value: 'NBR NM 60898' },
                ] satisfies Spec[]
              }
            />
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Selecione capacidade, tensão e distância.
          </p>
        )}
      </div>

      <ToolDisclaimer texto="Ferramenta de apoio. Estimativa de referência baseada na NBR 5410 — confira sempre a corrente (A) na etiqueta do equipamento e valide com um eletricista habilitado antes de executar. Cabo ou disjuntor subdimensionado é risco de incêndio." />
    </div>
  );
}
