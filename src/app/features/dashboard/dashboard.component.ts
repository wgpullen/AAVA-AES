import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { ArtifactCacheService } from '../../core/services/artifact-cache.service';
import { ProjectsService } from '../../core/services/projects.service';
import { AuthService } from '../../core/services/auth.service';

interface StatCard {
  label: string;
  value: string | number;
  icon: string;
  svgIcon?: string;
  color: string;
  route: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatButtonModule, MatProgressSpinnerModule, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly cache    = inject(ArtifactCacheService);
  readonly projects = inject(ProjectsService);
  readonly auth     = inject(AuthService);

  readonly favorites = inject(ProjectsService).favorites;

  // Stats are pure derived state — computed() re-evaluates whenever the cache updates.
  // No effect(), no signal writes, no allowSignalWrites needed.
  // Progressive: guardrails/KBs appear in ~1s, workflows ~4s, tools ~22s, agents ~40s.
  readonly stats = computed<StatCard[]>(() => {
    const artifacts = this.cache.allArtifacts();
    const count = (type: string) => artifacts.filter(a => a.type === type).length;
    return [
      { label: 'Agents',          value: count('AGENT'),     icon: 'android',      color: '#c4b5fd', route: '/studio/search' },
      { label: 'Workflows',       value: count('WORKFLOW'),  icon: 'account_tree', color: '#86efac', route: '/studio/search' },
      { label: 'Tools',           value: count('TOOL'),      icon: 'build',        color: '#fcd34d', route: '/studio/search' },
      { label: 'Knowledge Bases', value: count('KB'),        icon: 'menu_book',    color: '#93c5fd', route: '/studio/search' },
      { label: 'Guardrails',      value: count('GUARDRAIL'), icon: 'security',     color: '#fca5a5', route: '/studio/search' },
      { label: 'Projects',        value: this.projects.projects().length, icon: 'folder_open', color: '#fb923c', route: '/studio/projects' },
    ];
  });

  quickLinks = [
    { label: 'Search All Artifacts', icon: 'search',       route: '/studio/search',    color: 'var(--aes-accent)' },
    { label: 'Execute a Workflow',   icon: 'play_circle',  route: '/studio/execute',   color: 'var(--aes-success)' },
    { label: 'Build a Pipeline',     icon: 'account_tree', route: '/studio/builder',   color: '#a78bfa' },
    { label: 'View Projects',        icon: 'folder_open',  route: '/studio/projects',  color: '#fbbf24' },
    { label: 'Example Runs',         icon: 'history',      route: '/studio/examples',  color: '#34d399' },
    { label: 'Ask the Assistant',    icon: '', svgIcon: 'aes-assistant', route: '/studio/assistant', color: '#f87171' },
  ];
}
