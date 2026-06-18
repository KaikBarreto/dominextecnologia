import { useEffect, useRef, useState } from 'react';
import { Gauge, Thermometer, Zap, Ruler, ArrowLeftRight, AlertTriangle, Star, Replace } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
  CONVERSAO_CATEGORIAS,
  converter,
  formatarResultado,
  type ConversaoCategoria,
  type ConversaoCategoriaNumerica,
} from '@/lib/conversoes';
import {
  registrarConversaoRecente,
  toggleConversaoFavorita,
  useToolHistory,
} from '@/lib/technicianToolsHistory';
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

/** Par inicial de deep-link vindo de Recentes/Favoritos do Início. */
export interface ConversaoInicial {
  categoria: ConversaoCategoria;
  de: string;
  para: string;
}

/** Atalhos de conversões comuns (chips no topo). */
interface AtalhoConversao {
  label: string;
  categoria: ConversaoCategoria;
  de: string;
  para: string;
}

const ATALHOS_RAPIDOS: AtalhoConversao[] = [
  { label: '°C → °F', categoria: 'temperatura', de: 'C', para: 'F' },
  { label: 'bar → psi', categoria: 'pressao', de: 'bar', para: 'psi' },
  { label: 'HP → BTU/h', categoria: 'potencia', de: 'HP', para: 'BTU/h' },
  { label: 'mm → pol', categoria: 'comprimento', de: 'mm', para: 'pol' },
];

/** Converte string crua de input numérico em number, com default seguro. */
function num(str: string, def = 0): number {
  const parsed = Number(str.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : def;
}

/** Fator de refrigeração: 1 HP de compressor/ar-condicionado ≈ 9.000 BTU/h. */
const BTU_POR_HP_REFRIGERACAO = 9000;

type ModoPotencia = 'energia' | 'refrigeracao';

const CATEGORIA_ICONES: Record<ConversaoCategoria, LucideIcon> = {
  pressao: Gauge,
  temperatura: Thermometer,
  potencia: Zap,
  comprimento: Ruler,
  retrofit: Replace,
};

/** Cor de destaque por categoria (decorativa via style, à la Início). */
const CATEGORIA_ACCENT: Record<ConversaoCategoria, string> = {
  pressao: 'hsl(217 91% 60%)', // azul
  temperatura: 'hsl(0 84% 60%)', // vermelho
  potencia: 'hsl(38 92% 50%)', // âmbar
  comprimento: 'hsl(142 71% 45%)', // verde
  retrofit: 'hsl(173 58% 39%)', // teal
};

/** Rótulo da categoria pro usuário (cobre as numéricas + as de referência). */
const CATEGORIA_LABEL: Record<ConversaoCategoria, string> = {
  pressao: CONVERSAO_CATEGORIAS.pressao.label,
  temperatura: CONVERSAO_CATEGORIAS.temperatura.label,
  potencia: CONVERSAO_CATEGORIAS.potencia.label,
  comprimento: CONVERSAO_CATEGORIAS.comprimento.label,
  retrofit: 'Retrofit de Gás',
};

const ORDEM: ConversaoCategoria[] = [
  'pressao',
  'temperatura',
  'potencia',
  'comprimento',
  'retrofit',
];

export function Conversao({ inicial }: { inicial?: ConversaoInicial }) {
  // Categoria persiste na sessão (sobrevive à troca de aba). Deep-link tem
  // prioridade: quando vem com `inicial`, aplicamos a categoria dele na 1ª
  // montagem por cima do que estava salvo.
  const [categoria, setCategoria] = usePersistedState<ConversaoCategoria>(
    'tt:state:conversao:categoria',
    inicial?.categoria ?? 'pressao',
  );
  const aplicouDeepLink = useRef(false);
  useEffect(() => {
    if (inicial && !aplicouDeepLink.current) {
      aplicouDeepLink.current = true;
      setCategoria(inicial.categoria);
    }
  }, [inicial, setCategoria]);

  // Par inicial pra view (deep-link OU atalho rápido). Trocar a categoria pelos
  // cards limpa o par forçado e deixa a view usar seus defaults.
  const [parInicial, setParInicial] = useState<ConversaoInicial | undefined>(inicial);

  const escolherCategoria = (cat: ConversaoCategoria) => {
    setParInicial(undefined);
    setCategoria(cat);
  };

  const aplicarAtalho = (a: AtalhoConversao) => {
    setParInicial({ categoria: a.categoria, de: a.de, para: a.para });
    setCategoria(a.categoria);
  };

  // Chave da view: remonta ao trocar categoria OU par forçado, pra reinicializar.
  const viewKey = parInicial
    ? `${categoria}:${parInicial.de}:${parInicial.para}`
    : categoria;

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Conversão</h2>
        <p className="text-sm text-muted-foreground md:text-base">Converta entre unidades de medida.</p>
      </div>

      {/* Seleção de categoria — chips compactos que quebram linha (flex-wrap) */}
      <div className="flex flex-wrap gap-2">
        {ORDEM.map((cat) => {
          const Icon = CATEGORIA_ICONES[cat];
          const isActive = categoria === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => escolherCategoria(cat)}
              aria-pressed={isActive}
              aria-current={isActive ? 'true' : undefined}
              style={isActive ? { backgroundColor: CATEGORIA_ACCENT[cat] } : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors active:scale-[0.97]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isActive
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="leading-none">{CATEGORIA_LABEL[cat]}</span>
            </button>
          );
        })}
      </div>

      <ConversaoCategoriaView
        key={viewKey}
        categoria={categoria}
        inicial={parInicial}
        atalhos={ATALHOS_RAPIDOS}
        onAtalho={aplicarAtalho}
      />
    </div>
  );
}

function ConversaoCategoriaView({
  categoria,
  inicial,
  atalhos,
  onAtalho,
}: {
  categoria: ConversaoCategoria;
  inicial?: ConversaoInicial;
  atalhos: AtalhoConversao[];
  onAtalho: (a: AtalhoConversao) => void;
}) {
  // Categoria de REFERÊNCIA (não-numérica) — view própria, sem conversor.
  // O Retrofit não tem card de/para, então NÃO recebe os atalhos.
  if (categoria === 'retrofit') {
    return <RetrofitView />;
  }
  return (
    <ConversaoNumericaView
      categoria={categoria}
      inicial={inicial}
      atalhos={atalhos}
      onAtalho={onAtalho}
    />
  );
}

function ConversaoNumericaView({
  categoria,
  inicial,
  atalhos,
  onAtalho,
}: {
  categoria: ConversaoCategoriaNumerica;
  inicial?: ConversaoInicial;
  atalhos: AtalhoConversao[];
  onAtalho: (a: AtalhoConversao) => void;
}) {
  const { unidades } = CONVERSAO_CATEGORIAS[categoria];

  // Só usa o par inicial se for da mesma categoria e as unidades existirem.
  const usarInicial =
    inicial &&
    inicial.categoria === categoria &&
    unidades.some((u) => u.code === inicial.de) &&
    unidades.some((u) => u.code === inicial.para);

  // Estado persistido por CATEGORIA (chave namespaceada) pra sobreviver à troca
  // de aba sem misturar valores entre categorias. Em deep-link válido
  // (`usarInicial`), o par vindo de fora vence o que estava salvo.
  const [de, setDe] = usePersistedState(
    `tt:state:conversao:${categoria}:de`,
    usarInicial ? (inicial as ConversaoInicial).de : unidades[0].code,
  );
  const [para, setPara] = usePersistedState(
    `tt:state:conversao:${categoria}:para`,
    usarInicial ? (inicial as ConversaoInicial).para : (unidades[1]?.code ?? unidades[0].code),
  );
  // Valor cru digitado pelo usuário (string) e qual lado é a fonte da verdade.
  // Default "1" pra já mostrar a conversão calculada ao entrar na categoria.
  const [valor, setValor] = usePersistedState(`tt:state:conversao:${categoria}:valor`, '1');
  const [lastEdited, setLastEdited] = useState<'left' | 'right'>('left');
  // Modo de cálculo do par HP ↔ BTU/h (só relevante na categoria Potência).
  const [modo, setModo] = usePersistedState<ModoPotencia>(
    `tt:state:conversao:${categoria}:modo`,
    'refrigeracao',
  );

  // Deep-link válido tem prioridade sobre o par salvo: aplica de/para uma vez.
  const aplicouInicial = useRef(false);
  useEffect(() => {
    if (usarInicial && !aplicouInicial.current) {
      aplicouInicial.current = true;
      setDe((inicial as ConversaoInicial).de);
      setPara((inicial as ConversaoInicial).para);
    }
  }, [usarInicial, inicial, setDe, setPara]);

  // Lados de origem/destino dependem de quem foi editado por último.
  const origemCode = lastEdited === 'left' ? de : para;
  const destinoCode = lastEdited === 'left' ? para : de;

  // O par HP ↔ BTU/h na categoria Potência (qualquer direção).
  const isParHpBtu =
    categoria === 'potencia' &&
    ((de === 'HP' && para === 'BTU/h') || (de === 'BTU/h' && para === 'HP'));

  // Troca de unidade reseta o modo pro default ('refrigeracao').
  const trocarDe = (code: string) => {
    setDe(code);
    setModo('refrigeracao');
  };
  const trocarPara = (code: string) => {
    setPara(code);
    setModo('refrigeracao');
  };

  // Calcula o derivado: no modo refrigeração (par HP/BTU/h) usa fator 9.000;
  // caso contrário, conversão padrão via converter().
  const calcularDerivado = (entrada: number): number => {
    if (isParHpBtu && modo === 'refrigeracao') {
      if (origemCode === 'HP') return entrada * BTU_POR_HP_REFRIGERACAO; // HP → BTU/h
      return entrada / BTU_POR_HP_REFRIGERACAO; // BTU/h → HP
    }
    return converter(categoria, origemCode, destinoCode, entrada);
  };

  // Valor derivado (o campo que NÃO está sendo editado) — calculado no render.
  const derivado =
    valor.trim() === '' ? '' : formatarResultado(calcularDerivado(num(valor)));

  // Cada campo mostra: o valor cru se for a origem, senão o derivado formatado.
  const valorEsquerdo = lastEdited === 'left' ? valor : derivado;
  const valorDireito = lastEdited === 'right' ? valor : derivado;

  const handleSwap = () => {
    // Inverte unidades; mantém o que está visível à esquerda como nova origem.
    setValor(valorEsquerdo);
    setLastEdited('left');
    setDe(para);
    setPara(de);
  };

  // Aviso informativo: par HP ↔ BTU/h na categoria Potência (qualquer direção).
  const mostrarAvisoHpBtu = isParHpBtu;

  // ── Recentes/Favoritos ──
  const { favoritosConversao } = useToolHistory();
  // O par "lógico" da conversão segue o lado que o usuário está editando.
  const isFavorito =
    origemCode !== destinoCode &&
    favoritosConversao.some(
      (c) => c.categoria === categoria && c.de === origemCode && c.para === destinoCode,
    );

  // Registra o par recente quando há valor digitado e par válido (debounce leve
  // pra não gravar a cada tecla; re-grava só quando o par muda).
  useEffect(() => {
    if (valor.trim() === '' || origemCode === destinoCode) return;
    const id = setTimeout(() => {
      registrarConversaoRecente({ categoria, de: origemCode, para: destinoCode });
    }, 600);
    return () => clearTimeout(id);
    // Intencional: só re-agenda ao mudar o par ou se passa a ter valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria, origemCode, destinoCode, valor.trim() === '']);

  return (
    <div className="space-y-3">
    {isParHpBtu && (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Modo de cálculo</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'refrigeracao', label: 'Refrigeração', fator: '1 HP = 9.000 BTU/h', accent: 'hsl(217 91% 60%)' },
            { key: 'energia', label: 'Energia', fator: '1 HP = 2.544 BTU/h', accent: 'hsl(25 95% 53%)' },
          ] as const).map((opt) => {
            const isActive = modo === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setModo(opt.key)}
                aria-pressed={isActive}
                style={isActive ? { backgroundColor: opt.accent } : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'border-transparent text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <span className="text-sm font-semibold leading-tight">{opt.label}</span>
                <span className="text-[11px] leading-tight opacity-80">{opt.fator}</span>
              </button>
            );
          })}
        </div>
      </div>
    )}
    <div className="relative rounded-lg border border-border bg-card p-4 pt-9">
      {/* Favoritar o par atual — canto superior direito do card */}
      {origemCode !== destinoCode && (
        <button
          type="button"
          aria-pressed={isFavorito}
          aria-label={isFavorito ? 'Remover dos favoritos' : 'Favoritar conversão'}
          onClick={() => toggleConversaoFavorita({ categoria, de: origemCode, para: destinoCode })}
          className={cn(
            'absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-[0.92]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isFavorito
              ? 'text-warning hover:bg-warning/10'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Star className={cn('h-5 w-5 shrink-0', isFavorito && 'fill-current')} />
        </button>
      )}
      {/* ===== Layout MOBILE (3 linhas: labels / selects+⇄ / valores+"=") ===== */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 lg:hidden">
        {/* Linha 1: labels */}
        <Label className="text-base text-muted-foreground text-center">De</Label>
        <span aria-hidden className="w-12" />
        <Label className="text-base text-muted-foreground text-center">Para</Label>

        {/* Linha 2: selects + botão de troca no meio */}
        <Select value={de} onValueChange={trocarDe}>
          <SelectTrigger className="h-14 text-lg [&>span]:flex-1 [&>span]:text-center">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unidades.map((u) => (
              <SelectItem key={u.code} value={u.code}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={handleSwap}
          aria-label="Inverter unidades"
          className={cn(
            'flex h-14 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors',
            'hover:border-primary/40 hover:text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          <ArrowLeftRight className="h-5 w-5" />
        </button>

        <Select value={para} onValueChange={trocarPara}>
          <SelectTrigger className="h-14 text-lg [&>span]:flex-1 [&>span]:text-center">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unidades.map((u) => (
              <SelectItem key={u.code} value={u.code}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Linha 3: inputs de valor + "=" no meio */}
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={valorEsquerdo}
          onChange={(e) => {
            setValor(e.target.value);
            setLastEdited('left');
          }}
          className="h-14 text-lg text-center"
        />
        <span aria-hidden className="flex h-14 w-12 items-center justify-center text-3xl font-semibold text-primary">
          =
        </span>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={valorDireito}
          onChange={(e) => {
            setValor(e.target.value);
            setLastEdited('right');
          }}
          className="h-14 text-lg text-center"
        />
      </div>

      {/* ===== Layout DESKTOP (3 linhas: labels / selects+⇄ / valores+"=") ===== */}
      <div className="hidden grid-cols-[1fr_auto_1fr] items-end gap-3 lg:grid">
        {/* Linha 1: labels */}
        <Label className="text-lg text-muted-foreground">De</Label>
        <span aria-hidden className="w-16" />
        <Label className="text-lg text-muted-foreground">Para</Label>

        {/* Linha 2: selects + botão de troca no meio */}
        <Select value={de} onValueChange={trocarDe}>
          <SelectTrigger className="h-14 text-lg [&>span]:flex-1 [&>span]:text-left">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unidades.map((u) => (
              <SelectItem key={u.code} value={u.code}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={handleSwap}
          aria-label="Inverter unidades"
          className={cn(
            'flex h-14 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors',
            'hover:border-primary/40 hover:text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          <ArrowLeftRight className="h-6 w-6" />
        </button>

        <Select value={para} onValueChange={trocarPara}>
          <SelectTrigger className="h-14 text-lg [&>span]:flex-1 [&>span]:text-left">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unidades.map((u) => (
              <SelectItem key={u.code} value={u.code}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Linha 3: inputs de valor + "=" no meio */}
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={valorEsquerdo}
          onChange={(e) => {
            setValor(e.target.value);
            setLastEdited('left');
          }}
          className="h-20 text-3xl text-left"
        />
        <span aria-hidden className="flex h-20 w-16 items-center justify-center text-4xl font-semibold text-primary">
          =
        </span>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={valorDireito}
          onChange={(e) => {
            setValor(e.target.value);
            setLastEdited('right');
          }}
          className="h-20 text-3xl text-left"
        />
      </div>

      {/* Mais usadas — atalhos globais (cross-categoria) no rodapé do card */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">Mais usadas</p>
        <div className="flex flex-wrap gap-2">
          {atalhos.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => onAtalho(a)}
              className={cn(
                'rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all',
                'hover:border-primary/40 hover:text-foreground active:scale-[0.97]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Favoritas — conversões marcadas com estrela, globais (cross-categoria) */}
      {favoritosConversao.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">Favoritas</p>
          <div className="flex flex-wrap gap-2">
            {favoritosConversao.map((fav) => {
              const label = `${fav.de} → ${fav.para}`;
              return (
                <button
                  key={`${fav.categoria}-${fav.de}-${fav.para}`}
                  type="button"
                  onClick={() =>
                    onAtalho({ label, categoria: fav.categoria, de: fav.de, para: fav.para })
                  }
                  className={cn(
                    'rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all',
                    'hover:border-primary/40 hover:text-foreground active:scale-[0.97]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>

      {mostrarAvisoHpBtu && (
        <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs leading-relaxed">
            Escolha o tipo de cálculo: <span className="font-semibold text-foreground">Energia</span>{' '}
            converte a unidade física (1 HP = 2.544 BTU/h).{' '}
            <span className="font-semibold text-foreground">Refrigeração</span> usa a referência
            comercial: um compressor ou ar-condicionado de 1 HP equivale a ~9.000 BTUs de capacidade.
          </p>
        </div>
      )}
    </div>
  );
}

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
 * View de REFERÊNCIA de retrofit / troca de gás. Não converte número — lista as
 * opções de substituição (óleo, pressão e cuidados) do gás de saída SELECIONADO.
 *
 * Navegação: <Select> no topo escolhe o gás atual (cada item com a bolinha de
 * cor do gás); abaixo aparecem só os substitutos compatíveis. Para os que têm
 * curva firme no catálogo, mostramos a pressão de trabalho estimada na régua
 * típica (baixa/alta) com comparação ao gás de saída; sem curva, segue o texto
 * qualitativo. A unidade (psi/bar) é uma alavanca persistida.
 */
function RetrofitView() {
  const [primeiro] = RETROFIT_GASES;
  // Valor selecionado = refrigeranteId do gás de saída.
  const [gasSel, setGasSel] = usePersistedState<string>(
    'tt:state:conversao:retrofit:gasSel',
    primeiro.refrigeranteId,
  );
  const [unidade, setUnidade] = usePersistedState<UnidadePressao>(
    'tt:state:conversao:retrofit:unidade',
    'psi',
  );
  // Se o gás salvo não existe mais no catálogo, cai no primeiro.
  const gas = RETROFIT_GASES.find((g) => g.refrigeranteId === gasSel) ?? primeiro;

  return (
    <div className="space-y-4">
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
      <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
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
