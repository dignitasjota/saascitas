import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateTenantPlanDto {
  @IsOptional()
  @IsIn(['basic', 'professional', 'business'])
  plan?: string;

  @IsOptional()
  @IsIn(['trialing', 'active', 'past_due', 'cancelled', 'paused'])
  planStatus?: string;

  @IsOptional()
  @IsString()
  suspendReason?: string;
}
