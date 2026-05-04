import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { CommonModule } from '@angular/common';
import { catchError, forkJoin, of } from 'rxjs';
import { AavaApiService } from '../../core/services/aava-api.service';
import { NotificationService } from '../../core/services/notification.service';
import { RealmService } from '../../core/services/realm.service';

type Tab = 'workflow' | 'lists';

interface ExecRun {
  id: string;
  workflowName: string;
  workflowId: number;
  startedAt: Date;
  completedAt?: Date;
  status: string;
  agentCount: number;
  durationMs?: number;
  userInput?: string;
  outputs: { agentName: string; preview: string }[];
  finalOutput?: string;
  realmId?: string;
  expanded: boolean;
}

interface AdminList {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  artifacts?: { id: number; type: string; name: string; status?: string }[];
  itemCount?: number;
}

@Component({
  selector: 'app-examples',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatTooltipModule, MatChipsModule,
  ],
  templateUrl: './examples.component.html',
  styleUrl:  './examples.component.scss',
})
export class ExamplesComponent implements OnInit {
  private api    = inject(AavaApiService);
  private notify = inject(NotificationService);
  private router = inject(Router);
  realm          = inject(RealmService);

  activeTab = signal<Tab>('workflow');

  // ── Workflow Executions tab ───────────────────────────
  loading = signal(true);
  runs    = signal<ExecRun[]>([]);
  statusFilter: string = 'ALL';

  get filtered(): ExecRun[] {
    const r = this.runs();
    if (this.statusFilter === 'ALL') return r;
    return r.filter(x => x.status === this.statusFilter);
  }

  // ── My Lists tab ──────────────────────────────────────
  listsLoading = signal(false);
  listsLoaded  = signal(false);
  lists        = signal<AdminList[]>([]);
  expandedList = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRuns();
  }

  switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'lists' && !this.listsLoaded()) {
      this.loadLists();
    }
  }

  // ── Workflow Executions ───────────────────────────────

  loadRuns(): void {
    this.loading.set(true);

    const realmIds = this.realm.isAll()
      ? this.realm.realmIds()
      : [this.realm.active()];

    const fetches = realmIds.map(rid =>
      this.api.listWorkflowExecutionsForRealm(rid, 1, 100).pipe(catchError(() => of(null)))
    );

    forkJoin(fetches).subscribe(results => {
      this.loading.set(false);
      const allRuns: ExecRun[] = [];

      results.forEach((res, idx) => {
        if (!res) return;
        const realmId = realmIds[idx];
        const raw: any[] = res?.data ?? res?.workflowExecutionDetails ?? res?.executions ?? (Array.isArray(res) ? res : []);
        raw.forEach((e: any) => {
          const status = e.executionStatus ?? e.status ?? 'UNKNOWN';
          const startedAt = new Date(e.startTime ?? e.createdAt ?? Date.now());
          const completedAt = e.endTime ? new Date(e.endTime) : undefined;
          allRuns.push({
            id: e.workflowExecutionId ?? e.id ?? String(Math.random()),
            workflowName: e.workflowName ?? e.pipelineName ?? 'Workflow Run',
            workflowId: e.workflowId ?? e.pipelineId ?? 0,
            startedAt,
            completedAt,
            status,
            agentCount: e.totalAgents ?? e.agentCount ?? 0,
            durationMs: completedAt ? completedAt.getTime() - startedAt.getTime() : undefined,
            userInput: e.userInputs?.userInput ?? e.userInput ?? '',
            outputs: [],
            realmId,
            expanded: false,
          });
        });
      });

      allRuns.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      this.runs.set(allRuns);
    });
  }

  toggle(run: ExecRun): void {
    this.runs.update(prev => prev.map(r =>
      r.id === run.id ? { ...r, expanded: !r.expanded } : r
    ));
    if (!run.expanded && !run.outputs.length && run.status === 'COMPLETED') {
      this.loadDetails(run.id);
    }
  }

  private loadDetails(runId: string): void {
    this.api.getExecutionResult(runId).pipe(catchError(() => of(null))).subscribe((res: any) => {
      try {
        const data = res?.data ?? res;
        let parsed: any = data;
        if (typeof data?.result?.response === 'string') parsed = JSON.parse(data.result.response);
        const tasks  = parsed?.tasksOutputs ?? [];
        const agents = parsed?.pipeLineAgents ?? [];
        const outputs = tasks.map((t: any, i: number) => ({
          agentName: agents[i]?.agent?.name ?? `Agent ${i + 1}`,
          preview: (t?.raw ?? t?.output ?? '').slice(0, 400),
        }));
        const finalOutput = parsed?.output ?? outputs[outputs.length - 1]?.preview ?? '';
        this.runs.update(prev => prev.map(r =>
          r.id === runId ? { ...r, outputs, finalOutput } : r
        ));
      } catch {}
    });
  }

  reRun(run: ExecRun): void {
    this.router.navigate(['/studio/execute'], {
      queryParams: { workflowId: run.workflowId, input: run.userInput ?? '' },
    });
    if (run.userInput) {
      this.notify.info(`Navigated to Execute — input pre-filled with original run data`);
    }
  }

  duration(run: ExecRun): string {
    if (run.durationMs == null) return '';
    const s = Math.floor(run.durationMs / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  statusIcon(status: string): string {
    switch (status) {
      case 'COMPLETED': return 'check_circle';
      case 'FAILED':    return 'error';
      case 'RUNNING':   return 'pending';
      default:          return 'help_outline';
    }
  }

  statusClass(status: string): string {
    switch (status) {
      case 'COMPLETED': return 'completed';
      case 'FAILED':    return 'failed';
      case 'RUNNING':   return 'running';
      default:          return '';
    }
  }

  // ── My Lists ──────────────────────────────────────────

  loadLists(): void {
    this.listsLoading.set(true);
    this.api.getAdminLists().pipe(catchError(() => of([]))).subscribe((res: any) => {
      this.listsLoading.set(false);
      this.listsLoaded.set(true);
      const raw: any[] = res?.data ?? res?.lists ?? (Array.isArray(res) ? res : []);
      this.lists.set(raw.map((l: any) => ({
        id: l.id ?? l.listId ?? String(Math.random()),
        name: l.name ?? l.listName ?? 'Unnamed List',
        description: l.description ?? '',
        createdAt: l.createdAt,
        artifacts: l.artifacts ?? l.items ?? [],
        itemCount: l.itemCount ?? l.artifactCount ?? (l.artifacts ?? l.items ?? []).length,
      })));
    });
  }

  toggleList(id: string): void {
    this.expandedList.update(cur => cur === id ? null : id);
  }

  typeIcon(type: string): string {
    const m: Record<string, string> = {
      AGENT: 'smart_toy', WORKFLOW: 'account_tree',
      TOOL: 'build', KB: 'menu_book', GUARDRAIL: 'security',
    };
    return m[type] ?? 'circle';
  }

  typeChipClass(type: string): string { return type.toLowerCase(); }

  runFromList(artifact: any): void {
    if (artifact.type === 'WORKFLOW') {
      this.router.navigate(['/studio/execute'], { queryParams: { workflowId: artifact.id } });
    } else {
      this.notify.info(`Navigate to Execute & Watch to run this artifact`);
    }
  }
}
