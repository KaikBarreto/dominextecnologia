import { ArrowRight, Lock, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CustomerBillingEmailsCard } from '@/components/settings/CustomerBillingEmailsCard';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';

export function SettingsEmailContent() {
  const navigate = useNavigate();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const { hasModule, isLoading } = useCompanyModules();
  const canManage = isAdminOrGestor() || hasPermission('fn:manage_settings');
  const hasBillingModule = hasModule('cobrancas');

  if (isLoading) {
    return (
      <div className="space-y-4" aria-label="Carregando configurações de e-mail">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-5 w-5 text-primary" />
            Canal de e-mail
          </CardTitle>
          <CardDescription className="max-w-2xl">
            Ative os avisos que a Dominex envia em nome da sua empresa. Cada grupo de automação
            fica disponível conforme os módulos contratados.
          </CardDescription>
        </CardHeader>
      </Card>

      {hasBillingModule ? (
        <CustomerBillingEmailsCard />
      ) : (
        <NoticeBanner
          variant="warning"
          icon={Lock}
          title="Automações de cobrança não contratadas"
          action={canManage ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 bg-white px-3 text-foreground hover:bg-white/90"
              onClick={() => navigate('/assinatura?addModule=cobrancas')}
            >
              Contratar Cobranças
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : undefined}
        >
          O canal de e-mail está disponível, mas os avisos de cobrança exigem o módulo Cobranças.
        </NoticeBanner>
      )}
    </div>
  );
}
