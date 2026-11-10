import { createCertificateTemplate } from './certificate.ts';

export const prismaTemplate = createCertificateTemplate({
  slug: 'prisma', name: 'Prisma', orientation: 'landscape', motif: 'prism', dark: true,
});
