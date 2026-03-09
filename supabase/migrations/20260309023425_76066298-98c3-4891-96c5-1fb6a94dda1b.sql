-- 1. Recursos globais de custo (veículos, ferramentas, EPIs, brindes)
CREATE TABLE cost_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) NOT NULL,
  category text NOT NULL CHECK (category IN ('vehicle','tool','gift','epi','other')),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  monthly_hours integer DEFAULT 176,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Componentes de custo de cada recurso (linhas da planilha)
CREATE TABLE cost_resource_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid REFERENCES cost_resources(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  value numeric(10,2) NOT NULL DEFAULT 0,
  is_monthly boolean DEFAULT true,
  annual_value numeric(10,2),
  sort_order integer DEFAULT 0
);

-- 3. Vinculação de recursos globais a serviços
CREATE TABLE service_cost_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES service_types(id) ON DELETE CASCADE NOT NULL,
  resource_id uuid REFERENCES cost_resources(id) ON DELETE CASCADE NOT NULL,
  override_value numeric(10,2),
  UNIQUE(service_id, resource_id)
);

-- 4. Brindes: custo por execução do serviço
CREATE TABLE service_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES service_types(id) ON DELETE CASCADE NOT NULL,
  resource_id uuid REFERENCES cost_resources(id),
  name text NOT NULL,
  unit_cost numeric(10,2) DEFAULT 0,
  quantity numeric(6,2) DEFAULT 1,
  subtotal numeric(10,2) GENERATED ALWAYS AS (unit_cost * quantity) STORED
);

-- 5. View calculada de custo/hora por recurso
CREATE VIEW cost_resources_with_rate AS
SELECT 
  r.*,
  COALESCE(SUM(i.value), 0) AS total_monthly_cost,
  CASE WHEN r.monthly_hours > 0 THEN COALESCE(SUM(i.value), 0) / r.monthly_hours ELSE 0 END AS hourly_rate
FROM cost_resources r
LEFT JOIN cost_resource_items i ON i.resource_id = r.id
GROUP BY r.id;

-- Enable RLS
ALTER TABLE cost_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_resource_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_cost_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_gifts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cost_resources
CREATE POLICY "Company users can view cost_resources"
ON cost_resources FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "System managers can manage cost_resources"
ON cost_resources FOR ALL
USING (company_id = get_user_company_id(auth.uid()) AND can_manage_system(auth.uid()))
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND can_manage_system(auth.uid()));

-- RLS Policies for cost_resource_items (via resource join)
CREATE POLICY "Company users can view cost_resource_items"
ON cost_resource_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM cost_resources cr
  WHERE cr.id = cost_resource_items.resource_id
  AND cr.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "System managers can manage cost_resource_items"
ON cost_resource_items FOR ALL
USING (EXISTS (
  SELECT 1 FROM cost_resources cr
  WHERE cr.id = cost_resource_items.resource_id
  AND cr.company_id = get_user_company_id(auth.uid())
  AND can_manage_system(auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM cost_resources cr
  WHERE cr.id = cost_resource_items.resource_id
  AND cr.company_id = get_user_company_id(auth.uid())
  AND can_manage_system(auth.uid())
));

-- RLS Policies for service_cost_resources
CREATE POLICY "Authenticated users can view service_cost_resources"
ON service_cost_resources FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "System managers can manage service_cost_resources"
ON service_cost_resources FOR ALL
USING (can_manage_system(auth.uid()))
WITH CHECK (can_manage_system(auth.uid()));

-- RLS Policies for service_gifts
CREATE POLICY "Authenticated users can view service_gifts"
ON service_gifts FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "System managers can manage service_gifts"
ON service_gifts FOR ALL
USING (can_manage_system(auth.uid()))
WITH CHECK (can_manage_system(auth.uid()));

-- Trigger for updated_at on cost_resources
CREATE TRIGGER update_cost_resources_updated_at
  BEFORE UPDATE ON cost_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();