import dotenv from 'dotenv';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AiService } from '../services/ai.service';
import { AnalyzeFeedbackJobData } from '../queues/analysis.queue';

dotenv.config();

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const workerConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

const worker = new Worker<AnalyzeFeedbackJobData>(
  'analysis-feedback',
  async (job) => {
    const feedbackIds = Array.isArray(job.data.feedbackIds)
      ? job.data.feedbackIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];

    if (feedbackIds.length === 0) {
      return;
    }

    const feedbackList = await prisma.rawFeedback.findMany({
      where: {
        id: { in: feedbackIds },
      },
      include: {
        insight: true,
        source: {
          select: {
            projectId: true,
          },
        },
      },
    });

    if (feedbackList.length === 0) {
      return;
    }

    const pending = feedbackList.filter(
      (feedback) => feedback.source.projectId === job.data.projectId && !feedback.insight
    );

    if (pending.length === 0) {
      return;
    }

    const batchAnalysis = await AiService.analyzeFeedbackBatch(
      pending.map((feedback) => ({ id: feedback.id, content: feedback.content }))
    );

    const analysisById = new Map(batchAnalysis.map((item) => [item.id, item]));

    await prisma.$transaction(
      pending.map((feedback) => {
        const analysis = analysisById.get(feedback.id);
        if (!analysis) {
          return prisma.analyzedInsight.upsert({
            where: { feedbackId: feedback.id },
            create: {
              id: crypto.randomUUID(),
              feedbackId: feedback.id,
              sentiment: 'NEUTRAL',
              tags: ['general feedback'],
              urgencyScore: 5,
              summary: 'User shared feedback that requires review.',
            },
            update: {
              sentiment: 'NEUTRAL',
              tags: ['general feedback'],
              urgencyScore: 5,
              summary: 'User shared feedback that requires review.',
            },
          });
        }

        return prisma.analyzedInsight.upsert({
          where: { feedbackId: feedback.id },
          create: {
            id: crypto.randomUUID(),
            feedbackId: feedback.id,
            sentiment: analysis.sentiment,
            tags: analysis.tags,
            urgencyScore: analysis.urgencyScore,
            summary: analysis.summary,
          },
          update: {
            sentiment: analysis.sentiment,
            tags: analysis.tags,
            urgencyScore: analysis.urgencyScore,
            summary: analysis.summary,
          },
        });
      })
    );

    console.log(`Analyzed feedback batch: ${pending.length} items for project ${job.data.projectId}`);
  },
  {
    connection: workerConnection,
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  console.log(`Completed job ${job.id}`);
});

worker.on('failed', (job, error) => {
  console.error(`Job failed ${job?.id}:`, error.message);
});

console.log('Analysis worker started');
