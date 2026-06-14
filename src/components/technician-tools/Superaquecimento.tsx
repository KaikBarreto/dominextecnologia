import { useMemo, useState } from 'react';
import { AlertTriangle, Info, RefreshCcw } from 'lucide-react';
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
  MODELOS_SUPERAQUECIMENTO,
  MODELO_PADRAO_ID,
  getModeloSuperaquecimento,
  type ConfiancaModelo,
  type Faixa,
} from '@/lib/superaquecimentoModelos';
import {
  REFRIGERANTES,
  FAIXA_SH,
  FAIXA_SC,
  calcularSuperaquecimento,
  calcularSubresfriamento,
  classificarFaixa,
  pressaoParaTempSat,
  sugerirOutraUnidade,
  formatarTemp,
  getRefrigerante,
  type UnidadePressao,
  type ClassificacaoFaixa,
  type ResultadoSaturacao,
  type SugestaoUnidade,
  type Curva,
} from '@/lib/refrigerantes';

/** Converte string crua de input numérico em number, com default seguro. */
function num(str: string, def = NaN): number {
  if (str.trim() === '') return def;
  const parsed = Number(str.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : def;
}

const ROTULO_FAIXA: Record<ClassificacaoFaixa, string> = {
  baixo: 'Baixo',
  ideal: 'Ideal',
  alto: 'Alto',
};

/** Cores do selo de faixa por classificação. */
function corSelo(c: ClassificacaoFaixa): string {
  if (c === 'ideal') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
}

/** Rótulo curto da confiança da fonte do alvo (pra acompanhar a nota). */
const ROTULO_CONFIANCA: Record<ConfiancaModelo, string | null> = {
  alta: null, // fonte firme — não precisa ressalva
  media: 'Fonte secundária',
  baixa: 'Fonte limitada',
  generico: 'Referência genérica',
};

/**
 * Resolve a faixa-alvo efetiva de um cálculo a partir do alvo do modelo,
 * com fallback pra faixa genérica quando o fabricante não publica.
 * `delta` vem da física pura — aqui só reclassificamos contra a faixa do modelo.
 */
function resolverAlvo(
  alvoModelo: Faixa,
  generica: { min: number; max: number },
  delta: number | null,
): {
  faixa: { min: number; max: number };
  /** true quando caiu no genérico (fabricante não publica este alvo). */
  generico: boolean;
  /** Classificação do delta frente à faixa efetiva, ou null sem delta. */
  classificacao: ClassificacaoFaixa | null;
} {
  const faixa = alvoModelo ? { min: alvoModelo[0], max: alvoModelo[1] } : generica;
  const generico = alvoModelo === null;
  const classificacao = delta !== null ? classificarFaixa(delta, faixa) : null;
  return { faixa, generico, classificacao };
}

interface CardCalculoProps {
  titulo: string;
  descricao: string;
  labelPressao: string;
  labelTemp: string;
  unidade: UnidadePressao;
  pressao: string;
  setPressao: (v: string) => void;
  temp: string;
  setTemp: (v: string) => void;
  resultado: ResultadoSaturacao;
  /**
   * Classificação do selo frente à faixa-alvo do modelo (sobrepõe a do
   * resultado, que usa a faixa genérica da física). null = sem delta.
   */
  classificacaoSelo: ClassificacaoFaixa | null;
  faixaTexto: string;
  /** true se a pressão foi digitada mas caiu fora da faixa da tabela. */
  foraDaFaixa: boolean;
  /** Texto do valor digitado (pra mostrar no aviso). */
  pressaoBruta: string;
  /** Sugestão de troca de unidade quando a outra encaixa, ou null. */
  sugestao: SugestaoUnidade | null;
  /** Troca a unidade para a sugerida (atalho do aviso). */
  onTrocarUnidade: (u: UnidadePressao) => void;
  /** Bloco de nota do modelo (renderizado abaixo do resultado), opcional. */
  notaModelo?: React.ReactNode;
}

function CardCalculo({
  titulo,
  descricao,
  labelPressao,
  labelTemp,
  unidade,
  pressao,
  setPressao,
  temp,
  setTemp,
  resultado,
  classificacaoSelo,
  faixaTexto,
  foraDaFaixa,
  pressaoBruta,
  sugestao,
  onTrocarUnidade,
  notaModelo,
}: CardCalculoProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold tracking-tight md:text-lg">{titulo}</h3>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">
            {labelPressao} ({unidade})
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder={unidade === 'bar' ? 'Ex: 8,3' : 'Ex: 120'}
            value={pressao}
            onChange={(e) => setPressao(e.target.value)}
            className="h-14 text-lg"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">{labelTemp} (°C)</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Ex: 12"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            className="h-14 text-lg"
          />
        </div>
      </div>

      {/* Resultado ao vivo */}
      <div className="rounded-lg border border-border bg-background p-4 text-center">
        {resultado.delta !== null && classificacaoSelo ? (
          <>
            <p className="text-5xl font-bold leading-none text-primary sm:text-6xl">
              {formatarTemp(resultado.delta)}
              <span className="ml-1.5 text-2xl font-semibold sm:text-3xl">°C</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-semibold',
                  corSelo(classificacaoSelo),
                )}
              >
                {ROTULO_FAIXA[classificacaoSelo]}
              </span>
              <span className="text-xs text-muted-foreground">{faixaTexto}</span>
            </div>
            {resultado.tempSat !== null && (
              <p className="mt-2 text-xs text-muted-foreground">
                Temperatura de saturação: {formatarTemp(resultado.tempSat)} °C
              </p>
            )}
          </>
        ) : sugestao ? (
          <AvisoUnidade
            pressaoBruta={pressaoBruta}
            unidade={unidade}
            sugestao={sugestao}
            onTrocarUnidade={onTrocarUnidade}
          />
        ) : foraDaFaixa ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Pressão fora da faixa da tabela para este refrigerante. Confira a leitura.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Informe a pressão e a temperatura para ver o resultado.
          </p>
        )}
      </div>

      {notaModelo}
    </div>
  );
}

interface NotaModeloProps {
  /** Texto da nota de campo do modelo (PT-BR). */
  nota: string;
  /** Confiança da fonte — vira ressalva curta quando não é 'alta'. */
  confianca: ConfiancaModelo;
  /** true quando a faixa-alvo deste cálculo caiu no genérico. */
  alvoGenerico: boolean;
}

/** Bloco discreto com a nota de campo do modelo + ressalvas de fonte/alvo. */
function NotaModelo({ nota, confianca, alvoGenerico }: NotaModeloProps) {
  const rotuloConfianca = ROTULO_CONFIANCA[confianca];
  return (
    <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
      <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
      <div className="space-y-1.5">
        <p className="text-xs leading-relaxed">{nota}</p>
        <div className="flex flex-wrap gap-1.5">
          {alvoGenerico && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Alvo não publicado — usando referência genérica
            </span>
          )}
          {rotuloConfianca && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {rotuloConfianca}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface AvisoUnidadeProps {
  pressaoBruta: string;
  unidade: UnidadePressao;
  sugestao: SugestaoUnidade;
  onTrocarUnidade: (u: UnidadePressao) => void;
}

/**
 * Aviso útil quando a pressão está fora da faixa na unidade atual mas encaixa
 * na outra. Mostra a T_sat que daria e um atalho pra trocar e recalcular.
 */
function AvisoUnidade({ pressaoBruta, unidade, sugestao, onTrocarUnidade }: AvisoUnidadeProps) {
  return (
    <div className="space-y-3 text-left">
      <p className="text-sm text-amber-600 dark:text-amber-400">
        <span className="font-semibold">{pressaoBruta.trim()}</span> está fora da faixa em{' '}
        <span className="font-semibold">{unidade}</span>. Em{' '}
        <span className="font-semibold">{sugestao.unidadeSugerida}</span> daria saturação ≈{' '}
        <span className="font-semibold">{formatarTemp(sugestao.tempSat)} °C</span>.
      </p>
      <button
        type="button"
        onClick={() => onTrocarUnidade(sugestao.unidadeSugerida)}
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity active:opacity-80"
      >
        Trocar para {sugestao.unidadeSugerida} e recalcular
      </button>
    </div>
  );
}

interface SelecoesCompartilhadasProps {
  refrigId: string;
  setRefrigId: (v: string) => void;
  unidade: UnidadePressao;
  setUnidade: (v: UnidadePressao) => void;
}

/** Selects de Refrigerante + Unidade — estado vive no pai, aparece em toda subaba. */
function SelecoesCompartilhadas({
  refrigId,
  setRefrigId,
  unidade,
  setUnidade,
}: SelecoesCompartilhadasProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">Refrigerante</Label>
          <Select value={refrigId} onValueChange={setRefrigId}>
            <SelectTrigger className="h-14 text-lg md:h-14 md:text-lg">
              <SelectValue placeholder="Refrigerante" />
            </SelectTrigger>
            <SelectContent>
              {REFRIGERANTES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">Unidade de pressão</Label>
          <Select value={unidade} onValueChange={(v) => setUnidade(v as UnidadePressao)}>
            <SelectTrigger className="h-14 text-lg md:h-14 md:text-lg">
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">bar</SelectItem>
              <SelectItem value="psi">psi</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

type SubAba = 'sh' | 'sc' | 'pt';

const SUBABAS: { key: SubAba; label: string }[] = [
  { key: 'sh', label: 'Superaquecimento (SH)' },
  { key: 'sc', label: 'Subresfriamento (SC)' },
  { key: 'pt', label: 'Consulta P×T' },
];

interface SuperaquecimentoProps {
  /** Navega pra aba "Ciclo de Refrigeração" (atalho discreto no topo). */
  onIrParaCiclo?: () => void;
}

export function Superaquecimento({ onIrParaCiclo }: SuperaquecimentoProps) {
  // Compartilhados: padrão R-410A, bar.
  const [refrigId, setRefrigId] = useState<string>('R-410A');
  const [unidade, setUnidade] = useState<UnidadePressao>('bar');

  // Subaba ativa — começa no Superaquecimento (SH).
  const [subAba, setSubAba] = useState<SubAba>('sh');

  // Superaquecimento (SH)
  const [pBaixa, setPBaixa] = useState('');
  const [tSuccao, setTSuccao] = useState('');

  // Modelo/fabricante (subaba SH). Por ora NÃO altera o cálculo — só registra a
  // escolha do técnico. Padrão para todos os modelos.
  // TODO: aplicar regra/alvo por fabricante quando a base de dados for fornecida pelo CEO.
  const [modeloId, setModeloId] = useState<string>(MODELO_PADRAO_ID);

  // Subresfriamento (SC)
  const [pAlta, setPAlta] = useState('');
  const [tLiquido, setTLiquido] = useState('');

  // Consulta PT
  const [pConsulta, setPConsulta] = useState('');

  const refrig = getRefrigerante(refrigId);

  const resultadoSH = useMemo(
    () => calcularSuperaquecimento(refrigId, num(pBaixa), unidade, num(tSuccao)),
    [refrigId, pBaixa, unidade, tSuccao],
  );

  const resultadoSC = useMemo(
    () => calcularSubresfriamento(refrigId, num(pAlta), unidade, num(tLiquido)),
    [refrigId, pAlta, unidade, tLiquido],
  );

  // Modelo escolhido (compartilhado entre as subabas SH e SC).
  const modelo = getModeloSuperaquecimento(modeloId) ?? getModeloSuperaquecimento(MODELO_PADRAO_ID)!;

  // Faixa-alvo efetiva por cálculo: alvo do modelo OU genérico da física.
  // O delta vem da física; aqui só reclassificamos contra a faixa do modelo.
  const alvoSH = useMemo(
    () => resolverAlvo(modelo.alvoSH, FAIXA_SH, resultadoSH.delta),
    [modelo, resultadoSH.delta],
  );
  const alvoSC = useMemo(
    () => resolverAlvo(modelo.alvoSC, FAIXA_SC, resultadoSC.delta),
    [modelo, resultadoSC.delta],
  );

  // Consulta PT: usa a curva de vapor (dew) p/ blends, única p/ os demais.
  const tempConsulta = useMemo(() => {
    const p = num(pConsulta);
    if (!Number.isFinite(p)) return null;
    const curva = refrig?.temGlide ? 'dew' : 'unica';
    return pressaoParaTempSat(refrigId, p, unidade, curva);
  }, [refrigId, pConsulta, unidade, refrig]);

  // Detecta "digitou pressão mas saiu da tabela" (pra avisar em vez de pedir input).
  const shForaFaixa = Number.isFinite(num(pBaixa)) && resultadoSH.tempSat === null;
  const scForaFaixa = Number.isFinite(num(pAlta)) && resultadoSC.tempSat === null;
  const consultaForaFaixa = Number.isFinite(num(pConsulta)) && tempConsulta === null;

  // Curvas usadas em cada cálculo (SH=dew/única, SC=bubble/única, PT=dew/única).
  const curvaSH: Curva = refrig?.temGlide ? 'dew' : 'unica';
  const curvaSC: Curva = refrig?.temGlide ? 'bubble' : 'unica';
  const curvaPT: Curva = refrig?.temGlide ? 'dew' : 'unica';

  // Sugestão de troca de unidade: só quando fora na atual e dentro na outra.
  const sugestaoSH = useMemo(
    () => sugerirOutraUnidade(refrigId, num(pBaixa), unidade, curvaSH),
    [refrigId, pBaixa, unidade, curvaSH],
  );
  const sugestaoSC = useMemo(
    () => sugerirOutraUnidade(refrigId, num(pAlta), unidade, curvaSC),
    [refrigId, pAlta, unidade, curvaSC],
  );
  const sugestaoPT = useMemo(
    () => sugerirOutraUnidade(refrigId, num(pConsulta), unidade, curvaPT),
    [refrigId, pConsulta, unidade, curvaPT],
  );

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">
          Superaquecimento e Subresfriamento
        </h2>
        <p className="text-sm text-muted-foreground md:text-base">
          Calcule SH e SC pela pressão e temperatura medidas em campo.
        </p>
      </div>

      {/* Atalho discreto pra aba do ciclo (a calculadora é o foco aqui) */}
      {onIrParaCiclo && (
        <button
          type="button"
          onClick={onIrParaCiclo}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:underline active:opacity-70"
        >
          <RefreshCcw className="h-4 w-4 shrink-0" />
          Ver o ciclo de refrigeração
        </button>
      )}

      {/* Subnavegação underline — rolável horizontalmente no mobile */}
      <div className="flex gap-1 border-b overflow-x-auto no-scrollbar">
        {SUBABAS.map((aba) => (
          <button
            key={aba.key}
            onClick={() => setSubAba(aba.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0',
              subAba === aba.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {/* Seleções compartilhadas — agora dentro do conteúdo, válidas em toda subaba */}
      <SelecoesCompartilhadas
        refrigId={refrigId}
        setRefrigId={setRefrigId}
        unidade={unidade}
        setUnidade={setUnidade}
      />

      {/* Modelo/fabricante — só na subaba SH. Não altera o cálculo por ora. */}
      {subAba === 'sh' && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">Modelo / fabricante</Label>
          <Select value={modeloId} onValueChange={setModeloId}>
            <SelectTrigger className="h-14 text-lg md:h-14 md:text-lg">
              <SelectValue placeholder="Selecione o modelo/fabricante" />
            </SelectTrigger>
            <SelectContent>
              {MODELOS_SUPERAQUECIMENTO.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="pt-1 text-xs text-muted-foreground">
            O modelo define a faixa-alvo do selo Ideal/Baixo/Alto. O valor medido
            continua sendo calculado pela física.
          </p>
        </div>
      )}

      {/* Superaquecimento */}
      {subAba === 'sh' && (
        <CardCalculo
          titulo="Superaquecimento (SH)"
          descricao="T. da sucção menos a temperatura de saturação da baixa."
          labelPressao="Pressão de baixa (sucção)"
          labelTemp="Temperatura da linha de sucção"
          unidade={unidade}
          pressao={pBaixa}
          setPressao={setPBaixa}
          temp={tSuccao}
          setTemp={setTSuccao}
          resultado={resultadoSH}
          classificacaoSelo={alvoSH.classificacao}
          faixaTexto={`ideal ${formatarTemp(alvoSH.faixa.min)}–${formatarTemp(alvoSH.faixa.max)} °C`}
          foraDaFaixa={shForaFaixa}
          pressaoBruta={pBaixa}
          sugestao={sugestaoSH}
          onTrocarUnidade={setUnidade}
          notaModelo={
            <NotaModelo
              nota={modelo.nota}
              confianca={modelo.confianca}
              alvoGenerico={alvoSH.generico}
            />
          }
        />
      )}

      {/* Subresfriamento */}
      {subAba === 'sc' && (
        <CardCalculo
          titulo="Subresfriamento (SC)"
          descricao="T. de saturação da alta menos a temperatura da linha de líquido."
          labelPressao="Pressão de alta (líquido)"
          labelTemp="Temperatura da linha de líquido"
          unidade={unidade}
          pressao={pAlta}
          setPressao={setPAlta}
          temp={tLiquido}
          setTemp={setTLiquido}
          resultado={resultadoSC}
          classificacaoSelo={alvoSC.classificacao}
          faixaTexto={`ideal ${formatarTemp(alvoSC.faixa.min)}–${formatarTemp(alvoSC.faixa.max)} °C`}
          foraDaFaixa={scForaFaixa}
          pressaoBruta={pAlta}
          sugestao={sugestaoSC}
          onTrocarUnidade={setUnidade}
          notaModelo={
            <NotaModelo
              nota={modelo.nota}
              confianca={modelo.confianca}
              alvoGenerico={alvoSC.generico}
            />
          }
        />
      )}

      {/* Consulta PT — pressão → temperatura de saturação */}
      {subAba === 'pt' && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div>
            <h3 className="text-base font-semibold tracking-tight md:text-lg">Consulta P×T</h3>
            <p className="text-sm text-muted-foreground">
              Temperatura de saturação para uma pressão.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-base text-muted-foreground md:text-lg">
              Pressão ({unidade})
            </Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder={unidade === 'bar' ? 'Ex: 6,98' : 'Ex: 101'}
              value={pConsulta}
              onChange={(e) => setPConsulta(e.target.value)}
              className="h-14 text-lg"
            />
          </div>
          <div className="rounded-lg border border-border bg-background p-4 text-center">
            {tempConsulta !== null ? (
              <p className="text-4xl font-bold leading-none text-primary sm:text-5xl">
                {formatarTemp(tempConsulta)}
                <span className="ml-1.5 text-2xl font-semibold sm:text-3xl">°C</span>
              </p>
            ) : sugestaoPT ? (
              <AvisoUnidade
                pressaoBruta={pConsulta}
                unidade={unidade}
                sugestao={sugestaoPT}
                onTrocarUnidade={setUnidade}
              />
            ) : consultaForaFaixa ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Pressão fora da faixa da tabela para este refrigerante.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Informe a pressão para ver a temperatura de saturação.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Alerta sutil */}
      <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <p className="text-xs leading-relaxed">
          <span className="font-semibold text-foreground">Atenção: </span>
          estes valores são sempre uma estimativa de referência e não devem ser usados
          isoladamente. Sempre confira o manual do fabricante do equipamento antes de tomar
          decisões de carga ou diagnóstico. O superaquecimento usa a curva de vapor (dew) e o
          subresfriamento a de líquido (bubble) — em refrigerantes com glide, como o R-404A, são
          curvas distintas.
        </p>
      </div>
    </div>
  );
}
