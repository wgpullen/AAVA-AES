import { Component, Input, inject, signal } from '@angular/core';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { RealmService, KnownRealm } from '../../../core/services/realm.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    RouterLink, FormsModule, CommonModule,
    MatIconModule, MatButtonModule, MatTooltipModule,
    MatMenuModule, MatDialogModule,
  ],
  template: `
    <header class="header">
      <div class="header-left">
        <div class="page-title">{{ pageTitle() }}</div>
      </div>

      <div class="header-right">

        <!-- ── Realm Switcher ── -->
        <div class="realm-switcher" [matMenuTriggerFor]="realmMenu">
          <mat-icon class="realm-icon">domain</mat-icon>
          <span class="realm-label">{{ realm.activeLabel() }}</span>
          <mat-icon class="realm-caret">expand_more</mat-icon>
        </div>

        <mat-menu #realmMenu="matMenu" class="realm-menu-panel">
          <!-- ALL option -->
          <button mat-menu-item class="realm-option"
                  [class.realm-active]="realm.isAll()"
                  (click)="selectAll()">
            <mat-icon>public</mat-icon>
            <span>All Realms</span>
            @if (realm.isAll()) { <mat-icon class="check">check</mat-icon> }
          </button>

          <div class="realm-divider"></div>

          <!-- Individual realms -->
          @for (r of realm.realms(); track r.id) {
            <button mat-menu-item class="realm-option"
                    [class.realm-active]="realm.active() === r.id && !realm.isAll()"
                    (click)="selectRealm(r)">
              <mat-icon>meeting_room</mat-icon>
              <span>{{ r.name }}</span>
              <span class="realm-id-badge">{{ r.id }}</span>
              @if (realm.active() === r.id && !realm.isAll()) { <mat-icon class="check">check</mat-icon> }
            </button>
          }

          <div class="realm-divider"></div>

          <!-- Add realm -->
          @if (!addingRealm()) {
            <button mat-menu-item class="realm-add" (click)="$event.stopPropagation(); addingRealm.set(true)">
              <mat-icon>add_circle_outline</mat-icon>
              <span>Add Realm…</span>
            </button>
          } @else {
            <div class="realm-add-form" (click)="$event.stopPropagation()">
              <input class="realm-input" [(ngModel)]="newRealmId" placeholder="Realm ID (e.g. 45)" />
              <input class="realm-input" [(ngModel)]="newRealmName" placeholder="Name (e.g. Ascendion)" />
              <div class="realm-add-actions">
                <button class="realm-add-btn" (click)="saveNewRealm()">Add</button>
                <button class="realm-add-btn secondary" (click)="addingRealm.set(false)">Cancel</button>
              </div>
            </div>
          }
        </mat-menu>

        <!-- Dark/Light toggle -->
        <button class="hdr-btn" (click)="theme.toggle()"
                [matTooltip]="theme.isDark() ? 'Light mode' : 'Dark mode'">
          <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
        </button>

        <!-- Assistant shortcut -->
        <a routerLink="/studio/assistant" class="hdr-btn" matTooltip="AES Assistant">
          <mat-icon svgIcon="aes-assistant"></mat-icon>
        </a>
      </div>
    </header>
  `,
  styles: [`
    .header {
      height: var(--aes-header-height);
      background: var(--aes-bg-header);
      border-bottom: 1px solid var(--aes-border);
      display: flex; align-items: center;
      justify-content: space-between;
      padding: 0 20px; flex-shrink: 0; z-index: 50;
    }
    .page-title { font-size: 15px; font-weight: 600; color: var(--aes-text-primary); letter-spacing: .01em; }
    .header-right { display: flex; align-items: center; gap: 8px; }

    .realm-switcher {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 20px;
      background: var(--aes-bg-elevated);
      border: 1px solid var(--aes-border-md);
      cursor: pointer; user-select: none;
      transition: border-color .15s, background .15s;
      &:hover { border-color: var(--aes-accent); background: var(--aes-bg-hover); }
    }
    .realm-icon { font-size: 15px; width: 15px; height: 15px; color: var(--aes-accent); }
    .realm-label { font-size: 12px; font-weight: 600; color: var(--aes-text-primary); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .realm-caret { font-size: 16px; width: 16px; height: 16px; color: var(--aes-text-muted); }

    .hdr-btn {
      display: flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: var(--aes-radius-md);
      background: none; border: none; cursor: pointer;
      color: var(--aes-text-secondary); text-decoration: none;
      transition: color .15s, background .15s;
      &:hover { color: var(--aes-accent); background: var(--aes-bg-hover); }
      mat-icon { font-size: 20px; width: 20px; height: 20px; }
    }

    ::ng-deep .realm-menu-panel .mat-mdc-menu-content { padding: 6px 0; min-width: 260px; }
    .realm-option { font-size: 13px !important; display: flex !important; align-items: center !important; gap: 8px !important; }
    .realm-option mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--aes-text-muted); flex-shrink: 0; }
    .realm-option .check { color: var(--aes-accent); margin-left: auto; }
    .realm-option.realm-active { color: var(--aes-accent) !important; background: var(--aes-bg-active) !important; }
    .realm-id-badge {
      margin-left: auto; font-size: 10px; color: var(--aes-text-muted);
      background: var(--aes-bg-elevated); padding: 1px 6px; border-radius: 10px;
      border: 1px solid var(--aes-border);
    }
    .realm-divider { height: 1px; background: var(--aes-border); margin: 4px 0; }
    .realm-add { color: var(--aes-accent) !important; font-size: 13px !important; }
    .realm-add mat-icon { color: var(--aes-accent) !important; }

    .realm-add-form {
      padding: 8px 12px; display: flex; flex-direction: column; gap: 6px;
    }
    .realm-input {
      background: var(--aes-bg-card); border: 1px solid var(--aes-border-md);
      border-radius: var(--aes-radius-md); padding: 7px 10px;
      font-size: 12px; color: var(--aes-text-primary); font-family: inherit; outline: none;
      &:focus { border-color: var(--aes-accent); }
      &::placeholder { color: var(--aes-text-muted); }
    }
    .realm-add-actions { display: flex; gap: 6px; }
    .realm-add-btn {
      flex: 1; padding: 6px; border-radius: var(--aes-radius-md);
      font-size: 12px; font-weight: 600; cursor: pointer; border: none;
      background: var(--aes-accent); color: #fff; font-family: inherit;
      &.secondary { background: var(--aes-bg-elevated); color: var(--aes-text-secondary); border: 1px solid var(--aes-border); }
      &:hover { opacity: .85; }
    }
  `],
})
export class HeaderComponent {
  @Input() sidebarCollapsed = false;

  auth  = inject(AuthService);
  theme = inject(ThemeService);
  realm = inject(RealmService);

  addingRealm = signal(false);
  newRealmId   = '';
  newRealmName = '';

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
      map(() => this.currentTitle())
    ),
    { initialValue: this.currentTitle() }
  );

  private currentTitle(): string {
    const seg = this.router.url.split('/').pop()?.split('?')[0] ?? '';
    return this.titleMap[seg] ?? 'Autonomous Engineering Studio';
  }

  selectRealm(r: KnownRealm): void {
    this.realm.setActive(r.id);
    this.auth.setRealm(r.id);
  }

  selectAll(): void {
    this.realm.setAll();
  }

  saveNewRealm(): void {
    const id   = this.newRealmId.trim();
    const name = this.newRealmName.trim() || `Realm ${id}`;
    if (!id) return;
    this.realm.addRealm({ id, name });
    this.newRealmId = '';
    this.newRealmName = '';
    this.addingRealm.set(false);
  }
}
