import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

/** Liveness endpoint for container healthchecks (GET /v1/health). */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
