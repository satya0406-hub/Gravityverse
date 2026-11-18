import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { getAssetPath } from '../lib/utils';

export function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 2500); // Show for 2.5 seconds
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] bg-[#020617] flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Background Glows */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-blue/20 blur-[120px] rounded-full animate-pulse" />
          
          <div className="relative flex flex-col items-center space-y-12">
            {/* Logo Container */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="w-24 h-24 rounded-3xl overflow-hidden relative shadow-2xl shadow-blue-500/20 group border border-white/10"
            >
               <img 
                 src={getAssetPath('chatbot-logo.png')} 
                 alt="GravityVerse" 
                 className="w-full h-full object-cover"
                 onError={(e) => {
                   const target = e.target as HTMLImageElement;
                   target.src = 'https://ui-avatars.com/api/?name=G&background=3b82f6&color=fff';
                 }}
               />
            </motion.div>

            {/* Brand Text */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="flex flex-col items-center space-y-6"
            >
              <h1 className="text-6xl md:text-8xl font-serif font-bold tracking-tight">
                <span className="text-white">GRAVITY</span>
                <span className="text-brand-blue italic ml-4">VERSE</span>
              </h1>
              
              <div className="flex flex-col items-center space-y-4">
                <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-brand-blue/50 to-transparent" />
                <p className="text-xs uppercase tracking-[0.4em] font-bold text-gray-500">
                  Your Personal AI Assistant
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
