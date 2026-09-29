export const INSTITUTE_ROLES = [
  { id: "admin", label: "Admin" },
  { id: "teacher", label: "Teacher" },
  { id: "student", label: "Student" },
  { id: "parent", label: "Parent" },
];

const ALL_ROLES = INSTITUTE_ROLES.map((role) => role.id);
const ADMIN_TEACHER = ["admin", "teacher"];

export const INSTITUTE_MODULES = [
  { key: "attendance", label: "Attendance", group: "Academic records", defaultEnabled: true, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "test-attendance", label: "Test attendance", group: "Academic records", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "test-scores", label: "Test scores", group: "Academic records", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "marks-results", label: "Marks / results", group: "Academic records", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "subjects", label: "Subjects", group: "Academic records", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "syllabus-topics", label: "Syllabus / topics", group: "Academic records", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "exams", label: "Exams", group: "Academic records", defaultEnabled: true, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "progress-tracking", label: "Progress tracking", group: "Academic records", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "study-material", label: "Study material", group: "Learning", defaultEnabled: true, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "notes", label: "Notes", group: "Learning", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "homework", label: "Homework / assignments", group: "Learning", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "doubts", label: "Doubts", group: "Learning", defaultEnabled: false, visibleTo: ["admin", "teacher", "student"], editableBy: ["admin", "teacher", "student"] },
  { key: "timetable", label: "Timetable", group: "Learning", defaultEnabled: true, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "notices", label: "Notices", group: "Communication", defaultEnabled: true, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "announcements", label: "Announcements", group: "Communication", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "events", label: "Events", group: "Communication", defaultEnabled: true, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "student-performance", label: "Student performance", group: "Insights", defaultEnabled: false, visibleTo: ["admin", "teacher", "student", "parent"], editableBy: ADMIN_TEACHER },
  { key: "teacher-performance", label: "Teacher performance", group: "Insights", defaultEnabled: false, visibleTo: ["admin", "teacher"], editableBy: ["admin"] },
  { key: "student-rankings", label: "Student rankings", group: "Insights", defaultEnabled: false, visibleTo: ["admin", "teacher", "student", "parent"], editableBy: ADMIN_TEACHER },
  { key: "leaderboards", label: "Leaderboards", group: "Insights", defaultEnabled: false, visibleTo: ["admin", "teacher", "student"], editableBy: ADMIN_TEACHER },
  { key: "reports", label: "Reports", group: "Insights", defaultEnabled: false, visibleTo: ["admin", "teacher"], editableBy: ADMIN_TEACHER },
  { key: "analytics", label: "Analytics", group: "Insights", defaultEnabled: false, visibleTo: ["admin", "teacher"], editableBy: ADMIN_TEACHER },
  { key: "fees", label: "Fees", group: "Operations", defaultEnabled: false, visibleTo: ["admin", "parent"], editableBy: ["admin"] },
  { key: "parent-information", label: "Parent information", group: "People", defaultEnabled: false, visibleTo: ["admin", "teacher", "parent"], editableBy: ADMIN_TEACHER },
  { key: "student-profiles", label: "Student profiles", group: "People", defaultEnabled: false, visibleTo: ["admin", "teacher", "student", "parent"], editableBy: ADMIN_TEACHER },
  { key: "teacher-profiles", label: "Teacher profiles", group: "People", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "classes-batches", label: "Classes / batches", group: "People", defaultEnabled: false, visibleTo: ALL_ROLES, editableBy: ADMIN_TEACHER },
  { key: "certificates", label: "Certificates", group: "Operations", defaultEnabled: false, visibleTo: ["admin", "teacher", "student", "parent"], editableBy: ADMIN_TEACHER },
];

export function createDefaultInstituteModules() {
  return INSTITUTE_MODULES.map((module) => ({
    module_key: module.key,
    enabled: module.defaultEnabled,
    visible_to_roles: [...module.visibleTo],
    editable_by_roles: [...module.editableBy],
    settings: {},
  }));
}
