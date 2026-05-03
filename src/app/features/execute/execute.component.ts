import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { CommonModule } from '@angular/common';
import { catchError, interval, of, Subscription, switchMap, takeWhile } from 'rxjs';
import { AavaApiService } from '../../core/services/aava-api.service';
import { ExecutionService } from '../../core/services/execution.service';
import { NotificationService } from '../../core/services/notification.service';
import { ExecutionStatus, AgentProgress } from '../../core/models/execution.models';

@Component({
  selector: 'app-execute',
  standalone: true,
  imports: [
    FormsModule, CommonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressBarModule,
    MatProgressSpinnerModule, MatExpansionModule, MatCardModule,
    MatDividerModule, MatChipsModule,
  ],
  templateUrl: './execute.component.html',
  styleUrl: './execute.component.scss',
})
export class ExecuteComponent implements OnDestroy {
  private api       = inject(AavaApiService);
  private execSvc   = inject(ExecutionService);
  private notify    = inject(NotificationService);

  readonly run      = this.execSvc.activeRun;
  readonly agents   = this.execSvc.agentProgress;
  readonly isRunning = this.execSvc.isRunning;

  workflows = signal<{ id: number; name: string; agentCount?: number }[]>([]);
  selectedWorkflow: number | null = null;
  inputText = '';
  selectedFile: File | null = null;
  loadingWorkflows = signal(false);
  showResults = signal(false);
  executionResult = signal<any>(null);

  private pollSub?: Subscription;
  private sseSub?: Subscription;

  ExecutionStatus = ExecutionStatus;

  ngOnDestroy(): void {
    this.stopPolling();
  }

  loadWorkflows(): void {
    this.loadingWorkflows.set(true);
    this.api.listUserWorkflows(1, 100).pipe(
      catchError(() => of({ workFlowDetails: [], totalNoOfRecords: 0 }))
    ).subscribe(res => {
      this.loadingWorkflows.set(false);
      this.workflows.set(
        (res.workFlowDetails ?? [])
          .filter((w: any) => w.status === 'APPROVED')
          .map((w: any) => ({ id: w.id, name: w.name, agentCount: w.workflowAgents?.length }))
      );
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  canRun = computed(() =>
    !!this.selectedWorkflow && !this.isRunning()
  );

  run$ = (): void => {
    const wfId = this.selectedWorkflow;
    if (!wfId) return;

    const wf = this.workflows().find(w => w.id === wfId);
    const agentCount = wf?.agentCount ?? 3;
    this.execSvc.startRun(wfId, wf?.name ?? 'Workflow', agentCount);
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

      // Update activeRun with execution ID
      const currentRun = this.run();
      if (currentRun) {
        this.execSvc.activeRun.set({ ...currentRun, executionId: execId });
      }

      // Try SSE first, fall back to polling
      this.startSseOrPoll(execId);
    });
  };

  private startSseOrPoll(execId: string): void {
    this.sseSub = this.execSvc.streamExecution(execId).subscribe({
      next: event => this.execSvc.applyEvent(event),
      error: () => this.startPolling(execId),
      complete: () => this.finishExecution(execId),
    });
  }

  private startPolling(execId: string): void {
    this.pollSub = interval(3000).pipe(
      switchMap(() => this.api.getExecutionResult(execId).pipe(catchError(() => of(null)))),
      takeWhile((res: any) => {
        if (!res) return true;
        const status = res?.status ?? res?.executionStatus ?? '';
        return !['COMPLETED', 'FAILED', 'ERROR'].includes(status);
      }, true),
    ).subscribe((res: any) => {
      if (!res) return;
      const status = res?.status ?? res?.executionStatus ?? '';

      if (['COMPLETED', 'FAILED', 'ERROR'].includes(status)) {
        if (status === 'COMPLETED') {
          this.parseAndCompleteRun(res);
        } else {
          this.execSvc.failRun('Execution failed');
          this.notify.error('Workflow execution failed');
        }
      }
    });
  }

  private finishExecution(execId: string): void {
    this.api.getExecutionResult(execId).pipe(
      catchError(() => of(null))
    ).subscribe(res => {
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

      // Update agent progress from result
      const tasks = parsed?.tasksOutputs ?? [];
      const agentList = parsed?.pipeLineAgents ?? [];
      const progress = this.agents();
      tasks.forEach((task: any, i: number) => {
        const idx = Math.min(i, progress.length - 1);
        this.execSvc.updateAgentProgress(idx, {
          status: 'done',
          output: task?.raw ?? task?.output ?? '',
          name: agentList[i]?.agent?.name ?? progress[idx]?.name,
          completedAt: new Date(),
        });
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

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.sseSub?.unsubscribe();
  }

  reset(): void {
    this.stopPolling();
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
    const agents = this.agents();
    if (!agents.length) return 0;
    const done = agents.filter(a => a.status === 'done').length;
    const running = agents.filter(a => a.status === 'running').length;
    return Math.round(((done + running * 0.5) / agents.length) * 100);
  });

  elapsedTime = computed(() => {
    const run = this.run();
    if (!run?.startedAt) return '';
    const ms = (run.completedAt ? run.completedAt.getTime() : Date.now()) - run.startedAt.getTime();
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
