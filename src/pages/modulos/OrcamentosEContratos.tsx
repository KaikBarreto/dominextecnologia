import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo Orçamentos & Contratos. Rota: /orcamentos-e-contratos. */
export default function OrcamentosEContratos() {
  return <ModuleLandingPage data={MODULES['orcamentos-e-contratos']} />;
}
