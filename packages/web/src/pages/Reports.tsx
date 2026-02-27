import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Loader2, FileText, Plus, Pencil, Trash2, Download } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { toast } from 'react-toastify';
import { jsPDF } from 'jspdf';
import AppNav from '../components/AppNav';

interface ReportItem {
  id: string;
  name: string;
  appStoreId: string | null;
  subreddit: string | null;
  totalFeedback: number;
  analyzedInsights: number;
  pendingInsights: number;
  progress: number;
  state: 'EMPTY' | 'PROCESSING' | 'READY';
  createdAt: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const Reports = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [appStoreId, setAppStoreId] = useState('');
  const [subreddit, setSubreddit] = useState('');

  const getAuthHeaders = async () => {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    return { Authorization: `Bearer ${token}` };
  };

  const loadReports = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await axios.get(`${API_BASE_URL}/reports`, { headers });
      const data = Array.isArray(response.data?.data) ? response.data.data : [];
      setReports(data);
    } catch (error) {
      console.error('Failed to load reports:', error);
      setReports([]);
      toast.error('Failed to load reports.', { toastId: 'reports-load-error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    const hasProcessing = reports.some((report) => report.state === 'PROCESSING');
    if (!hasProcessing) return;

    const timer = window.setInterval(() => {
      loadReports();
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [reports]);

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedAppId = appStoreId.trim();
    const cleanSubreddit = subreddit.trim().replace(/^r\//i, '');

    if (!trimmedAppId && !cleanSubreddit) {
      toast.info('Enter at least App Store ID or subreddit.');
      return;
    }

    setCreating(true);
    try {
      const headers = await getAuthHeaders();
      const response = await axios.post(
        `${API_BASE_URL}/reports`,
        {
          name: trimmedName || undefined,
          appStoreId: trimmedAppId || undefined,
          subreddit: cleanSubreddit || undefined,
        },
        { headers }
      );

      const createdId = response.data?.data?.id as string | undefined;
      setName('');
      setAppStoreId('');
      setSubreddit('');
      await loadReports();
      if (createdId) {
        toast.success('Report created. Opening progress view...');
        navigate(`/dashboard/${createdId}`);
      }
    } catch (error) {
      console.error('Failed to create report:', error);
      toast.error('Could not create report. Please verify IDs and try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (report: ReportItem) => {
    const nextName = window.prompt('Rename report', report.name)?.trim();
    if (!nextName || nextName === report.name) return;

    try {
      const headers = await getAuthHeaders();
      await axios.patch(`${API_BASE_URL}/reports/${report.id}`, { name: nextName }, { headers });
      await loadReports();
      toast.success('Report renamed.');
    } catch (error) {
      console.error('Failed to rename report:', error);
      toast.error('Could not rename report.');
    }
  };

  const handleDelete = async (report: ReportItem) => {
    const confirmed = window.confirm(`Delete "${report.name}" and all of its feedback?`);
    if (!confirmed) {
      toast.info('Delete canceled.');
      return;
    }

    try {
      const headers = await getAuthHeaders();
      await axios.delete(`${API_BASE_URL}/reports/${report.id}`, { headers });
      await loadReports();
      toast.success('Report deleted.');
    } catch (error) {
      console.error('Failed to delete report:', error);
      toast.error('Could not delete report.');
    }
  };

  const handleDownloadPdf = async (report: ReportItem) => {
    if (report.state !== 'READY' || report.progress < 100) {
      toast.info('PDF will be available once scan reaches 100%.');
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const [statusResponse, insightsResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/reports/${report.id}/status`, { headers }),
        axios.get(`${API_BASE_URL}/insights`, {
          headers,
          params: {
            projectId: report.id,
          },
        }),
      ]);

      const reportStatus = statusResponse.data?.data as {
        totalFeedback: number;
        analyzedInsights: number;
        progress: number;
        state: string;
      };
      const insights = Array.isArray(insightsResponse.data?.data) ? insightsResponse.data.data : [];
      const criticalInsights = [...insights]
        .filter((item: any) => Number(item?.urgencyScore ?? 0) >= 7)
        .sort((a: any, b: any) => Number(b?.urgencyScore ?? 0) - Number(a?.urgencyScore ?? 0))
        .slice(0, 10);

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 40;
      const contentWidth = pageWidth - marginX * 2;
      const lineHeight = 16;
      let cursorY = 42;

      const ensureSpace = (requiredHeight: number) => {
        if (cursorY + requiredHeight <= pageHeight - 42) {
          return;
        }
        doc.addPage();
        cursorY = 42;
      };

      const drawSectionTitle = (title: string) => {
        ensureSpace(28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(title, marginX, cursorY);
        cursorY += 10;
        doc.setDrawColor(226, 232, 240);
        doc.line(marginX, cursorY, marginX + contentWidth, cursorY);
        cursorY += 18;
      };

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(marginX, cursorY, contentWidth, 98, 8, 8, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginX, cursorY, contentWidth, 98, 8, 8, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text(report.name, marginX + 16, cursorY + 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX + 16, cursorY + 48);
      doc.text(`Status: ${reportStatus?.state ?? report.state}`, marginX + 16, cursorY + 66);
      doc.text(`Progress: ${reportStatus?.progress ?? report.progress}%`, marginX + 180, cursorY + 66);
      doc.text(
        `Analyzed: ${reportStatus?.analyzedInsights ?? report.analyzedInsights} / ${reportStatus?.totalFeedback ?? report.totalFeedback}`,
        marginX + 300,
        cursorY + 66
      );

      cursorY += 122;

      const sentimentCounts = {
        POSITIVE: insights.filter((item: any) => item.sentiment === 'POSITIVE').length,
        NEUTRAL: insights.filter((item: any) => item.sentiment === 'NEUTRAL').length,
        NEGATIVE: insights.filter((item: any) => item.sentiment === 'NEGATIVE').length,
      };
      const analyzedTotal = Math.max(reportStatus?.analyzedInsights ?? insights.length, 1);

      drawSectionTitle('Sentiment Overview');
      const sentimentRows: Array<{ label: string; value: number; color: [number, number, number] }> = [
        { label: 'Positive', value: sentimentCounts.POSITIVE, color: [134, 239, 172] },
        { label: 'Neutral', value: sentimentCounts.NEUTRAL, color: [148, 163, 184] },
        { label: 'Negative', value: sentimentCounts.NEGATIVE, color: [252, 165, 165] },
      ];

      for (const row of sentimentRows) {
        ensureSpace(26);
        const pct = Math.round((row.value / analyzedTotal) * 100);
        doc.setFont('helvetica', 'medium');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(`${row.label}  ${row.value} (${pct}%)`, marginX, cursorY);

        const barX = marginX + 170;
        const barY = cursorY - 8;
        const barW = contentWidth - 210;
        const filledW = Math.max(0, Math.min(barW, (barW * pct) / 100));

        doc.setFillColor(226, 232, 240);
        doc.roundedRect(barX, barY, barW, 8, 3, 3, 'F');
        doc.setFillColor(row.color[0], row.color[1], row.color[2]);
        doc.roundedRect(barX, barY, filledW, 8, 3, 3, 'F');
        cursorY += 22;
      }

      cursorY += 6;
      drawSectionTitle('Critical Feedback (Urgency 7-10)');

      if (criticalInsights.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(100, 116, 139);
        doc.text('No critical feedback found in this report.', marginX, cursorY);
        cursorY += 22;
      }

      for (const item of criticalInsights) {
        const summary = String(item?.summary ?? '').trim() || 'No summary';
        const feedbackText = String(item?.feedback?.content ?? '').replace(/\s+/g, ' ').trim();
        const feedbackSnippet = feedbackText.length > 170 ? `${feedbackText.slice(0, 170)}...` : feedbackText;
        const tags = Array.isArray(item?.tags) ? item.tags.slice(0, 4).join(', ') : '';

        const summaryLines = doc.splitTextToSize(summary, contentWidth - 28);
        const snippetLines = doc.splitTextToSize(feedbackSnippet || 'No original feedback text available.', contentWidth - 28);
        const tagsLines = tags ? doc.splitTextToSize(`Tags: ${tags}`, contentWidth - 28) : [];
        const boxHeight = 34 + summaryLines.length * 14 + snippetLines.length * 13 + tagsLines.length * 13;

        ensureSpace(boxHeight + 8);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(marginX, cursorY, contentWidth, boxHeight, 6, 6, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`Urgency ${item?.urgencyScore ?? 0}/10 • ${item?.sentiment ?? 'NEUTRAL'}`, marginX + 10, cursorY + 16);

        let itemY = cursorY + 34;
        doc.setFont('helvetica', 'medium');
        doc.setTextColor(30, 41, 59);
        doc.text(summaryLines, marginX + 10, itemY);
        itemY += summaryLines.length * 14 + 2;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(snippetLines, marginX + 10, itemY);
        itemY += snippetLines.length * 13;

        if (tagsLines.length > 0) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 116, 139);
          doc.text(tagsLines, marginX + 10, itemY + 4);
        }

        cursorY += boxHeight + 8;
      }

      const topItems = insights.slice(0, 20);
      drawSectionTitle('Recent Insights');

      for (const item of topItems) {
        const summary = String(item?.summary ?? '').trim() || 'No summary';
        const line = `• [${item?.sentiment ?? 'NEUTRAL'} | ${item?.urgencyScore ?? 0}/10] ${summary}`;
        const wrapped = doc.splitTextToSize(line, contentWidth);
        ensureSpace(wrapped.length * lineHeight + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(wrapped, marginX, cursorY);
        cursorY += wrapped.length * lineHeight + 4;
      }

      const fileName = `${report.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase() || 'report'}.pdf`;
      doc.save(fileName);
      toast.success('PDF downloaded.');
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error('Could not download PDF.');
    }
  };

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reports]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] text-slate-800">
        <AppNav />
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-800">
      <AppNav />
      <div className="mx-auto max-w-6xl p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Reports Dashboard</h1>
          <p className="text-slate-600">Create reports for different apps and open each once processing is done.</p>
        </div>

        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Create New Report</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Report name (optional)"
              className="rounded-md border border-black bg-white px-3 py-2 text-sm"
            />
            <input
              value={appStoreId}
              onChange={(event) => setAppStoreId(event.target.value)}
              placeholder="App Store ID"
              className="rounded-md border border-black bg-white px-3 py-2 text-sm"
            />
            <input
              value={subreddit}
              onChange={(event) => setSubreddit(event.target.value)}
              placeholder="Subreddit (e.g. reactjs)"
              className="rounded-md border border-black bg-white px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {creating ? 'Generating...' : 'Make Report'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">App Store scraping targets up to 300 reviews per report.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {sortedReports.map((report) => (
            <div key={report.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{report.name}</h3>
                  <p className="text-xs text-slate-500">
                    {report.appStoreId ? `App ${report.appStoreId}` : 'No App ID'}
                    {report.subreddit ? ` · r/${report.subreddit}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRename(report)}
                    className="rounded-md border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
                    title="Rename"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(report)}
                    className="rounded-md border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Status: {report.state}</span>
                  <span>{report.progress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200">
                  <div className="h-2 rounded-full bg-slate-700 transition-all" style={{ width: `${Math.max(0, Math.min(report.progress, 100))}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {report.analyzedInsights}/{report.totalFeedback} analyzed
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => navigate(`/dashboard/${report.id}`)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FileText size={14} />
                  {report.state === 'READY' ? 'Open Report' : 'View Progress'}
                </button>
                <button
                  onClick={() => handleDownloadPdf(report)}
                  disabled={report.state !== 'READY' || report.progress < 100}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download size={14} />
                  Download PDF
                </button>
              </div>
            </div>
          ))}
        </div>

        {sortedReports.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No reports yet. Add an App Store ID and/or subreddit above to generate your first report.
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
