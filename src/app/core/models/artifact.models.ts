export type ArtifactType = 'AGENT' | 'WORKFLOW' | 'TOOL' | 'KB' | 'GUARDRAIL';
export type ArtifactStatus = 'CREATED' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED' | 'FAILED';

export interface ArtifactSummary {
  id: number;
  name: string;
  type: ArtifactType;
  status: ArtifactStatus;
  createdBy?: string | number;
  createdAt?: string;
  modifiedAt?: string;
  description?: string;
  realm?: string;
  entity?: string;
  short_description?: string;
  tags?: number[];
  practiceArea?: number;
}

export interface Agent {
  id: number;
  name: string;
  role?: string;
  goal?: string;
  backstory?: string;
  description?: string;
  expectedOutput?: string;
  status: ArtifactStatus;
  agentConfigs?: Record<string, unknown>;
  userTools?: { toolId: number; toolName?: string }[];
  kbIds?: number[];
  guardrailIds?: number[];
  tags?: number[];
  practiceArea?: number;
  practiceAreaId?: number;
  teamId?: number;
  allowDelegation?: boolean;
  createdBy?: string | number;
  createdAt?: string;
  modifiedAt?: string;
  entity?: string;
  [key: string]: unknown;
}

export interface Workflow {
  id: number;
  name: string;
  description?: string;
  status: ArtifactStatus;
  workflowAgents?: WorkflowAgent[];
  workflowConfig?: Record<string, unknown>;
  teamId?: number;
  createdBy?: string | number;
  createdAt?: string;
  modifiedAt?: string;
  [key: string]: unknown;
}

export interface WorkflowAgent {
  serial: number;
  agentId: number;
  name?: string;
}

export interface Tool {
  id: number;
  toolName: string;
  toolDescription?: string;
  status: ArtifactStatus;
  createdBy?: string | number;
  createdAt?: string;
}

export interface KnowledgeBase {
  id: number;
  knowledgeBase?: string;
  name?: string;
  description?: string;
  status: ArtifactStatus;
  createdBy?: string | number;
  createdAt?: string;
}

export interface Guardrail {
  id: number;
  name: string;
  description?: string;
  content?: string;
  yamlContent?: string;
  status: ArtifactStatus;
  createdBy?: string | number;
  createdAt?: string;
}

export interface ArtifactListResult {
  items: ArtifactSummary[];
  total: number;
  page: number;
}

export interface ArtifactSearchParams {
  types?: ArtifactType[];
  query?: string;
  status?: ArtifactStatus | 'ALL';
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'modifiedAt' | 'name';
  sortOrder?: 'asc' | 'desc';
}
