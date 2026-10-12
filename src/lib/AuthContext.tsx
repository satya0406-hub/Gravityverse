import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  deleteUser as deleteAuthUser,
  signOut, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  updateProfile as updateAuthProfile,
  linkWithPopup,
  linkWithCredential,
  sendPasswordResetEmail,
  AuthCredential
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDocFromServer, onSnapshot, addDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { handleFirestoreError } from './errorHandler';
import { trackAuth, trackUserActions } from './analytics';
import { getApiBaseUrl } from './utils';
import { getUnlockedBadgesCount } from './badgeUtils';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  signingIn: boolean;
  authNotice: string | null;
  setAuthNotice: (msg: string | null) => void;
  login: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (e: string, p: string) => Promise<void>;
  registerWithEmail: (e: string, p: string, name: string, verificationToken?: string) => Promise<void>;
  resetPassword: (e: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: any) => Promise<void>;
  switchAccount: () => Promise<void>;
  deleteAccount: (passwordOrNull?: string) => Promise<void>;
  reauthenticateWithGoogle: () => Promise<void>;
  reauthenticateWithPassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function formatAuthError(error: any): string {
  if (!error) return 'An unexpected error occurred.';
  const code = error.code || '';
  const msg = typeof error === 'string' ? error : (error.message || String(error));

  if (code === 'auth/network-request-failed' || msg.includes('network-request-failed') || msg.includes('offline')) {
    return 'Network connection error. Please check your internet connection and try again.';
  }
  if (code === 'auth/invalid-email' || msg.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/email-already-in-use' || msg.includes('auth/email-already-in-use')) {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (code === 'auth/weak-password' || msg.includes('auth/weak-password')) {
    return 'Password must be at least 6 characters long.';
  }
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential' || msg.includes('auth/invalid-credential') || msg.includes('auth/user-not-found')) {
    return 'Invalid email or password.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Sign-in popup was closed before completing.';
  }
  if (
    code === 'auth/operation-not-allowed' || 
    code === 'auth/internal-error' ||
    msg.includes('identitytoolkit') || 
    msg.includes('403') || 
    msg.includes('auth/operation-not-allowed') ||
    msg.includes('auth/internal-error')
  ) {
    return 'Email/Password authentication is disabled in Firebase for this project. Please click "Continue with Google" above to sign in or register instantly.';
  }

  if (msg.includes('Firebase: Error')) {
    if (msg.includes('invalid-email')) return 'Please enter a valid email address.';
    if (msg.includes('email-already-in-use')) return 'An account with this email address already exists. Please sign in instead.';
    if (msg.includes('weak-password')) return 'Password must be at least 6 characters long.';
    if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) return 'Invalid email or password.';
  }

  return msg;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<AuthCredential | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    // Validate Connection to Firestore safely
    const testConnection = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        const errorMsg = error?.message || String(error || '');
        if (
          errorMsg.includes('the client is offline') || 
          errorMsg.includes('Could not reach Cloud Firestore') ||
          errorMsg.includes('network-request-failed') ||
          error?.code === 'auth/network-request-failed'
        ) {
          console.warn("Firestore connection check notice:", errorMsg);
        } else {
          console.log("Firestore connection check info:", errorMsg);
        }
      }
    };
    // Defer test connection slightly to allow initial auth state resolution
    const connTimer = setTimeout(() => {
      testConnection().catch(() => {});
    }, 1000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Cleanup previous profile listener
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }

      setUser(user);
      
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        
        // Log access
        addDoc(collection(db, `users/${user.uid}/accessLogs`), {
          action: 'Authorized Session Established',
          type: 'login',
          source: 'Firebase Auth',
          timestamp: serverTimestamp()
        }).catch(e => console.warn("Failed to log access:", e));

        try {
          unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              setProfile(data);
              
              // Ensure photoURL/displayName from Google identity are merged without destroying game/badge history
              if (user.photoURL && data.photoURL !== user.photoURL) {
                setDoc(userDocRef, { photoURL: user.photoURL }, { merge: true }).catch(() => {});
              }
              if (user.displayName && !data.displayName) {
                setDoc(userDocRef, { displayName: user.displayName }, { merge: true }).catch(() => {});
              }

              const badgeCount = getUnlockedBadgesCount(data);
              localStorage.setItem('gravity_user_badge_count', String(badgeCount));
            } else {
              // Auto-create new Gravityverse account profile on first Google OAuth sign in
              const newProfile = {
                displayName: user.displayName || 'Gravityverse User',
                email: user.email || 'no-email@gravityverse.ai',
                photoURL: user.photoURL || '',
                conversationsCount: 0,
                progress: 0,
                totalBadges: 0,
                badges: ['Early Adopter'],
                lastActive: serverTimestamp(),
                createdAt: serverTimestamp(),
              };
              setDoc(userDocRef, newProfile).catch(e => {
                console.warn("Could not write initial user profile:", e);
              });
              trackAuth.signUp(user.providerData[0]?.providerId || 'Google', user.email || '');
            }
          }, (err) => {
            if (err?.message?.includes('offline') || err?.code === 'unavailable' || String(err).includes('network-request-failed')) {
              console.warn("Firestore listener operating in offline/reconnecting mode:", err.message);
            } else {
              try {
                handleFirestoreError(err, 'get', `users/${user.uid}`);
              } catch (handled) {
                console.warn("Handled profile listener error:", handled);
              }
            }
          });

          trackAuth.login(user.providerData[0]?.providerId || 'Google', user.email || '');
        } catch (err: any) {
          console.warn("Auth initialization notice:", err?.message || err);
        }
      } else {
        setProfile(null);
        localStorage.removeItem('gravity_user_badge_count');
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(connTimer);
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const loginWithGoogle = async () => {
    if (signingIn) return;
    setSigningIn(true);
    setAuthNotice(null);
    try {
      const provider = new GoogleAuthProvider();
      
      // If user is already signed in, link Google credential to existing account
      if (auth.currentUser) {
        await linkWithPopup(auth.currentUser, provider);
        setAuthNotice("Google account successfully linked to your existing Gravityverse profile!");
        return;
      }

      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request') {
        console.warn('Auth popup closed or overlapping request.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.log('Login popup closed by user.');
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        // Safe account linking path: Account exists with different provider (e.g. password)
        const cred = GoogleAuthProvider.credentialFromError(error);
        const targetEmail = error.customData?.email || 'your email';
        if (cred) {
          setPendingGoogleCredential(cred);
        }
        setAuthNotice(`An account already exists with ${targetEmail} using password authentication. Please sign in with your password to automatically link your Google account.`);
      } else if (error.code === 'auth/credential-already-in-use') {
        setAuthNotice("This Google account is already linked to another Gravityverse profile.");
      } else {
        console.error('Login error:', error);
        setAuthNotice(error.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    if (signingIn) return;
    setSigningIn(true);
    setAuthNotice(null);
    try {
      const cleanEmail = (email || '').trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        throw new Error("Please enter a valid email address.");
      }
      if (!pass) {
        throw new Error("Please enter your password.");
      }

      let userCred: any = null;
      try {
        userCred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      } catch (clientErr: any) {
        if (clientErr?.code === 'auth/operation-not-allowed' || clientErr?.code === 'auth/invalid-credential' || clientErr?.code === 'auth/user-not-found' || clientErr?.code === 'auth/wrong-password') {
          // Fallback to server-side authentication
          const response = await fetch(`${getApiBaseUrl()}/api/auth/server-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, password: pass })
          });
          const data = await response.json();
          if (!response.ok || !data.success || !data.customToken) {
            throw new Error(data.error || 'Invalid email or password.');
          }
          userCred = await signInWithCustomToken(auth, data.customToken);
        } else {
          throw clientErr;
        }
      }
      
      // If there was a pending Google credential awaiting linking, merge safely
      if (pendingGoogleCredential && userCred?.user) {
        await linkWithCredential(userCred.user, pendingGoogleCredential);
        setPendingGoogleCredential(null);
        setAuthNotice("Google account successfully linked to your Gravityverse profile!");
      }
    } catch (error: any) {
      const formatted = formatAuthError(error);
      console.warn('Email login notice:', formatted);
      setAuthNotice(formatted);
      throw new Error(formatted);
    } finally {
      setSigningIn(false);
    }
  };

  const registerWithEmail = async (email: string, pass: string, name: string, verificationToken?: string) => {
    if (signingIn) return;
    setSigningIn(true);
    setAuthNotice(null);
    try {
      const cleanEmail = (email || '').trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        throw new Error("Please enter a valid email address.");
      }
      if (!pass || pass.length < 6) {
        throw new Error("Password must be at least 6 characters long.");
      }

      let userCred: any = null;
      try {
        userCred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
        if (userCred.user) {
          await updateAuthProfile(userCred.user, { displayName: name });
          // Create profile in Firestore
          const userDocRef = doc(db, 'users', userCred.user.uid);
          await setDoc(userDocRef, {
            displayName: name || 'Gravityverse Explorer',
            email: cleanEmail,
            photoURL: '',
            conversationsCount: 0,
            progress: 0,
            totalBadges: 0,
            badges: ['Early Adopter'],
            lastActive: serverTimestamp(),
            createdAt: serverTimestamp(),
          }, { merge: true });
        }
      } catch (clientErr: any) {
        if (clientErr?.code === 'auth/operation-not-allowed') {
          // Fallback to server-side registration
          const response = await fetch(`${getApiBaseUrl()}/api/auth/server-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, password: pass, name, verificationToken })
          });
          const data = await response.json();
          if (!response.ok || !data.success || !data.customToken) {
            throw new Error(data.error || 'Registration failed.');
          }
          userCred = await signInWithCustomToken(auth, data.customToken);
        } else {
          throw clientErr;
        }
      }
    } catch (error: any) {
      const formatted = formatAuthError(error);
      console.warn('Email registration notice:', formatted);
      setAuthNotice(formatted);
      throw new Error(formatted);
    } finally {
      setSigningIn(false);
    }
  };

  const resetPassword = async (email: string) => {
    if (!email) {
      setAuthNotice("Please enter your email address first.");
      return;
    }
    setSigningIn(true);
    setAuthNotice(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthNotice("Password reset email sent! Please check your inbox.");
    } catch (error: any) {
      console.error('Password reset error:', error);
      setAuthNotice(error.message || 'Failed to send password reset email.');
      throw error;
    } finally {
      setSigningIn(false);
    }
  };

  const logout = async () => {
    trackAuth.logout();
    setAuthNotice(null);
    setPendingGoogleCredential(null);
    await signOut(auth);
  };

  const switchAccount = async () => {
    if (signingIn) return;
    setSigningIn(true);
    setAuthNotice(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request') {
        console.warn('Auth popup closed or overlapping request.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.log('Login popup closed by user.');
      } else {
        console.error('Switch account error:', error);
        setAuthNotice(error.message);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const updateProfile = async (data: any) => {
    if (!user) return;
    try {
      trackUserActions.profileUpdate(Object.keys(data));
    } catch (e) {
      console.warn('Analytics profileUpdate failed:', e);
    }
    await setDoc(doc(db, 'users', user.uid), { ...data, lastActive: serverTimestamp() }, { merge: true })
      .catch(e => handleFirestoreError(e, 'update', `users/${user.uid}`));
  };

  const reauthenticateWithGoogle = async () => {
    if (!auth.currentUser) throw new Error("No active user session found.");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await reauthenticateWithPopup(auth.currentUser, provider);
  };

  const reauthenticateWithPassword = async (password: string) => {
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error("No active email user session found.");
    }
    if (!password) {
      throw new Error("Please enter your current password.");
    }
    const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
    await reauthenticateWithCredential(auth.currentUser, credential);
  };

  const deleteAccount = async (passwordOrNull?: string) => {
    if (!auth.currentUser) {
      throw new Error("You must be signed in to delete your account.");
    }
    const currentUser = auth.currentUser;
    const uid = currentUser.uid;
    const email = currentUser.email || '';
    const providerId = currentUser.providerData[0]?.providerId || 'password';

    // 1. Re-authenticate if password is provided
    if (passwordOrNull && providerId === 'password') {
      const credential = EmailAuthProvider.credential(email, passwordOrNull);
      await reauthenticateWithCredential(currentUser, credential);
    }

    // 2. Try server-side deletion endpoint first
    let serverDeletionSucceeded = false;
    try {
      const idToken = await currentUser.getIdToken(true);
      const baseUrl = getApiBaseUrl();
      const endpoint = baseUrl ? `${baseUrl}/api/auth/delete-account` : '/api/auth/delete-account';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) {
        serverDeletionSucceeded = true;
      } else if (data?.requireReauth) {
        throw new Error("Recent authentication required. Please re-authenticate and try again.");
      } else {
        console.warn("[Delete Account] Server-side deletion endpoint notice:", data?.error || response.statusText);
      }
    } catch (err: any) {
      if (err.message?.includes("Recent authentication")) {
        throw err;
      }
      console.warn("[Delete Account] Server endpoint fallback notice:", err.message || err);
    }

    // 3. Client-side Firestore purge fallback (ensures user data is always cleared even if server route returned 404 or was offline)
    if (!serverDeletionSucceeded) {
      try {
        // Delete chats subcollection and nested messages
        const chatsSnap = await getDocs(collection(db, `users/${uid}/chats`)).catch(() => null);
        if (chatsSnap && !chatsSnap.empty) {
          for (const chatDoc of chatsSnap.docs) {
            const msgsSnap = await getDocs(collection(db, `users/${uid}/chats/${chatDoc.id}/messages`)).catch(() => null);
            if (msgsSnap && !msgsSnap.empty) {
              for (const msgDoc of msgsSnap.docs) {
                await deleteDoc(msgDoc.ref).catch(() => {});
              }
            }
            await deleteDoc(chatDoc.ref).catch(() => {});
          }
        }

        // Delete access logs
        const logsSnap = await getDocs(collection(db, `users/${uid}/accessLogs`)).catch(() => null);
        if (logsSnap && !logsSnap.empty) {
          for (const logDoc of logsSnap.docs) {
            await deleteDoc(logDoc.ref).catch(() => {});
          }
        }

        // Delete badge history
        const badgeSnap = await getDocs(collection(db, `users/${uid}/badgeHistory`)).catch(() => null);
        if (badgeSnap && !badgeSnap.empty) {
          for (const bDoc of badgeSnap.docs) {
            await deleteDoc(bDoc.ref).catch(() => {});
          }
        }

        // Delete progress logs
        const progSnap = await getDocs(collection(db, `users/${uid}/progressLogs`)).catch(() => null);
        if (progSnap && !progSnap.empty) {
          for (const pDoc of progSnap.docs) {
            await deleteDoc(pDoc.ref).catch(() => {});
          }
        }

        // Delete GPA records
        const gpaSnap = await getDocs(collection(db, `users/${uid}/gpa_records`)).catch(() => null);
        if (gpaSnap && !gpaSnap.empty) {
          for (const gDoc of gpaSnap.docs) {
            await deleteDoc(gDoc.ref).catch(() => {});
          }
        }

        // Delete main user profile document
        await deleteDoc(doc(db, 'users', uid)).catch(() => {});
      } catch (fsErr) {
        console.warn("[Delete Account] Client-side Firestore purge notice:", fsErr);
      }
    }

    // 4. Delete user from Firebase Auth
    try {
      await deleteAuthUser(currentUser);
    } catch (authDelErr: any) {
      if (authDelErr.code === 'auth/requires-recent-login') {
        throw new Error("Recent authentication required. Please re-authenticate and try again.");
      }
      console.warn("[Delete Account] Client Auth deletion notice:", authDelErr);
    }

    // 5. Send tracking event to Google Analytics
    try {
      trackAuth.accountDeleted(providerId, email);
    } catch (analyticsErr) {
      console.warn("Analytics delete account tracking notice:", analyticsErr);
    }

    // 6. Clean up local state & sign out
    localStorage.removeItem('gravity_user_badge_count');
    await signOut(auth).catch(() => {});
    setUser(null);
    setProfile(null);
    setAuthNotice(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      signingIn, 
      authNotice,
      setAuthNotice,
      login: loginWithGoogle, 
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      resetPassword,
      logout, 
      updateProfile, 
      switchAccount,
      deleteAccount,
      reauthenticateWithGoogle,
      reauthenticateWithPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

