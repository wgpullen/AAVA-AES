import { Component, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { CommonModule } from '@angular/common';
import { ProjectsService } from '../../core/services/projects.service';
import { NotificationService } from '../../core/services/notification.service';
import { FavoriteItem } from '../../core/models/project.models';

type GroupedFavs = { type: string; items: FavoriteItem[] };

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatChipsModule],
  templateUrl: './favorites.component.html',
  styleUrl:  './favorites.component.scss',
})
export class FavoritesComponent {
  private projects = inject(ProjectsService);
  private notify   = inject(NotificationService);
  private router   = inject(Router);

  readonly favorites = this.projects.favorites;

  grouped = computed<GroupedFavs[]>(() => {
    const order = ['WORKFLOW', 'AGENT', 'TOOL', 'GUARDRAIL', 'KB'];
    const map = new Map<string, FavoriteItem[]>();
    for (const fav of this.favorites()) {
      const arr = map.get(fav.type) ?? [];
      arr.push(fav);
      map.set(fav.type, arr);
    }
    return order
      .filter(t => map.has(t))
      .map(t => ({ type: t, items: map.get(t)! }));
  });

  typeIcon(type: string): string {
    const m: Record<string, string> = {
      AGENT: 'smart_toy', WORKFLOW: 'account_tree',
      TOOL: 'build', KB: 'menu_book', GUARDRAIL: 'security',
    };
    return m[type] ?? 'circle';
  }

  typeLabel(type: string): string {
    const m: Record<string, string> = {
      AGENT: 'Agents', WORKFLOW: 'Workflows',
      TOOL: 'Tools', KB: 'Knowledge Bases', GUARDRAIL: 'Guardrails',
    };
    return m[type] ?? type;
  }

  runWorkflow(fav: FavoriteItem): void {
    this.router.navigate(['/studio/execute'], { queryParams: { workflowId: fav.artifactId } });
  }

  goToSearch(fav: FavoriteItem): void {
    this.router.navigate(['/studio/search']);
    this.notify.info(`Artifact "${fav.name}" — search for it in Artifact Search`);
  }

  remove(fav: FavoriteItem): void {
    this.projects.removeFavorite(fav.artifactId, fav.type);
    this.notify.info(`Removed "${fav.name}" from favorites`);
  }
}
