import { useState, useEffect, useRef, useCallback } from "react";
import { typography } from "@/lib/typography";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BlogRichEditor } from "@/components/admin/blog/BlogRichEditor";
import { ArrowLeft, Save, Globe, FileText, ImagePlus, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const UNASSIGNED = "__none__";

export default function AdminBlogEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isNew = id === "novo";
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [category, setCategory] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [authorId, setAuthorId] = useState<string>("");

  // Gestão de categorias inline
  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  const DRAFT_KEY = `blog-draft:${id || "novo"}`;

  // Marca como sujo quando há conteúdo
  useEffect(() => {
    if (title || content || excerpt) setIsDirty(true);
  }, [title, content, excerpt, category, coverImageUrl]);

  // Auto-save do rascunho em sessionStorage a cada 2s
  useEffect(() => {
    if (!isDirty || hasSaved) return;
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
          title, slug, content, excerpt, coverImageUrl, category,
          metaTitle, metaDescription, slugManual,
        }));
      } catch { /* ignora */ }
    }, 2000);
    return () => clearTimeout(timer);
  }, [title, slug, content, excerpt, coverImageUrl, category, metaTitle, metaDescription, isDirty, hasSaved, DRAFT_KEY, slugManual]);

  // Restaura rascunho em posts novos
  useEffect(() => {
    if (!isNew) return;
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.title || d.content) {
          setTitle(d.title || ""); setSlug(d.slug || "");
          setContent(d.content || ""); setExcerpt(d.excerpt || "");
          setCoverImageUrl(d.coverImageUrl || ""); setCategory(d.category || "");
          setMetaTitle(d.metaTitle || ""); setMetaDescription(d.metaDescription || "");
          setSlugManual(d.slugManual || false);
          toast.info("Rascunho restaurado automaticamente");
        }
      }
    } catch { /* ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  // Salva ao trocar de aba / fechar a página
  useEffect(() => {
    if (!isDirty || hasSaved) return;
    const save = () => {
      if (title || content) {
        try {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
            title, slug, content, excerpt, coverImageUrl, category,
            metaTitle, metaDescription, slugManual,
          }));
        } catch { /* ignora */ }
      }
    };
    const onVis = () => { if (document.visibilityState === "hidden") save(); };
    const onUnload = (e: BeforeUnloadEvent) => { save(); e.preventDefault(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [isDirty, hasSaved, title, slug, content, excerpt, coverImageUrl, category, metaTitle, metaDescription, DRAFT_KEY, slugManual]);

  const clearDraft = useCallback(() => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignora */ }
    setHasSaved(true); setIsDirty(false);
  }, [DRAFT_KEY]);

  const { data: categories = [] } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Autor = usuários admin (padrão Dominex: salespeople_basic com user_id).
  const { data: adminUsers = [] } = useQuery({
    queryKey: ["blog-admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople_basic")
        .select("user_id, name")
        .not("user_id", "is", null);
      if (error) throw error;
      return (data || [])
        .filter((u) => u.user_id && u.name)
        .map((u) => ({ id: u.user_id as string, name: u.name as string }));
    },
  });

  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-post", id],
    queryFn: async () => {
      if (isNew) return null;
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !isNew,
  });

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setSlug(post.slug);
      setContent(post.content || "");
      setExcerpt(post.excerpt || "");
      setCoverImageUrl(post.cover_image_url || "");
      setCategory(post.category || "");
      setMetaTitle(post.meta_title || "");
      setMetaDescription(post.meta_description || "");
      setSlugManual(true);
      setAuthorId(post.author_id || "");
    }
  }, [post]);

  useEffect(() => {
    if (!slugManual && title) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const selectedAuthor = adminUsers.find((u) => u.id === authorId);
      const payload = {
        title,
        slug,
        content,
        excerpt,
        cover_image_url: coverImageUrl || null,
        category: category || null,
        meta_title: metaTitle || null,
        meta_description: metaDescription || null,
        status,
        author_name: selectedAuthor?.name || user?.email?.split("@")[0] || "Admin",
        author_id: authorId || null,
        published_at: status === "published" ? new Date().toISOString() : null,
      };

      if (isNew) {
        const { data, error } = await supabase.from("blog_posts").insert(payload).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from("blog_posts").update(payload).eq("id", id!).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data, status) => {
      queryClient.invalidateQueries({ queryKey: ["blog-posts-admin"] });
      toast.success(status === "published" ? "Artigo publicado!" : "Rascunho salvo!");
      clearDraft();
      if (isNew) navigate(`/admin/blog/${data.id}`, { replace: true });
    },
    onError: (err: any) => {
      if (err?.message?.toLowerCase().includes("duplicate") || err?.code === "23505") {
        toast.error("Já existe um artigo com esse endereço (slug). Altere o título ou o slug.");
      } else {
        toast.error("Erro ao salvar artigo");
      }
    },
  });

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileExt = file.name.split(".").pop();
    const fileName = `covers/${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage.from("blog-images").upload(fileName, file);
    if (error) {
      toast.error("Erro ao enviar a capa");
      return;
    }
    const { data } = supabase.storage.from("blog-images").getPublicUrl(fileName);
    setCoverImageUrl(data.publicUrl);
    toast.success("Capa enviada!");
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const { error } = await supabase.from("blog_categories").insert({ name });
    if (error) {
      toast.error(error.message.toLowerCase().includes("duplicate") ? "Categoria já existe" : "Erro ao criar categoria");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
    setNewCatName("");
    toast.success("Categoria criada!");
  };

  const updateCategory = async (catId: string) => {
    const name = editingCatName.trim();
    if (!name) return;
    const { error } = await supabase.from("blog_categories").update({ name }).eq("id", catId);
    if (error) {
      toast.error("Erro ao renomear categoria");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
    setEditingCatId(null);
    toast.success("Categoria renomeada!");
  };

  const deleteCategory = async (catId: string, catName: string) => {
    if (!confirm(`Excluir a categoria "${catName}"?`)) return;
    const { error } = await supabase.from("blog_categories").delete().eq("id", catId);
    if (error) {
      toast.error("Erro ao excluir categoria");
      return;
    }
    if (category === catName) setCategory("");
    queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
    toast.success("Categoria excluída!");
  };

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/blog")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <h1 className={`${typography.pageTitle} flex items-center gap-2`}>
          <FileText className="h-7 w-7" />
          {isNew ? "Novo Artigo" : "Editar Artigo"}
        </h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Conteúdo principal — coluna esquerda */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="grid gap-2">
                <Label>Título</Label>
                <Input
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); if (!slugManual) setSlug(slugify(e.target.value)); }}
                  placeholder="Título do artigo"
                  className="text-lg"
                />
              </div>

              <div className="grid gap-2">
                <Label>Endereço (slug)</Label>
                <Input
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
                  placeholder="url-do-artigo"
                />
                <p className="text-xs text-muted-foreground">/blog/{slug}</p>
              </div>

              <div className="grid gap-2">
                <Label>Resumo</Label>
                <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Breve resumo do artigo para a listagem" rows={2} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <Label>Conteúdo</Label>
              <BlogRichEditor content={content} onChange={setContent} />
            </CardContent>
          </Card>
        </div>

        {/* Barra lateral — coluna direita */}
        <div className="space-y-4">
          {/* Publicação */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className={typography.sectionTitle}>Publicação</h3>
              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={() => saveMutation.mutate("draft")} disabled={saveMutation.isPending || !title} className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Rascunho
                </Button>
                <Button onClick={() => saveMutation.mutate("published")} disabled={saveMutation.isPending || !title} className="w-full">
                  <Globe className="h-4 w-4 mr-2" />
                  Publicar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Autor */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className={typography.sectionTitle}>Autor</h3>
              <Select value={authorId || UNASSIGNED} onValueChange={(v) => setAuthorId(v === UNASSIGNED ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o autor..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Sem autor definido</SelectItem>
                  {adminUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Categoria */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className={typography.sectionTitle}>Categoria</h3>
              <Select value={category || UNASSIGNED} onValueChange={(v) => setCategory(v === UNASSIGNED ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Sem categoria</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name} className="cursor-pointer">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#6B7280" }} />
                        {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Lista de categorias com editar/excluir */}
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-1 group text-sm">
                    {editingCatId === cat.id ? (
                      <>
                        <Input
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          className="h-7 text-xs flex-1"
                          onKeyDown={(e) => e.key === "Enter" && updateCategory(cat.id)}
                          autoFocus
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateCategory(cat.id)}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingCatId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#6B7280" }} />
                        <span className="flex-1 truncate text-muted-foreground">{cat.name}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-warning" onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => deleteCategory(cat.id, cat.name)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Nova categoria */}
              <div className="flex gap-1">
                <Input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Nova categoria..."
                  className="h-8 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && addCategory()}
                />
                <Button variant="outline" size="sm" className="h-8 px-2" onClick={addCategory} disabled={!newCatName.trim()}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Imagem de capa */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className={typography.sectionTitle}>Imagem de Capa</h3>
              {coverImageUrl ? (
                <div className="space-y-2">
                  <img src={coverImageUrl} alt="Capa" className="w-full h-32 object-cover rounded-lg" />
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => coverInputRef.current?.click()}>
                    Trocar Imagem
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Enviar capa</span>
                </button>
              )}
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
            </CardContent>
          </Card>

          {/* SEO */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className={typography.sectionTitle}>SEO</h3>
              <div className="grid gap-2">
                <Label>Meta Title</Label>
                <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={title || "Título para mecanismos de busca"} />
              </div>
              <div className="grid gap-2">
                <Label>Meta Description</Label>
                <Textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="Descrição para mecanismos de busca (até 160 caracteres)" rows={2} />
                <p className="text-xs text-muted-foreground">{metaDescription.length}/160</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
