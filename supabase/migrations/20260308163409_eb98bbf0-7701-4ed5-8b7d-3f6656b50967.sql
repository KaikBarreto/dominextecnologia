-- Allow public to read company_settings (for portal header)
CREATE POLICY "Public can view company_settings"
  ON public.company_settings FOR SELECT
  USING (true);

-- Allow public to read equipment (for portal equipment list)
CREATE POLICY "Public can view equipment for portal"
  ON public.equipment FOR SELECT
  USING (true);

-- Allow public to read customers (for portal customer name)
CREATE POLICY "Public can view customers for portal"
  ON public.customers FOR SELECT
  USING (true);