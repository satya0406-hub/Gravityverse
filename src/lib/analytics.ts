/**
 * Google Analytics 4 (GA4) & Microsoft Clarity Analytics Service
 * Reusable, robust, and performs silent background tracking.
 */

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    clarity?: any;
  }
}

// Keep track of initialization status
let isInitialized = false;

// Retrieve Measurement ID and Clarity ID from Vite environment variables
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-C712DRKC57';
const CLARITY_ID = import.meta.env.VITE_CLARITY_ID || 'q16shj73on'; // High-fidelity Clarity visual recording tag

// Track recorded scroll depths per page view
const recordedScrollDepths = new Set<number>();

/**
 * Dynamically initializes GA4 and Microsoft Clarity by injecting external scripts.
 */
export function initializeAnalytics(): void {
  if (isInitialized) return;
  isInitialized = true;

  // 1. Initialize Google Analytics 4 if Measurement ID is present
  if (MEASUREMENT_ID) {
    try {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer?.push(arguments);
      };

      // Detect if we are running in an iframe (like the AI Studio development preview)
      const isIframe = typeof window !== 'undefined' && window.self !== window.top;

      let savedGeoLoc: any = null;
      let savedGeoStatus: string = 'prompt';
      try {
        savedGeoStatus = localStorage.getItem('gravity_geo_status') || 'prompt';
        const geoLocStr = localStorage.getItem('gravity_geo_loc');
        if (geoLocStr) {
          savedGeoLoc = JSON.parse(geoLocStr);
        }
      } catch (e) {
        console.warn(e);
      }

      window.gtag('js', new Date());
      
      const configParams: Record<string, any> = {
        send_page_view: false, // Page views are handled dynamically by our router-based tracker
        ...(isIframe ? { cookie_flags: 'SameSite=None;Secure' } : {}), // Only force cross-site iframe cookies in development previews
      };

      if (savedGeoStatus === 'granted' && savedGeoLoc) {
        configParams.precise_latitude = savedGeoLoc.lat;
        configParams.precise_longitude = savedGeoLoc.lng;
        configParams.location_access = 'granted';
      } else {
        configParams.location_access = savedGeoStatus;
      }

      window.gtag('config', MEASUREMENT_ID, configParams);

      // Track active session heartbeat and engagement time
      setupSessionTracking();
    } catch (error) {
      console.error('[Analytics] Failed to initialize Google Analytics 4:', error);
    }
  }

  // 2. Initialize Microsoft Clarity for Heatmaps, dead clicks, rage clicks, and session replay
  if (CLARITY_ID) {
    try {
      const clarityScript = document.createElement('script');
      clarityScript.async = true;
      clarityScript.innerHTML = `
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window,document,"clarity","script","${CLARITY_ID}");
      `;
      document.head.appendChild(clarityScript);
    } catch (error) {
      console.error('[Analytics] Failed to initialize Microsoft Clarity:', error);
    }
  }

  // 3. Register global event interceptors
  try {
    setupGlobalInterceptors();
  } catch (error) {
    console.error('[Analytics] Failed to register global interceptors:', error);
  }
}

/**
 * Retrieves the latest location parameters, device info, and permissions stored in localStorage.
 */
export function getLatestLocationParams(): Record<string, any> {
  let locationParams: Record<string, any> = {};
  try {
    const savedGeoStatus = localStorage.getItem('gravity_geo_status') || 'prompt';
    const savedCountry = localStorage.getItem('gravity_geo_country') || '';
    const savedState = localStorage.getItem('gravity_geo_state') || '';
    const savedCity = localStorage.getItem('gravity_geo_city') || '';

    const savedBrand = localStorage.getItem('gravity_device_brand') || '';
    const savedModel = localStorage.getItem('gravity_device_model') || '';
    const savedSkin = localStorage.getItem('gravity_os_skin') || '';
    const savedOS = localStorage.getItem('gravity_os') || '';
    const savedBadgeCount = localStorage.getItem('gravity_user_badge_count');

    if (savedCountry) locationParams.fallback_country = savedCountry;
    if (savedState) locationParams.fallback_state = savedState;
    if (savedCity) locationParams.fallback_city = savedCity;

    if (savedBrand) locationParams.device_brand = savedBrand;
    if (savedModel) locationParams.device_model = savedModel;
    if (savedSkin) locationParams.os_skin = savedSkin;
    if (savedOS) locationParams.operating_system = savedOS;
    
    if (savedBadgeCount !== null) {
      const countNum = parseInt(savedBadgeCount, 10);
      locationParams.user_badge_count = isNaN(countNum) ? 0 : countNum;
    } else {
      locationParams.user_badge_count = 0;
    }

    if (savedGeoStatus === 'granted') {
      const geoLocStr = localStorage.getItem('gravity_geo_loc');
      if (geoLocStr) {
        const savedGeoLoc = JSON.parse(geoLocStr);
        locationParams = {
          ...locationParams,
          precise_latitude: savedGeoLoc.lat,
          precise_longitude: savedGeoLoc.lng,
          location_access: 'granted'
        };
      }
    } else {
      locationParams.location_access = savedGeoStatus;
    }
  } catch (e) {
    console.warn(e);
  }
  return locationParams;
}

/**
 * Tracks a page view event and resets the scroll depth tracking.
 * @param path The current route or page path.
 * @param title Optional title of the page.
 */
export function trackPageView(path: string, title?: string): void {
  // Ensure initialized
  initializeAnalytics();

  // Reset scroll depths on page change
  recordedScrollDepths.clear();

  if (MEASUREMENT_ID && window.gtag) {
    try {
      const locationParams = getLatestLocationParams();

      // Update global configuration path for subsequent custom events
      window.gtag('set', {
        page_path: path,
        page_title: title || document.title,
        page_location: window.location.href,
        ...locationParams
      });
      
      // Explicitly send page_view event with complete details
      window.gtag('event', 'page_view', {
        page_path: path,
        page_title: title || document.title,
        page_location: window.location.href,
        send_to: MEASUREMENT_ID,
        ...locationParams
      });
    } catch (err) {
      console.warn('[Analytics] Failed to log page_view event:', err);
    }
  } else {
    if (import.meta.env.DEV) {
      console.log(`[Analytics Dev Log] PageView: "${path}" - "${title || document.title}"`);
    }
  }
}

/**
 * Tracks a custom event in GA4.
 * @param eventName Name of the custom event.
 * @param params Additional event parameters/metadata.
 */
export function trackCustomEvent(eventName: string, params: Record<string, any> = {}): void {
  // Ensure initialized
  initializeAnalytics();

  // Inject general device, network, & session metadata dynamically
  const conn = (navigator as any).connection;

  const locationParams = getLatestLocationParams();

  const augmentedParams = {
    ...locationParams,
    ...params,
    screen_resolution: `${window.innerWidth}x${window.innerHeight}`,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    user_language: navigator.language,
    online_status: navigator.onLine ? 'online' : 'offline',
    connection_type: conn?.effectiveType?.toUpperCase() || 'LTE/FIBER',
    device_pixel_ratio: window.devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
  };

  if (MEASUREMENT_ID && window.gtag) {
    try {
      window.gtag('event', eventName, augmentedParams);
    } catch (error) {
      console.error(`[Analytics] Error logging custom event "${eventName}":`, error);
    }
  } else {
    // During local development without Measurement ID, we log to console in development mode.
    if (import.meta.env.DEV) {
      console.log(`[Analytics Dev Log] Event: "${eventName}"`, augmentedParams);
    }
  }
}

/**
 * Sets user properties (such as user group, preferences, etc.) in GA4.
 */
export function trackUserProperties(properties: Record<string, any>): void {
  initializeAnalytics();

  if (MEASUREMENT_ID && window.gtag) {
    try {
      window.gtag('set', 'user_properties', properties);
    } catch (error) {
      console.error('[Analytics] Error setting user properties:', error);
    }
  } else {
    if (import.meta.env.DEV) {
      console.log('[Analytics Dev Log] User Properties Set:', properties);
    }
  }
}

/**
 * Sets up global click, scroll, error, and performance tracking interceptors.
 */
function setupGlobalInterceptors(): void {
  // 1. Unhandled Errors and Promises
  window.addEventListener('error', (event) => {
    trackError('JavaScript Error', event.message, false, `${event.filename}:${event.lineno}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    trackError('Unhandled Rejection', message, false, stack);
  });

  // 2. Performance and Web Vitals
  if ('performance' in window && 'getEntriesByType' in window.performance) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const paintEntries = window.performance.getEntriesByType('paint');
        paintEntries.forEach((entry) => {
          trackPerformanceMetric(entry.name, entry.startTime, 'Good');
        });

        const navEntries = window.performance.getEntriesByType('navigation');
        if (navEntries.length > 0) {
          const nav = navEntries[0] as PerformanceNavigationTiming;
          trackPerformanceMetric('page_load_time', nav.loadEventEnd - nav.loadEventStart);
          trackPerformanceMetric('dom_content_loaded', nav.domContentLoadedEventEnd - nav.startTime);
        }
      }, 1000);
    });
  }

  // 3. Scroll Depth Tracking
  const handleScroll = () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    const scrollPercent = Math.round((window.scrollY / docHeight) * 100);
    const thresholds = [25, 50, 75, 90, 100];

    for (const threshold of thresholds) {
      if (scrollPercent >= threshold && !recordedScrollDepths.has(threshold)) {
        recordedScrollDepths.add(threshold);
        trackCustomEvent('scroll', {
          percent_scrolled: threshold,
          page_path: window.location.pathname,
        });
      }
    }
  };

  let scrollTimeout: any;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      handleScroll();
      scrollTimeout = null;
    }, 500);
  });

  // 4. Click, Outbound Link, File Download, & CTA Click interceptor
  window.addEventListener('click', (event) => {
    try {
      let target = event.target as HTMLElement | null;
      while (target && target !== document.body) {
        if (target.tagName === 'A') {
          const anchor = target as HTMLAnchorElement;
          const href = anchor.getAttribute('href') || '';
          const text = anchor.innerText?.trim() || anchor.getAttribute('aria-label') || '';

          // File Download Tracking
          const fileExtensions = /\.(zip|pdf|docx|doc|xlsx|xls|csv|epub|mp4|mp3)$/i;
          if (fileExtensions.test(href)) {
            trackCustomEvent('file_download', {
              file_name: href.split('/').pop() || 'unknown',
              file_extension: href.match(fileExtensions)?.[1]?.toLowerCase() || 'unknown',
              url: href,
              link_text: text,
            });
            return;
          }

          // Outbound Link Tracking
          if (href.startsWith('http') && !href.includes(window.location.hostname)) {
            trackCustomEvent('outbound_link_click', {
              target_url: href,
              link_text: text,
            });
            return;
          }

          // CTA Tracking
          const isCta = anchor.classList.contains('bg-gradient-to-r') ||
                        anchor.classList.contains('bg-blue-600') ||
                        /launch|start|explore|get\s*started/i.test(text);
          if (isCta) {
            trackCustomEvent('cta_click', {
              cta_name: text || 'CTA Link',
              target_url: href,
            });
          }
          break;
        } else if (target.tagName === 'BUTTON') {
          const button = target as HTMLButtonElement;
          const text = button.innerText?.trim() || button.getAttribute('aria-label') || '';
          const isCta = button.classList.contains('bg-blue-600') ||
                        button.classList.contains('bg-gradient-to-r') ||
                        /launch|start|explore|submit|calculate|guess|retry/i.test(text);
          if (isCta) {
            trackCustomEvent('cta_click', {
              cta_name: text || 'CTA Button',
              button_type: button.type || 'button',
            });
          }
          break;
        }
        target = target.parentElement;
      }
    } catch (e) {
      console.warn('[Analytics] Dynamic click tracking error:', e);
    }
  }, true);
}

/**
 * Sets up background session heartbeats and active session timers.
 */
function setupSessionTracking(): void {
  const sessionStartTime = Date.now();
  trackCustomEvent('session_start');

  // Trigger user engagement heartbeats every 60 seconds
  const heartbeatInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      const durationSec = Math.round((Date.now() - sessionStartTime) / 1000);
      trackCustomEvent('user_engagement', {
        duration_seconds: durationSec,
        engagement_time_msec: 60000,
      });
    }
  }, 60000);

  // Track session duration at unload
  window.addEventListener('beforeunload', () => {
    const durationSec = Math.round((Date.now() - sessionStartTime) / 1000);
    trackCustomEvent('session_end', {
      session_duration_seconds: durationSec,
    });
    clearInterval(heartbeatInterval);
  });
}

/**
 * Tracks an application error (React crash, network failure, database failure).
 */
export function trackError(type: string, message: string, fatal: boolean = false, stack?: string): void {
  trackCustomEvent('exception', {
    exception_type: type,
    description: message,
    fatal: fatal,
    stack_trace: stack || 'N/A',
  });
}

/**
 * Tracks a web performance metric.
 */
export function trackPerformanceMetric(name: string, value: number, rating?: string): void {
  trackCustomEvent('performance_metric', {
    metric_name: name,
    metric_value: value,
    metric_rating: rating || (value < 1000 ? 'Good' : value < 3000 ? 'Needs Improvement' : 'Poor'),
  });
}

/**
 * Tracks user interaction with UI navigation links or actions.
 */
export function trackNavigation(element: string, type: 'navbar' | 'footer' | 'cta' | 'link', targetUrl: string): void {
  trackCustomEvent('navigation_click', {
    clicked_element: element,
    interaction_type: type,
    target_url: targetUrl,
  });
}

// --- Concrete Predefined Analytics Trackers ---

/**
 * Tracks Authentication Events.
 */
export const trackAuth = {
  login: (method: string, email?: string) => {
    trackCustomEvent('login', { method, user_email: email });
  },
  signUp: (method: string, email?: string) => {
    trackCustomEvent('sign_up', { method, user_email: email });
  },
  logout: () => {
    trackCustomEvent('logout');
  },
  failedLogin: (email: string, error: string) => {
    trackCustomEvent('failed_login', { user_email: email, error_message: error });
  },
  passwordReset: (email: string) => {
    trackCustomEvent('password_reset_requested', { user_email: email });
  },
  emailVerificationSent: (email: string) => {
    trackCustomEvent('email_verification_sent', { user_email: email });
  },
  accountDeleted: (method: string, email?: string) => {
    trackCustomEvent('account_deleted', { method, user_email: email, timestamp: new Date().toISOString() });
  },
};

/**
 * Tracks Challenge Events (streaks, started, completed, failed).
 */
export const trackChallenge = {
  start: (challengeId: string, title: string, category: string) => {
    trackCustomEvent('challenge_started', { challenge_id: challengeId, challenge_title: title, category });
  },
  complete: (challengeId: string, title: string, category: string, streakCount: number, rewardCoins?: number, rewardXp?: number) => {
    trackCustomEvent('challenge_completed', {
      challenge_id: challengeId,
      challenge_title: title,
      category,
      streak_count: streakCount,
      reward_coins: rewardCoins,
      reward_xp: rewardXp,
      completion_percentage: 100,
    });
  },
  failed: (challengeId: string, title: string, category: string) => {
    trackCustomEvent('challenge_failed', { challenge_id: challengeId, challenge_title: title, category });
  },
  streakUpdate: (streakCount: number) => {
    trackCustomEvent('challenge_streak_updated', { current_streak: streakCount });
  },
};

/**
 * Tracks Badge System Events (earned, viewed).
 */
export const trackBadge = {
  earned: (badgeId: string, badgeName: string, isRare: boolean = false) => {
    trackCustomEvent('badge_earned', { badge_id: badgeId, badge_name: badgeName, is_rare: isRare });
  },
  viewed: (badgeId: string, badgeName: string) => {
    trackCustomEvent('badge_viewed', { badge_id: badgeId, badge_name: badgeName });
  },
};

/**
 * Tracks User Progress System (XP, level up, coins change).
 */
export const trackUserStats = {
  levelUp: (newLevel: number) => {
    trackCustomEvent('level_up', { new_level: newLevel });
  },
  xpEarned: (amount: number, currentXp: number, reason: string) => {
    trackCustomEvent('xp_earned', { amount, current_xp: currentXp, reason });
  },
  coinsUpdated: (amount: number, currentCoins: number, reason: string) => {
    trackCustomEvent('coins_updated', { amount, current_coins: currentCoins, reason });
  },
};

/**
 * Tracks AI features (Gemini messaging, responses, etc.).
 */
export const trackAIFeature = {
  messageSent: (messageLength: number, featuresUsed: string[]) => {
    trackCustomEvent('ai_message_sent', { message_length: messageLength, features_used: featuresUsed });
  },
  responseGenerated: (durationMs: number, responseLength: number, errorOccurred: boolean = false) => {
    trackCustomEvent('ai_response_generated', {
      duration_ms: durationMs,
      response_length: responseLength,
      error_occurred: errorOccurred,
    });
  },
  aiWindowOpened: () => {
    trackCustomEvent('ai_opened');
  },
  aiWindowClosed: () => {
    trackCustomEvent('ai_closed');
  },
};

/**
 * Tracks Games played (started, finished, score updates).
 */
export const trackGames = {
  opened: (gameId: string, gameName: string) => {
    trackCustomEvent('game_opened', { game_id: gameId, game_name: gameName });
  },
  start: (gameId: string, gameName: string) => {
    trackCustomEvent('game_started', { game_id: gameId, game_name: gameName });
  },
  complete: (gameId: string, gameName: string, score: number, highScoreUpdated: boolean, timeSpentSeconds: number) => {
    trackCustomEvent('game_completed', {
      game_id: gameId,
      game_name: gameName,
      score,
      high_score_updated: highScoreUpdated,
      time_spent_seconds: timeSpentSeconds,
    });
  },
  paused: (gameId: string) => {
    trackCustomEvent('game_paused', { game_id: gameId });
  },
  resumed: (gameId: string) => {
    trackCustomEvent('game_resumed', { game_id: gameId });
  },
  retry: (gameId: string, gameName: string) => {
    trackCustomEvent('game_retry', { game_id: gameId, game_name: gameName });
  },
  abandoned: (gameId: string, gameName: string, score: number) => {
    trackCustomEvent('game_abandoned', { game_id: gameId, game_name: gameName, score });
  },
  scoreUpdate: (gameId: string, score: number) => {
    trackCustomEvent('game_score_updated', { game_id: gameId, current_score: score });
  },
};

/**
 * Tracks user learning progress (reading blog/news).
 */
export const trackLearning = {
  articleRead: (articleId: string, title: string, category: string, readDurationSeconds?: number) => {
    trackCustomEvent('article_read', {
      article_id: articleId,
      title,
      category,
      read_duration_seconds: readDurationSeconds,
    });
  },
  articleCompleted: (articleId: string, title: string, category: string, readDurationSeconds: number) => {
    trackCustomEvent('article_completed', {
      article_id: articleId,
      title,
      category,
      read_duration_seconds: readDurationSeconds,
    });
  },
  scrollDepth: (articleId: string, title: string, depthPercent: number) => {
    trackCustomEvent('article_scroll_depth', {
      article_id: articleId,
      title,
      depth_percent: depthPercent,
    });
  },
  progressUpdate: (step: string, percentComplete: number) => {
    trackCustomEvent('learning_progress', { step, percent_complete: percentComplete });
  },
};

/**
 * Tracks Contact Page Events.
 */
export const trackContact = {
  pageOpened: () => {
    trackCustomEvent('contact_page_opened');
  },
  formStarted: () => {
    trackCustomEvent('contact_form_started');
  },
  formSubmitted: (status: 'success' | 'failed', emailSent: boolean, durationMs: number, hasSubject: boolean, length: number, errorMsg?: string) => {
    trackCustomEvent('contact_form_submitted', {
      status,
      email_sent: emailSent,
      duration_ms: durationMs,
      has_subject: hasSubject,
      message_length: length,
      error_message: errorMsg,
    });
  },
};

/**
 * Tracks Web Performance and Network Latencies.
 */
export const trackPerformance = {
  apiCall: (endpoint: string, durationMs: number, status: number) => {
    trackCustomEvent('api_performance', {
      endpoint,
      duration_ms: durationMs,
      status_code: status,
    });
  },
  slowPageDetected: (path: string, loadTimeMs: number) => {
    trackCustomEvent('slow_page', {
      page_path: path,
      load_time_ms: loadTimeMs,
    });
  },
};

/**
 * Tracks site search.
 */
export const trackSearch = (query: string, resultCount: number, isEmpty: boolean = false) => {
  trackCustomEvent('search', {
    search_term: query,
    results_count: resultCount,
    is_empty: isEmpty || resultCount === 0,
  });
};

/**
 * Tracks custom CTA or action button clicks.
 */
export const trackButtonClick = (buttonName: string, buttonType: 'cta' | 'download' | 'external' | 'general', targetUrl?: string) => {
  trackCustomEvent('button_click', {
    button_name: buttonName,
    button_type: buttonType,
    target_url: targetUrl,
  });
};

/**
 * Tracks profile actions, settings, feedback, system notifications.
 */
export const trackUserActions = {
  profileUpdate: (fieldsUpdated: string[]) => {
    trackCustomEvent('profile_updated', { fields_updated: fieldsUpdated });
  },
  settingChanged: (settingKey: string, newValue: string | boolean) => {
    trackCustomEvent('setting_changed', { setting: settingKey, value: newValue });
  },
  feedbackSubmitted: (category: string, sentiment: string) => {
    trackCustomEvent('feedback_submitted', { category, sentiment });
  },
  notificationClicked: (notificationId: string, title: string) => {
    trackCustomEvent('notification_clicked', { notification_id: notificationId, notification_title: title });
  },
  socialInteraction: (action: string, targetId: string) => {
    trackCustomEvent('social_interaction', { action, target_id: targetId });
  },
};

/**
 * Tracks SRM Events & Opportunities interaction.
 */
export const trackEvents = {
  viewList: (count: number, filters?: Record<string, any>) => {
    trackCustomEvent('events_list_viewed', { events_count: count, ...filters });
  },
  clickRegistration: (eventId: string | undefined, title: string, url: string, category: string) => {
    trackCustomEvent('event_registration_clicked', {
      event_id: eventId || 'unknown',
      event_title: title,
      registration_url: url,
      category,
    });
  },
  clickOfficialSource: (eventId: string | undefined, title: string, url: string) => {
    trackCustomEvent('event_source_clicked', {
      event_id: eventId || 'unknown',
      event_title: title,
      source_url: url,
    });
  },
  filterChanged: (filterType: string, filterValue: string) => {
    trackCustomEvent('event_filter_changed', { filter_type: filterType, filter_value: filterValue });
  },
  search: (query: string, resultsCount: number) => {
    trackCustomEvent('event_searched', { search_query: query, results_count: resultsCount });
  },
};

/**
 * Tracks GPA & CGPA Calculator operations.
 */
export const trackGpa = {
  courseAdded: (courseName: string, credits: number, gradePoints: number) => {
    trackCustomEvent('gpa_course_added', { course_name: courseName, credits, grade_points: gradePoints });
  },
  courseRemoved: (courseId: string) => {
    trackCustomEvent('gpa_course_removed', { course_id: courseId });
  },
  semAdded: (semName: string, sgpa: number, credits: number) => {
    trackCustomEvent('gpa_sem_added', { semester_name: semName, sgpa, credits });
  },
  scaleChanged: (newScale: number) => {
    trackCustomEvent('gpa_scale_changed', { new_scale: newScale });
  },
  recordSaved: (type: 'sgpa' | 'cgpa', score: number, credits: number) => {
    trackCustomEvent('gpa_record_saved', { calculation_type: type, score, credits });
  },
  recordDeleted: (recordId: string) => {
    trackCustomEvent('gpa_record_deleted', { record_id: recordId });
  },
};

/**
 * Tracks Admin Dashboard actions.
 */
export const trackAdmin = {
  contentPublished: (category: string, title: string, author: string) => {
    trackCustomEvent('admin_content_published', { category, title, author });
  },
  contentEdited: (id: string, category: string, title: string) => {
    trackCustomEvent('admin_content_edited', { content_id: id, category, title });
  },
  contentDeleted: (id: string, category: string) => {
    trackCustomEvent('admin_content_deleted', { content_id: id, category });
  },
  aiPipelineRun: (category: string, prompt: string) => {
    trackCustomEvent('admin_ai_pipeline_run', { category, prompt_length: prompt.length });
  },
  eventSyncRun: () => {
    trackCustomEvent('admin_event_sync_triggered');
  },
};

/**
 * Tracks user Privacy & Cookie Consent.
 */
export const trackConsent = {
  cookieChoice: (choice: 'accepted' | 'declined' | 'customized') => {
    trackCustomEvent('privacy_cookie_consent', { choice });
  },
  locationChoice: (status: 'granted' | 'declined' | 'customized') => {
    trackCustomEvent('privacy_location_consent', { status });
  },
};

/**
 * Tracks Content / Blog grid card interactions.
 */
export const trackContentGrid = {
  cardClicked: (category: string, id: string, title: string) => {
    trackCustomEvent('content_card_clicked', { category, content_id: id, title });
  },
};

