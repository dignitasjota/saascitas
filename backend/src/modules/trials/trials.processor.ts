import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TrialsService } from './trials.service';

export const TRIALS_QUEUE = 'trials';
const SCHEDULER_ID = 'trials-hourly';

/**
 * Runs the trial lifecycle every hour (reminders + expiry). The job scheduler
 * is upserted on boot, so it is idempotent across restarts and instances.
 */
@Processor(TRIALS_QUEUE)
export class TrialsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(TrialsProcessor.name);

  constructor(
    private readonly trials: TrialsService,
    @InjectQueue(TRIALS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    try {
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { pattern: '0 * * * *' }, // every hour, on the hour
        { name: 'run', opts: { removeOnComplete: 24, removeOnFail: 50 } },
      );
    } catch (err) {
      // Never block startup on Redis hiccups; the next boot retries.
      this.logger.error(`Could not schedule the trials job: ${err}`);
    }
  }

  async process() {
    await this.trials.run();
  }
}
