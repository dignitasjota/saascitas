import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../notifications/mailer.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { generateUniqueSlug } from '../../common/utils/slug';

const RESET_TOKEN_TTL = 60 * 60; // 1 hour in seconds
const RESET_KEY_PREFIX = 'pwd_reset:';

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
    });
  }

  /**
   * Register a new tenant + owner user.
   */
  async register(dto: RegisterDto) {
    // Check if email already exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hash(dto.password, ARGON2_OPTIONS);
    const slug = generateUniqueSlug(dto.companyName);

    // Create tenant + owner in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          slug,
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        },
      });

      // Create default employee for the owner
      const employee = await tx.employee.create({
        data: {
          tenantId: tenant.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email.toLowerCase(),
          phone: dto.phone,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: 'owner',
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          employeeId: employee.id,
        },
      });

      return { tenant, user };
    });

    // Generate tokens
    const tokens = await this.generateTokens(
      result.user.id,
      result.tenant.id,
      result.user.role,
    );

    // Send welcome email (fire-and-forget)
    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
    void this.mailer
      .sendMail({
        to: result.user.email,
        subject: `¡Bienvenido a SaaS Citas, ${result.user.firstName}!`,
        template: 'welcome',
        context: {
          name: result.user.firstName,
          businessName: result.tenant.name,
          bookingUrl: `${frontendUrl}/book/${result.tenant.slug}`,
          dashboardUrl: frontendUrl,
        },
      })
      .catch((err) => this.logger.error(`Welcome email failed: ${err}`));

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
      },
      ...tokens,
    };
  }

  /**
   * Login with email + password.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Account locked. Try again in ${minutesLeft} minutes.`,
      );
    }

    // Verify password
    const isValid = await verify(user.passwordHash, dto.password);

    if (!isValid) {
      // Increment failed attempts
      const failedAttempts = user.failedLoginAttempts + 1;
      const updateData: any = { failedLoginAttempts: failedAttempts };

      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        updateData.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.tenantId,
      user.role,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
      },
      ...tokens,
    };
  }

  /**
   * Refresh access token using a refresh token.
   */
  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: { include: { tenant: true } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      // If token was already used (reuse detection), revoke the entire family
      if (stored) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: stored.familyId },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    // Generate new pair with same family
    const tokens = await this.generateTokens(
      stored.user.id,
      stored.user.tenantId,
      stored.user.role,
      stored.familyId,
    );

    return {
      user: {
        id: stored.user.id,
        email: stored.user.email,
        firstName: stored.user.firstName,
        lastName: stored.user.lastName,
        role: stored.user.role,
      },
      tenant: {
        id: stored.user.tenant.id,
        name: stored.user.tenant.name,
        slug: stored.user.tenant.slug,
      },
      ...tokens,
    };
  }

  /**
   * Revoke a refresh token (logout).
   */
  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Request a password reset email.
   * Always returns 200 to avoid user enumeration.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
      include: { tenant: true },
    });

    // Silently succeed even if user not found (no enumeration)
    if (!user) return;

    // Generate a random token, store hash in Redis
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const redisKey = `${RESET_KEY_PREFIX}${tokenHash}`;

    await this.redis.set(redisKey, user.id, 'EX', RESET_TOKEN_TTL);

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    try {
      await this.mailer.sendMail({
        to: user.email,
        subject: 'Restablecer contraseña — SaaS Citas',
        template: 'password-reset',
        context: {
          name: `${user.firstName} ${user.lastName}`,
          businessName: user.tenant.name,
          resetUrl,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${user.email}: ${err}`);
    }
  }

  /**
   * Reset password using a valid token.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);
    const redisKey = `${RESET_KEY_PREFIX}${tokenHash}`;

    const userId = await this.redis.get(redisKey);
    if (!userId) {
      throw new BadRequestException('El enlace no es válido o ha expirado');
    }

    const passwordHash = await hash(dto.newPassword, ARGON2_OPTIONS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Invalidate token after use
    await this.redis.del(redisKey);

    // Revoke all refresh tokens for this user (force re-login everywhere)
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ========================================
  // Private methods
  // ========================================

  private async generateTokens(
    userId: string,
    tenantId: string,
    role: string,
    familyId?: string,
  ) {
    const accessToken = this.jwtService.sign({
      sub: userId,
      tid: tenantId,
      role,
    });

    // Generate refresh token
    const refreshTokenRaw = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(refreshTokenRaw);
    const family = familyId || uuidv4();

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tenantId,
        tokenHash,
        familyId: family,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
