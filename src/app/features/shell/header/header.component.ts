import { Component, Input, inject } from '@angular/core';
import { RouterLink, ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatButtonModule, MatTooltipModule, CommonModule],
  template: `
    <header class="header">
      <div class="header-left">
        <div class="page-title">{{ pageTitle() }}</div>
      </div>
      <div class="header-right">
        <div class="realm-badge">
          <mat-icon>domain</mat-icon>
          Realm {{ auth.realm() }}
        </div>
        <a routerLink="/studio/assistant" mat-icon-button matTooltip="AES Assistant" class="header-btn">
          <mat-icon>smart_toy</mat-icon>
        </a>
      </div>
    </header>
  `,
  styles: [`
    .header {
      height: var(--aes-header-height);
      background: var(--aes-bg-header);
      border-bottom: 1px solid var(--aes-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      flex-shrink: 0;
      z-index: 50;
    }
    .page-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--aes-text-primary);
      letter-spacing: 0.01em;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .realm-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--aes-text-muted);
      background: var(--aes-bg-elevated);
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid var(--aes-border);
      mat-icon { font-size: 14px; width: 14px; height: 14px; }
    }
    .header-btn { color: var(--aes-text-secondary); }
    .header-btn:hover { color: var(--aes-accent); }
  `],
})
export class HeaderComponent {
  @Input() sidebarCollapsed = false;
  auth = inject(AuthService);

  private router = inject(Router);

  private titleMap: Record<string, string> = {
    'dashboard': 'Dashboard',
    'search':    'Artifact Search',
    'execute':   'Execute & Watch',
    'builder':   'Pipeline Builder',
    'projects':  'Projects & Use Cases',
    'examples':  'Example Runs',
    'assistant': 'AES Assistant',
  };

  pageTitle = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => {
        const seg = this.router.url.split('/').pop()?.split('?')[0] ?? '';
        return this.titleMap[seg] ?? 'Autonomous Engineering Studio';
      })
    ),
    { initialValue: this.getInitialTitle() }
  );

  private getInitialTitle(): string {
    const seg = this.router.url.split('/').pop()?.split('?')[0] ?? '';
    return this.titleMap[seg] ?? 'Autonomous Engineering Studio';
  }
}
