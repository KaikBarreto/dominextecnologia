import { EquipmentPanel } from '@/components/customers/EquipmentPanel';
import { EquipmentPageChrome } from '@/components/customers/EquipmentPageChrome';

export default function EquipmentPage() {
  return (
    <div className="space-y-6">
      <EquipmentPageChrome />
      <div className="min-w-0"><EquipmentPanel /></div>
    </div>
  );
}
