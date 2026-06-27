import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo NFS-e. Rota: /emissao-de-nfse. */
export default function EmissaoDeNfse() {
  return <ModuleLandingPage data={MODULES['emissao-de-nfse']} />;
}
