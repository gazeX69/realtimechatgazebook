import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ApiResponse } from '../responses/api-response';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((value) => {
        if (value && typeof value === 'object' && 'data' in value) {
          const result = value as { message?: string; data: T; meta?: Record<string, unknown> };
          return { success: true, message: result.message ?? 'OK', data: result.data, meta: result.meta };
        }

        return { success: true, message: 'OK', data: value };
      }),
    );
  }
}
