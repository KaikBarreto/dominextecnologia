import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Pencil, Trash2, Star, Film, Tv, Layers,
  Image as ImageIcon, Upload, Search, Eye, ChevronRight, PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useDomiflixTitles, useDomiflixTitle, useCreateTitle, useUpdateTitle, useDeleteTitle,
  useCreateSeason, useUpdateSeason, useDeleteSeason,
  useCreateEpisode, useUpdateEpisode, useDeleteEpisode,
  type DomiflixTitle, type DomiflixSeason, type DomiflixEpisode,
} from "@/hooks/useDomiflix";
import { AdminDomiflixSections } from "@/components/admin/AdminDomiflixSections";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { StatCarousel } from "@/components/mobile/StatCarousel";
import { FilterSheet } from "@/components/mobile/FilterSheet";
import { FABButton } from "@/components/mobile/FABButton";
import { MobileListItem, type ItemAction } from "@/components/mobile/MobileListItem";
import { EmptyState } from "@/components/mobile/EmptyState";
import { FilterCheckboxGroup } from "@/components/mobile/FilterCheckboxGroup";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";

// ─────────────── Image upload helper ───────────────
async function uploadImage(file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("domiflix-thumbnails").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("domiflix-thumbnails").getPublicUrl(path);
  return data.publicUrl;
}

function ImageUploadField({ label, value, onChange, folder }: { label: string; value: string | null; onChange: (url: string | null) => void; folder: string }) {
  const [uploading, setUploading] = useState(false);
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, folder);
      onChange(url);
      toast.success("Imagem enviada");
    } catch (err: any) {
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2 items-start">
        {value ? (
          <div className="relative h-20 w-32 shrink-0 rounded overflow-hidden border bg-muted">
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button onClick={() => onChange(null)} className="absolute top-0.5 right-0.5 bg-destructive text-white rounded-full p-0.5 hover:bg-destructive/80">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="h-20 w-32 shrink-0 rounded border border-dashed flex items-center justify-center bg-muted/30 text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
        <div className="flex-1 space-y-1">
          <Input value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder="URL ou faça upload" />
          <label className="inline-flex items-center gap-1.5 text-xs text-primary cursor-pointer hover:underline">
            <Upload className="h-3 w-3" />
            {uploading ? "Enviando..." : "Upload"}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
          </label>
        </div>
      </div>
    </div>
  );
}

// ─────────────── Title Form ───────────────
interface TitleFormDialogProps { open: boolean; onOpenChange: (o: boolean) => void; title: DomiflixTitle | null; }
function TitleFormDialog({ open, onOpenChange, title }: TitleFormDialogProps) {
  const create = useCreateTitle();
  const update = useUpdateTitle();
  const isEdit = !!title;
  const [form, setForm] = useState(() => ({
    type: (title?.type ?? "series") as "series" | "movie",
    title: title?.title ?? "",
    description: title?.description ?? "",
    banner_url: title?.banner_url ?? null,
    thumbnail_url: title?.thumbnail_url ?? null,
    logo_url: title?.logo_url ?? null,
    tags: (title?.tags ?? []).join(", "),
    is_featured: title?.is_featured ?? false,
    order_index: title?.order_index ?? 0,
    live_url: title?.live_url ?? null,
    live_scheduled_at: title?.live_scheduled_at ?? null,
  }));

  async function handleSave() {
    const payload = {
      type: form.type,
      title: form.title.trim(),
      description: form.description?.trim() || null,
      banner_url: form.banner_url,
      thumbnail_url: form.thumbnail_url,
      logo_url: form.logo_url,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      is_featured: form.is_featured,
      order_index: form.order_index,
      live_url: form.live_url,
      live_scheduled_at: form.live_scheduled_at,
    };
    if (!payload.title) return toast.error("Título obrigatório");
    if (isEdit && title) await update.mutateAsync({ id: title.id, ...payload });
    else await create.mutateAsync(payload as any);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Título" : "Novo Título"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v: any) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="series">Série / Módulo</SelectItem>
                  <SelectItem value="movie">Filme / Live</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input type="number" value={form.order_index} onChange={(e) => setForm((f) => ({ ...f, order_index: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
          <ImageUploadField label="Banner (16:9)" value={form.banner_url} onChange={(url) => setForm((f) => ({ ...f, banner_url: url }))} folder="banners" />
          <ImageUploadField label="Thumbnail (poster vertical)" value={form.thumbnail_url} onChange={(url) => setForm((f) => ({ ...f, thumbnail_url: url }))} folder="thumbnails" />
          <ImageUploadField label="Logo (PNG transparente)" value={form.logo_url} onChange={(url) => setForm((f) => ({ ...f, logo_url: url }))} folder="logos" />
          <div className="space-y-1.5">
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="tutorial, iniciante" />
          </div>
          {form.type === "movie" && (
            <>
              <div className="space-y-1.5">
                <Label>URL da Live</Label>
                <Input value={form.live_url ?? ""} onChange={(e) => setForm((f) => ({ ...f, live_url: e.target.value || null }))} placeholder="https://..." />
              </div>
              <div className="space-y-1.5">
                <Label>Agendado para</Label>
                <Input type="datetime-local" value={form.live_scheduled_at?.slice(0, 16) ?? ""} onChange={(e) => setForm((f) => ({ ...f, live_scheduled_at: e.target.value || null }))} />
              </div>
            </>
          )}
          <div className="flex items-center gap-2 pt-2">
            <Switch checked={form.is_featured} onCheckedChange={(v) => setForm((f) => ({ ...f, is_featured: v }))} />
            <Label className="cursor-pointer">Destacar no banner principal</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────── Episode Form ───────────────
function EpisodeFormDialog({ open, onOpenChange, titleId, seasons, episode, defaultSeasonId }: {
  open: boolean; onOpenChange: (o: boolean) => void; titleId: string;
  seasons: DomiflixSeason[]; episode: DomiflixEpisode | null;
  /** Pré-seleciona uma temporada ao criar (usado pelo FAB contextual no mobile). Ignorado na edição. */
  defaultSeasonId?: string | null;
}) {
  const create = useCreateEpisode();
  const update = useUpdateEpisode();
  const isEdit = !!episode;
  const [form, setForm] = useState(() => ({
    season_id: episode?.season_id ?? defaultSeasonId ?? null,
    title: episode?.title ?? "",
    description: episode?.description ?? "",
    episode_number: episode?.episode_number ?? null,
    video_id: episode?.video_id ?? "",
    video_type: (episode?.video_type ?? "youtube") as "drive" | "youtube",
    duration_minutes: episode?.duration_minutes ?? null,
    thumbnail_url: episode?.thumbnail_url ?? null,
    recorded_at: episode?.recorded_at ?? null,
    order_index: episode?.order_index ?? 0,
  }));

  async function handleSave() {
    if (!form.title.trim()) return toast.error("Título obrigatório");
    const payload = {
      title_id: titleId,
      season_id: form.season_id,
      title: form.title.trim(),
      description: form.description?.trim() || null,
      episode_number: form.episode_number,
      video_id: form.video_id?.trim() || null,
      video_type: form.video_type,
      duration_minutes: form.duration_minutes,
      thumbnail_url: form.thumbnail_url,
      recorded_at: form.recorded_at,
      order_index: form.order_index,
    };
    if (isEdit && episode) await update.mutateAsync({ id: episode.id, ...payload } as any);
    else await create.mutateAsync(payload as any);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Episódio" : "Novo Episódio"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Temporada</Label>
              <Select value={form.season_id ?? "none"} onValueChange={(v) => setForm((f) => ({ ...f, season_id: v === "none" ? null : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem temporada —</SelectItem>
                  {seasons.map((s) => <SelectItem key={s.id} value={s.id}>T{s.season_number} — {s.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nº Episódio</Label>
              <Input type="number" value={form.episode_number ?? ""} onChange={(e) => setForm((f) => ({ ...f, episode_number: e.target.value ? Number(e.target.value) : null }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo de vídeo</Label>
              <Select value={form.video_type} onValueChange={(v: any) => setForm((f) => ({ ...f, video_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="drive">Google Drive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duração (min)</Label>
              <Input type="number" value={form.duration_minutes ?? ""} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value ? Number(e.target.value) : null }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>ID/URL do vídeo</Label>
            <Input value={form.video_id ?? ""} onChange={(e) => setForm((f) => ({ ...f, video_id: e.target.value }))} placeholder={form.video_type === "youtube" ? "youtube.com/watch?v=... ou ID" : "ID do arquivo no Drive"} />
          </div>
          <ImageUploadField label="Thumbnail" value={form.thumbnail_url} onChange={(url) => setForm((f) => ({ ...f, thumbnail_url: url }))} folder="episodes" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gravado em</Label>
              <Input type="date" value={form.recorded_at?.slice(0, 10) ?? ""} onChange={(e) => setForm((f) => ({ ...f, recorded_at: e.target.value || null }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input type="number" value={form.order_index} onChange={(e) => setForm((f) => ({ ...f, order_index: Number(e.target.value) }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────── Season Form ───────────────
function SeasonFormDialog({ open, onOpenChange, titleId, season }: {
  open: boolean; onOpenChange: (o: boolean) => void; titleId: string; season: DomiflixSeason | null;
}) {
  const create = useCreateSeason();
  const update = useUpdateSeason();
  const isEdit = !!season;
  const [form, setForm] = useState(() => ({
    season_number: season?.season_number ?? 1,
    title: season?.title ?? "",
    description: season?.description ?? "",
  }));

  async function handleSave() {
    if (!form.title.trim()) return toast.error("Título obrigatório");
    const payload = {
      title_id: titleId,
      season_number: form.season_number,
      title: form.title.trim(),
      description: form.description?.trim() || null,
      order_index: 0,
    };
    if (isEdit && season) await update.mutateAsync({ id: season.id, ...payload } as any);
    else await create.mutateAsync(payload as any);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Editar Temporada" : "Nova Temporada"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nº Temporada</Label>
              <Input type="number" value={form.season_number} onChange={(e) => setForm((f) => ({ ...f, season_number: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────── Title detail (seasons + episodes) ───────────────
// Onda 4: refatoração mobile-first para níveis 2-3.
// - Mobile: cada temporada é um MobileListItem expandível; episódios indentados também são MobileListItem.
// - Desktop: visual preservado (Cards + ações inline).
function TitleDetailView({ titleId, onBack }: { titleId: string; onBack: () => void }) {
  const isMobile = useIsMobile();
  const { data: full, isLoading } = useDomiflixTitle(titleId);
  const deleteSeason = useDeleteSeason();
  const deleteEpisode = useDeleteEpisode();

  const [seasonDialog, setSeasonDialog] = useState<{ open: boolean; season: DomiflixSeason | null }>({ open: false, season: null });
  const [episodeDialog, setEpisodeDialog] = useState<{ open: boolean; episode: DomiflixEpisode | null; seasonId?: string | null }>({ open: false, episode: null });
  const [confirmDel, setConfirmDel] = useState<{ kind: "season" | "episode"; id: string } | null>(null);

  // Quais temporadas estão expandidas no mobile.
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(() => new Set());
  // Última temporada com interação — usada pra contextualizar o FAB ("Novo Episódio" naquela temporada).
  const [lastFocusedSeasonId, setLastFocusedSeasonId] = useState<string | null>(null);

  const toggleSeason = (id: string) => {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setLastFocusedSeasonId(id);
      }
      return next;
    });
  };

  if (isLoading || !full) {
    return (
      <div className={cn(isMobile ? "px-3 py-4" : "container mx-auto p-6 max-w-5xl")}>
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // Resolve qual temporada o FAB "Novo Episódio" usa por padrão no mobile.
  const focusedSeason =
    full.seasons.find((s) => s.id === lastFocusedSeasonId) ??
    (expandedSeasons.size > 0
      ? full.seasons.find((s) => expandedSeasons.has(s.id))
      : undefined);

  // Formata duração total da temporada em "Xh Ym" ou "Ym".
  const formatTotalDuration = (eps: DomiflixEpisode[]) => {
    const total = eps.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
    if (total <= 0) return null;
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  };

  return (
    <div className={cn(isMobile ? "px-3 pb-24" : "container mx-auto p-6 max-w-5xl")}>
      <div className="space-y-4">
        {/* Cabeçalho do detalhe — mobile compactado, desktop como era */}
        {isMobile ? (
          <MobilePageHeader
            title={full.title}
            subtitle={full.type === "series" ? "Série/Módulo" : "Filme/Live"}
            icon={full.type === "series" ? Tv : Film}
            actions={
              <Button variant="ghost" size="sm" onClick={onBack} className="h-9 px-2">
                ← Voltar
              </Button>
            }
          />
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">← Voltar</Button>
              <h2 className="text-2xl font-bold">{full.title}</h2>
              <p className="text-sm text-muted-foreground">{full.type === "series" ? "Série/Módulo" : "Filme/Live"}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSeasonDialog({ open: true, season: null })}>
                <Plus className="h-4 w-4 mr-1" /> Temporada
              </Button>
              <Button onClick={() => setEpisodeDialog({ open: true, episode: null })}>
                <Plus className="h-4 w-4 mr-1" /> Episódio
              </Button>
            </div>
          </div>
        )}

        {full.seasons.length === 0 && full.episodes.length === 0 && (
          isMobile ? (
            <EmptyState
              icon={<Layers className="h-12 w-12" />}
              title="Sem conteúdo ainda"
              description='Toque em "Nova Temporada" para começar'
            />
          ) : (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum conteúdo. Crie uma temporada ou episódio.</CardContent></Card>
          )
        )}

        {isMobile ? (
          // ───────────────────────────────────────────────────────────────────
          // Mobile: árvore aninhada via MobileListItem.
          // ───────────────────────────────────────────────────────────────────
          <>
            {full.seasons.length > 0 && (
              <div className="rounded-xl border bg-card overflow-hidden">
                {full.seasons.map((s) => {
                  const isExpanded = expandedSeasons.has(s.id);
                  const totalDuration = formatTotalDuration(s.episodes);
                  const seasonActions: ItemAction[] = [
                    {
                      key: "edit-season",
                      label: "Editar temporada",
                      icon: <Pencil className="h-4 w-4" />,
                      variant: "edit" as const,
                      onClick: () => setSeasonDialog({ open: true, season: s }),
                    },
                    {
                      key: "delete-season",
                      label: "Excluir temporada",
                      icon: <Trash2 className="h-4 w-4" />,
                      variant: "destructive" as const,
                      onClick: () => setConfirmDel({ kind: "season", id: s.id }),
                    },
                  ];
                  return (
                    <div key={s.id}>
                      <MobileListItem
                        onClick={() => toggleSeason(s.id)}
                        actions={seasonActions}
                        leading={
                          <div className="h-12 w-12 rounded-md bg-primary/10 text-primary flex flex-col items-center justify-center shrink-0">
                            <span className="text-[10px] font-medium leading-none">TEMP</span>
                            <span className="text-base font-bold leading-tight">{s.season_number}</span>
                          </div>
                        }
                        title={<span className="truncate">{s.title}</span>}
                        subtitle={
                          <span className="flex items-center gap-2 flex-wrap">
                            <span>{s.episodes.length} {s.episodes.length === 1 ? "episódio" : "episódios"}</span>
                            {totalDuration && (
                              <>
                                <span aria-hidden>·</span>
                                <span>{totalDuration}</span>
                              </>
                            )}
                          </span>
                        }
                        trailing={
                          <motion.span
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="flex items-center justify-center text-muted-foreground"
                            aria-label={isExpanded ? "Recolher temporada" : "Expandir temporada"}
                          >
                            <ChevronRight className="h-5 w-5" />
                          </motion.span>
                        }
                      />
                      {/* Episódios da temporada — animação suave. */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            key="episodes"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="overflow-hidden bg-muted/30"
                          >
                            {s.episodes.length === 0 ? (
                              <div className="pl-16 pr-4 py-4 text-xs text-muted-foreground border-b border-border/60">
                                Nenhum episódio nesta temporada. Toque em "Novo Episódio" para criar.
                              </div>
                            ) : (
                              s.episodes.map((ep) => {
                                const epActions: ItemAction[] = [
                                  {
                                    key: "edit-ep",
                                    label: "Editar episódio",
                                    icon: <Pencil className="h-4 w-4" />,
                                    variant: "edit" as const,
                                    onClick: () => setEpisodeDialog({ open: true, episode: ep }),
                                  },
                                  {
                                    key: "delete-ep",
                                    label: "Excluir episódio",
                                    icon: <Trash2 className="h-4 w-4" />,
                                    variant: "destructive" as const,
                                    onClick: () => setConfirmDel({ kind: "episode", id: ep.id }),
                                  },
                                ];
                                return (
                                  <div key={ep.id} className="pl-8">
                                    <MobileListItem
                                      actions={epActions}
                                      leading={
                                        ep.thumbnail_url ? (
                                          <img
                                            src={ep.thumbnail_url}
                                            alt={ep.title}
                                            className="h-10 w-14 rounded object-cover"
                                          />
                                        ) : (
                                          <div className="h-10 w-14 rounded bg-muted text-muted-foreground flex items-center justify-center">
                                            <PlayCircle className="h-5 w-5" />
                                          </div>
                                        )
                                      }
                                      title={
                                        <span className="truncate">
                                          {ep.episode_number != null && (
                                            <span className="text-muted-foreground mr-1">EP{ep.episode_number}</span>
                                          )}
                                          {ep.title}
                                        </span>
                                      }
                                      subtitle={
                                        <span className="flex items-center gap-2 flex-wrap">
                                          {ep.duration_minutes != null && (
                                            <span>{ep.duration_minutes}min</span>
                                          )}
                                          {ep.duration_minutes != null && <span aria-hidden>·</span>}
                                          <span className="uppercase tracking-wider text-[10px] opacity-80">
                                            {ep.video_type === "youtube" ? "YouTube" : "Drive"}
                                          </span>
                                        </span>
                                      }
                                    />
                                  </div>
                                );
                              })
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Episódios sem temporada (filmes/lives soltos) — também como lista nativa. */}
            {full.episodes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  Episódios sem temporada
                </h3>
                <div className="rounded-xl border bg-card overflow-hidden">
                  {full.episodes.map((ep) => {
                    const epActions: ItemAction[] = [
                      {
                        key: "edit-ep",
                        label: "Editar episódio",
                        icon: <Pencil className="h-4 w-4" />,
                        variant: "edit" as const,
                        onClick: () => setEpisodeDialog({ open: true, episode: ep }),
                      },
                      {
                        key: "delete-ep",
                        label: "Excluir episódio",
                        icon: <Trash2 className="h-4 w-4" />,
                        variant: "destructive" as const,
                        onClick: () => setConfirmDel({ kind: "episode", id: ep.id }),
                      },
                    ];
                    return (
                      <MobileListItem
                        key={ep.id}
                        actions={epActions}
                        leading={
                          ep.thumbnail_url ? (
                            <img src={ep.thumbnail_url} alt={ep.title} className="h-10 w-14 rounded object-cover" />
                          ) : (
                            <div className="h-10 w-14 rounded bg-muted text-muted-foreground flex items-center justify-center">
                              <PlayCircle className="h-5 w-5" />
                            </div>
                          )
                        }
                        title={<span className="truncate">{ep.title}</span>}
                        subtitle={
                          <span className="flex items-center gap-2 flex-wrap">
                            {ep.duration_minutes != null && <span>{ep.duration_minutes}min</span>}
                            {ep.duration_minutes != null && <span aria-hidden>·</span>}
                            <span className="uppercase tracking-wider text-[10px] opacity-80">
                              {ep.video_type === "youtube" ? "YouTube" : "Drive"}
                            </span>
                          </span>
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          // ───────────────────────────────────────────────────────────────────
          // Desktop: visual preservado (Cards com ações inline).
          // ───────────────────────────────────────────────────────────────────
          <>
            {full.seasons.map((s) => (
              <Card key={s.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0 py-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="h-4 w-4 text-primary shrink-0" />
                    <CardTitle className="text-base truncate">T{s.season_number} — {s.title}</CardTitle>
                    <Badge variant="outline" className="shrink-0">{s.episodes.length} ep</Badge>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-warning hover:text-warning"
                      onClick={() => setSeasonDialog({ open: true, season: s })}
                      aria-label="Editar temporada"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDel({ kind: "season", id: s.id })}
                      aria-label="Excluir temporada"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-1">
                  {s.episodes.map((ep) => (
                    <div key={ep.id} className="flex items-center justify-between gap-2 py-2 px-2 rounded hover:bg-muted text-sm">
                      <span className="truncate min-w-0">EP{ep.episode_number ?? "?"} — {ep.title}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-warning hover:text-warning"
                          onClick={() => setEpisodeDialog({ open: true, episode: ep })}
                          aria-label="Editar episódio"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDel({ kind: "episode", id: ep.id })}
                          aria-label="Excluir episódio"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {s.episodes.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum episódio nesta temporada</p>}
                </CardContent>
              </Card>
            ))}

            {full.episodes.length > 0 && (
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-base">Episódios sem temporada</CardTitle></CardHeader>
                <CardContent className="pt-0 space-y-1">
                  {full.episodes.map((ep) => (
                    <div key={ep.id} className="flex items-center justify-between gap-2 py-2 px-2 rounded hover:bg-muted text-sm">
                      <span className="truncate min-w-0">{ep.title}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-warning hover:text-warning"
                          onClick={() => setEpisodeDialog({ open: true, episode: ep })}
                          aria-label="Editar episódio"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDel({ kind: "episode", id: ep.id })}
                          aria-label="Excluir episódio"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* FAB contextual (mobile-only): se há temporada focada → "Novo Episódio" nela; senão → "Nova Temporada". */}
        {isMobile && (
          focusedSeason ? (
            <FABButton
              icon={<Plus className="h-5 w-5" />}
              label="Episódio"
              onClick={() =>
                setEpisodeDialog({ open: true, episode: null, seasonId: focusedSeason.id })
              }
            />
          ) : (
            <FABButton
              icon={<Plus className="h-5 w-5" />}
              label="Temporada"
              onClick={() => setSeasonDialog({ open: true, season: null })}
            />
          )
        )}

        {seasonDialog.open && (
          <SeasonFormDialog open={seasonDialog.open} onOpenChange={(o) => !o && setSeasonDialog({ open: false, season: null })} titleId={titleId} season={seasonDialog.season} />
        )}
        {episodeDialog.open && (
          <EpisodeFormDialog
            open={episodeDialog.open}
            onOpenChange={(o) => !o && setEpisodeDialog({ open: false, episode: null })}
            titleId={titleId}
            seasons={full.seasons}
            episode={episodeDialog.episode}
            defaultSeasonId={episodeDialog.seasonId ?? null}
          />
        )}

        <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={async () => {
                  if (!confirmDel) return;
                  if (confirmDel.kind === "season") await deleteSeason.mutateAsync({ id: confirmDel.id, title_id: titleId });
                  else await deleteEpisode.mutateAsync({ id: confirmDel.id, title_id: titleId });
                  setConfirmDel(null);
                }}
              >Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ─────────────── Page ───────────────
export default function AdminDomiflix() {
  const isMobile = useIsMobile();
  const { data: titles = [], isLoading } = useDomiflixTitles();
  const deleteTitle = useDeleteTitle();
  const [titleDialog, setTitleDialog] = useState<{ open: boolean; title: DomiflixTitle | null }>({ open: false, title: null });
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [selectedTitleId, setSelectedTitleId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"titles" | "sections">("titles");
  const [searchTerm, setSearchTerm] = useState("");
  // Onda 5: multi-select. `typeFilter.length === 0` = todos (inativo).
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [featuredOnly, setFeaturedOnly] = useState(false);

  // Filtragem em memória (catálogo costuma ser pequeno) — não bate DB.
  const filteredTitles = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return titles.filter((t) => {
      if (typeFilter.length > 0 && !typeFilter.includes(t.type)) return false;
      if (featuredOnly && !t.is_featured) return false;
      if (!q) return true;
      const haystack = [t.title, t.description ?? "", ...(t.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [titles, searchTerm, typeFilter, featuredOnly]);

  // Stats: total, séries, filmes/lives, destaques
  const statItems = useMemo(() => {
    const total = titles.length;
    const series = titles.filter((t) => t.type === "series").length;
    const movies = titles.filter((t) => t.type === "movie").length;
    const featured = titles.filter((t) => t.is_featured).length;
    return [
      {
        key: "all",
        label: "Total",
        count: total,
        icon: <Layers className="h-4 w-4" />,
        accentColor: "#0ea5e9",
        active: typeFilter.length === 0 && !featuredOnly,
        onClick: () => { setTypeFilter([]); setFeaturedOnly(false); },
      },
      {
        key: "series",
        label: "Séries",
        count: series,
        icon: <Tv className="h-4 w-4" />,
        accentColor: "#8b5cf6",
        active: typeFilter.length === 1 && typeFilter[0] === "series",
        onClick: () =>
          setTypeFilter((prev) =>
            prev.length === 1 && prev[0] === "series" ? [] : ["series"],
          ),
      },
      {
        key: "movie",
        label: "Filmes/Lives",
        count: movies,
        icon: <Film className="h-4 w-4" />,
        accentColor: "#22c55e",
        active: typeFilter.length === 1 && typeFilter[0] === "movie",
        onClick: () =>
          setTypeFilter((prev) =>
            prev.length === 1 && prev[0] === "movie" ? [] : ["movie"],
          ),
      },
      {
        key: "featured",
        label: "Destaque",
        count: featured,
        icon: <Star className="h-4 w-4" />,
        accentColor: "#f59e0b",
        active: featuredOnly,
        onClick: () => setFeaturedOnly((v) => !v),
      },
    ];
  }, [titles, typeFilter, featuredOnly]);

  const activeFilterCount =
    (searchTerm ? 1 : 0) +
    (typeFilter.length > 0 ? 1 : 0) +
    (featuredOnly ? 1 : 0);

  const clearFilters = () => {
    setSearchTerm("");
    setTypeFilter([]);
    setFeaturedOnly(false);
  };

  // Conteúdo do FilterSheet (mobile) — busca já fica visível fora, então aqui só tipo + destaque.
  const filterContent = (
    <div className="space-y-4">
      <FilterCheckboxGroup
        label="Tipo"
        options={[
          { value: "series", label: "Séries / Módulos" },
          { value: "movie", label: "Filmes / Lives" },
        ]}
        selected={typeFilter}
        onChange={setTypeFilter}
        emptyLabel="Todos os tipos"
      />
      <div className="flex items-center justify-between pt-1">
        <div>
          <label className="text-sm font-medium">Somente destaques</label>
          <p className="text-xs text-muted-foreground">Mostrar apenas títulos marcados no banner</p>
        </div>
        <Switch checked={featuredOnly} onCheckedChange={setFeaturedOnly} />
      </div>
    </div>
  );

  // Detalhe de título toma a tela inteira (preserva o comportamento atual).
  if (selectedTitleId) {
    return <TitleDetailView titleId={selectedTitleId} onBack={() => setSelectedTitleId(null)} />;
  }

  return (
    <div className={cn(isMobile ? "px-3 pb-24" : "container mx-auto p-6 max-w-6xl")}>
      <MobilePageHeader
        title="Domiflix"
        subtitle="Gerencie títulos, temporadas, episódios e seções"
        icon={Tv}
        actions={
          isMobile ? undefined : (
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setTitleDialog({ open: true, title: null })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Título
            </Button>
          )
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "titles" | "sections")}>
        <TabsList className={cn(isMobile && "w-full")}>
          <TabsTrigger value="titles" className={cn(isMobile && "flex-1")}>Títulos</TabsTrigger>
          <TabsTrigger value="sections" className={cn(isMobile && "flex-1")}>Seções da Home</TabsTrigger>
        </TabsList>

        <TabsContent value="titles" className="space-y-4 mt-4">
          {isMobile ? (
            <>
              {/* Busca + FilterSheet */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar título..."
                    className="pl-10 h-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <FilterSheet
                  triggerLabel="Filtros"
                  activeCount={activeFilterCount}
                  onClear={clearFilters}
                >
                  {filterContent}
                </FilterSheet>
              </div>

              <StatCarousel items={statItems} loading={isLoading} />
            </>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar título, tag ou descrição..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {/* Desktop preservado: Select single mapeado pra/de string[]. */}
                <Select
                  value={typeFilter.length === 1 ? typeFilter[0] : "all"}
                  onValueChange={(v) => setTypeFilter(v === "all" ? [] : [v])}
                >
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="series">Séries / Módulos</SelectItem>
                    <SelectItem value="movie">Filmes / Lives</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant={featuredOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFeaturedOnly((v) => !v)}
                  className="gap-1"
                >
                  <Star className="h-4 w-4" />
                  Destaque
                </Button>
              </div>
            </div>
          )}

          {/* Lista / Grid */}
          {isLoading ? (
            isMobile ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-[72px] w-full rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : (
              <p className="text-muted-foreground">Carregando...</p>
            )
          ) : filteredTitles.length === 0 ? (
            isMobile ? (
              <EmptyState
                icon={<Tv className="h-12 w-12" />}
                title={activeFilterCount > 0 ? "Nenhum título encontrado" : "Nenhum título cadastrado"}
                description={activeFilterCount > 0 ? "Tente filtros diferentes" : 'Toque em "Novo Título" para começar'}
              />
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {activeFilterCount > 0 ? "Nenhum título encontrado com esses filtros." : "Nenhum título cadastrado. Crie o primeiro."}
                </CardContent>
              </Card>
            )
          ) : isMobile ? (
            // -----------------------------------------------------------------
            // Mobile: lista nativa com MobileListItem.
            // -----------------------------------------------------------------
            <div className="rounded-xl border bg-card overflow-hidden">
              {filteredTitles.map((t) => {
                const itemActions: ItemAction[] = [
                  {
                    key: "manage",
                    label: "Gerenciar episódios",
                    icon: <Eye className="h-4 w-4" />,
                    onClick: () => setSelectedTitleId(t.id),
                  },
                  {
                    key: "edit",
                    label: "Editar",
                    icon: <Pencil className="h-4 w-4" />,
                    variant: "edit" as const,
                    onClick: () => setTitleDialog({ open: true, title: t }),
                  },
                  {
                    key: "delete",
                    label: "Excluir",
                    icon: <Trash2 className="h-4 w-4" />,
                    variant: "destructive" as const,
                    onClick: () => setConfirmDel(t.id),
                  },
                ];

                const thumb = t.thumbnail_url || t.banner_url;
                const TypeIcon = t.type === "series" ? Tv : Film;

                return (
                  <MobileListItem
                    key={t.id}
                    onClick={() => setSelectedTitleId(t.id)}
                    actions={itemActions}
                    leading={
                      thumb ? (
                        <img
                          src={thumb}
                          alt={t.title}
                          className="h-12 w-12 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-muted text-muted-foreground flex items-center justify-center">
                          <TypeIcon className="h-5 w-5" />
                        </div>
                      )
                    }
                    title={
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{t.title}</span>
                        {t.is_featured && (
                          <Star className="h-3.5 w-3.5 text-warning shrink-0" aria-label="Destaque" />
                        )}
                      </div>
                    }
                    subtitle={
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <TypeIcon className="h-3 w-3" />
                          {t.type === "series" ? "Série" : "Live/Filme"}
                        </span>
                        {(t.tags ?? []).slice(0, 2).map((tag) => (
                          <span key={tag} className="text-[10px] uppercase tracking-wider opacity-80">#{tag}</span>
                        ))}
                      </div>
                    }
                    trailing={
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 whitespace-nowrap">
                        {t.type === "series" ? "Série" : "Live"}
                      </Badge>
                    }
                  />
                );
              })}
            </div>
          ) : (
            // -----------------------------------------------------------------
            // Desktop: grid de cards (preservado).
            // -----------------------------------------------------------------
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTitles.map((t) => (
                <Card key={t.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-video bg-muted relative">
                    {t.banner_url ? (
                      <img src={t.banner_url} alt={t.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        {t.type === "series" ? <Tv className="h-12 w-12" /> : <Film className="h-12 w-12" />}
                      </div>
                    )}
                    {t.is_featured && <Badge className="absolute top-2 left-2 bg-primary"><Star className="h-3 w-3 mr-1" /> Destaque</Badge>}
                  </div>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold truncate">{t.title}</h3>
                      <Badge variant="outline" className="shrink-0">{t.type === "series" ? "Série" : "Live"}</Badge>
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                    <div className="flex gap-1 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setSelectedTitleId(t.id)} className="flex-1">
                        Gerenciar episódios
                      </Button>
                      <RowActionsMenu
                        actions={[
                          { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => setTitleDialog({ open: true, title: t }) },
                          { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setConfirmDel(t.id) },
                        ]}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sections" className="mt-4">
          <AdminDomiflixSections />
        </TabsContent>
      </Tabs>

      {/* FAB no mobile — só na aba de Títulos */}
      {isMobile && activeTab === "titles" && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Título"
          onClick={() => setTitleDialog({ open: true, title: null })}
        />
      )}

      {titleDialog.open && (
        <TitleFormDialog open={titleDialog.open} onOpenChange={(o) => !o && setTitleDialog({ open: false, title: null })} title={titleDialog.title} />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir título?</AlertDialogTitle>
            <AlertDialogDescription>Todas as temporadas, episódios e progresso de usuários relacionados também serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { if (confirmDel) { await deleteTitle.mutateAsync(confirmDel); setConfirmDel(null); } }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
