import { PricingConfigForm } from '@/components/pricing/PricingConfigForm';
import { BDIPreviewCard } from '@/components/pricing/BDIPreviewCard';

export function PricingTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Precificação</h2>
        <p className="text-sm text-muted-foreground">
          Taxas padrão aplicadas em todos os orçamentos via método BDI
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <PricingConfigForm />
        </div>
        <div className="lg:col-span-7">
          <BDIPreviewCard />
        </div>
      </div>
    </div>
  );
}
