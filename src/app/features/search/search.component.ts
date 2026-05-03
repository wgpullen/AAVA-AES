import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CommonModule } from '@angular/common';
import { debounceTime, distinctUntilChanged, Subject, switchMap, catchError, of, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AavaApiService } from '../../core/services/aava-api.service';
import { ProjectsService } from '../../core/services/projects.service';
import { NotificationService } from '../../core/services/notification.service';
import { ArtifactSummary, ArtifactType } from '../../core/models/artifact.models';
import { TypeCountPipe } from '../../shared/pipes/type-count.pipe';

type SortField = 'name' | 'type' | 'status' | 'createdAt';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [
    FormsModule, CommonModule, RouterLink,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTableModule,
    MatChipsModule, MatTooltipModule, MatProgressSpinnerModule,
    MatMenuModule, MatProgressBarModule,
    TypeCountPipe,
  ],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent implements OnInit {
  private api      = inject(AavaApiService);
  private projects = inject(ProjectsService);
  private notify   = inject(NotificationService);

  query        = '';
  typeFilter: ArtifactType | 'ALL' = 'ALL';
  statusFilter: 'ALL' | 'APPROVED' | 'CREATED' | 'IN_REVIEW' = 'ALL';
  sortField    = signal<SortField>('createdAt');
  sortDir      = signal<'asc' | 'desc'>('desc');
  page         = signal(0);
  pageSize  = 20;

  loading  = signal(false);
  allItems = signal<ArtifactSummary[]>([]);
  total    = signal(0);
  hasMore  = signal(false);

  private search$ = new Subject<void>();
  private destroyed = takeUntilDestroyed();

  displayedColumns = ['favorite', 'name', 'type', 'status', 'createdAt', 'actions'];

  artifactTypes: { value: ArtifactType | 'ALL'; label: string }[] = [
    { value: 'ALL',       label: 'All Types' },
    { value: 'AGENT',     label: 'Agents' },
    { value: 'WORKFLOW',  label: 'Workflows' },
    { value: 'TOOL',      label: 'Tools' },
    { value: 'KB',        label: 'Knowledge Bases' },
    { value: 'GUARDRAIL', label: 'Guardrails' },
  ];

  get filtered(): ArtifactSummary[] {
    let items = [...this.allItems()];
    if (this.typeFilter !== 'ALL') items = items.filter(i => i.type === this.typeFilter);
    if (this.statusFilter !== 'ALL') items = items.filter(i => i.status === this.statusFilter);
    items.sort((a, b) => {
      const dir = this.sortDir() === 'asc' ? 1 : -1;
      const field = this.sortField();
      if (field === 'createdAt') {
        return dir * (new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
      }
      return dir * ((a[field] ?? '').localeCompare(b[field] ?? ''));
    });
    return items;
  }

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      this.destroyed,
    ).subscribe(() => {
      this.loading.set(true);
      this.loadArtifacts();
    });
    this.search$.next();
  }

  private loadArtifacts() {
    const q = this.query;
    return forkJoin({
      agents:     this.api.listAgents(1, 50, q).pipe(catchError(() => of({ agentDetails: [], totalNoOfRecords: 0 }))),
      workflows:  this.api.listUserWorkflows(1, 50, q).pipe(catchError(() => of({ workFlowDetails: [], totalNoOfRecords: 0 }))),
      tools:      this.api.listUserTools(1, 50, q).pipe(catchError(() => of({ userToolDetails: [], totalNoOfRecords: 0 }))),
      guardrails: this.api.listGuardrails(1, 50, q).pipe(catchError(() => of({ guardrails: [], totalNoOfRecords: 0 }))),
      kbs:        this.api.listKnowledgeBases(0, 50, q).pipe(catchError(() => of({ data: [], totalElements: 0 }))),
    }).pipe(
      catchError(() => { this.notify.error('Failed to load artifacts'); return of(null); }),
    ).subscribe(res => {
      this.loading.set(false);
      if (!res) return;

      const items: ArtifactSummary[] = [
        ...(res.agents.agentDetails ?? []).map((a: any) => ({
          id: a.id, name: a.name, type: 'AGENT' as ArtifactType,
          status: a.status, description: a.description,
          createdAt: a.createdAt, updatedAt: a.updatedAt,
        })),
        ...(res.workflows.workFlowDetails ?? []).map((w: any) => ({
          id: w.id, name: w.name, type: 'WORKFLOW' as ArtifactType,
          status: w.status, description: w.description,
          createdAt: w.createdAt, updatedAt: w.updatedAt,
        })),
        ...(res.tools.userToolDetails ?? []).map((t: any) => ({
          id: t.id, name: t.name, type: 'TOOL' as ArtifactType,
          status: t.status, description: t.description,
          createdAt: t.createdAt, updatedAt: t.updatedAt,
        })),
        ...(res.guardrails.guardrails ?? []).map((g: any) => ({
          id: g.id, name: g.name, type: 'GUARDRAIL' as ArtifactType,
          status: g.status, description: g.description,
          createdAt: g.createdAt, updatedAt: g.updatedAt,
        })),
        ...(res.kbs.data ?? []).map((k: any) => ({
          id: k.id, name: k.knowledgeBase ?? k.name, type: 'KB' as ArtifactType,
          status: k.status, description: k.description,
          createdAt: k.createdAt, updatedAt: k.updatedAt,
        })),
      ];

      // Sort most-recent-first by default
      items.sort((a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      );

      this.allItems.set(items);
      this.total.set(items.length);
    });
  }

  onSearch(): void { this.page.set(0); this.search$.next(); }

  ngModelChange(): void { this.onSearch(); }

  setSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('desc');
    }
  }

  isFavorite(item: ArtifactSummary): boolean {
    return this.projects.isFavorite(item.id, item.type);
  }

  toggleFavorite(item: ArtifactSummary): void {
    this.projects.toggleFavorite({ artifactId: item.id, type: item.type, name: item.name });
    const msg = this.isFavorite(item) ? `Removed from favorites` : `Added to favorites`;
    this.notify.info(msg);
  }

  typeChipClass(type: ArtifactType): string {
    return type.toLowerCase();
  }

  typeIcon(type: ArtifactType): string {
    const m: Record<string, string> = {
      AGENT: 'smart_toy', WORKFLOW: 'account_tree',
      TOOL: 'build', KB: 'menu_book', GUARDRAIL: 'security',
    };
    return m[type] ?? 'circle';
  }

  executeWorkflow(item: ArtifactSummary): void {
    // Navigate to execute tab with pre-selected workflow
    this.notify.info(`Navigate to Execute tab to run "${item.name}"`);
  }

  cloneArtifact(item: ArtifactSummary): void {
    this.notify.info(`Clone functionality for "${item.name}" — use the builder to create a copy`);
  }
}
