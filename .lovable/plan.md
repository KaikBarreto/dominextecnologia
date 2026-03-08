

## Plan: NPS and Post-Service Satisfaction System

### Overview
Add a complete NPS (Net Promoter Score) and post-service satisfaction survey system. Customers receive a feedback link after service completion; responses feed a dashboard tab inside Service Orders.

### Database Changes

**New table: `service_ratings`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| service_order_id | uuid FK | unique, one rating per OS |
| nps_score | integer | 0-10 |
| quality_rating | integer | 1-5 stars (service quality) |
| punctuality_rating | integer | 1-5 stars |
| professionalism_rating | integer | 1-5 stars |
| comment | text | optional free text |
| rated_by_name | text | who filled it |
| rated_at | timestamptz | default now() |
| token | text unique | public access token for the form |
| created_at | timestamptz | |

RLS: Public INSERT/UPDATE via token (no auth needed — customer fills it). Authenticated SELECT for dashboard.

### Components

**1. Public Rating Page — `src/pages/ServiceRating.tsx`**
- Route: `/avaliacao/:token` (no auth required)
- Shows: company logo, OS summary, NPS slider (0-10 with emoji faces), 3 star ratings, comment textarea, submit button
- After submit: thank-you screen
- Mobile-first design

**2. Rating link generation**
- When OS status changes to `concluida`, auto-generate a `token` row in `service_ratings` (via mutation in `useServiceOrders`)
- Show "Enviar Avaliação" button in `OSReport.tsx` and `ServiceOrderViewDialog` that copies the rating link

**3. NPS Section in OSReport**
- After signatures section, if rating exists, show: NPS score badge, star ratings, comment

**4. New tab "NPS e Satisfação" in `ServiceOrders.tsx`**
- Add a Tabs wrapper: "Ordens de Serviço" | "NPS e Satisfação"
- Dashboard content (`NpsDashboard.tsx`):
  - **KPI cards**: NPS score (with Promoters/Neutrals/Detractors %), average quality/punctuality/professionalism stars, total responses, response rate
  - **NPS gauge chart** (recharts): -100 to +100 scale
  - **NPS trend line chart**: monthly NPS over time
  - **Star distribution bar chart**: per category
  - **Recent comments list**: with OS number, customer name, date, scores, comment
  - **Date range filter** (reuse existing `DateRangeFilter`)

**5. Hook — `src/hooks/useServiceRatings.ts`**
- Queries `service_ratings` joined with `service_orders` + `customers`
- Computes NPS classification (0-6 detractor, 7-8 passive, 9-10 promoter)

### Files to Create/Modify

| File | Action |
|------|--------|
| Migration | Create `service_ratings` table + RLS |
| `src/hooks/useServiceRatings.ts` | New hook for CRUD + NPS calculations |
| `src/pages/ServiceRating.tsx` | New public rating page |
| `src/components/service-orders/NpsDashboard.tsx` | New dashboard component |
| `src/pages/ServiceOrders.tsx` | Add tabs wrapper with NPS tab |
| `src/components/technician/OSReport.tsx` | Show rating data + copy link button |
| `src/components/service-orders/ServiceOrderViewDialog.tsx` | Add "Enviar Avaliação" button |
| `src/hooks/useServiceOrders.ts` | Auto-create rating token on `concluida` |
| `src/App.tsx` | Add public route `/avaliacao/:token` |

### NPS Calculation Logic
- **Promoters** (9-10): % of total
- **Detractors** (0-6): % of total
- **NPS** = % Promoters − % Detractors (range -100 to +100)

