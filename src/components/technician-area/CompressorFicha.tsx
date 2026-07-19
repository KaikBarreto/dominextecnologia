import { useMemo, useState } from 'react';
import { ArrowLeft, Cpu, Download, Flame, Loader2, PackageSearch } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { CatalogImage } from './CatalogImage';
import { getRefrigerante } from '@/lib/refrigerantes';
import { idealForeground } from '@/lib/colorContrast';
import {
  useCompressorSpec,
  useRefrigerantGases,
  rotuloManual,
  type EquipmentModel,
} from '@/hooks/useEquipmentCatalog';

/** Cinza neutro pra gás sem cor cadastrada (régua: nunca inventar cor de gás). */
const GAS_COR_NEUTRA = '#6b7280';

/**
 * Inflamabilidade do gás pela classe de segurança ASHRAE (campo `classe_seguranca`).
 * O 2º caractere indica a inflamabilidade: 1 = não inflamável; 2L/2/3 = inflamável.
 * Logo basta a string conter '2' ou '3' (A2L, A2, A3, B2L, B3). A1/B1 e nula → não.
 */
function gasInflamavel(classeSeguranca: string | null | undefined): boolean {
  const c = classeSeguranca ?? '';
  return c.includes('2') || c.includes('3');
}

/** Um gás extraído da string de `refrigerant` de um compressor. */
interface GasParseado {
  /** Código normalizado (ex.: "R-404A"), usado de key. */
  code: string;
}

/**
 * Faz o parse da string de gás de um compressor (ex.:
 * "R-404A, R-507, R-449A (R-22 legado)") em:
 * - `gases`: um item por código de gás (forma "R-404A"); e
 * - `nota`: o texto entre parênteses no fim, vira observação discreta
 *   (ex.: "(R-22 legado)" → "substitui R-22"), sem virar badge.
 */
function parseGases(raw: string): { gases: GasParseado[]; nota: string | null } {
  // Separa a nota final entre parênteses (ex.: "(R-22 legado)").
  let nota: string | null = null;
  const mParen = raw.match(/\(([^)]*)\)\s*$/);
  let corpo = raw;
  if (mParen) {
    const dentro = mParen[1].trim();
    const codLegado = dentro.match(/R-?\d+[A-Za-z]*/i);
    nota = codLegado ? `substitui ${normalizarCodigoGas(codLegado[0])}` : dentro;
    corpo = raw.slice(0, mParen.index).trim();
  }

  const vistos = new Set<string>();
  const gases: GasParseado[] = [];
  for (const parte of corpo.split(',')) {
    const m = parte.match(/R-?\d+[A-Za-z]*/i);
    if (!m) continue;
    const code = normalizarCodigoGas(m[0]);
    if (vistos.has(code)) continue;
    vistos.add(code);
    gases.push({ code });
  }
  return { gases, nota };
}

/** Normaliza "R404A"/"r-404a" → "R-404A" (hífen depois do R, sufixo upper). */
function normalizarCodigoGas(bruto: string): string {
  const m = bruto.match(/^R-?(\d+)([A-Za-z]*)$/i);
  if (!m) return bruto.toUpperCase();
  return `R-${m[1]}${m[2].toUpperCase()}`;
}

/** Remove caracteres inválidos de nome de arquivo e colapsa espaços. */
function sanitizarNomeArquivo(nome: string): string {
  return nome
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Baixa o datasheet (PDF) salvando com nome legível em vez do UUID do storage.
 * Fallback para window.open se o fetch do blob falhar (ex: CORS).
 */
async function baixarDatasheet(url: string, nome: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(u);
  } catch {
    window.open(url, '_blank');
  }
}

/**
 * Ficha técnica de um compressor (Fase 1 — estrutura).
 * Foto em destaque + tabela de campos preenchidos. Gás reusa model.refrigerant.
 */
export function CompressorFicha({
  model,
  onBack,
}: {
  model: EquipmentModel;
  onBack: () => void;
}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.compressorSheet;
  const { data: spec, isLoading } = useCompressorSpec(model.id);
  const { data: gases = [] } = useRefrigerantGases();
  const [viewerOpen, setViewerOpen] = useState(false);

  // Mapa code(UPPER)→{cor, classe} do catálogo global de gases (preferência),
  // pra colorir cada badge da lista e saber se é inflamável.
  const gasInfoMap = useMemo(() => {
    const map = new Map<string, { cor: string | null; classe: string | null }>();
    for (const g of gases) {
      if (!g.code) continue;
      map.set(g.code.toUpperCase(), { cor: g.cor, classe: g.classe_seguranca });
    }
    return map;
  }, [gases]);

  /** Resolve cor + inflamabilidade de um código de gás (catálogo global → refrigerantes.ts → cinza). */
  const resolverGas = (code: string) => {
    const upper = code.toUpperCase();
    const info = gasInfoMap.get(upper);
    const refrig = getRefrigerante(code) ?? getRefrigerante(upper);
    const cor = info?.cor ?? refrig?.cor ?? GAS_COR_NEUTRA;
    // Inflamável: classe_seguranca do catálogo OU classe ASHRAE de refrigerantes.ts.
    const inflamavel =
      gasInflamavel(info?.classe) ||
      (refrig ? gasInflamavel(refrig.inflamabilidade) : false);
    return { cor, inflamavel };
  };

  const brandName = model.brand?.name ?? '';
  const tituloTopo = brandName ? `${model.name} - ${brandName}` : model.name;
  const temFoto = Boolean(model.image_url);
  const temManual = Boolean(model.manual_url);

  // Campos da ficha, na ordem do briefing. Só entram os preenchidos.
  const rows: { label: string; value: string | null }[] = spec
    ? [
        { label: 'HP', value: spec.hp },
        { label: 'Capacidade', value: spec.capacidade_btu },
        { label: 'Aplicação', value: spec.aplicacao },
        { label: 'Tensão', value: spec.tensao },
        { label: 'Frequência', value: spec.frequencia },
        { label: 'Deslocamento', value: spec.deslocamento_cm3 },
        { label: 'RLA', value: spec.rla != null ? String(spec.rla) : null },
        { label: 'LRA', value: spec.lra != null ? String(spec.lra) : null },
        { label: 'Capacitor de trabalho', value: spec.capacitor_trabalho },
        { label: 'Capacitor de partida', value: spec.capacitor_partida },
        { label: 'Relé / Protetor', value: spec.rele_protetor },
        { label: 'Óleo', value: spec.oleo },
        { label: 'Conexões', value: spec.conexoes },
        { label: 'Equivalências', value: spec.equivalencias },
        { label: 'Observações', value: spec.observacoes },
      ]
    : [];
  const visibleRows = rows.filter((r) => r.value && r.value.trim().length > 0);
  // Gás vem do próprio modelo (não da ficha). Pode ser uma lista (câmara fria).
  const gasRaw = model.refrigerant?.trim() || null;
  const { gases: gasesParseados, nota: gasNota } = gasRaw
    ? parseGases(gasRaw)
    : { gases: [], nota: null };
  const temGas = gasesParseados.length > 0;
  const semFicha = !isLoading && visibleRows.length === 0 && !temGas;

  return (
    <div className="space-y-6 pb-8">
      <Header
        icon={Cpu}
        eyebrow={t.eyebrow}
        title={tituloTopo}
        onBack={onBack}
      />

      {/* Foto em destaque */}
      {temFoto ? (
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`Ampliar foto de ${model.name}`}
          className="flex h-48 w-full cursor-pointer items-center justify-center rounded-2xl border border-border bg-white p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CatalogImage
            src={model.image_url!}
            alt={model.name}
            containerClassName="h-full w-full"
            className="h-full w-full object-contain"
          />
        </button>
      ) : (
        <div className="flex h-48 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-white">
          <PackageSearch className="h-12 w-12 text-neutral-300" />
          <span className="text-xs text-neutral-400">{t.noPhoto}</span>
        </div>
      )}

      {/* Ficha */}
      {isLoading ? (
        <LoadingBlock />
      ) : semFicha ? (
        <EmptyState
          title={t.emptyTitle}
          message={t.emptyMessage}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {temGas && (
              <li className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="shrink-0 pt-0.5 text-sm font-medium text-muted-foreground">
                  {t.gasLabel}
                </span>
                <div className="flex min-w-0 flex-col items-end gap-1">
                  <TooltipProvider delayDuration={150}>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {gasesParseados.map(({ code }) => {
                        const { cor, inflamavel } = resolverGas(code);
                        const fg = idealForeground(cor);
                        return (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
                            style={{ backgroundColor: cor, color: fg }}
                          >
                            {code}
                            {inflamavel && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    role="img"
                                    aria-label="Inflamável"
                                    title="Inflamável"
                                    className="inline-flex shrink-0"
                                  >
                                    <Flame
                                      className="h-3.5 w-3.5"
                                      style={{ color: fg }}
                                      fill="currentColor"
                                      strokeWidth={2}
                                      aria-hidden
                                    />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t.flammable}</TooltipContent>
                              </Tooltip>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </TooltipProvider>
                  {gasNota && (
                    <span className="text-right text-xs text-muted-foreground">{gasNota}</span>
                  )}
                </div>
              </li>
            )}
            {visibleRows.map((r) => (
              <li key={r.label} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="shrink-0 text-sm font-medium text-muted-foreground">{r.label}</span>
                <span className="min-w-0 text-right text-sm font-semibold text-foreground">
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Datasheet (reusa manual_url) — em destaque (preenchido, maior, full-width) */}
      {temManual && (
        <Button
          size="lg"
          className="h-12 w-full text-base"
          onClick={() =>
            baixarDatasheet(
              model.manual_url!,
              sanitizarNomeArquivo(`Datasheet ${model.name} - ${brandName}.pdf`),
            )
          }
        >
          <Download className="h-5 w-5" />
          {model.manual_type ? rotuloManual(model.manual_type) : 'Datasheet'}
        </Button>
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
/* Blocos auxiliares (espelham os de Equipamentos.tsx)                 */
/* ------------------------------------------------------------------ */

function Header({
  icon: Icon,
  title,
  eyebrow,
  onBack,
}: {
  icon: typeof Cpu;
  title: string;
  /** Rótulo pequeno acima do título (ex: "Ficha Técnica"). */
  eyebrow?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-foreground/70" />
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </p>
          )}
          {/* Nome do modelo em destaque (título da página, alto contraste). */}
          <h1 className="text-lg font-semibold leading-snug tracking-tight text-foreground lg:text-2xl">
            {title}
          </h1>
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
