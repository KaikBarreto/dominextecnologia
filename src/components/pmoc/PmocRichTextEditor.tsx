import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import DOMPurify from 'dompurify';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Link2Off,
  Undo,
  Redo,
  Tag,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PmocVariableNode, type PmocVariableStorage } from './tiptap/PmocVariableNode';
import {
  PMOC_VARIABLES_BY_CATEGORY,
  PMOC_VARIABLE_CATEGORY_LABELS,
  type PmocVariableCategory,
  type PmocVariableContext,
  type PmocVariableKey,
} from '@/utils/pmocVariables';

/**
 * Editor rich-text PMOC (Onda C — v1.9.x).
 *
 * Emite HTML sanitizado. Usado pra editar Termo de Responsabilidade Técnica
 * e Certificado de Conformidade antes de gerar o PDF do Dossiê PMOC.
 *
 * Sanitização:
 * - TipTap StarterKit já restringe nodes/marks no parse.
 * - DOMPurify é aplicado como segunda camada quando o `value` vem de fonte
 *   externa (banco, template-base). Edição local não passa por DOMPurify a
 *   cada keystroke pra não interromper o cursor — sanitização vale na entrada.
 * - `data-pmoc-var` é whitelist explícita em DOMPurify (preserva nós de
 *   variável; sem isso, o DOMPurify removeria o atributo e quebraria o badge).
 *
 * Variáveis PMOC (Onda H):
 * - Cada `<span data-pmoc-var="X"></span>` é renderizado como badge colorido
 *   via `PmocVariableNode`.
 * - Toolbar tem botão "Inserir variável" com dropdown agrupado por categoria.
 * - `templateContext` (valores reais) é exposto via `editor.storage.pmocVariable`
 *   pra o NodeView pintar azul/vermelho conforme campo cheio/vazio.
 *
 * Mobile-first: a toolbar agrupa por categoria e quebra naturalmente em
 * largura pequena. Botões com `min-h-[44px]` no mobile pra alvo tátil.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §5.3 / §1.1a
 *        docs/planos/2026-05-23-pmoc-onda-H-variaveis-badges.md
 */

export interface PmocRichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Quando true, desabilita edição (usado em preview). */
  readOnly?: boolean;
  className?: string;
  /**
   * Contexto runtime com os valores reais das variáveis PMOC. Usado pelo
   * NodeView pra mostrar badge azul (cheio) ou vermelho (vazio). Não é
   * usado pra substituir o HTML — substituição só acontece no momento de
   * gerar o PDF (edge function).
   */
  templateContext?: PmocVariableContext | null;
}

/**
 * Sanitiza HTML preservando tags básicas que o editor PMOC aceita.
 * Removida segurança contra `<script>`, `on*` handlers, URLs `javascript:`.
 *
 * `data-pmoc-var` e `data-pmoc-label` são preservados pra que os nós de
 * variável PMOC sobrevivam ao parse (sem isso, DOMPurify removeria os
 * atributos e quebraria os badges).
 */
function sanitizeHtml(input: string): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u',
      'ul', 'ol', 'li',
      'h2', 'h3',
      'a', 'span', 'div',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'data-pmoc-var', 'data-pmoc-label'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  icon: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, label, icon }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'h-9 w-9 p-0 sm:h-8 sm:w-8 shrink-0',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {icon}
    </Button>
  );
}

/**
 * Dropdown "Inserir variável" — lista as 17 variáveis PMOC agrupadas por
 * categoria. Ao clicar, insere o nó `pmocVariable` no cursor atual.
 */
function InsertVariableMenu({ editor }: { editor: Editor }) {
  const categories: PmocVariableCategory[] = ['empresa', 'rt', 'cliente', 'contrato', 'data'];

  const handleInsert = (key: PmocVariableKey) => {
    editor.chain().focus().insertPmocVariable(key).run();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Inserir variável"
          title="Inserir variável PMOC"
          className="h-9 px-2 sm:h-8 sm:px-2 shrink-0 gap-1"
        >
          <Tag className="h-4 w-4" />
          <span className="hidden text-xs sm:inline">Variável</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[70vh] w-64 overflow-y-auto"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Inserir variável PMOC
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {categories.map((cat, idx) => {
          const items = PMOC_VARIABLES_BY_CATEGORY[cat];
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              {idx > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {PMOC_VARIABLE_CATEGORY_LABELS[cat]}
              </DropdownMenuLabel>
              {items.map(({ key, meta }) => (
                <DropdownMenuItem
                  key={key}
                  onSelect={() => handleInsert(key)}
                  className="text-sm"
                >
                  <Tag className="mr-2 h-3.5 w-3.5 text-primary" />
                  {meta.label}
                </DropdownMenuItem>
              ))}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  const promptLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL do link (deixe vazio pra remover):', previous ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    // Bloqueia javascript: e dados nocivos
    if (/^\s*javascript:/i.test(url)) {
      window.alert('Link inválido.');
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url, target: '_blank', rel: 'noopener noreferrer' })
      .run();
  };

  return (
    // Onda G: toolbar sticky no topo do container do editor pra não sumir
    // ao rolar texto longo no editor PMOC (modal full-width no desktop).
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-muted/30">
      {/* Grupo: formatação inline */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Negrito"
          icon={<Bold className="h-4 w-4" />}
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Itálico"
          icon={<Italic className="h-4 w-4" />}
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Sublinhado"
          icon={<UnderlineIcon className="h-4 w-4" />}
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
      </div>

      <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      {/* Grupo: títulos */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Título grande"
          icon={<Heading2 className="h-4 w-4" />}
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          label="Subtítulo"
          icon={<Heading3 className="h-4 w-4" />}
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />
      </div>

      <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      {/* Grupo: listas */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Lista com marcadores"
          icon={<List className="h-4 w-4" />}
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Lista numerada"
          icon={<ListOrdered className="h-4 w-4" />}
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
      </div>

      <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      {/* Grupo: link */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Inserir/editar link"
          icon={<LinkIcon className="h-4 w-4" />}
          active={editor.isActive('link')}
          onClick={promptLink}
        />
        <ToolbarButton
          label="Remover link"
          icon={<Link2Off className="h-4 w-4" />}
          disabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().unsetLink().run()}
        />
      </div>

      <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      {/* Grupo: variáveis PMOC */}
      <div className="flex items-center gap-0.5">
        <InsertVariableMenu editor={editor} />
      </div>

      <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      {/* Grupo: histórico */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Desfazer"
          icon={<Undo className="h-4 w-4" />}
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          label="Refazer"
          icon={<Redo className="h-4 w-4" />}
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>
    </div>
  );
}

export function PmocRichTextEditor({
  value,
  onChange,
  placeholder = 'Comece a escrever…',
  minHeight = 240,
  readOnly = false,
  className,
  templateContext,
}: PmocRichTextEditorProps) {
  // Sanitiza valor externo na primeira passagem e a cada vez que value muda
  // de origem (não a cada keystroke local).
  const [sanitizedInitial] = useState(() => sanitizeHtml(value || ''));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // headings limitados a H2 e H3 (regra de produto pmoc)
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      PmocVariableNode,
    ],
    content: sanitizedInitial,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none',
          'px-3 py-3 sm:px-4 sm:py-3',
        ),
        'data-placeholder': placeholder,
      },
    },
    onUpdate: ({ editor: ed }) => {
      // HTML local — confiamos no schema do TipTap (já restringe).
      onChange(ed.getHTML());
    },
  });

  // Quando o `value` muda externamente (ex: reset to default), sincroniza.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incomingClean = sanitizeHtml(value || '');
    if (incomingClean !== current) {
      editor.commands.setContent(incomingClean, false);
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Mantém o storage do PmocVariableNode sincronizado com o `templateContext`
  // recebido por prop. NodeView lê de `editor.storage.pmocVariable.context`
  // pra decidir badge azul (cheio) ou vermelho (vazio).
  // Quando o contexto muda (ex: gestor cadastrou CNPJ em outra aba), força
  // re-render dos NodeViews via dispatch de uma transação no-op.
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage.pmocVariable as PmocVariableStorage | undefined;
    if (!storage) return;
    storage.context = templateContext ?? null;
    // Força re-render dos NodeViews (dispatch vazio re-aplica decorations e
    // re-monta NodeViews quando atributos não mudam — usamos `setMeta` pra
    // sinalizar atualização e o editor reflete).
    editor.view.dispatch(editor.view.state.tr.setMeta('pmocVariable:context', Date.now()));
  }, [editor, templateContext]);

  if (!editor) {
    return (
      <div
        className={cn('rounded-md border bg-card', className)}
        style={{ minHeight }}
        aria-busy="true"
      />
    );
  }

  return (
    // O scroll vive no container externo pra que a toolbar (sticky) fique
    // ancorada no topo enquanto o usuário rola o conteúdo. `maxHeight: 60vh`
    // mantém o editor sob controle dentro de modais grandes.
    <div
      className={cn('overflow-y-auto rounded-md border bg-card', className)}
      style={{ minHeight, maxHeight: '60vh' }}
    >
      {!readOnly && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
