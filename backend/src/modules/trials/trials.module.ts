import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailerService } from '../notifications/mailer.service';
import { TrialsService } from './trials.service';
import { TrialsProcessor, TRIALS_QUEUE } from './trials.processor';

// The BullMQ connection is configured once (BullModule.forRootAsync in
// NotificationsModule); this module only registers its own queue.
@Module({
  imports: [BullModule.registerQueue({ name: TRIALS_QUEUE })],
  providers: [TrialsService, TrialsProcessor, MailerService],
})
export class TrialsModule {}
