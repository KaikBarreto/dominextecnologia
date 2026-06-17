import { Navigate } from 'react-router-dom';

/**
 * Compat: a configuração fiscal virou MODAL na tela de Notas Fiscais
 * (FiscalSettingsModal). Esta rota antiga (`/notas-fiscais/configuracoes`)
 * agora redireciona pra `/notas-fiscais?config=1`, que abre o modal
 * automaticamente. Mantida só pra não quebrar links/atalhos existentes.
 */
export { FISCAL_SCREEN_PERMISSION } from '@/components/fiscal/fiscalPermissions';

export default function FiscalSettings() {
  return <Navigate to="/notas-fiscais?config=1" replace />;
}
