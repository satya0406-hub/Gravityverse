import { motion } from 'motion/react';
import { AlertTriangle, ShieldCheck, HelpCircle, Cpu, Terminal, BookOpen } from 'lucide-react';

export function DisclaimerPage() {
  return (
    <div className="pt-24 sm:pt-32 pb-16 sm:pb-24 px-4 max-w-4xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-10 sm:space-y-12"
      >
        <div className="text-center space-y-4">
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight">
            <span className="text-white">Legal & Tool</span>
            <span className="text-brand-blue ml-3">Disclaimer</span>
          </h1>
          <p className="text-gray-400 font-medium tracking-widest uppercase text-xs">Last Updated: August 2026</p>
          <div className="w-12 h-1 bg-brand-blue mx-auto rounded-full mt-4" />
        </div>

        <div className="glass-card p-6 sm:p-12 space-y-8 leading-relaxed">
          {/* Section 1: Student Project & Institutional Disclaimer */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">1. Independent Student Project Disclaimer</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              All information and tools on <strong>Gravityverse.in</strong> are published in good faith for general educational, academic, and student utility purposes. Gravityverse is an independent student project developed by engineering students at SRM Institute of Science and Technology (SRMIST). It is not an official portal of SRMIST administration, and views expressed on the platform do not represent official university policy.
            </p>
          </section>

          {/* Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 border-y border-white/5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-brand-blue">
                <Cpu className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base">AI Assistant Guidance</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                AI Chat responses are generated using language models (Google Gemini API). AI outputs are designed to assist study and should be cross-verified with official textbooks or coursework.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-brand-blue">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Campus Event Listings</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Campus and medical event details are aggregated from public notices and student organizers. Users are advised to confirm registration links directly on official host portals.
              </p>
            </div>
          </div>

          {/* Section 2: Calculator Disclaimers */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <Terminal className="w-6 h-6 text-brand-blue" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">2. GPA Calculator & Utilities Disclaimer</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              Our embedded utility tools, including the <strong>GPA + Academic Calculator</strong> and the <strong>Speed Test Benchmark</strong>, execute mathematical formulas locally within your browser.
            </p>
            <ul className="list-disc pl-6 text-gray-400 space-y-2 text-xs sm:text-sm leading-relaxed">
              <li>
                <strong>GPA Calculations:</strong> Standard calculation frameworks represent standard 10-point credit scales used across SRMIST regulations. Official grade transcripts and CGPA standings are governed solely by university examination controllers.
              </li>
              <li>
                <strong>Speed Test Benchmarks:</strong> Network latency and speed measurements test instantaneous browser buffer latency and should be viewed as general informational metrics.
              </li>
            </ul>
          </section>

          {/* Section 3: AdSense & External Links */}
          <section className="space-y-4 border-t border-white/5 pt-6">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <HelpCircle className="w-6 h-6 text-brand-blue" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">3. Third-Party Links & Advertising Disclaimer</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              Gravityverse may contain links to external registration portals, research papers, and third-party ad networks (such as Google AdSense). While we strive to link only to safe and ethical resources, we have no control over external content or privacy practices on third-party sites.
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}

