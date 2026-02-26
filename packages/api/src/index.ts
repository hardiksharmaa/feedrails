import express from 'express';
import cors from 'cors';
import { AppStoreScraper } from './services/app-store.service';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'FeedRails API' });
});
app.get('/test-scraper/:appId', async (req, res) => {
  try {
    const appId = req.params.appId;
    const reviews = await AppStoreScraper.fetchRecentReviews(appId);
    
    res.json({
      success: true,
      count: reviews.length,
      data: reviews
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`FeedRails API running on http://localhost:${PORT}`);
});