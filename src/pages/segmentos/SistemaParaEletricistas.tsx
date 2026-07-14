import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento Instalações Elétricas.
 * Rota: /sistema-para-eletricistas. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaEletricistas() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-eletricistas', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
