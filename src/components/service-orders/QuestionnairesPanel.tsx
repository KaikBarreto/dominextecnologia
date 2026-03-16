import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';

export function QuestionnairesPanel() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [allServices, setAllServices] = useState(true);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { templates, createTemplate, setTemplateServices, deleteTemplate } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();
  const { sortedItems: sortedTemplates, sortConfig, handleSort } = useTableSort(templates);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createTemplate.mutate({ name: newName }, {
      onSuccess: (data) => {
        if (!allServices && selectedServiceIds.length > 0 && data) {
          setTemplateServices.mutate({ templateId: data.id, serviceTypeIds: selectedServiceIds });
        }
        setNewName('');
        setAllServices(true);
        setSelectedServiceIds([]);
        setCreateOpen(false);
        if (data) {
          navigate(`/questionarios/${data.id}`);
        }
      },
    });
  };

  const toggleServiceId = (id: string) => {
    setSelectedServiceIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteTemplate.mutate(deleteId, {
        onSuccess: () => setDeleteId(null),
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Button */}
      <div className="flex justify-end">
        <Button
          className="w-full lg:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo questionário
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">Nenhum questionário criado</h3>
              <p className="text-muted-foreground">Clique em "Novo questionário" para começar</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {sortedTemplates.map((template) => {
              const serviceIds = (template as any).service_type_ids as string[] | undefined;
              const appliesToAll = !serviceIds || serviceIds.length === 0;
              const linkedServices = appliesToAll
                ? []
                : serviceTypes.filter(st => serviceIds!.includes(st.id));

              return (
                <Card
                  key={template.id}
                  className="cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => navigate(`/questionarios/${template.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium truncate">{template.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={template.is_active ? 'default' : 'secondary'} className="text-xs">
                            {template.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {template.questions?.length || 0} perguntas
                          </span>
                        </div>
                        {appliesToAll ? (
                          <Badge variant="secondary" className="text-xs">Todos os serviços</Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {linkedServices.slice(0, 3).map(st => (
                              <Badge key={st.id} variant="outline" className="text-xs">
                                <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: st.color }} />
                                {st.name}
                              </Badge>
                            ))}
                            {linkedServices.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{linkedServices.length - 3}</Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); navigate(`/questionarios/${template.id}`); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive-ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(template.id); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop table */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>Nome</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}}>Perguntas</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}}>Serviços</SortableTableHead>
                      <SortableTableHead sortKey="is_active" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[100px]">Ações</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTemplates.map((template) => {
                      const serviceIds = (template as any).service_type_ids as string[] | undefined;
                      const appliesToAll = !serviceIds || serviceIds.length === 0;
                      const linkedServices = appliesToAll
                        ? []
                        : serviceTypes.filter(st => serviceIds!.includes(st.id));

                      return (
                        <TableRow
                          key={template.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/questionarios/${template.id}`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-medium">{template.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{template.questions?.length || 0}</span>
                          </TableCell>
                          <TableCell>
                            {appliesToAll ? (
                              <Badge variant="secondary" className="text-xs">Todos</Badge>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {linkedServices.slice(0, 3).map(st => (
                                  <Badge key={st.id} variant="outline" className="text-xs">
                                    <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: st.color }} />
                                    {st.name}
                                  </Badge>
                                ))}
                                {linkedServices.length > 3 && (
                                  <Badge variant="outline" className="text-xs">+{linkedServices.length - 3}</Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={template.is_active ? 'default' : 'secondary'} className="text-xs">
                              {template.is_active ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); navigate(`/questionarios/${template.id}`); }}
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive-ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); setDeleteId(template.id); }}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Create Modal */}
      <ResponsiveModal open={createOpen} onOpenChange={setCreateOpen} title="Novo Questionário">
        <div className="space-y-4">
          <div>
            <Label>Nome do questionário</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Checklist de manutenção preventiva"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
              className="mt-1"
            />
          </div>

          <div className="space-y-3">
            <Label>Serviços habilitados</Label>
            <div className="flex items-center gap-2">
              <Switch checked={allServices} onCheckedChange={(checked) => {
                setAllServices(checked);
                if (checked) setSelectedServiceIds([]);
              }} />
              <Label className="text-sm cursor-pointer">Todos os serviços</Label>
            </div>
            {!allServices && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {serviceTypes.filter(t => t.is_active).map((st) => (
                  <label key={st.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={selectedServiceIds.includes(st.id)}
                      onCheckedChange={() => toggleServiceId(st.id)}
                    />
                    <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                    {st.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={!newName.trim() || createTemplate.isPending}
            >
              Criar
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover questionário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as perguntas deste questionário serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
