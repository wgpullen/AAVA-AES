import { Injectable, inject, signal, computed } from '@angular/core';
import { catchError, of, timeout } from 'rxjs';
import { AavaApiService } from './aava-api.service';
import { ArtifactSummary, ArtifactType } from '../models/artifact.models';

/**
 * Singleton cache loaded once at login.
 * Each of the 5 artifact types loads independently — fast endpoints (guardrails, KBs,
 * workflows) appear in ~1-5s while heavy endpoints (agents: ~40s, tools: ~22s) stream
 * in afterwards. All feature components read from here — zero per-page API round trips.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactCacheService {
  private api = inject(AavaApiService);

  readonly allArtifacts = signal<ArtifactSummary[]>([]);
  readonly rawWorkflows  = signal<any[]>([]);   // full objects with workflowAgents[]
  readonly rawAgents     = signal<any[]>([]);   // full agent objects

  readonly loading  = signal(false);
  readonly loadedAt = signal<Date | null>(null);

  /** True once the first successful batch has arrived (may still be loading remaining types) */
  readonly isLoaded = computed(() => this.loadedAt() !== null);

  preload(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.allArtifacts.set([]);
    this.rawWorkflows.set([]);
    this.rawAgents.set([]);
    this.loadedAt.set(null); // reset so retry properly clears "loaded" state

    // Count in-flight streams; clear loading when all 5 have settled (success or timeout)
    let pending = 5;
    const settle = () => {
      if (--pending === 0) {
        if (!this.loadedAt()) this.loadedAt.set(new Date()); // mark loaded even if all empty
        this.loading.set(false);
      }
    };

    // Merge new items into the cache, deduplicating by type+id, sorted by createdAt desc.
    // Also clears the loading state as soon as the first batch arrives.
    const addItems = (newItems: ArtifactSummary[]) => {
      if (!newItems.length) return;
      this.allArtifacts.update(prev => {
        const existingKeys = new Set(prev.map(x => `${x.type}:${x.id}`));
        const merged = [
          ...prev,
          ...newItems.filter(x => !existingKeys.has(`${x.type}:${x.id}`)),
        ];
        return merged.sort((a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
        );
      });
      // First batch to arrive marks the cache as loaded and clears the loading banner
      if (!this.loadedAt()) {
        this.loadedAt.set(new Date());
        this.loading.set(false);
      }
    };

    // ── Agents — large endpoint (~40s for 4,285 agents in realm 32) ─────────
    this.api.listAgents(1, 200).pipe(
      timeout(90_000),
      catchError(() => of({ agentDetails: [], totalNoOfRecords: 0 }))
    ).subscribe(res => {
      const agents = (res as any).agentDetails ?? [];
      this.rawAgents.set(agents);
      addItems(agents.map((a: any) => ({
        id: a.id, name: a.name, type: 'AGENT' as ArtifactType,
        status: a.status, description: a.description,
        createdAt: a.createdAt, updatedAt: a.updatedAt,
      })));
      settle();
    });

    // ── Workflows — fast (~4s) ───────────────────────────────────────────────
    this.api.listUserWorkflows(1, 200).pipe(
      timeout(90_000),
      catchError(() => of({ workFlowDetails: [], totalNoOfRecords: 0 }))
    ).subscribe(res => {
      const workflows = (res as any).workFlowDetails ?? [];
      this.rawWorkflows.set(workflows);
      addItems(workflows.map((w: any) => ({
        id: w.id, name: w.name, type: 'WORKFLOW' as ArtifactType,
        status: w.status, description: w.description,
        createdAt: w.createdAt, updatedAt: w.updatedAt,
      })));
      settle();
    });

    // ── Tools — can be slow (~22s) ───────────────────────────────────────────
    this.api.listUserTools(1, 200).pipe(
      timeout(90_000),
      catchError(() => of({ userToolDetails: [], totalNoOfRecords: 0 }))
    ).subscribe(res => {
      addItems(((res as any).userToolDetails ?? []).map((t: any) => ({
        id: t.id, name: t.name, type: 'TOOL' as ArtifactType,
        status: t.status, description: t.description,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
      })));
      settle();
    });

    // ── Guardrails — fast (~1s) ──────────────────────────────────────────────
    this.api.listGuardrails(1, 200).pipe(
      timeout(90_000),
      catchError(() => of({ guardrails: [], totalNoOfRecords: 0 }))
    ).subscribe(res => {
      const guardrailArr: any[] =
        (res as any).guardrails ??
        (res as any).guardrailsList ??
        (Array.isArray(res) ? res : []);
      addItems(guardrailArr.map((g: any) => ({
        id: g.id ?? g.guardrailId, name: g.name, type: 'GUARDRAIL' as ArtifactType,
        status: g.status, description: g.description,
        createdAt: g.createdAt ?? g.modifiedAt, updatedAt: g.updatedAt ?? g.modifiedAt,
      })));
      settle();
    });

    // ── Knowledge Bases — fast (~1s) ─────────────────────────────────────────
    this.api.listKnowledgeBases(0, 200).pipe(
      timeout(90_000),
      catchError(() => of({ data: [], totalElements: 0 }))
    ).subscribe(res => {
      addItems(((res as any).data ?? []).map((k: any) => ({
        id: k.id, name: k.knowledgeBase ?? k.name, type: 'KB' as ArtifactType,
        status: k.status, description: k.description,
        createdAt: k.createdAt, updatedAt: k.updatedAt,
      })));
      settle();
    });
  }

  /** Returns workflow raw object (with workflowAgents[]) by ID */
  getWorkflow(id: number): any {
    return this.rawWorkflows().find(w => w.id === id);
  }
}
