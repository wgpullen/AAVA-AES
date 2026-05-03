import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private snack = inject(MatSnackBar);

  success(message: string, duration = 3000): void {
    this.snack.open(message, undefined, {
      duration,
      panelClass: ['aes-snack-success'],
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
    });
  }

  error(message: string, duration = 5000): void {
    this.snack.open(message, 'Dismiss', {
      duration,
      panelClass: ['aes-snack-error'],
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
    });
  }

  info(message: string, duration = 3000): void {
    this.snack.open(message, undefined, {
      duration,
      panelClass: ['aes-snack-info'],
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
    });
  }

  warn(message: string, duration = 4000): void {
    this.snack.open(message, undefined, {
      duration,
      panelClass: ['aes-snack-warn'],
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
    });
  }
}
