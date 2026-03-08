import { ServiceTypesPanel } from '@/components/service-orders/ServiceTypesPanel';

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Serviços</h1>
        <p className="text-muted-foreground">Configure os tipos de serviços do sistema</p>
      </div>
      <ServiceTypesPanel />
    </div>
  );
}
