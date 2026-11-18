import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  PartyPopper,
  Clock,
  MapPin,
  CalendarX2,
  ArrowRight,
  CheckCircle2,
  Tag,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';
import {
  SubjectCourse,
  ScheduleException,
  HolidayRecord,
  TimetableSystem,
  formatDateToISO,
  formatDisplayDate,
  parseISODate,
  getClassOccurrencesForDate,
  getCurrentDayOfWeek,
  ClassOccurrence,
} from '../../lib/gpaCalculatorEngine';

interface AcademicCalendarViewProps {
  subjects: SubjectCourse[];
  exceptions: ScheduleException[];
  holidays: HolidayRecord[];
  timetableSystem?: TimetableSystem;
  onOpenAddException: (prefill?: { date?: string; subjectId?: string }) => void;
  onOpenAddHoliday: (prefillDate?: string) => void;
  onEditException: (exception: ScheduleException) => void;
  onEditHoliday: (holiday: HolidayRecord) => void;
  onRecordAttendance: (subjectId: string, attended: boolean, sessionId?: string) => void;
}

export function AcademicCalendarView({
  subjects,
  exceptions,
  holidays,
  timetableSystem = 'day_order',
  onOpenAddException,
  onOpenAddHoliday,
  onEditException,
  onEditHoliday,
  onRecordAttendance,
}: AcademicCalendarViewProps) {
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDateToISO(new Date()));

  const todayStr = formatDateToISO(new Date());

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  // First day of current month
  const firstDayOfMonth = new Date(year, month, 1);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday...
  // Normalize so Monday is column 0 (0 to 6)
  const mondayOffset = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;

  // Number of days in current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Previous month navigation
  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  // Next month navigation
  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  const handleGoToday = () => {
    setCurrentMonthDate(new Date());
    setSelectedDateStr(todayStr);
  };

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  // Compute occurrences for selected date
  const selectedDayResult = getClassOccurrencesForDate(
    selectedDateStr,
    subjects,
    exceptions,
    holidays,
    new Date(),
    undefined,
    timetableSystem
  );

  return (
    <div className="space-y-6">
      {/* Calendar Navigation & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {monthNames[month]} {year}
            </h3>
            <p className="text-xs text-slate-400">
              Interactive academic calendar with holidays & schedule exceptions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleGoToday}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-sky-400 hover:bg-slate-800 transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={() => onOpenAddException({ date: selectedDateStr })}
            className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-sky-500/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Schedule Change
          </button>
          <button
            type="button"
            onClick={() => onOpenAddHoliday(selectedDateStr)}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
          >
            <PartyPopper className="w-3.5 h-3.5" /> + Holiday
          </button>
        </div>
      </div>

      {/* Main Grid: Month Calendar (Left) & Day Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Month Calendar Matrix */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
          {/* Weekday Header */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span className="text-slate-500">Sat</span>
            <span className="text-slate-500">Sun</span>
          </div>

          {/* Calendar Day Tiles */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Blank tiles before the first day */}
            {Array.from({ length: mondayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[64px] sm:min-h-[76px] rounded-xl bg-slate-950/20" />
            ))}

            {/* Days of Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const cellDate = new Date(year, month, dayNum);
              const cellDateStr = formatDateToISO(cellDate);
              const isToday = cellDateStr === todayStr;
              const isSelected = cellDateStr === selectedDateStr;

              // Check if date has holiday or exceptions
              const holiday = holidays.find(h => h.date === cellDateStr);
              const dayExceptions = exceptions.filter(
                e => e.date === cellDateStr || e.newDate === cellDateStr
              );

              const hasCancelled = dayExceptions.some(e => e.type === 'cancelled');
              const hasRescheduled = dayExceptions.some(e => e.type === 'rescheduled_date');
              const hasExtra = dayExceptions.some(e => e.type === 'extra_class');
              const hasMovedTime = dayExceptions.some(e => e.type === 'moved_time');

              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => setSelectedDateStr(cellDateStr)}
                  className={`min-h-[64px] sm:min-h-[76px] p-1.5 sm:p-2 rounded-xl border text-left flex flex-col justify-between transition-all relative group ${
                    isSelected
                      ? 'bg-sky-500/15 border-sky-500 ring-1 ring-sky-500/50 shadow-md'
                      : isToday
                      ? 'bg-slate-950 border-sky-500/50 text-white'
                      : holiday
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-200'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-bold ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center text-[10px]'
                          : isSelected
                          ? 'text-sky-300 font-extrabold'
                          : 'text-slate-300'
                      }`}
                    >
                      {dayNum}
                    </span>

                    {holiday && (
                      <span title={holiday.name} className="text-[11px]">
                        🎉
                      </span>
                    )}
                  </div>

                  {/* Badges / Dots */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {holiday && (
                      <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 truncate max-w-full">
                        Holiday
                      </span>
                    )}
                    {hasCancelled && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Class Cancelled" />
                    )}
                    {hasRescheduled && (
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400" title="Rescheduled Class" />
                    )}
                    {hasExtra && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Extra Class" />
                    )}
                    {hasMovedTime && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Moved Class Time" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">🎉</span>
              <span>University Holiday</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Cancelled</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>Rescheduled</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Extra Class</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Moved Time</span>
            </div>
          </div>
        </div>

        {/* Day Detail Inspector Panel */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <div className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                <span>{formatDisplayDate(selectedDateStr, { includeDay: true })}</span>
                {timetableSystem === 'day_order' && selectedDayResult.dayOrder && (
                  <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-[10px]">
                    Day Order {selectedDayResult.dayOrder}
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-white mt-0.5">
                {selectedDayResult.isHoliday
                  ? `🎉 ${selectedDayResult.holiday?.name}`
                  : `Actual Schedule (${selectedDayResult.activeOccurrences.length} Classes)`}
              </h4>
            </div>

            <button
              type="button"
              onClick={() => onOpenAddException({ date: selectedDateStr })}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 border border-slate-700"
            >
              <Plus className="w-3.5 h-3.5 text-sky-400" /> Override
            </button>
          </div>

          {/* Holiday Banner if Date is a Holiday */}
          {selectedDayResult.isHoliday && selectedDayResult.holiday && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PartyPopper className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-sm text-emerald-200">
                    {selectedDayResult.holiday.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onEditHoliday(selectedDayResult.holiday!)}
                  className="text-xs text-emerald-400 hover:underline font-medium"
                >
                  Edit Holiday
                </button>
              </div>
              {selectedDayResult.holiday.description && (
                <p className="text-xs text-emerald-300/80">
                  {selectedDayResult.holiday.description}
                </p>
              )}
              <p className="text-[11px] text-emerald-400/90 italic">
                Regular weekly classes are marked as suspended for this holiday.
              </p>
            </div>
          )}

          {/* Occurrences List for Selected Date */}
          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {selectedDayResult.occurrences.length === 0 ? (
              <div className="p-6 bg-slate-950/60 border border-slate-800/80 rounded-xl text-center">
                <p className="text-xs text-slate-400 font-medium">
                  No classes scheduled on this day.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenAddException({ date: selectedDateStr })}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add extra or compensation class
                </button>
              </div>
            ) : (
              selectedDayResult.occurrences.map((occ, idx) => {
                const exceptionObj = occ.exceptionId
                  ? exceptions.find(e => e.id === occ.exceptionId)
                  : undefined;

                return (
                  <div
                    key={occ.id || idx}
                    className={`p-3.5 rounded-xl border transition-all ${
                      occ.isCancelled
                        ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                    style={{
                      borderLeftColor: occ.subjectColor || '#38bdf8',
                      borderLeftWidth: '4px',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-bold ${
                              occ.isCancelled ? 'line-through text-slate-400' : 'text-white'
                            }`}
                          >
                            {occ.subjectName}
                          </span>
                          {occ.subjectCode && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
                              {occ.subjectCode}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <span className="flex items-center gap-1 font-mono font-semibold text-slate-200">
                            <Clock className="w-3 h-3 text-sky-400" />
                            {occ.formattedTimeRange}
                          </span>
                          {occ.room && (
                            <span className="flex items-center gap-1 text-[11px]">
                              <MapPin className="w-3 h-3 text-slate-500" />
                              {occ.room}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-col items-end gap-1">
                        {occ.isCancelled ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300">
                            Cancelled
                          </span>
                        ) : occ.type === 'rescheduled' ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300">
                            Rescheduled
                          </span>
                        ) : occ.type === 'extra' ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                            Extra Class
                          </span>
                        ) : occ.type === 'moved_time' ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                            Moved Time
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                            Regular
                          </span>
                        )}

                        {exceptionObj && (
                          <button
                            type="button"
                            onClick={() => onEditException(exceptionObj)}
                            className="text-[10px] text-sky-400 hover:underline"
                          >
                            Edit Change
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Reason / Original info banner */}
                    {occ.reason && (
                      <div className="mt-2 text-[11px] px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{occ.reason}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
