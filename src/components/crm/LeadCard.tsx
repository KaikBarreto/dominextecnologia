import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, Phone, Mail, User } from 'lucide-react';
import { type Lead, useLeads } from '@/hooks/useLeads';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LeadCardProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
}

export function LeadCard({ lead, onEdit }: LeadCardProps) {
  const { deleteLead } = useLeads();

  const handleDelete = async () => {
    if (confirm('Tem certeza que deseja excluir esta oportunidade?')) {
      await deleteLead.mutateAsync(lead.id);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <Card className="group cursor-pointer transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">{lead.title}</h4>
            {lead.customers && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span className="truncate">{lead.customers.name}</span>
              </div>
            )}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(lead)}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {lead.value && lead.value > 0 && (
          <p className="mt-2 text-lg font-semibold text-primary">
            {formatCurrency(lead.value)}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {lead.probability && (
            <Badge variant="outline" className="text-xs">
              {lead.probability}% prob.
            </Badge>
          )}
          {lead.source && (
            <Badge variant="secondary" className="text-xs">
              {lead.source}
            </Badge>
          )}
        </div>

        {lead.expected_close_date && (
          <p className="mt-2 text-xs text-muted-foreground">
            Previsão: {format(new Date(lead.expected_close_date), "dd 'de' MMM", { locale: ptBR })}
          </p>
        )}

        {lead.customers && (lead.customers.phone || lead.customers.email) && (
          <div className="mt-3 flex gap-2">
            {lead.customers.phone && (
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <a href={`tel:${lead.customers.phone}`}>
                  <Phone className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            {lead.customers.email && (
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <a href={`mailto:${lead.customers.email}`}>
                  <Mail className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
