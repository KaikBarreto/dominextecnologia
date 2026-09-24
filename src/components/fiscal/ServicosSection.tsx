import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ServiceTypesPanel } from '@/components/service-orders/ServiceTypesPanel';
import { MESSAGES } from '@/lib/i18n/messages';

type NfseMessages = (typeof MESSAGES)['pt-br']['app']['nfse'];

interface ServicosSectionProps {
  t: NfseMessages;
}

/**
 * Seção "Serviços" — REUSO do cadastro de tipos de serviço (mesma lista usada
 * nas OS e na agenda). Uma tabela só, duas portas de entrada: aqui e no
 * cadastro do dia a dia. Como o contexto é fiscal, o formulário abre direto
 * na aba Fiscal. Salva item a item (sem barra de ação fixa: cada tipo de
 * serviço tem seu próprio salvar dentro do painel).
 */
export function ServicosSection({ t }: ServicosSectionProps) {
  return (
    <div className="space-y-4">
      <Alert className="border-primary/20 bg-muted/40">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">{t.settings.servicos.hint}</AlertDescription>
      </Alert>
      <ServiceTypesPanel embedded defaultFormTab="fiscal" />
    </div>
  );
}
