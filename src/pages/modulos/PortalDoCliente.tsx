import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo Portal do Cliente. Rota: /portal-do-cliente. */
export default function PortalDoCliente() {
  const { locale } = useLocale();
  const data = getModuleData('portal-do-cliente', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
