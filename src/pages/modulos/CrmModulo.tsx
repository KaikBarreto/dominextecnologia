import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo CRM & Vendas. Rota: /crm. */
export default function CrmModulo() {
  return <ModuleLandingPage data={MODULES['crm']} />;
}
