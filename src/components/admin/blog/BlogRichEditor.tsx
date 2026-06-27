import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ResizableImage } from "./extensions/ResizableImage";
import Youtube from "@tiptap/extension-youtube";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { lowlight } from "./extensions/lowlight";
import { InfographicNode } from "./extensions/InfographicNode";
import { ColumnLayout, Column } from "./extensions/ColumnLayout";
import { FontSize } from "./extensions/FontSize";
import { DragHandle } from "./extensions/DragHandle";
import { BlogEditorToolbar } from "./BlogEditorToolbar";
import { useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BlogRichEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export const BlogRichEditor = ({ content, onChange }: BlogRichEditorProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoDetectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (autoDetectTimerRef.current) clearTimeout(autoDetectTimerRef.current);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false, // substituído por CodeBlockLowlight
      }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      Youtube.configure({ controls: true, nocookie: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Color,
      TextStyle,
      FontSize,
      Underline,
      Placeholder.configure({ placeholder: "Comece a escrever seu artigo aqui..." }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: "plaintext" }),
      InfographicNode,
      ColumnLayout,
      Column,
      DragHandle,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());

      // Auto-detecta a linguagem de blocos de código que ainda não têm uma
      if (autoDetectTimerRef.current) clearTimeout(autoDetectTimerRef.current);
      autoDetectTimerRef.current = setTimeout(() => {
        const { doc, tr } = editor.state;
        const updates: Array<{ pos: number; attrs: Record<string, unknown> }> = [];

        doc.descendants((node, pos) => {
          if (node.type.name !== "codeBlock") return;
          const lang: string | null = node.attrs.language;
          if (lang && lang !== "plaintext") return; // já tem linguagem
          const code = node.textContent.trim();
          if (code.length < 20) return; // curto demais pra detectar
          try {
            const result = lowlight.highlightAuto(code);
            const detected = (result as any)?.data?.language as string | undefined;
            if (detected && detected !== "plaintext") {
              updates.push({ pos, attrs: { ...node.attrs, language: detected } });
            }
          } catch { /* ignora */ }
        });

        if (updates.length > 0) {
          updates.forEach(({ pos, attrs }) => tr.setNodeMarkup(pos, undefined, attrs));
          editor.view.dispatch(tr);
        }
      }, 600);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose dark:prose-invert max-w-none p-4 pl-8 min-h-[600px] focus:outline-none",
      },
    },
  });

  // Sincroniza o conteúdo vindo do pai quando muda externamente (ex.: carregar post existente)
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content && !editor.isFocused) {
      editor.commands.setContent(content, false);
    }
  }, [editor, content]);

  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error } = await supabase.storage
      .from("blog-images")
      .upload(fileName, file);

    if (error) {
      toast.error("Erro ao enviar a imagem");
      return;
    }

    const { data: publicData } = supabase.storage
      .from("blog-images")
      .getPublicUrl(fileName);

    editor.chain().focus().setResizableImage({ src: publicData.publicUrl }).run();
    e.target.value = "";
  }, [editor]);

  return (
    <div className="border border-border rounded-lg bg-background relative">
      <BlogEditorToolbar editor={editor} onImageUpload={handleImageUpload} />
      <EditorContent editor={editor} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};
