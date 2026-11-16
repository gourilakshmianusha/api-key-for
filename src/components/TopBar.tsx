import { LogIn, LogOut, Menu, Moon, Plus, Sun } from 'lucide-react';
import { User } from 'firebase/auth';
import { useState } from 'react';
import type { NavTab } from './Sidebar';

interface TopBarProps {
  activeTab: NavTab;
  user: User | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenMobileNav: () => void;
  onOpenCreateKey: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

const TAB_TITLES: Record<NavTab, string> = {
  keys: 'API Keys',
  playground: 'API Playground',
  logs: 'Request Logs',
  docs: 'Documentation',
};

export function TopBar({
  activeTab,
  user,
  darkMode,
  onToggleDarkMode,
  onOpenMobileNav,
  onOpenCreateKey,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-[#0F1520]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:inline text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            Workspace
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
            /
          </span>
          <span className="font-medium text-slate-900 dark:text-white truncate">
            {TAB_TITLES[activeTab]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenCreateKey}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>New API Key</span>
        </button>

        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 shrink-0">
            {user.photoURL && !imgFailed ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Developer avatar'}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-semibold">
                {(user.displayName || user.email || 'D')[0].toUpperCase()}
              </div>
            )}
            <span className="hidden md:inline text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[140px] truncate">
              {user.displayName || user.email}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            <span>Sign in</span>
          </button>
        )}
      </div>
    </header>
  );
}
