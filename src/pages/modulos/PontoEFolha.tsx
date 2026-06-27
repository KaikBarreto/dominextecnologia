import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo Ponto & Folha (RH). Rota: /ponto-e-folha. */
export default function PontoEFolha() {
  return <ModuleLandingPage data={MODULES['ponto-e-folha']} />;
}
