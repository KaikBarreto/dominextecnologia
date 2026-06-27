import SegmentLandingPage from './SegmentLandingPage';
import { SEGMENTS } from './segmentsData';

/**
 * Landing de SEO do segmento Telecomunicações / Provedores.
 * Rota: /sistema-para-provedores. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaProvedores() {
  return <SegmentLandingPage data={SEGMENTS['sistema-para-provedores']} />;
}
