import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { LayoutDashboard, LogIn, Zap, BarChart3, ShieldCheck } from 'lucide-react';
import { SignIn, SignUp, SignedIn, SignedOut } from '@clerk/clerk-react';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import AppNav from './components/AppNav';
import './App.css';

const LandingPage = () => (
  <div className="landing-shell min-h-screen text-white selection:bg-blue-300/40 overflow-hidden">
    <AppNav />

    <div className="landing-hero-bg" aria-hidden="true" />
    <div className="landing-video-overlay" />
    <div className="landing-orb landing-orb-1" />
    <div className="landing-orb landing-orb-2" />

    <header className="max-w-6xl mx-auto px-6 pt-14 pb-16 relative z-10">
      <div className="max-w-3xl text-center mx-auto landing-copy-wrap">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-200/90 mb-4">FeedRails AI</p>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight mb-6 text-white leading-tight">
            From user feedback to
            <br className="hidden md:block" />
            confident product decisions
          </h1>
          <p className="text-slate-200 text-base md:text-lg max-w-2xl mx-auto mb-10">
            Track App Store and Reddit signals in one place, surface urgent issues fast, and ship what matters next.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <SignedIn>
              <Link
                to="/dashboard"
                className="landing-cta px-6 py-3 rounded-md font-semibold transition flex items-center gap-2"
              >
                Open Dashboard <LayoutDashboard size={18} />
              </Link>
            </SignedIn>
            <SignedOut>
              <Link
                to="/sign-in"
                className="landing-cta-secondary px-6 py-3 rounded-md font-semibold transition flex items-center gap-2"
              >
                <LogIn size={18} /> Sign In
              </Link>
            </SignedOut>
          </div>
      </div>
    </header>

    <section className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-6 pb-20 relative z-10" id="features">
      {[
        { icon: <BarChart3 className="text-slate-700" size={20} />, title: 'Real-time Analysis', desc: 'Sentiment scoring as feedback arrives.' },
        { icon: <ShieldCheck className="text-slate-700" size={20} />, title: 'Automated Urgency', desc: 'Identify critical issues early.' },
        { icon: <Zap className="text-slate-700" size={20} />, title: 'AI Synthesis', desc: 'Clear summaries for faster decisions.' },
      ].map((f, i) => (
        <div key={i} className="landing-feature-card p-6 rounded-lg landing-reveal" style={{ animationDelay: `${i * 0.12}s` }}>
          <div className="mb-3">{f.icon}</div>
          <h3 className="text-lg font-semibold mb-1 text-white">{f.title}</h3>
          <p className="text-slate-300 text-sm">{f.desc}</p>
        </div>
      ))}
    </section>
  </div>
);

const AuthLayout = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
  <div className="min-h-screen bg-[#f5f6f8] text-slate-800">
    <AppNav />
    <div className="flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  </div>
)

const SignInPage = () => (
  <AuthLayout title="Welcome back" subtitle="Sign in to your FeedRails workspace">
    <SignIn
      forceRedirectUrl="/"
      appearance={{
        elements: {
          card: 'shadow-none border-0 p-0 bg-transparent',
          footer: 'hidden',
          rootBox: 'w-full',
          socialButtonsBlockButton: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
          socialButtonsBlockButtonText: 'font-medium',
          formButtonPrimary: 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50',
          formFieldInput: 'border border-black focus:border-black',
          headerTitle: 'hidden',
          headerSubtitle: 'hidden'
        }
      }}
    />
  </AuthLayout>
)

const SignUpPage = () => (
  <AuthLayout title="Create your account" subtitle="Use Google to start in seconds">
    <SignUp
      forceRedirectUrl="/dashboard"
      appearance={{
        elements: {
          card: 'shadow-none border-0 p-0 bg-transparent',
          footer: 'hidden',
          rootBox: 'w-full',
          socialButtonsBlockButton: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
          socialButtonsBlockButtonText: 'font-medium',
          formButtonPrimary: 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50',
          formFieldInput: 'border border-black focus:border-black',
          headerTitle: 'hidden',
          headerSubtitle: 'hidden'
        }
      }}
    />
  </AuthLayout>
)

const ProtectedDashboard = () => (
  <>
    <SignedIn>
      <Reports />
    </SignedIn>
    <SignedOut>
      <Navigate to="/sign-in" replace />
    </SignedOut>
  </>
)

const ProtectedProjectDashboard = () => (
  <>
    <SignedIn>
      <Dashboard />
    </SignedIn>
    <SignedOut>
      <Navigate to="/sign-in" replace />
    </SignedOut>
  </>
)

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route path="/dashboard" element={<ProtectedDashboard />} />
        <Route path="/dashboard/:projectId" element={<ProtectedProjectDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;