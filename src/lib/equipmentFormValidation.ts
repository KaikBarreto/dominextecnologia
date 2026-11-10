import { z } from 'zod';

export function createEquipmentFormSchema(
  messages: { customerRequired: string; nameRequired: string },
) {
  return z.object({
    customer_id: z.string().min(1, messages.customerRequired),
    name: z.string().min(1, messages.nameRequired),
    category_id: z.string().optional(),
    identifier: z.string().optional(),
    brand: z.string().optional(),
    model: z.string().optional(),
    serial_number: z.string().optional(),
    capacity: z.string().optional(),
    location: z.string().optional(),
    install_date: z.string().optional(),
    warranty_until: z.string().optional(),
    notes: z.string().optional(),
  });
}

export type EquipmentFormData = z.infer<ReturnType<typeof createEquipmentFormSchema>>;
