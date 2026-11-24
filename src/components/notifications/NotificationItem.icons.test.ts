import { describe, expect, it } from 'vitest';
import { Bell, CalendarDays, CircleDollarSign, ClipboardCheck } from 'lucide-react';
import { getNotificationIcon } from './NotificationItem';

describe('getNotificationIcon', () => {
  it('resolve os ícones emitidos pelos produtores da plataforma', () => {
    expect(getNotificationIcon('calendar-days')).toBe(CalendarDays);
    expect(getNotificationIcon('circle-dollar-sign')).toBe(CircleDollarSign);
    expect(getNotificationIcon('clipboard-check')).toBe(ClipboardCheck);
  });

  it('mantém o sino como fallback para tipos futuros', () => {
    expect(getNotificationIcon('evento-ainda-desconhecido')).toBe(Bell);
  });
});
