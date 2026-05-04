import { Injectable, inject, signal, computed } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { AavaApiService } from './aava-api.service';
import { ArtifactSummary, ArtifactType } from '../models/artifact.models';

/**
 * Singleton cache loaded once at login.
 * All feature components read from here — zero per-page API round trips.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactCacheService {
  private api = inject(AavaApiService);

  readonly allArtifacts = signal<ArtifactSummary[]>([]);
  readonly rawWorkflows  = signal<any[]>([]);   // full objects with workflowAgents[]
  readonly rawAgents     = signal<any[]>([]);   // full agent objects

  readonly loading  = signal(false);
  readonly loadedAt = signal<Date | null>(null);

  /** True when at least one preload has completed */
  readonly isLoaded = computed(() => this.loadedAt() !== null);

  preload(): void {
    if (this.loading()) return;
    this.loading.set(true);

    forkJoin({
      agents:     this.api.listAgents(1, 200).pipe(catchError(() => of({ agentDetails: [], totalNoOfRecords: 0 }))),
      workflows:  this.api.listUserWorkflows(1, 200).pipe(catchError(() => of({ workFlowDetails: [], totalNoOfRecords: 0 }))),
      tools:      this.api.listUserTools(1, 200).pipe(catchError(() => of({ userToolDetails: [], totalNoOfRecords: 0 }))),
      guardrails: this.api.listGuardrails(1, 200).pipe(catchError(() => of({ guardrails: [], totalNoOfRecords: 0 }))),
      kbs:        this.api.listKnowledgeBases(0, 200).pipe(catchError(() => of({ data: [], totalElements: 0 }))),
    }).subscribe(res => {
      const workflows = res.workflows.workFlowDetails ?? [];
      const agents    = res.agents.agentDetails ?? [];
      this.rawWorkflows.set(workflows);
      this.rawAgents.set(agents);

      const guardrailArr: any[] =
        (res.guardrails as any).guardrails ??
        (res.guardrails as any).guardrailsList ??
        (Array.isArray(res.guardrails) ? res.guardrails : []);

      const items: ArtifactSummary[] = [
        ...agents.map((a: any) => ({
          id: a.id, name: a.name, type: 'AGENT' as ArtifactType,
          status: a.status, description: a.description,
          createdAt: a.createdAt, updatedAt: a.updatedAt,
        })),
        ...workflows.map((w: any) => ({
          id: w.id, name: w.name, type: 'WORKFLOW' as ArtifactType,
          status: w.status, description: w.description,
          createdAt: w.createdAt, updatedAt: w.updatedAt,
        })),
        ...(res.tools.userToolDetails ?? []).map((t: any) => ({
          id: t.id, name: t.name, type: 'TOOL' as ArtifactType,
          status: t.status, description: t.description,
          createdAt: t.createdAt, updatedAt: t.updatedAt,
        })),
        ...guardrailArr.map((g: any) => ({
          id: g.id ?? g.guardrailId, name: g.name, type: 'GUARDRAIL' as ArtifactType,
          status: g.status, description: g.description,
          createdAt: g.createdAt ?? g.modifiedAt, updatedAt: g.updatedAt ?? g.modifiedAt,
        })),
        ...(res.kbs.data ?? []).map((k: any) => ({
          id: k.id, name: k.knowledgeBase ?? k.name, type: 'KB' as ArtifactType,
          status: k.status, description: k.description,
          createdAt: k.createdAt, updatedAt: k.updatedAt,
        })),
      ];

      items.sort((a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      );

      this.allArtifacts.set(items);
      this.loadedAt.set(new Date());
      this.loading.set(false);
    });
  }

  /** Returns workflow raw object (with workflowAgents[]) by ID */
  getWorkflow(id: number): any {
    return this.rawWorkflows().find(w => w.id === id);
  }
}
