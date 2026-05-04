import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
import { catchError, of } from 'rxjs';
import { AavaApiService } from '../../core/services/aava-api.service';
import { ArtifactCacheService } from '../../core/services/artifact-cache.service';
import { ProjectsService } from '../../core/services/projects.service';
import { NotificationService } from '../../core/services/notification.service';
import { ArtifactSummary, ArtifactType } from '../../core/models/artifact.models';
import { TypeCountPipe } from '../../shared/pipes/type-count.pipe';

type SortField = 'name' | 'type' | 'status' | 'createdAt';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [
    FormsModule, CommonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTableModule,
    MatChipsModule, MatTooltipModule, MatProgressSpinnerModule,
    MatMenuModule, MatProgressBarModule,
    TypeCountPipe,
  ],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent {
  private api      = inject(AavaApiService);
  readonly cache   = inject(ArtifactCacheService);
  private projects = inject(ProjectsService);
  private notify   = inject(NotificationService);
  private router   = inject(Router);

  query        = '';
  typeFilter: ArtifactType | 'ALL' = 'ALL';
  statusFilter: 'ALL' | 'APPROVED' | 'CREATED' | 'IN_REVIEW' = 'ALL';
  sortField    = signal<SortField>('createdAt');
  sortDir      = signal<'asc' | 'desc'>('desc');

  cloningId    = signal<number | null>(null);

  displayedColumns = ['favorite', 'name', 'type', 'status', 'createdAt', 'actions'];

  artifactTypes: { value: ArtifactType | 'ALL'; label: string }[] = [
    { value: 'ALL',       label: 'All Types' },
    { value: 'AGENT',     label: 'Agents' },
    { value: 'WORKFLOW',  label: 'Workflows' },
    { value: 'TOOL',      label: 'Tools' },
    { value: 'KB',        label: 'Knowledge Bases' },
    { value: 'GUARDRAIL', label: 'Guardrails' },
  ];

  /** All filtering, searching, and sorting done locally against the cache — zero API calls */
  get filtered(): ArtifactSummary[] {
    let items = this.cache.allArtifacts();
    if (this.typeFilter !== 'ALL')   items = items.filter(i => i.type === this.typeFilter);
    if (this.statusFilter !== 'ALL') items = items.filter(i => i.status === this.statusFilter);
    if (this.query.trim()) {
      const q = this.query.toLowerCase();
      items = items.filter(i =>
        i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
      );
    }
    items = [...items].sort((a, b) => {
      const dir = this.sortDir() === 'asc' ? 1 : -1;
      const field = this.sortField();
      if (field === 'createdAt') {
        return dir * (new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
      }
      return dir * ((a[field] ?? '').localeCompare(b[field] ?? ''));
    });
    return items;
  }

  onSearch(): void { /* filtering is reactive via getter — nothing to call */ }

  setSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('desc');
    }
  }

  reload(): void { this.cache.preload(); }

  isFavorite(item: ArtifactSummary): boolean {
    return this.projects.isFavorite(item.id, item.type);
  }

  toggleFavorite(item: ArtifactSummary): void {
    this.projects.toggleFavorite({ artifactId: item.id, type: item.type, name: item.name });
    this.notify.info(this.isFavorite(item) ? 'Added to favorites' : 'Removed from favorites');
  }

  typeChipClass(type: ArtifactType): string { return type.toLowerCase(); }

  typeIcon(type: ArtifactType): string {
    const m: Record<string, string> = {
      AGENT: 'smart_toy', WORKFLOW: 'account_tree',
      TOOL: 'build', KB: 'menu_book', GUARDRAIL: 'security',
    };
    return m[type] ?? 'circle';
  }

  // ── Type-specific actions ─────────────────────────────

  runWorkflow(item: ArtifactSummary): void {
    this.router.navigate(['/studio/execute'], { queryParams: { workflowId: item.id } });
  }

  testAgent(item: ArtifactSummary): void {
    // Navigate to execute with agent context (future: dedicated agent-test panel)
    this.notify.info(`Testing agent "${item.name}" — enter a prompt in Execute & Watch`);
    this.router.navigate(['/studio/execute']);
  }

  testTool(item: ArtifactSummary): void {
    this.notify.info(`Tool testing: open "${item.name}" in the Pipeline Builder to test it in context`);
  }

  testGuardrail(item: ArtifactSummary): void {
    this.notify.info(`Guardrail validation for "${item.name}" — use POST /guardrails/validate via the API`);
  }

  cloneArtifact(item: ArtifactSummary): void {
    if (this.cloningId() === item.id) return;
    this.cloningId.set(item.id);

    let clone$;
    switch (item.type) {
      case 'AGENT':     clone$ = this.api.cloneAgent(item.id);    break;
      case 'WORKFLOW':  clone$ = this.api.cloneWorkflow(item.id); break;
      case 'TOOL':      clone$ = this.api.cloneTool(item.id);     break;
      case 'GUARDRAIL': clone$ = this.api.cloneGuardrail(item.id); break;
      default:
        this.notify.info(`Clone not supported for type ${item.type}`);
        this.cloningId.set(null);
        return;
    }

    clone$.pipe(catchError(err => {
      this.notify.error(`Clone failed: ${err.message}`);
      return of(null);
    })).subscribe(res => {
      this.cloningId.set(null);
      if (res) {
        this.notify.success(`"${item.name}" cloned successfully`);
        this.cache.preload(); // refresh cache to show the new clone
      }
    });
  }
}
