import { useEffect, useRef, useState } from 'react';
import { Gauge, Thermometer, Zap, Ruler, ArrowLeftRight, AlertTriangle, Star } from 'lucide-react';
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
import { ToolDisclaimer } from './ToolDisclaimer';
import {
  registrarConversaoRecente,
  toggleConversaoFavorita,
  useToolHistory,
} from '@/lib/technicianToolsHistory';
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
};

/** Cor de destaque por categoria (decorativa via style, à la Início). */
const CATEGORIA_ACCENT: Record<ConversaoCategoria, string> = {
  pressao: 'hsl(217 91% 60%)', // azul
  temperatura: 'hsl(0 84% 60%)', // vermelho
  potencia: 'hsl(38 92% 50%)', // âmbar
  comprimento: 'hsl(142 71% 45%)', // verde
};

/** Rótulo da categoria pro usuário. */
const CATEGORIA_LABEL: Record<ConversaoCategoria, string> = {
  pressao: CONVERSAO_CATEGORIAS.pressao.label,
  temperatura: CONVERSAO_CATEGORIAS.temperatura.label,
  potencia: CONVERSAO_CATEGORIAS.potencia.label,
  comprimento: CONVERSAO_CATEGORIAS.comprimento.label,
};

const ORDEM: ConversaoCategoria[] = [
  'pressao',
  'temperatura',
  'potencia',
  'comprimento',
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

      <ToolDisclaimer />
    </div>
  );
}
