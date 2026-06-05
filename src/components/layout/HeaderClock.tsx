import { useEffect, useState } from "react";

const UF_TIMEZONE: Record<string, string> = {
  AM: "America/Manaus", RR: "America/Manaus", RO: "America/Manaus",
  MT: "America/Cuiaba", MS: "America/Cuiaba",
  AC: "America/Rio_Branco",
};

function resolveTimeZone(uf?: string | null): string | undefined {
  if (!uf) return undefined;             // fallback: fuso local do navegador
  const code = uf.trim().toUpperCase();
  if (code.length !== 2) return undefined; // nome por extenso não reconhecido → fallback
  return UF_TIMEZONE[code] ?? "America/Sao_Paulo";
}

export function HeaderClock({ uf }: { uf?: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeZone = resolveTimeZone(uf);
  const datePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone, weekday: "short", day: "2-digit", month: "2-digit",
  }).format(now);                        // "qui., 04/06"
  const timePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now);                        // "19:12:16"
  const label = `${datePart} ${timePart}`;
  return (
    <time
      aria-label={`Data e hora: ${label}`}
      className="hidden lg:flex items-center text-[13px] font-medium tabular-nums text-muted-foreground select-none"
    >
      {label}
    </time>
  );
}
