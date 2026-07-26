// ─────────────────────────────────────────────────────────────────────────────
// DiscChoiceSelect — pergunta de ALTERNATIVA (forced-choice) do teste DISC.
//
// Renderiza um enunciado (`prompt`) e as 4 opções (uma por fator D/I/S/C) como
// cartões selecionáveis (radio-like: escolhe UMA). Ao tocar numa opção, chama
// `onChange(fator)` com a LETRA do fator daquela opção — é isso que vai pro
// scoring/envio (não o índice nem o texto).
//
// ORDEM DAS OPÇÕES: embaralhada de forma DETERMINÍSTICA por `seed`. Motivo:
//   (a) a posição na tela não pode entregar o fator (D nunca fica sempre no topo);
//   (b) precisa ser ESTÁVEL no refresh (mesmo seed → mesma ordem), senão a opção
//       que o usuário marcou "pularia" de lugar ao recarregar.
// Usamos o mesmo par djb2 (hash) + mulberry32 (PRNG) + Fisher-Yates de
// formSelection, replicado local e PURO, pra manter o componente sem dependência
// de estado externo. Seed típico = `${code}|${promptId}` (passado pela tela).
//
// Tema: PublicPortalShell força tema CLARO, então as cores são pensadas pra fundo
// claro. Opção selecionada = borda + fundo tênue na cor da marca (fallback teal),
// com check visível. Mobile-first: opções grandes, alvo de toque confortável.
// A11y: role="radiogroup" no container, role="radio" + aria-checked em cada opção.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DISC_FACTORS, type DiscFactor } from '@/lib/disc/questions';

// Cor da marca padrão (teal Dominex) quando o tenant não define primary_color.
const BRAND_TEAL = '#00C684';

// ── PRNG determinístico (replicado de formSelection, puro e estável) ────────────
type Prng = () => number;

function mulberry32(seed: number): Prng {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(hash, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

/** Fisher-Yates in-place com o PRNG fornecido (não muta a fonte: passe cópia). */
function shuffle<T>(arr: T[], rng: Prng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export interface DiscChoiceSelectProps {
  /** Enunciado da pergunta. */
  prompt: string;
  /** Texto de cada opção, indexado pela LETRA do fator (D/I/S/C). */
  options: Record<DiscFactor, string>;
  /** Fator atualmente escolhido (undefined = ainda não respondido). */
  value?: DiscFactor;
  /** Chamado com a LETRA do fator escolhido ao tocar numa opção. */
  onChange: (factor: DiscFactor) => void;
  /** Seed do embaralhamento determinístico (ex.: `${code}|${promptId}`). */
  seed?: string;
  className?: string;
}

export function DiscChoiceSelect({
  prompt,
  options,
  value,
  onChange,
  seed,
  className,
}: DiscChoiceSelectProps) {
  // Ordem de exibição embaralhada, estável por seed. Sem seed → ordem canônica
  // (D,I,S,C) como fallback determinístico (não deveria acontecer em produção).
  const order = useMemo<DiscFactor[]>(() => {
    const base = [...DISC_FACTORS] as DiscFactor[];
    if (!seed) return base;
    return shuffle(base, mulberry32(hashString(seed)));
  }, [seed]);

  const accent = BRAND_TEAL;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Enunciado */}
      <p className="min-h-[3rem] text-center text-lg font-semibold text-foreground">
        {prompt}
      </p>

      {/* Opções (radiogroup) */}
      <div role="radiogroup" aria-label={prompt} className="flex flex-col gap-2.5">
        {order.map((factor) => {
          const selected = value === factor;
          return (
            <button
              key={factor}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(factor)}
              className={cn(
                'group flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left',
                'transition-colors duration-150 active:scale-[0.99]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                selected
                  ? 'border-transparent bg-[var(--disc-accent)]/10'
                  : 'border-border bg-background hover:border-[var(--disc-accent)]/60',
              )}
              style={
                {
                  '--disc-accent': accent,
                  ...(selected
                    ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` }
                    : {}),
                } as React.CSSProperties
              }
            >
              {/* Indicador radio */}
              <span
                aria-hidden
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  selected ? 'border-transparent text-white' : 'border-muted-foreground/40',
                )}
                style={selected ? { backgroundColor: accent } : undefined}
              >
                {selected && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>

              {/* Texto da opção */}
              <span
                className={cn(
                  'text-sm leading-snug sm:text-base',
                  selected ? 'font-semibold text-foreground' : 'text-foreground/90',
                )}
              >
                {options[factor]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DiscChoiceSelect;
