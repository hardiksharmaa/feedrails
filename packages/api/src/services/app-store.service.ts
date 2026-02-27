export interface AppStoreReview {
  id: string;
  author: string;
  rating: number;
  title: string;
  content: string;
  updatedAt: Date;
}

export class AppStoreScraper {
  static async fetchRecentReviews(appId: string, targetCount = 200): Promise<AppStoreReview[]> {
    const safeTarget = Math.max(1, Math.min(targetCount, 400));
    const pageLimit = Math.ceil(safeTarget / 50) + 2;
    const unique = new Map<string, AppStoreReview>();

    try {
      console.log(`Fetching up to ${safeTarget} App Store reviews for App ID: ${appId}...`);

      for (let page = 1; page <= pageLimit && unique.size < safeTarget; page++) {
        const url = `https://itunes.apple.com/us/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
        const response = await fetch(url);

        if (!response.ok) {
          if (page === 1) {
            throw new Error(`Apple API responded with status: ${response.status}`);
          }
          break;
        }

        const data = await response.json() as {
          feed?: {
            entry?: Array<any>;
          };
        };

        const entries = Array.isArray(data.feed?.entry) ? data.feed?.entry : [];
        const rawEntries = entries.slice(1);
        if (rawEntries.length === 0) {
          break;
        }

        for (const entry of rawEntries) {
          const reviewId = entry?.id?.label;
          if (!reviewId || unique.has(reviewId)) {
            continue;
          }

          unique.set(reviewId, {
            id: reviewId,
            author: entry?.author?.name?.label ?? 'Unknown',
            rating: parseInt(entry?.['im:rating']?.label ?? '0', 10),
            title: entry?.title?.label ?? 'No Title',
            content: entry?.content?.label ?? '',
            updatedAt: new Date(entry?.updated?.label ?? Date.now()),
          });
        }
      }

      return Array.from(unique.values()).slice(0, safeTarget);
    } catch (error) {
      console.error('Failed to fetch App Store reviews:', error);
      throw error;
    }
  }
}