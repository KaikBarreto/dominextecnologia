import { useState } from "react";
import { typography } from "@/lib/typography";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus, Pencil, Trash2, Search, Eye, FileText, Heart, MessageCircle,
  Check, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// ============================================================================
// AdminBlog — gestão do blog de marketing Dominex (super_admin).
// Aba "Artigos": lista + filtros + CRUD. Aba "Comentários": moderação.
// Escrita roda na sessão do super_admin; o RLS bloqueia o resto silenciosamente.
// ============================================================================

export default function AdminBlog() {
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["blog-comments-pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("blog_post_comments")
        .select("*", { count: "exact", head: true })
        .eq("is_approved", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const commentsLabel = (
    <span className="inline-flex items-center gap-1.5">
      Comentários
      {pendingCount > 0 && (
        <Badge className="h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
          {pendingCount}
        </Badge>
      )}
    </span>
  );

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <div>
        <h1 className={`${typography.pageTitle} flex items-center gap-2`}>
          <FileText className="h-7 w-7" />
          Blog
        </h1>
        <p className="text-sm text-muted-foreground">Gerencie os artigos e comentários do blog Dominex</p>
      </div>

      <Tabs defaultValue="artigos">
        <TabsList>
          <TabsTrigger value="artigos">Artigos</TabsTrigger>
          <TabsTrigger value="comentarios">{commentsLabel}</TabsTrigger>
        </TabsList>

        <TabsContent value="artigos" className="mt-4">
          <PostsTab />
        </TabsContent>

        <TabsContent value="comentarios" className="mt-4">
          <CommentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Aba Artigos
// ============================================================================
function PostsTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: dbCategories = [] } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("blog_categories").select("name, color").order("name");
      return (data || []) as { name: string; color: string | null }[];
    },
  });

  const { data: posts, isLoading } = useQuery({
    queryKey: ["blog-posts-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-posts-admin"] });
      toast.success("Artigo excluído com sucesso");
    },
    onError: () => toast.error("Erro ao excluir artigo"),
  });

  const filteredPosts = posts?.filter((post) => {
    const matchSearch = post.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || post.status === statusFilter;
    const matchCategory = categoryFilter === "all" || post.category === categoryFilter;
    return matchSearch && matchStatus && matchCategory;
  });

  const getCatColor = (name: string) => dbCategories.find((c) => c.name === name)?.color;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar artigos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="published">Publicado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {dbCategories.map((cat) => (
                <SelectItem key={cat.name} value={cat.name}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => navigate("/admin/blog/novo")} className="w-full sm:w-auto shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Novo Artigo
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredPosts?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum artigo encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPosts?.map((post) => {
            const catColor = post.category ? getCatColor(post.category) : undefined;
            return (
              <div
                key={post.id}
                className="flex items-center gap-4 p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors"
              >
                {post.cover_image_url && (
                  <img src={post.cover_image_url} alt={post.title} className="h-16 w-24 object-cover rounded shrink-0 hidden sm:block" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{post.title}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant={post.status === "published" ? "default" : "secondary"}>
                      {post.status === "published" ? "Publicado" : "Rascunho"}
                    </Badge>
                    {post.category && (
                      <Badge className="text-white border-0" style={{ backgroundColor: catColor || "#6B7280" }}>
                        {post.category}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(post.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {post.view_count || 0}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Heart className="h-3 w-3" /> {post.likes_count || 0}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" /> {post.comments_count || 0}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {post.status === "published" && (
                    <Button variant="ghost" size="sm" onClick={() => window.open(`/blog/${post.slug}`, "_blank")} title="Ver no site">
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-warning" onClick={() => navigate(`/admin/blog/${post.id}`)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir artigo?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(post.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Aba Comentários — moderação (pendentes + aprovados).
// Comentário nasce is_approved=false. Aprovar = UPDATE true; Excluir = DELETE.
// O contador comments_count é recalculado por trigger só com aprovados.
// ============================================================================
function CommentsTab() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved">("pending");

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["blog-comments-admin", filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_post_comments")
        .select("*, blog_posts(title, slug)")
        .eq("is_approved", filter === "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string;
        author_name: string;
        content: string;
        created_at: string;
        is_approved: boolean;
        post_id: string;
        blog_posts: { title: string | null; slug: string | null } | null;
      }>;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["blog-comments-admin"] });
    queryClient.invalidateQueries({ queryKey: ["blog-comments-pending-count"] });
    queryClient.invalidateQueries({ queryKey: ["blog-posts-admin"] });
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_post_comments").update({ is_approved: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Comentário aprovado"); },
    onError: () => toast.error("Erro ao aprovar comentário"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_post_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Comentário excluído"); },
    onError: () => toast.error("Erro ao excluir comentário"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={filter === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("pending")}
        >
          <Clock className="h-4 w-4 mr-2" /> Pendentes
        </Button>
        <Button
          variant={filter === "approved" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("approved")}
        >
          <Check className="h-4 w-4 mr-2" /> Aprovados
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>{filter === "pending" ? "Nenhum comentário pendente" : "Nenhum comentário aprovado"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="p-4 border border-border rounded-lg space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{c.author_name}</span>
                    {c.is_approved ? (
                      <Badge className="bg-emerald-600 text-white border-0 text-[10px]">Aprovado</Badge>
                    ) : (
                      <Badge className="bg-amber-500 text-white border-0 text-[10px]">Pendente</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  {c.blog_posts?.title && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      em <span className="font-medium">{c.blog_posts.title}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!c.is_approved && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-emerald-600"
                      onClick={() => approveMutation.mutate(c.id)}
                      title="Aprovar"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir comentário?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
