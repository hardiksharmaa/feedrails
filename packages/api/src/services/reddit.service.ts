export interface RedditPost {
  id: string;
  author: string;
  title: string;
  content: string;
  score: number;
  permalink: string;
  createdAt: Date;
  subreddit: string;
}

export class RedditScraper {
  static async fetchRecentPosts(subreddit: string, query?: string): Promise<RedditPost[]> {
    const cleanSubreddit = subreddit.trim().replace(/^r\//i, '');
    if (!cleanSubreddit) {
      throw new Error('Invalid subreddit');
    }

    const baseUrl = `https://www.reddit.com/r/${encodeURIComponent(cleanSubreddit)}`;
    const url = query && query.trim().length > 0
      ? `${baseUrl}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=month&limit=100`
      : `${baseUrl}/new.json?limit=100`;

    console.log(`Fetching Reddit posts from r/${cleanSubreddit}${query ? ` with query "${query}"` : ''}...`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'feedrails/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Reddit responded with status: ${response.status}`);
    }

    const data = await response.json() as {
      data?: {
        children?: Array<{
          data?: {
            id?: string;
            author?: string;
            title?: string;
            selftext?: string;
            score?: number;
            permalink?: string;
            created_utc?: number;
            subreddit?: string;
          };
        }>;
      };
    };

    const posts = data.data?.children ?? [];

    return posts
      .map((entry) => {
        const raw = entry.data;
        if (!raw?.id || !raw?.title) {
          return null;
        }

        const body = (raw.selftext ?? '').trim();
        const content = body.length > 0 ? `${raw.title}\n\n${body}` : raw.title;

        return {
          id: raw.id,
          author: raw.author ?? 'unknown',
          title: raw.title,
          content,
          score: Number(raw.score ?? 0),
          permalink: raw.permalink ? `https://www.reddit.com${raw.permalink}` : '',
          createdAt: new Date((raw.created_utc ?? Date.now() / 1000) * 1000),
          subreddit: raw.subreddit ?? cleanSubreddit,
        } satisfies RedditPost;
      })
      .filter((post): post is RedditPost => post !== null);
  }
}
