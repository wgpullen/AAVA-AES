import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'markdownToHtml', standalone: true })
export class MarkdownToHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    if (!value) return '';
    const html = value
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n• /g, '</p><p>• ')
      .replace(/• /g, '• ')
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(`<p>${html}</p>`);
  }
}
