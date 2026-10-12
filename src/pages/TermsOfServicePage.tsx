import { motion } from 'motion/react';
import { Gavel, AlertCircle, CheckCircle, Scale, Clock, Terminal, BookOpen } from 'lucide-react';

export function TermsOfServicePage() {
  return (
    <div className="pt-24 sm:pt-32 pb-16 sm:pb-24 px-4 max-w-4xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-10 sm:space-y-12"
      >
        <div className="text-center space-y-4">
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight text-white uppercase">
            <span className="text-white">Terms of</span>
            <span className="text-brand-blue ml-3">Service</span>
          </h1>
          <p className="text-gray-400 font-medium tracking-widest uppercase text-xs">Effective Date: August 2026</p>
          <div className="w-12 h-1 bg-brand-blue mx-auto rounded-full mt-4" />
        </div>

        <div className="glass-card p-6 sm:p-12 space-y-8 leading-relaxed">
          {/* Section 1: Terms Agreement */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <Gavel className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">1. Agreement to Terms</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              Welcome to <strong>Gravityverse.in</strong>, an open student-led academic and AI utility portal created by students at SRM Institute of Science and Technology (SRMIST). By accessing or using our platform, tools, event directories, or AI assistant, you agree to comply with and be bound by these Terms of Service.
            </p>
          </section>

          {/* Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 border-y border-white/5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-brand-blue">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">Academic & AI Disclaimer</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                AI Assistant outputs and GPA calculations are provided for study and planning purposes. Official academic records are strictly governed by university registrars.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-brand-blue">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Student Code of Conduct</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Users agree not to misuse platform APIs, attempt automated scraping, or transmit malicious code through contact or chat forms.
              </p>
            </div>
          </div>

          {/* Section 2: Services & Utilities */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <BookOpen className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">2. Scope of Services</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base">
              Gravityverse provides educational tools including:
            </p>
            <ul className="list-disc pl-6 text-gray-400 space-y-2 text-xs sm:text-sm leading-relaxed">
              <li><strong>SRM & Chennai Events Directory:</strong> Aggregates campus workshops, hackathons, and medical symposiums with direct official registration portal links.</li>
              <li><strong>GPA+ Calculator:</strong> Interactive 10-point credit calculation tool based on standard SRM grading regulations.</li>
              <li><strong>AI Study Assistant:</strong> AI chat powered by Google Gemini for study research, code debugging, and paper summaries.</li>
              <li><strong>Daily Challenges:</strong> Interactive logic and problem-solving challenges developed as part of Gravityverse.</li>
            </ul>
          </section>

          {/* Section 3: Intellectual Property */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <Terminal className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">3. Intellectual Property</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              The Gravityverse layout, custom branding, and application code are maintained by student developers. External trademarks, university names, and event logos referenced in event listings belong to their respective institution owners.
            </p>
          </section>

          {/* Section 4: Limitation of Liability */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <Scale className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">4. Limitation of Liability</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              Gravityverse is provided "as is" without warranties of any kind. As a student initiative, we strive for high uptime and verified information, but we are not liable for external event cancellations, third-party link changes, or academic discrepancies.
            </p>
          </section>

          {/* Section 5: Changes to Terms */}
          <section className="space-y-4 border-t border-white/5 pt-6">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <Clock className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">5. Modifications & Inquiries</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              We may update these terms periodically to reflect new platform features or legal guidelines. For inquiries regarding these terms, contact us at <a href="mailto:support@gravityverse.in" className="text-brand-blue hover:underline font-semibold">support@gravityverse.in</a>.
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}

