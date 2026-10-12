import { Mail, Phone, Clock, MessageSquare, Send, ArrowRight, Loader2, CheckCircle, UserCheck, UserX } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError } from '../lib/errorHandler';
import { trackContact } from '../lib/analytics';
import { getApiBaseUrl } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';

import { SectionHeader } from '../components/SectionHeader';

export function ContactPage() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [formStarted, setFormStarted] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: prev.name || user.displayName || user.email?.split('@')[0] || '',
        email: prev.email || user.email || ''
      }));
    }
  }, [user]);

  useEffect(() => {
    try {
      trackContact.pageOpened();
    } catch (e) {
      console.warn('Analytics contact_page_opened failed:', e);
    }
  }, []);

  const handleInputChange = (field: string, value: string) => {
    if (!formStarted) {
      setFormStarted(true);
      try {
        trackContact.formStarted();
      } catch (e) {
        console.warn('Analytics contact_form_started failed:', e);
      }
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Trim values on client-side to handle accidental spaces (common with autocomplete and mobile keyboards)
    const trimmedData = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      subject: formData.subject.trim(),
      message: formData.message.trim()
    };

    if (!trimmedData.name || !trimmedData.email || !trimmedData.message) {
      setError('Please fill in all required fields.');
      return;
    }
    
    setLoading(true);
    setSuccess(false);
    setError('');

    const startTime = Date.now();

    try {
      // 1. Log to Firestore Backup Archive (Non-blocking)
      let firestoreSaved = false;
      try {
        await addDoc(collection(db, 'contacts'), {
          ...trimmedData,
          createdAt: serverTimestamp()
        });
        firestoreSaved = true;
      } catch (e) {
        console.warn("Firestore backup save failed or was bypassed (non-blocking, proceeding to email transmission):", e);
      }

      // 2. Transmit Email Real-Time Message Payload to Server API
      let emailDispatched = false;
      let emailErrorMsg = '';
      try {
        const apiBaseUrl = getApiBaseUrl();
        const fetchUrl = `${apiBaseUrl}/api/contact`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout fallback for reliable delivery

        const response = await fetch(fetchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trimmedData),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const responseData = await response.json().catch(() => ({}));

        if (response.ok) {
          emailDispatched = true;
        } else {
          emailErrorMsg = responseData.error || response.statusText || 'Unknown backend error';
          console.warn("Backend email dispatch returned an error status:", emailErrorMsg);
        }
      } catch (emailErr: any) {
        emailErrorMsg = emailErr.message || 'Network timeout or unreachable';
        console.warn("Backend email dispatch timed out or was unreachable:", emailErr);
      }

      if (!emailDispatched) {
        throw new Error(`Email dispatch failed: ${emailErrorMsg}`);
      }

      try {
        trackContact.formSubmitted(
          'success',
          emailDispatched,
          Date.now() - startTime,
          !!trimmedData.subject,
          trimmedData.message.length
        );
      } catch (e) {
        console.warn(e);
      }

      setSuccess(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
      setFormStarted(false);
    } catch (err: any) {
      const errMsg = err.message || 'Transmission netcode failure.';
      setError(errMsg);
      try {
        trackContact.formSubmitted(
          'failed',
          false,
          Date.now() - startTime,
          !!trimmedData.subject,
          trimmedData.message.length,
          errMsg
        );
      } catch (e) {
        console.warn(e);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-20 sm:pt-32 pb-12 sm:pb-24 px-4 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-20">
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="space-y-6 sm:space-y-12"
        >
          <SectionHeader 
            whiteText="Contact" 
            blueText="Maintainer" 
            description="Have questions about SRM events, GPA tools, or our AI study assistant? Reach out to the Gravityverse maintainer."
          />

          <div className="space-y-4 sm:space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ x: 6 }}
              transition={{ type: "spring", stiffness: 120 }}
              className="flex items-start gap-4 sm:gap-6 group"
            >
              <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                <Mail className="text-brand-blue w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-lg text-white">Direct Support Email</h4>
                <p className="text-gray-300 font-medium">support@gravityverse.in</p>
                <p className="text-gray-400 text-sm mt-1">For general inquiries, event additions, or technical feedback, drop us a line at <span className="text-brand-blue font-semibold">support@gravityverse.in</span></p>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ x: 6 }}
              transition={{ type: "spring", stiffness: 120, delay: 0.1 }}
              className="flex items-start gap-4 sm:gap-6 group"
            >
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                <Clock className="text-gray-400 w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-lg text-white">Campus Location & Latency</h4>
                <p className="text-gray-300">SRMIST Kattankulathur, Chennai, Tamil Nadu</p>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 block">Expected Response: Within 24 Hours</span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <motion.form 
          onSubmit={handleSubmit}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6 sm:space-y-12"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-12">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Full Name</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="John Doe" 
                className="w-full bg-transparent border-b border-white/10 py-5 focus:border-brand-blue outline-none transition-all placeholder:text-gray-800" 
              />
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Email Address</label>
              <input 
                required
                type="email" 
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="john@example.com" 
                className="w-full bg-transparent border-b border-white/10 py-5 focus:border-brand-blue outline-none transition-all placeholder:text-gray-800" 
              />
            </div>
          </div>
          
          <div className="space-y-4">
             <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Subject</label>
             <input 
               type="text" 
               value={formData.subject}
               onChange={(e) => handleInputChange('subject', e.target.value)}
               placeholder="Inquiry about..." 
               className="w-full bg-transparent border-b border-white/10 py-5 focus:border-brand-blue outline-none transition-all placeholder:text-gray-800" 
             />
          </div>

          <div className="space-y-4">
             <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Message</label>
             <textarea 
               required
               rows={4} 
               value={formData.message}
               onChange={(e) => handleInputChange('message', e.target.value)}
               placeholder="Describe your request..." 
               className="w-full bg-transparent border-b border-white/10 py-5 focus:border-brand-blue outline-none transition-all resize-none placeholder:text-gray-800" 
             />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full btn-primary flex items-center justify-center gap-3 py-5 text-lg group"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Transmit Message
                <Send className="w-5 h-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
              </>
            )}
          </button>

          {success && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }} 
               animate={{ opacity: 1, scale: 1 }} 
               className="p-5 bg-emerald-500/10 text-emerald-400 rounded-xl text-left text-sm border border-emerald-500/20 space-y-2 animate-fade-in"
            >
               <div className="flex items-center gap-2 font-bold text-emerald-300">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <span>Message Saved and Transmitted</span>
               </div>
               <p className="text-xs text-gray-300 leading-relaxed pl-7">
                 Your message has been processed successfully, securely backed up, and the email successfully dispatched through the secure Resend API gateway.
               </p>
            </motion.div>
          )}

          {error && (
            <div className="text-red-400 text-xs text-center border border-red-500/20 bg-red-500/10 p-3 rounded-xl">
              {error}
            </div>
          )}
        </motion.form>
      </div>
    </div>
  );
}
