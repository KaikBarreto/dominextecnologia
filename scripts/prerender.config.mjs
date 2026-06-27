// ─────────────────────────────────────────────────────────────────────────────
// Configuração do PRERENDER ESTÁTICO da landing/marketing.
//
// A app é uma SPA Vite + React renderizada 100% no cliente. Robôs de LLM
// (GPTBot, ClaudeBot, PerplexityBot) e crawlers que NÃO rodam JS recebem só o
// `<div id="root">` vazio. Este prerender sobe a app já buildada num Chrome
// headless, deixa o React renderizar o conteúdo de marketing real, e salva o
// HTML "vivo" (com texto no HTML cru) por rota. O HTML hidrata normalmente no
// client por cima desse markup.
//
// REGRA-LEI: prerenderizar SOMENTE rotas PÚBLICAS de marketing. NUNCA rotas
// autenticadas/tenant/white-label (/login, /dashboard, /admin, /os-tecnico,
// /pmoc, /portal, /domiflix, /checkout, etc.) — prerender dessas vazaria UI
// errada e quebra o isolamento white-label.
//
// Para incluir uma página de segmento nova (criada por outro dev), basta
// adicionar a rota nesta lista. Rotas que ainda não existirem no build são
// puladas com aviso (não quebram o build) — ver scripts/prerender.mjs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rotas-alvo do prerender. Cada string é um path absoluto da SPA.
 * `/` vira dist/index.html; cada outra rota vira dist/<rota>/index.html.
 */
export const PRERENDER_ROUTES = [
  '/',
  // Landings por segmento (algumas podem estar sendo criadas em paralelo;
  // as que ainda não existirem no router são puladas, não quebram o build).
  '/sistema-para-refrigeracao',
  '/sistema-para-eletricistas',
  '/sistema-para-energia-solar',
  '/sistema-para-provedores',
  '/sistema-para-cftv',
  '/sistema-para-construcao-civil',
  '/sistema-para-elevadores',
  '/sistema-para-limpeza-conservacao',
  '/sistema-para-dedetizacao',
  // Landings de módulo (aba "Soluções"). /os-digital e /sistema-pmoc já
  // existiam aqui; agora têm rota no router e passam a ser prerenderizadas.
  '/os-digital',
  '/sistema-pmoc',
  '/sistema-crm',
  '/controle-financeiro',
  '/ponto-e-folha',
  '/emissao-de-nfse',
  '/portal-do-cliente',
  '/controle-de-estoque',
  '/orcamentos-e-contratos',
  '/rastreamento-de-equipes',
  '/area-do-tecnico',
  // Institucional
  '/quem-somos',
  // Blog (lista). Os posts individuais (/blog/:slug) têm slug DINÂMICO (vêm do
  // banco) e são descobertos/prerenderizados em runtime: o prerender renderiza
  // /blog, extrai os links `a[href^="/blog/"]` do DOM e renderiza cada post.
  // Ver scripts/prerender.mjs → prerenderBlogPosts(). NÃO hardcodar slugs aqui.
  '/blog',
];

/** Prefixo de rota dos posts individuais do blog. */
export const BLOG_LIST_ROUTE = '/blog';

/**
 * Um trecho de texto que DEVE aparecer no HTML renderizado de uma rota válida
 * de marketing. Se ausente, a rota provavelmente caiu no NotFound (404 da SPA)
 * — tratamos como "rota inexistente" e pulamos a gravação, em vez de salvar um
 * HTML de página-não-encontrada como se fosse a landing.
 *
 * Usamos o CTA principal da landing ("14 dias"), presente no hero/CTA de TODAS
 * as páginas públicas de marketing e AUSENTE no NotFound. Ajuste se o CTA mudar.
 */
export const MARKETING_CONTENT_MARKER = '14 dias';

/**
 * Marcador que NÃO pode aparecer numa página de marketing válida: se aparecer,
 * a rota caiu no catch-all NotFound. Usado para detectar rota inexistente.
 */
export const NOT_FOUND_MARKER = 'Página não Encontrada';

/**
 * Marcador do estado "post não encontrado" DENTRO do BlogPost (slug que não
 * existe / não está publicado). Esse estado NÃO cai no NotFound da SPA nem
 * contém o CTA "14 dias", então precisa de detecção própria pra não salvarmos
 * um 404 amigável como se fosse post. Ajuste se a copy de BlogPost mudar.
 */
export const BLOG_POST_NOT_FOUND_MARKER = 'Artigo não encontrado';

/** Porta usada pelo `vite preview` durante o prerender. */
export const PREVIEW_PORT = 4178;
