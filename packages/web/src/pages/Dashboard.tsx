import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { AlertTriangle, MessageSquare, TrendingUp, Filter, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { toast } from 'react-toastify';
import AppNav from '../components/AppNav';

interface Insight {
  id: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  tags: string[];
  urgencyScore: number;
  summary: string;
  feedback: {
    content: string;
    metadata: any;
  };
}

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface ReportStatus {
  totalFeedback: number;
  analyzedInsights: number;
  pendingInsights: number;
  progress: number;
  state: 'EMPTY' | 'PROCESSING' | 'READY';
}

const COLORS = {
  POSITIVE: '#bbf7d0',
  NEUTRAL: '#94a3b8',
  NEGATIVE: '#fecaca',
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const Dashboard = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [data, setData] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = async () => {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    return { Authorization: `Bearer ${token}` };
  };

  const fetchProject = async () => {
    if (!projectId) return null;
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/projects`, { headers });
    const projects = Array.isArray(response.data?.data) ? response.data.data : [];
    const found = projects.find((item: Project) => item.id === projectId) ?? null;
    setProject(found);
    return found;
  };

  const fetchStatus = async () => {
    if (!projectId) return null;
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/reports/${projectId}/status`, { headers });
    const reportStatus = response.data?.data as ReportStatus;
    setStatus(reportStatus);
    return reportStatus;
  };

  const fetchInsights = async () => {
    if (!projectId) return;
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/insights`, {
      headers,
      params: { projectId },
    });
    const insights = Array.isArray(response.data?.data) ? response.data.data : [];
    setData(insights);
  };

  const refresh = async () => {
    if (!projectId) {
      navigate('/dashboard', { replace: true });
      return;
    }

    try {
      const found = await fetchProject();
      if (!found) {
        navigate('/dashboard', { replace: true });
        return;
      }

      const latestStatus = await fetchStatus();
      if (latestStatus?.state === 'READY') {
        await fetchInsights();
      } else {
        setData([]);
      }
    } catch (error) {
      console.error('Failed to load report dashboard:', error);
      toast.error('Failed to load report dashboard.', { toastId: 'report-dashboard-load-error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    if (!status || status.state !== 'PROCESSING') return;

    const pollTimer = window.setInterval(async () => {
      try {
        const latestStatus = await fetchStatus();
        if (latestStatus?.state === 'READY') {
          await fetchInsights();
        }
      } catch {
        toast.error('Failed to refresh report status.', { toastId: 'report-status-poll-error' });
      }
    }, 3000);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [projectId, status?.state]);

  const sentimentStats = useMemo(() => {
    const total = data.length;
    const stats = [
      { key: 'POSITIVE', name: 'Positive', value: data.filter((i) => i.sentiment === 'POSITIVE').length, color: COLORS.POSITIVE },
      { key: 'NEUTRAL', name: 'Neutral', value: data.filter((i) => i.sentiment === 'NEUTRAL').length, color: COLORS.NEUTRAL },
      { key: 'NEGATIVE', name: 'Negative', value: data.filter((i) => i.sentiment === 'NEGATIVE').length, color: COLORS.NEGATIVE },
    ];

    return stats.map((item) => ({
      ...item,
      percentage: total > 0 ? Math.round((item.value / total) * 100) : 0,
    }));
  }, [data]);

  const dominantSentiment = useMemo(() => {
    return [...sentimentStats].sort((a, b) => b.value - a.value)[0]?.name ?? 'Neutral';
  }, [sentimentStats]);

  const avgUrgency = data.length
    ? (data.reduce((acc, curr) => acc + curr.urgencyScore, 0) / data.length).toFixed(1)
    : '0.0';

  const criticalItems = useMemo(
    () => [...data].filter((i) => i.urgencyScore >= 7).sort((a, b) => b.urgencyScore - a.urgencyScore).slice(0, 4),
    [data]
  );

  const recentItems = useMemo(() => data.slice(0, 20), [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] text-slate-800">
        <AppNav />
        <div className="flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <p className="text-sm font-medium text-slate-500">Loading report...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] text-slate-800">
        <AppNav />
        <div className="flex items-center justify-center p-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="mb-3 text-slate-700">This report was not found.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to Reports
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!status || status.state !== 'READY') {
    const progress = Math.max(0, Math.min(status?.progress ?? 0, 100));
    const analyzed = status?.analyzedInsights ?? 0;
    const total = status?.totalFeedback ?? 0;

    return (
      <div className="min-h-screen bg-[#f5f6f8] text-slate-800">
        <AppNav />
        <div className="relative overflow-hidden border-y border-slate-200 bg-linear-to-b from-white via-slate-50 to-[#f5f6f8]">
          <img
            src="/loading.gif"
            alt="AI scanning background"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55"
          />
          <div className="pointer-events-none absolute inset-0 bg-[#f5f6f8]/30" />

          <div className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-5xl flex-col justify-center p-8">
            <button
              onClick={() => navigate('/dashboard')}
              className="mb-8 inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={14} /> Back to Reports
            </button>

            <div className="grid items-center gap-8 lg:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
                <p className="mb-3 inline-flex rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  AI Pipeline Active
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
                <p className="mt-3 max-w-2xl text-base text-slate-600">
                  We are scraping, deduplicating, tagging, and ranking your feedback in real-time.
                </p>

                <div className="mt-6 rounded-xl border border-slate-200 bg-white/90 p-5 backdrop-blur">
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span>Full Scan Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-200">
                    <div className="h-2.5 rounded-full bg-slate-900 transition-all duration-700" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                    <p>Collected: {total}</p>
                    <p>Analyzed: {analyzed}</p>
                    <p>Remaining: {Math.max(total - analyzed, 0)}</p>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Scraping sources</div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Running sentiment model</div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Generating urgency insights</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-800">
      <AppNav />
      <div className="p-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <button
              onClick={() => navigate('/dashboard')}
              className="mb-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={14} /> Reports
            </button>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">{project.name}</h1>
            <p className="text-slate-600">AI-powered analysis of your App Store and Reddit feedback</p>
          </div>

          <div className="flex gap-4 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-sm">
            <div className="flex items-center gap-2 border-r border-slate-200 px-3 py-1 text-slate-700">
              <MessageSquare size={16} /> {status.totalFeedback} Total
            </div>
            <div className="flex items-center gap-2 px-3 py-1 text-slate-700">
              <TrendingUp size={16} /> Avg Urgency: {avgUrgency}
            </div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="col-span-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <Filter size={18} /> Sentiment Distribution
              </h3>
              <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {data.length} analyzed
              </span>
            </div>

            <div className="relative h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sentimentStats} innerRadius={58} outerRadius={78} paddingAngle={3} dataKey="value">
                    {sentimentStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Top Tone</p>
                <p className="text-lg font-semibold text-slate-900">{dominantSentiment}</p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {sentimentStats.map((item) => (
                <div key={item.key} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
                    <span>{item.name}</span>
                    <span>{item.value} · {item.percentage}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(item.percentage, 100))}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-2 overflow-hidden rounded-xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Urgent Attention Required</h3>
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-red-700">
                High Priority
              </span>
            </div>

            <div className="space-y-3">
              {criticalItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50/40 p-4 transition-colors hover:bg-red-50"
                >
                  <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={18} />
                  <div className="w-full">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="ml-auto rounded bg-red-200/50 px-2 py-0.5 text-[10px] font-bold text-red-900">
                        Score: {item.urgencyScore}/10
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 leading-relaxed">{item.summary}</p>
                  </div>
                </div>
              ))}

              {criticalItems.length === 0 && (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-sm text-slate-500">
                  System clear. No critical issues detected.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4">
            <h3 className="text-sm font-semibold text-slate-900">Recent Feedback (latest 20)</h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/50">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-800">Original Comment</th>
                <th className="px-6 py-4 font-semibold text-slate-800">Sentiment</th>
                <th className="px-6 py-4 font-semibold text-slate-800">Urgency</th>
                <th className="px-6 py-4 font-semibold text-slate-800">AI Logic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentItems.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-slate-50/80">
                  <td className="max-w-md truncate px-6 py-4 font-medium text-slate-600">{item.feedback.content}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-tight shadow-sm ${
                        item.sentiment === 'POSITIVE'
                          ? 'bg-green-100 text-green-800'
                          : item.sentiment === 'NEGATIVE'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.sentiment}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-900">{item.urgencyScore}/10</td>
                  <td className="px-6 py-4 italic leading-snug text-slate-700">{item.summary}</td>
                </tr>
              ))}
              {recentItems.length === 0 && (
                <tr>
                  <td className="px-6 py-8 text-sm text-slate-500" colSpan={4}>
                    No analyzed feedback yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
