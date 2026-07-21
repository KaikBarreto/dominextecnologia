import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Megaphone, ArrowRight, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS, es, fr } from 'date-fns/locale';
import type { ServiceOrder, OsStatus } from '@/types/database';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Mapeia status para cor saturada (fundo colorido + texto branco — regra CEO)
const STATUS_SATURATED: Record<OsStatus, string> = {
  pendente: 'bg-yellow-500 text-white',
  agendada: 'bg-violet-600 text-white',
  a_caminho: 'bg-indigo-600 text-white',
  em_andamento: 'bg-blue-600 text-white',
  pausada: 'bg-amber-600 text-white',
  concluida: 'bg-emerald-600 text-white',
  cancelada: 'bg-red-600 text-white',
};

// Labels PT-BR de status (usados aqui como base — o locale do badge acompanha
// o locale do app via i18n do dashboard.statusSummary.status)
const PT_BR_STATUS_LABELS: Record<OsStatus, string> = {
  pendente: 'Pendente',
  agendada: 'Agendada',
  a_caminho: 'A Caminho',
  em_andamento: 'Em Andamento',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const DATE_FNS_LOCALE_MAP = {
  'pt-br': ptBR,
  en: enUS,
  es: es,
  fr: fr,
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DashboardPortalCallsProps {
  items: ServiceOrder[];
  isLoading: boolean;
}

export function DashboardPortalCalls({ items, isLoading }: DashboardPortalCallsProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.dashboard;
  const tc = t.portalCalls;
  const ts = t.statusSummary.status;

  const dateFnsLocale = DATE_FNS_LOCALE_MAP[locale as keyof typeof DATE_FNS_LOCALE_MAP] ?? ptBR;

  function getStatusLabel(status: OsStatus): string {
    // ts é Record de chaves de status em string — acessa dinamicamente
    return (ts as Record<string, string>)[status] ?? PT_BR_STATUS_LABELS[status] ?? status;
  }

  function getRelativeTime(createdAt: string): string {
    try {
      const distance = formatDistanceToNow(new Date(createdAt), {
        addSuffix: false,
        locale: dateFnsLocale,
      });
      return tc.timeAgo.replace('{time}', distance);
    } catch {
      return '';
    }
  }

  function getCustomerName(os: ServiceOrder): string {
    return os.customer?.name ?? tc.customerFallback;
  }

  function getDescription(os: ServiceOrder): string {
    return os.description?.trim() || tc.noDescription;
  }

  const navigateToOS = () => navigate('/ordens-servico');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }}
    >
      <Card className="rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2 leading-tight">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
              {tc.title}
            </CardTitle>
            {items.length > 0 && (
              <Badge className="bg-primary text-primary-foreground text-xs">
                {items.length}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : items.length > 0 ? (
            isMobile ? (
              /* Mobile: usa MobileListItem */
              <div className="rounded-xl border bg-card overflow-hidden -mx-2">
                {items.slice(0, 5).map((os) => {
                  const status = os.status as OsStatus;
                  const statusClass = STATUS_SATURATED[status] ?? 'bg-slate-600 text-white';
                  return (
                    <MobileListItem
                      key={os.id}
                      onClick={navigateToOS}
                      leading={
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <ClipboardList className="h-5 w-5" />
                        </div>
                      }
                      title={
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                            #{String(os.order_number).padStart(6, '0')}
                          </span>
                          <span className="truncate">{getCustomerName(os)}</span>
                        </div>
                      }
                      subtitle={
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${statusClass}`}
                          >
                            {getStatusLabel(status)}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {getDescription(os)}
                          </span>
                        </div>
                      }
                      trailing={
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {getRelativeTime(os.created_at)}
                        </span>
                      }
                    />
                  );
                })}
                {items.length > 5 && (
                  <button
                    onClick={navigateToOS}
                    className="w-full text-center text-xs text-primary font-medium min-h-11 py-2.5 border-t hover:bg-muted/40 active:bg-muted/60 flex items-center justify-center gap-1"
                  >
                    {tc.viewAll} <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : (
              /* Desktop: lista de cards */
              <div className="space-y-2">
                {items.slice(0, 5).map((os) => {
                  const status = os.status as OsStatus;
                  const statusClass = STATUS_SATURATED[status] ?? 'bg-slate-600 text-white';
                  return (
                    <div
                      key={os.id}
                      onClick={navigateToOS}
                      className="rounded-lg border border-border p-3 space-y-1.5 cursor-pointer hover:border-primary/30 active:scale-[0.98] transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          #{String(os.order_number).padStart(6, '0')}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}
                        >
                          {getStatusLabel(status)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground font-medium truncate">
                        {getCustomerName(os)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {getDescription(os)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getRelativeTime(os.created_at)}
                      </p>
                    </div>
                  );
                })}
                {items.length > 5 && (
                  <button
                    onClick={navigateToOS}
                    className="w-full text-center text-xs text-primary font-medium min-h-11 py-2 hover:underline flex items-center justify-center gap-1"
                  >
                    {tc.viewAll} <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          ) : (
            <EmptyState
              size="compact"
              icon={<Megaphone className="h-8 w-8" />}
              title={tc.empty}
              description={tc.emptySubtitle}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
