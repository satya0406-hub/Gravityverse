import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Scale,
  Calculator,
  AlertCircle,
  Calendar,
  Clock,
  Edit2,
  Check,
} from 'lucide-react';
import {
  SubjectCourse,
  MarksComponent,
  GradeBand,
  calculateSubjectFromComponents,
} from '../../lib/gpaCalculatorEngine';

interface SubjectMarksCardProps {
  course: SubjectCourse;
  bands: GradeBand[];
  scaleMax: 10 | 4;
  index: number;
  onUpdateCourse: (updated: SubjectCourse) => void;
  onDeleteCourse: (id: string) => void;
  onOpenSchedule?: (course: SubjectCourse) => void;
}

export function SubjectMarksCard({
  course,
  bands,
  scaleMax,
  index,
  onUpdateCourse,
  onDeleteCourse,
  onOpenSchedule,
}: SubjectMarksCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  // Compute live subject stats
  const result = calculateSubjectFromComponents(course, bands);

  // Handlers for subject level fields
  const handleNameChange = (name: string) => {
    onUpdateCourse({ ...course, name });
  };

  const handleCodeChange = (code: string) => {
    onUpdateCourse({ ...course, code: code.toUpperCase() });
  };

  const handleCreditsChange = (credits: number) => {
    onUpdateCourse({ ...course, credits: Math.max(1, Math.min(30, credits || 1)) });
  };

  const handleModeChange = (mode: 'components' | 'direct_grade') => {
    onUpdateCourse({
      ...course,
      evaluationMode: mode,
      components:
        mode === 'components' && course.components.length === 0
          ? [{ id: 'comp-' + Date.now(), name: 'Internal Assessment', obtainedMarks: 40, maximumMarks: 50, isScaled: false }]
          : course.components,
    });
  };

  const handleAddComponent = () => {
    const newComp: MarksComponent = {
      id: 'comp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      name: '',
      obtainedMarks: 0,
      maximumMarks: 100,
      isScaled: false,
      scaledMaximum: 50,
    };
    onUpdateCourse({
      ...course,
      components: [...course.components, newComp],
    });
  };

  const handleUpdateComponent = (compId: string, updates: Partial<MarksComponent>) => {
    onUpdateCourse({
      ...course,
      components: course.components.map(c => (c.id === compId ? { ...c, ...updates } : c)),
    });
  };

  const handleRemoveComponent = (compId: string) => {
    onUpdateCourse({
      ...course,
      components: course.components.filter(c => c.id !== compId),
    });
  };

  const scheduledSlots = course.timetable || [];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg transition-all hover:border-slate-700/80 overflow-hidden">
      {/* Compact Primary Card View */}
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left: Index, Subject Name, Code, Credits */}
          <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-mono font-bold shrink-0 border"
              style={{
                backgroundColor: `${course.color || '#38bdf8'}15`,
                borderColor: `${course.color || '#38bdf8'}40`,
                color: course.color || '#38bdf8',
              }}
            >
              {index + 1}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white truncate">
                  {course.name || 'Untitled Subject'}
                </h3>
                {course.code && (
                  <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                    {course.code}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                <span>{course.credits} Credits</span>
                <span>·</span>
                <span className="capitalize">
                  {course.evaluationMode === 'direct_grade' ? 'Direct Grade' : `${course.components.length} Marks Components`}
                </span>
                {scheduledSlots.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-sky-400">{scheduledSlots.length} Classes/week</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Grade Pill, Grade Point & Action Buttons */}
          <div className="flex items-center gap-4 shrink-0">
            {/* Calculated Grade & Points */}
            <div className="text-right">
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="text-xs text-slate-400">Grade:</span>
                <span className="text-lg font-extrabold text-white">
                  {result.grade || '—'}
                </span>
                <span className="text-xs font-mono text-emerald-400 font-bold">
                  ({result.gradePoint.toFixed(1)})
                </span>
              </div>
              <div className="text-xs text-slate-400">
                {course.evaluationMode === 'direct_grade' ? (
                  <span>Direct Grade</span>
                ) : (
                  <span>Score: {result.percentage.toFixed(1)}%</span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  isExpanded
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <span>{isExpanded ? 'Hide Marks' : 'View Marks'}</span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {onOpenSchedule && (
                <button
                  type="button"
                  onClick={() => onOpenSchedule(course)}
                  className="p-2 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  title="Manage Class Schedule"
                >
                  <Calendar className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onDeleteCourse(course.id)}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                title="Delete Subject"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Scheduled Slots Quick Summary Strip */}
        {scheduledSlots.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="font-medium text-slate-300">Schedule:</span>
            {scheduledSlots.map((s, idx) => (
              <span key={idx} className="font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                {s.day.substring(0, 3)} {s.startTime}{s.room ? ` (${s.room})` : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expandable Details & Component Marks Editor */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-slate-800 bg-slate-950/60 p-5 sm:p-6 space-y-5"
          >
            {/* Subject Edit Fields: Name, Code, Credits & Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-4 border-b border-slate-800">
              <div className="sm:col-span-6">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  value={course.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Subject / Course Name"
                  className="w-full h-9 px-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Course Code
                </label>
                <input
                  type="text"
                  value={course.code || ''}
                  onChange={e => handleCodeChange(e.target.value)}
                  placeholder="e.g. 21CSC302J"
                  className="w-full h-9 px-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono font-semibold focus:outline-none focus:border-sky-500 uppercase"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Credits
                </label>
                <select
                  value={course.credits}
                  onChange={e => handleCreditsChange(Number(e.target.value))}
                  className="w-full h-9 px-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono font-semibold focus:outline-none focus:border-sky-500"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map(cr => (
                    <option key={cr} value={cr}>
                      {cr} {cr === 1 ? 'Credit' : 'Credits'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mode Selector */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">Evaluation Mode:</span>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleModeChange('components')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      course.evaluationMode === 'components'
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Components Scaling
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('direct_grade')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      course.evaluationMode === 'direct_grade'
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Direct Grade
                  </button>
                </div>
              </div>

              {course.evaluationMode === 'components' && (
                <button
                  type="button"
                  onClick={handleAddComponent}
                  className="px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Component
                </button>
              )}
            </div>

            {/* Body: Direct Grade or Components */}
            {course.evaluationMode === 'direct_grade' ? (
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                <label className="block text-xs font-semibold text-slate-300">
                  Select Letter Grade
                </label>
                <div className="flex flex-wrap gap-2">
                  {bands.map(band => {
                    const isSelected = course.directGradePoint === band.gradePoint;
                    return (
                      <button
                        key={band.id}
                        type="button"
                        onClick={() =>
                          onUpdateCourse({
                            ...course,
                            directGradePoint: band.gradePoint,
                            directGradeName: band.grade,
                          })
                        }
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/20'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span className="text-sm font-extrabold block">{band.grade}</span>
                        <span className="text-[10px] font-mono opacity-80">{band.gradePoint} Points</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Components List */
              <div className="space-y-3">
                {course.components.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                    <p>No marks components added yet.</p>
                    <button
                      type="button"
                      onClick={handleAddComponent}
                      className="px-3 py-1.5 bg-sky-500 text-white rounded-lg font-semibold inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add First Component
                    </button>
                  </div>
                ) : (
                  course.components.map((comp, cIdx) => (
                    <div
                      key={comp.id}
                      className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        <div className="sm:col-span-5">
                          <input
                            type="text"
                            value={comp.name}
                            onChange={e => handleUpdateComponent(comp.id, { name: e.target.value })}
                            placeholder={`e.g. Test ${cIdx + 1}, Lab, Quiz`}
                            className="w-full h-8 px-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs font-medium focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div className="sm:col-span-3 flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={comp.maximumMarks || 100}
                            value={comp.obtainedMarks}
                            onChange={e => handleUpdateComponent(comp.id, { obtainedMarks: Number(e.target.value) })}
                            className="w-16 h-8 px-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-center focus:outline-none focus:border-sky-500"
                          />
                          <span className="text-slate-500">/</span>
                          <input
                            type="number"
                            min={1}
                            value={comp.maximumMarks}
                            onChange={e => handleUpdateComponent(comp.id, { maximumMarks: Number(e.target.value) })}
                            className="w-16 h-8 px-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-center focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div className="sm:col-span-4 flex items-center gap-2">
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                            <input
                              type="checkbox"
                              checked={comp.isScaled}
                              onChange={e => handleUpdateComponent(comp.id, { isScaled: e.target.checked })}
                              className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500"
                            />
                            <span className="text-[11px]">Scale to</span>
                          </label>
                          {comp.isScaled && (
                            <input
                              type="number"
                              min={1}
                              value={comp.scaledMaximum || 50}
                              onChange={e => handleUpdateComponent(comp.id, { scaledMaximum: Number(e.target.value) })}
                              className="w-14 h-8 px-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-center focus:outline-none focus:border-sky-500"
                            />
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveComponent(comp.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
                        title="Delete Component"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Formula Breakdown */}
            {course.evaluationMode === 'components' && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowFormula(!showFormula)}
                  className="text-xs text-slate-400 hover:text-sky-400 font-semibold inline-flex items-center gap-1"
                >
                  <Scale className="w-3.5 h-3.5" />
                  {showFormula ? 'Hide Formula Breakdown' : 'Show Formula Breakdown'}
                </button>

                {showFormula && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1 font-mono">
                    <p className="font-sans text-slate-400 text-[11px]">Component Contribution Formula:</p>
                    <p className="text-sky-300">{result.breakdownFormula}</p>
                    <p className="text-emerald-400 font-bold font-sans mt-1">
                      Final Total: {result.totalContributionObtained.toFixed(2)} / {result.totalContributionMax.toFixed(2)} ({result.percentage.toFixed(1)}%)
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
