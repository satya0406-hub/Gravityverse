import { useLocation, Routes, Route, HashRouter, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './lib/AuthContext';
import { SplashScreen } from './components/SplashScreen';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingPage } from './pages/LandingPage';
import { ContentGrid } from './components/ContentGrid';
import { ChatAssistantPage } from './pages/ChatPage';
import { AdminDashboard } from './pages/AdminPage';
import { ProfilePage } from './pages/ProfilePage';
import { ContactPage } from './pages/ContactPage';
import { ArticleDetailPage } from './pages/ArticleDetailPage';
import { AboutUsPage } from './pages/AboutUsPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { DisclaimerPage } from './pages/DisclaimerPage';
import { SpeedTestPage } from './pages/SpeedTestPage';
import { GamesPage } from './pages/GamesPage';
import { GpaCalculatorPage } from './pages/GpaCalculatorPage';
import { SrmEventsPage } from './pages/SrmEventsPage';
import { AuthPage } from './pages/AuthPage';
import { ScrollToTop } from './components/ScrollToTop';
import { CookieConsent } from './components/CookieConsent';
import { GeminiChatWidget } from './components/GeminiChatWidget';
import { useBadgeSystem } from './hooks/useBadgeSystem';
import { cn } from './lib/utils';
import { initializeAnalytics, trackPageView } from './lib/analytics';

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </HashRouter>
  );
}

function AppContent() {
  const location = useLocation();
  const isChatPage = location.pathname.startsWith('/chat');
  useBadgeSystem();

  useEffect(() => {
    initializeAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return (
    <>
      <ScrollToTop />
      <SplashScreen />
      <div className={cn(
        "flex flex-col selection:bg-brand-blue/30 overflow-x-hidden",
        isChatPage ? "h-screen" : "min-h-screen"
      )}>
        <Navbar />
        <main className={cn("flex-grow min-h-0", isChatPage && "h-[calc(100vh-5rem)] mt-20 overflow-hidden")}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/srm-events" element={<SrmEventsPage />} />
            <Route path="/events" element={<SrmEventsPage />} />
            <Route path="/blog" element={<ContentGrid category="Blog" title="Premium Insights" />} />
            <Route path="/blog/:id" element={<ArticleDetailPage />} />
            <Route path="/stories" element={<ContentGrid category="Stories" title="Campus Stories" />} />
            <Route path="/stories/:id" element={<ArticleDetailPage />} />
            <Route path="/news" element={<ContentGrid category="News" title="Latest Updates" />} />
            <Route path="/news/:id" element={<ArticleDetailPage />} />
            <Route path="/laws" element={<ContentGrid category="Laws" title="Legal Matrix" />} />
            <Route path="/laws/:id" element={<ArticleDetailPage />} />
            <Route path="/:category/:id" element={<ArticleDetailPage />} />

            <Route path="/chat" element={<ChatAssistantPage />} />
            <Route path="/chat/:id" element={<ChatAssistantPage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/about" element={<AboutUsPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/disclaimer" element={<DisclaimerPage />} />
            <Route path="/speed-test" element={<SpeedTestPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/gpa" element={<GpaCalculatorPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {!isChatPage && <Footer />}
        {!isChatPage && <GeminiChatWidget />}
        <CookieConsent />
      </div>
    </>
  );
}
