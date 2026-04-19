export function extractYouTubeId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace("www.", "").replace("m.", "");
    if (host === "youtube.com") {
      const v = url.searchParams.get("v");
      if (v) return v;
      const pathMatch = url.pathname.match(/^\/(embed|v|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch) return pathMatch[2];
    }
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0].split("?")[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {
    // ignore
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const fallback = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (fallback) return fallback[1];
  return trimmed;
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
