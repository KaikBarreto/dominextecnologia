import { useState } from "react";
import { FileText, Link, Plus, Trash2, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useDomiflixEpisodeExtras, type DomiflixEpisode } from "@/hooks/useDomiflix";
import { parseTimedText } from "@/lib/timedText";
import { toast } from "sonner";

export function AdminDomiflixLessonExtras({ episode, open, onOpenChange }: { episode: DomiflixEpisode | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const { data = { subtitles: [], resources: [] } } = useDomiflixEpisodeExtras(episode?.id);
  const [subtitleLabel, setSubtitleLabel] = useState("Português (Brasil)");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["domiflix-episode-extras", episode?.id] });
  }

  async function addSubtitle(file: File) {
    if (!episode) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "vtt" && extension !== "srt") return toast.error("Envie uma legenda .vtt ou .srt");
    if (file.size > 2_000_000) return toast.error("A legenda deve ter no máximo 2 MB");
    const content = await file.text();
    if (parseTimedText(content).length === 0) return toast.error("A legenda não possui cues válidos");
    setSaving(true);
    const { error } = await supabase.from("domiflix_episode_subtitles" as any).insert({
      episode_id: episode.id,
      language_code: "pt-BR",
      label: subtitleLabel.trim() || "Português (Brasil)",
      format: extension,
      content,
      is_default: data.subtitles.length === 0,
      order_index: data.subtitles.length,
    });
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar a legenda");
    await invalidate();
    toast.success("Legenda adicionada");
  }

  async function addLink() {
    if (!episode || !resourceTitle.trim() || !/^https?:\/\//i.test(resourceUrl)) return toast.error("Informe título e um link http(s) válido");
    setSaving(true);
    const { error } = await supabase.from("domiflix_episode_resources" as any).insert({
      episode_id: episode.id,
      title: resourceTitle.trim(),
      description: resourceDescription.trim() || null,
      resource_type: "link",
      url: resourceUrl.trim(),
      order_index: data.resources.length,
    });
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar o material");
    setResourceTitle(""); setResourceUrl(""); setResourceDescription("");
    await invalidate();
  }

  async function addFile(file: File) {
    if (!episode || !resourceTitle.trim()) return toast.error("Dê um título ao material antes de enviar");
    if (file.size > 25_000_000) return toast.error("O material deve ter no máximo 25 MB");
    setSaving(true);
    const path = `materials/${episode.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const uploaded = await supabase.storage.from("domiflix-learning-assets").upload(path, file);
    if (uploaded.error) { setSaving(false); return toast.error("Não foi possível enviar o arquivo"); }
    const { error } = await supabase.from("domiflix_episode_resources" as any).insert({
      episode_id: episode.id,
      title: resourceTitle.trim(),
      description: resourceDescription.trim() || null,
      resource_type: "file",
      storage_path: path,
      order_index: data.resources.length,
    });
    setSaving(false);
    if (error) return toast.error("Arquivo enviado, mas não foi possível vinculá-lo à aula");
    setResourceTitle(""); setResourceDescription("");
    await invalidate();
  }

  async function remove(table: "domiflix_episode_subtitles" | "domiflix_episode_resources", id: string) {
    const { error } = await supabase.from(table as any).delete().eq("id", id);
    if (error) return toast.error("Não foi possível remover");
    await invalidate();
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Materiais de ${episode?.title ?? "aula"}`} description="Legendas e apoio aparecem abaixo do vídeo." className="sm:max-w-2xl" mobileFullHeight>
      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-semibold">Legendas</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={subtitleLabel} onChange={(event) => setSubtitleLabel(event.target.value)} placeholder="Nome da faixa" />
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted"><Upload className="h-4 w-4" />Enviar VTT/SRT<input type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" className="hidden" disabled={saving} onChange={(event) => event.target.files?.[0] && void addSubtitle(event.target.files[0])} /></label>
          </div>
          <ul className="mt-3 divide-y rounded-md border">
            {data.subtitles.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhuma legenda cadastrada.</li>}
            {data.subtitles.map((subtitle) => <li key={subtitle.id} className="flex items-center gap-3 p-3"><FileText className="h-4 w-4 text-muted-foreground" /><span className="flex-1 text-sm">{subtitle.label} <span className="text-xs uppercase text-muted-foreground">{subtitle.format}</span></span><Button variant="ghost" size="icon" onClick={() => void remove("domiflix_episode_subtitles", subtitle.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></li>)}
          </ul>
        </section>

        <section>
          <h3 className="text-sm font-semibold">Materiais de apoio</h3>
          <div className="mt-3 space-y-3">
            <div className="space-y-1"><Label>Título</Label><Input value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} placeholder="Ex: Checklist da aula" /></div>
            <div className="space-y-1"><Label>Descrição opcional</Label><Textarea value={resourceDescription} onChange={(event) => setResourceDescription(event.target.value)} rows={2} /></div>
            <div className="flex flex-col gap-2 sm:flex-row"><Input value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="https://…" /><Button variant="outline" onClick={() => void addLink()} disabled={saving}><Link className="mr-2 h-4 w-4" />Adicionar link</Button><label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"><Plus className="mr-2 h-4 w-4" />Enviar arquivo<input type="file" className="hidden" disabled={saving} onChange={(event) => event.target.files?.[0] && void addFile(event.target.files[0])} /></label></div>
          </div>
          <ul className="mt-3 divide-y rounded-md border">
            {data.resources.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum material cadastrado.</li>}
            {data.resources.map((resource) => <li key={resource.id} className="flex items-center gap-3 p-3"><FileText className="h-4 w-4 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{resource.title}</span><span className="text-xs text-muted-foreground">{resource.resource_type === "link" ? "Link externo" : "Arquivo privado"}</span></span><Button variant="ghost" size="icon" onClick={() => void remove("domiflix_episode_resources", resource.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></li>)}
          </ul>
        </section>
      </div>
    </ResponsiveDialog>
  );
}
