import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

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

export class ListTenantsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['basic', 'professional', 'business'])
  plan?: string;

  @IsOptional()
  @IsIn(['trialing', 'active', 'past_due', 'cancelled', 'paused'])
  status?: string;
}
