import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [':host{display:block;height:100%}'],
})
export class AppComponent {
  constructor() {
    const registry  = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    const router    = inject(Router);

    registry.addSvgIcon(
      'aes-assistant',
      sanitizer.bypassSecurityTrustResourceUrl('assets/icons/aes-assistant.svg')
    );

    // Remove any orphaned CDK overlay backdrops on route change to prevent click-blocking
    router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      document.querySelectorAll('.cdk-overlay-backdrop').forEach(el => el.remove());
    });
  }
}
