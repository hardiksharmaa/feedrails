import { prisma } from '../lib/prisma';
import { AppStoreReview } from './app-store.service';
import crypto from 'crypto';

export class IngestionService {
  static async saveAppStoreReviews(sourceId: string, reviews: AppStoreReview[]) {
    console.log(`Starting ingestion of ${reviews.length} reviews...`);
    let newReviewsCount = 0;
    let duplicateCount = 0;

    for (const review of reviews) {
      const fingerprint = crypto
        .createHash('sha256')
        .update(`${sourceId}_${review.id}`)
        .digest('hex');

      try {
        await prisma.rawFeedback.create({
          data: {
            id: crypto.randomUUID(), 
            sourceId: sourceId,
            content: review.content || "[No Content]",
            timestamp: review.updatedAt instanceof Date && !isNaN(review.updatedAt.getTime()) ? review.updatedAt : new Date(),
            createdAt: new Date(),
            fingerprint: fingerprint,
            metadata: {
              author: review.author || "Unknown",
              rating: review.rating || 0,
              title: review.title || "No Title",
              originalId: review.id
            }
          }
        });
        
        newReviewsCount++;
        
      } catch (error: any) {
        if (error.code === 'P2002') {
          duplicateCount++; 
          continue; 
        } else {
          console.error(`Error saving review ${review.id}:`, error.message);
        }
      }
    }

    console.log(`Ingestion complete. Added ${newReviewsCount} new reviews. Skipped ${duplicateCount} duplicates.`);
    return newReviewsCount;
  }
}