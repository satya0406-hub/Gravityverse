import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Plus, Trash2, RotateCcw, X, Check, AlertCircle, ShieldCheck } from 'lucide-react';
import { GradeBand, GradingScalePreset, getDefaultGradingScales } from '../../lib/gpaCalculatorEngine';

interface GradingScaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentScaleId: string;
  customBands: GradeBand[];
  scaleMax: 10 | 4;
  onSelectPreset: (preset: GradingScalePreset) => void;
  onSaveCustomBands: (bands: GradeBand[], scaleMax: 10 | 4) => void;
}

export function GradingScaleModal({
  isOpen,
  onClose,
  currentScaleId,
  customBands,
  scaleMax,
  onSelectPreset,
  onSaveCustomBands,
}: GradingScaleModalProps) {
  const presets = getDefaultGradingScales();
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
  const [editingBands, setEditingBands] = useState<GradeBand[]>(customBands);
  const [editingScaleMax, setEditingScaleMax] = useState<10 | 4>(scaleMax);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync on open
  React.useEffect(() => {
    setEditingBands(customBands);
    setEditingScaleMax(scaleMax);
    setValidationError(null);
  }, [customBands, scaleMax, isOpen]);

  const handleAddBand = () => {
    const newBand: GradeBand = {
      id: 'band-' + Date.now(),
      minPercentage: 0,
      maxPercentage: 40,
      grade: 'New',
      gradePoint: 0,
      description: 'Custom Band',
    };
    setEditingBands([...editingBands, newBand]);
  };

  const handleUpdateBand = (id: string, field: keyof GradeBand, value: any) => {
    setEditingBands(prev =>
      prev.map(b => (b.id === id ? { ...b, [field]: value } : b))
    );
  };

  const handleRemoveBand = (id: string) => {
    if (editingBands.length <= 1) {
      setValidationError('You must have at least one grade band.');
      return;
    }
    setEditingBands(prev => prev.filter(b => b.id !== id));
  };

  const handleResetToPreset = (presetId: string) => {
    const target = presets.find(p => p.id === presetId) || presets[0];
    setEditingBands(target.bands);
    setEditingScaleMax(target.scaleMax);
    setValidationError(null);
  };

  const handleSaveCustom = () => {
    // Validate bands
    for (const b of editingBands) {
      if (b.minPercentage < 0 || b.maxPercentage > 100) {
        setValidationError(`Percentage values must be between 0 and 100 (Band ${b.grade}).`);
        return;
      }
      if (b.minPercentage > b.maxPercentage) {
        setValidationError(`Min % (${b.minPercentage}) cannot be greater than Max % (${b.maxPercentage}) for Grade ${b.grade}.`);
        return;
      }
      if (b.gradePoint < 0 || b.gradePoint > editingScaleMax) {
        setValidationError(`Grade point for ${b.grade} must be between 0 and ${editingScaleMax}.`);
        return;
      }
      if (!b.grade.trim()) {
        setValidationError('All grade names must be filled out.');
        return;
      }
    }

    setValidationError(null);
    onSaveCustomBands(editingBands, editingScaleMax);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[#0b101f] border border-white/15 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[90vh] my-auto"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-brand-blue/10 border border-brand-blue/20 rounded-xl text-brand-blue">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-serif font-bold text-white">Grading System & Conversion Scale</h3>
              <p className="text-xs text-slate-400">Configure university standards or create custom marking thresholds</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-4 border-b border-white/5 flex gap-2">
          <button
            onClick={() => setActiveTab('presets')}
            className={`pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'presets'
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Standard University Presets
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'custom'
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Custom Grading Bands
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'presets' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Select a standard grading scale. You can also customize individual thresholds anytime in the Custom tab.
              </p>

              {presets.map(preset => {
                const isSelected = currentScaleId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-brand-blue/10 border-brand-blue/40 ring-1 ring-brand-blue/30'
                        : 'bg-white/[0.02] border-white/5 hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{preset.name}</h4>
                          {isSelected && (
                            <span className="px-2 py-0.5 bg-brand-blue/20 text-brand-blue text-[10px] font-black uppercase rounded">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          Maximum GPA: {preset.scaleMax}.0 Scale ({preset.bands.length} Grade Bands)
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          onSelectPreset(preset);
                          onClose();
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Apply Preset'}
                      </button>
                    </div>

                    {/* Preview of bands */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/5">
                      {preset.bands.map(b => (
                        <div key={b.id} className="p-2 bg-black/40 rounded-lg text-center border border-white/5">
                          <span className="block text-xs font-mono font-bold text-brand-blue">{b.grade} ({b.gradePoint} pts)</span>
                          <span className="text-[10px] text-slate-400">{b.minPercentage}% - {Math.floor(b.maxPercentage)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Grading Scale System
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingScaleMax(10)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        editingScaleMax === 10
                          ? 'bg-brand-blue text-white'
                          : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      10.0 Scale
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingScaleMax(4)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        editingScaleMax === 4
                          ? 'bg-brand-blue text-white'
                          : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      4.0 Scale
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleResetToPreset('srm_ugc_10')}
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset UGC 10
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetToPreset('standard_4')}
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset US 4.0
                  </button>
                </div>
              </div>

              {validationError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500 px-2">
                  <span className="col-span-3">Grade Name</span>
                  <span className="col-span-3">Grade Points</span>
                  <span className="col-span-2">Min %</span>
                  <span className="col-span-2">Max %</span>
                  <span className="col-span-2 text-right">Action</span>
                </div>

                {editingBands.map(band => (
                  <div
                    key={band.id}
                    className="grid grid-cols-12 gap-2 items-center p-2.5 bg-black/40 border border-white/5 rounded-xl hover:border-white/15 transition-colors"
                  >
                    <div className="col-span-3">
                      <input
                        type="text"
                        value={band.grade}
                        onChange={e => handleUpdateBand(band.id, 'grade', e.target.value)}
                        placeholder="e.g. A+"
                        className="w-full h-8 px-2 bg-[#03060d] border border-white/10 rounded-lg text-xs text-white font-bold outline-none focus:border-brand-blue"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={editingScaleMax}
                        value={band.gradePoint}
                        onChange={e => handleUpdateBand(band.id, 'gradePoint', Number(e.target.value))}
                        className="w-full h-8 px-2 bg-[#03060d] border border-white/10 rounded-lg text-xs font-mono font-bold text-brand-blue outline-none focus:border-brand-blue"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={band.minPercentage}
                        onChange={e => handleUpdateBand(band.id, 'minPercentage', Number(e.target.value))}
                        className="w-full h-8 px-2 bg-[#03060d] border border-white/10 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-brand-blue"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={band.maxPercentage}
                        onChange={e => handleUpdateBand(band.id, 'maxPercentage', Number(e.target.value))}
                        className="w-full h-8 px-2 bg-[#03060d] border border-white/10 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-brand-blue"
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveBand(band.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete Band"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddBand}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-dashed border-white/15 rounded-xl text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Grade Band
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {activeTab === 'presets' ? 'Changes apply instantly to current subjects' : 'Custom scale saved locally in GravityVerse'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {activeTab === 'custom' && (
              <button
                onClick={handleSaveCustom}
                className="px-5 py-2 bg-brand-blue hover:bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-lg shadow-brand-blue/20 cursor-pointer"
              >
                <Check className="w-4 h-4" /> Save Custom Scale
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
    )}
  </AnimatePresence>
);
}
