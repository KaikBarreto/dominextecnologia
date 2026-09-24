import { useSearchParams } from 'react-router-dom';
import { BarChart3, Database, Server, ShieldAlert } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { typography } from '@/lib/typography';
import { useAuth } from '@/contexts/AuthContext';
import { EstatisticasSistemaTab } from '@/components/admin/estatisticas/EstatisticasSistemaTab';
import { EstatisticasInfraTab } from '@/components/admin/estatisticas/EstatisticasInfraTab';
import AdminMonitoramento from './AdminMonitoramento';

/**
 * /admin/estatisticas — painel master Auctus, EXCLUSIVO de `super_admin`.
 *
 * ⚠️ Vendedor-admin NÃO vê (decisão do CEO em 2026-09-24). A armadilha aqui é
 * `is_admin_user()`, que INCLUI vendedor-admin (`is_super_admin OR EXISTS
 * admin_permissions`) — ela não serve de gate nesta tela, nem em SQL nem em
 * runtime. As três camadas usam a MESMA régua, `super_admin` estrito:
 *   1. rota: `<AdminScreenRoute screenKey="admin_estatisticas" masterOnly />`
 *   2. tela: a guarda abaixo (defesa em profundidade, caso alguém insira a
 *      screenKey em `admin_permissions` na mão)
 *   3. dados: `get_admin_usage_statistics` aborta 42501 e a edge
 *      `admin-infra-metrics` devolve 403 — é AQUI que está a segurança.
 *
 * As três abas:
 *   Sistema  → uso agregado da base (RPC nova)
 *   Banco    → a tela de /admin/monitoramento, REAPROVEITADA como aba, não
 *              reescrita. O componente ganhou só um `embedded` pra não repetir
 *              o título da página; toda a lógica (veredito de instância, cards
 *              de saúde, top queries) continua lá e é dele.
 *   Infra    → motor fiscal + VPS, via edge function `admin-infra-metrics`
 *
 * A aba viva fica na URL (`?aba=`) pra o link ser compartilhável e pra
 * `/admin/monitoramento` poder redirecionar direto na aba certa.
 *
 * PT-BR chumbado: painel Auctus não entra no i18n de 4 idiomas.
 */

const ABAS = ['sistema', 'banco', 'infra'] as const;
type Aba = (typeof ABAS)[number];

export default function AdminEstatisticas() {
  const { roles } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSuperAdmin = roles.includes('super_admin');

  const parametro = searchParams.get('aba');
  const aba: Aba = (ABAS as readonly string[]).includes(parametro ?? '')
    ? (parametro as Aba)
    : 'sistema';

  const trocarAba = (valor: string) => {
    setSearchParams({ aba: valor }, { replace: true });
  };

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <h1 className={`${typography.pageTitle} flex items-center gap-2`}>
          <BarChart3 className="h-6 w-6 lg:h-7 lg:w-7" />
          Estatísticas
        </h1>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>
            Esta tela é exclusiva do administrador master da Auctus.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className={`${typography.pageTitle} flex items-center gap-2`}>
          <BarChart3 className="h-6 w-6 lg:h-7 lg:w-7" />
          Estatísticas
        </h1>
        <p className={typography.pageSubtitle}>
          Uso da base de clientes, saúde do banco e da infraestrutura.
        </p>
      </div>

      <Tabs value={aba} onValueChange={trocarAba}>
        {/* Pills roláveis no mobile, ancoradas à esquerda. */}
        <div className="-mx-4 px-4 overflow-x-auto md:mx-0 md:px-0">
          <TabsList className="w-max">
            <TabsTrigger value="sistema" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Sistema
            </TabsTrigger>
            <TabsTrigger value="banco" className="gap-1.5">
              <Database className="h-4 w-4" />
              Banco de dados
            </TabsTrigger>
            <TabsTrigger value="infra" className="gap-1.5">
              <Server className="h-4 w-4" />
              Infra
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sistema" className="mt-6">
          <EstatisticasSistemaTab />
        </TabsContent>

        {/* A tela de monitoramento inteira, como aba. Ela tem sub-abas próprias
            (Visão Geral / Histórico & Picos / Queries) e continua sendo a dona
            da regra do veredito de instância. */}
        <TabsContent value="banco" className="mt-6">
          <AdminMonitoramento embedded />
        </TabsContent>

        <TabsContent value="infra" className="mt-6">
          <EstatisticasInfraTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
