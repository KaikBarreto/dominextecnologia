import { Lock, Sparkles, ArrowRight, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { useModuleCatalog } from '@/hooks/useModuleCatalog';
import { PriceAmount } from '@/components/ui/PriceAmount';

interface ModuleGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleName: string;
  moduleDescription?: string;
  modulePrice?: number;
  /**
   * Código do módulo (ex: 'crm', 'rh'). Quando informado, exibe o CTA
   * "Adicionar módulo" que leva direto pra /assinatura?addModule=<code>, abrindo
   * o "Gerenciar Meu Plano" na aba Personalizado com ESTE módulo pré-marcado.
   */
  moduleCode?: string;
}

export function ModuleGateModal({
  open,
  onOpenChange,
  moduleName,
  moduleDescription,
  modulePrice,
  moduleCode,
}: ModuleGateModalProps) {
  const navigate = useNavigate();

  // Nome e preço vêm do banco (subscription_modules) quando há moduleCode —
  // mudança de preço no catálogo reflete aqui sem editar código. As props
  // (geralmente vindas do MODULE_INFO hardcoded) são fallback enquanto carrega
  // ou quando o módulo não existe no catálogo.
  const { getModule } = useModuleCatalog();
  const dbModule = getModule(moduleCode);
  const displayName = dbModule?.name || moduleName;
  const displayPrice = dbModule?.price != null ? Number(dbModule.price) : modulePrice;
  const displayDescription = moduleDescription || dbModule?.description || undefined;

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Módulo não disponível">
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-primary" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            {displayName}
          </h3>
          {displayDescription && (
            <p className="text-sm text-muted-foreground max-w-sm">{displayDescription}</p>
          )}
        </div>

        {displayPrice != null && displayPrice > 0 && (
          <div className="bg-muted rounded-lg px-4 py-2 flex items-baseline justify-center gap-1">
            <span className="text-sm text-muted-foreground">A partir de</span>
            <PriceAmount
              value={displayPrice}
              suffix="/mês"
              className="text-lg font-bold text-foreground"
            />
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Seu plano atual não inclui este recurso. Faça upgrade para desbloqueá-lo.
        </p>

        {/* CTA principal: adicionar ESTE módulo direto ao plano (aba Personalizado
            pré-marcada). Fallback pra "Contratar Agora" quando não há código. */}
        {moduleCode ? (
          <div className="flex flex-col gap-2 w-full">
            <Button
              className="w-full gap-2"
              onClick={() => {
                onOpenChange(false);
                navigate(`/assinatura?addModule=${encodeURIComponent(moduleCode)}`);
              }}
            >
              <Plus className="h-4 w-4" />
              Adicionar módulo
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                onOpenChange(false);
                navigate('/assinatura');
              }}
            >
              Ver planos
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
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
        )}
      </div>
    </ResponsiveModal>
  );
}

// Metadados locais dos módulos — FALLBACK apenas. Nome e preço canônicos vivem
// em subscription_modules (ver useModuleCatalog); este mapa cobre o loading e
// fornece as descrições ricas em PT-BR que o banco não tem. Não confiar nos
// preços daqui pra exibição: o ModuleGateModal sobrescreve com o valor do banco.
export const MODULE_INFO: Record<string, { name: string; description: string; price: number }> = {
  basic: {
    name: 'Módulo Básico',
    description: 'OS, Agenda, Dashboard, Orçamentos, Serviços, Mapa, Clientes, Equipamentos, Estoque, Financeiro Básico',
    price: 200,
  },
  contracts: {
    name: 'Gestão de Contratos e PMOC',
    description: 'Gestão de contratos, Portal do Contrato e Portal do PMOC públicos, documentos (TRT, Certificado, Cronograma, Dossiê)',
    price: 100,
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
    description: 'Emissão de NFS-e (nota fiscal de serviço) integrada ao sistema',
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
    price: 0,
  },
  white_label: {
    name: 'White Label',
    description: 'Personalização completa da marca: logo, cores e ícone do sistema',
    price: 50,
  },
};
