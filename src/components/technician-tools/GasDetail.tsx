import { ArrowLeft, Download, Droplet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { idealForeground } from '@/lib/colorContrast';
import type { RefrigerantGas } from '@/hooks/useEquipmentCatalog';

/** Cinza neutro pra gás sem cor cadastrada (régua: gás sempre com bolinha). */
const COR_NEUTRA = '#6b7280';

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

/**
 * Detalhe de um fluido refrigerante: cabeçalho colorido com o código em destaque
 * + tabela de specs (só linhas preenchidas) + downloads (ficha nossa sempre,
 * guia do fabricante quando existir).
 */
export function GasDetail({ gas, onBack }: { gas: RefrigerantGas; onBack: () => void }) {
  const cor = gas.cor || COR_NEUTRA;
  const fg = idealForeground(cor);

  const rows: { label: string; value: string | null }[] = [
    { label: 'Composição', value: gas.composicao },
    { label: 'Tipo', value: gas.tipo },
    { label: 'GWP', value: num(gas.gwp) },
    { label: 'ODP', value: num(gas.odp) },
    { label: 'Ponto de ebulição', value: num(gas.ponto_ebulicao_c) != null ? `${num(gas.ponto_ebulicao_c)} °C` : null },
    { label: 'Glide', value: num(gas.glide_k) != null ? `${num(gas.glide_k)} K` : null },
    { label: 'Classe de segurança', value: gas.classe_seguranca },
    { label: 'Óleo', value: gas.oleo },
    { label: 'Substitui', value: gas.substitui },
    { label: 'Aplicação', value: gas.aplicacao },
    { label: 'Observações', value: gas.observacoes },
  ];
  const visibleRows = rows.filter((r) => r.value && r.value.trim().length > 0);

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
            Fluido Refrigerante
          </h1>
        </div>
      </div>

      {/* Cabeçalho colorido — cor do gás como fundo, código em destaque */}
      <div
        className="flex items-center gap-3 rounded-2xl p-5 shadow-sm"
        style={{ backgroundColor: cor, color: fg }}
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-2 ring-white/40"
          style={{ backgroundColor: cor === COR_NEUTRA ? '#9ca3af' : cor }}
        >
          <Droplet className="h-6 w-6" style={{ color: fg }} />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-extrabold leading-none tracking-tight">{gas.code}</p>
          <p className="mt-1 truncate text-sm font-medium opacity-90">{gas.name}</p>
        </div>
      </div>

      {/* Tabela de specs (só linhas preenchidas) */}
      {visibleRows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
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

      {/* Downloads */}
      <div className="space-y-2">
        {gas.ficha_url && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              baixarPdf(gas.ficha_url!, sanitizarNomeArquivo(`Ficha técnica ${gas.code}.pdf`))
            }
          >
            <Download className="h-4 w-4 shrink-0" />
            Ficha técnica
          </Button>
        )}
        {gas.guia_oficial_url && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              baixarPdf(
                gas.guia_oficial_url!,
                sanitizarNomeArquivo(`Guia do fabricante ${gas.code}.pdf`),
              )
            }
          >
            <Download className="h-4 w-4 shrink-0" />
            Guia do fabricante
          </Button>
        )}
      </div>
    </div>
  );
}
