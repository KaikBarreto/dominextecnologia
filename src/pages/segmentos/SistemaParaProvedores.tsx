import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento Telecomunicações / Provedores.
 * Rota: /sistema-para-provedores. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaProvedores() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-provedores', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
