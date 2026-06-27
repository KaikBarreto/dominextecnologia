import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo Ordem de Serviço Digital. Rota: /os-digital. */
export default function OsDigital() {
  return <ModuleLandingPage data={MODULES['os-digital']} />;
}
