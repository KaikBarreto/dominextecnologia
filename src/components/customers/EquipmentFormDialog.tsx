import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ImagePlus, X } from 'lucide-react';
import { useEquipmentFieldConfig } from '@/hooks/useEquipmentFieldConfig';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { buildStorageFilePath } from '@/utils/storagePath';
import type { Equipment, Customer } from '@/types/database';
import type { EquipmentCategory } from '@/hooks/useEquipmentCategories';

const CACHE_KEY = 'equipment-form-draft';

const equipmentSchema = z.object({
  customer_id: z.string().min(1, 'Selecione um cliente'),
  name: z.string().min(1, 'Nome é obrigatório'),
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

type EquipmentFormData = z.infer<typeof equipmentSchema>;

interface EquipmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment?: (Equipment & { customer?: any }) | null;
  onSubmit: (data: EquipmentFormData) => Promise<void>;
  customers: Customer[];
  categories?: EquipmentCategory[];
  isLoading?: boolean;
  equipmentCount?: number;
}

const builtInFieldKeys = new Set(['brand', 'model', 'serial_number', 'capacity', 'location', 'install_date']);

export function EquipmentFormDialog({
  open, onOpenChange, equipment, onSubmit, customers, categories = [], isLoading, equipmentCount = 0,
}: EquipmentFormDialogProps) {
  const { fields: fieldConfig } = useEquipmentFieldConfig();
  const { toast } = useToast();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initializedContextRef = useRef<string | null>(null);

  const autoIdentifier = useMemo(() => {
    if (equipment?.identifier) return equipment.identifier;
    const part1 = Math.floor(Math.random() * 9000000000000000) + 1000000000000000;
    return String(part1);
  }, [equipment]);

  const defaultCustomerId = equipment?.customer_id ?? (customers.length === 1 ? customers[0].id : '');
  const formContextKey = equipment?.id ?? `new:${defaultCustomerId || 'none'}`;

  const form = useForm<EquipmentFormData>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: {
      customer_id: '', name: '', category_id: '', identifier: '',
      brand: '', model: '', serial_number: '', capacity: '',
      location: '', install_date: '', warranty_until: '', notes: '',
    },
  });

  // Save form data to sessionStorage on every change
  const saveCache = useCallback(() => {
    if (!open) return;
    const values = form.getValues();
    const cache = { values, customFieldValues, editingId: equipment?.id ?? null };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }, [open, form, customFieldValues, equipment]);

  // Watch form changes and cache
  useEffect(() => {
    if (!open) return;
    const subscription = form.watch(() => saveCache());
    return () => subscription.unsubscribe();
  }, [open, form, saveCache]);

  // Also cache custom fields when they change
  useEffect(() => {
    saveCache();
  }, [customFieldValues, saveCache]);

  useEffect(() => {
    if (!open) {
      // Clear cache when dialog closes (submitted or cancelled)
      sessionStorage.removeItem(CACHE_KEY);
      initializedContextRef.current = null;
      return;
    }

    // Prevent unwanted resets while the same dialog/context remains open
    if (initializedContextRef.current === formContextKey) return;
    initializedContextRef.current = formContextKey;

    // Try to restore from cache only if same context (same equipment id or same create context)
    const cached = sessionStorage.getItem(CACHE_KEY);
    let restored = false;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const cachedEditingId = parsed.editingId ?? null;
        const currentEditingId = equipment?.id ?? null;
        const sameContext = currentEditingId === cachedEditingId;

        // Only restore if values have meaningful content (not all empty)
        if (sameContext && parsed.values && (parsed.values.name || parsed.values.customer_id)) {
          form.reset(parsed.values);
          setCustomFieldValues(parsed.customFieldValues ?? {});
          restored = true;
        }
      } catch {
        // ignore cache parse errors
      }
    }

    if (!restored) {
      sessionStorage.removeItem(CACHE_KEY);
      form.reset({
        customer_id: defaultCustomerId,
        name: equipment?.name ?? '',
        category_id: equipment?.category_id ?? '',
        identifier: equipment?.identifier ?? autoIdentifier,
        brand: equipment?.brand ?? '',
        model: equipment?.model ?? '',
        serial_number: equipment?.serial_number ?? '',
        capacity: equipment?.capacity ?? '',
        location: equipment?.location ?? '',
        install_date: equipment?.install_date ?? '',
        warranty_until: (equipment as any)?.warranty_until ?? '',
        notes: equipment?.notes ?? '',
      });

      // Restore custom field values from equipment.custom_fields
      const cf: Record<string, string> = {};
      if (equipment?.custom_fields) {
        Object.entries(equipment.custom_fields).forEach(([k, v]) => {
          cf[k] = String(v ?? '');
        });
      }
      setCustomFieldValues(cf);
    }

    setPhotoFile(null);
    setPhotoPreview(equipment?.photo_url ?? null);
  }, [open, formContextKey, form, defaultCustomerId, equipment, autoIdentifier]);

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return null;

    setUploadingPhoto(true);
    try {
      const path = buildStorageFilePath({ folder: 'photos', fileName: photoFile.name });
      const { error } = await supabase.storage.from('equipment-files').upload(path, photoFile);
      if (error) throw error;

      const { data } = supabase.storage.from('equipment-files').getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const processed = await processImageFile(file);
      setPhotoFile(processed);
      setPhotoPreview(URL.createObjectURL(processed));
    }
  };

  const handleSubmit = async (data: EquipmentFormData) => {
    let photo_url = equipment?.photo_url;
    if (photoFile) {
      photo_url = await uploadPhoto();
    }

    const cleaned: any = { ...data, photo_url };
    // Convert empty strings to null so updates actually clear values
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key] === '') cleaned[key] = null;
    });
    cleaned.customer_id = data.customer_id;
    cleaned.name = data.name;

    // Merge custom fields into custom_fields jsonb
    const existingCustom = equipment?.custom_fields ?? {};
    const mergedCustom = { ...existingCustom, ...customFieldValues };
    // Remove empty values
    Object.keys(mergedCustom).forEach(k => {
      if (!mergedCustom[k]) delete mergedCustom[k];
    });
    if (Object.keys(mergedCustom).length > 0) {
      cleaned.custom_fields = mergedCustom;
    }

    await onSubmit(cleaned);
    sessionStorage.removeItem(CACHE_KEY);
    form.reset();
    setCustomFieldValues({});
    onOpenChange(false);
  };

  const fieldKeyToName: Record<string, keyof EquipmentFormData> = {
    brand: 'brand', model: 'model', serial_number: 'serial_number',
    capacity: 'capacity', location: 'location', install_date: 'install_date',
  };

  const visibleFields = fieldConfig.filter(f => f.is_visible);

  // Split into built-in and custom
  const builtInVisible = visibleFields.filter(f => builtInFieldKeys.has(f.field_key));
  const customVisible = visibleFields.filter(f => !builtInFieldKeys.has(f.field_key));

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={equipment ? 'Editar Equipamento' : 'Novo Equipamento'}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Photo upload */}
            <div className="sm:col-span-2">
              <FormLabel>Foto</FormLabel>
              <div className="mt-1.5 flex items-center gap-4">
                {photoPreview ? (
                  <div className="relative h-24 w-24 rounded-lg overflow-hidden border bg-muted">
                    <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 hover:bg-background"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-[10px]">Adicionar</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
            </div>
            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl><Input placeholder="Nome do equipamento" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Identificador</FormLabel>
                  <FormControl><Input placeholder="Gerado automaticamente" {...field} readOnly className="bg-muted" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {categories.length > 0 && (
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
                              {cat.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Built-in configurable fields */}
            {builtInVisible.map((fc) => {
              const fieldName = fieldKeyToName[fc.field_key];
              if (!fieldName) return null;
              return (
                <FormField
                  key={fc.id}
                  control={form.control}
                  name={fieldName}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fc.label}{fc.is_required && ' *'}</FormLabel>
                      <FormControl>
                        {fc.field_type === 'date' ? (
                          <Input type="date" {...field} value={field.value ?? ''} />
                        ) : fc.field_type === 'number' ? (
                          <Input type="number" placeholder={fc.label} {...field} />
                        ) : (
                          <Input placeholder={fc.label} {...field} />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              );
            })}

            {/* Custom user-created fields (stored in custom_fields jsonb) */}
            {customVisible.map((fc) => (
              <div key={fc.id} className="space-y-2">
                <FormLabel>{fc.label}{fc.is_required && ' *'}</FormLabel>
                {fc.field_type === 'date' ? (
                  <Input
                    type="date"
                    value={customFieldValues[fc.field_key] ?? ''}
                    onChange={(e) => setCustomFieldValues(prev => ({ ...prev, [fc.field_key]: e.target.value }))}
                  />
                ) : fc.field_type === 'number' ? (
                  <Input
                    type="number"
                    placeholder={fc.label}
                    value={customFieldValues[fc.field_key] ?? ''}
                    onChange={(e) => setCustomFieldValues(prev => ({ ...prev, [fc.field_key]: e.target.value }))}
                  />
                ) : fc.field_type === 'boolean' ? (
                  <Select
                    value={customFieldValues[fc.field_key] ?? ''}
                    onValueChange={(v) => setCustomFieldValues(prev => ({ ...prev, [fc.field_key]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">Sim</SelectItem>
                      <SelectItem value="nao">Não</SelectItem>
                    </SelectContent>
                  </Select>
                ) : fc.field_type === 'select' && fc.options?.length ? (
                  <Select
                    value={customFieldValues[fc.field_key] ?? ''}
                    onValueChange={(v) => setCustomFieldValues(prev => ({ ...prev, [fc.field_key]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {fc.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder={fc.label}
                    value={customFieldValues[fc.field_key] ?? ''}
                    onChange={(e) => setCustomFieldValues(prev => ({ ...prev, [fc.field_key]: e.target.value }))}
                  />
                )}
              </div>
            ))}

            <FormField
              control={form.control}
              name="warranty_until"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Validade da Garantia</FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observações</FormLabel>
                  <FormControl><Textarea placeholder="Observações adicionais" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading || uploadingPhoto}>
              {(isLoading || uploadingPhoto) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {equipment ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </Form>
    </ResponsiveModal>
  );
}
