import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Eye, ArrowRight, TrendingUp } from 'lucide-react';

type CategoryColor = { name: string; color: string };

type TopPost = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  view_count: number | null;
};

const CTA_LINK = '/cadastro?origem=Blog';

export const BlogSidebar = ({ categoryColors = [] }: { categoryColors?: CategoryColor[] }) => {
  const { data: topPosts } = useQuery({
    queryKey: ['blog-most-read'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, category, view_count')
        .eq('status', 'published')
        .order('view_count', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as TopPost[];
    },
  });

  return (
    <aside className="space-y-6">
      {/* CTA Card */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] to-primary/[0.03] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80 mb-2">
          Pra equipes de campo
        </p>
        <h3 className="text-lg font-bold text-white mb-2 leading-snug">
          Quer tirar a operação do papel?
        </h3>
        <p className="text-sm text-white/55 mb-5 leading-relaxed">
          A Dominex coloca ordem de serviço, PMOC e equipe no celular do técnico — sem caderno e
          sem grupo de WhatsApp.
        </p>
        <Link
          to={CTA_LINK}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary text-primary-foreground font-semibold text-sm py-3 px-4 hover:bg-primary/90 transition-colors"
        >
          Teste grátis 14 dias
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="text-[11px] text-white/35 text-center mt-2">Sem cartão de crédito.</p>
      </div>

      {/* Mais lidos */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-white text-sm">Mais lidos</h3>
        </div>
        {topPosts && topPosts.length > 0 ? (
          <ol className="space-y-4">
            {topPosts.map((post, i) => (
              <li key={post.id} className="flex gap-3 group">
                <span className="text-2xl font-black text-white/10 leading-none w-6 flex-shrink-0 select-none">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <Link
                    to={`/blog/${post.slug}`}
                    className="text-sm font-medium text-white/85 group-hover:text-primary transition-colors line-clamp-2 leading-snug"
                  >
                    {post.title}
                  </Link>
                  <p className="text-xs text-white/35 mt-1 flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {(post.view_count ?? 0).toLocaleString('pt-BR')} leituras
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-white/35">Ainda não há artigos.</p>
        )}
      </div>

      {/* Categorias */}
      {categoryColors.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <h3 className="font-bold text-white text-sm mb-4">Categorias</h3>
          <div className="flex flex-wrap gap-2">
            {categoryColors.map((cat) => (
              <span
                key={cat.name}
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: cat.color }}
              >
                {cat.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};
