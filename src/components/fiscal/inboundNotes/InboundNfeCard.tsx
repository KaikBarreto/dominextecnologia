import { Download, Eye, FileDown, FileText, MoreVertical, PackagePlus, ShoppingCart, Stamp, Receipt, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatDate } from '@/lib/format';
import { cnpjMask } from '@/utils/masks';
import type { InboundNfe } from '@/hooks/useInboundNotes';
import { ManifestacaoBadge, ResumoBadge, LancadaBadge } from './inboundBadges';

interface InboundNfeCardProps {
  nota: InboundNfe;
  onManifestar: (nota: InboundNfe) => void;
  onLancarDespesa: (nota: InboundNfe) => void;
  onVerLancamento: (nota: InboundNfe) => void;
  onViewFiscal: (nota: InboundNfe) => void;
  onDownloadXml: (nota: InboundNfe) => void;
  onGenerateDanfe: (nota: InboundNfe) => void;
  onImportStock: (nota: InboundNfe) => void;
  onGeneratePurchase: (nota: InboundNfe) => void;
}

/** Linha de uma NF-e recebida (produto). Mobile-first: card em qualquer largura. */
export function InboundNfeCard({ nota, onManifestar, onLancarDespesa, onVerLancamento, onViewFiscal, onDownloadXml, onGenerateDanfe, onImportStock, onGeneratePurchase }: InboundNfeCardProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.recebidas;

  const cnpj = nota.emitente_cnpj ? cnpjMask(nota.emitente_cnpj) : null;
  // Nota de devolução (finNFe=4): lançar despesa aqui criaria uma dívida que
  // não existe (é a mercadoria voltando, não uma compra nova).
  const isDevolucao = nota.fin_nfe === 4;
  const canManifest = nota.situacao_sefaz !== 'cancelada' && nota.situacao_sefaz !== 'denegada';
  const hasInventoryEntry = !!nota.inventory_imported_at;

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center shrink-0">
        <FileText className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate leading-tight">
              {nota.emitente_nome || t.columns.party}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
              {nota.numero != null && <span className="font-medium">Nº {nota.numero}</span>}
              {cnpj && <span>{cnpj}</span>}
              {nota.data_emissao && <span>{formatDate(nota.data_emissao, locale, timezone)}</span>}
            </div>
          </div>
          {nota.valor != null && (
            <p className="font-bold text-sm whitespace-nowrap shrink-0">
              {formatMoney(nota.valor, currency, locale)}
            </p>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ManifestacaoBadge manifestacao={nota.manifestacao} pendente={nota.manifestacao_pendente} />
          {nota.resumo && <ResumoBadge />}
          {nota.financial_transaction_id && <LancadaBadge />}
          {hasInventoryEntry && (
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              {nota.inventory_import_source === 'purchase' ? 'Compra e entrada registradas' : 'Entrada registrada'}
            </span>
          )}
          {isDevolucao && (
            <span className="text-xs text-muted-foreground">{t.devolucaoHint}</span>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 -mr-2 text-muted-foreground shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onViewFiscal(nota)}>
            <Eye className="mr-2 h-4 w-4" />
            Ver dados fiscais
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDownloadXml(nota)}>
            <Download className="mr-2 h-4 w-4" />
            Baixar XML
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onGenerateDanfe(nota)}>
            <FileDown className="mr-2 h-4 w-4" />
            Gerar DANFE
          </DropdownMenuItem>
          {!isDevolucao && (
            <>
              <DropdownMenuItem disabled={hasInventoryEntry} onClick={() => onImportStock(nota)}>
                <PackagePlus className="mr-2 h-4 w-4" />
                {hasInventoryEntry ? 'Entrada já registrada' : 'Entrada avulsa no estoque'}
              </DropdownMenuItem>
              {!nota.financial_transaction_id && !hasInventoryEntry && (
                <DropdownMenuItem onClick={() => onGeneratePurchase(nota)}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Gerar compra + entrada
                </DropdownMenuItem>
              )}
            </>
          )}
          {canManifest && (
            <DropdownMenuItem onClick={() => onManifestar(nota)}>
              <Stamp className="mr-2 h-4 w-4" />
              {t.actions.manifestar}
            </DropdownMenuItem>
          )}
          {nota.financial_transaction_id ? (
            <DropdownMenuItem onClick={() => onVerLancamento(nota)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {t.verLancamento}
            </DropdownMenuItem>
          ) : (
            !isDevolucao && (
              <DropdownMenuItem onClick={() => onLancarDespesa(nota)}>
                <Receipt className="mr-2 h-4 w-4" />
                {t.actions.lancarDespesa}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
