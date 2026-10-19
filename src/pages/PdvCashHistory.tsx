import { History } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

/**
 * HISTÓRICO DE CAIXA — PLACEHOLDER da Onda 1 do módulo PDV e Loja.
 *
 * Só a casca: header + estado vazio. Serve pra provar menu → rota → gate de
 * módulo (`ModuleRoute moduleKey="pdv"`) → gate de permissão. O conteúdo real
 * vem no despacho seguinte; as abas desta tela já estão nomeadas nos 4 idiomas
 * em `src/lib/i18n/messages/app/pdv.ts` (`cashHistory.tabs`).
 */
export default function PdvCashHistory() {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pdv;

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24 space-y-4')}>
      <PageHeader title={t.cashHistory.title} subtitle={t.cashHistory.subtitle} icon={History} />
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<History className="h-12 w-12" />}
            title={t.comingSoon.title}
            description={t.comingSoon.description}
          />
        </CardContent>
      </Card>
    </div>
  );
}
