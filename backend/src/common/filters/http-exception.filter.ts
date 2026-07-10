import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as any;
        message = resp.message || message;
        details = resp.errors || undefined;
      }
    } else if (exception instanceof Error) {
      // Unexpected (500). Always log server-side for diagnosis, but never leak
      // the internal message (Prisma/DB details, etc.) to clients in production.
      this.logger.error(exception.message, exception.stack);
      if (process.env.NODE_ENV === 'development') {
        message = exception.message;
        details = exception.stack;
      }
    }

    // RFC 7807 Problem Details format
    response.status(status).json({
      type: `https://api.saascitas.es/errors/${status}`,
      title: HttpStatus[status] || 'Error',
      status,
      detail: Array.isArray(message) ? message.join('. ') : message,
      ...(details && { errors: details }),
    });
  }
}
