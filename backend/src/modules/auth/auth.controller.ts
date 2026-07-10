import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import {
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
} from '../../common/utils/auth-cookies';

@Controller('auth')
@Throttle({ default: { ttl: 60_000, limit: 10 } }) // 10 req/min on all auth endpoints
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // The tokens go into httpOnly cookies, not the response body.
  private issue(
    res: Response,
    result: { user: any; tenant: any; accessToken: string; refreshToken: string },
  ) {
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { data: { user: result.user, tenant: result.tenant } };
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.issue(res, await this.authService.register(dto));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.issue(res, await this.authService.login(dto));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle() // refresh is called automatically, don't rate-limit it
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      throw new UnauthorizedException('No refresh token');
    }
    return this.issue(res, await this.authService.refresh(token));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await this.authService.logout(token);
    }
    clearAuthCookies(res);
    return { data: { message: 'Logged out successfully' } };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return { data: { message: 'Si el email existe, recibirás un enlace en breve' } };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { data: { message: 'Contraseña actualizada correctamente' } };
  }
}
