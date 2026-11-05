import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261105153000_expand_internal_os_schedule_duration.sql',
  'utf8',
);
const publicApiEdge = readFileSync('supabase/functions/public-api-v1/index.ts', 'utf8');

describe('limite de duração da jornada interna da OS', () => {
  it('amplia plano e RPCs internos para 24 horas', () => {
    expect(migration).toContain('v_duration NOT BETWEEN 15 AND 1440');
    expect(migration).toContain(
      'public.schedule_book_service_order(uuid,text,uuid,timestamptz,timestamptz,text)',
    );
    expect(migration).toContain(
      'public.schedule_create_service_order_with_override(jsonb,text,jsonb,uuid[])',
    );
    expect(migration).toContain("'BETWEEN 15 AND 1440'");
  });

  it('preserva o contrato público em no máximo 480 minutos', () => {
    expect(publicApiEdge).toContain('duration > 480');
    expect(publicApiEdge).toContain('duration_minutes deve estar entre 15 e 480.');
  });
});
