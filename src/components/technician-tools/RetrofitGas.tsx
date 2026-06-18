import { AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { RETROFIT_GASES, type OpcaoRetrofit, type GasSaida } from '@/lib/retrofitGases';
import {
  tempParaPressao,
  getRefrigerante,
  formatarPressao,
  type UnidadePressao,
} from '@/lib/refrigerantes';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { RefrigeranteInflamavel } from '@/components/technician-tools/RefrigeranteInflamavel';
import { usePersistedState } from '@/hooks/usePersistedState';

/** Bolinha de cor do gás (régua do projeto: refrigerante sempre com cor). */
function BolinhaGas({ cor, className }: { cor: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10', className)}
      style={{ backgroundColor: cor }}
    />
  );
}

/**
 * Condições típicas de campo para estimar a pressão de trabalho de um gás na
 * régua de gases: evaporação (lado de baixa) a +5 °C e condensação (lado de
 * alta) a +45 °C. Servem só de referência rápida — a régua real depende da
 * aplicação. Mudou aqui, muda o texto exibido nos cards.
 */
const RETROFIT_TEMP_BAIXA = 5; // °C — evaporação típica
const RETROFIT_TEMP_ALTA = 45; // °C — condensação típica

/** Pressões de trabalho (baixa/alta) de um refrigerante na régua típica, ou null. */
interface PressoesTrabalho {
  baixa: number | null;
  alta: number | null;
}

/**
 * Calcula a pressão de trabalho (lado de baixa e de alta) de um refrigerante do
 * catálogo nas condições típicas de campo. Blends com glide usam a curva DEW na
 * baixa (vapor saindo do evaporador) e BUBBLE na alta (líquido condensando);
 * puros usam a curva única. Fora de faixa → null naquele lado (não quebra).
 */
function pressoesTrabalho(refrigId: string | undefined, unidade: UnidadePressao): PressoesTrabalho | null {
  if (!refrigId) return null;
  const refrig = getRefrigerante(refrigId);
  if (!refrig) return null;
  const curvaBaixa = refrig.temGlide ? 'dew' : 'unica';
  const curvaAlta = refrig.temGlide ? 'bubble' : 'unica';
  return {
    baixa: tempParaPressao(refrigId, RETROFIT_TEMP_BAIXA, unidade, curvaBaixa),
    alta: tempParaPressao(refrigId, RETROFIT_TEMP_ALTA, unidade, curvaAlta),
  };
}

/** true se há pelo menos um dos dois lados calculado. */
function temAlgumaPressao(p: PressoesTrabalho | null): p is PressoesTrabalho {
  return !!p && (p.baixa !== null || p.alta !== null);
}

/** Renderiza "Baixa ~X · Alta ~Y" omitindo o lado sem número. */
function textoPressoes(p: PressoesTrabalho, unidade: UnidadePressao): string {
  const partes: string[] = [];
  if (p.baixa !== null) partes.push(`Baixa ~${formatarPressao(p.baixa, unidade)}`);
  if (p.alta !== null) partes.push(`Alta ~${formatarPressao(p.alta, unidade)}`);
  return partes.join(' · ');
}

/**
 * Bloco de pressão de trabalho de um substituto na régua de gases. Mostra o
 * número (baixa/alta) quando o gás novo tem curva no catálogo, com comparação
 * lado a lado com o gás de saída (quando ele também tem curva). Sem curva,
 * cai de volta no texto qualitativo da tabela de retrofit.
 */
function PressaoTrabalhoOpcao({
  op,
  gas,
  unidade,
}: {
  op: OpcaoRetrofit;
  gas: GasSaida;
  unidade: UnidadePressao;
}) {
  const pSub = pressoesTrabalho(op.refrigeranteId, unidade);
  const pLegado = pressoesTrabalho(gas.refrigeranteId, unidade);

  // Sem curva firme do substituto → mantém o comportamento qualitativo de hoje.
  if (!temAlgumaPressao(pSub)) {
    return (
      <div className="flex gap-2">
        <dt className="shrink-0 font-medium text-muted-foreground">Pressão</dt>
        <dd className="text-foreground">{op.pressao}</dd>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Pressão de trabalho{' '}
        <span className="font-normal normal-case">
          (evap. +{RETROFIT_TEMP_BAIXA} °C · cond. +{RETROFIT_TEMP_ALTA} °C, {unidade})
        </span>
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <BolinhaGas cor={op.cor} />
        <span className="text-sm font-bold text-foreground">{op.gasNovo}</span>
        <span className="text-sm font-semibold text-foreground">{textoPressoes(pSub, unidade)}</span>
      </div>
      {temAlgumaPressao(pLegado) && (
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <BolinhaGas cor={gas.cor} />
          <span className="text-xs font-medium text-muted-foreground">{gas.nome}</span>
          <span className="text-xs text-muted-foreground">{textoPressoes(pLegado, unidade)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Ferramenta de REFERÊNCIA de retrofit / troca de gás. Não converte número —
 * lista as opções de substituição DROP-IN (óleo, pressão e cuidados) do gás de
 * saída SELECIONADO. Mostra SÓ gases drop-in (troca direta na mesma máquina);
 * nunca sugere troca de equipamento. 100% client-side / offline.
 *
 * Navegação: <Select> no topo escolhe o gás atual (cada item com a bolinha de
 * cor do gás); abaixo aparecem só os substitutos compatíveis. Para os que têm
 * curva firme no catálogo, mostramos a pressão de trabalho estimada na régua
 * típica (baixa/alta) com comparação ao gás de saída; sem curva, segue o texto
 * qualitativo. A unidade (psi/bar) é uma alavanca persistida.
 */
export function RetrofitGas() {
  const [primeiro] = RETROFIT_GASES;
  // Valor selecionado = refrigeranteId do gás de saída.
  const [gasSel, setGasSel] = usePersistedState<string>(
    'tt:state:retrofit-gas:gasSel',
    primeiro.refrigeranteId,
  );
  const [unidade, setUnidade] = usePersistedState<UnidadePressao>(
    'tt:state:retrofit-gas:unidade',
    'psi',
  );
  // Se o gás salvo não existe mais no catálogo, cai no primeiro.
  const gas = RETROFIT_GASES.find((g) => g.refrigeranteId === gasSel) ?? primeiro;

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Retrofit de Gás</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          Gases drop-in para trocar o refrigerante direto na mesma máquina.
        </p>
      </div>

      {/* Card de entrada — seletor do gás atual + unidade de pressão */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <Label className="shrink-0 text-xl font-bold leading-tight text-foreground md:text-2xl">
            Gás atual:
          </Label>
          <Select value={gas.refrigeranteId} onValueChange={setGasSel}>
            <SelectTrigger
              className="h-14 max-w-[60%] text-xl [&>span]:flex [&>span]:items-center [&_svg]:h-6 [&_svg]:w-6 md:h-16 md:text-2xl"
              aria-label="Gás de saída para retrofit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETROFIT_GASES.map((g) => (
                <SelectItem key={g.refrigeranteId} value={g.refrigeranteId} className="text-lg">
                  <span className="inline-flex items-center gap-2">
                    <BolinhaGas cor={g.cor} className="h-4 w-4 md:h-5 md:w-5" />
                    {g.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs leading-snug text-muted-foreground">{gas.contexto}</p>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <Label className="shrink-0 text-sm font-medium text-muted-foreground">Unidade:</Label>
          <LabeledSwitch
            value={unidade}
            onChange={(v) => setUnidade(v as UnidadePressao)}
            off={{ value: 'psi', label: 'psi' }}
            on={{ value: 'bar', label: 'bar' }}
            aria-label="Unidade de pressão"
          />
        </div>
      </div>

      {/* Aviso de segurança compacto — drop-in (troca no mesmo equipamento) */}
      <div className="flex gap-2.5 rounded-lg border border-border bg-muted p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Drop-in</span> é a troca de gás no mesmo
          equipamento — em geral só trocando o óleo e o filtro secador. Sempre siga a ficha técnica
          do gás e do compressor.
        </p>
      </div>

      {/* Título grande antes dos cards — nome do gás em destaque (cor + chama) */}
      <h2 className="mt-5 text-xl font-semibold leading-snug text-foreground md:text-2xl">
        Gases que podem substituir o{' '}
        <span className="inline-flex items-center gap-1.5 align-middle font-bold">
          <BolinhaGas cor={gas.cor} className="h-3.5 w-3.5 md:h-4 md:w-4" />
          {gas.nome}
          <RefrigeranteInflamavel refrigId={gas.refrigeranteId} size={20} />
        </span>
        :
      </h2>

      {/* Subtítulo único — todas as opções agora são drop-in (troca na mesma máquina) */}
      <p className="-mt-2 text-sm leading-relaxed text-muted-foreground">
        Troca o {gas.nome} por este gás na mesma máquina — em geral só trocando o óleo e o filtro secador.
      </p>

      {/* Todas as opções são drop-in: grid único (1 col mobile, 2 desktop) */}
      {(() => {
        const renderOpcao = (op: (typeof gas.opcoes)[number]) => {
          // Classe ASHRAE para o ícone de fogo compartilhado.
          const classeInflamavel =
            op.inflamavel === 'alta' ? 'A3' : op.inflamavel === 'leve' ? 'A2L' : undefined;
          return (
            <div
              key={op.gasNovo}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              {/* Header: cor + nome do gás novo + fogo de inflamabilidade */}
              <div className="flex items-center gap-2">
                <BolinhaGas cor={op.cor} />
                <span className="text-lg font-bold text-foreground">{op.gasNovo}</span>
                {classeInflamavel && (
                  <RefrigeranteInflamavel classe={classeInflamavel} size={16} />
                )}
              </div>

              {/* Selo de tipo — todas drop-in (verde) */}
              <span className="mt-2 inline-block rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-medium text-white">
                {op.tipoLabel}
              </span>

              {/* Óleo + pressão de trabalho (número onde há curva; texto onde não há) */}
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium text-muted-foreground">Óleo</dt>
                  <dd className="text-foreground">{op.oleo}</dd>
                </div>
                <PressaoTrabalhoOpcao op={op} gas={gas} unidade={unidade} />
              </dl>

              {/* Cuidados — subtítulo leve + bullets, sem caixa pesada */}
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Cuidados</p>
                <ul className="space-y-1.5">
                  {op.cuidados.map((c, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-sm leading-snug text-foreground"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60"
                      />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        };

        return (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {gas.opcoes.map(renderOpcao)}
          </div>
        );
      })()}
    </div>
  );
}
