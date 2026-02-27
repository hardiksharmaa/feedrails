import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export interface AnalyzeFeedbackJobData {
  feedbackIds: string[];
  projectId: string;
  userId?: string;
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const queueConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const analysisQueue = new Queue<AnalyzeFeedbackJobData>('analysis-feedback', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});
