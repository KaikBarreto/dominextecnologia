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
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
 *
 * Mobile-first: a toolbar agrupa por categoria e quebra naturalmente em
 * largura pequena. Botões com `min-h-[44px]` no mobile pra alvo tátil.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §5.3 / §1.1a
 */

export interface PmocRichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Quando true, desabilita edição (usado em preview). */
  readOnly?: boolean;
  className?: string;
}

/**
 * Sanitiza HTML preservando tags básicas que o editor PMOC aceita.
 * Removida segurança contra `<script>`, `on*` handlers, URLs `javascript:`.
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
    ALLOWED_ATTR: ['href', 'target', 'rel'],
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
    <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-1.5">
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
    <div className={cn('rounded-md border bg-card', className)}>
      {!readOnly && <EditorToolbar editor={editor} />}
      <div
        className="overflow-y-auto"
        style={{ minHeight, maxHeight: '60vh' }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

