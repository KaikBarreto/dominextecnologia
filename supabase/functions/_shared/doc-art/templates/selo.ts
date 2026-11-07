import { createCertificateTemplate } from './certificate.ts';

export const seloTemplate = createCertificateTemplate({
  slug: 'selo', name: 'Selo', orientation: 'landscape', motif: 'seal', dark: false,
});
