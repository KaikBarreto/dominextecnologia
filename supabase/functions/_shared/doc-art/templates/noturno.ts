import { createCertificateTemplate } from './certificate.ts';

export const noturnoTemplate = createCertificateTemplate({
  slug: 'noturno', name: 'Noturno', orientation: 'landscape', motif: 'frame', dark: true,
});
