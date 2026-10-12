import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, History, Clock, Shield, Terminal, ShieldCheck } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';

interface AccessLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccessLogsModal({ isOpen, onClose }: AccessLogsModalProps) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!user || !isOpen) return;

    // Use existing progressLogs or a new accessLogs collection
    const q = query(
      collection(db, `users/${user.uid}/accessLogs`),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Access logs retrieval failure:", err);
      // Fail silently for user but log to console
    });

    return () => unsubscribe();
  }, [user, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-[#0b0f1a] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="p-8 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                  <Terminal className="w-6 h-6 text-brand-blue" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold font-serif text-white tracking-tight">Security Access Logs</h2>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">Real-time authentication streams</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-xl transition-colors text-gray-500 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto p-4 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                  <ShieldCheck className="w-12 h-12 text-gray-700 mx-auto opacity-20" />
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-widest italic">No recent security events detected</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <motion.div 
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between group hover:bg-white/[0.04] transition-all"
                    >
                      <div className="flex items-center gap-4">
                         <div className={cn(
                           "w-2 h-2 rounded-full",
                           log.type === 'login' ? "bg-green-500" : "bg-blue-500"
                         )} />
                         <div>
                            <p className="text-xs font-bold text-white uppercase tracking-wider">{log.action || 'System Access'}</p>
                            <p className="text-[10px] text-gray-500 flex items-center gap-1.5 mt-1">
                               <Clock className="w-3 h-3" /> {log.timestamp?.toDate().toLocaleString()}
                            </p>
                         </div>
                      </div>
                      <div className="text-[10px] font-black text-gray-600 bg-white/5 px-2 py-1 rounded border border-white/5 uppercase">
                         {log.source || 'GravityVerse 3.0'}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 bg-white/[0.02] border-t border-white/5 text-center">
               <p className="text-[8px] font-bold text-gray-600 uppercase tracking-[0.3em]">Encrypted audit logging • read only</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
