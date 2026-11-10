import { createCertificateTemplate } from './certificate.ts';

export const gradeTemplate = createCertificateTemplate({
  slug: 'grade', name: 'Grade', orientation: 'landscape', motif: 'grid', dark: false,
});
