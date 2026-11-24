import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DomiLinkBrand } from '@/components/pdv/domilink/DomiLinkBrand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useDomiLink, type DomiLinkStatus } from '@/hooks/useDomiLink';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import { DOMILINK_SETTINGS_QUERY, useDomiLinkAccess } from './useDomiLinkAccess';

const STATUS_LABELS: Record<DomiLinkStatus, string> = {
  disabled: 'Desligado', checking: 'Procurando DomiLink…', offline: 'Não conectado',
  pairing: 'Pareamento necessário', connected: 'Conectado', error: 'Conexão indisponível',
};

function DeviceConnectionSummary() {
  const { status } = useDomiLink();
  const { locale } = useAppLocaleContext();

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <DomiLinkBrand caption={<h2 className="domilink-brand-caption">Equipamentos deste computador</h2>} />
      <span role="status"><Badge variant={status === 'connected' ? 'success' : 'outline'}>{STATUS_LABELS[status]}</Badge></span>
    </div>
    <p className="max-w-xl text-sm text-muted-foreground">Impressoras, balanças e leitores são configurados em Configurações → Integrações → DomiLink. A conexão fica salva somente neste navegador.</p>
    <Button asChild className="w-full sm:w-auto"><Link to={`${localizeAppPath('/configuracoes', locale)}${DOMILINK_SETTINGS_QUERY}`}>Configurar DomiLink<ArrowRight className="h-4 w-4" /></Link></Button>
  </div>;
}

export function DomiLinkDeviceShortcut() {
  const { allowed, isPending } = useDomiLinkAccess();
  if (isPending) return <div role="status" aria-label="Carregando acesso ao DomiLink"><Skeleton className="h-36 w-full rounded-lg" /></div>;
  if (!allowed) return <p role="status" className="text-sm text-muted-foreground">Seu perfil não tem acesso à configuração dos equipamentos.</p>;
  return <DeviceConnectionSummary />;
}
