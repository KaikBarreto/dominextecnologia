import { createCertificateTemplate } from './certificate.ts';

export const marcaTemplate = createCertificateTemplate({
  slug: 'marca', name: 'Marca', orientation: 'landscape', motif: 'stripe', dark: false,
});
