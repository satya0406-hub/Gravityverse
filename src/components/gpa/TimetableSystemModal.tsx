import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Layers,
  Calendar,
  Check,
  Sparkles,
  Info,
  CalendarClock,
  ArrowRight,
} from 'lucide-react';
import { TimetableSystem } from '../../lib/gpaCalculatorEngine';

export interface TimetableSystemModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSystem: TimetableSystem;
  onSelectSystem: (system: TimetableSystem) => void;
}

export function TimetableSystemModal({
  isOpen,
  onClose,
  currentSystem,
  onSelectSystem,
}: TimetableSystemModalProps) {
  const [selected, setSelected] = useState<TimetableSystem>(currentSystem);

  // Sync with current prop when opened
  React.useEffect(() => {
    setSelected(currentSystem);
  }, [currentSystem, isOpen]);

  const handleApply = () => {
    onSelectSystem(selected);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-xl bg-[#0b101f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[92vh] my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-white/10 bg-gradient-to-r from-brand-blue/10 via-transparent to-purple-500/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center text-brand-blue shrink-0">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-wide">
                  Timetable System Setup
                </h3>
                <p className="text-xs text-slate-400">
                  Choose how your university organizes your weekly class timetable.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
            <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-200 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                You can change this setting at any time. Your subjects, marks, grades, and attendance records will remain safely preserved.
              </span>
            </div>

            {/* Option 1: Day Order */}
            <div
              onClick={() => setSelected('day_order')}
              className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                selected === 'day_order'
                  ? 'bg-sky-950/20 border-sky-500 shadow-lg shadow-sky-500/10'
                  : 'bg-black/30 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    selected === 'day_order'
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                      : 'bg-white/5 border-white/10 text-slate-400'
                  }`}>
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black text-white">Day Order</h4>
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-mono font-bold">
                        Day 1, 2, 3...
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">SRM & Cyclical Universities</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      For campuses following cyclical day orders. Always displays both <strong className="text-slate-200">Weekday + Day Order</strong> (e.g. <em>Monday • Day Order 3</em>).
                    </p>
                  </div>
                </div>

                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                  selected === 'day_order'
                    ? 'border-sky-500 bg-sky-500 text-white'
                    : 'border-slate-600 bg-transparent'
                }`}>
                  {selected === 'day_order' && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Day Order Features preview pill list */}
              <div className="mt-3.5 pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span><strong>Holiday:</strong> Day order carries forward</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <span><strong>Suspended:</strong> Day order not carried forward</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                  <span><strong>Rescheduled:</strong> Moves specific classes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                  <span><strong>Display:</strong> Weekday + Day Order dual tag</span>
                </div>
              </div>
            </div>

            {/* Option 2: Weekday */}
            <div
              onClick={() => setSelected('weekday')}
              className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                selected === 'weekday'
                  ? 'bg-purple-950/20 border-purple-500 shadow-lg shadow-purple-500/10'
                  : 'bg-black/30 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    selected === 'weekday'
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                      : 'bg-white/5 border-white/10 text-slate-400'
                  }`}>
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black text-white">Weekday</h4>
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold">
                        Monday – Sunday
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">Standard University Schedule</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      For universities with fixed weekly schedules. Monday classes happen on Monday, Tuesday on Tuesday, etc. Always calculates actual calendar weekday.
                    </p>
                  </div>
                </div>

                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                  selected === 'weekday'
                    ? 'border-purple-500 bg-purple-500 text-white'
                    : 'border-slate-600 bg-transparent'
                }`}>
                  {selected === 'weekday' && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Weekday Features preview pill list */}
              <div className="mt-3.5 pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                  <span><strong>Grid Mapping:</strong> Mon, Tue, Wed, Thu, Fri, Sat, Sun</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span><strong>Holiday:</strong> Cancels that day&apos;s classes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <span><strong>Suspended:</strong> Cancels that day&apos;s classes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span><strong>Rescheduled:</strong> Moves selected class to new day/time</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 border-t border-white/10 bg-black/40 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2.5 bg-gradient-to-r from-brand-blue to-purple-600 hover:opacity-90 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-brand-blue/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>Apply {selected === 'day_order' ? 'Day Order' : 'Weekday'} System</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
