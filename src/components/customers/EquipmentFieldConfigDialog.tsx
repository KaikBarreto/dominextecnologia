import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus, Trash2, GripVertical, Eye, EyeOff, Type, Hash, Calendar, ToggleLeft,
  List, Check, X, ChevronUp, ChevronDown, Settings2,
} from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEquipmentFieldConfig, type EquipmentFieldConfig } from '@/hooks/useEquipmentFieldConfig';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldType = EquipmentFieldConfig['field_type'];

// Ícone por tipo — sem label (label vem do i18n dentro do componente).
const FIELD_TYPE_ICONS: Record<string, ReactNode> = {
  text: <Type className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  date: <Calendar className="h-4 w-4" />,
  boolean: <ToggleLeft className="h-4 w-4" />,
  select: <List className="h-4 w-4" />,
};

function getFieldTypeIcon(type: string): ReactNode {
  return FIELD_TYPE_ICONS[type] ?? <Type className="h-4 w-4" />;
}

// ─── Editor de opções (lista de inputs + adicionar/remover) ──────────────────
function OptionsEditor({
  options,
  onChange,
  optionsLabel,
  optionPlaceholderTemplate,
  removeOptionAriaLabel,
  addOptionLabel,
}: {
  options: string[];
  onChange: (next: string[]) => void;
  optionsLabel: string;
  optionPlaceholderTemplate: string;
  removeOptionAriaLabel: string;
  addOptionLabel: string;
}) {
  const list = options.length > 0 ? options : [''];

  const update = (idx: number, value: string) => {
    const next = [...list];
    next[idx] = value;
    onChange(next);
  };

  const add = () => onChange([...list, '']);

  const remove = (idx: number) => {
    const next = list.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : ['']);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{optionsLabel}</Label>
      <div className="space-y-2">
        {list.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              className="h-8 flex-1"
              placeholder={optionPlaceholderTemplate.replace('{n}', String(idx + 1))}
              value={opt}
              onChange={(e) => update(idx, e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive shrink-0"
              onClick={() => remove(idx)}
              aria-label={removeOptionAriaLabel}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> {addOptionLabel}
      </Button>
    </div>
  );
}

// ─── Campo de nome com auto-resize (quebra linha em vez de truncar) ──────────
// Textarea ghost: sem borda em repouso, fundo no hover, realce no foco. Cresce
// em altura conforme o texto. Commit no blur (mesma lógica do onLabelChange).
function AutoResizeNameField({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);

  // Re-sincroniza quando o valor salvo muda (ex: outro device, refetch).
  useEffect(() => setDraft(value), [value]);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Ajusta a altura no mount e a cada mudança do conteúdo.
  useLayoutEffect(resize, [draft]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onInput={resize}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      className={cn(
        'flex-1 min-w-0 resize-none overflow-hidden rounded-md bg-transparent px-2 py-1.5 text-sm leading-tight',
        'border border-transparent shadow-none outline-none transition-colors',
        'hover:bg-muted/60 focus-visible:bg-background focus-visible:border-input',
        className,
      )}
    />
  );
}

// ─── Linha desktop arrastável ────────────────────────────────────────────────
function SortableFieldRow({
  field,
  justSaved,
  fieldTypeOptions,
  getFieldTypeMeta,
  labels,
  onLabelChange,
  onToggleVisible,
  onToggleRequired,
  onTypeChange,
  onOptionsChange,
  onDelete,
}: {
  field: EquipmentFieldConfig;
  justSaved: boolean;
  fieldTypeOptions: { value: FieldType; label: string }[];
  getFieldTypeMeta: (type: string) => { icon: ReactNode; label: string };
  labels: {
    dragAriaLabel: string;
    savedLabel: string;
    hiddenLabel: string;
    visibleAriaLabel: string;
    hiddenAriaLabel: string;
    typeDataPreserved: string;
    optionsLabel: string;
    optionPlaceholderTemplate: string;
    removeOptionAriaLabel: string;
    addOptionLabel: string;
  };
  onLabelChange: (label: string) => void;
  onToggleVisible: () => void;
  onToggleRequired: () => void;
  onTypeChange: (type: FieldType) => void;
  onOptionsChange: (options: string[]) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const typeMeta = getFieldTypeMeta(field.field_type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-start gap-2 px-3 py-2">
        {/* Coluna: alça de arraste */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="w-5 shrink-0 flex justify-center pt-1.5 touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          aria-label={labels.dragAriaLabel}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Coluna: Nome (flexível, quebra linha) + selo Salvo / micro-rótulo Oculto */}
        <div className={cn('flex-1 min-w-0 flex items-start gap-2', !field.is_visible && 'opacity-60')}>
          <AutoResizeNameField
            value={field.label}
            onCommit={onLabelChange}
          />
          {justSaved && (
            <span className="inline-flex items-center gap-1 text-xs text-success shrink-0 pt-1.5">
              <Check className="h-3.5 w-3.5" /> {labels.savedLabel}
            </span>
          )}
          {!field.is_visible && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0 pt-1.5">
              <EyeOff className="h-3.5 w-3.5" /> {labels.hiddenLabel}
            </span>
          )}
        </div>

        {/* Coluna: Tipo (ícone à esquerda, label à direita, inline) */}
        <div className={cn('shrink-0', !field.is_visible && 'opacity-60')}>
          <Select value={field.field_type} onValueChange={(v) => onTypeChange(v as FieldType)}>
            <SelectTrigger className="h-8 w-40 [&>span]:!flex [&>span]:flex-row [&>span]:items-center border-transparent bg-transparent shadow-none px-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus:bg-background focus:border-input transition-colors">
              <span className="flex flex-row items-center gap-2 min-w-0 whitespace-nowrap">
                <span className="shrink-0">{typeMeta.icon}</span>
                <span className="truncate">{typeMeta.label}</span>
              </span>
            </SelectTrigger>
            <SelectContent>
              {fieldTypeOptions.map((o) => {
                const meta = getFieldTypeMeta(o.value);
                return (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex flex-row items-center gap-2 whitespace-nowrap">
                      <span className="shrink-0">{meta.icon}</span>
                      {o.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Coluna: Visível (Switch on/off, com ícone de olho como rótulo) */}
        <div className="w-14 shrink-0 flex items-center justify-center gap-1 pt-1">
          {field.is_visible
            ? <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
          <Switch
            checked={field.is_visible}
            onCheckedChange={onToggleVisible}
            aria-label={field.is_visible ? labels.visibleAriaLabel : labels.hiddenAriaLabel}
          />
        </div>

        {/* Coluna: Obrigatório */}
        <div className="w-16 shrink-0 flex justify-center pt-1">
          <Switch checked={field.is_required} onCheckedChange={onToggleRequired} />
        </div>

        {/* Coluna: Excluir */}
        <div className="w-10 shrink-0 flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {field.field_type === 'select' && (
        <div className="px-3 pb-3 pl-10 space-y-2">
          <OptionsEditor
            options={field.options ?? []}
            onChange={onOptionsChange}
            optionsLabel={labels.optionsLabel}
            optionPlaceholderTemplate={labels.optionPlaceholderTemplate}
            removeOptionAriaLabel={labels.removeOptionAriaLabel}
            addOptionLabel={labels.addOptionLabel}
          />
          <p className="text-xs text-muted-foreground">
            {labels.typeDataPreserved}
          </p>
        </div>
      )}
    </div>
  );
}

export function EquipmentFieldConfigDialog({ open, onOpenChange }: Props) {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const tfc = MESSAGES[locale].app.equipment.fieldConfig;

  // Computed from i18n — tipos CANÔNICOS traduzem.
  const FIELD_TYPE_META_I18N: Record<string, { icon: ReactNode; label: string }> = {
    text: { icon: getFieldTypeIcon('text'), label: tfc.typeText },
    number: { icon: getFieldTypeIcon('number'), label: tfc.typeNumber },
    date: { icon: getFieldTypeIcon('date'), label: tfc.typeDate },
    boolean: { icon: getFieldTypeIcon('boolean'), label: tfc.typeBoolean },
    select: { icon: getFieldTypeIcon('select'), label: tfc.typeSelect },
  };
  const getFieldTypeMetaI18n = (type: string) =>
    FIELD_TYPE_META_I18N[type] ?? { icon: getFieldTypeIcon(type), label: type };

  const FIELD_TYPE_OPTIONS_I18N: { value: FieldType; label: string }[] = [
    { value: 'text', label: tfc.typeText },
    { value: 'number', label: tfc.typeNumber },
    { value: 'date', label: tfc.typeDate },
    { value: 'boolean', label: tfc.typeBoolean },
    { value: 'select', label: tfc.typeSelect },
  ];

  const sortableRowLabels = {
    dragAriaLabel: tfc.dragAriaLabel,
    savedLabel: tfc.labelSaved,
    hiddenLabel: tfc.labelHidden,
    visibleAriaLabel: tfc.fieldVisible,
    hiddenAriaLabel: tfc.fieldHidden,
    typeDataPreserved: tfc.typeDataPreserved,
    optionsLabel: tfc.optionsLabel,
    optionPlaceholderTemplate: tfc.optionPlaceholder,
    removeOptionAriaLabel: tfc.removeOptionAriaLabel,
    addOptionLabel: tfc.addOption,
  };

  const { fields, isLoading, updateField, createField, deleteField, reorderFields } = useEquipmentFieldConfig();
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');
  const [newFieldOptions, setNewFieldOptions] = useState<string[]>(['']);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Campo aberto no editor de detalhe (mobile).
  const [editId, setEditId] = useState<string | null>(null);
  // Feedback sutil de "salvo" por campo (some após ~1.5s).
  const [savedId, setSavedId] = useState<string | null>(null);

  const editField = useMemo(() => fields.find((f) => f.id === editId) ?? null, [fields, editId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Sinaliza "salvo" e limpa depois de 1.5s.
  const flashSaved = (id: string) => {
    setSavedId(id);
  };
  useEffect(() => {
    if (!savedId) return;
    const t = setTimeout(() => setSavedId(null), 1500);
    return () => clearTimeout(t);
  }, [savedId]);

  const patchField = (id: string, patch: Partial<EquipmentFieldConfig>) => {
    updateField.mutate({ id, ...patch }, { onSuccess: () => flashSaved(id) });
  };

  const handleToggleVisible = (field: EquipmentFieldConfig) => {
    patchField(field.id, { is_visible: !field.is_visible });
  };

  const handleToggleRequired = (field: EquipmentFieldConfig) => {
    patchField(field.id, { is_required: !field.is_required });
  };

  const handleLabelChange = (field: EquipmentFieldConfig, label: string) => {
    patchField(field.id, { label });
  };

  const handleTypeChange = (field: EquipmentFieldConfig, field_type: FieldType) => {
    // Ao virar lista de opções sem opções salvas, semeia uma vazia pro editor aparecer.
    const patch: Partial<EquipmentFieldConfig> = { field_type };
    if (field_type === 'select' && (!field.options || field.options.length === 0)) {
      patch.options = [];
    }
    patchField(field.id, patch);
  };

  const handleOptionsChange = (field: EquipmentFieldConfig, options: string[]) => {
    // Não persiste a cada tecla? Persistimos no blur via mutation simples — aqui salvamos direto.
    patchField(field.id, { options: options.filter((o) => o.trim() !== '') });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(fields, oldIndex, newIndex);
    reorderFields.mutate(reordered.map((f) => f.id));
  };

  const moveField = (field: EquipmentFieldConfig, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.id === field.id);
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    const reordered = arrayMove(fields, idx, target);
    reorderFields.mutate(reordered.map((f) => f.id));
  };

  const handleAddField = () => {
    if (!newFieldLabel.trim()) return;
    const fieldKey = `custom_${Date.now()}`;
    const cleanedOptions = newFieldOptions.map((o) => o.trim()).filter(Boolean);
    createField.mutate({
      field_key: fieldKey,
      label: newFieldLabel,
      field_type: newFieldType,
      options: newFieldType === 'select' ? cleanedOptions : undefined,
      is_visible: true,
      is_required: false,
      position: fields.length,
    });
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldOptions(['']);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteField.mutate(deleteId);
    setDeleteId(null);
  };

  // Bloco "adicionar novo campo" — usado em ambos viewports.
  const addBlock = (
    <div className="border-t pt-4">
      <p className="text-sm font-medium mb-2">{tfc.addFieldHeading}</p>
      <div className="flex gap-2">
        <Input
          placeholder={tfc.fieldNamePlaceholder}
          value={newFieldLabel}
          onChange={(e) => setNewFieldLabel(e.target.value)}
          className="flex-1"
          onKeyDown={(e) => e.key === 'Enter' && newFieldType !== 'select' && handleAddField()}
        />
        <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as FieldType)}>
          <SelectTrigger className="w-40 [&>span]:!flex [&>span]:flex-row [&>span]:items-center">
            <span className="flex flex-row items-center gap-2 min-w-0 whitespace-nowrap">
              <span className="shrink-0">{getFieldTypeMetaI18n(newFieldType).icon}</span>
              <span className="truncate">{getFieldTypeMetaI18n(newFieldType).label}</span>
            </span>
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPE_OPTIONS_I18N.map((o) => {
              const meta = getFieldTypeMetaI18n(o.value);
              return (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex flex-row items-center gap-2 whitespace-nowrap">
                    <span className="shrink-0">{meta.icon}</span>
                    {o.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {newFieldType !== 'select' && (
          <Button size="sm" onClick={handleAddField} disabled={!newFieldLabel.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      {newFieldType === 'select' && (
        <div className="mt-3 rounded-lg border bg-muted/30 p-3 space-y-3">
          <OptionsEditor
            options={newFieldOptions}
            onChange={setNewFieldOptions}
            optionsLabel={tfc.optionsLabel}
            optionPlaceholderTemplate={tfc.optionPlaceholder}
            removeOptionAriaLabel={tfc.removeOptionAriaLabel}
            addOptionLabel={tfc.addOption}
          />
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleAddField}
            disabled={!newFieldLabel.trim() || newFieldOptions.every((o) => !o.trim())}
          >
            <Plus className="h-4 w-4" /> {tfc.addField}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title={tfc.dialogTitle} className="sm:max-w-3xl">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {tfc.dialogDesc}
          </p>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : isMobile ? (
            // Mobile: cada campo em MobileListItem. Rename inline preservado no leading-content.
            // Ações secundárias (editar tipo/opções, mover, toggle, excluir) vão no overflow menu.
            <div className="rounded-xl border bg-card overflow-hidden">
              {fields.map((field, idx) => {
                const meta = getFieldTypeMetaI18n(field.field_type);

                const actions: ItemAction[] = [
                  {
                    key: 'configure',
                    label: tfc.menuConfigure,
                    icon: <Settings2 className="h-4 w-4" />,
                    variant: 'edit',
                    onClick: () => setEditId(field.id),
                  },
                  {
                    key: 'move-up',
                    label: tfc.menuMoveUp,
                    icon: <ChevronUp className="h-4 w-4" />,
                    disabled: idx === 0,
                    onClick: () => moveField(field, -1),
                  },
                  {
                    key: 'move-down',
                    label: tfc.menuMoveDown,
                    icon: <ChevronDown className="h-4 w-4" />,
                    disabled: idx === fields.length - 1,
                    onClick: () => moveField(field, 1),
                  },
                  {
                    key: 'toggle-visible',
                    label: field.is_visible ? tfc.menuToggleHide : tfc.menuToggleShow,
                    icon: field.is_visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
                    onClick: () => handleToggleVisible(field),
                  },
                  {
                    key: 'toggle-required',
                    label: field.is_required ? tfc.menuMakeOptional : tfc.menuMakeRequired,
                    icon: <ToggleLeft className="h-4 w-4" />,
                    onClick: () => handleToggleRequired(field),
                  },
                  {
                    key: 'delete',
                    label: tfc.delete,
                    icon: <Trash2 className="h-4 w-4" />,
                    variant: 'destructive',
                    onClick: () => setDeleteId(field.id),
                  },
                ];

                return (
                  <MobileListItem
                    key={field.id}
                    leading={
                      <div
                        className={cn(
                          'h-10 w-10 rounded-lg flex items-center justify-center bg-muted text-muted-foreground',
                          !field.is_visible && 'opacity-50',
                        )}
                        aria-hidden
                      >
                        {field.is_visible ? meta.icon : <EyeOff className="h-4 w-4" />}
                      </div>
                    }
                    title={
                      // Rename inline — central no UX. onClick não navega; só edita.
                      // Textarea ghost com auto-resize: quebra linha em vez de truncar.
                      <div
                        className={cn('w-full', !field.is_visible && 'opacity-60')}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AutoResizeNameField
                          value={field.label}
                          onCommit={(next) => handleLabelChange(field, next)}
                          className="px-0 text-[15px] font-medium hover:bg-transparent"
                        />
                      </div>
                    }
                    subtitle={
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span>{getFieldTypeMetaI18n(field.field_type).label}</span>
                        {savedId === field.id && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="inline-flex items-center gap-1 text-success">
                              <Check className="h-3 w-3" /> {tfc.labelSaved}
                            </span>
                          </>
                        )}
                        {!field.is_visible && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="inline-flex items-center gap-1">
                              <EyeOff className="h-3 w-3" /> {tfc.labelHidden}
                            </span>
                          </>
                        )}
                        {field.is_required && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="text-warning">{tfc.labelRequired}</span>
                          </>
                        )}
                      </span>
                    }
                    actions={actions}
                  />
                );
              })}
              {fields.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-6">{tfc.noneConfigured}</p>
              )}
            </div>
          ) : (
            // Desktop: lista com drag-and-drop para reordenar.
            fields.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {tfc.noneConfigured}
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Cabeçalho da tabela — colunas alinhadas às linhas */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="w-5 shrink-0" aria-hidden />
                  <span className="flex-1 min-w-0 px-2">{tfc.colName}</span>
                  <span className="w-40 shrink-0 px-2">{tfc.colType}</span>
                  <span className="w-14 shrink-0 text-center">{tfc.colVisible}</span>
                  <span className="w-16 shrink-0 text-center">{tfc.colRequired}</span>
                  <span className="w-10 shrink-0" aria-hidden />
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    <div>
                      {fields.map((field) => (
                        <SortableFieldRow
                          key={field.id}
                          field={field}
                          justSaved={savedId === field.id}
                          fieldTypeOptions={FIELD_TYPE_OPTIONS_I18N}
                          getFieldTypeMeta={getFieldTypeMetaI18n}
                          labels={sortableRowLabels}
                          onLabelChange={(label) => handleLabelChange(field, label)}
                          onToggleVisible={() => handleToggleVisible(field)}
                          onToggleRequired={() => handleToggleRequired(field)}
                          onTypeChange={(type) => handleTypeChange(field, type)}
                          onOptionsChange={(opts) => handleOptionsChange(field, opts)}
                          onDelete={() => setDeleteId(field.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )
          )}

          {addBlock}
        </div>
      </ResponsiveModal>

      {/* Editor de tipo + opções por campo (mobile: ações secundárias no dialog). */}
      <ResponsiveModal
        open={!!editField}
        onOpenChange={(o) => { if (!o) setEditId(null); }}
        title={editField ? tfc.configFieldTitle.replace('{name}', editField.label) : tfc.configFieldTitleFallback}
      >
        {editField && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{tfc.typeLabel}</Label>
              <Select
                value={editField.field_type}
                onValueChange={(v) => handleTypeChange(editField, v as FieldType)}
              >
                <SelectTrigger className="[&>span]:!flex [&>span]:flex-row [&>span]:items-center">
                  <span className="flex flex-row items-center gap-2 min-w-0 whitespace-nowrap">
                    <span className="shrink-0">{getFieldTypeMetaI18n(editField.field_type).icon}</span>
                    <span className="truncate">{getFieldTypeMetaI18n(editField.field_type).label}</span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPE_OPTIONS_I18N.map((o) => {
                    const meta = getFieldTypeMetaI18n(o.value);
                    return (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex flex-row items-center gap-2 whitespace-nowrap">
                          <span className="shrink-0">{meta.icon}</span>
                          {o.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {tfc.typeDataPreserved}
              </p>
            </div>

            {editField.field_type === 'select' && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <OptionsEditor
                  options={editField.options ?? []}
                  onChange={(opts) => handleOptionsChange(editField, opts)}
                  optionsLabel={tfc.optionsLabel}
                  optionPlaceholderTemplate={tfc.optionPlaceholder}
                  removeOptionAriaLabel={tfc.removeOptionAriaLabel}
                  addOptionLabel={tfc.addOption}
                />
              </div>
            )}
          </div>
        )}
      </ResponsiveModal>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tfc.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {tfc.deleteDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tfc.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {tfc.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
