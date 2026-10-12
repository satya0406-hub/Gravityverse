import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, 
  Lock, 
  User as UserIcon, 
  ArrowRight, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  KeyRound, 
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Check
} from 'lucide-react';
import { cn, getAssetPath, getApiBaseUrl } from '../lib/utils';

interface AuthPageProps {
  mode?: 'login' | 'register';
}

export function AuthPage({ mode = 'login' }: AuthPageProps) {
  const { 
    user, 
    loginWithGoogle, 
    loginWithEmail, 
    registerWithEmail, 
    resetPassword,
    signingIn, 
    authNotice, 
    setAuthNotice 
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [isRegister, setIsRegister] = useState(mode === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Show / Hide password toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Inline Email Verification State for Registration
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifiedEmailAddress, setVerifiedEmailAddress] = useState('');
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [regVerificationCode, setRegVerificationCode] = useState('');
  const [regVerificationToken, setRegVerificationToken] = useState('');
  const [sendingRegCode, setSendingRegCode] = useState(false);
  const [verifyingRegCode, setVerifyingRegCode] = useState(false);
  const [regCodeCooldown, setRegCodeCooldown] = useState(0);
  const [regNotice, setRegNotice] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  // Forgot password flow multi-step state: 'email' | 'code' | 'password' | 'success'
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState<'email' | 'code' | 'password' | 'success'>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const [localError, setLocalError] = useState<string | null>(null);

  // Resend code cooldown countdown
  useEffect(() => {
    if (regCodeCooldown <= 0) return;
    const timer = setInterval(() => {
      setRegCodeCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [regCodeCooldown]);

  useEffect(() => {
    setIsRegister(mode === 'register');
    setLocalError(null);
    setAuthNotice(null);
    setRegNotice(null);
  }, [mode, setAuthNotice]);

  useEffect(() => {
    if (user) {
      const from = (location.state as any)?.from?.pathname || '/profile';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  const handleEmailChange = (newVal: string) => {
    setEmail(newVal);
    // If email changes after being verified, invalidate the verification status
    if (emailVerified && newVal.trim().toLowerCase() !== verifiedEmailAddress.toLowerCase()) {
      setEmailVerified(false);
      setVerifiedEmailAddress('');
      setRegVerificationToken('');
      setRegNotice(null);
    }
  };

  // STEP: Send Registration Email Verification Code
  const handleSendEmailVerificationCode = async (e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.preventDefault();
    setLocalError(null);
    setAuthNotice(null);
    setRegNotice(null);

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setRegNotice({
        type: 'error',
        text: 'Please enter a valid email address to verify.'
      });
      return;
    }

    setSendingRegCode(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/auth/send-register-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch verification code.');
      }

      setIsVerifyingEmail(true);
      setRegCodeCooldown(data.cooldownSeconds || 30);
      setRegNotice({
        type: 'info',
        text: "We've sent a verification code to your email."
      });
    } catch (err: any) {
      setRegNotice({
        type: 'error',
        text: err.message || 'Could not send verification code. Please check your email and try again.'
      });
    } finally {
      setSendingRegCode(false);
    }
  };

  // STEP: Verify 6-digit Code for Registration
  const handleVerifyEmailCode = async (e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.preventDefault();
    setLocalError(null);
    setAuthNotice(null);
    setRegNotice(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = regVerificationCode.trim();

    if (!cleanCode || cleanCode.length < 6) {
      setRegNotice({
        type: 'error',
        text: 'Please enter the complete 6-digit verification code.'
      });
      return;
    }

    setVerifyingRegCode(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/auth/verify-register-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, code: cleanCode })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid verification code.');
      }

      setEmailVerified(true);
      setVerifiedEmailAddress(cleanEmail);
      setRegVerificationToken(data.verificationToken || '');
      setIsVerifyingEmail(false);
      setRegVerificationCode('');
      setRegNotice({
        type: 'success',
        text: 'Email verified ✓'
      });
    } catch (err: any) {
      setRegNotice({
        type: 'error',
        text: err.message || 'Verification failed. Please double-check your code.'
      });
    } finally {
      setVerifyingRegCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setAuthNotice(null);

    if (isRegister) {
      if (!displayName.trim()) {
        setLocalError('Please enter your full name.');
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        setLocalError('Please enter your email address.');
        return;
      }

      // Check if email has been verified
      if (!emailVerified || cleanEmail !== verifiedEmailAddress.toLowerCase()) {
        setLocalError('Please verify your email before creating your account.');
        setRegNotice({
          type: 'error',
          text: 'Please verify your email before creating your account.'
        });
        return;
      }

      if (!password) {
        setLocalError('Please enter a password.');
        return;
      }

      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters long.');
        return;
      }

      if (password !== confirmPassword) {
        setLocalError('Passwords do not match. Please double-check.');
        return;
      }

      try {
        await registerWithEmail(cleanEmail, password, displayName.trim(), regVerificationToken);
      } catch (err: any) {
        if (!authNotice) {
          setLocalError(err.message || 'Registration failed. Please try again.');
        }
      }
      return;
    }

    // Login Flow
    if (!email.trim() || !password) {
      setLocalError('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }

    try {
      await loginWithEmail(email.trim(), password);
    } catch (err: any) {
      if (!authNotice) {
        setLocalError(err.message || 'Authentication failed. Please verify your credentials.');
      }
    }
  };

  // STEP 1: Send Reset Code
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setAuthNotice(null);

    const targetEmail = resetEmail.trim() || email.trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    setResetLoading(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/auth/send-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch verification code.');
      }

      setResetEmail(targetEmail);
      setResetStep('code');
      setAuthNotice(`Verification code dispatched to ${targetEmail}`);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to send verification code. Please check your email.');
    } finally {
      setResetLoading(false);
    }
  };

  // STEP 2: Verify Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setAuthNotice(null);

    if (!verificationCode.trim() || verificationCode.trim().length !== 6) {
      setLocalError('Please enter the full 6-digit verification code.');
      return;
    }

    setResetLoading(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/auth/verify-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, code: verificationCode.trim() })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Verification code failed or expired.');
      }

      setResetToken(data.resetToken);
      setResetStep('password');
      setAuthNotice('Code verified successfully. Please set your new password.');
    } catch (err: any) {
      setLocalError(err.message || 'Invalid or expired verification code.');
    } finally {
      setResetLoading(false);
    }
  };

  // STEP 3: Change Password
  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setAuthNotice(null);

    if (!newPassword || !confirmNewPassword) {
      setLocalError('Please fill in both password fields.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setLocalError('Passwords do not match. Please retype carefully.');
      return;
    }

    if (newPassword.length < 6) {
      setLocalError('New password must be at least 6 characters long.');
      return;
    }

    setResetLoading(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/auth/confirm-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail,
          resetToken,
          newPassword
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to change password.');
      }

      setResetStep('success');
      setAuthNotice('Password changed successfully! You may now sign in.');
    } catch (err: any) {
      setLocalError(err.message || 'Failed to update password.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    setAuthNotice(null);
    await loginWithGoogle();
  };

  return (
    <div className="min-h-screen pt-28 pb-20 px-4 flex items-center justify-center relative bg-[#070a13] overflow-hidden">
      {/* Background glow ambient effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-blue/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md z-10"
      >
        <div className="bg-[#0b0f1a]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
          {/* Top header & logo */}
          <div className="text-center space-y-3 mb-8">
            <Link to="/" className="inline-flex items-center gap-3 group focus:outline-none">
              <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg shadow-blue-500/20 border border-white/10 group-hover:scale-105 transition-transform">
                <img src={getAssetPath('chatbot-logo.png')} alt="GravityVerse Logo" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col items-start leading-none gap-0.5">
                <span className="font-serif text-lg font-black tracking-wider text-slate-100 uppercase">Gravity</span>
                <span className="font-serif text-xs font-black italic tracking-widest text-brand-blue uppercase">Verse</span>
              </div>
            </Link>

            <h1 className="text-2xl font-bold font-serif text-white tracking-tight pt-2">
              {showForgotPassword 
                ? 'Reset Password' 
                : isRegister 
                  ? 'Create Your Account' 
                  : 'Welcome Back'}
            </h1>
            <p className="text-xs text-gray-400">
              {showForgotPassword
                ? 'Enter your account email to receive a secure password reset link.'
                : isRegister 
                  ? 'Join GravityVerse to access AI tools, games, and performance analytics.' 
                  : 'Access your persistent profile, game progress, and saved sessions.'}
            </p>
          </div>

          {!showForgotPassword && (
            <>
              {/* Primary Google OAuth Button */}
              <div className="space-y-3 mb-6">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  type="button"
                  aria-label="Continue with Google"
                  className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-3 shadow-lg shadow-white/5 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-blue"
                >
                  {signingIn ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>{signingIn ? 'Connecting...' : 'Continue with Google'}</span>
                </button>
                <p className="text-[10px] text-center text-gray-500 font-medium">
                  ✨ Automatic account creation — no separate registration required.
                </p>
              </div>

              {/* Divider */}
              <div className="relative flex items-center justify-center my-6">
                <div className="border-t border-white/10 w-full" />
                <span className="bg-[#0b0f1a] px-3 text-[10px] font-black text-gray-500 uppercase tracking-widest absolute">
                  Or continue with email
                </span>
              </div>
            </>
          )}

          {/* Banner Notifications */}
          {(authNotice || localError) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "p-3.5 rounded-2xl mb-6 text-xs flex items-start gap-3 border",
                authNotice?.includes("sent") || authNotice?.includes("linked")
                  ? "bg-green-500/10 border-green-500/20 text-green-300"
                  : authNotice 
                    ? "bg-blue-500/10 border-blue-500/20 text-blue-300" 
                    : "bg-red-500/10 border-red-500/20 text-red-300"
              )}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1 leading-relaxed">
                <p className="font-semibold">{authNotice || localError}</p>
              </div>
            </motion.div>
          )}

          {/* Forgot Password Flow */}
          {showForgotPassword ? (
            <div className="space-y-4">
              {/* Step Indicators */}
              <div className="flex items-center justify-between gap-1 mb-4">
                {['email', 'code', 'password', 'success'].map((s, idx) => {
                  const stepIndex = ['email', 'code', 'password', 'success'].indexOf(resetStep);
                  const isDone = idx < stepIndex;
                  const isCurrent = idx === stepIndex;
                  return (
                    <div key={s} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={cn(
                          "w-full h-1 rounded-full transition-colors",
                          isDone
                            ? "bg-green-500"
                            : isCurrent
                            ? "bg-brand-blue"
                            : "bg-white/10"
                        )}
                      />
                      <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                        {idx === 0 ? 'Email' : idx === 1 ? 'Code' : idx === 2 ? 'New Pass' : 'Done'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* STEP 1: Enter Email */}
              {resetStep === 'email' && (
                <form onSubmit={handleSendResetCode} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                      Account Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={resetEmail || email}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-blue transition-colors"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                  >
                    {resetLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <>
                        <span>Proceed</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetStep('email');
                      setLocalError(null);
                    }}
                    className="w-full py-2 text-center text-xs text-gray-400 hover:text-white transition-colors block mt-2"
                  >
                    Cancel and return to Sign In
                  </button>
                </form>
              )}

              {/* STEP 2: Enter 6-digit Code */}
              {resetStep === 'code' && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1">
                    <p className="font-semibold">Verification Code Sent</p>
                    <p className="text-[11px] text-gray-300">
                      Enter the 6-digit code sent to <span className="font-bold text-white">{resetEmail}</span>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                      6-Digit Verification Code
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-base font-mono font-bold tracking-[0.3em] text-center text-brand-blue placeholder-gray-600 focus:outline-none focus:border-brand-blue transition-colors"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                  >
                    {resetLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <>
                        <span>Reset Password</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setResetStep('email');
                        setLocalError(null);
                      }}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      Change Email
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleSendResetCode(e as any)}
                      className="text-brand-blue font-bold hover:underline"
                    >
                      Resend Code
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: Enter New Password */}
              {resetStep === 'password' && (
                <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showNewPassword ? "text" : "password"}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-blue transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showConfirmNewPassword ? "text" : "password"}
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-blue transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      >
                        {showConfirmNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                  >
                    {resetLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <>
                        <span>Change Password</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* STEP 4: Success Confirmation */}
              {resetStep === 'success' && (
                <div className="text-center py-6 space-y-4">
                  <div className="w-14 h-14 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto border border-green-500/30 shadow-lg shadow-green-500/20">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white font-serif">Password Updated!</h3>
                    <p className="text-xs text-gray-300">
                      Your password for <span className="text-white font-bold">{resetEmail}</span> has been securely changed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetStep('email');
                      setIsRegister(false);
                      setEmail(resetEmail);
                      setLocalError(null);
                    }}
                    className="py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all w-full shadow-lg shadow-blue-500/20"
                  >
                    Sign In With New Password
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Main Login / Register Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 1. Name (Register Only) */}
              {isRegister && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-blue transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* 2. Email Address */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Email Address
                  </label>
                  {isRegister && emailVerified && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Email verified ✓</span>
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Mail className={cn("w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2", emailVerified ? "text-emerald-400" : "text-gray-500")} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    placeholder="name@example.com"
                    className={cn(
                      "w-full bg-white/5 border rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none transition-colors",
                      emailVerified 
                        ? "border-emerald-500/50 focus:border-emerald-400 bg-emerald-500/5 text-emerald-100" 
                        : "border-white/10 focus:border-brand-blue"
                    )}
                  />
                </div>
              </div>

              {/* 3. "Verify Email" Button & Inline Verification UI (Register Only) */}
              {isRegister && (
                <div className="space-y-2">
                  {/* Verify Email Button when unverified and not actively entering code */}
                  {!emailVerified && !isVerifyingEmail && (
                    <button
                      type="button"
                      onClick={handleSendEmailVerificationCode}
                      disabled={sendingRegCode || !email.trim()}
                      className="w-full py-2.5 px-4 bg-brand-blue/15 hover:bg-brand-blue/25 border border-brand-blue/35 hover:border-brand-blue/60 text-brand-blue hover:text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-40 disabled:hover:bg-brand-blue/15 disabled:hover:text-brand-blue"
                    >
                      {sendingRegCode ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-blue" />
                          <span>Sending Verification Code...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Verify Email</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Verification Code Input Panel */}
                  {isVerifyingEmail && !emailVerified && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3.5 rounded-2xl bg-[#091122] border border-brand-blue/30 space-y-3 shadow-lg shadow-blue-950/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-blue-200 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                            <span>We've sent a verification code to your email.</span>
                          </p>
                          <p className="text-[11px] text-gray-400">
                            Check inbox at <span className="text-white font-semibold">{email.trim()}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsVerifyingEmail(false);
                            setRegVerificationCode('');
                            setRegNotice(null);
                          }}
                          className="text-[10px] text-gray-400 hover:text-white underline shrink-0"
                        >
                          Change
                        </button>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                          6-Digit Verification Code
                        </label>
                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            maxLength={6}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoFocus
                            value={regVerificationCode}
                            onChange={(e) => setRegVerificationCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="123456"
                            className="w-full bg-black/50 border border-white/15 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-blue tracking-[0.3em] font-mono transition-colors"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleVerifyEmailCode}
                          disabled={verifyingRegCode || regVerificationCode.trim().length !== 6}
                          className="flex-1 py-2 px-3 bg-brand-blue hover:bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-500/20 disabled:opacity-40"
                        >
                          {verifyingRegCode ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Verifying...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Verify Code</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={handleSendEmailVerificationCode}
                          disabled={sendingRegCode || regCodeCooldown > 0}
                          className="py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white rounded-xl font-semibold text-xs transition-colors disabled:opacity-40 shrink-0"
                        >
                          {regCodeCooldown > 0 ? (
                            `Resend in ${regCodeCooldown}s`
                          ) : (
                            'Resend Code'
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Verified Confirmation Badge */}
                  {emailVerified && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-bold">Email verified ✓</span>
                      </div>
                      <span className="text-[10px] text-emerald-400/80 font-medium">Ready for account creation</span>
                    </motion.div>
                  )}

                  {/* Inline Notice */}
                  {regNotice && (
                    <div className={cn(
                      "p-2.5 rounded-xl text-xs flex items-start gap-2 border",
                      regNotice.type === 'error' && "bg-red-500/10 border-red-500/20 text-red-300",
                      regNotice.type === 'success' && "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
                      regNotice.type === 'info' && "bg-blue-500/10 border-blue-500/20 text-blue-300"
                    )}>
                      {regNotice.type === 'error' ? (
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                      ) : regNotice.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 shrink-0 text-brand-blue mt-0.5" />
                      )}
                      <div className="flex-1 leading-relaxed">{regNotice.text}</div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Password
                  </label>
                  {!isRegister && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setResetEmail(email);
                        setLocalError(null);
                        setAuthNotice(null);
                      }}
                      className="text-[10px] font-semibold text-brand-blue hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-blue transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 5. Confirm Password (Register Only) */}
              {isRegister && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-blue transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors focus:outline-none"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* 6. Create Account / Sign In Button */}
              <button
                type="submit"
                disabled={signingIn}
                className="w-full py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 mt-2 active:scale-[0.99]"
              >
                {signingIn ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>{isRegister ? 'Create Account' : 'Sign In'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Toggle between Login and Register */}
          {!showForgotPassword && (
            <div className="mt-6 text-center pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => {
                  const nextIsRegister = !isRegister;
                  setIsRegister(nextIsRegister);
                  setLocalError(null);
                  setAuthNotice(null);
                  navigate(nextIsRegister ? '/register' : '/login', { replace: true });
                }}
                className="text-xs text-gray-400 hover:text-white transition-colors focus:outline-none"
              >
                {isRegister ? (
                  <>Already have an account? <span className="text-brand-blue font-bold">Sign In</span></>
                ) : (
                  <>Don't have an account? <span className="text-brand-blue font-bold">Register</span></>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-[10px] text-gray-500 flex items-center justify-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
          <span>Protected by Firebase Security</span>
        </div>
      </motion.div>
    </div>
  );
}
