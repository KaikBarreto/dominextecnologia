import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Megaphone, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS, es, fr } from 'date-fns/locale';
import { buildPortalCallsPath, type PortalCall } from '@/lib/portalCalls';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  items: PortalCall[];
  isLoading: boolean;
}

export function DashboardPortalCalls({ items, isLoading }: DashboardPortalCallsProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.dashboard;
  const tc = t.portalCalls;

  const dateFnsLocale = DATE_FNS_LOCALE_MAP[locale as keyof typeof DATE_FNS_LOCALE_MAP] ?? ptBR;

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

  function getCustomerName(call: PortalCall): string {
    return call.customer?.name ?? tc.customerFallback;
  }

  function getDescription(call: PortalCall): string {
    return call.description?.trim() || tc.noDescription;
  }

  const navigateToCalls = () => navigate(buildPortalCallsPath());
  const navigateToCall = (id: string) => navigate(buildPortalCallsPath(id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }}
    >
      <Card className="rounded-2xl border-0 bg-transparent shadow-none">
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
              <div className="rounded-xl bg-muted/25 overflow-hidden -mx-2">
                {items.slice(0, 5).map((call) => {
                  return (
                    <MobileListItem
                      key={call.id}
                      onClick={() => navigateToCall(call.id)}
                      leading={
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Megaphone className="h-5 w-5" />
                        </div>
                      }
                      title={
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                            {tc.protocol.replace('{number}', String(call.protocol_number ?? '—'))}
                          </span>
                          <span className="truncate">{getCustomerName(call)}</span>
                        </div>
                      }
                      subtitle={
                        <div className="flex items-center gap-2">
                          <span className="inline-flex shrink-0 items-center rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
                            {tc.awaitingReview}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {getDescription(call)}
                          </span>
                        </div>
                      }
                      trailing={
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {getRelativeTime(call.created_at)}
                        </span>
                      }
                    />
                  );
                })}
                {items.length > 5 && (
                  <button
                    onClick={navigateToCalls}
                    className="w-full text-center text-xs text-primary font-medium min-h-11 py-2.5 hover:bg-muted/40 active:bg-muted/60 flex items-center justify-center gap-1"
                  >
                    {tc.viewAll} <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : (
              /* Desktop: lista de cards */
              <div className="space-y-2">
                {items.slice(0, 5).map((call) => {
                  return (
                    <button
                      type="button"
                      key={call.id}
                      onClick={() => navigateToCall(call.id)}
                      className="w-full rounded-xl bg-muted/30 p-3 space-y-1.5 cursor-pointer hover:bg-muted/50 active:scale-[0.98] transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {tc.protocol.replace('{number}', String(call.protocol_number ?? '—'))}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
                          {tc.awaitingReview}
                        </span>
                      </div>
                      <p className="truncate text-left text-sm font-medium text-foreground">
                        {getCustomerName(call)}
                      </p>
                      <p className="truncate text-left text-xs text-muted-foreground">
                        {getDescription(call)}
                      </p>
                      <p className="text-left text-xs text-muted-foreground">
                        {getRelativeTime(call.created_at)}
                      </p>
                    </button>
                  );
                })}
                {items.length > 5 && (
                  <button
                    onClick={navigateToCalls}
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
