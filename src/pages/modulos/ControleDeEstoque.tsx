import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo Estoque. Rota: /controle-de-estoque. */
export default function ControleDeEstoque() {
  return <ModuleLandingPage data={MODULES['controle-de-estoque']} />;
}
