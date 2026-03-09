

# Plan: Multiple Improvements Across Equipment, Tables, and Service Orders

## Overview
This plan covers 9 distinct issues across three areas: system-wide table sorting, equipment module fixes/enhancements, and service order improvements.

---

## 1. System-wide: Sortable Table Columns

**What:** Add click-to-sort on column headers across all data tables in the system.

**How:** Extract the sorting pattern already used in `AdminSubscriptions.tsx` and `CompanyTable.tsx` into a reusable hook (`useTableSort`). Then apply it to all major table views:
- Customers, Equipment, Service Orders, Contracts, Inventory, Financial Transactions, Quotes, Employees, CRM Leads, Time History, PMOC, Teams, Users

Each `TableHead` gets an `onClick` handler and a sort direction icon (`ArrowUpDown` / `ArrowUp` / `ArrowDown`). The sorted data feeds into the existing pagination.

---

## 2. Equipment: Photo Not Saving on Create

**What:** When creating equipment from a customer's equipment tab, the photo uploads but doesn't persist.

**Root cause:** `EquipmentInput` interface in `useEquipment.ts` lacks `photo_url`, `custom_fields`, and `status` fields. The form dialog builds a `cleaned` object with `photo_url` but the mutation type doesn't include it. The insert call strips unknown fields.

**Fix:** Add `photo_url?: string`, `custom_fields?: Record<string, any>`, and `status?: string` to the `EquipmentInput` interface in `useEquipment.ts`.

---

## 3. Equipment: Notes Line Breaks

**What:** Equipment notes display on one continuous line, ignoring line breaks.

**Fix:** In `EquipmentDetail.tsx` line ~321, change the notes `<p>` to use `whitespace-pre-wrap`:
```tsx
<p className="text-sm mt-1 whitespace-pre-wrap">{equipment.notes}</p>
```

---

## 4. Equipment: Category Not Shown on Detail Page

**What:** The equipment detail page doesn't show the category.

**Fix:** In `EquipmentDetail.tsx`, add a card in the info grid that displays the category name and color dot, looking up from the `categories` array using `equipment.category_id`.

---

## 5. Equipment: Smart "Back" Button Navigation

**What:** The back button always goes to `/equipamentos`. When coming from a customer detail page, it should return to that customer's equipment tab.

**Fix:** Use `useLocation` to check if navigation state includes a `from` parameter (e.g., `{ from: 'customer', customerId: 'xxx' }`). Pass this state when navigating from `CustomerDetail.tsx`. In `EquipmentDetail.tsx`, the back button checks for this state and navigates accordingly:
- If `state.from === 'customer'` → navigate to `/clientes/{customerId}` with equipment tab active
- Otherwise → navigate to `/equipamentos`

---

## 6. Equipment Attachments: Upload Progress Bar

**What:** When uploading multiple images, show a progress bar with count (e.g., "3/10 enviadas").

**Fix:** In `EquipmentDetail.tsx`, track `uploadProgress` state (`{ current: number, total: number }`). Update it during the upload loop. Display a `Progress` component (already available) with text like "Enviando 3 de 10...". Add `framer-motion` `AnimatePresence` for smooth entry animation of new attachment cards.

---

## 7. Equipment Attachments: PDF Preview Thumbnail

**What:** PDF attachments should show a visual preview of the first page instead of a generic file icon.

**Fix:** Use `<canvas>` with the browser-native `pdfjsLib` (via dynamic import of `pdfjs-dist` or an `<iframe>` approach). For simplicity, render the PDF card with an `<iframe>` thumbnail pointing to the PDF URL, styled as a small preview. Alternative: use `<object>` tag with `type="application/pdf"` for inline preview at thumbnail size. This avoids adding heavy dependencies.

---

## 8. OS Form: Equipment Cards Show Location and Photo

**What:** In the OS creation modal step 2 (equipment selection), each equipment card should also show the equipment's location and photo.

**Fix:** In `ServiceOrderFormDialog.tsx` (~line 609-631), modify the equipment card to include:
- A small photo thumbnail (if `eq.photo_url` exists)
- The location text (if `eq.location` exists) alongside brand/model

---

## 9. OS "A Caminho": Route Not Displayed for Client

**What:** When marking "A Caminho", the route with distance/time is not showing for the client.

**Analysis:** The `PublicTrackingMap` component fetches the technician's latest location from `technician_locations` table. The `handleEnRoute` function in `TechnicianOS.tsx` calls `recordLocationEvent` which inserts into this table. The route is calculated via OSRM when `isEnRoute` is true and both positions exist.

**Possible issues:**
1. The customer may not have geocoded coordinates (`lat`/`lng` null) and the geocoding fallback may fail
2. The `technician_locations` table query might not find records if the `event_type` doesn't match
3. The Realtime subscription might not be active on the table

**Fix:** 
- Ensure the `handleEnRoute` function awaits the location event insertion before updating UI
- Add better error handling and fallback in `PublicTrackingMap` when geocoding fails
- Verify `technician_locations` has Realtime enabled (add `ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_locations` if needed)
- Add logging/toast feedback when route calculation fails so the issue is diagnosable

---

## Files to Modify

| File | Changes |
|---|---|
| `src/hooks/useEquipment.ts` | Add missing fields to `EquipmentInput` |
| `src/pages/EquipmentDetail.tsx` | Notes whitespace, category display, smart back button, upload progress, PDF preview, attachment animations |
| `src/pages/CustomerDetail.tsx` | Pass navigation state when clicking equipment |
| `src/components/service-orders/ServiceOrderFormDialog.tsx` | Add photo + location to equipment cards |
| `src/components/schedule/PublicTrackingMap.tsx` | Improve route reliability |
| `src/pages/TechnicianOS.tsx` | Ensure location event is awaited |
| Multiple table pages | Add sortable columns (Customers, Equipment, ServiceOrders, Contracts, Inventory, Finance, Quotes, Employees, Leads, TimeHistory, PMOC, Teams, Users) |
| New: `src/hooks/useTableSort.ts` | Reusable sorting hook |

## Estimated Scope
~15 files modified, 1 new hook file. The sorting feature is the most widespread change but follows an existing pattern.

