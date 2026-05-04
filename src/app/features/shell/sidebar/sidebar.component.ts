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

      <!-- Branding -->
      <div class="sidebar-brand">
        @if (!collapsed) {
          <div class="brand-full">
            <div class="brand-icon">
              <span class="brand-bolt">⚡</span>
            </div>
            <div class="brand-text">
              <span class="brand-name">AES</span>
              <span class="brand-full-name">Autonomous Engineering Studio</span>
            </div>
          </div>
        } @else {
          <div class="brand-icon-only">
            <span class="brand-bolt-sm">⚡</span>
          </div>
        }
      </div>

      <!-- Collapse toggle -->
      <button class="collapse-toggle" (click)="toggleCollapse.emit()" matRipple
              [matTooltip]="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
              matTooltipPosition="right">
        <mat-icon>{{ collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left' }}</mat-icon>
      </button>

      <!-- Nav -->
      <nav class="sidebar-nav">
        @if (!collapsed) { <div class="nav-label-section">STUDIO</div> }
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
          <div class="user-row">
            <div class="user-avatar">{{ userInitial }}</div>
            <div class="user-details">
              <div class="user-name">{{ auth.user()?.name ?? 'Studio User' }}</div>
              <div class="user-role">{{ auth.user()?.role ?? 'SUPER_ADMIN' }}</div>
            </div>
          </div>
        } @else {
          <div class="user-avatar-sm" [matTooltip]="auth.user()?.name ?? 'Studio User'" matTooltipPosition="right">
            {{ userInitial }}
          </div>
        }
        <button class="logout-btn" (click)="auth.logout()"
                matTooltip="Sign out" matTooltipPosition="right" matRipple>
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
    { path: '/studio/dashboard', label: 'Dashboard',        icon: 'dashboard' },
    { path: '/studio/search',    label: 'Artifact Search',  icon: 'manage_search' },
    { path: '/studio/execute',   label: 'Execute & Watch',  icon: 'play_circle' },
    { path: '/studio/builder',   label: 'Pipeline Builder', icon: 'account_tree' },
    { path: '/studio/projects',  label: 'Projects',         icon: 'folder_open' },
    { path: '/studio/examples',  label: 'Example Runs',     icon: 'history' },
    { path: '/studio/assistant', label: 'AES Assistant',    icon: 'smart_toy' },
  ];

  get userInitial(): string {
    return (this.auth.user()?.name ?? 'U').charAt(0).toUpperCase();
  }
}
