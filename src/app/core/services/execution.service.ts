import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, interval, switchMap, takeUntil, tap, finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AavaApiService } from './aava-api.service';
import { ExecutionRun, ExecutionStatus, AgentProgress, SseEvent } from '../models/execution.models';

@Injectable({ providedIn: 'root' })
export class ExecutionService {
  private auth = inject(AuthService);
  private api  = inject(AavaApiService);
  private base = environment.aavaBaseUrl;

  readonly activeRun    = signal<ExecutionRun | null>(null);
  readonly agentProgress = signal<AgentProgress[]>([]);
  readonly isRunning    = signal(false);

  private destroy$ = new Subject<void>();

  streamExecution(executionId: string): Observable<SseEvent> {
    return new Observable(observer => {
      const url = `${this.base}/events/stream/${executionId}`;
      const headers: Record<string,string> = {
        'Authorization': `Bearer ${this.auth.token()}`,
        'x-realm-id': this.auth.realm(),
        'Accept': 'text/event-stream',
      };

      let aborted = false;
      const controller = new AbortController();

      fetch(url, { headers, signal: controller.signal })
        .then(async res => {
          if (!res.body) { observer.complete(); return; }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done || aborted) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (line.startsWith('data:')) {
                const raw = line.slice(5).trim();
                if (raw === '[DONE]') { observer.complete(); return; }
                try { observer.next(JSON.parse(raw)); } catch {}
              }
            }
          }
          observer.complete();
        })
        .catch(err => { if (!aborted) observer.error(err); });

      return () => { aborted = true; controller.abort(); };
    });
  }

  pollExecution(executionId: string, intervalMs = 3000): Observable<unknown> {
    this.destroy$.next();
    return interval(intervalMs).pipe(
      switchMap(() => this.api.getExecutionResult(executionId)),
      takeUntil(this.destroy$),
    );
  }

  startRun(workflowId: number, workflowName: string, agentCount: number): void {
    this.startRunWithNames(workflowId, workflowName, agentCount, []);
  }

  startRunWithNames(workflowId: number, workflowName: string, agentCount: number, agentNames: string[]): void {
    const agents: AgentProgress[] = Array.from({ length: agentCount }, (_, i) => ({
      index: i,
      name: agentNames[i] ?? `Agent ${i + 1}`,
      status: 'pending' as const,
      startedAt: undefined,
    }));
    const run: ExecutionRun = {
      executionId: '',
      workflowId,
      workflowName,
      status: ExecutionStatus.RUNNING,
      startedAt: new Date(),
      agents,
    };
    this.activeRun.set(run);
    this.agentProgress.set(agents);
    this.isRunning.set(true);
  }

  updateAgentProgress(index: number, patch: Partial<AgentProgress>): void {
    this.agentProgress.update(prev => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  applyEvent(event: SseEvent): void {
    const progress = [...this.agentProgress()];

    // Resolve which agent this event targets (serial is 1-indexed, agentIndex is 0-indexed)
    let idx: number | undefined;
    if (event.serial !== undefined) idx = event.serial - 1;
    else if (event.agentIndex !== undefined) idx = event.agentIndex;

    if (idx !== undefined && idx >= 0 && idx < progress.length) {
      const agent = { ...progress[idx] };

      // Map AAVA SSE status strings to our internal status
      const st = (event.status ?? event.type ?? '').toUpperCase();
      if (['STARTED', 'RUNNING', 'IN_PROGRESS', 'AGENT_STARTED'].includes(st)) {
        agent.status = 'running';
        if (!agent.startedAt) agent.startedAt = new Date();
      }
      if (['COMPLETED', 'SUCCESS', 'AGENT_COMPLETED', 'DONE'].includes(st)) {
        agent.status = 'done';
        if (!agent.completedAt) agent.completedAt = new Date();
      }
      if (['FAILED', 'ERROR', 'AGENT_FAILED'].includes(st)) {
        agent.status = 'error';
        agent.error = event.message;
      }
      if (event.output) agent.output = event.output;
      if (event.agentName) agent.name = event.agentName;
      progress[idx] = agent;

      // Activate next agent when current completes
      if (agent.status === 'done' && idx + 1 < progress.length && progress[idx + 1].status === 'pending') {
        progress[idx + 1] = { ...progress[idx + 1], status: 'running', startedAt: new Date() };
      }
      this.agentProgress.set(progress);
    }

    // Workflow-level terminal events
    const wfType = (event.type ?? '').toUpperCase();
    if (['COMPLETED', 'WORKFLOW_COMPLETED', 'FAILED', 'WORKFLOW_FAILED'].includes(wfType)) {
      const succeeded = ['COMPLETED', 'WORKFLOW_COMPLETED'].includes(wfType);
      this.isRunning.set(false);
      const run = this.activeRun();
      if (run) this.activeRun.set({
        ...run,
        status: succeeded ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED,
        completedAt: new Date(),
      });
    }
  }

  completeRun(result: unknown): void {
    this.isRunning.set(false);
    const run = this.activeRun();
    if (run) {
      this.activeRun.set({ ...run, status: ExecutionStatus.COMPLETED, completedAt: new Date(), result });
    }
    const agents = this.agentProgress().map(a =>
      a.status === 'running' ? { ...a, status: 'done' as const, completedAt: new Date() } : a
    );
    this.agentProgress.set(agents);
  }

  failRun(error: string): void {
    this.isRunning.set(false);
    const run = this.activeRun();
    if (run) this.activeRun.set({ ...run, status: ExecutionStatus.FAILED, completedAt: new Date() });
    const agents = this.agentProgress().map(a =>
      a.status === 'running' ? { ...a, status: 'error' as const, error } : a
    );
    this.agentProgress.set(agents);
  }

  reset(): void {
    this.destroy$.next();
    this.activeRun.set(null);
    this.agentProgress.set([]);
    this.isRunning.set(false);
  }
}
