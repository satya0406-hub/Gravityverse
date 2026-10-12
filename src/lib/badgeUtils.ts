/**
 * Unified Badge Helper Utilities for Gravityverse
 * Provides exact synchronization between user profile metrics, badge counts, and modal history.
 */

export function getUnlockedBadgesCount(profile: any): number {
  if (!profile) return 0;
  const specialBadgesCount = Array.isArray(profile.badges) ? profile.badges.length : 0;
  const totalBadgesEarned = Number(profile.totalBadges) || 0;
  return specialBadgesCount + totalBadgesEarned;
}

export function getHighestBadgeName(profile: any): string {
  if (!profile) return 'Explorer';
  const totalBadgesEarned = Number(profile.totalBadges) || 0;
  if (totalBadgesEarned > 0) {
    return `Elite ${totalBadgesEarned}`;
  }
  if (Array.isArray(profile.badges) && profile.badges.length > 0) {
    return profile.badges[profile.badges.length - 1];
  }
  return 'Early Adopter';
}
