export type ChecklistQuestionSort = 'position' | 'question' | 'type';

interface ChecklistQuestionBase {
  question: string;
  description?: string | null;
  position: number;
}

interface BuildChecklistQuestionPageOptions<T extends ChecklistQuestionBase> {
  questions: T[];
  query: string;
  typeFilter: string;
  sort: ChecklistQuestionSort;
  direction: 'asc' | 'desc';
  page: number;
  pageSize: number;
  getTypes: (question: T) => string[];
  getTypeLabel: (type: string) => string;
}

export function buildChecklistQuestionPage<T extends ChecklistQuestionBase>({
  questions,
  query,
  typeFilter,
  sort,
  direction,
  page,
  pageSize,
  getTypes,
  getTypeLabel,
}: BuildChecklistQuestionPageOptions<T>) {
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const all = [...questions].sort((a, b) => a.position - b.position);
  const filtered = all
    .filter((question) => {
      const types = getTypes(question);
      const searchable = [question.question, question.description, ...types.map(getTypeLabel)]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      return (typeFilter === 'all' || types.includes(typeFilter)) && (!normalizedQuery || searchable.includes(normalizedQuery));
    })
    .sort((a, b) => {
      let comparison = a.position - b.position;
      if (sort === 'question') comparison = a.question.localeCompare(b.question, 'pt-BR');
      if (sort === 'type') comparison = getTypeLabel(getTypes(a)[0]).localeCompare(getTypeLabel(getTypes(b)[0]), 'pt-BR');
      return direction === 'asc' ? comparison : -comparison;
    });
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  return {
    all,
    filtered,
    items: filtered.slice((currentPage - 1) * safePageSize, currentPage * safePageSize),
    currentPage,
    totalPages,
    normalizedQuery,
  };
}
