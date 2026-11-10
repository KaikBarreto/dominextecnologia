import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo Cobranças. Rota: /cobrancas-automaticas. */
export default function CobrancasAutomaticas() {
  const { locale } = useLocale();
  const data = getModuleData('cobrancas', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
