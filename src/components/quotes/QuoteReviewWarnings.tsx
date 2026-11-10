import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { QuoteReviewIssue, QuoteReviewSection } from '@/lib/quote-review';

/** Orientação não bloqueante; a exceção comercial continua sendo uma decisão humana. */
export function QuoteReviewWarnings({ issues, onEditSection }: {
  issues: QuoteReviewIssue[];
  onEditSection: (section: QuoteReviewSection) => void;
}) {
  if (issues.length === 0) return null;
  return <section aria-label="Pontos para conferir" className="space-y-3 border-y py-5">
    <div className="flex items-start gap-3">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div>
        <h3 className="text-xl font-semibold sm:text-2xl">Vale conferir antes de finalizar</h3>
        <p className="mt-1 text-sm text-muted-foreground">Você pode continuar se estas condições forem intencionais.</p>
      </div>
    </div>
    <ul className="divide-y">
      {issues.map(issue => <li key={issue.key} className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0">
          <p className="font-semibold">{issue.title}</p>
          <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{issue.detail}</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => onEditSection(issue.section)}>
          {issue.action}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
        </Button>
      </li>)}
    </ul>
  </section>;
}
