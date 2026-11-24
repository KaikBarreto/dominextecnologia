import { describe, expect, it } from 'vitest';
import type { DomiflixLearningStatus, DomiflixTrackLesson } from '@/hooks/useDomiflix';
import {
  appendTutorialModulesToUrl,
  findDomiflixModuleTutorial,
  parseTutorialModules,
} from '@/lib/domiflixModuleTutorial';

const lesson = (overrides: Partial<DomiflixTrackLesson>): DomiflixTrackLesson => ({
  sequence: 1,
  titleId: 'title-1',
  moduleTitle: 'CRM',
  moduleDescription: null,
  thumbnailUrl: null,
  bannerUrl: null,
  group: 'plan',
  moduleCode: 'crm',
  moduleName: 'CRM',
  modulePrice: 49,
  includedInPlan: false,
  episodeId: 'episode-1',
  lessonTitle: 'Primeiros passos no CRM',
  lessonDescription: null,
  episodeNumber: 1,
  durationMinutes: 12,
  videoType: 'storage',
  videoId: 'crm.mp4',
  completed: false,
  progressSeconds: 0,
  durationSeconds: 720,
  ...overrides,
});

const status = (track: DomiflixTrackLesson[]): DomiflixLearningStatus => ({
  path: { id: 'path-1', slug: 'tutoriais-do-sistema', title: 'Tutoriais', description: null, coverUrl: null, isOnboarding: true },
  paths: [],
  user: { firstName: 'Ana', email: 'ana@example.invalid', companyName: 'Empresa', companyId: 'company-1', accountStage: 'paid', onboardingDay: 1 },
  progress: { coreTotal: 0, coreCompleted: 0, corePercent: 0, trackTotal: track.length, trackCompleted: 0, trackPercent: 0, lastProgressAt: null },
  reminder: { severity: 'none', dismissedUntil: null },
  nextLesson: null,
  introGate: { required: false, acknowledged: true, lesson: null },
  track,
});

describe('tutorial contextual por módulo', () => {
  it('abre a primeira aula ainda não concluída do módulo solicitado', () => {
    const completed = lesson({ episodeId: 'episode-complete', completed: true });
    const pending = lesson({ episodeId: 'episode-pending', episodeNumber: 2, progressSeconds: 35 });

    const result = findDomiflixModuleTutorial(status([completed, pending]), ['crm']);

    expect(result?.lesson.episodeId).toBe('episode-pending');
    expect(result?.url).toContain('/domiflix/assistir/crm/2/35');
    expect(result?.url).toContain('trilha=tutoriais-do-sistema');
  });

  it('não oferece aula de outro módulo quando o solicitado não está publicado', () => {
    expect(findDomiflixModuleTutorial(status([lesson({})]), ['rh'])).toBeNull();
  });

  it('transporta somente códigos válidos pelo retorno do checkout', () => {
    const url = appendTutorialModulesToUrl('/checkout?mode=upgrade&change=abc', ['crm', 'crm', '../segredo', 'rh']);
    expect(url).toBe('/checkout?mode=upgrade&change=abc&tutorialModules=crm%2Crh');
    expect(parseTutorialModules('crm,rh,../segredo,crm')).toEqual(['crm', 'rh']);
  });
});
