import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtPayload } from '../../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  /**
   * Re-validate the token against the database on every request. A short-lived
   * access token is not enough on its own: a fired/locked user, a role
   * downgrade, or a deleted tenant must take effect immediately, not linger
   * until the token expires. The current role is read from the DB so
   * demotions apply at once.
   *
   * Runs before the TenantInterceptor sets the tenant context, so this
   * findUnique is intentionally unscoped (cross-tenant lookup by user id).
   */
  async validate(payload: any): Promise<JwtPayload> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        tenantId: true,
        deletedAt: true,
        lockedUntil: true,
        tenant: { select: { deletedAt: true } },
      },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User account is no longer active');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account is locked');
    }
    if (!user.tenant || user.tenant.deletedAt) {
      throw new UnauthorizedException('Tenant is no longer active');
    }
    if (user.tenantId !== payload.tid) {
      throw new UnauthorizedException('Token does not match account');
    }

    return { sub: user.id, tid: user.tenantId, role: user.role };
  }
}
