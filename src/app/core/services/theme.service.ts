import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDark = signal(localStorage.getItem('aes-theme') !== 'light');

  constructor() {
    effect(() => {
      const dark = this.isDark();
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      localStorage.setItem('aes-theme', dark ? 'dark' : 'light');
    });
    document.documentElement.setAttribute('data-theme', this.isDark() ? 'dark' : 'light');
  }

  toggle(): void {
    this.isDark.update(d => !d);
  }
}
