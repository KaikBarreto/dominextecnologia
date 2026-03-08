-- Enable realtime for service_orders and form_responses
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.form_responses;

-- Add public SELECT policy on form_responses so non-logged users can see them
CREATE POLICY "Public can view form_responses" ON public.form_responses FOR SELECT USING (true);

-- Add public SELECT policy on service_orders so non-logged users can view OS
CREATE POLICY "Public can view service_orders" ON public.service_orders FOR SELECT USING (true);

-- Add public SELECT on service_order_equipment for public OS view
CREATE POLICY "Public can view service_order_equipment" ON public.service_order_equipment FOR SELECT USING (true);