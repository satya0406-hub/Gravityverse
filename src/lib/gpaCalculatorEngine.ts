/**
 * GravityVerse GPA+ Academic Engine
 * Pure, tested, robust academic computation utilities for:
 * - Course Component Marks & Scale-Down Calculation (without double-counting)
 * - Custom Grading Scales (Presets & Fully Customizable Grade Bands)
 * - Semester SGPA (Credit-Weighted Grade Points)
 * - Multi-Semester CGPA (Credit-Weighted SGPAs)
 * - Attendance Percentage & Target Goal Planning (Missable & Required classes)
 */

export interface MarksComponent {
  id: string;
  name: string;
  obtainedMarks: number;
  maximumMarks: number;
  isScaled: boolean;
  scaledMaximum?: number;
}

export interface ScaledComponentResult {
  id: string;
  name: string;
  rawObtained: number;
  rawMax: number;
  isScaled: boolean;
  scaledMax?: number;
  contributionObtained: number;
  contributionMax: number;
  formulaText: string;
  isValid: boolean;
  errorMessage?: string;
}

export interface GradeBand {
  id: string;
  minPercentage: number;
  maxPercentage: number;
  grade: string;
  gradePoint: number;
  description?: string;
}

export interface GradingScalePreset {
  id: string;
  name: string;
  scaleMax: 10 | 4;
  bands: GradeBand[];
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export type TimetableSystem = 'day_order' | 'weekday';

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const WEEKDAYS: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
];

export const DEFAULT_TEACHING_DAYS: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
];

export interface TimetableSlot {
  id: string;
  subjectId: string;
  day: DayOfWeek;
  dayOrder?: number; // 1 for DO1, 2 for DO2, etc.
  startTime: string; // e.g. "10:00 AM" or "10:00"
  endTime: string;   // e.g. "11:00 AM" or "11:00"
  room?: string;     // e.g. "Room 204"
  instructor?: string; // e.g. "Prof. Sharma"
  reminderEnabled: boolean;
  reminderMinutes: number; // 5, 10, 20 (default), 30, 60 or custom
}

export interface ScheduleDayOption {
  value: DayOfWeek;
  label: string; // "DO1" or "Monday"
  description: string; // "Day Order 1" or "Monday"
  dayOrder?: number;
}

export const DAY_ORDER_SCHEDULE_OPTIONS: ScheduleDayOption[] = [
  { value: 'Monday', label: 'DO1', description: 'Day Order 1', dayOrder: 1 },
  { value: 'Tuesday', label: 'DO2', description: 'Day Order 2', dayOrder: 2 },
  { value: 'Wednesday', label: 'DO3', description: 'Day Order 3', dayOrder: 3 },
  { value: 'Thursday', label: 'DO4', description: 'Day Order 4', dayOrder: 4 },
  { value: 'Friday', label: 'DO5', description: 'Day Order 5', dayOrder: 5 },
  { value: 'Saturday', label: 'DO6', description: 'Day Order 6', dayOrder: 6 },
];

export const WEEKDAY_SCHEDULE_OPTIONS: ScheduleDayOption[] = [
  { value: 'Monday', label: 'Monday', description: 'Monday' },
  { value: 'Tuesday', label: 'Tuesday', description: 'Tuesday' },
  { value: 'Wednesday', label: 'Wednesday', description: 'Wednesday' },
  { value: 'Thursday', label: 'Thursday', description: 'Thursday' },
  { value: 'Friday', label: 'Friday', description: 'Friday' },
  { value: 'Saturday', label: 'Saturday', description: 'Saturday' },
  { value: 'Sunday', label: 'Sunday', description: 'Sunday' },
];

export function getScheduleDayOptions(system: TimetableSystem = 'day_order'): ScheduleDayOption[] {
  return system === 'day_order' ? DAY_ORDER_SCHEDULE_OPTIONS : WEEKDAY_SCHEDULE_OPTIONS;
}

export function formatSlotDay(day: DayOfWeek, system: TimetableSystem = 'day_order'): string {
  if (system === 'day_order') {
    const match = DAY_ORDER_SCHEDULE_OPTIONS.find(opt => opt.value === day);
    if (match) return match.label;
  }
  return day;
}

export type ScheduleExceptionType =
  | 'cancelled'
  | 'moved_time'
  | 'rescheduled_date'
  | 'extra_class';

export type HolidayHandlingStrategy = 'cancel' | 'postpone' | 'manual';

/**
 * EXACT 3 SCHEDULE CHANGE TYPES
 * 1. HOLIDAY: Entire day cancelled, day order carried forward to next working day
 * 2. SUSPENDED: Cancelled for this particular day, day order NOT carried forward
 * 3. RESCHEDULED: Only selected class(es) moved, remaining classes and overall day order unchanged
 */
export type TimetableChangeType = 'HOLIDAY' | 'SUSPENDED' | 'RESCHEDULED';

// 1. HOLIDAY DATA MODEL
export interface HolidayScheduleChange {
  id: string;
  type: 'HOLIDAY';
  date: string; // "YYYY-MM-DD"
  originalDayOrder: number; // e.g. 1, 2, 3, 4, 5
  replacementDate?: string; // Next working day "YYYY-MM-DD"
  replacementDayOrder?: number; // Carried forward day order (same as originalDayOrder)
  name: string; // e.g. "Gandhi Jayanti", "College Holiday"
  reason?: string;
  createdAt: number;
}

// 2. SUSPENDED DATA MODEL
export interface SuspendedScheduleChange {
  id: string;
  type: 'SUSPENDED';
  date: string; // "YYYY-MM-DD"
  dayOrder: number; // The day order that was suspended and not conducted
  noReplacement: true; // explicit flag: no replacement, not carried forward
  name?: string;
  reason?: string; // e.g. "Heavy Rain Alert", "Campus Event", "Strike"
  createdAt: number;
}

// 3. RESCHEDULED DATA MODEL
export interface RescheduledClassDetail {
  id?: string;
  subjectId: string;
  originalSlotId?: string;
  originalDate: string; // "YYYY-MM-DD"
  originalStartTime: string; // e.g. "12:40 PM" or "12:40"
  originalEndTime: string; // e.g. "01:25 PM" or "01:25"
  newDate: string; // "YYYY-MM-DD"
  newStartTime: string; // e.g. "02:35 PM" or "02:35"
  newEndTime: string; // e.g. "03:25 PM" or "03:25"
  newRoom?: string;
  newInstructor?: string;
  reason?: string;
}

export interface RescheduledScheduleChange {
  id: string;
  type: 'RESCHEDULED';
  subjectId: string; // subject/class
  originalDate: string; // "YYYY-MM-DD"
  originalStartTime: string; // e.g. "12:40 PM"
  originalEndTime: string; // e.g. "01:25 PM"
  newDate: string; // "YYYY-MM-DD"
  newStartTime: string; // e.g. "02:35 PM"
  newEndTime: string; // e.g. "03:25 PM"
  newRoom?: string;
  newInstructor?: string;
  reason?: string;
  classes?: RescheduledClassDetail[];
  createdAt: number;
}

export type TimetableScheduleChange =
  | HolidayScheduleChange
  | SuspendedScheduleChange
  | RescheduledScheduleChange;

export interface HolidayRecord {
  id: string;
  type?: 'HOLIDAY' | 'SUSPENDED';
  changeType?: TimetableChangeType;
  date: string; // "YYYY-MM-DD"
  name: string; // e.g. "University Holiday", "Gandhi Jayanti", "Tech Fest"
  reason?: string;
  description?: string;
  strategy: HolidayHandlingStrategy; // 'cancel' | 'postpone' | 'manual'
  // Unified 3 Change Types fields
  originalDayOrder?: number;
  replacementDayOrder?: number;
  replacementDate?: string;
  dayOrder?: number; // for SUSPENDED
  noReplacement?: boolean; // for SUSPENDED
  createdAt: number;
}

export interface ScheduleException {
  id: string;
  subjectId: string;
  type: ScheduleExceptionType;
  changeType?: TimetableChangeType;
  date: string; // The date of this occurrence "YYYY-MM-DD"
  originalDate?: string; // For rescheduled_date: the original date "YYYY-MM-DD"
  originalSlotId?: string; // If overriding a specific recurring slot
  originalStartTime?: string;
  originalEndTime?: string;
  newDate?: string; // For rescheduled_date: destination date "YYYY-MM-DD"
  newStartTime?: string; // e.g. "03:00 PM"
  newEndTime?: string; // e.g. "04:00 PM"
  newRoom?: string;
  newInstructor?: string;
  reason?: string; // e.g. "Holiday", "Faculty unavailable", "College event", "Exam", "Weather", "Other"
  reminderEnabled?: boolean;
  reminderMinutes?: number; // default 20
  classes?: RescheduledClassDetail[]; // Support moving multiple classes
  createdAt: number;
}

export interface ClassOccurrence {
  id: string; // unique occurrence key for this date & slot
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  subjectCode?: string;
  date: string; // "YYYY-MM-DD"
  day: DayOfWeek;
  dayOrder?: number;
  startTime: string; // e.g. "10:00 AM"
  endTime: string; // e.g. "11:00 AM"
  startMinutes: number;
  endMinutes: number;
  room?: string;
  instructor?: string;
  type: 'regular' | 'moved_time' | 'rescheduled' | 'extra' | 'postponed';
  isCancelled: boolean;
  isHoliday?: boolean;
  isSuspended?: boolean;
  holidayName?: string;
  reason?: string;
  originalDate?: string;
  originalTime?: string;
  originalDay?: DayOfWeek;
  isPostponed?: boolean;
  postponedFromDate?: string;
  postponedFromDay?: DayOfWeek;
  exceptionId?: string;
  originalSlotId?: string;
  reminderEnabled: boolean;
  reminderMinutes: number;
  status: 'upcoming' | 'ongoing' | 'concluded';
  minutesUntilStart: number;
  minutesUntilEnd: number;
  formattedTimeRange: string;
  hasConflict?: boolean;
  conflictWith?: string;
  conflictDetails?: string;
}

export interface SubjectAttendance {
  conducted: number;
  present: number;
  targetPercentage?: number;
}

export interface SubjectCourse {
  id: string;
  name: string;
  code?: string;
  credits: number;
  evaluationMode: 'components' | 'direct_grade';
  components: MarksComponent[];
  directGradePoint?: number;
  directGradeName?: string;
  attendance?: SubjectAttendance;
  timetable?: TimetableSlot[];
  color?: string;
}

export interface SubjectCalculationResult {
  id: string;
  name: string;
  credits: number;
  evaluationMode: 'components' | 'direct_grade';
  totalContributionObtained: number;
  totalContributionMax: number;
  percentage: number;
  grade: string;
  gradePoint: number;
  weightedPoints: number;
  componentResults: ScaledComponentResult[];
  breakdownFormula: string;
  isValid: boolean;
  validationError?: string;
}

export interface SemesterRecord {
  id: string;
  semesterName: string;
  sgpa: number;
  totalCredits: number;
}

export interface AttendanceCalculationResult {
  conducted: number;
  present: number;
  absent: number;
  percentage: number;
  targetPercentage: number;
  canMissClasses: number;
  neededClasses: number;
  isTargetMet: boolean;
  isTargetImpossible: boolean;
  status: 'optimal' | 'warning' | 'critical';
  message: string;
  detailedAnalysis: string;
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Default Grading Scale Presets
 */
export function getDefaultGradingScales(): GradingScalePreset[] {
  return [
    {
      id: 'srm_ugc_10',
      name: 'SRMIST / UGC Standard (10-Point Scale)',
      scaleMax: 10,
      bands: [
        { id: 'b1', minPercentage: 90, maxPercentage: 100, grade: 'O', gradePoint: 10, description: 'Outstanding' },
        { id: 'b2', minPercentage: 80, maxPercentage: 89.99, grade: 'A+', gradePoint: 9, description: 'Excellent' },
        { id: 'b3', minPercentage: 70, maxPercentage: 79.99, grade: 'A', gradePoint: 8, description: 'Very Good' },
        { id: 'b4', minPercentage: 60, maxPercentage: 69.99, grade: 'B+', gradePoint: 7, description: 'Good' },
        { id: 'b5', minPercentage: 55, maxPercentage: 59.99, grade: 'B', gradePoint: 6, description: 'Above Average' },
        { id: 'b6', minPercentage: 50, maxPercentage: 54.99, grade: 'C', gradePoint: 5, description: 'Average' },
        { id: 'b7', minPercentage: 40, maxPercentage: 49.99, grade: 'P', gradePoint: 4, description: 'Pass' },
        { id: 'b8', minPercentage: 0, maxPercentage: 39.99, grade: 'F', gradePoint: 0, description: 'Fail / Reappear' },
      ],
    },
    {
      id: 'standard_10',
      name: 'General University Standard (10-Point Scale)',
      scaleMax: 10,
      bands: [
        { id: 'g1', minPercentage: 90, maxPercentage: 100, grade: 'A+', gradePoint: 10, description: 'Outstanding' },
        { id: 'g2', minPercentage: 80, maxPercentage: 89.99, grade: 'A', gradePoint: 9, description: 'Excellent' },
        { id: 'g3', minPercentage: 70, maxPercentage: 79.99, grade: 'B+', gradePoint: 8, description: 'Very Good' },
        { id: 'g4', minPercentage: 60, maxPercentage: 69.99, grade: 'B', gradePoint: 7, description: 'Good' },
        { id: 'g5', minPercentage: 50, maxPercentage: 59.99, grade: 'C', gradePoint: 6, description: 'Average' },
        { id: 'g6', minPercentage: 40, maxPercentage: 49.99, grade: 'D', gradePoint: 5, description: 'Pass' },
        { id: 'g7', minPercentage: 0, maxPercentage: 39.99, grade: 'F', gradePoint: 0, description: 'Fail' },
      ],
    },
    {
      id: 'standard_4',
      name: 'US / International Standard (4.0 Scale)',
      scaleMax: 4,
      bands: [
        { id: 'u1', minPercentage: 93, maxPercentage: 100, grade: 'A', gradePoint: 4.0, description: 'Superior' },
        { id: 'u2', minPercentage: 90, maxPercentage: 92.99, grade: 'A-', gradePoint: 3.7, description: 'Excellent' },
        { id: 'u3', minPercentage: 87, maxPercentage: 89.99, grade: 'B+', gradePoint: 3.3, description: 'Very Good' },
        { id: 'u4', minPercentage: 83, maxPercentage: 86.99, grade: 'B', gradePoint: 3.0, description: 'Good' },
        { id: 'u5', minPercentage: 80, maxPercentage: 82.99, grade: 'B-', gradePoint: 2.7, description: 'Above Average' },
        { id: 'u6', minPercentage: 77, maxPercentage: 79.99, grade: 'C+', gradePoint: 2.3, description: 'Average' },
        { id: 'u7', minPercentage: 73, maxPercentage: 76.99, grade: 'C', gradePoint: 2.0, description: 'Satisfactory' },
        { id: 'u8', minPercentage: 70, maxPercentage: 72.99, grade: 'C-', gradePoint: 1.7, description: 'Below Average' },
        { id: 'u9', minPercentage: 60, maxPercentage: 69.99, grade: 'D', gradePoint: 1.0, description: 'Passing' },
        { id: 'u10', minPercentage: 0, maxPercentage: 59.99, grade: 'F', gradePoint: 0.0, description: 'Failing' },
      ],
    },
  ];
}

/**
 * 1. Calculate Component Scaling
 * Handles raw marks and scaled-down contributions accurately without rounding errors.
 */
export function calculateComponentScaled(
  obtained: number,
  maximum: number,
  isScaled: boolean,
  scaledMaximum?: number
): ScaledComponentResult {
  // Input validations
  if (isNaN(obtained) || isNaN(maximum)) {
    return {
      id: '',
      name: '',
      rawObtained: 0,
      rawMax: 0,
      isScaled,
      contributionObtained: 0,
      contributionMax: 0,
      formulaText: 'Invalid marks entered',
      isValid: false,
      errorMessage: 'Please enter valid numerical marks.',
    };
  }

  if (maximum <= 0) {
    return {
      id: '',
      name: '',
      rawObtained: obtained,
      rawMax: maximum,
      isScaled,
      contributionObtained: 0,
      contributionMax: 0,
      formulaText: 'Maximum marks must be greater than 0',
      isValid: false,
      errorMessage: 'Maximum marks must be greater than 0.',
    };
  }

  if (obtained < 0) {
    return {
      id: '',
      name: '',
      rawObtained: obtained,
      rawMax: maximum,
      isScaled,
      contributionObtained: 0,
      contributionMax: 0,
      formulaText: 'Marks obtained cannot be negative',
      isValid: false,
      errorMessage: 'Marks obtained cannot be negative.',
    };
  }

  if (obtained > maximum) {
    return {
      id: '',
      name: '',
      rawObtained: obtained,
      rawMax: maximum,
      isScaled,
      contributionObtained: 0,
      contributionMax: 0,
      formulaText: 'Obtained marks exceed maximum marks',
      isValid: false,
      errorMessage: `Obtained (${obtained}) exceeds maximum (${maximum}).`,
    };
  }

  if (!isScaled || scaledMaximum === undefined || scaledMaximum <= 0) {
    // Non-scaled component: contributes raw marks directly
    return {
      id: '',
      name: '',
      rawObtained: obtained,
      rawMax: maximum,
      isScaled: false,
      contributionObtained: obtained,
      contributionMax: maximum,
      formulaText: `${obtained} / ${maximum} (Raw Contribution)`,
      isValid: true,
    };
  }

  // Scaled component: (obtained / maximum) * scaledMaximum
  const scaledContribution = (obtained / maximum) * scaledMaximum;
  const roundedContribution = Number(scaledContribution.toFixed(4));

  return {
    id: '',
    name: '',
    rawObtained: obtained,
    rawMax: maximum,
    isScaled: true,
    scaledMax: scaledMaximum,
    contributionObtained: roundedContribution,
    contributionMax: scaledMaximum,
    formulaText: `(${obtained} / ${maximum}) × ${scaledMaximum} = ${Number(scaledContribution.toFixed(2))} / ${scaledMaximum}`,
    isValid: true,
  };
}

/**
 * 2. Look up Grade and Grade Point from Grading Scale
 */
export function lookupGrade(percentage: number, bands: GradeBand[]): { grade: string; gradePoint: number; description?: string } {
  if (!bands || bands.length === 0) {
    return { grade: 'N/A', gradePoint: 0 };
  }

  const safePercentage = Math.max(0, Math.min(100, percentage));

  // Sort descending by minPercentage
  const sortedBands = [...bands].sort((a, b) => b.minPercentage - a.minPercentage);

  for (const band of sortedBands) {
    if (safePercentage >= band.minPercentage && safePercentage <= band.maxPercentage + 0.001) {
      return {
        grade: band.grade,
        gradePoint: band.gradePoint,
        description: band.description,
      };
    }
  }

  // Fallback to lowest band if below minimum (e.g. F grade)
  const lowestBand = sortedBands[sortedBands.length - 1];
  return {
    grade: lowestBand.grade,
    gradePoint: lowestBand.gradePoint,
    description: lowestBand.description,
  };
}

/**
 * 3. Calculate Final Subject Total from Components
 * Enforces NO DOUBLE COUNTING: Uses scaled contribution when component is scaled.
 */
export function calculateSubjectFromComponents(
  course: SubjectCourse,
  bands: GradeBand[]
): SubjectCalculationResult {
  if (course.evaluationMode === 'direct_grade') {
    const gp = course.directGradePoint ?? 0;
    const credits = Math.max(1, course.credits || 1);
    return {
      id: course.id,
      name: course.name,
      credits,
      evaluationMode: 'direct_grade',
      totalContributionObtained: 0,
      totalContributionMax: 0,
      percentage: 0,
      grade: course.directGradeName || 'Direct',
      gradePoint: gp,
      weightedPoints: Number((credits * gp).toFixed(2)),
      componentResults: [],
      breakdownFormula: `Direct Grade Entry: ${course.directGradeName || 'Grade'} (${gp} pts) × ${credits} Credits = ${(credits * gp).toFixed(2)} Weighted Points`,
      isValid: true,
    };
  }

  const componentResults: ScaledComponentResult[] = [];
  let totalContributionObtained = 0;
  let totalContributionMax = 0;
  let hasInvalidComponent = false;
  let validationError = '';

  for (const comp of course.components) {
    const res = calculateComponentScaled(
      comp.obtainedMarks,
      comp.maximumMarks,
      comp.isScaled,
      comp.scaledMaximum
    );
    res.id = comp.id;
    res.name = comp.name;

    if (!res.isValid) {
      hasInvalidComponent = true;
      validationError = res.errorMessage || 'Invalid component values';
    }

    componentResults.push(res);
    totalContributionObtained += res.contributionObtained;
    totalContributionMax += res.contributionMax;
  }

  const credits = Math.max(1, course.credits || 1);

  if (totalContributionMax <= 0 || hasInvalidComponent) {
    return {
      id: course.id,
      name: course.name,
      credits,
      evaluationMode: 'components',
      totalContributionObtained: 0,
      totalContributionMax: 0,
      percentage: 0,
      grade: 'N/A',
      gradePoint: 0,
      weightedPoints: 0,
      componentResults,
      breakdownFormula: 'Please enter valid course components.',
      isValid: !hasInvalidComponent && course.components.length === 0,
      validationError: validationError || 'Total maximum marks must be greater than 0',
    };
  }

  const percentage = (totalContributionObtained / totalContributionMax) * 100;
  const roundedPercentage = Number(percentage.toFixed(2));
  const gradeLookup = lookupGrade(roundedPercentage, bands);
  const weightedPoints = Number((credits * gradeLookup.gradePoint).toFixed(2));

  // Build formula breakdown text
  const breakdownParts = componentResults
    .map(c => `${c.name || 'Component'}: ${Number(c.contributionObtained.toFixed(2))}/${c.contributionMax}`)
    .join(' + ');

  const breakdownFormula = `[${breakdownParts}] = ${Number(totalContributionObtained.toFixed(2))} / ${totalContributionMax} = ${roundedPercentage}% → Grade ${gradeLookup.grade} (${gradeLookup.gradePoint} pts)`;

  return {
    id: course.id,
    name: course.name,
    credits,
    evaluationMode: 'components',
    totalContributionObtained: Number(totalContributionObtained.toFixed(2)),
    totalContributionMax: totalContributionMax,
    percentage: roundedPercentage,
    grade: gradeLookup.grade,
    gradePoint: gradeLookup.gradePoint,
    weightedPoints,
    componentResults,
    breakdownFormula,
    isValid: true,
  };
}

/**
 * 4. Calculate Semester GPA (SGPA)
 * SGPA = Σ (Credits × Grade Point) / Σ (Credits)
 */
export function calculateOverallSgpa(
  subjects: SubjectCourse[],
  bands: GradeBand[]
): {
  sgpa: number;
  totalCredits: number;
  totalWeightedPoints: number;
  subjectResults: SubjectCalculationResult[];
  formulaSummary: string;
} {
  const subjectResults = subjects.map(s => calculateSubjectFromComponents(s, bands));
  let totalWeightedPoints = 0;
  let totalCredits = 0;

  for (const res of subjectResults) {
    if (res.isValid && res.credits > 0) {
      totalWeightedPoints += res.weightedPoints;
      totalCredits += res.credits;
    }
  }

  const sgpa = totalCredits > 0 ? Number((totalWeightedPoints / totalCredits).toFixed(2)) : 0;
  const formulaSummary = totalCredits > 0
    ? `Σ(Credits × Grade Points) [${totalWeightedPoints.toFixed(2)}] ÷ Σ(Credits) [${totalCredits}] = ${sgpa.toFixed(2)}`
    : 'Add course credits to compute SGPA';

  return {
    sgpa,
    totalCredits,
    totalWeightedPoints: Number(totalWeightedPoints.toFixed(2)),
    subjectResults,
    formulaSummary,
  };
}

/**
 * 5. Calculate Cumulative GPA (CGPA)
 * CGPA = Σ (Semester Credits × Semester SGPA) / Σ (Semester Credits)
 */
export function calculateOverallCgpa(semesters: SemesterRecord[]): {
  cgpa: number;
  totalCredits: number;
  totalWeightedPoints: number;
  formulaSummary: string;
  isValid: boolean;
} {
  let totalWeighted = 0;
  let totalCredits = 0;

  for (const sem of semesters) {
    const cr = Math.max(0, sem.totalCredits || 0);
    const sgpa = Math.max(0, sem.sgpa || 0);
    totalWeighted += cr * sgpa;
    totalCredits += cr;
  }

  const cgpa = totalCredits > 0 ? Number((totalWeighted / totalCredits).toFixed(2)) : 0;
  const formulaSummary = totalCredits > 0
    ? `Σ(Semester Credits × SGPA) [${totalWeighted.toFixed(2)}] ÷ Σ(Combined Credits) [${totalCredits}] = ${cgpa.toFixed(2)}`
    : 'Add semester records to calculate CGPA';

  return {
    cgpa,
    totalCredits,
    totalWeightedPoints: Number(totalWeighted.toFixed(2)),
    formulaSummary,
    isValid: totalCredits > 0,
  };
}

/**
 * 6. Calculate Attendance & Attendance Target Goal
 * Formulas:
 *  - Attendance % = (Present / Total) * 100
 *  - Target = target% / 100
 *  - If Present/Total >= Target:
 *      Can miss: floor((Present / Target) - Total)
 *  - If Present/Total < Target:
 *      Must attend consecutively: ceil((Target * Total - Present) / (1 - Target))
 */
export function calculateAttendanceMetrics(
  conducted: number,
  present: number,
  targetPercentage: number = 75
): AttendanceCalculationResult {
  const safeConducted = Math.max(0, Math.floor(conducted || 0));
  const safePresent = Math.max(0, Math.floor(present || 0));
  const safeTarget = Math.max(1, Math.min(100, targetPercentage || 75));
  const absent = Math.max(0, safeConducted - safePresent);

  if (safeConducted <= 0) {
    return {
      conducted: 0,
      present: 0,
      absent: 0,
      percentage: 0,
      targetPercentage: safeTarget,
      canMissClasses: 0,
      neededClasses: 0,
      isTargetMet: false,
      isTargetImpossible: false,
      status: 'warning',
      message: 'Enter total classes conducted to evaluate your attendance.',
      detailedAnalysis: 'No classes have been recorded yet.',
      isValid: false,
      errorMessage: 'Total classes conducted must be greater than 0.',
    };
  }

  if (safePresent > safeConducted) {
    return {
      conducted: safeConducted,
      present: safePresent,
      absent: 0,
      percentage: 0,
      targetPercentage: safeTarget,
      canMissClasses: 0,
      neededClasses: 0,
      isTargetMet: false,
      isTargetImpossible: false,
      status: 'critical',
      message: 'Classes present cannot exceed total classes conducted.',
      detailedAnalysis: `Present count (${safePresent}) exceeds conducted total (${safeConducted}). Please check inputs.`,
      isValid: false,
      errorMessage: 'Classes present cannot exceed total classes conducted.',
    };
  }

  const currentRatio = safePresent / safeConducted;
  const currentPercentage = Number((currentRatio * 100).toFixed(2));
  const targetRatio = safeTarget / 100;

  const isTargetMet = currentPercentage >= safeTarget;

  // Case 1: Target is already met or exceeded -> calculate how many classes student can miss
  if (isTargetMet) {
    // Let m = classes missable. (safePresent) / (safeConducted + m) >= targetRatio
    // safePresent / targetRatio >= safeConducted + m
    // m <= (safePresent / targetRatio) - safeConducted
    const maxMissable = Math.max(0, Math.floor((safePresent / targetRatio) - safeConducted));
    const status = currentPercentage >= 85 ? 'optimal' : 'warning';
    
    return {
      conducted: safeConducted,
      present: safePresent,
      absent,
      percentage: currentPercentage,
      targetPercentage: safeTarget,
      canMissClasses: maxMissable,
      neededClasses: 0,
      isTargetMet: true,
      isTargetImpossible: false,
      status,
      message: maxMissable > 0 
        ? `You can safely miss ${maxMissable} next class${maxMissable === 1 ? '' : 'es'} while maintaining ≥ ${safeTarget}% attendance.`
        : `Your attendance is exactly at or near the ${safeTarget}% threshold. Avoid missing upcoming classes!`,
      detailedAnalysis: `Current attendance: ${safePresent} / ${safeConducted} (${currentPercentage}%). Target: ${safeTarget}%. Formula: ⌊(${safePresent} ÷ ${targetRatio}) - ${safeConducted}⌋ = ${maxMissable} missable class${maxMissable === 1 ? '' : 'es'}.`,
      isValid: true,
    };
  }

  // Case 2: Target is not met -> calculate how many consecutive classes must be attended
  // If target is 100% and student already missed at least 1 class, it's impossible.
  if (safeTarget >= 100 && absent > 0) {
    return {
      conducted: safeConducted,
      present: safePresent,
      absent,
      percentage: currentPercentage,
      targetPercentage: safeTarget,
      canMissClasses: 0,
      neededClasses: 0,
      isTargetMet: false,
      isTargetImpossible: true,
      status: 'critical',
      message: `100% attendance is impossible because ${absent} class${absent === 1 ? ' was' : 'es were'} already missed.`,
      detailedAnalysis: `Target is 100% with ${absent} prior absences. Once a class is missed, 100% overall attendance cannot be achieved.`,
      isValid: true,
    };
  }

  // Let a = consecutive classes needed. (safePresent + a) / (safeConducted + a) >= targetRatio
  // safePresent + a >= targetRatio * safeConducted + targetRatio * a
  // a * (1 - targetRatio) >= targetRatio * safeConducted - safePresent
  // a >= (targetRatio * safeConducted - safePresent) / (1 - targetRatio)
  const neededNumerator = (targetRatio * safeConducted) - safePresent;
  const neededDenominator = 1 - targetRatio;
  const neededClasses = Math.max(0, Math.ceil(neededNumerator / neededDenominator));

  return {
    conducted: safeConducted,
    present: safePresent,
    absent,
    percentage: currentPercentage,
    targetPercentage: safeTarget,
    canMissClasses: 0,
    neededClasses,
    isTargetMet: false,
    isTargetImpossible: false,
    status: 'critical',
    message: `You need to attend the next ${neededClasses} consecutive class${neededClasses === 1 ? '' : 'es'} to reach your ${safeTarget}% target.`,
    detailedAnalysis: `Current attendance: ${safePresent} / ${safeConducted} (${currentPercentage}%). Deficit: ${(safeTarget - currentPercentage).toFixed(2)}%. Formula: ⌈((${targetRatio} × ${safeConducted}) - ${safePresent}) ÷ (1 - ${targetRatio})⌉ = ${neededClasses} classes.`,
    isValid: true,
  };
}

/**
 * Standard GPA to Percentage Converter String
 */
export function getEquivalentPercentageString(gpaVal: number, scale: 10 | 4): string {
  if (gpaVal <= 0) return '0%';
  if (scale === 10) {
    // Universally accepted standard: CGPA * 9.5
    return `${(gpaVal * 9.5).toFixed(1)}%`;
  }
  // Standard 4.0 scale approximation
  return `${((gpaVal / 4) * 100).toFixed(1)}%`;
}

/**
 * 7. Timetable & Schedule Engine Utilities
 */

export const SUBJECT_COLOR_PALETTE = [
  '#38bdf8', // Sky Blue
  '#818cf8', // Indigo
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f472b6', // Pink
  '#a78bfa', // Purple
  '#2dd4bf', // Teal
  '#fb923c', // Orange
  '#60a5fa', // Blue
  '#e879f9', // Fuchsia
];

export function getSubjectColor(index: number, customColor?: string): string {
  if (customColor) return customColor;
  return SUBJECT_COLOR_PALETTE[index % SUBJECT_COLOR_PALETTE.length];
}

/**
 * Parse time strings like "10:00 AM", "14:30", "12:40", "1:25 PM", "2:35 PM" into total minutes from midnight (0 - 1439).
 * Fully supports minute-level times (e.g. 12:40, 1:25, 2:35).
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim().toUpperCase();
  
  // Format with AM/PM (e.g. "10:00 AM", "12:40 PM", "1:25 PM", "2:35 PM")
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const modifier = ampmMatch[3];

    if (modifier === 'PM' && hours < 12) {
      hours += 12;
    }
    if (modifier === 'AM' && hours === 12) {
      hours = 0;
    }
    // If no AM/PM modifier is given:
    // If 1 <= hours <= 6, assume afternoon college class (e.g. 1:25 is 13:25, 2:35 is 14:35)
    if (!modifier && hours >= 1 && hours <= 6) {
      hours += 12;
    }
    return Math.min(1439, Math.max(0, hours * 60 + minutes));
  }

  // 24-hour fallback "14:30", "12:40", "13:25"
  const parts = clean.split(':');
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    if (h >= 1 && h <= 6 && !clean.includes('AM')) {
      h += 12;
    }
    return Math.min(1439, Math.max(0, h * 60 + m));
  }

  return 0;
}

/**
 * Format total minutes from midnight into human-readable 12-hour AM/PM string (e.g. "12:40 PM", "1:25 PM").
 */
export function formatMinutesToTime12Hour(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(1439, totalMinutes));
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutePadded = minutes.toString().padStart(2, '0');

  return `${hours12}:${minutePadded} ${period}`;
}

/**
 * Format total minutes from midnight into 24-hour format "HH:mm" for <input type="time" />.
 */
export function formatMinutesToTime24Hour(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(1439, totalMinutes));
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${hours24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Converts a 12-hour or arbitrary time string to 24-hour format "HH:mm".
 */
export function timeStringTo24Hour(timeStr: string): string {
  const mins = parseTimeToMinutes(timeStr);
  return formatMinutesToTime24Hour(mins);
}

/**
 * Standardize any user-entered time into formatted "10:00 AM" string.
 */
export function formatTimeString(timeStr: string): string {
  const mins = parseTimeToMinutes(timeStr);
  return formatMinutesToTime12Hour(mins);
}

/**
 * Check if a time slot overlaps with existing time slots on the same day
 */
export function checkSlotConflict(
  candidate: TimetableSlot,
  existingSlots: TimetableSlot[],
  excludeSlotId?: string
): { hasConflict: boolean; conflictingSlot?: TimetableSlot } {
  const candStart = parseTimeToMinutes(candidate.startTime);
  const candEnd = parseTimeToMinutes(candidate.endTime);

  if (candEnd <= candStart) {
    return { hasConflict: true };
  }

  for (const slot of existingSlots) {
    if (excludeSlotId && slot.id === excludeSlotId) continue;
    if (slot.day !== candidate.day) continue;

    const slotStart = parseTimeToMinutes(slot.startTime);
    const slotEnd = parseTimeToMinutes(slot.endTime);

    // Overlap condition: startA < endB && endA > startB
    if (candStart < slotEnd && candEnd > slotStart) {
      return { hasConflict: true, conflictingSlot: slot };
    }
  }

  return { hasConflict: false };
}

/**
 * Date Formatting and Timezone-Safe Utilities
 */

/**
 * Format a Date object to local "YYYY-MM-DD" string without UTC date-shift defects.
 */
export function formatDateToISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse an ISO date string "YYYY-MM-DD" into a local midnight Date object.
 */
export function parseISODate(isoStr: string): Date {
  if (!isoStr) return new Date();
  const parts = isoStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}

/**
 * Format an ISO date string or Date into friendly human-readable format.
 * e.g. "Monday, Sep 7, 2026" or "Sep 7, 2026"
 */
export function formatDisplayDate(
  dateInput: string | Date,
  options?: { includeDay?: boolean; shortMonth?: boolean }
): string {
  const date = typeof dateInput === 'string' ? parseISODate(dateInput) : dateInput;
  const dayName = getCurrentDayOfWeek(date);
  const months = options?.shortMonth !== false
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const m = months[date.getMonth()];
  const d = date.getDate();
  const y = date.getFullYear();

  if (options?.includeDay) {
    return `${dayName}, ${m} ${d}, ${y}`;
  }
  return `${m} ${d}, ${y}`;
}

/**
 * Get DayOfWeek ('Monday', 'Tuesday', etc.) from Date or ISO string
 */
export function getDayOfWeekFromDate(dateInput: string | Date): DayOfWeek {
  const date = typeof dateInput === 'string' ? parseISODate(dateInput) : dateInput;
  return getCurrentDayOfWeek(date);
}

/**
 * Get the Monday start date for any reference week
 */
export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface WeekDayItem {
  date: Date;
  dateStr: string;
  day: DayOfWeek;
  isToday: boolean;
  dayNumber: number;
}

/**
 * Get the list of days (Monday through Friday or Sunday) for a given week
 */
export function getWeekDaysForDate(
  refDateInput: Date | string,
  includeWeekends: boolean = false
): WeekDayItem[] {
  const refDate = typeof refDateInput === 'string' ? parseISODate(refDateInput) : refDateInput;
  const monday = getStartOfWeek(refDate);
  const totalDays = includeWeekends ? 7 : 5;
  const todayStr = formatDateToISO(new Date());

  const days: WeekDayItem[] = [];
  for (let i = 0; i < totalDays; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    const dateStr = formatDateToISO(current);
    days.push({
      date: current,
      dateStr,
      day: getCurrentDayOfWeek(current),
      isToday: dateStr === todayStr,
      dayNumber: current.getDate(),
    });
  }
  return days;
}

/**
 * Extract all timetable slots across all subjects
 */
export function getAllTimetableSlots(subjects: SubjectCourse[]): TimetableSlot[] {
  const slots: TimetableSlot[] = [];
  for (const sub of subjects) {
    if (sub.timetable && Array.isArray(sub.timetable)) {
      for (const slot of sub.timetable) {
        slots.push({
          ...slot,
          subjectId: sub.id, // Ensure strict mapping
        });
      }
    }
  }
  return slots;
}

/**
 * Get current day of week string matching DayOfWeek type
 */
export function getCurrentDayOfWeek(date: Date = new Date()): DayOfWeek {
  const days: DayOfWeek[] = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return days[date.getDay()];
}

export interface DayOccurrencesResult {
  dateStr: string;
  day: DayOfWeek;
  weekdayName: DayOfWeek;
  timetableSystem?: TimetableSystem;
  dayOrder?: number;
  effectiveDayOrder?: number;
  isHoliday: boolean;
  isSuspended?: boolean;
  holiday?: HolidayRecord;
  suspendedRecord?: HolidayRecord;
  isPostponedDay?: boolean;
  postponedFromDay?: DayOfWeek;
  postponedFromDate?: string;
  carriedForwardFrom?: { dateStr: string; dayOrder: number; dayName: DayOfWeek };
  carriedForwardTo?: { dateStr: string; dayOrder: number; dayName: DayOfWeek };
  occurrences: ClassOccurrence[];
  activeOccurrences: ClassOccurrence[];
  hasAnyConflict?: boolean;
  dayOrderStatusText?: string;
}

export interface PostponementShiftInfo {
  isPostponed: boolean;
  sourceDay: DayOfWeek;
  sourceDateStr: string;
  isHoliday: boolean;
  isSuspended?: boolean;
  holiday?: HolidayRecord;
  suspendedRecord?: HolidayRecord;
  isCancelledDay: boolean;
  shiftOffsetCount: number;
  nominalDayOrder?: number;
  effectiveDayOrder?: number;
  carriedForwardFrom?: { dateStr: string; dayOrder: number; dayName: DayOfWeek };
  carriedForwardTo?: { dateStr: string; dayOrder: number; dayName: DayOfWeek };
  statusText?: string;
}

export interface AcademicDayOrderResult {
  dateStr: string;
  naturalDay: DayOfWeek;
  nominalDayOrder: number; // 1 to 5
  effectiveDayOrder: number; // 0 if holiday/suspended, otherwise 1 to 5
  effectiveDay: DayOfWeek; // Which day's curriculum is conducted
  isTeachingDay: boolean;
  isHoliday: boolean;
  isSuspended: boolean;
  isPostponedDay: boolean; // Day order was carried forward from an earlier date
  holiday?: HolidayRecord;
  suspendedRecord?: HolidayRecord;
  originalDayOrder?: number;
  carriedForwardFrom?: { dateStr: string; dayOrder: number; dayName: DayOfWeek };
  carriedForwardTo?: { dateStr: string; dayOrder: number; dayName: DayOfWeek };
  statusText: string;
}

/**
 * MASTER DAY ORDER RESOLVER
 * Strict Academic Rule Set:
 * 1. HOLIDAY: Entire day cancelled. Day order is CARRIED FORWARD to next working day.
 * 2. SUSPENDED: Cancelled for that particular day. Day order is NOT carried forward. Normal sequence continues.
 * 3. RESCHEDULED: Only selected class(es) move. Overall Day Order remains untouched.
 */
export function getAcademicDayOrderInfo(
  targetDateStr: string,
  holidays: HolidayRecord[] = [],
  teachingDays: DayOfWeek[] = DEFAULT_TEACHING_DAYS
): AcademicDayOrderResult {
  const targetDate = parseISODate(targetDateStr);
  const naturalDay = getCurrentDayOfWeek(targetDate);
  const N = teachingDays.length;
  const nominalIndex = teachingDays.indexOf(naturalDay);
  const nominalDayOrder = nominalIndex >= 0 ? nominalIndex + 1 : 1;

  if (!teachingDays.includes(naturalDay)) {
    return {
      dateStr: targetDateStr,
      naturalDay,
      nominalDayOrder: 0,
      effectiveDayOrder: 0,
      effectiveDay: naturalDay,
      isTeachingDay: false,
      isHoliday: false,
      isSuspended: false,
      isPostponedDay: false,
      statusText: 'Weekend / Non-teaching Day',
    };
  }

  // Find all holiday/suspended events
  const relevantHolidays = holidays.filter(h => h.date).sort((a, b) => a.date.localeCompare(b.date));

  // If no holidays or suspended events exist, standard day order sequence applies
  if (relevantHolidays.length === 0) {
    return {
      dateStr: targetDateStr,
      naturalDay,
      nominalDayOrder,
      effectiveDayOrder: nominalDayOrder,
      effectiveDay: naturalDay,
      isTeachingDay: true,
      isHoliday: false,
      isSuspended: false,
      isPostponedDay: false,
      statusText: `Day Order ${nominalDayOrder}`,
    };
  }

  const firstEvent = relevantHolidays[0];

  // If target date is strictly before the first holiday/suspended event:
  // No holiday or suspension has taken place yet, so standard nominal sequence applies
  if (targetDateStr < firstEvent.date) {
    return {
      dateStr: targetDateStr,
      naturalDay,
      nominalDayOrder,
      effectiveDayOrder: nominalDayOrder,
      effectiveDay: naturalDay,
      isTeachingDay: true,
      isHoliday: false,
      isSuspended: false,
      isPostponedDay: false,
      statusText: `Day Order ${nominalDayOrder}`,
    };
  }

  // Anchor the simulation starting from the first event date
  const firstEventDay = getCurrentDayOfWeek(parseISODate(firstEvent.date));
  const firstEventNominalIdx = teachingDays.indexOf(firstEventDay);
  const firstEventNominalOrder = firstEventNominalIdx >= 0 ? firstEventNominalIdx + 1 : 1;

  let currentOrder = (typeof firstEvent.originalDayOrder === 'number' && firstEvent.originalDayOrder > 0)
    ? firstEvent.originalDayOrder
    : ((typeof firstEvent.dayOrder === 'number' && firstEvent.dayOrder > 0)
      ? firstEvent.dayOrder
      : firstEventNominalOrder);

  const curr = parseISODate(firstEvent.date);
  const targetObj = parseISODate(targetDateStr);

  let lastHolidayCarriedOrder: number | null = null;
  let lastHolidayCarriedDate: string | null = null;
  let safetyCounter = 0;

  while (curr <= targetObj && safetyCounter < 500) {
    safetyCounter++;
    const currStr = formatDateToISO(curr);
    const currDay = getCurrentDayOfWeek(curr);

    if (teachingDays.includes(currDay)) {
      const hol = relevantHolidays.find(h => h.date === currStr);
      const isHol = hol && (hol.changeType === 'HOLIDAY' || hol.type === 'HOLIDAY' || hol.strategy === 'postpone' || (!hol.changeType && hol.strategy !== 'cancel'));
      const isSusp = hol && (hol.changeType === 'SUSPENDED' || hol.type === 'SUSPENDED' || hol.strategy === 'cancel' || hol.noReplacement);

      if (isHol) {
        // 1. HOLIDAY
        // Entire day's classes are cancelled.
        // Day order is CARRIED FORWARD to the next working day.
        const orig = (typeof hol.originalDayOrder === 'number' && hol.originalDayOrder > 0)
          ? hol.originalDayOrder
          : currentOrder;

        lastHolidayCarriedOrder = orig;
        lastHolidayCarriedDate = currStr;

        if (currStr === targetDateStr) {
          // Look ahead to find the next available teaching day
          let nextDateStr = targetDateStr;
          const lookahead = new Date(curr);
          for (let step = 1; step <= 21; step++) {
            lookahead.setDate(lookahead.getDate() + 1);
            const lhDay = getCurrentDayOfWeek(lookahead);
            const lhStr = formatDateToISO(lookahead);
            if (teachingDays.includes(lhDay) && !relevantHolidays.some(h => h.date === lhStr)) {
              nextDateStr = lhStr;
              break;
            }
          }

          return {
            dateStr: targetDateStr,
            naturalDay,
            nominalDayOrder,
            effectiveDayOrder: 0,
            effectiveDay: naturalDay,
            isTeachingDay: true,
            isHoliday: true,
            isSuspended: false,
            isPostponedDay: false,
            holiday: hol,
            originalDayOrder: orig,
            carriedForwardTo: {
              dateStr: nextDateStr,
              dayOrder: orig,
              dayName: teachingDays[orig - 1] || naturalDay,
            },
            statusText: `Holiday (Day Order ${orig} carried forward to ${formatDisplayDate(nextDateStr)})`,
          };
        }
        // RULE 1: HOLIDAY -> Day order is CARRIED FORWARD. currentOrder does NOT advance!
        currentOrder = orig;
      } else if (isSusp) {
        // 2. SUSPENDED
        // Classes cancelled for that particular day.
        // Day order is NOT carried forward.
        // Next applicable day follows the normal day-order sequence.
        const orig = (typeof hol.dayOrder === 'number' && hol.dayOrder > 0)
          ? hol.dayOrder
          : ((typeof hol.originalDayOrder === 'number' && hol.originalDayOrder > 0)
            ? hol.originalDayOrder
            : currentOrder);

        if (currStr === targetDateStr) {
          return {
            dateStr: targetDateStr,
            naturalDay,
            nominalDayOrder,
            effectiveDayOrder: 0,
            effectiveDay: naturalDay,
            isTeachingDay: true,
            isHoliday: false,
            isSuspended: true,
            isPostponedDay: false,
            suspendedRecord: hol,
            originalDayOrder: orig,
            statusText: `Suspended (Day Order ${orig} cancelled - No replacement)`,
          };
        }
        // RULE 2: SUSPENDED -> Day order is NOT carried forward. Normal sequence advances!
        currentOrder = (orig % N) + 1;
      } else {
        // Regular teaching day
        const conducted = currentOrder;
        const carriedFrom = (lastHolidayCarriedOrder === conducted && lastHolidayCarriedDate)
          ? { dateStr: lastHolidayCarriedDate, dayOrder: conducted, dayName: teachingDays[conducted - 1] || naturalDay }
          : undefined;

        if (currStr === targetDateStr) {
          const isShifted = conducted !== nominalDayOrder || Boolean(carriedFrom);
          return {
            dateStr: targetDateStr,
            naturalDay,
            nominalDayOrder,
            effectiveDayOrder: conducted,
            effectiveDay: teachingDays[conducted - 1] || naturalDay,
            isTeachingDay: true,
            isHoliday: false,
            isSuspended: false,
            isPostponedDay: isShifted,
            carriedForwardFrom: carriedFrom,
            statusText: `Day Order ${conducted}${carriedFrom ? ` (Carried forward from ${formatDisplayDate(carriedFrom.dateStr)})` : (isShifted ? ' (Shifted)' : '')}`,
          };
        }
        // Clear carried forward marker once conducted
        lastHolidayCarriedOrder = null;
        lastHolidayCarriedDate = null;
        currentOrder = (conducted % N) + 1;
      }
    }
    curr.setDate(curr.getDate() + 1);
  }

  return {
    dateStr: targetDateStr,
    naturalDay,
    nominalDayOrder,
    effectiveDayOrder: nominalDayOrder,
    effectiveDay: naturalDay,
    isTeachingDay: true,
    isHoliday: false,
    isSuspended: false,
    isPostponedDay: false,
    statusText: `Day Order ${nominalDayOrder}`,
  };
}

/**
 * Computes which curriculum day / slots are scheduled on `targetDateStr` based on holiday postponement rules.
 */
export function getAcademicPostponementInfo(
  targetDateStr: string,
  holidays: HolidayRecord[] = [],
  teachingDays: DayOfWeek[] = DEFAULT_TEACHING_DAYS
): PostponementShiftInfo {
  const dayOrderInfo = getAcademicDayOrderInfo(targetDateStr, holidays, teachingDays);

  return {
    isPostponed: dayOrderInfo.isPostponedDay,
    sourceDay: dayOrderInfo.effectiveDay,
    sourceDateStr: targetDateStr,
    isHoliday: dayOrderInfo.isHoliday,
    isSuspended: dayOrderInfo.isSuspended,
    holiday: dayOrderInfo.holiday,
    suspendedRecord: dayOrderInfo.suspendedRecord,
    isCancelledDay: dayOrderInfo.isHoliday || dayOrderInfo.isSuspended,
    shiftOffsetCount: dayOrderInfo.isPostponedDay ? 1 : 0,
    nominalDayOrder: dayOrderInfo.nominalDayOrder,
    effectiveDayOrder: dayOrderInfo.effectiveDayOrder,
    carriedForwardFrom: dayOrderInfo.carriedForwardFrom,
    carriedForwardTo: dayOrderInfo.carriedForwardTo,
    statusText: dayOrderInfo.statusText,
  };
}

/**
 * MASTER CLASS OCCURRENCE ENGINE (Single Source of Truth)
 * Determines the actual schedule for any specific date by:
 * 1. Evaluating University Holidays & Handling Strategy (Cancel vs Postpone vs Manual)
 * 2. Evaluating Automatic Timetable Postponement Shifts across Teaching Days
 * 3. Applying Date-Specific Exceptions (Cancelled, Moved Time, Rescheduled, Extra Classes)
 * 4. Priority Rule: DATE-SPECIFIC EXCEPTION strictly takes priority over REGULAR WEEKLY SCHEDULE.
 * 5. Computing dynamic timing status (upcoming, ongoing, concluded) and reminder intervals.
 * 6. Detecting schedule conflicts between concurrent sessions on destination dates.
 */
export function getClassOccurrencesForDate(
  dateInput: Date | string,
  subjects: SubjectCourse[],
  exceptions: ScheduleException[] = [],
  holidays: HolidayRecord[] = [],
  now: Date = new Date(),
  teachingDays: DayOfWeek[] = DEFAULT_TEACHING_DAYS,
  timetableSystem: TimetableSystem = 'day_order'
): DayOccurrencesResult {
  const dateObj = typeof dateInput === 'string' ? parseISODate(dateInput) : dateInput;
  const dateStr = typeof dateInput === 'string' ? dateInput : formatDateToISO(dateObj);
  const naturalDay = getCurrentDayOfWeek(dateObj);

  const todayStr = formatDateToISO(now);
  const isToday = dateStr === todayStr;
  const isPastDay = dateStr < todayStr;
  const isFutureDay = dateStr > todayStr;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // 1. Check Holiday & Day Order / Weekday mode for this date
  const isWeekdayMode = timetableSystem === 'weekday';

  let isHoliday = false;
  let isSuspended = false;
  let holiday: HolidayRecord | undefined;
  let suspendedRecord: HolidayRecord | undefined;
  let effectiveDay: DayOfWeek = naturalDay;
  let isPostponedDay = false;
  let nominalDayOrder = 0;
  let effectiveDayOrder = 0;
  let carriedForwardFrom: { dateStr: string; dayOrder: number; dayName: DayOfWeek } | undefined;
  let carriedForwardTo: { dateStr: string; dayOrder: number; dayName: DayOfWeek } | undefined;
  let dayOrderStatusText: string = naturalDay;
  let postponeInfo: ReturnType<typeof getAcademicPostponementInfo> | undefined;

  if (isWeekdayMode) {
    // WEEKDAY TIMETABLE SYSTEM:
    // Natural calendar day (Monday–Sunday) is the single source of truth.
    // Holiday cancels classes on that specific date.
    // Suspended cancels classes on that specific date.
    // No cyclical day-order carry-forward is applied.
    holiday = holidays.find(h => h.date === dateStr && (h.type === 'HOLIDAY' || h.changeType === 'HOLIDAY' || (!h.type && !h.noReplacement)));
    suspendedRecord = holidays.find(h => h.date === dateStr && (h.type === 'SUSPENDED' || h.changeType === 'SUSPENDED' || h.noReplacement));
    isHoliday = Boolean(holiday);
    isSuspended = Boolean(suspendedRecord);
    effectiveDay = naturalDay;
    isPostponedDay = false;
    dayOrderStatusText = isHoliday
      ? `${holiday?.name || 'Holiday'} (Cancelled)`
      : isSuspended
      ? `${suspendedRecord?.reason || suspendedRecord?.name || 'Classes Suspended'}`
      : naturalDay;
  } else {
    // DAY ORDER TIMETABLE SYSTEM:
    // Uses cyclical Day Order (1, 2, 3...) with Holiday carry-forward and Suspended logic.
    postponeInfo = getAcademicPostponementInfo(dateStr, holidays, teachingDays);
    isHoliday = postponeInfo.isHoliday;
    isSuspended = Boolean(postponeInfo.isSuspended);
    holiday = postponeInfo.holiday;
    suspendedRecord = postponeInfo.suspendedRecord;
    effectiveDay = postponeInfo.sourceDay || naturalDay;
    isPostponedDay = postponeInfo.isPostponed;
    nominalDayOrder = postponeInfo.nominalDayOrder || 1;
    effectiveDayOrder = postponeInfo.effectiveDayOrder || 0;
    carriedForwardFrom = postponeInfo.carriedForwardFrom;
    carriedForwardTo = postponeInfo.carriedForwardTo;
    dayOrderStatusText = postponeInfo.statusText || `Day Order ${effectiveDayOrder || nominalDayOrder}`;
  }

  const occurrences: ClassOccurrence[] = [];

  // If this date is a holiday or suspended, no regular classes are conducted on that date
  if (isHoliday || isSuspended) {
    // Generate cancelled occurrence items for natural day's regular slots so students clearly see cancellation status
    for (let idx = 0; idx < subjects.length; idx++) {
      const subject = subjects[idx];
      const subjectColor = getSubjectColor(idx, subject.color);
      const regularSlots = (subject.timetable || []).filter(s => s.day === naturalDay);

      for (const slot of regularSlots) {
        const startMin = parseTimeToMinutes(slot.startTime);
        const endMin = parseTimeToMinutes(slot.endTime);
        const reasonText = isWeekdayMode
          ? (isHoliday
              ? `${holiday?.name || 'Holiday'} (Classes Cancelled)`
              : `${suspendedRecord?.name || suspendedRecord?.reason || 'Classes Suspended'}`)
          : (isHoliday
              ? `${holiday?.name || 'University Holiday'} (Day Order ${nominalDayOrder || 1} Carried Forward to Next Working Day)`
              : `${suspendedRecord?.name || suspendedRecord?.reason || 'Classes Suspended'} (Day Order ${nominalDayOrder || 1} Cancelled - Not Carried Forward)`);

        occurrences.push({
          id: `occ_${isHoliday ? 'hol' : 'susp'}_${subject.id}_${slot.id}_${dateStr}`,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor,
          subjectCode: subject.code,
          date: dateStr,
          day: naturalDay,
          dayOrder: isWeekdayMode ? undefined : (nominalDayOrder || 1),
          startTime: slot.startTime,
          endTime: slot.endTime,
          startMinutes: startMin,
          endMinutes: endMin,
          room: slot.room,
          instructor: slot.instructor,
          type: 'regular',
          isCancelled: true,
          isHoliday,
          isSuspended,
          holidayName: holiday?.name,
          reason: reasonText,
          originalSlotId: slot.id,
          reminderEnabled: false,
          reminderMinutes: slot.reminderMinutes || 20,
          status: 'concluded',
          minutesUntilStart: 9999,
          minutesUntilEnd: 9999,
          formattedTimeRange: `${formatMinutesToTime12Hour(startMin)} - ${formatMinutesToTime12Hour(endMin)}`,
        });
      }
    }
  } else {
    // Regular or Postponed Teaching Day
    const isTeachingDay = isWeekdayMode ? true : teachingDays.includes(naturalDay);

    if (isTeachingDay) {
      // Evaluate slots from the effectiveDay (source day of curriculum)
      for (let idx = 0; idx < subjects.length; idx++) {
        const subject = subjects[idx];
        const subjectColor = getSubjectColor(idx, subject.color);
        const sourceSlots = (subject.timetable || []).filter(s => s.day === effectiveDay);

        for (const slot of sourceSlots) {
          // Find matching exception for this subject & slot/date
          const matchingEx = exceptions.find(ex => {
            if (ex.subjectId !== subject.id) return false;
            const exDate = ex.originalDate || ex.date;
            if (exDate !== dateStr) return false;

            // 1. If exception explicitly specifies an originalSlotId, it must match this slot
            if (ex.originalSlotId && ex.originalSlotId === slot.id) return true;

            // 2. If exception explicitly specifies originalStartTime, compare with minute-level precision
            if (ex.originalStartTime) {
              const exStartMin = parseTimeToMinutes(ex.originalStartTime);
              const slotStartMin = parseTimeToMinutes(slot.startTime);
              return exStartMin === slotStartMin;
            }

            // 3. For RESCHEDULED change: MUST be target-specific.
            // If neither slotId nor time was provided, only match if this subject has exactly 1 slot on this day
            if (ex.changeType === 'RESCHEDULED' || ex.type === 'rescheduled_date') {
              if (ex.originalSlotId) return ex.originalSlotId === slot.id;
              return sourceSlots.length === 1;
            }

            // 4. Other types (e.g. cancelled whole day for subject)
            if (ex.type === 'cancelled' && !ex.originalSlotId) return true;
            if (ex.type === 'moved_time') {
              return ex.originalSlotId === slot.id || sourceSlots.length === 1;
            }

            return false;
          });

          // Also check multi-class rescheduled array
          const matchingClassDetail = exceptions
            .flatMap(ex => ex.classes || [])
            .find(c => {
              if (c.subjectId !== subject.id) return false;
              if (c.originalDate !== dateStr) return false;
              if (c.originalSlotId && c.originalSlotId === slot.id) return true;
              if (c.originalStartTime) {
                return parseTimeToMinutes(c.originalStartTime) === parseTimeToMinutes(slot.startTime);
              }
              return false;
            });

          let startTime = slot.startTime;
          let endTime = slot.endTime;
          let room = slot.room;
          let instructor = slot.instructor;
          let type: 'regular' | 'moved_time' | 'rescheduled' | 'extra' | 'postponed' = isPostponedDay
            ? 'postponed'
            : 'regular';
          let isCancelled = false;
          let reason: string | undefined = isPostponedDay
            ? `Day Order ${effectiveDayOrder} (Carried forward from ${carriedForwardFrom?.dateStr || 'holiday'})`
            : undefined;
          let originalDate: string | undefined = isPostponedDay ? (carriedForwardFrom?.dateStr || postponeInfo?.sourceDateStr) : undefined;
          let originalTime: string | undefined = undefined;
          let exceptionId: string | undefined = undefined;
          let reminderEnabled = slot.reminderEnabled;
          let reminderMinutes = slot.reminderMinutes || 20;

          if (matchingClassDetail) {
            isCancelled = true;
            type = 'rescheduled';
            reason = matchingClassDetail.reason
              ? `${matchingClassDetail.reason} (Rescheduled to ${matchingClassDetail.newDate} at ${matchingClassDetail.newStartTime})`
              : `Rescheduled to ${matchingClassDetail.newDate} at ${matchingClassDetail.newStartTime}`;
          } else if (matchingEx) {
            exceptionId = matchingEx.id;
            reason = matchingEx.reason || reason;
            if (matchingEx.reminderEnabled !== undefined) {
              reminderEnabled = matchingEx.reminderEnabled;
            }
            if (matchingEx.reminderMinutes !== undefined) {
              reminderMinutes = matchingEx.reminderMinutes;
            }

            if (matchingEx.changeType === 'RESCHEDULED' || matchingEx.type === 'rescheduled_date') {
              isCancelled = true;
              type = 'rescheduled';
              reason = matchingEx.reason
                ? `${matchingEx.reason} (Rescheduled to ${matchingEx.newDate} at ${matchingEx.newStartTime || startTime})`
                : `Rescheduled to ${matchingEx.newDate} at ${matchingEx.newStartTime || startTime}`;
            } else if (matchingEx.type === 'cancelled') {
              isCancelled = true;
              type = isPostponedDay ? 'postponed' : 'regular';
              reason = matchingEx.reason || 'Class Cancelled';
            } else if (matchingEx.type === 'moved_time') {
              type = 'moved_time';
              isCancelled = false;
              startTime = matchingEx.newStartTime || startTime;
              endTime = matchingEx.newEndTime || endTime;
              if (matchingEx.newRoom) room = matchingEx.newRoom;
              if (matchingEx.newInstructor) instructor = matchingEx.newInstructor;
            }
          }

          const startMin = parseTimeToMinutes(startTime);
          const endMin = parseTimeToMinutes(endTime);

          let status: 'upcoming' | 'ongoing' | 'concluded' = 'upcoming';
          if (isPastDay) {
            status = 'concluded';
          } else if (isFutureDay) {
            status = 'upcoming';
          } else {
            if (currentMinutes >= endMin) {
              status = 'concluded';
            } else if (currentMinutes >= startMin && currentMinutes < endMin) {
              status = 'ongoing';
            } else {
              status = 'upcoming';
            }
          }

          occurrences.push({
            id: `occ_${subject.id}_${slot.id}_${dateStr}`,
            subjectId: subject.id,
            subjectName: subject.name,
            subjectColor,
            subjectCode: subject.code,
            date: dateStr,
            day: naturalDay,
            dayOrder: isWeekdayMode ? undefined : (effectiveDayOrder || nominalDayOrder || 1),
            startTime,
            endTime,
            startMinutes: startMin,
            endMinutes: endMin,
            room,
            instructor,
            type,
            isCancelled,
            isHoliday: false,
            reason,
            originalDate,
            originalTime,
            originalDay: isPostponedDay ? (carriedForwardFrom?.dayName || postponeInfo?.sourceDay) : undefined,
            isPostponed: isPostponedDay,
            postponedFromDate: isPostponedDay ? (carriedForwardFrom?.dateStr || postponeInfo?.sourceDateStr) : undefined,
            postponedFromDay: isPostponedDay ? (carriedForwardFrom?.dayName || postponeInfo?.sourceDay) : undefined,
            exceptionId,
            originalSlotId: slot.id,
            reminderEnabled: isCancelled ? false : reminderEnabled,
            reminderMinutes,
            status,
            minutesUntilStart: isToday ? startMin - currentMinutes : 9999,
            minutesUntilEnd: isToday ? endMin - currentMinutes : 9999,
            formattedTimeRange: `${formatMinutesToTime12Hour(startMin)} - ${formatMinutesToTime12Hour(endMin)}`,
          });
        }
      }
    }

    // 3. Check for Rescheduled classes landing on THIS date
    for (const subject of subjects) {
      const subjectColor = getSubjectColor(subjects.indexOf(subject), subject.color);
      const incomingRescheduled = exceptions.filter(
        ex =>
          ex.subjectId === subject.id &&
          (ex.type === 'rescheduled_date' || ex.changeType === 'RESCHEDULED') &&
          ex.newDate === dateStr
      );

      for (const resEx of incomingRescheduled) {
        const startTime = resEx.newStartTime || '10:00 AM';
        const endTime = resEx.newEndTime || '11:00 AM';
        const startMin = parseTimeToMinutes(startTime);
        const endMin = parseTimeToMinutes(endTime);

        let status: 'upcoming' | 'ongoing' | 'concluded' = 'upcoming';
        if (isPastDay) {
          status = 'concluded';
        } else if (isFutureDay) {
          status = 'upcoming';
        } else {
          if (currentMinutes >= endMin) {
            status = 'concluded';
          } else if (currentMinutes >= startMin && currentMinutes < endMin) {
            status = 'ongoing';
          } else {
            status = 'upcoming';
          }
        }

        occurrences.push({
          id: `occ_res_${resEx.id}_${dateStr}`,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor,
          subjectCode: subject.code,
          date: dateStr,
          day: naturalDay,
          dayOrder: isWeekdayMode ? undefined : (effectiveDayOrder || nominalDayOrder || 1),
          startTime,
          endTime,
          startMinutes: startMin,
          endMinutes: endMin,
          room: resEx.newRoom || 'TBA',
          instructor: resEx.newInstructor,
          type: 'rescheduled',
          isCancelled: false,
          isHoliday: false,
          reason: resEx.reason || `Rescheduled from ${resEx.originalDate || resEx.date}`,
          originalDate: resEx.originalDate || resEx.date,
          originalTime: `${resEx.originalStartTime || ''}`,
          exceptionId: resEx.id,
          originalSlotId: resEx.originalSlotId,
          reminderEnabled: resEx.reminderEnabled ?? true,
          reminderMinutes: resEx.reminderMinutes ?? 20,
          status,
          minutesUntilStart: isToday ? startMin - currentMinutes : 9999,
          minutesUntilEnd: isToday ? endMin - currentMinutes : 9999,
          formattedTimeRange: `${formatMinutesToTime12Hour(startMin)} - ${formatMinutesToTime12Hour(endMin)}`,
        });
      }

      // Check multi-class rescheduled arrivals
      const multiClassArrivals = exceptions
        .flatMap(ex => ex.classes || [])
        .filter(c => c.subjectId === subject.id && c.newDate === dateStr);

      for (const cls of multiClassArrivals) {
        const startTime = cls.newStartTime || '10:00 AM';
        const endTime = cls.newEndTime || '11:00 AM';
        const startMin = parseTimeToMinutes(startTime);
        const endMin = parseTimeToMinutes(endTime);

        let status: 'upcoming' | 'ongoing' | 'concluded' = 'upcoming';
        if (isPastDay) {
          status = 'concluded';
        } else if (isFutureDay) {
          status = 'upcoming';
        } else {
          if (currentMinutes >= endMin) {
            status = 'concluded';
          } else if (currentMinutes >= startMin && currentMinutes < endMin) {
            status = 'ongoing';
          } else {
            status = 'upcoming';
          }
        }

        occurrences.push({
          id: `occ_res_multi_${cls.subjectId}_${cls.newDate}_${startMin}`,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor,
          subjectCode: subject.code,
          date: dateStr,
          day: naturalDay,
          dayOrder: isWeekdayMode ? undefined : (effectiveDayOrder || nominalDayOrder || 1),
          startTime,
          endTime,
          startMinutes: startMin,
          endMinutes: endMin,
          room: cls.newRoom || 'TBA',
          instructor: cls.newInstructor,
          type: 'rescheduled',
          isCancelled: false,
          isHoliday: false,
          reason: cls.reason || `Rescheduled from ${cls.originalDate}`,
          originalDate: cls.originalDate,
          originalTime: cls.originalStartTime,
          originalSlotId: cls.originalSlotId,
          reminderEnabled: true,
          reminderMinutes: 20,
          status,
          minutesUntilStart: isToday ? startMin - currentMinutes : 9999,
          minutesUntilEnd: isToday ? endMin - currentMinutes : 9999,
          formattedTimeRange: `${formatMinutesToTime12Hour(startMin)} - ${formatMinutesToTime12Hour(endMin)}`,
        });
      }

      // 4. Check for Extra / Compensation classes on THIS date
      const extraClasses = exceptions.filter(
        ex => ex.subjectId === subject.id && ex.type === 'extra_class' && ex.date === dateStr
      );

      for (const extraEx of extraClasses) {
        const startTime = extraEx.newStartTime || '10:00 AM';
        const endTime = extraEx.newEndTime || '11:00 AM';
        const startMin = parseTimeToMinutes(startTime);
        const endMin = parseTimeToMinutes(endTime);

        let status: 'upcoming' | 'ongoing' | 'concluded' = 'upcoming';
        if (isPastDay) {
          status = 'concluded';
        } else if (isFutureDay) {
          status = 'upcoming';
        } else {
          if (currentMinutes >= endMin) {
            status = 'concluded';
          } else if (currentMinutes >= startMin && currentMinutes < endMin) {
            status = 'ongoing';
          } else {
            status = 'upcoming';
          }
        }

        occurrences.push({
          id: `occ_extra_${extraEx.id}_${dateStr}`,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor,
          subjectCode: subject.code,
          date: dateStr,
          day: naturalDay,
          dayOrder: isWeekdayMode ? undefined : (effectiveDayOrder || nominalDayOrder || 1),
          startTime,
          endTime,
          startMinutes: startMin,
          endMinutes: endMin,
          room: extraEx.newRoom || 'TBA',
          instructor: extraEx.newInstructor,
          type: 'extra',
          isCancelled: false,
          isHoliday: false,
          reason: extraEx.reason || 'Extra / Compensation Class',
          exceptionId: extraEx.id,
          reminderEnabled: extraEx.reminderEnabled ?? true,
          reminderMinutes: extraEx.reminderMinutes ?? 20,
          status,
          minutesUntilStart: isToday ? startMin - currentMinutes : 9999,
          minutesUntilEnd: isToday ? endMin - currentMinutes : 9999,
          formattedTimeRange: `${formatMinutesToTime12Hour(startMin)} - ${formatMinutesToTime12Hour(endMin)}`,
        });
      }
    }
  }

  // Sort chronologically by startMinutes
  occurrences.sort((a, b) => a.startMinutes - b.startMinutes);

  const activeOccurrences = occurrences.filter(o => !o.isCancelled);

  // 5. Conflict Detection: Check for overlapping active occurrences on the same date
  let hasAnyConflict = false;
  for (let i = 0; i < activeOccurrences.length; i++) {
    for (let j = i + 1; j < activeOccurrences.length; j++) {
      const occA = activeOccurrences[i];
      const occB = activeOccurrences[j];

      // If intervals overlap: startA < endB and endA > startB
      if (occA.startMinutes < occB.endMinutes && occA.endMinutes > occB.startMinutes) {
        hasAnyConflict = true;
        occA.hasConflict = true;
        occA.conflictWith = occB.subjectName;
        occA.conflictDetails = `Overlaps with ${occB.subjectName} (${occB.formattedTimeRange})`;

        occB.hasConflict = true;
        occB.conflictWith = occA.subjectName;
        occB.conflictDetails = `Overlaps with ${occA.subjectName} (${occA.formattedTimeRange})`;
      }
    }
  }

  return {
    dateStr,
    day: naturalDay,
    weekdayName: naturalDay,
    timetableSystem,
    dayOrder: isWeekdayMode ? undefined : (effectiveDayOrder || nominalDayOrder || 1),
    effectiveDayOrder: isWeekdayMode ? undefined : effectiveDayOrder,
    isHoliday,
    isSuspended,
    holiday,
    suspendedRecord,
    isPostponedDay,
    postponedFromDay: isWeekdayMode ? undefined : effectiveDay,
    postponedFromDate: isWeekdayMode ? undefined : (carriedForwardFrom ? carriedForwardFrom.dateStr : dateStr),
    carriedForwardFrom,
    carriedForwardTo,
    occurrences,
    activeOccurrences,
    hasAnyConflict,
    dayOrderStatusText,
  };
}

/**
 * Get upcoming active occurrences across next N days (skips cancelled classes and holidays).
 */
export function getUpcomingOccurrences(
  subjects: SubjectCourse[],
  exceptions: ScheduleException[] = [],
  holidays: HolidayRecord[] = [],
  now: Date = new Date(),
  daysAhead: number = 7,
  teachingDays: DayOfWeek[] = DEFAULT_TEACHING_DAYS,
  timetableSystem: TimetableSystem = 'day_order'
): ClassOccurrence[] {
  const upcoming: ClassOccurrence[] = [];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let i = 0; i < daysAhead; i++) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + i);
    const dayResult = getClassOccurrencesForDate(
      targetDate,
      subjects,
      exceptions,
      holidays,
      now,
      teachingDays,
      timetableSystem
    );

    for (const occ of dayResult.activeOccurrences) {
      if (i === 0) {
        // For today: only include if class hasn't finished yet
        if (occ.endMinutes > currentMinutes) {
          upcoming.push(occ);
        }
      } else {
        // For future days: all active occurrences
        upcoming.push(occ);
      }
    }
  }

  return upcoming;
}

export interface UpcomingClassItem {
  slot: TimetableSlot;
  subject: SubjectCourse;
  status: 'upcoming' | 'ongoing' | 'concluded';
  minutesUntilStart: number;
  minutesUntilEnd: number;
  formattedTimeRange: string;
}

/**
 * Backward compatibility wrapper for getTodaysClassSchedule
 */
export function getTodaysClassSchedule(
  subjects: SubjectCourse[],
  now: Date = new Date(),
  exceptions: ScheduleException[] = [],
  holidays: HolidayRecord[] = [],
  teachingDays: DayOfWeek[] = DEFAULT_TEACHING_DAYS
): UpcomingClassItem[] {
  const dayResult = getClassOccurrencesForDate(
    now,
    subjects,
    exceptions,
    holidays,
    now,
    teachingDays
  );
  return dayResult.activeOccurrences.map(occ => {
    const subject = subjects.find(s => s.id === occ.subjectId) || {
      id: occ.subjectId,
      name: occ.subjectName,
      credits: 3,
      evaluationMode: 'components' as const,
      components: [],
      color: occ.subjectColor,
    };

    const slot: TimetableSlot = {
      id: occ.originalSlotId || occ.id,
      subjectId: occ.subjectId,
      day: occ.day,
      startTime: occ.startTime,
      endTime: occ.endTime,
      room: occ.room,
      instructor: occ.instructor,
      reminderEnabled: occ.reminderEnabled,
      reminderMinutes: occ.reminderMinutes,
    };

    return {
      slot,
      subject,
      status: occ.status,
      minutesUntilStart: occ.minutesUntilStart,
      minutesUntilEnd: occ.minutesUntilEnd,
      formattedTimeRange: occ.formattedTimeRange,
    };
  });
}

/**
 * Formats a clean dual header label respecting TimetableSystem:
 * - If Day Order: returns both Weekday and Day Order (e.g. "Monday • Day Order 3")
 * - If Weekday: returns the natural Weekday (e.g. "Monday")
 */
export function formatTimetableDayHeader(
  dateStr: string,
  dayOrder?: number,
  system: TimetableSystem = 'day_order'
): { weekday: DayOfWeek; dayOrderText?: string; fullLabel: string } {
  const dateObj = parseISODate(dateStr);
  const weekday = getCurrentDayOfWeek(dateObj);
  if (system === 'day_order' && typeof dayOrder === 'number' && dayOrder > 0) {
    const doText = `Day Order ${dayOrder}`;
    return {
      weekday,
      dayOrderText: doText,
      fullLabel: `${weekday} • ${doText}`,
    };
  }
  return {
    weekday,
    fullLabel: weekday,
  };
}

