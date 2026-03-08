import { useNavigate } from 'react-router-dom';
import { CreditCard, Calendar, CheckCircle2, AlertTriangle, Clock, ArrowRight, Sparkles, Zap, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInDays, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEffect, useState } from 'react';

export default function Billing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

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

  useEffect(() => {
    if (company?.subscription_expires_at) {
      const update = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const exp = new Date(company.subscription_expires_at!);
        exp.setHours(0, 0, 0, 0);
        setDaysRemaining(differenceInDays(exp, today));
      };
      update();
      const interval = setInterval(update, 60000);
      return () => clearInterval(interval);
    }
  }, [company?.subscription_expires_at]);

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

  const isTesting = company.subscription_status === 'testing';
  const effectiveValue = company.subscription_value || 0;

  const getStatusConfig = (days: number | null) => {
    if (days !== null && days < 0) {
      return {
        badge: <Badge className="bg-orange-500 text-white text-sm px-3 py-1">Vencida</Badge>,
        icon: AlertTriangle,
        message: `Vencida há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}`,
      };
    }
    if (days !== null && days <= 7) {
      return {
        badge: <Badge className="bg-orange-500 text-white text-sm px-3 py-1">Vence em breve</Badge>,
        icon: Clock,
        message: `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`,
      };
    }
    return {
      badge: <Badge className="bg-emerald-500 text-white text-sm px-3 py-1">Ativa</Badge>,
      icon: CheckCircle2,
      message: days !== null ? `${days} dias restantes` : 'Ativa',
    };
  };

  const statusConfig = getStatusConfig(daysRemaining);
  const StatusIcon = statusConfig.icon;

  const planDisplayName = company.subscription_plan
    ? company.subscription_plan.charAt(0).toUpperCase() + company.subscription_plan.slice(1)
    : 'Starter';

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 sm:p-6">
      {isTesting ? (
        /* Trial CTA */
        <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br from-primary/90 to-primary p-6 sm:p-8 md:p-12 text-primary-foreground text-center">
          <div className="absolute top-0 right-0 w-32 md:w-64 h-32 md:h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 md:w-48 h-24 md:h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
          <div className="relative z-10 space-y-4 max-w-lg mx-auto">
            <Sparkles className="h-10 w-10 mx-auto" />
            <h1 className="text-2xl md:text-3xl font-bold">Ative sua Assinatura</h1>
            <p className="text-primary-foreground/80 text-sm md:text-base">
              Você está no período de teste. Escolha o plano ideal e garanta acesso completo ao Dominex.
            </p>
            {daysRemaining !== null && daysRemaining > 0 && (
              <p className="text-primary-foreground/60 text-xs">
                <Clock className="h-3.5 w-3.5 inline mr-1" />
                {daysRemaining} dia{daysRemaining !== 1 ? 's' : ''} restante{daysRemaining !== 1 ? 's' : ''} de teste
              </p>
            )}
            {daysRemaining !== null && daysRemaining <= 0 && (
              <p className="text-orange-200 text-xs font-medium">
                <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                Seu período de teste expirou
              </p>
            )}
            <Button
              size="lg"
              variant="secondary"
              className="mt-4 font-semibold text-base px-8"
              onClick={() => navigate('/checkout')}
            >
              Escolher Plano e Ativar
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      ) : (
        /* Active subscription hero */
        <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br from-primary/90 to-primary p-4 sm:p-6 md:p-8 text-primary-foreground">
          <div className="absolute top-0 right-0 w-32 md:w-64 h-32 md:h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 md:w-48 h-24 md:h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
          <div className="relative z-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
              <div className="space-y-1 md:space-y-2">
                <div className="flex items-start gap-2 md:gap-3">
                  <Sparkles className="h-5 w-5 md:h-6 md:w-6 shrink-0 mt-0.5" />
                  <h1 className="text-lg sm:text-xl md:text-3xl font-bold break-words">{company.name}</h1>
                </div>
                <p className="text-primary-foreground/80 text-sm md:text-lg">Plano {planDisplayName}</p>
              </div>
              <div className="flex items-center justify-between md:flex-col md:items-end gap-2">
                {statusConfig.badge}
                <p className="text-primary-foreground/70 text-xs md:text-sm flex items-center gap-1.5 md:gap-2">
                  <StatusIcon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  {statusConfig.message}
                </p>
              </div>
            </div>

            <div className="mt-4 md:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg md:rounded-xl p-3 md:p-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="p-1.5 md:p-2 bg-white/20 rounded-lg shrink-0">
                    <CreditCard className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs md:text-sm text-primary-foreground/70">Valor mensal</p>
                    <p className="text-lg md:text-2xl font-bold truncate">
                      {effectiveValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg md:rounded-xl p-3 md:p-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="p-1.5 md:p-2 bg-white/20 rounded-lg shrink-0">
                    <Calendar className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs md:text-sm text-primary-foreground/70">Vencimento</p>
                    <p className="text-sm md:text-lg font-semibold">
                      {company.subscription_expires_at
                        ? format(new Date(company.subscription_expires_at), 'dd/MM/yy')
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isTesting && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Payment Card */}
          <Card className="relative overflow-hidden border transition-all duration-300 hover:shadow-xl">
            <CardHeader className="relative p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85 flex items-center gap-2">
                  <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-primary shrink-0">
                    <Zap className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
                  </div>
                  <span>Pagamento</span>
                </CardTitle>
                {daysRemaining !== null && daysRemaining <= 7 && (
                  <Badge variant="outline" className="animate-pulse bg-orange-500/10 text-orange-600 border-orange-300 text-xs shrink-0">
                    Vence em breve
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-2 text-xs md:text-sm">
                {daysRemaining !== null && daysRemaining < 0
                  ? 'Sua assinatura está vencida. Renove agora.'
                  : daysRemaining !== null && daysRemaining <= 7
                  ? 'Sua assinatura vence em breve.'
                  : 'Mantenha sua assinatura em dia.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative p-4 md:p-6 pt-0">
              <div className="space-y-4 md:space-y-5">
                {/* Price Display */}
                <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br from-background to-muted/50 border p-4 md:p-6">
                  <div className="absolute top-0 right-0 w-16 md:w-20 h-16 md:h-20 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                      <p className="text-xs md:text-sm text-muted-foreground font-medium">Valor a pagar</p>
                      <p className="text-2xl md:text-4xl font-bold tracking-tight mt-1">
                        {effectiveValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Vencimento</p>
                      <p className="font-semibold text-base md:text-lg">
                        {company.subscription_expires_at
                          ? format(new Date(company.subscription_expires_at), 'dd/MM/yyyy')
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full h-12 md:h-14 text-base md:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  size="lg"
                  onClick={() => navigate('/checkout')}
                >
                  Pagar Agora
                  <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5 -rotate-45" />
                </Button>

                <div className="flex items-center justify-center gap-3 md:gap-4 text-[10px] md:text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-500" />
                    <span>PIX</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-muted-foreground" />
                    <span>Boleto</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-primary" />
                    <span>Cartão</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Card */}
          <Card className="relative overflow-hidden border transition-all duration-300 hover:shadow-xl">
            <CardHeader className="relative p-4 md:p-6">
              <CardTitle className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85 flex items-center gap-2">
                <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-primary shrink-0">
                  <Users className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
                </div>
                <span>Resumo do Plano</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-4 md:p-6 pt-0 space-y-4">
              <div className="flex justify-between text-sm py-2 border-b border-border">
                <span className="text-muted-foreground">Plano</span>
                <span className="font-semibold capitalize">{planDisplayName}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-border">
                <span className="text-muted-foreground">Máx. Usuários</span>
                <span className="font-semibold">{company.max_users || 5}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-border">
                <span className="text-muted-foreground">Ciclo</span>
                <span className="font-semibold capitalize">{company.billing_cycle === 'yearly' ? 'Anual' : 'Mensal'}</span>
              </div>
              <div className="flex justify-between text-sm py-2">
                <span className="text-muted-foreground">Status</span>
                {statusConfig.badge}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
