import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Calendar, DollarSign, TrendingUp } from 'lucide-react';
import { type Lead } from '@/hooks/useLeads';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LeadCardProps {
  lead: Lead;
  onClick: () => void;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const probabilityColor = (prob: number) => {
    if (prob >= 70) return 'text-success';
    if (prob >= 40) return 'text-warning';
    return 'text-destructive';
  };

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

        {/* Value */}
        {lead.value && lead.value > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <DollarSign className="h-4 w-4 text-primary" />
            <p className="text-lg font-bold text-primary">
              {formatCurrency(lead.value)}
            </p>
          </div>
        )}

        {/* Probability bar */}
        {lead.probability !== null && lead.probability !== undefined && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Probabilidade
              </span>
              <span className={`font-medium ${probabilityColor(lead.probability)}`}>
                {lead.probability}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  lead.probability >= 70 ? 'bg-success' :
                  lead.probability >= 40 ? 'bg-warning' : 'bg-destructive'
                }`}
                style={{ width: `${lead.probability}%` }}
              />
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          {lead.source && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {lead.source}
            </Badge>
          )}
          {lead.expected_close_date && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {format(new Date(lead.expected_close_date), "dd/MM", { locale: ptBR })}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
