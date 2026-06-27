import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo Área do Técnico™. Rota: /area-do-tecnico. */
export default function AreaDoTecnico() {
  return <ModuleLandingPage data={MODULES['area-do-tecnico']} />;
}
