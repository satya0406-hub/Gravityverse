import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Calculator,
  CalendarCheck,
  TrendingUp,
  Target,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  BookOpen,
  Plus,
  Minus,
  Layers,
  Award,
  ShieldAlert,
  ArrowRight,
  Sliders,
  Calendar,
} from 'lucide-react';

import {
  SubjectCourse,
  GradeBand,
  SemesterRecord,
  HolidayRecord,
  predictAttendance,
  predictSubjectAttendance,
  predictSubjectMarks,
  calculateRequiredExamScore,
  predictOverallSgpa,
  predictOverallCgpa,
  calculateRequiredFutureSgpaForTargetCgpa,
  FutureSemesterPlan,
  lookupGrade,
} from '../../lib/gpaCalculatorEngine';

interface PredictionSimulatorCardProps {
  subjects: SubjectCourse[];
  activeGradeBands: GradeBand[];
  semesters: SemesterRecord[];
  holidays: HolidayRecord[];
  overallAttendanceConducted: number;
  overallAttendancePresent: number;
  overallAttendanceTarget: number;
  scaleMax: 10 | 4;
  onApplyAttendanceToLive?: (conducted: number, present: number) => void;
  onNavigateTab?: (tab: 'overview' | 'academics' | 'timetable' | 'attendance' | 'cgpa') => void;
}

export function PredictionSimulatorCard({
  subjects,
  activeGradeBands,
  semesters,
  holidays,
  overallAttendanceConducted,
  overallAttendancePresent,
  overallAttendanceTarget,
  scaleMax,
  onNavigateTab,
}: PredictionSimulatorCardProps) {
  // Simulator Navigation Sub-tabs
  const [subTab, setSubTab] = useState<'cockpit' | 'attendance' | 'marks' | 'gpa'>('cockpit');

  // --- 1. Attendance Simulation State ---
  const [simMissedClasses, setSimMissedClasses] = useState<number>(0);
  const [simAttendedClasses, setSimAttendedClasses] = useState<number>(0);
  const [simHolidays, setSimHolidays] = useState<number>(0);
  const [simTargetPercent, setSimTargetPercent] = useState<number>(overallAttendanceTarget || 75);

  // Per-subject individual miss/attend adjustments
  const [subjectAttendanceMods, setSubjectAttendanceMods] = useState<
    Record<string, { missed: number; attended: number }>
  >({});

  // --- 2. Marks & Component Simulation State ---
  // Key: componentId -> { simulatedObtained?: number; lostMarks?: number }
  const [componentMods, setComponentMods] = useState<
    Record<string, { simulatedObtained?: number; lostMarks?: number }>
  >({});

  // Direct grade overrides for subjects evaluated by direct_grade
  const [directGradeOverrides, setDirectGradeOverrides] = useState<Record<string, number>>({});

  // Selected subject for detailed target exam score analysis
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    subjects.length > 0 ? subjects[0].id : ''
  );
  const [targetGradeBandId, setTargetGradeBandId] = useState<string>(
    activeGradeBands.length > 0 ? activeGradeBands[0].id : ''
  );

  // --- 3. SGPA Target Solver State ---
  const [targetSgpaGoal, setTargetSgpaGoal] = useState<number>(scaleMax === 10 ? 9.0 : 3.8);

  // --- 4. CGPA Future Semesters Simulation State ---
  const [futureSemesters, setFutureSemesters] = useState<FutureSemesterPlan[]>([
    { id: 'fut-1', semesterName: 'Upcoming Sem 1', credits: 22, targetSgpa: scaleMax === 10 ? 9.0 : 3.7 },
    { id: 'fut-2', semesterName: 'Upcoming Sem 2', credits: 20, targetSgpa: scaleMax === 10 ? 9.2 : 3.8 },
  ]);
  const [targetGradCgpaGoal, setTargetGradCgpaGoal] = useState<number>(scaleMax === 10 ? 8.75 : 3.65);

  // Expandable transparency sections
  const [showFormulaExplanation, setShowFormulaExplanation] = useState(false);

  // ==========================================
  // COMPUTED ENGINE PREDICTIONS
  // ==========================================

  // Overall Attendance Prediction
  const attendancePrediction = useMemo(() => {
    return predictAttendance(
      overallAttendanceConducted,
      overallAttendancePresent,
      simTargetPercent,
      simMissedClasses,
      simAttendedClasses,
      simHolidays,
      1
    );
  }, [
    overallAttendanceConducted,
    overallAttendancePresent,
    simTargetPercent,
    simMissedClasses,
    simAttendedClasses,
    simHolidays,
  ]);

  // Per-Subject Attendance Predictions
  const subjectAttendancePredictions = useMemo(() => {
    return subjects.map(s => {
      const mod = subjectAttendanceMods[s.id] || { missed: 0, attended: 0 };
      return predictSubjectAttendance(s, simTargetPercent, mod.missed, mod.attended);
    });
  }, [subjects, simTargetPercent, subjectAttendanceMods]);

  // SGPA Prediction (encompasses all subject marks modifications)
  const sgpaPrediction = useMemo(() => {
    return predictOverallSgpa(subjects, activeGradeBands, componentMods, directGradeOverrides);
  }, [subjects, activeGradeBands, componentMods, directGradeOverrides]);

  // Current semester total credits
  const currentSemesterCredits = useMemo(() => {
    return subjects.reduce((sum, s) => sum + (s.credits || 0), 0);
  }, [subjects]);

  // CGPA Multi-Semester Prediction
  const cgpaPrediction = useMemo(() => {
    return predictOverallCgpa(
      semesters,
      currentSemesterCredits,
      sgpaPrediction.projectedSgpa,
      futureSemesters
    );
  }, [semesters, currentSemesterCredits, sgpaPrediction.projectedSgpa, futureSemesters]);

  // Target Graduation CGPA Solver
  const remainingFutureCredits = useMemo(() => {
    return futureSemesters.reduce((acc, f) => acc + (f.credits || 0), 0);
  }, [futureSemesters]);

  const graduationCgpaSolution = useMemo(() => {
    return calculateRequiredFutureSgpaForTargetCgpa(
      semesters,
      currentSemesterCredits,
      remainingFutureCredits,
      targetGradCgpaGoal
    );
  }, [semesters, currentSemesterCredits, remainingFutureCredits, targetGradCgpaGoal]);

  // Selected Subject for Target Exam Score Solver
  const selectedSubject = useMemo(() => {
    return subjects.find(s => s.id === selectedSubjectId) || subjects[0] || null;
  }, [subjects, selectedSubjectId]);

  const selectedTargetBand = useMemo(() => {
    return activeGradeBands.find(b => b.id === targetGradeBandId) || activeGradeBands[0];
  }, [activeGradeBands, targetGradeBandId]);

  const requiredExamScoreResult = useMemo(() => {
    if (!selectedSubject || !selectedTargetBand) return null;
    return calculateRequiredExamScore(selectedSubject, selectedTargetBand, activeGradeBands);
  }, [selectedSubject, selectedTargetBand, activeGradeBands]);

  // ==========================================
  // QUICK PRESET SCENARIOS
  // ==========================================

  const applyScenario = (type: 'top_performer' | 'holiday_week' | 'safety_net' | 'reset') => {
    if (type === 'reset') {
      setSimMissedClasses(0);
      setSimAttendedClasses(0);
      setSimHolidays(0);
      setSubjectAttendanceMods({});
      setComponentMods({});
      setDirectGradeOverrides({});
      return;
    }

    if (type === 'top_performer') {
      // Set all upcoming / end-sem components to 95% of maximum
      const newMods: Record<string, { simulatedObtained: number }> = {};
      subjects.forEach(s => {
        s.components.forEach((comp, idx) => {
          if (
            comp.name.toLowerCase().includes('end') ||
            comp.name.toLowerCase().includes('final') ||
            idx === s.components.length - 1
          ) {
            newMods[comp.id] = { simulatedObtained: Math.round(comp.maximumMarks * 0.95) };
          }
        });
      });
      setComponentMods(newMods);
      setSimAttendedClasses(15);
      setSimMissedClasses(0);
    }

    if (type === 'holiday_week') {
      // Simulates 5 days of holiday (cancels classes) + 2 planned bunks
      setSimHolidays(5);
      setSimMissedClasses(2);
      setSimAttendedClasses(8);
    }

    if (type === 'safety_net') {
      // Simulate scoring minimum 50% pass on upcoming exams, with 3 missed classes
      const newMods: Record<string, { simulatedObtained: number }> = {};
      subjects.forEach(s => {
        s.components.forEach((comp, idx) => {
          if (
            comp.name.toLowerCase().includes('end') ||
            comp.name.toLowerCase().includes('final') ||
            idx === s.components.length - 1
          ) {
            newMods[comp.id] = { simulatedObtained: Math.round(comp.maximumMarks * 0.5) };
          }
        });
      });
      setComponentMods(newMods);
      setSimMissedClasses(3);
    }
  };

  const handleUpdateSubjectAttendanceMod = (
    subjectId: string,
    action: 'miss_plus' | 'miss_minus' | 'attend_plus' | 'attend_minus'
  ) => {
    setSubjectAttendanceMods(prev => {
      const current = prev[subjectId] || { missed: 0, attended: 0 };
      let newMissed = current.missed;
      let newAttended = current.attended;

      if (action === 'miss_plus') newMissed += 1;
      if (action === 'miss_minus') newMissed = Math.max(0, newMissed - 1);
      if (action === 'attend_plus') newAttended += 1;
      if (action === 'attend_minus') newAttended = Math.max(0, newAttended - 1);

      return {
        ...prev,
        [subjectId]: { missed: newMissed, attended: newAttended },
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & COCKPIT SUMMARY BANNER */}
      <div className="p-5 sm:p-7 bg-gradient-to-br from-[#0c1329] via-[#0b101f] to-[#120e2e] border border-sky-500/30 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-950">
                  Academic Prediction Engine
                </span>
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> What-If Simulator
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-black text-white tracking-tight">
                Simulate Holidays, Exams & Trajectory
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mt-1 leading-relaxed">
                Test bunks, exam score swings, and future semester targets in real time. Solve required
                scores to achieve your dream SGPA and target attendance without risking debarment.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => applyScenario('reset')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
                title="Reset simulation parameters to live data"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Simulation</span>
              </button>
            </div>
          </div>

          {/* Key Simulation Gauges (3 Core Pillars) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
            {/* Gauge 1: Projected Attendance */}
            <div className="p-4 bg-black/40 border border-white/10 rounded-2xl relative overflow-hidden backdrop-blur-md">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
                <span className="flex items-center gap-1.5">
                  <CalendarCheck className="w-4 h-4 text-sky-400" />
                  Projected Attendance
                </span>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                    attendancePrediction.status === 'safe'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : attendancePrediction.status === 'warning'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {attendancePrediction.status === 'safe'
                    ? 'Target Met'
                    : attendancePrediction.status === 'warning'
                    ? 'Low Margin'
                    : 'Debarment Risk'}
                </span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-3xl sm:text-4xl font-mono font-black text-white">
                  {attendancePrediction.projectedPercentage}%
                </span>
                <span
                  className={`text-xs font-bold font-mono ${
                    attendancePrediction.percentageDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {attendancePrediction.percentageDelta >= 0 ? '+' : ''}
                  {attendancePrediction.percentageDelta}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 truncate">
                {attendancePrediction.isTargetMet
                  ? `Buffer: ${attendancePrediction.canMissMoreClasses} classes can still be missed`
                  : `Must attend next ${attendancePrediction.neededToAttendConsecutively} classes consecutively`}
              </p>
            </div>

            {/* Gauge 2: Projected Semester SGPA */}
            <div className="p-4 bg-black/40 border border-white/10 rounded-2xl relative overflow-hidden backdrop-blur-md">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
                <span className="flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-purple-400" />
                  Projected SGPA
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Base: {sgpaPrediction.baselineSgpa.toFixed(2)}
                </span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-3xl sm:text-4xl font-mono font-black text-white">
                  {sgpaPrediction.projectedSgpa.toFixed(2)}
                </span>
                <span
                  className={`text-xs font-bold font-mono ${
                    sgpaPrediction.sgpaDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {sgpaPrediction.sgpaDelta >= 0 ? '+' : ''}
                  {sgpaPrediction.sgpaDelta.toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Weighted across {sgpaPrediction.totalCredits} enrolled credits in this semester
              </p>
            </div>

            {/* Gauge 3: Projected Cumulative CGPA */}
            <div className="p-4 bg-black/40 border border-white/10 rounded-2xl relative overflow-hidden backdrop-blur-md">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-amber-400" />
                  Projected CGPA
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {cgpaPrediction.totalProjectedCredits} Credits
                </span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-3xl sm:text-4xl font-mono font-black text-white">
                  {cgpaPrediction.cumulativeProjectedCgpa.toFixed(2)}
                </span>
                <span
                  className={`text-xs font-bold font-mono ${
                    cgpaPrediction.cgpaDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {cgpaPrediction.cgpaDelta >= 0 ? '+' : ''}
                  {cgpaPrediction.cgpaDelta.toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Includes {semesters.length} past + current + {futureSemesters.length} planned future sems
              </p>
            </div>
          </div>

          {/* Quick Scenario Preset Chips */}
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/10">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">
              Quick Scenarios:
            </span>
            <button
              onClick={() => applyScenario('top_performer')}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              🌟 Top Performer (95% Upcoming)
            </button>
            <button
              onClick={() => applyScenario('holiday_week')}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              🌴 Holiday Week + 2 Bunks
            </button>
            <button
              onClick={() => applyScenario('safety_net')}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              🛡️ Safety Net (Pass Baseline)
            </button>
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="flex items-center gap-1.5 p-1 bg-[#0b101f] border border-white/10 rounded-2xl overflow-x-auto no-scrollbar">
        {[
          { id: 'cockpit', label: 'Interactive Cockpit', icon: Sliders },
          { id: 'attendance', label: 'Attendance & Holidays', icon: CalendarCheck },
          { id: 'marks', label: 'Marks & Exam Solver', icon: Calculator },
          { id: 'gpa', label: 'SGPA & CGPA Trajectory', icon: TrendingUp },
        ].map(t => {
          const Icon = t.icon;
          const isActive = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as any)}
              className={`flex-1 min-w-[140px] h-10 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. SUB-TAB 1: INTERACTIVE COCKPIT */}
      {subTab === 'cockpit' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Controls Card */}
            <div className="p-5 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center font-bold">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Live Variable Tuning</h3>
                    <p className="text-[11px] text-slate-400">Simulate parameters to see instant outcomes</p>
                  </div>
                </div>
              </div>

              {/* Slider 1: Missed Classes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    Planned Bunks / Missed Classes
                  </span>
                  <span className="font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20">
                    +{simMissedClasses} classes
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  value={simMissedClasses}
                  onChange={e => setSimMissedClasses(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0 (None)</span>
                  <span>10 classes</span>
                  <span>25 classes</span>
                </div>
              </div>

              {/* Slider 2: Upcoming Attended Classes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    Upcoming Classes to Attend
                  </span>
                  <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                    +{simAttendedClasses} attended
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={simAttendedClasses}
                  onChange={e => setSimAttendedClasses(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0 (None)</span>
                  <span>20 classes</span>
                  <span>40 classes</span>
                </div>
              </div>

              {/* Slider 3: University Holidays */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    Declared / Simulated Holidays
                  </span>
                  <span className="font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-lg border border-sky-500/20">
                    +{simHolidays} holiday days
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="15"
                  value={simHolidays}
                  onChange={e => setSimHolidays(Number(e.target.value))}
                  className="w-full accent-sky-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0</span>
                  <span>7 days</span>
                  <span>15 days</span>
                </div>
              </div>

              {/* Target Threshold Selector */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <span className="text-xs font-semibold text-slate-300 block">
                  Target Attendance Threshold
                </span>
                <div className="flex items-center gap-2">
                  {[75, 80, 85, 90].map(pct => (
                    <button
                      key={pct}
                      onClick={() => setSimTargetPercent(pct)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        simTargetPercent === pct
                          ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                          : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Simulated Outcome & Recommendations Card */}
            <div className="p-5 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">
                      <Target className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Projected Academic Health</h3>
                      <p className="text-[11px] text-slate-400">Mathematical impact on status</p>
                    </div>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    attendancePrediction.status === 'safe'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : attendancePrediction.status === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm mb-1">
                    {attendancePrediction.status === 'safe' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : attendancePrediction.status === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{attendancePrediction.message}</span>
                  </div>
                  <p className="text-xs opacity-90 leading-relaxed mt-1">
                    {attendancePrediction.detailedAnalysis}
                  </p>
                </div>

                {/* Quick breakdown list */}
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Current Conducted / Present:</span>
                    <span className="font-mono font-bold text-white">
                      {overallAttendanceConducted} / {overallAttendancePresent} (
                      {attendancePrediction.currentPercentage}%)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Projected Conducted / Present:</span>
                    <span className="font-mono font-bold text-sky-400">
                      {attendancePrediction.projectedConducted} / {attendancePrediction.projectedPresent} (
                      {attendancePrediction.projectedPercentage}%)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Classes Saved by Simulated Holidays:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{attendancePrediction.classesSavedByHolidays} lecture hours preserved
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Semester SGPA Swing:</span>
                    <span
                      className={`font-mono font-bold ${
                        sgpaPrediction.sgpaDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {sgpaPrediction.baselineSgpa.toFixed(2)} → {sgpaPrediction.projectedSgpa.toFixed(2)} (
                      {sgpaPrediction.sgpaDelta >= 0 ? '+' : ''}
                      {sgpaPrediction.sgpaDelta.toFixed(2)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Jump Button */}
              <div className="pt-2">
                <button
                  onClick={() => setSubTab('marks')}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 transition-all cursor-pointer"
                >
                  <span>Solve Required Exam Scores in Marks Simulator</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SUB-TAB 2: ATTENDANCE & HOLIDAY SIMULATOR */}
      {subTab === 'attendance' && (
        <div className="space-y-6">
          {/* Main Attendance Simulation Controls */}
          <div className="p-5 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-sky-400" />
                  Attendance & Holiday What-If Simulator
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simulate missed lectures, attending upcoming classes, and holiday closures to forecast
                  attendance across all subjects.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Target:</span>
                {[75, 80, 85].map(p => (
                  <button
                    key={p}
                    onClick={() => setSimTargetPercent(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      simTargetPercent === p
                        ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            {/* 3 Step Controls for Simulation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Box 1: Bunk Planner */}
              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    Simulated Bunks
                  </span>
                  <span className="text-lg font-mono font-black text-rose-400">{simMissedClasses}</span>
                </div>
                <p className="text-[11px] text-slate-400">Classes you plan or expect to miss</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSimMissedClasses(Math.max(0, simMissedClasses - 1))}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-bold flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSimMissedClasses(simMissedClasses + 1)}
                    className="flex-1 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Miss +1
                  </button>
                </div>
              </div>

              {/* Box 2: Attending Upcoming Classes */}
              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Upcoming Attended
                  </span>
                  <span className="text-lg font-mono font-black text-emerald-400">
                    {simAttendedClasses}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Future scheduled classes to attend</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSimAttendedClasses(Math.max(0, simAttendedClasses - 1))}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-bold flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSimAttendedClasses(simAttendedClasses + 1)}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Attend +1
                  </button>
                </div>
              </div>

              {/* Box 3: Holiday Preservation */}
              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-sky-400" />
                    Declared Holidays
                  </span>
                  <span className="text-lg font-mono font-black text-sky-400">{simHolidays}</span>
                </div>
                <p className="text-[11px] text-slate-400">Holidays cancel lectures and preserve %</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSimHolidays(Math.max(0, simHolidays - 1))}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-bold flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSimHolidays(simHolidays + 1)}
                    className="flex-1 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 text-xs font-bold flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Holiday +1
                  </button>
                </div>
              </div>
            </div>

            {/* Attendance Status Callout */}
            <div
              className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                attendancePrediction.isTargetMet
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <div>
                <span className="text-xs font-black uppercase tracking-wider block">
                  {attendancePrediction.isTargetMet ? 'Projected Safe Status' : 'Projected Deficit Warning'}
                </span>
                <span className="text-sm font-semibold mt-0.5 block">
                  {attendancePrediction.isTargetMet
                    ? `Safe margin: You can miss up to ${attendancePrediction.canMissMoreClasses} additional classes before dropping below ${simTargetPercent}%.`
                    : `Action required: You must attend the next ${attendancePrediction.neededToAttendConsecutively} consecutive classes without missing any lecture to reach ${simTargetPercent}%.`}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl font-mono font-black text-white">
                  {attendancePrediction.projectedPercentage}%
                </span>
                <span className="text-[11px] block opacity-80">
                  Target: {simTargetPercent}%
                </span>
              </div>
            </div>
          </div>

          {/* Subject-by-Subject Attendance Simulation Breakdown */}
          <div className="p-5 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-sky-400" />
                Per-Subject Simulated Attendance Impact
              </h4>
              <span className="text-xs text-slate-400">{subjects.length} Enrolled Courses</span>
            </div>

            {subjects.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No subjects enrolled yet. Add subjects in Academics to simulate course attendance.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {subjectAttendancePredictions.map(item => {
                  return (
                    <div
                      key={item.subjectId}
                      className="p-4 bg-black/40 border border-white/5 rounded-2xl space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: item.color || '#38bdf8' }}
                          />
                          <span className="text-xs font-bold text-white truncate max-w-[160px]">
                            {item.subjectName}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            item.riskStatus === 'safe'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : item.riskStatus === 'warning'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {item.riskStatus === 'safe'
                            ? 'Safe'
                            : item.riskStatus === 'warning'
                            ? 'Warning'
                            : 'Critical'}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-400">Projected Attendance:</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-mono font-bold text-white">
                            {item.projectedPercentage}%
                          </span>
                          <span
                            className={`text-[11px] font-mono ${
                              item.percentageDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            ({item.percentageDelta >= 0 ? '+' : ''}
                            {item.percentageDelta}%)
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 flex justify-between">
                        <span>
                          Conducted: {item.projectedConducted} | Present: {item.projectedPresent}
                        </span>
                        <span>
                          {item.isTargetMet
                            ? `Can miss: ${item.canMissMoreClasses}`
                            : `Need: ${item.neededToAttend}`}
                        </span>
                      </div>

                      {/* Tactile Miss / Attend Buttons */}
                      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                        <button
                          onClick={() => handleUpdateSubjectAttendanceMod(item.subjectId, 'miss_plus')}
                          className="flex-1 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" /> Bunk Class (+1)
                        </button>
                        <button
                          onClick={() => handleUpdateSubjectAttendanceMod(item.subjectId, 'attend_plus')}
                          className="flex-1 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Attend Class (+1)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. SUB-TAB 3: MARKS & EXAM SCORE SOLVER */}
      {subTab === 'marks' && (
        <div className="space-y-6">
          {/* Target Grade Solver Card */}
          <div className="p-5 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-purple-400" />
                  Upcoming Exam Score Solver & Target Grade Calculator
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select a course and desired grade to solve the exact minimum marks required on your
                  upcoming End Semester Exam.
                </p>
              </div>

              {/* Subject Selector Dropdown */}
              {subjects.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 shrink-0">Subject:</span>
                  <select
                    value={selectedSubjectId}
                    onChange={e => setSelectedSubjectId(e.target.value)}
                    className="bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.credits} cr)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {selectedSubject && (
              <div className="space-y-4">
                {/* Desired Grade Selector */}
                <div>
                  <span className="text-xs font-semibold text-slate-300 block mb-2">
                    Select Target Desired Grade:
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeGradeBands.map(band => (
                      <button
                        key={band.id}
                        onClick={() => setTargetGradeBandId(band.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          selectedTargetBand.id === band.id
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                            : 'bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>Grade {band.grade}</span>
                        <span className="text-[10px] opacity-75 font-mono">
                          ({band.minPercentage}% | {band.gradePoint} pts)
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Solver Result Box */}
                {requiredExamScoreResult && (
                  <div
                    className={`p-4 rounded-2xl border ${
                      requiredExamScoreResult.isAlreadySecured
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : requiredExamScoreResult.isAchievable
                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-bold text-sm">
                          {requiredExamScoreResult.isAlreadySecured ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : requiredExamScoreResult.isAchievable ? (
                            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                          <span>
                            Target Grade {requiredExamScoreResult.targetGrade} (
                            {requiredExamScoreResult.targetGradePoint} Grade Points)
                          </span>
                        </div>
                        <p className="text-xs opacity-90 leading-relaxed">
                          {requiredExamScoreResult.explanation}
                        </p>
                      </div>

                      {requiredExamScoreResult.isAchievable && !requiredExamScoreResult.isAlreadySecured && (
                        <div className="text-right shrink-0">
                          <span className="text-3xl font-mono font-black text-white">
                            {requiredExamScoreResult.requiredRawScore}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {' '}/ {requiredExamScoreResult.rawMax}
                          </span>
                          <span className="text-[11px] block opacity-80 text-purple-300">
                            Min {requiredExamScoreResult.requiredPercentageOnExam}% in final exam
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Interactive Component Sliders for all Subjects */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              Simulate Component Marks & Lost Marks by Course
            </h4>

            <div className="grid grid-cols-1 gap-4">
              {sgpaPrediction.subjectPredictions.map(subPred => {
                const subject = subjects.find(s => s.id === subPred.subjectId);
                if (!subject) return null;

                return (
                  <div
                    key={subPred.subjectId}
                    className="p-5 bg-[#0b101f] border border-white/10 rounded-2xl space-y-4 shadow-lg"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: subPred.color || '#38bdf8' }}
                        />
                        <div>
                          <h5 className="text-sm font-bold text-white">{subPred.subjectName}</h5>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {subPred.credits} Credits • Base Grade: {subPred.baselineGrade} (
                            {subPred.baselineGradePoint} pts)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">Projected Grade:</span>
                          <span className="text-base font-bold font-mono text-sky-400">
                            {subPred.simulatedGrade} ({subPred.simulatedGradePoint} pts)
                          </span>
                        </div>
                        <span
                          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${
                            subPred.gradePointDelta >= 0
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                          }`}
                        >
                          {subPred.gradePointDelta >= 0 ? '+' : ''}
                          {subPred.gradePointDelta.toFixed(2)} pts
                        </span>
                      </div>
                    </div>

                    {/* Component sliders */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {subPred.componentPredictions.map(compPred => {
                        return (
                          <div
                            key={compPred.componentId}
                            className="p-3.5 bg-black/40 border border-white/5 rounded-xl space-y-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-300 truncate max-w-[150px]">
                                {compPred.componentName}
                              </span>
                              <span className="font-mono font-bold text-white">
                                {compPred.simulatedObtained} / {compPred.rawMax}
                                {compPred.isScaled && compPred.scaledMax && (
                                  <span className="text-[10px] text-slate-400 ml-1">
                                    ({compPred.simulatedContribution.toFixed(1)} / {compPred.scaledMax})
                                  </span>
                                )}
                              </span>
                            </div>

                            <input
                              type="range"
                              min="0"
                              max={compPred.rawMax}
                              value={compPred.simulatedObtained}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setComponentMods(prev => ({
                                  ...prev,
                                  [compPred.componentId]: { simulatedObtained: val },
                                }));
                              }}
                              className="w-full accent-sky-400 cursor-pointer"
                            />

                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span>0</span>
                              <span className="text-slate-400">
                                Base: {compPred.baselineObtained} / {compPred.rawMax}
                              </span>
                              <span>{compPred.rawMax}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 6. SUB-TAB 4: SGPA & CGPA TRAJECTORY */}
      {subTab === 'gpa' && (
        <div className="space-y-6">
          {/* Target SGPA Goal Solver */}
          <div className="p-5 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-purple-400" />
                  Semester SGPA Goal & High-Credit Leverage Analysis
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Understand which courses carry maximum credit weight and how to allocate effort
                  optimally.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Target SGPA:</span>
                <input
                  type="number"
                  min="0"
                  max={scaleMax}
                  step="0.1"
                  value={targetSgpaGoal}
                  onChange={e => setTargetSgpaGoal(Number(e.target.value))}
                  className="w-20 bg-black/60 border border-white/10 rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-purple-300 text-center focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* High-Credit Subject Leverage Table */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-300 block">
                Subject Credit Leverage Hierarchy (Highest impact on SGPA):
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...subjects]
                  .sort((a, b) => (b.credits || 0) - (a.credits || 0))
                  .map(s => {
                    const weightPct =
                      currentSemesterCredits > 0
                        ? (((s.credits || 0) / currentSemesterCredits) * 100).toFixed(0)
                        : '0';
                    return (
                      <div
                        key={s.id}
                        className="p-3.5 bg-black/40 border border-white/5 rounded-xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white truncate max-w-[140px]">
                            {s.name}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            {s.credits} Credits ({weightPct}% of Sem)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Improving this course by 1 grade point yields{' '}
                          <strong className="text-white font-mono">
                            +
                            {currentSemesterCredits > 0
                              ? ((s.credits / currentSemesterCredits) * 1).toFixed(2)
                              : '0.00'}{' '}
                            SGPA
                          </strong>
                          .
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Multi-Semester CGPA Trajectory & Graduation Planner */}
          <div className="p-5 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-amber-400" />
                  Multi-Semester CGPA Trajectory & Graduation Forecast
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Plan future semesters to forecast your cumulative graduating CGPA milestone.
                </p>
              </div>

              {/* Graduation Target CGPA Input */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Target Graduation CGPA:</span>
                <input
                  type="number"
                  min="0"
                  max={scaleMax}
                  step="0.05"
                  value={targetGradCgpaGoal}
                  onChange={e => setTargetGradCgpaGoal(Number(e.target.value))}
                  className="w-20 bg-black/60 border border-white/10 rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-amber-300 text-center focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Graduation Solver Feedback Banner */}
            <div
              className={`p-4 rounded-2xl border ${
                graduationCgpaSolution.isAchievable
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm mb-1">
                <Target className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Target Graduating CGPA: {targetGradCgpaGoal.toFixed(2)}</span>
              </div>
              <p className="text-xs opacity-90 leading-relaxed">
                {graduationCgpaSolution.explanation}
              </p>
            </div>

            {/* Future Semesters Plan Manager */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Planned Future Semesters:
                </span>
                <button
                  onClick={() => {
                    const nextNum = futureSemesters.length + 1;
                    setFutureSemesters([
                      ...futureSemesters,
                      {
                        id: `fut-${Date.now()}`,
                        semesterName: `Upcoming Sem ${nextNum}`,
                        credits: 20,
                        targetSgpa: scaleMax === 10 ? 9.0 : 3.7,
                      },
                    ]);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Future Semester
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {futureSemesters.map((fSem, idx) => (
                  <div
                    key={fSem.id}
                    className="p-3.5 bg-black/40 border border-white/5 rounded-xl space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{fSem.semesterName}</span>
                      <button
                        onClick={() => setFutureSemesters(futureSemesters.filter(f => f.id !== fSem.id))}
                        className="text-slate-500 hover:text-rose-400 text-xs cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Credits:</span>
                        <input
                          type="number"
                          min="1"
                          max="35"
                          value={fSem.credits}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setFutureSemesters(
                              futureSemesters.map(item =>
                                item.id === fSem.id ? { ...item, credits: val } : item
                              )
                            );
                          }}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Target SGPA:</span>
                        <input
                          type="number"
                          min="0"
                          max={scaleMax}
                          step="0.1"
                          value={fSem.targetSgpa}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setFutureSemesters(
                              futureSemesters.map(item =>
                                item.id === fSem.id ? { ...item, targetSgpa: val } : item
                              )
                            );
                          }}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. MATHEMATICAL TRANSPARENCY EXPANDABLE FOOTER */}
      <div className="p-4 bg-[#0b101f]/60 border border-white/5 rounded-2xl">
        <button
          onClick={() => setShowFormulaExplanation(!showFormulaExplanation)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-sky-400" />
            Prediction Mathematics & Formula Transparency
          </span>
          {showFormulaExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <AnimatePresence>
          {showFormulaExplanation && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 pt-3 border-t border-white/5 text-xs text-slate-400 space-y-2 leading-relaxed"
            >
              <p>
                <strong>Attendance Simulation:</strong> Projected percentage is calculated as{' '}
                <code className="text-white font-mono bg-white/5 px-1 py-0.5 rounded">
                  (Present + Attended) / (Conducted + Missed + Attended) × 100
                </code>
                . Holiday preservation models the cancellation of scheduled lectures, preventing
                attendance dilution.
              </p>
              <p>
                <strong>Required Exam Score Solver:</strong> For an upcoming exam component with raw
                maximum <code className="text-white font-mono">R_max</code> scaled to{' '}
                <code className="text-white font-mono">S_max</code>, the required raw score to reach
                grade threshold <code className="text-white font-mono">T%</code> is{' '}
                <code className="text-white font-mono bg-white/5 px-1 py-0.5 rounded">
                  ⌈(T% × Total_Max - Current_Scored) / S_max × R_max⌉
                </code>
                .
              </p>
              <p>
                <strong>Credit-Weighted SGPAs & CGPA:</strong> SGPA is computed as{' '}
                <code className="text-white font-mono bg-white/5 px-1 py-0.5 rounded">
                  Σ(Credits × Grade Points) / Σ(Credits)
                </code>
                . CGPA aggregates past semesters, the current simulated semester, and future milestone
                semesters using precise credit weighting.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
