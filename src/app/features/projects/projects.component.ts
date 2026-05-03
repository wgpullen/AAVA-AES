import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { CommonModule } from '@angular/common';
import { ProjectsService } from '../../core/services/projects.service';
import { NotificationService } from '../../core/services/notification.service';
import { Project, UseCase } from '../../core/models/project.models';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    FormsModule, CommonModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatDialogModule, MatTooltipModule,
    MatChipsModule, MatExpansionModule,
  ],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent {
  private svc    = inject(ProjectsService);
  private notify = inject(NotificationService);

  readonly projects  = this.svc.projects;
  readonly favorites = this.svc.favorites;

  newProjectName = signal('');
  newProjectDesc = signal('');
  showNewProject = signal(false);

  newUCName      = signal('');
  newUCDesc      = signal('');
  addingToProject = signal<string | null>(null);

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
    this.svc.addUseCase(projectId, {
      name,
      description: this.newUCDesc(),
      artifacts: [],
    });
    this.addingToProject.set(null);
    this.notify.success(`Use case "${name}" added`);
  }

  removeUseCase(projectId: string, ucId: string, name: string): void {
    this.svc.removeUseCase(projectId, ucId);
    this.notify.info(`Use case "${name}" removed`);
  }

  removeFavorite(artifactId: number, type: string, name: string): void {
    this.svc.removeFavorite(artifactId, type);
    this.notify.info(`Removed "${name}" from favorites`);
  }

  typeChipClass(type: string): string {
    return type.toLowerCase();
  }
}
