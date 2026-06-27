import SegmentLandingPage from './SegmentLandingPage';
import { SEGMENTS } from './segmentsData';

/**
 * Landing de SEO do segmento Elevadores.
 * Rota: /sistema-para-elevadores. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaElevadores() {
  return <SegmentLandingPage data={SEGMENTS['sistema-para-elevadores']} />;
}
