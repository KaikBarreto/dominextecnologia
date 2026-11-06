export interface CrmStageRequirements {
  tasks?: boolean;
  checklists?: boolean;
  assignee?: boolean;
  dueDate?: boolean;
  customer?: boolean;
  description?: boolean;
  taskNames?: string[];
  checklistNames?: string[];
  checklistItems?: Array<{ checklistName: string; text: string }>;
  customFields?: string[];
  fieldRules?: Array<{ key: string; label?: string; operator: 'filled' | 'checked' | 'equals' | 'url'; value?: string }>;
}

export type CrmAutomationTriggerType = 'stage_enter' | 'task_completed' | 'checklist_completed' | 'all_completed';
export type CrmAutomationActionType = 'create_task' | 'apply_checklist' | 'set_due' | 'assign_user' | 'add_label' | 'move_card' | 'copy_card';

export interface CrmAutomationAction {
  action: CrmAutomationActionType;
  config: Record<string, unknown>;
}

export interface CrmAutomationRule {
  id: string;
  company_id: string;
  pipeline_id: string;
  trigger_stage_id: string;
  name: string;
  trigger_type: CrmAutomationTriggerType;
  trigger_config: Record<string, unknown>;
  actions: CrmAutomationAction[];
  enabled: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmAutomationRuleInput {
  id?: string;
  pipeline_id: string;
  trigger_stage_id: string;
  name: string;
  trigger_type: CrmAutomationTriggerType;
  trigger_config: Record<string, unknown>;
  actions: CrmAutomationAction[];
  enabled: boolean;
  position?: number;
}
