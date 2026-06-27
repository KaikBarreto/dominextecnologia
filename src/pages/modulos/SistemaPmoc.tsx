import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo PMOC. Rota: /sistema-pmoc. */
export default function SistemaPmoc() {
  return <ModuleLandingPage data={MODULES['sistema-pmoc']} />;
}
