export function buildServiceOrderShareLink(osId: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/os-share?os_id=${osId}`;
}
