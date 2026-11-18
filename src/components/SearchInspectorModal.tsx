import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ExternalLink, 
  Copy, 
  Check, 
  Database, 
  Cpu, 
  FileText, 
  ShieldCheck, 
  AlertCircle, 
  Search, 
  RefreshCw, 
  Code,
  Terminal,
  Globe
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export interface RawSearchItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  raw?: any;
}

export interface SearchDiagnosticsData {
  id?: string;
  timestamp?: number;
  isoDate?: string;
  query?: string;
  provider?: string;
  status?: 'success' | 'partial' | 'failed' | 'simulated';
  executionTimeMs?: number;
  tavilyApiResponse?: {
    query?: string;
    answer?: string;
    responseTimeMs?: number;
    resultsCount?: number;
    results?: RawSearchItem[];
    rawPayload?: any;
  } | null;
  geminiGroundingInput?: {
    model?: string;
    systemInstruction?: string;
    groundingPrompt?: string;
    injectedSnippets?: string[];
    rawSnippetsText?: string;
    toolsConfigured?: any[];
    searchQueriesExecuted?: string[];
    candidateChunksCount?: number;
    contextLengthChars?: number;
  } | null;
  rawMetadata?: {
    titles?: string[];
    snippets?: string[];
    urls?: string[];
    items?: RawSearchItem[];
  };
  aiResponseText?: string;
  statusMessage?: string;
}

export interface SearchInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: {
    text?: string;
    query?: string;
    model?: string;
    groundingSources?: Array<{ title?: string; url?: string }>;
    sources?: Array<{ title?: string; url?: string }>;
    searchDiagnostics?: SearchDiagnosticsData;
    searchProvider?: string;
    webSearchPerformed?: boolean;
  } | null;
}

export const SearchInspectorModal: React.FC<SearchInspectorModalProps> = ({
  isOpen,
  onClose,
  message
}) => {
  const [activeTab, setActiveTab] = useState<'metadata' | 'tavily' | 'grounding'>('metadata');
  const [filterText, setFilterText] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  
  // State for live test query execution directly inside inspector
  const [testQuery, setTestQuery] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<SearchDiagnosticsData | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset filter when opening new message
  useEffect(() => {
    if (isOpen) {
      setFilterText('');
      setTestResult(null);
      setTestError(null);
      if (message?.query) {
        setTestQuery(message.query);
      }
    }
  }, [isOpen, message]);

  // Effective diagnostic entry: prefer manual test result if run, otherwise message diagnostics
  const diagnostics: SearchDiagnosticsData = useMemo(() => {
    if (testResult) return testResult;

    if (message?.searchDiagnostics) {
      return message.searchDiagnostics;
    }

    // Build synthetic diagnostic from message metadata if dedicated diagnostics object is not attached
    const fallbackSources = message?.groundingSources || message?.sources || [];
    const rawItems: RawSearchItem[] = fallbackSources.map((s, idx) => ({
      title: s.title || `Live Source #${idx + 1}`,
      url: s.url || '',
      snippet: s.title || s.url || 'Live search citation retrieved from web.'
    }));

    return {
      query: message?.query || 'Live Search Query',
      provider: message?.searchProvider || (fallbackSources.length > 0 ? 'googleSearch' : 'none'),
      status: fallbackSources.length > 0 ? 'success' : 'failed',
      rawMetadata: {
        titles: rawItems.map(i => i.title),
        snippets: rawItems.map(i => i.snippet),
        urls: rawItems.map(i => i.url),
        items: rawItems
      },
      aiResponseText: message?.text || '',
      geminiGroundingInput: {
        model: message?.model || 'gemini-2.5-flash',
        toolsConfigured: [{ googleSearch: {} }],
        injectedSnippets: rawItems.map(i => `${i.title} (${i.url})`),
        candidateChunksCount: rawItems.length
      }
    };
  }, [message, testResult]);

  const rawItems: RawSearchItem[] = useMemo(() => {
    if (diagnostics.rawMetadata?.items && diagnostics.rawMetadata.items.length > 0) {
      return diagnostics.rawMetadata.items;
    }
    if (diagnostics.tavilyApiResponse?.results && diagnostics.tavilyApiResponse.results.length > 0) {
      return diagnostics.tavilyApiResponse.results;
    }
    const titles = diagnostics.rawMetadata?.titles || [];
    const urls = diagnostics.rawMetadata?.urls || [];
    const snippets = diagnostics.rawMetadata?.snippets || [];
    const length = Math.max(titles.length, urls.length, snippets.length);
    const items: RawSearchItem[] = [];
    for (let i = 0; i < length; i++) {
      items.push({
        title: titles[i] || urls[i] || `Source #${i + 1}`,
        url: urls[i] || '',
        snippet: snippets[i] || ''
      });
    }
    return items;
  }, [diagnostics]);

  // Filtered search metadata items
  const filteredItems = useMemo(() => {
    if (!filterText.trim()) return rawItems;
    const q = filterText.toLowerCase();
    return rawItems.filter(item => 
      item.title.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q) ||
      item.snippet.toLowerCase().includes(q)
    );
  }, [rawItems, filterText]);

  // Copy helper
  const handleCopy = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Run live test search query
  const handleRunLiveTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = testQuery.trim() || diagnostics.query || 'latest news';
    setIsTesting(true);
    setTestError(null);

    try {
      const res = await fetch('/api/search/diagnostics/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (data.success && data.diagnostic) {
        setTestResult(data.diagnostic);
      } else {
        setTestError(data.error || 'Diagnostic test search failed');
      }
    } catch (err: any) {
      setTestError(err.message || 'Connection error during test search');
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  const finalAiText = diagnostics.aiResponseText || message?.text || '';
  const providerLabel = diagnostics.provider === 'tavily' 
    ? 'Tavily Search API' 
    : (diagnostics.provider === 'googleSearch' ? 'Google Search Grounding' : 'Live Web Grounding');

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-inspector-title"
    >
      <div 
        className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-[#0b0f17] border border-cyan-500/30 rounded-2xl shadow-[0_12px_48px_rgba(6,182,212,0.18)] overflow-hidden text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#0d1424] flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="search-inspector-title" className="text-base sm:text-lg font-semibold text-white tracking-tight">
                  Search Inspector
                </h2>
                <span className="text-xs text-cyan-300 font-mono">·</span>
                <span className="text-xs text-cyan-300 font-medium">{providerLabel}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Query: &ldquo;{diagnostics.query || 'Current Inquiry'}&rdquo;</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{rawItems.length} retrieved items</span>
                {diagnostics.executionTimeMs ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{diagnostics.executionTimeMs}ms latency</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopy(JSON.stringify(diagnostics, null, 2), 'all_diagnostics')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center gap-1.5"
              title="Copy entire raw diagnostics JSON"
            >
              {copiedSection === 'all_diagnostics' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied JSON</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Full JSON</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close inspector modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Test Query Bar */}
        <div className="px-5 py-2.5 bg-[#090d15] border-b border-white/5 flex items-center justify-between gap-3 flex-wrap">
          <form onSubmit={handleRunLiveTest} className="flex-1 min-w-[260px] flex items-center gap-2">
            <span className="text-xs text-gray-400 shrink-0">Test Live Search:</span>
            <div className="relative flex-1">
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Enter query to inspect live retrieval (e.g. Apple stock, 2026 Nobel Prize)..."
                className="w-full bg-[#131b2e] border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" />
            </div>
            <button
              type="submit"
              disabled={isTesting}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Retrieving...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Run Live Retrieval</span>
                </>
              )}
            </button>
          </form>

          {testError && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {testError}
            </span>
          )}
        </div>

        {/* Main Content Viewport: Side-by-Side Comparison */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/10 overflow-hidden">
          
          {/* Left Column: Raw Search Metadata & Grounding Input */}
          <div className="flex flex-col h-full min-h-0 bg-[#080d17]/50">
            {/* Sub-tabs header */}
            <div className="px-5 py-3 border-b border-white/10 bg-[#0b101c] flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-black/40 rounded-lg border border-white/5">
                <button
                  onClick={() => setActiveTab('metadata')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'metadata'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Raw Metadata ({rawItems.length})
                </button>
                <button
                  onClick={() => setActiveTab('tavily')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'tavily'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Full Tavily Response
                </button>
                <button
                  onClick={() => setActiveTab('grounding')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'grounding'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Gemini Grounding Input
                </button>
              </div>

              {activeTab === 'metadata' && (
                <div className="relative min-w-[140px] max-w-[200px]">
                  <input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Filter snippets..."
                    className="w-full bg-[#111827] border border-white/10 rounded-md pl-7 pr-2 py-1 text-[11.5px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                  />
                  <Search className="w-3 h-3 text-gray-500 absolute left-2 top-2" />
                </div>
              )}
            </div>

            {/* Sub-tab view contents */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              
              {/* TAB 1: Raw Search Metadata (Titles, Snippets, URLs) */}
              {activeTab === 'metadata' && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                    <span>Retrieved Search Results (Titles, Excerpts & URLs)</span>
                    <span className="font-mono tabular-nums">{filteredItems.length} of {rawItems.length}</span>
                  </div>

                  {filteredItems.length === 0 ? (
                    <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-white/5 text-gray-400 text-xs">
                      {rawItems.length === 0 
                        ? 'No raw search metadata recorded for this entry. Click "Run Live Retrieval" above to execute an on-demand test.'
                        : 'No snippets matched your search filter.'}
                    </div>
                  ) : (
                    filteredItems.map((item, idx) => (
                      <div 
                        key={idx}
                        className="p-3.5 rounded-xl bg-[#0e1628] border border-white/10 hover:border-cyan-500/40 transition-colors space-y-2 group"
                      >
                        {/* Title and score */}
                        <div className="flex items-start justify-between gap-2">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs sm:text-sm font-semibold text-cyan-200 hover:text-white transition-colors flex items-center gap-1.5 group-hover:underline"
                          >
                            <span>{item.title || 'Untitled Source'}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          </a>

                          {item.score !== undefined && (
                            <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shrink-0">
                              score: {(item.score * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>

                        {/* URL Bar */}
                        <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400 font-mono bg-black/30 px-2.5 py-1 rounded border border-white/5">
                          <span className="truncate max-w-[360px]">{item.url}</span>
                          <button
                            onClick={() => handleCopy(item.url, `url-${idx}`)}
                            className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 shrink-0"
                            title="Copy source URL"
                          >
                            {copiedSection === `url-${idx}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>

                        {/* Raw Snippet Content */}
                        <div className="text-xs text-gray-300 leading-relaxed bg-[#0b101c] p-2.5 rounded-lg border border-white/5 font-sans">
                          {item.snippet ? (
                            <p className="whitespace-pre-line">{item.snippet}</p>
                          ) : (
                            <span className="text-gray-500 italic">No text excerpt provided</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 2: Full Tavily API Response (Raw JSON) */}
              {activeTab === 'tavily' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Full Raw Tavily Search API Payload</span>
                    <button
                      onClick={() => handleCopy(JSON.stringify(diagnostics.tavilyApiResponse || diagnostics.rawMetadata, null, 2), 'tavily_raw')}
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                    >
                      {copiedSection === 'tavily_raw' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Payload</span>
                        </>
                      )}
                    </button>
                  </div>

                  {diagnostics.tavilyApiResponse ? (
                    <div className="space-y-3">
                      {diagnostics.tavilyApiResponse.answer && (
                        <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/20">
                          <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider block mb-1">
                            Tavily Direct Synthesized Answer
                          </span>
                          <p className="text-xs text-gray-200">{diagnostics.tavilyApiResponse.answer}</p>
                        </div>
                      )}

                      <pre className="p-4 rounded-xl bg-[#080c14] border border-white/10 text-[11.5px] font-mono text-cyan-200/90 overflow-x-auto leading-relaxed max-h-[500px]">
                        {JSON.stringify(diagnostics.tavilyApiResponse, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-gray-400 space-y-2">
                      <p className="font-medium text-gray-300">No raw Tavily API response recorded for this specific turn.</p>
                      <p>
                        This query used native Google Search Grounding with Gemini 2.5 Flash, or Tavily key is configured via fallback.
                        You can test live Tavily retrieval by clicking &ldquo;Run Live Retrieval&rdquo; in the search bar above.
                      </p>
                      <pre className="mt-3 p-3 rounded bg-black/40 border border-white/5 font-mono text-[11px] text-gray-300 overflow-x-auto">
                        {JSON.stringify(diagnostics.rawMetadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Subsequent Gemini Grounding Input */}
              {activeTab === 'grounding' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Input Context & Evidence Passed to Gemini Model</span>
                    <button
                      onClick={() => handleCopy(JSON.stringify(diagnostics.geminiGroundingInput || {}, null, 2), 'gemini_input')}
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                    >
                      {copiedSection === 'gemini_input' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Input JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  {diagnostics.geminiGroundingInput ? (
                    <div className="space-y-3">
                      {/* Model & Config Summary */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-[#0e1628] border border-white/5">
                          <span className="text-gray-400 block text-[11px]">Model Target</span>
                          <span className="font-mono text-cyan-300 font-semibold">{diagnostics.geminiGroundingInput.model || 'gemini-2.5-flash'}</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-[#0e1628] border border-white/5">
                          <span className="text-gray-400 block text-[11px]">Search Tool Enabled</span>
                          <span className="font-mono text-emerald-400 font-semibold">googleSearch: &#123;&#125;</span>
                        </div>
                      </div>

                      {/* Injected Snippets / Evidence */}
                      {diagnostics.geminiGroundingInput.injectedSnippets && diagnostics.geminiGroundingInput.injectedSnippets.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-[#0b101c] border border-white/10 space-y-2">
                          <span className="text-xs font-semibold text-gray-200 block">
                            Grounding Chunks Injected ({diagnostics.geminiGroundingInput.injectedSnippets.length})
                          </span>
                          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                            {diagnostics.geminiGroundingInput.injectedSnippets.map((snippet, sIdx) => (
                              <div key={sIdx} className="text-[11.5px] p-2 rounded bg-black/40 border border-white/5 font-mono text-gray-300 whitespace-pre-wrap">
                                {snippet}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* System Instruction */}
                      {diagnostics.geminiGroundingInput.systemInstruction && (
                        <div className="p-3.5 rounded-xl bg-[#0b101c] border border-white/10 space-y-1">
                          <span className="text-xs font-semibold text-gray-200 block">Grounding Directive Instruction</span>
                          <p className="text-[11.5px] text-gray-300 font-mono whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto">
                            {diagnostics.geminiGroundingInput.systemInstruction}
                          </p>
                        </div>
                      )}

                      <pre className="p-3 rounded-xl bg-[#080c14] border border-white/10 text-[11px] font-mono text-gray-300 overflow-x-auto">
                        {JSON.stringify(diagnostics.geminiGroundingInput, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-gray-400">
                      No subsequent Gemini grounding input was captured for this entry.
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Right Column: Final AI Response (Live Verification Side-by-Side) */}
          <div className="flex flex-col h-full min-h-0 bg-[#0b0f17]">
            {/* Header */}
            <div className="px-5 py-3 border-b border-white/10 bg-[#0d1424] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs sm:text-sm font-semibold text-white">Final AI Response</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                  Live Grounded
                </span>
                <button
                  onClick={() => handleCopy(finalAiText, 'final_ai_text')}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1 font-medium transition-colors"
                  title="Copy AI response"
                >
                  {copiedSection === 'final_ai_text' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Answer</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* AI Text Display Viewport */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {finalAiText ? (
                <div className="prose prose-invert max-w-none text-xs sm:text-sm leading-relaxed text-gray-200">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-base font-bold text-white mt-3 mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-sm font-bold text-white mt-3 mb-1.5">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-xs sm:text-sm font-semibold text-cyan-200 mt-2.5 mb-1">{children}</h3>,
                      p: ({ children }) => <p className="mb-2.5 text-gray-300 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2.5 space-y-1 text-gray-300">{children}</ul>,
                      li: ({ children }) => <li>{children}</li>,
                      code: ({ inline, children }: any) => inline ? (
                        <code className="px-1 py-0.5 rounded bg-white/10 text-cyan-300 font-mono text-[12px]">{children}</code>
                      ) : (
                        <code className="block p-3 rounded-lg bg-black/40 border border-white/5 font-mono text-[11.5px] overflow-x-auto text-gray-200 my-2">{children}</code>
                      )
                    }}
                  >
                    {finalAiText}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-white/5 text-gray-400 text-xs">
                  No final AI response recorded for this message.
                </div>
              )}

              {/* Verified Sources Reference list on bottom of right column */}
              {rawItems.length > 0 && (
                <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
                  <span className="text-xs font-semibold text-cyan-200 block">
                    Verified Citations In Answer ({rawItems.length})
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {rawItems.slice(0, 6).map((src, idx) => (
                      <a
                        key={idx}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-white/[0.03] hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/30 text-[11.5px] text-gray-300 hover:text-white flex items-center justify-between transition-colors"
                      >
                        <span className="truncate pr-2 font-medium">{src.title}</span>
                        <ExternalLink className="w-3 h-3 text-cyan-400 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#090d15] flex items-center justify-between text-xs text-gray-400 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Search Inspector Active · Verified Live Web Grounding</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium transition-colors cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
