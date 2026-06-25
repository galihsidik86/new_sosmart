import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { status: 'ok', service: 'lentera-api', ts: new Date().toISOString() };
  }
}
