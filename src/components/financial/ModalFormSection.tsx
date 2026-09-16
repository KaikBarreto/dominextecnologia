import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalFormSectionProps {
  /** Título da seção (ex.: "O que é", "Dinheiro"). */
  title: ReactNode;
  children: ReactNode;
  /** Quando true, vira um cabeçalho clicável que abre/fecha o conteúdo. */
  collapsible?: boolean;
  /**
   * Estado inicial de uma seção colapsável. Passe `true` quando algum campo de
   * dentro já tiver valor (modo edição) — assim ninguém perde dado de vista.
   * Depois da primeira interação o estado é do usuário: NÃO reagimos a
   * mudanças posteriores desta prop de propósito.
   */
  defaultOpen?: boolean;
  /** Resumo curto exibido no cabeçalho quando a seção está fechada. */
  summary?: ReactNode;
  /**
   * Quando false, os filhos NÃO recebem o grid de 2 colunas — use pra seções
   * que são um bloco único (ex.: parcelamento).
   */
  grid?: boolean;
  className?: string;
}

/** Título da seção — mais forte que o rótulo de campo (bold + cor plena). */
const sectionHeadingClass =
  'text-[13px] font-bold uppercase tracking-widest text-foreground';

/**
 * Seção de formulário dos modais financeiros: cabeçalho em "linha de régua"
 * (título + filete até a borda) e grid de duas colunas no desktop.
 *
 * Porte 1:1 de src/components/financial/ModalFormSection.tsx do EcoSistemaSaaS
 * (irmão deste repo) — mesmo componente, mesmas decisões, só o import de
 * `cn` ajustado pro alias deste projeto. Ver o histórico do EcoSistema pro
 * comentário original completo; reproduzido abaixo porque as razões continuam
 * valendo aqui sem alteração:
 *
 * HIERARQUIA (por que não usamos um token global de título de seção): um
 * token de "sectionTitle" compartilhado com o rótulo de campo faz o título
 * "DINHEIRO" ficar idêntico ao rótulo "FORMA DE PAGAMENTO" e a tela vira uma
 * lista plana. Aqui o título é `font-bold` + `text-foreground` PLENO contra o
 * `font-semibold` mais claro dos campos, e ganha o filete como assinatura
 * visual.
 *
 * RITMO: `pt-6 first:pt-0` — 24px de respiro ANTES de cada seção contra os
 * 12px (`gap-y-3`) entre campos da mesma seção. Os formulários que empilham
 * estas seções devem usar `space-y-0`: o espaçamento entre seções mora AQUI,
 * pra que uma seção condicional que não renderiza não deixe buraco duplo.
 *
 * COLAPSÁVEL: mesmo cabeçalho, sem caixa/borda em volta — quem sinaliza "dá
 * pra abrir" é o chevron + o hover. O hover usa `bg-muted` SÓLIDO (nunca
 * translúcido `/50` — fill dessaturado de baixa opacidade é regra proibida no
 * projeto, ver reguas-de-ui.md): quase-branco no claro, grafite no escuro.
 *
 * O grid usa `lg:` porque 1024px é o breakpoint de `useIsCompact`/`useIsMobile`
 * (`src/hooks/use-mobile.tsx`), que é quem decide se o `ResponsiveModal`
 * renderiza Dialog (desktop) ou Drawer (mobile). Abaixo disso é sempre uma
 * coluna. Preenchimento por LINHA — não trocar por `grid-flow-col`, senão a
 * ordem do Tab deixa de bater com a ordem visual.
 *
 * Campos que devem ocupar a linha inteira levam `lg:col-span-2` no próprio
 * wrapper do campo.
 */
export function ModalFormSection({
  title,
  children,
  collapsible = false,
  defaultOpen = false,
  summary,
  grid = true,
  className,
}: ModalFormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;

  const body = (
    <div
      className={cn(
        grid && 'grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3',
        !grid && 'space-y-3',
        !isOpen && 'hidden',
      )}
    >
      {children}
    </div>
  );

  if (!collapsible) {
    return (
      <section className={cn('space-y-3 pt-6 first:pt-0', className)}>
        <div className="flex items-center gap-3">
          <h3 className={sectionHeadingClass}>{title}</h3>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>
        {body}
      </section>
    );
  }

  return (
    <section className={cn('space-y-3 pt-6 first:pt-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={isOpen}
        className="group -mx-1 flex w-full flex-col gap-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted"
      >
        <span className="flex w-full items-center gap-3">
          <span className={sectionHeadingClass}>{title}</span>
          <span
            aria-hidden
            className="h-px flex-1 bg-border transition-colors group-hover:bg-foreground/20"
          />
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-[transform,color] group-hover:text-foreground',
              isOpen && 'rotate-180',
            )}
          />
        </span>
        {!isOpen && summary && (
          <span className="block w-full truncate text-xs text-muted-foreground">
            {summary}
          </span>
        )}
      </button>
      {body}
    </section>
  );
}
