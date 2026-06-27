import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo Financeiro. Rota: /controle-financeiro. */
export default function ControleFinanceiro() {
  return <ModuleLandingPage data={MODULES['controle-financeiro']} />;
}
