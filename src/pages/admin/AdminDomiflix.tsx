import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Star, Film, Tv, ChevronDown, ChevronRight, Layers, Image as ImageIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useDomiflixTitles, useDomiflixTitle, useCreateTitle, useUpdateTitle, useDeleteTitle,
  useCreateSeason, useUpdateSeason, useDeleteSeason,
  useCreateEpisode, useUpdateEpisode, useDeleteEpisode,
  type DomiflixTitle, type DomiflixSeason, type DomiflixEpisode,
} from "@/hooks/useDomiflix";
import { AdminDomiflixSections } from "@/components/admin/AdminDomiflixSections";

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
function EpisodeFormDialog({ open, onOpenChange, titleId, seasons, episode }: {
  open: boolean; onOpenChange: (o: boolean) => void; titleId: string;
  seasons: DomiflixSeason[]; episode: DomiflixEpisode | null;
}) {
  const create = useCreateEpisode();
  const update = useUpdateEpisode();
  const isEdit = !!episode;
  const [form, setForm] = useState(() => ({
    season_id: episode?.season_id ?? null,
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
function TitleDetailView({ titleId, onBack }: { titleId: string; onBack: () => void }) {
  const { data: full, isLoading } = useDomiflixTitle(titleId);
  const deleteSeason = useDeleteSeason();
  const deleteEpisode = useDeleteEpisode();

  const [seasonDialog, setSeasonDialog] = useState<{ open: boolean; season: DomiflixSeason | null }>({ open: false, season: null });
  const [episodeDialog, setEpisodeDialog] = useState<{ open: boolean; episode: DomiflixEpisode | null }>({ open: false, episode: null });
  const [confirmDel, setConfirmDel] = useState<{ kind: "season" | "episode"; id: string } | null>(null);

  if (isLoading || !full) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4">
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

      {full.seasons.length === 0 && full.episodes.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum conteúdo. Crie uma temporada ou episódio.</CardContent></Card>
      )}

      {full.seasons.map((s) => (
        <Card key={s.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">T{s.season_number} — {s.title}</CardTitle>
              <Badge variant="outline">{s.episodes.length} ep</Badge>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => setSeasonDialog({ open: true, season: s })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setConfirmDel({ kind: "season", id: s.id })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {s.episodes.map((ep) => (
              <div key={ep.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted text-sm">
                <span className="truncate">EP{ep.episode_number ?? "?"} — {ep.title}</span>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEpisodeDialog({ open: true, episode: ep })}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDel({ kind: "episode", id: ep.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
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
              <div key={ep.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted text-sm">
                <span className="truncate">{ep.title}</span>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEpisodeDialog({ open: true, episode: ep })}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDel({ kind: "episode", id: ep.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {seasonDialog.open && (
        <SeasonFormDialog open={seasonDialog.open} onOpenChange={(o) => !o && setSeasonDialog({ open: false, season: null })} titleId={titleId} season={seasonDialog.season} />
      )}
      {episodeDialog.open && (
        <EpisodeFormDialog open={episodeDialog.open} onOpenChange={(o) => !o && setEpisodeDialog({ open: false, episode: null })} titleId={titleId} seasons={full.seasons} episode={episodeDialog.episode} />
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
  );
}

// ─────────────── Page ───────────────
export default function AdminDomiflix() {
  const { data: titles = [], isLoading } = useDomiflixTitles();
  const deleteTitle = useDeleteTitle();
  const [titleDialog, setTitleDialog] = useState<{ open: boolean; title: DomiflixTitle | null }>({ open: false, title: null });
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [selectedTitleId, setSelectedTitleId] = useState<string | null>(null);

  if (selectedTitleId) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <TitleDetailView titleId={selectedTitleId} onBack={() => setSelectedTitleId(null)} />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Domiflix — Gestão de Conteúdo</h1>
          <p className="text-sm text-muted-foreground">Gerencie títulos, temporadas, episódios e seções da home</p>
        </div>
      </div>

      <Tabs defaultValue="titles">
        <TabsList>
          <TabsTrigger value="titles">Títulos</TabsTrigger>
          <TabsTrigger value="sections">Seções da Home</TabsTrigger>
        </TabsList>

        <TabsContent value="titles" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => setTitleDialog({ open: true, title: null })}>
              <Plus className="h-4 w-4 mr-1" /> Novo Título
            </Button>
          </div>

          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : titles.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum título cadastrado. Crie o primeiro.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {titles.map((t) => (
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
                      <Button size="icon" variant="ghost" onClick={() => setTitleDialog({ open: true, title: t })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(t.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sections" className="mt-4">
          <SectionsTab />
        </TabsContent>
      </Tabs>

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
