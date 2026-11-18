import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Brain, Shield, Sparkles, ArrowRight, Zap, Terminal, Activity, Globe, Compass, ShieldCheck, CheckCircle2, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

export function LandingPage() {
  const location = useLocation();
  const [showDeletionNotice, setShowDeletionNotice] = useState(false);

  useEffect(() => {
    if (location.state && (location.state as any).accountDeleted) {
      setShowDeletionNotice(true);
      // Clean up window history state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  return (
    <div className="relative pt-12 sm:pt-20 overflow-hidden">
      {/* Account Deletion Confirmation Toast / Banner */}
      <AnimatePresence>
        {showDeletionNotice && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="p-4 rounded-2xl bg-[#0e1626]/95 border border-emerald-500/30 backdrop-blur-xl shadow-2xl shadow-emerald-950/40 flex items-start justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Account Permanently Deleted</h4>
                  <p className="text-xs text-gray-300 mt-0.5 leading-relaxed">
                    Your Gravityverse account and all associated personal data have been completely removed from our servers. You have been safely logged out.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDeletionNotice(false)}
                className="p-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Immersive Background Elements */}
      <div className="glow-bg" />
      <div className="orb-1" />
      <div className="orb-2" />
      <div className="orb-3" />
      
      {/* Decorative Floating Cyber Particles */}
      <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-blue-400/40 rounded-full animate-ping" />
      <div className="absolute top-1/3 right-1/4 w-1.5 h-1.5 bg-indigo-400/30 rounded-full animate-pulse" />
      <div className="absolute bottom-1/4 left-1/3 w-1 h-1 bg-pink-400/40 rounded-full animate-ping [animation-delay:2s]" />

      {/* Hero Section */}
      <section className="min-h-[80vh] sm:min-h-[95vh] flex flex-col items-center justify-center text-center px-4 sm:px-10 overflow-hidden relative z-10 py-12 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl mx-auto space-y-6 sm:space-y-10"
        >
          {/* Version Pill */}
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="inline-flex items-center gap-2.5 px-4.5 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-black uppercase tracking-[0.15em] text-blue-300 backdrop-blur-md shadow-lg"
          >
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            v2.0: Platform Active
          </motion.div>
          
          {/* Main Title Heading */}
          <h1 className="text-3xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-black leading-[1.1] sm:leading-[1.05] tracking-tight text-white uppercase italic">
            Think <span className="premium-gradient-text">Bigger</span>.<br/>
            Chat <span className="text-brand-blue drop-shadow-[0_0_35px_rgba(37,99,235,0.3)]">Smarter</span>.
          </h1>
          
          <p className="max-w-3xl mx-auto text-slate-300 text-sm sm:text-xl leading-relaxed mb-6 sm:mb-12 px-4 font-medium opacity-90">
            Empower your workflow with a beautiful, next-generation legal and creative AI copilot. Reimagined for professionals who demand absolute precision, lightning speed, and elite design.
          </p>
          
          {/* Interactive Button Group */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 pt-2 sm:pt-4 max-w-lg mx-auto">
            <Link 
              to="/chat" 
              className="w-full sm:w-auto px-10 py-4.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all duration-300 shadow-2xl shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.04] active:scale-95 inline-flex items-center justify-center gap-2"
            >
              Launch Assistant
              <ArrowRight className="w-4 h-4 text-blue-200" />
            </Link>
            <Link 
              to="/blog" 
              className="w-full sm:w-auto px-10 py-4.5 bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.08] text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all duration-300 inline-flex items-center justify-center gap-2"
            >
              Explore Matrix Blog
            </Link>
          </div>
        </motion.div>

        {/* Beautiful Floating Interactive Visual Showcase Card */}
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.4, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-4xl mt-16 sm:mt-24 px-4 relative"
        >
          {/* Aura lights around container */}
          <div className="absolute inset-x-0 -top-12 h-40 bg-gradient-to-b from-brand-blue/15 to-transparent blur-3xl rounded-full" />
          
          <div className="relative glow-card p-4 sm:p-6 bg-slate-950/60 border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-blue-500/5">
            {/* Control Bar */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 sm:mb-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-mono text-gray-500 ml-3 uppercase tracking-widest">protocol_host_v2.0 // core_node</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> SYSTEM ACTIVE
                </span>
              </div>
            </div>

            {/* Showcase Grid of interactive indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col justify-between group-hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-500 tracking-wider uppercase">AI Inference</span>
                  <Activity className="w-4 h-4 text-brand-blue" />
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold font-serif text-white">0.08s</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">Average response latency</p>
                </div>
              </div>

              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col justify-between group-hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-500 tracking-wider uppercase">Database Reach</span>
                  <Globe className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold font-serif text-white">Global CDN</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">Distributed index coverage</p>
                </div>
              </div>

              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col justify-between group-hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-500 tracking-wider uppercase">Model Cluster</span>
                  <ShieldCheck className="w-4 h-4 text-pink-400" />
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold font-serif text-white">Gemini 2.5 Flash</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">Premium inference pipeline</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Stats/Engineered section */}
      <section className="py-16 sm:py-32 px-4 sm:px-10 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-24 space-y-4">
            <span className="luxury-badge">Engineering Showcase</span>
            <h2 className="text-3xl sm:text-5xl font-bold text-white uppercase tracking-tight">The Core Pillars</h2>
            <p className="text-sm text-slate-400 font-medium">Powering the legal intelligence, real-time media insights, and creative tools across our ecosystem.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
            {[
              { 
                icon: Shield, 
                title: "Lightning Fast Speed", 
                desc: "Our real-time network analyzer and custom state routing ensure responses deliver with zero latency.",
                color: "text-blue-400",
                bg: "bg-blue-500/10",
                accent: "rgba(37, 99, 235, 0.15)"
              },
              { 
                icon: Sparkles, 
                title: "Legal Intelligence Matrix", 
                desc: "Equipped with advanced IPC databases and legal context mapping optimized to decrypt complexity instantly.",
                color: "text-indigo-400",
                bg: "bg-indigo-500/10",
                accent: "rgba(79, 70, 229, 0.15)"
              },
              { 
                icon: Brain, 
                title: "Automated Context", 
                desc: "Seamless Google Gemini-powered summaries, live blog post generations, and advanced interactive analysis.",
                color: "text-purple-400",
                bg: "bg-purple-500/10",
                accent: "rgba(139, 92, 246, 0.15)"
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                whileHover={{ 
                  y: -12, 
                  scale: 1.02, 
                  borderColor: "rgba(255, 255, 255, 0.15)",
                  boxShadow: `0 20px 40px -15px ${feature.accent}`
                }}
                transition={{ 
                  duration: 0.6, 
                  delay: i * 0.1,
                  type: "spring",
                  stiffness: 90,
                  damping: 15
                }}
                className="text-left bg-slate-950/40 border border-white/5 rounded-3xl p-8 sm:p-10 transition-all duration-500 hover:bg-slate-900/40 relative overflow-hidden group"
              >
                {/* Decorative spotlight effect inside card */}
                <div className="absolute -right-20 -top-20 w-40 h-40 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors duration-500" />
                
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-8 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6", feature.bg, feature.color)}>
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold mb-4 font-serif tracking-tight text-white">{feature.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA section */}
      <motion.section 
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, type: "spring", bounce: 0.15 }}
        className="py-20 sm:py-36 px-4 text-center bg-[#02050e] border-y border-white/5 relative overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-brand-blue/5 via-transparent to-purple-500/5 opacity-50 pointer-events-none animate-pulse" />
        <div className="max-w-4xl mx-auto space-y-10 relative z-10">
          <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold font-serif leading-tight uppercase">Ready to <span className="premium-gradient-text italic font-black">Evolve</span>?</h2>
          <p className="text-base sm:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed font-medium">
            Join thousands of users leveraging <span className="text-white font-serif italic">Gravity</span><span className="text-brand-blue font-serif font-black uppercase">Verse</span> to navigate future digital intelligence with ease.
          </p>
          <div className="pt-8">
            <Link 
              to="/chat" 
              className="px-14 py-5.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-pink-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-black uppercase tracking-[0.25em] text-xs transition-all hover:scale-110 active:scale-95 shadow-2xl shadow-blue-500/30 inline-flex items-center gap-3"
            >
              Initialize Assistant
              <ArrowRight className="w-5 h-5 animate-pulse" />
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

