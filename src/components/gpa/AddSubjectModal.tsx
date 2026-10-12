import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Plus, X, Sparkles, Hash, Award } from 'lucide-react';
import { SubjectCourse, getSubjectColor } from '../../lib/gpaCalculatorEngine';

interface AddSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSubject: (newSubject: SubjectCourse, openScheduleAfter: boolean) => void;
  existingSubjectCount: number;
}

export function AddSubjectModal({
  isOpen,
  onClose,
  onAddSubject,
  existingSubjectCount,
}: AddSubjectModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [credits, setCredits] = useState<number>(4);
  const [setupScheduleNow, setSetupScheduleNow] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a subject name.');
      return;
    }

    const newSubject: SubjectCourse = {
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      name: name.trim(),
      code: code.trim() || undefined,
      credits: Math.max(1, Math.min(30, credits || 1)),
      evaluationMode: 'components',
      components: [
        {
          id: 'comp-' + Date.now() + '-1',
          name: 'Internal Assessment',
          obtainedMarks: 40,
          maximumMarks: 50,
          isScaled: true,
          scaledMaximum: 25,
        },
        {
          id: 'comp-' + Date.now() + '-2',
          name: 'End Semester Exam',
          obtainedMarks: 80,
          maximumMarks: 100,
          isScaled: true,
          scaledMaximum: 50,
        },
      ],
      attendance: {
        conducted: 30,
        present: 27,
        targetPercentage: 75,
      },
      timetable: [],
      color: getSubjectColor(existingSubjectCount),
    };

    onAddSubject(newSubject, setupScheduleNow);
    setName('');
    setCode('');
    setCredits(4);
    setError(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-lg bg-[#0b101f] border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 text-white max-h-[92vh] overflow-y-auto my-auto"
          >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center text-brand-blue shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wide">
                  Add New Subject / Course
                </h3>
                <p className="text-xs text-slate-400">
                  Integrates across Marks, Attendance, and Class Schedule
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Subject Name */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                Subject Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. Computer Networks / Data Structures"
                className="w-full h-11 px-3.5 bg-[#03060d] border border-white/10 rounded-xl text-white text-sm font-bold placeholder:text-slate-600 outline-none focus:border-brand-blue transition-colors"
                autoFocus
              />
            </div>

            {/* Course Code & Credits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                  Course Code <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <Hash className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 21CSC302J"
                    className="w-full h-11 pl-8 pr-3 bg-[#03060d] border border-white/10 rounded-xl text-white text-xs font-mono font-bold placeholder:text-slate-600 outline-none focus:border-brand-blue transition-colors uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                  Credits <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Award className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3.5" />
                  <select
                    value={credits}
                    onChange={e => setCredits(Number(e.target.value))}
                    className="w-full h-11 pl-8 pr-3 bg-[#03060d] border border-white/10 rounded-xl text-white text-xs font-mono font-bold outline-none focus:border-brand-blue transition-colors cursor-pointer"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map(cr => (
                      <option key={cr} value={cr}>
                        {cr} {cr === 1 ? 'Credit' : 'Credits'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Prompt for immediate schedule setup */}
            <div className="p-3.5 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-200 block">
                  Add Class Schedule Immediately
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Opens the weekly timetable creator right after adding
                </span>
              </div>
              <input
                type="checkbox"
                checked={setupScheduleNow}
                onChange={e => setSetupScheduleNow(e.target.checked)}
                className="w-4 h-4 rounded text-brand-blue focus:ring-brand-blue bg-black/50 border-white/20 cursor-pointer"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-3 sm:py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-brand-blue hover:bg-brand-blue/90 border border-brand-blue text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-brand-blue/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create Subject
              </button>
            </div>
          </form>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
