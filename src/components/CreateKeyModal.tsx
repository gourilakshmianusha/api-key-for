import { Check, Copy, KeyRound, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type { ApiKeyRecord } from '../types/serp';

interface CreateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<ApiKeyRecord>;
}

export function CreateKeyModal({ isOpen, onClose, onCreate }: CreateKeyModalProps) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<ApiKeyRecord | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a project name for this key.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const key = await onCreate(trimmed);
      setCreatedKey(key);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create API key.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleClose() {
    setCreatedKey(null);
    setError(null);
    setName('');
    setCopied(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-key-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1520] shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2
              id="create-key-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-white"
            >
              {createdKey ? 'Lifetime API Key Ready' : 'Generate Lifetime API Key'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {createdKey ? (
          <div className="p-6 space-y-5">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Your lifetime free key <span className="font-medium text-slate-900 dark:text-white">{createdKey.name}</span> is active immediately. Pass it in the <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">X-API-KEY</code> header from any project.
            </p>

            <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70">
              <code className="font-mono text-xs text-slate-900 dark:text-slate-100 break-all select-all">
                {createdKey.keyValue}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shrink-0 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="key-name-input"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Project or environment label
              </label>
              <input
                id="key-name-input"
                type="text"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production Web Scraper, Next.js App"
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No credit card, no expiry, and zero per-request credit deductions.
              </p>
            </div>

            {error && (
              <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
              >
                {submitting ? 'Generating...' : 'Generate Key'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
