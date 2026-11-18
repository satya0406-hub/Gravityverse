import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cookie, X, ArrowRight, ShieldCheck, Sliders, Check, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { trackConsent } from '../lib/analytics';

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  advertising: boolean;
}

const DEFAULT_PREFS: CookiePreferences = {
  essential: true,
  analytics: true,
  advertising: true,
};

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFS);

  // Load existing preferences or show initial notice
  useEffect(() => {
    const rawConsent = localStorage.getItem('gv-cookie-consent');
    if (!rawConsent) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      try {
        const parsed = JSON.parse(rawConsent);
        if (typeof parsed === 'object' && parsed !== null) {
          setPreferences({
            essential: true,
            analytics: parsed.analytics ?? true,
            advertising: parsed.advertising ?? true,
          });
        }
      } catch {
        if (rawConsent === 'declined' || rawConsent === 'essential_only') {
          setPreferences({ essential: true, analytics: false, advertising: false });
        } else {
          setPreferences({ essential: true, analytics: true, advertising: true });
        }
      }
    }
  }, []);

  // Listen for programmatic open requests (e.g. from footer, privacy policy page)
  useEffect(() => {
    const handleOpenSettings = () => {
      setShowCustomizeModal(true);
      setIsVisible(true);
    };

    window.addEventListener('gv-open-cookie-settings', handleOpenSettings);
    return () => {
      window.removeEventListener('gv-open-cookie-settings', handleOpenSettings);
    };
  }, []);

  const savePreferences = (prefs: CookiePreferences, choiceType: 'accepted' | 'declined' | 'customized') => {
    localStorage.setItem('gv-cookie-consent', JSON.stringify({
      ...prefs,
      timestamp: Date.now(),
      choice: choiceType,
    }));
    setPreferences(prefs);
    trackConsent.cookieChoice(choiceType);
    setIsVisible(false);
    setShowCustomizeModal(false);
  };

  const handleAcceptAll = () => {
    savePreferences({ essential: true, analytics: true, advertising: true }, 'accepted');
  };

  const handleEssentialOnly = () => {
    savePreferences({ essential: true, analytics: false, advertising: false }, 'declined');
  };

  const handleSaveCustom = () => {
    savePreferences(preferences, 'customized');
  };

  // Launch Google CMP revocation if available
  const handleOpenGoogleCmp = () => {
    const gfc = (window as any).googlefc;
    if (gfc && typeof gfc.showRevocationMessage === 'function') {
      try {
        gfc.showRevocationMessage();
      } catch (err) {
        console.warn('Unable to show Google CMP revocation:', err);
      }
    } else {
      alert('Google Certified Consent Management is active for applicable EU/EEA/UK visitors. You can also manage ad settings at adssettings.google.com.');
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Main Floating Banner */}
          {!showCustomizeModal && (
            <motion.div
              id="cookie-consent-container"
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-4 right-4 left-4 sm:bottom-6 sm:right-6 sm:left-auto sm:max-w-lg z-50 bg-[#070b16]/95 border border-white/15 backdrop-blur-2xl p-5 sm:p-6 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.7)] flex flex-col gap-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center text-brand-blue shrink-0 shadow-md">
                    <Cookie className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-sm tracking-wide">Privacy & Cookie Preferences</h4>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Transparency & User Choice</p>
                  </div>
                </div>
                <button
                  id="close-cookie-banner"
                  onClick={() => setIsVisible(false)}
                  className="text-slate-400 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-xl cursor-pointer"
                  aria-label="Dismiss cookie notice"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                GravityVerse uses essential cookies for site functionality and security. We also use analytics and third-party advertising partners (including <strong className="text-white">Google AdSense</strong>) to keep our student tools free. In regions subject to GDPR & UK regulations, Google's certified Consent Management Platform directly manages ad consent.
              </p>

              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span>Learn more in our</span>
                <Link
                  to="/privacy"
                  onClick={() => setIsVisible(false)}
                  className="text-brand-blue hover:text-blue-400 underline font-semibold inline-flex items-center gap-1"
                >
                  Privacy Policy <ArrowRight className="w-2.5 h-2.5" />
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-end pt-2 border-t border-white/10">
                <button
                  id="customize-cookies"
                  onClick={() => setShowCustomizeModal(true)}
                  className="px-3.5 py-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Customize</span>
                </button>

                <button
                  id="decline-cookies"
                  onClick={handleEssentialOnly}
                  className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Essential Only
                </button>

                <button
                  id="accept-cookies"
                  onClick={handleAcceptAll}
                  className="px-5 py-2.5 bg-brand-blue hover:bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer"
                >
                  Accept All
                </button>
              </div>
            </motion.div>
          )}

          {/* Detailed Customization Modal */}
          {showCustomizeModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#0b0f19] border border-white/15 w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-left relative max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center text-brand-blue shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Consent Preferences</h3>
                      <p className="text-xs text-slate-400">Manage how data and cookies are used</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowCustomizeModal(false);
                      setIsVisible(false);
                    }}
                    className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Essential */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Essential Cookies</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Always Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Required for security, user authentication, session persistence, and basic navigation. Cannot be disabled.
                    </p>
                  </div>

                  {/* Analytics */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Analytics & Performance</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences.analytics}
                          onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                      </label>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Helps us measure page speed, traffic flow, and feature usage to improve academic study utilities.
                    </p>
                  </div>

                  {/* Advertising */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Advertising & Third-Party</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences.advertising}
                          onChange={(e) => setPreferences({ ...preferences, advertising: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                      </label>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Allows Google AdSense to serve relevant ads that fund the platform. For EEA/UK users, Google's certified CMP handles granular advertising partner consent.
                    </p>
                  </div>
                </div>

                {/* Google CMP Link Option for EEA/UK */}
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between gap-3 text-xs">
                  <div className="text-blue-200 text-[11px] leading-relaxed">
                    EEA / UK / Swiss user? You can also launch Google's certified CMP dialog:
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenGoogleCmp}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[10px] whitespace-nowrap cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    <span>Google CMP</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                  <Link
                    to="/privacy"
                    onClick={() => {
                      setShowCustomizeModal(false);
                      setIsVisible(false);
                    }}
                    className="text-xs text-slate-400 hover:text-brand-blue underline"
                  >
                    Read Privacy Policy
                  </Link>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleEssentialOnly}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Reject All Optional
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCustom}
                      className="px-5 py-2 bg-brand-blue hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-500/20 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Preferences</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
