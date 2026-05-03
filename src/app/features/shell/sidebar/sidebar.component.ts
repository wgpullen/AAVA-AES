import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';
import { AuthService } from '../../../core/services/auth.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  badge?: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule, MatTooltipModule, MatRippleModule],
  template: `
    <aside class="sidebar" [class.collapsed]="collapsed">
      <!-- Logo -->
      <div class="sidebar-logo">
        <div class="logo-mark">
          <span class="logo-icon">⚡</span>
        </div>
        @if (!collapsed) {
          <div class="logo-text">
            <span class="logo-primary">AES</span>
            <span class="logo-sub">Autonomous Engineering Studio</span>
          </div>
        }
        <button class="collapse-btn" (click)="toggleCollapse.emit()" matRipple
                [matTooltip]="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
                matTooltipPosition="right">
          <mat-icon>{{ collapsed ? 'chevron_right' : 'chevron_left' }}</mat-icon>
        </button>
      </div>

      <!-- Nav -->
      <nav class="sidebar-nav">
        @if (!collapsed) { <div class="nav-section-label">STUDIO</div> }
        @for (item of navItems; track item.path) {
          <a class="nav-item" [routerLink]="item.path" routerLinkActive="active"
             [matTooltip]="collapsed ? item.label : ''" matTooltipPosition="right" matRipple>
            <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
            @if (!collapsed) {
              <span class="nav-label">{{ item.label }}</span>
              @if (item.badge) {
                <span class="nav-badge">{{ item.badge }}</span>
              }
            }
          </a>
        }
      </nav>

      <!-- Footer -->
      <div class="sidebar-footer">
        @if (!collapsed) {
          <div class="user-info">
            <div class="user-avatar">{{ userInitial }}</div>
            <div class="user-details">
              <div class="user-name">{{ auth.user()?.name ?? 'Studio User' }}</div>
              <div class="user-role">{{ auth.user()?.role ?? 'SUPER_ADMIN' }}</div>
            </div>
          </div>
        }
        <button class="icon-btn" (click)="auth.logout()"
                [matTooltip]="'Sign out'" matTooltipPosition="right" matRipple>
          <mat-icon>logout</mat-icon>
        </button>
      </div>
    </aside>
  `,
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  @Input() collapsed = false;
  @Output() toggleCollapse = new EventEmitter<void>();

  auth = inject(AuthService);

  navItems: NavItem[] = [
    { path: '/studio/dashboard', label: 'Dashboard',       icon: 'dashboard' },
    { path: '/studio/search',    label: 'Artifact Search', icon: 'search' },
    { path: '/studio/execute',   label: 'Execute & Watch', icon: 'play_circle' },
    { path: '/studio/builder',   label: 'Pipeline Builder',icon: 'account_tree' },
    { path: '/studio/projects',  label: 'Projects',        icon: 'folder_open' },
    { path: '/studio/examples',  label: 'Example Runs',    icon: 'history' },
    { path: '/studio/assistant', label: 'AES Assistant',   icon: 'smart_toy' },
  ];

  get userInitial(): string {
    const name = this.auth.user()?.name ?? 'U';
    return name.charAt(0).toUpperCase();
  }
}
