import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PublicTrackingMap } from '@/components/schedule/PublicTrackingMap';

export default function PublicTracking() {
  const { osId } = useParams<{ osId: string }>();
  const [osData, setOsData] = useState<any>(null);
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!osId) { setError('ID da OS não informado.'); setLoading(false); return; }

      const { data: os, error: osErr } = await supabase
        .from('service_orders')
        .select('id, order_number, status, description, customer_id')
        .eq('id', osId)
        .single();

      if (osErr || !os) { setError('Ordem de serviço não encontrada.'); setLoading(false); return; }
      setOsData(os);

      const [{ data: customer }, { data: company }] = await Promise.all([
        supabase.from('customers').select('name').eq('id', (os as any).customer_id).single(),
        supabase.from('company_settings').select('name, logo_url').limit(1).single(),
      ]);

      if (customer) setCustomerName((customer as any).name);
      if (company) setCompanyName((company as any).name);
      setLoading(false);
    };
    load();
  }, [osId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !osData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-bold mb-2">Indisponível</h1>
        <p className="text-muted-foreground text-center">{error}</p>
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    a_caminho: 'A caminho',
    concluida: 'Concluída',
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3">
        <div className="mx-auto max-w-lg">
          <p className="text-sm text-muted-foreground">{companyName}</p>
          <h1 className="text-lg font-bold">Acompanhamento em Tempo Real</h1>
        </div>
      </header>
      <main className="mx-auto max-w-lg p-4 space-y-4">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-bold">OS #{String(osData.order_number).padStart(4, '0')}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {statusLabels[osData.status] || osData.status}
            </span>
          </div>
          {customerName && <p className="text-sm text-muted-foreground">{customerName}</p>}
          {osData.description && <p className="text-xs text-muted-foreground">{osData.description}</p>}
        </div>
        <PublicTrackingMap serviceOrderId={osData.id} />
        <p className="text-xs text-center text-muted-foreground">
          A localização é atualizada automaticamente enquanto o técnico está a caminho.
        </p>
      </main>
    </div>
  );
}
