import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing de Orçamentos. Rota: /sistema-de-orcamentos. */
export default function Orcamentos() {
  const { locale } = useLocale();
  const data = getModuleData('orcamentos', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
