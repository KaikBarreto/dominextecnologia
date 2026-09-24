import { FileText, MoreVertical, Receipt, ExternalLink } from 'lucide-react';
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
import type { InboundNfse } from '@/hooks/useInboundNotes';
import { ResumoBadge, LancadaBadge, SituacaoBadge } from './inboundBadges';

interface InboundNfseCardProps {
  nota: InboundNfse;
  onLancarDespesa: (nota: InboundNfse) => void;
  onVerLancamento: (nota: InboundNfse) => void;
}

/** Linha de uma NFS-e recebida (serviço tomado). Sem manifestação — NFS-e não tem. */
export function InboundNfseCard({ nota, onLancarDespesa, onVerLancamento }: InboundNfseCardProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.recebidas;

  const cnpj = nota.prestador_documento ? cnpjMask(nota.prestador_documento) : null;
  // Serviço tomado sempre pode virar despesa (não existe "devolução" de serviço).
  const canLancar = nota.situacao !== 'cancelada';
  // ISS retido pelo TOMADOR muda quanto o cliente efetivamente paga — mostra o
  // líquido quando disponível, senão o bruto do serviço.
  const displayValue = nota.valor_liquido ?? nota.valor_servico;

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center shrink-0">
        <FileText className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate leading-tight">
              {nota.prestador_nome || t.columns.party}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
              {nota.numero && <span className="font-medium">Nº {nota.numero}</span>}
              {cnpj && <span>{cnpj}</span>}
              {nota.data_emissao && <span>{formatDate(nota.data_emissao, locale, timezone)}</span>}
            </div>
            {nota.discriminacao && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate">{nota.discriminacao}</p>
            )}
          </div>
          {displayValue != null && (
            <p className="font-bold text-sm whitespace-nowrap shrink-0">
              {formatMoney(displayValue, currency, locale)}
            </p>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <SituacaoBadge situacao={nota.situacao} />
          {nota.resumo && <ResumoBadge />}
          {nota.financial_transaction_id && <LancadaBadge />}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 -mr-2 text-muted-foreground shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {nota.financial_transaction_id ? (
            <DropdownMenuItem onClick={() => onVerLancamento(nota)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {t.verLancamento}
            </DropdownMenuItem>
          ) : (
            canLancar && (
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
