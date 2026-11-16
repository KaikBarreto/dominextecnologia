export function getAdminFinancialRange(value: string, from = "", to = "") {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const now = new Date(today + "T12:00:00");
  let start: Date | null = null, end: Date | null = now;
  if (value === "today") start = new Date(now);
  else if (value === "thisMonth") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (value === "lastMonth") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (value === "thisYear") start = new Date(now.getFullYear(), 0, 1);
  else if (value === "7days" || value === "30days") {
    start = new Date(now);
    start.setDate(start.getDate() - (value === "7days" ? 6 : 29));
  } else if (value === "custom") {
    start = from ? new Date(from + "T00:00:00") : null;
    end = to ? new Date(to + "T12:00:00") : null;
  } else end = null;
  return { from: start, to: end };
}
export function buildAdminPeriodWindowIso(start: Date, end: Date) {
  const stamp = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
      String(d.getDate()).padStart(2, "0")
    }`;
  const after = new Date(end);
  after.setDate(after.getDate() + 1);
  return {
    periodStartIso: stamp(start) + "T00:00:00-03:00",
    periodEndIso: stamp(end) + "T23:59:59.999-03:00",
    periodEndExclusiveIso: stamp(after) + "T00:00:00-03:00",
  };
}
