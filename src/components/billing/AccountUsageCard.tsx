import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useNfseQuota } from '@/hooks/useNfseQuota';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Users, FileText, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Uso da conta" — barras de consumo (Usuários + Notas fiscais do mês).
 * Vive como 2ª coluna do grid topo da tela de Assinatura.
 *
 * Hooks usados:
 *   - useCompanyModules()  → maxUsers, extraUsers, currentUserCount, hasModule
 *   - useNfseQuota()       → used, limit, tier, unlimited   (fonte: RPC nfse_can_emit)
 *   - useAuth()            → profile.company_id  (para alimentar useNfseQuota)
 *
 * O módulo de NFS-e é gateado por hasModule('nfe'), igual ao NfseTierCard.
 */
export function AccountUsageCard({ className }: { className?: string }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.billing.accountUsage;

  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const {
    maxUsers,
    extraUsers,
    currentUserCount,
    hasModule,
    isLoading,
  } = useCompanyModules();

  const hasNfeModule = hasModule('nfe');

  const {
    used: nfseUsed,
    limit: nfseLimit,
    tier: nfseTier,
    unlimited: nfseUnlimited,
    isLoading: nfseLoading,
  } = useNfseQuota(hasNfeModule ? companyId : null);

  // ── Usuários ──────────────────────────────────────────────────────────────
  const usersPct = maxUsers > 0 ? Math.min(100, Math.round((currentUserCount / maxUsers) * 100)) : 0;
  const usersNearLimit = maxUsers > 0 && currentUserCount / maxUsers >= 0.8;

  const usersSubLabel = (() => {
    if (extraUsers > 0) {
      const base = maxUsers - extraUsers;
      return extraUsers === 1
        ? t.usersIncluded.replace('{base}', String(base)).replace('{extra}', String(extraUsers))
        : t.usersIncludedPlural.replace('{base}', String(base)).replace('{extra}', String(extraUsers));
    }
    return maxUsers === 1
      ? t.usersPlanLimit.replace('{max}', String(maxUsers))
      : t.usersPlanLimitPlural.replace('{max}', String(maxUsers));
  })();

  // ── Notas fiscais ─────────────────────────────────────────────────────────
  const nfePct =
    hasNfeModule && nfseLimit && nfseLimit > 0
      ? Math.min(100, Math.round((nfseUsed / nfseLimit) * 100))
      : 0;
  const nfeNearLimit = hasNfeModule && nfseLimit ? nfseUsed / nfseLimit >= 0.8 : false;

  const nfseSubLabel = (() => {
    if (nfseUnlimited) return t.nfseLevelLimit.replace('{level}', String(nfseTier)).replace('{limit}', '∞');
    if (nfseLimit != null) {
      return t.nfseLevelLimit
        .replace('{level}', String(nfseTier))
        .replace('{limit}', nfseLimit.toLocaleString('pt-BR'));
    }
    return t.nfsePlanLimit.replace('{limit}', '—');
  })();

  const loading = isLoading || (hasNfeModule && nfseLoading);

  return (
    <Card className={cn('flex flex-col border-0 shadow-none bg-transparent lg:border-l lg:border-border/40 lg:rounded-none lg:pl-6', className)}>
      <CardHeader className="p-4 md:p-6 pb-3 md:pb-4">
        <CardTitle className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary shrink-0" />
          {t.title}
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          {t.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 md:p-6 pt-0 flex-1">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded-lg" />
            <div className="h-10 bg-muted rounded-lg" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Usuários */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{t.users}</span>
                </div>
                <span className="text-sm tabular-nums shrink-0">
                  <span className={cn('font-semibold', usersNearLimit && 'text-orange-600')}>
                    {currentUserCount}
                  </span>
                  <span className="text-muted-foreground"> / {maxUsers}</span>
                </span>
              </div>
              <Progress
                value={usersPct}
                className={cn('h-2', usersNearLimit && '[&>div]:bg-orange-500')}
              />
              <p className="text-xs text-muted-foreground">{usersSubLabel}</p>
            </div>

            {/* Notas fiscais — só quando a empresa tem o módulo nfe */}
            {hasNfeModule && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{t.nfseThisMonth}</span>
                  </div>
                  <span className="text-sm tabular-nums shrink-0">
                    {nfseUnlimited ? (
                      <span className="font-semibold text-emerald-600">
                        {t.nfseUnlimitedLabel.replace('{used}', String(nfseUsed))}
                      </span>
                    ) : (
                      <>
                        <span className={cn('font-semibold', nfeNearLimit && 'text-orange-600')}>
                          {nfseUsed}
                        </span>
                        <span className="text-muted-foreground"> / {nfseLimit ?? '—'}</span>
                      </>
                    )}
                  </span>
                </div>

                {nfseUnlimited ? (
                  <p className="text-xs text-muted-foreground">{nfseSubLabel}</p>
                ) : (
                  <>
                    <Progress
                      value={nfePct}
                      className={cn('h-2', nfeNearLimit && '[&>div]:bg-orange-500')}
                    />
                    <p className="text-xs text-muted-foreground">{nfseSubLabel}</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
