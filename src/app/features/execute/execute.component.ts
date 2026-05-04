import { Component, computed, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { catchError, interval, of, Subject, Subscription, switchMap, takeUntil, takeWhile } from 'rxjs';
import { AavaApiService } from '../../core/services/aava-api.service';
import { ExecutionService } from '../../core/services/execution.service';
import { NotificationService } from '../../core/services/notification.service';
import { AgentProgress, ExecutionStatus } from '../../core/models/execution.models';

interface WorkflowOption {
  id: number;
  name: string;
  status?: string;
  agentCount?: number;
  agentNames?: string[];
  detailsLoaded?: boolean;
}

const STATUS_ORDER: Record<AgentProgress['status'], number> = {
  pending: 0, running: 1, done: 2, error: 2,
};

function mapStatus(raw: string): AgentProgress['status'] {
  const s = raw.toUpperCase();
  if (['RUNNING', 'IN_PROGRESS', 'STARTED', 'EXECUTING', 'ACTIVE'].includes(s)) return 'running';
  if (['COMPLETED', 'SUCCESS', 'DONE', 'FINISHED', 'SUCCEEDED'].includes(s))     return 'done';
  if (['FAILED', 'ERROR', 'ERRORED', 'CANCELLED'].includes(s))                   return 'error';
  return 'pending';
}

@Component({
  selector: 'app-execute',
  standalone: true,
  imports: [
    FormsModule, CommonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressBarModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './execute.component.html',
  styleUrl: './execute.component.scss',
})
export class ExecuteComponent implements OnInit, OnDestroy {
  private api     = inject(AavaApiService);
  private execSvc = inject(ExecutionService);
  private notify  = inject(NotificationService);
  private route   = inject(ActivatedRoute);

  readonly run       = this.execSvc.activeRun;
  readonly agents    = this.execSvc.agentProgress;
  readonly isRunning = this.execSvc.isRunning;

  workflows        = signal<WorkflowOption[]>([]);
  selectedWorkflow: number | null = null;
  inputText        = '';
  selectedFile: File | null = null;
  loadingWorkflows = signal(false);
  loadingDetails   = signal(false);
  showResults      = signal(false);
  executionResult  = signal<any>(null);

  private pollSub?:     Subscription;
  private logsPollSub?: Subscription;
  private sseSub?:      Subscription;
  private tickSub?:     Subscription;
  private trackDone$  = new Subject<void>();

  private tick = signal(0);
  ExecutionStatus = ExecutionStatus;

  ngOnInit(): void {
    this.loadWorkflows();
    this.route.queryParams.subscribe(p => {
      if (p['workflowId']) {
        this.selectedWorkflow = Number(p['workflowId']);
        this.onWorkflowChange();
      }
      if (p['input']) this.inputText = p['input'];
    });
    this.tickSub = interval(1000).subscribe(() => this.tick.update(t => t + 1));
  }

  ngOnDestroy(): void {
    this.stopTracking();
    this.tickSub?.unsubscribe();
    this.trackDone$.complete();
  }

  loadWorkflows(): void {
    this.loadingWorkflows.set(true);
    this.api.listUserWorkflows(1, 100).pipe(
      catchError(() => of({ workFlowDetails: [], totalNoOfRecords: 0 }))
    ).subscribe(res => {
      this.loadingWorkflows.set(false);
      const all = (res.workFlowDetails ?? [])
        .map((w: any) => ({
          id: w.id,
          name: w.name,
          status: w.status,
          agentCount: w.workflowAgents?.length ?? 0,
          agentNames: (w.workflowAgents ?? [])
            .sort((a: any, b: any) => (a.serial ?? 0) - (b.serial ?? 0))
            .map((wa: any) => wa.agent?.name ?? wa.agentName ?? null)
            .filter(Boolean),
          detailsLoaded: false,
        }))
        .sort((a: any, b: any) => {
          if (a.status === 'APPROVED' && b.status !== 'APPROVED') return -1;
          if (b.status === 'APPROVED' && a.status !== 'APPROVED') return 1;
          return a.name.localeCompare(b.name);
        });
      this.workflows.set(all);
    });
  }

  /** Fetches full workflow details for accurate agent list.
   *  Blocks Execute button until complete (eliminates race condition). */
  onWorkflowChange(): void {
    if (!this.selectedWorkflow) return;
    const wf = this.selectedWf;
    if (wf?.detailsLoaded) return;

    this.loadingDetails.set(true);
    this.api.getWorkflowDetails(this.selectedWorkflow).pipe(
      catchError(() => of(null))
    ).subscribe((detail: any) => {
      this.loadingDetails.set(false);
      if (!detail) return;

      console.log('[AES WF detail]', detail);

      // AAVA uses multiple field names across API versions — try all
      const rawAgents: any[] =
        detail?.workflowAgents    ??
        detail?.agents            ??
        detail?.workflowAgentList ??
        detail?.pipelineAgents    ??
        detail?.pipeline?.agents  ??
        detail?.agentList         ??
        [];

      const sorted = [...rawAgents].sort(
        (a: any, b: any) => (a.serial ?? a.serialNo ?? 0) - (b.serial ?? b.serialNo ?? 0)
      );

      const agentNames: string[] = sorted
        .map((wa: any) => wa.agent?.name ?? wa.agentName ?? wa.name ?? null)
        .filter(Boolean);

      const agentCount = sorted.length
        || (detail?.agentCount ?? detail?.totalAgents ?? wf?.agentCount ?? 0);

      console.log('[AES WF detail] resolved agents:', agentCount, agentNames);

      this.workflows.update(wfs => wfs.map(w =>
        w.id === this.selectedWorkflow
          ? { ...w, agentCount, agentNames, detailsLoaded: true }
          : w
      ));
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  /** Execute blocked until detail fetch completes — eliminates agent-count race condition */
  get canRun(): boolean {
    return !!this.selectedWorkflow && !this.isRunning() && !this.loadingDetails();
  }

  get selectedWf(): WorkflowOption | undefined {
    return this.workflows().find(w => w.id === this.selectedWorkflow);
  }

  run$(): void {
    const wfId = this.selectedWorkflow;
    if (!wfId) return;

    const wf         = this.selectedWf;
    const agentNames = wf?.agentNames ?? [];
    const agentCount = agentNames.length || wf?.agentCount || 1;

    this.execSvc.startRunWithNames(wfId, wf?.name ?? 'Workflow', agentCount, agentNames);
    this.showResults.set(false);
    this.executionResult.set(null);

    const userInputs: Record<string, any> = {};
    if (this.inputText) userInputs['userInput'] = this.inputText;

    this.api.triggerWorkflow(wfId, userInputs, this.selectedFile ?? undefined).pipe(
      catchError(err => {
        this.execSvc.failRun(err.message ?? 'Failed to start workflow');
        this.notify.error(`Execution failed: ${err.message}`);
        return of(null);
      })
    ).subscribe(res => {
      if (!res) return;
      const execId = res.workflowExecutionId;
      if (!execId) { this.execSvc.failRun('No execution ID returned'); return; }

      const currentRun = this.run();
      if (currentRun) {
        this.execSvc.activeRun.set({ ...currentRun, executionId: execId });
      }

      this.startTracking(execId);
    });
  }

  cancel(): void {
    const execId = this.run()?.executionId;
    if (!execId) return;
    this.api.cancelExecution(execId).pipe(catchError(() => of(null))).subscribe();
    this.stopTracking();
    this.execSvc.failRun('Cancelled by user');
    this.notify.info('Workflow execution cancelled');
  }

  /**
   * Three-layer real-time tracking:
   *   L1 SSE  — real-time agent events (most granular, when available)
   *   L2 Logs — AgentActivityLogs poll every 5s (reliable per-agent data)
   *   L3 Status — overall status poll every 3s (triggers result fetch on COMPLETED)
   */
  private startTracking(execId: string): void {
    this.trackDone$.next(); // cancel any previous tracking

    // L1: SSE stream — real-time agent events
    this.sseSub = this.execSvc.streamExecution(execId).subscribe({
      next: event => {
        console.log('[AES SSE]', event);
        this.execSvc.applyEvent(event);
      },
      error: err => console.warn('[AES SSE] stream unavailable (logs+status polling active):', err),
      complete: () => console.log('[AES SSE] stream closed'),
    });

    // L2: Logs poll — GET /workflows/workflow-executions/{id}/logs → AgentActivityLogs
    this.logsPollSub = interval(5000).pipe(
      switchMap(() => this.api.getExecutionLogs(execId).pipe(catchError(() => of(null)))),
      takeUntil(this.trackDone$),
    ).subscribe((res: any) => {
      if (res) this.applyLogsResponse(res);
    });

    // L3: Status poll — GET /workflows/workflow-executions/{id} → overall status
    this.pollSub = interval(3000).pipe(
      switchMap(() => this.api.getExecutionStatus(execId).pipe(catchError(() => of(null)))),
      takeWhile((res: any) => {
        if (!res) return true;
        const st = (res?.status ?? res?.executionStatus ?? '').toUpperCase();
        return !['COMPLETED', 'FAILED', 'ERROR', 'CANCELLED'].includes(st);
      }, true),
    ).subscribe((res: any) => {
      if (!res) return;
      console.log('[AES POLL status]', res);
      this.applyPollStatus(res);

      const st = (res?.status ?? res?.executionStatus ?? '').toUpperCase();
      if (st === 'COMPLETED') {
        this.stopTracking();
        this.finishExecution(execId);
      } else if (['FAILED', 'ERROR', 'CANCELLED'].includes(st)) {
        this.stopTracking();
        this.execSvc.failRun('Execution failed on server');
        this.notify.error('Workflow execution failed');
      }
    });
  }

  /** Parses AgentActivityLogs from the logs endpoint — per-agent status with real timestamps */
  private applyLogsResponse(raw: any): void {
    console.log('[AES POLL logs]', raw);

    // AAVA may use PascalCase or camelCase for this field
    const logs: any[] =
      raw?.AgentActivityLogs ??
      raw?.agentActivityLogs ??
      raw?.activityLogs      ??
      raw?.agentLogs         ??
      raw?.taskLogs          ??
      raw?.logs              ??
      (Array.isArray(raw) ? raw : []);

    if (!logs.length) return;

    logs.forEach((log: any) => {
      const serial = log.serial ?? log.serialNo ?? log.order ?? null;
      const idx    = serial !== null ? (serial as number) - 1 : null;
      if (idx === null || idx < 0 || idx >= this.agents().length) return;

      const newStatus = mapStatus(log.status ?? log.taskStatus ?? log.executionStatus ?? '');
      this.applyAgentPatch(idx, newStatus, log);
    });
  }

  /** Parses the status endpoint response — overall status + optional task array */
  private applyPollStatus(res: any): void {
    const taskExecs: any[] =
      res?.taskExecutions     ??
      res?.agentExecutions    ??
      res?.tasks              ??
      res?.agents             ??
      res?.pipelineExecutions ??
      [];

    if (taskExecs.length > 0) {
      taskExecs.forEach((task: any) => {
        const serial = task.serial ?? task.serialNo ?? task.order ?? task.sequence ?? null;
        const idx    = serial !== null ? (serial as number) - 1 : null;
        if (idx === null || idx < 0 || idx >= this.agents().length) return;

        const newStatus = mapStatus(task.status ?? task.taskStatus ?? task.executionStatus ?? '');
        this.applyAgentPatch(idx, newStatus, task);
      });
    } else {
      // No per-agent data — minimum: start agent[0] when execution is confirmed RUNNING
      const overallSt = (res?.status ?? res?.executionStatus ?? '').toUpperCase();
      if (overallSt === 'RUNNING') {
        const allPending = this.agents().every(a => a.status === 'pending');
        if (allPending) {
          this.execSvc.updateAgentProgress(0, { status: 'running', startedAt: new Date() });
        }
      }
    }
  }

  /** Shared patch logic — applies a status update to a single agent, never rolling backward */
  private applyAgentPatch(idx: number, newStatus: AgentProgress['status'], source: any): void {
    const current = this.agents()[idx];
    if (!current || newStatus === 'pending') return;

    // Monotonic: never go from done → running, done → pending, etc.
    if (STATUS_ORDER[newStatus] < STATUS_ORDER[current.status]) return;

    const patch: Partial<AgentProgress> = {};
    if (newStatus !== current.status) patch.status = newStatus;

    if ((newStatus === 'running' || newStatus === 'done' || newStatus === 'error') && !current.startedAt) {
      patch.startedAt = source.startTime ? new Date(source.startTime) : new Date();
    }
    if ((newStatus === 'done' || newStatus === 'error') && !current.completedAt) {
      patch.completedAt = source.endTime ? new Date(source.endTime) : new Date();
    }

    const output = source.output ?? source.result ?? source.raw ?? source.response ?? '';
    if (output && !current.output) patch.output = String(output);

    const name = source.agentName ?? source.name ?? source.agent?.name ?? '';
    if (name && name !== current.name) patch.name = name;

    if (Object.keys(patch).length > 0) {
      this.execSvc.updateAgentProgress(idx, patch);
    }
  }

  private finishExecution(execId: string): void {
    this.api.getExecutionResult(execId).pipe(catchError(() => of(null))).subscribe(res => {
      if (res) this.parseAndCompleteRun(res);
      else     this.execSvc.completeRun({});
    });
  }

  private parseAndCompleteRun(res: any): void {
    try {
      const data = res?.data ?? res;
      let parsed: any = data;
      if (typeof data?.result?.response === 'string') {
        parsed = JSON.parse(data.result.response);
      }

      const tasks     = parsed?.tasksOutputs ?? [];
      const agentList = parsed?.pipeLineAgents ?? [];
      const progress  = this.agents();

      tasks.forEach((task: any, i: number) => {
        const idx = Math.min(i, progress.length - 1);
        this.execSvc.updateAgentProgress(idx, {
          status: 'done',
          output:      task?.raw ?? task?.output ?? '',
          name:        agentList[i]?.agent?.name ?? progress[idx]?.name,
          completedAt: progress[idx]?.completedAt ?? new Date(),
          startedAt:   progress[idx]?.startedAt   ?? new Date(),
        });
      });

      // Flush anything that didn't get a terminal event
      this.agents().forEach((a, i) => {
        if (a.status !== 'done' && a.status !== 'error') {
          this.execSvc.updateAgentProgress(i, { status: 'done', completedAt: new Date() });
        }
      });

      this.executionResult.set(parsed);
      this.execSvc.completeRun(parsed);
      this.showResults.set(true);
      this.notify.success('Workflow execution completed!');
    } catch {
      this.execSvc.completeRun(res);
      this.showResults.set(true);
    }
  }

  private stopTracking(): void {
    this.trackDone$.next();
    this.pollSub?.unsubscribe();
    this.logsPollSub?.unsubscribe();
    this.sseSub?.unsubscribe();
  }

  reset(): void {
    this.stopTracking();
    this.execSvc.reset();
    this.showResults.set(false);
    this.executionResult.set(null);
  }

  agentStatusIcon(status: string): string {
    switch (status) {
      case 'done':    return 'check_circle';
      case 'running': return 'pending';
      case 'error':   return 'error';
      default:        return 'radio_button_unchecked';
    }
  }

  /**
   * Sequential unlock: show completed agents + the current one (completed+1).
   * Agent N+1 card only appears in the DOM once agent N reaches 'done' or 'error'.
   */
  visibleAgents = computed(() => {
    const all = this.agents();
    if (!all.length) return [];
    return all.slice(0, Math.min(this.completedAgentCount() + 1, all.length));
  });

  /** Name of the next agent not yet visible — shown as "up next" hint */
  nextAgentName = computed(() => {
    const all     = this.agents();
    const visible = this.visibleAgents();
    if (visible.length >= all.length) return '';
    return all[visible.length]?.name ?? '';
  });

  completedAgentCount = computed(() =>
    this.agents().filter(a => a.status === 'done' || a.status === 'error').length
  );

  overallProgress = computed(() => {
    const a    = this.agents();
    if (!a.length) return 0;
    const done    = this.completedAgentCount();
    const running = a.filter(x => x.status === 'running').length;
    return Math.round(((done + running * 0.5) / a.length) * 100);
  });

  elapsedTime = computed(() => {
    this.tick(); // re-evaluates every second
    const r = this.run();
    if (!r?.startedAt) return '';
    const ms = (r.completedAt ? r.completedAt.getTime() : Date.now()) - r.startedAt.getTime();
    const s  = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  });

  finalOutput = computed(() => {
    const res = this.executionResult();
    if (!res) return '';
    return res?.output ?? res?.tasksOutputs?.[res.tasksOutputs.length - 1]?.raw ?? '';
  });
}
