import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  ArrowRight,
  PartyPopper,
  AlertCircle,
  Tag,
  RotateCw,
  Ban,
  CalendarClock,
  Trash2,
  Edit2,
  Filter,
} from 'lucide-react';
import {
  SubjectCourse,
  ScheduleException,
  HolidayRecord,
  DayOfWeek,
  DEFAULT_TEACHING_DAYS,
  TimetableSystem,
  formatDisplayDate,
  formatDateToISO,
  getCurrentDayOfWeek,
  parseISODate,
} from '../../lib/gpaCalculatorEngine';

interface ScheduleExceptionsManagerProps {
  subjects: SubjectCourse[];
  exceptions: ScheduleException[];
  holidays: HolidayRecord[];
  teachingDays?: DayOfWeek[];
  timetableSystem?: TimetableSystem;
  onOpenAddException: () => void;
  onOpenAddHoliday: () => void;
  onEditException: (exception: ScheduleException) => void;
  onEditHoliday: (holiday: HolidayRecord) => void;
  onDeleteException: (id: string) => void;
  onDeleteHoliday: (id: string) => void;
}

export function ScheduleExceptionsManager({
  subjects,
  exceptions,
  holidays,
  timetableSystem = 'day_order',
  onOpenAddException,
  onOpenAddHoliday,
  onEditException,
  onEditHoliday,
  onDeleteException,
  onDeleteHoliday,
}: ScheduleExceptionsManagerProps) {
  const [filterType, setFilterType] = useState<'all' | 'HOLIDAY' | 'SUSPENDED' | 'RESCHEDULED'>('all');

  // Split items
  const holidayItems = holidays.filter(
    h => h.changeType === 'HOLIDAY' || h.type === 'HOLIDAY' || h.strategy === 'postpone' || (!h.changeType && h.strategy !== 'cancel' && !h.noReplacement)
  );

  const suspendedItems = holidays.filter(
    h => h.changeType === 'SUSPENDED' || h.type === 'SUSPENDED' || h.strategy === 'cancel' || h.noReplacement
  );

  const rescheduledItems = exceptions.filter(
    ex => ex.changeType === 'RESCHEDULED' || ex.type === 'rescheduled_date' || (ex.classes && ex.classes.length > 0)
  );

  // Combine into a chronological unified list
  type UnifiedChangeItem =
    | { kind: 'HOLIDAY'; raw: HolidayRecord; date: string; title: string; subtitle: string; badge: string }
    | { kind: 'SUSPENDED'; raw: HolidayRecord; date: string; title: string; subtitle: string; badge: string }
    | { kind: 'RESCHEDULED'; raw: ScheduleException; date: string; title: string; subtitle: string; badge: string };

  const allItems: UnifiedChangeItem[] = [
    ...holidayItems.map(h => {
      const weekday = getCurrentDayOfWeek(parseISODate(h.date));
      const subtitle = timetableSystem === 'day_order'
        ? `${weekday} • Day Order ${h.originalDayOrder || 1} → carried forward${h.replacementDate ? ` to ${formatDisplayDate(h.replacementDate)} (${getCurrentDayOfWeek(parseISODate(h.replacementDate))})` : ''}`
        : `${weekday} · Classes cancelled for this day`;
      return {
        kind: 'HOLIDAY' as const,
        raw: h,
        date: h.date,
        title: h.name || 'University Holiday',
        subtitle,
        badge: 'Holiday',
      };
    }),
    ...suspendedItems.map(s => {
      const weekday = getCurrentDayOfWeek(parseISODate(s.date));
      const subtitle = timetableSystem === 'day_order'
        ? `${weekday} • Day Order ${s.dayOrder || s.originalDayOrder || 1} · Not carried forward`
        : `${weekday} · Classes cancelled for this day`;
      return {
        kind: 'SUSPENDED' as const,
        raw: s,
        date: s.date,
        title: s.reason || s.name || 'Classes Suspended',
        subtitle,
        badge: 'Suspended',
      };
    }),
    ...rescheduledItems.map(ex => {
      const sub = subjects.find(s => s.id === ex.subjectId);
      const subName = sub?.name || 'Class';
      const origTime = ex.originalStartTime || 'Scheduled time';
      const newTime = ex.newStartTime && ex.newEndTime ? `${ex.newStartTime} → ${ex.newEndTime}` : ex.newStartTime || '';
      const origDateObj = parseISODate(ex.originalDate || ex.date);
      const newDateObj = parseISODate(ex.newDate || ex.date);
      const origWd = getCurrentDayOfWeek(origDateObj).substring(0, 3);
      const newWd = getCurrentDayOfWeek(newDateObj).substring(0, 3);
      const origDateStr = `${origWd}, ${formatDisplayDate(ex.originalDate || ex.date, { shortMonth: true })}`;
      const newDateStr = `${newWd}, ${formatDisplayDate(ex.newDate || ex.date, { shortMonth: true })}`;

      return {
        kind: 'RESCHEDULED' as const,
        raw: ex,
        date: ex.originalDate || ex.date,
        title: subName,
        subtitle: `${origDateStr} ${origTime} → ${newDateStr} ${newTime}${ex.newRoom ? ` (${ex.newRoom})` : ''}`,
        badge: 'Rescheduled',
      };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const filteredItems = filterType === 'all' ? allItems : allItems.filter(i => i.kind === filterType);

  return (
    <div className="space-y-4">
      {/* Header & 3 Simple Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0b101f] border border-white/10 p-4 rounded-2xl shadow-xl">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-sky-400" />
            Schedule Changes
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Compact overview of university holidays, class suspensions, and individual rescheduled periods.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenAddHoliday}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>🎉</span>
            <span>+ Holiday</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddHoliday}
            className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>⛔</span>
            <span>+ Suspend Classes</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddException}
            className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>↻</span>
            <span>+ Reschedule Class</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 bg-black/40 border border-white/5 p-1 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setFilterType('all')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            filterType === 'all'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          All ({allItems.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterType('HOLIDAY')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
            filterType === 'HOLIDAY'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>🎉</span> Holidays ({holidayItems.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterType('SUSPENDED')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
            filterType === 'SUSPENDED'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>⛔</span> Suspended ({suspendedItems.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterType('RESCHEDULED')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
            filterType === 'RESCHEDULED'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>↻</span> Rescheduled ({rescheduledItems.length})
        </button>
      </div>

      {/* Compact List as specified in Requirement 10 */}
      <div className="bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl overflow-hidden divide-y divide-white/5">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No schedule changes recorded under this filter. Regular class timings apply.
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const dateFormatted = formatDisplayDate(item.date, { shortMonth: true, includeDay: false });

            return (
              <div
                key={`${item.kind}-${item.raw.id || idx}`}
                className="p-3.5 sm:px-5 sm:py-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                onClick={() => {
                  if (item.kind === 'RESCHEDULED') {
                    onEditException(item.raw as ScheduleException);
                  } else {
                    onEditHoliday(item.raw as HolidayRecord);
                  }
                }}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Icon badge */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm ${
                      item.kind === 'HOLIDAY'
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                        : item.kind === 'SUSPENDED'
                        ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                        : 'bg-purple-500/15 border border-purple-500/30 text-purple-300'
                    }`}
                  >
                    {item.kind === 'HOLIDAY' ? '🎉' : item.kind === 'SUSPENDED' ? '⛔' : '↻'}
                  </div>

                  {/* Main Information */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-400">
                        {dateFormatted}
                      </span>
                      <span className="text-xs font-bold text-white truncate">
                        {item.title}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.kind === 'HOLIDAY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : item.kind === 'SUSPENDED'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}
                      >
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                {/* Right Action buttons */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (item.kind === 'RESCHEDULED') {
                        onEditException(item.raw as ScheduleException);
                      } else {
                        onEditHoliday(item.raw as HolidayRecord);
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Edit Change"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (item.kind === 'RESCHEDULED') {
                        onDeleteException(item.raw.id);
                      } else {
                        onDeleteHoliday(item.raw.id);
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Delete / Restore"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
