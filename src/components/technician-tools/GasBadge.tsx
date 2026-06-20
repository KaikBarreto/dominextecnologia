import { type ReactNode, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { explicacaoBadge } from './gasBadgeInfo';

/**
 * Badge de tipo de gás / classe de segurança com explicação acessível por TOQUE
 * (mobile-first). Quando há explicação no mapa (`explicacaoBadge`), o badge vira
 * gatilho de um Popover que abre no clique/toque — robusto no celular, ao
 * contrário de tooltip de hover puro. Sem explicação, renderiza o badge cru.
 *
 * `rawText` é o texto usado pra resolver a explicação (ex.: a classe "A2L" ou o
 * tipo "HFC"); `children` é o conteúdo visual do badge (pode ter ícone de chama).
 * Quando dentro de um card clicável, o toque no badge NÃO dispara a navegação do
 * card (stopPropagation no gatilho).
 */
export function GasBadge({
  rawText,
  className,
  children,
}: {
  rawText: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const explicacao = explicacaoBadge(rawText);

  // Sem explicação: badge simples, sem interação extra.
  if (!explicacao) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Não deixa o toque "vazar" pro card clicável que envolve o badge.
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen((v) => !v);
          }}
          // Desktop: abre ao passar o mouse e fecha ao sair. O tap continua
          // valendo (mobile-first), o hover é só um extra por cima.
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          aria-label={`O que é ${rawText}? Toque para ver a explicação`}
          className={cn('cursor-help', className)}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 text-sm leading-relaxed"
        // Clicar dentro do popover não fecha o card nem propaga.
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-semibold text-foreground">{rawText}</p>
        <p className="mt-1 text-muted-foreground">{explicacao}</p>
      </PopoverContent>
    </Popover>
  );
}
