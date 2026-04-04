import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTimeSettings, useTimeSchedules } from '@/hooks/useTimeRecords';
import { useAdminTimeSheet } from '@/hooks/useTimeRecords';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Pencil, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function TimeSettingsPanel() {
  const { settings, upsert } = useTimeSettings();
  const { schedules, upsertSchedule } = useTimeSchedules();
  const { employees } = useAdminTimeSheet();

  const [form, setForm] = useState({
    default_in: '08:00',
    default_out: '17:00',
    default_break_min: 60,
    require_selfie: true,
    require_geolocation: true,
    max_radius_meters: 0,
    allow_off_hours: true,
    late_tolerance_min: 10,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        default_in: settings.default_in,
        default_out: settings.default_out,
        default_break_min: settings.default_break_min,
        require_selfie: settings.require_selfie,
        require_geolocation: settings.require_geolocation,
        max_radius_meters: settings.max_radius_meters,
        allow_off_hours: settings.allow_off_hours,
        late_tolerance_min: settings.late_tolerance_min,
      });
    }
  }, [settings]);

  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<Record<number, { in: string; out: string; break: number; work: boolean }>>({});

  const openScheduleEdit = (employeeId: string) => {
    const empScheds = schedules.filter(s => s.employee_id === employeeId);
    const companyIn = form.default_in || '08:00';
    const companyOut = form.default_out || '17:00';
    const companyBreak = form.default_break_min ?? 60;
    const editForm: Record<number, any> = {};
    for (let i = 0; i < 7; i++) {
      const existing = empScheds.find(s => s.weekday === i);
      editForm[i] = existing
        ? { in: existing.expected_in, out: existing.expected_out, break: existing.break_minutes, work: existing.is_work_day }
        : { in: companyIn, out: companyOut, break: companyBreak, work: i !== 0 && i !== 6 };
    }
    setScheduleForm(editForm);
    setEditingEmployee(employeeId);
  };

  const saveSchedule = async () => {
    if (!editingEmployee) return;
    // Get company_id from current user
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', (await supabase.auth.getUser()).data.user?.id || '').single();
    if (!profile?.company_id) return;
    const items = Object.entries(scheduleForm).map(([weekday, v]) => ({
      company_id: profile.company_id,
      employee_id: editingEmployee,
      weekday: Number(weekday),
      expected_in: v.in,
      expected_out: v.out,
      break_minutes: v.break,
      is_work_day: v.work,
    }));
    await upsertSchedule.mutateAsync(items);
    setEditingEmployee(null);
  };

  const editingEmp = employees.find(e => e.id === editingEmployee);

  return (
    <div className="space-y-6">
      {/* Company defaults */}
      <Card>
        <CardHeader><CardTitle className="text-base">Jornada Padrão da Empresa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Entrada padrão</Label>
              <Input type="time" value={form.default_in} onChange={e => setForm(f => ({ ...f, default_in: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Saída padrão</Label>
              <Input type="time" value={form.default_out} onChange={e => setForm(f => ({ ...f, default_out: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Intervalo (min)</Label>
              <Input type="number" value={form.default_break_min} onChange={e => setForm(f => ({ ...f, default_break_min: +e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Exigir selfie</Label>
              <Switch checked={form.require_selfie} onCheckedChange={v => setForm(f => ({ ...f, require_selfie: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Exigir geolocalização</Label>
              <Switch checked={form.require_geolocation} onCheckedChange={v => setForm(f => ({ ...f, require_geolocation: v }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Raio máximo (metros)</Label>
              <Input type="number" value={form.max_radius_meters} onChange={e => setForm(f => ({ ...f, max_radius_meters: +e.target.value }))} />
              <p className="text-xs text-muted-foreground">0 = sem restrição</p>
            </div>
            <div className="space-y-2">
              <Label>Tolerância atraso (min)</Label>
              <Input type="number" value={form.late_tolerance_min} onChange={e => setForm(f => ({ ...f, late_tolerance_min: +e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Permitir fora do horário</Label>
              <Switch checked={form.allow_off_hours} onCheckedChange={v => setForm(f => ({ ...f, allow_off_hours: v }))} />
            </div>
          </div>
          <Button onClick={() => upsert.mutate(form)} className="gap-2">
            <Save className="h-4 w-4" /> Salvar configurações
          </Button>
        </CardContent>
      </Card>

      {/* Individual schedules */}
      <Card>
        <CardHeader><CardTitle className="text-base">Jornada Individual</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-0">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Funcionário</th>
                  {WEEKDAYS.map(d => <th key={d} className="text-center px-2 py-3 font-medium text-xs">{d}</th>)}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const empScheds = schedules.filter(s => s.employee_id === emp.id);
                  return (
                    <tr key={emp.id} className="border-b">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={emp.photo_url || undefined} />
                            <AvatarFallback className="text-xs">{emp.name[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate max-w-[120px]">{emp.name}</span>
                        </div>
                      </td>
                      {WEEKDAYS.map((_, i) => {
                        const sched = empScheds.find(s => s.weekday === i);
                        const hasCustom = empScheds.length > 0;
                        if (hasCustom && sched) {
                          return (
                            <td key={i} className="text-center px-2 py-3 text-xs">
                              {sched.is_work_day ? `${sched.expected_in.slice(0,5)}-${sched.expected_out.slice(0,5)}` : 'Folga'}
                            </td>
                          );
                        }
                        if (!hasCustom) {
                          const isWorkDay = i !== 0 && i !== 6;
                          return (
                            <td key={i} className="text-center px-2 py-3 text-xs text-muted-foreground">
                              {isWorkDay ? `${form.default_in.slice(0,5)}-${form.default_out.slice(0,5)}` : 'Folga'}
                            </td>
                          );
                        }
                        return <td key={i} className="text-center px-2 py-3 text-xs text-muted-foreground">—</td>;
                      })}
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openScheduleEdit(emp.id)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2 p-3">
            {employees.map(emp => {
              const empScheds = schedules.filter(s => s.employee_id === emp.id);
              const workDays = WEEKDAYS.filter((_, i) => {
                const sched = empScheds.find(s => s.weekday === i);
                return sched?.is_work_day;
              });
              return (
                <Card key={emp.id}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={emp.photo_url || undefined} />
                        <AvatarFallback className="text-xs">{emp.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {workDays.length > 0 ? workDays.join(', ') : 'Sem jornada definida'}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openScheduleEdit(emp.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Schedule Edit Modal */}
      <ResponsiveModal
        open={!!editingEmployee}
        onOpenChange={() => setEditingEmployee(null)}
        title={`Jornada — ${editingEmp?.name || ''}`}
        className="sm:max-w-[500px]"
      >
        <div className="space-y-3 py-2">
          {WEEKDAYS.map((day, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-lg border p-3">
              <Switch
                checked={scheduleForm[i]?.work ?? false}
                onCheckedChange={v => setScheduleForm(f => ({ ...f, [i]: { ...f[i], work: v } }))}
              />
              <span className="w-10 text-sm font-medium">{day}</span>
              {scheduleForm[i]?.work ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Input type="time" value={scheduleForm[i]?.in || ''} className="flex-1 min-w-[90px]"
                    onChange={e => setScheduleForm(f => ({ ...f, [i]: { ...f[i], in: e.target.value } }))} />
                  <span className="text-muted-foreground">–</span>
                  <Input type="time" value={scheduleForm[i]?.out || ''} className="flex-1 min-w-[90px]"
                    onChange={e => setScheduleForm(f => ({ ...f, [i]: { ...f[i], out: e.target.value } }))} />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Folga</span>
              )}
            </div>
          ))}
          <Button className="w-full mt-2" onClick={saveSchedule}>Salvar jornada</Button>
        </div>
      </ResponsiveModal>
    </div>
  );
}
