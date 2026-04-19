import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, GripVertical, Pencil, Check, X, Tv, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DomiflixSectionWithTitleIds, useCreateSection, useDeleteSection,
  useDomiflixSectionsWithTitles, useReorderSections, useUpdateSection, useUpdateSectionTitles,
} from "@/hooks/useDomiflixSections";
import { useDomiflixTitles, DomiflixTitle } from "@/hooks/useDomiflix";
import { cn } from "@/lib/utils";

function TitlePicker({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const { data: titles = [] } = useDomiflixTitles();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return titles;
    return titles.filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
  }, [titles, search]);
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };
  return (
    <div className="space-y-3">
      <Input placeholder="Buscar títulos..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">Nenhum título encontrado</p>
        ) : filtered.map((t) => {
          const checked = selectedIds.includes(t.id);
          return (
            <button key={t.id} type="button" onClick={() => toggle(t.id)}
              className={cn("w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors", checked && "bg-primary/10")}>
              <div className={cn("w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                checked ? "bg-primary border-primary text-primary-foreground" : "border-input")}>
                {checked && <Check className="w-3 h-3" />}
              </div>
              <div className="w-10 h-6 flex-shrink-0 rounded overflow-hidden bg-muted">
                {(t.banner_url || t.thumbnail_url) ? (
                  <img src={t.banner_url || t.thumbnail_url || ""} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {t.type === "series" ? <Tv className="w-3 h-3 text-muted-foreground" /> : <Film className="w-3 h-3 text-muted-foreground" />}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.type === "series" ? "Módulo" : "Live"}</p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{selectedIds.length} título(s) selecionado(s)</p>
    </div>
  );
}

function SortableTitleChip({ id, title, onRemove }: { id: string; title: DomiflixTitle | undefined; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  if (!title) return null;
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 bg-muted/40 hover:bg-muted/70 transition-colors rounded-md pl-1 pr-2 py-1.5 group">
      <button {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1" aria-label="Arrastar">
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div className="w-9 h-5 flex-shrink-0 rounded overflow-hidden bg-muted">
        {(title.banner_url || title.thumbnail_url) ? (
          <img src={title.banner_url || title.thumbnail_url || ""} alt="" className="w-full h-full object-cover" />
        ) : <div className="w-full h-full" />}
      </div>
      <span className="text-xs font-medium truncate max-w-[160px]">{title.title}</span>
      <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80 p-0.5" aria-label="Remover">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function SortableSectionCard({ section, titlesById }: { section: DomiflixSectionWithTitleIds; titlesById: Map<string, DomiflixTitle> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const updateSectionTitles = useUpdateSectionTitles();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(section.label);

  useEffect(() => { setLabelDraft(section.label); }, [section.label]);

  const innerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleTitlesDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = section.titleIds.findIndex((id) => id === active.id);
    const newIndex = section.titleIds.findIndex((id) => id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(section.titleIds, oldIndex, newIndex);
    updateSectionTitles.mutate({ sectionId: section.id, titleIds: next });
  }
  function removeTitle(id: string) {
    updateSectionTitles.mutate({ sectionId: section.id, titleIds: section.titleIds.filter((x) => x !== id) });
  }
  function openPicker() { setDraftIds(section.titleIds); setPickerOpen(true); }
  function savePicker() {
    updateSectionTitles.mutate({ sectionId: section.id, titleIds: draftIds }, { onSuccess: () => setPickerOpen(false) });
  }
  function saveLabel() {
    const v = labelDraft.trim();
    if (!v || v === section.label) { setEditingLabel(false); setLabelDraft(section.label); return; }
    updateSection.mutate({ id: section.id, label: v }, { onSuccess: () => setEditingLabel(false) });
  }

  return (
    <Card ref={setNodeRef} style={style} className="border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 -ml-1" aria-label="Arrastar seção">
            <GripVertical className="w-4 h-4" />
          </button>
          {editingLabel ? (
            <div className="flex items-center gap-2 flex-1">
              <Input autoFocus value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveLabel();
                  if (e.key === "Escape") { setEditingLabel(false); setLabelDraft(section.label); }
                }} className="h-8 max-w-xs" />
              <Button size="sm" variant="ghost" onClick={saveLabel}><Check className="w-4 h-4" /></Button>
            </div>
          ) : (
            <CardTitle className="text-base flex items-center gap-2 flex-1">
              {section.label}
              <button onClick={() => setEditingLabel(true)} className="text-muted-foreground hover:text-foreground" aria-label="Renomear">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </CardTitle>
          )}
          <Badge variant="secondary" className="text-xs">{section.titleIds.length} título(s)</Badge>
          <div className="flex items-center gap-2">
            <Label htmlFor={`active-${section.id}`} className="text-xs text-muted-foreground">Ativa</Label>
            <Switch id={`active-${section.id}`} checked={section.is_active}
              onCheckedChange={(checked) => updateSection.mutate({ id: section.id, is_active: checked })} />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover "{section.label}"?</AlertDialogTitle>
                <AlertDialogDescription>Os títulos vinculados não serão excluídos, apenas o vínculo com esta seção. Ação irreversível.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteSection.mutate(section.id)} className="bg-destructive hover:bg-destructive/80">Remover</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.titleIds.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum título nesta seção. Clique em "Adicionar títulos" para começar.</p>
        ) : (
          <DndContext sensors={innerSensors} collisionDetection={closestCenter} onDragEnd={handleTitlesDragEnd}>
            <SortableContext items={section.titleIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-wrap gap-1.5">
                {section.titleIds.map((id) => (
                  <SortableTitleChip key={id} id={id} title={titlesById.get(id)} onRemove={() => removeTitle(id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <Button variant="outline" size="sm" onClick={openPicker} className="gap-2">
          <Plus className="w-3.5 h-3.5" />
          Adicionar / remover títulos
        </Button>
      </CardContent>
      <ResponsiveModal open={pickerOpen} onOpenChange={setPickerOpen} title={`Títulos de "${section.label}"`}>
        <div className="space-y-4">
          <TitlePicker selectedIds={draftIds} onChange={setDraftIds} />
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancelar</Button>
            <Button onClick={savePicker} disabled={updateSectionTitles.isPending}>Salvar</Button>
          </div>
        </div>
      </ResponsiveModal>
    </Card>
  );
}

export function AdminDomiflixSections() {
  const { data: sections = [], isLoading } = useDomiflixSectionsWithTitles();
  const { data: titles = [] } = useDomiflixTitles();
  const reorder = useReorderSections();
  const create = useCreateSection();

  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const titlesById = useMemo(() => {
    const m = new Map<string, DomiflixTitle>();
    titles.forEach((t) => m.set(t.id, t));
    return m;
  }, [titles]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(sections, oldIndex, newIndex);
    reorder.mutate(reordered.map((s) => s.id));
  }

  function handleCreate() {
    const label = newLabel.trim();
    if (!label) return;
    create.mutate({ label, description: newDescription.trim() || null }, {
      onSuccess: () => { setNewLabel(""); setNewDescription(""); setCreateOpen(false); },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Seções (carrosséis)</h2>
          <p className="text-xs text-muted-foreground">
            Cada seção vira um carrossel na home, abaixo de "Continuar Assistindo" e "Minha Lista". Arraste para reordenar.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova seção
        </Button>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Carregando...</p>
      ) : sections.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg">
          <p className="text-sm">Nenhuma seção criada ainda</p>
          <p className="text-xs mt-1">Crie a primeira seção para começar</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {sections.map((section) => (
                <SortableSectionCard key={section.id} section={section} titlesById={titlesById} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <ResponsiveModal open={createOpen} onOpenChange={setCreateOpen} title="Nova seção">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome da seção</Label>
            <Input autoFocus placeholder='Ex: "Mais vistos", "Novidades"' value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea placeholder="Descrição interna desta seção" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newLabel.trim() || create.isPending}>Criar</Button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
