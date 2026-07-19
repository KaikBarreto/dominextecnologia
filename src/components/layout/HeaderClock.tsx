import { useEffect, useState } from "react";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { MESSAGES } from "@/lib/i18n";
import { toBcp47 } from "@/lib/format";
import { timezoneOffsetLabel, timezoneLabel } from "@/lib/i18n/timezones";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { locale, timezone } = useAppLocaleContext();
  const bcp47 = toBcp47(locale);

  const datePart = new Intl.DateTimeFormat(bcp47, {
    timeZone: timezone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(now);

  const timePart = new Intl.DateTimeFormat(bcp47, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  const label = `${datePart} ${timePart}`;

  const shellT = MESSAGES[locale].app.shell;
  const tzOffsetLabel = timezoneOffsetLabel(timezone);
  const tzNameLabel = timezoneLabel(timezone);
  const tooltipText = `${shellT.clockTimezoneLabel}: ${tzOffsetLabel} ${tzNameLabel}`.trim();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          aria-label={`${shellT.clockDateTimeLabel}: ${label}`}
          className="hidden lg:flex items-center text-[13px] font-medium tabular-nums text-muted-foreground select-none cursor-default"
        >
          {label}
        </time>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
