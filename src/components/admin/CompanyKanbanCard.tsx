import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Edit, Trash2, MessageCircle, User, Gift, Tag } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { getSegment } from '@/utils/companySegments';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
};

interface CompanyKanbanCardProps {
  company: any;
  origins: any[] | undefined;
  /** Mapa salesperson_id → { name, photo_url } (vindo de salespeople_basic). */
  salespersonMap?: Map<string, { name: string; photo_url: string | null }>;
  /**
   * Gate financeiro: quando false, oculta o "Valor Mensal" do card.
   * Vendedores restritos (sem admin_financeiro_totais) não veem R$.
   * Default true para não regredir o painel master / super_admin.
   */
  canSeeTotals?: boolean;
  onEdit: (company: any) => void;
  onDelete: (company: any) => void;
  isDragging?: boolean;
}

export function CompanyKanbanCard({ company, origins, salespersonMap, canSeeTotals = true, onEdit, onDelete, isDragging = false }: CompanyKanbanCardProps) {
  const navigate = useNavigate();
  // Tooltip do badge de valor personalizado: controlado pra abrir por toque
  // no mobile (hover do Radix continua funcionando via onOpenChange).
  const [priceTipOpen, setPriceTipOpen] = useState(false);

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
  // Vendedor resolvido pelo mapa (companies.salesperson_id → salespeople_basic).
  const salesperson = company.salesperson_id ? salespersonMap?.get(company.salesperson_id) ?? null : null;
  const expirationInfo = getExpirationInfo(company.subscription_expires_at);
  const formatCurrency = (v: number | null) => !v ? 'R$ 0,00' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const getInitials = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColors = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500'];
  const avatarColor = avatarColors[company.name.charCodeAt(0) % avatarColors.length];

  // ===== Badge de valor personalizado (clone do EcoSistema) =====
  // Promo ativa: custom_price_months > 0 e ainda restam meses a pagar.
  const promoInfo = (() => {
    if (!company.custom_price_months || company.custom_price_months <= 0) return null;
    const paymentsMade = company.custom_price_payments_made || 0;
    const remaining = company.custom_price_months - paymentsMade;
    if (remaining <= 0) return null;
    return { remaining, total: company.custom_price_months, isExpiringSoon: remaining <= 1 };
  })();
  const hasCustomPrice = company.custom_price != null && Number(company.custom_price) > 0;
  const specialPricing = promoInfo
    ? {
        icon: Gift,
        tooltip: `Período promocional: ${promoInfo.remaining}/${promoInfo.total} meses restantes\nValor: ${formatCurrency(company.subscription_value)}`,
        isExpiring: promoInfo.isExpiringSoon,
      }
    : hasCustomPrice
      ? {
          icon: Tag,
          tooltip: `Valor personalizado: ${formatCurrency(company.subscription_value)}`,
          isExpiring: false,
        }
      : null;

  return (
    <div
      className={cn('bg-card rounded-lg border shadow-sm hover:shadow-md transition-all duration-300 cursor-grab active:cursor-grabbing group w-full relative', isDragging && 'shadow-xl ring-2 ring-primary rotate-2 scale-105')}
      onClick={() => navigate(`/admin/empresas/${company.id}`)}
    >
      {/* Badge de valor personalizado — canto superior direito */}
      {specialPricing && (
        <TooltipProvider delayDuration={150}>
          <Tooltip open={priceTipOpen} onOpenChange={setPriceTipOpen}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full flex items-center justify-center shadow-md z-20 cursor-pointer',
                  specialPricing.isExpiring ? 'bg-amber-500' : 'bg-violet-600',
                )}
                onClick={(e) => { e.stopPropagation(); setPriceTipOpen(o => !o); }}
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <specialPricing.icon className="h-3 w-3 text-white" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              <p className="whitespace-pre-line text-xs">{specialPricing.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

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
        {/* Gate de totais R$: oculto para vendedor restrito (canSeeTotals=false). */}
        {canSeeTotals && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Valor Mensal:</span>
            <span className="text-sm font-semibold text-foreground">{formatCurrency(company.subscription_value)}</span>
          </div>
        )}
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
        {/* Vendedor — espelha o EcoSistema: avatar + nome (truncate). Mobile + desktop. */}
        {salesperson && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Vendedor:</span>
            <div className="flex items-center gap-1.5 max-w-[60%] min-w-0">
              {salesperson.photo_url ? (
                <SalespersonAvatar name={salesperson.name} photoUrl={salesperson.photo_url} size="sm" />
              ) : (
                <User className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="text-xs font-medium text-foreground truncate">{salesperson.name}</span>
            </div>
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
