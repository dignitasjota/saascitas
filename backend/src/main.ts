import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

// cookie-parser is a CommonJS module (module.exports = fn) with no default
// export, so an ESM default import resolves to undefined at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cookieParser = require('cookie-parser');

// BigInt JSON serialization (Prisma BigInt fields)
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Behind a reverse proxy (nginx in production) every request arrives from
  // the proxy's IP. Without this, req.ip is the same for all clients and the
  // per-IP rate limits (ThrottlerGuard) become one bucket shared by the whole
  // platform. Trust exactly the number of proxy hops in front of the app
  // (default 1: nginx) so req.ip is the real client and X-Forwarded-For can't
  // be spoofed past that hop.
  const trustProxy = process.env.TRUST_PROXY ?? '1';
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  // Security
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true,           // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('v1');

  const port = process.env.APP_PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}/v1`);
}

bootstrap();
