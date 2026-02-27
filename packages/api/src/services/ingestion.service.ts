import { prisma } from '../lib/prisma';
import { AppStoreReview } from './app-store.service';
import { RedditPost } from './reddit.service';
import crypto from 'crypto';

export class IngestionService {
  private static async saveEntries(
    sourceId: string,
    entries: Array<{
      id: string;
      content: string;
      timestamp: Date;
      metadata: Record<string, unknown>;
    }>
  ) {
    console.log(`Starting ingestion of ${entries.length} entries...`);
    let newEntriesCount = 0;
    let duplicateCount = 0;

    for (const entry of entries) {
      const fingerprint = crypto
        .createHash('sha256')
        .update(`${sourceId}_${entry.id}`)
        .digest('hex');

      try {
        await prisma.rawFeedback.create({
          data: {
            id: crypto.randomUUID(),
            sourceId,
            content: entry.content || '[No Content]',
            timestamp: entry.timestamp instanceof Date && !isNaN(entry.timestamp.getTime()) ? entry.timestamp : new Date(),
            createdAt: new Date(),
            fingerprint,
            metadata: {
              ...entry.metadata,
              originalId: entry.id,
            },
          },
        });

        newEntriesCount++;
      } catch (error: any) {
        if (error.code === 'P2002') {
          duplicateCount++;
          continue;
        }

        console.error(`Error saving entry ${entry.id}:`, error.message);
      }
    }

    console.log(`Ingestion complete. Added ${newEntriesCount} new entries. Skipped ${duplicateCount} duplicates.`);
    return newEntriesCount;
  }

  static async saveAppStoreReviews(sourceId: string, reviews: AppStoreReview[]) {
    return this.saveEntries(
      sourceId,
      reviews.map((review) => ({
        id: review.id,
        content: review.content || '[No Content]',
        timestamp: review.updatedAt,
        metadata: {
          author: review.author || 'Unknown',
          rating: review.rating || 0,
          title: review.title || 'No Title',
          channel: 'app_store',
        },
      }))
    );
  }

  static async saveRedditPosts(sourceId: string, posts: RedditPost[]) {
    return this.saveEntries(
      sourceId,
      posts.map((post) => ({
        id: post.id,
        content: post.content || '[No Content]',
        timestamp: post.createdAt,
        metadata: {
          author: post.author,
          title: post.title,
          score: post.score,
          permalink: post.permalink,
          subreddit: post.subreddit,
          channel: 'reddit',
        },
      }))
    );
  }
}