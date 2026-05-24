import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Edit, Trash2, MessageCircle } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { getSegment } from '@/utils/companySegments';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
};

interface CompanyKanbanCardProps {
  company: any;
  origins: any[] | undefined;
  onEdit: (company: any) => void;
  onDelete: (company: any) => void;
  isDragging?: boolean;
}

export function CompanyKanbanCard({ company, origins, onEdit, onDelete, isDragging = false }: CompanyKanbanCardProps) {
  const navigate = useNavigate();

  const getExpirationInfo = (expirationDate: string | null) => {
    if (!expirationDate) return { text: 'Sem vencimento', color: 'text-muted-foreground', dotColor: 'bg-muted' };
    const expDate = parseISO(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = differenceInDays(expDate, today);
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d atraso`, color: 'text-destructive', dotColor: 'bg-destructive' };
    if (diffDays === 0) return { text: 'Hoje', color: 'text-amber-600', dotColor: 'bg-amber-500' };
    if (diffDays <= 7) return { text: `${diffDays}d`, color: 'text-amber-600', dotColor: 'bg-amber-500' };
    return { text: format(expDate, 'dd/MM/yyyy', { locale: ptBR }), color: 'text-muted-foreground', dotColor: 'bg-emerald-500' };
  };

  const originData = origins?.find(o => o.name === company.origin) || null;
  const segmentData = getSegment(company.segment);
  const expirationInfo = getExpirationInfo(company.subscription_expires_at);
  const formatCurrency = (v: number | null) => !v ? 'R$ 0,00' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const getInitials = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColors = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500'];
  const avatarColor = avatarColors[company.name.charCodeAt(0) % avatarColors.length];

  return (
    <div
      className={cn('bg-card rounded-lg border shadow-sm hover:shadow-md transition-all duration-300 cursor-grab active:cursor-grabbing group w-full relative', isDragging && 'shadow-xl ring-2 ring-primary rotate-2 scale-105')}
      onClick={() => navigate(`/admin/empresas/${company.id}`)}
    >
      <div className="p-2.5 sm:p-3 pb-1.5 sm:pb-2">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <Avatar className={cn('h-9 w-9 sm:h-10 sm:w-10 shrink-0', avatarColor)}>
            <AvatarFallback className="text-white text-[11px] sm:text-xs font-medium bg-transparent">{getInitials(company.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm text-foreground truncate">{company.name}</h4>
            <p className="text-primary text-sm font-medium truncate">{PLAN_LABELS[company.subscription_plan] || company.subscription_plan || '—'}</p>
          </div>
        </div>
      </div>

      <div className="px-2.5 sm:px-3 pb-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Valor Mensal:</span>
          <span className="text-sm font-semibold text-foreground">{formatCurrency(company.subscription_value)}</span>
        </div>
        {originData && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Origem:</span>
            <Badge className="text-xs px-2 py-0.5 h-5 font-normal text-white border-0 max-w-[55%]" style={{ backgroundColor: originData.color || '#6B7280' }}>
              <span className="truncate">{originData.name}</span>
            </Badge>
          </div>
        )}
        {segmentData && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Segmento:</span>
            <Badge className="text-xs px-2 py-0.5 h-5 font-normal text-white border-0 max-w-[60%] gap-1" style={{ backgroundColor: segmentData.color }}>
              <segmentData.icon className="h-3 w-3 shrink-0" />
              <span className="truncate">{segmentData.label}</span>
            </Badge>
          </div>
        )}
      </div>

      <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 flex items-center justify-between border-t pt-2 mt-1">
        <div onClick={(e) => e.stopPropagation()}>
          <RowActionsMenu
            triggerClassName="h-7 w-7"
            actions={[
              {
                label: 'WhatsApp',
                icon: MessageCircle,
                onClick: () => window.open(`https://wa.me/55${company.phone.replace(/\D/g, '')}`, '_blank'),
                hidden: !company.phone,
              },
              {
                label: 'Editar empresa',
                icon: Edit,
                variant: 'edit',
                onClick: () => onEdit(company),
              },
              {
                label: 'Excluir empresa',
                icon: Trash2,
                variant: 'delete',
                onClick: () => onDelete(company),
              },
            ]}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('text-xs font-medium', expirationInfo.color)}>{expirationInfo.text}</span>
          <span className={cn('h-2 w-2 rounded-full animate-pulse shrink-0', expirationInfo.dotColor)} />
        </div>
      </div>
    </div>
  );
}
