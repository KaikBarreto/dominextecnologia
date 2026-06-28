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
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-primary/20 dark:bg-gradient-to-br dark:from-primary/[0.12] dark:to-primary/[0.03]">
        <span className="mb-3 inline-flex items-center rounded-full bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
          Pra equipes de campo
        </span>
        <h3 className="mb-2 text-lg font-bold leading-snug text-neutral-900 dark:text-white">
          Quer tirar a operação do papel?
        </h3>
        <p className="mb-5 text-sm leading-relaxed text-neutral-600 dark:text-white/55">
          A Dominex coloca ordem de serviço, PMOC e equipe no celular do técnico — sem caderno e
          sem grupo de WhatsApp.
        </p>
        <Link
          to={CTA_LINK}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Teste grátis 14 dias
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-2 text-center text-[11px] text-neutral-500 dark:text-white/35">
          Sem cartão de crédito.
        </p>
      </div>

      {/* Mais lidos */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Mais lidos</h3>
        </div>
        {topPosts && topPosts.length > 0 ? (
          <ol className="space-y-4">
            {topPosts.map((post, i) => (
              <li key={post.id} className="group flex gap-3">
                <span className="w-6 flex-shrink-0 select-none text-2xl font-black leading-none text-neutral-200 dark:text-white/10">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <Link
                    to={`/blog/${post.slug}`}
                    className="line-clamp-2 text-sm font-medium leading-snug text-neutral-800 transition-colors group-hover:text-primary dark:text-white/85"
                  >
                    {post.title}
                  </Link>
                  <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500 dark:text-white/35">
                    <Eye className="h-3 w-3" />
                    {(post.view_count ?? 0).toLocaleString('pt-BR')} leituras
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-white/35">Ainda não há artigos.</p>
        )}
      </div>

      {/* Categorias */}
      {categoryColors.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]">
          <h3 className="mb-4 text-sm font-bold text-neutral-900 dark:text-white">Categorias</h3>
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
