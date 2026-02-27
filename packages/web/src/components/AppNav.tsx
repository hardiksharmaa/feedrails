import { Link, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';

const AppNav = () => {
  const location = useLocation();
  const isAuthPage = location.pathname.startsWith('/sign-');
  const isLandingPage = location.pathname === '/';

  return (
    <header
      className={isLandingPage
        ? 'relative z-30 border-b border-white/10 bg-slate-950/30 backdrop-blur-md'
        : 'border-b border-slate-200 bg-white'}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link
          to="/"
          className={isLandingPage
            ? 'text-[1.72rem] font-semibold tracking-[0.18em] text-blue-100'
            : 'text-[1.35rem] font-semibold tracking-[0.16em] text-slate-800'}
        >
          FEEDRAILS <span className={isLandingPage ? 'text-blue-300' : 'text-slate-500'}>AI</span>
        </Link>

        <div className="flex items-center gap-3">
          <SignedOut>
            {!isAuthPage && (
              <Link
                to="/sign-in"
                className={isLandingPage
                  ? 'inline-flex items-center rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20'
                  : 'inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50'}
              >
                Sign In
              </Link>
            )}
          </SignedOut>
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: 'h-8 w-8 ring-1 ring-white/45',
                },
              }}
            />
          </SignedIn>
        </div>
      </div>
    </header>
  );
};

export default AppNav;
