import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { catchError, forkJoin, of } from 'rxjs';
import { AavaApiService } from '../../core/services/aava-api.service';
import { ProjectsService } from '../../core/services/projects.service';
import { AuthService } from '../../core/services/auth.service';

interface StatCard {
  label: string;
  value: string | number;
  icon: string;
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
export class DashboardComponent implements OnInit {
  private api      = inject(AavaApiService);
  readonly projects = inject(ProjectsService);
  readonly auth    = inject(AuthService);

  loading  = signal(true);
  stats    = signal<StatCard[]>([]);
  favorites = inject(ProjectsService).favorites;

  quickLinks = [
    { label: 'Search All Artifacts', icon: 'search',       route: '/studio/search',    color: 'var(--aes-accent)' },
    { label: 'Execute a Workflow',   icon: 'play_circle',  route: '/studio/execute',   color: 'var(--aes-success)' },
    { label: 'Build a Pipeline',     icon: 'account_tree', route: '/studio/builder',   color: '#a78bfa' },
    { label: 'View Projects',        icon: 'folder_open',  route: '/studio/projects',  color: '#fbbf24' },
    { label: 'Example Runs',         icon: 'history',      route: '/studio/examples',  color: '#34d399' },
    { label: 'Ask the Assistant',    icon: 'smart_toy',    route: '/studio/assistant', color: '#f87171' },
  ];

  ngOnInit(): void {
    forkJoin({
      agents:    this.api.listAgents(1, 1).pipe(catchError(() => of({ agentDetails: [], totalNoOfRecords: 0 }))),
      workflows: this.api.listUserWorkflows(1, 1).pipe(catchError(() => of({ workFlowDetails: [], totalNoOfRecords: 0 }))),
      tools:     this.api.listUserTools(1, 1).pipe(catchError(() => of({ userToolDetails: [], totalNoOfRecords: 0 }))),
      kbs:       this.api.listKnowledgeBases(0, 1).pipe(catchError(() => of({ data: [], totalElements: 0 }))),
    }).subscribe(res => {
      this.loading.set(false);
      this.stats.set([
        { label: 'Agents',         value: res.agents.totalNoOfRecords,    icon: 'smart_toy',    color: '#a78bfa', route: '/studio/search' },
        { label: 'Workflows',      value: res.workflows.totalNoOfRecords, icon: 'account_tree', color: '#34d399', route: '/studio/search' },
        { label: 'Tools',          value: res.tools.totalNoOfRecords,     icon: 'build',        color: '#fbbf24', route: '/studio/search' },
        { label: 'Knowledge Bases',value: res.kbs.totalElements ?? 0,     icon: 'menu_book',    color: '#60a5fa', route: '/studio/search' },
        { label: 'Projects',       value: this.projects.projects().length,icon: 'folder_open',  color: '#f97316', route: '/studio/projects' },
        { label: 'Favorites',      value: this.favorites().length,        icon: 'star',         color: '#fbbf24', route: '/studio/search' },
      ]);
    });
  }
}
