import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useCustomers } from '@/hooks/useCustomers';
import { useUsers } from '@/hooks/useUsers';
import { useProjects, type Project, type ProjectInsert, type ProjectStatus } from '@/hooks/useProjects';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const NONE_RESPONSIBLE = '__none__';

const STATUS_OPTIONS: ProjectStatus[] = ['planejada', 'em_andamento', 'pausada', 'concluida', 'cancelada'];

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Presente = edição. Ausente/null = criação. */
  project?: Project | null;
}

/**
 * Modal de criar/editar Projeto (Onda 1 de "Projetos", gestão de obras).
 * Mesmo campo pra criar e editar (sem abas — o form é curto o suficiente
 * pra não precisar, diferente do briefing de "form que cria E edita = abas",
 * que vale pra formulários longos/multi-seção).
 */
export function ProjectFormDialog({ open, onOpenChange, project }: ProjectFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.projects;
  const tf = t.form;
  const tc = MESSAGES[locale].app.common;

  const { customers } = useCustomers();
  const { users } = useUsers();
  const { createProject, updateProject } = useProjects();

  const isEditing = !!project;

  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [responsibleId, setResponsibleId] = useState<string>(NONE_RESPONSIBLE);
  const [status, setStatus] = useState<ProjectStatus>('em_andamento');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [nameError, setNameError] = useState(false);

  // Hidrata o form com o projeto em edição, ou reseta pra criação. Roda a
  // cada abertura (não só na montagem) porque o mesmo dialog é reaproveitado
  // pra editar projetos diferentes em sequência.
  useEffect(() => {
    if (!open) return;
    if (project) {
      setName(project.name);
      setCustomerId(project.customer_id ?? undefined);
      setResponsibleId(project.responsible_user_id ?? NONE_RESPONSIBLE);
      setStatus((project.status as ProjectStatus) ?? 'em_andamento');
      setStartDate(project.start_date ?? '');
      setEndDate(project.end_date ?? '');
      setDescription(project.description ?? '');
      setColor(project.color ?? '#2563EB');
    } else {
      setName('');
      setCustomerId(undefined);
      setResponsibleId(NONE_RESPONSIBLE);
      setStatus('em_andamento');
      setStartDate('');
      setEndDate('');
      setDescription('');
      setColor('#2563EB');
    }
    setNameError(false);
  }, [open, project]);

  const statusLabels: Record<ProjectStatus, string> = {
    planejada: t.statusPlanejada,
    em_andamento: t.statusEmAndamento,
    pausada: t.statusPausada,
    concluida: t.statusConcluida,
    cancelada: t.statusCancelada,
  };

  const isPending = createProject.isPending || updateProject.isPending;

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }

    const input: ProjectInsert = {
      name: trimmedName,
      customer_id: customerId ?? null,
      responsible_user_id: responsibleId === NONE_RESPONSIBLE ? null : responsibleId,
      status,
      start_date: startDate || null,
      end_date: endDate || null,
      description: description.trim() || null,
      color,
    };

    const onSettled = () => onOpenChange(false);

    if (isEditing && project) {
      updateProject.mutate({ id: project.id, ...input }, { onSuccess: onSettled });
    } else {
      createProject.mutate(input, { onSuccess: onSettled });
    }
  };

  const responsibleOptions = [
    { value: NONE_RESPONSIBLE, label: tf.fieldResponsibleNone },
    ...users.map((u) => ({ value: u.user_id, label: u.full_name ?? u.user_id })),
  ];

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? tf.titleEdit : tf.titleCreate}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {tc.cancel}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? tc.saving : tc.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-2 sm:px-0">
        <div className="space-y-1.5">
          <Label htmlFor="project-name">{tf.fieldName}</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(false); }}
            placeholder={tf.fieldNamePlaceholder}
            aria-invalid={nameError}
          />
          {nameError && <p className="text-xs text-destructive">{tf.nameRequired}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>{tf.fieldCustomer}</Label>
          <CustomerSelectField
            customers={customers}
            value={customerId}
            onValueChange={setCustomerId}
            placeholder={tf.fieldCustomerPlaceholder}
            searchPlaceholder={tf.fieldCustomerSearchPlaceholder}
            allowNone
            noneValue="none"
            noneLabel={tf.fieldCustomerNone}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{tf.fieldResponsible}</Label>
            <SearchableSelect
              options={responsibleOptions}
              value={responsibleId}
              onValueChange={setResponsibleId}
              placeholder={tf.fieldResponsiblePlaceholder}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{tf.fieldStatus}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="project-start">{tf.fieldStartDate}</Label>
            <DatePicker
              id="project-start"
              value={startDate}
              onValueChange={setStartDate}
              placeholder={tc.datePicker.placeholder}
              clearable
              clearLabel={tc.clear}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-end">{tf.fieldEndDate}</Label>
            <DatePicker
              id="project-end"
              value={endDate}
              onValueChange={setEndDate}
              placeholder={tc.datePicker.placeholder}
              clearable
              clearLabel={tc.clear}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{tf.fieldColor}</Label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="project-description">{tf.fieldDescription}</Label>
          <Textarea
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={tf.fieldDescriptionPlaceholder}
            rows={3}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
