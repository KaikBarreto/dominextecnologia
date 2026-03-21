export function buildServiceOrderShareLink(osId: string, targetUrl?: string) {
  const shareUrl = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/os-share`);
  shareUrl.searchParams.set('os_id', osId);

  if (targetUrl) {
    shareUrl.searchParams.set('redirect_to', targetUrl);
  }

  return shareUrl.toString();
}