import { BookOpen, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useDomiflixLearningStatus } from '@/hooks/useDomiflix';
import { findDomiflixModuleTutorial, normalizeTutorialModuleCodes } from '@/lib/domiflixModuleTutorial';

interface ModuleTutorialActionProps extends Omit<ButtonProps, 'onClick'> {
  moduleCodes: string | readonly string[];
  label?: string;
  enabled?: boolean;
  onBeforeNavigate?: () => void;
  showWhileLoading?: boolean;
}

export function ModuleTutorialAction({
  moduleCodes,
  label = 'Ver tutorial',
  enabled = true,
  onBeforeNavigate,
  showWhileLoading = false,
  ...buttonProps
}: ModuleTutorialActionProps) {
  const navigate = useNavigate();
  const codes = normalizeTutorialModuleCodes(Array.isArray(moduleCodes) ? moduleCodes : [moduleCodes]);
  const learning = useDomiflixLearningStatus(enabled && codes.length > 0);
  const tutorial = findDomiflixModuleTutorial(learning.data, codes);

  if (!tutorial && !(showWhileLoading && learning.isLoading)) return null;

  return (
    <Button
      {...buttonProps}
      disabled={buttonProps.disabled || !tutorial}
      onClick={() => {
        if (!tutorial) return;
        onBeforeNavigate?.();
        navigate(tutorial.url);
      }}
    >
      {tutorial ? <BookOpen className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
      {tutorial ? label : 'Buscando tutorial…'}
    </Button>
  );
}
