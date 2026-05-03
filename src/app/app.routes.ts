import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './core/services/auth.service';
import { Router } from '@angular/router';

const authGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/auth']);
};

export const routes: Routes = [
  { path: '', redirectTo: 'studio/search', pathMatch: 'full' },
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent),
  },
  {
    path: 'studio',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'search', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
        title: 'Dashboard · AES',
      },
      {
        path: 'search',
        loadComponent: () => import('./features/search/search.component').then(m => m.SearchComponent),
        title: 'Search · AES',
      },
      {
        path: 'execute',
        loadComponent: () => import('./features/execute/execute.component').then(m => m.ExecuteComponent),
        title: 'Execute · AES',
      },
      {
        path: 'builder',
        loadComponent: () => import('./features/builder/builder.component').then(m => m.BuilderComponent),
        title: 'Pipeline Builder · AES',
      },
      {
        path: 'projects',
        loadComponent: () => import('./features/projects/projects.component').then(m => m.ProjectsComponent),
        title: 'Projects · AES',
      },
      {
        path: 'examples',
        loadComponent: () => import('./features/examples/examples.component').then(m => m.ExamplesComponent),
        title: 'Example Runs · AES',
      },
      {
        path: 'assistant',
        loadComponent: () => import('./features/assistant/assistant.component').then(m => m.AssistantComponent),
        title: 'AES Assistant · AES',
      },
    ],
  },
  { path: '**', redirectTo: 'studio/search' },
];
