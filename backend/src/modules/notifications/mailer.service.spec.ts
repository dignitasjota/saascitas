import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({})) }));

function initWith(env: Record<string, string | undefined>) {
  const config = { get: (k: string, d?: unknown) => env[k] ?? d } as ConfigService;
  new MailerService(config).onModuleInit();
  return (nodemailer.createTransport as jest.Mock).mock.calls.at(-1)[0];
}

describe('MailerService transport', () => {
  it('uses implicit TLS on port 465 when MAIL_SECURE is unset', () => {
    expect(initWith({ MAIL_PORT: '465' })).toMatchObject({ port: 465, secure: true });
  });

  it('uses plaintext/STARTTLS on other ports by default', () => {
    expect(initWith({ MAIL_PORT: '587' })).toMatchObject({ port: 587, secure: false });
  });

  it('honours an explicit MAIL_SECURE', () => {
    expect(initWith({ MAIL_PORT: '465', MAIL_SECURE: 'false' })).toMatchObject({ secure: false });
    expect(initWith({ MAIL_PORT: '2465', MAIL_SECURE: 'true' })).toMatchObject({ secure: true });
  });
});
