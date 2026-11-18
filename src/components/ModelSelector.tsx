import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Cpu, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface AIModelOption {
  id: string;
  name: string;
  badge?: string;
  description: string;
  brand: 'auto' | 'gemini' | 'claude' | 'deepseek' | 'openai' | 'meta' | 'qwen' | 'mistral' | 'nvidia' | 'google';
  category: 'recommended' | 'reasoning' | 'coding' | 'fast' | 'all';
  isFree?: boolean;
}

export const AI_MODELS: AIModelOption[] = [
  {
    id: 'auto',
    name: 'Auto (Recommended)',
    badge: 'SMART ROUTE',
    brand: 'auto',
    category: 'recommended',
    isFree: true,
    description: 'Automatically routes to the fastest, highest quality model available with fallback protection.'
  },
  {
    id: 'openrouter/free',
    name: 'OpenRouter Router',
    badge: 'ROUTER',
    brand: 'auto',
    category: 'recommended',
    isFree: true,
    description: 'Dynamic router selecting from all active models on OpenRouter.'
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (Google Search)',
    badge: 'GOOGLE SEARCH',
    brand: 'gemini',
    category: 'recommended',
    isFree: true,
    description: 'Next-gen multimodal reasoning engine with active real-time Google Search grounding by Google.'
  },
  {
    id: 'gemini-3-1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    badge: 'ULTRA FAST',
    brand: 'gemini',
    category: 'fast',
    isFree: true,
    description: 'Ultra-low latency next-generation Google model with strong multimodal comprehension.'
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA Nemotron 3.5',
    badge: 'NVIDIA',
    brand: 'nvidia',
    category: 'recommended',
    isFree: true,
    description: 'High-speed instruction following and reasoning model by NVIDIA.'
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google Gemma 4 31B',
    badge: 'GEMMA 4',
    brand: 'google',
    category: 'recommended',
    isFree: true,
    description: 'Next-gen open-weights instruction-tuned model by Google.'
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Google Gemma 4 26B',
    badge: 'GEMMA',
    brand: 'google',
    category: 'fast',
    isFree: true,
    description: 'High-accuracy, efficient open weights model by Google.'
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA Nemotron 3 Ultra 550B',
    badge: 'POWER 550B',
    brand: 'nvidia',
    category: 'reasoning',
    isFree: true,
    description: 'Massive parameter enterprise reasoning engine by NVIDIA.'
  },
  {
    id: 'liquid/lfm-2.5-2.6b:free',
    name: 'Liquid LFM 2.5',
    badge: 'ULTRA FAST',
    brand: 'auto',
    category: 'fast',
    isFree: true,
    description: 'Liquid Neural Network lightweight edge model for rapid responses.'
  },
  {
    id: 'cohere/north-mini-code:free',
    name: 'Cohere North Mini Code',
    badge: 'DEV CODE',
    brand: 'auto',
    category: 'coding',
    isFree: true,
    description: 'Specialized code generation, debugging, and software engineering powerhouse.'
  }
];

export function BrandIcon({ brand, className = "w-4 h-4" }: { brand: string; className?: string }) {
  switch (brand) {
    case 'gemini':
    case 'google':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4771 12 22C12 16.4771 16.4771 12 22 12C16.4771 12 12 7.52285 12 2Z"
            fill="url(#gemini-selector-grad)"
          />
          <defs>
            <linearGradient id="gemini-selector-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1E88E5" />
              <stop offset="0.5" stopColor="#8E24AA" />
              <stop offset="1" stopColor="#D81B60" />
            </linearGradient>
          </defs>
        </svg>
      );
    case 'claude':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M17.02 3.5h-3.41L7.1 20.5h3.41l1.37-3.45h6.3l1.37 3.45h3.41L17.02 3.5zm-3.9 10.95l2.25-5.65 2.25 5.65h-4.5z"
            fill="#D97706"
          />
          <path
            d="M3.5 20.5h3.41L13.43 3.5h-3.41L3.5 20.5z"
            fill="#F59E0B"
            opacity="0.75"
          />
        </svg>
      );
    case 'deepseek':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
            fill="url(#deepseek-selector-grad)"
          />
          <circle cx="12" cy="12" r="3" fill="#06B6D4" />
          <defs>
            <linearGradient id="deepseek-selector-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0ea5e9" />
              <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
          </defs>
        </svg>
      );
    case 'openai':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.535-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 8.8256a4.485 4.485 0 0 1 2.3655-1.9728V12.4a.7854.7854 0 0 0 .388.6813l5.8143 3.3543-2.02 1.1686a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3408 8.8256zm16.0963 3.8558l-5.838-3.3685 2.02-1.1686a.0757.0757 0 0 1 .071 0l4.8303 2.7866a4.4992 4.4992 0 0 1-.6768 8.1042v-5.6772a.79.79 0 0 0-.4065-.6765zm2.0107-3.0231l-.142-.0852-4.7735-2.7582a.7712.7712 0 0 0-.7806 0l-5.8428 3.3685V7.851a.0804.0804 0 0 1 .0332-.0615l4.8019-2.7724a4.4992 4.4992 0 0 1 6.6758 4.6602zM8.3061 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.052V6.0646a4.4992 4.4992 0 0 1 7.3757-3.4537l-.1419.0804-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813v6.7322zm1.0982-1.968l2.5938-1.4958 2.5938 1.4958v2.9916l-2.5938 1.4958-2.5938-1.4958v-2.9916z"/>
        </svg>
      );
    case 'meta':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M17.1 5.2C15.2 5.2 13.5 6.4 12 8C10.5 6.4 8.8 5.2 6.9 5.2 3.8 5.2 1.5 7.7 1.5 11c0 3.9 3.5 8.2 9.2 12.3.8.6 1.8.6 2.6 0 5.7-4.1 9.2-8.4 9.2-12.3 0-3.3-2.3-5.8-5.4-5.8z"
            fill="url(#meta-selector-grad)"
          />
          <defs>
            <linearGradient id="meta-selector-grad" x1="1.5" y1="5.2" x2="22.5" y2="23.3" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0081FB" />
              <stop offset="1" stopColor="#00C6FF" />
            </linearGradient>
          </defs>
        </svg>
      );
    case 'qwen':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <rect x="3" y="3" width="18" height="18" rx="5" fill="url(#qwen-selector-grad)" />
          <path d="M8 8h8v8H8z" fill="#FFF" opacity="0.9" />
          <defs>
            <linearGradient id="qwen-selector-grad" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7C3AED" />
              <stop offset="1" stopColor="#2563EB" />
            </linearGradient>
          </defs>
        </svg>
      );
    case 'mistral':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M3 4h4v4H3V4zm7 0h4v4h-4V4zm7 0h4v4h-4V4zM3 11h4v4H3v-4zm7 0h4v4h-4v-4zm7 0h4v4h-4v-4zM3 18h4v4H3v-4zm7 0h4v4h-4v-4zm7 0h4v4h-4v-4z" fill="#FF5E00" />
        </svg>
      );
    case 'nvidia':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.8 14.5c-1.3.8-2.7 1-4.2.7-2.3-.5-3.9-2.3-4-4.7-.1-2.6 1.8-4.9 4.4-5.2 1.4-.2 2.8.2 3.9 1 .3.2.4.6.2.9-.2.3-.6.4-.9.2-.9-.7-2-1-3.2-.8-2.1.3-3.6 2.1-3.5 4.3.1 2 1.4 3.5 3.3 3.9 1.2.3 2.4.1 3.4-.5.3-.2.7-.1.9.2.2.3.1.7-.2.9z" fill="#76B900" />
        </svg>
      );
    case 'microsoft':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <rect x="2" y="2" width="9" height="9" fill="#F25022" rx="1" />
          <rect x="13" y="2" width="9" height="9" fill="#7FBA00" rx="1" />
          <rect x="2" y="13" width="9" height="9" fill="#00A4EF" rx="1" />
          <rect x="13" y="13" width="9" height="9" fill="#FFB900" rx="1" />
        </svg>
      );
    case 'auto':
    default:
      return <Sparkles className={`${className} text-brand-blue`} />;
  }
}

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ selectedModel, onSelectModel, disabled }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<AIModelOption[]>(AI_MODELS);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'recommended' | 'reasoning' | 'coding' | 'fast'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamically fetch all active free OpenRouter models from backend catalog
  useEffect(() => {
    let isMounted = true;
    async function loadModels() {
      try {
        setIsLoadingModels(true);
        const res = await fetch('/api/models');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.models) && data.models.length > 0) {
            if (isMounted) {
              setModels(data.models);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load dynamic model list:', e);
      } finally {
        if (isMounted) {
          setIsLoadingModels(false);
        }
      }
    }
    loadModels();
    return () => {
      isMounted = false;
    };
  }, []);

  const currentOption = models.find(m => m.id === selectedModel) || {
    id: selectedModel,
    name: selectedModel === 'auto'
      ? 'Auto (Recommended)'
      : selectedModel
          .replace(/:\s*free\b/gi, '')
          .replace(/\s*\(\s*free\s*\)/gi, '')
          .replace(/\bfree\b/gi, '')
          .replace(/^(google|meta-llama|deepseek|qwen|mistralai|nvidia|microsoft)\//i, '')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase())
          .trim(),
    badge: selectedModel === 'auto' ? 'SMART' : undefined,
    brand: selectedModel.includes('deepseek') ? 'deepseek' : (selectedModel.includes('llama') ? 'meta' : (selectedModel.includes('gemini') ? 'gemini' : (selectedModel.includes('qwen') ? 'qwen' : 'auto'))),
    category: 'recommended',
    description: 'Selected AI Model'
  } as AIModelOption;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredModels = models.filter(model => {
    const matchesSearch = model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          model.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          model.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (model.badge && model.badge.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || model.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#0e1422]/90 hover:bg-[#141c2f] border border-white/10 hover:border-brand-blue/40 rounded-xl transition-all shadow-md text-xs font-semibold text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed group"
      >
        <div className="flex-shrink-0 flex items-center justify-center group-hover:scale-110 transition-transform">
          <BrandIcon brand={currentOption.brand} className="w-4 h-4" />
        </div>
        <span className="font-semibold tracking-tight max-w-[130px] sm:max-w-[180px] truncate text-[13px]">{currentOption.name}</span>
        {currentOption.badge && (
          <span className="hidden xs:inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded">
            {currentOption.badge}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-80 sm:w-96 bg-[#0f1422] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-white/5"
          >
            {/* Header with Title and Model Count */}
            <div className="px-4 py-2.5 bg-white/[0.02] flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-brand-blue" /> AI Model Fleet ({models.length})
              </span>
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase">
                Active Tier
              </span>
            </div>

            {/* Search Input Bar */}
            <div className="p-2 bg-black/20">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models (DeepSeek, Llama, Qwen, Gemma...)"
                className="w-full px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-blue/50"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 px-3 py-1.5 bg-white/[0.01] overflow-x-auto custom-scrollbar text-[10px] font-semibold">
              {(['all', 'recommended', 'reasoning', 'coding', 'fast'] as const).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded-lg capitalize whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-brand-blue text-white shadow-sm font-bold'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Model List */}
            <div className="py-1 max-h-80 overflow-y-auto custom-scrollbar divide-y divide-white/[0.02]">
              {filteredModels.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-500">
                  No models match your search.
                </div>
              ) : (
                filteredModels.map((model) => {
                  const isSelected = model.id === selectedModel;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onSelectModel(model.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-brand-blue/15 text-white' : 'hover:bg-white/5 text-gray-300'
                      }`}
                    >
                      <div className="pt-0.5 flex-shrink-0 flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-brand-blue bg-brand-blue text-white' : 'border-gray-600'
                        }`}>
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center p-1">
                          <BrandIcon brand={model.brand} className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-bold truncate text-white">{model.name}</span>
                          {model.badge && (
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0 ${
                              isSelected
                                ? 'bg-brand-blue text-white'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            }`}>
                              {model.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug line-clamp-2">
                          {model.description}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

