import { motion } from 'motion/react';
import { Shield, Lock, Eye, FileText, Bell, Globe, Cookie, UserCheck, Sliders, ExternalLink } from 'lucide-react';
import { openConsentPreferences } from '../lib/consentUtils';

export function PrivacyPolicyPage() {
  return (
    <div className="pt-24 sm:pt-32 pb-16 sm:pb-24 px-4 max-w-4xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-10 sm:space-y-12"
      >
        <div className="text-center space-y-4">
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight">
            <span className="text-white">Privacy</span>
            <span className="text-brand-blue ml-3">Policy</span>
          </h1>
          <p className="text-gray-400 font-medium tracking-widest uppercase text-xs">Last Updated: August 2026</p>
          <div className="w-12 h-1 bg-brand-blue mx-auto rounded-full mt-4" />
        </div>

        <div className="glass-card p-6 sm:p-12 space-y-8 leading-relaxed">
          {/* Section 1: Overview */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <Shield className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">1. Introduction & Student Project Notice</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              At <strong>Gravityverse.in</strong>, operated as an independent student-led educational and academic portal created by students at SRM Institute of Science and Technology (SRMIST, Kattankulathur), we respect your privacy. This Privacy Policy outlines how we collect, use, disclose, and safeguard your information when you visit our website and use our study tools, AI assistant, GPA calculator, and campus event directory.
            </p>
          </section>

          {/* Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 border-y border-white/5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-brand-blue">
                <Lock className="w-5 h-5" />
                <h3 className="font-bold text-white text-base">Secure Authentication</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                We use Google Firebase Authentication for optional account sign-ins. Passwords and credentials are never stored directly on our servers.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-brand-blue">
                <Eye className="w-5 h-5" />
                <h3 className="font-bold text-white text-base">Local Calculation Storage</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Academic calculations (such as GPA and CGPA) remain in your local browser state unless you explicitly save them to your account history.
              </p>
            </div>
          </div>

          {/* Section 2: Information Collected */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <FileText className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">2. Information We Collect</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base">
              Depending on how you interact with Gravityverse, we may collect the following information:
            </p>
            <ul className="list-disc pl-6 text-gray-400 space-y-2 text-xs sm:text-sm leading-relaxed">
              <li>
                <strong>Account Data:</strong> Display name and email address provided during optional Firebase registration or Google OAuth sign-in.
              </li>
              <li>
                <strong>User Input Data:</strong> Prompts entered into the AI Chat Assistant and contact queries submitted via the Contact form.
              </li>
              <li>
                <strong>Device & Usage Data:</strong> Technical logs including IP address, browser type, device information, and page request timestamps to ensure security and prevent platform misuse.
              </li>
            </ul>
          </section>

          {/* Section 3: Google AdSense & Cookies Disclosures */}
          <section className="space-y-5 bg-white/[0.02] p-6 sm:p-8 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <Cookie className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">3. Google AdSense, Advertising & Consent Framework</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              To keep our student utility tools and AI chat features free for everyone, Gravityverse partners with third-party advertising networks, including <strong>Google AdSense</strong>, to serve advertisements when you visit our website.
            </p>

            {/* Interactive Consent Control Box */}
            <div className="p-4 sm:p-5 rounded-2xl bg-brand-blue/10 border border-brand-blue/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-brand-blue" />
                  <span>Manage Cookie & Consent Preferences</span>
                </h3>
                <p className="text-xs text-slate-300">
                  Update, customize, or withdraw your consent settings at any time during your session.
                </p>
              </div>
              <button
                type="button"
                onClick={openConsentPreferences}
                className="px-4 py-2.5 bg-brand-blue hover:bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer shadow-md shadow-blue-500/20 active:scale-95"
              >
                Consent Preferences
              </button>
            </div>

            <ul className="list-disc pl-6 text-gray-400 space-y-2.5 text-xs sm:text-sm leading-relaxed">
              <li>
                <strong>Third-Party Vendors & Cookies:</strong> Third-party vendors, including Google, use cookies to serve ads based on prior visits to Gravityverse or other websites across the Internet.
              </li>
              <li>
                <strong>EEA, UK & Swiss User Consent (Google Certified CMP):</strong> For visitors in the European Economic Area (EEA), the United Kingdom, and Switzerland, Google AdSense implements an IAB Europe Transparency and Consent Framework (TCF v2.2) certified Consent Management Platform (Google Privacy & Messaging). This ensures personalized advertising is only loaded after required consent has been granted.
              </li>
              <li>
                <strong>Personalized Advertising Controls:</strong> Google's use of advertising cookies enables it and its partners to serve ads based on navigation history. You can adjust your Google Ads personalization settings anytime at <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline font-semibold inline-flex items-center gap-0.5">adssettings.google.com <ExternalLink className="w-3 h-3" /></a>.
              </li>
              <li>
                <strong>Third-Party Opt-Out Tools:</strong> You may also opt out of third-party vendor cookies for personalized advertising by visiting the Network Advertising Initiative at <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline font-semibold inline-flex items-center gap-0.5">www.aboutads.info <ExternalLink className="w-3 h-3" /></a> or the European Interactive Digital Advertising Alliance at <a href="https://www.youronlinechoices.eu" target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline font-semibold inline-flex items-center gap-0.5">www.youronlinechoices.eu <ExternalLink className="w-3 h-3" /></a>.
              </li>
            </ul>
          </section>

          {/* Section 4: Use of Data */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <Bell className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">4. How We Use Your Data</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base">
              We process user data strictly for academic and operational purposes, including:
            </p>
            <ul className="list-disc pl-6 text-gray-400 space-y-2 text-xs sm:text-sm leading-relaxed">
              <li>Delivering AI chat responses and search grounding results.</li>
              <li>Displaying campus events, hackathons, and medical workshops.</li>
              <li>Responding to support requests submitted through the Contact page.</li>
              <li>Maintaining portal stability, preventing security abuse, and auditing uptime.</li>
            </ul>
          </section>

          {/* Section 5: Data Rights */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <UserCheck className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">5. Your Data Rights & Deletion Requests</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              You have the right to access, update, or delete your account data stored on Gravityverse at any time. If you wish to delete your saved CGPA semester records, user profile, or chat history, you may do so directly in your Profile page or email us at <a href="mailto:support@gravityverse.in" className="text-brand-blue hover:underline font-semibold">support@gravityverse.in</a>.
            </p>
          </section>

          {/* Section 6: Contact */}
          <section className="space-y-4 border-t border-white/5 pt-6">
            <div className="flex items-center gap-3 text-brand-blue mb-2">
              <Globe className="w-6 h-6" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-white">6. Contact Information</h2>
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              If you have any questions, concerns, or feedback regarding this Privacy Policy, please contact the Gravityverse maintainer:
            </p>
            <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-xs sm:text-sm text-gray-300 space-y-1">
              <p><strong>Gravityverse Maintainer</strong></p>
              <p>SRM Institute of Science and Technology (SRMIST), Kattankulathur, Chengalpattu, Tamil Nadu, India</p>
              <p>Email: <a href="mailto:support@gravityverse.in" className="text-brand-blue hover:underline">support@gravityverse.in</a></p>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}

