export function buildServiceOrderShareLink(osId: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  // Route through edge function for proper OG meta tags (WhatsApp preview)
  // The function redirects to the friendly dominex.app URL
  return `${supabaseUrl}/functions/v1/os-share?os_id=${osId}`;
}
