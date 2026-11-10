import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing de Contratos. Rota: /gestao-de-contratos. */
export default function Contratos() {
  const { locale } = useLocale();
  const data = getModuleData('contratos', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
