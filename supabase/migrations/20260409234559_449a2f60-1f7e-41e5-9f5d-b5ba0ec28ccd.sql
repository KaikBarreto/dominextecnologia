
-- Add DELETE policy for financial_transactions
CREATE POLICY "Authenticated users can delete financial_transactions"
ON public.financial_transactions
FOR DELETE
TO authenticated
USING (true);

-- Add DELETE policy for contract_occurrences
CREATE POLICY "Authenticated users can delete contract_occurrences"
ON public.contract_occurrences
FOR DELETE
TO authenticated
USING (true);

-- Add DELETE policy for contract_items
CREATE POLICY "Authenticated users can delete contract_items"
ON public.contract_items
FOR DELETE
TO authenticated
USING (true);

-- Add DELETE policy for service_order_assignees
CREATE POLICY "Authenticated users can delete service_order_assignees"
ON public.service_order_assignees
FOR DELETE
TO authenticated
USING (true);

-- Add DELETE policy for os_photos
CREATE POLICY "Authenticated users can delete os_photos"
ON public.os_photos
FOR DELETE
TO authenticated
USING (true);
