import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, 
  Trash2, 
  X, 
  ShieldAlert, 
  Lock, 
  CheckCircle2, 
  Loader2, 
  KeyRound, 
  Flame, 
  Info,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';
import { trackCustomEvent } from '../lib/analytics';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteAccountModal({ isOpen, onClose, onSuccess }: DeleteAccountModalProps) {
  const { user, deleteAccount, reauthenticateWithGoogle, reauthenticateWithPassword } = useAuth();
  
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [reauthenticated, setReauthenticated] = useState(false);
  const [isReauthing, setIsReauthing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentStep, setCurrentStep] = useState<'warning' | 'reauth' | 'purging'>('warning');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isGoogleUser = user?.providerData?.some(p => p.providerId === 'google.com') ?? false;
  const isConfirmed = confirmText.trim().toUpperCase() === 'DELETE';

  const resetState = () => {
    setConfirmText('');
    setPassword('');
    setShowPassword(false);
    setReauthenticated(false);
    setIsReauthing(false);
    setIsDeleting(false);
    setCurrentStep('warning');
    setStatusMessage('');
    setErrorMessage(null);
  };

  const handleClose = () => {
    if (isDeleting) return;
    resetState();
    onClose();
  };

  const handleGoogleReauth = async () => {
    setErrorMessage(null);
    setIsReauthing(true);
    try {
      await reauthenticateWithGoogle();
      setReauthenticated(true);
      trackCustomEvent('account_deletion_reauth_success', { method: 'google' });
    } catch (err: any) {
      console.error("Google re-auth error:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        setErrorMessage("Verification cancelled. Please complete Google sign-in to proceed.");
      } else {
        setErrorMessage(err.message || "Failed to re-authenticate with Google. Please try again.");
      }
      trackCustomEvent('account_deletion_reauth_failed', { method: 'google', error: err.message });
    } finally {
      setIsReauthing(false);
    }
  };

  const handlePasswordReauth = async () => {
    if (!password) {
      setErrorMessage("Please enter your current password.");
      return;
    }
    setErrorMessage(null);
    setIsReauthing(true);
    try {
      await reauthenticateWithPassword(password);
      setReauthenticated(true);
      trackCustomEvent('account_deletion_reauth_success', { method: 'password' });
    } catch (err: any) {
      console.error("Password re-auth error:", err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMessage("Incorrect password. Please enter your valid current password.");
      } else {
        setErrorMessage(err.message || "Authentication failed. Please verify your password.");
      }
      trackCustomEvent('account_deletion_reauth_failed', { method: 'password', error: err.message });
    } finally {
      setIsReauthing(false);
    }
  };

  const handleExecuteDeletion = async () => {
    if (!isConfirmed) {
      setErrorMessage('Please type "DELETE" to confirm.');
      return;
    }

    setErrorMessage(null);
    setIsDeleting(true);
    setCurrentStep('purging');
    setStatusMessage('Verifying credentials with secure auth server...');

    try {
      // Step 1: Re-authenticate if not already performed
      if (!reauthenticated) {
        if (isGoogleUser) {
          setStatusMessage('Requesting Google identity re-verification...');
          await reauthenticateWithGoogle();
          setReauthenticated(true);
        } else {
          if (!password) {
            setIsDeleting(false);
            setCurrentStep('reauth');
            setErrorMessage('Password is required to confirm account deletion.');
            return;
          }
          setStatusMessage('Verifying password credentials...');
          await reauthenticateWithPassword(password);
          setReauthenticated(true);
        }
      }

      // Step 2: Delete server-side user data and Firebase Auth record
      setStatusMessage('Permanently purging user records, chats, and academic logs...');
      await deleteAccount(isGoogleUser ? undefined : password);

      setStatusMessage('Account successfully purged.');
      
      // Step 3: Trigger callback
      setTimeout(() => {
        resetState();
        onSuccess();
      }, 600);
    } catch (err: any) {
      console.error("Account deletion failed:", err);
      setIsDeleting(false);
      setStatusMessage('');
      setErrorMessage(err.message || "Failed to delete account. Please re-authenticate and try again.");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && user && (
        <div id="delete-account-modal-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal Dialog Card */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-xl bg-[#0d121f] border border-red-500/30 rounded-3xl overflow-hidden shadow-2xl shadow-red-950/40 my-8 z-10"
        >
          {/* Header Bar */}
          <div className="p-6 sm:p-7 border-b border-red-500/20 bg-gradient-to-r from-red-950/40 via-red-900/20 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 bg-red-500/20 rounded-2xl flex items-center justify-center border border-red-500/30 shrink-0 shadow-inner">
                <AlertTriangle className="w-6 h-6 text-red-400 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold font-serif text-white tracking-tight flex items-center gap-2">
                  Delete Account
                </h3>
                <p className="text-xs text-red-400/90 font-medium">
                  Permanent & Irreversible Purge
                </p>
              </div>
            </div>
            <button
              id="close-delete-modal-btn"
              onClick={handleClose}
              disabled={isDeleting}
              className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 sm:p-7 space-y-6">
            {/* Warning Message Box */}
            <div className="p-4.5 rounded-2xl bg-red-950/30 border border-red-500/25 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs sm:text-sm text-gray-300 leading-relaxed">
                  <p className="font-bold text-red-200">
                    Warning: This action cannot be undone.
                  </p>
                  <p className="text-gray-300">
                    Deleting your account will immediately and permanently erase all personal information associated with your Gravityverse account from our servers:
                  </p>
                </div>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-red-500/20 text-xs text-gray-300 pl-2">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Profile details & preferences
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  All AI conversations & history
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Earned badges & level progress
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Saved GPA / CGPA records
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Access audit logs & metrics
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Login authentication account
                </li>
              </ul>
            </div>

            {/* Account Identifier */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-blue/20 flex items-center justify-center text-brand-blue font-bold text-xs">
                  {user.displayName?.[0] || 'U'}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{user.displayName || 'Gravityverse User'}</p>
                  <p className="text-[11px] text-gray-400">{user.email}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                {isGoogleUser ? 'Google OAuth' : 'Email/Password'}
              </span>
            </div>

            {/* Error Message if any */}
            {errorMessage && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </motion.div>
            )}

            {/* Progress / Status Message */}
            {isDeleting && (
              <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-2">
                <div className="flex items-center gap-3 text-brand-blue font-medium text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
                  <span>{statusMessage || 'Processing permanent deletion...'}</span>
                </div>
                <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-red-500" 
                    initial={{ width: '15%' }}
                    animate={{ width: '90%' }}
                    transition={{ duration: 2, ease: 'easeInOut' }}
                  />
                </div>
              </div>
            )}

            {!isDeleting && (
              <div className="space-y-4">
                {/* Step 1: Confirmation Typing */}
                <div className="space-y-2">
                  <label htmlFor="confirm-delete-input" className="block text-xs font-bold text-gray-300">
                    1. Type <span className="text-red-400 font-mono font-black">DELETE</span> to confirm permanent removal:
                  </label>
                  <input
                    id="confirm-delete-input"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    disabled={isDeleting}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 text-sm font-mono tracking-wider focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/40 transition-all uppercase"
                    autoComplete="off"
                  />
                </div>

                {/* Step 2: Re-Authentication Requirement */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <label className="block text-xs font-bold text-gray-300">
                    2. Security Check (Required Re-Authentication):
                  </label>

                  {isGoogleUser ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        To protect your account from unauthorized deletion, please verify your Google account identity:
                      </p>
                      <button
                        id="google-reauth-btn"
                        type="button"
                        onClick={handleGoogleReauth}
                        disabled={isReauthing || isDeleting}
                        className={cn(
                          "w-full py-3 px-4 rounded-xl border flex items-center justify-center gap-3 text-xs font-bold transition-all",
                          reauthenticated
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-white/5 hover:bg-white/10 border-white/15 text-white hover:border-white/30"
                        )}
                      >
                        {isReauthing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
                            Verifying Google Session...
                          </>
                        ) : reauthenticated ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            Google Identity Verified
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                            Verify with Google Identity
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] text-gray-400">
                        Enter your current password to authorize permanent deletion:
                      </p>
                      <div className="relative">
                        <input
                          id="delete-password-input"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Current password"
                          disabled={isDeleting}
                          className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/40 transition-all"
                          autoComplete="current-password"
                        />
                        <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-white/5 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-end gap-3">
            <button
              id="cancel-delete-account-btn"
              type="button"
              onClick={handleClose}
              disabled={isDeleting}
              className="w-full sm:w-auto px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-300 hover:text-white transition-all uppercase tracking-wider order-2 sm:order-1"
            >
              Cancel
            </button>
            <button
              id="confirm-delete-account-btn"
              type="button"
              onClick={handleExecuteDeletion}
              disabled={!isConfirmed || isDeleting || (isGoogleUser && !reauthenticated && false)}
              className={cn(
                "w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg order-1 sm:order-2",
                isConfirmed && !isDeleting
                  ? "bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 hover:scale-[1.02] active:scale-95 cursor-pointer"
                  : "bg-red-950/40 text-red-300/40 border border-red-900/20 cursor-not-allowed"
              )}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Purging Account...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Permanently Delete Account</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
