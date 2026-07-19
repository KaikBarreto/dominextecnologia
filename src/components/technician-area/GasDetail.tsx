import { ArrowLeft, Download, Droplet, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { idealForeground } from '@/lib/colorContrast';
import type { RefrigerantGas } from '@/hooks/useEquipmentCatalog';
import { GasBadge } from './GasBadge';
import { explicacaoBadge } from './gasBadgeInfo';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/** Cinza neutro pra gás sem cor cadastrada (régua: gás sempre com bolinha). */
const COR_NEUTRA = '#6b7280';

/**
 * Inflamabilidade do gás pela classe de segurança ASHRAE (campo `classe_seguranca`).
 * O 2º caractere indica a inflamabilidade: 1 = não inflamável; 2L/2/3 = inflamável.
 * Logo, basta a string conter '2' ou '3' (ex.: A2L, A2, A3, B2L, B3).
 */
function gasInflamavel(classeSeguranca: string | null | undefined): boolean {
  const c = classeSeguranca ?? '';
  return c.includes('2') || c.includes('3');
}

/** Remove caracteres inválidos de nome de arquivo e colapsa espaços. */
function sanitizarNomeArquivo(nome: string): string {
  return nome
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Baixa um PDF salvando com nome legível em vez do UUID do storage.
 * Fallback para window.open se o fetch do blob falhar (ex: CORS).
 */
async function baixarPdf(url: string, nome: string) {
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

/** Número em PT-BR (vírgula decimal, sem zeros à toa). */
function num(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

/** Escurece um hex (#rgb ou #rrggbb) multiplicando os canais por (1-amount). */
function darken(hex: string, amount = 0.18): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  const f = Math.max(0, 1 - amount);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Detalhe de um fluido refrigerante: cabeçalho colorido com o código em destaque
 * + tabela de specs (só linhas preenchidas) + downloads (ficha nossa sempre,
 * guia do fabricante quando existir).
 */
export function GasDetail({ gas, onBack }: { gas: RefrigerantGas; onBack: () => void }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.gasDetail;
  const cor = gas.cor || COR_NEUTRA;
  const fg = idealForeground(cor);
  const inflamavel = gasInflamavel(gas.classe_seguranca);

  // `explain` marca as linhas cujo valor é um badge com tooltip (tipo do gás e
  // classe de segurança). Só vira tooltip se houver explicação no mapa.
  const rows: { label: string; value: string | null; explain?: boolean }[] = [
    { label: t.composition, value: gas.composicao },
    { label: t.type, value: gas.tipo, explain: true },
    { label: t.gwp, value: num(gas.gwp) },
    { label: t.odp, value: num(gas.odp) },
    { label: t.boilingPoint, value: num(gas.ponto_ebulicao_c) != null ? `${num(gas.ponto_ebulicao_c)} °C` : null },
    { label: t.glide, value: num(gas.glide_k) != null ? `${num(gas.glide_k)} K` : null },
    { label: t.safetyClass, value: gas.classe_seguranca, explain: true },
    { label: t.oil, value: gas.oleo },
    { label: t.replaces, value: gas.substitui },
    { label: t.application, value: gas.aplicacao },
    { label: t.notes, value: gas.observacoes },
  ];
  const visibleRows = rows.filter((r) => r.value && r.value.trim().length > 0);

  const temDownloads = Boolean(gas.ficha_url || gas.guia_oficial_url);
  // Botões num tom levemente mais escuro que a cor do card, pra "pertencerem" a ele.
  const corBotao = darken(cor, 0.3);
  const downloadButtons = (
    <>
      {gas.ficha_url && (
        <Button
          size="lg"
          className="h-12 w-full border-0 text-base hover:opacity-90"
          style={{ backgroundColor: corBotao, color: fg }}
          onClick={() =>
            baixarPdf(gas.ficha_url!, sanitizarNomeArquivo(`Ficha técnica ${gas.code}.pdf`))
          }
        >
          <Download className="h-5 w-5 shrink-0" />
          {t.technicalSheet}
        </Button>
      )}
      {gas.guia_oficial_url && (
        <Button
          size="lg"
          className="h-12 w-full border-0 text-base hover:opacity-90"
          style={{ backgroundColor: corBotao, color: fg }}
          onClick={() =>
            baixarPdf(
              gas.guia_oficial_url!,
              sanitizarNomeArquivo(`Guia do fabricante ${gas.code}.pdf`),
            )
          }
        >
          <Download className="h-5 w-5 shrink-0" />
          {t.manufacturerGuide}
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header com voltar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Droplet className="h-6 w-6 shrink-0 text-foreground/70" />
          <h1 className="truncate text-lg font-semibold tracking-tight lg:text-2xl">
            {t.heading}
          </h1>
        </div>
      </div>

      {/* Cabeçalho colorido — cor do gás como fundo, código em destaque */}
      <div
        className="rounded-2xl p-5 shadow-sm"
        style={{ backgroundColor: cor, color: fg }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-2 ring-white/40"
            style={{ backgroundColor: cor === COR_NEUTRA ? '#9ca3af' : cor }}
          >
            <Droplet className="h-6 w-6" style={{ color: fg }} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-extrabold leading-none tracking-tight">{gas.code}</p>
              {inflamavel && (
                <Flame
                  className="h-6 w-6 shrink-0"
                  style={{ color: fg }}
                  fill="currentColor"
                  strokeWidth={2}
                  aria-label="Gás inflamável"
                />
              )}
            </div>
            <p className="mt-1 truncate text-sm font-medium opacity-90">{gas.name}</p>
          </div>
        </div>

        {/* Downloads dentro do card — só desktop, tom levemente mais escuro que o card */}
        {temDownloads && (
          <div className="mt-4 hidden gap-2 lg:grid lg:grid-cols-2">{downloadButtons}</div>
        )}
      </div>

      {/* Downloads abaixo do card — só mobile */}
      {temDownloads && (
        <div className="grid grid-cols-1 gap-2 lg:hidden">{downloadButtons}</div>
      )}

      {/* Tabela de specs (só linhas preenchidas) */}
      {visibleRows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {visibleRows.map((r) => (
              <li key={r.label} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="shrink-0 text-sm font-medium text-muted-foreground">{r.label}</span>
                <span className="flex min-w-0 items-center justify-end gap-2 text-right text-sm font-semibold text-foreground">
                  {r.explain && r.value && explicacaoBadge(r.value) ? (
                    <GasBadge rawText={r.value} className="font-semibold text-foreground">
                      {r.value}
                    </GasBadge>
                  ) : (
                    r.value
                  )}
                  {r.label === t.safetyClass && inflamavel && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-orange-600 dark:text-orange-400">
                      <Flame className="h-3 w-3 shrink-0" fill="currentColor" strokeWidth={2} aria-hidden />
                      {t.flammable}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
