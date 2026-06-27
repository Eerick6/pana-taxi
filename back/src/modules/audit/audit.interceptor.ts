import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { AuditService } from './audit.service';

const SKIP_PATHS = new Set(['/health', '/metrics', '/favicon.ico']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, path, ip } = req;

    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next.handle();
    if (SKIP_PATHS.has(path)) return next.handle();

    const user = req.user;
    const parsed = AuditService.parseAction(method, path);

    return next.handle().pipe(
      tap(() => {
        this.auditService.log({
          actor_id: user?.id ?? null,
          actor_role: user?.role ?? null,
          ...parsed,
          ip_address: ip,
          status_code: 200,
          metadata: { params: req.params },
        });
      }),
      catchError((err) => {
        this.auditService.log({
          actor_id: user?.id ?? null,
          actor_role: user?.role ?? null,
          ...parsed,
          ip_address: ip,
          status_code: err?.status ?? 500,
          metadata: { params: req.params, error: err?.message },
        });
        return throwError(() => err);
      }),
    );
  }
}
