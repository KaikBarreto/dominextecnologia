import { createPublicLinkHandler } from '../_lib/public-link-render.js';

export const onRequest = createPublicLinkHandler('cadastro', 'code');
