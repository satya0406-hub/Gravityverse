import { useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useLocation } from 'react-router-dom';
import { awardUserProgressAndBadges, cleanupUserBadgeHistory } from '../services/badgeHistoryService';

/**
 * Global centralized hook for user progress points and atomic badge unlocking.
 * This is the SINGLE SOURCE OF TRUTH for awarding activity points and unlocking Elite badges.
 *
 * Rules:
 * 1. Only ONE global interval timer runs (tick every 60 seconds).
 * 2. Route-based activity detection:
 *    - Chat Assistant (/chat): 0.5 pts/min
 *    - Reading articles (/blog, /stories, /news, /laws): 1.5 pts/min
 *    - General active navigation: 0.5 pts/min
 * 3. Does NOT award points or badges simply because the page mounted or opened.
 * 4. All progress increments and badge creations are processed atomically in a Firestore transaction.
 */
export function useBadgeSystem() {
  const { user } = useAuth();
  const location = useLocation();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const locationRef = useRef(location.pathname);
  const cleanedUpUserRef = useRef<string | null>(null);

  // Keep location ref up to date without restarting the interval
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  // Run idempotent cleanup once per user session
  useEffect(() => {
    if (user?.uid && cleanedUpUserRef.current !== user.uid) {
      cleanedUpUserRef.current = user.uid;
      cleanupUserBadgeHistory(user.uid, user).catch((err) => {
        console.warn('[BadgeSystem] Initial cleanup notice:', err);
      });
    }
  }, [user]);

  // Main 1-minute heartbeat interval
  useEffect(() => {
    if (!user?.uid) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Set up single global timer (fires only after a full 60 seconds of active session)
    timerRef.current = setInterval(async () => {
      if (isProcessingRef.current || !user?.uid) return;

      const path = locationRef.current;
      let points = 0.5;
      let source = 'Active Session';

      const isReadingArticle = ['/blog', '/stories', '/news', '/laws'].some(
        (p) => path.startsWith(p) && path.split('/').filter(Boolean).length >= 2
      );

      if (path.startsWith('/chat')) {
        points = 0.5;
        source = 'Chat Assistant';
      } else if (isReadingArticle) {
        points = 1.5;
        const section = path.split('/').filter(Boolean)[0] || 'Article';
        source = `Reading ${section.charAt(0).toUpperCase() + section.slice(1)}`;
      } else {
        points = 0.5;
        source = 'Active Session';
      }

      isProcessingRef.current = true;
      try {
        await awardUserProgressAndBadges(user.uid, points, source, user);
      } catch (err) {
        console.warn('[BadgeSystem] Progress heartbeat notice:', err);
      } finally {
        isProcessingRef.current = false;
      }
    }, 60000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [user?.uid]);
}
