import { useState } from 'react';
import { Package, Tag } from 'lucide-react';
import { EquipmentPanel } from '@/components/customers/EquipmentPanel';
import { EquipmentCategoryManagerDialog } from '@/components/customers/EquipmentCategoryManagerDialog';
import { cn } from '@/lib/utils';

export default function EquipmentPage() {
  const [activeTab, setActiveTab] = useState('equipamentos');
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Equipamentos</h1>
        <p className="text-muted-foreground">Gerencie equipamentos e categorias</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-52 shrink-0">
          <div className="flex lg:flex-col gap-1">
            {[
              { key: 'equipamentos', label: 'Equipamentos', icon: Package },
              { key: 'categorias', label: 'Categorias', icon: Tag },
            ].map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    if (item.key === 'categorias') {
                      setCategoriesOpen(true);
                    } else {
                      setActiveTab(item.key);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 text-left w-full',
                    isActive && item.key !== 'categorias'
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          <EquipmentPanel />
        </div>
      </div>

      <EquipmentCategoryManagerDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
      />
    </div>
  );
}
