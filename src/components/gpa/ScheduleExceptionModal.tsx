import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  CalendarX2,
  ArrowRight,
  PartyPopper,
  Info,
  Tag,
  RotateCw,
  Ban,
  CalendarClock,
  Layers,
  ChevronRight,
  Check,
} from 'lucide-react';
import {
  SubjectCourse,
  ScheduleException,
  HolidayRecord,
  TimetableChangeType,
  DayOfWeek,
  DEFAULT_TEACHING_DAYS,
  DAYS_OF_WEEK,
  TimetableSystem,
  formatDateToISO,
  formatDisplayDate,
  formatMinutesToTime12Hour,
  formatMinutesToTime24Hour,
  timeStringTo24Hour,
  formatTimeString,
  parseTimeToMinutes,
  getCurrentDayOfWeek,
  parseISODate,
} from '../../lib/gpaCalculatorEngine';

export interface ScheduleExceptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: SubjectCourse[];
  initialDate?: string;
  initialSubjectId?: string;
  initialSlotId?: string;
  initialChangeType?: TimetableChangeType;
  editingException?: ScheduleException | null;
  editingHoliday?: HolidayRecord | null;
  teachingDays?: DayOfWeek[];
  timetableSystem?: TimetableSystem;
  onUpdateTeachingDays?: (days: DayOfWeek[]) => void;
  onSaveException: (exception: Omit<ScheduleException, 'id' | 'createdAt'>, exceptionId?: string) => void;
  onSaveHoliday: (holiday: Omit<HolidayRecord, 'id' | 'createdAt'>, holidayId?: string) => void;
  onDeleteException?: (id: string) => void;
  onDeleteHoliday?: (id: string) => void;
}

const COMMON_MINUTE_TIMES = [
  '08:00 AM',
  '08:50 AM',
  '09:00 AM',
  '09:40 AM',
  '10:00 AM',
  '10:45 AM',
  '11:00 AM',
  '11:35 AM',
  '12:00 PM',
  '12:40 PM',
  '01:00 PM',
  '01:25 PM',
  '02:00 PM',
  '02:35 PM',
  '03:00 PM',
  '03:25 PM',
  '04:00 PM',
  '04:15 PM',
  '05:00 PM',
];

export function ScheduleExceptionModal({
  isOpen,
  onClose,
  subjects,
  initialDate,
  initialSubjectId,
  initialSlotId,
  initialChangeType,
  editingException,
  editingHoliday,
  teachingDays = DEFAULT_TEACHING_DAYS,
  timetableSystem = 'day_order',
  onSaveException,
  onSaveHoliday,
}: ScheduleExceptionModalProps) {
  const todayStr = formatDateToISO(new Date());

  // 1. EXACT THREE CHANGE TYPES
  const [changeType, setChangeType] = useState<TimetableChangeType>('HOLIDAY');

  // Common date field
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayStr);

  // 1. HOLIDAY fields
  const [holidayName, setHolidayName] = useState<string>('University Holiday');
  const [holidayOriginalDayOrder, setHolidayOriginalDayOrder] = useState<number>(1);
  const [holidayReplacementDate, setHolidayReplacementDate] = useState<string>('');
  const [holidayDescription, setHolidayDescription] = useState<string>('');

  // 2. SUSPENDED fields
  const [suspendedReason, setSuspendedReason] = useState<string>('Heavy Rain Alert');
  const [suspendedDayOrder, setSuspendedDayOrder] = useState<number>(1);

  // 3. RESCHEDULED fields
  const [rescheduleMode, setRescheduleMode] = useState<'single' | 'multiple'>('single');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    initialSubjectId || (subjects.length > 0 ? subjects[0].id : '')
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string>(initialSlotId || '');
  const [originalStartTime, setOriginalStartTime] = useState<string>('12:40 PM');
  const [originalEndTime, setOriginalEndTime] = useState<string>('01:25 PM');
  const [newDate, setNewDate] = useState<string>(todayStr);
  const [newStartTime, setNewStartTime] = useState<string>('02:35 PM');
  const [newEndTime, setNewEndTime] = useState<string>('03:25 PM');
  const [newRoom, setNewRoom] = useState<string>('');
  const [newInstructor, setNewInstructor] = useState<string>('');
  const [rescheduleReason, setRescheduleReason] = useState<string>('Faculty Seminar');

  // Multi-class reschedule selection: Array of slot IDs on the original day
  const [selectedMultiSlotIds, setSelectedMultiSlotIds] = useState<string[]>([]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Compute nominal day order from date
  const computeDayOrderFromDate = (dateStr: string): number => {
    try {
      const d = parseISODate(dateStr);
      const dayName = getCurrentDayOfWeek(d);
      const idx = teachingDays.indexOf(dayName);
      return idx >= 0 ? idx + 1 : 1;
    } catch {
      return 1;
    }
  };

  // Find next working day after a given date
  const computeNextWorkingDay = (dateStr: string): string => {
    try {
      const d = parseISODate(dateStr);
      for (let i = 1; i <= 14; i++) {
        const nextD = new Date(d);
        nextD.setDate(d.getDate() + i);
        const dayName = getCurrentDayOfWeek(nextD);
        if (teachingDays.includes(dayName)) {
          return formatDateToISO(nextD);
        }
      }
    } catch {
      // fallback
    }
    return dateStr;
  };

  // Synchronize state when modal opens or edit item changes
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage(null);

    if (editingHoliday) {
      if (editingHoliday.changeType === 'SUSPENDED' || editingHoliday.strategy === 'cancel' || editingHoliday.noReplacement) {
        setChangeType('SUSPENDED');
        setSelectedDate(editingHoliday.date);
        setSuspendedDayOrder(editingHoliday.dayOrder || computeDayOrderFromDate(editingHoliday.date));
        setSuspendedReason(editingHoliday.reason || editingHoliday.name || 'Classes Suspended');
      } else {
        setChangeType('HOLIDAY');
        setSelectedDate(editingHoliday.date);
        const origOrder = editingHoliday.originalDayOrder || computeDayOrderFromDate(editingHoliday.date);
        setHolidayOriginalDayOrder(origOrder);
        setHolidayReplacementDate(editingHoliday.replacementDate || computeNextWorkingDay(editingHoliday.date));
        setHolidayName(editingHoliday.name || 'University Holiday');
        setHolidayDescription(editingHoliday.description || '');
      }
    } else if (editingException) {
      setChangeType('RESCHEDULED');
      setSelectedDate(editingException.originalDate || editingException.date || todayStr);
      setSelectedSubjectId(editingException.subjectId);
      setSelectedSlotId(editingException.originalSlotId || '');
      setOriginalStartTime(editingException.originalStartTime || '12:40 PM');
      setOriginalEndTime(editingException.originalEndTime || '01:25 PM');
      setNewDate(editingException.newDate || editingException.date || todayStr);
      setNewStartTime(editingException.newStartTime || '02:35 PM');
      setNewEndTime(editingException.newEndTime || '03:25 PM');
      setNewRoom(editingException.newRoom || '');
      setNewInstructor(editingException.newInstructor || '');
      setRescheduleReason(editingException.reason || 'Faculty Rescheduled');
      if (editingException.classes && editingException.classes.length > 0) {
        setRescheduleMode('multiple');
        setSelectedMultiSlotIds(editingException.classes.map(c => c.originalSlotId || '').filter(Boolean));
      } else {
        setRescheduleMode('single');
      }
    } else {
      // Fresh new creation
      const startD = initialDate || todayStr;
      setSelectedDate(startD);
      const computedOrder = computeDayOrderFromDate(startD);
      const nextWork = computeNextWorkingDay(startD);

      setHolidayOriginalDayOrder(computedOrder);
      setHolidayReplacementDate(nextWork);
      setSuspendedDayOrder(computedOrder);

      if (initialChangeType) {
        setChangeType(initialChangeType);
      } else if (initialSlotId || initialSubjectId) {
        setChangeType('RESCHEDULED');
      } else {
        setChangeType('HOLIDAY');
      }

      if (initialSubjectId) setSelectedSubjectId(initialSubjectId);
      else if (subjects.length > 0) setSelectedSubjectId(subjects[0].id);

      if (initialSlotId) setSelectedSlotId(initialSlotId);

      setNewDate(nextWork);
      setRescheduleMode('single');
      setSelectedMultiSlotIds([]);
    }
  }, [isOpen, editingException, editingHoliday, initialDate, initialSubjectId, initialSlotId, initialChangeType, subjects]);

  // When date changes in Holiday or Suspended tab, auto-suggest day order and replacement date
  const handleDateChange = (newDateStr: string) => {
    setSelectedDate(newDateStr);
    const computedOrder = computeDayOrderFromDate(newDateStr);
    const nextWork = computeNextWorkingDay(newDateStr);

    if (!editingHoliday && !editingException) {
      setHolidayOriginalDayOrder(computedOrder);
      setHolidayReplacementDate(nextWork);
      setSuspendedDayOrder(computedOrder);
      setNewDate(nextWork);
    }
  };

  const currentSubject = subjects.find(s => s.id === selectedSubjectId);
  const dayOfWeekForSelectedDate = getCurrentDayOfWeek(parseISODate(selectedDate));

  // Available slots for selected subject on the selected date
  const subjectSlotsOnDate = (currentSubject?.timetable || []).filter(
    s => s.day === dayOfWeekForSelectedDate
  );

  // All slots across all subjects on the selected date
  const allSlotsOnSelectedDate: {
    subject: SubjectCourse;
    slot: { id: string; startTime: string; endTime: string; room?: string; instructor?: string };
  }[] = [];

  for (const sub of subjects) {
    for (const slot of sub.timetable || []) {
      if (slot.day === dayOfWeekForSelectedDate) {
        allSlotsOnSelectedDate.push({ subject: sub, slot });
      }
    }
  }

  // Pre-fill slot timings when user selects a slot
  const handleSelectSlot = (slotId: string) => {
    setSelectedSlotId(slotId);
    const targetSlot = (currentSubject?.timetable || []).find(s => s.id === slotId);
    if (targetSlot) {
      setOriginalStartTime(targetSlot.startTime);
      setOriginalEndTime(targetSlot.endTime);
      // Auto-suggest new start/end times offset by 1-2 hours or minute times
      const startMin = parseTimeToMinutes(targetSlot.startTime);
      const endMin = parseTimeToMinutes(targetSlot.endTime);
      const duration = endMin > startMin ? endMin - startMin : 50;

      // Suggest 2:35 PM if slot is 12:40 PM, or forward by 2 hours
      const suggestedStartMin = (startMin + 120) % 1440;
      setNewStartTime(formatMinutesToTime12Hour(suggestedStartMin));
      setNewEndTime(formatMinutesToTime12Hour((suggestedStartMin + duration) % 1440));
      if (targetSlot.room) setNewRoom(targetSlot.room);
      if (targetSlot.instructor) setNewInstructor(targetSlot.instructor);
    }
  };

  // Toggle multi-slot selection
  const handleToggleMultiSlot = (slotId: string) => {
    setSelectedMultiSlotIds(prev =>
      prev.includes(slotId) ? prev.filter(id => id !== slotId) : [...prev, slotId]
    );
  };

  // Save handler for all 3 change types
  const handleSave = () => {
    setErrorMessage(null);

    // CASE 1: HOLIDAY
    if (changeType === 'HOLIDAY') {
      if (!selectedDate) {
        setErrorMessage('Please select a date for the holiday.');
        return;
      }
      if (!holidayName.trim()) {
        setErrorMessage('Please enter a holiday name (e.g. Gandhi Jayanti, College Holiday).');
        return;
      }
      if (!holidayOriginalDayOrder || holidayOriginalDayOrder < 1) {
        setErrorMessage('Please provide a valid original Day Order (e.g. 1 to 5).');
        return;
      }

      onSaveHoliday(
        {
          date: selectedDate,
          name: holidayName.trim(),
          description: holidayDescription.trim() || undefined,
          changeType: 'HOLIDAY',
          type: 'HOLIDAY',
          strategy: 'postpone',
          originalDayOrder: holidayOriginalDayOrder,
          replacementDayOrder: holidayOriginalDayOrder,
          replacementDate: holidayReplacementDate || computeNextWorkingDay(selectedDate),
        },
        editingHoliday?.id
      );

      onClose();
      return;
    }

    // CASE 2: SUSPENDED
    if (changeType === 'SUSPENDED') {
      if (!selectedDate) {
        setErrorMessage('Please select a date for the class suspension.');
        return;
      }
      if (!suspendedDayOrder || suspendedDayOrder < 1) {
        setErrorMessage('Please provide a valid Day Order for the suspended day.');
        return;
      }

      onSaveHoliday(
        {
          date: selectedDate,
          name: suspendedReason.trim() || 'Classes Suspended',
          reason: suspendedReason.trim() || 'Classes Suspended',
          description: 'Classes cancelled for this day. Day order is not carried forward.',
          changeType: 'SUSPENDED',
          type: 'SUSPENDED',
          strategy: 'cancel',
          dayOrder: suspendedDayOrder,
          noReplacement: true,
        },
        editingHoliday?.id
      );

      onClose();
      return;
    }

    // CASE 3: RESCHEDULED
    if (changeType === 'RESCHEDULED') {
      if (rescheduleMode === 'single') {
        if (!selectedSubjectId) {
          setErrorMessage('Please select a subject to reschedule.');
          return;
        }
        if (!newDate) {
          setErrorMessage('Please select a replacement date for the class.');
          return;
        }

        const startMin = parseTimeToMinutes(newStartTime);
        const endMin = parseTimeToMinutes(newEndTime);
        if (endMin <= startMin) {
          setErrorMessage('Replacement class end time must be later than start time.');
          return;
        }

        onSaveException(
          {
            subjectId: selectedSubjectId,
            type: 'rescheduled_date',
            changeType: 'RESCHEDULED',
            date: selectedDate,
            originalDate: selectedDate,
            originalSlotId: selectedSlotId || undefined,
            originalStartTime: formatTimeString(originalStartTime),
            originalEndTime: formatTimeString(originalEndTime),
            newDate: newDate,
            newStartTime: formatTimeString(newStartTime),
            newEndTime: formatTimeString(newEndTime),
            newRoom: newRoom.trim() || undefined,
            newInstructor: newInstructor.trim() || undefined,
            reason: rescheduleReason.trim() || undefined,
            reminderEnabled: true,
            reminderMinutes: 20,
          },
          editingException?.id
        );
      } else {
        // Multi-class mode
        if (selectedMultiSlotIds.length === 0) {
          setErrorMessage('Please select at least one class to reschedule.');
          return;
        }
        if (!newDate) {
          setErrorMessage('Please select a replacement date.');
          return;
        }

        const movedClasses = selectedMultiSlotIds.map(slotId => {
          const item = allSlotsOnSelectedDate.find(s => s.slot.id === slotId);
          return {
            subjectId: item ? item.subject.id : selectedSubjectId,
            originalSlotId: slotId,
            originalDate: selectedDate,
            originalStartTime: item ? item.slot.startTime : originalStartTime,
            originalEndTime: item ? item.slot.endTime : originalEndTime,
            newDate: newDate,
            newStartTime: formatTimeString(newStartTime),
            newEndTime: formatTimeString(newEndTime),
            newRoom: newRoom.trim() || undefined,
            newInstructor: newInstructor.trim() || undefined,
            reason: rescheduleReason.trim() || 'Classes Rescheduled',
          };
        });

        onSaveException(
          {
            subjectId: selectedSubjectId,
            type: 'rescheduled_date',
            changeType: 'RESCHEDULED',
            date: selectedDate,
            originalDate: selectedDate,
            newDate: newDate,
            newStartTime: formatTimeString(newStartTime),
            newEndTime: formatTimeString(newEndTime),
            newRoom: newRoom.trim() || undefined,
            reason: rescheduleReason.trim() || undefined,
            classes: movedClasses,
            reminderEnabled: true,
            reminderMinutes: 20,
          },
          editingException?.id
        );
      }

      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[94vh] sm:max-h-[90vh] flex flex-col text-slate-100"
        >
          {/* Header */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Schedule Change Manager
                </h3>
                <p className="text-xs text-slate-400">
                  Select an exact change type: Holiday, Suspended, or Rescheduled
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
            {/* EXACT THREE TABS */}
            <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-950/90 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setChangeType('HOLIDAY')}
                className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  changeType === 'HOLIDAY'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🎉</span>
                <span>Holiday</span>
              </button>

              <button
                type="button"
                onClick={() => setChangeType('SUSPENDED')}
                className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  changeType === 'SUSPENDED'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>⛔</span>
                <span>Suspended</span>
              </button>

              <button
                type="button"
                onClick={() => setChangeType('RESCHEDULED')}
                className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  changeType === 'RESCHEDULED'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>↻</span>
                <span>Rescheduled</span>
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

              {/* TAB 1: HOLIDAY */}
            {changeType === 'HOLIDAY' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-1 text-xs text-emerald-200">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                    <PartyPopper className="w-4 h-4 text-emerald-400" />
                    Holiday
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    {timetableSystem === 'day_order'
                      ? "No classes today. The day order continues on the next working day."
                      : "No classes today. Classes resume on the next scheduled weekday."}
                  </p>
                </div>

                {/* Holiday Date & Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Holiday Date *</span>
                      <span className="text-[11px] text-emerald-400 font-bold">
                        {selectedDate ? getCurrentDayOfWeek(parseISODate(selectedDate)) : ''}
                      </span>
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={e => handleDateChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Holiday Name / Occasion *
                    </label>
                    <input
                      type="text"
                      value={holidayName}
                      onChange={e => setHolidayName(e.target.value)}
                      placeholder="e.g. Gandhi Jayanti, College Day"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Day Order Carried Forward Model (Only if Day Order system is selected) */}
                {timetableSystem === 'day_order' && (
                  <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Day Order Carry-Forward Configuration
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Original Day Order *
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={holidayOriginalDayOrder}
                          onChange={e => setHolidayOriginalDayOrder(parseInt(e.target.value, 10) || 1)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[10px] text-slate-500 mt-1 block">
                          Day order of the cancelled day
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Replacement Date (Next Working Day) *
                        </label>
                        <input
                          type="date"
                          value={holidayReplacementDate}
                          onChange={e => setHolidayReplacementDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[10px] text-emerald-400 font-medium mt-1 block">
                          Will conduct Day Order {holidayOriginalDayOrder}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Description / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={holidayDescription}
                    onChange={e => setHolidayDescription(e.target.value)}
                    placeholder="e.g. University circular, campus closed"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: SUSPENDED */}
            {changeType === 'SUSPENDED' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-1 text-xs text-rose-200">
                  <div className="flex items-center gap-1.5 font-bold text-rose-300">
                    <Ban className="w-4 h-4 text-rose-400" />
                    Suspended Classes
                  </div>
                  <p className="text-xs text-rose-200/90 leading-relaxed">
                    {timetableSystem === 'day_order'
                      ? "No classes today. This day's order is not carried forward."
                      : "No classes today. Regular weekday timetable resumes next working day."}
                  </p>
                </div>

                <div className={`grid gap-3 ${timetableSystem === 'day_order' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Suspension Date *</span>
                      <span className="text-[11px] text-rose-400 font-bold">
                        {selectedDate ? getCurrentDayOfWeek(parseISODate(selectedDate)) : ''}
                      </span>
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={e => handleDateChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  {timetableSystem === 'day_order' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Suspended Day Order *
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={suspendedDayOrder}
                        onChange={e => setSuspendedDayOrder(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Day order cancelled without replacement
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Suspension Reason *
                  </label>
                  <input
                    type="text"
                    value={suspendedReason}
                    onChange={e => setSuspendedReason(e.target.value)}
                    placeholder="e.g. Heavy Rain Alert, Campus Maintenance, Strike"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-2 text-xs text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Explicit Flag: <strong className="text-white">noReplacement = true</strong>. {timetableSystem === 'day_order' ? 'The next teaching day will advance to the next day order in sequence.' : 'No replacement class is conducted.'}
                  </span>
                </div>
              </div>
            )}

            {/* TAB 3: RESCHEDULED */}
            {changeType === 'RESCHEDULED' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-purple-950/20 border border-purple-500/30 rounded-xl space-y-1 text-xs text-purple-200">
                  <div className="flex items-center gap-1.5 font-bold text-purple-300">
                    <RotateCw className="w-4 h-4 text-purple-400" />
                    Rescheduled Class
                  </div>
                  <p className="text-xs text-purple-200/90 leading-relaxed">
                    Move one or more classes to another date/time. The remaining classes on the original day stay unchanged.
                  </p>
                </div>

                {/* Single vs Multiple Switch */}
                <div className="flex items-center gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setRescheduleMode('single')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      rescheduleMode === 'single'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Move Single Class
                  </button>
                  <button
                    type="button"
                    onClick={() => setRescheduleMode('multiple')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      rescheduleMode === 'multiple'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Move Multiple Classes
                  </button>
                </div>

                {/* Original Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Original Date *</span>
                    <span className="text-[11px] text-purple-400 font-bold">
                      {selectedDate ? getCurrentDayOfWeek(parseISODate(selectedDate)) : ''}
                    </span>
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => handleDateChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                {rescheduleMode === 'single' ? (
                  <>
                    {/* Subject Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Subject / Class *
                      </label>
                      <select
                        value={selectedSubjectId}
                        onChange={e => setSelectedSubjectId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                      >
                        {subjects.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.code ? `(${s.code})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Slot Picker if multiple slots exist for this subject on this day */}
                    {subjectSlotsOnDate.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Select Specific Slot to Move
                        </label>
                        <select
                          value={selectedSlotId}
                          onChange={e => handleSelectSlot(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Choose slot timing...</option>
                          {subjectSlotsOnDate.map(slot => (
                            <option key={slot.id} value={slot.id}>
                              {slot.startTime} – {slot.endTime} {slot.room ? `(${slot.room})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Original Start & End Times (Minute-level support) */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Original Start Time
                        </label>
                        <input
                          type="time"
                          step="60"
                          value={timeStringTo24Hour(originalStartTime)}
                          onChange={e => setOriginalStartTime(formatTimeString(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          {formatTimeString(originalStartTime)}
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Original End Time
                        </label>
                        <input
                          type="time"
                          step="60"
                          value={timeStringTo24Hour(originalEndTime)}
                          onChange={e => setOriginalEndTime(formatTimeString(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          {formatTimeString(originalEndTime)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Multiple classes selection */
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      Select Classes to Move from {formatDisplayDate(selectedDate)}:
                    </label>
                    {allSlotsOnSelectedDate.length === 0 ? (
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                        No recurring classes scheduled on this day.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto p-1">
                        {allSlotsOnSelectedDate.map(item => {
                          const isSelected = selectedMultiSlotIds.includes(item.slot.id);
                          return (
                            <div
                              key={item.slot.id}
                              onClick={() => handleToggleMultiSlot(item.slot.id)}
                              className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-purple-950/40 border-purple-500/60 text-white'
                                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                                    isSelected
                                      ? 'bg-purple-600 border-purple-500 text-white'
                                      : 'border-slate-700 bg-slate-900'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3" />}
                                </div>
                                <div>
                                  <span className="text-xs font-bold block">
                                    {item.subject.name}
                                  </span>
                                  <span className="text-[11px] text-purple-300 font-mono">
                                    {item.slot.startTime} – {item.slot.endTime}
                                  </span>
                                </div>
                              </div>
                              {item.slot.room && (
                                <span className="text-[10px] text-slate-400">
                                  {item.slot.room}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Replacement Date & Time */}
                <div className="p-3.5 bg-slate-950 border border-purple-500/20 rounded-xl space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400 block">
                    Replacement Class Details (Destination)
                  </span>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                      <span>Replacement Date *</span>
                      <span className="text-[11px] text-purple-400 font-bold">
                        {newDate ? getCurrentDayOfWeek(parseISODate(newDate)) : ''}
                      </span>
                    </label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={e => setNewDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Minute-level time inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        New Start Time *
                      </label>
                      <input
                        type="time"
                        step="60"
                        value={timeStringTo24Hour(newStartTime)}
                        onChange={e => setNewStartTime(formatTimeString(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                      />
                      <span className="text-[10px] text-purple-300 font-mono mt-0.5 block">
                        {formatTimeString(newStartTime)}
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        New End Time *
                      </label>
                      <input
                        type="time"
                        step="60"
                        value={timeStringTo24Hour(newEndTime)}
                        onChange={e => setNewEndTime(formatTimeString(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                      />
                      <span className="text-[10px] text-purple-300 font-mono mt-0.5 block">
                        {formatTimeString(newEndTime)}
                      </span>
                    </div>
                  </div>

                  {/* Minute-level Preset Pills */}
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1.5">
                      Common Timetable Times:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {COMMON_MINUTE_TIMES.slice(9, 16).map(timePreset => (
                        <button
                          key={timePreset}
                          type="button"
                          onClick={() => {
                            setNewStartTime(timePreset);
                            const startM = parseTimeToMinutes(timePreset);
                            setNewEndTime(formatMinutesToTime12Hour(startM + 50));
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-purple-500 transition-colors"
                        >
                          {timePreset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Optional Room & Instructor */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        New Room (Optional)
                      </label>
                      <input
                        type="text"
                        value={newRoom}
                        onChange={e => setNewRoom(e.target.value)}
                        placeholder="e.g. Audi 2, Lab 3"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        New Instructor (Optional)
                      </label>
                      <input
                        type="text"
                        value={newInstructor}
                        onChange={e => setNewInstructor(e.target.value)}
                        placeholder="e.g. Guest Faculty"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Reason for Rescheduling
                  </label>
                  <input
                    type="text"
                    value={rescheduleReason}
                    onChange={e => setRescheduleReason(e.target.value)}
                    placeholder="e.g. Faculty Seminar, Department Conference, Makeup Lab"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-800 bg-slate-950/80 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-3 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer text-center"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              className={`w-full sm:w-auto px-5 py-3 sm:py-2 rounded-xl text-white text-xs font-bold shadow-lg transition-all cursor-pointer text-center ${
                changeType === 'HOLIDAY'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                  : changeType === 'SUSPENDED'
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                  : 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30'
              }`}
            >
              Apply {changeType}
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
