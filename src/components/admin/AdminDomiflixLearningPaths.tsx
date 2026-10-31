import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Pencil, Plus } from "lucide-react";
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

type LearningPath = { id: string; slug: string; title: string; description: string | null; cover_url: string | null; is_onboarding: boolean; is_active: boolean; order_index: number };
const emptyForm = { title: "", description: "", cover_url: "", is_active: true, order_index: 0 };

export function AdminDomiflixLearningPaths() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LearningPath | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { data: paths = [], isLoading } = useQuery({
    queryKey: ["domiflix-learning-paths-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("domiflix_learning_paths" as any).select("id, slug, title, description, cover_url, is_onboarding, is_active, order_index").order("order_index");
      if (error) throw error;
      return (data ?? []) as unknown as LearningPath[];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, title: form.title.trim(), description: form.description.trim() || null, cover_url: form.cover_url.trim() || null };
      if (!payload.title) throw new Error("Informe o nome do curso");
      if (!payload.cover_url) throw new Error("Adicione uma capa própria para esta trilha");
      const result = editing
        ? await supabase.from("domiflix_learning_paths" as any).update(payload as any).eq("id", editing.id)
        : await supabase.from("domiflix_learning_paths" as any).insert({ ...payload, slug: slugify(payload.title), is_onboarding: false } as any);
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-learning-paths-admin"] });
      queryClient.invalidateQueries({ queryKey: ["domiflix-learning-status"] });
      toast.success(editing ? "Curso atualizado" : "Curso criado");
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  function create() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function edit(path: LearningPath) { setEditing(path); setForm({ title: path.title, description: path.description ?? "", cover_url: path.cover_url ?? "", is_active: path.is_active, order_index: path.order_index }); setOpen(true); }
  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">Cursos e trilhas</h2><p className="mt-1 text-sm text-muted-foreground">Tutoriais do sistema conduzem o onboarding. Os demais cursos ficam livres e não geram cobrança diária.</p></div><Button onClick={create} className="shrink-0 gap-2"><Plus className="h-4 w-4" />Novo curso</Button></div>
    {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p> : <div className="divide-y rounded-lg border bg-card">{paths.map((path) => <div key={path.id} className="flex items-center gap-4 p-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{path.cover_url ? <img src={path.cover_url} alt="" className="h-full w-full object-cover" /> : <BookOpen className="h-5 w-5 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{path.title}</p>{path.is_onboarding && <Badge variant="secondary" className="text-red-700">Onboarding</Badge>}{!path.is_active && <Badge variant="outline">Inativo</Badge>}</div><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{path.description || "Sem descrição"}</p></div><Button variant="ghost" size="icon" onClick={() => edit(path)} aria-label={`Editar ${path.title}`}><Pencil className="h-4 w-4" /></Button></div>)}</div>}
    <ResponsiveDialog open={open} onOpenChange={setOpen} title={editing ? "Editar curso" : "Novo curso"} description="Cada curso reúne módulos e aulas em uma sequência própria." footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button><Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button></div>}>
      <div className="space-y-4"><div className="space-y-1.5"><Label>Nome</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Gestão para oficinas" /></div><div className="space-y-1.5"><Label>Descrição</Label><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} /></div><div className="space-y-1.5"><Label>URL da capa da trilha</Label><Input value={form.cover_url} onChange={(event) => setForm({ ...form, cover_url: event.target.value })} placeholder="https://..." required /><p className="text-xs text-muted-foreground">Cada trilha precisa de uma arte horizontal própria.</p></div><div className="grid grid-cols-[1fr_auto] items-center gap-4"><div><Label>Curso ativo</Label><p className="text-xs text-muted-foreground">Aparece no catálogo dos clientes.</p></div><Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} /></div><div className="space-y-1.5"><Label>Ordem no catálogo</Label><Input type="number" min={0} value={form.order_index} onChange={(event) => setForm({ ...form, order_index: Number(event.target.value) || 0 })} /></div></div>
    </ResponsiveDialog>
  </div>;
}
