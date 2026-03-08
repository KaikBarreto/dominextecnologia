import { useNavigate } from 'react-router-dom';
import { CreditCard, Calendar, CheckCircle, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInDays, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  testing: { label: 'Teste Grátis', color: 'bg-blue-500', icon: Clock },
  active: { label: 'Ativa', color: 'bg-green-500', icon: CheckCircle },
  inactive: { label: 'Inativa', color: 'bg-destructive', icon: AlertTriangle },
};

export default function Billing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: company, isLoading } = useQuery({
    queryKey: ['my-company'],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user!.id)
        .single();
      if (!profile?.company_id) return null;
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">Nenhuma empresa vinculada</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sua conta ainda não está vinculada a uma empresa. Caso tenha se cadastrado recentemente, entre em contato com o administrador.
          </p>
        </div>
      </div>
    );
  }

  const status = STATUS_CONFIG[company.subscription_status] || STATUS_CONFIG.inactive;
  const StatusIcon = status.icon;
  const expiresAt = company.subscription_expires_at ? new Date(company.subscription_expires_at) : null;
  const daysLeft = expiresAt ? differenceInDays(expiresAt, new Date()) : 0;
  const isExpired = expiresAt ? isPast(expiresAt) : false;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-background border border-primary/20 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Plano {company.subscription_plan?.charAt(0).toUpperCase() + company.subscription_plan?.slice(1) || 'Starter'}
            </p>
          </div>
          <Badge className={`${status.color} text-white px-4 py-1.5 text-sm gap-2`}>
            <StatusIcon className="h-4 w-4" />
            {status.label}
          </Badge>
        </div>

        {expiresAt && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {isExpired
                ? `Venceu em ${format(expiresAt, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`
                : `Vence em ${format(expiresAt, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} (${daysLeft} dias restantes)`}
            </span>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {company.subscription_value > 0
                ? `R$ ${Number(company.subscription_value).toFixed(2).replace('.', ',')}`
                : 'Grátis'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Máx. Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{company.max_users || 5}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ciclo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">{company.billing_cycle || 'Mensal'}</p>
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      {company.subscription_status === 'testing' && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6">
            <div>
              <h3 className="font-semibold text-lg">Ativar assinatura</h3>
              <p className="text-muted-foreground text-sm">Escolha o plano ideal para sua operação</p>
            </div>
            <Button onClick={() => navigate('/checkout')} className="gap-2">
              <CreditCard className="h-4 w-4" /> Escolher plano <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
