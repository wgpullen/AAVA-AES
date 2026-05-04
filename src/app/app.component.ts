import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

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
    registry.addSvgIcon(
      'aes-assistant',
      sanitizer.bypassSecurityTrustResourceUrl('assets/icons/aes-assistant.svg')
    );
  }
}
