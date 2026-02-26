export interface AppStoreReview {
  id: string;
  author: string;
  rating: number;
  title: string;
  content: string;
  updatedAt: Date;
}

export class AppStoreScraper {
  static async fetchRecentReviews(appId: string): Promise<AppStoreReview[]> {
    const url = `https://itunes.apple.com/us/rss/customerreviews/id=${appId}/sortBy=mostRecent/json`;
    
    try {
      console.log(`Fetching reviews from App Store for App ID: ${appId}...`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Apple API responded with status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.feed || !data.feed.entry) {
        return [];
      }

      const rawEntries = data.feed.entry.slice(1);

      return rawEntries.map((entry: any) => ({
        id: entry.id.label,
        author: entry.author.name.label,
        rating: parseInt(entry['im:rating'].label, 10),
        title: entry.title.label,
        content: entry.content.label,
        updatedAt: new Date(entry.updated.label)
      }));

    } catch (error) {
      console.error('Failed to fetch App Store reviews:', error);
      throw error;
    }
  }
}