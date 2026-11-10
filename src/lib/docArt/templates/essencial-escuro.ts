import { createCertificateTemplate } from './certificate.ts';

export const essencialEscuroTemplate = createCertificateTemplate({
  slug: 'essencial-escuro',
  name: 'Essencial Escuro',
  orientation: 'landscape',
  motif: 'essential',
  dark: true,
  backgroundArtwork: false,
});
