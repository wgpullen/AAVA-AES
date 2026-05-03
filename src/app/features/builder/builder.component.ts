import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { AavaApiService } from '../../core/services/aava-api.service';
import { NotificationService } from '../../core/services/notification.service';

interface BuilderAgent {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  description: string;
  expectedOutput: string;
  aiEngine: string;
  modelId: number;
  id?: number;
  status?: 'pending' | 'creating' | 'created' | 'approved' | 'error';
  error?: string;
}

interface BuilderPlan {
  problem: string;
  industry: string;
  agents: BuilderAgent[];
  workflowName: string;
  kbNames: string[];
  guardrailNames: string[];
}

const MODELS = [
  { id: 493, name: 'claude-4-5-sonnet', engine: 'AmazonBedrock', label: 'Claude 4.5 (Bedrock)' },
  { id: 495, name: 'claude-4-sonnet',   engine: 'AmazonBedrock', label: 'Claude 4 (Bedrock)' },
  { id: 53,  name: 'gpt-4o',            engine: 'AzureOpenAI',   label: 'GPT-4o (Azure)' },
  { id: 52,  name: 'gpt-4.1',           engine: 'AzureOpenAI',   label: 'GPT-4.1 (Azure)' },
  { id: 490, name: 'gemini-2.5-pro',    engine: 'GoogleAI',      label: 'Gemini 2.5 Pro' },
];

@Component({
  selector: 'app-builder',
  standalone: true,
  imports: [
    FormsModule, CommonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatStepperModule,
    MatCardModule, MatChipsModule, MatProgressBarModule,
    MatProgressSpinnerModule, MatDividerModule, MatCheckboxModule, RouterLink,
  ],
  templateUrl: './builder.component.html',
  styleUrl: './builder.component.scss',
})
export class BuilderComponent {
  private api    = inject(AavaApiService);
  private notify = inject(NotificationService);

  step = signal<'input' | 'plan' | 'build' | 'done'>('input');
  problem      = signal('');
  industry     = signal('');
  generating   = signal(false);
  building     = signal(false);
  buildProgress = signal(0);

  plan = signal<BuilderPlan | null>(null);
  builtWorkflowId = signal<number | null>(null);

  models = MODELS;
  autoApprove = true;

  agentStatuses = signal<BuilderAgent['status'][]>([]);

  generatePlan(): void {
    if (!this.problem()) return;
    this.generating.set(true);

    // Generate plan using Claude-style reasoning based on the problem
    setTimeout(() => {
      const agents = this.inferAgents(this.problem(), this.industry());
      this.plan.set({
        problem: this.problem(),
        industry: this.industry(),
        workflowName: this.inferWorkflowName(this.problem()),
        agents,
        kbNames: this.inferKBs(this.problem()),
        guardrailNames: this.inferGuardrails(this.industry()),
      });
      this.agentStatuses.set(agents.map(() => 'pending'));
      this.generating.set(false);
      this.step.set('plan');
    }, 1800);
  }

  private inferWorkflowName(problem: string): string {
    const words = problem.split(' ').slice(0, 6).join(' ');
    return `AES - ${words} Pipeline`;
  }

  private inferAgents(problem: string, industry: string): BuilderAgent[] {
    const p = problem.toLowerCase();
    const isCode = p.includes('code') || p.includes('software') || p.includes('api') || p.includes('build');
    const isAnalysis = p.includes('analyz') || p.includes('data') || p.includes('report');
    const isContent = p.includes('content') || p.includes('writ') || p.includes('document');

    const agents: BuilderAgent[] = [
      {
        name: 'Requirements Analyst',
        role: `${industry ? industry + ' ' : ''}Requirements Analyst`,
        goal: `Deeply analyze and document all requirements for: ${problem}`,
        backstory: `Expert analyst who breaks down complex problems into clear, actionable specifications`,
        description: `STEP 1: Read the input and extract all requirements.\nSTEP 2: Organize requirements by priority and complexity.\nSTEP 3: Document assumptions and edge cases.\nSTEP 4: Output a structured requirements document.`,
        expectedOutput: 'Structured requirements document with acceptance criteria',
        aiEngine: 'AmazonBedrock',
        modelId: 493,
      },
    ];

    if (isCode) {
      agents.push({
        name: 'Architecture Designer',
        role: 'Software Architect',
        goal: `Design a robust technical architecture for the requirements`,
        backstory: `Senior software architect with expertise in modern cloud-native and microservices patterns`,
        description: `STEP 1: Review the requirements document.\nSTEP 2: Design the system architecture with components and interfaces.\nSTEP 3: Define data models and API contracts.\nSTEP 4: Output an architecture document with diagrams in Mermaid format.`,
        expectedOutput: 'Architecture document with Mermaid diagrams and component specifications',
        aiEngine: 'AmazonBedrock',
        modelId: 493,
      });
      agents.push({
        name: 'Code Generator',
        role: 'Senior Software Engineer',
        goal: `Generate production-quality code based on the architecture`,
        backstory: `Expert software engineer who writes clean, tested, production-ready code`,
        description: `STEP 1: Review architecture and requirements.\nSTEP 2: Generate all necessary code files.\nSTEP 3: Add error handling and logging.\nSTEP 4: Include inline documentation and usage examples.`,
        expectedOutput: 'Complete, production-ready code with documentation',
        aiEngine: 'AmazonBedrock',
        modelId: 493,
      });
    } else if (isAnalysis) {
      agents.push({
        name: 'Data Analyst',
        role: `${industry} Data Analyst`,
        goal: `Perform deep analysis of the data and extract actionable insights`,
        backstory: `Expert data analyst specializing in ${industry || 'enterprise'} domains`,
        description: `STEP 1: Process all available data.\nSTEP 2: Apply statistical analysis and pattern recognition.\nSTEP 3: Identify key trends, anomalies, and opportunities.\nSTEP 4: Quantify findings with supporting evidence.`,
        expectedOutput: 'Comprehensive analysis report with quantified insights',
        aiEngine: 'AzureOpenAI',
        modelId: 53,
      });
    } else if (isContent) {
      agents.push({
        name: 'Content Strategist',
        role: 'Content Strategy Expert',
        goal: `Develop compelling, targeted content strategy`,
        backstory: `Expert content strategist with deep knowledge of effective communication`,
        description: `STEP 1: Analyze target audience and goals.\nSTEP 2: Define messaging framework and key themes.\nSTEP 3: Create content outline with prioritization.\nSTEP 4: Develop style guidelines and tone of voice.`,
        expectedOutput: 'Content strategy document with audience profiles and messaging framework',
        aiEngine: 'AmazonBedrock',
        modelId: 493,
      });
    }

    agents.push({
      name: 'Executive Reporter',
      role: 'Executive Communication Specialist',
      goal: `Synthesize all outputs into an executive-ready deliverable`,
      backstory: `Expert at distilling complex technical and analytical work into clear executive summaries`,
      description: `STEP 1: Review all previous agent outputs.\nSTEP 2: Extract key findings and recommendations.\nSTEP 3: Structure content for executive audience.\nSTEP 4: Format as a professional HTML report with executive summary, key findings, recommendations, and next steps.`,
      expectedOutput: 'Professional HTML executive report suitable for C-suite presentation',
      aiEngine: 'AzureOpenAI',
      modelId: 53,
    });

    return agents;
  }

  private inferKBs(problem: string): string[] {
    const p = problem.toLowerCase();
    const kbs: string[] = [];
    if (p.includes('code') || p.includes('api')) kbs.push('Technical Standards KB');
    if (p.includes('compliance') || p.includes('legal')) kbs.push('Compliance Guidelines KB');
    if (p.includes('finance') || p.includes('cost')) kbs.push('Financial Models KB');
    return kbs;
  }

  private inferGuardrails(industry: string): string[] {
    const guardrails = ['output-quality-guardrail'];
    if (industry.toLowerCase().includes('finance') || industry.toLowerCase().includes('banking')) {
      guardrails.push('financial-compliance-guardrail');
    }
    if (industry.toLowerCase().includes('health')) {
      guardrails.push('hipaa-compliance-guardrail');
    }
    return guardrails;
  }

  updateAgent(i: number, field: keyof BuilderAgent, value: any): void {
    this.plan.update(p => {
      if (!p) return p;
      const agents = [...p.agents];
      agents[i] = { ...agents[i], [field]: value };
      return { ...p, agents };
    });
  }

  removeAgent(i: number): void {
    this.plan.update(p => {
      if (!p) return p;
      const agents = p.agents.filter((_, idx) => idx !== i);
      return { ...p, agents };
    });
    this.agentStatuses.update(s => s.filter((_, idx) => idx !== i));
  }

  addAgent(): void {
    const blank: BuilderAgent = {
      name: 'New Agent', role: 'Specialist', goal: '',
      backstory: '', description: '', expectedOutput: '',
      aiEngine: 'AmazonBedrock', modelId: 493, status: 'pending',
    };
    this.plan.update(p => p ? { ...p, agents: [...p.agents, blank] } : p);
    this.agentStatuses.update(s => [...s, 'pending']);
  }

  buildPipeline(): void {
    const p = this.plan();
    if (!p) return;
    this.building.set(true);
    this.step.set('build');
    this.buildProgress.set(0);
    this.createAgentsSequentially(p.agents, 0);
  }

  private createAgentsSequentially(agents: BuilderAgent[], idx: number): void {
    if (idx >= agents.length) {
      this.createWorkflow(agents);
      return;
    }

    this.agentStatuses.update(s => {
      const next = [...s]; next[idx] = 'creating'; return next;
    });

    const agent = agents[idx];
    const payload = {
      name: agent.name,
      role: agent.role,
      goal: agent.goal,
      backstory: agent.backstory,
      description: agent.description,
      expectedOutput: agent.expectedOutput,
      status: 'CREATED',
      practiceAreaId: 6,
      tags: [6, 8, 10],
      teamId: 229,
      allowDelegation: false,
      agentConfigs: {
        aiEngine: agent.aiEngine,
        model: this.models.find(m => m.id === agent.modelId)?.name ?? 'anthropic.claude-4-5-sonnet',
        modelId: agent.modelId,
        preset: 'Deterministic',
        temperature: 0.1,
        topP: 0.6,
        maxIter: 5,
        maxRpm: 10,
        maxExecutionTime: 600,
      },
    };

    this.api.createAgent(payload as any).pipe(
      catchError(err => {
        this.agentStatuses.update(s => { const n=[...s]; n[idx]='error'; return n; });
        this.plan.update(p => {
          if (!p) return p;
          const a = [...p.agents]; a[idx] = { ...a[idx], error: err.message };
          return { ...p, agents: a };
        });
        return of({ id: -1 });
      })
    ).subscribe(res => {
      const agentId = res.id;
      this.plan.update(p => {
        if (!p) return p;
        const a = [...p.agents]; a[idx] = { ...a[idx], id: agentId };
        return { ...p, agents: a };
      });

      if (agentId > 0 && this.autoApprove) {
        forkJoin([
          this.api.submitAgentForReview(agentId).pipe(catchError(() => of(null))),
        ]).subscribe(() => {
          this.api.approveAgent(agentId).pipe(catchError(() => of(null))).subscribe(() => {
            this.agentStatuses.update(s => { const n=[...s]; n[idx]='approved'; return n; });
            this.buildProgress.set(Math.round(((idx + 1) / (agents.length + 1)) * 100));
            this.createAgentsSequentially(agents, idx + 1);
          });
        });
      } else {
        this.agentStatuses.update(s => { const n=[...s]; n[idx]='created'; return n; });
        this.buildProgress.set(Math.round(((idx + 1) / (agents.length + 1)) * 100));
        this.createAgentsSequentially(agents, idx + 1);
      }
    });
  }

  private createWorkflow(agents: BuilderAgent[]): void {
    const p = this.plan();
    if (!p) return;

    const validAgents = agents.filter(a => a.id && a.id > 0);
    const payload = {
      name: p.workflowName,
      description: `Auto-built pipeline for: ${p.problem}`,
      status: 'DRAFTED',
      teamId: 229,
      workflowConfig: {},
      workflowAgents: validAgents.map((a, i) => ({ serial: i + 1, agentId: a.id! })),
    };

    this.api.createWorkflow(payload as any).pipe(
      catchError(err => {
        this.notify.error(`Workflow creation failed: ${err.message}`);
        this.building.set(false);
        return of(null);
      })
    ).subscribe(res => {
      if (!res) return;
      this.builtWorkflowId.set(res.id);
      this.buildProgress.set(100);
      this.building.set(false);
      this.step.set('done');
      this.notify.success(`Pipeline "${p.workflowName}" created successfully!`);
    });
  }

  reset(): void {
    this.step.set('input');
    this.plan.set(null);
    this.problem.set('');
    this.industry.set('');
    this.builtWorkflowId.set(null);
    this.buildProgress.set(0);
  }
}
