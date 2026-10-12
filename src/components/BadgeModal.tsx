import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  Award,
  X,
  ChevronRight,
  Loader2,
  Sparkles,
  Zap,
  CheckCircle2,
  Shield,
  Crown,
  Gem,
  Trophy,
  Compass,
  BookOpen,
  Activity,
  AlertCircle
} from 'lucide-react';
import { formatDate, getAssetPath } from '../lib/utils';
import { trackBadge } from '../lib/analytics';
import { getUnlockedBadgesCount, getHighestBadgeName } from '../lib/badgeUtils';
import { fetchUserBadgeHistory } from '../services/badgeHistoryService';
export { getUnlockedBadgesCount, getHighestBadgeName };

export interface BadgeRecord {
  id: string;
  badgeName: string;
  earnedAt?: any;
  unlockedAt?: any;
  pointsAtTime?: number;
  description?: string;
  icon?: string;
  tier?: string;
  category?: string;
  level?: number;
}

interface ProgressLog {
  id: string;
  points: number;
  source: string;
  timestamp: any;
}

// In-memory cache for description strings to avoid re-parsing on every render
const descriptionCache = new Map<string, string>();

/**
 * Returns descriptive metadata for any badge name
 */
export function getBadgeDescription(badgeName: string): string {
  const lower = (badgeName || '').toLowerCase().trim();
  const cached = descriptionCache.get(lower);
  if (cached) return cached;

  let desc = 'Achievement unlocked through active participation and platform engagement.';
  if (lower === 'early adopter' || lower.includes('early')) {
    desc = 'Early access pioneer in Gravityverse with exclusive founding privileges.';
  } else if (lower === 'elite 1' || lower.startsWith('elite 1 ')) {
    desc = 'Unlocked Level 1 Explorer status by accumulating your first 10 activity points.';
  } else if (lower === 'elite 2' || lower.startsWith('elite 2 ')) {
    desc = 'Unlocked Level 2 Knowledge Seeker status by accumulating 20 activity points.';
  } else if (lower === 'elite 3' || lower.startsWith('elite 3 ')) {
    desc = 'Unlocked Level 3 Mastermind status by accumulating 30 activity points.';
  } else if (lower === 'elite 4' || lower.startsWith('elite 4 ')) {
    desc = 'Unlocked Level 4 Grandmaster status by accumulating 40 activity points.';
  } else if (lower === 'elite 5' || lower.startsWith('elite 5 ')) {
    desc = 'Unlocked Level 5 Legend status by accumulating 50 activity points.';
  } else if (lower.startsWith('elite')) {
    const num = badgeName.replace(/\D/g, '');
    desc = `Unlocked Level ${num || 'Advanced'} status through continuous AI exploration and task achievements.`;
  } else if (lower.includes('chat') || lower.includes('pioneer') || lower.includes('prompt')) {
    desc = 'Active participant collaborating with the AI Chat Assistant on advanced tasks.';
  } else if (lower.includes('streak') || lower.includes('daily') || lower.includes('active')) {
    desc = 'Dedicated engagement across consecutive active sessions.';
  } else if (lower.includes('scholar') || lower.includes('academic') || lower.includes('gpa')) {
    desc = 'Academic excellence and analytical resource exploration.';
  }

  descriptionCache.set(lower, desc);
  return desc;
}

/**
 * Parses diverse Firestore / JS date representations to Unix milliseconds
 */
export function getTimestampMs(dateVal: any): number {
  if (!dateVal) return 0;
  if (typeof dateVal?.toMillis === 'function') return dateVal.toMillis();
  if (typeof dateVal?.toDate === 'function') return dateVal.toDate().getTime();
  if (typeof dateVal?._seconds === 'number') return dateVal._seconds * 1000;
  if (typeof dateVal?.seconds === 'number') return dateVal.seconds * 1000;
  if (dateVal instanceof Date) return dateVal.getTime();
  if (typeof dateVal === 'number') return dateVal;
  const parsed = new Date(dateVal).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

export function formatBadgeDate(dateVal: any): string {
  if (!dateVal) return 'Date unavailable';
  const ms = getTimestampMs(dateVal);
  if (ms === 0) return 'Date unavailable';
  return formatDate(new Date(ms));
}

/**
 * Visual styling configuration for a badge
 */
export interface BadgeStyleConfig {
  gradient: string;
  borderColor: string;
  textColor: string;
  glowColor: string;
  tag: string;
  tagBg: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

const badgeStyleCache = new Map<string, BadgeStyleConfig>();

export function getBadgeStyle(badgeName: string = ''): BadgeStyleConfig {
  const lower = badgeName.toLowerCase().trim();
  const cached = badgeStyleCache.get(lower);
  if (cached) return cached;

  let style: BadgeStyleConfig;

  // Early Adopter / Founding
  if (lower.includes('early') || lower.includes('founder') || lower.includes('adopter')) {
    style = {
      gradient: 'from-amber-500/25 via-yellow-500/15 to-amber-950/40',
      borderColor: 'border-amber-400/40',
      textColor: 'text-amber-300',
      glowColor: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]',
      tag: 'VIP',
      tagBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      IconComponent: Sparkles,
      accentColor: '#F59E0B'
    };
  } else if (lower === 'elite 1' || lower.startsWith('elite 1 ')) {
    style = {
      gradient: 'from-emerald-500/25 via-teal-500/15 to-emerald-950/40',
      borderColor: 'border-emerald-400/40',
      textColor: 'text-emerald-300',
      glowColor: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
      tag: 'L1',
      tagBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      IconComponent: Compass,
      accentColor: '#10B981'
    };
  } else if (lower === 'elite 2' || lower.startsWith('elite 2 ')) {
    style = {
      gradient: 'from-sky-500/25 via-blue-500/15 to-blue-950/40',
      borderColor: 'border-sky-400/40',
      textColor: 'text-sky-300',
      glowColor: 'shadow-[0_0_20px_rgba(14,165,233,0.25)]',
      tag: 'L2',
      tagBg: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      IconComponent: Shield,
      accentColor: '#0EA5E9'
    };
  } else if (lower === 'elite 3' || lower.startsWith('elite 3 ')) {
    style = {
      gradient: 'from-amber-500/30 via-orange-500/20 to-amber-950/50',
      borderColor: 'border-amber-400/50',
      textColor: 'text-amber-300',
      glowColor: 'shadow-[0_0_22px_rgba(245,158,11,0.3)]',
      tag: 'L3',
      tagBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      IconComponent: Crown,
      accentColor: '#F59E0B'
    };
  } else if (lower === 'elite 4' || lower.startsWith('elite 4 ')) {
    style = {
      gradient: 'from-purple-500/30 via-violet-500/20 to-purple-950/50',
      borderColor: 'border-purple-400/50',
      textColor: 'text-purple-300',
      glowColor: 'shadow-[0_0_22px_rgba(168,85,247,0.3)]',
      tag: 'L4',
      tagBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      IconComponent: Gem,
      accentColor: '#A855F7'
    };
  } else if (lower.startsWith('elite')) {
    const num = badgeName.replace(/\D/g, '') || '5';
    style = {
      gradient: 'from-rose-500/30 via-pink-500/20 to-rose-950/50',
      borderColor: 'border-rose-400/50',
      textColor: 'text-rose-300',
      glowColor: 'shadow-[0_0_22px_rgba(244,63,94,0.3)]',
      tag: `L${num}`,
      tagBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      IconComponent: Trophy,
      accentColor: '#F43F5E'
    };
  } else if (lower.includes('chat') || lower.includes('assistant') || lower.includes('prompt')) {
    style = {
      gradient: 'from-cyan-500/25 via-blue-500/15 to-indigo-950/40',
      borderColor: 'border-cyan-400/40',
      textColor: 'text-cyan-300',
      glowColor: 'shadow-[0_0_20px_rgba(6,182,212,0.25)]',
      tag: 'AI',
      tagBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      IconComponent: Zap,
      accentColor: '#06B6D4'
    };
  } else if (lower.includes('scholar') || lower.includes('read') || lower.includes('learn')) {
    style = {
      gradient: 'from-indigo-500/25 via-blue-500/15 to-slate-900/40',
      borderColor: 'border-indigo-400/40',
      textColor: 'text-indigo-300',
      glowColor: 'shadow-[0_0_20px_rgba(99,102,241,0.25)]',
      tag: 'EDU',
      tagBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      IconComponent: BookOpen,
      accentColor: '#6366F1'
    };
  } else {
    style = {
      gradient: 'from-blue-600/25 via-indigo-600/15 to-slate-950/40',
      borderColor: 'border-blue-500/40',
      textColor: 'text-blue-300',
      glowColor: 'shadow-[0_0_18px_rgba(59,130,246,0.2)]',
      tag: '★',
      tagBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      IconComponent: Award,
      accentColor: '#3B82F6'
    };
  }

  badgeStyleCache.set(lower, style);
  return style;
}

/**
 * Universal Badge Icon component that renders rich vector emblems with smooth image fallback
 */
export function BadgeIcon({
  badgeName = '',
  src,
  alt = 'Badge',
  size = 'md',
  className = '',
  iconClassName = '',
  showTierBadge = true,
  fallbackIcon
}: {
  badgeName?: string;
  src?: string;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  iconClassName?: string;
  showTierBadge?: boolean;
  fallbackIcon?: React.ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const style = useMemo(() => getBadgeStyle(badgeName), [badgeName]);
  const IconComp = style.IconComponent;

  // Size mapping
  const sizeClasses = {
    xs: 'w-6 h-6 rounded-lg text-xs',
    sm: 'w-8 h-8 rounded-xl text-xs',
    md: 'w-11 h-11 rounded-xl text-sm',
    lg: 'w-13 h-13 sm:w-14 sm:h-14 rounded-2xl text-base',
    xl: 'w-16 h-16 sm:w-20 sm:h-20 rounded-3xl text-xl'
  };

  const iconSizes = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-5 h-5 sm:w-6 sm:h-6',
    lg: 'w-7 h-7 sm:w-8 sm:h-8',
    xl: 'w-9 h-9 sm:w-11 sm:h-11'
  };

  const containerSize = className || sizeClasses[size];
  const appliedIconSize = iconClassName || iconSizes[size];

  const hasValidImageSrc = Boolean(src && !imageFailed && !src.includes('badge-logo.png'));

  if (hasValidImageSrc && src) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-br ${style.gradient} border ${style.borderColor} flex items-center justify-center flex-shrink-0 ${style.glowColor} ${containerSize}`}>
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            {fallbackIcon || <IconComp className={`${appliedIconSize} ${style.textColor}`} />}
          </div>
        )}
        <img
          src={src}
          alt={alt || badgeName}
          className={`w-full h-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
        {showTierBadge && (size === 'md' || size === 'lg' || size === 'xl') && (
          <span className={`absolute bottom-0.5 right-0.5 px-1 py-0.2 text-[8px] font-black uppercase rounded-sm border ${style.tagBg} backdrop-blur-sm`}>
            {style.tag}
          </span>
        )}
      </div>
    );
  }

  // Render high-fidelity vector badge emblem with clean local fallback
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${style.gradient} border ${style.borderColor} flex items-center justify-center flex-shrink-0 ${style.glowColor} ${containerSize}`}
    >
      {/* Subtle interior ambient fill */}
      <div className="absolute inset-0 bg-radial from-white/[0.08] to-transparent pointer-events-none" />

      {/* Center Vector Icon */}
      {fallbackIcon ? (
        fallbackIcon
      ) : (
        <IconComp className={`${appliedIconSize} ${style.textColor} drop-shadow-sm transition-transform duration-300 group-hover:scale-110`} />
      )}

      {/* Tier / Level Marker */}
      {showTierBadge && (size === 'md' || size === 'lg' || size === 'xl') && (
        <span
          className={`absolute bottom-1 right-1 px-1.5 py-0.2 text-[8.5px] font-black uppercase tracking-tight rounded-md border ${style.tagBg} shadow-sm backdrop-blur-md`}
        >
          {style.tag}
        </span>
      )}
    </div>
  );
}

/**
 * Backward compatibility alias for SafeBadgeIcon
 */
export function SafeBadgeIcon({
  src,
  alt = 'Badge',
  badgeName = '',
  className = 'w-10 h-10 rounded-xl',
  iconClassName,
  fallbackIcon
}: {
  src?: string;
  alt?: string;
  badgeName?: string;
  className?: string;
  iconClassName?: string;
  fallbackIcon?: React.ReactNode;
}) {
  return (
    <BadgeIcon
      src={src}
      alt={alt}
      badgeName={badgeName || alt}
      className={className}
      iconClassName={iconClassName}
      fallbackIcon={fallbackIcon}
    />
  );
}

/**
 * Reconciles profile badges and history into a clean, deduplicated, sorted list.
 * STRICTLY uses verified persisted records from historyDocs.
 * Never fabricates fake Elite tiers or historical dates.
 */
export function buildBadges(profile: any, historyDocs: BadgeRecord[] = []): BadgeRecord[] {
  const allBadgesMap = new Map<string, BadgeRecord>();

  // 1. Real verified history records from Firestore / backend
  if (Array.isArray(historyDocs)) {
    historyDocs.forEach(item => {
      if (item && item.badgeName) {
        const key = item.badgeName.toLowerCase().trim();
        allBadgesMap.set(key, {
          ...item,
          id: item.id || `hist-${key.replace(/\s+/g, '_')}`,
          description: item.description || getBadgeDescription(item.badgeName),
          pointsAtTime: typeof item.pointsAtTime === 'number' ? item.pointsAtTime : 10
        });
      }
    });
  }

  // 2. Profile.badges (e.g. ['Early Adopter']) if not already in historyDocs
  if (Array.isArray(profile?.badges) && profile.badges.length > 0) {
    profile.badges.forEach((name: string, idx: number) => {
      if (name && typeof name === 'string' && name.trim()) {
        const key = name.toLowerCase().trim();
        if (!allBadgesMap.has(key)) {
          allBadgesMap.set(key, {
            id: `special-${key.replace(/\s+/g, '_')}`,
            badgeName: name,
            earnedAt: null, // "Date unavailable"
            description: getBadgeDescription(name),
            pointsAtTime: 10,
            category: 'special'
          });
        }
      }
    });
  }

  const mergedList = Array.from(allBadgesMap.values()).map(badge => ({
    ...badge,
    description: badge.description || getBadgeDescription(badge.badgeName)
  }));

  // Sort descending: highest elite level first, then special badges, then chronological
  mergedList.sort((a, b) => {
    const isAElite = a.badgeName.toLowerCase().startsWith('elite');
    const isBElite = b.badgeName.toLowerCase().startsWith('elite');
    if (isAElite && isBElite) {
      const numA = parseInt(a.badgeName.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.badgeName.replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numB - numA;
    }
    if (isAElite && !isBElite) return -1;
    if (!isAElite && isBElite) return 1;

    const timeA = getTimestampMs(a.earnedAt || a.unlockedAt);
    const timeB = getTimestampMs(b.earnedAt || b.unlockedAt);
    if (timeA > 0 && timeB > 0 && timeA !== timeB) {
      return timeB - timeA;
    }
    return 0;
  });

  return mergedList;
}

// In-memory cache by user ID to prevent redundant network roundtrips
interface UserBadgeCache {
  badges: BadgeRecord[];
  totalBadges: number;
  badgesKey: string;
  hasFetchedHistory: boolean;
}
const badgeMemoryCache = new Map<string, UserBadgeCache>();
const inFlightBadgeFetches = new Map<string, Promise<BadgeRecord[]>>();

export function BadgeModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, profile } = useAuth();
  const [badges, setBadges] = useState<BadgeRecord[]>(() => {
    if (user && profile) {
      const cached = badgeMemoryCache.get(user.uid);
      if (cached && cached.badges.length > 0) return cached.badges;
    }
    return [];
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'elite' | 'special'>('all');

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fetchBadges = useCallback(async (forceRetry = false) => {
    if (!user) return;
    const uid = user.uid;
    const badgesKey = `${profile?.totalBadges || 0}-${(profile?.badges || []).join(',')}`;
    const cached = badgeMemoryCache.get(uid);

    // If already fully fetched for this user with same profile state and not forcing retry, reuse immediately
    if (!forceRetry && cached && cached.hasFetchedHistory && cached.badgesKey === badgesKey && cached.badges.length > 0) {
      setBadges(cached.badges);
      setLoading(false);
      setError(null);
      return;
    }

    // Reuse existing in-flight request if already loading
    if (inFlightBadgeFetches.has(uid) && !forceRetry) {
      try {
        const result = await inFlightBadgeFetches.get(uid)!;
        setBadges(result);
        setLoading(false);
        setError(null);
      } catch (err: any) {
        if (badges.length === 0) {
          setError(err?.message || 'Failed to load achievements.');
        }
        setLoading(false);
      }
      return;
    }

    // Only show spinner if we don't already have badges rendered
    if (badges.length === 0) {
      setLoading(true);
    }
    setError(null);

    const fetchPromise = (async () => {
      const fetchedDocs = await fetchUserBadgeHistory(user, profile);
      const mergedList = buildBadges(profile, fetchedDocs);
      badgeMemoryCache.set(uid, {
        badges: mergedList,
        totalBadges: profile?.totalBadges || 0,
        badgesKey,
        hasFetchedHistory: true
      });
      return mergedList;
    })();

    inFlightBadgeFetches.set(uid, fetchPromise);

    try {
      const result = await fetchPromise;
      setBadges(result);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching badge history:', err);
      if (badges.length === 0) {
        setError('Failed to load achievements. Please check your connection.');
      }
    } finally {
      inFlightBadgeFetches.delete(uid);
      setLoading(false);
    }
  }, [user, profile, badges.length]);

  // Load badge data once when modal opens or profile changes
  useEffect(() => {
    if (isOpen && user) {
      const cached = badgeMemoryCache.get(user.uid);
      const badgesKey = `${profile?.totalBadges || 0}-${(profile?.badges || []).join(',')}`;

      if (cached && cached.badgesKey === badgesKey && cached.badges.length > 0) {
        setBadges(cached.badges);
        setLoading(false);
        setError(null);
      } else {
        if (cached && cached.badges.length > 0) {
          setBadges(cached.badges);
          setLoading(false);
        } else {
          setLoading(true);
        }
        fetchBadges(false);
      }
      setSelectedBadgeId(null);
      setProgressLogs([]);
    }
  }, [isOpen, user?.uid, profile?.totalBadges, profile?.badges, fetchBadges]);

  const handleToggleBadge = async (badge: BadgeRecord) => {
    if (selectedBadgeId === badge.id) {
      setSelectedBadgeId(null);
      return;
    }

    setSelectedBadgeId(badge.id);
    setLoadingLogs(true);

    try {
      trackBadge.viewed(badge.id, badge.badgeName);
    } catch (e) {
      console.warn('Analytics trackBadge.viewed failed:', e);
    }

    if (!user) {
      setLoadingLogs(false);
      return;
    }

    try {
      const q = query(
        collection(db, `users/${user.uid}/progressLogs`),
        orderBy('timestamp', 'desc')
      );
      const snap = await getDocs(q);
      setProgressLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProgressLog)));
    } catch (err) {
      try {
        const snap = await getDocs(collection(db, `users/${user.uid}/progressLogs`));
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProgressLog));
        logs.sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
        setProgressLogs(logs);
      } catch {
        setProgressLogs([]);
      }
    } finally {
      setLoadingLogs(false);
    }
  };

  // Derive category arrays from the exact same source dataset (pure in-memory filtering)
  const eliteBadges = useMemo(() => {
    return badges.filter(b => b.badgeName.toLowerCase().startsWith('elite'));
  }, [badges]);

  const specialBadges = useMemo(() => {
    return badges.filter(b => !b.badgeName.toLowerCase().startsWith('elite'));
  }, [badges]);

  const displayedBadges = useMemo(() => {
    if (activeFilter === 'elite') return eliteBadges;
    if (activeFilter === 'special') return specialBadges;
    return badges;
  }, [badges, eliteBadges, specialBadges, activeFilter]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6">
          {/* Subtle Dark Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md cursor-pointer"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-xl h-[85vh] max-h-[700px] bg-[#0c101d] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl shadow-black flex flex-col overflow-hidden z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. BADGE HEADER (Fixed) */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10 bg-[#111728] z-10">
              <div className="flex items-center gap-3 min-w-0">
                <BadgeIcon
                  badgeName={getHighestBadgeName(profile)}
                  size="sm"
                  className="w-9 h-9 rounded-xl shadow-lg flex-shrink-0"
                  showTierBadge={false}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                      Badges & Achievements
                    </h2>
                    {badges.length > 0 && (
                      <span className="px-2 py-0.5 text-[11px] font-bold bg-brand-blue/15 text-brand-blue border border-brand-blue/30 rounded-full">
                        {badges.length} Unlocked
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    Your verified milestones and earned recognition
                  </p>
                </div>
              </div>

              {/* Close (X) Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 sm:p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 ml-2"
                aria-label="Close modal"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* 2. TABS (Fixed) */}
            {badges.length > 0 && (
              <div className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 bg-black/40 border-b border-white/5 text-xs z-10 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                    activeFilter === 'all'
                      ? 'bg-brand-blue text-white shadow-sm shadow-blue-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  All ({badges.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('elite')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                    activeFilter === 'elite'
                      ? 'bg-brand-blue text-white shadow-sm shadow-blue-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  Elite Tiers ({eliteBadges.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('special')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                    activeFilter === 'special'
                      ? 'bg-brand-blue text-white shadow-sm shadow-blue-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  Special ({specialBadges.length})
                </button>
              </div>
            )}

            {/* 3. SCROLLABLE BADGE LIST ONLY */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              {loading && badges.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-7 h-7 text-brand-blue animate-spin" />
                  <p className="text-xs font-medium text-gray-400">Loading your achievements...</p>
                </div>
              ) : error && badges.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-red-500/20 bg-red-500/5">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3 text-red-400">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">Unable to Load Achievements</h3>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto mb-4">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => fetchBadges(true)}
                    className="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                  >
                    Retry
                  </button>
                </div>
              ) : displayedBadges.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3 text-gray-400">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">No Badges in this category</h3>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto">
                    Engage with the Chat Assistant and explore features to level up and earn badges.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 pb-2">
                  {displayedBadges.map((badge) => {
                    const isSelected = selectedBadgeId === badge.id;
                    const style = getBadgeStyle(badge.badgeName);
                    const descriptionText = badge.description || getBadgeDescription(badge.badgeName);

                    return (
                      <div
                        key={badge.id}
                        className={`rounded-2xl border transition-all overflow-hidden ${
                          isSelected
                            ? 'border-brand-blue/40 bg-[#141b2d] shadow-lg shadow-black/40'
                            : 'border-white/5 bg-[#111726]/80 hover:bg-[#151d30] hover:border-white/10'
                        }`}
                      >
                        {/* Horizontal Interactive Badge Row */}
                        <button
                          type="button"
                          onClick={() => handleToggleBadge(badge)}
                          className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left gap-3.5 group transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            {/* Rich Badge Icon with Tier Label */}
                            <BadgeIcon
                              badgeName={badge.badgeName}
                              src={badge.icon ? getAssetPath(badge.icon) : undefined}
                              alt={badge.badgeName}
                              size="md"
                              className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex-shrink-0"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-bold text-white tracking-tight group-hover:text-brand-blue transition-colors">
                                  {badge.badgeName}
                                </h4>
                                {badge.pointsAtTime ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-blue/15 text-brand-blue border border-brand-blue/25 font-bold">
                                    +{badge.pointsAtTime} pts
                                  </span>
                                ) : (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${style.tagBg}`}>
                                    {style.tag}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                                {descriptionText}
                              </p>
                            </div>
                          </div>

                          {/* Right: Date & Expand Arrow */}
                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 text-gray-400">
                            <span className="text-[11px] sm:text-xs text-gray-400 whitespace-nowrap font-medium">
                              {formatBadgeDate(badge.earnedAt)}
                            </span>
                            <div className="p-1 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
                              <ChevronRight
                                className={`w-3.5 h-3.5 text-gray-400 group-hover:text-white transition-transform duration-200 ${
                                  isSelected ? 'rotate-90 text-brand-blue' : ''
                                }`}
                              />
                            </div>
                          </div>
                        </button>

                        {/* Expandable Activity Details */}
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.18 }}
                              className="px-4 py-3.5 border-t border-white/5 bg-black/30 text-xs space-y-3"
                            >
                              <div className="flex items-center justify-between text-gray-400 text-[11px] font-semibold border-b border-white/5 pb-2">
                                <span className="flex items-center gap-1.5 text-emerald-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Achievement Details
                                </span>
                                <span className="text-gray-400 font-normal">
                                  Unlocked {formatBadgeDate(badge.earnedAt)}
                                </span>
                              </div>

                              <p className="text-xs text-gray-300 leading-relaxed">
                                {descriptionText}
                              </p>

                              {loadingLogs ? (
                                <div className="flex items-center gap-2 py-2 text-gray-400 text-[11px]">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-blue" />
                                  <span>Loading activity history...</span>
                                </div>
                              ) : progressLogs.length > 0 ? (
                                <div className="space-y-1.5 pt-1">
                                  <span className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5">
                                    <Activity className="w-3.5 h-3.5 text-brand-blue" />
                                    Recent Qualifying Activity:
                                  </span>
                                  {progressLogs.slice(0, 3).map((log) => (
                                    <div
                                      key={log.id}
                                      className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/5 text-[11px]"
                                    >
                                      <span className="text-gray-300 font-medium truncate mr-2">
                                        {log.source || 'Task completed'}
                                      </span>
                                      <span className="text-brand-blue font-bold whitespace-nowrap">
                                        +{log.points} pts
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. FOOTER (Fixed) */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-3.5 border-t border-white/10 bg-[#111728] flex items-center justify-between text-xs text-gray-400 z-10">
              <span className="text-[11px] sm:text-xs">
                Next level in <strong className="text-brand-blue">{Math.max(0, 10 - ((profile?.progress || 0) % 10)).toFixed(1)} pts</strong>
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl transition-colors font-semibold text-xs border border-white/10"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
