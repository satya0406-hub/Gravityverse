import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Clock, Check, X, BellRing, Sparkles } from 'lucide-react';
import { SubjectCourse, TimetableSlot } from '../../lib/gpaCalculatorEngine';

interface ReminderPromptModalProps {
  isOpen: boolean;
  subject: SubjectCourse | null;
  slots?: TimetableSlot[];
  onConfirm: (reminderMinutes: number) => void;
  onDecline: () => void;
}

export function ReminderPromptModal({
  isOpen,
  subject,
  slots = [],
  onConfirm,
  onDecline,
}: ReminderPromptModalProps) {
  // Default selected option is 20 minutes, as mandated
  const [selectedMinutes, setSelectedMinutes] = useState<number>(20);
  const [customInput, setCustomInput] = useState<string>('25');
  const [isCustom, setIsCustom] = useState<boolean>(false);

  const presetOptions = [
    { label: '5 minutes before', value: 5 },
    { label: '10 minutes before', value: 10 },
    { label: '20 minutes before', value: 20 },
    { label: '30 minutes before', value: 30 },
    { label: '1 hour before', value: 60 },
  ];

  const handleSaveReminder = () => {
    let mins = selectedMinutes;
    if (isCustom) {
      mins = Math.max(1, Math.min(240, parseInt(customInput, 10) || 20));
    }

    // Request browser notification permission if available
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {
        console.warn('Could not request notification permission:', e);
      }
    }

    onConfirm(mins);
  };

  return (
    <AnimatePresence>
      {isOpen && subject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md bg-[#0b101f] border border-brand-blue/30 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 text-white my-auto max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center text-brand-blue shrink-0">
                <BellRing className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wide">Class Reminders</h3>
                <p className="text-xs text-slate-400">
                  {subject.code ? `${subject.code} — ` : ''}{subject.name}
                </p>
              </div>
            </div>
            <button
              onClick={onDecline}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Prompt Message */}
          <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-2">
            <p className="text-sm font-semibold text-slate-200">
              Would you like a reminder before this class?
            </p>
            <p className="text-xs text-slate-400">
              GPA+ will notify you so you never miss a lecture or attendance mark across your {slots.length} scheduled class period{slots.length === 1 ? '' : 's'}.
            </p>
          </div>

          {/* Notification Time Selector */}
          <div className="space-y-2.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Notify me:
            </label>
            <div className="grid grid-cols-1 gap-2">
              {presetOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setSelectedMinutes(opt.value);
                    setIsCustom(false);
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between border transition-all cursor-pointer ${
                    !isCustom && selectedMinutes === opt.value
                      ? 'bg-brand-blue/15 border-brand-blue text-brand-blue'
                      : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </div>
                  {!isCustom && selectedMinutes === opt.value && (
                    <Check className="w-4 h-4 text-brand-blue" />
                  )}
                </button>
              ))}

              {/* Custom option */}
              <div
                onClick={() => setIsCustom(true)}
                className={`w-full p-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isCustom
                    ? 'bg-brand-blue/15 border-brand-blue text-brand-blue'
                    : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Custom</span>
                  </div>
                  {isCustom && <Check className="w-4 h-4 text-brand-blue" />}
                </div>

                {isCustom && (
                  <div className="mt-2.5 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="number"
                      min="1"
                      max="240"
                      value={customInput}
                      onChange={e => setCustomInput(e.target.value)}
                      placeholder="Minutes"
                      className="w-20 h-8 px-2 bg-[#03060d] border border-brand-blue/40 rounded-lg text-white text-center font-mono font-bold text-xs outline-none focus:border-brand-blue"
                    />
                    <span className="text-xs text-slate-400">minutes before each class</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onDecline}
              className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={handleSaveReminder}
              className="w-full py-2.5 px-4 bg-brand-blue hover:bg-brand-blue/90 border border-brand-blue text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-brand-blue/20 transition-all cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5" /> Yes, set reminder
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
