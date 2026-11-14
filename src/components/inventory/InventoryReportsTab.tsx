import { useState } from 'react';
import { BarChart3, ShoppingCart } from 'lucide-react';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { InventoryAbcReport } from '@/components/inventory/InventoryAbcReport';
import { MaterialPurchaseReportTab } from '@/components/inventory/MaterialPurchaseReportTab';

type InventoryReport = 'purchases' | 'abc';

export function InventoryReportsTab() {
  const [activeReport, setActiveReport] = useState<InventoryReport>('purchases');

  return (
    <div className="space-y-4">
      <MobilePillTabs
        variant="underline"
        level="section"
        activeTab={activeReport}
        onTabChange={(value) => setActiveReport(value as InventoryReport)}
        tabs={[
          { value: 'purchases', label: 'Compras e vendas', icon: <ShoppingCart className="h-4 w-4" /> },
          { value: 'abc', label: 'Curva ABC', icon: <BarChart3 className="h-4 w-4" /> },
        ]}
      />
      {activeReport === 'purchases' ? <MaterialPurchaseReportTab /> : <InventoryAbcReport />}
    </div>
  );
}
