import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import hljs from 'highlight.js';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import logoBlack from '@/assets/logo-black-horizontal.png';
import logoWhite from '@/assets/logo-white-horizontal.png';
import {
  DOC_ARTICLE_BY_PATH,
  DOC_NAV_GROUPS,
  DOC_SEARCH_ITEMS,
  CREATE_ORDER_CODE_VARIANTS,
  QUICKSTART_PROMPT,
  type DocArticle,
  type DocBlock,
} from './docsContent';
import './developer-docs.css';

type DocsTheme = 'light' | 'dark';

const normalizePath = (pathname: string) => {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return normalized === '/v1/docs' ? '/docs' : normalized;
};

function useDocsTheme() {
  const [theme, setTheme] = useState<DocsTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = window.localStorage.getItem('dominex-docs-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    window.localStorage.setItem('dominex-docs-theme', theme);
  }, [theme]);

  return { theme, setTheme };
}

function useCopyFeedback() {
  const [copied, setCopied] = useState<string | null>(null);
  const timeoutRef = useRef<number>();

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  return { copied, copy };
}

function Brand() {
  return (
    <Link className="docs-brand" to="/docs" aria-label="Dominex Developers — início">
      <span className="docs-brand-logo-wrap">
        <img className="docs-brand-logo docs-brand-logo-light" src={logoBlack} alt="Dominex" />
        <img className="docs-brand-logo docs-brand-logo-dark" src={logoWhite} alt="Dominex" />
      </span>
      <span className="docs-brand-divider" aria-hidden="true" />
      <span className="docs-brand-label">developers</span>
    </Link>
  );
}

function SearchButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button className={`docs-search-trigger${compact ? ' is-compact' : ''}`} type="button" onClick={onClick}>
      <Search size={17} aria-hidden="true" />
      {!compact && <span>Buscar na documentação</span>}
      {!compact && <kbd>⌘ K</kbd>}
      <span className="sr-only">Buscar na documentação</span>
    </button>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: DocsTheme; onToggle: () => void }) {
  const nextTheme = theme === 'dark' ? 'claro' : 'escuro';
  return (
    <button className="docs-icon-button" type="button" onClick={onToggle} aria-label={`Ativar tema ${nextTheme}`}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function TopNavigation({ pathname }: { pathname: string }) {
  const items = [
    { label: 'Visão geral', path: '/docs', active: pathname === '/docs' },
    { label: 'Começar', path: '/docs/comecar/quickstart', active: pathname.startsWith('/docs/comecar') },
    { label: 'Guias', path: '/docs/guias/criar-os', active: pathname.startsWith('/docs/guias') },
    { label: 'Segurança', path: '/docs/comecar/producao', active: pathname === '/docs/comecar/producao' },
    { label: 'API e ferramentas', path: '/docs/api/referencia', active: pathname.startsWith('/docs/api') },
  ];

  return (
    <nav className="docs-top-nav" aria-label="Seções principais">
      {items.map((item) => (
        <Link key={item.label} className={item.active ? 'is-active' : ''} to={item.path}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function SideNavigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="docs-side-nav" aria-label="Documentação da API">
      {DOC_NAV_GROUPS.map((group) => (
        <section key={group.label} className="docs-side-group">
          <p>{group.label}</p>
          <div>
            {group.items.map((item) => {
              const active = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  className={active ? 'is-active' : ''}
                  to={item.path}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <div className="docs-side-tools">
        <a href="/v1/openapi.json" target="_blank" rel="noreferrer">
          OpenAPI <ExternalLink size={13} />
        </a>
        <Link to="/docs/api/agentes-de-ia">
          Para agentes de IA <ArrowRight size={13} />
        </Link>
        <a href="/docs/llms.txt" target="_blank" rel="noreferrer">
          Arquivo llms.txt <ExternalLink size={13} />
        </a>
      </div>
    </nav>
  );
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return DOC_SEARCH_ITEMS.slice(0, 7);
    return DOC_SEARCH_ITEMS.filter((item) =>
      [item.title, item.description, ...item.keywords]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(normalized),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const choose = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="docs-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="docs-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar na documentação"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="docs-search-input-row">
          <Search size={19} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'Enter' && results[0]) choose(results[0].path);
            }}
            placeholder="Buscar guias, endpoints, erros…"
          />
          <button type="button" onClick={onClose}>Esc</button>
        </div>
        <div className="docs-search-results">
          <p className="docs-search-caption">{query ? `${results.length} resultado(s)` : 'Sugestões'}</p>
          {results.length > 0 ? results.map((item) => (
            <button key={item.path} type="button" onClick={() => choose(item.path)}>
              <span className="docs-search-result-icon"><FileText size={16} /></span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          )) : (
            <div className="docs-search-empty">
              <Search size={22} />
              <strong>Nada encontrado</strong>
              <span>Tente “criar OS”, “429” ou “autenticação”.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type DocsCodeBlockProps = Omit<Extract<DocBlock, { type: 'code' }>, 'type'> & { id: string };

function CodeBlock({
  language,
  label,
  code,
  variants = [],
  collapsible = false,
  id,
}: DocsCodeBlockProps) {
  const { copied, copy } = useCopyFeedback();
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const examples = useMemo(() => [
    { label: label ?? language, language, code },
    ...variants,
  ], [code, label, language, variants]);
  const active = examples[Math.min(activeIndex, examples.length - 1)];
  const copyId = `${id}:${active.label}`;
  const didCopy = copied === copyId;
  const lineCount = active.code.split('\n').length;
  const canCollapse = collapsible || lineCount > 18;
  const highlighted = useMemo(() => {
    const aliases: Record<string, string> = {
      node: 'typescript',
      'node.js': 'typescript',
      curl: 'bash',
      shell: 'bash',
      text: 'plaintext',
    };
    const normalizedLanguage = aliases[active.language.toLocaleLowerCase()] ?? active.language.toLocaleLowerCase();
    if (!hljs.getLanguage(normalizedLanguage)) return hljs.highlightAuto(active.code).value;
    return hljs.highlight(active.code, { language: normalizedLanguage }).value;
  }, [active.code, active.language]);

  const selectExample = (index: number) => {
    setActiveIndex(index);
    setExpanded(false);
  };

  return (
    <div className={`docs-code-card${canCollapse ? ' is-collapsible' : ''}${expanded ? ' is-expanded' : ''}`}>
      <div className="docs-code-toolbar">
        <div className="docs-code-tabs" role={examples.length > 1 ? 'tablist' : undefined} aria-label={examples.length > 1 ? 'Linguagem do exemplo' : undefined}>
          {examples.length === 1 ? (
            <span><span aria-hidden="true">›_</span> {active.label}</span>
          ) : examples.map((example, index) => (
            <button
              key={example.label}
              type="button"
              role="tab"
              aria-selected={activeIndex === index}
              className={activeIndex === index ? 'is-active' : ''}
              onClick={() => selectExample(index)}
            >
              {example.label}
            </button>
          ))}
        </div>
        <button className="docs-code-copy" type="button" onClick={() => void copy(copyId, active.code)}>
          {didCopy ? <Check size={15} /> : <Copy size={15} />}
          {didCopy ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div className="docs-code-viewport">
        <pre><code className={`hljs language-${active.language}`} dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
      </div>
      {canCollapse && (
        <button
          className="docs-code-expand"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {expanded ? 'Recolher exemplo' : `Expandir exemplo · ${lineCount} linhas`}
        </button>
      )}
    </div>
  );
}

function PromptBlock({ block, id }: { block: Extract<DocBlock, { type: 'prompt' }>; id: string }) {
  const { copied, copy } = useCopyFeedback();
  const didCopy = copied === id;
  return (
    <div className="docs-prompt-card">
      <div className="docs-prompt-heading">
        <div className="docs-prompt-icon"><Bot size={20} /></div>
        <div>
          <span>IMPLEMENTE COM SUA IA</span>
          <h3>{block.title}</h3>
          <p>{block.description}</p>
        </div>
      </div>
      <div className="docs-prompt-actions">
        <p><ShieldCheck size={14} /> Sem segredos reais no prompt</p>
        <button type="button" onClick={() => void copy(id, block.prompt)}>
          {didCopy ? <Check size={16} /> : <Copy size={16} />}
          {didCopy ? 'Prompt copiado' : 'Copiar prompt para IA'}
        </button>
      </div>
    </div>
  );
}

function EndpointList({ block }: { block: Extract<DocBlock, { type: 'endpoints' }> }) {
  return (
    <div className="docs-endpoint-list">
      {block.items.map((endpoint) => (
        <div className="docs-endpoint-row" key={`${endpoint.method}:${endpoint.path}`}>
          <span className={`docs-method is-${endpoint.method.toLocaleLowerCase()}`}>{endpoint.method}</span>
          <code>{endpoint.path}</code>
          <p>{endpoint.description}</p>
          <small>{endpoint.scope}</small>
        </div>
      ))}
    </div>
  );
}

function RenderBlock({ block, id }: { block: DocBlock; id: string }) {
  if (block.type === 'paragraph') return <p className="docs-article-paragraph">{block.text}</p>;
  if (block.type === 'steps') {
    return (
      <ol className="docs-steps">
        {block.items.map((item, index) => (
          <li key={item.title}>
            <span>{index + 1}</span>
            <div><strong>{item.title}</strong><p>{item.detail}</p></div>
          </li>
        ))}
      </ol>
    );
  }
  if (block.type === 'code') return <CodeBlock {...block} id={id} />;
  if (block.type === 'callout') {
    return (
      <aside className={`docs-callout is-${block.tone}`}>
        <span>{block.tone === 'warning' ? <ShieldCheck size={18} /> : block.tone === 'success' ? <Check size={18} /> : <Zap size={18} />}</span>
        <div><strong>{block.title}</strong><p>{block.text}</p></div>
      </aside>
    );
  }
  if (block.type === 'flow') {
    return (
      <ol className="docs-flow" aria-label="Fluxo recomendado">
        {block.items.map((item, index) => (
          <li key={item.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            {index < block.items.length - 1 && <ArrowRight className="docs-flow-arrow" size={15} aria-hidden="true" />}
          </li>
        ))}
      </ol>
    );
  }
  if (block.type === 'details') {
    return (
      <div className="docs-details-list">
        {block.items.map((item) => (
          <details key={item.title}>
            <summary><span>{item.title}</span><ChevronDown size={16} aria-hidden="true" /></summary>
            <p>{item.detail}</p>
          </details>
        ))}
      </div>
    );
  }
  if (block.type === 'response') {
    return (
      <div className="docs-response-card">
        <div className="docs-response-status">
          <span><Check size={13} /> {block.eyebrow}</span>
          <strong>{block.status}</strong>
          <p>{block.title}</p>
        </div>
        <dl>
          {block.items.map((item) => (
            <div key={item.title}><dt>{item.title}</dt><dd>{item.detail}</dd></div>
          ))}
        </dl>
      </div>
    );
  }
  if (block.type === 'prompt') {
    const [primarySnippet, ...otherSnippets] = block.snippets;
    return (
      <div className="docs-code-and-prompt">
        <CodeBlock
          id={`${id}:snippets`}
          language={primarySnippet.language}
          label={primarySnippet.label}
          code={primarySnippet.code}
          variants={otherSnippets}
          collapsible
        />
        <PromptBlock block={block} id={id} />
      </div>
    );
  }
  if (block.type === 'endpoints') return <EndpointList block={block} />;
  return (
    <div className="docs-table-wrap">
      <table>
        <thead><tr>{block.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{block.rows.map((row) => (
          <tr key={row.join(':')}>{row.map((cell, index) => <td key={`${cell}:${index}`}>{cell}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Article({ article }: { article: DocArticle }) {
  return (
    <>
      <article className="docs-article">
        <header className="docs-article-header">
          <div className="docs-article-meta">
            <span>{article.eyebrow}</span>
            <span><Clock3 size={13} /> {article.readingTime} de leitura</span>
          </div>
          <h1>{article.title}</h1>
          <p>{article.description}</p>
        </header>

        {article.image && (
          <figure className="docs-article-visual">
            <img src={article.image.src} alt={article.image.alt} width="1280" height="960" />
            <figcaption>{article.image.caption}</figcaption>
          </figure>
        )}

        {article.sections.map((section) => (
          <section className="docs-article-section" id={section.id} key={section.id}>
            <div className="docs-section-heading">
              <span>{section.number}</span>
              <div>
                <h2>{section.title}</h2>
                {section.lead && <p>{section.lead}</p>}
              </div>
            </div>
            <div className="docs-section-content">
              {section.blocks.map((block, index) => (
                <RenderBlock block={block} id={`${article.path}:${section.id}:${index}`} key={`${section.id}:${index}`} />
              ))}
            </div>
          </section>
        ))}

        <nav className="docs-article-footer" aria-label="Próximos passos">
          <div>
            <span>PRÓXIMO PASSO</span>
            <strong>Consulte o contrato completo</strong>
          </div>
          <Link to="/docs/api/referencia">Explorar a API <ArrowRight size={16} /></Link>
        </nav>
      </article>

      <aside className="docs-toc" aria-label="Nesta página">
        <strong>Nesta página</strong>
        <a href="#top">{article.description}</a>
        {article.sections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}
        <div className="docs-toc-ai">
          <FileCode2 size={17} />
          <p>Leve a documentação para o seu editor.</p>
          <a href="/docs/llms.txt" target="_blank" rel="noreferrer">Acessar llms.txt <ExternalLink size={12} /></a>
        </div>
      </aside>
    </>
  );
}

const goalCards = [
  {
    number: '01', title: 'Criar uma ordem de serviço', text: 'Do seu sistema à agenda, com transação e retry seguro.',
    path: '/docs/guias/criar-os', image: '/docs/images/whatsapp-service-order.jpg',
    alt: 'Escultura 3D em acrílico de um evento externo conectado a uma ordem de serviço confirmada',
  },
  {
    number: '02', title: 'Consultar horários livres', text: 'Ofereça slots reais no timezone da empresa.',
    path: '/docs/guias/disponibilidade', image: '/docs/images/schedule-availability.jpg',
    alt: 'Escultura 3D em acrílico de um calendário com horários disponíveis',
  },
  {
    number: '03', title: 'Encontrar ou criar cliente', text: 'Resolva a identidade sem duplicar ou sobrescrever.',
    path: '/docs/guias/clientes', image: '/docs/images/customer-identity.jpg',
    alt: 'Escultura 3D em acrílico de cartões de cliente protegidos por uma chave',
  },
];

function ConceptVisual() {
  return (
    <figure className="docs-concept-visual">
      <img
        src="/docs/images/dominex-api-hero.jpg"
        alt="Aplicação externa conectada a uma interface translúcida de ordem de serviço Dominex"
        width="1280"
        height="960"
      />
      <figcaption className="docs-concept-caption"><span>Sua integração.</span><span>A operação Dominex.</span></figcaption>
    </figure>
  );
}

function GoalArt({ src, alt }: { src: string; alt: string }) {
  return (
    <img className="docs-goal-art" src={src} alt={alt} width="900" height="675" loading="lazy" />
  );
}

function Overview() {
  const { copied, copy } = useCopyFeedback();
  return (
    <div className="docs-overview">
      <section className="docs-hero">
        <div className="docs-hero-copy">
          <div className="docs-kicker"><span>DOMINEX DEVELOPERS</span><i /> <span>API V1</span></div>
          <h1>Construa com<br />Dominex.</h1>
          <p>Guias, exemplos e prompts para conectar qualquer aplicação à operação de campo — de CRMs e ERPs a automações e agentes de IA.</p>
          <div className="docs-hero-actions">
            <Link className="docs-primary-button" to="/docs/comecar/quickstart">Começar agora <ArrowRight size={17} /></Link>
            <Link className="docs-text-link" to="/docs/api/referencia">Explorar a API <ArrowRight size={15} /></Link>
          </div>
        </div>
        <ConceptVisual />
      </section>

      <section className="docs-goals-section">
        <div className="docs-section-title-row">
          <div><span>ESCOLHA SEU CAMINHO</span><h2>O que você quer construir?</h2></div>
          <p>Uma API. Fluxos completos.</p>
        </div>
        <div className="docs-goal-grid-list">
          {goalCards.map(({ number, title, text, path, image, alt }) => (
            <Link className="docs-goal-card" to={path} key={path}>
              <div className="docs-goal-visual"><GoalArt src={image} alt={alt} /><span>{number}</span></div>
              <div className="docs-goal-title"><h3>{title}</h3><ArrowRight size={17} /></div>
              <p>{text}</p>
              <span className="docs-explore-link">Explorar guia <ArrowRight size={14} /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="docs-first-request">
        <div className="docs-first-request-copy">
          <span>DO ZERO À PRIMEIRA OS</span>
          <h2>Sua primeira<br />requisição.</h2>
          <p>Crie uma ordem de serviço com cliente novo e horário confirmado. A transação protege cliente, OS e reserva.</p>
          <ol>
            <li><span>1</span><Link to="/docs/comecar/autenticacao">Gere uma chave de API <ArrowRight size={13} /></Link></li>
            <li><span>2</span><Link to="/docs/guias/disponibilidade">Consulte os horários livres <ArrowRight size={13} /></Link></li>
            <li><span>3</span><Link to="/docs/comecar/quickstart">Crie a OS com idempotência <ArrowRight size={13} /></Link></li>
          </ol>
        </div>
        <CodeBlock
          id="overview-request"
          language="bash"
          label="cURL"
          variants={CREATE_ORDER_CODE_VARIANTS}
          collapsible
          code={`# Execute somente no servidor.
# Preserve a chave de idempotência ao repetir esta tentativa.
curl --request POST 'https://api.dominex.app/v1/service-orders' \\
  -H 'Authorization: Bearer $DOMINEX_API_KEY' \\
  -H 'Idempotency-Key: $DOMINEX_IDEMPOTENCY_KEY' \\
  -H 'Content-Type: application/json' \\
  --data '{
    "customer": {
      "external_id": "crm-contact-42",
      "name": "Cliente Exemplo",
      "phone": "+5511999999999"
    },
    "os_type": "visita_tecnica",
    "description": "Avaliação técnica solicitada pelo sistema parceiro.",
    "scheduled_at": "2026-10-21T09:30:00-03:00",
    "duration_minutes": 90
  }'`}
        />
      </section>

      <section className="docs-ai-handoff">
        <div className="docs-ai-copy">
          <div className="docs-ai-icon"><Sparkles size={22} /></div>
          <span>DOCUMENTAÇÃO PARA O SEU AGENTE</span>
          <h2>Da leitura à implementação.</h2>
          <p>Copie um prompt completo, entregue o OpenAPI ao agente e mantenha a chave fora do contexto. As regras de segurança e retry já acompanham cada guia.</p>
          <div className="docs-ai-actions">
            <button type="button" onClick={() => void copy('master-prompt', QUICKSTART_PROMPT)}>
              {copied === 'master-prompt' ? <Check size={16} /> : <Copy size={16} />}
              {copied === 'master-prompt' ? 'Prompt copiado' : 'Copiar prompt mestre'}
            </button>
            <Link to="/docs/api/agentes-de-ia">Ver guia para IA <ArrowRight size={15} /></Link>
          </div>
        </div>
        <div className="docs-ai-resources">
          <a href="/docs/llms.txt" target="_blank" rel="noreferrer">
            <FileText size={19} /><span><strong>llms.txt</strong><small>Contexto enxuto para o editor</small></span><ExternalLink size={15} />
          </a>
          <a href="/v1/openapi.json" target="_blank" rel="noreferrer">
            <FileCode2 size={19} /><span><strong>OpenAPI 3.1.1</strong><small>Contrato completo da API</small></span><ExternalLink size={15} />
          </a>
          <Link to="/docs/api/erros-e-limites">
            <ShieldCheck size={19} /><span><strong>Segurança e limites</strong><small>Retries, erros e rate limit</small></span><ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <footer className="docs-overview-footer">
        <Brand />
        <div><Link to="/docs/api/referencia">Referência</Link><a href="/v1/openapi.json">OpenAPI</a><a href="/docs/llms.txt">llms.txt</a></div>
      </footer>
    </div>
  );
}

function UnknownDocsPage() {
  return (
    <div className="docs-unknown">
      <span>404</span>
      <h1>Este guia não existe.</h1>
      <p>Volte para a visão geral ou encontre o assunto pela busca.</p>
      <Link className="docs-primary-button" to="/docs">Voltar à documentação <ArrowRight size={16} /></Link>
    </div>
  );
}

export default function DeveloperDocs() {
  const location = useLocation();
  const pathname = normalizePath(location.pathname);
  const article = DOC_ARTICLE_BY_PATH.get(pathname);
  const isOverview = pathname === '/docs';
  const { theme, setTheme } = useDocsTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const description = article?.description ?? 'Documentação da API Pública Dominex para CRMs, ERPs, automações, portais, agentes de IA e outras integrações server-to-server.';
    document.title = `${article?.title ?? 'Documentação da API'} | Dominex Developers`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `https://www.dominex.app${pathname}`;

    let llmsLink = document.querySelector<HTMLLinkElement>('link[data-dominex-llms]');
    if (!llmsLink) {
      llmsLink = document.createElement('link');
      llmsLink.rel = 'alternate';
      llmsLink.type = 'text/plain';
      llmsLink.title = 'Dominex Public API llms.txt';
      llmsLink.dataset.dominexLlms = 'true';
      document.head.appendChild(llmsLink);
    }
    llmsLink.href = 'https://www.dominex.app/docs/llms.txt';
  }, [article, pathname]);

  const hasKnownPage = isOverview || Boolean(article);

  return (
    <div className="developer-docs" data-docs-theme={theme} id="top">
      <a className="docs-skip-link" href="#docs-main">Pular para o conteúdo</a>
      <header className="docs-header">
        <div className="docs-header-primary">
          <Brand />
          <div className="docs-header-actions">
            <SearchButton onClick={() => setSearchOpen(true)} />
            <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
            <a className="docs-dashboard-button" href="/configuracoes?tab=integracoes&integration=api">
              Painel <ArrowRight size={15} />
            </a>
          </div>
          <div className="docs-mobile-actions">
            <SearchButton compact onClick={() => setSearchOpen(true)} />
            <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
            <button className="docs-icon-button" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menu da documentação">
              <Menu size={19} />
            </button>
          </div>
        </div>
        <div className="docs-header-secondary"><TopNavigation pathname={pathname} /></div>
      </header>

      <div className={`docs-shell${isOverview ? ' is-overview' : ''}`}>
        <aside className="docs-sidebar"><SideNavigation pathname={pathname} /></aside>
        <main className="docs-main" id="docs-main">
          {isOverview ? <Overview /> : article ? <Article article={article} /> : <UnknownDocsPage />}
        </main>
      </div>

      {mobileNavOpen && (
        <div className="docs-mobile-nav-backdrop" role="presentation" onMouseDown={() => setMobileNavOpen(false)}>
          <aside className="docs-mobile-nav" role="dialog" aria-modal="true" aria-label="Menu da documentação" onMouseDown={(event) => event.stopPropagation()}>
            <div className="docs-mobile-nav-header"><Brand /><button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Fechar menu"><X size={19} /></button></div>
            <SideNavigation pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
            <a className="docs-mobile-dashboard" href="/configuracoes?tab=integracoes&integration=api">Abrir painel <ArrowRight size={16} /></a>
          </aside>
        </div>
      )}

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      {!hasKnownPage && <span className="sr-only">Página não encontrada</span>}
    </div>
  );
}
