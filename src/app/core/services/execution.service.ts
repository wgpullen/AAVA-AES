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
    if (event.agentIndex !== undefined && progress[event.agentIndex]) {
      const agent = progress[event.agentIndex];
      if (event.status === 'started')   agent.status = 'running';
      if (event.status === 'completed') { agent.status = 'done'; agent.completedAt = new Date(); }
      if (event.status === 'failed')    { agent.status = 'error'; agent.error = event.message; }
      if (event.output) agent.output = event.output;
      if (event.agentName) agent.name = event.agentName;
      progress[event.agentIndex] = agent;

      // Activate next agent
      const next = event.agentIndex + 1;
      if (event.status === 'completed' && next < progress.length) {
        progress[next] = { ...progress[next], status: 'running', startedAt: new Date() };
      }
      this.agentProgress.set(progress);
    }

    if (event.type === 'COMPLETED' || event.type === 'FAILED') {
      this.isRunning.set(false);
      const run = this.activeRun();
      if (run) this.activeRun.set({
        ...run,
        status: event.type === 'COMPLETED' ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED,
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
