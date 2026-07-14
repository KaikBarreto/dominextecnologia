import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo Rastreamento & Agenda. Rota: /rastreamento-de-equipes. */
export default function RastreamentoDeEquipes() {
  const { locale } = useLocale();
  const data = getModuleData('rastreamento-de-equipes', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
