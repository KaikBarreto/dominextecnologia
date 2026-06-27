import ModuleLandingPage from './ModuleLandingPage';
import { MODULES } from './modulesData';

/** Landing do módulo Rastreamento & Agenda. Rota: /rastreamento-de-equipes. */
export default function RastreamentoDeEquipes() {
  return <ModuleLandingPage data={MODULES['rastreamento-de-equipes']} />;
}
