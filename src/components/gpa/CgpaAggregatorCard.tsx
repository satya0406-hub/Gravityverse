import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GraduationCap, Plus, Trash2, RotateCcw, AlertCircle, Percent, Save, Loader2, Info, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { SemesterRecord, calculateOverallCgpa, getEquivalentPercentageString } from '../../lib/gpaCalculatorEngine';

interface CgpaAggregatorCardProps {
  semesters: SemesterRecord[];
  scaleMax: 10 | 4;
  onAddSemester: (sem: Omit<SemesterRecord, 'id'>) => void;
  onRemoveSemester: (id: string) => void;
  onClearSemesters: () => void;
  onSaveCgpa?: () => void;
  saving?: boolean;
}

export function CgpaAggregatorCard({
  semesters,
  scaleMax,
  onAddSemester,
  onRemoveSemester,
  onClearSemesters,
  onSaveCgpa,
  saving = false,
}: CgpaAggregatorCardProps) {
  const [semNameInput, setSemNameInput] = useState('');
  const [semSgpaInput, setSemSgpaInput] = useState<number>(scaleMax === 10 ? 8.5 : 3.5);
  const [semCreditsInput, setSemCreditsInput] = useState<number>(22);
  const [showFormula, setShowFormula] = useState(false);

  // Compute CGPA
  const cgpaResult = calculateOverallCgpa(semesters);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = semNameInput.trim() || `Semester ${semesters.length + 1}`;
    const sgpa = Number(semSgpaInput) || (scaleMax === 10 ? 8.0 : 3.0);
    const credits = Math.max(1, Number(semCreditsInput) || 20);

    onAddSemester({
      semesterName: name,
      sgpa,
      totalCredits: credits,
    });

    setSemNameInput('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
      {/* Semester Forms & List */}
      <div className="lg:col-span-2 space-y-5 sm:space-y-6 min-w-0">
        {/* Add Semester Form */}
        <div className="p-4 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl space-y-4 min-w-0">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-emerald-400" />
            Add Semester Term Record
          </h3>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-end">
            <div className="sm:col-span-5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Semester / Term Title
              </label>
              <input
                type="text"
                value={semNameInput}
                onChange={e => setSemNameInput(e.target.value)}
                placeholder={`e.g. Semester ${semesters.length + 1}`}
                className="w-full h-11 px-4 bg-[#03060d] border border-white/10 rounded-xl text-white outline-none focus:border-emerald-400 text-xs transition-colors"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Term SGPA
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={scaleMax}
                value={semSgpaInput}
                onChange={e => setSemSgpaInput(Number(e.target.value))}
                className="w-full h-11 px-3 bg-[#03060d] border border-white/10 rounded-xl text-white font-mono font-bold outline-none focus:border-emerald-400 text-xs transition-colors"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Credits
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={semCreditsInput}
                onChange={e => setSemCreditsInput(Number(e.target.value))}
                className="w-full h-11 px-3 bg-[#03060d] border border-white/10 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-emerald-400 transition-colors"
              />
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 font-black text-xs uppercase tracking-wider text-white rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-white" />
                Add Term
              </button>
            </div>
          </form>

          <p className="text-[11px] text-slate-500 pt-1">
            Standard full-time semester credit load is typically 18–26 credits.
          </p>
        </div>

        {/* Semesters Table */}
        <div className="p-4 sm:p-6 bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl space-y-4 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">
              Recorded Semesters ({semesters.length})
            </h3>
            {semesters.length > 0 && (
              <button
                type="button"
                onClick={onClearSemesters}
                className="flex items-center gap-1.5 text-[10px] text-red-400 hover:text-red-300 uppercase tracking-widest font-black transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Clear All Semesters
              </button>
            )}
          </div>

          {semesters.length === 0 ? (
            <div className="py-12 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.01]">
              <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-3" />
              <p className="text-sm text-slate-400 uppercase tracking-wider font-bold mb-1">No Semesters Added</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Add your completed academic semester SGPAs to compute your overall cumulative CGPA.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card List for Recorded Semesters */}
              <div className="block sm:hidden space-y-2.5">
                {semesters.map(sem => (
                  <div
                    key={sem.id}
                    className="p-3.5 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <h4 className="font-serif font-bold text-sm text-white truncate">
                        {sem.semesterName}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-mono font-bold text-[11px]">
                          SGPA {sem.sgpa.toFixed(2)}
                        </span>
                        <span className="font-mono text-slate-300">
                          {sem.totalCredits} Credits
                        </span>
                        <span className="text-slate-500 text-[10px]">
                          • {(sem.totalCredits * sem.sgpa).toFixed(1)} Pts
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveSemester(sem.id)}
                      className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/15 rounded-xl transition-all cursor-pointer shrink-0"
                      title="Remove Semester"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      <th className="pb-3 pl-2">Semester Term</th>
                      <th className="pb-3 text-center">Semester Credits</th>
                      <th className="pb-3 text-center">Term SGPA</th>
                      <th className="pb-3 text-center">Weighted Points</th>
                      <th className="pb-3 text-right pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {semesters.map(sem => (
                      <tr key={sem.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 pl-2 font-serif font-bold text-white uppercase tracking-wide">
                          {sem.semesterName}
                        </td>
                        <td className="py-4 text-center font-mono font-bold text-slate-300">
                          {sem.totalCredits} Cr
                        </td>
                        <td className="py-4 text-center">
                          <span className="inline-block px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold">
                            {sem.sgpa.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-4 text-center font-mono text-slate-400">
                          {(sem.totalCredits * sem.sgpa).toFixed(1)}
                        </td>
                        <td className="py-4 text-right pr-2">
                          <button
                            type="button"
                            onClick={() => onRemoveSemester(sem.id)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/15 rounded-lg transition-all cursor-pointer"
                            title="Remove Semester"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CGPA Dial & Breakdown Sidebar */}
      <div className="space-y-6">
        <div className="p-6 bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest text-slate-500">
            Cumulative Aggregator
          </div>

          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">
            Cumulative CGPA Score
          </h3>

          {/* SVG Gauge Dial */}
          <div className="relative w-44 h-44 mb-6 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                className="stroke-white/5"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                className="stroke-emerald-400 transition-all duration-500"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={263.8}
                strokeDashoffset={263.8 - (263.8 * Math.min(1, cgpaResult.cgpa / scaleMax))}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-3xl font-serif font-black text-white">
                {cgpaResult.cgpa.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                / {scaleMax.toFixed(1)} Scale
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full mb-4">
            <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
              <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                Total Credits
              </span>
              <span className="text-lg font-mono font-bold text-white">
                {cgpaResult.totalCredits}
              </span>
            </div>

            <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
              <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                Equiv. Percentage
              </span>
              <span className="text-lg font-mono font-bold text-emerald-400">
                {getEquivalentPercentageString(cgpaResult.cgpa, scaleMax)}
              </span>
            </div>
          </div>

          <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-left w-full">
            <div className="flex gap-2 items-start">
              <Percent className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                CGPA of <strong className="text-white">{cgpaResult.cgpa.toFixed(2)}</strong> sums credit-weighted SGPAs ({cgpaResult.totalWeightedPoints.toFixed(1)} pts) and divides by total cumulative credits ({cgpaResult.totalCredits}).
              </p>
            </div>
          </div>

          {/* Save Button for Authenticated Profiles */}
          {onSaveCgpa && (
            <button
              onClick={onSaveCgpa}
              disabled={saving || cgpaResult.totalCredits === 0}
              className="w-full mt-4 py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <Save className="w-4 h-4 text-white" />
                  <span>Save Cumulative CGPA</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Expandable Mathematical Formula */}
        <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-emerald-400" />
              CGPA Mathematical Weighting
            </h4>
            <button
              type="button"
              onClick={() => setShowFormula(!showFormula)}
              className="text-[10px] text-slate-400 hover:text-white font-bold flex items-center gap-0.5 cursor-pointer"
            >
              {showFormula ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed font-mono bg-black/40 p-2.5 rounded-lg border border-white/5">
            {cgpaResult.formulaSummary}
          </p>

          <AnimatePresence>
            {showFormula && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden text-[11px] text-slate-400 space-y-1.5 pt-2 border-t border-white/5"
              >
                <p>
                  🎓 <strong>Note:</strong> Standard CGPA does not simply take the raw average of semester SGPAs unless every semester contains the exact same number of credits. It weights each semester by its credit volume.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
