import { DomiLinkSettingsCard } from '@/components/pdv/domilink/DomiLinkSettingsCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useDomiLinkAccess } from './useDomiLinkAccess';

export function DomiLinkIntegrationContent() {
  const { allowed, isPending } = useDomiLinkAccess();

  if (isPending) return <div role="status" aria-label="Carregando acesso ao DomiLink"><Skeleton className="h-48 w-full max-w-5xl rounded-lg" /></div>;
  if (!allowed) return <p role="status" className="py-6 text-sm text-muted-foreground">Para configurar os equipamentos deste computador, solicite acesso ao Estoque ou às Configurações do PDV com o módulo correspondente ativo.</p>;

  return <div className="max-w-5xl rounded-lg border border-border bg-card p-5 sm:p-7"><DomiLinkSettingsCard /></div>;
}
