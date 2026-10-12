import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Award, MessageSquare, Trash2, Shield, Clock, ChevronRight, LogOut, Loader2, History, Key, Settings2, ArrowRight, AlertTriangle, UserX } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, deleteDoc, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn, getAssetPath } from '../lib/utils';
import { handleFirestoreError } from '../lib/errorHandler';
import { BadgeModal, BadgeIcon } from '../components/BadgeModal';
import { getUnlockedBadgesCount, getHighestBadgeName } from '../lib/badgeUtils';
import { AccessLogsModal } from '../components/AccessLogsModal';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { trackUserActions } from '../lib/analytics';

export function ProfilePage() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [clearing, setClearing] = useState(false);
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleAccountDeletedSuccess = () => {
    setIsDeleteModalOpen(false);
    navigate('/', { state: { accountDeleted: true } });
  };

  const clearHistory = async () => {
    if (!user || clearing) return;
    if (!confirm('Are you sure you want to delete all conversations? This cannot be undone.')) return;
    
    setClearing(true);
    try {
      const q = query(collection(db, `users/${user.uid}/chats`));
      const snapshot = await getDocs(q).catch(e => {
        handleFirestoreError(e, 'list', `users/${user.uid}/chats`);
        return null;
      });
      if (snapshot) {
        await Promise.all(snapshot.docs.map(d => 
          deleteDoc(doc(db, `users/${user.uid}/chats`, d.id))
            .catch(e => handleFirestoreError(e, 'delete', `users/${user.uid}/chats/${d.id}`))
        ));
        trackUserActions.settingChanged('history_cleared', true);
        alert('History cleared successfully.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setClearing(false);
    }
  };

  if (!user) return null;

  const currentBadge = getHighestBadgeName(profile);
  const earnedBadgeCount = getUnlockedBadgesCount(profile);

  return (
    <div className="pt-32 pb-24 px-4 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row items-center gap-8 mb-12 text-center md:text-left">
        <div className="w-24 h-24 rounded-3xl bg-brand-blue flex items-center justify-center shadow-2xl shadow-blue-500/40 border-4 border-white/10 overflow-hidden">
          {user.photoURL && user.photoURL.trim() !== '' ? (
            <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl font-bold text-white">{user.displayName?.[0] || 'U'}</span>
          )}
        </div>
        <div className="space-y-2 flex-grow">
          <h1 className="text-4xl font-bold font-serif">{user.displayName}</h1>
          <p className="text-gray-400 font-medium">{user.email}</p>
          <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2">
            <span className="px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-[10px] font-bold uppercase tracking-wider">
              Connection Active
            </span>
            <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue border border-brand-blue/20 rounded-full text-[10px] font-bold uppercase tracking-wider">
              {currentBadge}
            </span>
          </div>
        </div>
        <button 
          onClick={handleLogout} 
          className="p-3 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition-all border border-red-500/20"
          title="Logout"
        >
          <LogOut className="w-6 h-6" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-16 pb-12">
        {/* Achievements */}
        <div className="space-y-12">
          <div className="flex items-center gap-4 border-b border-white/5 pb-8">
            <BadgeIcon 
              badgeName={currentBadge}
              size="lg"
              className="w-12 h-12 rounded-2xl shadow-md"
            />
            <h3 className="text-3xl font-bold font-serif tracking-tight text-white">Account Level</h3>
          </div>
          <div className="space-y-10">
            <div className="mb-6">
              <div className="flex items-center justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">
                <span>Next Badge Progress</span>
                <span className="text-brand-blue">{Math.min((profile?.progress || 0) * 10, 100)}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((profile?.progress || 0) * 10, 100)}%` }}
                  className="h-full bg-brand-blue shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                />
              </div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-4">
                {10 - (profile?.progress || 0)} points until next level
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <button 
                onClick={() => setIsBadgeModalOpen(true)}
                className="flex flex-col items-start gap-4 group"
              >
                <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-brand-blue/10 transition-all">
                  <Award className="w-8 h-8 text-brand-blue group-hover:scale-110 transition-transform" />
                </div>
                <div className="text-left">
                  <span className="text-xs font-bold text-white block mb-1">Badge Registry</span>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">View All</span>
                </div>
              </button>
              <button 
                onClick={() => setIsLogsModalOpen(true)}
                className="flex flex-col items-start gap-4 group"
              >
                <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-brand-blue/10 transition-all">
                  <History className="w-8 h-8 text-brand-blue group-hover:scale-110 transition-transform" />
                </div>
                <div className="text-left">
                  <span className="text-xs font-bold text-white block mb-1">Access Logs</span>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Audit Trail</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Interaction Metrics */}
        <div className="space-y-12">
          <div className="space-y-10">
             <div className="flex items-center gap-4 border-b border-white/5 pb-8">
              <MessageSquare className="text-brand-blue w-8 h-8" />
              <h3 className="text-3xl font-bold font-serif tracking-tight text-white">Metrics</h3>
            </div>
            <div className="grid grid-cols-2 gap-12">
              <div className="text-left">
                <p className="text-5xl font-serif font-bold text-white mb-2">{profile?.conversationsCount || 0}</p>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">Total Tasks</p>
              </div>
              <div className="text-left">
                <p className="text-5xl font-serif font-bold text-brand-blue mb-2">
                  {earnedBadgeCount}
                </p>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">Badges Earned</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone & Account Management */}
      <div className="pt-12 border-t border-white/5 space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h4 className="text-xl font-bold font-serif text-white tracking-tight">Danger Zone</h4>
            <p className="text-xs text-gray-500">Irreversible actions and personal data management</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Clear History Card */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4 hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-bold text-white flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-gray-400" />
                Clear Chat History
              </h5>
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 bg-white/5 px-2 py-0.5 rounded">
                Data Reset
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Permanently remove all AI conversation threads, assistant outputs, and prompt logs while keeping your badges, GPA records, and profile active.
            </p>
            <button 
              id="profile-clear-history-btn"
              onClick={clearHistory}
              disabled={clearing}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Clear All Chats
            </button>
          </div>

          {/* Delete Account Card */}
          <div className="p-6 rounded-2xl bg-red-950/20 border border-red-500/20 space-y-4 hover:border-red-500/30 transition-colors">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-bold text-red-300 flex items-center gap-2">
                <UserX className="w-4 h-4 text-red-400" />
                Delete Account
              </h5>
              <span className="text-[10px] uppercase tracking-wider font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">
                Permanent
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Permanently delete your Gravityverse account, personal profile, chat history, earned badges, and academic records. This operation cannot be reversed.
            </p>
            <button 
              id="open-delete-account-modal-btn"
              onClick={() => setIsDeleteModalOpen(true)}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-red-600/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      <AccessLogsModal isOpen={isLogsModalOpen} onClose={() => setIsLogsModalOpen(false)} />
      <BadgeModal isOpen={isBadgeModalOpen} onClose={() => setIsBadgeModalOpen(false)} />
      <DeleteAccountModal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        onSuccess={handleAccountDeletedSuccess}
      />
    </div>
  );
}
