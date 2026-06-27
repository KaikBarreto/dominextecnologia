import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo Portal do Cliente. Rota: /portal-do-cliente. */
export default function PortalDoCliente() {
  return <ModuleLandingPage data={MODULES['portal-do-cliente']} />;
}
