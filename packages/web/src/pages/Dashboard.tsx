import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { AlertTriangle, MessageSquare, TrendingUp, Filter, Zap, Loader2 } from 'lucide-react';

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

const COLORS = {
  POSITIVE: '#bbf7d0', // light green
  NEUTRAL: '#94a3b8',  
  NEGATIVE: '#fecaca', // light red
};

const Dashboard = () => {
  const [data, setData] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Helper to fetch data
  const fetchInsights = async () => {
    try {
      const response = await axios.get('http://localhost:3000/insights');
      setData(response.data.data);
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sync Data: Scrape -> Process -> Refresh
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // 1. Scrape latest reviews (Instagram ID used as example)
      await axios.get('http://localhost:3000/test-pipeline/389801252');
      
      // 2. Run the AI Batch Processor
      await axios.get('http://localhost:3000/process-all');
      
      // 3. Update the UI with fresh results
      await fetchInsights();
      
      alert("Intelligence Sync Complete!");
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Sync failed. Check API status.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const sentimentStats = [
    { name: 'Positive', value: data.filter((i) => i.sentiment === 'POSITIVE').length, color: COLORS.POSITIVE },
    { name: 'Neutral', value: data.filter((i) => i.sentiment === 'NEUTRAL').length, color: COLORS.NEUTRAL },
    { name: 'Negative', value: data.filter((i) => i.sentiment === 'NEGATIVE').length, color: COLORS.NEGATIVE },
  ];

  const avgUrgency = data.length
    ? (data.reduce((acc, curr) => acc + curr.urgencyScore, 0) / data.length).toFixed(1)
    : '0.0';

  const criticalItems = useMemo(
    () => [...data].filter((i) => i.urgencyScore >= 7).sort((a, b) => b.urgencyScore - a.urgencyScore).slice(0, 4),
    [data]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-sm font-medium text-slate-500">Assembling Insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] p-8 text-slate-800">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Feedback Insights</h1>
          <p className="text-slate-600">AI-powered analysis of your App Store presence</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={handleSync}
            disabled={isSyncing}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold shadow-sm transition-all ${
              isSyncing 
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
              : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95'
            }`}
          >
            {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} fill="currentColor" />}
            {isSyncing ? 'Syncing...' : 'Sync Data'}
          </button>

          <div className="flex gap-4 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-sm">
            <div className="flex items-center gap-2 border-r border-slate-200 px-3 py-1 text-slate-700">
              <MessageSquare size={16} /> {data.length} Total
            </div>
            <div className="flex items-center gap-2 px-3 py-1 text-slate-700">
              <TrendingUp size={16} /> Avg Urgency: {avgUrgency}
            </div>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sentiment Chart */}
        <div className="col-span-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <Filter size={18} /> Sentiment Distribution
          </h3>
          <div className="h-64">
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
          </div>
        </div>

        {/* Critical Issues */}
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

      {/* Full Feedback Feed */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900 text-sm">All Feedback Data</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-800">Original Comment</th>
              <th className="px-6 py-4 font-semibold text-slate-800">Sentiment</th>
              <th className="px-6 py-4 font-semibold text-slate-800">Urgency</th>
              <th className="px-6 py-4 font-semibold text-slate-800">AI Logic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-slate-50/80">
                <td className="max-w-md truncate px-6 py-4 text-slate-600 font-medium">{item.feedback.content}</td>
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
                <td className="px-6 py-4 italic text-slate-700 leading-snug">{item.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;