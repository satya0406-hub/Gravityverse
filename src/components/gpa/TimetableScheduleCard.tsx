import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Plus,
  Trash2,
  Edit2,
  Bell,
  BellOff,
  CheckCircle2,
  XCircle,
  Sparkles,
  Info,
  CalendarDays,
  ListFilter,
  Check,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  HelpCircle,
  CalendarX2,
  PartyPopper,
  ArrowRight,
  CalendarCheck,
  Tag,
  Zap,
  X,
  Layers,
  CalendarClock,
} from 'lucide-react';
import {
  SubjectCourse,
  TimetableSlot,
  ScheduleException,
  HolidayRecord,
  DayOfWeek,
  DAYS_OF_WEEK,
  WEEKDAYS,
  TimetableSystem,
  formatTimetableDayHeader,
  formatSlotDay,
  parseTimeToMinutes,
  formatMinutesToTime12Hour,
  getCurrentDayOfWeek,
  getSubjectColor,
  formatDateToISO,
  formatDisplayDate,
  parseISODate,
  getWeekDaysForDate,
  getClassOccurrencesForDate,
  getUpcomingOccurrences,
  ClassOccurrence,
} from '../../lib/gpaCalculatorEngine';
import { AcademicCalendarView } from './AcademicCalendarView';
import { ScheduleExceptionsManager } from './ScheduleExceptionsManager';

export interface TimetableScheduleCardProps {
  subjects: SubjectCourse[];
  exceptions: ScheduleException[];
  holidays: HolidayRecord[];
  teachingDays?: DayOfWeek[];
  timetableSystem?: TimetableSystem;
  onOpenTimetableSystemModal?: () => void;
  onUpdateSubjectSchedule: (subjectId: string, slots: TimetableSlot[]) => void;
  onOpenAddScheduleModal: (subject?: SubjectCourse) => void;
  onOpenAddSubjectModal: () => void;
  onRecordAttendance: (subjectId: string, attended: boolean, sessionId?: string) => void;
  onUpdateReminder: (subjectId: string, slotId: string, enabled: boolean, minutes?: number) => void;
  onOpenAddScheduleChange: (prefill?: { date?: string; subjectId?: string; slotId?: string }) => void;
  onOpenAddHoliday: (prefillDate?: string) => void;
  onEditException: (exception: ScheduleException) => void;
  onEditHoliday: (holiday: HolidayRecord) => void;
  onDeleteException: (id: string) => void;
  onDeleteHoliday: (id: string) => void;
}

export function TimetableScheduleCard({
  subjects,
  exceptions = [],
  holidays = [],
  teachingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  timetableSystem = 'day_order',
  onOpenTimetableSystemModal,
  onUpdateSubjectSchedule,
  onOpenAddScheduleModal,
  onOpenAddSubjectModal,
  onRecordAttendance,
  onUpdateReminder,
  onOpenAddScheduleChange,
  onOpenAddHoliday,
  onEditException,
  onEditHoliday,
  onDeleteException,
  onDeleteHoliday,
}: TimetableScheduleCardProps) {
  const [viewMode, setViewMode] = useState<
    'weekly_grid' | 'agenda' | 'calendar' | 'exceptions' | 'by_subject'
  >('weekly_grid');
  const [includeWeekends, setIncludeWeekends] = useState<boolean>(false);
  const [currentWeekRefDate, setCurrentWeekRefDate] = useState<Date>(new Date());
  const [selectedAgendaDateStr, setSelectedAgendaDateStr] = useState<string>(formatDateToISO(new Date()));
  const [filterSubjectId, setFilterSubjectId] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Track attendance prompt actions taken in this session
  const [resolvedPromptIds, setResolvedPromptIds] = useState<Record<string, 'present' | 'absent' | 'skipped'>>({});

  // Keep live clock running
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = formatDateToISO(currentTime);
  const currentDayName = getCurrentDayOfWeek(currentTime);

  // Week days for the selected week
  const weekDays = getWeekDaysForDate(currentWeekRefDate, includeWeekends);
  const weekStartStr = formatDisplayDate(weekDays[0].dateStr, { shortMonth: true });
  const weekEndStr = formatDisplayDate(weekDays[weekDays.length - 1].dateStr, { shortMonth: true });

  const isDayOrder = timetableSystem === 'day_order';

  // Today's actual schedule computed via Master Class Occurrence Engine
  const todaysResult = getClassOccurrencesForDate(
    todayStr,
    subjects,
    exceptions,
    holidays,
    currentTime,
    teachingDays,
    timetableSystem
  );

  // Selected class for clean details popover modal
  const [selectedClassModal, setSelectedClassModal] = useState<ClassOccurrence | null>(null);

  // Mobile weekly day selector state
  const [selectedMobileDayStr, setSelectedMobileDayStr] = useState<string>(todayStr);
  const [showMobileFullMatrix, setShowMobileFullMatrix] = useState<boolean>(false);

  // Dynamic university periods supporting arbitrary minute-level times (e.g. 12:40, 1:25, 2:35)
  const timetableSlotsList = useMemo(() => {
    const timeMap = new Map<string, { label: string; startMin: number; endMin: number }>();

    // Standard university period fallbacks
    const defaultPeriods = [
      { label: '09:00', startMin: 9 * 60, endMin: 10 * 60 },
      { label: '10:00', startMin: 10 * 60, endMin: 11 * 60 },
      { label: '11:00', startMin: 11 * 60, endMin: 12 * 60 },
      { label: '12:40', startMin: 12 * 60 + 40, endMin: 13 * 60 + 25 },
      { label: '01:25', startMin: 13 * 60 + 25, endMin: 14 * 60 + 15 },
      { label: '02:35', startMin: 14 * 60 + 35, endMin: 15 * 60 + 25 },
      { label: '03:50', startMin: 15 * 60 + 50, endMin: 16 * 60 + 40 },
    ];

    // Gather distinct class times from subjects
    subjects.forEach(sub => {
      (sub.timetable || []).forEach(slot => {
        const sMin = parseTimeToMinutes(slot.startTime);
        const eMin = parseTimeToMinutes(slot.endTime);
        if (sMin !== null) {
          const key = `t-${sMin}`;
          if (!timeMap.has(key)) {
            timeMap.set(key, {
              label: formatMinutesToTime12Hour(sMin).replace(/\s?(AM|PM)/i, ''),
              startMin: sMin,
              endMin: eMin !== null && eMin > sMin ? eMin : sMin + 50,
            });
          }
        }
      });
    });

    // Gather distinct class times from this week's actual occurrences
    weekDays.forEach(wd => {
      const dayRes = getClassOccurrencesForDate(
        wd.dateStr,
        subjects,
        exceptions,
        holidays,
        currentTime,
        teachingDays,
        timetableSystem
      );
      dayRes.occurrences.forEach(occ => {
        const sMin = occ.startMinutes;
        const eMin = occ.endMinutes;
        const key = `t-${sMin}`;
        if (!timeMap.has(key)) {
          timeMap.set(key, {
            label: formatMinutesToTime12Hour(sMin).replace(/\s?(AM|PM)/i, ''),
            startMin: sMin,
            endMin: eMin > sMin ? eMin : sMin + 50,
          });
        }
      });
    });

    // If no custom times found, use default periods
    if (timeMap.size === 0) {
      defaultPeriods.forEach(p => timeMap.set(`t-${p.startMin}`, p));
    } else {
      // Ensure at least 4 slots exist
      defaultPeriods.forEach(p => {
        const hasNear = Array.from(timeMap.values()).some(existing => Math.abs(existing.startMin - p.startMin) < 30);
        if (!hasNear) {
          timeMap.set(`t-${p.startMin}`, p);
        }
      });
    }

    return Array.from(timeMap.values()).sort((a, b) => a.startMin - b.startMin);
  }, [subjects, weekDays, exceptions, holidays]);

  // Helper for attendance post-class response
  const handlePromptResponse = (
    subjectId: string,
    slotIdOrOccId: string,
    dateStr: string,
    choice: 'present' | 'absent' | 'skipped'
  ) => {
    const promptKey = `${subjectId}_${slotIdOrOccId}_${dateStr}`;
    setResolvedPromptIds(prev => ({ ...prev, [promptKey]: choice }));

    if (choice === 'present') {
      onRecordAttendance(subjectId, true, promptKey);
    } else if (choice === 'absent') {
      onRecordAttendance(subjectId, false, promptKey);
    }
  };

  // Week navigation
  const handlePrevWeek = () => {
    const prev = new Date(currentWeekRefDate);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekRefDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentWeekRefDate);
    next.setDate(next.getDate() + 7);
    setCurrentWeekRefDate(next);
  };

  const handleCurrentWeek = () => {
    setCurrentWeekRefDate(new Date());
  };

  return (
    <div className="space-y-8">
      {/* Top Banner: Today's Actual Schedule & Post-Class Attendance Check */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-[#0b101f] via-[#0f172a] to-[#0b101f] border border-sky-500/20 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <span>Today's Schedule — {currentDayName}</span>
                  {isDayOrder && todaysResult.dayOrder && (
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-mono font-bold">
                      Day Order {todaysResult.dayOrder}
                    </span>
                  )}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-mono font-bold">
                  {todaysResult.activeOccurrences.length} Active Classes
                </span>
                {todaysResult.isHoliday && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    🎉 Holiday
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {formatDisplayDate(todayStr, { includeDay: false })} • Live Time:{' '}
                {formatMinutesToTime12Hour(currentTime.getHours() * 60 + currentTime.getMinutes())}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:items-center sm:flex-wrap gap-2 w-full sm:w-auto">
            {onOpenTimetableSystemModal && (
              <button
                type="button"
                onClick={onOpenTimetableSystemModal}
                className="w-full sm:w-auto h-11 sm:h-9 px-3 bg-slate-900/90 hover:bg-slate-800 border border-white/15 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm group shrink-0"
                title="Switch between Day Order (Day 1, 2, 3...) and Weekday (Mon–Sun) timetable system"
              >
                {isDayOrder ? (
                  <Layers className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                ) : (
                  <CalendarClock className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
                )}
                <span>{isDayOrder ? 'Day Order' : 'Weekday'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenAddScheduleChange({ date: todayStr })}
              className="w-full sm:w-auto h-11 sm:h-9 px-3.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <CalendarX2 className="w-3.5 h-3.5" />
              <span>Schedule Change</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenAddScheduleModal(subjects.length > 0 ? subjects[0] : undefined);
              }}
              className="w-full sm:w-auto h-11 sm:h-9 px-3.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-sky-500/20 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Regular Schedule</span>
            </button>
          </div>
        </div>

        {/* Holiday Banner if Today is a University Holiday */}
        {todaysResult.isHoliday && todaysResult.holiday && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <PartyPopper className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-emerald-200">
                  🎉 {todaysResult.holiday.name}
                </h4>
                <p className="text-xs text-emerald-300/80 mt-0.5">
                  Regular classes are suspended today. Reminders are paused and attendance is not penalized.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onEditHoliday(todaysResult.holiday!)}
              className="text-xs text-emerald-300 font-semibold underline shrink-0 hover:text-emerald-200"
            >
              Edit Holiday
            </button>
          </div>
        )}

        {/* Today's Classes List / Post-Class Attendance Action Cards */}
        {todaysResult.occurrences.length === 0 ? (
          <div className="p-4 bg-black/30 border border-white/5 rounded-xl text-center py-6">
            <p className="text-xs text-slate-400 font-medium">
              No classes scheduled for today ({currentDayName}).
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Use "Schedule Change" to add an extra session or configure weekly schedules.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {todaysResult.occurrences.map((item, idx) => {
              const promptKey = `${item.subjectId}_${item.id}_${todayStr}`;
              const promptState = resolvedPromptIds[promptKey];
              const isPastOrActive = (item.status === 'ongoing' || item.status === 'concluded') && !item.isCancelled;

              return (
                <div
                  key={item.id || idx}
                  className={`p-4 rounded-xl border space-y-3 relative overflow-hidden transition-all ${
                    item.isCancelled
                      ? 'bg-black/30 border-white/5 opacity-60'
                      : 'bg-black/50 border-white/10 hover:border-sky-500/40'
                  }`}
                  style={{
                    borderLeftColor: item.subjectColor || '#38bdf8',
                    borderLeftWidth: '4px',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold uppercase tracking-wide ${
                            item.isCancelled ? 'line-through text-slate-400' : 'text-white'
                          }`}
                        >
                          {item.subjectName}
                        </span>
                        {item.subjectCode && (
                          <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/40">
                            {item.subjectCode}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                        <span className="flex items-center gap-1 font-mono font-bold text-slate-200">
                          <Clock className="w-3.5 h-3.5 text-sky-400" />
                          {item.formattedTimeRange}
                        </span>
                        {item.room && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-500" />
                            {item.room}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Pill */}
                    {item.isCancelled ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        Cancelled
                      </span>
                    ) : item.type === 'rescheduled' ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Rescheduled
                      </span>
                    ) : item.type === 'extra' ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Extra Class
                      </span>
                    ) : item.type === 'moved_time' ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Time Moved
                      </span>
                    ) : (
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          item.status === 'ongoing'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse'
                            : item.status === 'concluded'
                            ? 'bg-slate-700/50 text-slate-400'
                            : 'bg-sky-500/15 text-sky-300'
                        }`}
                      >
                        {item.status === 'ongoing'
                          ? 'In Session'
                          : item.status === 'concluded'
                          ? 'Concluded'
                          : 'Upcoming'}
                      </span>
                    )}
                  </div>

                  {/* Exception reason banner */}
                  {item.reason && (
                    <div className="text-[11px] px-2 py-0.8 rounded bg-white/5 text-slate-300 flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{item.reason}</span>
                    </div>
                  )}

                  {/* Reminder info */}
                  {item.reminderEnabled && !item.isCancelled && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-300/90 font-medium">
                      <Bell className="w-3 h-3 text-amber-400" />
                      <span>Reminder active ({item.reminderMinutes || 20}m before)</span>
                    </div>
                  )}

                  {/* Quick change action */}
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenAddScheduleChange({
                          date: todayStr,
                          subjectId: item.subjectId,
                          slotId: item.originalSlotId,
                        })
                      }
                      className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1"
                    >
                      <CalendarX2 className="w-3 h-3" /> Change This Class
                    </button>
                  </div>

                  {/* Post-Class Attendance Prompt (Mandated by specification) */}
                  {isPastOrActive && (
                    <div className="pt-2.5 border-t border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-300">
                          Did you attend {item.subjectCode || item.subjectName}?
                        </span>
                        {promptState && (
                          <span className="text-[10px] font-bold uppercase text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Logged ({promptState})
                          </span>
                        )}
                      </div>

                      {!promptState ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handlePromptResponse(item.subjectId, item.id, todayStr, 'present')
                            }
                            className="py-1 px-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Present
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handlePromptResponse(item.subjectId, item.id, todayStr, 'absent')
                            }
                            className="py-1 px-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Absent
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handlePromptResponse(item.subjectId, item.id, todayStr, 'skipped')
                            }
                            className="py-1 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 rounded-lg text-xs font-medium flex items-center justify-center transition-all cursor-pointer"
                          >
                            Skip
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">
                          Subject attendance updated in attendance records.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Timetable Navigation Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-sky-400" />
            Timetable & Schedule Overrides
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Weekly matrix, schedule exceptions, holidays, and academic calendar
          </p>
        </div>

        {/* View Switcher & Options (Mobile Horizontally Scrollable) */}
        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 p-1 bg-black/40 rounded-xl border border-white/10 shrink-0 min-w-max">
            <button
              type="button"
              onClick={() => setViewMode('weekly_grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'weekly_grid'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Weekly Matrix
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'agenda'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Day Agenda
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'calendar'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Academic Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode('exceptions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'exceptions'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                  : 'text-amber-400/90 hover:text-amber-300'
              }`}
            >
              Changes ({exceptions.length + holidays.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('by_subject')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'by_subject'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              By Subject
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: WEEKLY MATRIX GRID */}
      {viewMode === 'weekly_grid' && (
        <div className="space-y-4">
          {/* Week Navigator Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrevWeek}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleCurrentWeek}
                className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-sky-400 hover:bg-slate-800"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={handleNextWeek}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold text-white ml-2">
                {weekStartStr} – {weekEndStr}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {/* Weekend Toggle */}
              <button
                type="button"
                onClick={() => setIncludeWeekends(!includeWeekends)}
                className={`px-3 py-1.5 sm:py-1 rounded-xl text-xs font-bold border transition-all ${
                  includeWeekends
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {includeWeekends ? 'Mon – Sun (7 Days)' : 'Mon – Fri (5 Days)'}
              </button>

              {/* Subject Filter */}
              <select
                value={filterSubjectId}
                onChange={e => setFilterSubjectId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 sm:py-1 text-xs text-white"
              >
                <option value="all">All Subjects</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* MOBILE-ONLY: DAY-BY-DAY SCHEDULE VIEW */}
          <div className="block md:hidden space-y-3">
            {/* Horizontal Day Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {weekDays.map(item => {
                const isSelected = item.dateStr === (selectedMobileDayStr || todayStr);
                const isToday = item.dateStr === todayStr;
                const dayRes = getClassOccurrencesForDate(
                  item.dateStr,
                  subjects,
                  exceptions,
                  holidays,
                  currentTime,
                  teachingDays,
                  timetableSystem
                );
                const dayOrder = dayRes.effectiveDayOrder || dayRes.dayOrder;
                const isHol = dayRes.isHoliday;

                return (
                  <button
                    key={item.dateStr}
                    type="button"
                    onClick={() => setSelectedMobileDayStr(item.dateStr)}
                    className={`px-3 py-2 rounded-xl text-center shrink-0 min-w-[70px] border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/20'
                        : isToday
                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                        : 'bg-[#0b101f] text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="block text-[10px] font-black uppercase tracking-wider">
                      {item.day.substring(0, 3)}
                    </span>
                    <span className="block text-xs font-bold font-mono">
                      {item.dayNumber}
                    </span>
                    {isDayOrder && dayOrder && dayOrder > 0 ? (
                      <span className={`block text-[9px] font-mono font-bold mt-0.5 ${isSelected ? 'text-white' : 'text-sky-400'}`}>
                        DO {dayOrder}
                      </span>
                    ) : isHol ? (
                      <span className="block text-[9px] text-emerald-400 mt-0.5 font-bold">Hol</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Selected Day Classes Vertical Cards */}
            {(() => {
              const activeDayStr = selectedMobileDayStr || todayStr;
              const activeDayObj = weekDays.find(w => w.dateStr === activeDayStr) || weekDays[0];
              const dayRes = getClassOccurrencesForDate(
                activeDayStr,
                subjects,
                exceptions,
                holidays,
                currentTime,
                teachingDays,
                timetableSystem
              );
              const matchingOccurrences = filterSubjectId === 'all'
                ? dayRes.occurrences
                : dayRes.occurrences.filter(o => o.subjectId === filterSubjectId);

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1 text-xs">
                    <span className="font-bold text-white flex items-center gap-2">
                      <span>{formatDisplayDate(activeDayStr, { includeDay: true })}</span>
                      {isDayOrder && dayRes.dayOrder && (
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-[10px] font-bold">
                          Day Order {dayRes.dayOrder}
                        </span>
                      )}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {matchingOccurrences.length} classes
                    </span>
                  </div>

                  {dayRes.isHoliday && dayRes.holiday && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs">
                      🎉 <strong>{dayRes.holiday.name}:</strong> Classes cancelled.
                    </div>
                  )}

                  {matchingOccurrences.length === 0 ? (
                    <div className="py-8 text-center bg-black/30 border border-white/5 rounded-2xl space-y-1">
                      <p className="text-xs font-bold text-slate-300">No classes scheduled on this day</p>
                      <p className="text-[11px] text-slate-500">Free day or no periods mapped for this day.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {matchingOccurrences.map(occ => (
                        <div
                          key={occ.id}
                          onClick={() => setSelectedClassModal(occ)}
                          className="p-3.5 bg-[#0b101f] border border-white/10 rounded-xl space-y-2 cursor-pointer hover:border-sky-500/40 transition-all active:scale-[0.99]"
                          style={{
                            borderLeftColor: occ.subjectColor || '#38bdf8',
                            borderLeftWidth: '4px',
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-white">{occ.subjectName}</h4>
                              {occ.subjectCode && (
                                <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded mr-2 mt-0.5 inline-block">
                                  {occ.subjectCode}
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-mono font-bold text-sky-300 shrink-0">
                              {occ.formattedTimeRange}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                            <div className="flex items-center gap-3">
                              {occ.room && (
                                <span>Room: <strong className="text-slate-200">{occ.room}</strong></span>
                              )}
                              {occ.instructor && (
                                <span>Faculty: <strong className="text-slate-200">{occ.instructor}</strong></span>
                              )}
                            </div>
                            <div>
                              {occ.status === 'ongoing' ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">In Session</span>
                              ) : occ.isCancelled ? (
                                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">Cancelled</span>
                              ) : occ.type === 'rescheduled' ? (
                                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold">↻ Rescheduled</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-white/5 text-slate-400 text-[10px]">Details →</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Toggle to inspect full multi-column grid */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowMobileFullMatrix(prev => !prev)}
                      className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-slate-300 font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>{showMobileFullMatrix ? 'Hide Full Matrix Grid' : 'View Full Matrix Grid (Horizontal Scroll)'}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Desktop Grid View Table (and optionally shown when toggled on mobile) */}
          <div className={`${showMobileFullMatrix ? 'block' : 'hidden md:block'} bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl overflow-x-auto`}>
            <div className="min-w-[850px] p-4">
              {/* Grid Header */}
              <div
                className="grid gap-2 mb-2"
                style={{
                  gridTemplateColumns: `80px repeat(${weekDays.length}, minmax(130px, 1fr))`,
                }}
              >
                <div className="p-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Time
                </div>
                {weekDays.map(item => {
                  const isToday = item.dateStr === todayStr;
                  const dayRes = getClassOccurrencesForDate(
                    item.dateStr,
                    subjects,
                    exceptions,
                    holidays,
                    currentTime,
                    teachingDays,
                    timetableSystem
                  );
                  const isHol = dayRes.isHoliday;
                  const isSusp = dayRes.isSuspended;
                  const dayOrder = dayRes.effectiveDayOrder || dayRes.dayOrder;

                  return (
                    <div
                      key={item.dateStr}
                      onClick={() => onOpenAddScheduleChange({ date: item.dateStr })}
                      className={`p-2.5 text-center rounded-xl font-bold text-xs uppercase tracking-wider border transition-all cursor-pointer ${
                        isToday
                          ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-black shadow-sm'
                          : isHol
                          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                          : isSusp
                          ? 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                          : 'bg-black/30 border-white/5 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{item.day.substring(0, 3)}</span>
                        <span className="font-mono text-[10px] opacity-75">{item.dayNumber}</span>
                      </div>

                      {/* Day Order Badge (Only shown when Day Order timetable system is selected) */}
                      {isDayOrder && dayOrder && dayOrder > 0 && !isHol && !isSusp && (
                        <span className={`block text-[10px] font-mono font-bold mt-0.5 ${
                          dayRes.isPostponedDay ? 'text-amber-400' : 'text-slate-400'
                        }`}>
                          DO {dayOrder} {dayRes.isPostponedDay ? '↻' : ''}
                        </span>
                      )}

                      {isToday && (
                        <span className="block text-[9px] text-sky-400 normal-case font-bold">
                          Today
                        </span>
                      )}
                      {isHol && (
                        <span className="block text-[9px] text-emerald-400 normal-case truncate">
                          🎉 Holiday {isDayOrder && dayRes.holiday?.originalDayOrder ? `(DO ${dayRes.holiday.originalDayOrder} ➔)` : ''}
                        </span>
                      )}
                      {isSusp && (
                        <span className="block text-[9px] text-rose-400 normal-case truncate">
                          🚫 Suspended
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Grid Rows */}
              <div className="space-y-2">
                {timetableSlotsList.map(timeSlot => (
                  <div
                    key={`${timeSlot.label}-${timeSlot.startMin}`}
                    className="grid gap-2 items-stretch"
                    style={{
                      gridTemplateColumns: `80px repeat(${weekDays.length}, minmax(130px, 1fr))`,
                    }}
                  >
                    {/* Time label column */}
                    <div className="flex items-center justify-center p-2 text-xs font-mono font-bold text-slate-300 bg-black/30 rounded-xl border border-white/5">
                      {timeSlot.label}
                    </div>

                    {/* Day cells with Master Occurrence Engine mapping */}
                    {weekDays.map(weekDay => {
                      const dayResult = getClassOccurrencesForDate(
                        weekDay.dateStr,
                        subjects,
                        exceptions,
                        holidays,
                        currentTime,
                        teachingDays,
                        timetableSystem
                      );

                      // Filter occurrences matching this period
                      const matchingOccurrences = dayResult.occurrences.filter(occ => {
                        if (filterSubjectId !== 'all' && occ.subjectId !== filterSubjectId) {
                          return false;
                        }
                        const occStart = occ.startMinutes;
                        const occEnd = occ.endMinutes;
                        return Math.abs(occStart - timeSlot.startMin) < 15 || (occStart < timeSlot.endMin && occEnd > timeSlot.startMin);
                      });

                      if (matchingOccurrences.length === 0) {
                        return (
                          <div
                            key={weekDay.dateStr}
                            onClick={() => onOpenAddScheduleChange({ date: weekDay.dateStr })}
                            className="min-h-[64px] p-2 rounded-xl bg-black/10 border border-white/5 border-dashed flex items-center justify-center text-slate-600 text-xs hover:bg-white/[0.02] transition-colors cursor-pointer"
                            title={`Click to add class or exception on ${weekDay.dateStr}`}
                          >
                            <span className="text-slate-600 font-mono text-sm">─</span>
                          </div>
                        );
                      }

                      return (
                        <div key={weekDay.dateStr} className="space-y-1.5 min-h-[64px]">
                          {matchingOccurrences.map(occ => {
                            const isCancelled = occ.isCancelled;
                            const isRescheduled = occ.type === 'rescheduled';

                            return (
                              <div
                                key={occ.id}
                                onClick={() => setSelectedClassModal(occ)}
                                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg space-y-1 ${
                                  isCancelled ? 'opacity-50 line-through' : ''
                                }`}
                                style={{
                                  backgroundColor: `${occ.subjectColor || '#38bdf8'}15`,
                                  borderColor: `${occ.subjectColor || '#38bdf8'}40`,
                                }}
                                title="Click to view details, reschedule, or record attendance"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className="text-xs font-bold truncate block"
                                    style={{ color: occ.subjectColor || '#38bdf8' }}
                                  >
                                    {occ.subjectName}
                                  </span>
                                  {isRescheduled && (
                                    <span className="text-[10px] text-purple-300 font-bold shrink-0">
                                      ↻
                                    </span>
                                  )}
                                </div>

                                {occ.subjectCode && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {occ.subjectCode}
                                  </div>
                                )}

                                <div className="text-[10px] font-mono text-slate-300 flex items-center justify-between gap-1">
                                  <span>{occ.formattedTimeRange}</span>
                                  {occ.room && (
                                    <span className="text-slate-400 truncate max-w-[65px]">
                                      {occ.room}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: DAY AGENDA */}
      {viewMode === 'agenda' && (
        <div className="space-y-6">
          {/* Day Picker */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>Agenda for {formatDisplayDate(selectedAgendaDateStr, { includeDay: true })}</span>
                  {isDayOrder && (
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-xs font-mono font-bold">
                      Day Order {getClassOccurrencesForDate(selectedAgendaDateStr, subjects, exceptions, holidays, currentTime, teachingDays, timetableSystem).dayOrder || 1}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400">
                  Detailed breakdown of classes, overrides, and attendance logging
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedAgendaDateStr}
                onChange={e => setSelectedAgendaDateStr(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => setSelectedAgendaDateStr(todayStr)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-400"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => onOpenAddScheduleChange({ date: selectedAgendaDateStr })}
                className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Change
              </button>
            </div>
          </div>

          {/* Render selected day's occurrences */}
          {(() => {
            const agendaResult = getClassOccurrencesForDate(
              selectedAgendaDateStr,
              subjects,
              exceptions,
              holidays,
              currentTime,
              teachingDays,
              timetableSystem
            );

            return (
              <div className="space-y-4">
                {agendaResult.isHoliday && agendaResult.holiday && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <PartyPopper className="w-6 h-6 text-emerald-400 shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-emerald-200">
                          🎉 {agendaResult.holiday.name}
                        </h4>
                        <p className="text-xs text-emerald-300/80 mt-0.5">
                          University holiday. Classes are not counted in active schedules.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {agendaResult.occurrences.length === 0 ? (
                  <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-2">
                    <p className="text-xs text-slate-400 font-medium">
                      No classes scheduled on this date.
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenAddScheduleChange({ date: selectedAgendaDateStr })}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-sky-400 rounded-lg text-xs font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add extra class or exception
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {agendaResult.occurrences.map(occ => {
                      const promptKey = `${occ.subjectId}_${occ.id}_${selectedAgendaDateStr}`;
                      const promptState = resolvedPromptIds[promptKey];

                      return (
                        <div
                          key={occ.id}
                          className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 relative overflow-hidden"
                          style={{
                            borderLeftColor: occ.subjectColor || '#38bdf8',
                            borderLeftWidth: '4px',
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4
                                  className={`text-sm font-bold ${
                                    occ.isCancelled ? 'line-through text-slate-400' : 'text-white'
                                  }`}
                                >
                                  {occ.subjectName}
                                </h4>
                                {occ.subjectCode && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">
                                    {occ.subjectCode}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                <span className="flex items-center gap-1 text-slate-200 font-mono">
                                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                                  {occ.formattedTimeRange}
                                </span>
                                {occ.room && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-slate-500" />
                                    {occ.room}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Badge */}
                            {occ.hasConflict ? (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1 animate-pulse">
                                ⚠️ Overlapping
                              </span>
                            ) : occ.isCancelled ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                                Cancelled
                              </span>
                            ) : occ.isPostponed ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                                🔄 Shifted Class
                              </span>
                            ) : occ.type === 'rescheduled' ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                                Rescheduled
                              </span>
                            ) : occ.type === 'extra' ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                                Extra Class
                              </span>
                            ) : occ.type === 'moved_time' ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                                Moved Time
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                                Regular
                              </span>
                            )}
                          </div>

                          {/* Postponement notice */}
                          {occ.isPostponed && (
                            <div className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>
                                Automatically shifted from <strong>{occ.postponedFromDay || 'previous teaching cycle'}</strong> due to university holiday.
                              </span>
                            </div>
                          )}

                          {/* Conflict Resolution Box */}
                          {occ.hasConflict && (
                            <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs space-y-2">
                              <div className="text-amber-200 font-semibold flex items-center gap-1.5 text-[11px]">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span>{occ.conflictDetails || 'Time conflict with another class.'}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-amber-300/80">
                                  Resolve without overwriting your normal weekly schedule:
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenAddScheduleChange({
                                      date: selectedAgendaDateStr,
                                      subjectId: occ.subjectId,
                                      slotId: occ.originalSlotId,
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] cursor-pointer shadow-xs transition-all"
                                >
                                  Resolve Conflict
                                </button>
                              </div>
                            </div>
                          )}

                          {occ.reason && (
                            <div className="text-[11px] px-2 py-1 rounded bg-slate-950 text-slate-300 flex items-center gap-1.5">
                              <Tag className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>{occ.reason}</span>
                            </div>
                          )}

                          {/* Action Buttons */}
                          {!occ.isCancelled && (
                            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-slate-400">
                                Attendance Action:
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePromptResponse(
                                      occ.subjectId,
                                      occ.id,
                                      selectedAgendaDateStr,
                                      'present'
                                    )
                                  }
                                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                                    promptState === 'present'
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                  }`}
                                >
                                  Present
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePromptResponse(
                                      occ.subjectId,
                                      occ.id,
                                      selectedAgendaDateStr,
                                      'absent'
                                    )
                                  }
                                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                                    promptState === 'absent'
                                      ? 'bg-rose-500 text-white'
                                      : 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                                  }`}
                                >
                                  Absent
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* VIEW 3: ACADEMIC CALENDAR */}
      {viewMode === 'calendar' && (
        <AcademicCalendarView
          subjects={subjects}
          exceptions={exceptions}
          holidays={holidays}
          timetableSystem={timetableSystem}
          onOpenAddException={onOpenAddScheduleChange}
          onOpenAddHoliday={onOpenAddHoliday}
          onEditException={onEditException}
          onEditHoliday={onEditHoliday}
          onRecordAttendance={onRecordAttendance}
        />
      )}

      {/* VIEW 4: SCHEDULE EXCEPTIONS & HOLIDAYS MANAGER */}
      {viewMode === 'exceptions' && (
        <ScheduleExceptionsManager
          subjects={subjects}
          exceptions={exceptions}
          holidays={holidays}
          timetableSystem={timetableSystem}
          onOpenAddException={onOpenAddScheduleChange}
          onOpenAddHoliday={onOpenAddHoliday}
          onEditException={onEditException}
          onEditHoliday={onEditHoliday}
          onDeleteException={onDeleteException}
          onDeleteHoliday={onDeleteHoliday}
        />
      )}

      {/* VIEW 5: BY SUBJECT */}
      {viewMode === 'by_subject' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div>
              <h3 className="text-sm font-bold text-white">
                Course Timetable Master Breakdown
              </h3>
              <p className="text-xs text-slate-400">
                Weekly class periods assigned per enrolled course
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenAddSubjectModal}
              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold rounded-xl flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Subject
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subjects.map(subject => {
              const subjectSlots = subject.timetable || [];
              const subjectExceptions = exceptions.filter(e => e.subjectId === subject.id);

              return (
                <div
                  key={subject.id}
                  className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 relative"
                  style={{
                    borderLeftColor: subject.color || '#38bdf8',
                    borderLeftWidth: '4px',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{subject.name}</h4>
                        {subject.code && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">
                            {subject.code}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {subject.credits} Credits • {subjectSlots.length} Weekly Periods •{' '}
                        {subjectExceptions.length} Date Overrides
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenAddScheduleModal(subject)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-bold rounded-lg flex items-center gap-1 border border-slate-700"
                    >
                      <Edit2 className="w-3 h-3" /> Manage Schedule
                    </button>
                  </div>

                  {/* Slots list */}
                  <div className="space-y-2">
                    {subjectSlots.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">
                        No recurring class periods configured for this subject yet.
                      </p>
                    ) : (
                      subjectSlots.map(slot => (
                        <div
                          key={slot.id}
                          className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs flex items-center justify-between text-slate-300"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-sky-400 w-16">{formatSlotDay(slot.day, timetableSystem)}</span>
                            <span className="font-mono text-slate-200">
                              {slot.startTime} – {slot.endTime}
                            </span>
                            {slot.room && (
                              <span className="text-slate-400 text-[11px]">({slot.room})</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {slot.reminderEnabled && (
                              <span className="text-[10px] text-amber-400 flex items-center gap-1">
                                <Bell className="w-3 h-3" /> {slot.reminderMinutes || 20}m
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                onOpenAddScheduleChange({
                                  subjectId: subject.id,
                                  slotId: slot.id,
                                })
                              }
                              className="text-[10px] text-sky-400 hover:underline"
                            >
                              Override Date
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* CLEAN CLASS DETAILS POP-UP MODAL (When clicking any timetable block) */}
      <AnimatePresence>
        {selectedClassModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-[#0b101f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 text-slate-100"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm border"
                    style={{
                      backgroundColor: `${selectedClassModal.subjectColor || '#38bdf8'}20`,
                      borderColor: `${selectedClassModal.subjectColor || '#38bdf8'}50`,
                      color: selectedClassModal.subjectColor || '#38bdf8',
                    }}
                  >
                    {selectedClassModal.subjectCode ? selectedClassModal.subjectCode.substring(0, 3) : 'CLS'}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {selectedClassModal.subjectName}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                      {selectedClassModal.subjectCode && <span>{selectedClassModal.subjectCode}</span>}
                      <span>•</span>
                      <span>
                        {isDayOrder && selectedClassModal.dayOrder
                          ? `${selectedClassModal.day} • Day Order ${selectedClassModal.dayOrder}`
                          : selectedClassModal.day}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedClassModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status & Time Details */}
              <div className="space-y-3">
                <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Session Status</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                        selectedClassModal.isCancelled
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : selectedClassModal.status === 'ongoing'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse'
                          : selectedClassModal.status === 'concluded'
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      }`}
                    >
                      {selectedClassModal.isCancelled
                        ? 'Cancelled'
                        : selectedClassModal.status === 'ongoing'
                        ? 'In Session'
                        : selectedClassModal.status === 'concluded'
                        ? 'Completed'
                        : selectedClassModal.type === 'rescheduled'
                        ? 'Rescheduled'
                        : 'Upcoming'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Class Timing</span>
                    <span className="font-mono font-bold text-white">
                      {selectedClassModal.startTime} – {selectedClassModal.endTime}
                    </span>
                  </div>

                  {selectedClassModal.room && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Classroom / Lab</span>
                      <span className="font-bold text-white">{selectedClassModal.room}</span>
                    </div>
                  )}

                  {selectedClassModal.instructor && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Instructor</span>
                      <span className="text-slate-200">{selectedClassModal.instructor}</span>
                    </div>
                  )}

                  {selectedClassModal.reason && (
                    <div className="pt-2 border-t border-white/5 text-[11px] text-purple-300">
                      Note: {selectedClassModal.reason}
                    </div>
                  )}
                </div>

                {/* Reminder Setting */}
                <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Bell className="w-4 h-4 text-amber-400" />
                    <span>Class Alert Reminder</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedClassModal.originalSlotId) {
                        onUpdateReminder(
                          selectedClassModal.subjectId,
                          selectedClassModal.originalSlotId,
                          !selectedClassModal.reminderEnabled,
                          selectedClassModal.reminderMinutes || 20
                        );
                        setSelectedClassModal(prev =>
                          prev ? { ...prev, reminderEnabled: !prev.reminderEnabled } : null
                        );
                      }
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedClassModal.reminderEnabled
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    {selectedClassModal.reminderEnabled ? 'Enabled (20m)' : 'Disabled'}
                  </button>
                </div>
              </div>

              {/* Attendance Quick Logger */}
              <div className="p-3.5 bg-white/[0.02] border border-white/5 rounded-xl space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                  Log Session Attendance
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onRecordAttendance(selectedClassModal.subjectId, true);
                      setSelectedClassModal(null);
                    }}
                    className="py-2 px-3 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark Present
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRecordAttendance(selectedClassModal.subjectId, false);
                      setSelectedClassModal(null);
                    }}
                    className="py-2 px-3 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Mark Absent
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    const occ = selectedClassModal;
                    setSelectedClassModal(null);
                    onOpenAddScheduleChange({
                      subjectId: occ.subjectId,
                      slotId: occ.originalSlotId,
                      date: todayStr,
                    });
                  }}
                  className="flex-1 py-2 px-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>↻</span> Reschedule Class
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const course = subjects.find(s => s.id === selectedClassModal.subjectId);
                    setSelectedClassModal(null);
                    if (course) onOpenAddScheduleModal(course);
                  }}
                  className="py-2 px-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Edit Recurring
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
