

# Plan: Holidays in Schedule + Live Map Improvements

## 1. Holidays on Schedule

**What:** Auto-populate calendars with national Brazilian holidays and municipal holidays based on each company's registered city/state. Add a usability toggle to enable/disable holidays.

**How:**
- Create a new utility file `src/utils/holidays.ts` with:
  - A static list of Brazilian national holidays (fixed + floating like Carnaval, Corpus Christi, Páscoa) with year-aware calculation
  - A function `getNationalHolidays(year: number)` returning `{ date: string; name: string }[]`
  - A function `getMunicipalHolidays(city: string, state: string, year: number)` — since there's no reliable free API for all municipal holidays, we'll include major known municipal holidays for state capitals and common ones (e.g., city anniversary dates for major cities). For cities not in the list, only national holidays apply.
- In `Schedule.tsx`, fetch company settings to get `city`/`state`, compute holidays for the visible month/range, and inject them into the calendar as special "holiday" events (distinct visual style — subtle background highlight on calendar cells + label)
- Add holiday events as a new type in the calendar rendering (not draggable, non-clickable, just informational labels on the day cells)
- In `MonthlyCalendar.tsx`, `WeeklyCalendar.tsx`, `DailyCalendar.tsx`, and `MobileAgendaView.tsx` — receive holidays as a prop and render them as subtle labels/badges on the corresponding days

**Usability Toggle:**
- Add a new section "Agenda" in `usabilitySections` in `Settings.tsx` with a toggle `showHolidays` (default: `true`)
- In `Schedule.tsx`, read this setting from `localStorage` and conditionally include holiday events

## 2. Company Base on Live Map

**What:** Show the company's headquarters as a marker on the live map.

**How:**
- In `LiveMap.tsx`, use `useCompanySettings()` to get the company address
- Geocode the company address (using existing `geocodeAddress` from geolocation utils) if lat/lng aren't cached
- Add a distinct marker (e.g., building icon, different color like green/teal) with a tooltip showing "Base: {company name}"
- Include it in the bounds calculation so the map fits both technicians and the base

## 3. Larger Tooltip + Click-to-Pin on Map Points

**What:** Increase tooltip size and make it persistent on click (dismiss with X button).

**How:**
- Replace `bindTooltip` with `bindPopup` for the marker interaction, or use a hybrid approach:
  - Keep tooltip for hover (slightly larger with `min-width: 240px`)
  - On marker click, open a Leaflet popup (which stays open until closed) with the same content plus an explicit X close button
- Alternatively, use `marker.on('click', ...)` to make the tooltip sticky by setting `{ permanent: true }` and toggling it, then adding an X button in the HTML
- The simplest approach: use `bindPopup` instead of `bindTooltip`. Popups in Leaflet are click-to-open and have a built-in close button. Increase `maxWidth` and `minWidth` for larger display. Keep tooltip for hover preview (smaller), popup for click (larger with full details).

**Implementation:** In `LiveMap.tsx`:
- Keep `bindTooltip` for hover with current content
- Add `bindPopup` with richer, larger content (same info but bigger font, more padding, `minWidth: 280`)
- Popup opens on click and stays until user clicks X (default Leaflet popup behavior)

## Files to Modify

| File | Changes |
|---|---|
| New: `src/utils/holidays.ts` | National + municipal holiday calculator |
| `src/pages/Schedule.tsx` | Inject holiday events into calendar views |
| `src/components/schedule/MonthlyCalendar.tsx` | Render holiday labels on day cells |
| `src/components/schedule/WeeklyCalendar.tsx` | Render holiday labels |
| `src/components/schedule/DailyCalendar.tsx` | Render holiday label |
| `src/components/schedule/MobileAgendaView.tsx` | Render holiday label |
| `src/pages/Settings.tsx` | Add "Agenda" section with `showHolidays` toggle |
| `src/pages/LiveMap.tsx` | Company base marker + larger tooltip + click-to-pin popup |

