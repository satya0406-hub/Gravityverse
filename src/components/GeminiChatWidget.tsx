import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  Maximize2, 
  Copy, 
  Check, 
  Loader2, 
  ChevronDown, 
  Radio,
  ExternalLink,
  MessageSquare,
  Bot,
  Globe
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../lib/AuthContext';
import { cn, getAssetPath, getApiBaseUrl } from '../lib/utils';
import { 
  speakText, 
  stopSpeaking, 
  cleanMarkdownForSpeech, 
  isSpeechSynthesisSupported,
  isSpeechRecognitionSupported,
  createSpeechRecognition 
} from '../lib/speechUtils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  sources?: Array<{ title?: string; url?: string }>;
  isError?: boolean;
}

const DEFAULT_SUGGESTIONS = [
  { label: "🎓 SRM Exam Preparation Tips", prompt: "What are the best strategies to prepare for SRM university semester exams?" },
  { label: "📊 Target 9.0+ CGPA Plan", prompt: "How should I plan my study hours and internal marks to achieve a 9.0+ CGPA?" },
  { label: "🚀 Tech & Coding Advice", prompt: "Can you explain the difference between REST and GraphQL with simple examples?" },
  { label: "📅 SRM Campus Highlights", prompt: "What are the key technical and cultural festivals at SRM Institute of Science and Technology?" }
];

export function GeminiChatWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLiveSearching, setIsLiveSearching] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, loading]);

  // Clean up speech synthesis and recognition on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSpeak = (id: string, text: string) => {
    if (currentlySpeakingId === id) {
      stopSpeaking();
      setCurrentlySpeakingId(null);
      return;
    }

    setCurrentlySpeakingId(id);
    speakText(text, {
      onEnd: () => setCurrentlySpeakingId(null),
      onError: () => setCurrentlySpeakingId(null)
    });
  };

  const handleStopSpeaking = () => {
    stopSpeaking();
    setCurrentlySpeakingId(null);
  };

  const startVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setErrorNotice("Speech recognition is not supported in this browser.");
      setTimeout(() => setErrorNotice(null), 4000);
      return;
    }

    const recognition = createSpeechRecognition();
    if (!recognition) return;

    recognition.onstart = () => {
      setIsListening(true);
      setErrorNotice(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        finalTranscript += event.results[i][0].transcript;
      }
      if (finalTranscript) {
        setInput(prev => {
          const trimmed = prev.trim();
          return trimmed ? `${trimmed} ${finalTranscript}` : finalTranscript;
        });
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  const handleClearChat = () => {
    stopSpeaking();
    setCurrentlySpeakingId(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setStreamingText('');
    setLoading(false);
  };

  const handleExpandToFullPage = () => {
    stopSpeaking();
    setIsOpen(false);
    navigate('/chat');
  };

  const sendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    // Stop ongoing speech
    stopSpeaking();
    setCurrentlySpeakingId(null);

    // Stop listening if active
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setIsLiveSearching(true);
    setStreamingText('');
    setErrorNotice(null);

    // Prepare multi-turn history payload for Gemini API, filtering out any corrupt messages
    const historyPayload = newMessages
      .filter(m => m.text && !m.text.includes('[object Object]'))
      .map(m => ({
        role: m.role,
        content: typeof m.text === 'string' ? m.text : String(m.text || '')
      }));

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Build authorization header if user is logged in
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      };

      if (user) {
        try {
          const token = await user.getIdToken();
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        } catch (tokenErr) {
          console.warn("Token fetch failed:", tokenErr);
        }
      }

      const response = await fetch(`${getApiBaseUrl()}/api/chat`, {
        method: 'POST',
        headers,
        signal: abortController.signal,
        body: JSON.stringify({
          prompt: query,
          messages: historyPayload,
          stream: true,
          webSearch: true,
          forceWebSearch: true,
          model: 'auto'
        })
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => null);
        throw new Error(errorJson?.error || `Server returned ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let accumulatedText = '';
      let streamSources: any[] = [];
      let completionText = '';

      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        const parseSseLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) return;
          if (trimmed === 'data: [DONE]' || trimmed === 'data:[DONE]') return;

          let jsonStr = '';
          if (trimmed.startsWith('data: ')) {
            jsonStr = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            jsonStr = trimmed.slice(5).trim();
          } else {
            return;
          }

          if (jsonStr === '[DONE]') return;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === 'error' && data.error) {
              throw new Error(data.error);
            }

            if (data.type === 'search_status') {
              setIsLiveSearching(Boolean(data.isSearching));
            }

            // Safely extract string delta from chunk object or string
            let deltaText = '';
            if (typeof data.delta === 'string') {
              deltaText = data.delta;
            } else if (typeof data.chunk === 'string') {
              deltaText = data.chunk;
            } else if (data.chunk && typeof data.chunk === 'object') {
              deltaText = data.chunk.delta || data.chunk.text || '';
            }

            if (deltaText) {
              setIsLiveSearching(false);
              accumulatedText += deltaText;
              setStreamingText(accumulatedText);
            }

            // Capture completion or full text if provided
            if (data.type === 'done') {
              setIsLiveSearching(false);
              if (typeof data.text === 'string' && data.text) {
                completionText = data.text;
              }
            } else if (!accumulatedText && typeof data.text === 'string' && data.text) {
              completionText = data.text;
            }

            const incomingSources = data.groundingSources || data.sources || data.chunk?.groundingSources || data.chunk?.sources;
            if (incomingSources && Array.isArray(incomingSources) && incomingSources.length > 0) {
              streamSources = incomingSources;
            }
          } catch (e: any) {
            if (e.message && (e.message.includes('unavailable') || e.message.includes('error') || e.message.includes('quota') || e.message.includes('rate limit'))) {
              throw e;
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            parseSseLine(line);
          }
        }

        // Process any remainder in buffer
        if (buffer.trim()) {
          const remainingLines = buffer.split('\n');
          for (const line of remainingLines) {
            parseSseLine(line);
          }
        }
      } else {
        // Direct JSON response handling
        const resJson = await response.json();
        if (resJson.error) {
          throw new Error(resJson.error);
        }
        accumulatedText = resJson.text || '';
        completionText = resJson.text || '';
        streamSources = resJson.groundingSources || resJson.sources || [];
      }

      let finalText = (accumulatedText.trim() || completionText.trim()).replaceAll('[object Object]', '').trim();
      if (!finalText) {
        throw new Error("No response received from Gemini AI. Please try asking again.");
      }

      const assistantMessageId = `asst-${Date.now()}`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        text: finalText,
        timestamp: new Date(),
        sources: streamSources.length > 0 ? streamSources : undefined
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamingText('');

      // If Voice Mode is active, automatically speak the Gemini response!
      if (voiceModeActive) {
        setCurrentlySpeakingId(assistantMessageId);
        speakText(finalText, {
          onEnd: () => setCurrentlySpeakingId(null),
          onError: () => setCurrentlySpeakingId(null)
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("Chat request cancelled by user.");
      } else {
        console.error("Chat error:", err);
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: err?.message || "I experienced a temporary connection issue. Please check your internet or try asking again.",
          timestamp: new Date(),
          isError: true
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      setLoading(false);
      setIsLiveSearching(false);
      setStreamingText('');
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Action Button (Launcher) */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 pointer-events-auto">
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="relative group"
            >
              {/* Outer pulsing glow aura - non-interactive */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 rounded-full blur-md opacity-75 group-hover:opacity-100 animate-pulse transition duration-500 pointer-events-none" />
              
              <button
                onClick={() => setIsOpen(true)}
                className="relative flex items-center gap-2 p-2.5 sm:px-3.5 sm:py-2.5 bg-[#0d1322]/95 hover:bg-[#12192e] text-white rounded-full shadow-2xl border border-blue-500/40 group-hover:border-blue-400 transition-all duration-300 cursor-pointer backdrop-blur-md"
                aria-label="Open Gemini Chatbot"
                title="Chat with Gemini AI"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-brand-blue to-cyan-400 flex items-center justify-center shadow-inner shrink-0">
                  <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white animate-spin-slow" />
                </div>
                
                <div className="hidden md:flex flex-col items-start text-left pr-1">
                  <span className="text-xs font-bold tracking-wide uppercase text-white flex items-center gap-1.5">
                    Gemini AI
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                  </span>
                  <span className="text-[10px] text-blue-200/80 font-medium">Assistant</span>
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Chat Drawer / Popup Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[420px] h-[600px] max-h-[calc(100vh-2.5rem)] flex flex-col bg-[#0b101d]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-blue-950/60 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-[#0d1424]/90 border-b border-white/10 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-blue to-purple-600 flex items-center justify-center shadow-md border border-white/10">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-white tracking-tight">Gemini AI</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-brand-blue/20 text-blue-300 border border-brand-blue/30">
                      Google Grounded
                    </span>
                    {isLiveSearching ? (
                      <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 flex items-center gap-1.5 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.4)]" title="Actively performing live search for current information...">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400"></span>
                        </span>
                        <Globe className="w-2.5 h-2.5 text-cyan-300 animate-spin" />
                        Live Searching...
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1" title="Google Search Grounding Active">
                        <Globe className="w-2.5 h-2.5 text-cyan-400" />
                        Search
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    Online & Google Grounded
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Voice Mode Toggle (Auto-speech response) */}
                <button
                  onClick={() => setVoiceModeActive(prev => !prev)}
                  className={cn(
                    "p-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border",
                    voiceModeActive 
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/40" 
                      : "text-gray-400 hover:text-white hover:bg-white/5 border-transparent"
                  )}
                  title={voiceModeActive ? "Voice Mode ON: Gemini will speak replies" : "Voice Mode OFF: Silent text mode"}
                >
                  {voiceModeActive ? <Volume2 className="w-3.5 h-3.5 text-blue-400" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span className="text-[10px] hidden xs:inline">{voiceModeActive ? "Voice ON" : "Voice"}</span>
                </button>

                {/* Reset Chat */}
                <button
                  onClick={handleClearChat}
                  disabled={messages.length === 0 && !streamingText}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40"
                  title="Clear conversation"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                {/* Expand to full page */}
                <button
                  onClick={handleExpandToFullPage}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  title="Open full screen chat page"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                {/* Close Button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  title="Close widget"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Currently Speaking Notification Banner */}
            {currentlySpeakingId && (
              <div className="px-3 py-1.5 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between text-xs text-blue-300 animate-pulse">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-blue-400 animate-bounce" />
                  <span className="text-[11px] font-medium">Gemini is reading response aloud...</span>
                </div>
                <button
                  onClick={handleStopSpeaking}
                  className="text-[10px] font-bold uppercase tracking-wider text-blue-400 hover:text-white bg-blue-500/20 hover:bg-blue-500/30 px-2 py-0.5 rounded transition-colors"
                >
                  Stop Audio
                </button>
              </div>
            )}

            {/* Error Notification */}
            {errorNotice && (
              <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300">
                {errorNotice}
              </div>
            )}

            {/* Chat Body (Messages / Starter) */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar"
            >
              {messages.length === 0 && !streamingText ? (
                /* Welcome Starter View */
                <div className="h-full flex flex-col justify-center items-center text-center px-2 py-4 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-blue/20 to-purple-600/20 border border-brand-blue/30 flex items-center justify-center shadow-lg">
                    <Bot className="w-6 h-6 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Gravityverse Copilot
                    </h3>
                    <p className="text-xs text-gray-400 max-w-[280px] mt-1 leading-relaxed">
                      Powered by Google Gemini. Ask questions, brainstorm concepts, or explore campus resources using voice or text.
                    </p>
                  </div>

                  {/* Suggestion Chips */}
                  <div className="w-full space-y-2 pt-2">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left pl-1">
                      Quick Suggestions
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {DEFAULT_SUGGESTIONS.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendMessage(s.prompt)}
                          className="w-full text-left px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-brand-blue/30 transition-all group"
                        >
                          <span className="text-xs text-gray-200 group-hover:text-white font-medium block truncate">
                            {s.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Multi-Turn Conversation Thread */
                <>
                  {messages.map((msg, i) => (
                    <div
                      key={msg.id || i}
                      className={cn(
                        "flex flex-col max-w-[88%]",
                        msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed selection:bg-brand-blue/30 shadow-sm",
                          msg.role === 'user'
                            ? "bg-brand-blue text-white rounded-br-none"
                            : msg.isError
                              ? "bg-red-500/10 border border-red-500/20 text-red-200 rounded-bl-none"
                              : "bg-[#141b2d] border border-white/10 text-gray-200 rounded-bl-none"
                        )}
                      >
                        {msg.role === 'user' ? (
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        ) : (
                          <div className="prose prose-invert prose-xs max-w-none">
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-gray-200">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc pl-4 my-1.5 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal pl-4 my-1.5 space-y-1">{children}</ol>,
                                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                                code: ({ node, inline, children, ...props }: any) => {
                                  return inline ? (
                                    <code className="px-1 py-0.5 rounded bg-white/10 text-blue-300 font-mono text-[11px]" {...props}>
                                      {children}
                                    </code>
                                  ) : (
                                    <code className="block bg-[#090d16] border border-white/10 rounded-lg p-2.5 my-1.5 overflow-x-auto text-[11px] font-mono text-gray-200" {...props}>
                                      {children}
                                    </code>
                                  );
                                }
                              }}
                            >
                              {msg.text}
                            </ReactMarkdown>

                            {/* Google Search Grounding Sources */}
                            {msg.sources && msg.sources.length > 0 && (
                              <div className="mt-2.5 pt-2 border-t border-white/10">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <Globe className="w-3 h-3 text-cyan-400" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                                    Google Search Sources ({msg.sources.length})
                                  </span>
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
                                    Live Grounded
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {msg.sources.map((src, sIdx) => {
                                    let displayTitle = src.title || src.url || 'Source';
                                    try {
                                      if (src.url && (displayTitle.startsWith('http') || displayTitle.length > 28)) {
                                        const parsed = new URL(src.url);
                                        displayTitle = parsed.hostname.replace('www.', '');
                                      }
                                    } catch {}
                                    return (
                                      <a
                                        key={sIdx}
                                        href={src.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[10px] text-cyan-300 hover:text-white border border-cyan-500/20 hover:border-cyan-400/40 transition-colors truncate max-w-[200px]"
                                        title={src.title || src.url}
                                      >
                                        <span className="truncate">{displayTitle}</span>
                                        <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action buttons on assistant message */}
                      {msg.role === 'assistant' && !msg.isError && (
                        <div className="flex items-center gap-1.5 mt-1 ml-1 text-gray-400">
                          <button
                            onClick={() => handleCopy(msg.id, msg.text)}
                            className="p-1 hover:text-white rounded hover:bg-white/5 transition-colors"
                            title="Copy response"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          
                          <button
                            onClick={() => handleSpeak(msg.id, msg.text)}
                            className={cn(
                              "p-1 rounded transition-colors",
                              currentlySpeakingId === msg.id 
                                ? "text-blue-400 bg-blue-500/20" 
                                : "hover:text-white hover:bg-white/5"
                            )}
                            title={currentlySpeakingId === msg.id ? "Stop speaking" : "Read aloud (Voice)"}
                          >
                            {currentlySpeakingId === msg.id ? (
                              <VolumeX className="w-3 h-3 animate-pulse" />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                          </button>

                          <span className="text-[10px] text-gray-500 ml-1">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Real-time Streaming message */}
                  {streamingText && (
                    <div className="flex flex-col max-w-[88%] mr-auto items-start">
                      <div className="rounded-2xl rounded-bl-none px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed bg-[#141b2d] border border-brand-blue/30 text-gray-200 shadow-sm">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Loader2 className="w-3 h-3 animate-spin text-brand-blue" />
                          <span className="text-[10px] font-semibold text-brand-blue uppercase tracking-wider">
                            Gemini Generating...
                          </span>
                        </div>
                        <div className="prose prose-invert prose-xs max-w-none">
                          <ReactMarkdown>{streamingText}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Loading indicator when waiting for stream start */}
                  {loading && !streamingText && (
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#141b2d] border border-cyan-500/20 text-gray-300 text-xs w-fit shadow-md">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-cyan-400 animate-pulse" />
                        <span className="text-gray-300">Searching Google & thinking...</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Listening Banner if Speech-to-text active */}
            {isListening && (
              <div className="px-3.5 py-2 bg-gradient-to-r from-red-500/20 via-blue-500/20 to-purple-500/20 border-t border-red-500/30 flex items-center justify-between text-xs text-white animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
                  <span className="font-semibold text-[11px]">Listening... speak clearly now</span>
                </div>
                <button
                  onClick={startVoiceInput}
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold"
                >
                  Done
                </button>
              </div>
            )}

            {/* Input Composer */}
            <div className="p-3 bg-[#0d1424] border-t border-white/10 flex-shrink-0">
              <div className="flex items-end gap-2 bg-[#121a2f] border border-white/10 rounded-xl p-1.5 focus-within:border-brand-blue/60 transition-all">
                {/* Voice Input Microphone Button */}
                <button
                  onClick={startVoiceInput}
                  className={cn(
                    "p-2 rounded-lg transition-all flex-shrink-0",
                    isListening 
                      ? "bg-red-500 text-white animate-bounce shadow-lg shadow-red-500/30" 
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                  title={isListening ? "Stop listening" : "Speak to Gemini (Voice Input)"}
                  aria-label="Speech to text"
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {/* Text Area */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? "Listening to your voice..." : "Ask Gemini a question..."}
                  rows={1}
                  className="flex-1 bg-transparent border-0 text-white placeholder-gray-400 text-xs sm:text-sm focus:outline-none resize-none max-h-24 py-1.5 custom-scrollbar"
                />

                {/* Send / Stop Button */}
                {loading ? (
                  <button
                    onClick={() => {
                      if (abortControllerRef.current) {
                        abortControllerRef.current.abort();
                      }
                      setLoading(false);
                    }}
                    className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex-shrink-0"
                    title="Stop generating"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim()}
                    className="p-2 rounded-lg bg-brand-blue hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-brand-blue text-white transition-all flex-shrink-0 shadow-md"
                    title="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              <div className="flex items-center justify-between px-1 pt-1.5 text-[10px] text-gray-500">
                <span>Shift + Enter for new line</span>
                <span className="flex items-center gap-1">
                  Powered by <span className="font-semibold text-gray-400">Gemini</span>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
