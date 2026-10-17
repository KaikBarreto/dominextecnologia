import { renderPublicOs } from '../_lib/public-os-render.js';

export async function onRequest(context) {
  return renderPublicOs({
    env: context.env,
    request: context.request,
    reference: context.params?.id ? String(context.params.id) : '',
  });
}
