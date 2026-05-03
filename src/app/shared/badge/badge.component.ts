import { Component, Input } from '@angular/core';

@Component({
  selector: 'aes-badge',
  standalone: true,
  template: `<span class="aes-badge {{ status?.toLowerCase() }}">{{ status }}</span>`,
})
export class BadgeComponent {
  @Input() status = '';
}
