import { Editor } from "@tiptap/react";
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Quote, Minus, Link, Image, Youtube, Highlighter,
  Undo, Redo, Type, LayoutTemplate, Palette, CodeXml,
  Baseline, ALargeSmall, Columns,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";

interface BlogEditorToolbarProps {
  editor: Editor | null;
  onImageUpload: () => void;
}

const ToolbarButton = ({
  onClick,
  isActive,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title: string;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className={cn(
      "h-8 w-8 p-0",
      isActive && "bg-muted text-primary"
    )}
    onClick={onClick}
    title={title}
  >
    {children}
  </Button>
);

const PRESET_COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#ffffff",
  "#ff0000", "#ff4d00", "#ff9900", "#ffcc00", "#ffff00", "#99ff00",
  "#00ff00", "#00ff99", "#00ffff", "#0099ff", "#0000ff", "#9900ff",
  "#ff00ff", "#ff0099", "#cc0000", "#994c00", "#997700", "#009900",
  "#006666", "#003399", "#660099", "#990066",
];

const HIGHLIGHT_COLORS = [
  { label: "Amarelo", value: "#fef08a" },
  { label: "Verde", value: "#bbf7d0" },
  { label: "Azul", value: "#bfdbfe" },
  { label: "Rosa", value: "#fbcfe8" },
  { label: "Roxo", value: "#e9d5ff" },
  { label: "Laranja", value: "#fed7aa" },
  { label: "Vermelho", value: "#fecaca" },
  { label: "Cinza", value: "#e5e7eb" },
];

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "python", label: "Python" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "xml", label: "XML" },
  { value: "markdown", label: "Markdown" },
  { value: "yaml", label: "YAML" },
];

export const BlogEditorToolbar = ({ editor, onImageUpload }: BlogEditorToolbarProps) => {
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [infographicOpen, setInfographicOpen] = useState(false);
  const [infographicHtml, setInfographicHtml] = useState("");
  const [infographicCaption, setInfographicCaption] = useState("");
  const [fontSize, setFontSize] = useState("16");
  const [isFontInputFocused, setIsFontInputFocused] = useState(false);

  const confirmYoutube = useCallback(() => {
    if (!editor || !youtubeUrl) return;
    editor.commands.setYoutubeVideo({ src: youtubeUrl, width: 640, height: 360 });
    setYoutubeUrl("");
    setYoutubeOpen(false);
  }, [editor, youtubeUrl]);

  const confirmLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
    setLinkUrl("");
    setLinkOpen(false);
  }, [editor, linkUrl]);

  const confirmInfographic = useCallback(() => {
    if (!editor || !infographicHtml) return;
    editor.chain().focus().insertContent({
      type: 'infographic',
      attrs: { html: infographicHtml, caption: infographicCaption },
    }).run();
    setInfographicHtml("");
    setInfographicCaption("");
    setInfographicOpen(false);
  }, [editor, infographicHtml, infographicCaption]);

  const applyFontSize = useCallback((size: string) => {
    if (!editor) return;
    const clampedSize = String(Math.max(8, Math.min(96, parseInt(size) || 16)));
    setFontSize(clampedSize);
    editor.chain().focus().setFontSize(`${clampedSize}px`).run();
  }, [editor]);

  const getEditorFontSize = useCallback(() => {
    if (!editor) return "16";
    const raw = editor.getAttributes('textStyle').fontSize as string | undefined;
    return raw ? raw.replace('px', '') : "16";
  }, [editor]);

  const decreaseFontSize = useCallback(() => {
    const current = parseInt(getEditorFontSize());
    applyFontSize(String(Math.max(8, current - 2)));
  }, [getEditorFontSize, applyFontSize]);

  const increaseFontSize = useCallback(() => {
    const current = parseInt(getEditorFontSize());
    applyFontSize(String(Math.min(96, current + 2)));
  }, [getEditorFontSize, applyFontSize]);

if (!editor) return null;

  // Derive displayed font size from editor state (reactive because BlogRichEditor re-renders on state change)
  const editorFontSize = editor.getAttributes('textStyle').fontSize?.replace('px', '') || "16";
  const displayedFontSize = isFontInputFocused ? fontSize : editorFontSize;

  return (
    <>
      <div className="sticky top-14 z-30 flex flex-wrap items-center gap-0.5 border-b border-border bg-background/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        {/* Undo/Redo */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Desfazer">
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Refazer">
          <Redo className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="Título 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="Título 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="Subtítulo"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          isActive={editor.isActive("paragraph")}
          title="Parágrafo"
        >
          <Type className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Font Size */}
        <div className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="sm" className="h-8 w-6 p-0 text-xs" onClick={decreaseFontSize} title="Diminuir fonte">
            −
          </Button>
          <Input
            value={displayedFontSize}
            onFocus={() => {
              setIsFontInputFocused(true);
              setFontSize(editorFontSize);
            }}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setFontSize(val);
            }}
            onBlur={() => {
              setIsFontInputFocused(false);
              applyFontSize(fontSize);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyFontSize(fontSize);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-8 w-10 text-center text-xs p-0 border"
            title="Tamanho da fonte"
          />
          <Button type="button" variant="ghost" size="sm" className="h-8 w-6 p-0 text-xs" onClick={increaseFontSize} title="Aumentar fonte">
            +
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Negrito"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Itálico"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="Sublinhado"
        >
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          title="Tachado"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Text Color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Cor do texto">
              <div className="flex flex-col items-center">
                <Baseline className="h-4 w-4" />
                <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#151515' }} />
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <p className="text-xs font-medium text-muted-foreground mb-2">Cor do texto</p>
            <div className="grid grid-cols-7 gap-1">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => editor.chain().focus().setColor(color).run()}
                  title={color}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                className="h-7 w-7 cursor-pointer rounded border-0 p-0"
                onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
              />
              <span className="text-xs text-muted-foreground">Personalizado</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 w-full text-xs h-7"
              onClick={() => editor.chain().focus().unsetColor().run()}
            >
              Remover cor
            </Button>
          </PopoverContent>
        </Popover>

        {/* Highlight Color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className={cn("h-8 w-8 p-0", editor.isActive("highlight") && "bg-muted")} title="Cor de destaque">
              <div className="flex flex-col items-center">
                <Highlighter className="h-4 w-4" />
                <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: editor.getAttributes('highlight').color || '#fef08a' }} />
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <p className="text-xs font-medium text-muted-foreground mb-2">Cor de destaque</p>
            <div className="grid grid-cols-4 gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="h-8 w-8 rounded border border-border hover:scale-110 transition-transform flex items-center justify-center"
                  style={{ backgroundColor: c.value }}
                  onClick={() => editor.chain().focus().toggleHighlight({ color: c.value }).run()}
                  title={c.label}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                defaultValue="#fef08a"
                className="h-7 w-7 cursor-pointer rounded border-0 p-0"
                onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
              />
              <span className="text-xs text-muted-foreground">Personalizado</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 w-full text-xs h-7"
              onClick={() => editor.chain().focus().unsetHighlight().run()}
            >
              Remover destaque
            </Button>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
          title="Alinhar à esquerda"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
          title="Centralizar"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
          title="Alinhar à direita"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          isActive={editor.isActive({ textAlign: "justify" })}
          title="Justificar"
        >
          <AlignJustify className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Lista"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="Citação"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Divisor"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Code Block */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="Bloco de código"
        >
          <CodeXml className="h-4 w-4" />
        </ToolbarButton>

        {/* Media */}
        <ToolbarButton onClick={() => setLinkOpen(true)} isActive={editor.isActive("link")} title="Link">
          <Link className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={onImageUpload} title="Imagem">
          <Image className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => setYoutubeOpen(true)} title="Vídeo YouTube">
          <Youtube className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => setInfographicOpen(true)} title="Infográfico HTML/SVG">
          <LayoutTemplate className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Columns */}
        <ToolbarButton
          onClick={() => (editor as any).commands.setColumnLayout(2)}
          title="2 Colunas"
        >
          <Columns className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Code block language selector - shown when inside a code block */}
      {editor.isActive("codeBlock") && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 bg-muted/20">
          <span className="text-xs text-muted-foreground">Linguagem:</span>
          <Select
            value={editor.getAttributes("codeBlock").language || ""}
            onValueChange={(lang) => {
              editor.chain().focus().updateAttributes("codeBlock", { language: lang }).run();
            }}
          >
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value} className="text-xs">
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Link Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inserir Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>URL</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://exemplo.com"
                onKeyDown={(e) => e.key === "Enter" && confirmLink()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancelar</Button>
            <Button onClick={confirmLink} disabled={!linkUrl}>Inserir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* YouTube Dialog */}
      <Dialog open={youtubeOpen} onOpenChange={setYoutubeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inserir Vídeo do YouTube</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>URL do vídeo</Label>
              <Input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                onKeyDown={(e) => e.key === "Enter" && confirmYoutube()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYoutubeOpen(false)}>Cancelar</Button>
            <Button onClick={confirmYoutube} disabled={!youtubeUrl}>Inserir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Infographic Dialog */}
      <Dialog open={infographicOpen} onOpenChange={setInfographicOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inserir Infográfico (HTML/SVG)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Código HTML/SVG</Label>
              <Textarea
                value={infographicHtml}
                onChange={(e) => setInfographicHtml(e.target.value)}
                placeholder="Cole aqui o código SVG ou HTML do infográfico..."
                rows={12}
                className="font-mono text-xs"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label>Legenda (opcional)</Label>
              <Input
                value={infographicCaption}
                onChange={(e) => setInfographicCaption(e.target.value)}
                placeholder="Ex: Simulação de perda mensal por falta de controle"
              />
            </div>
            {infographicHtml && (
              <div className="border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-2">Pré-visualização:</p>
                <div dangerouslySetInnerHTML={{ __html: infographicHtml }} className="overflow-auto max-h-60" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfographicOpen(false)}>Cancelar</Button>
            <Button onClick={confirmInfographic} disabled={!infographicHtml}>Inserir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
