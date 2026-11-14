import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PdvReportsWorkspace } from '@/components/pdv/reports/PdvReportsWorkspace';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

export default function PdvReports() {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pdv;

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24 space-y-4')}>
      <PageHeader title={t.reports.title} subtitle={t.reports.subtitle} icon={BarChart3} />
      <PdvReportsWorkspace />
    </div>
  );
}
