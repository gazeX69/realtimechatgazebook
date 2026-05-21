import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const message = this.resolveMessage(exceptionResponse, exception);

    response.status(status).json({
      success: false,
      message,
      data: null,
      error: {
        statusCode: status,
        details: typeof exceptionResponse === 'object' ? exceptionResponse : undefined,
      },
    });
  }

  private resolveMessage(exceptionResponse: unknown, exception: unknown) {
    if (typeof exceptionResponse === 'string') return exceptionResponse;
    if (exceptionResponse && typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
      const value = (exceptionResponse as { message: unknown }).message;
      return Array.isArray(value) ? value[0] : String(value);
    }
    return exception instanceof Error ? exception.message : 'Internal server error';
  }
}
