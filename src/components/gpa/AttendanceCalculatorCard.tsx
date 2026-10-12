import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Plus,
  Minus,
  RotateCcw,
  BookOpen,
} from 'lucide-react';
import {
  calculateAttendanceMetrics,
  AttendanceCalculationResult,
  SubjectCourse,
} from '../../lib/gpaCalculatorEngine';

interface AttendanceCalculatorCardProps {
  conducted: number;
  present: number;
  targetPercent: number;
  subjects?: SubjectCourse[];
  onChangeConducted: (val: number) => void;
  onChangePresent: (val: number) => void;
  onChangeTargetPercent: (val: number) => void;
  onUpdateSubjectAttendance?: (subjectId: string, conducted: number, present: number) => void;
  onReset: () => void;
}

export function AttendanceCalculatorCard({
  conducted,
  present,
  targetPercent,
  subjects = [],
  onChangeConducted,
  onChangePresent,
  onChangeTargetPercent,
  onUpdateSubjectAttendance,
  onReset,
}: AttendanceCalculatorCardProps) {
  const [showFormula, setShowFormula] = useState(false);

  // Compute live metrics for overall attendance
  const metrics: AttendanceCalculationResult = calculateAttendanceMetrics(conducted, present, targetPercent);
  const targetPresets = [75, 80, 85, 90];

  const handleQuickSubjectAction = (subject: SubjectCourse, type: 'present' | 'absent') => {
    if (!onUpdateSubjectAttendance) return;
    const currentConducted = subject.attendance?.conducted || 0;
    const currentPresent = subject.attendance?.present || 0;

    if (type === 'present') {
      onUpdateSubjectAttendance(subject.id, currentConducted + 1, currentPresent + 1);
    } else {
      onUpdateSubjectAttendance(subject.id, currentConducted + 1, currentPresent);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. OVERALL ATTENDANCE SUMMARY CARD */}
      <div className="p-4 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl space-y-5 sm:space-y-6 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Overall Attendance
            </span>
            <div className="flex items-baseline gap-3 mt-1 flex-wrap">
              <span className="text-4xl sm:text-5xl font-mono font-black text-white">
                {metrics.isValid ? `${metrics.percentage}%` : '—'}
              </span>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  !metrics.isValid
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : metrics.percentage >= targetPercent
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                }`}
              >
                {metrics.isValid
                  ? metrics.percentage >= targetPercent
                    ? 'On Target'
                    : 'Below Target'
                  : 'No Records'}
              </span>
            </div>
          </div>

          <button
            onClick={onReset}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>

        {/* Linear Progress Bar with Target Marker */}
        <div className="space-y-1.5">
          <div className="relative w-full bg-slate-950 rounded-full h-4 overflow-hidden border border-white/5">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                metrics.percentage >= targetPercent ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, metrics.percentage))}%` }}
            />
            {/* Target marker line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
              style={{ left: `${targetPercent}%` }}
              title={`Target: ${targetPercent}%`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>0%</span>
            <span className="text-amber-400 font-bold">Target: {targetPercent}%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Key Targets & Missable Classes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-black/40 border border-white/5 rounded-xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Target
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {targetPresets.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChangeTargetPercent(preset)}
                  className={`flex-1 sm:flex-none px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer text-center ${
                    targetPercent === preset
                      ? 'bg-sky-500 text-white border-sky-400'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 bg-black/40 border border-white/5 rounded-xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              You Can Miss
            </span>
            <span className="text-xl font-mono font-black text-emerald-400 block">
              {metrics.canMissClasses} {metrics.canMissClasses === 1 ? 'class' : 'classes'}
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              While staying above {targetPercent}%
            </span>
          </div>

          <div className="p-3.5 bg-black/40 border border-white/5 rounded-xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Required to Reach Target
            </span>
            <span className="text-xl font-mono font-black text-rose-400 block">
              {metrics.neededClasses} {metrics.neededClasses === 1 ? 'class' : 'classes'}
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              Consecutive attendances needed
            </span>
          </div>
        </div>

        {/* Fast Adjustment Counters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pt-4 border-t border-white/5 text-xs text-slate-400">
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto text-center sm:text-left sm:flex sm:items-center sm:gap-4">
            <div className="p-2 sm:p-0 bg-white/[0.02] sm:bg-transparent rounded-lg border border-white/5 sm:border-0">
              <span className="text-slate-500 block sm:inline sm:mr-1.5 text-[10px] sm:text-xs uppercase sm:normal-case font-bold sm:font-normal">Conducted:</span>
              <strong className="text-white font-mono text-xs sm:text-sm">{conducted}</strong>
            </div>
            <div className="p-2 sm:p-0 bg-white/[0.02] sm:bg-transparent rounded-lg border border-white/5 sm:border-0">
              <span className="text-slate-500 block sm:inline sm:mr-1.5 text-[10px] sm:text-xs uppercase sm:normal-case font-bold sm:font-normal">Attended:</span>
              <strong className="text-white font-mono text-xs sm:text-sm">{present}</strong>
            </div>
            <div className="p-2 sm:p-0 bg-white/[0.02] sm:bg-transparent rounded-lg border border-white/5 sm:border-0">
              <span className="text-slate-500 block sm:inline sm:mr-1.5 text-[10px] sm:text-xs uppercase sm:normal-case font-bold sm:font-normal">Missed:</span>
              <strong className="text-white font-mono text-xs sm:text-sm">{Math.max(0, conducted - present)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                onChangeConducted(conducted + 1);
                onChangePresent(present + 1);
              }}
              className="h-11 sm:h-9 px-3.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs"
            >
              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> Attended Class
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeConducted(conducted + 1);
              }}
              className="h-11 sm:h-9 px-3.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs"
            >
              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> Missed Class
            </button>
          </div>
        </div>
      </div>

      {/* 2. SUBJECTS ATTENDANCE BREAKDOWN */}
      <div className="p-4 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl space-y-4 min-w-0">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-purple-400" />
            Subject Attendance
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {subjects.length} Subjects Enrolled
          </span>
        </div>

        {subjects.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No subjects added yet. Add subjects in Academics tab to track per-course attendance.
          </div>
        ) : (
          <div className="space-y-3">
            {subjects.map(sub => {
              const subConducted = sub.attendance?.conducted || 0;
              const subPresent = sub.attendance?.present || 0;
              const subMetrics = calculateAttendanceMetrics(subConducted, subPresent, targetPercent);

              return (
                <div
                  key={sub.id}
                  className="p-3.5 bg-black/30 border border-white/5 rounded-xl hover:border-white/15 transition-all space-y-2.5 min-w-0"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: sub.color || '#38bdf8' }}
                      />
                      <span className="text-xs font-bold text-white truncate">
                        {sub.name}
                      </span>
                      {sub.code && (
                        <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                          {sub.code}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <span
                        className={`text-sm font-mono font-bold ${
                          subMetrics.isValid && subMetrics.percentage >= targetPercent
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {subMetrics.isValid ? `${subMetrics.percentage}%` : '0%'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickSubjectAction(sub, 'present')}
                          className="h-8 px-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="Log Present"
                        >
                          +1 Present
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickSubjectAction(sub, 'absent')}
                          className="h-8 px-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/25 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="Log Missed"
                        >
                          +1 Missed
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Compact Progress Bar */}
                  <div className="relative w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-white/5">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        subMetrics.isValid && subMetrics.percentage >= targetPercent
                          ? 'bg-emerald-500'
                          : 'bg-rose-500'
                      }`}
                      style={{
                        width: `${subMetrics.isValid ? Math.min(100, Math.max(0, subMetrics.percentage)) : 0}%`,
                      }}
                    />
                  </div>

                  {/* Subtitle with stats */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>
                      {subPresent} / {subConducted} attended
                    </span>
                    <span>
                      {subMetrics.canMissClasses > 0
                        ? `Can miss ${subMetrics.canMissClasses}`
                        : subMetrics.neededClasses > 0
                        ? `Need ${subMetrics.neededClasses}`
                        : 'On track'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. FORMULA EXPLANATION */}
      <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
        <button
          type="button"
          onClick={() => setShowFormula(!showFormula)}
          className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Attendance Forecasting Logic & Formulas</span>
          </div>
          {showFormula ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <AnimatePresence>
          {showFormula && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 pt-3 text-xs text-slate-400"
            >
              <p className="font-mono text-[11px] text-sky-300 bg-black/40 p-2.5 rounded-lg border border-white/5">
                {metrics.detailedAnalysis}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
