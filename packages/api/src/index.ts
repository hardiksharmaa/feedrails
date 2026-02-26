import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'FeedRails API' });
});

app.listen(PORT, () => {
  console.log(`FeedRails API running on http://localhost:${PORT}`);
});