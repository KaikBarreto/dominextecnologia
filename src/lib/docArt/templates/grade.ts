import { createCertificateTemplate } from './certificate.ts';

export const gradeTemplate = createCertificateTemplate({
  slug: 'grade', name: 'Grade', orientation: 'portrait', motif: 'grid', dark: false,
});
