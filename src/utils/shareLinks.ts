export function buildServiceOrderShareLink(osId: string) {
  // Friendly URL that goes through Cloudflare Worker proxy
  // The Worker forwards to the Supabase edge function for OG meta tags,
  // then the edge function redirects to dominex.app/os-tecnico/ID?modo=cliente
  return `https://dominex.app/acompanhamento/${osId}`;
}
