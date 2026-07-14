import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo Ordem de Serviço Digital. Rota: /os-digital. */
export default function OsDigital() {
  const { locale } = useLocale();
  const data = getModuleData('os-digital', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
