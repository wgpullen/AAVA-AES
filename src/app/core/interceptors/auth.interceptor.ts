import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  if (token && !req.headers.has('Authorization')) {
    req = req.clone({
      setHeaders: {
        'Authorization': `Bearer ${token}`,
        'x-realm-id': auth.realm(),
      },
    });
  }
  return next(req);
};
