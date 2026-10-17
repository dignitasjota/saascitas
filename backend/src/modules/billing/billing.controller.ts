import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { BillingService, PlanKey } from './billing.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { SkipThrottle } from '@nestjs/throttler';

class CreateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['basic', 'professional', 'business'])
  plan: PlanKey;
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  @Roles('owner', 'admin')
  async getStatus(@CurrentUser() user: JwtPayload) {
    const data = await this.billingService.getBillingStatus(user.tid);
    return { data };
  }

  // Only the owner may start or manage the subscription: the Stripe portal
  // can cancel it and change the payment method.
  @Post('checkout')
  @Roles('owner')
  async createCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCheckoutDto,
  ) {
    const data = await this.billingService.createCheckoutSession(user.tid, dto.plan);
    return { data };
  }

  @Post('portal')
  @Roles('owner')
  async createPortal(@CurrentUser() user: JwtPayload) {
    const data = await this.billingService.createPortalSession(user.tid);
    return { data };
  }

  @Public()
  @SkipThrottle() // Stripe retries in bursts; requests are signature-verified
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body');
    }
    return this.billingService.handleWebhook(req.rawBody, signature);
  }
}
