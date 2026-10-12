import { motion } from 'motion/react';
import { Target, Users, Zap, Code, Calendar, Calculator, Award, Bot, HelpCircle, CheckCircle2, ShieldCheck, UserCheck } from 'lucide-react';

export function AboutUsPage() {
  return (
    <div className="pt-20 sm:pt-32 pb-12 sm:pb-24 px-4 max-w-5xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-12 sm:space-y-16"
      >
        {/* Header Badge & Title */}
        <div className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-blue/10 border border-brand-blue/20 text-brand-blue text-[10px] sm:text-xs font-black uppercase tracking-[0.2em]">
             Independent Student-Built Platform
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-serif font-bold tracking-tight leading-[1.15]">
            <span className="text-white">About</span>
            <span className="text-brand-blue ml-3">Gravityverse</span>
          </h1>
          <p className="text-base sm:text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            An independent student-built platform created for students at <strong>SRM Institute of Science and Technology (SRMIST)</strong> to unify campus event discovery, GPA planning, study AI assistance, and Daily Challenges under one clean interface.
          </p>
        </div>

        {/* 5 Core Answer Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          
          {/* 1. What is Gravityverse? */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card p-6 sm:p-8 space-y-4 border-brand-blue/20 bg-brand-blue/[0.02]"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-brand-blue">
              <HelpCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">1. What is Gravityverse?</h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              <strong>Gravityverse.in</strong> is an all-in-one digital campus ecosystem and educational platform. It brings together verified academic event directories, intelligent study tools powered by Google Gemini AI, a precise 10-point GPA/CGPA planner, and interactive Daily Challenges into a unified, user-friendly interface.
            </p>
          </motion.div>

          {/* 2. Who is it for? */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card p-6 sm:p-8 space-y-4 border-purple-500/20 bg-purple-500/[0.02]"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Users className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">2. Who is it for?</h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              Gravityverse is crafted specifically for college students, medical scholars, engineering undergraduates, and faculty at <strong>SRMIST (Kattankulathur, Ramapuram, Vadapalani, NCR)</strong> and neighboring universities across Chennai and India who need reliable academic utilities and event information.
            </p>
          </motion.div>

          {/* 3. What problems does it solve? */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card p-6 sm:p-8 space-y-4 border-amber-500/20 bg-amber-500/[0.02]"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Target className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">3. What problems does it solve?</h2>
            <ul className="text-sm text-gray-300 space-y-2 leading-relaxed list-disc pl-5">
              <li><strong>Scattered Campus Events:</strong> Replaces messy WhatsApp forwards with a verified, filterable calendar of hackathons, medical symposiums, and workshops.</li>
              <li><strong>Complex GPA Calculations:</strong> Eliminates manual math errors with a credit-weighted GPA/CGPA planner mapped to SRM university regulations.</li>
              <li><strong>Study Overload:</strong> Provides instant AI paper summaries, code debugging, and web-grounded research answers.</li>
            </ul>
          </motion.div>

          {/* 4. Who operates the site? */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card p-6 sm:p-8 space-y-4 border-emerald-500/20 bg-emerald-500/[0.02]"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UserCheck className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">4. Who operates the site?</h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              Gravityverse is an independent student-built platform focused on providing useful tools, resources, and AI-powered features for students.
            </p>
          </motion.div>

        </div>

        {/* 5. What features does it provide? */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <div className="h-[2px] flex-grow bg-white/5" />
             <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">5. Key Features & Platform Modules</h2>
             <div className="h-[2px] flex-grow bg-white/5" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 space-y-3">
              <div className="flex items-center gap-3 text-brand-blue">
                <Calendar className="w-5 h-5" />
                <h3 className="text-lg font-bold text-white">SRM & Chennai Events Directory</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Filter verified hackathons, medical workshops, paper presentations, and cultural festivals by category, department (CSE, ECE, MBBS, BioTech), or date.
              </p>
            </div>

            <div className="glass-card p-6 space-y-3">
              <div className="flex items-center gap-3 text-indigo-400">
                <Bot className="w-5 h-5" />
                <h3 className="text-lg font-bold text-white">AI Study Assistant</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Powered by Google Gemini AI with web grounding to assist with assignment research, code troubleshooting, mathematical derivations, and document analysis.
              </p>
            </div>

            <div className="glass-card p-6 space-y-3">
              <div className="flex items-center gap-3 text-emerald-400">
                <Calculator className="w-5 h-5" />
                <h3 className="text-lg font-bold text-white">GPA + Academic Terminal</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Calculate semester GPA and cumulative CGPA based on SRMIST 10-point credit scales, set target CGPA goals, and save course histories.
              </p>
            </div>

            <div className="glass-card p-6 space-y-3">
              <div className="flex items-center gap-3 text-purple-400">
                <Award className="w-5 h-5" />
                <h3 className="text-lg font-bold text-white">Daily Challenges</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Daily Challenges — interactive logic and problem-solving challenges developed as part of Gravityverse.
              </p>
            </div>
          </div>
        </div>

        {/* Commitment to Transparency & Privacy */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-card p-8 text-center bg-white/[0.01] border-white/10 space-y-4"
        >
          <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs font-mono">
            <ShieldCheck className="w-4 h-4" /> Privacy First & Open Access
          </div>
          <h3 className="text-xl font-bold text-white">Our Promise to Students</h3>
          <p className="text-xs sm:text-sm text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Gravityverse is committed to user privacy and open access. We do not sell student data or require mandatory paid subscriptions. For queries, suggestions, or event submissions, reach out directly at <a href="mailto:support@gravityverse.in" className="text-brand-blue hover:underline font-bold">support@gravityverse.in</a>.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}


