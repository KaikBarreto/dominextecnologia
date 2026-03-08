-- Add 'a_caminho' to os_status enum
ALTER TYPE os_status ADD VALUE 'a_caminho' BEFORE 'em_andamento';

-- Insert new os_status row
INSERT INTO os_statuses (key, label, color, position, is_default) 
VALUES ('a_caminho', 'A Caminho', '#6366f1', 1, true);

-- Shift existing positions
UPDATE os_statuses SET position = position + 1 WHERE key IN ('em_andamento', 'concluida', 'cancelada');

-- Public can view locations by service_order_id (for customer tracking)
CREATE POLICY "Public can view locations by service_order" 
ON technician_locations FOR SELECT 
USING (true);
