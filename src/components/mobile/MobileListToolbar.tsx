import type { ReactNode, Ref } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MobileListToolbarProps {
  /** Valor do campo de busca. */
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /**
   * 2ª linha, da esquerda pra direita: botão de filtros e ações secundárias
   * (todas com `h-10` pra alinhar). Deixe vazio se a tela não tem nenhuma.
   */
  children?: ReactNode;
  /** 2ª linha, encostado à direita: alternador de visualização (lista/grade). */
  trailing?: ReactNode;
  /** Ref do input, pra quem precisa focar a busca ao entrar na tela (deep-link). */
  searchInputRef?: Ref<HTMLInputElement>;
  className?: string;
}

/**
 * Toolbar padrão das telas de listagem no MOBILE (régua do CEO, 2026-10-01).
 *
 * Hierarquia fixa, pra nada ficar espremido numa linha só em tela estreita:
 *   1ª linha — busca ocupando a largura inteira (é a ação primária da listagem);
 *   2ª linha — filtros + ações secundárias à esquerda, visualização à direita.
 *
 * Regras de quem usa:
 * - Só no ramo `isMobile`; o desktop continua com a toolbar dele.
 * - Todo controle da 2ª linha tem `h-10` (alvo de toque e alinhamento).
 * - Botão com ícone + rótulo curto; se o rótulo não couber em tela estreita,
 *   esconda só o texto com `hidden min-[340px]:inline` (o ícone permanece).
 * - Nunca mais de 3 controles na 2ª linha — o 4º vai pro sheet de filtros.
 */
export function MobileListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  children,
  trailing,
  searchInputRef,
  className,
}: MobileListToolbarProps) {
  const hasActions = !!children || !!trailing;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          placeholder={searchPlaceholder}
          className="h-10 pl-10"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {hasActions && (
        <div className="flex items-center gap-2">
          {children}
          {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
        </div>
      )}
    </div>
  );
}
