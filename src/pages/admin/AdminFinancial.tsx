import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { AdminFinancialWorkspace } from "@/components/admin/AdminFinancialWorkspace";
export default function AdminFinancial() {
  const { hasFunctionAccess, isLoading } = useAdminPermissions();
  if (isLoading) {
    return (
      <p role="status" className="p-6">Verificando acesso ao financeiro…</p>
    );
  }
  if (!hasFunctionAccess("admin_financeiro_totais")) {
    return (
      <p role="alert" className="p-6">
        Seu perfil não permite consultar o financeiro. Solicite acesso à tela e
        aos totais.
      </p>
    );
  }
  return (
    <AdminFinancialWorkspace
      canManage={hasFunctionAccess("admin_financeiro_lancamentos")}
    />
  );
}
