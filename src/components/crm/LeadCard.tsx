import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Calendar, DollarSign, TrendingUp, UserX } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OriginBadge } from '@/components/crm/OriginBadge';
import { type Lead } from '@/hooks/useLeads';
import { format } from 'date-fns';
import { ptBR, enUS, es as esLocale, fr as frLocale, type Locale } from 'date-fns/locale';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';

const DATE_FNS_LOCALES: Record<LocaleCode, Locale> = {
  'pt-br': ptBR,
  en: enUS,
  es: esLocale,
  fr: frLocale,
};

interface LeadCardProps {
  lead: Lead;
  onClick: () => void;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;
  const dfLocale = DATE_FNS_LOCALES[locale];

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);

  const probabilityColor = (prob: number) => {
    if (prob >= 70) return 'text-success';
    if (prob >= 40) return 'text-warning';
    return 'text-destructive';
  };

  // Onda C (multi-responsável): lead.assignees já vem ordenado com o
  // principal primeiro (useLeads). Fallback pro campo legado assigned_profile
  // cobre o caso raro de um lead sem linha em lead_assignees ainda.
  const assignees = lead.assignees?.length
    ? lead.assignees
    : lead.assigned_profile
      ? [{ user_id: lead.assigned_to as string, is_primary: true, ...lead.assigned_profile }]
      : [];

  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 border-border/50 bg-card"
    >
      <CardContent className="p-4">
        {/* Title and Customer */}
        <div className="space-y-1 mb-3">
          <h4 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {lead.title}
          </h4>
          {lead.customers && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.customers.name}</span>
            </div>
          )}
        </div>

        {/* Responsáveis — grupo de avatares empilhados (até 3) + "+N" quando
            passar disso. min-w-0/shrink-0 pra não estourar a largura da
            coluna do kanban (mesma régua da Onda A5). Sem responsável (fila
            compartilhada, correção da Onda C): badge saturado no lugar do
            avatar, pra ninguém confundir com "card esquecido". */}
        <div className="mb-3 min-w-0">
          {assignees.length > 0 ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex -space-x-1.5 shrink-0">
                {assignees.slice(0, 3).map((a) => (
                  <Avatar key={a.user_id} className="h-5 w-5 border-2 border-card">
                    <AvatarImage src={a.avatar_url || undefined} />
                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                      {a.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {assignees.length > 3 && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-muted text-[8px] font-semibold text-muted-foreground">
                    +{assignees.length - 3}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate min-w-0">
                {assignees[0]?.full_name}
                {assignees.length > 1 && ` +${assignees.length - 1}`}
              </span>
            </div>
          ) : (
            <Badge variant="warning" className="gap-1 text-[10px] px-1.5 py-0.5 font-normal">
              <UserX className="h-3 w-3" />
              {t.detail.unassignedLabel}
            </Badge>
          )}
        </div>

        {/* Value */}
        {lead.value && lead.value > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <DollarSign className="h-4 w-4 text-primary" />
            <p className="text-lg font-bold text-primary">{formatCurrency(lead.value)}</p>
          </div>
        )}

        {/* Probability bar */}
        {lead.probability !== null && lead.probability !== undefined && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {t.card.probability}
              </span>
              <span className={`font-medium ${probabilityColor(lead.probability)}`}>
                {lead.probability}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  lead.probability >= 70
                    ? 'bg-success'
                    : lead.probability >= 40
                      ? 'bg-warning'
                      : 'bg-destructive'
                }`}
                style={{ width: `${lead.probability}%` }}
              />
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          <OriginBadge source={lead.source} />
          {lead.expected_close_date && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {format(new Date(lead.expected_close_date), 'dd/MM', { locale: dfLocale })}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
