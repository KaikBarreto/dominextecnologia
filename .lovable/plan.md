

## Plan: Admin Companies Parity with EcoSistema + Address Fields in Form + Build Fix

### Build Error Fix
The build error is a PWA workbox size limit. The `maximumFileSizeToCacheInBytes` is already set to 5MB but the bundle is 5.25MB. Increase to 6MB.

### Font Confirmation
Yes, the entire Dominex system uses **Montserrat** as the default sans-serif font, configured in `tailwind.config.ts` and loaded via Google Fonts in `index.html`.

### 1. Admin Companies - Kanban + List View (EcoSistema parity)

Refactor `AdminCompanies.tsx` to support **two view modes** (list + kanban) with a toggle, matching the EcoSistema reference:

**List View (Table):**
- Columns: Status (inline Select), Responsável (master user), Empresa, Origem (badge with color), Plano (badge), Vencimento (conditional color: green >7d, amber 0-7d, purple -7d, red beyond), Valor Mensal, Ações (WhatsApp, Edit, Delete)
- Inline status editing via Select dropdown
- Sortable columns with pagination
- Delete with name confirmation dialog

**Kanban View:**
- 3 columns: ATIVOS (green), TESTANDO (amber), INATIVOS (rose)
- Cards with avatar, plan label, monthly value, origin badge, expiration indicator
- Drag-and-drop to change status
- Edit/Delete actions on card hover

**New files:**
- `src/components/admin/CompanyTable.tsx` - extracted table component
- `src/components/admin/CompanyKanbanBoard.tsx` - kanban board
- `src/components/admin/CompanyKanbanCard.tsx` - kanban card

### 2. Company Form - Structured Address with CEP

Update `CompanyFormModal.tsx` to replace the single address input with a compact structured address section using the existing `CepLookup` component:
- CEP (with auto-lookup) + Logradouro on one row
- Número + Complemento on one row  
- Bairro + Cidade + Estado on one row
- All wrapped in an Accordion for compactness
- On save, concatenate into a formatted address string for the `companies.address` field

### 3. Increase PWA Cache Limit

Update `vite.config.ts`: change `maximumFileSizeToCacheInBytes` from 5MB to 6MB.

### Technical Details

- Adapt EcoSistema's code patterns (origin badges, expiration colors, inline selects) to work with Dominex's data model (no `salespeople` table, plans are starter/pro/enterprise)
- Reuse existing `CepLookup` component for address auto-fill
- Store structured address fields in form state, concatenate to single string for DB storage
- View mode preference saved to localStorage

