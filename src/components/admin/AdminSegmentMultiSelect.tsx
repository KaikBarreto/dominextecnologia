import { CompanySegmentMultiSelect } from '@/components/CompanySegmentMultiSelect';

interface AdminSegmentMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
}

/** Compatibilidade nominal com o CRM Admin; a UI canônica é compartilhada. */
export function AdminSegmentMultiSelect(props: AdminSegmentMultiSelectProps) {
  return <CompanySegmentMultiSelect {...props} />;
}
