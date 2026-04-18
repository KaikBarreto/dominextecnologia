import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Edit, Trash2, User as UserIcon, Gift } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
);

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
};

interface CompanyKanbanCardProps {
  company: any;
  origins: any[] | undefined;
  salespeople?: any[];
  onEdit: (company: any) => void;
  onDelete: (company: any) => void;
  isDragging?: boolean;
}

export function CompanyKanbanCard({ company, origins, salespeople, onEdit, onDelete, isDragging = false }: CompanyKanbanCardProps) {
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
  const salesperson = salespeople?.find(s => s.id === company.salesperson_id) || null;
  const expirationInfo = getExpirationInfo(company.subscription_expires_at);
  const formatCurrency = (v: number | null) => !v ? 'R$ 0,00' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const getInitials = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColors = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500'];
  const avatarColor = avatarColors[company.name.charCodeAt(0) % avatarColors.length];

  // Indicadores de promo / preço custom
  const hasCustomPrice = company.custom_price != null && Number(company.custom_price) > 0;
  const isPromoActive = hasCustomPrice && (
    company.custom_price_permanent ||
    (company.custom_price_months && (company.custom_price_payments_made || 0) < company.custom_price_months)
  );

  const valueShown = isPromoActive ? Number(company.custom_price) : (company.subscription_value || 0);
  const cycleLabel = company.billing_cycle === 'yearly' ? '/ano' : '/mês';

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'bg-card rounded-lg border shadow-sm hover:shadow-md transition-all duration-300 cursor-grab active:cursor-grabbing group w-full relative',
          isDragging && 'shadow-xl ring-2 ring-primary rotate-2 scale-105'
        )}
        onClick={() => navigate(`/admin/empresas/${company.id}`)}
      >
        {/* Indicador promo no canto sup-direito */}
        {isPromoActive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute top-2 right-2 z-10 flex items-center justify-center h-6 w-6 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-600">
                <Gift className="h-3 w-3" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs">
                Promo ativa: {formatCurrency(Number(company.custom_price))}
                {company.custom_price_permanent
                  ? ' (permanente)'
                  : ` (${company.custom_price_payments_made || 0}/${company.custom_price_months} pagamentos)`}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        <div className="p-2.5 sm:p-3 pb-1.5 sm:pb-2">
          <div className="flex items-start gap-2.5 sm:gap-3">
            <Avatar className={cn('h-9 w-9 sm:h-10 sm:w-10 shrink-0', avatarColor)}>
              <AvatarFallback className="text-white text-[11px] sm:text-xs font-medium bg-transparent">{getInitials(company.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 pr-6">
              <h4 className="font-bold text-sm text-foreground truncate">{company.name}</h4>
              <p className="text-primary text-sm font-medium truncate">{PLAN_LABELS[company.subscription_plan] || company.subscription_plan || '—'}</p>
            </div>
          </div>
        </div>

        <div className="px-2.5 sm:px-3 pb-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Valor:</span>
            <div className="flex items-center gap-1.5">
              {isPromoActive && Number(company.subscription_value || 0) > 0 && (
                <span className="text-[11px] line-through text-muted-foreground/60">
                  {formatCurrency(company.subscription_value)}
                </span>
              )}
              <span className={cn('text-sm font-semibold', isPromoActive ? 'text-amber-600' : 'text-foreground')}>
                {formatCurrency(valueShown)}<span className="text-[10px] text-muted-foreground ml-0.5">{cycleLabel}</span>
              </span>
            </div>
          </div>
          {originData && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Origem:</span>
              <Badge className="text-xs px-2 py-0.5 h-5 font-normal text-white border-0 max-w-[55%]" style={{ backgroundColor: originData.color || '#6B7280' }}>
                <span className="truncate">{originData.name}</span>
              </Badge>
            </div>
          )}
          {salesperson && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Vendedor:</span>
              <Badge variant="outline" className="text-xs px-2 py-0.5 h-5 font-normal max-w-[55%] gap-1 border-primary/40 text-primary">
                <UserIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{salesperson.name}</span>
              </Badge>
            </div>
          )}
        </div>

        <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 flex items-center justify-between border-t pt-2 mt-1">
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {company.phone && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:bg-primary hover:text-white" onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/55${company.phone.replace(/\D/g, '')}`, '_blank'); }}>
                <WhatsAppIcon className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(company); }}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-white" onClick={(e) => { e.stopPropagation(); onDelete(company); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn('text-xs font-medium', expirationInfo.color)}>{expirationInfo.text}</span>
            <span className={cn('h-2 w-2 rounded-full animate-pulse shrink-0', expirationInfo.dotColor)} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
