import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable, tap } from 'rxjs';
import { AdminPageView } from '../schemas/admin-page-view.schema';

@Injectable()
export class PageViewInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PageViewInterceptor');
  private readonly enabled =
    process.env.PANEL_PAGE_VIEW_ENABLED === 'true';

  constructor(
    @InjectModel(AdminPageView.name)
    private readonly pageViewModel: Model<AdminPageView>,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    if (!this.enabled) return next.handle();
    const req = context.switchToHttp().getRequest();
    if (req.method !== 'GET') return next.handle();
    if (!req.session?.adminId) return next.handle();
    return next.handle().pipe(
      tap(() => {
        this.pageViewModel
          .create({ adminId: req.session.adminId, path: req.path })
          .catch((err) =>
            this.logger.warn(`PageView write failed: ${err.message}`),
          );
      }),
    );
  }
}
