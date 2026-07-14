import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo CRM & Vendas. Rota: /crm. */
export default function CrmModulo() {
  const { locale } = useLocale();
  const data = getModuleData('crm', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
