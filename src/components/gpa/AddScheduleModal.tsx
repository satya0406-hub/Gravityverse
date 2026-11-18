import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Plus,
  Trash2,
  X,
  Save,
  AlertCircle,
  BookOpen,
  Bell,
  Sparkles,
  Check,
  GraduationCap,
} from 'lucide-react';
import {
  SubjectCourse,
  TimetableSlot,
  DayOfWeek,
  TimetableSystem,
  DAY_ORDER_SCHEDULE_OPTIONS,
  WEEKDAY_SCHEDULE_OPTIONS,
  formatTimeString,
} from '../../lib/gpaCalculatorEngine';

export interface AddScheduleModalProps {
  isOpen: boolean;
  subjects?: SubjectCourse[];
  subject?: SubjectCourse | null;
  initialSubjectId?: string | null;
  existingSlots?: TimetableSlot[];
  timetableSystem?: TimetableSystem;
  onUpdateTimetableSystem?: (system: TimetableSystem) => void;
  onClose: () => void;
  onOpenAddSubjectModal?: () => void;
  onSaveSchedule: (subjectId: string, slots: TimetableSlot[], promptReminder: boolean) => void;
}

interface DraftSlot {
  id: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  room: string;
  instructor: string;
  reminderEnabled: boolean;
  reminderMinutes: number;
}

export function AddScheduleModal({
  isOpen,
  subjects = [],
  subject = null,
  initialSubjectId = null,
  existingSlots,
  timetableSystem = 'day_order',
  onUpdateTimetableSystem,
  onClose,
  onOpenAddSubjectModal,
  onSaveSchedule,
}: AddScheduleModalProps) {
  // Determine list of enrolled subjects
  const enrolledSubjects = subjects.length > 0
    ? subjects
    : (subject ? [subject] : []);

  // System mode: Day Order vs Weekday
  const [currentSystem, setCurrentSystem] = useState<TimetableSystem>(timetableSystem);

  // Selected subject from enrolled list
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(() => {
    if (initialSubjectId && enrolledSubjects.some(s => s.id === initialSubjectId)) {
      return initialSubjectId;
    }
    if (subject && enrolledSubjects.some(s => s.id === subject.id)) {
      return subject.id;
    }
    return enrolledSubjects[0]?.id || '';
  });

  // Sync currentSystem when prop changes
  useEffect(() => {
    if (timetableSystem) {
      setCurrentSystem(timetableSystem);
    }
  }, [timetableSystem]);

  // Sync selectedSubjectId and slots when modal opens or subject props change
  useEffect(() => {
    if (!isOpen) return;
    let targetSubjId = '';
    if (initialSubjectId && enrolledSubjects.some(s => s.id === initialSubjectId)) {
      targetSubjId = initialSubjectId;
    } else if (subject && enrolledSubjects.some(s => s.id === subject.id)) {
      targetSubjId = subject.id;
    } else if (enrolledSubjects.length > 0) {
      targetSubjId = enrolledSubjects[0].id;
    }

    if (targetSubjId) {
      setSelectedSubjectId(targetSubjId);
      const target = enrolledSubjects.find(s => s.id === targetSubjId);
      setSlots(buildInitialSlots(target));
    }
    setErrorMessage(null);
  }, [isOpen, initialSubjectId, subject, enrolledSubjects]);

  const selectedSubject = enrolledSubjects.find(s => s.id === selectedSubjectId) || enrolledSubjects[0];

  // Helper to construct draft slots for a subject
  const buildInitialSlots = (subj: SubjectCourse | undefined): DraftSlot[] => {
    const srcSlots = (subj?.id === subject?.id && existingSlots && existingSlots.length > 0)
      ? existingSlots
      : (subj?.timetable || []);

    if (srcSlots.length > 0) {
      return srcSlots.map(s => ({
        id: s.id,
        day: s.day,
        startTime: s.startTime || '10:00 AM',
        endTime: s.endTime || '11:00 AM',
        room: s.room || '',
        instructor: s.instructor || '',
        reminderEnabled: s.reminderEnabled ?? false,
        reminderMinutes: s.reminderMinutes || 20,
      }));
    }

    return [
      {
        id: 'slot-' + Date.now(),
        day: 'Monday',
        startTime: '10:00 AM',
        endTime: '11:00 AM',
        room: '',
        instructor: '',
        reminderEnabled: false,
        reminderMinutes: 20,
      },
    ];
  };

  const [slots, setSlots] = useState<DraftSlot[]>(() => buildInitialSlots(selectedSubject));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // When selectedSubjectId changes, reload that subject's slots
  const handleSelectSubject = (newSubjectId: string) => {
    setSelectedSubjectId(newSubjectId);
    const target = enrolledSubjects.find(s => s.id === newSubjectId);
    setSlots(buildInitialSlots(target));
    setErrorMessage(null);
  };

  // Switch timetable system in modal
  const handleSystemChange = (sys: TimetableSystem) => {
    setCurrentSystem(sys);
    onUpdateTimetableSystem?.(sys);
  };

  const handleAddSlot = () => {
    const lastSlot = slots[slots.length - 1];
    let nextDay: DayOfWeek = 'Wednesday';
    if (lastSlot) {
      if (lastSlot.day === 'Monday') nextDay = 'Wednesday';
      else if (lastSlot.day === 'Wednesday') nextDay = 'Friday';
      else if (lastSlot.day === 'Tuesday') nextDay = 'Thursday';
      else if (lastSlot.day === 'Friday') nextDay = 'Monday';
      else nextDay = 'Monday';
    }

    const newSlot: DraftSlot = {
      id: 'slot-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      day: nextDay,
      startTime: lastSlot ? lastSlot.startTime : '10:00 AM',
      endTime: lastSlot ? lastSlot.endTime : '11:00 AM',
      room: lastSlot ? lastSlot.room : '',
      instructor: lastSlot ? lastSlot.instructor : '',
      reminderEnabled: false,
      reminderMinutes: 20,
    };

    setSlots(prev => [...prev, newSlot]);
    setErrorMessage(null);
  };

  const handleUpdateSlot = (slotId: string, updates: Partial<DraftSlot>) => {
    setSlots(prev =>
      prev.map(s => (s.id === slotId ? { ...s, ...updates } : s))
    );
    setErrorMessage(null);
  };

  const handleRemoveSlot = (slotId: string) => {
    if (slots.length <= 1) {
      setErrorMessage('A course timetable must have at least one scheduled class session, or you can clear it.');
      return;
    }
    setSlots(prev => prev.filter(s => s.id !== slotId));
    setErrorMessage(null);
  };

  const handleSave = () => {
    if (!selectedSubject) {
      setErrorMessage('Please select an enrolled subject from the list.');
      return;
    }

    // Validate each slot
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.startTime || !s.endTime) {
        setErrorMessage(`Class period #${i + 1} has missing start or end time.`);
        return;
      }
    }

    const finalizedSlots: TimetableSlot[] = slots.map(s => {
      const dayOrderNum = s.day === 'Monday' ? 1
        : s.day === 'Tuesday' ? 2
        : s.day === 'Wednesday' ? 3
        : s.day === 'Thursday' ? 4
        : s.day === 'Friday' ? 5
        : s.day === 'Saturday' ? 6
        : undefined;

      return {
        id: s.id,
        subjectId: selectedSubject.id,
        day: s.day,
        dayOrder: currentSystem === 'day_order' ? dayOrderNum : undefined,
        startTime: formatTimeString(s.startTime),
        endTime: formatTimeString(s.endTime),
        room: s.room.trim() || undefined,
        instructor: s.instructor.trim() || undefined,
        reminderEnabled: s.reminderEnabled,
        reminderMinutes: s.reminderMinutes,
      };
    });

    onSaveSchedule(selectedSubject.id, finalizedSlots, true);
  };

  const commonTimeSuggestions = [
    '08:00 AM', '08:50 AM', '09:00 AM', '09:40 AM',
    '10:00 AM', '10:45 AM', '11:00 AM', '11:35 AM',
    '12:00 PM', '12:40 PM', '01:00 PM', '01:25 PM',
    '02:00 PM', '02:35 PM', '03:00 PM', '03:25 PM',
    '04:00 PM', '04:15 PM', '05:00 PM', '06:00 PM',
  ];

  // Options depending on current selected system
  const scheduleDayOptions = currentSystem === 'day_order'
    ? DAY_ORDER_SCHEDULE_OPTIONS
    : WEEKDAY_SCHEDULE_OPTIONS;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="w-full max-w-2xl bg-[#0b101f] border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-6 text-white my-auto max-h-[94vh] sm:max-h-[92vh] flex flex-col"
          >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center text-brand-blue shrink-0 shadow-lg shadow-brand-blue/10">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wide flex items-center gap-2">
                  <span>Add Regular Schedule</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-blue/15 text-brand-blue border border-brand-blue/30 font-mono font-bold">
                    {currentSystem === 'day_order' ? 'Day Order' : 'Weekday'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Configure recurring weekly class periods linked to your enrolled curriculum subjects
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* EMPTY ENROLLED SUBJECTS STATE */}
          {enrolledSubjects.length === 0 ? (
            <div className="py-10 px-6 text-center space-y-4 bg-slate-950/60 border border-amber-500/20 rounded-2xl">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
                <BookOpen className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-base font-bold text-white">No Subjects Enrolled Yet</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  You haven't enrolled any subjects in your academic curriculum. Please add your subjects or courses first before configuring regular timetable class periods.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAddSubjectModal?.();
                  }}
                  className="px-5 py-2.5 bg-brand-blue hover:bg-brand-blue/90 border border-brand-blue text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-brand-blue/25 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Enrolled Subject First
                </button>
              </div>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 shrink-0">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Scrollable Configuration Body */}
              <div className="space-y-5 overflow-y-auto flex-1 pr-1">
                {/* 1. Subject Selection & Timetable System Mode Bar */}
                <div className="p-4 bg-black/40 border border-white/10 rounded-xl space-y-4">
                  {/* Required Subject Dropdown */}
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-brand-blue" />
                        <span>Enrolled Subject / Course <span className="text-rose-400">*</span></span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {enrolledSubjects.length} {enrolledSubjects.length === 1 ? 'Course' : 'Courses'} Enrolled
                      </span>
                    </label>

                    <select
                      value={selectedSubjectId}
                      onChange={e => handleSelectSubject(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#03060d] border border-white/10 rounded-xl text-white text-xs font-bold outline-none focus:border-brand-blue transition-colors cursor-pointer"
                    >
                      {enrolledSubjects.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.code ? `(${s.code})` : ''} • {s.credits} Credits • {s.evaluationMode === 'direct_grade' ? 'Direct Grade' : 'Components'}
                        </option>
                      ))}
                    </select>

                    {selectedSubject && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-2 flex-wrap">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: selectedSubject.color || '#3b82f6' }}
                        />
                        <span className="text-slate-300 font-medium">
                          Configuring schedule for <strong className="text-white">{selectedSubject.name}</strong>
                          {selectedSubject.code ? ` (${selectedSubject.code})` : ''}
                        </span>
                        {selectedSubject.timetable && selectedSubject.timetable.length > 0 && (
                          <span className="ml-auto text-emerald-400 font-mono text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {selectedSubject.timetable.length} existing {selectedSubject.timetable.length === 1 ? 'period' : 'periods'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Timetable System Selector */}
                  <div className="pt-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Timetable System
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {currentSystem === 'day_order'
                          ? 'Cyclical Day Orders (DO1, DO2, DO3, DO4, DO5, DO6)'
                          : 'Weekly Schedule (Monday through Sunday)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 p-1 bg-black/60 border border-white/10 rounded-xl shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSystemChange('day_order')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentSystem === 'day_order'
                            ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/30'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        DO1, DO2... (Day Order)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSystemChange('weekday')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentSystem === 'weekday'
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Mon–Sun (Weekday)
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Class Periods List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-brand-blue" />
                      Class Periods ({slots.length})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {currentSystem === 'day_order'
                        ? 'Select DO1, DO2, DO3, DO4... for each period'
                        : 'Select Monday–Sunday for each period'}
                    </span>
                  </div>

                  {slots.map((slot, idx) => (
                    <div
                      key={slot.id}
                      className="p-4 bg-black/40 border border-white/10 rounded-xl space-y-3 relative group transition-all hover:border-brand-blue/30"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center text-[10px] font-mono font-bold text-slate-300">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-200">
                            Class Session {idx + 1}
                          </span>
                        </div>

                        {slots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSlot(slot.id)}
                            className="text-xs text-rose-400 hover:text-rose-300 p-1 rounded-lg hover:bg-rose-500/10 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        )}
                      </div>

                      {/* Day and Times */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Day Order / Weekday Selector */}
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                            <span>{currentSystem === 'day_order' ? 'Day Order' : 'Day of Week'}</span>
                            <span className="text-[9px] text-brand-blue font-bold">
                              {currentSystem === 'day_order' ? 'DO Selector' : 'Mon–Sun'}
                            </span>
                          </label>
                          <select
                            value={slot.day}
                            onChange={e => handleUpdateSlot(slot.id, { day: e.target.value as DayOfWeek })}
                            className="w-full h-10 px-3 bg-[#03060d] border border-white/10 rounded-xl text-white text-xs font-bold outline-none focus:border-brand-blue transition-colors cursor-pointer"
                          >
                            {scheduleDayOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Start Time */}
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                            <span>Start Time</span>
                            <span className="text-[9px] text-brand-blue font-normal lowercase">minute-level</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              list={`start-time-suggestions-${slot.id}`}
                              value={slot.startTime}
                              placeholder="e.g. 10:00 AM"
                              onChange={e => handleUpdateSlot(slot.id, { startTime: e.target.value })}
                              onBlur={e => {
                                if (e.target.value.trim()) {
                                  handleUpdateSlot(slot.id, { startTime: formatTimeString(e.target.value) });
                                }
                              }}
                              className="w-full h-10 px-3 bg-[#03060d] border border-white/10 rounded-xl text-white text-xs font-mono font-bold outline-none focus:border-brand-blue transition-colors"
                            />
                            <datalist id={`start-time-suggestions-${slot.id}`}>
                              {commonTimeSuggestions.map(t => (
                                <option key={t} value={t} />
                              ))}
                            </datalist>
                          </div>
                        </div>

                        {/* End Time */}
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                            <span>End Time</span>
                            <span className="text-[9px] text-brand-blue font-normal lowercase">minute-level</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              list={`end-time-suggestions-${slot.id}`}
                              value={slot.endTime}
                              placeholder="e.g. 11:00 AM"
                              onChange={e => handleUpdateSlot(slot.id, { endTime: e.target.value })}
                              onBlur={e => {
                                if (e.target.value.trim()) {
                                  handleUpdateSlot(slot.id, { endTime: formatTimeString(e.target.value) });
                                }
                              }}
                              className="w-full h-10 px-3 bg-[#03060d] border border-white/10 rounded-xl text-white text-xs font-mono font-bold outline-none focus:border-brand-blue transition-colors"
                            />
                            <datalist id={`end-time-suggestions-${slot.id}`}>
                              {commonTimeSuggestions.map(t => (
                                <option key={t} value={t} />
                              ))}
                            </datalist>
                          </div>
                        </div>
                      </div>

                      {/* Optional Room, Instructor & Reminder */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                            Room / Location (Optional)
                          </label>
                          <div className="relative">
                            <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3.5" />
                            <input
                              type="text"
                              value={slot.room}
                              onChange={e => handleUpdateSlot(slot.id, { room: e.target.value })}
                              placeholder="e.g. Room 204 / TP-401"
                              className="w-full h-10 pl-8 pr-3 bg-[#03060d] border border-white/10 rounded-xl text-white text-xs font-medium outline-none focus:border-brand-blue transition-colors"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                            Instructor (Optional)
                          </label>
                          <div className="relative">
                            <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3.5" />
                            <input
                              type="text"
                              value={slot.instructor}
                              onChange={e => handleUpdateSlot(slot.id, { instructor: e.target.value })}
                              placeholder="e.g. Dr. Ramanathan"
                              className="w-full h-10 pl-8 pr-3 bg-[#03060d] border border-white/10 rounded-xl text-white text-xs font-medium outline-none focus:border-brand-blue transition-colors"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Notification Reminder Toggle */}
                      <div className="flex items-center justify-between p-2.5 bg-black/50 border border-white/5 rounded-xl text-xs">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={slot.reminderEnabled}
                            onChange={e => handleUpdateSlot(slot.id, { reminderEnabled: e.target.checked })}
                            className="w-4 h-4 rounded text-brand-blue focus:ring-brand-blue border-white/20 bg-slate-900"
                          />
                          <span className="flex items-center gap-1.5 text-slate-300 text-xs font-medium">
                            <Bell className="w-3.5 h-3.5 text-brand-blue" />
                            Pre-class Reminder Alert
                          </span>
                        </label>

                        {slot.reminderEnabled && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-[11px] text-slate-400">Notify:</span>
                            <select
                              value={slot.reminderMinutes}
                              onChange={e => handleUpdateSlot(slot.id, { reminderMinutes: Number(e.target.value) })}
                              className="h-8 px-2 bg-slate-900 border border-white/15 rounded-lg text-white text-xs font-bold outline-none cursor-pointer"
                            >
                              <option value={5}>5 min before</option>
                              <option value={10}>10 min before</option>
                              <option value={15}>15 min before</option>
                              <option value={20}>20 min before</option>
                              <option value={30}>30 min before</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleAddSlot}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 hover:border-brand-blue/50 rounded-xl text-xs font-bold text-slate-300 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-brand-blue" />
                    + Add Another Class Period ({currentSystem === 'day_order' ? 'DO' : 'Day'})
                  </button>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-4 border-t border-white/10 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-brand-blue hover:bg-brand-blue/90 border border-brand-blue text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-brand-blue/20 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Save Schedule
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
