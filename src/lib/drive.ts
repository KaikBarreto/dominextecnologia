export function extractDriveId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace("www.", "");
    if (host === "drive.google.com" || host === "docs.google.com") {
      const fileMatch = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileMatch) return fileMatch[1];
      const idParam = url.searchParams.get("id");
      if (idParam) return idParam;
    }
  } catch {
    // not a URL
  }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return trimmed;
}

export function getDriveStreamUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
}
