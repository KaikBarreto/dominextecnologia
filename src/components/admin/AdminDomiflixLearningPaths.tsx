import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Pencil, Plus, ShieldCheck, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slugify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { toast } from "sonner";

type LearningPath = { id: string; slug: string; title: string; description: string | null; cover_url: string | null; is_onboarding: boolean; is_active: boolean; order_index: number; intro_gate_enabled_at: string | null };
type IntroLesson = { id: string; title: string; moduleTitle: string };
const emptyForm = { title: "", description: "", cover_url: "", is_active: true, order_index: 0 };

async function uploadCover(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Envie uma imagem válida");
  if (file.size > 8_000_000) throw new Error("A capa deve ter no máximo 8 MB");
  const extension = file.name.split(".").pop() || "jpg";
  const path = `learning-paths/${crypto.randomUUID()}.${extension}`;
  const uploaded = await supabase.storage.from("domiflix-thumbnails").upload(path, file);
  if (uploaded.error) throw uploaded.error;
  return supabase.storage.from("domiflix-thumbnails").getPublicUrl(path).data.publicUrl;
}

function OnboardingGateControl({ path }: { path: LearningPath }) {
  const queryClient = useQueryClient();
  const { data: introLesson, isLoading } = useQuery({
    queryKey: ["domiflix-intro-lesson-admin", path.id],
    queryFn: async (): Promise<IntroLesson | null> => {
      const { data: titles, error: titleError } = await supabase.from("domiflix_titles" as any).select("id, title, track_order").eq("learning_path_id", path.id).eq("track_group", "core").eq("is_active", true).order("track_order").limit(100);
      if (titleError) throw titleError;
      const orderedTitles = (titles ?? []) as unknown as Array<{ id: string; title: string; track_order: number }>;
      if (!orderedTitles.length) return null;
      const { data: lessons, error: lessonError } = await supabase.from("domiflix_episodes" as any).select("id, title, title_id, order_index, episode_number, video_id").in("title_id", orderedTitles.map((title) => title.id)).eq("is_active", true).not("video_id", "is", null).order("order_index").limit(500);
      if (lessonError) throw lessonError;
      const byTitle = new Map(orderedTitles.map((title, index) => [title.id, { ...title, index }]));
      const lesson = ((lessons ?? []) as unknown as Array<{ id: string; title: string; title_id: string; order_index: number; episode_number: number | null; video_id: string | null }>).filter((item) => item.video_id?.trim()).sort((a, b) => (byTitle.get(a.title_id)?.index ?? 999) - (byTitle.get(b.title_id)?.index ?? 999) || a.order_index - b.order_index || (a.episode_number ?? 0) - (b.episode_number ?? 0))[0];
      return lesson ? { id: lesson.id, title: lesson.title, moduleTitle: byTitle.get(lesson.title_id)?.title ?? "Módulo" } : null;
    },
  });
  const enabled = Boolean(path.intro_gate_enabled_at);
  const toggle = useMutation({
    mutationFn: async (checked: boolean) => {
      if (checked && !introLesson) throw new Error("Publique primeiro uma aula básica com vídeo");
      const { error } = await supabase.from("domiflix_learning_paths" as any).update({ intro_gate_enabled_at: checked ? new Date().toISOString() : null } as any).eq("id", path.id);
      if (error) throw error;
    },
    onSuccess: (_, checked) => { queryClient.invalidateQueries({ queryKey: ["domiflix-learning-paths-admin"] }); queryClient.invalidateQueries({ queryKey: ["domiflix-learning-status"] }); toast.success(checked ? "Vídeo obrigatório ativado para novos clientes" : "Bloqueio de primeiro acesso desativado"); },
    onError: (error: Error) => toast.error(error.message),
  });
  return <div className="mt-3 grid gap-3 rounded-md border border-border bg-muted p-3 lg:grid-cols-[1fr_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><ShieldCheck className="h-4 w-4" /><p className="text-sm font-semibold">Vídeo obrigatório do primeiro acesso</p><Badge className={enabled ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}>{enabled ? "Ativo" : "Desativado"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{isLoading ? "Localizando a primeira aula básica…" : introLesson ? <>Aula usada: <span className="font-medium text-foreground">{introLesson.moduleTitle} — {introLesson.title}</span></> : "Nenhuma aula básica publicada com vídeo."}</p><p className="mt-1 text-xs text-muted-foreground">Ao ativar, o bloqueio vale apenas para clientes que começarem depois desse momento.</p></div><div className="flex min-h-11 items-center justify-between gap-3 lg:justify-end"><Label htmlFor={`domiflix-gate-${path.id}`}>Exigir vídeo</Label><Switch id={`domiflix-gate-${path.id}`} checked={enabled} disabled={toggle.isPending || (!enabled && !introLesson)} onCheckedChange={(checked) => toggle.mutate(checked)} /></div></div>;
}

export function AdminDomiflixLearningPaths() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LearningPath | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const { data: paths = [], isLoading } = useQuery({ queryKey: ["domiflix-learning-paths-admin"], queryFn: async () => { const { data, error } = await supabase.from("domiflix_learning_paths" as any).select("id, slug, title, description, cover_url, is_onboarding, is_active, order_index, intro_gate_enabled_at").order("order_index"); if (error) throw error; return (data ?? []) as unknown as LearningPath[]; } });
  const save = useMutation({ mutationFn: async () => { const payload = { ...form, title: form.title.trim(), description: form.description.trim() || null, cover_url: form.cover_url.trim() || null }; if (!payload.title) throw new Error("Informe o nome do curso"); if (!payload.cover_url) throw new Error("Adicione uma capa própria para esta trilha"); const result = editing ? await supabase.from("domiflix_learning_paths" as any).update(payload as any).eq("id", editing.id) : await supabase.from("domiflix_learning_paths" as any).insert({ ...payload, slug: slugify(payload.title), is_onboarding: false } as any); if (result.error) throw result.error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["domiflix-learning-paths-admin"] }); queryClient.invalidateQueries({ queryKey: ["domiflix-learning-status"] }); toast.success(editing ? "Curso atualizado" : "Curso criado"); setOpen(false); }, onError: (error: Error) => toast.error(error.message) });
  function create() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function edit(path: LearningPath) { setEditing(path); setForm({ title: path.title, description: path.description ?? "", cover_url: path.cover_url ?? "", is_active: path.is_active, order_index: path.order_index }); setOpen(true); }
  async function handleCover(file: File) { setUploading(true); try { const url = await uploadCover(file); setForm((current) => ({ ...current, cover_url: url })); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar a capa"); } finally { setUploading(false); } }
  return <div className="space-y-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="font-semibold">Cursos e trilhas</h2><p className="mt-1 text-sm text-muted-foreground">Tutoriais do sistema conduzem o onboarding. Os demais cursos ficam livres e não geram cobrança diária.</p></div><Button onClick={create} className="min-h-11 w-full shrink-0 gap-2 lg:w-auto"><Plus className="h-4 w-4" />Novo curso</Button></div>{isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p> : <div className="space-y-3">{paths.map((path) => <div key={path.id} className="rounded-lg border bg-card p-4"><div className="flex items-center gap-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{path.cover_url ? <img src={path.cover_url} alt="" className="h-full w-full object-cover" /> : <BookOpen className="h-5 w-5 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{path.title}</p>{path.is_onboarding && <Badge className="bg-red-600 text-white">Onboarding</Badge>}{!path.is_active && <Badge variant="outline">Inativo</Badge>}</div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{path.description || "Sem descrição"}</p></div><Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => edit(path)} aria-label={`Editar ${path.title}`}><Pencil className="h-4 w-4" /></Button></div>{path.is_onboarding && <OnboardingGateControl path={path} />}</div>)}</div>}
    <ResponsiveDialog open={open} onOpenChange={setOpen} title={editing ? "Editar curso" : "Novo curso"} description="Cada curso reúne módulos e aulas em uma sequência própria." footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button><Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending || uploading}>{save.isPending ? "Salvando..." : "Salvar"}</Button></div>}><div className="space-y-4"><div className="space-y-1.5"><Label htmlFor="domiflix-path-name">Nome</Label><Input id="domiflix-path-name" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Gestão para oficinas" /></div><div className="space-y-1.5"><Label htmlFor="domiflix-path-description">Descrição</Label><Textarea id="domiflix-path-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} /></div><div className="space-y-2"><Label htmlFor="domiflix-path-cover">Capa da trilha</Label>{form.cover_url && <img src={form.cover_url} alt="Prévia da capa" className="aspect-video w-full max-w-sm rounded-md border object-cover" />}<Input id="domiflix-path-cover" value={form.cover_url} onChange={(event) => setForm({ ...form, cover_url: event.target.value })} placeholder="https://..." required /><label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted"><Upload className="h-4 w-4" />{uploading ? "Enviando…" : "Enviar imagem"}<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => event.target.files?.[0] && void handleCover(event.target.files[0])} /></label><p className="text-xs text-muted-foreground">Arte horizontal própria, recomendada em 16:9.</p></div><div className="grid grid-cols-[1fr_auto] items-center gap-4"><div><Label htmlFor="domiflix-path-active">Curso ativo</Label><p className="text-xs text-muted-foreground">Aparece no catálogo dos clientes.</p></div><Switch id="domiflix-path-active" checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} /></div><div className="space-y-1.5"><Label htmlFor="domiflix-path-order">Ordem no catálogo</Label><Input id="domiflix-path-order" type="number" min={0} value={form.order_index} onChange={(event) => setForm({ ...form, order_index: Number(event.target.value) || 0 })} /></div></div></ResponsiveDialog>
  </div>;
}
