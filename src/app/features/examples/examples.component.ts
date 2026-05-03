import { Component, inject, signal, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { catchError, of } from 'rxjs';
import { AavaApiService } from '../../core/services/aava-api.service';
import { NotificationService } from '../../core/services/notification.service';

interface ExampleRun {
  id: string;
  workflowName: string;
  workflowId: number;
  startedAt: Date;
  completedAt?: Date;
  status: 'COMPLETED' | 'FAILED';
  agentCount: number;
  outputs: { agentName: string; preview: string }[];
  finalOutput?: string;
  durationMs?: number;
}

@Component({
  selector: 'app-examples',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule,
    MatChipsModule, MatExpansionModule, MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './examples.component.html',
  styleUrl: './examples.component.scss',
})
export class ExamplesComponent implements OnInit {
  private api    = inject(AavaApiService);
  private notify = inject(NotificationService);

  loading  = signal(true);
  examples = signal<ExampleRun[]>([]);

  ngOnInit(): void {
    this.api.listWorkflowExecutions().pipe(
      catchError(() => of(null))
    ).subscribe((res: any) => {
      this.loading.set(false);
      const execs = res?.data ?? res ?? [];
      const runs: ExampleRun[] = execs
        .filter((e: any) => e.executionStatus === 'COMPLETED' || e.status === 'COMPLETED')
        .slice(0, 20)
        .map((e: any) => ({
          id: e.workflowExecutionId ?? e.id,
          workflowName: e.workflowName ?? e.pipelineName ?? 'Workflow',
          workflowId: e.workflowId ?? e.pipelineId ?? 0,
          startedAt: new Date(e.startTime ?? e.createdAt ?? Date.now()),
          completedAt: e.endTime ? new Date(e.endTime) : undefined,
          status: 'COMPLETED',
          agentCount: e.totalAgents ?? 0,
          outputs: [],
          finalOutput: '',
          durationMs: e.endTime ? new Date(e.endTime).getTime() - new Date(e.startTime ?? e.createdAt).getTime() : undefined,
        }));

      // Inject demo examples if none from API
      if (!runs.length) {
        this.examples.set(this.getDemoExamples());
      } else {
        this.examples.set(runs);
      }
    });
  }

  loadDetails(run: ExampleRun): void {
    if (run.outputs.length || run.finalOutput) return;
    this.api.getExecutionResult(run.id).pipe(
      catchError(() => of(null))
    ).subscribe((res: any) => {
      try {
        const data = res?.data ?? res;
        let parsed: any = data;
        if (typeof data?.result?.response === 'string') {
          parsed = JSON.parse(data.result.response);
        }
        const tasks = parsed?.tasksOutputs ?? [];
        const agents = parsed?.pipeLineAgents ?? [];
        const outputs = tasks.map((t: any, i: number) => ({
          agentName: agents[i]?.agent?.name ?? `Agent ${i + 1}`,
          preview: (t?.raw ?? t?.output ?? '').slice(0, 300),
        }));
        const finalOutput = parsed?.output ?? outputs[outputs.length - 1]?.preview ?? '';

        const updated = this.examples().map(e =>
          e.id === run.id ? { ...e, outputs, finalOutput } : e
        );
        this.examples.set(updated);
      } catch {}
    });
  }

  duration(run: ExampleRun): string {
    if (run.durationMs == null) return '';
    const s = Math.floor(run.durationMs / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  private getDemoExamples(): ExampleRun[] {
    return [
      {
        id: 'demo-1',
        workflowName: 'WGP LEGACY MODERNIZATION RUBY TO SPRING BOOT v2',
        workflowId: 15613,
        startedAt: new Date(Date.now() - 86400000 * 2),
        completedAt: new Date(Date.now() - 86400000 * 2 + 1800000),
        status: 'COMPLETED',
        agentCount: 6,
        durationMs: 1800000,
        outputs: [
          { agentName: 'RUBY DEPENDENCY ANALYZER', preview: 'Analyzed 142 Ruby gems, identified 23 deprecated dependencies, flagged 4 security vulnerabilities...' },
          { agentName: 'RUBY TECHNICAL DOCUMENT CREATOR', preview: 'Created comprehensive technical documentation covering 12 modules, 89 classes, 312 methods...' },
          { agentName: 'USER STORIES CREATOR', preview: 'Generated 47 user stories across 8 epics with acceptance criteria and complexity estimates...' },
          { agentName: 'LOW LEVEL DESIGN CREATOR', preview: 'Designed Spring Boot microservices architecture with 6 bounded contexts, REST API contracts...' },
          { agentName: 'WGP API CODE GENERATOR', preview: 'Generated 28 Java classes including controllers, services, repositories, DTOs, and configuration...' },
          { agentName: 'WGP JUNIT TEST GENERATOR', preview: 'Created 94 JUnit 5 tests with 87% code coverage across all generated Java classes...' },
        ],
        finalOutput: '# Migration Complete\n\n## Summary\n- 28 Java source files generated\n- 94 unit tests with 87% coverage\n- Full Spring Boot 3.2 + PostgreSQL architecture\n- Ready for CI/CD pipeline integration',
      },
      {
        id: 'demo-2',
        workflowName: 'Vista PostAcq Integration Platform Pipeline',
        workflowId: 15789,
        startedAt: new Date(Date.now() - 86400000),
        completedAt: new Date(Date.now() - 86400000 + 2400000),
        status: 'COMPLETED',
        agentCount: 6,
        durationMs: 2400000,
        outputs: [
          { agentName: 'Vista Portfolio Systems Analyst', preview: 'Analyzed 12 portfolio companies across 4 technology stacks. Identified headless commerce candidates...' },
          { agentName: 'Vista Headless Platform Architect', preview: 'Designed unified headless commerce platform leveraging Composable Commerce architecture...' },
          { agentName: 'Vista PostAcq Integration Playbook Author', preview: 'Created 45-page integration playbook with 90-day migration framework for each portfolio company...' },
          { agentName: 'Vista Experience Layer Designer', preview: 'Designed omnichannel experience layer supporting Web, Mobile, Kiosk, and API-first patterns...' },
          { agentName: 'Vista Value Creation ROI Modeler', preview: 'Modeled $127M NPV over 5 years with 34% IRR. Integration costs offset by Year 2 efficiency gains...' },
          { agentName: 'Vista Executive Report Generator', preview: 'Executive HTML report generated with 8 sections, financial projections, risk analysis...' },
        ],
        finalOutput: '# Vista PostAcq Executive Report\n\n## Investment Thesis\nHeadless commerce unification across 12 portfolio companies delivers $127M NPV...',
      },
    ];
  }
}
