import {
  calculateComponentScaled,
  calculateSubjectFromComponents,
  calculateOverallSgpa,
  calculateOverallCgpa,
  calculateAttendanceMetrics,
  getDefaultGradingScales,
  SubjectCourse,
  SemesterRecord,
} from './gpaCalculatorEngine';

console.log('=== RUNNING GPA+ ENGINE COMPREHENSIVE TEST SUITE ===\n');

let passedCount = 0;
let totalCount = 0;

function assert(description: string, condition: boolean, actual?: any, expected?: any) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`✅ [PASS] ${description}`);
  } else {
    console.error(`❌ [FAIL] ${description}`);
    if (actual !== undefined || expected !== undefined) {
      console.error(`   Expected:`, expected);
      console.error(`   Actual:  `, actual);
    }
  }
}

// 1. Normal Component (18 / 20)
const normalComp = calculateComponentScaled(18, 20, false);
assert(
  '1. Normal Component (18/20) contributes 18/20 raw without scaling',
  normalComp.contributionObtained === 18 && normalComp.contributionMax === 20 && normalComp.isValid,
  normalComp
);

// 2. Scaling (40 / 50 -> scaled to 15)
const scaledComp1 = calculateComponentScaled(40, 50, true, 15);
assert(
  '2. Integer Scaling: 40/50 scaled to 15 yields exactly 12/15',
  scaledComp1.contributionObtained === 12 && scaledComp1.contributionMax === 15 && scaledComp1.isValid,
  scaledComp1
);

// 3. Decimal scaling (42 / 50 -> scaled to 15)
const scaledComp2 = calculateComponentScaled(42, 50, true, 15);
assert(
  '3. Decimal Scaling: 42/50 scaled to 15 yields exactly 12.6/15',
  scaledComp2.contributionObtained === 12.6 && scaledComp2.contributionMax === 15 && scaledComp2.isValid,
  scaledComp2
);

// 4 & 5. Subject total with mixed scaled/non-scaled components & percentage
// FA1: 15/20, FA2: 17/20, FT: 40/50 -> 15 (12/15), Final: 70/100 -> 50 (35/50)
const srmScale = getDefaultGradingScales()[0].bands;
const testSubject: SubjectCourse = {
  id: 'sub-1',
  name: 'Computer Networks',
  credits: 4,
  evaluationMode: 'components',
  components: [
    { id: 'c1', name: 'FA 1', obtainedMarks: 15, maximumMarks: 20, isScaled: false },
    { id: 'c2', name: 'FA 2', obtainedMarks: 17, maximumMarks: 20, isScaled: false },
    { id: 'c3', name: 'FT', obtainedMarks: 40, maximumMarks: 50, isScaled: true, scaledMaximum: 15 },
    { id: 'c4', name: 'Final Exam', obtainedMarks: 70, maximumMarks: 100, isScaled: true, scaledMaximum: 50 },
  ],
};

const subjectResult = calculateSubjectFromComponents(testSubject, srmScale);
// Total: 15 + 17 + 12 + 35 = 79 / (20 + 20 + 15 + 50 = 105)
// Percentage: (79 / 105) * 100 = 75.238% -> 75.24%
// Grade for 75.24% in SRM scale (70-79.99): A (8 pts)
assert(
  '4. Subject Total with Mixed Scaled Components gives 79/105',
  subjectResult.totalContributionObtained === 79 && subjectResult.totalContributionMax === 105,
  { obtained: subjectResult.totalContributionObtained, max: subjectResult.totalContributionMax },
  { obtained: 79, max: 105 }
);

assert(
  '5. Subject Percentage calculation: 79/105 * 100 = 75.24%',
  subjectResult.percentage === 75.24 && subjectResult.grade === 'A' && subjectResult.gradePoint === 8,
  { percentage: subjectResult.percentage, grade: subjectResult.grade, gp: subjectResult.gradePoint }
);

// 6. GPA with different credits
// Course 1: 4 credits, Grade Point 10 (40 weighted)
// Course 2: 3 credits, Grade Point 9 (27 weighted)
// GPA: (40 + 27) / 7 = 67 / 7 = 9.57
const testCoursesForGpa: SubjectCourse[] = [
  {
    id: 'c1',
    name: 'Computer Networks',
    credits: 4,
    evaluationMode: 'direct_grade',
    components: [],
    directGradePoint: 10,
    directGradeName: 'O',
  },
  {
    id: 'c2',
    name: 'Data Structures',
    credits: 3,
    evaluationMode: 'direct_grade',
    components: [],
    directGradePoint: 9,
    directGradeName: 'A+',
  },
];

const sgpaResult = calculateOverallSgpa(testCoursesForGpa, srmScale);
assert(
  '6. GPA with different credits: (4*10 + 3*9)/(4+3) = 9.57',
  sgpaResult.sgpa === 9.57 && sgpaResult.totalCredits === 7 && sgpaResult.totalWeightedPoints === 67,
  sgpaResult
);

// 7. CGPA with different semester credits
// Sem 1: 22 credits, 8.4 SGPA (184.8)
// Sem 2: 24 credits, 8.7 SGPA (208.8)
// Total Weighted: 393.6, Total Credits: 46 -> 393.6 / 46 = 8.56
const testSemesters: SemesterRecord[] = [
  { id: 's1', semesterName: 'Semester 1', totalCredits: 22, sgpa: 8.4 },
  { id: 's2', semesterName: 'Semester 2', totalCredits: 24, sgpa: 8.7 },
];

const cgpaResult = calculateOverallCgpa(testSemesters);
assert(
  '7. CGPA with different semester credits: (22*8.4 + 24*8.7)/46 = 8.56',
  cgpaResult.cgpa === 8.56 && cgpaResult.totalCredits === 46 && cgpaResult.totalWeightedPoints === 393.6,
  cgpaResult
);

// 8. Attendance Percentage: 52 / 60 = 86.67%
const att1 = calculateAttendanceMetrics(60, 52, 75);
assert(
  '8. Attendance Percentage: 52 / 60 = 86.67%',
  att1.percentage === 86.67 && att1.absent === 8 && att1.isTargetMet === true,
  att1
);

// 9a. Attendance Target Missable Classes:
// P = 52, T = 60, Target = 75% -> max missable: floor((52/0.75) - 60) = floor(69.33 - 60) = 9
assert(
  '9a. Attendance Target Missable: 52/60 with 75% target can miss 9 classes',
  att1.canMissClasses === 9 && att1.neededClasses === 0,
  { canMiss: att1.canMissClasses, needed: att1.neededClasses }
);

// 9b. Attendance Target Needed Classes:
// P = 40, T = 60, Target = 75% -> needed: ceil((0.75 * 60 - 40) / (1 - 0.75)) = ceil((45 - 40) / 0.25) = ceil(5 / 0.25) = 20
const att2 = calculateAttendanceMetrics(60, 40, 75);
assert(
  '9b. Attendance Target Needed: 40/60 with 75% target needs 20 consecutive classes',
  att2.neededClasses === 20 && att2.isTargetMet === false && att2.canMissClasses === 0,
  { needed: att2.neededClasses, isTargetMet: att2.isTargetMet }
);

// 10. Invalid inputs handling
const invalidComp1 = calculateComponentScaled(-5, 20, false);
assert('10a. Negative marks rejected safely', !invalidComp1.isValid);

const invalidComp2 = calculateComponentScaled(25, 20, false);
assert('10b. Obtained > Maximum rejected safely', !invalidComp2.isValid);

const invalidComp3 = calculateComponentScaled(15, 0, false);
assert('10c. Zero maximum marks rejected safely', !invalidComp3.isValid);

const invalidAtt = calculateAttendanceMetrics(50, 60, 75);
assert('10d. Present > Conducted attendance rejected safely', !invalidAtt.isValid);

const impossibleAtt = calculateAttendanceMetrics(50, 48, 100);
assert('10e. 100% target when absences exist flagged as impossible', impossibleAtt.isTargetImpossible);

// 11. Timetable System Verification (Day Order vs Weekday)
import {
  formatTimetableDayHeader,
  getClassOccurrencesForDate,
  getCurrentDayOfWeek,
  parseISODate,
} from './gpaCalculatorEngine';

// 11a. Actual weekday calculation from date
const date1 = parseISODate('2026-10-05'); // Monday
assert('11a. 2026-10-05 correctly calculates to Monday', getCurrentDayOfWeek(date1) === 'Monday');

// 11b. Header formatting: Day Order mode displays both Weekday + Day Order
const dayOrderHeader = formatTimetableDayHeader('2026-10-05', 3, 'day_order');
assert(
  '11b. Day Order mode formats dual label (Monday • Day Order 3)',
  dayOrderHeader.weekday === 'Monday' &&
    dayOrderHeader.dayOrderText === 'Day Order 3' &&
    dayOrderHeader.fullLabel === 'Monday • Day Order 3'
);

// 11c. Header formatting: Weekday mode displays Weekday only (no Day Order)
const weekdayHeader = formatTimetableDayHeader('2026-10-05', 3, 'weekday');
assert(
  '11c. Weekday mode formats natural weekday (Monday)',
  weekdayHeader.weekday === 'Monday' &&
    weekdayHeader.dayOrderText === undefined &&
    weekdayHeader.fullLabel === 'Monday'
);

// 11d. Weekday mode occurrence mapping
const sampleSubjects: SubjectCourse[] = [
  {
    id: 'sub-test-1',
    name: 'Operating Systems',
    credits: 3,
    evaluationMode: 'components',
    components: [],
    timetable: [
      { id: 'sl-1', subjectId: 'sub-test-1', day: 'Monday', startTime: '09:00 AM', endTime: '10:00 AM', reminderEnabled: false, reminderMinutes: 20 },
      { id: 'sl-2', subjectId: 'sub-test-1', day: 'Tuesday', startTime: '11:00 AM', endTime: '12:00 PM', reminderEnabled: false, reminderMinutes: 20 },
    ],
  },
];

const monOcc = getClassOccurrencesForDate('2026-10-05', sampleSubjects, [], [], new Date('2026-10-05T08:00:00Z'), undefined, 'weekday');
assert(
  '11d. Weekday mode accurately maps Monday slots on Monday without dayOrder property',
  monOcc.occurrences.length === 1 && monOcc.occurrences[0].subjectName === 'Operating Systems' && monOcc.dayOrder === undefined
);

// 11e. Holiday in Weekday mode marks classes cancelled without carry-forward
const holidayResult = getClassOccurrencesForDate(
  '2026-10-05',
  sampleSubjects,
  [],
  [{ id: 'h1', date: '2026-10-05', name: 'University Holiday', strategy: 'cancel', createdAt: Date.now() }],
  new Date('2026-10-05T08:00:00Z'),
  undefined,
  'weekday'
);
assert(
  '11e. Weekday mode marks holiday as cancelled without day order shifting',
  holidayResult.isHoliday && holidayResult.activeOccurrences.length === 0 && !holidayResult.isPostponedDay
);

// 11f. Day Order mode carries forward on holiday to next working day
const dayOrderResult = getClassOccurrencesForDate(
  '2026-10-05',
  sampleSubjects,
  [],
  [],
  new Date('2026-10-05T08:00:00Z'),
  undefined,
  'day_order'
);
assert(
  '11f. Day Order mode provides dayOrder number (1)',
  dayOrderResult.dayOrder === 1 && dayOrderResult.day === 'Monday'
);

// 12. Add Regular Schedule Selector tests (DO1, DO2... vs Monday–Sunday)
import {
  DAY_ORDER_SCHEDULE_OPTIONS,
  WEEKDAY_SCHEDULE_OPTIONS,
  getScheduleDayOptions,
  formatSlotDay,
} from './gpaCalculatorEngine';

// 12a. Day Order selector returns DO1 through DO6 options
const doOptions = getScheduleDayOptions('day_order');
assert(
  '12a. Day Order selector presents DO1, DO2, DO3, DO4, DO5, DO6 options',
  doOptions.length === 6 &&
    doOptions[0].label === 'DO1' &&
    doOptions[0].value === 'Monday' &&
    doOptions[1].label === 'DO2' &&
    doOptions[4].label === 'DO5'
);

// 12b. Weekday selector returns Monday–Sunday (7 options)
const weekdayOptions = getScheduleDayOptions('weekday');
assert(
  '12b. Weekday selector presents Monday through Sunday (7 days)',
  weekdayOptions.length === 7 &&
    weekdayOptions[0].label === 'Monday' &&
    weekdayOptions[6].label === 'Sunday'
);

// 12c. formatSlotDay maps Monday to DO1 in day_order mode and Monday in weekday mode
assert(
  '12c. formatSlotDay properly formats DO label in day_order and weekday label in weekday',
  formatSlotDay('Monday', 'day_order') === 'DO1' &&
    formatSlotDay('Wednesday', 'day_order') === 'DO3' &&
    formatSlotDay('Monday', 'weekday') === 'Monday'
);

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passedCount} / ${totalCount} PASSED`);
console.log(`========================================\n`);

if (passedCount !== totalCount) {
  process.exit(1);
}
