import { User } from 'firebase/auth';
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  runTransaction,
  deleteDoc,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getApiBaseUrl } from '../lib/utils';
import { BadgeRecord, getTimestampMs, getBadgeDescription } from '../components/BadgeModal';
import { trackBadge, trackUserStats } from '../lib/analytics';

/**
 * Normalizes an Elite level or tier number from a string/id.
 */
function extractEliteTier(identifier: string): number | null {
  if (!identifier) return null;
  const match = identifier.match(/elite[_\-\s]*(\d+)/i) || identifier.match(/^(\d+)$/);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return isNaN(num) || num <= 0 ? null : num;
  }
  return null;
}

/**
 * Idempotent cleanup utility that resolves duplicate/corrupted badge history records.
 * - Deduplicates Elite badge records by deterministic tier (elite_1, elite_2, ...)
 * - Preserves the earliest valid earnedAt timestamp
 * - Removes phantom/duplicate non-canonical records
 * - Synchronizes user.totalBadges with the exact count of unique Elite tiers
 */
export async function cleanupUserBadgeHistory(userId: string, user?: User | null): Promise<BadgeRecord[]> {
  if (!userId) return [];

  // 1. Try server-side admin cleanup first if user token is available
  if (user) {
    try {
      const token = await user.getIdToken();
      if (token) {
        const apiBaseUrl = getApiBaseUrl();
        const res = await fetch(`${apiBaseUrl}/api/user/cleanup-badges`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            // After successful cleanup, fetch the badges
            const historyRes = await fetch(`${apiBaseUrl}/api/user/badge-history`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            if (historyRes.ok) {
              const historyData = await historyRes.json();
              if (historyData.success && Array.isArray(historyData.badges)) {
                return historyData.badges;
              }
            }
          }
        }
      }
    } catch (apiErr) {
      console.warn('[BadgeCleanup] Server cleanup fallback to client:', apiErr);
    }
  }

  try {
    const historyRef = collection(db, `users/${userId}/badgeHistory`);
    const snapshot = await getDocs(historyRef);

    const eliteMap = new Map<number, { docId: string; data: any; timestampMs: number }[]>();
    const specialMap = new Map<string, { docId: string; data: any; timestampMs: number }[]>();

    // 1. Group documents by identity
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const rawDate = data.earnedAt || data.unlockedAt || data.timestamp || data.date;
      const tsMs = getTimestampMs(rawDate);
      const name = (data.badgeName || data.name || docSnap.id || '').trim();

      const tierFromId = extractEliteTier(docSnap.id);
      const tierFromName = extractEliteTier(name);
      const tierNum = tierFromId || tierFromName || (typeof data.level === 'number' ? data.level : null);

      if (tierNum !== null && tierNum > 0) {
        if (!eliteMap.has(tierNum)) eliteMap.set(tierNum, []);
        eliteMap.get(tierNum)!.push({ docId: docSnap.id, data, timestampMs: tsMs });
      } else {
        const specialKey = name.toLowerCase() || docSnap.id.toLowerCase();
        if (!specialMap.has(specialKey)) specialMap.set(specialKey, []);
        specialMap.get(specialKey)!.push({ docId: docSnap.id, data, timestampMs: tsMs });
      }
    }

    const cleanedRecords: BadgeRecord[] = [];
    const deletePromises: Promise<void>[] = [];
    const setPromises: Promise<void>[] = [];

    // 2. Determine max tier from existing documents and profile
    let maxFoundTier = 0;
    for (const tier of eliteMap.keys()) {
      if (tier > maxFoundTier) maxFoundTier = tier;
    }

    let existingProfileTotal = 0;
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        existingProfileTotal = Number(userSnap.data()?.totalBadges) || 0;
      }
    } catch (e) {
      console.warn('[BadgeCleanup] Profile read warning:', e);
    }

    const maxTier = Math.max(existingProfileTotal, maxFoundTier);

    // 3. Resolve Elite tiers: deterministic doc ID is elite_{tierNum}
    for (let tierNum = 1; tierNum <= maxTier; tierNum++) {
      const group = eliteMap.get(tierNum) || [];
      const canonicalId = `elite_${tierNum}`;

      // Find the earliest valid timestamp among all duplicate records
      let earliestTsMs = 0;
      let earliestRawDate: any = null;
      for (const item of group) {
        if (item.timestampMs > 0) {
          if (earliestTsMs === 0 || item.timestampMs < earliestTsMs) {
            earliestTsMs = item.timestampMs;
            earliestRawDate = item.data.earnedAt || item.data.unlockedAt || item.data.timestamp || item.data.date;
          }
        }
      }

      const canonicalItem = group.find(i => i.docId === canonicalId);
      const badgeData: any = {
        badgeName: `Elite ${tierNum}`,
        category: 'elite',
        tier: `L${tierNum}`,
        level: tierNum,
        pointsAtTime: 10,
        description: getBadgeDescription(`Elite ${tierNum}`),
        icon: 'badge-elite'
      };

      if (earliestRawDate) {
        badgeData.earnedAt = earliestRawDate;
      } else if (canonicalItem?.data?.earnedAt) {
        badgeData.earnedAt = canonicalItem.data.earnedAt;
      }

      // Write/update canonical doc
      const canonicalDocRef = doc(db, `users/${userId}/badgeHistory`, canonicalId);
      setPromises.push(setDoc(canonicalDocRef, badgeData, { merge: true }).catch(() => {}));

      cleanedRecords.push({
        id: canonicalId,
        ...badgeData
      });

      // Delete non-canonical duplicates for this tier
      for (const item of group) {
        if (item.docId !== canonicalId) {
          deletePromises.push(deleteDoc(doc(db, `users/${userId}/badgeHistory`, item.docId)).catch(() => {}));
        }
      }
    }

    // 4. Resolve Special badges
    for (const [specialKey, group] of specialMap.entries()) {
      let earliestTsMs = 0;
      let earliestRawDate: any = null;
      for (const item of group) {
        if (item.timestampMs > 0) {
          if (earliestTsMs === 0 || item.timestampMs < earliestTsMs) {
            earliestTsMs = item.timestampMs;
            earliestRawDate = item.data.earnedAt || item.data.unlockedAt || item.data.timestamp || item.data.date;
          }
        }
      }

      const primary = group[0];
      const badgeData: any = {
        ...primary.data,
        id: primary.docId,
        badgeName: primary.data.badgeName || primary.data.name || primary.docId,
        category: 'special',
        pointsAtTime: typeof primary.data.pointsAtTime === 'number' ? primary.data.pointsAtTime : 10,
        description: primary.data.description || getBadgeDescription(primary.data.badgeName || primary.docId)
      };
      if (earliestRawDate) {
        badgeData.earnedAt = earliestRawDate;
      }

      cleanedRecords.push(badgeData);

      // Delete extra duplicate docs for this special badge
      for (let i = 1; i < group.length; i++) {
        deletePromises.push(deleteDoc(doc(db, `users/${userId}/badgeHistory`, group[i].docId)).catch(() => {}));
      }
    }

    await Promise.allSettled([...deletePromises, ...setPromises]);

    // 5. Ensure totalBadges on user document matches actual unique Elite tier count
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { totalBadges: maxTier }).catch(() => {});
    } catch (e) {
      console.warn('[BadgeCleanup] Profile totalBadges sync warning:', e);
    }

    // Sort descending: highest Elite level first, then Special badges
    cleanedRecords.sort((a, b) => {
      const isAElite = a.badgeName.toLowerCase().startsWith('elite');
      const isBElite = b.badgeName.toLowerCase().startsWith('elite');
      if (isAElite && isBElite) {
        const numA = parseInt(a.badgeName.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.badgeName.replace(/\D/g, ''), 10) || 0;
        return numB - numA;
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

    return cleanedRecords;
  } catch (err) {
    console.error('[BadgeCleanup] Error during badge history cleanup:', err);
    return [];
  }
}

/**
 * Centralized, atomic function to award progress points and unlock Elite badges.
 * 1. Primary path: Calls authenticated backend POST /api/user/progress (guaranteed Firebase Admin connection).
 * 2. Fallback path: Uses Firestore client runTransaction with graceful offline tolerance.
 */
export async function awardUserProgressAndBadges(
  userId: string,
  points: number,
  source: string,
  user?: User | null
): Promise<{ newProgress: number; newTotalBadges: number; newBadges: string[] }> {
  if (!userId || points <= 0) {
    return { newProgress: 0, newTotalBadges: 0, newBadges: [] };
  }

  // 1. Try authenticated backend endpoint first
  if (user) {
    try {
      const token = await user.getIdToken();
      if (token) {
        const apiBaseUrl = getApiBaseUrl();
        const response = await fetch(`${apiBaseUrl}/api/user/progress`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ points, source })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Analytics tracking for newly unlocked badges
            if (Array.isArray(result.newBadges)) {
              for (const badgeName of result.newBadges) {
                try {
                  trackBadge.earned(badgeName.toLowerCase().replace(/\s+/g, '_'), badgeName);
                } catch (e) {
                  console.warn('Analytics trackBadge.earned failed:', e);
                }
              }
            }
            try {
              trackUserStats.xpEarned(points, result.newProgress || 0, source);
            } catch (e) {
              console.warn('Analytics trackUserStats.xpEarned failed:', e);
            }
            return {
              newProgress: result.newProgress || 0,
              newTotalBadges: result.newTotalBadges || 0,
              newBadges: result.newBadges || []
            };
          }
        }
      }
    } catch (apiErr) {
      console.warn('[BadgeService] Backend progress endpoint warning, falling back to client:', apiErr);
    }
  }

  // 2. Client Firestore transaction fallback
  try {
    const userDocRef = doc(db, 'users', userId);
    let newlyEarnedBadges: { id: string; name: string }[] = [];
    let resultProgress = 0;
    let resultTotalBadges = 0;

    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userDocRef);
      if (!userSnap.exists()) {
        return;
      }

      const userData = userSnap.data() || {};
      const currentProgress = typeof userData.progress === 'number' ? userData.progress : 0;
      const currentTotalBadges = typeof userData.totalBadges === 'number' ? userData.totalBadges : 0;

      const accumulatedProgress = currentProgress + points;

      if (accumulatedProgress >= 10) {
        const badgesToEarn = Math.floor(accumulatedProgress / 10);
        resultProgress = +(accumulatedProgress % 10).toFixed(2);
        resultTotalBadges = currentTotalBadges + badgesToEarn;

        // Deterministically create each new Elite tier
        for (let i = 0; i < badgesToEarn; i++) {
          const tierNum = currentTotalBadges + i + 1;
          const badgeId = `elite_${tierNum}`;
          const badgeName = `Elite ${tierNum}`;
          const badgeDocRef = doc(db, `users/${userId}/badgeHistory`, badgeId);

          transaction.set(badgeDocRef, {
            badgeName,
            earnedAt: serverTimestamp(),
            pointsAtTime: 10,
            description: getBadgeDescription(badgeName),
            category: 'elite',
            tier: `L${tierNum}`,
            level: tierNum,
            icon: 'badge-elite'
          }, { merge: true });

          newlyEarnedBadges.push({ id: badgeId, name: badgeName });
        }

        transaction.update(userDocRef, {
          progress: resultProgress,
          totalBadges: resultTotalBadges,
          lastActive: serverTimestamp()
        });
      } else {
        resultProgress = +accumulatedProgress.toFixed(2);
        resultTotalBadges = currentTotalBadges;

        transaction.update(userDocRef, {
          progress: resultProgress,
          lastActive: serverTimestamp()
        });
      }
    });

    // Log progress activity in progressLogs subcollection
    try {
      await addDoc(collection(db, `users/${userId}/progressLogs`), {
        points,
        source,
        timestamp: serverTimestamp()
      });
    } catch (logErr) {
      console.warn('[BadgeService] progressLog write notice:', logErr);
    }

    // Analytics tracking for newly unlocked badges
    for (const b of newlyEarnedBadges) {
      try {
        trackBadge.earned(b.id, b.name);
      } catch (e) {
        console.warn('Analytics trackBadge.earned failed:', e);
      }
    }

    try {
      trackUserStats.xpEarned(points, resultProgress, source);
    } catch (e) {
      console.warn('Analytics trackUserStats.xpEarned failed:', e);
    }

    return {
      newProgress: resultProgress,
      newTotalBadges: resultTotalBadges,
      newBadges: newlyEarnedBadges.map(b => b.name)
    };
  } catch (firestoreErr) {
    console.warn('[BadgeService] Client progress transaction notice (will retry next interval):', firestoreErr);
    return { newProgress: 0, newTotalBadges: 0, newBadges: [] };
  }
}

/**
 * Service to fetch verified badge history for the authenticated user.
 * 1. Primary path: Calls authenticated backend GET /api/user/badge-history.
 * 2. Fallback path: Runs cleanupUserBadgeHistory directly on Firestore.
 */
export async function fetchUserBadgeHistory(user: User | null, profile?: any): Promise<BadgeRecord[]> {
  if (!user) return [];

  // Attempt authenticated backend endpoint first
  try {
    const token = await user.getIdToken();
    if (token) {
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/user/badge-history`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && Array.isArray(result.badges)) {
          return result.badges;
        }
      }
    }
  } catch (apiErr) {
    console.warn('[BadgeHistoryService] Backend API retrieval warning, falling back to direct query:', apiErr);
  }

  // Fallback: Direct Firestore cleanup & retrieval
  try {
    return await cleanupUserBadgeHistory(user.uid);
  } catch (firestoreErr) {
    console.error('[BadgeHistoryService] Firestore retrieval failed:', firestoreErr);
    throw firestoreErr;
  }
}
