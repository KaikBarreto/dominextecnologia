import { useEffect, useMemo, useState } from 'react';
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
import {
  CABO,
  TENSOES_CABO,
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
  const [tensao, setTensao] = useState<TensaoCaboValue>('220');
  const [btu, setBtu] = useState<string>('');
  const [btuPersonalizado, setBtuPersonalizado] = useState<string>('');
  const [distancia, setDistancia] = useState<string>('');

  // BTUs disponíveis dependem da tensão escolhida.
  const btusDisponiveis = CABO.BTUS_POR_TENSAO[tensao];

  const isPersonalizado = btu === PERSONALIZADO;

  // Ao trocar a tensão, se o BTU atual não existir na nova lista (e não for
  // personalizado), limpa a seleção.
  useEffect(() => {
    if (btu && !isPersonalizado && !btusDisponiveis.includes(num(btu))) {
      setBtu('');
    }
  }, [tensao, btu, btusDisponiveis, isPersonalizado]);

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
                <Input
                  type="number"
                  inputMode="numeric"
                  value={btuPersonalizado}
                  onChange={(e) => setBtuPersonalizado(e.target.value)}
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
            <Select value={tensao} onValueChange={(v) => setTensao(v as TensaoCaboValue)}>
              <SelectTrigger className="h-14 text-lg md:h-14 md:text-lg">
                <SelectValue placeholder="Tensão" />
              </SelectTrigger>
              <SelectContent>
                {TENSOES_CABO.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-base text-muted-foreground md:text-lg">
              Distância do quadro elétrico (m)
            </Label>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                value={distancia}
                onChange={(e) => setDistancia(e.target.value)}
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
      <div className="rounded-lg border border-border bg-background p-5">
        {resultado ? (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                É recomendado utilizar
              </p>
              <p className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">
                Cabo elétrico:{' '}
                <span className="text-primary">{formatarCaboNumero(resultado.secaoMM2)} mm²</span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                Disjuntor:{' '}
                <span className="text-primary">
                  {resultado.tipo} Din C{resultado.disjuntorA}
                </span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                Tensão do AC: <span className="text-primary">{resultado.tensao}v</span>
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
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-700 dark:text-amber-400">
                Valor estimado: BTU fora da faixa tabelada. A corrente foi aproximada pelo ponto mais
                próximo — confira a etiqueta do equipamento.
              </p>
            )}

            {resultado.alerta127Alto && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-700 dark:text-amber-400">
                Evite 127V acima de ~18.000 BTU: a corrente fica alta demais para a rede monofásica.
                Considere usar 220V.
              </p>
            )}

            {resultado.foraDeAlcance && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-700 dark:text-amber-400">
                Distância muito grande para as seções disponíveis. Mostrando a maior seção (25 mm²)
                como melhor esforço — valide com um eletricista.
              </p>
            )}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Selecione capacidade, tensão e distância.
          </p>
        )}
      </div>

      {/* Alerta — abaixo do resultado */}
      <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <p className="text-xs leading-relaxed">
          <span className="font-semibold text-foreground">Atenção: </span>Estimativa de referência
          baseada na NBR 5410. Sempre confira a corrente (A) na etiqueta do equipamento e valide com
          um eletricista habilitado antes de executar. Cabo ou disjuntor subdimensionado é risco de
          incêndio.
        </p>
      </div>
    </div>
  );
}
