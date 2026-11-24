import { renderPublicContractPortal } from '../../_lib/public-contract-portal-render.js';

export async function onRequest(context) {
  return renderPublicContractPortal({
    env: context.env,
    request: context.request,
    token: context.params?.token ? String(context.params.token) : '',
  });
}
