/**
 * Ícone de inflamabilidade de gás refrigerante (régua do projeto).
 *
 * Mostra um fogo (lucide `Flame`) ao lado do nome+bolinha de cor do gás:
 * - VERMELHO  = altamente inflamável (ASHRAE A3, ex.: R-290).
 * - ÂMBAR     = levemente inflamável (ASHRAE A2L, ex.: R-32).
 * - não inflamável (A1) → não renderiza nada (`null`).
 *
 * Fonte do dado: `src/lib/refrigerantes.ts`. Para gases fora do catálogo base
 * (ex.: substitutos de retrofit), passe `nivel`/`classe` direto.
 *
 * Mobile-first: tooltip puro de hover não funciona no toque. Usamos um Popover
 * disparado por clique/toque (e por hover no desktop), para o técnico ver o
 * aviso tocando no ícone.
 */
import { useState } from 'react';
import { Flame } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  getInflamabilidade,
  nivelInflamabilidade,
  type ClasseInflamabilidade,
  type NivelInflamabilidade,
} from '@/lib/refrigerantes';

interface RefrigeranteInflamavelProps {
  /** id do gás no catálogo de REFRIGERANTES (resolve nível + classe sozinho). */
  refrigId?: string;
  /** Nível explícito (para gases fora do catálogo base, ex.: retrofit). */
  nivel?: NivelInflamabilidade;
  /** Classe ASHRAE explícita (usada no texto do aviso quando informada). */
  classe?: ClasseInflamabilidade;
  /** Tamanho do ícone (px). Default 14. */
  size?: number;
  className?: string;
}

/** Resolve nível + classe a partir das props (refrigId tem prioridade). */
function resolver(
  props: RefrigeranteInflamavelProps,
): { nivel: NivelInflamabilidade; classe?: ClasseInflamabilidade } {
  if (props.refrigId) return getInflamabilidade(props.refrigId);
  if (props.classe) return { nivel: nivelInflamabilidade(props.classe), classe: props.classe };
  return { nivel: props.nivel ?? 'nao', classe: undefined };
}

export function RefrigeranteInflamavel(props: RefrigeranteInflamavelProps) {
  const [open, setOpen] = useState(false);
  const { nivel, classe } = resolver(props);
  const size = props.size ?? 14;

  if (nivel === 'nao') return null;

  const alta = nivel === 'alta';
  const corClasse = alta ? 'text-red-500' : 'text-amber-500';
  const titulo = alta ? 'Altamente inflamável' : 'Levemente inflamável';
  const classeTexto = classe ?? (alta ? 'A3' : 'A2L');
  const aviso = alta
    ? 'Gás altamente inflamável. Nunca usar como drop-in; só em equipamento projetado e certificado. Cuidado com fontes de ignição.'
    : 'Gás levemente inflamável. Seguir norma e limite de carga do fabricante.';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${titulo} (${classeTexto})`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
            props.className,
          )}
        >
          <Flame
            className={cn('shrink-0', corClasse)}
            style={{ width: size, height: size }}
            strokeWidth={2.5}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-56 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-start gap-2">
          <Flame
            className={cn('mt-0.5 shrink-0', corClasse)}
            style={{ width: 16, height: 16 }}
            strokeWidth={2.5}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {titulo}{' '}
              <span className="font-medium text-muted-foreground">({classeTexto})</span>
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{aviso}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
