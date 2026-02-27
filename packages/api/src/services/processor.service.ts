import { prisma } from '../lib/prisma';
import { analysisQueue } from '../queues/analysis.queue';

export class ProcessorService {
  static async processPendingFeedback(
    userId?: string,
    projectId?: string,
    processLimit?: number,
    batchSize = 10
  ) {
    const safeLimit = Number.isFinite(processLimit)
      ? Math.max(1, Math.min(Number(processLimit), 5000))
      : undefined;
    const safeBatchSize = Math.max(1, Math.min(batchSize, 25));

    const pending = await prisma.rawFeedback.findMany({
      where: {
        insight: { is: null },
        ...(userId
          ? {
              source: {
                project: {
                  userId,
                  ...(projectId ? { id: projectId } : {}),
                },
              },
            }
          : {}),
      },
      ...(safeLimit ? { take: safeLimit } : {}),
      include: {
        source: {
          select: {
            projectId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (pending.length === 0) {
      return 0;
    }

    const byProject = pending.reduce((acc, feedback) => {
      const pid = feedback.source.projectId;
      if (!acc.has(pid)) {
        acc.set(pid, [] as string[]);
      }
      acc.get(pid)?.push(feedback.id);
      return acc;
    }, new Map<string, string[]>());

    const jobs: Array<{
      name: string;
      data: {
        feedbackIds: string[];
        projectId: string;
        userId?: string;
      };
      opts: {
        jobId: string;
      };
    }> = [];

    for (const [pid, ids] of byProject.entries()) {
      for (let index = 0; index < ids.length; index += safeBatchSize) {
        const chunk = ids.slice(index, index + safeBatchSize);
        jobs.push({
          name: 'analyze-feedback-batch',
          data: {
            feedbackIds: chunk,
            projectId: pid,
            userId,
          },
          opts: {
            jobId: `analyze-feedback-${pid}-${chunk[0]}`,
          },
        });
      }
    }

    await analysisQueue.addBulk(jobs);

    return pending.length;
  }
}