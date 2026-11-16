import { BookOpen, KeyRound, LogIn, ScrollText, Terminal, X } from 'lucide-react';

export type NavTab = 'keys' | 'playground' | 'logs' | 'docs';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  keyCount: number;
  isSignedIn: boolean;
  onSignIn: () => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof KeyRound }> = [
  { id: 'keys', label: 'API Keys', icon: KeyRound },
  { id: 'playground', label: 'API Playground', icon: Terminal },
  { id: 'logs', label: 'Request Logs', icon: ScrollText },
  { id: 'docs', label: 'Documentation', icon: BookOpen },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
  keyCount,
  isSignedIn,
  onSignIn,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#0F1520] border-r border-slate-200 dark:border-slate-800">
      <div>
        <div className="flex h-14 items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800">
          <a
            href="#keys"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('keys');
              onCloseMobile();
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            SerpForge
          </a>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="lg:hidden p-2 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="p-3 space-y-1" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'keys' && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {keyCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
            Lifetime Free Tier
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Unlimited requests · Zero billing
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {isSignedIn ? 'Cloud sync enabled' : 'Local browser sandbox'}
          </div>
        </div>

        {!isSignedIn && (
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onSignIn();
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign in with Google</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] h-full z-10">{navContent}</aside>
        </div>
      )}
    </>
  );
}
