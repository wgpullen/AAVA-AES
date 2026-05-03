import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar/sidebar.component';
import { HeaderComponent } from './header/header.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent],
  template: `
    <div class="shell" [class.sidebar-collapsed]="collapsed()">
      <app-sidebar [collapsed]="collapsed()" (toggleCollapse)="collapsed.set(!collapsed())" />
      <div class="shell-content">
        <app-header [sidebarCollapsed]="collapsed()" />
        <main class="shell-main">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [`
    .shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
      background: var(--aes-bg-root);
    }
    .shell-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 0;
    }
    .shell-main {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 24px;
      background: var(--aes-bg-main);
    }
  `],
})
export class ShellComponent {
  collapsed = signal(false);
}
