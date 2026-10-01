import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AnimatedGroup } from "./components/core/animated-group";
import { SlidingNumber } from "./components/core/sliding-number";
import { ProfileIdentity, TitlesView } from "./components/TitlesView";
import InstitutePortal from "./components/InstitutePortal";
import { DEFAULT_TITLES, isTitleUnlocked, normalizeRarity, ROLE_IDS } from "./title-catalog";
import { isSupabaseConfigured, supabase } from "./supabase";
import {
  Flame, Zap, Clock, CalendarDays, Sun, Moon, LayoutDashboard,
  BookOpen, Timer as TimerIcon, ListChecks, LineChart, ChevronRight,
  Search, X, Check, Building2, Bell, MapPin, FileText, Video, Link2,
  AlertCircle, Users, GraduationCap, PartyPopper, CreditCard, LogOut,
  Mail, Lock, Sparkles, ShieldCheck, Award, Play, Pause, RotateCcw,
} from "lucide-react";

/* ============================================================================
   DATA LAYER (db.js equivalent)
  Authenticated users use Supabase when configured; guest/demo data uses
  the host storage adapter or browser localStorage.
   ============================================================================ */

const STORAGE_KEYS = {
  profile: "studentos:profile",
  topicStatus: "studentos:topic-status:jee",
  sessions: "studentos:sessions",
  tasks: "studentos:tasks",
  readNotices: "studentos:read-notices",
  auth: "studentos:auth",
  titleSystem: "studentos:title-system",
};

const DEFAULT_PROFILE = {
  name: "Student",
  examId: "jee",
  dailyGoalMinutes: 120,
  theme: "dark",
  xp: 0,
  activeTitleId: null,
  streak: { current: 0, longest: 0, lastActiveDate: null },
  lastGoalBonusDate: null,
  plan: "free",
  planDuration: "month",
};

const DEFAULT_AUTH = { loggedIn: false, email: null };
const DEFAULT_TITLE_SYSTEM = { members: {}, customTitles: [], overrides: {} };
const EMPTY_MEMBER = { grantedTitleIds: [] };
const OWNER_EMAIL = (import.meta.env.VITE_STUDENTOS_OWNER_EMAIL || "").trim().toLowerCase();

async function readStoredValue(key) {
  if (typeof window === "undefined") return null;
  if (isSupabaseConfigured) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data, error } = await supabase
        .from("studentos_user_data")
        .select("value")
        .eq("user_id", session.user.id)
        .eq("data_key", key)
        .maybeSingle();
      if (error) {
        console.error("Could not load StudentOS data from Supabase", error);
        return null;
      }
      return data ? JSON.stringify(data.value) : null;
    }
  }
  try {
    if (window.storage?.get) {
      const result = await window.storage.get(key, false);
      if (result?.value != null) return result.value;
    }
  } catch {
    // Fall through to browser storage when the host adapter is unavailable.
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeStoredValue(key, value) {
  if (typeof window === "undefined") return;
  if (isSupabaseConfigured) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      const { error } = await supabase.from("studentos_user_data").upsert(
        { user_id: session.user.id, data_key: key, value: parsedValue },
        { onConflict: "user_id,data_key" }
      );
      if (error) console.error("Could not save StudentOS data to Supabase", error);
      return;
    }
  }
  try {
    if (window.storage?.set) {
      await window.storage.set(key, value, false);
      return;
    }
  } catch {
    // Fall through to browser storage when the host adapter is unavailable.
  }
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Could not persist ${key}`, error);
  }
}

async function readStoredJson(key, fallback) {
  const value = await readStoredValue(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function writeStoredJson(key, value) {
  await writeStoredValue(key, JSON.stringify(value));
  return value;
}

const db = {
  async getProfile() {
    const profile = await readStoredJson(STORAGE_KEYS.profile, null);
    return profile ? { ...DEFAULT_PROFILE, ...profile } : { ...DEFAULT_PROFILE };
  },
  async saveProfile(profile) {
    return writeStoredJson(STORAGE_KEYS.profile, profile);
  },
  async getTopicStatus() {
    return readStoredJson(STORAGE_KEYS.topicStatus, {});
  },
  async saveTopicStatus(map) {
    return writeStoredJson(STORAGE_KEYS.topicStatus, map);
  },
  async getSessions() {
    return readStoredJson(STORAGE_KEYS.sessions, []);
  },
  async saveSessions(sessions) {
    return writeStoredJson(STORAGE_KEYS.sessions, sessions);
  },
  async getTasks() {
    return readStoredJson(STORAGE_KEYS.tasks, []);
  },
  async saveTasks(tasks) {
    return writeStoredJson(STORAGE_KEYS.tasks, tasks);
  },
  async getReadNotices() {
    return readStoredJson(STORAGE_KEYS.readNotices, []);
  },
  async saveReadNotices(ids) {
    return writeStoredJson(STORAGE_KEYS.readNotices, ids);
  },
  async getTitleSystem() {
    const saved = await readStoredJson(STORAGE_KEYS.titleSystem, DEFAULT_TITLE_SYSTEM);
    return {
      ...DEFAULT_TITLE_SYSTEM,
      ...saved,
      members: saved?.members || {},
      customTitles: Array.isArray(saved?.customTitles) ? saved.customTitles : [],
      overrides: saved?.overrides || {},
    };
  },
  async saveTitleSystem(titleSystem) {
    return writeStoredJson(STORAGE_KEYS.titleSystem, titleSystem);
  },
  // Local demo fallback only. Configured Supabase auth uses its own session
  // storage and never persists a password in this app.
  async getAuth() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.getSession();
      if (error) console.error("Could not restore Supabase session", error);
      return {
        loggedIn: Boolean(data.session),
        email: data.session?.user?.email || null,
      };
    }
    return readStoredJson(STORAGE_KEYS.auth, DEFAULT_AUTH);
  },
  async saveAuth(auth) {
    return writeStoredJson(STORAGE_KEYS.auth, auth);
  },
};

function loadAppData() {
  return Promise.all([
    db.getProfile(), db.getTopicStatus(), db.getSessions(), db.getTasks(),
    db.getReadNotices(), db.getAuth(), db.getTitleSystem(),
  ]);
}

/* ============================================================================
   JEE SYLLABUS DATA
   Structured so a second exam (NEET, CBSE...) is just another entry in EXAMS
   with its own subject/topic tree — nothing downstream is JEE-specific.
   ============================================================================ */

const EXAMS = {
  jee: {
    id: "jee",
    name: "JEE (Main + Advanced)",
    subjectIds: ["physics", "chemistry", "mathematics"],
  },
};

const SUBJECTS = {
  physics: { id: "physics", examId: "jee", name: "Physics", color: "#5B8DEF" },
  chemistry: { id: "chemistry", examId: "jee", name: "Chemistry", color: "#00E699" },
  mathematics: { id: "mathematics", examId: "jee", name: "Mathematics", color: "#F2A93B" },
};

const TOPICS = {
  physics: [
    "Units & Measurements", "Kinematics", "Laws of Motion", "Work, Energy & Power",
    "Rotational Motion", "Gravitation", "Properties of Solids & Liquids",
    "Thermodynamics", "Kinetic Theory of Gases", "Oscillations & Waves",
    "Electrostatics", "Current Electricity", "Magnetic Effects of Current",
    "Electromagnetic Induction & AC", "Electromagnetic Waves", "Ray & Wave Optics",
    "Dual Nature of Matter & Radiation", "Atoms & Nuclei",
    "Electronic Devices", "Communication Systems",
  ],
  chemistry: [
    "Basic Concepts of Chemistry", "Atomic Structure", "Chemical Bonding",
    "States of Matter", "Chemical Thermodynamics", "Equilibrium",
    "Redox Reactions", "Electrochemistry", "Chemical Kinetics", "Surface Chemistry",
    "Classification & Periodicity", "Isolation of Metals", "Hydrogen",
    "s-Block Elements", "p-Block Elements", "d & f Block Elements",
    "Coordination Compounds", "Environmental Chemistry",
    "Basic Principles of Organic Chemistry", "Hydrocarbons", "Halogen Derivatives",
    "Alcohols, Phenols & Ethers", "Aldehydes, Ketones & Carboxylic Acids",
    "Organic Compounds Containing Nitrogen", "Biomolecules", "Polymers",
    "Chemistry in Everyday Life",
  ],
  mathematics: [
    "Sets, Relations & Functions", "Complex Numbers & Quadratic Equations",
    "Matrices & Determinants", "Permutations & Combinations", "Binomial Theorem",
    "Sequences & Series", "Limits, Continuity & Differentiability",
    "Differential Calculus", "Integral Calculus", "Differential Equations",
    "Coordinate Geometry", "Three Dimensional Geometry", "Vector Algebra",
    "Statistics & Probability", "Trigonometry",
  ],
};

function buildTopicId(subjectId, name, i) {
  return `${subjectId}-${i}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

const ALL_TOPICS = Object.entries(TOPICS).flatMap(([subjectId, names]) =>
  names.map((name, i) => ({ id: buildTopicId(subjectId, name, i), subjectId, name, order: i }))
);

/* ============================================================================
   INSTITUTION DATA
   Scoped deliberately: this is a single-student app, so there's no
   teacher/admin/parent portal, role switching, or backend here — just the
   student-facing slice (timetable, attendance, notices, exams, events,
   materials) that a real institution would publish. This is seed/mock data,
   the same way ALL_TOPICS is — in a real backend it'd come from the
   institution's admin tools, not be edited by the student.
   ============================================================================ */

const INSTITUTION = {
  name: "Apex Learning Institute",
  program: "JEE 2027 Batch",
  studentClass: "12th",
  section: "A",
  rollNumber: "24IIT0142",
  academicYear: "2026–27",
};

const PERIOD_TIMES = ["08:00", "09:00", "10:00", "11:15", "12:15", "14:00"];

const TIMETABLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIMETABLE = {
  Mon: [
    { time: "08:00", subjectId: "physics", teacher: "Mr. R. Kulkarni", room: "204" },
    { time: "09:00", subjectId: "mathematics", teacher: "Ms. A. Verma", room: "204" },
    { time: "10:00", subjectId: "chemistry", teacher: "Dr. S. Iyer", room: "Lab 2" },
    { time: "11:15", subjectId: "physics", teacher: "Mr. R. Kulkarni", room: "204" },
    { time: "12:15", type: "break", label: "Lunch Break" },
    { time: "14:00", type: "doubt", label: "Doubt Clearing — Mathematics" },
  ],
  Tue: [
    { time: "08:00", subjectId: "chemistry", teacher: "Dr. S. Iyer", room: "Lab 2" },
    { time: "09:00", subjectId: "physics", teacher: "Mr. R. Kulkarni", room: "204" },
    { time: "10:00", subjectId: "mathematics", teacher: "Ms. A. Verma", room: "204" },
    { time: "11:15", subjectId: "chemistry", teacher: "Dr. S. Iyer", room: "Lab 2" },
    { time: "12:15", type: "break", label: "Lunch Break" },
    { time: "14:00", subjectId: "mathematics", teacher: "Ms. A. Verma", room: "204" },
  ],
  Wed: [
    { time: "08:00", subjectId: "mathematics", teacher: "Ms. A. Verma", room: "204" },
    { time: "09:00", subjectId: "chemistry", teacher: "Dr. S. Iyer", room: "Lab 2" },
    { time: "10:00", subjectId: "physics", teacher: "Mr. R. Kulkarni", room: "204" },
    { time: "11:15", type: "mock", label: "Mock Test — Full Syllabus" },
    { time: "12:15", type: "break", label: "Lunch Break" },
    { time: "14:00", subjectId: "physics", teacher: "Mr. R. Kulkarni", room: "204" },
  ],
  Thu: [
    { time: "08:00", subjectId: "physics", teacher: "Mr. R. Kulkarni", room: "204" },
    { time: "09:00", subjectId: "mathematics", teacher: "Ms. A. Verma", room: "204" },
    { time: "10:00", subjectId: "chemistry", teacher: "Dr. S. Iyer", room: "Lab 2" },
    { time: "11:15", subjectId: "mathematics", teacher: "Ms. A. Verma", room: "204" },
    { time: "12:15", type: "break", label: "Lunch Break" },
    { time: "14:00", type: "doubt", label: "Doubt Clearing — Physics" },
  ],
  Fri: [
    { time: "08:00", subjectId: "chemistry", teacher: "Dr. S. Iyer", room: "Lab 2" },
    { time: "09:00", subjectId: "physics", teacher: "Mr. R. Kulkarni", room: "204" },
    { time: "10:00", subjectId: "mathematics", teacher: "Ms. A. Verma", room: "204" },
    { time: "11:15", subjectId: "chemistry", teacher: "Dr. S. Iyer", room: "Lab 2" },
    { time: "12:15", type: "break", label: "Lunch Break" },
    { time: "14:00", subjectId: "mathematics", teacher: "Ms. A. Verma", room: "204" },
  ],
  Sat: [
    { time: "08:00", type: "mock", label: "Weekly Mock Test" },
    { time: "09:00", type: "mock", label: "Weekly Mock Test" },
    { time: "10:00", type: "mock", label: "Weekly Mock Test" },
    { time: "11:15", type: "doubt", label: "Test Discussion" },
  ],
};

// Present/absent/late counts a real backend would compute from daily records.
const ATTENDANCE_SUMMARY = {
  physics: { present: 41, absent: 3, late: 1 },
  chemistry: { present: 38, absent: 5, late: 2 },
  mathematics: { present: 43, absent: 1, late: 1 },
};

const ATTENDANCE_TARGET_PCT = 75;

const NOTICES = [
  {
    id: "n1", title: "Mathematics Unit Test — Syllabus Confirmed", category: "exam",
    priority: "high", author: "Ms. A. Verma", date: "2026-08-24",
    description: "Unit test on Quadratic Equations, Sequences & Series, and Binomial Theorem. No calculators allowed.",
  },
  {
    id: "n2", title: "Lab Records Due Before Chemistry Practical", category: "academic",
    priority: "medium", author: "Dr. S. Iyer", date: "2026-08-23",
    description: "Bring completed lab records and practical notebooks to Thursday's Chemistry lab session.",
  },
  {
    id: "n3", title: "Institute Closed — Regional Holiday", category: "holiday",
    priority: "low", author: "Admin Office", date: "2026-08-22",
    description: "The institute will remain closed on September 2. Regular classes resume September 3.",
  },
  {
    id: "n4", title: "Fee Payment Reminder — September", category: "fee",
    priority: "medium", author: "Admin Office", date: "2026-08-21",
    description: "September fee installment is due by the 5th. Late payments incur a ₹500 fee.",
  },
  {
    id: "n5", title: "Emergency: Saturday Mock Test Rescheduled", category: "emergency",
    priority: "high", author: "Academic Coordinator", date: "2026-08-20",
    description: "Saturday's full-syllabus mock test moves from 8:00 AM to 9:30 AM due to a venue conflict.",
  },
];

const EXAM_SCHEDULE = [
  {
    id: "e1", title: "Mathematics Unit Test", subjectId: "mathematics",
    date: "2026-09-04", time: "10:00 AM", room: "204", duration: "90 min",
    syllabus: ["Quadratic Equations", "Sequences & Series", "Binomial Theorem"],
    status: "upcoming",
  },
  {
    id: "e2", title: "Physics Full Syllabus Mock", subjectId: "physics",
    date: "2026-09-10", time: "09:00 AM", room: "Hall A", duration: "180 min",
    syllabus: ["Mechanics", "Thermodynamics", "Electrostatics"],
    status: "upcoming",
  },
  {
    id: "e3", title: "Chemistry Unit Test", subjectId: "chemistry",
    date: "2026-08-14", time: "10:00 AM", room: "Lab 2", duration: "60 min",
    syllabus: ["Chemical Bonding", "States of Matter"],
    status: "completed", marks: 42, totalMarks: 50,
  },
];

const EVENTS = [
  {
    id: "ev1", title: "Parent-Teacher Meeting", category: "meeting",
    date: "2026-09-06", time: "10:00 AM", location: "Main Auditorium",
    organizer: "Academic Office",
    description: "Quarterly progress discussion for JEE 2027 batch parents.",
  },
  {
    id: "ev2", title: "Physics Olympiad Prep Workshop", category: "workshop",
    date: "2026-09-13", time: "02:00 PM", location: "Lab 2",
    organizer: "Mr. R. Kulkarni",
    description: "Optional workshop covering advanced mechanics problem-solving.",
  },
  {
    id: "ev3", title: "Annual Sports Day", category: "sports",
    date: "2026-09-20", time: "08:00 AM", location: "Institute Grounds",
    organizer: "Student Council",
    description: "Inter-batch sports competition. Registration at the front desk.",
  },
];

const MATERIALS = [
  {
    id: "m1", title: "Rotational Motion — Full Notes", subjectId: "physics",
    teacher: "Mr. R. Kulkarni", type: "pdf", uploadDate: "2026-08-19",
  },
  {
    id: "m2", title: "Chemical Bonding — Lecture Recording", subjectId: "chemistry",
    teacher: "Dr. S. Iyer", type: "video", uploadDate: "2026-08-18",
  },
  {
    id: "m3", title: "Binomial Theorem — Practice Sheet", subjectId: "mathematics",
    teacher: "Ms. A. Verma", type: "pdf", uploadDate: "2026-08-17",
  },
  {
    id: "m4", title: "Previous Year JEE Questions — Mechanics", subjectId: "physics",
    teacher: "Mr. R. Kulkarni", type: "pdf", uploadDate: "2026-08-15",
  },
  {
    id: "m5", title: "NCERT Reference — Equilibrium", subjectId: "chemistry",
    teacher: "Dr. S. Iyer", type: "link", uploadDate: "2026-08-12",
  },
  {
    id: "m6", title: "Sequences & Series — Solved Examples", subjectId: "mathematics",
    teacher: "Ms. A. Verma", type: "notes", uploadDate: "2026-08-10",
  },
];

const MATERIAL_TYPE_ICON = { pdf: FileText, video: Video, link: Link2, notes: FileText };

const NOTICE_PRIORITY_COLOR = { high: "#F2635C", medium: "#F2A93B", low: "#5B8DEF" };

const STATUS = {
  not_started: { label: "Not started", weight: 0 },
  learning: { label: "Learning", weight: 0.33 },
  practicing: { label: "Practicing", weight: 0.66 },
  completed: { label: "Completed", weight: 1 },
};

const STATUS_ORDER = ["not_started", "learning", "practicing", "completed"];

const STATUS_COLOR = {
  not_started: "#5B6472",
  learning: "#5B8DEF",
  practicing: "#F2A93B",
  completed: "#00E699",
};

function nextStatus(current) {
  const i = STATUS_ORDER.indexOf(current || "not_started");
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
}

/* ============================================================================
   BUSINESS LOGIC (pure functions — no storage, no DOM)
   ============================================================================ */

function computeSubjectProgress(subjectId, topicStatusMap) {
  const topics = ALL_TOPICS.filter((t) => t.subjectId === subjectId);
  if (topics.length === 0) return 0;
  const total = topics.reduce((sum, t) => {
    const status = topicStatusMap[t.id] || "not_started";
    return sum + STATUS[status].weight;
  }, 0);
  return Math.round((total / topics.length) * 100);
}

function computeOverallProgress(topicStatusMap) {
  const subjectIds = Object.keys(SUBJECTS);
  const avg =
    subjectIds.reduce((sum, id) => sum + computeSubjectProgress(id, topicStatusMap), 0) /
    subjectIds.length;
  return Math.round(avg);
}

function minutesFromSessions(sessions, sinceMs) {
  return sessions
    .filter((s) => new Date(s.startedAt).getTime() >= sinceMs)
    .reduce((sum, s) => sum + s.durationSec / 60, 0);
}

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMs() {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? 6 : day - 1); // week starts Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatMinutes(mins) {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// Local (not UTC) YYYY-MM-DD key — used everywhere a task/session needs to be
// bucketed to "today" so a student in IST doesn't get midnight-UTC bugs.
function localDateKey(d = new Date()) {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

function computeDailyMinutesMap(sessions) {
  const map = {};
  sessions.forEach((s) => {
    const key = localDateKey(new Date(s.startedAt));
    map[key] = (map[key] || 0) + s.durationSec / 60;
  });
  return map;
}

// Streak is deliberately *derived* from session history every render rather
// than incremented and stored — same principle as subject progress being
// derived from topic status. Today doesn't break a streak until the day is
// over; it just doesn't count yet.
function computeStreak(sessions, goalMinutes) {
  const map = computeDailyMinutesMap(sessions);
  const isQualifying = (key) => (map[key] || 0) >= goalMinutes;

  let cursor = new Date();
  if (!isQualifying(localDateKey(cursor))) {
    cursor = new Date(cursor.getTime() - 86400000);
  }
  let current = 0;
  while (isQualifying(localDateKey(cursor))) {
    current++;
    cursor = new Date(cursor.getTime() - 86400000);
  }

  const qualifyingDates = Object.keys(map).filter(isQualifying).sort();
  let longest = 0, run = 0, prevDate = null;
  qualifyingDates.forEach((dStr) => {
    const d = new Date(dStr + "T00:00:00");
    if (prevDate) {
      const diffDays = Math.round((d - prevDate) / 86400000);
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prevDate = d;
  });
  longest = Math.max(longest, current);
  return { current, longest };
}

function lastNDaysStudy(sessions, n) {
  const map = computeDailyMinutesMap(sessions);
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = localDateKey(d);
    days.push({ key, label: d.toLocaleDateString(undefined, { weekday: "short" }), minutes: map[key] || 0 });
  }
  return days;
}

function lastNWeeksStudy(sessions, n) {
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const anchor = new Date(Date.now() - i * 7 * 86400000);
    const day = anchor.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const start = new Date(anchor);
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 86400000);
    const minutes = sessions
      .filter((s) => {
        const t = new Date(s.startedAt).getTime();
        return t >= start.getTime() && t < end.getTime();
      })
      .reduce((sum, s) => sum + s.durationSec / 60, 0);
    weeks.push({ label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }), minutes });
  }
  return weeks;
}

/* ============================================================================
   XP MODULE — kept isolated so the rules can change without touching
   the timer, the syllabus tracker, or storage.
   ============================================================================ */

const XP_RULES = {
  perMinuteStudied: 1,
  topicCompletedBonus: 25,
  dailyGoalBonus: 20,
};

function computeSessionXp(durationSeconds) {
  return Math.round((durationSeconds / 60) * XP_RULES.perMinuteStudied);
}

const TIMER_PRESETS = [
  { id: "25-5", label: "25 / 5", focusMin: 25, breakMin: 5 },
  { id: "50-10", label: "50 / 10", focusMin: 50, breakMin: 10 },
  { id: "90-15", label: "90 / 15", focusMin: 90, breakMin: 15 },
  { id: "custom", label: "Custom", focusMin: null, breakMin: null },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${pad2(m)}:${pad2(rem)}`;
}

/* ============================================================================
   THEME TOKENS
   ============================================================================ */

const THEMES = {
  dark: {
    bg: "#0D0B14",
    surface: "#13121F",
    surfaceRaised: "#191827",
    border: "#302B3C",
    text: "#F7F5FC",
    textMuted: "#9B98AA",
    textFaint: "#787386",
  },
  light: {
    bg: "#F5F7FA",
    surface: "#FFFFFF",
    surfaceRaised: "#F1F5F9",
    border: "#D9E1EC",
    text: "#111827",
    textMuted: "#4E5D73",
    textFaint: "#7C8BA3",
  },
};

const ACCENT = "#FF5E3A";
const STREAK_ACCENT = "#FF5D73";

/* ============================================================================
   UI PRIMITIVES
   ============================================================================ */

function StatCard({ icon: Icon, label, value, sub, accent, t }) {
  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.textMuted }}>
        <Icon size={15} color={accent} strokeWidth={2.25} />
        <span style={{ fontSize: 12.5, letterSpacing: "0.02em", fontWeight: 500 }}>{label}</span>
      </div>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 28,
          fontWeight: 600,
          color: t.text,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: t.textFaint }}>{sub}</div>
      )}
    </div>
  );
}

function SubjectRings({ progress, t }) {
  // Signature element: three concentric arcs, one per subject.
  const size = 168;
  const cx = size / 2;
  const cy = size / 2;
  const rings = [
    { id: "physics", r: 74, sw: 10 },
    { id: "chemistry", r: 58, sw: 10 },
    { id: "mathematics", r: 42, sw: 10 },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {rings.map((ring) => {
          const subject = SUBJECTS[ring.id];
          const pct = progress[ring.id] ?? 0;
          const circumference = 2 * Math.PI * ring.r;
          const dash = (pct / 100) * circumference;
          return (
            <g key={ring.id} transform={`rotate(-90 ${cx} ${cy})`}>
              <circle
                cx={cx} cy={cy} r={ring.r}
                fill="none" stroke={t.border} strokeWidth={ring.sw}
              />
              <circle
                cx={cx} cy={cy} r={ring.r}
                fill="none" stroke={subject.color} strokeWidth={ring.sw}
                strokeDasharray={`${dash} ${circumference}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.6s ease" }}
              />
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.values(SUBJECTS).map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, color: t.text, minWidth: 92 }}>{s.name}</span>
            <span
              style={{
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                fontSize: 13.5, color: t.textMuted, fontWeight: 500,
              }}
            >
              {progress[s.id] ?? 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title, body, t }) {
  return (
    <div
      style={{
        border: `1px dashed ${t.border}`,
        borderRadius: 12,
        padding: "22px 18px",
        textAlign: "center",
        color: t.textMuted,
      }}
    >
      <div style={{ fontSize: 13.5, color: t.text, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, phase: 1 },
  { id: "institution", label: "Institution", icon: Building2, phase: 0 },
  { id: "syllabus", label: "Syllabus", icon: BookOpen, phase: 2 },
  { id: "timer", label: "Timer", icon: TimerIcon, phase: 3 },
  { id: "plan", label: "Today's Plan", icon: ListChecks, phase: 4 },
  { id: "progress", label: "Progress", icon: LineChart, phase: 5 },
  { id: "titles", label: "Titles", icon: Award, phase: 6 },
  { id: "subscription", label: "Plans & Billing", icon: CreditCard, phase: 0 },
];

const SUBJECT_FILTERS = [{ id: "all", name: "All subjects" }, ...Object.values(SUBJECTS)];
const STATUS_FILTERS = [
  { id: "all", label: "All statuses" },
  ...STATUS_ORDER.map((id) => ({ id, label: STATUS[id].label })),
];

/* ---------------------------------------------------------------------------
   SYLLABUS TRACKER (Phase 2)
   --------------------------------------------------------------------------- */

function ProgressBar({ pct, color, t, height = 6 }) {
  return (
    <div style={{ height, borderRadius: height, background: t.border, overflow: "hidden" }}>
      <div
        style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: height, transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function DashboardSyllabusCard({ topicStatus, onCycleTopic, subjectProgress, overallProgress, t }) {
  const [expandedSubject, setExpandedSubject] = useState(null);

  return (
    <section className="dashboard-syllabus-card" style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Syllabus</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 21, fontWeight: 700, lineHeight: 1.1 }}>
            {overallProgress}%
          </div>
          <div style={{ marginTop: 3, fontSize: 10.5, color: t.textMuted }}>overall completion</div>
        </div>
      </div>
      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <ProgressBar pct={overallProgress} color={ACCENT} t={t} height={5} />
      </div>

      <div>
        {Object.values(SUBJECTS).map((subject) => {
          const topics = ALL_TOPICS.filter((topic) => topic.subjectId === subject.id);
          const isExpanded = expandedSubject === subject.id;

          return (
            <div
              key={subject.id}
              className="dashboard-syllabus__subject"
              style={{ "--subject-color": subject.color, borderBottom: `1px solid ${t.border}` }}
            >
              <button
                type="button"
                className="dashboard-syllabus__subject-button"
                onClick={() => setExpandedSubject(isExpanded ? null : subject.id)}
                aria-expanded={isExpanded}
                style={{ color: t.text }}
              >
                <span className="dashboard-syllabus__subject-dot" />
                <span style={{ flex: 1, textAlign: "left" }}>{subject.name}</span>
                <span style={{ color: t.textMuted }}>{subjectProgress[subject.id]}%</span>
                <ChevronRight
                  className={`dashboard-syllabus__chevron${isExpanded ? " is-expanded" : ""}`}
                  size={15}
                  color={t.textFaint}
                />
              </button>

              {isExpanded && (
                <ul className="dashboard-syllabus__topics">
                  {topics.map((topic) => {
                    const status = topicStatus[topic.id] || "not_started";
                    const meta = STATUS[status];

                    return (
                      <li key={topic.id}>
                        <button
                          type="button"
                          className="dashboard-syllabus__topic"
                          onClick={() => onCycleTopic(topic.id)}
                          title={`${meta.label} - click to update`}
                          aria-label={`${topic.name}: ${meta.label}. Click to update status.`}
                        >
                          <span className="dashboard-syllabus__topic-dot" style={{ background: STATUS_COLOR[status] }} />
                          <span
                            className="dashboard-syllabus__topic-name"
                            style={{ color: status === "completed" ? t.textMuted : t.text }}
                          >
                            {topic.name}
                          </span>
                          <span className="dashboard-syllabus__topic-status" style={{ color: STATUS_COLOR[status] }}>
                            {meta.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TopicRow({ topic, status, color, onCycle, t }) {
  const meta = STATUS[status];
  return (
    <button
      onClick={onCycle}
      aria-label={`Chapter ${topic.order + 1}: ${topic.name}. Status: ${meta.label}. Click to update status.`}
      title="Update chapter status"
      className="syllabus-topic"
      style={{
        "--topic-color": color,
        "--topic-status-color": STATUS_COLOR[status],
        borderColor: status === "not_started" ? t.border : `${STATUS_COLOR[status]}66`,
        background: status === "completed" ? `${STATUS_COLOR[status]}0D` : t.surfaceRaised,
      }}
    >
      <span
        style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          border: `1.5px solid ${STATUS_COLOR[status]}`,
          background: status === "completed" ? STATUS_COLOR[status] : `${STATUS_COLOR[status]}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: status === "completed" ? "#0F1419" : STATUS_COLOR[status],
        }}
      >
        {status === "completed" ? <Check size={14} strokeWidth={3} /> : status === "in_progress" ? <Clock size={13} /> : null}
      </span>
      <span className="syllabus-topic__content">
        <span className="syllabus-topic__number" style={{ color: `${color}B8` }}>
          CHAPTER {String(topic.order + 1).padStart(2, "0")}
        </span>
        <span className="syllabus-topic__name" style={{ color: t.text }}>{topic.name}</span>
      </span>
      <span
        className="syllabus-topic__status"
        style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
          padding: "3px 9px", borderRadius: 999, flexShrink: 0,
          color: STATUS_COLOR[status],
          background: `${STATUS_COLOR[status]}1A`,
        }}
      >
        {meta.label}
      </span>
      <ChevronRight className="syllabus-topic__chevron" size={15} />
    </button>
  );
}

function SyllabusView({ topicStatus, onCycleTopic, subjectProgress, overallProgress, t }) {
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredTopics = useMemo(() => {
    return ALL_TOPICS.filter((topic) => {
      if (subjectFilter !== "all" && topic.subjectId !== subjectFilter) return false;
      const status = topicStatus[topic.id] || "not_started";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (query.trim() && !topic.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });
  }, [query, subjectFilter, statusFilter, topicStatus]);

  const groupedBySubject = useMemo(() => {
    const groups = {};
    filteredTopics.forEach((topic) => {
      groups[topic.subjectId] = groups[topic.subjectId] || [];
      groups[topic.subjectId].push(topic);
    });
    return groups;
  }, [filteredTopics]);

  const subjectsToShow =
    subjectFilter === "all" ? Object.keys(SUBJECTS) : [subjectFilter];

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }}>
          JEE Syllabus
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <div style={{ flex: 1, maxWidth: 260 }}>
            <ProgressBar pct={overallProgress} color={ACCENT} t={t} height={7} />
          </div>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: t.textMuted }}>
            {overallProgress}% overall · {ALL_TOPICS.length} topics
          </span>
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 180,
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 9,
            padding: "8px 12px",
          }}
        >
          <Search size={14} color={t.textFaint} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics…"
            style={{
              border: "none", outline: "none", background: "transparent",
              color: t.text, fontSize: 13, flex: 1, fontFamily: "inherit",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex" }}
            >
              <X size={13} color={t.textFaint} />
            </button>
          )}
        </div>

        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          style={{
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 9,
            padding: "8px 10px", color: t.text, fontSize: 13, fontFamily: "inherit",
          }}
        >
          {SUBJECT_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 9,
            padding: "8px 10px", color: t.text, fontSize: 13, fontFamily: "inherit",
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {filteredTopics.length === 0 ? (
        <EmptyState
          title="No topics match"
          body="Try clearing the search or filters — every JEE topic is loaded, so this is a filter dead-end, not missing data."
          t={t}
        />
      ) : (
        subjectsToShow.map((subjectId) => {
          const topics = groupedBySubject[subjectId];
          if (!topics || topics.length === 0) return null;
          const subject = SUBJECTS[subjectId];
          return (
            <div key={subjectId} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: subject.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{subject.name}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: t.textMuted }}>
                  {subjectProgress[subjectId]}%
                </span>
                <div style={{ flex: 1, maxWidth: 140 }}>
                  <ProgressBar pct={subjectProgress[subjectId]} color={subject.color} t={t} />
                </div>
              </div>
              {topics.map((topic) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  status={topicStatus[topic.id] || "not_started"}
                  color={subject.color}
                  onCycle={() => onCycleTopic(topic.id)}
                  t={t}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   STUDY TIMER (Phase 3)
   --------------------------------------------------------------------------- */

const TIMER_MODES = [
  { id: "timer", label: "Timer" },
  { id: "pomodoro", label: "Pomodoro" },
  { id: "stopwatch", label: "Stopwatch" },
];

function TimerView({ onCompleteSession, todayMinutes, t }) {
  const [mode, setMode] = useState("timer");
  const [presetId, setPresetId] = useState("25-5");
  const [customMinutes, setCustomMinutes] = useState(30);
  const [customBreakMinutes, setCustomBreakMinutes] = useState(5);
  const [subjectId, setSubjectId] = useState("physics");
  const [topicId, setTopicId] = useState(ALL_TOPICS.find((topic) => topic.subjectId === "physics").id);
  const [status, setStatus] = useState("idle");
  const [phase, setPhase] = useState("focus");
  const [remaining, setRemaining] = useState(25 * 60);
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [justSaved, setJustSaved] = useState(false);

  const selectedPreset = TIMER_PRESETS.find((preset) => preset.id === presetId);
  const focusMinutes = selectedPreset.focusMin ?? customMinutes;
  const focusSeconds = focusMinutes * 60;
  const breakSeconds = (selectedPreset.breakMin ?? customBreakMinutes) * 60;
  const topicsForSubject = ALL_TOPICS.filter((topic) => topic.subjectId === subjectId);
  const idle = status === "idle";
  const running = status === "running";
  const paused = status === "paused";
  const segmentSeconds = mode === "pomodoro" && phase === "break" ? breakSeconds : focusSeconds;
  const elapsedSeconds = mode === "stopwatch" ? stopwatchSeconds : segmentSeconds - remaining;
  const displaySeconds = mode === "stopwatch" ? stopwatchSeconds : remaining;
  const progress = mode === "stopwatch"
    ? (stopwatchSeconds % 60) / 60
    : segmentSeconds > 0 ? Math.max(0, Math.min(1, elapsedSeconds / segmentSeconds)) : 0;
  const circumference = 2 * Math.PI * 90;

  const saveSession = useCallback((durationSec) => {
    if (durationSec < 60) return;
    const endedAt = new Date();
    onCompleteSession({
      id: `session-${Date.now()}`,
      subjectId,
      topicId,
      durationSec,
      startedAt: new Date(endedAt.getTime() - durationSec * 1000).toISOString(),
      endedAt: endedAt.toISOString(),
      xpEarned: computeSessionXp(durationSec),
    });
    setJustSaved(true);
  }, [onCompleteSession, subjectId, topicId]);

  useEffect(() => {
    if (status !== "running") return undefined;
    const interval = setInterval(() => {
      if (mode === "stopwatch") {
        setStopwatchSeconds((seconds) => seconds + 1);
        return;
      }

      if (remaining > 1) {
        setRemaining(remaining - 1);
        return;
      }

      if (mode === "pomodoro") {
        if (phase === "focus") {
          saveSession(focusSeconds);
          setPhase("break");
          setRemaining(breakSeconds);
        } else {
          setPhase("focus");
          setRemaining(focusSeconds);
        }
        return;
      }

      saveSession(focusSeconds);
      setStatus("idle");
      setRemaining(focusSeconds);
    }, 1000);
    return () => clearInterval(interval);
  }, [breakSeconds, focusSeconds, mode, phase, remaining, saveSession, status]);

  useEffect(() => {
    if (!justSaved) return undefined;
    const timeout = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timeout);
  }, [justSaved]);

  function resetClock() {
    setStatus("idle");
    setPhase("focus");
    setRemaining(focusSeconds);
    setStopwatchSeconds(0);
  }

  function chooseMode(nextMode) {
    if (!idle) return;
    setMode(nextMode);
    setPhase("focus");
    setRemaining(focusSeconds);
    setStopwatchSeconds(0);
  }

  function choosePreset(nextPreset) {
    setPresetId(nextPreset.id);
    setPhase("focus");
    setRemaining((nextPreset.focusMin ?? customMinutes) * 60);
  }

  function stopClock() {
    if (mode === "stopwatch") {
      saveSession(stopwatchSeconds);
    } else if (mode !== "pomodoro" || phase === "focus") {
      saveSession(Math.max(0, segmentSeconds - remaining));
    }
    resetClock();
  }

  function changeSubject(nextSubjectId) {
    setSubjectId(nextSubjectId);
    setTopicId(ALL_TOPICS.find((topic) => topic.subjectId === nextSubjectId).id);
  }

  const activeLabel = mode === "pomodoro"
    ? phase === "break" ? "Break time" : "Focus interval"
    : mode === "stopwatch" ? "Stopwatch" : "Focus timer";

  return (
    <div
      className="timer-page"
      style={{
        "--timer-border": t.border,
        "--timer-surface": t.surface,
        "--timer-surface-raised": t.surfaceRaised,
        "--timer-text": t.text,
        "--timer-text-muted": t.textMuted,
        "--timer-accent": ACCENT,
      }}
    >
      <div className="timer-page__heading">
        <div>
          <h1 className="timer-page__title">Focus room</h1>
          <p className="timer-page__subtitle">Make this session count.</p>
        </div>
        <span className="timer-today" style={{ borderColor: t.border, color: t.textMuted }}>
          Today <strong style={{ color: t.text }}>{formatMinutes(todayMinutes)}</strong>
        </span>
      </div>

      <section className="timer-panel">
        <div className="timer-mode-switch" role="tablist" aria-label="Timer mode">
          {TIMER_MODES.map((timerMode) => (
            <button
              key={timerMode.id}
              type="button"
              role="tab"
              aria-selected={mode === timerMode.id}
              disabled={!idle}
              className={`timer-mode-switch__button${mode === timerMode.id ? " is-active" : ""}`}
              onClick={() => chooseMode(timerMode.id)}
            >
              {timerMode.label}
            </button>
          ))}
        </div>

        <div className="timer-workspace">
          <div className="timer-dial" aria-label={`${formatClock(displaySeconds)} ${activeLabel}`}>
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="90" fill="none" stroke={t.border} strokeWidth="9" />
              <circle
                cx="100" cy="100" r="90" fill="none"
                stroke={mode === "pomodoro" && phase === "break" ? "#00E699" : SUBJECTS[subjectId].color}
                strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                className="timer-dial__progress"
              />
            </svg>
            <div className="timer-dial__readout">
              <div className="timer-dial__time" style={{ color: t.text }}>{formatClock(displaySeconds)}</div>
              <div className="timer-dial__label" style={{ color: t.textFaint }}>
                {paused ? "Paused" : running ? activeLabel : mode === "stopwatch" ? "Ready" : activeLabel}
              </div>
            </div>
          </div>

          <div className="timer-config">
            <div className="timer-actions">
              {idle ? (
                <TimerButton label="Start" icon={Play} primary onClick={() => setStatus("running")} t={t} />
              ) : running ? (
                <TimerButton label="Pause" icon={Pause} onClick={() => setStatus("paused")} t={t} />
              ) : (
                <TimerButton label="Resume" icon={Play} primary onClick={() => setStatus("running")} t={t} />
              )}
              {!idle && <TimerButton label="Stop" onClick={stopClock} t={t} />}
              <TimerButton label="Reset" icon={RotateCcw} onClick={resetClock} t={t} />
              <div className="timer-xp" style={{ color: t.textMuted }}>
                <Zap size={14} fill="currentColor" />
                <span>Earn 1 XP per focused minute</span>
              </div>
            </div>

            {justSaved && <div className="timer-saved" role="status">Session saved</div>}

            {mode !== "stopwatch" && (
              <div className="timer-presets" aria-label={mode === "pomodoro" ? "Pomodoro presets" : "Timer presets"}>
                {TIMER_PRESETS.map((preset) => {
                  const presetLabel = preset.id === "custom"
                    ? "Custom"
                    : mode === "pomodoro" ? preset.label : `${preset.focusMin} min`;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={!idle}
                      aria-pressed={presetId === preset.id}
                      className={`timer-preset${presetId === preset.id ? " is-active" : ""}`}
                      style={{ "--timer-accent": ACCENT }}
                      onClick={() => choosePreset(preset)}
                    >
                      {presetLabel}
                    </button>
                  );
                })}
              </div>
            )}

            {mode !== "stopwatch" && presetId === "custom" && (
              <div className="timer-custom-durations">
                <label>
                  <span>Focus</span>
                  <input
                    type="number" min={1} max={180} disabled={!idle} value={customMinutes}
                    aria-label="Focus duration in minutes"
                    onChange={(event) => {
                      const nextMinutes = Math.min(180, Math.max(1, Number(event.target.value) || 1));
                      setCustomMinutes(nextMinutes);
                      if (idle) setRemaining(nextMinutes * 60);
                    }}
                    style={{ borderColor: t.border, background: t.bg, color: t.text }}
                  />
                  <span>min</span>
                </label>
                {mode === "pomodoro" && (
                  <label>
                    <span>Break</span>
                    <input
                      type="number" min={1} max={60} disabled={!idle} value={customBreakMinutes}
                      aria-label="Break duration in minutes"
                      onChange={(event) => setCustomBreakMinutes(Math.min(60, Math.max(1, Number(event.target.value) || 1)))}
                      style={{ borderColor: t.border, background: t.bg, color: t.text }}
                    />
                    <span>min</span>
                  </label>
                )}
              </div>
            )}

            <div className="timer-subject-selects">
              <label className="timer-select" style={{ color: t.textMuted }}>
                <span>Subject</span>
                <select
                  value={subjectId} disabled={!idle}
                  onChange={(event) => changeSubject(event.target.value)}
                  style={{ "--select-border": t.border, "--select-background": t.bg, color: t.text }}
                >
                  {Object.values(SUBJECTS).map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </select>
              </label>
              <label className="timer-select" style={{ color: t.textMuted }}>
                <span>Chapter</span>
                <select
                  value={topicId} disabled={!idle}
                  onChange={(event) => setTopicId(event.target.value)}
                  style={{ "--select-border": t.border, "--select-background": t.bg, color: t.text }}
                >
                  {topicsForSubject.map((topic) => (
                    <option key={topic.id} value={topic.id}>{topic.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {mode === "pomodoro" && <div className="timer-break-note" style={{ color: t.textFaint }}>Pomodoro breaks are not logged.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function TimerButton({ label, onClick, primary, t, icon: Icon, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`timer-action${primary ? " is-primary" : ""}`}
      style={{ "--action-border": t.border, "--action-surface": t.surface }}
    >
      {Icon && <Icon size={14} strokeWidth={2.5} />}
      {label}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   TODAY'S PLAN + STREAKS (Phase 4)
   --------------------------------------------------------------------------- */

const PRIORITIES = [
  { id: "high", label: "High", color: "#F2635C" },
  { id: "medium", label: "Medium", color: "#F2A93B" },
  { id: "low", label: "Low", color: "#5B8DEF" },
];
const PRIORITY_COLOR = Object.fromEntries(PRIORITIES.map((p) => [p.id, p.color]));
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function TaskRow({ task, onToggle, onDelete, t }) {
  const subject = SUBJECTS[task.subjectId];
  const topic = ALL_TOPICS.find((tp) => tp.id === task.topicId);
  const done = task.status === "done";
  return (
    <div
      className="dashboard-empty-state"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        borderRadius: 10, border: `1px solid ${t.border}`, background: t.surfaceRaised,
        marginBottom: 6, opacity: done ? 0.6 : 1,
      }}
    >
      <button
        onClick={() => onToggle(task.id)}
        aria-label="Toggle done"
        style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: "pointer",
          border: `1.5px solid ${done ? "#00E699" : t.border}`,
          background: done ? "#00E699" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {done && <Check size={13} color="#0F1419" strokeWidth={3} />}
      </button>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: subject.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5, color: t.text, fontWeight: 500,
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {topic ? topic.name : subject.name}
        </div>
        <div style={{ fontSize: 11, color: t.textFaint }}>
          {subject.name} · {task.estMinutes} min
        </div>
      </div>
      <span
        style={{
          fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999, flexShrink: 0,
          color: PRIORITY_COLOR[task.priority], background: `${PRIORITY_COLOR[task.priority]}1A`,
        }}
      >
        {PRIORITIES.find((p) => p.id === task.priority).label}
      </span>
      <button
        onClick={() => onDelete(task.id)}
        aria-label="Delete task"
        style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", flexShrink: 0, color: t.textFaint }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function AddTaskForm({ onAdd, t }) {
  const [subjectId, setSubjectId] = useState("physics");
  const [topicId, setTopicId] = useState(ALL_TOPICS.find((x) => x.subjectId === "physics").id);
  const [estMinutes, setEstMinutes] = useState(30);
  const [priority, setPriority] = useState("medium");
  const topicsForSubject = ALL_TOPICS.filter((tp) => tp.subjectId === subjectId);

  function handleSubmit(e) {
    e.preventDefault();
    onAdd({ subjectId, topicId, estMinutes: Math.max(5, Number(estMinutes) || 5), priority });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 16,
      }}
    >
      <select
        value={subjectId}
        onChange={(e) => {
          setSubjectId(e.target.value);
          setTopicId(ALL_TOPICS.find((x) => x.subjectId === e.target.value).id);
        }}
        style={{
          background: t.surfaceRaised, border: `1px solid ${t.border}`, borderRadius: 9,
          padding: "8px 10px", color: t.text, fontSize: 13, fontFamily: "inherit",
        }}
      >
        {Object.values(SUBJECTS).map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select
        value={topicId}
        onChange={(e) => setTopicId(e.target.value)}
        style={{
          flex: 1, minWidth: 160, background: t.surfaceRaised, border: `1px solid ${t.border}`, borderRadius: 9,
          padding: "8px 10px", color: t.text, fontSize: 13, fontFamily: "inherit",
        }}
      >
        {topicsForSubject.map((tp) => (
          <option key={tp.id} value={tp.id}>{tp.name}</option>
        ))}
      </select>
      <input
        type="number" min={5} max={300} value={estMinutes}
        onChange={(e) => setEstMinutes(e.target.value)}
        style={{
          width: 66, background: t.surfaceRaised, border: `1px solid ${t.border}`, borderRadius: 9,
          padding: "8px 8px", color: t.text, fontSize: 13,
        }}
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        style={{
          background: t.surfaceRaised, border: `1px solid ${t.border}`, borderRadius: 9,
          padding: "8px 10px", color: t.text, fontSize: 13, fontFamily: "inherit",
        }}
      >
        {PRIORITIES.map((p) => (
          <option key={p.id} value={p.id}>{p.label} priority</option>
        ))}
      </select>
      <button
        type="submit"
        style={{
          padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600,
          border: "none", background: ACCENT, color: "#0F1419", cursor: "pointer",
        }}
      >
        Add task
      </button>
    </form>
  );
}

function PlanView({ tasks, onAddTask, onToggleTask, onDeleteTask, dailyGoalMinutes, onUpdateGoal, todayMinutes, t }) {
  const [goalDraft, setGoalDraft] = useState(dailyGoalMinutes);
  const sorted = [...tasks].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const doneCount = tasks.filter((tk) => tk.status === "done").length;
  const goalPct = Math.min(100, Math.round((todayMinutes / dailyGoalMinutes) * 100));

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }}>
            Today's Plan
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>
            {tasks.length === 0 ? "Nothing planned yet." : `${doneCount} of ${tasks.length} tasks done.`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: t.textMuted }}>Daily goal</span>
          <input
            type="number" min={15} max={600} value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            onBlur={() => onUpdateGoal(Math.max(15, Number(goalDraft) || 15))}
            style={{
              width: 60, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8,
              padding: "6px 8px", color: t.text, fontSize: 12.5,
            }}
          />
          <span style={{ fontSize: 12, color: t.textFaint }}>min</span>
        </div>
      </div>

      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12.5 }}>
          <span style={{ color: t.textMuted }}>Today's study time vs. goal</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: t.text }}>
            {formatMinutes(todayMinutes)} / {formatMinutes(dailyGoalMinutes)}
          </span>
        </div>
        <ProgressBar pct={goalPct} color={goalPct >= 100 ? "#00E699" : ACCENT} t={t} height={7} />
      </div>

      <AddTaskForm onAdd={onAddTask} t={t} />

      {sorted.length === 0 ? (
        <EmptyState title="No tasks yet" body="Add a subject and topic above to plan your study session for today." t={t} />
      ) : (
        sorted.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={onToggleTask} onDelete={onDeleteTask} t={t} />
        ))
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   PROGRESS / ANALYTICS (Phase 5)
   --------------------------------------------------------------------------- */

function BarChartMini({ data, t, color, height = 110 }) {
  const max = Math.max(1, ...data.map((d) => d.minutes));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, paddingTop: 8 }}>
      {data.map((d) => {
        const barHeight = Math.max(3, Math.round((d.minutes / max) * (height - 24)));
        return (
          <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div
              title={`${Math.round(d.minutes)} min`}
              style={{
                width: "100%", maxWidth: 26, height: barHeight, borderRadius: 5,
                background: d.minutes > 0 ? color : t.border,
                transition: "height 0.4s ease",
              }}
            />
            <span style={{ fontSize: 10, color: t.textFaint, whiteSpace: "nowrap" }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProgressView({ subjectProgress, overallProgress, topicStatus, sessions, xp, streak, t }) {
  const completedTopics = ALL_TOPICS.filter((tp) => topicStatus[tp.id] === "completed").length;
  const dailyData = useMemo(() => lastNDaysStudy(sessions, 7), [sessions]);
  const weeklyData = useMemo(() => lastNWeeksStudy(sessions, 6), [sessions]);

  return (
    <div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
        Progress
      </div>

      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12, marginBottom: 20,
        }}
      >
        <StatCard icon={LineChart} label="Overall" value={`${overallProgress}%`} sub="syllabus covered" accent={ACCENT} t={t} />
        <StatCard icon={BookOpen} label="Topics" value={completedTopics} sub={`of ${ALL_TOPICS.length} completed`} accent={ACCENT} t={t} />
        <StatCard icon={Flame} label="Streak" value={streak.current} sub={`best: ${streak.longest}`} accent={STREAK_ACCENT} t={t} />
        <StatCard icon={Zap} label="XP" value={xp} sub="total earned" accent={ACCENT} t={t} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(260px, 1fr)", gap: 14, marginBottom: 14 }}>
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Subject completion</div>
          <SubjectRings progress={subjectProgress} t={t} />
        </div>

        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Study hours — last 7 days</div>
          <BarChartMini data={dailyData} color={ACCENT} t={t} />
        </div>
      </div>

      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Study hours — last 6 weeks</div>
        <BarChartMini data={weeklyData} color="#5B8DEF" t={t} height={130} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   INSTITUTION DASHBOARD
   Scope note: this is the student-facing slice of what InnovationOS's spec
   described (timetable, attendance, notices, exams, events, materials) —
   built to fit this app's single-student, storage-backed architecture.
   Role switching, teacher/admin/parent portals, messaging, community, and a
   separate backend are a different, much larger product and aren't part of
   this MVP.
   --------------------------------------------------------------------------- */

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + "T00:00:00").getTime();
  const today = startOfTodayMs();
  return Math.round((target - today) / 86400000);
}

function getTodayKey() {
  const idx = new Date().getDay(); // 0 = Sun
  const map = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const key = map[idx];
  return TIMETABLE_DAYS.includes(key) ? key : null;
}

function getNextClass() {
  const todayKey = getTodayKey();
  const nowLabel = `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;
  if (todayKey) {
    const upcoming = (TIMETABLE[todayKey] || []).find((p) => p.time > nowLabel);
    if (upcoming) return { ...upcoming, day: "Today" };
  }
  // fall through to the next day in the week that has periods
  const startIdx = TIMETABLE_DAYS.indexOf(todayKey) + 1;
  for (let i = 0; i < TIMETABLE_DAYS.length; i++) {
    const day = TIMETABLE_DAYS[(startIdx + i) % TIMETABLE_DAYS.length];
    const periods = TIMETABLE[day] || [];
    if (periods.length > 0) return { ...periods[0], day };
  }
  return null;
}

function periodLabel(period) {
  if (period.type === "break") return period.label;
  if (period.type === "mock") return period.label;
  if (period.type === "doubt") return period.label;
  return SUBJECTS[period.subjectId]?.name || "Class";
}

function SegmentedTabs({ options, value, onChange, t }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 18, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              padding: "7px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              border: `1px solid ${active ? t.text : t.border}`,
              background: active ? t.text : "transparent",
              color: active ? t.bg : t.textMuted,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function InstitutionOverview({ readNoticeIds, t }) {
  const nextClass = useMemo(() => getNextClass(), []);
  const unreadCount = NOTICES.filter((n) => !readNoticeIds.includes(n.id)).length;
  const nextExam = useMemo(
    () => [...EXAM_SCHEDULE].filter((e) => e.status === "upcoming").sort((a, b) => new Date(a.date) - new Date(b.date))[0],
    []
  );
  const overallAttendancePct = useMemo(() => {
    const totals = Object.values(ATTENDANCE_SUMMARY).reduce(
      (acc, s) => ({ present: acc.present + s.present, total: acc.total + s.present + s.absent + s.late }),
      { present: 0, total: 0 }
    );
    return Math.round((totals.present / totals.total) * 100);
  }, []);

  return (
    <div>
      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12, marginBottom: 20,
        }}
      >
        <StatCard
          icon={Clock} label="Next class"
          value={nextClass ? periodLabel(nextClass) : "—"}
          sub={nextClass ? `${nextClass.day} · ${nextClass.time}` : "Nothing scheduled"}
          accent={ACCENT} t={t}
        />
        <StatCard
          icon={Users} label="Attendance"
          value={`${overallAttendancePct}%`}
          sub={overallAttendancePct < ATTENDANCE_TARGET_PCT ? "below target" : "on track"}
          accent={overallAttendancePct < ATTENDANCE_TARGET_PCT ? STREAK_ACCENT : "#00E699"} t={t}
        />
        <StatCard
          icon={GraduationCap} label="Next exam"
          value={nextExam ? nextExam.subjectId && SUBJECTS[nextExam.subjectId].name : "—"}
          sub={nextExam ? `in ${daysUntil(nextExam.date)} days` : "None scheduled"}
          accent={ACCENT} t={t}
        />
        <StatCard
          icon={Bell} label="Notices" value={unreadCount}
          sub={unreadCount > 0 ? "unread" : "all caught up"}
          accent={unreadCount > 0 ? "#F2635C" : "#00E699"} t={t}
        />
      </div>

      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>What needs your attention</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {overallAttendancePct < ATTENDANCE_TARGET_PCT && (
            <AttentionRow icon={AlertCircle} color="#F2635C" t={t}>
              Attendance is at {overallAttendancePct}%, below your {ATTENDANCE_TARGET_PCT}% target.
            </AttentionRow>
          )}
          {nextExam && daysUntil(nextExam.date) <= 7 && (
            <AttentionRow icon={GraduationCap} color={ACCENT} t={t}>
              {nextExam.title} is in {daysUntil(nextExam.date)} days — syllabus: {nextExam.syllabus.join(", ")}.
            </AttentionRow>
          )}
          {unreadCount > 0 && (
            <AttentionRow icon={Bell} color="#5B8DEF" t={t}>
              {unreadCount} unread {unreadCount === 1 ? "notice" : "notices"} from the institute.
            </AttentionRow>
          )}
          {overallAttendancePct >= ATTENDANCE_TARGET_PCT && (!nextExam || daysUntil(nextExam.date) > 7) && unreadCount === 0 && (
            <div style={{ fontSize: 12.5, color: t.textMuted }}>Nothing urgent — you're all caught up.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AttentionRow({ icon: Icon, color, t, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
      <Icon size={15} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: t.text, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function InstitutionTimetable({ t }) {
  const todayKey = getTodayKey();
  const nowLabel = `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 10, minWidth: 720 }}>
        {TIMETABLE_DAYS.map((day) => {
          const isToday = day === todayKey;
          const periods = TIMETABLE[day] || [];
          return (
            <div key={day} style={{ flex: 1, minWidth: 108 }}>
              <div
                style={{
                  fontSize: 12, fontWeight: 700, marginBottom: 8, textAlign: "center",
                  padding: "5px 0", borderRadius: 7,
                  background: isToday ? `${ACCENT}1A` : "transparent",
                  color: isToday ? ACCENT : t.textMuted,
                }}
              >
                {day}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {periods.map((p, i) => {
                  const isCurrent = isToday && p.time <= nowLabel &&
                    (periods[i + 1] ? periods[i + 1].time > nowLabel : true) &&
                    p.time !== undefined;
                  const subject = p.subjectId ? SUBJECTS[p.subjectId] : null;
                  return (
                    <div
                      key={i}
                      style={{
                        background: isCurrent ? `${subject ? subject.color : ACCENT}1A` : t.surface,
                        border: `1px solid ${isCurrent ? (subject ? subject.color : ACCENT) : t.border}`,
                        borderRadius: 8, padding: "7px 8px",
                      }}
                    >
                      <div style={{ fontSize: 10, color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {p.time}
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: subject ? subject.color : t.textMuted, marginTop: 2 }}>
                        {periodLabel(p)}
                      </div>
                      {p.room && (
                        <div style={{ fontSize: 10, color: t.textFaint, marginTop: 1 }}>Room {p.room}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InstitutionAttendance({ t }) {
  const rows = Object.entries(ATTENDANCE_SUMMARY).map(([subjectId, s]) => {
    const total = s.present + s.absent + s.late;
    const pct = Math.round((s.present / total) * 100);
    return { subjectId, ...s, total, pct };
  });
  const overall = Math.round(
    (rows.reduce((sum, r) => sum + r.present, 0) / rows.reduce((sum, r) => sum + r.total, 0)) * 100
  );

  return (
    <div>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Overall attendance</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: overall < ATTENDANCE_TARGET_PCT ? STREAK_ACCENT : "#00E699" }}>
            {overall}%
          </span>
        </div>
        <ProgressBar pct={overall} color={overall < ATTENDANCE_TARGET_PCT ? STREAK_ACCENT : "#00E699"} t={t} height={8} />
        {overall < ATTENDANCE_TARGET_PCT && (
          <div style={{ fontSize: 12, color: STREAK_ACCENT, marginTop: 8 }}>
            Below your {ATTENDANCE_TARGET_PCT}% target.
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const subject = SUBJECTS[r.subjectId];
          return (
            <div key={r.subjectId} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: subject.color }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{subject.name}</span>
                </div>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5, color: r.pct < ATTENDANCE_TARGET_PCT ? STREAK_ACCENT : t.text }}>
                  {r.pct}%
                </span>
              </div>
              <ProgressBar pct={r.pct} color={subject.color} t={t} />
              <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 11.5, color: t.textMuted }}>
                <span>Present: {r.present}</span>
                <span>Absent: {r.absent}</span>
                <span>Late: {r.late}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NoticeCard({ notice, isRead, onMarkRead, t }) {
  return (
    <div
      className="dashboard-task-row"
      style={{
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 15,
        marginBottom: 8, opacity: isRead ? 0.65 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: NOTICE_PRIORITY_COLOR[notice.priority],
              }}
            />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: t.text }}>{notice.title}</span>
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginBottom: 6 }}>
            {notice.description}
          </div>
          <div style={{ fontSize: 11, color: t.textFaint }}>
            {notice.author} · {formatDateLabel(notice.date)} · {notice.category}
          </div>
        </div>
        {!isRead && (
          <button
            onClick={() => onMarkRead(notice.id)}
            style={{
              flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 7,
              border: `1px solid ${t.border}`, background: "transparent", color: t.textMuted, cursor: "pointer",
            }}
          >
            Mark read
          </button>
        )}
      </div>
    </div>
  );
}

function InstitutionNotices({ readNoticeIds, onMarkRead, t }) {
  const sorted = [...NOTICES].sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <div>
      {sorted.map((n) => (
        <NoticeCard key={n.id} notice={n} isRead={readNoticeIds.includes(n.id)} onMarkRead={onMarkRead} t={t} />
      ))}
    </div>
  );
}

function ExamCard({ exam, t }) {
  const subject = SUBJECTS[exam.subjectId];
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: subject.color }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{exam.title}</span>
        </div>
        {exam.status === "completed" ? (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: "#00E699" }}>
            {exam.marks}/{exam.totalMarks}
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: t.textMuted }}>
            in {daysUntil(exam.date)}d
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 12, color: t.textMuted, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><CalendarDays size={12} /> {formatDateLabel(exam.date)}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {exam.time} · {exam.duration}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {exam.room}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {exam.syllabus.map((s) => (
          <span
            key={s}
            style={{
              fontSize: 10.5, padding: "3px 8px", borderRadius: 999,
              background: t.surfaceRaised, border: `1px solid ${t.border}`, color: t.textMuted,
            }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function InstitutionExams({ t }) {
  const upcoming = EXAM_SCHEDULE.filter((e) => e.status === "upcoming").sort((a, b) => new Date(a.date) - new Date(b.date));
  const completed = EXAM_SCHEDULE.filter((e) => e.status === "completed").sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: t.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Upcoming
      </div>
      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming exams" body="Nothing scheduled right now." t={t} />
      ) : (
        upcoming.map((e) => <ExamCard key={e.id} exam={e} t={t} />)
      )}
      {completed.length > 0 && (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: t.textMuted, margin: "18px 0 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Results
          </div>
          {completed.map((e) => <ExamCard key={e.id} exam={e} t={t} />)}
        </>
      )}
    </div>
  );
}

function EventCard({ event, t }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <PartyPopper size={15} color={ACCENT} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{event.title}</span>
      </div>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5, marginBottom: 8 }}>{event.description}</div>
      <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: t.textFaint, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><CalendarDays size={12} /> {formatDateLabel(event.date)}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {event.time}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {event.location}</span>
        <span>by {event.organizer}</span>
      </div>
    </div>
  );
}

function InstitutionEvents({ t }) {
  const sorted = [...EVENTS].sort((a, b) => new Date(a.date) - new Date(b.date));
  return (
    <div>
      {sorted.map((e) => <EventCard key={e.id} event={e} t={t} />)}
    </div>
  );
}

function MaterialRow({ material, t }) {
  const subject = SUBJECTS[material.subjectId];
  const Icon = MATERIAL_TYPE_ICON[material.type] || FileText;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, marginBottom: 6,
      }}
    >
      <span
        style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: `${subject.color}1A`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={14} color={subject.color} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{material.title}</div>
        <div style={{ fontSize: 11, color: t.textFaint }}>
          {subject.name} · {material.teacher} · {formatDateLabel(material.uploadDate)}
        </div>
      </div>
      <span
        style={{
          fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: t.textMuted,
          border: `1px solid ${t.border}`, borderRadius: 6, padding: "3px 7px", flexShrink: 0,
        }}
      >
        {material.type}
      </span>
    </div>
  );
}

function InstitutionMaterials({ t }) {
  const [subjectFilter, setSubjectFilter] = useState("all");
  const filtered = subjectFilter === "all" ? MATERIALS : MATERIALS.filter((m) => m.subjectId === subjectFilter);
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          style={{
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 9,
            padding: "8px 10px", color: t.text, fontSize: 13, fontFamily: "inherit",
          }}
        >
          {SUBJECT_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {filtered.map((m) => <MaterialRow key={m.id} material={m} t={t} />)}
    </div>
  );
}

const INSTITUTION_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "timetable", label: "Timetable" },
  { id: "attendance", label: "Attendance" },
  { id: "notices", label: "Notices" },
  { id: "exams", label: "Exams" },
  { id: "events", label: "Events" },
  { id: "materials", label: "Materials" },
];

function LegacyInstitutionView({ readNoticeIds, onMarkNoticeRead, t }) {
  const [section, setSection] = useState("overview");
  const unreadCount = NOTICES.filter((n) => !readNoticeIds.includes(n.id)).length;

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }}>
          {INSTITUTION.name}
        </div>
        <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 16 }}>
          {INSTITUTION.program} · Class {INSTITUTION.studentClass}-{INSTITUTION.section} · Roll {INSTITUTION.rollNumber}
        </div>
      </div>

      <SegmentedTabs
        options={INSTITUTION_SECTIONS.map((s) =>
          s.id === "notices" && unreadCount > 0 ? { ...s, label: `${s.label} (${unreadCount})` } : s
        )}
        value={section}
        onChange={setSection}
        t={t}
      />

      {section === "overview" && <InstitutionOverview readNoticeIds={readNoticeIds} t={t} />}
      {section === "timetable" && <InstitutionTimetable t={t} />}
      {section === "attendance" && <InstitutionAttendance t={t} />}
      {section === "notices" && <InstitutionNotices readNoticeIds={readNoticeIds} onMarkRead={onMarkNoticeRead} t={t} />}
      {section === "exams" && <InstitutionExams t={t} />}
      {section === "events" && <InstitutionEvents t={t} />}
      {section === "materials" && <InstitutionMaterials t={t} />}
    </div>
  );
}

function InstitutionView({ readNoticeIds, onMarkNoticeRead, t }) {
  if (isSupabaseConfigured) return <InstitutePortal t={t} />;
  return <LegacyInstitutionView readNoticeIds={readNoticeIds} onMarkNoticeRead={onMarkNoticeRead} t={t} />;
}

/* ---------------------------------------------------------------------------
  LOGIN GATE
  Email/password is verified by Supabase when configured. Without Supabase
  configuration, the app retains its local demo login.
   --------------------------------------------------------------------------- */

function LoginView({ onLogin, t }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await onLogin(email, password, mode);
      if (result?.message) setMessage(result.message);
    } catch (loginError) {
      setError(loginError.message || "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGuestLogin() {
    setBusy(true);
    setError("");
    try {
      await onLogin("guest@example.com", "", "guest");
    } catch (loginError) {
      setError(loginError.message || "Could not continue as guest.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: 560, borderRadius: 16, background: t.bg, color: t.text,
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: 9,
              background: `linear-gradient(135deg, ${SUBJECTS.physics.color}, ${SUBJECTS.mathematics.color})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, color: "#0F1419",
            }}
          >
            S
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 19 }}>
            StudentOS
          </span>
        </div>

        <div
          style={{
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16,
            padding: 26,
          }}
        >
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: t.surfaceRaised, borderRadius: 9, padding: 3 }}>
            {["login", "signup"].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 12.5, fontWeight: 600,
                  background: mode === m ? t.surface : "transparent",
                  color: mode === m ? t.text : t.textMuted,
                }}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <label style={{ display: "block", fontSize: 12, color: t.textMuted, marginBottom: 6 }}>Email</label>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
                background: t.surfaceRaised, border: `1px solid ${t.border}`, borderRadius: 9, padding: "9px 12px",
              }}
            >
              <Mail size={14} color={t.textFaint} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ border: "none", outline: "none", background: "transparent", color: t.text, fontSize: 13.5, flex: 1, fontFamily: "inherit" }}
              />
            </div>

            <label style={{ display: "block", fontSize: 12, color: t.textMuted, marginBottom: 6 }}>Password</label>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 18,
                background: t.surfaceRaised, border: `1px solid ${t.border}`, borderRadius: 9, padding: "9px 12px",
              }}
            >
              <Lock size={14} color={t.textFaint} />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ border: "none", outline: "none", background: "transparent", color: t.text, fontSize: 13.5, flex: 1, fontFamily: "inherit" }}
              />
            </div>

            {error && <div role="alert" style={{ color: "#ff8585", fontSize: 12, marginBottom: 12 }}>{error}</div>}
            {message && <div role="status" style={{ color: t.textMuted, fontSize: 12, marginBottom: 12 }}>{message}</div>}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 9, border: "none",
                background: ACCENT, color: "#0F1419", fontSize: 13.5, fontWeight: 700, cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            onClick={handleGuestLogin}
            disabled={busy}
            style={{
              width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 9,
              border: `1px solid ${t.border}`, background: "transparent", color: t.textMuted,
              fontSize: 13, cursor: "pointer",
            }}
          >
            Continue as guest
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 }}>
          <ShieldCheck size={12} color={t.textFaint} />
          <span style={{ fontSize: 11, color: t.textFaint }}>
            {isSupabaseConfigured
              ? "Your account is secured by Supabase."
              : "Demo mode — configure Supabase to enable real accounts and cloud sync."}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   SUBSCRIPTION / BILLING (demo only)
   No payment processor is wired up. Selecting a plan just sets a label in
   storage — nothing is charged, and there is no real billing relationship.
   A real version needs a backend + a payment processor (e.g. Stripe); that
   can never live in frontend code, since it involves real money.
   --------------------------------------------------------------------------- */

const PLANS = [
  {
    id: "free", name: "Free", portal: "student", prices: { month: 0, quarter: 0, year: 0 },
    tagline: "A strong foundation for your study routine.",
    features: [
      "Core StudentOS Dashboard", "Syllabus & Subject Tracking", "Study Timer & Streaks",
      "Basic Progress Tracking", "Test & Attendance Tracking", "Basic Analytics",
      "XP & Gamification", "Limited Customization",
    ],
  },
  {
    id: "pro", name: "Pro", portal: "student", prices: { month: 149, quarter: 399, year: 1299 },
    tagline: "More insight and structure for serious preparation.",
    features: [
      "Everything in Free", "Advanced Performance Analytics", "Smart Study Planning",
      "Detailed Progress Reports", "Weak Topic & Chapter Insights",
      "Advanced Timetable & Revision Tools", "Full Customization & Themes", "Ad-Free Experience",
    ],
    highlighted: true,
  },
  {
    id: "institute", name: "Institute Lite", portal: "institute", unitLabel: "per class",
    prices: { month: 999, quarter: 2699, year: 9999 },
    tagline: "The essentials for organized institute operations.",
    features: [
      "Student & Teacher Management", "Classes & Batch Management", "Attendance & Test Attendance",
      "Tests, Marks & Results", "Syllabus & Topic Tracking", "Timetable & Notices",
      "Basic Reports & Analytics", "Student/Parent Access",
    ],
  },
  {
    id: "institute-pro", name: "Institute Pro", portal: "institute", unitLabel: "per class",
    prices: { month: 1499, quarter: 4199, year: 14999 },
    tagline: "Deeper insight and control across your institute.",
    features: [
      "Everything in Lite", "Advanced Performance Analytics", "Detailed Student Reports",
      "Rankings & Leaderboards", "Assignments & Study Material", "Advanced Parent Portal",
      "Custom Modules & Dashboard", "Institute Branding & Permissions",
    ],
    highlighted: true,
  },
];

const PLAN_DURATIONS = [
  { id: "month", label: "1 Month", period: "/ month" },
  { id: "quarter", label: "3 Months", period: "/ 3 months" },
  { id: "year", label: "1 Year", period: "/ year" },
];

function MagneticButton({ children, style = {}, onClick, disabled = false, type = "button", ...props }) {
  const ref = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handlePointerMove = (event) => {
    if (!ref.current || disabled) return;
    const rect = ref.current.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    setOffset({
      x: dx * 0.18,
      y: dy * 0.18,
    });
  };

  const handleLeave = () => setOffset({ x: 0, y: 0 });

  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      onPointerMove={handlePointerMove}
      onPointerLeave={handleLeave}
      onPointerCancel={handleLeave}
      style={{
        position: "relative",
        overflow: "hidden",
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease, filter 220ms ease",
        boxShadow: `0 10px 24px rgba(0, 0, 0, 0.16)`,
        willChange: "transform",
        ...style,
      }}
      {...props}
    >
      <span
        style={{
          display: "inline-block",
          transform: `translate(${offset.x * 0.7}px, ${offset.y * 0.7}px)`,
          transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
    </button>
  );
}

function AnimatedTabGroup({ items, activeId, onSelect, t }) {
  const containerRef = useRef(null);
  const buttonRefs = useRef({});
  const [indicator, setIndicator] = useState({ top: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const activeButton = buttonRefs.current[activeId];
    if (!container || !activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeButton.getBoundingClientRect();
    setIndicator({
      top: activeRect.top - containerRect.top,
      height: activeRect.height,
    });
  }, [activeId, t]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 4,
          right: 4,
          top: indicator.top,
          height: indicator.height || 32,
          borderRadius: 8,
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${t.border}`,
          boxShadow: "0 3px 10px rgba(15, 20, 25, 0.04)",
          transition: "top 300ms ease, height 300ms ease, background 200ms ease",
        }}
      />
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(node) => { buttonRefs.current[item.id] = node; }}
            onClick={() => onSelect(item.id)}
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: active ? t.text : t.textMuted,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "color 200ms ease, transform 200ms ease",
            }}
          >
            <item.icon size={15} strokeWidth={2.1} />
            <span style={{ flex: 1 }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AnimatedChoiceGroup({ options, value, onChange, t, className = "" }) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        gap: 4,
        margin: "18px 0 20px",
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 9,
        padding: 3,
        width: "fit-content",
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <MagneticButton
            key={option.value}
            className={className ? `${className}__option${active ? " is-active" : ""}` : undefined}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            style={{
              padding: "7px 16px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              background: active ? t.surfaceRaised : "transparent",
              color: active ? t.text : t.textMuted,
              boxShadow: active ? "0 6px 14px rgba(15, 20, 25, 0.08)" : "none",
              filter: "none",
            }}
          >
            {option.label}
          </MagneticButton>
        );
      })}
    </div>
  );
}

function PlanCard({ plan, duration, isCurrent, onSelect, t }) {
  const price = plan.prices[duration.id];
  const period = price === 0 ? "Always free" : `${plan.unitLabel ? `${plan.unitLabel} ` : ""}${duration.period}`;
  const actionLabel = plan.id === "free" ? "Get started" : plan.portal === "institute" ? "Get started" : "Upgrade";

  return (
    <div
      className={`billing-plan-card${plan.highlighted ? " is-featured" : ""}${isCurrent ? " is-current" : ""}`}
      style={{ "--billing-surface": t.surface, "--billing-raised": t.surfaceRaised, "--billing-border": t.border, "--billing-text": t.text, "--billing-muted": t.textMuted }}
    >
      {plan.highlighted && <span className="billing-plan-card__badge"><Sparkles size={11} />Recommended</span>}
      <div className="billing-plan-card__heading">
        <div>
          <h2>{plan.name}</h2>
          <p>{plan.tagline}</p>
        </div>
        {isCurrent && <span className="billing-plan-card__current">Current</span>}
      </div>
      <div className="billing-plan-card__price" aria-label={price === 0 ? "Free" : `₹${price.toLocaleString("en-IN")} ${period}`}>
        {price === 0 ? <span className="billing-plan-card__free">Free</span> : (
          <><span className="billing-plan-card__currency">₹</span><SlidingNumber value={price} locale="en-IN" /></>
        )}
        <span className="billing-plan-card__period">{period}</span>
      </div>
      <div className="billing-plan-card__divider" />
      <ul className="billing-plan-card__features">
        {plan.features.map((feature) => (
          <li key={feature}><Check size={14} /><span>{feature}</span></li>
        ))}
      </ul>
      <MagneticButton
        className={`billing-plan-card__cta${plan.highlighted ? " is-primary" : ""}`}
        onClick={() => onSelect(plan.id, duration.id)}
        disabled={isCurrent}
        style={{ "--billing-border": t.border, "--billing-raised": t.surfaceRaised }}
      >
        {isCurrent ? "Current plan" : actionLabel}
      </MagneticButton>
    </div>
  );
}

function SubscriptionView({ currentPlan, currentDuration = "month", onSelectPlan, t }) {
  const [portal, setPortal] = useState("student");
  const initialDuration = PLAN_DURATIONS.some((option) => option.id === currentDuration) ? currentDuration : "month";
  const [studentDuration, setStudentDuration] = useState(initialDuration);
  const [instituteDuration, setInstituteDuration] = useState(initialDuration);
  const [justChanged, setJustChanged] = useState(null);
  const durationId = portal === "student" ? studentDuration : instituteDuration;
  const duration = PLAN_DURATIONS.find((option) => option.id === durationId) || PLAN_DURATIONS[0];
  const visiblePlans = PLANS.filter((plan) => plan.portal === portal);

  function handleSelect(planId, selectedDuration) {
    onSelectPlan(planId, selectedDuration);
    if (portal === "student") setStudentDuration(selectedDuration);
    else setInstituteDuration(selectedDuration);
    setJustChanged({ planId, duration: selectedDuration });
    setTimeout(() => setJustChanged(null), 3000);
  }

  return (
    <div className="billing-page" style={{ "--billing-accent": ACCENT, "--billing-mint": "#00E699", "--billing-border": t.border, "--billing-surface": t.surface, "--billing-raised": t.surfaceRaised, "--billing-text": t.text, "--billing-muted": t.textMuted }}>
      <header className="billing-page__heading">
        <div>
          <p className="billing-page__eyebrow">Flexible plans</p>
          <h1>Plans & Billing</h1>
          <p>Choose a workspace for your learning or institute.</p>
        </div>
        <span className="billing-demo-note"><ShieldCheck size={13} />Demo only · no payment is processed</span>
      </header>

      <div className="billing-portal-switch" role="tablist" aria-label="Choose a plan portal">
        <span className={`billing-portal-switch__indicator${portal === "institute" ? " is-institute" : ""}`} />
        <MagneticButton
          role="tab"
          aria-selected={portal === "student"}
          className={`billing-portal-switch__button${portal === "student" ? " is-active" : ""}`}
          onClick={() => setPortal("student")}
          style={{ "--billing-border": t.border }}
        >
          Student
        </MagneticButton>
        <MagneticButton
          role="tab"
          aria-selected={portal === "institute"}
          className={`billing-portal-switch__button${portal === "institute" ? " is-active" : ""}`}
          onClick={() => setPortal("institute")}
          style={{ "--billing-border": t.border }}
        >
          Institute
        </MagneticButton>
      </div>

      <div className="billing-duration-heading">
        <div><h2>{portal === "student" ? "Student plans" : "Institute plans"}</h2><p>{portal === "student" ? "Pro term selection" : "Pricing per class"}</p></div>
        <AnimatedChoiceGroup
          className="billing-duration-toggle"
          options={PLAN_DURATIONS.map((option) => ({ value: option.id, label: option.label }))}
          value={duration.id}
          onChange={(nextDuration) => portal === "student" ? setStudentDuration(nextDuration) : setInstituteDuration(nextDuration)}
          t={t}
        />
      </div>

      {justChanged && (
        <div className="billing-confirmation" role="status">
          <Check size={14} />{PLANS.find((plan) => plan.id === justChanged.planId)?.name} · {PLAN_DURATIONS.find((option) => option.id === justChanged.duration)?.label} selected. Demo only; nothing was charged.
        </div>
      )}

      <AnimatedGroup
        key={portal}
        variants={{
          container: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.09 } } },
          item: { hidden: { opacity: 0, y: 18, filter: "blur(3px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.48, type: "spring", bounce: 0.16 } } },
        }}
        className="billing-plan-grid"
      >
        {visiblePlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            duration={duration}
            isCurrent={currentPlan === plan.id && (plan.id === "free" || currentDuration === duration.id)}
            onSelect={handleSelect}
            t={t}
          />
        ))}
      </AnimatedGroup>
    </div>
  );
}

/* ============================================================================
   APP
   ============================================================================ */

export default function StudentOS() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [topicStatus, setTopicStatus] = useState({});
  const [sessions, setSessions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [readNoticeIds, setReadNoticeIds] = useState([]);
  const [auth, setAuth] = useState(DEFAULT_AUTH);
  const [titleSystem, setTitleSystem] = useState(DEFAULT_TITLE_SYSTEM);
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [p, ts, s, tk, rn, a, titleData] = await loadAppData();
      if (!mounted) return;
      setProfile(p);
      setTopicStatus(ts);
      setSessions(s);
      setTasks(tk);
      setReadNoticeIds(rn);
      setAuth(a);
      setTitleSystem(titleData);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.dataset.theme = profile.theme;
    }
  }, [profile.theme]);

  const toggleTheme = useCallback(() => {
    setProfile((prev) => {
      const next = { ...prev, theme: prev.theme === "dark" ? "light" : "dark" };
      db.saveProfile(next);
      return next;
    });
  }, []);

  const awardXp = useCallback((amount) => {
    setProfile((prev) => {
      const next = { ...prev, xp: prev.xp + amount };
      db.saveProfile(next);
      return next;
    });
  }, []);

  // Phase 2: cycle a topic's status and persist it. Completing a topic
  // (transitioning INTO "completed") awards a one-time XP bonus.
  const handleCycleTopic = useCallback((topicId) => {
    setTopicStatus((prev) => {
      const prevStatus = prev[topicId] || "not_started";
      const newStatus = nextStatus(prevStatus);
      const next = { ...prev, [topicId]: newStatus };
      db.saveTopicStatus(next);
      if (newStatus === "completed" && prevStatus !== "completed") {
        awardXp(XP_RULES.topicCompletedBonus);
      }
      return next;
    });
  }, [awardXp]);

  // Phase 3: a finished timer session is appended, persisted, and its
  // XP (computed by the timer via computeSessionXp) is credited.
  const handleCompleteSession = useCallback((session) => {
    setSessions((prev) => {
      const next = [...prev, session];
      db.saveSessions(next);
      return next;
    });
    awardXp(session.xpEarned);
  }, [awardXp]);

  // Phase: Institution — mark a notice read and persist it. Everything else
  // in the institution dashboard is institution-authored seed data, so it
  // has no student-side mutation.
  const handleMarkNoticeRead = useCallback((noticeId) => {
    setReadNoticeIds((prev) => {
      if (prev.includes(noticeId)) return prev;
      const next = [...prev, noticeId];
      db.saveReadNotices(next);
      return next;
    });
  }, []);

  const handleLogin = useCallback(async (email, password, mode = "login") => {
    if (mode !== "guest" && isSupabaseConfigured) {
      const { data, error } = mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) {
        return { message: "Check your email to confirm your account, then sign in." };
      }

      setLoading(true);
      const [p, ts, s, tk, rn, , titleData] = await loadAppData();
      setProfile(p);
      setTopicStatus(ts);
      setSessions(s);
      setTasks(tk);
      setReadNoticeIds(rn);
      setTitleSystem(titleData);
      const next = { loggedIn: true, email: data.user.email };
      setAuth(next);
      setLoading(false);
      return;
    }

    const next = { loggedIn: true, email };
    setAuth(next);
    db.saveAuth(next);
  }, []);

  const handleLogout = useCallback(async () => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut();
      if (error) console.error("Could not sign out of Supabase", error);
    }
    const next = { loggedIn: false, email: null };
    setAuth(next);
    if (!isSupabaseConfigured) db.saveAuth(next);
  }, []);

  // DEMO ONLY — no payment is processed. This just labels the profile.
  const handleSelectPlan = useCallback((planId, duration = "month") => {
    setProfile((prev) => {
      const next = { ...prev, plan: planId, planDuration: duration };
      db.saveProfile(next);
      return next;
    });
  }, []);

  // Phase 4: Today's Plan — tasks are dated with a local YYYY-MM-DD key so
  // "today" always matches the student's own clock, not UTC.
  const handleAddTask = useCallback(({ subjectId, topicId, estMinutes, priority }) => {
    setTasks((prev) => {
      const next = [
        ...prev,
        {
          id: `task-${Date.now()}`,
          date: localDateKey(),
          subjectId, topicId, estMinutes, priority,
          status: "pending",
        },
      ];
      db.saveTasks(next);
      return next;
    });
  }, []);

  const handleToggleTask = useCallback((taskId) => {
    setTasks((prev) => {
      const next = prev.map((tk) =>
        tk.id === taskId ? { ...tk, status: tk.status === "done" ? "pending" : "done" } : tk
      );
      db.saveTasks(next);
      return next;
    });
  }, []);

  const handleDeleteTask = useCallback((taskId) => {
    setTasks((prev) => {
      const next = prev.filter((tk) => tk.id !== taskId);
      db.saveTasks(next);
      return next;
    });
  }, []);

  const handleUpdateDailyGoal = useCallback((minutes) => {
    setProfile((prev) => {
      const next = { ...prev, dailyGoalMinutes: minutes };
      db.saveProfile(next);
      return next;
    });
  }, []);

  const t = THEMES[profile.theme] || THEMES.dark;
  const activeEmail = (auth.email || "").trim().toLowerCase();
  const isOwner = Boolean(OWNER_EMAIL && activeEmail === OWNER_EMAIL);
  const currentMember = titleSystem.members[activeEmail] || EMPTY_MEMBER;
  const role = isOwner ? "owner" : ROLE_IDS.includes(currentMember.role) && currentMember.role !== "owner" ? currentMember.role : "student";
  const grantedTitleIds = currentMember.grantedTitleIds || EMPTY_MEMBER.grantedTitleIds;
  const titles = [
    ...DEFAULT_TITLES,
    ...(titleSystem.customTitles || []),
  ].map((title) => {
    const resolved = { ...title, ...(titleSystem.overrides[title.id] || {}) };
    return { ...resolved, rarity: normalizeRarity(resolved.rarity) };
  });
  const selectedTitle = titles.find((title) => title.id === profile.activeTitleId);
  const defaultTeacherTitle = titles.find((title) => title.id === "founders-mentor");
  const currentTitle = isOwner
    ? titles.find((title) => title.id === "architect")
    : selectedTitle && isTitleUnlocked(selectedTitle, { role, xp: profile.xp, grantedTitleIds })
      ? { ...selectedTitle, ownerGranted: grantedTitleIds.includes(selectedTitle.id) }
      : role === "teacher" && defaultTeacherTitle
        ? defaultTeacherTitle
        : null;

  const updateTitleSystem = useCallback((update) => {
    setTitleSystem((previous) => {
      const next = update(previous);
      db.saveTitleSystem(next);
      return next;
    });
  }, []);

  const handleEquipTitle = useCallback((titleId) => {
    if (isOwner) return;
    const title = titles.find((entry) => entry.id === titleId);
    if (!isTitleUnlocked(title, { role, xp: profile.xp, grantedTitleIds })) return;
    setProfile((previous) => {
      const next = { ...previous, activeTitleId: titleId };
      db.saveProfile(next);
      return next;
    });
  }, [isOwner, titles, role, profile.xp, grantedTitleIds]);

  const handleUpdateProfileName = useCallback((name) => {
    setProfile((previous) => {
      const next = { ...previous, name: name.trim() || "Student" };
      db.saveProfile(next);
      return next;
    });
  }, []);

  const handleSaveMember = useCallback(({ email, name, role: memberRole }) => {
    if (!isOwner || email === OWNER_EMAIL || !["student", "teacher", "admin"].includes(memberRole)) return;
    updateTitleSystem((previous) => ({
      ...previous,
      members: {
        ...previous.members,
        [email]: {
          ...(previous.members[email] || {}),
          name: name || email.split("@")[0],
          role: memberRole,
          grantedTitleIds: previous.members[email]?.grantedTitleIds || [],
        },
      },
    }));
  }, [isOwner, updateTitleSystem]);

  const handleToggleGrant = useCallback((email, titleId, shouldGrant) => {
    if (!isOwner || email === OWNER_EMAIL) return;
    const title = titles.find((entry) => entry.id === titleId);
    const member = titleSystem.members[email];
    if (!title?.manuallyGranted || title.ownerOnly || title.category === "owner-exclusive" || !member) return;
    if (title.category === "teacher" && member.role !== "teacher") return;
    updateTitleSystem((previous) => {
      const granted = new Set(previous.members[email]?.grantedTitleIds || []);
      if (shouldGrant) granted.add(titleId);
      else granted.delete(titleId);
      return {
        ...previous,
        members: {
          ...previous.members,
          [email]: { ...previous.members[email], grantedTitleIds: [...granted] },
        },
      };
    });
  }, [isOwner, titles, titleSystem.members, updateTitleSystem]);

  const handleUpdateTitle = useCallback((titleId, changes) => {
    const title = titles.find((entry) => entry.id === titleId);
    if (!isOwner || !title) return;
    const safeChanges = title.ownerOnly ? { name: changes.name, description: changes.description } : changes;
    updateTitleSystem((previous) => ({
      ...previous,
      overrides: { ...previous.overrides, [titleId]: { ...previous.overrides[titleId], ...safeChanges } },
    }));
  }, [isOwner, titles, updateTitleSystem]);

  const handleCreateTitle = useCallback((title) => {
    if (!isOwner || !["inner-circle", "teacher", "xp", "perks"].includes(title.category)) return;
    updateTitleSystem((previous) => ({ ...previous, customTitles: [...previous.customTitles, title] }));
  }, [isOwner, updateTitleSystem]);

  const handleRemoveTitle = useCallback((titleId) => {
    if (!isOwner || !titleId.startsWith("custom-")) return;
    updateTitleSystem((previous) => ({
      ...previous,
      customTitles: previous.customTitles.filter((title) => title.id !== titleId),
      overrides: Object.fromEntries(Object.entries(previous.overrides).filter(([id]) => id !== titleId)),
      members: Object.fromEntries(Object.entries(previous.members).map(([email, member]) => [
        email,
        { ...member, grantedTitleIds: (member.grantedTitleIds || []).filter((id) => id !== titleId) },
      ])),
    }));
    if (profile.activeTitleId === titleId) {
      setProfile((previous) => {
        const next = { ...previous, activeTitleId: null };
        db.saveProfile(next);
        return next;
      });
    }
  }, [isOwner, updateTitleSystem, profile.activeTitleId]);

  const subjectProgress = useMemo(() => {
    const out = {};
    Object.keys(SUBJECTS).forEach((id) => { out[id] = computeSubjectProgress(id, topicStatus); });
    return out;
  }, [topicStatus]);

  const overallProgress = useMemo(() => computeOverallProgress(topicStatus), [topicStatus]);

  const todayMinutes = useMemo(() => minutesFromSessions(sessions, startOfTodayMs()), [sessions]);
  const weekMinutes = useMemo(() => minutesFromSessions(sessions, startOfWeekMs()), [sessions]);

  const streak = useMemo(
    () => computeStreak(sessions, profile.dailyGoalMinutes),
    [sessions, profile.dailyGoalMinutes]
  );

  // Phase 4: award the daily-goal XP bonus once per calendar day, the first
  // time today's total study minutes crosses the goal.
  useEffect(() => {
    if (loading) return;
    const todayKey = localDateKey();
    if (todayMinutes >= profile.dailyGoalMinutes && profile.lastGoalBonusDate !== todayKey) {
      setProfile((prev) => {
        if (prev.lastGoalBonusDate === todayKey) return prev;
        const next = { ...prev, xp: prev.xp + XP_RULES.dailyGoalBonus, lastGoalBonusDate: todayKey };
        db.saveProfile(next);
        return next;
      });
    }
  }, [todayMinutes, profile.dailyGoalMinutes, profile.lastGoalBonusDate, loading]);

  const todayTasks = useMemo(() => {
    const todayKey = localDateKey();
    return tasks.filter((tk) => tk.date === todayKey);
  }, [tasks]);

  const recentSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, 5),
    [sessions]
  );

  if (loading) {
    return (
      <div style={{
        background: THEMES.dark.bg, color: THEMES.dark.textMuted, minHeight: 420,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif", fontSize: 13.5,
      }}>
        Loading StudentOS…
      </div>
    );
  }

  if (!auth.loggedIn) {
    return <LoginView onLogin={handleLogin} t={t} />;
  }

  return (
    <div
      data-theme={profile.theme}
      style={{
        background: t.bg,
        color: t.text,
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        width: "100%",
        minHeight: "100vh",
        borderRadius: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 22px", borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: `linear-gradient(135deg, ${SUBJECTS.physics.color}, ${SUBJECTS.mathematics.color})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, color: "#0F1419",
            }}
          >
            S
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16 }}>
            StudentOS
          </span>
          <span
            style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
              padding: "3px 8px", borderRadius: 999,
              background: t.surfaceRaised, border: `1px solid ${t.border}`, color: t.textMuted,
            }}
          >
            {EXAMS[profile.examId].name.toUpperCase()}
          </span>
          <button
            onClick={() => setActiveTab("subscription")}
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
              padding: "3px 9px", borderRadius: 999, border: "none", cursor: "pointer",
              background: profile.plan === "free" ? t.surfaceRaised : `${ACCENT}1A`,
              color: profile.plan === "free" ? t.textMuted : ACCENT,
            }}
          >
            {PLANS.find((p) => p.id === profile.plan)?.name || "Free"} plan
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.border}`,
              background: t.surface, color: t.textMuted, display: "flex",
              alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            {profile.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out (demo)"
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.border}`,
              background: t.surface, color: t.textMuted, display: "flex",
              alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Side nav */}
        <div
          style={{
            width: 176, borderRight: `1px solid ${t.border}`, padding: "16px 10px",
            display: "flex", flexDirection: "column", gap: 2, flexShrink: 0,
          }}
        >
          <AnimatedTabGroup
            items={NAV_ITEMS}
            activeId={activeTab}
            onSelect={setActiveTab}
            t={t}
          />
        </div>

        {/* Main content */}
        <div
          className={activeTab === "dashboard" ? "dashboard-view" : undefined}
          data-theme={profile.theme}
          style={{ flex: 1, padding: "22px 24px", overflowY: "auto" }}
        >
          {activeTab === "institution" ? (
            <InstitutionView
              readNoticeIds={readNoticeIds}
              onMarkNoticeRead={handleMarkNoticeRead}
              t={t}
            />
          ) : activeTab === "syllabus" ? (
            <SyllabusView
              topicStatus={topicStatus}
              onCycleTopic={handleCycleTopic}
              subjectProgress={subjectProgress}
              overallProgress={overallProgress}
              t={t}
            />
          ) : activeTab === "timer" ? (
            <TimerView
              onCompleteSession={handleCompleteSession}
              todayMinutes={todayMinutes}
              t={t}
            />
          ) : activeTab === "plan" ? (
            <PlanView
              tasks={todayTasks}
              onAddTask={handleAddTask}
              onToggleTask={handleToggleTask}
              onDeleteTask={handleDeleteTask}
              dailyGoalMinutes={profile.dailyGoalMinutes}
              onUpdateGoal={handleUpdateDailyGoal}
              todayMinutes={todayMinutes}
              t={t}
            />
          ) : activeTab === "progress" ? (
            <ProgressView
              subjectProgress={subjectProgress}
              overallProgress={overallProgress}
              topicStatus={topicStatus}
              sessions={sessions}
              xp={profile.xp}
              streak={streak}
              t={t}
            />
          ) : activeTab === "titles" ? (
            <TitlesView
              profile={profile}
              role={role}
              email={activeEmail}
              title={currentTitle}
              titles={titles}
              titleSystem={titleSystem}
              isOwner={isOwner}
              theme={profile.theme}
              onEquipTitle={handleEquipTitle}
              onSaveMember={handleSaveMember}
              onToggleGrant={handleToggleGrant}
              onUpdateTitle={handleUpdateTitle}
              onCreateTitle={handleCreateTitle}
              onRemoveTitle={handleRemoveTitle}
              onUpdateProfileName={handleUpdateProfileName}
              t={t}
            />
          ) : activeTab === "subscription" ? (
            <SubscriptionView currentPlan={profile.plan} currentDuration={profile.planDuration} onSelectPlan={handleSelectPlan} t={t} />
          ) : activeTab !== "dashboard" ? (
            <PhasePlaceholder tab={activeTab} t={t} />
          ) : (
            <>
              <div className="dashboard-intro" style={{ marginBottom: 20 }}>
                <div className="dashboard-greeting">
                  {greeting()}, <span>{profile.name}</span>.
                </div>
                <div className="dashboard-summary" style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                  {overallProgress > 0
                    ? `${overallProgress}% of the JEE syllabus covered so far.`
                    : "Head to Syllabus to start marking topics, or Timer to log your first session."}
                </div>
                <div style={{ marginTop: 11 }}>
                  <ProfileIdentity profile={profile} role={role} title={currentTitle} t={t} theme={profile.theme} compact />
                </div>
              </div>

              {/* Stat row */}
              <div
                className="dashboard-stat-grid"
                style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12, marginBottom: 20,
                }}
              >
                <StatCard icon={Clock} label="Today" value={formatMinutes(todayMinutes)} sub="study time" accent={ACCENT} t={t} />
                <StatCard icon={CalendarDays} label="This week" value={formatMinutes(weekMinutes)} sub="study time" accent={ACCENT} t={t} />
                <StatCard icon={Flame} label="Streak" value={streak.current} sub={`best: ${streak.longest}`} accent={STREAK_ACCENT} t={t} />
                <StatCard icon={Zap} label="XP" value={profile.xp} sub="total earned" accent={ACCENT} t={t} />
              </div>

              {/* Syllabus + panels */}
              <div className="dashboard-panels">
                <DashboardSyllabusCard
                  topicStatus={topicStatus}
                  onCycleTopic={handleCycleTopic}
                  subjectProgress={subjectProgress}
                  overallProgress={overallProgress}
                  t={t}
                />

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="dashboard-side-panel" style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>Today's plan</span>
                      <button
                        className="dashboard-panel-link"
                        onClick={() => setActiveTab("plan")}
                        style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", padding: 0 }}
                        aria-label="Open Today's Plan"
                      >
                        <ChevronRight size={14} color={t.textFaint} />
                      </button>
                    </div>
                    {todayTasks.length === 0 ? (
                      <EmptyState
                        title="Nothing planned yet"
                        body="Add a subject and topic from Today's Plan to line up your study session."
                        t={t}
                      />
                    ) : (
                      todayTasks
                        .slice(0, 4)
                        .map((tk) => (
                          <TaskRow key={tk.id} task={tk} onToggle={handleToggleTask} onDelete={handleDeleteTask} t={t} />
                        ))
                    )}
                  </div>

                  <div className="dashboard-side-panel" style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>Recent sessions</span>
                      <button
                        className="dashboard-panel-link"
                        onClick={() => setActiveTab("timer")}
                        style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", padding: 0 }}
                        aria-label="Open Timer"
                      >
                        <ChevronRight size={14} color={t.textFaint} />
                      </button>
                    </div>
                    {recentSessions.length === 0 ? (
                      <EmptyState
                        title="No sessions logged"
                        body="Run a focus session from the Timer tab — it'll show up here with subject, duration and XP."
                        t={t}
                      />
                    ) : (
                      recentSessions.map((s) => {
                        const subject = SUBJECTS[s.subjectId];
                        const topic = ALL_TOPICS.find((tp) => tp.id === s.topicId);
                        return (
                          <div
                            key={s.id}
                            className="dashboard-session-row"
                            style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                              borderBottom: `1px solid ${t.border}`,
                            }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: subject.color, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, color: t.text, fontWeight: 500 }}>
                                {topic ? topic.name : subject.name}
                              </div>
                              <div style={{ fontSize: 11, color: t.textFaint }}>
                                {new Date(s.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                              </div>
                            </div>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: t.textMuted }}>
                              {formatMinutes(s.durationSec / 60)}
                            </span>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: ACCENT }}>
                              +{s.xpEarned}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function PhasePlaceholder({ tab, t }) {
  const item = NAV_ITEMS.find((i) => i.id === tab);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 340 }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <div
          style={{
            width: 44, height: 44, borderRadius: 12, background: t.surface, border: `1px solid ${t.border}`,
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
          }}
        >
          <item.icon size={19} color={t.textMuted} strokeWidth={1.8} />
        </div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          {item.label} — coming in Phase {item.phase}
        </div>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5 }}>
          This part of the build isn't scoped for Phase 1. The dashboard, JEE syllabus data,
          and app shell are live now — this section unlocks as we work through the phased plan.
        </div>
      </div>
    </div>
  );
}