import express from 'express';
import cors from 'cors';
import { clerkMiddleware, getAuth, requireAuth } from '@clerk/express';
import { AppStoreScraper } from './services/app-store.service';
import { IngestionService } from './services/ingestion.service';
import { prisma } from './lib/prisma';
import { AiService } from './services/ai.service';
import { ProcessorService } from './services/processor.service';
import { RedditScraper } from './services/reddit.service';


const app = express();
const PORT = process.env.PORT || 3000;

const DEFAULT_PROJECT_SLUG = 'default';
const CRON_SECRET = process.env.CRON_SECRET ?? '';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function createProjectSlug(userId: string, projectName: string) {
  const base = slugify(projectName) || 'project';

  for (let index = 0; index < 100; index++) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const candidate = `${base}${suffix}`;
    const existing = await prisma.project.findUnique({
      where: {
        userId_slug: {
          userId,
          slug: candidate,
        },
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
}

async function getOwnedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });
}

async function ensureUserFromAuth(req: express.Request) {
  const auth = getAuth(req);
  if (!auth.userId) {
    throw new Error('Unauthorized');
  }

  const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
  const email =
    typeof claims.email === 'string' && claims.email.length > 0
      ? claims.email
      : `${auth.userId}@clerk.local`;
  const name =
    typeof claims.full_name === 'string' && claims.full_name.length > 0
      ? claims.full_name
      : null;

  const existing = await prisma.user.findUnique({ where: { clerkUserId: auth.userId } });
  if (existing) {
    return existing;
  }

  const emailOwner = await prisma.user.findUnique({ where: { email } });
  if (emailOwner) {
    return prisma.user.update({
      where: { id: emailOwner.id },
      data: { clerkUserId: auth.userId, name: name ?? emailOwner.name }
    });
  }

  return prisma.user.create({
    data: {
      clerkUserId: auth.userId,
      email,
      name
    }
  });
}

async function ensureDefaultProject(userId: string) {
  return prisma.project.upsert({
    where: {
      userId_slug: {
        userId,
        slug: DEFAULT_PROJECT_SLUG
      }
    },
    update: {},
    create: {
      userId,
      name: 'Default App',
      slug: DEFAULT_PROJECT_SLUG
    }
  });
}

async function scrapeSource(source: {
  id: string;
  type: 'APP_STORE' | 'REDDIT';
  config: unknown;
}) {
  if (source.type === 'APP_STORE') {
    const config = (source.config ?? {}) as { appId?: unknown; targetReviews?: unknown };
    const appId = normalizeText(config.appId);
    const targetReviews = Number(config.targetReviews ?? 200);
    const safeTargetReviews = Number.isFinite(targetReviews)
      ? Math.max(50, Math.min(400, Math.round(targetReviews)))
      : 200;

    if (!appId) {
      throw new Error('Source appId is missing');
    }

    const reviews = await AppStoreScraper.fetchRecentReviews(appId, safeTargetReviews);
    const savedAsNew = await IngestionService.saveAppStoreReviews(source.id, reviews);

    return {
      sourceId: source.id,
      sourceType: source.type,
      scraped: reviews.length,
      savedAsNew,
    };
  }

  const config = (source.config ?? {}) as { subreddit?: unknown; query?: unknown };
  const subreddit = normalizeText(config.subreddit);
  const query = normalizeText(config.query);

  if (!subreddit) {
    throw new Error('Source subreddit is missing');
  }

  const posts = await RedditScraper.fetchRecentPosts(subreddit, query || undefined);
  const savedAsNew = await IngestionService.saveRedditPosts(source.id, posts);

  return {
    sourceId: source.id,
    sourceType: source.type,
    scraped: posts.length,
    savedAsNew,
  };
}

async function syncProject(projectId: string, userId: string) {
  const sources = await prisma.source.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      config: true,
    },
  });

  const sourceResults = [] as Array<{
    sourceId: string;
    sourceType: 'APP_STORE' | 'REDDIT';
    scraped: number;
    savedAsNew: number;
  }>;

  for (const source of sources) {
    const result = await scrapeSource(source);
    sourceResults.push(result);
  }

  const queued = await ProcessorService.processPendingFeedback(userId, projectId, undefined, 10);

  return {
    sourceCount: sources.length,
    queued,
    sourceResults,
  };
}

function isCronAuthorized(req: express.Request) {
  if (!CRON_SECRET) {
    return false;
  }

  const headerSecret = normalizeText(req.headers['x-cron-secret']);
  if (headerSecret && headerSecret === CRON_SECRET) {
    return true;
  }

  const authHeader = normalizeText(req.headers.authorization);
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  return token === CRON_SECRET;
}

async function getProjectReportStatus(projectId: string, userId: string) {
  const [totalFeedback, analyzedInsights] = await Promise.all([
    prisma.rawFeedback.count({
      where: {
        source: {
          projectId,
          project: {
            userId,
          },
        },
      },
    }),
    prisma.analyzedInsight.count({
      where: {
        feedback: {
          source: {
            projectId,
            project: {
              userId,
            },
          },
        },
      },
    }),
  ]);

  const pendingInsights = Math.max(totalFeedback - analyzedInsights, 0);
  const state = totalFeedback === 0
    ? 'EMPTY'
    : pendingInsights > 0
      ? 'PROCESSING'
      : 'READY';

  return {
    totalFeedback,
    analyzedInsights,
    pendingInsights,
    state,
    progress: totalFeedback === 0 ? 0 : Math.round((analyzedInsights / totalFeedback) * 100),
  } as const;
}

app.use(cors());
app.use(express.json());
app.use(clerkMiddleware());
app.get('/health', (req, res) => {
  res.json({ success: true });
});
app.get('/insights', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.query.projectId);
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.round(rawLimit), 200)
      : undefined;

    if (projectId) {
      const project = await getOwnedProject(user.id, projectId);
      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
    }

    const insights = await prisma.analyzedInsight.findMany({
      where: {
        feedback: {
          source: {
            project: {
              userId: user.id,
              ...(projectId ? { id: projectId } : {}),
            }
          }
        }
      },
      include: {
        feedback: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      ...(limit ? { take: limit } : {}),
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

app.get('/projects', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        sources: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    res.json({ success: true, data: projects });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/reports', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        sources: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const data = await Promise.all(
      projects.map(async (project) => {
        const status = await getProjectReportStatus(project.id, user.id);
        const appSource = project.sources.find((source) => source.type === 'APP_STORE');
        const redditSource = project.sources.find((source) => source.type === 'REDDIT');
        const appId = normalizeText((appSource?.config as { appId?: unknown } | null)?.appId);
        const subreddit = normalizeText((redditSource?.config as { subreddit?: unknown } | null)?.subreddit);

        return {
          id: project.id,
          name: project.name,
          slug: project.slug,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          appStoreId: appId || null,
          subreddit: subreddit || null,
          ...status,
        };
      })
    );

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/reports', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const appStoreId = normalizeText(req.body?.appStoreId);
    const subreddit = normalizeText(req.body?.subreddit).replace(/^r\//i, '');
    const requestedName = normalizeText(req.body?.name);

    if (!appStoreId && !subreddit) {
      return res.status(400).json({ success: false, error: 'At least appStoreId or subreddit is required' });
    }

    const generatedName = requestedName || [
      appStoreId ? `App ${appStoreId}` : '',
      subreddit ? `r/${subreddit}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Feedback Report';

    const slug = await createProjectSlug(user.id, generatedName);

    const created = await prisma.project.create({
      data: {
        userId: user.id,
        name: generatedName,
        slug,
        sources: {
          create: [
            ...(appStoreId
              ? [{
                  type: 'APP_STORE' as const,
                  name: `App Store ${appStoreId}`,
                  config: { appId: appStoreId, targetReviews: 200 },
                }]
              : []),
            ...(subreddit
              ? [{
                  type: 'REDDIT' as const,
                  name: `r/${subreddit}`,
                  config: { subreddit, query: null },
                }]
              : []),
          ],
        },
      },
    });

    const syncResult = await syncProject(created.id, user.id);
    const status = await getProjectReportStatus(created.id, user.id);

    return res.status(201).json({
      success: true,
      data: {
        id: created.id,
        name: created.name,
        slug: created.slug,
        queued: syncResult.queued,
        ...status,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/reports/:projectId/status', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const project = await getOwnedProject(user.id, projectId);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    const status = await getProjectReportStatus(project.id, user.id);

    if (status.pendingInsights > 0) {
      await ProcessorService.processPendingFeedback(user.id, project.id, undefined, 10);
    }

    const refreshedStatus = await getProjectReportStatus(project.id, user.id);
    res.json({ success: true, data: { projectId: project.id, ...refreshedStatus } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/reports/:projectId', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const name = normalizeText(req.body?.name);

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const project = await getOwnedProject(user.id, projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { name },
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/reports/:projectId', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const project = await getOwnedProject(user.id, projectId);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    await prisma.project.delete({ where: { id: project.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/projects', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const name = normalizeText(req.body?.name);

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const slug = await createProjectSlug(user.id, name);
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name,
        slug,
      },
    });

    res.status(201).json({ success: true, data: project });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/projects/:projectId', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const project = await getOwnedProject(user.id, projectId);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    await prisma.project.delete({ where: { id: project.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/projects/:projectId/sources', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const project = await getOwnedProject(user.id, projectId);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const sources = await prisma.source.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: sources });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/projects/:projectId/sources/app-store', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const project = await getOwnedProject(user.id, projectId);
    const appId = normalizeText(req.body?.appId);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!appId) {
      return res.status(400).json({ success: false, error: 'appId is required' });
    }

    const source = await prisma.source.create({
      data: {
        projectId: project.id,
        type: 'APP_STORE',
        name: normalizeText(req.body?.name) || `App Store ${appId}`,
        config: { appId },
      },
    });

    res.status(201).json({ success: true, data: source });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/projects/:projectId/sources/reddit', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const project = await getOwnedProject(user.id, projectId);
    const subreddit = normalizeText(req.body?.subreddit);
    const query = normalizeText(req.body?.query);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!subreddit) {
      return res.status(400).json({ success: false, error: 'subreddit is required' });
    }

    const source = await prisma.source.create({
      data: {
        projectId: project.id,
        type: 'REDDIT',
        name: normalizeText(req.body?.name) || `r/${subreddit}`,
        config: { subreddit, query: query || null },
      },
    });

    res.status(201).json({ success: true, data: source });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/projects/:projectId/sources/:sourceId', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const sourceId = normalizeText(req.params.sourceId);
    const project = await getOwnedProject(user.id, projectId);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const source = await prisma.source.findFirst({
      where: {
        id: sourceId,
        projectId: project.id,
      },
    });

    if (!source) {
      return res.status(404).json({ success: false, error: 'Source not found' });
    }

    await prisma.source.delete({ where: { id: source.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/projects/:projectId/sources/:sourceId/scrape', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const sourceId = normalizeText(req.params.sourceId);

    const project = await getOwnedProject(user.id, projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const source = await prisma.source.findFirst({
      where: {
        id: sourceId,
        projectId: project.id,
      },
    });

    if (!source) {
      return res.status(404).json({ success: false, error: 'Source not found' });
    }

    const result = await scrapeSource(source);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/sync/projects/:projectId', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.params.projectId);
    const project = await getOwnedProject(user.id, projectId);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const result = await syncProject(project.id, user.id);
    return res.json({
      success: true,
      projectId: project.id,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/cron/sync-all', async (req, res) => {
  try {
    if (!CRON_SECRET) {
      return res.status(500).json({ success: false, error: 'CRON_SECRET is not configured' });
    }

    if (!isCronAuthorized(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const projects = await prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, userId: true },
    });

    const results = [] as Array<{
      projectId: string;
      sourceCount: number;
      queued: number;
      sourceResults: Array<{
        sourceId: string;
        sourceType: 'APP_STORE' | 'REDDIT';
        scraped: number;
        savedAsNew: number;
      }>;
    }>;

    for (const project of projects) {
      const result = await syncProject(project.id, project.userId);
      results.push({ projectId: project.id, ...result });
    }

    const queued = results.reduce((total, item) => total + item.queued, 0);
    const sourceCount = results.reduce((total, item) => total + item.sourceCount, 0);

    res.json({
      success: true,
      projectCount: results.length,
      sourceCount,
      queued,
      results,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/test-pipeline/:appId', requireAuth(), async (req, res) => {
  try {
    const appIdParam = req.params.appId;
    const appId = Array.isArray(appIdParam) ? appIdParam[0] : appIdParam;
    if (!appId) {
      return res.status(400).json({ success: false, error: 'appId is required' });
    }
    const user = await ensureUserFromAuth(req);
    const project = await ensureDefaultProject(user.id);

    let source = await prisma.source.findFirst({
      where: {
        type: 'APP_STORE',
        projectId: project.id
      }
    });
    if (!source) {
      source = await prisma.source.create({
        data: {
          projectId: project.id,
          name: 'Instagram App Store',
          type: 'APP_STORE',
          config: { appId }
        }
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
app.post('/test-ai', requireAuth(), async (req, res) => {
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
app.get('/process-all', requireAuth(), async (req, res) => {
  try {
    const user = await ensureUserFromAuth(req);
    const projectId = normalizeText(req.query.projectId);

    if (projectId) {
      const project = await getOwnedProject(user.id, projectId);
      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
    }

    const count = await ProcessorService.processPendingFeedback(user.id, projectId || undefined);
    res.json({ success: true, queued: count });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`FeedRails API running on http://localhost:${PORT}`);
});