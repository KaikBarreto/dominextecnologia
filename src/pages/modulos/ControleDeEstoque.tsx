import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo Estoque. Rota: /controle-de-estoque. */
export default function ControleDeEstoque() {
  const { locale } = useLocale();
  const data = getModuleData('controle-de-estoque', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
