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
import { ExecutionStatus } from '../../core/models/execution.models';

interface WorkflowOption {
  id: number;
  name: string;
  status?: string;
  agentCount?: number;
  agentNames?: string[];
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
  showResults      = signal(false);
  executionResult  = signal<any>(null);

  private pollSub?: Subscription;
  private sseSub?: Subscription;
  private timerSub?: Subscription;

  ExecutionStatus = ExecutionStatus;

  ngOnInit(): void {
    this.loadWorkflows();
    // Handle re-run from Example Runs page
    this.route.queryParams.subscribe(p => {
      if (p['workflowId']) {
        this.selectedWorkflow = Number(p['workflowId']);
      }
      if (p['input']) this.inputText = p['input'];
    });
  }

  ngOnDestroy(): void {
    this.stopAll();
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
        }))
        .sort((a: any, b: any) => {
          if (a.status === 'APPROVED' && b.status !== 'APPROVED') return -1;
          if (b.status === 'APPROVED' && a.status !== 'APPROVED') return 1;
          return a.name.localeCompare(b.name);
        });
      this.workflows.set(all);
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

    const wf = this.selectedWf;
    const agentNames = wf?.agentNames ?? [];
    const agentCount = agentNames.length || wf?.agentCount || 3;

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

      this.startProgressSimulation(agentCount);
      this.startSseOrPoll(execId);
    });
  }

  /** Simulate per-agent progress while waiting for real data */
  private startProgressSimulation(agentCount: number): void {
    const avgAgentMs = 45000; // assume ~45s per agent
    const startTime = Date.now();

    this.timerSub = interval(1200).subscribe(() => {
      if (!this.isRunning()) { this.timerSub?.unsubscribe(); return; }
      const elapsed = Date.now() - startTime;
      const estimatedDone = (elapsed / avgAgentMs);
      const currentAgent = Math.min(Math.floor(estimatedDone), agentCount - 1);
      const agentFraction = estimatedDone - Math.floor(estimatedDone);

      const agents = this.agents();
      agents.forEach((a, i) => {
        const st = a.status as string;
        if (st === 'done' || st === 'error') return;
        if (i < currentAgent) {
          if (st !== 'done') {
            this.execSvc.updateAgentProgress(i, { status: 'done', completedAt: new Date() });
          }
        } else if (i === currentAgent) {
          if (st !== 'running') {
            this.execSvc.updateAgentProgress(i, { status: 'running', startedAt: new Date() });
          }
        }
      });
    });
  }

  private startSseOrPoll(execId: string): void {
    this.sseSub = this.execSvc.streamExecution(execId).subscribe({
      next: event => this.execSvc.applyEvent(event),
      error: () => this.startPolling(execId),
      complete: () => this.finishExecution(execId),
    });
  }

  private startPolling(execId: string): void {
    this.pollSub = interval(4000).pipe(
      switchMap(() => this.api.getExecutionStatus(execId).pipe(catchError(() => of(null)))),
      takeWhile((res: any) => {
        if (!res) return true;
        const st = res?.status ?? res?.executionStatus ?? '';
        return !['COMPLETED', 'FAILED', 'ERROR'].includes(st);
      }, true),
    ).subscribe((res: any) => {
      if (!res) return;
      const st = res?.status ?? res?.executionStatus ?? '';
      if (['COMPLETED', 'FAILED', 'ERROR'].includes(st)) {
        if (st === 'COMPLETED') this.finishExecution(execId);
        else { this.execSvc.failRun('Execution failed'); this.notify.error('Workflow execution failed'); }
      }
    });
  }

  private finishExecution(execId: string): void {
    this.timerSub?.unsubscribe();
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
          completedAt: new Date(),
        });
      });
      // Mark any remaining running agents done
      this.agents().forEach((a, i) => {
        if (a.status === 'running') {
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
    this.timerSub?.unsubscribe();
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
    const done    = a.filter(x => x.status === 'done').length;
    const running = a.filter(x => x.status === 'running').length;
    return Math.round(((done + running * 0.5) / a.length) * 100);
  });

  elapsedTime = computed(() => {
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
