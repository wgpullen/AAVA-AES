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
import { catchError, interval, of, Subscription, switchMap, takeWhile } from 'rxjs';
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
  private api       = inject(AavaApiService);
  private execSvc   = inject(ExecutionService);
  private notify    = inject(NotificationService);
  private route     = inject(ActivatedRoute);

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

  private pollSub?: Subscription;
  private sseSub?: Subscription;
  private tickSub?: Subscription;

  // Tick every second so elapsedTime computed stays live
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
    this.stopAll();
    this.tickSub?.unsubscribe();
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

  /** Called when user picks a workflow — fetches full details for accurate agent list */
  onWorkflowChange(): void {
    if (!this.selectedWorkflow) return;
    const wf = this.selectedWf;
    if (wf?.detailsLoaded) return; // already fetched

    this.loadingDetails.set(true);
    this.api.getWorkflowDetails(this.selectedWorkflow).pipe(
      catchError(() => of(null))
    ).subscribe((detail: any) => {
      this.loadingDetails.set(false);
      if (!detail) return;

      const sorted = (detail?.workflowAgents ?? [])
        .sort((a: any, b: any) => (a.serial ?? 0) - (b.serial ?? 0));

      const agentNames: string[] = sorted
        .map((wa: any) => wa.agent?.name ?? wa.agentName ?? null)
        .filter(Boolean);

      const agentCount = sorted.length || (detail?.agentCount ?? wf?.agentCount ?? 0);

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

  get canRun(): boolean {
    return !!this.selectedWorkflow && !this.isRunning();
  }

  get selectedWf(): WorkflowOption | undefined {
    return this.workflows().find(w => w.id === this.selectedWorkflow);
  }

  run$(): void {
    const wfId = this.selectedWorkflow;
    if (!wfId) return;

    const wf          = this.selectedWf;
    const agentNames  = wf?.agentNames ?? [];
    const agentCount  = agentNames.length || wf?.agentCount || 1;

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

  /**
   * Polling is the primary source of truth for agent-level progress.
   * SSE runs in parallel as supplemental; if it errors, polling covers it.
   */
  private startTracking(execId: string): void {
    // Primary: poll every 3 seconds, parse per-agent status from each response
    this.pollSub = interval(3000).pipe(
      switchMap(() => this.api.getExecutionStatus(execId).pipe(catchError(() => of(null)))),
      takeWhile((res: any) => {
        if (!res) return true;
        const st = (res?.status ?? res?.executionStatus ?? '').toUpperCase();
        return !['COMPLETED', 'FAILED', 'ERROR', 'CANCELLED'].includes(st);
      }, true),
    ).subscribe((res: any) => {
      if (!res) return;
      this.applyPollStatus(res);

      const st = (res?.status ?? res?.executionStatus ?? '').toUpperCase();
      if (st === 'COMPLETED') {
        this.sseSub?.unsubscribe();
        this.finishExecution(execId);
      } else if (['FAILED', 'ERROR', 'CANCELLED'].includes(st)) {
        this.sseSub?.unsubscribe();
        this.execSvc.failRun('Execution failed on server');
        this.notify.error('Workflow execution failed');
      }
    });

    // Secondary: SSE for faster event delivery when it's available
    this.sseSub = this.execSvc.streamExecution(execId).subscribe({
      next: event => this.execSvc.applyEvent(event),
      error: () => {}, // polling covers this
      complete: () => {}, // polling handles completion
    });
  }

  /**
   * Parses the raw status poll response and updates per-agent progress signals
   * with real data from the API. Handles multiple AAVA field name variants.
   * Status never goes backwards (pending → running → done/error only).
   */
  private applyPollStatus(res: any): void {
    const taskExecs: any[] =
      res?.taskExecutions     ??
      res?.agentExecutions    ??
      res?.tasks              ??
      res?.agents             ??
      res?.pipelineExecutions ??
      [];

    if (taskExecs.length > 0) {
      const statusOrder: Record<AgentProgress['status'], number> = {
        pending: 0, running: 1, done: 2, error: 2,
      };

      taskExecs.forEach((task: any) => {
        // AAVA uses 1-indexed serial numbers; convert to 0-indexed array position
        const serial = task.serial ?? task.serialNo ?? task.order ?? task.sequence ?? null;
        const idx = serial !== null ? (serial as number) - 1 : null;
        if (idx === null || idx < 0 || idx >= this.agents().length) return;

        const rawStatus = (
          task.status ?? task.taskStatus ?? task.executionStatus ?? task.agentStatus ?? ''
        ).toUpperCase();

        let newStatus: AgentProgress['status'] = 'pending';
        if (['RUNNING', 'IN_PROGRESS', 'STARTED', 'EXECUTING', 'ACTIVE'].includes(rawStatus)) {
          newStatus = 'running';
        } else if (['COMPLETED', 'SUCCESS', 'DONE', 'FINISHED', 'SUCCEEDED'].includes(rawStatus)) {
          newStatus = 'done';
        } else if (['FAILED', 'ERROR', 'ERRORED', 'CANCELLED'].includes(rawStatus)) {
          newStatus = 'error';
        }

        const current = this.agents()[idx];
        if (!current) return;

        const patch: Partial<AgentProgress> = {};

        // Only advance status — never roll back a done/running agent to pending
        if (newStatus !== 'pending' && statusOrder[newStatus] >= statusOrder[current.status]) {
          if (newStatus !== current.status) patch.status = newStatus;
        }

        if (newStatus === 'running' && !current.startedAt) {
          patch.startedAt = task.startTime ? new Date(task.startTime) : new Date();
        }
        if ((newStatus === 'done' || newStatus === 'error') && !current.completedAt) {
          patch.completedAt = task.endTime ? new Date(task.endTime) : new Date();
          if (!current.startedAt && !patch.startedAt) {
            patch.startedAt = task.startTime ? new Date(task.startTime) : patch.completedAt;
          }
        }

        const outputRaw = task.output ?? task.result ?? task.raw ?? task.response ?? '';
        if (outputRaw && !current.output) patch.output = String(outputRaw);

        const nameRaw = task.agentName ?? task.name ?? task.agent?.name ?? '';
        if (nameRaw && nameRaw !== current.name) patch.name = nameRaw;

        if (Object.keys(patch).length > 0) {
          this.execSvc.updateAgentProgress(idx, patch);
        }
      });
    } else {
      // No per-agent array returned — minimum: mark first agent running when
      // the overall execution transitions from QUEUED to RUNNING
      const overallSt = (res?.status ?? res?.executionStatus ?? '').toUpperCase();
      if (overallSt === 'RUNNING') {
        const allStillPending = this.agents().every(a => a.status === 'pending');
        if (allStillPending) {
          this.execSvc.updateAgentProgress(0, { status: 'running', startedAt: new Date() });
        }
      }
    }
  }

  private finishExecution(execId: string): void {
    this.pollSub?.unsubscribe();
    this.api.getExecutionResult(execId).pipe(catchError(() => of(null))).subscribe(res => {
      if (res) this.parseAndCompleteRun(res);
      else this.execSvc.completeRun({});
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
          output: task?.raw ?? task?.output ?? '',
          name: agentList[i]?.agent?.name ?? progress[idx]?.name,
          completedAt: progress[idx]?.completedAt ?? new Date(),
          startedAt: progress[idx]?.startedAt ?? new Date(),
        });
      });
      // Flush any agent that never got a completion event
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

  private stopAll(): void {
    this.pollSub?.unsubscribe();
    this.sseSub?.unsubscribe();
  }

  reset(): void {
    this.stopAll();
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

  overallProgress = computed(() => {
    const a = this.agents();
    if (!a.length) return 0;
    const done    = a.filter(x => x.status === 'done' || x.status === 'error').length;
    const running = a.filter(x => x.status === 'running').length;
    return Math.round(((done + running * 0.5) / a.length) * 100);
  });

  elapsedTime = computed(() => {
    this.tick(); // re-run every second while running
    const r = this.run();
    if (!r?.startedAt) return '';
    const ms = (r.completedAt ? r.completedAt.getTime() : Date.now()) - r.startedAt.getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  });

  finalOutput = computed(() => {
    const res = this.executionResult();
    if (!res) return '';
    return res?.output ?? res?.tasksOutputs?.[res.tasksOutputs.length - 1]?.raw ?? '';
  });
}
