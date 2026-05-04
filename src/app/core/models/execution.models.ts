export enum ExecutionStatus {
  QUEUED    = 'QUEUED',
  RUNNING   = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED    = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface ExecutionRequest {
  workflowId: number;
  userInputs?: Record<string, unknown>;
  priority?: number;
  files?: File[];
}

export interface ExecutionRun {
  executionId: string;
  workflowId: number;
  workflowName: string;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  agents: AgentProgress[];
  result?: unknown;
  error?: string;
}

export interface AgentProgress {
  index: number;
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  output?: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ToolCall {
  toolName: string;
  status: 'CALLING' | 'SUCCESS' | 'FAILED';
  timestamp: string;
  result?: string;
}

export interface ExecutionResult {
  output?: string;
  tasksOutputs?: TaskOutput[];
  pipeLineAgents?: { serial: number; agent: { id: number; name: string } }[];
}

export interface TaskOutput {
  description?: string;
  expected_output?: string;
  summary?: string;
  raw?: string;
  output?: string;
}

export interface SseEvent {
  type: string;
  agentIndex?: number;
  agentName?: string;
  serial?: number;      // AAVA SSE uses 1-indexed serial; applyEvent converts to 0-indexed
  status?: string;
  message?: string;
  output?: string;
  timestamp?: string;
  data?: unknown;
}
