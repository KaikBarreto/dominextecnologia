import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/currency';

interface ModuleGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleName: string;
  moduleDescription?: string;
  modulePrice?: number;
}

export function ModuleGateModal({
  open,
  onOpenChange,
  moduleName,
  moduleDescription,
  modulePrice,
}: ModuleGateModalProps) {
  const navigate = useNavigate();

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Módulo não disponível">
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-primary" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            {moduleName}
          </h3>
          {moduleDescription && (
            <p className="text-sm text-muted-foreground max-w-sm">{moduleDescription}</p>
          )}
        </div>

        {modulePrice != null && modulePrice > 0 && (
          <div className="bg-muted rounded-lg px-4 py-2">
            <span className="text-sm text-muted-foreground">A partir de </span>
            <span className="text-lg font-bold text-foreground">
              {formatCurrency(modulePrice)}
            </span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Seu plano atual não inclui este recurso. Faça upgrade para desbloqueá-lo.
        </p>

        <div className="flex gap-3 w-full">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={() => {
              onOpenChange(false);
              navigate('/assinatura');
            }}
          >
            Contratar Agora
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}

// Module metadata for easy lookup
export const MODULE_INFO: Record<string, { name: string; description: string; price: number }> = {
  basic: {
    name: 'Módulo Básico',
    description: 'OS, Agenda, Dashboard, Orçamentos, Serviços, Mapa, Clientes, Equipamentos, Estoque, Contratos, Financeiro Básico',
    price: 200,
  },
  rh: {
    name: 'Funcionários / RH',
    description: 'Gestão de funcionários, ponto eletrônico, movimentações financeiras de colaboradores',
    price: 100,
  },
  crm: {
    name: 'CRM',
    description: 'Funil de vendas, leads, interações e webhooks de captação',
    price: 50,
  },
  nfe: {
    name: 'Emissão de Notas Fiscais',
    description: 'Emissão de NF-e e NFS-e integrada ao sistema',
    price: 100,
  },
  finance_advanced: {
    name: 'Financeiro Avançado',
    description: 'DRE - Demonstrativo de Resultado, Contas a Pagar e a Receber',
    price: 50,
  },
  pricing_advanced: {
    name: 'Precificação Avançada',
    description: 'BDI, Custos Globais de recursos, precificação detalhada de serviços e orçamentos',
    price: 50,
  },
  customer_portal: {
    name: 'Portal do Cliente',
    description: 'Área exclusiva para o cliente acompanhar OS e equipamentos',
    price: 50,
  },
  white_label: {
    name: 'White Label',
    description: 'Personalização completa da marca: logo, cores e ícone do sistema',
    price: 50,
  },
};
