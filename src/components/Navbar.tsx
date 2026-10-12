import { useAuth } from '../lib/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Rocket, User as UserIcon, LogIn, Award, Sparkles, History, LogOut, Users } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getAssetPath } from '../lib/utils';
import { BadgeModal } from './BadgeModal';
import { AccessLogsModal } from './AccessLogsModal';
import { trackNavigation } from '../lib/analytics';

export function Navbar() {
  const { user, login, profile, logout, signingIn, switchAccount } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setIsProfileOpen(false);
  };

  const handleSwitchAccount = async () => {
    setIsProfileOpen(false);
    await switchAccount();
  };

  const isAdmin = user?.email === 'satyamanikantareddysathi@gmail.com';
  const isAssistantPage = location.pathname === '/chat';

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'SRM Events', path: '/srm-events' },
    { name: 'Blog', path: '/blog' },
    { name: 'Games', path: '/games' },
    { name: 'GPA +', path: '/gpa' },
    { name: 'Chat Assistant', path: '/chat' },
    { name: 'Network', path: '/speed-test' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-50 nav-blur px-4 lg:px-6 xl:px-10">
      <div className="max-w-[1400px] mx-auto w-full h-20 flex items-center justify-between">
        
        {/* Left Brand Container */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-blue-500/20 transition-transform group-hover:scale-110 border border-white/10 shrink-0">
            <img 
              src={getAssetPath('chatbot-logo.png')} 
              alt="GravityVerse" 
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://ui-avatars.com/api/?name=G&background=3b82f6&color=fff';
              }}
            />
          </div>
          <div className="flex flex-col items-start leading-none gap-0.5 text-left">
            <span className="font-serif text-sm sm:text-base font-black tracking-wider text-slate-100 uppercase">Gravity</span>
            <span className="font-serif text-[11px] sm:text-xs font-black italic tracking-widest text-brand-blue uppercase">Verse</span>
          </div>
        </Link>

        {/* Center Nav Links (Spaced out perfectly for desktop) */}
        <div className="hidden md:flex items-center justify-center gap-1 xl:gap-2.5 py-2 flex-grow min-w-0 mx-2 xl:mx-4">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => {
                try {
                  trackNavigation(link.name, 'navbar', link.path);
                } catch (e) {
                  console.warn(e);
                }
              }}
              className={cn(
                "px-2 xl:px-3 py-1 text-[10px] xl:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap border-b-2 pb-1.5",
                location.pathname === link.path 
                  ? "text-white border-brand-blue" 
                  : "text-slate-400 hover:text-white border-transparent"
              )}
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Mobile Center GPA+ Direct Navigation Shortcut */}
        <div className="flex md:hidden items-center justify-center">
          <Link
            to="/gpa"
            className={cn(
              "px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all",
              location.pathname === '/gpa'
                ? "bg-brand-blue text-white shadow-md shadow-brand-blue/30 border border-brand-blue/50"
                : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
            )}
          >
            <span className="font-serif font-black tracking-tight">GPA+</span>
          </Link>
        </div>

        {/* Right side controls (aligned of far right) */}
        <div className="hidden md:flex items-center gap-3 xl:gap-6 shrink-0">
          {isAdmin && (
            <>
              <Link to="/admin" className="hidden sm:block text-xs xl:text-sm font-bold tracking-widest text-slate-300 hover:text-white transition-colors">ADMIN</Link>
              <div className="hidden sm:block h-4 w-[1px] bg-white/20" />
            </>
          )}



          {user ? (
            <div className="relative">
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center p-0.5 rounded-full hover:scale-105 transition-all"
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center bg-blue-500/20 border border-white/10">
                  {user.photoURL && user.photoURL.trim() !== '' ? (
                    <img src={user.photoURL} alt={user.displayName || 'Profile'} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-5 h-5 text-blue-400" />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {isProfileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-4 w-60 bg-[#0b0f1a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02]">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Protocol 3.0 Control</p>
                    </div>
                    <div className="py-2">
                      {isAdmin && (
                        <Link 
                          to="/admin" 
                          onClick={() => setIsProfileOpen(false)}
                          className="w-full flex items-center gap-4 px-5 py-3 hover:bg-amber-500/10 text-amber-500 hover:text-amber-400 border-b border-white/5 transition-all text-xs font-bold uppercase tracking-widest text-left"
                        >
                          <Sparkles className="w-5 h-5 text-amber-500" /> Admin Panel
                        </Link>
                      )}
                      <Link 
                        to="/profile" 
                        onClick={() => setIsProfileOpen(false)}
                        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-brand-blue/10 text-gray-400 hover:text-white transition-all text-xs font-bold uppercase tracking-widest text-left"
                      >
                        <UserIcon className="w-5 h-5 text-brand-blue" /> Profile
                      </Link>
                      <button 
                        onClick={() => {
                          setIsBadgeModalOpen(true);
                          setIsProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-brand-blue/10 text-gray-400 hover:text-white transition-all text-xs font-bold uppercase tracking-widest text-left"
                      >
                        <Award className="w-5 h-5 text-brand-blue" /> Badges
                      </button>
                      <button 
                        onClick={() => {
                          setIsLogsModalOpen(true);
                          setIsProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-brand-blue/10 text-gray-400 hover:text-white transition-all text-xs font-bold uppercase tracking-widest text-left"
                      >
                        <History className="w-5 h-5 text-brand-blue" /> Logs
                      </button>
                      <div className="h-[1px] bg-white/5 my-2" />
                      <button 
                        onClick={handleSwitchAccount}
                        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 transition-all text-xs font-bold uppercase tracking-widest text-left"
                      >
                        <Users className="w-5 h-5 text-blue-400" /> Switch Account
                      </button>
                      <button 
                        onClick={handleLogout}
                        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-red-500/10 text-red-500 transition-all text-xs font-bold uppercase tracking-widest text-left"
                      >
                        <LogOut className="w-5 h-5 text-red-500" /> Log Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link 
              to="/login"
              className={cn("px-4 py-2 sm:px-6 sm:py-3 rounded-xl bg-brand-blue hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20", signingIn && "opacity-50 cursor-not-allowed")}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{signingIn ? '...' : 'Sign In'}</span>
            </Link>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2 ml-4">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 sm:p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white transition-all active:scale-95"
            aria-label="Toggle Menu"
          >
            {isOpen ? <X className="w-5 h-5 sm:w-6 h-6" /> : <Menu className="w-5 h-5 sm:w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="md:hidden absolute top-20 left-0 right-0 bg-[#070a13]/98 backdrop-blur-2xl border-b border-white/10 overflow-y-auto max-h-[calc(100vh-5rem)] z-40 shadow-2xl flex flex-col px-6 py-6 pb-8 space-y-4"
          >
            <div className="flex flex-col space-y-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2 mb-2">Navigation Matrix</span>
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => {
                    setIsOpen(false);
                    try {
                      trackNavigation(link.name, 'navbar', link.path);
                    } catch (e) {
                      console.warn(e);
                    }
                  }}
                  className={cn(
                    "px-4 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-between",
                    location.pathname === link.path 
                      ? "bg-brand-blue/20 text-brand-blue border border-brand-blue/20" 
                      : "text-slate-300 hover:text-white hover:bg-white/5 border border-transparent"
                  )}
                >
                  <span>{link.name}</span>
                  <Rocket className={cn("w-4 h-4 opacity-0 transition-opacity", location.pathname === link.path && "opacity-100 text-brand-blue")} />
                </Link>
              ))}
            </div>

            {isAdmin && (
              <div className="pt-4 border-t border-white/5 flex flex-col space-y-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2 mb-2">Administrative Console</span>
                <Link
                  to="/admin"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-3 text-xs font-bold uppercase tracking-widest rounded-xl text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 text-center"
                >
                  Admin Control Panel
                </Link>
              </div>
            )}



            {/* Access control and Profile for Mobile view (hidden in primary header row) */}
            <div className="pt-4 border-t border-white/5 flex flex-col space-y-4">
              {user ? (
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center gap-3 px-2 py-1">
                    <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-blue-500/20 border border-white/10">
                      {user.photoURL && user.photoURL.trim() !== '' ? (
                        <img src={user.photoURL} alt={user.displayName || 'Profile'} className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">{user.displayName || 'Operator'}</span>
                      <span className="text-[9px] text-gray-500 uppercase tracking-widest">{user.email}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/profile"
                      onClick={() => setIsOpen(false)}
                      className="px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl text-slate-300 hover:text-white bg-white/5 border border-white/10 text-center flex items-center justify-center gap-2"
                    >
                      <UserIcon className="w-4 h-4 text-brand-blue" /> Profile
                    </Link>
                    <button
                      onClick={() => {
                        setIsLogsModalOpen(true);
                        setIsOpen(false);
                      }}
                      className="px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl text-slate-300 hover:text-white bg-white/5 border border-white/10 text-center flex items-center justify-center gap-2"
                    >
                      <History className="w-4 h-4 text-brand-blue" /> Logs
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      handleLogout();
                      setIsOpen(false);
                    }}
                    className="w-full px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl text-red-500 hover:text-white bg-red-500/10 border border-red-500/20 text-center flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4 text-red-500" /> Log Out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setIsOpen(false)}
                  className="w-full px-4 py-3 bg-brand-blue hover:bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  <LogIn className="w-4 h-4" /> Sign In / Register
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
    <BadgeModal isOpen={isBadgeModalOpen} onClose={() => setIsBadgeModalOpen(false)} />
    <AccessLogsModal isOpen={isLogsModalOpen} onClose={() => setIsLogsModalOpen(false)} />
    </>
  );
}
