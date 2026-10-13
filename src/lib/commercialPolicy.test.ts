import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration = readSource(
  'supabase/migrations/20261013120000_trial_7d_reprice_plans_and_base_features.sql',
);

describe('política comercial vigente', () => {
  it('persiste teste padrão de 7 dias no banco e no gerador de links', () => {
    const linkGenerator = readSource('src/components/admin/GenerateLinkModal.tsx');

    expect(migration).toContain('ALTER COLUMN trial_days SET DEFAULT 7');
    expect(linkGenerator).toContain('const [trialDays, setTrialDays] = useState(7)');
    expect(linkGenerator).toContain("trialDays !== 7");
    expect(linkGenerator).toContain('<SelectItem value="7">7 dias (padrão)</SelectItem>');
  });

  it('configura 5 usuários na base, adicional de R$ 20 e preços 197/547/847', () => {
    expect(migration).toContain("WHEN 'extra_user' THEN 20");
    expect(migration).toContain("WHEN 'start' THEN 197");
    expect(migration).toContain("WHEN 'avancado' THEN 547");
    expect(migration).toContain("WHEN 'master' THEN 847");
    expect(migration).toContain("WHEN 'start' THEN 5");
    expect(migration).toContain("WHEN 'avancado' THEN 10");
    expect(migration).toContain("WHEN 'master' THEN 15");
  });

  it('torna precificação avançada e perguntas em vídeo recursos gratuitos da base', () => {
    expect(migration).toContain("WHEN 'pricing_advanced' THEN 0");
    expect(migration).toContain("WHEN 'video_questions' THEN 0");
    expect(migration).toContain("CROSS JOIN (VALUES ('pricing_advanced'), ('video_questions'))");
  });

  it('não mantém gates de UI para os dois recursos-base', () => {
    const sources = [
      'src/components/quotes/QuoteFormDialog.tsx',
      'src/components/service-orders/ServiceCostsTab.tsx',
      'src/pages/Quotes.tsx',
      'src/components/service-orders/FormTemplateManagerDialog.tsx',
      'src/pages/ChecklistDetail.tsx',
    ].map(readSource).join('\n');

    expect(sources).not.toMatch(/hasModule\(['"](?:pricing_advanced|video_questions)/);
    expect(sources).not.toContain('maxVideoQuestions');
  });
});
