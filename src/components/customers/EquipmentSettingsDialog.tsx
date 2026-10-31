import { useState } from 'react';
import { Braces, Shapes, Tags } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';
import { EquipmentCategoryManagerDialog } from '@/components/customers/EquipmentCategoryManagerDialog';
import { EquipmentFieldConfigDialog } from '@/components/customers/EquipmentFieldConfigDialog';
import { PartyLabelsManager } from '@/components/customers/PartyLabelsManager';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Section = 'categories' | 'labels' | 'fields';

const SECTIONS = [
  { value: 'categories', label: 'Categorias', description: 'Tipos de equipamento', icon: Shapes },
  { value: 'labels', label: 'Etiquetas', description: 'Cores e classificações', icon: Tags },
  { value: 'fields', label: 'Campos personalizados', description: 'Informações adicionais', icon: Braces },
] as const;

export function EquipmentSettingsDialog({ open, onOpenChange }: Props) {
  const [section, setSection] = useState<Section>('categories');

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Configurações de equipamentos"
      className="sm:max-w-5xl"
    >
      <div className="overflow-hidden rounded-lg border md:grid md:min-h-[34rem] md:grid-cols-[14rem_1fr]">
        <aside className="flex gap-1 overflow-x-auto border-b bg-muted/20 p-2 md:block md:space-y-1 md:border-b-0 md:border-r">
          {SECTIONS.map(({ value, label, description, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSection(value)}
              className={cn(
                'flex min-w-max items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors md:w-full',
                section === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className={cn('hidden text-xs md:block', section === value ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                  {description}
                </span>
              </span>
            </button>
          ))}
        </aside>

        <div className="min-w-0 p-4 sm:p-5">
          {section === 'categories' && <EquipmentCategoryManagerDialog open embedded onOpenChange={() => undefined} />}
          {section === 'labels' && <PartyLabelsManager scope="equipment" />}
          {section === 'fields' && <EquipmentFieldConfigDialog open embedded onOpenChange={() => undefined} />}
        </div>
      </div>
    </ResponsiveModal>
  );
}
