import {
  getDomiflixLessonUrl,
  type DomiflixLearningStatus,
  type DomiflixTrackLesson,
} from '@/hooks/useDomiflix';

const MODULE_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;

export interface DomiflixModuleTutorial {
  moduleCode: string;
  lesson: DomiflixTrackLesson;
  url: string;
}

export function normalizeTutorialModuleCodes(codes: readonly string[]): string[] {
  return Array.from(new Set(codes.map((code) => code.trim()).filter((code) => MODULE_CODE_PATTERN.test(code)))).slice(0, 12);
}

export function findDomiflixModuleTutorial(
  status: DomiflixLearningStatus | null | undefined,
  moduleCodes: readonly string[],
): DomiflixModuleTutorial | null {
  if (!status) return null;

  for (const moduleCode of normalizeTutorialModuleCodes(moduleCodes)) {
    const lessons = status.track.filter((lesson) => lesson.moduleCode === moduleCode);
    const lesson = lessons.find((item) => !item.completed) ?? lessons[0];
    if (lesson) {
      return {
        moduleCode,
        lesson,
        url: getDomiflixLessonUrl(status, lesson),
      };
    }
  }

  return null;
}

export function appendTutorialModulesToUrl(url: string, moduleCodes: readonly string[]): string {
  const normalized = normalizeTutorialModuleCodes(moduleCodes);
  if (normalized.length === 0) return url;

  const parsed = new URL(url, 'https://app.dominex.example');
  parsed.searchParams.set('tutorialModules', normalized.join(','));
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function parseTutorialModules(value: string | null | undefined): string[] {
  return normalizeTutorialModuleCodes(value?.split(',') ?? []);
}
