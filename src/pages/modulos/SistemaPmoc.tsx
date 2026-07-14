import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo PMOC. Rota: /sistema-pmoc. */
export default function SistemaPmoc() {
  const { locale } = useLocale();
  const data = getModuleData('sistema-pmoc', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
