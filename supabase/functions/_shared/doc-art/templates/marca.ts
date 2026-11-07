import { createCertificateTemplate } from './certificate.ts';

export const marcaTemplate = createCertificateTemplate({
  slug: 'marca', name: 'Marca', orientation: 'portrait', motif: 'stripe', dark: false,
});
