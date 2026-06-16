import { useState } from 'react';
import { ArrowLeft, Loader2, PackageSearch, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import {
  useRemoteConfig,
  type EquipmentModel,
} from '@/hooks/useEquipmentCatalog';

/**
 * Detalhes técnicos de um controle remoto (modos, símbolos, reset/desbloqueio,
 * código universal, instruções de configuração).
 * Foto em destaque + seções de texto. Só renderiza as seções preenchidas.
 */
export function RemoteConfig({
  model,
  onBack,
}: {
  model: EquipmentModel;
  onBack: () => void;
}) {
  const { data: config, isLoading } = useRemoteConfig(model.id);
  const [viewerOpen, setViewerOpen] = useState(false);

  const brandName = model.brand?.name ?? '';
  const tituloTopo = brandName ? `${model.name} - ${brandName}` : model.name;
  const temFoto = Boolean(model.image_url);

  const sections: { label: string; value: string | null }[] = config
    ? [
        { label: 'Como configurar', value: config.instrucoes },
        { label: 'Código universal', value: config.codigo_universal },
        { label: 'Reset', value: config.reset },
        { label: 'Desbloqueio', value: config.desbloqueio },
        { label: 'Modos', value: config.modos },
        { label: 'Observações', value: config.observacoes },
      ]
    : [];
  const visibleSections = sections.filter((s) => s.value && s.value.trim().length > 0);
  const semConfig = !isLoading && visibleSections.length === 0;

  return (
    <div className="space-y-6 pb-8">
      <Header icon={Settings2} title="Detalhes Técnicos" subtitle={tituloTopo} onBack={onBack} />

      {/* Foto em destaque */}
      {temFoto ? (
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`Ampliar foto de ${model.name}`}
          className="flex h-48 w-full cursor-pointer items-center justify-center rounded-2xl border border-border bg-white p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={model.image_url!}
            alt={model.name}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        </button>
      ) : (
        <div className="flex h-48 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-white">
          <PackageSearch className="h-12 w-12 text-neutral-300" />
          <span className="text-xs text-neutral-400">Sem foto</span>
        </div>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : semConfig ? (
        <EmptyState
          title="Em atualização"
          message="As instruções de configuração deste controle estão sendo cadastradas. Volte em breve."
        />
      ) : (
        <div className="space-y-3">
          {visibleSections.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <div className="mt-1.5">
                <FormattedText text={s.value!} />
              </div>
            </div>
          ))}
        </div>
      )}

      {temFoto && (
        <ImagePreviewModal
          src={model.image_url!}
          alt={model.name}
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Renderer de texto formatado (Convenção de Formatação v1)            */
/* ------------------------------------------------------------------ */

/**
 * Renderiza o corpo de um campo de texto seguindo a Convenção v1:
 * - Blocos separados por linha em branco (\n\n).
 * - Linha-rótulo: linha curta (<=40 chars) terminada em ":" → sub-rótulo discreto.
 * - Itens de lista: linhas começando com "- " → <ul> com bullet + hanging indent.
 *   Se houver " — " (travessão), destaca o termo antes do travessão.
 * - Parágrafos: demais linhas.
 * Robusto: texto solto vira parágrafo(s) sem quebrar.
 */
function FormattedText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
      {blocks.map((block, bi) => {
        if (block.type === 'label') {
          return (
            <p
              key={bi}
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {block.text}
            </p>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={bi} className="space-y-1.5">
              {block.items.map((item, ii) => (
                <li key={ii} className="flex gap-2">
                  <span aria-hidden className="select-none text-muted-foreground">
                    •
                  </span>
                  <span className="min-w-0 flex-1">
                    {item.term ? (
                      <>
                        <span className="font-medium text-foreground">{item.term}</span>
                        <span className="text-muted-foreground"> — {item.rest}</span>
                      </>
                    ) : (
                      item.rest
                    )}
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        // parágrafo (pode ter múltiplas linhas dentro do bloco)
        return (
          <p key={bi} className="whitespace-pre-line">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

type ParsedBlock =
  | { type: 'label'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: { term: string | null; rest: string }[] };

const LABEL_RE = /^.{1,40}:$/;

function parseBlocks(raw: string): ParsedBlock[] {
  const result: ParsedBlock[] = [];
  // Split por linha em branco (tolera espaços/CR na linha "vazia")
  const rawBlocks = raw.replace(/\r\n/g, '\n').split(/\n[ \t]*\n/);

  for (const rawBlock of rawBlocks) {
    const lines = rawBlock.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // Bloco com uma única linha-rótulo curta terminada em ":"
    if (lines.length === 1 && LABEL_RE.test(lines[0])) {
      result.push({ type: 'label', text: lines[0] });
      continue;
    }

    // Processa o bloco linha a linha, agrupando itens de lista consecutivos
    let listBuffer: { term: string | null; rest: string }[] = [];
    let paraBuffer: string[] = [];

    const flushList = () => {
      if (listBuffer.length > 0) {
        result.push({ type: 'list', items: listBuffer });
        listBuffer = [];
      }
    };
    const flushPara = () => {
      if (paraBuffer.length > 0) {
        result.push({ type: 'paragraph', text: paraBuffer.join('\n') });
        paraBuffer = [];
      }
    };

    for (const line of lines) {
      if (line.startsWith('- ')) {
        flushPara();
        listBuffer.push(parseListItem(line.slice(2).trim()));
      } else if (LABEL_RE.test(line)) {
        // rótulo no meio de um bloco também vira sub-rótulo
        flushList();
        flushPara();
        result.push({ type: 'label', text: line });
      } else {
        flushList();
        paraBuffer.push(line);
      }
    }
    flushList();
    flushPara();
  }

  return result;
}

function parseListItem(content: string): { term: string | null; rest: string } {
  const idx = content.indexOf(' — ');
  if (idx > 0) {
    return { term: content.slice(0, idx).trim(), rest: content.slice(idx + 3).trim() };
  }
  return { term: null, rest: content };
}

/* ------------------------------------------------------------------ */
/* Blocos auxiliares (espelham os de Equipamentos.tsx)                 */
/* ------------------------------------------------------------------ */

function Header({
  icon: Icon,
  title,
  subtitle,
  onBack,
}: {
  icon: typeof Settings2;
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="h-6 w-6 shrink-0 text-foreground/70" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight lg:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <PackageSearch className="h-10 w-10 text-muted-foreground" />
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
