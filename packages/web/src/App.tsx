import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { LayoutDashboard, LogIn, Zap, BarChart3, ShieldCheck } from 'lucide-react';
import Dashboard from './pages/Dashboard';

const LandingPage = () => (
  <div className="min-h-screen bg-[#f5f6f8] text-slate-800 selection:bg-slate-200">
    {/* Navigation */}
    <nav className="flex justify-between items-center p-6 max-w-7xl mx-auto">
      <div className="text-2xl font-bold tracking-tight flex items-center gap-2 text-slate-900">
        Feed<span className="text-slate-500">Rails</span>
      </div>
      <div className="flex gap-3 items-center">
        <button className="text-slate-600 hover:text-slate-900 transition flex items-center gap-2 text-sm font-medium">
          <LogIn size={16} /> Sign In
        </button>
      
      </div>
    </nav>

    {/* Hero Section */}
    <header className="max-w-6xl mx-auto px-6 pt-16 pb-20 text-center">
      <h1 className="text-4xl md:text-6xl font-semibold tracking-tight mb-6 text-slate-900">
        Turn user feedback into
        <br />
        product intelligence
      </h1>
      <p className="text-slate-600 text-base md:text-lg max-w-2xl mx-auto mb-10">
        FeedRails automatically collects, categorizes, and prioritizes App Store and Reddit feedback.
      </p>
      <div className="flex justify-center gap-4">
        <Link
          to="/dashboard"
          className="bg-white border border-slate-300 text-slate-900 px-6 py-3 rounded-md font-semibold hover:bg-slate-50 transition flex items-center gap-2"
        >
          Open Dashboard <LayoutDashboard size={18} />
        </Link>
      </div>
    </header>

    {/* Feature Grid */}
    <section className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-6 pb-20">
      {[
        { icon: <BarChart3 className="text-slate-700" size={20} />, title: 'Real-time Analysis', desc: 'Sentiment scoring as feedback arrives.' },
        { icon: <ShieldCheck className="text-slate-700" size={20} />, title: 'Automated Urgency', desc: 'Identify critical issues early.' },
        { icon: <Zap className="text-slate-700" size={20} />, title: 'AI Synthesis', desc: 'Clear summaries for faster decisions.' },
      ].map((f, i) => (
        <div key={i} className="bg-white border border-slate-200 p-6 rounded-lg">
          <div className="mb-3">{f.icon}</div>
          <h3 className="text-lg font-semibold mb-1 text-slate-900">{f.title}</h3>
          <p className="text-slate-600 text-sm">{f.desc}</p>
        </div>
      ))}
    </section>
  </div>
);

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}

export default App;