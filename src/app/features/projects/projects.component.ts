import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { ProjectsService } from '../../core/services/projects.service';
import { NotificationService } from '../../core/services/notification.service';
import { ArtifactCacheService } from '../../core/services/artifact-cache.service';
import { ArtifactSummary, ArtifactType } from '../../core/models/artifact.models';
import { Project, UseCase } from '../../core/models/project.models';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    FormsModule, CommonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDialogModule,
    MatTooltipModule, MatChipsModule, MatExpansionModule, MatProgressSpinnerModule,
  ],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent {
  private svc    = inject(ProjectsService);
  private notify = inject(NotificationService);
  readonly cache = inject(ArtifactCacheService);

  readonly projects  = this.svc.projects;
  readonly favorites = this.svc.favorites;

  newProjectName  = signal('');
  newProjectDesc  = signal('');
  showNewProject  = signal(false);

  newUCName       = signal('');
  newUCDesc       = signal('');
  addingToProject = signal<string | null>(null);

  // Artifact picker state
  pickerProjectId = signal<string | null>(null);
  pickerUseCaseId = signal<string | null>(null);
  pickerQuery     = signal('');
  pickerType      = signal<ArtifactType | 'ALL'>('ALL');

  pickerResults = computed<ArtifactSummary[]>(() => {
    if (!this.pickerProjectId()) return [];
    let items = this.cache.allArtifacts();
    if (this.pickerType() !== 'ALL') items = items.filter(i => i.type === this.pickerType());
    const q = this.pickerQuery().toLowerCase().trim();
    if (q) items = items.filter(i => i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    return items.slice(0, 30);
  });

  artifactTypes: { value: ArtifactType | 'ALL'; label: string }[] = [
    { value: 'ALL',       label: 'All Types' },
    { value: 'AGENT',     label: 'Agents' },
    { value: 'WORKFLOW',  label: 'Workflows' },
    { value: 'TOOL',      label: 'Tools' },
    { value: 'KB',        label: 'Knowledge Bases' },
    { value: 'GUARDRAIL', label: 'Guardrails' },
  ];

  createProject(): void {
    const name = this.newProjectName().trim();
    if (!name) return;
    this.svc.createProject(name, this.newProjectDesc());
    this.newProjectName.set('');
    this.newProjectDesc.set('');
    this.showNewProject.set(false);
    this.notify.success(`Project "${name}" created`);
  }

  deleteProject(id: string, name: string): void {
    if (!confirm(`Delete project "${name}" and all its use cases?`)) return;
    this.svc.deleteProject(id);
    this.notify.info(`Project "${name}" deleted`);
  }

  startAddUseCase(projectId: string): void {
    this.addingToProject.set(projectId);
    this.newUCName.set('');
    this.newUCDesc.set('');
  }

  addUseCase(projectId: string): void {
    const name = this.newUCName().trim();
    if (!name) return;
    this.svc.addUseCase(projectId, { name, description: this.newUCDesc(), artifacts: [] });
    this.addingToProject.set(null);
    this.notify.success(`Use case "${name}" added`);
  }

  removeUseCase(projectId: string, ucId: string, name: string): void {
    this.svc.removeUseCase(projectId, ucId);
    this.notify.info(`Use case "${name}" removed`);
  }

  // Artifact picker
  openPicker(projectId: string, ucId: string): void {
    this.pickerProjectId.set(projectId);
    this.pickerUseCaseId.set(ucId);
    this.pickerQuery.set('');
    this.pickerType.set('ALL');
  }

  closePicker(): void {
    this.pickerProjectId.set(null);
    this.pickerUseCaseId.set(null);
  }

  attachArtifact(artifact: ArtifactSummary): void {
    const pid = this.pickerProjectId();
    const uid = this.pickerUseCaseId();
    if (!pid || !uid) return;
    this.svc.addArtifactToUseCase(pid, uid, {
      id: artifact.id, type: artifact.type,
      name: artifact.name, status: artifact.status,
    });
    this.notify.success(`"${artifact.name}" added to use case`);
  }

  detachArtifact(projectId: string, ucId: string, artifactId: number, type: string, name: string): void {
    this.svc.removeArtifactFromUseCase(projectId, ucId, artifactId, type);
    this.notify.info(`"${name}" removed from use case`);
  }

  isAttached(projectId: string, ucId: string, artifact: ArtifactSummary): boolean {
    const project = this.projects().find(p => p.id === projectId);
    const uc = project?.useCases.find(u => u.id === ucId);
    return uc?.artifacts.some(a => a.id === artifact.id && a.type === artifact.type) ?? false;
  }

  loadArtifacts(): void {
    this.cache.preload();
  }

  removeFavorite(artifactId: number, type: string, name: string): void {
    this.svc.removeFavorite(artifactId, type);
    this.notify.info(`Removed "${name}" from favorites`);
  }

  typeChipClass(type: string): string { return type.toLowerCase(); }

  typeIcon(type: string): string {
    const m: Record<string, string> = {
      AGENT: 'smart_toy', WORKFLOW: 'account_tree',
      TOOL: 'build', KB: 'menu_book', GUARDRAIL: 'security',
    };
    return m[type] ?? 'circle';
  }
}
