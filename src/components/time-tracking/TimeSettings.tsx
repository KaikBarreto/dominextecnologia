import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTimeSettings, useTimeSchedules, type TimeSettings } from '@/hooks/useTimeRecords';
import { useAdminTimeSheet } from '@/hooks/useTimeRecords';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Pencil, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function TimeSettingsPanel() {
  const { settings, upsert } = useTimeSettings();
  const { schedules, upsertSchedule } = useTimeSchedules();
  const { profiles } = useAdminTimeSheet();
  const { toast } = useToast();

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

  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<Record<number, { in: string; out: string; break: number; work: boolean }>>({});

  const openScheduleEdit = (userId: string) => {
    const userScheds = schedules.filter(s => s.user_id === userId);
    const form: Record<number, any> = {};
    for (let i = 0; i < 7; i++) {
      const existing = userScheds.find(s => s.weekday === i);
      form[i] = existing
        ? { in: existing.expected_in, out: existing.expected_out, break: existing.break_minutes, work: existing.is_work_day }
        : { in: '08:00', out: '17:00', break: 60, work: i !== 0 && i !== 6 };
    }
    setScheduleForm(form);
    setEditingUser(userId);
  };

  const saveSchedule = async () => {
    if (!editingUser) return;
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', editingUser).single();
    if (!profile?.company_id) return;
    const items = Object.entries(scheduleForm).map(([weekday, v]) => ({
      company_id: profile.company_id,
      user_id: editingUser,
      weekday: Number(weekday),
      expected_in: v.in,
      expected_out: v.out,
      break_minutes: v.break,
      is_work_day: v.work,
    }));
    await upsertSchedule.mutateAsync(items);
    setEditingUser(null);
  };

  const editingProfile = profiles.find(p => p.user_id === editingUser);

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
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Funcionário</th>
                  {WEEKDAYS.map(d => <th key={d} className="text-center px-2 py-3 font-medium text-xs">{d}</th>)}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => {
                  const userScheds = schedules.filter(s => s.user_id === p.user_id);
                  return (
                    <tr key={p.user_id} className="border-b">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={p.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">{p.full_name[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate max-w-[120px]">{p.full_name}</span>
                        </div>
                      </td>
                      {WEEKDAYS.map((_, i) => {
                        const sched = userScheds.find(s => s.weekday === i);
                        return (
                          <td key={i} className="text-center px-2 py-3 text-xs">
                            {sched ? (sched.is_work_day ? `${sched.expected_in.slice(0,5)}-${sched.expected_out.slice(0,5)}` : 'Folga') : '—'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openScheduleEdit(p.user_id)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Edit Modal */}
      <ResponsiveModal
        open={!!editingUser}
        onOpenChange={() => setEditingUser(null)}
        title={`Jornada — ${editingProfile?.full_name || ''}`}
        className="sm:max-w-[500px]"
      >
        <div className="space-y-3 py-2">
          {WEEKDAYS.map((day, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <Switch
                checked={scheduleForm[i]?.work ?? false}
                onCheckedChange={v => setScheduleForm(f => ({ ...f, [i]: { ...f[i], work: v } }))}
              />
              <span className="w-10 text-sm font-medium">{day}</span>
              {scheduleForm[i]?.work ? (
                <>
                  <Input type="time" value={scheduleForm[i]?.in || ''} className="w-[110px]"
                    onChange={e => setScheduleForm(f => ({ ...f, [i]: { ...f[i], in: e.target.value } }))} />
                  <span className="text-muted-foreground">–</span>
                  <Input type="time" value={scheduleForm[i]?.out || ''} className="w-[110px]"
                    onChange={e => setScheduleForm(f => ({ ...f, [i]: { ...f[i], out: e.target.value } }))} />
                </>
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
