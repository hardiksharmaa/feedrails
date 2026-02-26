import { prisma } from '../lib/prisma';
import { AiService } from './ai.service';
import crypto from 'crypto';

export class ProcessorService {
  static async processPendingFeedback() {

    const pending = await prisma.rawFeedback.findMany({
      where: { insight: { is: null } },
      take: 50,
    });

    console.log(`Found ${pending.length} reviews to analyze.`);
    let successCount = 0;

    for (const feedback of pending) {
      try {
        const analysis = await AiService.analyzeFeedback(feedback.content);

        await prisma.analyzedInsight.create({
          data: {
            id: crypto.randomUUID(),
            feedbackId: feedback.id,
            sentiment: analysis.sentiment,
            tags: analysis.tags,
            urgencyScore: analysis.urgencyScore,
            summary: analysis.summary
          }
        });

        successCount++;
        console.log(`Analyzed feedback: ${feedback.id.substring(0, 8)}...`);
      } catch (error) {
        console.error(`Failed to process feedback ${feedback.id}:`, error);
      }
    }

    return successCount;
  }
}