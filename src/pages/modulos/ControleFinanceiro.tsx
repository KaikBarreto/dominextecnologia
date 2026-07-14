import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo Financeiro. Rota: /controle-financeiro. */
export default function ControleFinanceiro() {
  const { locale } = useLocale();
  const data = getModuleData('controle-financeiro', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
