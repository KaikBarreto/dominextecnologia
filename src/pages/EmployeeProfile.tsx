// ─────────────────────────────────────────────────────────────────────────────
// EmployeeProfile (LEGADO) — a experiência do Perfil Comportamental (DISC) de um
// funcionário agora vive IN-PLACE dentro de Employees (aba "Perfil Comportamental"
// + detalhe, sub-sidebar preservado), aberta pela rota amigável
// `/funcionarios/perfil/<slug>-<code>` (ver App.tsx + Employees.tsx).
//
// Este componente sobrou como página standalone divergente (sem o sub-menu) e não
// está mais em nenhuma rota. Mantemos só um redirect defensivo: se qualquer link
// antigo apontar pra cá com o :employeeId (UUID) na URL, encaminhamos pro mesmo
// caminho in-place, que resolve por UUID (retrocompat) e abre o detalhe.
// ─────────────────────────────────────────────────────────────────────────────

import { useParams, Navigate } from 'react-router-dom';

export default function EmployeeProfile() {
  const { employeeId } = useParams<{ employeeId: string }>();
  // Encaminha pro shell in-place (Employees lê o :param e resolve por code/UUID).
  const target = employeeId ? `/funcionarios/perfil/${employeeId}` : '/funcionarios';
  return <Navigate to={target} replace />;
}
