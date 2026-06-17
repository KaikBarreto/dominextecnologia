import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import domiflixLogoDark from "@/assets/domiflix-logo-horizontal-preto.png";
import domiflixLogoLight from "@/assets/domiflix-logo-horizontal.png";
import { typography } from "@/lib/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  Film,
  Tv,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  GripVertical,
  Upload,
  X,
} from "lucide-react";
import {
  useDomiflixTitles,
  useDomiflixTitle,
  useCreateTitle,
  useUpdateTitle,
  useDeleteTitle,
  useCreateSeason,
  useUpdateSeason,
  useDeleteSeason,
  useCreateEpisode,
  useUpdateEpisode,
  useDeleteEpisode,
  DomiflixTitle,
  DomiflixSeason,
  DomiflixEpisode,
} from "@/hooks/useDomiflix";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AdminDomiflixSections } from "@/components/admin/AdminDomiflixSections";

// ─── Breadcrumb ────────────────────────────────────────────────────────────────

interface BreadcrumbItem {
  label: string;
  path?: string;
}

function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center flex-wrap gap-y-1 text-sm text-muted-foreground mb-4">
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          {index > 0 && <ChevronRight className="h-4 w-4 mx-2" />}
          {item.path ? (
            <Link to={item.path} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}

// ─── Image Upload Helper ──────────────────────────────────────────────────────

async function uploadDomiflixImage(file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("domiflix-thumbnails").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("domiflix-thumbnails").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Video helpers ────────────────────────────────────────────────────────────
import { extractYouTubeId, getYouTubeThumbnail } from "@/lib/youtube";
import { extractDriveId } from "@/lib/drive";

// ─── Image Upload Field ───────────────────────────────────────────────────────

function ImageUploadField({
  label,
  value,
  onChange,
  hint,
  aspectRatio,
  darkPreview,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  aspectRatio?: string;
  darkPreview?: boolean;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadDomiflixImage(file, "titles");
      onChange(url);
    } catch (err: any) {
      toast.error("Erro ao enviar imagem: " + (err.message || "Erro desconhecido"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="col-span-2 space-y-1.5">
      <Label>{label}</Label>
      {value ? (
        <div
          className={`relative rounded-md overflow-hidden border ${darkPreview ? "bg-black" : "bg-muted"}`}
          style={{ aspectRatio: aspectRatio || "auto", maxHeight: "200px" }}
        >
          <img src={value} alt="" className={`w-full h-full ${darkPreview ? "object-contain p-3" : "object-cover"}`} />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-md cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
          {uploading ? (
            <span className="text-sm text-muted-foreground">Enviando...</span>
          ) : (
            <>
              <Upload className="w-5 h-5 text-muted-foreground mb-1" />
              <span className="text-xs text-muted-foreground">Clique para enviar</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
            disabled={uploading}
          />
        </label>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Title Form ───────────────────────────────────────────────────────────────

interface TitleFormData {
  type: "series" | "movie";
  title: string;
  description: string;
  banner_url: string;
  thumbnail_url: string;
  logo_url: string;
  is_featured: boolean;
  live_url: string;
  live_scheduled_at: string;
}

const EMPTY_TITLE_FORM: TitleFormData = {
  type: "series",
  title: "",
  description: "",
  banner_url: "",
  thumbnail_url: "",
  logo_url: "",
  is_featured: false,
  live_url: "",
  live_scheduled_at: "",
};

function TitleFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: DomiflixTitle | null;
}) {
  const createTitle = useCreateTitle();
  const updateTitle = useUpdateTitle();

  const [form, setForm] = useState<TitleFormData>(() =>
    editing
      ? {
          type: editing.type,
          title: editing.title,
          description: editing.description ?? "",
          banner_url: editing.banner_url ?? "",
          thumbnail_url: editing.thumbnail_url ?? "",
          logo_url: editing.logo_url ?? "",
          is_featured: editing.is_featured,
          live_url: editing.live_url ?? "",
          live_scheduled_at: editing.live_scheduled_at
            ? editing.live_scheduled_at.slice(0, 16)
            : "",
        }
      : EMPTY_TITLE_FORM
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      type: form.type,
      title: form.title,
      description: form.description || null,
      banner_url: form.banner_url || null,
      thumbnail_url: form.thumbnail_url || null,
      logo_url: form.logo_url || null,
      tags: [] as string[],
      is_featured: form.is_featured,
      order_index: editing?.order_index ?? 0,
      live_url: form.live_url || null,
      live_scheduled_at: form.live_scheduled_at
        ? new Date(form.live_scheduled_at).toISOString()
        : null,
    };

    if (editing) {
      await updateTitle.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createTitle.mutateAsync(payload as any);
    }
    onOpenChange(false);
  }

  const isPending = createTitle.isPending || updateTitle.isPending;

  const titleFooter = (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        className="flex-1"
      >
        Cancelar
      </Button>
      <Button type="submit" form="domiflix-title-form" disabled={isPending} className="flex-1">
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar Título" : "Novo Título"}
      description="Preencha as informações do título Domiflix"
      footer={titleFooter}
    >
      <form id="domiflix-title-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v as "series" | "movie" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="series">
                  <span className="flex items-center gap-2">
                    <Tv className="w-4 h-4" />
                    Série (Módulo de aulas)
                  </span>
                </SelectItem>
                <SelectItem value="movie">
                  <span className="flex items-center gap-2">
                    <Film className="w-4 h-4" />
                    Filme (Live)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="Ex: Módulo de Vendas"
            />
          </div>

          <ImageUploadField
            label="Logo branca do título (opcional)"
            value={form.logo_url}
            onChange={(url) => setForm({ ...form, logo_url: url })}
            hint="PNG transparente com o nome estilizado em branco. Quando definido, substitui o texto do título nas heros e na tela de pausa do player."
            darkPreview
          />

          <div className="col-span-2 space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Sinopse do módulo/live..."
            />
          </div>

          <ImageUploadField
            label="Banner"
            value={form.banner_url}
            onChange={(url) => setForm({ ...form, banner_url: url })}
            hint="Horizontal 16:9 — recomendado 1280 × 720 px"
            aspectRatio="16/9"
          />

          <ImageUploadField
            label="Thumbnail"
            value={form.thumbnail_url}
            onChange={(url) => setForm({ ...form, thumbnail_url: url })}
            hint="Vertical 2:3 — recomendado 400 × 600 px"
            aspectRatio="2/3"
          />

          <div className="col-span-2 flex items-center justify-between">
            <div>
              <Label>Destaque (Hero)</Label>
              <p className="text-xs text-muted-foreground">Aparece no banner principal</p>
            </div>
            <Switch
              checked={form.is_featured}
              onCheckedChange={(v) => setForm({ ...form, is_featured: v })}
            />
          </div>

          {form.type === "movie" && (
            <>
              <div className="col-span-2 space-y-1.5">
                <Label>Link da Live</Label>
                <Input
                  value={form.live_url}
                  onChange={(e) => setForm({ ...form, live_url: e.target.value })}
                  placeholder="https://zoom.us/... ou YouTube Live"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Data/Hora da Live</Label>
                <Input
                  type="datetime-local"
                  value={form.live_scheduled_at}
                  onChange={(e) => setForm({ ...form, live_scheduled_at: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      </form>
    </ResponsiveModal>
  );
}

// ─── Episode Form ─────────────────────────────────────────────────────────────

interface EpisodeFormData {
  title: string;
  description: string;
  video_id: string;
  video_type: "drive" | "youtube";
  thumbnail_url: string;
  recorded_at: string;
  season_id: string;
}

const EMPTY_EP_FORM: EpisodeFormData = {
  title: "",
  description: "",
  video_id: "",
  video_type: "drive",
  thumbnail_url: "",
  recorded_at: "",
  season_id: "",
};

function EpisodeFormDialog({
  open,
  onOpenChange,
  titleId,
  seasons,
  editing,
  defaultSeasonId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titleId: string;
  seasons: DomiflixSeason[];
  editing?: DomiflixEpisode | null;
  defaultSeasonId?: string;
}) {
  const createEp = useCreateEpisode();
  const updateEp = useUpdateEpisode();

  const [form, setForm] = useState<EpisodeFormData>(() =>
    editing
      ? {
          title: editing.title,
          description: editing.description ?? "",
          video_id: editing.video_id ?? "",
          video_type: editing.video_type,
          thumbnail_url: editing.thumbnail_url ?? "",
          recorded_at: editing.recorded_at ? editing.recorded_at.slice(0, 10) : "",
          season_id: editing.season_id ?? "",
        }
      : { ...EMPTY_EP_FORM, season_id: defaultSeasonId || "" }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Use YouTube thumbnail as fallback if no thumbnail uploaded
    let thumbnailUrl = form.thumbnail_url || null;
    if (!thumbnailUrl && form.video_type === "youtube" && form.video_id) {
      thumbnailUrl = getYouTubeThumbnail(form.video_id);
    }

    const payload = {
      title_id: titleId,
      title: form.title,
      description: form.description || null,
      video_id: form.video_id || null,
      video_type: form.video_type,
      duration_minutes: null as number | null,
      thumbnail_url: thumbnailUrl,
      episode_number: null,
      order_index: editing?.order_index ?? 0,
      recorded_at: form.recorded_at ? new Date(form.recorded_at).toISOString() : null,
      season_id: form.season_id || null,
    };

    if (editing) {
      await updateEp.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createEp.mutateAsync(payload as any);
    }
    onOpenChange(false);
  }

  const isPending = createEp.isPending || updateEp.isPending;

  const episodeFooter = (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        className="flex-1"
      >
        Cancelar
      </Button>
      <Button type="submit" form="domiflix-episode-form" disabled={isPending} className="flex-1">
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar Episódio" : "Novo Episódio"}
      description="Preencha as informações do episódio/aula"
      footer={episodeFooter}
    >
      <form id="domiflix-episode-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {seasons.length > 1 && (
            <div className="col-span-2 space-y-1.5">
              <Label>Temporada</Label>
              <Select
                value={form.season_id || "none"}
                onValueChange={(v) => setForm({ ...form, season_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem temporada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem temporada</SelectItem>
                  {seasons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} {s.season_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="col-span-2 space-y-1.5">
            <Label>Título do Episódio *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="Ex: Introdução ao Sistema"
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label>Tipo de vídeo</Label>
            <Select
              value={form.video_type}
              onValueChange={(v) =>
                setForm({ ...form, video_type: v as "drive" | "youtube" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="drive">Google Drive</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label>
              ID do vídeo{" "}
              <span className="text-muted-foreground font-normal">(aceita link completo)</span>
            </Label>
            <Input
              value={form.video_id}
              onChange={(e) => {
                const raw = e.target.value;
                if (form.video_type === "youtube") {
                  setForm({ ...form, video_id: extractYouTubeId(raw) });
                } else {
                  setForm({ ...form, video_id: extractDriveId(raw) });
                }
              }}
              placeholder={
                form.video_type === "drive"
                  ? "Cole o link do Drive ou o ID do arquivo"
                  : "Cole o link do YouTube ou o ID"
              }
            />
            {form.video_type === "drive" && (
              <p className="text-xs text-muted-foreground">
                Recomendado: usar Google Drive evita anúncios e UI do YouTube. Compartilhe como
                "Qualquer pessoa com o link".
              </p>
            )}
            {form.video_type === "youtube" && form.video_id && !form.thumbnail_url && (
              <p className="text-xs text-muted-foreground">
                Sem thumbnail? Será usado o frame do YouTube automaticamente.
              </p>
            )}
          </div>

          <ImageUploadField
            label="Thumbnail"
            value={form.thumbnail_url}
            onChange={(url) => setForm({ ...form, thumbnail_url: url })}
            hint="Horizontal 16:9 — recomendado 640 × 360 px"
            aspectRatio="16/9"
          />

          <div className="col-span-2 space-y-1.5">
            <Label>Data de Gravação</Label>
            <Input
              type="date"
              value={form.recorded_at}
              onChange={(e) => setForm({ ...form, recorded_at: e.target.value })}
            />
          </div>
        </div>
      </form>
    </ResponsiveModal>
  );
}

// ─── Season Form ──────────────────────────────────────────────────────────────

function SeasonFormDialog({
  open,
  onOpenChange,
  titleId,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titleId: string;
  editing?: DomiflixSeason | null;
}) {
  const createSeason = useCreateSeason();
  const updateSeason = useUpdateSeason();
  const [form, setForm] = useState({
    season_number: editing?.season_number ?? 1,
    title: editing?.title ?? "Temporada",
    description: editing?.description ?? "",
    order_index: editing?.order_index ?? 0,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      await updateSeason.mutateAsync({ id: editing.id, title_id: titleId, ...form });
    } else {
      await createSeason.mutateAsync({ title_id: titleId, ...form });
    }
    onOpenChange(false);
  }

  const isPending = createSeason.isPending || updateSeason.isPending;

  const seasonFooter = (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        className="flex-1"
      >
        Cancelar
      </Button>
      <Button type="submit" form="domiflix-season-form" disabled={isPending} className="flex-1">
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar Temporada" : "Nova Temporada"}
      footer={seasonFooter}
    >
      <form id="domiflix-season-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Número</Label>
            <Input
              type="number"
              min={1}
              value={form.season_number}
              onChange={(e) =>
                setForm({ ...form, season_number: parseInt(e.target.value) || 1 })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
        </div>
      </form>
    </ResponsiveModal>
  );
}

// ─── Sortable Episode Row ─────────────────────────────────────────────────────

function SortableEpisodeRow({
  episode,
  onEdit,
  onDelete,
}: {
  episode: DomiflixEpisode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: episode.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-2.5 pl-3 border rounded bg-background hover:bg-muted/30 transition-colors"
    >
      <button
        type="button"
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {episode.thumbnail_url ? (
        <img
          src={episode.thumbnail_url}
          alt=""
          className="shrink-0 w-14 aspect-video object-cover rounded bg-muted"
        />
      ) : (
        <div className="shrink-0 w-14 aspect-video bg-muted rounded flex items-center justify-center">
          <Film className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm line-clamp-1">{episode.title}</p>
        <p className="text-xs text-muted-foreground">
          {episode.video_type === "youtube" ? "YouTube" : "Drive"}
          {episode.duration_minutes ? ` • ${episode.duration_minutes}min` : ""}
          {episode.recorded_at &&
            ` • ${format(new Date(episode.recorded_at), "dd/MM/yyyy", { locale: ptBR })}`}
        </p>
      </div>

      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover episódio?</AlertDialogTitle>
              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/80">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ─── Sortable Season Section (with nested episodes) ───────────────────────────

function SortableSeasonSection({
  season,
  onEditSeason,
  onDeleteSeason,
  onEditEpisode,
  onDeleteEpisode,
  onAddEpisode,
  onEpisodeDragEnd,
}: {
  season: DomiflixSeason & { episodes: DomiflixEpisode[] };
  onEditSeason: () => void;
  onDeleteSeason: () => void;
  onEditEpisode: (ep: DomiflixEpisode) => void;
  onDeleteEpisode: (ep: DomiflixEpisode) => void;
  onAddEpisode: () => void;
  onEpisodeDragEnd: (event: DragEndEvent, episodes: DomiflixEpisode[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: season.id });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg overflow-hidden bg-card">
      {/* Season header */}
      <div className="flex items-center gap-2 p-3 bg-muted/30">
        <button
          type="button"
          className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "" : "-rotate-90"}`} />
        </button>

        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm">
            {season.title} {season.season_number}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {season.episodes.length} episódio{season.episodes.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddEpisode}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEditSeason}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover temporada?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os episódios desta temporada ficarão sem temporada (não serão apagados).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onDeleteSeason} className="bg-destructive hover:bg-destructive/80">
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Episodes nested list */}
      {expanded && (
        <div className="p-2 space-y-1.5">
          {season.episodes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              Nenhum episódio nesta temporada
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => onEpisodeDragEnd(e, season.episodes)}
            >
              <SortableContext
                items={season.episodes.map((ep) => ep.id)}
                strategy={verticalListSortingStrategy}
              >
                {season.episodes.map((ep) => (
                  <SortableEpisodeRow
                    key={ep.id}
                    episode={ep}
                    onEdit={() => onEditEpisode(ep)}
                    onDelete={() => onDeleteEpisode(ep)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Detail view (title selected) ─────────────────────────────────────────────

function TitleDetail({
  titleId,
  onBack,
}: {
  titleId: string;
  onBack: () => void;
}) {
  const { data: titleData, isLoading } = useDomiflixTitle(titleId);
  const deleteEpisode = useDeleteEpisode();
  const deleteSeason = useDeleteSeason();
  const queryClient = useQueryClient();

  const [seasonDialog, setSeasonDialog] = useState(false);
  const [editingSeason, setEditingSeason] = useState<DomiflixSeason | null>(null);
  const [episodeDialog, setEpisodeDialog] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<DomiflixEpisode | null>(null);
  const [defaultSeasonIdForNewEp, setDefaultSeasonIdForNewEp] = useState<string>("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSeasonDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!titleData) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const items = titleData.seasons;
      const oldIndex = items.findIndex((s) => s.id === active.id);
      const newIndex = items.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(items, oldIndex, newIndex);
      const promises = reordered.map((s, i) =>
        supabase.from("domiflix_seasons" as any).update({ order_index: i } as any).eq("id", s.id)
      );
      await Promise.all(promises);
      toast.success("Ordem das temporadas atualizada");
      queryClient.invalidateQueries({ queryKey: ["domiflix-title", titleId] });
    },
    [titleData, queryClient, titleId]
  );

  const handleEpisodeDragEnd = useCallback(
    async (event: DragEndEvent, episodes: DomiflixEpisode[]) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = episodes.findIndex((ep) => ep.id === active.id);
      const newIndex = episodes.findIndex((ep) => ep.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(episodes, oldIndex, newIndex);
      const promises = reordered.map((ep, i) =>
        supabase.from("domiflix_episodes" as any).update({ order_index: i } as any).eq("id", ep.id)
      );
      await Promise.all(promises);
      toast.success("Ordem dos episódios atualizada");
      queryClient.invalidateQueries({ queryKey: ["domiflix-title", titleId] });
    },
    [queryClient, titleId]
  );

  if (isLoading) {
    return (
      <div className="text-muted-foreground text-sm py-8 text-center">Carregando...</div>
    );
  }

  if (!titleData) return null;

  // Direct episodes (no season)
  const directEpisodes = titleData.episodes;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Títulos
        </Button>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-foreground">{titleData.title}</span>
        <Badge variant={titleData.type === "series" ? "default" : "secondary"}>
          {titleData.type === "series" ? "Série" : "Filme/Live"}
        </Badge>
      </div>

      {/* Séries: visão hierárquica temporadas > episódios */}
      {titleData.type === "series" && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className={typography.sectionTitle}>Temporadas e Episódios</h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingSeason(null);
                  setSeasonDialog(true);
                }}
                className="gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Nova Temporada
              </Button>
              {titleData.seasons.length === 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    setDefaultSeasonIdForNewEp("");
                    setEditingEpisode(null);
                    setEpisodeDialog(true);
                  }}
                  className="gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Novo Episódio
                </Button>
              )}
            </div>
          </div>

          {titleData.seasons.length === 0 && directEpisodes.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
              Nenhuma temporada ou episódio cadastrado. Crie uma temporada e adicione episódios.
            </p>
          )}

          {/* Drag-and-drop seasons */}
          {titleData.seasons.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSeasonDragEnd}
            >
              <SortableContext
                items={titleData.seasons.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {titleData.seasons.map((s) => (
                    <SortableSeasonSection
                      key={s.id}
                      season={s}
                      onEditSeason={() => {
                        setEditingSeason(s);
                        setSeasonDialog(true);
                      }}
                      onDeleteSeason={() =>
                        deleteSeason.mutate({ id: s.id, title_id: titleId })
                      }
                      onEditEpisode={(ep) => {
                        setEditingEpisode(ep);
                        setEpisodeDialog(true);
                      }}
                      onDeleteEpisode={(ep) =>
                        deleteEpisode.mutate({ id: ep.id, title_id: titleId })
                      }
                      onAddEpisode={() => {
                        setDefaultSeasonIdForNewEp(s.id);
                        setEditingEpisode(null);
                        setEpisodeDialog(true);
                      }}
                      onEpisodeDragEnd={handleEpisodeDragEnd}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Direct episodes (no season) */}
          {directEpisodes.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Sem temporada</p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleEpisodeDragEnd(e, directEpisodes)}
              >
                <SortableContext
                  items={directEpisodes.map((ep) => ep.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">
                    {directEpisodes.map((ep) => (
                      <SortableEpisodeRow
                        key={ep.id}
                        episode={ep}
                        onEdit={() => {
                          setEditingEpisode(ep);
                          setEpisodeDialog(true);
                        }}
                        onDelete={() =>
                          deleteEpisode.mutate({ id: ep.id, title_id: titleId })
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      )}

      {/* Filmes/Lives: lista simples de gravações */}
      {titleData.type === "movie" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className={typography.sectionTitle}>Gravações</h3>
            <Button
              size="sm"
              onClick={() => {
                setDefaultSeasonIdForNewEp("");
                setEditingEpisode(null);
                setEpisodeDialog(true);
              }}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Nova Gravação
            </Button>
          </div>
          {directEpisodes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
              Nenhuma gravação cadastrada
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleEpisodeDragEnd(e, directEpisodes)}
            >
              <SortableContext
                items={directEpisodes.map((ep) => ep.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {directEpisodes.map((ep) => (
                    <SortableEpisodeRow
                      key={ep.id}
                      episode={ep}
                      onEdit={() => {
                        setEditingEpisode(ep);
                        setEpisodeDialog(true);
                      }}
                      onDelete={() =>
                        deleteEpisode.mutate({ id: ep.id, title_id: titleId })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {seasonDialog && (
        <SeasonFormDialog
          open={seasonDialog}
          onOpenChange={setSeasonDialog}
          titleId={titleId}
          editing={editingSeason}
        />
      )}
      {episodeDialog && (
        <EpisodeFormDialog
          open={episodeDialog}
          onOpenChange={setEpisodeDialog}
          titleId={titleId}
          seasons={titleData.seasons}
          editing={editingEpisode}
          defaultSeasonId={defaultSeasonIdForNewEp}
        />
      )}
    </div>
  );
}

// ─── Sortable Title Row ───────────────────────────────────────────────────────

function SortableTitleRow({
  title,
  onSelect,
  onEdit,
  onToggleFeatured,
  onDelete,
}: {
  title: DomiflixTitle;
  onSelect: () => void;
  onEdit: () => void;
  onToggleFeatured: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: title.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 border rounded-md bg-card hover:bg-muted/50 transition-colors cursor-pointer"
      onClick={onSelect}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="shrink-0 w-16 aspect-video bg-muted rounded overflow-hidden">
        {title.banner_url || title.thumbnail_url ? (
          <img
            src={title.banner_url ?? title.thumbnail_url ?? ""}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {title.type === "movie" ? (
              <Film className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Tv className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm line-clamp-1">{title.title}</span>
          {title.is_featured && (
            <Star className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFeatured();
          }}
          title={title.is_featured ? "Remover destaque" : "Colocar em destaque"}
        >
          <Star
            className={`w-4 h-4 ${title.is_featured ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`}
          />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover &quot;{title.title}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                Todas as temporadas e episódios serão removidos. Ação irreversível.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="bg-destructive hover:bg-destructive/80"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ─── Main admin page ──────────────────────────────────────────────────────────

export default function AdminDomiflix() {
  const { data: titles = [], isLoading } = useDomiflixTitles();
  const deleteTitle = useDeleteTitle();
  const updateTitle = useUpdateTitle();
  const queryClient = useQueryClient();

  const [titleDialog, setTitleDialog] = useState(false);
  const [editingTitle, setEditingTitle] = useState<DomiflixTitle | null>(null);
  const [selectedTitleId, setSelectedTitleId] = useState<string | null>(null);

  const seriesTitles = titles.filter((t) => t.type === "series");
  const movieTitles = titles.filter((t) => t.type === "movie");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent, items: DomiflixTitle[]) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((t) => t.id === active.id);
      const newIndex = items.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(items, oldIndex, newIndex);

      const promises = reordered.map((t, i) =>
        supabase
          .from("domiflix_titles" as any)
          .update({ order_index: i } as any)
          .eq("id", t.id)
      );
      await Promise.all(promises);
      toast.success("Ordem atualizada");
      queryClient.invalidateQueries({ queryKey: ["domiflix-titles"] });
    },
    [queryClient]
  );

  if (selectedTitleId) {
    return (
      <div className="p-4 sm:p-8 max-w-4xl">
        <Breadcrumb items={[{ label: "Domiflix", path: "/admin/domiflix" }]} />
        <TitleDetail titleId={selectedTitleId} onBack={() => setSelectedTitleId(null)} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <Breadcrumb items={[{ label: "Domiflix" }]} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src={domiflixLogoDark} alt="Domiflix" className="h-9 object-contain dark:hidden" />
          <img src={domiflixLogoLight} alt="Domiflix" className="h-9 object-contain hidden dark:block" />
          <div>
            <p className="text-sm text-muted-foreground">Gerenciar módulos, séries e lives</p>
          </div>
        </div>
        <Button
          onClick={() => {
            setEditingTitle(null);
            setTitleDialog(true);
          }}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Novo Título
        </Button>
      </div>

      <Tabs defaultValue="series">
        <TabsList className="mb-6">
          <TabsTrigger value="series" className="gap-2">
            <Tv className="w-4 h-4" />
            Séries ({seriesTitles.length})
          </TabsTrigger>
          <TabsTrigger value="movies" className="gap-2">
            <Film className="w-4 h-4" />
            Lives ({movieTitles.length})
          </TabsTrigger>
          <TabsTrigger value="sections" className="gap-2">
            <GripVertical className="w-4 h-4" />
            Seções
          </TabsTrigger>
        </TabsList>

        <TabsContent value="series">
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Carregando...</p>
          ) : seriesTitles.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Tv className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma série cadastrada</p>
              <p className="text-sm">Crie um título do tipo "Série" para começar</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(e, seriesTitles)}
            >
              <SortableContext
                items={seriesTitles.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {seriesTitles.map((t) => (
                    <SortableTitleRow
                      key={t.id}
                      title={t}
                      onSelect={() => setSelectedTitleId(t.id)}
                      onEdit={() => {
                        setEditingTitle(t);
                        setTitleDialog(true);
                      }}
                      onToggleFeatured={() =>
                        updateTitle.mutate({ id: t.id, is_featured: !t.is_featured })
                      }
                      onDelete={() => deleteTitle.mutate(t.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        <TabsContent value="movies">
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Carregando...</p>
          ) : movieTitles.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma live cadastrada</p>
              <p className="text-sm">Crie um título do tipo "Filme" para lives</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(e, movieTitles)}
            >
              <SortableContext
                items={movieTitles.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {movieTitles.map((t) => (
                    <SortableTitleRow
                      key={t.id}
                      title={t}
                      onSelect={() => setSelectedTitleId(t.id)}
                      onEdit={() => {
                        setEditingTitle(t);
                        setTitleDialog(true);
                      }}
                      onToggleFeatured={() =>
                        updateTitle.mutate({ id: t.id, is_featured: !t.is_featured })
                      }
                      onDelete={() => deleteTitle.mutate(t.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        <TabsContent value="sections">
          <AdminDomiflixSections />
        </TabsContent>
      </Tabs>

      {titleDialog && (
        <TitleFormDialog
          open={titleDialog}
          onOpenChange={setTitleDialog}
          editing={editingTitle}
        />
      )}
    </div>
  );
}
