import { Badge } from '@/components/ui/badge';
import { Clock, AlertCircle, XCircle, ChevronRight, Phone } from 'lucide-react';
import { format, addDays, isBefore, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { phoneMask } from '@/utils/masks';

interface AdminExpiringAlertProps {
  companies: any[];
}

export function AdminExpiringAlert({ companies }: AdminExpiringAlertProps) {
  const navigate = useNavigate();
  const today = new Date();
  const sevenDaysLater = addDays(today, 7);
  const sevenDaysAgo = addDays(today, -7);

  const expiringToday = companies.filter((c: any) => {
    if (!c.subscription_expires_at) return false;
    return format(parseISO(c.subscription_expires_at), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
  });

  const expiringNext7Days = companies.filter((c: any) => {
    if (!c.subscription_expires_at) return false;
    const exp = parseISO(c.subscription_expires_at);
    return isAfter(exp, today) && isBefore(exp, sevenDaysLater);
  });

  const expiredLast7Days = companies.filter((c: any) => {
    if (!c.subscription_expires_at) return false;
    const exp = parseISO(c.subscription_expires_at);
    return isBefore(exp, today) && isAfter(exp, sevenDaysAgo) && c.subscription_status !== 'active';
  });

  if (!expiringToday.length && !expiringNext7Days.length && !expiredLast7Days.length) return null;

  // Régua do CEO: card de estado é BRANCO; a cor saturada fica só no ícone e no
  // título em negrito. Nada de card tingido a 10%, nada de círculo dessaturado
  // atrás do ícone. O contador é badge saturado com texto branco.
  const sections = [
    { id: 'today', title: 'Vencem Hoje', companies: expiringToday, icon: AlertCircle, iconColor: 'text-destructive', badgeVariant: 'destructive' as const },
    { id: 'next7', title: 'Próximos 7 Dias', companies: expiringNext7Days, icon: Clock, iconColor: 'text-warning', badgeVariant: 'warning' as const },
    { id: 'expired', title: 'Vencidas', companies: expiredLast7Days, icon: XCircle, iconColor: 'text-muted-foreground', badgeVariant: 'muted' as const },
  ].filter((s) => s.companies.length > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {sections.map((section) => (
        <div key={section.id} className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-3">
            <section.icon className={`h-4 w-4 shrink-0 ${section.iconColor}`} />
            <h3 className={`font-bold text-sm ${section.iconColor}`}>{section.title}</h3>
            <Badge variant={section.badgeVariant} className="ml-auto text-xs">
              {section.companies.length}
            </Badge>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {section.companies.map((company: any) => (
              <div
                key={company.id}
                className="p-3 rounded-lg bg-background/50 border cursor-pointer hover:scale-[1.02] transition-transform"
                onClick={() => navigate(`/admin/empresas/${company.id}`)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{company.name}</p>
                    {company.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Phone className="h-3 w-3" />
                        {phoneMask(company.phone)}
                      </span>
                    )}
                    {section.id !== 'today' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {section.id === 'expired' ? 'Venceu em ' : 'Vence em '}
                        {format(parseISO(company.subscription_expires_at), 'dd/MM', { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
