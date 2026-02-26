import express from 'express';
import cors from 'cors';
import { AppStoreScraper } from './services/app-store.service';
import { IngestionService } from './services/ingestion.service';
import { prisma } from './lib/prisma';
import { AiService } from './services/ai.service';
import { ProcessorService } from './services/processor.service';


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.get('/insights', async (req, res) => {
  try {
    const insights = await prisma.analyzedInsight.findMany({
      include: {
        feedback: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json({
      success: true,
      count: insights.length,
      data: insights
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/test-pipeline/:appId', async (req, res) => {
  try {
    const appId = req.params.appId;

    let source = await prisma.source.findFirst({ where: { type: 'APP_STORE' } });
    if (!source) {
      source = await prisma.source.create({
        data: { name: 'Instagram App Store', type: 'APP_STORE', config: { appId } }
      });
    }

    const reviews = await AppStoreScraper.fetchRecentReviews(appId);
    
    const newCount = await IngestionService.saveAppStoreReviews(source.id, reviews);
    
    res.json({
      success: true,
      scraped: reviews.length,
      savedAsNew: newCount,
      message: "Check your terminal logs!"
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post('/test-ai', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Please provide 'text' in the JSON body" });
    }

    const aiResult = await AiService.analyzeFeedback(text);
    res.json({ success: true, analysis: aiResult });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get('/process-all', async (req, res) => {
  try {
    const count = await ProcessorService.processPendingFeedback();
    res.json({ success: true, processed: count });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`FeedRails API running on http://localhost:${PORT}`);
});