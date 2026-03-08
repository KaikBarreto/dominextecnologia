import { ServiceTypesPanel } from '@/components/service-orders/ServiceTypesPanel';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';

export default function ServicesPage() {
  const { preset, range, setPreset, setRange } = useDateRangeFilter('this_month');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Serviços</h1>
        <p className="text-muted-foreground">Configure os tipos de serviços do sistema</p>
      </div>
      <DateRangeFilter
        value={range}
        preset={preset}
        onPresetChange={setPreset}
        onRangeChange={setRange}
      />
      <ServiceTypesPanel />
    </div>
  );
}
