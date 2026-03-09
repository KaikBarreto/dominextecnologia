import { useState } from 'react';
import { ServiceTypesPanel } from '@/components/service-orders/ServiceTypesPanel';
import { ServiceCostsTab } from '@/components/service-orders/ServiceCostsTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ServicesPage() {
  const [tab, setTab] = useState<'types' | 'costs'>('types');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Serviços</h1>
        <p className="text-muted-foreground">Configure os tipos de serviços e seus custos</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="types" className="flex-1 sm:flex-none">Tipos</TabsTrigger>
          <TabsTrigger value="costs" className="flex-1 sm:flex-none">Custos</TabsTrigger>
        </TabsList>
        <TabsContent value="types" className="mt-4">
          <ServiceTypesPanel />
        </TabsContent>
        <TabsContent value="costs" className="mt-4">
          <ServiceCostsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
