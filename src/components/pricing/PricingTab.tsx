import { PricingConfigForm } from '@/components/pricing/PricingConfigForm';
import { BDIPreviewCard } from '@/components/pricing/BDIPreviewCard';

export function PricingTab() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PricingConfigForm />
        <BDIPreviewCard />
      </div>
    </div>
  );
}
