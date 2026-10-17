import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

export interface SendMailOptions {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;
  private readonly templateCache = new Map<string, handlebars.TemplateDelegate>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const port = Number(this.config.get('MAIL_PORT', 1025));
    // Port 465 is implicit TLS: with secure=false the client waits for a
    // plaintext greeting that never comes and every send fails. Honour
    // MAIL_SECURE when set, otherwise infer it from the port.
    const secureEnv = this.config.get<string>('MAIL_SECURE');
    const secure =
      secureEnv !== undefined && secureEnv !== ''
        ? String(secureEnv).toLowerCase() === 'true'
        : port === 465;

    this.transporter = nodemailer.createTransport({
      host: this.config.get('MAIL_HOST', 'localhost'),
      port,
      secure,
      // No auth for Mailpit / local dev
      auth: this.config.get('MAIL_USER')
        ? {
            user: this.config.get('MAIL_USER'),
            pass: this.config.get('MAIL_PASS'),
          }
        : undefined,
    });

    this.logger.log(
      `Mailer ready → ${this.config.get('MAIL_HOST')}:${this.config.get('MAIL_PORT')}`,
    );
  }

  async sendMail({ to, subject, template, context }: SendMailOptions) {
    const html = this.renderTemplate(template, context);
    const from = this.config.get('MAIL_FROM', 'noreply@saascitas.local');

    try {
      const info = await this.transporter.sendMail({ from, to, subject, html });
      this.logger.debug(`Email sent to ${to}: ${info.messageId}`);
      return info;
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err}`);
      throw err;
    }
  }

  private resolveTemplatePath(name: string): string {
    // Check multiple possible locations (dist for prod, src for dev watch mode)
    const candidates = [
      path.join(__dirname, 'templates', `${name}.hbs`),
      path.join(process.cwd(), 'dist', 'modules', 'notifications', 'templates', `${name}.hbs`),
      path.join(process.cwd(), 'src', 'modules', 'notifications', 'templates', `${name}.hbs`),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error(`Email template not found: ${name} (searched: ${candidates.join(', ')})`);
  }

  private renderTemplate(name: string, context: Record<string, any>): string {
    if (!this.templateCache.has(name)) {
      const templatePath = this.resolveTemplatePath(name);
      const source = fs.readFileSync(templatePath, 'utf-8');
      this.templateCache.set(name, handlebars.compile(source));
    }

    return this.templateCache.get(name)!(context);
  }
}
