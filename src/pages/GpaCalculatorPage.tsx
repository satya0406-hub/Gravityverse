import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calculator,
  Plus,
  Trash2,
  RotateCcw,
  AlertCircle,
  BookOpen,
  GraduationCap,
  Percent,
  Star,
  ExternalLink,
  Save,
  CheckCircle2,
  History,
  LogIn,
  Loader2,
  Settings,
  Scale,
  CalendarCheck,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  Bell,
  Check,
  X,
  Lock,
  Shield,
  ArrowRight,
  LayoutDashboard,
  Layers,
  CalendarClock,
  MoreHorizontal,
  CalendarX2,
} from 'lucide-react';
import { trackCustomEvent, trackGpa } from '../lib/analytics';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { Link, useNavigate, useLocation } from 'react-router-dom';

import {
  SubjectCourse,
  MarksComponent,
  GradeBand,
  GradingScalePreset,
  SemesterRecord,
  TimetableSlot,
  ScheduleException,
  HolidayRecord,
  DayOfWeek,
  TimetableSystem,
  formatTimetableDayHeader,
  DEFAULT_TEACHING_DAYS,
  getDefaultGradingScales,
  calculateOverallSgpa,
  calculateOverallCgpa,
  getEquivalentPercentageString,
  getTodaysClassSchedule,
  getClassOccurrencesForDate,
  formatDateToISO,
  formatDisplayDate,
  getAcademicDayOrderInfo,
  parseTimeToMinutes,
  getCurrentDayOfWeek,
} from '../lib/gpaCalculatorEngine';

import { SubjectMarksCard } from '../components/gpa/SubjectMarksCard';
import { GradingScaleModal } from '../components/gpa/GradingScaleModal';
import { AttendanceCalculatorCard } from '../components/gpa/AttendanceCalculatorCard';
import { CgpaAggregatorCard } from '../components/gpa/CgpaAggregatorCard';
import { TimetableScheduleCard } from '../components/gpa/TimetableScheduleCard';
import { AddScheduleModal } from '../components/gpa/AddScheduleModal';
import { ReminderPromptModal } from '../components/gpa/ReminderPromptModal';
import { AddSubjectModal } from '../components/gpa/AddSubjectModal';
import { ScheduleExceptionModal } from '../components/gpa/ScheduleExceptionModal';
import { TimetableSystemModal } from '../components/gpa/TimetableSystemModal';

// === SRM STUDENT REDIRECT LINK ===
const SRM_REDIRECT_URL = 'https://academia.srmist.edu.in/';
const STORAGE_KEY = 'gravityverse_gpa_plus_data_v3';

interface SavedGpaRecord {
  id: string;
  type: 'sgpa' | 'cgpa';
  score: number;
  scale: number;
  totalCredits: number;
  percentage: string;
  createdAt: number;
}

export function GpaCalculatorPage() {
  const { user, loading, loginWithGoogle, signingIn, authNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Active Main Navigation Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'academics' | 'timetable' | 'attendance' | 'cgpa'>('overview');

  // Active Grading Scale State
  const defaultPresets = getDefaultGradingScales();
  const [currentScalePresetId, setCurrentScalePresetId] = useState<string>('srm_ugc_10');
  const [scaleMax, setScaleMax] = useState<10 | 4>(10);
  const [activeGradeBands, setActiveGradeBands] = useState<GradeBand[]>(defaultPresets[0].bands);
  const [showGradingModal, setShowGradingModal] = useState<boolean>(false);

  // --- Subjects & Marks State ---
  const [subjects, setSubjects] = useState<SubjectCourse[]>([]);
  const [subjectNameInput, setSubjectNameInput] = useState('');
  const [subjectCreditsInput, setSubjectCreditsInput] = useState<number>(4);

  // Modals for Subject & Timetable Management
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [scheduleModalSubject, setScheduleModalSubject] = useState<SubjectCourse | null>(null);
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);
  const [reminderPromptData, setReminderPromptData] = useState<{
    subject: SubjectCourse;
    slots: TimetableSlot[];
  } | null>(null);

  // --- Multi-Semester CGPA State ---
  const [semesters, setSemesters] = useState<SemesterRecord[]>([]);

  // --- Schedule Exceptions & University Holidays State ---
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [teachingDays, setTeachingDays] = useState<DayOfWeek[]>(DEFAULT_TEACHING_DAYS);
  const [showScheduleExceptionModal, setShowScheduleExceptionModal] = useState<boolean>(false);
  const [scheduleExceptionPrefill, setScheduleExceptionPrefill] = useState<{
    date?: string;
    subjectId?: string;
    slotId?: string;
  } | null>(null);
  const [editingException, setEditingException] = useState<ScheduleException | null>(null);
  const [editingHoliday, setEditingHoliday] = useState<HolidayRecord | null>(null);

  // --- Attendance Calculator State ---
  const [attendanceConducted, setAttendanceConducted] = useState<number>(60);
  const [attendancePresent, setAttendancePresent] = useState<number>(52);
  const [attendanceTarget, setAttendanceTarget] = useState<number>(75);

  // --- Timetable System Configuration State ---
  const [timetableSystem, setTimetableSystem] = useState<TimetableSystem>('day_order');
  const [timetableSystemConfigured, setTimetableSystemConfigured] = useState<boolean>(false);
  const [showTimetableSystemModal, setShowTimetableSystemModal] = useState<boolean>(false);

  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // --- Reset & Confirmation Modals ---
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  // Persistence & Cloud Sync Notices
  const [saveNotice, setSaveNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Saved Cloud History
  const [savedRecords, setSavedRecords] = useState<SavedGpaRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Mathematical Transparency Expandable
  const [showSgpaFormula, setShowSgpaFormula] = useState(false);

  // Contextual 'More' Dropdown Menu State
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    if (moreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [moreMenuOpen]);

  // Pre-class banner notification (if a class is upcoming within reminder minutes)
  const [activeClassAlert, setActiveClassAlert] = useState<{
    subjectName: string;
    room?: string;
    startTime: string;
    minutesLeft: number;
  } | null>(null);

  // 1. Load data from localStorage on component mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.subjects && Array.isArray(parsed.subjects)) {
          setSubjects(parsed.subjects);
        }
        if (parsed.semesters && Array.isArray(parsed.semesters)) {
          setSemesters(parsed.semesters);
        }
        if (typeof parsed.attendanceConducted === 'number') {
          setAttendanceConducted(parsed.attendanceConducted);
        }
        if (typeof parsed.attendancePresent === 'number') {
          setAttendancePresent(parsed.attendancePresent);
        }
        if (typeof parsed.attendanceTarget === 'number') {
          setAttendanceTarget(parsed.attendanceTarget);
        }
        if (parsed.scaleMax) {
          setScaleMax(parsed.scaleMax);
        }
        if (parsed.currentScalePresetId) {
          setCurrentScalePresetId(parsed.currentScalePresetId);
        }
        if (parsed.activeGradeBands && Array.isArray(parsed.activeGradeBands)) {
          setActiveGradeBands(parsed.activeGradeBands);
        }
        if (parsed.exceptions && Array.isArray(parsed.exceptions)) {
          setExceptions(parsed.exceptions);
        }
        if (parsed.holidays && Array.isArray(parsed.holidays)) {
          setHolidays(parsed.holidays);
        }
        if (parsed.teachingDays && Array.isArray(parsed.teachingDays) && parsed.teachingDays.length > 0) {
          setTeachingDays(parsed.teachingDays);
        }
        if (parsed.timetableSystem === 'day_order' || parsed.timetableSystem === 'weekday') {
          setTimetableSystem(parsed.timetableSystem);
        }
        if (typeof parsed.timetableSystemConfigured === 'boolean') {
          setTimetableSystemConfigured(parsed.timetableSystemConfigured);
        }
      } else {
        // Initial default subjects with realistic marks components and class timetable
        setSubjects([
          {
            id: 'sub-demo-1',
            name: 'Computer Networks',
            code: '21CSC302J',
            credits: 4,
            color: '#38bdf8',
            evaluationMode: 'components',
            components: [
              { id: 'c1', name: 'FA 1 (Theory)', obtainedMarks: 15, maximumMarks: 20, isScaled: false },
              { id: 'c2', name: 'FA 2 (Packet Tracer Lab)', obtainedMarks: 17, maximumMarks: 20, isScaled: false },
              { id: 'c3', name: 'FT (Mid-Sem Test)', obtainedMarks: 40, maximumMarks: 50, isScaled: true, scaledMaximum: 15 },
              { id: 'c4', name: 'End Semester Exam', obtainedMarks: 70, maximumMarks: 100, isScaled: true, scaledMaximum: 50 },
            ],
            attendance: {
              conducted: 24,
              present: 21,
            },
            timetable: [
              {
                id: 'slot-1',
                subjectId: 'sub-demo-1',
                day: 'Monday',
                startTime: '10:00 AM',
                endTime: '11:00 AM',
                room: 'Room 204',
                instructor: 'Prof. Ramanathan',
                reminderEnabled: true,
                reminderMinutes: 20,
              },
              {
                id: 'slot-2',
                subjectId: 'sub-demo-1',
                day: 'Wednesday',
                startTime: '10:00 AM',
                endTime: '11:00 AM',
                room: 'Room 204',
                instructor: 'Prof. Ramanathan',
                reminderEnabled: true,
                reminderMinutes: 20,
              },
              {
                id: 'slot-3',
                subjectId: 'sub-demo-1',
                day: 'Friday',
                startTime: '02:00 PM',
                endTime: '03:00 PM',
                room: 'Lab 3 (Tech Park)',
                instructor: 'Prof. Ramanathan',
                reminderEnabled: true,
                reminderMinutes: 20,
              },
            ],
          },
          {
            id: 'sub-demo-2',
            name: 'Database Management Systems',
            code: '21CSC303J',
            credits: 3,
            color: '#a855f7',
            evaluationMode: 'components',
            components: [
              { id: 'd1', name: 'Internal Test', obtainedMarks: 45, maximumMarks: 50, isScaled: true, scaledMaximum: 25 },
              { id: 'd2', name: 'SQL Query Practical', obtainedMarks: 23, maximumMarks: 25, isScaled: false },
              { id: 'd3', name: 'End Semester Exam', obtainedMarks: 82, maximumMarks: 100, isScaled: true, scaledMaximum: 50 },
            ],
            attendance: {
              conducted: 20,
              present: 18,
            },
            timetable: [
              {
                id: 'slot-4',
                subjectId: 'sub-demo-2',
                day: 'Tuesday',
                startTime: '11:00 AM',
                endTime: '12:00 PM',
                room: 'TP-401',
                instructor: 'Dr. Priya S.',
                reminderEnabled: true,
                reminderMinutes: 20,
              },
              {
                id: 'slot-5',
                subjectId: 'sub-demo-2',
                day: 'Thursday',
                startTime: '11:00 AM',
                endTime: '12:00 PM',
                room: 'TP-401',
                instructor: 'Dr. Priya S.',
                reminderEnabled: true,
                reminderMinutes: 20,
              },
            ],
          },
        ]);

        setSemesters([
          { id: 'sem-1', semesterName: 'Semester 1', sgpa: 8.8, totalCredits: 22 },
          { id: 'sem-2', semesterName: 'Semester 2', sgpa: 9.1, totalCredits: 24 },
        ]);

        // Demo holiday
        setHolidays([
          {
            id: 'hol-1',
            date: '2026-10-02',
            name: 'Gandhi Jayanti',
            description: 'National holiday. University classes suspended.',
            strategy: 'cancel',
            createdAt: Date.now(),
          },
        ]);
      }
    } catch (err) {
      console.warn('Could not read GPA data from localStorage:', err);
    }
  }, []);

  // 2. Persist state to localStorage on changes
  useEffect(() => {
    try {
      const payload = {
        subjects,
        semesters,
        exceptions,
        holidays,
        teachingDays,
        attendanceConducted,
        attendancePresent,
        attendanceTarget,
        scaleMax,
        currentScalePresetId,
        activeGradeBands,
        timetableSystem,
        timetableSystemConfigured,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to save GPA data to localStorage:', err);
    }
  }, [
    subjects,
    semesters,
    exceptions,
    holidays,
    teachingDays,
    attendanceConducted,
    attendancePresent,
    attendanceTarget,
    scaleMax,
    currentScalePresetId,
    activeGradeBands,
    timetableSystem,
    timetableSystemConfigured,
  ]);

  // Compute SGPA live from current subjects
  const sgpaMetrics = calculateOverallSgpa(subjects, activeGradeBands);
  const cgpaResult = calculateOverallCgpa(semesters);
  const todayDateStr = formatDateToISO(currentTime);
  const todayScheduleResult = getClassOccurrencesForDate(
    todayDateStr,
    subjects,
    exceptions,
    holidays,
    currentTime,
    teachingDays,
    timetableSystem
  );

  // Monitor upcoming classes for pre-class reminder banner using Master Occurrence Engine
  useEffect(() => {
    const checkUpcomingClasses = () => {
      const now = new Date();
      const todayStr = formatDateToISO(now);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      // Master engine evaluates exceptions, cancellations, holidays, moved times, and extra classes
      const todayResult = getClassOccurrencesForDate(
        todayStr,
        subjects,
        exceptions,
        holidays,
        now,
        teachingDays,
        timetableSystem
      );

      // If today is a holiday, no class alerts should trigger
      if (todayResult.isHoliday) {
        setActiveClassAlert(null);
        return;
      }

      // Check each active non-cancelled class
      for (const occ of todayResult.activeOccurrences) {
        if (!occ.reminderEnabled) continue;

        const startMin = occ.startMinutes;
        const diff = startMin - currentMinutes;

        // If class starts within the reminder window (1 to reminderMinutes)
        const threshold = occ.reminderMinutes || 20;
        if (diff > 0 && diff <= threshold) {
          setActiveClassAlert({
            subjectName: occ.subjectName,
            room: occ.room,
            startTime: occ.formattedTimeRange.split(' – ')[0] || 'Upcoming',
            minutesLeft: diff,
          });
          return;
        }
      }
      setActiveClassAlert(null);
    };

    checkUpcomingClasses();
    const interval = setInterval(checkUpcomingClasses, 30000);
    return () => clearInterval(interval);
  }, [subjects, exceptions, holidays, timetableSystem]);

  // Quick subject add from marks tab form
  const handleQuickAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const name = subjectNameInput.trim() || `Subject ${subjects.length + 1}`;
    const credits = Math.max(1, Number(subjectCreditsInput) || 3);

    const newSubject: SubjectCourse = {
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      name,
      credits,
      evaluationMode: 'components',
      components: [
        {
          id: 'comp-' + Date.now(),
          name: 'Internal Assessment',
          obtainedMarks: 40,
          maximumMarks: 50,
          isScaled: true,
          scaledMaximum: 20,
        },
        {
          id: 'comp-' + (Date.now() + 1),
          name: 'End Semester Exam',
          obtainedMarks: 80,
          maximumMarks: 100,
          isScaled: true,
          scaledMaximum: 50,
        },
      ],
      attendance: {
        conducted: 0,
        present: 0,
      },
      timetable: [],
    };

    setSubjects([...subjects, newSubject]);
    setSubjectNameInput('');

    // Open schedule modal directly for user convenience
    setScheduleModalSubject(newSubject);

    try {
      trackGpa.courseAdded(newSubject.name, newSubject.credits, 10);
    } catch (e) {
      console.warn('Analytics courseAdded failed:', e);
    }
  };

  // Full Subject Modal Creator with Schedule Option
  const handleSubjectCreated = (newSubject: SubjectCourse, openScheduleAfter: boolean) => {
    setSubjects(prev => [...prev, newSubject]);
    if (openScheduleAfter) {
      setScheduleModalSubject(newSubject);
    }
    try {
      trackGpa.courseAdded(newSubject.name, newSubject.credits, 10);
    } catch (e) {
      console.warn(e);
    }
  };

  // Update a single subject's entire object
  const handleUpdateSubject = (updated: SubjectCourse) => {
    setSubjects(subjects.map(s => (s.id === updated.id ? updated : s)));
  };

  const handleDeleteSubject = (id: string) => {
    trackGpa.courseRemoved(id);
    setSubjects(subjects.filter(s => s.id !== id));
  };

  // Handle schedule modal save
  const handleSaveSubjectSchedule = (
    subjectId: string,
    slots: TimetableSlot[],
    promptReminder: boolean
  ) => {
    const targetSubject = subjects.find(s => s.id === subjectId);
    if (!targetSubject) return;

    const updated = {
      ...targetSubject,
      timetable: slots,
    };
    handleUpdateSubject(updated);

    if (promptReminder && slots.length > 0) {
      setReminderPromptData({ subject: updated, slots });
    }
  };

  // Handle reminder modal confirmation
  const handleConfirmReminder = (reminderMinutes: number) => {
    if (!reminderPromptData) return;
    const { subject, slots } = reminderPromptData;

    const updatedSlots: TimetableSlot[] = slots.map(slot => ({
      ...slot,
      reminderEnabled: true,
      reminderMinutes,
    }));

    handleUpdateSubject({
      ...subject,
      timetable: updatedSlots,
    });

    setReminderPromptData(null);
    setSaveNotice({
      message: `Reminders enabled! You'll be notified ${reminderMinutes} minutes before each class of ${subject.name}.`,
      type: 'success',
    });
  };

  // Record Attendance for a subject from Timetable or Attendance View
  // "DO NOT automatically mark attendance merely because a timetable event occurred. Only update attendance after the user explicitly chooses Present or Absent."
  const handleRecordAttendance = (subjectId: string, attended: boolean, sessionId?: string) => {
    setSubjects(prevSubjects =>
      prevSubjects.map(sub => {
        if (sub.id !== subjectId) return sub;

        const currentConducted = sub.attendance?.conducted || 0;
        const currentPresent = sub.attendance?.present || 0;
        const newConducted = currentConducted + 1;
        const newPresent = attended ? currentPresent + 1 : currentPresent;

        return {
          ...sub,
          attendance: {
            conducted: newConducted,
            present: newPresent,
            lastLoggedDate: new Date().toISOString(),
          },
        };
      })
    );

    // Also update global totals
    setAttendanceConducted(prev => prev + 1);
    if (attended) {
      setAttendancePresent(prev => prev + 1);
    }

    const sub = subjects.find(s => s.id === subjectId);
    setSaveNotice({
      message: `Recorded ${attended ? 'Present (+1)' : 'Absent'} for ${sub?.name || 'Subject'}.`,
      type: attended ? 'success' : 'info',
    });
  };

  // Update specific subject's raw attendance numbers
  const handleUpdateSubjectAttendance = (subjectId: string, conducted: number, present: number) => {
    setSubjects(prevSubjects =>
      prevSubjects.map(sub => {
        if (sub.id !== subjectId) return sub;
        return {
          ...sub,
          attendance: {
            ...sub.attendance,
            conducted: Math.max(0, conducted),
            present: Math.max(0, Math.min(conducted, present)),
          },
        };
      })
    );
  };

  // Schedule Exception & Holiday Handlers
  const handleOpenAddScheduleChange = (prefill?: { date?: string; subjectId?: string; slotId?: string }) => {
    setEditingException(null);
    setEditingHoliday(null);
    setScheduleExceptionPrefill(prefill || null);
    setShowScheduleExceptionModal(true);
  };

  const handleOpenAddHoliday = (prefillDate?: string) => {
    setEditingException(null);
    setEditingHoliday(null);
    setScheduleExceptionPrefill({ date: prefillDate });
    setShowScheduleExceptionModal(true);
  };

  const handleEditException = (exception: ScheduleException) => {
    setEditingException(exception);
    setEditingHoliday(null);
    setScheduleExceptionPrefill(null);
    setShowScheduleExceptionModal(true);
  };

  const handleEditHoliday = (holiday: HolidayRecord) => {
    setEditingHoliday(holiday);
    setEditingException(null);
    setScheduleExceptionPrefill(null);
    setShowScheduleExceptionModal(true);
  };

  const handleSaveException = (
    exceptionData: Omit<ScheduleException, 'id' | 'createdAt'>,
    exceptionId?: string
  ) => {
    if (exceptionId) {
      // Update existing
      setExceptions(prev =>
        prev.map(ex =>
          ex.id === exceptionId
            ? { ...ex, ...exceptionData }
            : ex
        )
      );
      setSaveNotice({
        message: 'Schedule exception updated successfully.',
        type: 'success',
      });
    } else {
      // Add new
      const newException: ScheduleException = {
        id: 'exc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
        createdAt: Date.now(),
        ...exceptionData,
      };
      setExceptions(prev => [...prev, newException]);
      setSaveNotice({
        message: 'Schedule change applied for this specific date.',
        type: 'success',
      });
    }
  };

  const handleSaveHoliday = (
    holidayData: Omit<HolidayRecord, 'id' | 'createdAt'>,
    holidayId?: string
  ) => {
    if (holidayId) {
      setHolidays(prev =>
        prev.map(h =>
          h.id === holidayId
            ? { ...h, ...holidayData }
            : h
        )
      );
      setSaveNotice({
        message: 'Holiday updated successfully.',
        type: 'success',
      });
    } else {
      const newHoliday: HolidayRecord = {
        id: 'hol-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
        createdAt: Date.now(),
        ...holidayData,
      };
      setHolidays(prev => [...prev, newHoliday]);
      setSaveNotice({
        message: `Holiday "${newHoliday.name}" registered. Regular classes will be suspended on this date.`,
        type: 'success',
      });
    }
  };

  const handleDeleteException = (id: string) => {
    setExceptions(prev => prev.filter(ex => ex.id !== id));
    setSaveNotice({
      message: 'Schedule exception removed. Normal weekly schedule restored.',
      type: 'info',
    });
  };

  const handleDeleteHoliday = (id: string) => {
    setHolidays(prev => prev.filter(h => h.id !== id));
    setSaveNotice({
      message: 'Holiday removed.',
      type: 'info',
    });
  };

  const handleClearAllData = () => {
    setSubjects([]);
    setSemesters([]);
    setExceptions([]);
    setHolidays([]);
    setAttendanceConducted(0);
    setAttendancePresent(0);
    setShowClearConfirmModal(false);
    localStorage.removeItem(STORAGE_KEY);
    setSaveNotice({ message: 'All local GPA+ courses and schedules have been reset.', type: 'info' });
  };

  // Handlers for Semesters (CGPA)
  const handleAddSemester = (sem?: Omit<SemesterRecord, 'id'>) => {
    const nextSemNumber = semesters.length + 1;
    const newSem: SemesterRecord = {
      id: 'sem-' + Date.now(),
      semesterName: sem?.semesterName || `Semester ${nextSemNumber}`,
      sgpa: sem?.sgpa ?? (sgpaMetrics.sgpa > 0 ? Number(sgpaMetrics.sgpa.toFixed(2)) : 8.0),
      totalCredits: sem?.totalCredits ?? (sgpaMetrics.totalCredits > 0 ? sgpaMetrics.totalCredits : 20),
    };
    setSemesters(prev => [...prev, newSem]);
    try {
      trackGpa.semAdded(newSem.semesterName, newSem.sgpa, newSem.totalCredits);
    } catch (e) {
      console.warn(e);
    }
  };

  const handleRemoveSemester = (id: string) => {
    setSemesters(semesters.filter(s => s.id !== id));
  };

  const handleClearSemesters = () => {
    setSemesters([]);
  };

  // Scale preset selection
  const handleSelectPreset = (preset: GradingScalePreset) => {
    setCurrentScalePresetId(preset.id);
    setScaleMax(preset.scaleMax);
    setActiveGradeBands(preset.bands);
    trackGpa.scaleChanged(preset.scaleMax);
  };

  const handleSaveCustomBands = (bands: GradeBand[], newScaleMax: 10 | 4) => {
    setCurrentScalePresetId('custom');
    setScaleMax(newScaleMax);
    setActiveGradeBands(bands);
    trackGpa.scaleChanged(newScaleMax);
  };

  // Fetch Cloud Saved records for authenticated users
  const fetchSavedRecords = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const q = query(collection(db, 'users', user.uid, 'gpa_records'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const list: SavedGpaRecord[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as SavedGpaRecord);
      });
      setSavedRecords(list);
    } catch (err) {
      console.warn('Could not load saved GPA records:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSavedRecords();
    } else {
      setSavedRecords([]);
    }
  }, [user]);

  // Cloud Save Action
  const handleSaveGpaRecord = async (type: 'sgpa' | 'cgpa') => {
    setSaveNotice(null);

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    const score = type === 'sgpa' ? sgpaMetrics.sgpa : calculateOverallCgpa(semesters).cgpa;
    const totalCredits = type === 'sgpa' ? sgpaMetrics.totalCredits : calculateOverallCgpa(semesters).totalCredits;

    if (totalCredits === 0) {
      setSaveNotice({ message: 'Please add subjects or semester credits before saving.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'gpa_records'), {
        type,
        score: Number(score.toFixed(2)),
        scale: scaleMax,
        totalCredits,
        percentage: getEquivalentPercentageString(score, scaleMax),
        createdAt: Date.now(),
      });

      trackGpa.recordSaved(type, Number(score.toFixed(2)), totalCredits);

      setSaveNotice({
        message: `Your ${type.toUpperCase()} result (${score.toFixed(2)} / ${scaleMax.toFixed(1)}) saved successfully to your cloud profile!`,
        type: 'success',
      });
      fetchSavedRecords();
    } catch (err: any) {
      setSaveNotice({ message: 'Failed to save GPA record: ' + (err.message || err), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'gpa_records', recordId));
      setSavedRecords(savedRecords.filter(r => r.id !== recordId));
      setSaveNotice({ message: 'Record deleted from your cloud profile.', type: 'info' });
    } catch (err) {
      console.warn('Error deleting record:', err);
    }
  };

  // 1. Loading State Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col items-center justify-center p-6 pt-24 relative">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-blue/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-blue/10 border border-brand-blue/30 flex items-center justify-center shadow-xl shadow-blue-500/20 animate-pulse">
            <Calculator className="w-8 h-8 text-brand-blue" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-serif font-bold text-white">Loading GPA+ Suite</h3>
            <p className="text-xs text-slate-400">Verifying session credentials...</p>
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-brand-blue mt-2" />
        </div>
      </div>
    );
  }

  // 2. Mandatory Authentication Gate Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-100 pt-28 pb-24 px-4 sm:px-6 relative selection:bg-brand-blue selection:text-white">
        {/* Ambient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-brand-blue/10 rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-2xl mx-auto z-10 relative"
        >
          {/* Main Auth Gate Card */}
          <div className="bg-[#0b0f1a]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
            {/* Top Badge & Lock Icon */}
            <div className="text-center space-y-4 mb-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold">
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In Required</span>
              </div>

              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-brand-blue/20 via-slate-900 to-purple-600/20 border border-brand-blue/30 flex items-center justify-center shadow-xl shadow-blue-500/15">
                <Calculator className="w-10 h-10 text-brand-blue" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-serif font-black text-white tracking-tight">
                  Sign In to Access GravityVerse GPA+
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                  GPA+ is a persistent academic intelligence suite. To safeguard your curriculum marks, timetable schedule, attendance records, and multi-semester CGPA forecasts across devices, sign in to your GravityVerse account.
                </p>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-brand-blue/10 text-brand-blue shrink-0">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Component Scaling</h4>
                  <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                    Weight FA, FT, internal labs, and end-sem marks to exact SGPA grade points.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Schedule Exceptions</h4>
                  <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                    Weekly timetables, holiday postponement strategies, and conflict detection.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Attendance Forecast</h4>
                  <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                    Compute required classes or safe bunks to satisfy university 75% thresholds.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Cloud Profile Sync</h4>
                  <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                    Safe persistence across sessions and seamless sync with your GravityVerse profile.
                  </p>
                </div>
              </div>
            </div>

            {/* Auth Notices */}
            {authNotice && (
              <div className="p-3.5 rounded-2xl mb-6 bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">{authNotice}</p>
              </div>
            )}

            {/* Auth Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={loginWithGoogle}
                disabled={signingIn}
                type="button"
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-3 shadow-lg shadow-white/5 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {signingIn ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>{signingIn ? 'Authenticating...' : 'Continue with Google (1-Click)'}</span>
              </button>

              <Link
                to="/login"
                state={{ from: location }}
                className="w-full py-3.5 px-4 bg-brand-blue hover:bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all text-center block"
              >
                <span>Sign In or Register with Email</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Bottom Auxiliary Links */}
            <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
              <Link to="/" className="hover:text-white transition-colors flex items-center gap-1.5">
                <span>← Back to Home</span>
              </Link>
              <a
                href={SRM_REDIRECT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-blue transition-colors flex items-center gap-1"
              >
                <span>SRM Academia Portal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 pt-20 sm:pt-28 pb-32 sm:pb-36 selection:bg-brand-blue selection:text-white relative overflow-x-hidden w-full max-w-full">
      {/* Background Decorative Lighting */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-blue/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-96 h-96 bg-purple-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 relative z-10 w-full min-w-0">
        {/* Top Header: Simple, refined academic branding & utilities */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10 w-full min-w-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-black text-white tracking-tight">
              GPA+
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Your Academic Dashboard
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap w-full sm:w-auto">
            {/* Cloud History */}
            <button
              onClick={() => {
                if (!user) setShowAuthModal(true);
                else setShowHistory(true);
              }}
              className="h-9 px-2.5 sm:px-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer"
              title="View Cloud GPA History"
            >
              <History className="w-3.5 h-3.5 text-brand-blue" />
              <span>Cloud History</span>
              {savedRecords.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-brand-blue/20 text-brand-blue text-[10px] font-mono">
                  {savedRecords.length}
                </span>
              )}
            </button>

            {/* University Grading Scale Modal */}
            <button
              onClick={() => setShowGradingModal(true)}
              className="h-9 px-2.5 sm:px-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] sm:text-xs font-semibold text-slate-200 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer"
              title="University Grading Scale & Letter Bands"
            >
              <Scale className="w-3.5 h-3.5 text-brand-blue" />
              <span>Grading Scale ({scaleMax}.0)</span>
            </button>

            {/* Contextual / Settings 'More' Options Dropdown */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(prev => !prev)}
                className={`h-9 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  moreMenuOpen
                    ? 'bg-white/15 border-white/30 text-white'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
                }`}
                title="Academic Settings & Tools"
                aria-expanded={moreMenuOpen}
              >
                <MoreHorizontal className="w-4 h-4" />
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${moreMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {moreMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 bg-[#0b101f] border border-white/15 rounded-2xl shadow-2xl p-1.5 z-50 space-y-0.5 text-xs text-white"
                  >
                    {/* Timetable System Setup */}
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setShowTimetableSystemModal(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <CalendarClock className="w-4 h-4 text-purple-400" />
                      <span>Timetable System Setup</span>
                    </button>

                    {/* SRM Academia Portal */}
                    <a
                      href={SRM_REDIRECT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer block"
                    >
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                      <span>SRM Academia Portal</span>
                    </a>

                    {/* Divider before destructive action */}
                    <div className="border-t border-white/10 my-1" />

                    {/* Destructive Clear All Data */}
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setShowClearConfirmModal(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 flex items-center gap-2.5 transition-colors cursor-pointer font-bold"
                    >
                      <RotateCcw className="w-4 h-4 text-rose-400" />
                      <span>Reset All GPA+ Data</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* SRM Academia External Link */}
            <a
              href={SRM_REDIRECT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-2.5 sm:px-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>SRM Academia</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>
        </div>

        {/* Pre-class Active Reminder Alert Banner */}
        {activeClassAlert && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 bg-brand-blue/15 border border-brand-blue/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xl"
          >
            <div className="flex items-center gap-2.5 text-white font-medium">
              <div className="w-8 h-8 rounded-xl bg-brand-blue/20 border border-brand-blue/40 flex items-center justify-center text-brand-blue shrink-0">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <span className="font-bold text-brand-blue uppercase text-[10px] tracking-wider block">
                  Upcoming Class Reminder
                </span>
                <span>
                  <strong>{activeClassAlert.subjectName}</strong> starts in {activeClassAlert.minutesLeft} mins at{' '}
                  <strong className="text-white">{activeClassAlert.startTime}</strong>
                  {activeClassAlert.room && ` (${activeClassAlert.room})`}.
                </span>
              </div>
            </div>
            <button
              onClick={() => setActiveClassAlert(null)}
              className="text-slate-400 hover:text-white text-xs px-2.5 py-1 bg-black/40 rounded-lg cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}

        {/* GPA+ Main Navigation Tabs - Pure Navigation Only */}
        <div className="p-1 sm:p-1.5 bg-[#0b101f]/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl w-full overflow-hidden">
          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 px-0.5 w-full" aria-label="GPA+ Sections">
            {[
              { id: 'overview', label: 'Overview', icon: LayoutDashboard },
              { id: 'academics', label: 'Academics', icon: Calculator },
              { id: 'timetable', label: 'Timetable', icon: Calendar },
              { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
              { id: 'cgpa', label: 'CGPA', icon: Star },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setMoreMenuOpen(false);
                  }}
                  className={`flex-1 min-w-[84px] sm:min-w-[110px] h-10 px-2.5 sm:px-4 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 sm:shrink ${
                    isActive
                      ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/25'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Timetable System Setup Prompt Banner (Shown on Overview only when configuration is uncompleted) */}
        {!timetableSystemConfigured && activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 sm:p-5 bg-gradient-to-r from-sky-500/15 via-purple-500/15 to-transparent border border-sky-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl shadow-sky-500/5"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Timetable System Setup
                  </h4>
                  <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-extrabold uppercase border border-sky-500/30">
                    Configuration Available
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Select your university format: <strong className="text-sky-300">Day Order (Day 1, 2, 3...)</strong> for cyclical universities like SRM, or <strong className="text-purple-300">Weekday (Monday–Sunday)</strong> for standard schedules.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowTimetableSystemModal(true)}
                className="px-4 py-2.5 bg-gradient-to-r from-brand-blue to-purple-600 hover:opacity-90 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-brand-blue/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                <span>Choose Timetable System</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Save Notice Alert Banner */}
        {saveNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
              saveNotice.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-300'
                : saveNotice.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{saveNotice.message}</span>
            </div>
            <button
              onClick={() => setSaveNotice(null)}
              className="text-slate-400 hover:text-white font-bold text-xs px-2 cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}

        {/* Main Workspaces according to Active Tab */}
        <AnimatePresence mode="wait">
          {/* 1. OVERVIEW WORKSPACE (Default Dashboard) */}
          {activeTab === 'overview' && (
            <motion.div
              key="tab-overview"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Dashboard Intro Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/5">
                <div>
                  <h2 className="text-xl sm:text-2xl font-serif font-black text-white tracking-tight">
                    Academic Dashboard
                  </h2>
                  <p className="text-xs text-slate-400">
                    Live overview of your grades, today&apos;s lectures, and attendance performance.
                  </p>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  {formatDisplayDate(formatDateToISO(new Date()), { includeDay: true })}
                </div>
              </div>

              {/* 4 Compact Academic Summary Cards (Single column on mobile, 2 on tablet, 4 on desktop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                {/* CGPA */}
                <div
                  onClick={() => setActiveTab('cgpa')}
                  className="p-4 bg-[#0b101f] border border-white/10 rounded-2xl hover:border-emerald-500/40 transition-all cursor-pointer group shadow-lg"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">Current CGPA</span>
                    <Star className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-black text-white">
                    {semesters.length > 0 ? cgpaResult.cgpa.toFixed(2) : (sgpaMetrics.sgpa > 0 ? sgpaMetrics.sgpa.toFixed(2) : '7.50')}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                    {semesters.length > 0 ? `${semesters.length} Semesters Recorded` : `Cumulative / ${scaleMax}.0 Scale`}
                  </span>
                </div>

                {/* SGPA */}
                <div
                  onClick={() => setActiveTab('academics')}
                  className="p-4 bg-[#0b101f] border border-white/10 rounded-2xl hover:border-brand-blue/40 transition-all cursor-pointer group shadow-lg"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">Current SGPA</span>
                    <Calculator className="w-3.5 h-3.5 text-brand-blue group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-black text-white">
                    {sgpaMetrics.sgpa > 0 ? sgpaMetrics.sgpa.toFixed(2) : '8.04'}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                    {sgpaMetrics.totalCredits > 0 ? `${sgpaMetrics.totalCredits} Credits Enrolled` : `Active Term / ${scaleMax}.0 Scale`}
                  </span>
                </div>

                {/* Attendance */}
                <div
                  onClick={() => setActiveTab('attendance')}
                  className="p-4 bg-[#0b101f] border border-white/10 rounded-2xl hover:border-purple-500/40 transition-all cursor-pointer group shadow-lg"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">Attendance</span>
                    <CalendarCheck className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-black text-white">
                    {attendanceConducted > 0
                      ? `${Math.round((attendancePresent / attendanceConducted) * 100)}%`
                      : '84%'}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                    Target: {attendanceTarget}% Threshold
                  </span>
                </div>

                {/* Timetable System Status Card */}
                <div
                  onClick={() => setActiveTab('timetable')}
                  className="p-4 bg-[#0b101f] border border-white/10 rounded-2xl hover:border-sky-500/40 transition-all cursor-pointer group shadow-lg"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">
                      {timetableSystem === 'day_order' ? "Today's Day Order" : "Today's Schedule"}
                    </span>
                    {timetableSystem === 'day_order' ? (
                      <Layers className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                    ) : (
                      <Calendar className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
                    )}
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-black text-white truncate">
                    {todayScheduleResult.isHoliday
                      ? 'Holiday'
                      : todayScheduleResult.isSuspended
                      ? 'Suspended'
                      : timetableSystem === 'day_order'
                      ? (todayScheduleResult.dayOrder ? `DO ${todayScheduleResult.dayOrder}` : 'Day Order')
                      : getCurrentDayOfWeek(currentTime)}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 block truncate">
                    {todayScheduleResult.isHoliday
                      ? todayScheduleResult.holiday?.name || 'Classes cancelled'
                      : todayScheduleResult.isSuspended
                      ? 'Suspended (no replacement)'
                      : timetableSystem === 'day_order'
                      ? `${getCurrentDayOfWeek(currentTime)} • ${todayScheduleResult.isPostponedDay ? 'Carried Forward ↻' : 'Day Order System'}`
                      : `${todayScheduleResult.activeOccurrences.length} Classes • Mon–Sun`}
                  </span>
                </div>
              </div>

              {/* TODAY'S CLASSES (PROMINENT SECTION) */}
              <div className="p-6 bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Today&apos;s Classes
                    </span>
                    <h3 className="text-base font-bold text-white flex items-center gap-2 mt-0.5 flex-wrap">
                      <span>{formatDisplayDate(formatDateToISO(new Date()), { includeDay: true })}</span>
                      {timetableSystem === 'day_order' && todayScheduleResult.dayOrder ? (
                        <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-mono font-bold">
                          Day Order {todayScheduleResult.dayOrder}
                        </span>
                      ) : null}
                    </h3>
                  </div>

                  <span className="text-xs text-slate-400 font-mono">
                    {todayScheduleResult.activeOccurrences.length} classes scheduled
                  </span>
                </div>

                {/* Holiday or Suspended banner if active today */}
                {todayScheduleResult.isHoliday && todayScheduleResult.holiday && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎉</span>
                      <span>
                        <strong>{todayScheduleResult.holiday.name}:</strong> Classes cancelled.{' '}
                        {timetableSystem === 'day_order'
                          ? 'Day order carried forward to next working day.'
                          : 'Weekly schedule resumes on next scheduled weekday.'}
                      </span>
                    </div>
                  </div>
                )}

                {todayScheduleResult.isSuspended && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⛔</span>
                      <span>
                        Classes suspended today.{' '}
                        {timetableSystem === 'day_order'
                          ? "This day's order is not carried forward."
                          : 'Classes will resume on the next scheduled weekday.'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Classes List */}
                {todayScheduleResult.occurrences.length === 0 ? (
                  <div className="py-10 text-center rounded-xl bg-black/20 border border-white/5 space-y-1.5">
                    <p className="text-sm font-bold text-slate-300">No classes scheduled for today</p>
                    <p className="text-xs text-slate-500">
                      Enjoy your free day or configure subjects and timetable periods.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {todayScheduleResult.occurrences.map(occ => {
                      return (
                        <div
                          key={occ.id}
                          className={`p-3.5 sm:px-5 sm:py-4 bg-black/30 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                            occ.status === 'ongoing'
                              ? 'border-emerald-500/50 bg-emerald-950/10 shadow-lg shadow-emerald-500/10'
                              : 'border-white/5 hover:border-white/15'
                          }`}
                          style={{
                            borderLeftColor: occ.subjectColor || '#38bdf8',
                            borderLeftWidth: '4px',
                          }}
                        >
                          <div className="flex items-center gap-4">
                            <span className="font-mono font-bold text-xs sm:text-sm text-slate-200 w-28 sm:w-32 shrink-0">
                              {occ.startTime} – {occ.endTime}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-white">
                                  {occ.subjectName}
                                </span>
                                {occ.subjectCode && (
                                  <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">
                                    {occ.subjectCode}
                                  </span>
                                )}
                              </div>
                              {occ.room && (
                                <span className="text-xs text-slate-400 block mt-0.5">
                                  {occ.room}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {occ.status === 'ongoing' ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                In Session
                              </span>
                            ) : occ.isCancelled ? (
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold">
                                {occ.type === 'rescheduled' ? 'Rescheduled' : 'Cancelled'}
                              </span>
                            ) : occ.status === 'concluded' ? (
                              <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-medium">
                                Completed
                              </span>
                            ) : occ.type === 'rescheduled' ? (
                              <span className="px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold">
                                ↻ Rescheduled
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-bold">
                                Upcoming
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => setActiveTab('timetable')}
                    className="px-4 py-2 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>View Full Timetable</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* QUICK ACTIONS ROW */}
              <div className="p-4 sm:p-5 bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl space-y-3 min-w-0">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-1 sm:flex sm:items-center gap-2.5 sm:gap-3 flex-wrap">
                  <button
                    onClick={() => setShowAddSubjectModal(true)}
                    className="w-full sm:w-auto h-11 sm:h-auto px-4 py-2.5 bg-brand-blue/15 hover:bg-brand-blue/25 border border-brand-blue/30 text-brand-blue rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Subject</span>
                  </button>

                  <button
                    onClick={() => {
                      if (subjects.length === 0) {
                        setShowAddSubjectModal(true);
                      } else {
                        setScheduleModalSubject(subjects[0]);
                      }
                    }}
                    className="w-full sm:w-auto h-11 sm:h-auto px-4 py-2.5 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Class</span>
                  </button>

                  <button
                    onClick={() => handleOpenAddScheduleChange()}
                    className="w-full sm:w-auto h-11 sm:h-auto px-4 py-2.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>↻</span>
                    <span>Schedule Change</span>
                  </button>
                </div>
              </div>

              {/* ACADEMIC SECTIONS CARDS */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Academic Sections
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Academics Section */}
                  <div
                    onClick={() => setActiveTab('academics')}
                    className="p-5 bg-[#0b101f] border border-white/10 rounded-2xl hover:border-brand-blue/40 transition-all cursor-pointer group shadow-lg flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-brand-blue/15 text-brand-blue flex items-center justify-center">
                          <Calculator className="w-4 h-4" />
                        </div>
                        <h4 className="text-sm font-bold text-white group-hover:text-brand-blue transition-colors">
                          Marks & GPA
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400">
                        {subjects.length} Subjects · {sgpaMetrics.totalCredits} Credits enrolled. Scaled internal and semester components.
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-brand-blue group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                  </div>

                  {/* Timetable Section */}
                  <div
                    onClick={() => setActiveTab('timetable')}
                    className="p-5 bg-[#0b101f] border border-white/10 rounded-2xl hover:border-sky-500/40 transition-all cursor-pointer group shadow-lg flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <h4 className="text-sm font-bold text-white group-hover:text-sky-400 transition-colors">
                          Weekly Timetable & Schedule
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400">
                        University matrix grid, day order rotations, calendar exceptions, and class reminders.
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-sky-400 group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                  </div>

                  {/* Attendance Section */}
                  <div
                    onClick={() => setActiveTab('attendance')}
                    className="p-5 bg-[#0b101f] border border-white/10 rounded-2xl hover:border-purple-500/40 transition-all cursor-pointer group shadow-lg flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
                          <CalendarCheck className="w-4 h-4" />
                        </div>
                        <h4 className="text-sm font-bold text-white group-hover:text-purple-400 transition-colors">
                          Attendance & Safe Bunks
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400">
                        Goal planning, safe missable lectures calculation, and mandatory 75% forecasting.
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                  </div>

                  {/* CGPA Section */}
                  <div
                    onClick={() => setActiveTab('cgpa')}
                    className="p-5 bg-[#0b101f] border border-white/10 rounded-2xl hover:border-emerald-500/40 transition-all cursor-pointer group shadow-lg flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                          <Star className="w-4 h-4" />
                        </div>
                        <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                          Semester CGPA Aggregator
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400">
                        {semesters.length} Semesters logged. Cumulative grade point average and cloud sync.
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'academics' && (
            <motion.div
              key="tab-academics"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Left 2 Cols: Subject Quick Form + Subjects List */}
              <div className="lg:col-span-2 space-y-6">
                {/* Add Subject Quick Form */}
                <div className="p-6 bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-brand-blue" />
                      Add Subject / Course
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowAddSubjectModal(true)}
                      className="text-xs text-brand-blue hover:underline font-bold"
                    >
                      Advanced Add (with Timetable) →
                    </button>
                  </div>

                  <form onSubmit={handleQuickAddSubject} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-7">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                        Subject / Course Name
                      </label>
                      <input
                        type="text"
                        value={subjectNameInput}
                        onChange={e => setSubjectNameInput(e.target.value)}
                        placeholder="e.g. Computer Networks, Data Structures"
                        className="w-full h-11 px-4 bg-[#03060d] border border-white/10 rounded-xl text-white outline-none focus:border-brand-blue text-xs transition-colors"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                        Credits
                      </label>
                      <select
                        value={subjectCreditsInput}
                        onChange={e => setSubjectCreditsInput(Number(e.target.value))}
                        className="w-full h-11 px-3 bg-[#03060d] border border-white/10 rounded-xl text-white font-mono font-bold text-xs outline-none focus:border-brand-blue transition-colors"
                      >
                        {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(cr => (
                          <option key={cr} value={cr}>
                            {cr} Cr
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <button
                        type="submit"
                        className="w-full h-11 bg-brand-blue hover:bg-blue-600 font-black text-xs uppercase tracking-wider text-white rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-brand-blue/20 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-white" />
                        Add Subject
                      </button>
                    </div>
                  </form>
                </div>

                {/* Subjects Roster List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <span>Enrolled Subjects ({subjects.length})</span>
                      <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-slate-400 rounded text-[10px] font-mono">
                        {sgpaMetrics.totalCredits} Total Credits
                      </span>
                    </h3>
                  </div>

                  {subjects.length === 0 ? (
                    <div className="py-14 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-6 space-y-3">
                      <AlertCircle className="w-10 h-10 text-slate-500 mx-auto" />
                      <p className="text-sm text-slate-300 font-bold uppercase tracking-wider">No Subjects Added Yet</p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Enter your course title and credits above to start logging evaluation components, scaled exams, class schedules, and automatic grade points.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {subjects.map((course, idx) => (
                        <SubjectMarksCard
                          key={course.id}
                          course={course}
                          bands={activeGradeBands}
                          scaleMax={scaleMax}
                          index={idx}
                          onUpdateCourse={handleUpdateSubject}
                          onDeleteCourse={handleDeleteSubject}
                          onOpenSchedule={course => setScheduleModalSubject(course)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Col: SGPA Dial, Credits, Weighted Points, and Save */}
              <div className="space-y-6">
                <div className="p-6 bg-[#0b101f] border border-white/10 rounded-2xl shadow-xl flex flex-col items-center text-center relative overflow-hidden">
                  <div className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest text-slate-500">
                    Live Computation
                  </div>

                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">
                    Semester SGPA Score
                  </h3>

                  {/* SVG Circle Gauge Dial */}
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
                        className="stroke-brand-blue transition-all duration-500"
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={263.8}
                        strokeDashoffset={263.8 - (263.8 * Math.min(1, sgpaMetrics.sgpa / scaleMax))}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-3xl font-serif font-black text-white">
                        {sgpaMetrics.sgpa.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        / {scaleMax.toFixed(1)} Scale
                      </span>
                    </div>
                  </div>

                  {/* Key Stats Metric Cards */}
                  <div className="grid grid-cols-2 gap-3 w-full mb-4">
                    <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                      <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                        Total Credits
                      </span>
                      <span className="text-lg font-mono font-bold text-white">
                        {sgpaMetrics.totalCredits}
                      </span>
                    </div>

                    <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                      <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                        Equiv. Percent
                      </span>
                      <span className="text-lg font-mono font-bold text-brand-blue">
                        {getEquivalentPercentageString(sgpaMetrics.sgpa, scaleMax)}
                      </span>
                    </div>
                  </div>

                  {/* Weighted Points Summary */}
                  <div className="p-3.5 bg-brand-blue/5 border border-brand-blue/10 rounded-xl text-left w-full text-xs space-y-1">
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">
                      Weighted Grade Points Sum:
                    </span>
                    <span className="font-mono text-sm font-bold text-white">
                      {sgpaMetrics.totalWeightedPoints} Points
                    </span>
                  </div>

                  {/* Explicit Cloud Save Button */}
                  <button
                    onClick={() => handleSaveGpaRecord('sgpa')}
                    disabled={saving || sgpaMetrics.totalCredits === 0}
                    className="w-full mt-4 py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-brand-blue/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <>
                        <Save className="w-4 h-4 text-white" />
                        <span>Save Semester SGPA</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Mathematical Formula Explanation Box */}
                <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-brand-blue" />
                      SGPA Formula Transparency
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowSgpaFormula(!showSgpaFormula)}
                      className="text-[10px] text-slate-400 hover:text-white font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      {showSgpaFormula ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed font-mono bg-black/40 p-2.5 rounded-lg border border-white/5">
                    {sgpaMetrics.formulaSummary}
                  </p>

                  <AnimatePresence>
                    {showSgpaFormula && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden text-[11px] text-slate-400 space-y-1.5 pt-2 border-t border-white/5"
                      >
                        <p>
                          🎓 <strong>SGPA Formula:</strong> SGPA = Σ (Subject Credits × Subject Grade Point) ÷ Σ (Total Subject Credits).
                        </p>
                        <p>
                          Each subject percentage converts to a grade letter and numeric point according to your active grading scale ({scaleMax}.0 scale).
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'timetable' && (
            <motion.div
              key="tab-timetable"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <TimetableScheduleCard
                subjects={subjects}
                exceptions={exceptions}
                holidays={holidays}
                teachingDays={teachingDays}
                timetableSystem={timetableSystem}
                onOpenTimetableSystemModal={() => setShowTimetableSystemModal(true)}
                onUpdateSubjectSchedule={(subjectId, slots) => {
                  setSubjects(prev =>
                    prev.map(s => (s.id === subjectId ? { ...s, timetable: slots } : s))
                  );
                }}
                onOpenAddScheduleModal={course => {
                  setScheduleModalSubject(course || null);
                  setIsAddScheduleModalOpen(true);
                }}
                onOpenAddSubjectModal={() => setShowAddSubjectModal(true)}
                onRecordAttendance={handleRecordAttendance}
                onUpdateReminder={(subjectId, slotId, enabled, minutes) => {
                  setSubjects(prev =>
                    prev.map(s => {
                      if (s.id !== subjectId) return s;
                      const updatedSlots = (s.timetable || []).map(slot =>
                        slot.id === slotId
                          ? { ...slot, reminderEnabled: enabled, reminderMinutes: minutes ?? slot.reminderMinutes }
                          : slot
                      );
                      return { ...s, timetable: updatedSlots };
                    })
                  );
                }}
                onOpenAddScheduleChange={handleOpenAddScheduleChange}
                onOpenAddHoliday={handleOpenAddHoliday}
                onEditException={handleEditException}
                onEditHoliday={handleEditHoliday}
                onDeleteException={handleDeleteException}
                onDeleteHoliday={handleDeleteHoliday}
              />
            </motion.div>
          )}

          {activeTab === 'attendance' && (
            <motion.div
              key="tab-attendance"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <AttendanceCalculatorCard
                conducted={attendanceConducted}
                present={attendancePresent}
                targetPercent={attendanceTarget}
                subjects={subjects}
                onChangeConducted={setAttendanceConducted}
                onChangePresent={setAttendancePresent}
                onChangeTargetPercent={setAttendanceTarget}
                onUpdateSubjectAttendance={handleUpdateSubjectAttendance}
                onReset={() => {
                  setAttendanceConducted(60);
                  setAttendancePresent(52);
                  setAttendanceTarget(75);
                }}
              />
            </motion.div>
          )}

          {activeTab === 'cgpa' && (
            <motion.div
              key="tab-cgpa"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <CgpaAggregatorCard
                semesters={semesters}
                scaleMax={scaleMax}
                onAddSemester={handleAddSemester}
                onRemoveSemester={handleRemoveSemester}
                onClearSemesters={handleClearSemesters}
                onSaveCgpa={() => handleSaveGpaRecord('cgpa')}
                saving={saving}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Subject Modal with immediate Schedule flow */}
        <AddSubjectModal
          isOpen={showAddSubjectModal}
          onClose={() => setShowAddSubjectModal(false)}
          onAddSubject={handleSubjectCreated}
          existingSubjectCount={subjects.length}
        />

        {/* Add / Manage Class Schedule Modal */}
        <AddScheduleModal
          isOpen={isAddScheduleModalOpen || scheduleModalSubject !== null}
          subjects={subjects}
          subject={scheduleModalSubject}
          initialSubjectId={scheduleModalSubject?.id || (subjects.length > 0 ? subjects[0].id : null)}
          timetableSystem={timetableSystem}
          onUpdateTimetableSystem={newSys => {
            setTimetableSystem(newSys);
            setTimetableSystemConfigured(true);
          }}
          onOpenAddSubjectModal={() => {
            setIsAddScheduleModalOpen(false);
            setScheduleModalSubject(null);
            setShowAddSubjectModal(true);
          }}
          onClose={() => {
            setIsAddScheduleModalOpen(false);
            setScheduleModalSubject(null);
          }}
          onSaveSchedule={(targetSubjectId, slots, promptReminder) => {
            handleSaveSubjectSchedule(targetSubjectId, slots, promptReminder);
            setIsAddScheduleModalOpen(false);
            setScheduleModalSubject(null);
          }}
        />

        {/* Reminder Setup Prompt Modal */}
        <ReminderPromptModal
          isOpen={reminderPromptData !== null}
          subject={reminderPromptData?.subject || null}
          slots={reminderPromptData?.slots || []}
          onConfirm={handleConfirmReminder}
          onDecline={() => setReminderPromptData(null)}
        />

        {/* Schedule Exception & University Holiday Modal */}
        <ScheduleExceptionModal
          isOpen={showScheduleExceptionModal}
          onClose={() => {
            setShowScheduleExceptionModal(false);
            setEditingException(null);
            setEditingHoliday(null);
            setScheduleExceptionPrefill(null);
          }}
          subjects={subjects}
          teachingDays={teachingDays}
          timetableSystem={timetableSystem}
          onUpdateTeachingDays={setTeachingDays}
          initialDate={scheduleExceptionPrefill?.date}
          initialSubjectId={scheduleExceptionPrefill?.subjectId}
          initialSlotId={scheduleExceptionPrefill?.slotId}
          editingException={editingException}
          editingHoliday={editingHoliday}
          onSaveException={handleSaveException}
          onSaveHoliday={handleSaveHoliday}
          onDeleteException={handleDeleteException}
          onDeleteHoliday={handleDeleteHoliday}
        />

        {/* Timetable System Setup Modal */}
        <TimetableSystemModal
          isOpen={showTimetableSystemModal}
          onClose={() => setShowTimetableSystemModal(false)}
          currentSystem={timetableSystem}
          onSelectSystem={(newSys) => {
            setTimetableSystem(newSys);
            setTimetableSystemConfigured(true);
            setSaveNotice({
              type: 'info',
              message: `Timetable system switched to ${newSys === 'day_order' ? 'Day Order (SRM & Cyclical)' : 'Weekday (Monday–Sunday)'}.`,
            });
          }}
        />

        {/* Clear All Confirmation Modal */}
        <AnimatePresence>
          {showClearConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#0c101d] border border-white/10 p-6 rounded-2xl max-w-md w-full shadow-2xl relative space-y-4"
              >
                <div className="w-12 h-12 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center text-red-400 mx-auto">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-serif font-bold text-white text-center">
                  Reset All GPA+ Data?
                </h3>
                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  This will clear all local subjects, marks components, class timetables, semesters, and attendance values. This action cannot be undone.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => setShowClearConfirmModal(false)}
                    className="py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearAllData}
                    className="py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-red-500/20 cursor-pointer"
                  >
                    Yes, Clear All
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Grading Scale Customizer Modal */}
        <GradingScaleModal
          isOpen={showGradingModal}
          onClose={() => setShowGradingModal(false)}
          currentScaleId={currentScalePresetId}
          customBands={activeGradeBands}
          scaleMax={scaleMax}
          onSelectPreset={handleSelectPreset}
          onSaveCustomBands={handleSaveCustomBands}
        />

        {/* Auth Prompt Modal for Logged-Out Users attempting to Save to Cloud */}
        <AnimatePresence>
          {showAuthModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#0c101d] border border-white/10 p-6 rounded-2xl max-w-md w-full shadow-2xl relative"
              >
                <div className="w-12 h-12 bg-brand-blue/10 border border-brand-blue/30 rounded-2xl flex items-center justify-center mb-4 text-brand-blue mx-auto">
                  <LogIn className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-serif font-bold text-white text-center mb-2">
                  Sign In Required for Cloud GPA Save
                </h3>
                <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
                  The calculator is 100% free and saves locally on your browser. To sync your SGPA/CGPA history to your cloud profile, please sign in or register an account.
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setShowAuthModal(false);
                      navigate('/auth', { state: { from: location.pathname } });
                    }}
                    className="w-full py-3 bg-brand-blue hover:bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-brand-blue/20 cursor-pointer"
                  >
                    Sign In or Create Account
                  </button>
                  <button
                    onClick={() => setShowAuthModal(false)}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
                  >
                    Continue Locally Without Cloud Save
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Saved Cloud History Modal */}
        <AnimatePresence>
          {showHistory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#0c101d] border border-white/10 p-6 rounded-2xl max-w-xl w-full shadow-2xl relative max-h-[80vh] flex flex-col"
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-brand-blue" />
                    <h3 className="text-base font-serif font-bold text-white">Your Cloud GPA History</h3>
                  </div>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="text-slate-400 hover:text-white text-xs font-bold px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                  {loadingHistory ? (
                    <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
                      Loading history...
                    </div>
                  ) : savedRecords.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      No saved GPA records found in cloud. Click "Save Semester SGPA" or "Save Cumulative CGPA" to store results in your profile!
                    </div>
                  ) : (
                    savedRecords.map(rec => (
                      <div
                        key={rec.id}
                        className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between gap-4 hover:border-white/15 transition-all"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-brand-blue/10 border border-brand-blue/20 text-brand-blue font-mono font-bold text-[10px] uppercase rounded">
                              {rec.type.toUpperCase()}
                            </span>
                            <span className="text-xs font-serif font-bold text-white">
                              {rec.score.toFixed(2)} / {rec.scale.toFixed(1)} Scale
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Credits: {rec.totalCredits} | Equivalent: {rec.percentage}
                          </p>
                          <p className="text-[9px] text-slate-500 mt-1">
                            Saved on {new Date(rec.createdAt).toLocaleDateString()} at{' '}
                            {new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteRecord(rec.id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg transition-colors cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default GpaCalculatorPage;
