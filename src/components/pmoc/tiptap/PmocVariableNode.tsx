import { Node, mergeAttributes } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { Tag } from 'lucide-react';
import {
  PMOC_VARIABLES,
  isPmocVariableKey,
  getVariableValue,
  type PmocVariableContext,
  type PmocVariableKey,
} from '@/utils/pmocVariables';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * TipTap Node "pmocVariable" — badge visual de variável PMOC.
 *
 * - Inline + atomic: o badge é INDIVISÍVEL (backspace remove o nó inteiro,
 *   cursor não entra dentro).
 * - Parse: lê `<span data-pmoc-var="empresa.cnpj"></span>` do HTML salvo no
 *   banco e (re)cria o nó.
 * - Render HTML (save): emite o MESMO `<span data-pmoc-var="...">` SEM
 *   substituir pelo valor — a substituição só acontece na edge function de
 *   PDF (ou no momento de exportar).
 * - Render visual no editor: via `ReactNodeViewRenderer`, mostra um `Badge`
 *   colorido com Tag icon + label PT-BR. Azul (primary) quando tem valor,
 *   vermelho (destructive) quando vazio.
 *
 * O contexto de valores (`PmocVariableContext`) chega via storage do editor
 * (`editor.storage.pmocVariable.context`) — setado pela prop `templateContext`
 * em `PmocRichTextEditor`. Isso evita prop drilling no NodeView.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-H-variaveis-badges.md §2
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pmocVariable: {
      /** Insere um badge de variável PMOC no cursor. */
      insertPmocVariable: (variableKey: PmocVariableKey) => ReturnType;
    };
  }
}

export interface PmocVariableStorage {
  /** Contexto runtime (valores reais das variáveis) — opcional. */
  context: PmocVariableContext | null;
}

function VariableBadgeView(props: NodeViewProps) {
  const { node, editor } = props;
  const rawKey = node.attrs.variableKey as string;
  const valid = isPmocVariableKey(rawKey);
  const meta = valid ? PMOC_VARIABLES[rawKey] : null;
  const label = meta?.label ?? rawKey;

  // Lê contexto do storage do editor (setado pelo PmocRichTextEditor)
  const storage = editor.storage.pmocVariable as PmocVariableStorage | undefined;
  const value = valid && storage?.context
    ? getVariableValue(rawKey, storage.context)
    : '';
  const isEmpty = value === '';

  return (
    <NodeViewWrapper as="span" className="inline-block align-middle">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              contentEditable={false}
              data-pmoc-var={rawKey}
              data-pmoc-empty={isEmpty ? 'true' : 'false'}
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 align-middle mx-0.5',
                'text-xs font-medium select-none whitespace-nowrap',
                'cursor-help',
                isEmpty
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-primary text-primary-foreground',
              )}
            >
              <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{label}</span>
              {isEmpty && <span className="opacity-90">(vazio)</span>}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[280px]">
            <p className="font-semibold">{label}</p>
            {isEmpty ? (
              <p className="text-muted-foreground mt-0.5">
                Campo vazio. Cadastre o dado pra preencher no PDF.
              </p>
            ) : (
              <p className="text-muted-foreground mt-0.5 break-words">
                {value}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </NodeViewWrapper>
  );
}

export const PmocVariableNode = Node.create<Record<string, never>, PmocVariableStorage>({
  name: 'pmocVariable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return {
      context: null,
    };
  },

  addAttributes() {
    return {
      variableKey: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-pmoc-var') ?? '',
        renderHTML: (attrs) => {
          if (!attrs.variableKey) return {};
          return {
            'data-pmoc-var': attrs.variableKey as string,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-pmoc-var]',
        getAttrs: (el) => {
          if (typeof el === 'string') return false;
          const key = el.getAttribute('data-pmoc-var');
          if (!key) return false;
          return { variableKey: key };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const key = node.attrs.variableKey as string;
    const meta = isPmocVariableKey(key) ? PMOC_VARIABLES[key] : null;
    // Conteúdo de texto interno apenas como FALLBACK pra leitores antigos /
    // copy-paste fora do editor. A edge function de PDF substitui pelo valor
    // real. Mantemos o label PT-BR pra que copy-paste em outro app mostre
    // algo legível.
    const label = meta?.label ?? key;
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-pmoc-var': key,
        'data-pmoc-label': label,
      }),
      label,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableBadgeView);
  },

  addCommands() {
    return {
      insertPmocVariable:
        (variableKey: PmocVariableKey) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { variableKey },
          });
        },
    };
  },
});
