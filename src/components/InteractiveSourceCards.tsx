import { useState } from 'react';
import { Globe, ExternalLink, ShieldCheck, AlertCircle, Search } from 'lucide-react';

export interface SourceItem {
  title?: string;
  url?: string;
  hostname?: string;
  snippet?: string;
}

export interface InteractiveSourceCardsProps {
  sources?: Array<SourceItem | string>;
  isStreaming?: boolean;
  searchStatus?: 'searching' | 'completed' | 'failed' | 'idle';
  statusMessage?: string;
  onOpenInspector?: () => void;
}

export function InteractiveSourceCards({
  sources = [],
  isStreaming = false,
  searchStatus = 'completed',
  statusMessage,
  onOpenInspector
}: InteractiveSourceCardsProps) {
  const [expanded, setExpanded] = useState(false);

  // Parse and normalize genuine sources
  const validSources: SourceItem[] = (sources || [])
    .map((s) => {
      const url = typeof s === 'string' ? s : s?.url || '';
      let hostname = '';
      try {
        if (url) {
          const parsed = new URL(url);
          hostname = parsed.hostname.replace(/^www\./, '');
        }
      } catch {}
      const rawTitle = typeof s === 'object' && s?.title ? s.title : '';
      const title = rawTitle && rawTitle !== url ? rawTitle : hostname || 'Google Verified Web Source';
      return { url, title, hostname };
    })
    .filter((s) => Boolean(s.url && s.url.startsWith('http')));

  const count = validSources.length;
  const isLimited = count > 0 && count < 2;
  const isFailed = searchStatus === 'failed';

  if (count === 0 && !isFailed && !isStreaming) {
    return null;
  }

  const displaySources = expanded ? validSources : validSources.slice(0, 4);

  return (
    <div className="mt-4 pt-3.5 border-t border-cyan-500/20 bg-gradient-to-b from-cyan-950/30 via-cyan-950/15 to-transparent p-3.5 sm:p-4 rounded-2xl border border-cyan-500/25 shadow-[0_4px_24px_rgba(6,182,212,0.08)]">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shadow-sm flex-shrink-0">
            <Globe className="w-3.5 h-3.5" />
          </div>
          <span className="text-[13px] font-semibold text-cyan-200">
            Sources
          </span>
          {count > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono font-medium">
              {count} {count === 1 ? 'verified source' : 'verified sources'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isStreaming ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 animate-pulse">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
              </span>
              Searching live Google sources...
            </span>
          ) : isFailed ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/60 border border-amber-500/40 text-amber-300">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              Search Unverified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/50 border border-emerald-500/30 text-emerald-300">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Google Verified
            </span>
          )}

          {onOpenInspector && (
            <button
              onClick={onOpenInspector}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/30 text-cyan-200 transition-colors cursor-pointer"
              title="Open Search Inspector to examine raw retrieved data & Gemini grounding input"
            >
              <Search className="w-3 h-3 text-cyan-400" />
              <span>Search Inspector</span>
            </button>
          )}

          {count > 4 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[11.5px] font-medium text-cyan-400 hover:text-cyan-200 underline underline-offset-2 ml-1 cursor-pointer"
            >
              {expanded ? 'Show less' : `+${count - 4} more`}
            </button>
          )}
        </div>
      </div>

      {/* Trust & Limitation Notice (if fewer than 2 trustworthy sources were found) */}
      {isLimited && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[11.5px] text-cyan-200/90 leading-relaxed flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            Only 1 verified live source was retrieved for this specific query. GravityVerse strictly displays genuine citations and does not fabricate sources.
          </span>
        </div>
      )}

      {/* Failure Notice */}
      {isFailed && count === 0 && (
        <div className="mb-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11.5px] text-amber-200 leading-relaxed flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>
            {statusMessage || "Live Google Search verification could not be completed for this response. The answer cannot be fully grounded in real-time data."}
          </span>
        </div>
      )}

      {/* Grid of Interactive Source Cards */}
      {count > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {displaySources.map((source, sIdx) => (
            <a
              key={sIdx}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex flex-col justify-between p-3 rounded-xl bg-[#0b1220]/85 border border-cyan-500/20 hover:border-cyan-400/60 hover:bg-cyan-950/30 hover:shadow-[0_4px_20px_rgba(6,182,212,0.18)] transition-all duration-200 text-left"
              title={`${source.title} (${source.url})`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-cyan-300/90 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20 max-w-[80%] truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                    <span className="truncate">{source.hostname || 'source'}</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400/70 group-hover:text-cyan-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all flex-shrink-0" />
                </div>
                <h4 className="text-[12.5px] font-medium text-gray-200 group-hover:text-white line-clamp-2 leading-snug">
                  {source.title}
                </h4>
              </div>
              <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-gray-400 group-hover:text-cyan-200">
                <span className="truncate max-w-[180px] sm:max-w-[210px] font-mono text-[10.5px]">
                  {source.url ? source.url.replace(/^https?:\/\//, '') : ''}
                </span>
                <span className="text-[10.5px] font-semibold text-cyan-400 group-hover:underline flex items-center gap-0.5">
                  Visit ↗
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
