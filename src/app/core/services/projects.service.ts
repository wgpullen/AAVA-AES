import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { AavaApiService } from './aava-api.service';
import { Project, UseCase, FavoriteItem } from '../models/project.models';

const PROJECTS_KEY  = 'aes_projects';
const FAVORITES_KEY = 'aes_favorites';

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private api = inject(AavaApiService);

  private _projects  = signal<Project[]>(this.loadProjects());
  private _favorites = signal<FavoriteItem[]>(this.loadFavorites());

  readonly projects  = computed(() => this._projects());
  readonly favorites = computed(() => this._favorites());

  private loadProjects(): Project[] {
    try { return JSON.parse(sessionStorage.getItem(PROJECTS_KEY) ?? '[]'); } catch { return []; }
  }

  private loadFavorites(): FavoriteItem[] {
    try { return JSON.parse(sessionStorage.getItem(FAVORITES_KEY) ?? '[]'); } catch { return []; }
  }

  private persist(): void {
    sessionStorage.setItem(PROJECTS_KEY, JSON.stringify(this._projects()));
    sessionStorage.setItem(FAVORITES_KEY, JSON.stringify(this._favorites()));
  }

  createProject(name: string, description = ''): Project {
    const p: Project = {
      id: `proj_${Date.now()}`,
      name,
      description,
      useCases: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this._projects.update(prev => [...prev, p]);
    this.persist();
    return p;
  }

  updateProject(id: string, patch: Partial<Project>): void {
    this._projects.update(prev => prev.map(p =>
      p.id === id ? { ...p, ...patch, updatedAt: new Date() } : p
    ));
    this.persist();
  }

  deleteProject(id: string): void {
    this._projects.update(prev => prev.filter(p => p.id !== id));
    this.persist();
  }

  addUseCase(projectId: string, useCase: Omit<UseCase, 'id' | 'createdAt' | 'updatedAt'>): UseCase {
    const uc: UseCase = {
      ...useCase,
      id: `uc_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this._projects.update(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, useCases: [...p.useCases, uc], updatedAt: new Date() }
        : p
    ));
    this.persist();
    return uc;
  }

  removeUseCase(projectId: string, useCaseId: string): void {
    this._projects.update(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, useCases: p.useCases.filter(uc => uc.id !== useCaseId), updatedAt: new Date() }
        : p
    ));
    this.persist();
  }

  addFavorite(item: Omit<FavoriteItem, 'addedAt'>): void {
    const exists = this._favorites().some(f => f.artifactId === item.artifactId && f.type === item.type);
    if (exists) return;
    this._favorites.update(prev => [...prev, { ...item, addedAt: new Date() }]);
    this.persist();
  }

  removeFavorite(artifactId: number, type: string): void {
    this._favorites.update(prev => prev.filter(f => !(f.artifactId === artifactId && f.type === type)));
    this.persist();
  }

  isFavorite(artifactId: number, type: string): boolean {
    return this._favorites().some(f => f.artifactId === artifactId && f.type === type);
  }

  toggleFavorite(item: Omit<FavoriteItem, 'addedAt'>): void {
    if (this.isFavorite(item.artifactId, item.type)) {
      this.removeFavorite(item.artifactId, item.type);
    } else {
      this.addFavorite(item);
    }
  }
}
