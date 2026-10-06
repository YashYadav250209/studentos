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
  Volume2, VolumeX, Settings, Cloud, Pencil, Trophy, UserPlus,
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
  sound: "studentos:sound",
};

const DEFAULT_PROFILE = {
  name: "Student",
  examId: "jee",
  dailyGoalMinutes: 120,
  theme: "dark",
  username: "",
  avatar: { type: "orbis", id: "nova" },
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
    surface: "rgba(14, 13, 24, 0.86)",
    surfaceRaised: "rgba(22, 21, 36, 0.90)",
    chrome: "rgba(18, 16, 34, 0.38)",
    popover: "rgba(20, 18, 36, 0.92)",
    border: "rgba(120, 110, 170, 0.26)",
    text: "#F7F5FC",
    textMuted: "#9B98AA",
    textFaint: "#9490A6",
  },
  light: {
    bg: "#F5F7FA",
    surface: "rgba(255, 255, 255, 0.64)",
    surfaceRaised: "rgba(244, 249, 255, 0.74)",
    chrome: "rgba(255, 255, 255, 0.38)",
    popover: "rgba(255, 255, 255, 0.92)",
    border: "rgba(30, 90, 170, 0.24)",
    text: "#111827",
    textMuted: "#34445E",
    textFaint: "#4A5972",
  },
};

const ACCENT = "#FF5E3A";
const STREAK_ACCENT = "#FF5D73";

// Frosted-glass effect for cards/panels. Keep blur modest: the background animates.
// Sidebar + top bar: lighter tint and stronger blur so the background reads through.
const GLASS_CHROME = { backdropFilter: "blur(18px) saturate(1.25)", WebkitBackdropFilter: "blur(18px) saturate(1.25)" };
const GLASS = { backdropFilter: "blur(12px) saturate(1.1)", WebkitBackdropFilter: "blur(12px) saturate(1.1)" };

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
    <section className="dashboard-syllabus-card" style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
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
        background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 16,
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

      <div style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
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
        <div style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Subject completion</div>
          <SubjectRings progress={subjectProgress} t={t} />
        </div>

        <div style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Study hours — last 7 days</div>
          <BarChartMini data={dailyData} color={ACCENT} t={t} />
        </div>
      </div>

      <div style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
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

      <div style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
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
      <div style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
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
            <div key={r.subjectId} style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14 }}>
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
        background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 12, padding: 15,
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
    <div style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
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
    <div style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
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
        minHeight: "100vh", position: "relative", zIndex: 1, borderRadius: 0,
        background: "transparent", color: t.text,
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
            background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 16,
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

/* ============================================================================
   SPACE BACKGROUND (merged in so the whole app is one file)
   ============================================================================ */

/**
 * SpaceBackground — interactive 3D galaxy (canvas 2D, no dependencies).
 * Fixed behind the whole app. Stars, dust and the galaxy react to the cursor
 * (gravity, swirl, momentum, parallax). Listens on `window`, so it keeps
 * working while the pointer is over your UI.
 *
 * Usage: render once, near the top of your app, and make the app's own
 * root/background transparent so this shows through.
 *   <SpaceBackground />
 */
function SpaceBackground({ style }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cv=canvasRef.current,ctx=cv.getContext('2d');
    const off=[],on=(el,ev,fn,o)=>{el.addEventListener(ev,fn,o);off.push(()=>el.removeEventListener(ev,fn,o))};
    let raf=0;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches, amb=reduce?.25:1;
    const TAU=Math.PI*2, rnd=Math.random, randn=()=>(rnd()+rnd()+rnd()+rnd()-2)*1.2;
    let W,H,DPR,bg;

    /* ---------- sprites ---------- */
    function sprite(n,stops){const c=document.createElement('canvas');c.width=c.height=n;const g=c.getContext('2d');
      const r=g.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2);stops.forEach(s=>r.addColorStop(s[0],s[1]));
      g.fillStyle=r;g.fillRect(0,0,n,n);return c}
    const glow=sprite(64,[[0,'rgba(255,255,255,1)'],[.16,'rgba(205,218,255,.42)'],[1,'rgba(120,140,255,0)']]);
    const core=sprite(256,[[0,'rgba(232,168,214,.5)'],[.12,'rgba(196,110,200,.22)'],[.4,'rgba(130,70,190,.08)'],[1,'rgba(90,60,220,0)']]);
    const haze=sprite(64,[[0,'rgba(230,160,255,.55)'],[1,'rgba(150,90,255,0)']]);
    const spike=(()=>{const n=128,c=document.createElement('canvas');c.width=c.height=n;const g=c.getContext('2d');
      const h=g.createRadialGradient(64,64,0,64,64,64);
      h.addColorStop(0,'rgba(255,255,255,1)');h.addColorStop(.06,'rgba(235,228,255,.8)');h.addColorStop(.2,'rgba(150,140,255,.22)');h.addColorStop(1,'rgba(100,90,255,0)');
      g.fillStyle=h;g.fillRect(0,0,n,n);
      for(let v=0;v<2;v++){const l=v?g.createLinearGradient(64,0,64,n):g.createLinearGradient(0,64,n,64);
        l.addColorStop(0,'rgba(255,255,255,0)');l.addColorStop(.5,'rgba(255,255,255,.9)');l.addColorStop(1,'rgba(255,255,255,0)');
        g.fillStyle=l;if(v)g.fillRect(63.4,0,1.2,n);else g.fillRect(0,63.4,n,1.2)}
      return c})();

    const nz=new Float32Array(65536);for(let i=0;i<65536;i++)nz[i]=rnd();
    function vn(x,y){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
      const x0=xi&255,y0=yi&255,x1=(x0+1)&255,y1=(y0+1)&255;
      const a=nz[y0*256+x0],b=nz[y0*256+x1],c=nz[y1*256+x0],d=nz[y1*256+x1];
      return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
    function fbm(x,y,o){let s=0,a=.5,f=1;for(let i=0;i<o;i++){s+=a*vn(x*f,y*f);f*=2.03;a*=.5}return s}
    const PAL=[[0,20,14,80],[.18,48,30,130],[.4,86,42,150],[.62,112,46,144],[.82,148,84,160],[1,176,128,182]];
    function makeNebula(w,h,seed,wisp,bright){
      const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
      const im=g.createImageData(w,h),d=im.data,asp=w/h;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const u=x/w,v=y/h,X=u*asp*2.2+seed,Y=v*2.2+seed*.7;
        const wx=fbm(X+3.1,Y,4),wy=fbm(X,Y+7.7,4);
        const n=fbm(X*1.6+wx*2.2,Y*1.6+wy*2.2,6);
        const rg=1-Math.abs(2*fbm(X*2.4+wy*1.8,Y*2.4+wx*1.8,4)-1);
        const by=.56-.2*(u-.5)+.06*Math.sin(u*7+seed),dy=(v-by)/.2,band=Math.exp(-dy*dy);
        const bx=(u-.6)/.2,bz=(v-.44)/.16,blob=Math.exp(-(bx*bx+bz*bz));
        const m=Math.max(band*.8,blob*.85)+.18;
        let val=Math.pow(n,1.5)*1.3*m+Math.pow(rg,3)*wisp*band*.5+blob*.08*bright;
        let e=Math.min(u,1-u,v,1-v)*5;e=e>1?1:e;e=e*e*(3-2*e);val*=e;
        let k=0;while(k<4&&val>PAL[k+1][0])k++;
        const A=PAL[k],B=PAL[Math.min(5,k+1)],q=Math.min(1,Math.max(0,(val-A[0])/((B[0]-A[0])||1)));
        const i=(y*w+x)*4;
        d[i]=A[1]+(B[1]-A[1])*q;d[i+1]=A[2]+(B[2]-A[2])*q;d[i+2]=A[3]+(B[3]-A[3])*q;d[i+3]=Math.min(1,val*1.1)*255;
      }
      g.putImageData(im,0,0);return c;
    }
    const neb1=makeNebula(768,432,1.3,1,1),neb2=makeNebula(512,288,7.9,1.6,0);

    /* ---------- galaxy ---------- */
    const GN=9500,NB=8;
    const gr=new Float32Array(GN),gth=new Float32Array(GN),gz=new Float32Array(GN),gsz=new Float32Array(GN);
    const GC=['226,184,216','228,182,224','226,186,240','226,190,255','204,180,255','184,172,255','164,162,255','150,150,255'];
    const GA=[.12,.14,.18,.22,.27,.32,.36,.34];
    const gStart=new Int32Array(NB+1);
    (()=>{
      const tmp=[];
      for(let i=0;i<GN;i++){
        let r,th,z;
        if(rnd()<.14){r=Math.pow(rnd(),2)*.3;th=rnd()*TAU;z=randn()*.1*(1-r)}
        else{r=.05+Math.pow(rnd(),1.35)*.95;th=(rnd()*3|0)*TAU/3+r*5.4+randn()*(.1+.28*r);z=randn()*.03*(1-r*.6)}
        const b=Math.min(NB-1,Math.max(0,Math.floor(r*NB*1.05+randn()*.9)));
        tmp.push({r,th,z,b,s:.6+Math.pow(rnd(),4)*1.6});
      }
      tmp.sort((a,c)=>a.b-c.b);
      tmp.forEach((p,i)=>{gr[i]=p.r;gth[i]=p.th;gz[i]=p.z;gsz[i]=p.s;gStart[p.b+1]++});
      for(let b=0;b<NB;b++)gStart[b+1]+=gStart[b];
    })();

    /* ---------- stars ---------- */
    const SN=3800,MN=110,TN=SN+MN;
    const su=new Float32Array(TN),sv=new Float32Array(TN),sz=new Float32Array(TN),sph=new Float32Array(TN),ssz=new Float32Array(TN);
    const sox=new Float32Array(TN),soy=new Float32Array(TN),svx=new Float32Array(TN),svy=new Float32Array(TN);
    const scol=new Uint8Array(TN),big=new Uint8Array(TN);
    const SC=['rgb(240,244,255)','rgb(170,200,255)','rgb(255,205,225)'];
    let midIdx=0;
    (()=>{
      const zs=[];
      for(let i=0;i<SN;i++)zs.push(Math.pow(rnd(),1.8)*.92+.08);
      zs.sort((a,b)=>a-b);
      for(let i=0;i<MN;i++)zs.push(1+rnd()*.5);
      zs.forEach((z,i)=>{
        sz[i]=z;su[i]=rnd();sv[i]=rnd();sph[i]=rnd()*TAU;
        const c=rnd();scol[i]=c<.6?0:c<.85?1:2;
        big[i]=(z>.5&&z<=1&&rnd()<.02)?1:0;
        ssz[i]=z>1?8+rnd()*14:.5+z*1.2;
        if(z<.4)midIdx=i+1;
      });
    })();

    /* ---------- state ---------- */
    const cam={x:0,y:0,vx:0,vy:0};
    let ptX=0,ptY=0,nx=0,ny=0,mx=-9999,my=-9999,cvx=0,cvy=0,act=false,press=0,pr=0,moved=false;
    let cy,sy,cp,sp,cr,sr,gcx,gcy,GS,LR=300,LR2=9e4,PX,PY,PS,ddt=.016,t=0;
    let shoot=null,nextShoot=3.5;

    on(window,'pointermove',e=>{
      ptX=e.clientX;ptY=e.clientY;nx=ptX/W*2-1;ny=ptY/H*2-1;
      if(!act){mx=ptX;my=ptY}
      act=true;
      moved=true;
    },{passive:true});
    on(window,'pointerdown',()=>{press=1});
    on(window,'pointerup',()=>{press=0});
    on(document.documentElement,'pointerleave',()=>{act=false;nx=ny=0;press=0});

    function size(){
      DPR=Math.min(devicePixelRatio||1,1.75);W=innerWidth;H=innerHeight;
      cv.width=W*DPR|0;cv.height=H*DPR|0;ctx.setTransform(DPR,0,0,DPR,0,0);
      bg=ctx.createRadialGradient(W*.6,H*.44,0,W*.6,H*.44,Math.max(W,H)*.8);
      bg.addColorStop(0,'#100b34');bg.addColorStop(.5,'#070620');bg.addColorStop(1,'#020210');
    }
    on(window,'resize',size);size();

    /* galaxy projection: spin -> 3D rotate (camera) -> roll -> perspective -> cursor lens */
    function proj(r,th,z){
      const a=th+t*.055*amb/(r+.35),c=Math.cos(a)*r,s=Math.sin(a)*r;
      const x1=c*cy+z*sy,z1=-c*sy+z*cy,y1=s*cp-z1*sp,z2=s*sp+z1*cp;
      const rx=x1*cr-y1*sr,ry=x1*sr+y1*cr,sc=1/(1+z2*.5);
      let x=gcx+rx*GS*sc,y=gcy+ry*GS*sc;
      if(act){
        const dx=x-mx,dy=y-my,d2=dx*dx+dy*dy;
        if(d2<LR2){
          const f=1-Math.sqrt(d2)/LR,f2=f*f,p=.22*f2*(1+pr),w=.06*f2;
          x+=-dx*p-dy*w+cvx*f2*.035;
          y+=-dy*p+dx*w+cvy*f2*.035;
        }
      }
      PX=x;PY=y;PS=sc;
    }

    /* stars: spring physics around cursor gravity + swirl + momentum kick */
    function drawStars(a,b){
      const Wp=W+80,Hp=H+80,damp=Math.exp(-ddt*3.2),K=8;
      const G=700*(1+pr*1.8),R=230*(1+pr*.35);
      for(let i=a;i<b;i++){
        const z=sz[i];
        su[i]+=ddt*(.0006+.003*z)*amb;sv[i]+=ddt*(.0002+.0007*z)*amb;
        if(su[i]>1)su[i]-=1;if(sv[i]>1)sv[i]-=1;
        const sh=10+150*z*z;
        const bx=((su[i]*Wp-cam.x*sh)%Wp+Wp)%Wp-40,by=((sv[i]*Hp-cam.y*sh*.7)%Hp+Hp)%Hp-40;
        const ox=sox[i],oy=soy[i];
        let ax=-ox*K,ay=-oy*K;
        if(act){
          const dx=bx+ox-mx,dy=by+oy-my,d2=dx*dx+dy*dy,Rz=R*(.5+.6*Math.min(z,1.2));
          if(d2<Rz*Rz){
            const d=Math.sqrt(d2)+.001,f=1-d/Rz,f2=f*f,soft=Math.min(1,d/70);
            ax+=-dx/d*G*f2*z*soft-dy/d*260*f2*z+cvx*f2*z*.55;
            ay+=-dy/d*G*f2*z*soft+dx/d*260*f2*z+cvy*f2*z*.55;
          }
        }
        svx[i]=(svx[i]+ax*ddt)*damp;svy[i]=(svy[i]+ay*ddt)*damp;
        sox[i]=ox+svx[i]*ddt;soy[i]=soy[i]+svy[i]*ddt;
        const x=bx+sox[i],y=by+soy[i],tw=.65+.35*Math.sin(t*(.5+z*1.5)+sph[i]);
        if(z>1){
          const s=ssz[i];ctx.globalAlpha=.16*tw;ctx.drawImage(glow,x-s/2,y-s/2,s,s);
        }else if(big[i]){
          const s=22+z*36;ctx.globalAlpha=.7*tw;ctx.drawImage(spike,x-s/2,y-s/2,s,s);
        }else{
          ctx.globalAlpha=(.3+.7*z)*tw;ctx.fillStyle=SC[scol[i]];ctx.fillRect(x,y,ssz[i],ssz[i]);
        }
      }
      ctx.globalAlpha=1;
    }

    function drawNebula(img,par,sc,alpha,ph){
      const w=W*sc,h=H*sc;
      ctx.save();ctx.translate(W*.5-cam.x*par+Math.sin(t*.05*amb+ph)*14,H*.5-cam.y*par*.7+Math.cos(t*.04*amb+ph)*9);
      ctx.rotate(Math.sin(t*.03*amb+ph)*.02);ctx.globalAlpha=alpha*(.88+.12*Math.sin(t*.15+ph));
      ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();
    }

    function frame(now){
      ddt=Math.min(.05,(now-frame.last||16)/1000);frame.last=now;t+=ddt;

      // camera spring (slight overshoot = momentum), cursor smoothing + velocity
      const tx=nx*.9+Math.sin(t*.11)*.08*amb,ty=ny*.9+Math.cos(t*.09)*.06*amb;
      cam.vx+=((tx-cam.x)*38-cam.vx*7)*ddt;cam.x+=cam.vx*ddt;
      cam.vy+=((ty-cam.y)*38-cam.vy*7)*ddt;cam.y+=cam.vy*ddt;
      if(act){
        const k=1-Math.exp(-ddt*14),px0=mx,py0=my;
        mx+=(ptX-mx)*k;my+=(ptY-my)*k;
        const a=1-Math.exp(-ddt*8);
        cvx+=((mx-px0)/ddt-cvx)*a;cvy+=((my-py0)/ddt-cvy)*a;
      }else{const a=1-Math.exp(-ddt*4);cvx-=cvx*a;cvy-=cvy*a}
      cvx=Math.max(-2500,Math.min(2500,cvx));cvy=Math.max(-2500,Math.min(2500,cvy));
      pr+=((press?1:0)-pr)*(1-Math.exp(-ddt*6));
      LR=300*(1+pr*.3);LR2=LR*LR;

      const yaw=cam.x*.26,pit=1.1+cam.y*.16,roll=-.42;
      cy=Math.cos(yaw);sy=Math.sin(yaw);cp=Math.cos(pit);sp=Math.sin(pit);cr=Math.cos(roll);sr=Math.sin(roll);
      gcx=W*.6-cam.x*34;gcy=H*.44-cam.y*22;GS=Math.max(W,H)*.38;

      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
      ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);

      ctx.globalCompositeOperation='lighter';
      drawStars(0,midIdx);                               // distant stars
      drawNebula(neb1,20,1.35,.8,0);                      // nebula, back layer
      drawNebula(neb2,44,1.4,.45,2);                      // nebula, mid layer

      proj(0,0,0);const cs=GS*1.05;                      // galaxy core
      ctx.globalAlpha=.3;ctx.drawImage(core,PX-cs/2,PY-cs/2,cs,cs);ctx.globalAlpha=1;
      for(let b=0;b<NB;b++){                             // galaxy stars, batched by colour
        ctx.fillStyle=`rgba(${GC[b]},${GA[b]})`;
        for(let i=gStart[b];i<gStart[b+1];i++){
          proj(gr[i],gth[i],gz[i]);const s=gsz[i]*PS;ctx.fillRect(PX,PY,s,s);
        }
      }

      ctx.globalAlpha=.03;
      for(let i=0;i<GN;i+=5){proj(gr[i],gth[i],gz[i]);const s=GS*.045*PS;ctx.drawImage(haze,PX-s/2,PY-s/2,s,s)}
      ctx.globalAlpha=1;
      drawStars(midIdx,TN);                              // near stars + drifting motes

      // shooting star
      nextShoot-=ddt;
      if(nextShoot<=0&&!reduce){
        const d=rnd()<.5?1:-1,an=.3+rnd()*.5,sp2=800+rnd()*500;
        shoot={x:d>0?rnd()*W*.5:W*(.5+rnd()*.5),y:rnd()*H*.45,vx:Math.cos(an)*sp2*d,vy:Math.sin(an)*sp2,l:0,dur:.9+rnd()*.4};
        nextShoot=6+rnd()*9;
      }
      if(shoot){
        shoot.x+=shoot.vx*ddt;shoot.y+=shoot.vy*ddt;shoot.l+=ddt/shoot.dur;
        if(shoot.l>=1)shoot=null;else{
          const tx2=shoot.x-shoot.vx*.14,ty2=shoot.y-shoot.vy*.14;
          const g=ctx.createLinearGradient(tx2,ty2,shoot.x,shoot.y);
          g.addColorStop(0,'rgba(200,215,255,0)');g.addColorStop(1,'rgba(235,240,255,.9)');
          ctx.globalAlpha=Math.sin(shoot.l*Math.PI);ctx.strokeStyle=g;ctx.lineWidth=1.2;
          ctx.beginPath();ctx.moveTo(tx2,ty2);ctx.lineTo(shoot.x,shoot.y);ctx.stroke();ctx.globalAlpha=1;
        }
      }
      raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      off.forEach((fn) => fn());
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "#020210", ...style }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      <div
        style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 52% 46%, transparent 50%, rgba(1,1,8,.62) 100%)",
        }}
      />
    </div>
  );
}

/* ============================================================================
   SKY BACKGROUND (light theme) — drifting procedural clouds on a blue sky.
   Clouds drift slowly, parallax with the cursor, and gently part around it.
   ============================================================================ */

function SkyBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cv = canvasRef.current, ctx = cv.getContext("2d");
    const off = [], on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };
    const amb = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.25 : 1;
    const rnd = Math.random;
    let W = 0, H = 0, bg, raf = 0, t = 0, last = 0;

    /* value-noise fBm, used once to paint the cloud sprites */
    const nz = new Float32Array(65536); for (let i = 0; i < 65536; i++) nz[i] = rnd();
    const vn = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const x0 = xi & 255, y0 = yi & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
      const a = nz[y0 * 256 + x0], b = nz[y0 * 256 + x1], c = nz[y1 * 256 + x0], d = nz[y1 * 256 + x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y, o) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vn(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };
    const smooth = (a, b, x) => { const q = Math.min(1, Math.max(0, (x - a) / (b - a))); return q * q * (3 - 2 * q); };

    function makeCloud(w, h, seed) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d"), im = g.createImageData(w, h), d = im.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x / w - 0.5) * 2, dy = (y / h - 0.5) * 2.2;
        const m = Math.max(0, 1 - (dx * dx + dy * dy * 1.2));
        const n = fbm((x / w) * 4 + seed, (y / h) * 3 + seed * 1.7, 5);
        const a = smooth(0.26, 0.62, n * 1.15 * Math.pow(m, 0.7));
        const shade = Math.min(1, 0.15 + (y / h) * 0.55 + (1 - n) * 0.35);
        const i = (y * w + x) * 4;
        d[i] = 255 - 38 * shade; d[i + 1] = 255 - 20 * shade; d[i + 2] = 255 - 4 * shade; d[i + 3] = a * 255;
      }
      g.putImageData(im, 0, 0);
      return c;
    }
    const sprites = [1, 2, 3, 4].map((i) => makeCloud(320, 180, i * 7.3));

    /* clouds: z = depth (1 = near / big / fast / strong parallax) */
    const clouds = [{ fx: 0.1, fy: 0.02, z: 1, sw: 0.5, sp: 0 }];
    for (let i = 0; i < 15; i++) {
      const z = 0.25 + rnd() * 0.75;
      clouds.push({ fx: rnd(), fy: rnd() * 0.85, z, sw: 0.12 + 0.28 * z, sp: i });
    }
    clouds.forEach((c, i) => { c.img = sprites[i % 4]; c.ph = rnd() * 6.28; c.ox = c.oy = c.vx = c.vy = 0; });
    clouds.sort((a, b) => a.z - b.z);

    const cam = { x: 0, y: 0, vx: 0, vy: 0 };
    let ptX = 0, ptY = 0, nx = 0, ny = 0, mx = -9999, my = -9999, cvx = 0, cvy = 0, act = false, press = 0, pr = 0;
    on(window, "pointermove", (e) => {
      ptX = e.clientX; ptY = e.clientY; nx = ptX / W * 2 - 1; ny = ptY / H * 2 - 1;
      if (!act) { mx = ptX; my = ptY; }
      act = true;
    }, { passive: true });
    on(window, "pointerdown", () => { press = 1; });
    on(window, "pointerup", () => { press = 0; });
    on(document.documentElement, "pointerleave", () => { act = false; nx = ny = 0; press = 0; });
    const specks = Array.from({ length: 70 }, () => ({ u: rnd(), v: rnd(), z: 0.2 + rnd() * 0.8, ph: rnd() * 6.28, ox: 0, oy: 0, vx: 0, vy: 0 }));
    let sweep = null, nextSweep = 6;

    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 1.75);
      W = innerWidth; H = innerHeight;
      cv.width = (W * dpr) | 0; cv.height = (H * dpr) | 0; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#1678ee"); bg.addColorStop(0.55, "#3aa6ff"); bg.addColorStop(1, "#9fdcff");
    }
    on(window, "resize", size); size();

    function frame(now) {
      const dt = Math.min(0.05, (now - last || 16) / 1000); last = now; t += dt;
      cam.vx += ((nx * 0.9 + Math.sin(t * 0.11) * 0.08 * amb - cam.x) * 30 - cam.vx * 6) * dt; cam.x += cam.vx * dt;
      cam.vy += ((ny * 0.9 + Math.cos(t * 0.09) * 0.06 * amb - cam.y) * 30 - cam.vy * 6) * dt; cam.y += cam.vy * dt;
      if (act) {
        const k = 1 - Math.exp(-dt * 12), px0 = mx, py0 = my, a = 1 - Math.exp(-dt * 8);
        mx += (ptX - mx) * k; my += (ptY - my) * k;
        cvx += ((mx - px0) / dt - cvx) * a; cvy += ((my - py0) / dt - cvy) * a;
      } else { const a = 1 - Math.exp(-dt * 4); cvx -= cvx * a; cvy -= cvy * a; }
      cvx = Math.max(-2000, Math.min(2000, cvx)); cvy = Math.max(-2000, Math.min(2000, cvy));

      pr += ((press ? 1 : 0) - pr) * (1 - Math.exp(-dt * 6));
      ctx.globalAlpha = 1; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const damp = Math.exp(-dt * 2.4);
      for (const c of clouds) {
        const cw = W * c.sw, ch = cw * 0.5625, Wp = W + 2 * cw, z = c.z;
        const bx = ((((c.fx * Wp + t * (5 + 16 * z) * amb) % Wp) + Wp) % Wp) - cw;
        const by = c.fy * H + Math.sin(t * 0.12 * amb + c.ph) * 6;
        const px = bx + c.ox, py = by + c.oy;
        let ax = -c.ox * 2.2, ay = -c.oy * 2.2;
        if (act) {
          const dx = px - mx, dy = py - my, d2 = dx * dx + dy * dy, R = 300 * (0.6 + z * 0.6) * (1 + pr * 0.3);
          if (d2 < R * R) {
            const d = Math.sqrt(d2) + 0.001, f = 1 - d / R, f2 = f * f;
            ax += (dx / d) * 420 * (1 + pr * 1.8) * f2 * z + cvx * f2 * 0.4; ay += (dy / d) * 420 * (1 + pr * 1.8) * f2 * z + cvy * f2 * 0.4;
          }
        }
        c.vx = (c.vx + ax * dt) * damp; c.vy = (c.vy + ay * dt) * damp; c.ox += c.vx * dt; c.oy += c.vy * dt;
        ctx.globalAlpha = 0.5 + 0.45 * z;
        ctx.drawImage(c.img, bx + c.ox - cam.x * (20 + 90 * z) - cw / 2, by + c.oy - cam.y * (10 + 45 * z) - ch / 2, cw, ch);
      }
      nextSweep -= dt;
      if (nextSweep <= 0 && amb === 1) { sweep = { l: 0 }; nextSweep = 14 + rnd() * 10; }
      if (sweep) {                                   // slow sunlight sweep (the sky's "shooting star")
        sweep.l += dt / 4;
        if (sweep.l >= 1) sweep = null;
        else {
          const x0 = -W * 0.3 + W * 1.6 * sweep.l;
          const g = ctx.createLinearGradient(x0 - 140, 0, x0 + 140, 0);
          g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.save(); ctx.transform(1, 0, -0.5, 1, 0, 0);
          ctx.globalAlpha = Math.sin(sweep.l * Math.PI) * 0.14; ctx.fillStyle = g; ctx.fillRect(x0 - 140, 0, 280, H);
          ctx.restore();
        }
      }
      const Wp2 = W + 80, Hp2 = H + 80, dmp = Math.exp(-dt * 3.2);
      ctx.fillStyle = "#fff";                        // drifting specks (the sky's "stars"): same spring physics
      for (const p of specks) {
        const z = p.z;
        p.u = (p.u + dt * (0.002 + 0.004 * z) * amb) % 1; p.v = (p.v + dt * 0.0006 * amb) % 1;
        const sh = 10 + 120 * z * z;
        const bx = ((((p.u * Wp2 - cam.x * sh) % Wp2) + Wp2) % Wp2) - 40, by = ((((p.v * Hp2 - cam.y * sh * 0.7) % Hp2) + Hp2) % Hp2) - 40;
        let ax = -p.ox * 8, ay = -p.oy * 8;
        if (act) {
          const dx = bx + p.ox - mx, dy = by + p.oy - my, d2 = dx * dx + dy * dy, R = 230 * (1 + pr * 0.35);
          if (d2 < R * R) {
            const d = Math.sqrt(d2) + 0.001, f = 1 - d / R, f2 = f * f, soft = Math.min(1, d / 70);
            ax += -(dx / d) * 700 * (1 + pr * 1.8) * f2 * z * soft - (dy / d) * 260 * f2 * z + cvx * f2 * z * 0.55;
            ay += -(dy / d) * 700 * (1 + pr * 1.8) * f2 * z * soft + (dx / d) * 260 * f2 * z + cvy * f2 * z * 0.55;
          }
        }
        p.vx = (p.vx + ax * dt) * dmp; p.vy = (p.vy + ay * dt) * dmp; p.ox += p.vx * dt; p.oy += p.vy * dt;
        ctx.globalAlpha = (0.25 + 0.5 * z) * (0.7 + 0.3 * Math.sin(t * (0.6 + z) + p.ph));
        const sz = 1 + z * 2.2; ctx.fillRect(bx + p.ox, by + p.oy, sz, sz);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); off.forEach((fn) => fn()); };
  }, []);

  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "#3aa6ff" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

/* ============================================================================
   CARD FX — "Magic Bento" effects on every glass box in the app (both themes):
   cursor-following border glow, soft spotlight, hover particles, gentle
   magnetism, click ripple. No dependencies; targets cards by their glass styling
   so new boxes get it automatically. Sidebar/top bar are excluded.
   ============================================================================ */

const FX_SEL =
  '.dashboard-stat-grid > div, .timer-panel, .billing-plan-card, .dashboard-side-panel, .dashboard-syllabus-card, [style*="backdrop-filter"]:not([style*="blur(18px)"]):not([data-nofx])';

function CardFX({ theme }) {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const dark = theme === "dark";
    const rgb = dark ? "132, 0, 255" : "20, 110, 255";
    document.documentElement.style.setProperty("--glow-color", rgb);
    const R = 300, prox = R * 0.5, fade = R * 0.75;

    const sp = document.createElement("div");
    sp.style.cssText =
      "position:fixed;left:0;top:0;width:800px;height:800px;margin:-400px 0 0 -400px;border-radius:50%;pointer-events:none;z-index:1000;opacity:0;transition:opacity .35s ease;will-change:transform;" +
      `background:radial-gradient(circle,rgba(${rgb},${dark ? 0.15 : 0.12}) 0%,rgba(${rgb},${dark ? 0.08 : 0.06}) 15%,rgba(${rgb},0.03) 30%,transparent 70%);` +
      (dark ? "mix-blend-mode:screen;" : "");
    document.body.appendChild(sp);

    let cards = [], pend = false;
    const refresh = () => { cards = Array.from(document.querySelectorAll(FX_SEL)); cards.forEach((c) => c.classList.add("fx-card")); };
    refresh();
    const mo = new MutationObserver(() => { if (!pend) { pend = true; setTimeout(() => { pend = false; refresh(); }, 150); } });
    mo.observe(document.body, { childList: true, subtree: true });

    let mxp = -1, myp = -1, raf = 0, mraf = 0, cur = null, layer = null;
    const mags = new Map();

    function enter(c) {
      if (!c) return;
      c.classList.add("fx-card");
      layer = document.createElement("div"); layer.className = "fx-layer"; c.appendChild(layer);
      for (let i = 0; i < 10; i++) {
        const p = document.createElement("div"); p.className = "fx-particle";
        p.style.left = Math.random() * 100 + "%"; p.style.top = Math.random() * 100 + "%";
        layer.appendChild(p);
        const rx = (Math.random() - 0.5) * 100, ry = (Math.random() - 0.5) * 100;
        p.animate(
          [{ transform: "translate(0,0) scale(0)", opacity: 0 }, { transform: `translate(${rx}px,${ry}px) scale(1)`, opacity: 0.9 }, { transform: `translate(${-rx}px,${-ry}px) scale(.6)`, opacity: 0.3 }],
          { duration: 2500 + Math.random() * 2500, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: i * 100, fill: "both" }
        );
      }
    }
    function leave(c) {
      if (!c) return;
      const l = layer; layer = null;
      if (l) { const a = l.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" }); a.onfinish = () => l.remove(); }
      const m = mags.get(c); if (m) { m.tx = 0; m.ty = 0; kick(); }
    }
    function magTick() {
      mraf = 0;
      let busy = false;
      mags.forEach((m, c) => {
        m.x += (m.tx - m.x) * 0.16; m.y += (m.ty - m.y) * 0.16;
        if (Math.abs(m.tx - m.x) < 0.05 && Math.abs(m.ty - m.y) < 0.05 && !m.tx && !m.ty) { c.style.translate = ""; mags.delete(c); }
        else { c.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`; busy = true; }
      });
      if (busy) mraf = requestAnimationFrame(magTick);
    }
    function kick() { if (!mraf) mraf = requestAnimationFrame(magTick); }

    function tick() {
      raf = 0;
      let min = Infinity;
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        if (r.bottom < -R || r.top > innerHeight + R) continue;
        const dx = Math.max(r.left - mxp, 0, mxp - r.right), dy = Math.max(r.top - myp, 0, myp - r.bottom);
        const d = Math.hypot(dx, dy); min = Math.min(min, d);
        const k = d <= prox ? 1 : d <= fade ? (fade - d) / (fade - prox) : 0;
        c.style.setProperty("--glow-x", ((mxp - r.left) / r.width) * 100 + "%");
        c.style.setProperty("--glow-y", ((myp - r.top) / r.height) * 100 + "%");
        c.style.setProperty("--glow-intensity", k.toString());
        c.style.setProperty("--glow-radius", R + "px");
      }
      sp.style.transform = `translate(${mxp}px,${myp}px)`;
      sp.style.opacity = min <= prox ? 0.8 : min <= fade ? ((fade - min) / (fade - prox)) * 0.8 : 0;
    }
    const onMove = (e) => {
      mxp = e.clientX; myp = e.clientY;
      const c = e.target instanceof Element ? e.target.closest(FX_SEL) : null;
      if (c !== cur) { leave(cur); cur = c; enter(c); }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onOut = () => {
      leave(cur); cur = null; sp.style.opacity = 0;
      cards.forEach((c) => c.style.setProperty("--glow-intensity", "0"));
    };
    const onClick = (e) => {
      const c = e.target instanceof Element ? e.target.closest(FX_SEL) : null;
      if (!c || c !== cur || !layer) return;
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const md = Math.max(Math.hypot(x, y), Math.hypot(x - r.width, y), Math.hypot(x, y - r.height), Math.hypot(x - r.width, y - r.height));
      const rp = document.createElement("div");
      rp.style.cssText = `position:absolute;width:${md * 2}px;height:${md * 2}px;border-radius:50%;left:${x - md}px;top:${y - md}px;pointer-events:none;background:radial-gradient(circle,rgba(${rgb},0.4) 0%,rgba(${rgb},0.2) 30%,transparent 70%);`;
      layer.appendChild(rp);
      rp.animate([{ transform: "scale(0)", opacity: 1 }, { transform: "scale(1)", opacity: 0 }], { duration: 800, easing: "ease-out" }).onfinish = () => rp.remove();
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("click", onClick);
    document.documentElement.addEventListener("mouseleave", onOut);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("click", onClick);
      document.documentElement.removeEventListener("mouseleave", onOut);
      mo.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(mraf);
      mags.forEach((m, c) => { c.style.translate = ""; });
      document.querySelectorAll(".fx-layer").forEach((l) => l.remove());
      sp.remove();
    };
  }, [theme]);
  return null;
}

/* ============================================================================
   AUDIO — procedural ambient environments (Web Audio API).
   Nothing is downloaded or sampled: Sky and Orbit are synthesized live, so there
   is no loop point, no file, and no licensing. AUDIO_ENVIRONMENTS is a registry:
   to add Brown Noise / Rain / Café / Focus sounds later, add one entry with a
   build(ctx, out) function (kind: "focus" keeps it out of the theme-sound UI).
   ============================================================================ */

const rand = (a, b) => a + Math.random() * (b - a);

const AUDIO_ENVIRONMENTS = {
  sky: { id: "sky", label: "Sky", kind: "theme", theme: "light", build: buildSky },
  orbit: { id: "orbit", label: "Orbit", kind: "theme", theme: "dark", build: buildOrbit },
};
const DEFAULT_SOUND = { enabled: false, volume: 0.5, atmosphere: { light: "sky", dark: "orbit" } };

/* Noise buffer whose tail is equal-power crossfaded into its head, so looping it is seamless. */
function makeNoiseBuffer(ctx, seconds, pink) {
  const sr = ctx.sampleRate, N = Math.floor(seconds * sr), F = Math.floor(sr * 1.5), raw = new Float32Array(N + F);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (pink) {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else raw[i] = w * 0.5;
  }
  const buf = ctx.createBuffer(1, N, sr), out = buf.getChannelData(0);
  out.set(raw.subarray(0, N));
  for (let i = 0; i < F; i++) { const k = (i / F) * Math.PI / 2; out[i] = raw[i] * Math.sin(k) + raw[N + i] * Math.cos(k); }
  return buf;
}

function makeImpulse(ctx, seconds, decay) {
  const sr = ctx.sampleRate, len = (sr * seconds) | 0, buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return buf;
}

/* Shared toolkit for building an environment; stop() tears everything down cleanly. */
function audioKit(ctx, out) {
  const nodes = [], timers = [];
  let stopped = false;
  const kit = {
    bus: (gain) => { const g = ctx.createGain(); g.gain.value = gain; g.connect(out); return g; },
    lfo: (param, hz, depth) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = hz; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); nodes.push(o);
    },
    osc: (type, freq, detune, dest) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune; o.connect(dest); o.start(); nodes.push(o);
    },
    noise: (pink, dest) => {
      const n = ctx.createBufferSource(); n.buffer = makeNoiseBuffer(ctx, 9, pink); n.loop = true; n.connect(dest); n.start(); nodes.push(n);
    },
    filter: (type, freq, q, dest) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(dest); return f; },
    gain: (v, dest) => { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; },
    /* soft sine "star": slow bloom, long decay, random stereo position */
    ping: (freq, peak, attack, decay, dest) => {
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      o.connect(g);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = rand(-0.8, 0.8); g.connect(p); p.connect(dest); } else g.connect(dest);
      o.start(t); o.stop(t + attack + decay + 0.2);
    },
    every: (minMs, maxMs, fn, firstMs) => {
      const run = () => { if (stopped) return; fn(); timers.push(setTimeout(run, rand(minMs, maxMs))); };
      timers.push(setTimeout(run, firstMs ?? rand(minMs, maxMs)));
    },
    stop: () => {
      stopped = true; timers.forEach(clearTimeout);
      nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    },
  };
  return kit;
}

/* ORBIT (night): warm suspended-chord pad that never repeats exactly, drifting cosmic
   air, and distant star pings. Deeper and more enclosed than Sky. */
function buildOrbit(ctx, out) {
  const k = audioKit(ctx, out), bus = k.bus(0.9);
  const warm = k.filter("lowpass", 900, 0.3, bus);
  k.lfo(warm.frequency, 0.021, 380);
  // A sus2 voicing (A E B E B) + a soft root; each voice has its own very slow swell
  const voices = [[55, 0.035], [82.41, 0.05], [110, 0.1], [164.81, 0.075], [246.94, 0.05], [329.63, 0.04], [493.88, 0.018]];
  voices.forEach(([f, a]) => {
    const g = k.gain(a, warm); k.lfo(g.gain, 1 / rand(14, 40), a * 0.55);
    [-5, 5].forEach((d) => k.osc(f < 150 ? "triangle" : "sine", f, d + rand(-1.5, 1.5), g));
  });
  // cosmic texture: slowly sweeping band of pink noise + a trace of high "dust"
  const sweep = k.filter("bandpass", 700, 0.9, k.gain(0.065, bus)); k.lfo(sweep.frequency, 0.017, 380);
  k.noise(true, sweep);
  const dust = k.filter("highpass", 5200, 0.5, k.gain(0.006, bus)); k.noise(false, dust);
  const stars = [1318.5, 1568, 1760, 1975.5, 2349.3, 2637];
  k.every(6000, 17000, () => k.ping(stars[(Math.random() * stars.length) | 0] * (Math.random() < 0.3 ? 0.5 : 1), rand(0.01, 0.022), rand(0.35, 0.8), rand(4, 6.5), bus), rand(3000, 7000));
  return { stop: () => { k.stop(); try { bus.disconnect(); } catch { /* noop */ } } };
}

/* SKY (day): airy, high-register open chord, a soft breeze that gusts and settles,
   and the occasional faint sparkle. Brighter and more open than Orbit; no low end. */
function buildSky(ctx, out) {
  const k = audioKit(ctx, out), bus = k.bus(0.85);
  const clear = k.filter("highpass", 150, 0.5, bus);
  const gust = k.gain(1, bus);
  const breeze = k.filter("bandpass", 900, 0.6, k.gain(0.075, gust)); k.lfo(breeze.frequency, 0.031, 450);
  k.noise(true, breeze);
  const air = k.filter("highpass", 3500, 0.4, k.filter("lowpass", 9000, 0.4, k.gain(0.012, gust)));
  k.noise(false, air);
  k.every(9000, 22000, () => gust.gain.setTargetAtTime(rand(0.55, 1.25), ctx.currentTime, 3), 4000);
  // D lydian-flavoured open voicing, kept in the upper register for brightness
  const bright = k.filter("lowpass", 4200, 0.3, clear); k.lfo(bright.frequency, 0.026, 1100);
  [[146.83, 0.03], [220, 0.04], [293.66, 0.06], [440, 0.05], [659.25, 0.03], [739.99, 0.02]].forEach(([f, a]) => {
    const g = k.gain(a, bright); k.lfo(g.gain, 1 / rand(12, 35), a * 0.55);
    [-4, 4].forEach((d) => k.osc("sine", f, d + rand(-1.5, 1.5), g));
  });
  const sparkle = [1174.66, 1318.51, 1479.98, 1760, 1975.53, 2349.32, 2959.96];
  k.every(4500, 13000, () => {
    const f = sparkle[(Math.random() * sparkle.length) | 0];
    k.ping(f, rand(0.006, 0.012), rand(0.01, 0.03), rand(1.4, 2.4), bus);
    if (Math.random() < 0.25) setTimeout(() => k.ping(sparkle[(Math.random() * sparkle.length) | 0], rand(0.004, 0.008), 0.02, rand(1.2, 2), bus), rand(120, 250));
  }, rand(2500, 5000));
  return { stop: () => { k.stop(); try { bus.disconnect(); } catch { /* noop */ } } };
}

/* Engine singleton: one AudioContext, one master volume, crossfades between environments.
   The context is only created after the first user gesture (browser autoplay rules). */
const audioEngine = (() => {
  let ctx = null, master = null, send = null, cur = null;
  let unlocked = false, last = null, suspendT = 0;
  const level = (v) => Math.pow(v, 1.8) * 0.8;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 0.4;
    master.connect(comp); comp.connect(ctx.destination);
    const verb = ctx.createConvolver(); verb.buffer = makeImpulse(ctx, 4.5, 2.4); verb.connect(master);
    send = ctx.createGain(); send.gain.value = 1; send.connect(verb);
    return ctx;
  }
  function fadeOut(env, tau) {
    const t = ctx.currentTime;
    env.gain.gain.cancelScheduledValues(t); env.gain.gain.setValueAtTime(env.gain.gain.value, t); env.gain.gain.setTargetAtTime(0, t, tau);
    setTimeout(() => { env.handle.stop(); try { env.gain.disconnect(); } catch { /* noop */ } }, 4000);
  }
  function start(id) {
    const def = AUDIO_ENVIRONMENTS[id];
    if (!def || (cur && cur.id === id)) return;
    if (cur) fadeOut(cur, 0.55);                       // old environment dissolves (~2s)...
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(master);
    const wet = ctx.createGain(); wet.gain.value = 0.45; gain.connect(wet); wet.connect(send);
    const handle = def.build(ctx, gain);
    const t = ctx.currentTime;
    gain.gain.setTargetAtTime(1, t + 0.15, 0.6);       // ...while the new one blooms in (~2s)
    cur = { id, gain, handle };
  }
  function apply(a) {
    last = a;
    if (!unlocked) return;                             // never start before a user gesture
    if (!a.enabled) {
      if (!ctx) return;
      master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
      clearTimeout(suspendT);
      suspendT = setTimeout(() => { if (cur) { fadeOut(cur, 0.05); cur = null; } if (ctx.state === "running") ctx.suspend(); }, 1800);
      return;
    }
    if (!ensure()) return;
    clearTimeout(suspendT);
    if (ctx.state === "suspended") ctx.resume();
    start(a.envId);
    const t = ctx.currentTime, fresh = master.gain.value < 0.001;
    master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(level(a.volume), t, fresh ? 0.7 : 0.1);
  }
  return {
    unlock() { if (unlocked) return; unlocked = true; if (last) apply(last); },
    sync: apply,
  };
})();

function loadSoundPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.sound) || "null");
    if (!saved) return DEFAULT_SOUND;
    return { ...DEFAULT_SOUND, ...saved, atmosphere: { ...DEFAULT_SOUND.atmosphere, ...(saved.atmosphere || {}) } };
  } catch { return DEFAULT_SOUND; }
}

/* Theme Sound state: persisted per device (volume/on-off are device preferences), follows the theme. */
function useThemeSound(theme) {
  const [prefs, setPrefs] = useState(loadSoundPrefs);
  useEffect(() => {
    const go = () => audioEngine.unlock();
    window.addEventListener("pointerdown", go, { once: true });
    window.addEventListener("keydown", go, { once: true });
    return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
  }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEYS.sound, JSON.stringify(prefs)); } catch { /* storage unavailable */ } }, [prefs]);
  useEffect(() => {
    audioEngine.sync({ enabled: prefs.enabled, volume: prefs.volume, envId: prefs.atmosphere[theme] });
  }, [prefs, theme]);
  return {
    prefs,
    env: AUDIO_ENVIRONMENTS[prefs.atmosphere[theme]],
    setEnabled: (enabled) => { audioEngine.unlock(); setPrefs((p) => ({ ...p, enabled })); },
    setVolume: (volume) => setPrefs((p) => ({ ...p, volume })),
  };
}

/* Sidebar control: Theme Sound toggle + Settings button that opens a small sound panel. */
function SoundControl({ sound, theme, t }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const on = sound.prefs.enabled;
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const rowStyle = (active) => ({
    display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, border: "none",
    fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left", width: "100%",
    color: active ? t.text : t.textMuted,
  });
  const atmos = [
    { key: "light", tag: "Day", Icon: Cloud },
    { key: "dark", tag: "Night", Icon: Moon },
  ].map((a) => ({ ...a, env: AUDIO_ENVIRONMENTS[sound.prefs.atmosphere[a.key]] })).filter((a) => a.env?.kind === "theme");

  return (
    <div ref={boxRef} style={{ marginTop: "auto", position: "relative", paddingTop: 10, borderTop: `1px solid ${t.border}`, display: "flex", flexDirection: "column", gap: 2 }}>
      {open && (
        <div
          className="sound-pop" data-nofx role="dialog" aria-label="Sound settings"
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 244, zIndex: 50, padding: 12, borderRadius: 14,
            background: t.popover, border: `1px solid ${t.border}`, boxShadow: "var(--shadow-hover)",
            backdropFilter: "blur(20px) saturate(1.2)", WebkitBackdropFilter: "blur(20px) saturate(1.2)", color: t.text,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Sound</div>
          <button className="sound-row" onClick={() => sound.setEnabled(!on)} role="switch" aria-checked={on} style={{ ...rowStyle(true), padding: "8px 8px" }}>
            <span style={{ flex: 1 }}>Theme Sound</span>
            <span className={`sound-switch${on ? " is-on" : ""}`}><span className="sound-switch__knob" /></span>
          </button>
          <div style={{ padding: "10px 8px 4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.textMuted, marginBottom: 8 }}>
              <span>Volume</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(sound.prefs.volume * 100)}%</span>
            </div>
            <input
              className="sound-range" type="range" min="0" max="100" step="1" aria-label="Volume"
              value={Math.round(sound.prefs.volume * 100)}
              onChange={(e) => sound.setVolume(Number(e.target.value) / 100)}
              style={{ "--fill": `${Math.round(sound.prefs.volume * 100)}%`, opacity: on ? 1 : 0.5 }}
            />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.textFaint, padding: "10px 8px 6px" }}>Atmosphere</div>
          {atmos.map(({ key, tag, Icon, env }) => {
            const current = key === theme;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 8, background: current ? `${ACCENT}1A` : "transparent", transition: "background 200ms ease" }}>
                <Icon size={15} strokeWidth={2.1} color={current ? ACCENT : t.textMuted} />
                <span style={{ fontSize: 13, fontWeight: current ? 600 : 500, color: current ? t.text : t.textMuted, flex: 1 }}>{env.label}</span>
                <span style={{ fontSize: 11, color: t.textFaint }}>{current && on ? "Playing" : tag}</span>
              </div>
            );
          })}
        </div>
      )}
      <button className="sound-row" onClick={() => sound.setEnabled(!on)} role="switch" aria-checked={on} aria-label="Theme Sound" style={rowStyle(on)}>
        <span key={on ? "on" : "off"} className="sound-ico" style={{ display: "inline-flex" }}>
          {on ? <Volume2 size={15} strokeWidth={2.1} /> : <VolumeX size={15} strokeWidth={2.1} />}
        </span>
        <span style={{ flex: 1 }}>Theme Sound</span>
        <span className={`sound-switch${on ? " is-on" : ""}`}><span className="sound-switch__knob" /></span>
      </button>
      <button className="sound-row" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} style={rowStyle(open)}>
        <Settings size={15} strokeWidth={2.1} />
        <span style={{ flex: 1 }}>Settings</span>
      </button>
    </div>
  );
}

/* ============================================================================
   PROFILE SYSTEM — display name, unique @username, and avatars (Google photo or a
   curated Orbis avatar; no file uploads). Data lives on the existing profile record
   (name, username, avatar), so it persists through the same Supabase/local storage
   as everything else. Usernames are made unique by a small `studentos_usernames`
   table (see usernames.sql); without Supabase a local registry is used.
   ============================================================================ */

const RESERVED_USERNAMES = new Set(["admin", "administrator", "root", "support", "orbis", "studentos", "moderator", "mod", "staff", "help", "system", "owner", "teacher", "null", "undefined", "api", "www"]);
const LOCAL_USERNAMES_KEY = "studentos:usernames";

const normalizeUsername = (v) => String(v || "").trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
function validateUsername(u) {
  if (!u) return "Choose a username";
  if (u.length < 3) return "At least 3 characters";
  if (u.length > 20) return "20 characters at most";
  if (!/^[a-z0-9_]+$/.test(u)) return "Letters, numbers and underscores only";
  if (RESERVED_USERNAMES.has(u)) return "That username is reserved";
  return null;
}

const usernameApi = {
  async identity() {
    if (isSupabaseConfigured) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return { remote: true, id: session.user.id };
    }
    return { remote: false, id: null };
  },
  async check(username, ownerKey) {
    const me = await usernameApi.identity();
    if (me.remote) {
      const { data, error } = await supabase.from("studentos_usernames").select("user_id").eq("username", username).maybeSingle();
      if (error) return { status: "unverified" };           // table not set up yet: don't block the user
      return { status: data && data.user_id !== me.id ? "taken" : "available" };
    }
    try {
      const map = JSON.parse(localStorage.getItem(LOCAL_USERNAMES_KEY) || "{}");
      if (map[username] && map[username] !== ownerKey) return { status: "taken" };
    } catch { /* storage unavailable */ }
    return { status: "available" };
  },
  async claim(username, ownerKey, previous) {
    const me = await usernameApi.identity();
    if (me.remote) {
      const { error } = await supabase.from("studentos_usernames").upsert({ user_id: me.id, username }, { onConflict: "user_id" });
      if (!error) return { ok: true };
      if (error.code === "23505") return { ok: false, error: "taken" };
      if (error.code === "42P01" || error.code === "PGRST205") return { ok: true };   // table missing: save profile anyway
      return { ok: false, error: "failed" };
    }
    try {
      const map = JSON.parse(localStorage.getItem(LOCAL_USERNAMES_KEY) || "{}");
      if (map[username] && map[username] !== ownerKey) return { ok: false, error: "taken" };
      if (previous && map[previous] === ownerKey) delete map[previous];
      map[username] = ownerKey;
      localStorage.setItem(LOCAL_USERNAMES_KEY, JSON.stringify(map));
    } catch { /* storage unavailable */ }
    return { ok: true };
  },
};

/* Google photo from the Supabase session (only when the account signed in with Google). */
function useGoogleAvatar(loggedIn) {
  const [g, setG] = useState({ status: "loading", url: null });
  useEffect(() => {
    let alive = true;
    if (!isSupabaseConfigured || !loggedIn) { setG({ status: "none", url: null }); return undefined; }
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const u = data.session?.user;
      const viaGoogle = u?.app_metadata?.provider === "google" || (u?.identities || []).some((i) => i.provider === "google");
      const url = viaGoogle ? (u.user_metadata?.avatar_url || u.user_metadata?.picture || null) : null;
      setG({ status: url ? "ready" : "none", url });
    }).catch(() => alive && setG({ status: "none", url: null }));
    return () => { alive = false; };
  }, [loggedIn]);
  return g;
}

/* Curated avatars: abstract, calm, space-themed; c = [bg1, bg2, accent, accent2]. */
const ORBIS_AVATARS = [
  { id: "nova", name: "Nova", motif: "planet", c: ["#14123a", "#4b3aa8", "#9fb8ff", "#5b6cff"] },
  { id: "eclipse", name: "Eclipse", motif: "eclipse", c: ["#0b0a1f", "#2a1b5c", "#ffb86b", "#ff5e3a"] },
  { id: "luna", name: "Luna", motif: "crescent", c: ["#10172e", "#26437a", "#f3f0ff", "#b7c4ff"] },
  { id: "orbit", name: "Orbit", motif: "orbits", c: ["#0e1a2c", "#1d4f6e", "#7be0d6", "#3aa6ff"] },
  { id: "vega", name: "Vega", motif: "constellation", c: ["#0d0f24", "#2c2a6b", "#ffffff", "#a7b0ff"] },
  { id: "nebula", name: "Nebula", motif: "nebula", c: ["#1a0f33", "#5a2a7a", "#ff8fd0", "#7a5cff"] },
  { id: "comet", name: "Comet", motif: "comet", c: ["#0b1530", "#1b3f8f", "#bfe3ff", "#4aa3ff"] },
  { id: "aurora", name: "Aurora", motif: "aurora", c: ["#071a1e", "#134a4a", "#7cf5c8", "#4a8cff"] },
  { id: "pulsar", name: "Pulsar", motif: "burst", c: ["#140b2a", "#3a1d6e", "#ffe3a3", "#ff9d5c"] },
  { id: "dawn", name: "Dawn", motif: "horizon", c: ["#2a1646", "#c2578a", "#ffd8a0", "#ff8a5c"] },
  { id: "twin", name: "Twin", motif: "twin", c: ["#101a33", "#2b3f7a", "#a8c0ff", "#ffd1a8"] },
  { id: "prism", name: "Prism", motif: "prism", c: ["#0f1224", "#33306b", "#9ad0ff", "#b48cff"] },
];
const ORBIS_AVATAR_MAP = Object.fromEntries(ORBIS_AVATARS.map((a) => [a.id, a]));

function OrbisAvatarArt({ id }) {
  const def = ORBIS_AVATAR_MAP[id] || ORBIS_AVATARS[0];
  const [c1, c2, ac, ac2] = def.c, g = `ov-${def.id}`, orb = `url(#${g}-o)`;
  let motif;
  switch (def.motif) {
    case "planet": motif = (<><ellipse cx="32" cy="33" rx="23" ry="6.5" transform="rotate(-22 32 33)" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" /><circle cx="32" cy="33" r="13" fill={orb} /><circle cx="49" cy="19" r="2.6" fill="#fff" fillOpacity=".85" /></>); break;
    case "eclipse": motif = (<><circle cx="32" cy="32" r="21" fill="none" stroke={ac} strokeOpacity=".22" strokeWidth="1.2" /><circle cx="32" cy="32" r="15" fill="#07061a" stroke={orb} strokeWidth="2.4" /></>); break;
    case "crescent": motif = (<><mask id={`${g}-m`}><rect width="64" height="64" fill="#fff" /><circle cx="38.5" cy="28" r="12.5" fill="#000" /></mask><circle cx="31" cy="33" r="15" fill={orb} mask={`url(#${g}-m)`} /></>); break;
    case "orbits": motif = (<><g fill="none" stroke={ac} strokeOpacity=".55" strokeWidth="1.1"><ellipse cx="32" cy="32" rx="22" ry="8" transform="rotate(30 32 32)" /><ellipse cx="32" cy="32" rx="22" ry="8" transform="rotate(-30 32 32)" /><ellipse cx="32" cy="32" rx="22" ry="8" /></g><circle cx="32" cy="32" r="5" fill={orb} /><circle cx="52" cy="32" r="2.2" fill="#fff" /><circle cx="21" cy="13" r="2" fill={ac2} /></>); break;
    case "constellation": motif = (<><polyline points="12,44 24,26 36,36 46,18 54,30" fill="none" stroke={ac} strokeOpacity=".5" strokeWidth="1" /><g fill="#fff">{[[12, 44, 2], [24, 26, 2.6], [36, 36, 1.8], [46, 18, 3], [54, 30, 2]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}</g></>); break;
    case "nebula": motif = (<><filter id={`${g}-f`}><feGaussianBlur stdDeviation="5" /></filter><g filter={`url(#${g}-f)`}><circle cx="26" cy="32" r="14" fill={ac} fillOpacity=".75" /><circle cx="40" cy="26" r="12" fill={ac2} fillOpacity=".7" /><circle cx="36" cy="42" r="10" fill="#fff" fillOpacity=".35" /></g></>); break;
    case "comet": motif = (<><path d="M10 54 L44 22" stroke={`url(#${g}-t)`} strokeWidth="5" strokeLinecap="round" /><circle cx="46" cy="20" r="6.5" fill={orb} /></>); break;
    case "aurora": motif = (<><path d="M-2 40 C14 24 28 50 44 34 S60 30 66 34" fill="none" stroke={ac} strokeWidth="4" strokeLinecap="round" strokeOpacity=".85" /><path d="M-2 31 C14 16 28 42 44 26 S60 22 66 26" fill="none" stroke={ac2} strokeWidth="3" strokeLinecap="round" strokeOpacity=".6" /></>); break;
    case "burst": motif = (<path d="M32 9 L36.5 27.5 L55 32 L36.5 36.5 L32 55 L27.5 36.5 L9 32 L27.5 27.5 Z" fill={orb} />); break;
    case "horizon": motif = (<><circle cx="32" cy="40" r="14" fill={orb} /><rect y="40" width="64" height="24" fill="#150d2e" fillOpacity=".92" /><path d="M12 46H52M18 51H46M24 56H40" stroke="#fff" strokeOpacity=".3" /></>); break;
    case "twin": motif = (<><circle cx="26" cy="37" r="12.5" fill={orb} /><circle cx="46" cy="22" r="6" fill={ac2} /><circle cx="46" cy="22" r="9.5" fill="none" stroke={ac2} strokeOpacity=".35" /></>); break;
    default: motif = (<><polygon points="32,11 51,28 32,53 13,28" fill={orb} /><polygon points="32,11 51,28 32,34 13,28" fill="#fff" fillOpacity=".28" /><polygon points="32,34 51,28 32,53" fill="#000" fillOpacity=".2" /></>);
  }
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`${g}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
        <radialGradient id={`${g}-o`} cx=".35" cy=".3" r=".9"><stop offset="0" stopColor={ac} /><stop offset="1" stopColor={ac2} /></radialGradient>
        <linearGradient id={`${g}-t`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor={ac} stopOpacity="0" /><stop offset="1" stopColor="#fff" /></linearGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${g}-bg)`} />
      <g fill="#fff" fillOpacity=".6"><circle cx="11" cy="13" r=".8" /><circle cx="53" cy="9" r=".7" /><circle cx="57" cy="50" r=".9" /><circle cx="9" cy="54" r=".7" /></g>
      {motif}
    </svg>
  );
}

/* Reusable avatar: Google photo, Orbis avatar, or initials fallback. Use everywhere identity is shown. */
function Avatar({ avatar, name, size = 36, style }) {
  const [broken, setBroken] = useState(false);
  const a = avatar || DEFAULT_PROFILE.avatar;
  useEffect(() => { setBroken(false); }, [a.googleUrl]);
  let inner;
  if (a.type === "google" && a.googleUrl && !broken) {
    inner = <img src={a.googleUrl} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
  } else if (a.type === "orbis" && ORBIS_AVATAR_MAP[a.id]) {
    inner = <OrbisAvatarArt id={a.id} />;
  } else {
    inner = <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#14123a,#4b3aa8)", color: "#fff", fontWeight: 600, fontSize: size * 0.42 }}>{(name || "?").trim().charAt(0).toUpperCase()}</span>;
  }
  return (
    <span className="avatar" style={{ width: size, height: size, ...style }}>{inner}</span>
  );
}

/* Sidebar entry: avatar + name + @username. */
function ProfileButton({ profile, active, onClick, t }) {
  return (
    <button className={`profile-btn${active ? " is-active" : ""}`} onClick={onClick} aria-label="Open your profile" aria-current={active ? "page" : undefined}>
      <Avatar avatar={profile.avatar} name={profile.name} size={30} />
      <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", textAlign: "left", lineHeight: 1.25 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.name}</span>
        <span style={{ fontSize: 11, color: t.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.username ? `@${profile.username}` : "Set username"}</span>
      </span>
      <ChevronRight className="profile-btn__chev" size={14} color={t.textMuted} />
    </button>
  );
}

function ProfileView({ profile, auth, google, planName, onSave, t }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [picking, setPicking] = useState(false);
  const [source, setSource] = useState("orbis");
  const [ustate, setUstate] = useState({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const ownerKey = auth.email || "guest";
  const hasGoogle = google.status === "ready";
  const view = editing && draft ? draft : { name: profile.name, username: profile.username || "", avatar: profile.avatar || DEFAULT_PROFILE.avatar };

  const startEdit = () => {
    setDraft({ name: profile.name, username: profile.username || "", avatar: profile.avatar || DEFAULT_PROFILE.avatar });
    setSource(profile.avatar?.type === "google" ? "google" : "orbis");
    setPicking(false); setError(""); setSavedFlash(false); setEditing(true);
  };

  useEffect(() => {
    if (!editing || !draft) return undefined;
    const u = draft.username, err = validateUsername(u);
    if (err) { setUstate({ status: u ? "invalid" : "idle", msg: err }); return undefined; }
    if (u === (profile.username || "")) { setUstate({ status: "same" }); return undefined; }
    setUstate({ status: "checking" });
    let alive = true;
    const id = setTimeout(async () => { const r = await usernameApi.check(u, ownerKey); if (alive) setUstate({ status: r.status }); }, 450);
    return () => { alive = false; clearTimeout(id); };
  }, [draft?.username, editing, profile.username, ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = editing && draft && (draft.name.trim() !== profile.name || draft.username !== (profile.username || "") || JSON.stringify(draft.avatar) !== JSON.stringify(profile.avatar));
  const canSave = Boolean(changed && draft.name.trim() && ["available", "same", "unverified"].includes(ustate.status) && !saving);

  const save = async () => {
    setSaving(true); setError("");
    const res = await onSave({ name: draft.name, username: draft.username, avatar: draft.avatar });
    setSaving(false);
    if (!res.ok) {
      if (res.error === "taken") { setUstate({ status: "taken" }); setError("That username was just taken. Try another."); }
      else setError("Couldn't save your changes. Please try again.");
      return;
    }
    setEditing(false); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2400);
  };

  const gridKey = (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!keys[e.key]) return;
    const items = Array.from(e.currentTarget.querySelectorAll('[role="radio"]'));
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault(); items[(i + keys[e.key] + items.length) % items.length].focus();
  };

  const def = view.avatar?.type === "orbis" ? ORBIS_AVATAR_MAP[view.avatar.id] : null;
  const b = def ? def.c : ["#14123a", "#3b2a8f", "#9fb8ff", "#5b6cff"];
  const card = { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 18, ...GLASS };
  const label = { display: "block", fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 6 };
  const input = { width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, color: t.text, background: t.bg, border: `1px solid ${t.border}`, outline: "none" };
  const st = ustate.status;
  const msg = { idle: "3–20 characters · letters, numbers, underscores", invalid: ustate.msg, checking: "Checking availability…", available: `@${draft?.username} is available`, taken: `@${draft?.username} is already taken`, same: "This is your current username", unverified: `@${draft?.username} looks good` }[st];
  const msgColor = st === "available" ? "#22a559" : st === "taken" ? "#e5484d" : t.textFaint;
  const indicator = st === "checking" ? <span className="spinner" /> : st === "available" || st === "same" || st === "unverified" ? <Check size={16} strokeWidth={2.6} color="#22a559" /> : st === "taken" ? <X size={16} strokeWidth={2.6} color="#e5484d" /> : null;

  return (
    <div className="profile-page" style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ height: 104, position: "relative", background: `linear-gradient(135deg, ${b[0]}, ${b[1]})`, transition: "background 500ms ease" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,.7), transparent), radial-gradient(1px 1px at 70% 20%, rgba(255,255,255,.6), transparent), radial-gradient(1.5px 1.5px at 85% 60%, rgba(255,255,255,.5), transparent), radial-gradient(1px 1px at 45% 75%, rgba(255,255,255,.5), transparent)" }} />
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 130% at 82% 0%, ${b[2]}38, transparent)` }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 18, padding: "0 24px 22px", flexWrap: "wrap" }}>
          <div key={`${view.avatar?.type}-${view.avatar?.id || view.avatar?.googleUrl}`} className="avatar-swap" style={{ marginTop: -48, borderRadius: "50%", boxShadow: `0 0 0 4px ${t.popover}`, lineHeight: 0 }}>
            <Avatar avatar={view.avatar} name={view.name} size={96} />
          </div>
          <div style={{ flex: 1, minWidth: 180, paddingTop: 14 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: t.text, lineHeight: 1.2, wordBreak: "break-word" }}>{view.name.trim() || "Your name"}</h1>
            <div style={{ marginTop: 4, fontSize: 14, color: t.textMuted, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {view.username ? <span>@{view.username}</span> : (
                <button className="pf-chip" onClick={startEdit} style={{ color: t.textMuted }}>Choose a username</button>
              )}
              {savedFlash && <span className="pf-saved"><Check size={12} strokeWidth={3} /> Saved</span>}
            </div>
          </div>
          {!editing && (
            <button className="pf-btn pf-btn--ghost" onClick={startEdit} style={{ color: t.text, borderColor: t.border }}>
              <Pencil size={14} /> Edit profile
            </button>
          )}
        </div>
      </section>

      {editing && draft ? (
        <section style={{ ...card, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label htmlFor="pf-name" style={label}>Name</label>
            <input id="pf-name" value={draft.name} maxLength={40} autoComplete="name" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} style={input} placeholder="Your name" />
          </div>

          <div>
            <label htmlFor="pf-username" style={label}>Username</label>
            <div style={{ position: "relative" }}>
              <span aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.textFaint, fontSize: 14 }}>@</span>
              <input
                id="pf-username" value={draft.username} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
                aria-describedby="pf-username-msg" aria-invalid={st === "taken"} placeholder="username"
                onChange={(e) => setDraft((d) => ({ ...d, username: normalizeUsername(e.target.value).slice(0, 24) }))}
                style={{ ...input, paddingLeft: 28, paddingRight: 38, borderColor: st === "taken" ? "#e5484d" : t.border }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }}>{indicator}</span>
            </div>
            <div id="pf-username-msg" aria-live="polite" style={{ minHeight: 18, marginTop: 6, fontSize: 12, color: msgColor, transition: "color 200ms ease" }}>{msg}</div>
          </div>

          <div>
            <span style={label}>Profile picture</span>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Avatar avatar={draft.avatar} name={draft.name} size={56} />
              <button className="pf-btn pf-btn--ghost" aria-expanded={picking} onClick={() => setPicking((p) => !p)} style={{ color: t.text, borderColor: t.border }}>
                Change profile picture
              </button>
            </div>
            {picking && (
              <div className="pf-reveal" style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div role="radiogroup" aria-label="Profile picture source" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <button
                    role="radio" aria-checked={source === "google"} disabled={google.status === "none"}
                    className={`pf-source${source === "google" ? " is-selected" : ""}`}
                    onClick={() => { if (!hasGoogle) return; setSource("google"); setDraft((d) => ({ ...d, avatar: { type: "google", googleUrl: google.url } })); }}
                  >
                    {google.status === "loading" ? <span className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                      : hasGoogle ? <Avatar avatar={{ type: "google", googleUrl: google.url }} name={draft.name} size={36} />
                        : <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(128,128,150,.2)", color: "#4285F4", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>G</span>}
                    <span style={{ textAlign: "left" }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: t.text }}>Use Google profile picture</span>
                      <span style={{ display: "block", fontSize: 11, color: t.textFaint }}>{google.status === "none" ? "Available when you sign in with Google" : "From your Google account"}</span>
                    </span>
                  </button>
                  <button role="radio" aria-checked={source === "orbis"} className={`pf-source${source === "orbis" ? " is-selected" : ""}`} onClick={() => setSource("orbis")}>
                    <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(128,128,150,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted }}><Sparkles size={16} /></span>
                    <span style={{ textAlign: "left" }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: t.text }}>Choose an Orbis avatar</span>
                      <span style={{ display: "block", fontSize: 11, color: t.textFaint }}>{ORBIS_AVATARS.length} curated avatars</span>
                    </span>
                  </button>
                </div>
                {source === "orbis" && (
                  <div role="radiogroup" aria-label="Orbis avatars" onKeyDown={gridKey} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 10 }}>
                    {ORBIS_AVATARS.map((a) => {
                      const sel = draft.avatar.type === "orbis" && draft.avatar.id === a.id;
                      return (
                        <button key={a.id} role="radio" aria-checked={sel} aria-label={a.name} title={a.name} className={`avatar-tile${sel ? " is-selected" : ""}`}
                          onClick={() => setDraft((d) => ({ ...d, avatar: { type: "orbis", id: a.id } }))}>
                          <Avatar avatar={{ type: "orbis", id: a.id }} name={a.name} size={52} />
                          {sel && <span className="avatar-tile__check"><Check size={11} strokeWidth={3} /></span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div role="alert" style={{ fontSize: 13, color: "#e5484d", background: "rgba(229,72,77,.10)", border: "1px solid rgba(229,72,77,.28)", borderRadius: 10, padding: "9px 12px" }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="pf-btn pf-btn--ghost" onClick={() => setEditing(false)} disabled={saving} style={{ color: t.text, borderColor: t.border }}>Cancel</button>
            <button className="pf-btn pf-btn--primary" onClick={save} disabled={!canSave}>
              {saving ? <><span className="spinner spinner--light" /> Saving…</> : "Save changes"}
            </button>
          </div>
        </section>
      ) : (
        <section style={{ ...card, padding: "8px 24px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.textFaint, padding: "14px 0 6px" }}>Account</div>
          {[
            ["Email", auth.email || "Guest (local demo)"],
            ["Sign-in", hasGoogle ? "Google" : isSupabaseConfigured && auth.email ? "Email & password" : "Local demo"],
            ["Plan", planName],
            ["Daily goal", `${profile.dailyGoalMinutes} min`],
          ].map(([k, v], i, arr) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "13px 0", fontSize: 14, borderBottom: i < arr.length - 1 ? `1px solid ${t.border}` : "none" }}>
              <span style={{ color: t.textMuted }}>{k}</span>
              <span style={{ color: t.text, fontWeight: 500, textAlign: "right", wordBreak: "break-all" }}>{v}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/* ============================================================================
   BUTTON FX — a cursor-following sheen (drawn in CSS) and a springy press-and-release
   on click. Nothing moves or tilts when the cursor merely approaches or hovers.
   ============================================================================ */

function ButtonFX() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;
    // Cursor-following sheen position (CSS draws it). Buttons themselves never move toward the cursor.
    const onMove = (e) => {
      const b = e.target instanceof Element ? e.target.closest("button") : null;
      if (!b || b.disabled) return;
      const r = b.getBoundingClientRect();
      b.style.setProperty("--bx", e.clientX - r.left + "px");
      b.style.setProperty("--by", e.clientY - r.top + "px");
    };
    // Springy press-and-release on click only.
    const onClick = (e) => {
      const b = e.target instanceof Element ? e.target.closest("button") : null;
      if (!b || b.disabled) return;
      const low = b.getBoundingClientRect().width > 240 ? 0.985 : 0.93;
      b.animate([{ scale: "1" }, { scale: String(low), offset: 0.25 }, { scale: "1.05", offset: 0.6 }, { scale: "1" }], { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}

/* ============================================================================
   TILT FX — 3D tilt toward the cursor on the Plans & Billing cards only.
   JS just sets --tilt-x/--tilt-y; App.css applies the perspective transform.
   ============================================================================ */

function TiltFX() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;
    const MAX = 8;                                   // degrees
    let cur = null, raf = 0, ev = null;
    const reset = (c) => { if (c) { c.style.setProperty("--tilt-x", "0deg"); c.style.setProperty("--tilt-y", "0deg"); } };
    const apply = () => {
      raf = 0;
      const card = ev.target instanceof Element ? ev.target.closest(".billing-plan-card") : null;
      if (card !== cur) { reset(cur); cur = card; }
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width - 0.5, py = (ev.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--tilt-y", (px * MAX * 2).toFixed(2) + "deg");
      card.style.setProperty("--tilt-x", (-py * MAX * 2).toFixed(2) + "deg");
    };
    const onMove = (e) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); };
    const onOut = () => { reset(cur); cur = null; };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onOut);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onOut);
      cancelAnimationFrame(raf); reset(cur);
    };
  }, []);
  return null;
}

/* ============================================================================
   LEADERBOARD — School / Class / Friends, ranked by the existing XP (profile.xp).
   Cross-student data lives in a small public-profile table (see leaderboard.sql)
   guarded by RLS, so a student only ever sees their own school, class and friends.
   Email and other private fields are never stored there or returned.
   ============================================================================ */

const LB_SCOPES = [["school", "School"], ["class", "Class"], ["friends", "Friends"]];
const LB_COLS = "user_id,username,name,avatar,xp,streak_current,streak_best,class_id";
/* Deterministic order: XP, then best streak, then username, then id (so ties never reshuffle). */
const lbCompare = (a, b) =>
  (b.xp - a.xp) || ((b.streak_best || 0) - (a.streak_best || 0)) ||
  String(a.username).localeCompare(String(b.username)) || String(a.user_id).localeCompare(String(b.user_id));
const fmtNum = (n) => Number(n || 0).toLocaleString();

const leaderboardApi = {
  async uid() {
    if (!isSupabaseConfigured) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  },
  async sync(p) {
    const { error } = await supabase.rpc("sl_sync", { p_username: p.username, p_name: p.name, p_avatar: p.avatar, p_xp: p.xp, p_streak: p.streak, p_best: p.best });
    return !error;
  },
  async me(uid) {
    const { data, error } = await supabase.from("studentos_leaderboard").select(`${LB_COLS},school_id`).eq("user_id", uid).maybeSingle();
    return error ? null : data;
  },
  async scopeRows(scope, me) {
    let q = supabase.from("studentos_leaderboard").select(LB_COLS).limit(500);
    if (scope === "school") q = q.eq("school_id", me.school_id);
    else if (scope === "class") q = q.eq("class_id", me.class_id);
    else {
      const { data: fr } = await supabase.from("studentos_friends").select("requester_id,addressee_id").eq("status", "accepted");
      const ids = (fr || []).map((f) => (f.requester_id === me.user_id ? f.addressee_id : f.requester_id));
      if (!ids.length) return [];
      q = q.in("user_id", ids);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async classMap() {
    const { data } = await supabase.from("studentos_classes").select("id,name");
    return Object.fromEntries((data || []).map((c) => [c.id, c.name]));
  },
  async incoming() { const { data } = await supabase.rpc("sl_pending_requests"); return data || []; },
  async searchIds(q) { const { data } = await supabase.rpc("sl_search_ids", { p_q: q }); return Array.isArray(data) ? data : []; },
  async addFriend(uid, username) {
    const { data, error } = await supabase.rpc("sl_find_user", { p_username: username });
    if (error) return { ok: false, error: "Couldn't search right now." };
    const found = (data || [])[0];
    if (!found) return { ok: false, error: "No student with that username." };
    const res = await supabase.from("studentos_friends").insert({ requester_id: uid, addressee_id: found.user_id });
    if (res.error) return { ok: false, error: res.error.code === "23505" ? "Request already sent." : "Couldn't send the request." };
    return { ok: true, name: found.name };
  },
  async respond(uid, requesterId, accept) {
    const q = accept
      ? supabase.from("studentos_friends").update({ status: "accepted" }).eq("requester_id", requesterId).eq("addressee_id", uid)
      : supabase.from("studentos_friends").delete().eq("requester_id", requesterId).eq("addressee_id", uid);
    const { error } = await q;
    return !error;
  },
  async join(kind, code, studentId) {
    const { error } = kind === "school"
      ? await supabase.rpc("sl_join_school", { p_code: code.trim(), p_student_id: studentId.trim() || null })
      : await supabase.rpc("sl_join_class", { p_code: code.trim() });
    return error ? { ok: false, error: `That code didn't match a ${kind}.` } : { ok: true };
  },
};

function useLeaderboard({ open, scope, snap, version }) {
  const [s, setS] = useState({ status: "loading" });
  const snapKey = JSON.stringify(snap);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    (async () => {
      setS((p) => ({ ...p, status: "loading" }));
      try {
        if (!isSupabaseConfigured) { setS({ status: "offline" }); return; }
        if (!snap.username) { setS({ status: "needsUsername" }); return; }
        const uid = await leaderboardApi.uid();
        if (!uid) { setS({ status: "offline" }); return; }
        await leaderboardApi.sync(snap);
        const me = await leaderboardApi.me(uid);
        if (!me) { if (alive) setS({ status: "error" }); return; }
        const [classMap, incoming] = await Promise.all([leaderboardApi.classMap(), leaderboardApi.incoming()]);
        let gate = null, rows = [];
        if (scope === "school" && !me.school_id) gate = "school";
        else if (scope === "class" && !me.class_id) gate = me.school_id ? "class" : "school";
        else rows = await leaderboardApi.scopeRows(scope, me);
        if (!alive) return;
        const mine = { ...me, name: snap.name, avatar: snap.avatar, xp: snap.xp, streak_current: snap.streak, streak_best: snap.best };
        if (!gate) rows = [...rows.filter((r) => r.user_id !== uid), mine];
        const ranked = rows.sort(lbCompare).map((r, i) => ({ ...r, rank: i + 1 }));
        setS({ status: "ready", uid, me: mine, gate, rows: ranked, classMap, incoming });
      } catch { if (alive) setS({ status: "error" }); }
    })();
    return () => { alive = false; };
  }, [open, scope, snapKey, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

function LbRow({ row, isMe, cls, t, refCb }) {
  return (
    <div ref={isMe ? refCb : undefined} className={`lb-row${isMe ? " is-me" : ""}`}>
      <span className="lb-rank" style={{ color: t.textMuted }}>{row.rank}</span>
      <Avatar avatar={row.avatar} name={row.name} size={38} />
      <span className="lb-id">
        <span className="lb-name" style={{ color: t.text }}>{row.name}{isMe && <span className="lb-you">You</span>}</span>
        <span className="lb-sub" style={{ color: t.textFaint }}>@{row.username}{cls ? ` · ${cls}` : ""}</span>
      </span>
      <span className="lb-stats">
        <span className="lb-xp" style={{ color: t.text }}>{fmtNum(row.xp)}<small style={{ color: t.textFaint }}> XP</small></span>
        <span className="lb-streak" style={{ color: row.streak_current > 0 ? STREAK_ACCENT : t.textFaint }}><Flame size={12} /> {row.streak_current}</span>
      </span>
    </div>
  );
}

function LbTop3({ rows, meId, t, refCb }) {
  return (
    <div className="lb-top3">
      {[rows[1], rows[0], rows[2]].map((r) => (
        <div key={r.user_id} ref={r.user_id === meId ? refCb : undefined} className={`lb-pod lb-pod--${r.rank}${r.user_id === meId ? " is-me" : ""}`}>
          <span className="lb-pod__rank" style={{ color: t.textMuted }}>{r.rank}</span>
          <Avatar avatar={r.avatar} name={r.name} size={r.rank === 1 ? 60 : 48} />
          <span className="lb-pod__name" style={{ color: t.text }}>{r.name}</span>
          <span className="lb-pod__xp" style={{ color: t.text }}>{fmtNum(r.xp)}<small style={{ color: t.textFaint }}> XP</small></span>
          <span className="lb-streak" style={{ color: r.streak_current > 0 ? STREAK_ACCENT : t.textFaint }}><Flame size={12} /> {r.streak_current}</span>
        </div>
      ))}
    </div>
  );
}

function LbEmpty({ icon: Icon, title, body, t, children }) {
  return (
    <div className="lb-empty">
      <span className="lb-empty__icon" style={{ color: t.textMuted }}><Icon size={22} /></span>
      <div style={{ fontSize: 15, fontWeight: 600, color: t.text }}>{title}</div>
      {body && <div style={{ fontSize: 13, color: t.textMuted, maxWidth: 300, lineHeight: 1.5 }}>{body}</div>}
      {children}
    </div>
  );
}

/* One-line input + button used for join codes and add-friend. */
function LbInlineForm({ placeholder, extra, button, onSubmit, t }) {
  const [v, setV] = useState(""), [v2, setV2] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!v.trim() || busy) return;
    setBusy(true); setMsg(null);
    const r = await onSubmit(v, v2);
    setBusy(false);
    if (r.ok) { setV(""); setV2(""); if (r.message) setMsg({ ok: true, text: r.message }); } else setMsg({ ok: false, text: r.error });
  };
  const field = { flex: 1, minWidth: 0, boxSizing: "border-box", padding: "9px 12px", fontSize: 13, color: t.text, background: t.bg, border: `1px solid ${t.border}`, outline: "none" };
  return (
    <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoCapitalize="none" autoCorrect="off" spellCheck={false} style={field} />
        <button type="submit" className="pf-btn pf-btn--primary" disabled={!v.trim() || busy}>{busy ? <span className="spinner spinner--light" /> : button}</button>
      </div>
      {extra && <input value={v2} onChange={(e) => setV2(e.target.value)} placeholder={extra} aria-label={extra} style={field} />}
      <div aria-live="polite" style={{ minHeight: 16, fontSize: 12, color: msg ? (msg.ok ? "#22a559" : "#e5484d") : "transparent" }}>{msg?.text || "."}</div>
    </form>
  );
}

function LeaderboardPanel({ open, onClose, profile, streak, onOpenProfile, t }) {
  const [scope, setScope] = useState("school");
  const [q, setQ] = useState("");
  const [version, setVersion] = useState(0);
  const [idHits, setIdHits] = useState(() => new Set());
  const [myEl, setMyEl] = useState(null);
  const [myVisible, setMyVisible] = useState(false);
  const scrollRef = useRef(null), panelRef = useRef(null);
  const snap = useMemo(
    () => ({ username: profile.username || "", name: profile.name, avatar: profile.avatar, xp: profile.xp, streak: streak.current, best: streak.longest }),
    [profile.username, profile.name, profile.avatar, profile.xp, streak.current, streak.longest]
  );
  const data = useLeaderboard({ open, scope, snap, version });
  const ready = data.status === "ready";
  const rows = ready ? data.rows : [];
  const needle = q.trim().toLowerCase().replace(/^@/, "");

  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", key);
  }, [open, onClose]);

  useEffect(() => {
    if (!ready || scope !== "school" || needle.length < 3) { setIdHits(new Set()); return undefined; }
    let alive = true;
    const id = setTimeout(async () => { const ids = await leaderboardApi.searchIds(needle); if (alive) setIdHits(new Set(ids)); }, 250);
    return () => { alive = false; clearTimeout(id); };
  }, [needle, scope, ready]);

  useEffect(() => {
    if (!myEl || !scrollRef.current) { setMyVisible(false); return undefined; }
    const io = new IntersectionObserver(([en]) => setMyVisible(en.isIntersecting), { root: scrollRef.current, threshold: 0.6 });
    io.observe(myEl);
    return () => io.disconnect();
  }, [myEl]);

  if (!open) return null;
  const results = needle ? rows.filter((r) => r.name.toLowerCase().includes(needle) || r.username.toLowerCase().includes(needle) || idHits.has(r.user_id)) : null;
  const showPodium = !needle && rows.length >= 3;
  const listRows = needle ? results : showPodium ? rows.slice(3) : rows;
  const mine = ready ? rows.find((r) => r.user_id === data.uid) : null;
  const idx = LB_SCOPES.findIndex(([k]) => k === scope);
  const clsName = (r) => (ready && r.class_id ? data.classMap[r.class_id] : "");
  const refresh = () => setVersion((v) => v + 1);

  let body;
  if (data.status === "loading") {
    body = <div style={{ padding: "8px 4px" }}>{Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="lb-row"><span className="skeleton" style={{ width: 18, height: 14, borderRadius: 6 }} /><span className="skeleton" style={{ width: 38, height: 38, borderRadius: "50%" }} /><span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}><span className="skeleton" style={{ width: "45%", height: 12, borderRadius: 6 }} /><span className="skeleton" style={{ width: "28%", height: 10, borderRadius: 6 }} /></span><span className="skeleton" style={{ width: 52, height: 24, borderRadius: 6 }} /></div>
    ))}</div>;
  } else if (data.status === "offline") {
    body = <LbEmpty icon={Trophy} t={t} title="Leaderboards need an account" body="Sign in with your Orbis account to see how you rank against your school, class and friends." />;
  } else if (data.status === "needsUsername") {
    body = <LbEmpty icon={Users} t={t} title="Choose a username first" body="Your @username is how classmates find you on the leaderboard."><button className="pf-btn pf-btn--primary" onClick={onOpenProfile}>Set up profile</button></LbEmpty>;
  } else if (data.status === "error") {
    body = <LbEmpty icon={AlertCircle} t={t} title="Couldn't load the leaderboard" body="Check your connection and try again."><button className="pf-btn pf-btn--ghost" style={{ color: t.text, borderColor: t.border }} onClick={refresh}>Try again</button></LbEmpty>;
  } else if (data.gate) {
    const school = data.gate === "school";
    body = (
      <LbEmpty icon={school ? GraduationCap : Users} t={t}
        title={school ? "Join your school" : "No class joined yet"}
        body={school ? "Enter the school code from your institution to see the school leaderboard." : "The class leaderboard is unavailable until you join a class. Enter your class code."}>
        <LbInlineForm t={t} placeholder={school ? "School code" : "Class code"} extra={school ? "Student ID (optional)" : null} button="Join"
          onSubmit={async (code, sid) => { const r = await leaderboardApi.join(school ? "school" : "class", code, sid || ""); if (r.ok) refresh(); return r; }} />
      </LbEmpty>
    );
  } else {
    body = (
      <>
        {scope === "friends" && (
          <div className="lb-friends">
            {data.incoming.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="lb-label" style={{ color: t.textFaint }}>Friend requests</div>
                {data.incoming.map((r) => (
                  <div key={r.user_id} className="lb-row">
                    <Avatar avatar={r.avatar} name={r.name} size={32} />
                    <span className="lb-id"><span className="lb-name" style={{ color: t.text }}>{r.name}</span><span className="lb-sub" style={{ color: t.textFaint }}>@{r.username}</span></span>
                    <button className="pf-btn pf-btn--primary" style={{ padding: "6px 12px" }} onClick={async () => { await leaderboardApi.respond(data.uid, r.user_id, true); refresh(); }}>Accept</button>
                    <button className="pf-btn pf-btn--ghost" style={{ padding: "6px 12px", color: t.text, borderColor: t.border }} onClick={async () => { await leaderboardApi.respond(data.uid, r.user_id, false); refresh(); }}>Decline</button>
                  </div>
                ))}
              </div>
            )}
            <div className="lb-label" style={{ color: t.textFaint }}>Add a friend</div>
            <LbInlineForm t={t} placeholder="Their @username" button={<UserPlus size={15} />}
              onSubmit={async (u) => { const r = await leaderboardApi.addFriend(data.uid, normalizeUsername(u)); return r.ok ? { ok: true, message: `Request sent to ${r.name}.` } : r; }} />
          </div>
        )}
        {scope === "friends" && rows.length === 1 && !needle && (
          <LbEmpty icon={Users} t={t} title="No friends yet" body="Add friends by username to compare XP and streaks." />
        )}
        {needle && results.length === 0 ? (
          <LbEmpty icon={Search} t={t} title="No results" body={`Nothing matched “${q.trim()}” in this leaderboard.`} />
        ) : (
          <>
            {showPodium && <LbTop3 rows={rows} meId={data.uid} t={t} refCb={setMyEl} />}
            <div role="list" aria-label="Rankings">
              {listRows.map((r) => <LbRow key={r.user_id} row={r} isMe={r.user_id === data.uid} cls={clsName(r)} t={t} refCb={setMyEl} />)}
            </div>
            {scope !== "friends" && rows.length === 1 && !needle && <div style={{ textAlign: "center", fontSize: 12, color: t.textFaint, padding: 18 }}>You're the first one here. Classmates will appear as they join.</div>}
          </>
        )}
      </>
    );
  }

  return (
    <div className="lb-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside ref={panelRef} tabIndex={-1} className="lb-panel" data-nofx role="dialog" aria-modal="true" aria-label="Leaderboard"
        style={{ background: t.popover, color: t.text, borderColor: t.border, backdropFilter: "blur(22px) saturate(1.2)", WebkitBackdropFilter: "blur(22px) saturate(1.2)" }}>
        <header className="lb-head">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>Leaderboard</h2>
            <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2 }}>Ranked by XP</div>
          </div>
          <button className="lb-close" onClick={onClose} aria-label="Close leaderboard" style={{ color: t.textMuted }}><X size={16} /></button>
        </header>
        <div className="lb-seg" role="tablist" aria-label="Leaderboard view" style={{ "--i": idx, borderColor: t.border }}>
          <span className="lb-seg__thumb" aria-hidden="true" />
          {LB_SCOPES.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={scope === k} className="lb-seg__btn" style={{ color: scope === k ? t.text : t.textMuted }} onClick={() => { setScope(k); setQ(""); }}>{label}</button>
          ))}
        </div>
        <div className="lb-search" style={{ borderColor: t.border, background: t.bg }}>
          <Search size={16} color={t.textFaint} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, @username or student ID" aria-label="Search the leaderboard" spellCheck={false} style={{ color: t.text }} />
          {q && <button className="lb-close" onClick={() => setQ("")} aria-label="Clear search" style={{ color: t.textMuted }}><X size={14} /></button>}
        </div>
        <div ref={scrollRef} className="lb-scroll">
          <div key={`${scope}-${data.status}`} className="lb-body">{body}</div>
        </div>
        {ready && !data.gate && mine && !myVisible && (
          <div className="lb-me" style={{ borderColor: t.border }}>
            <div>
              <div className="lb-label" style={{ color: t.textFaint, margin: 0 }}>Your rank</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: t.text, lineHeight: 1.1 }}>#{mine.rank}</div>
            </div>
            <Avatar avatar={mine.avatar} name={mine.name} size={34} />
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mine.name}</span>
              <span style={{ fontSize: 12, color: STREAK_ACCENT, display: "inline-flex", alignItems: "center", gap: 4 }}><Flame size={12} /> {mine.streak_current} day streak</span>
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{fmtNum(mine.xp)}<small style={{ color: t.textFaint, fontWeight: 500 }}> XP</small></span>
          </div>
        )}
      </aside>
    </div>
  );
}

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
  const sound = useThemeSound(profile.theme);
  const google = useGoogleAvatar(auth.loggedIn);
  const [lbOpen, setLbOpen] = useState(false);
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

  const handleSaveProfile = useCallback(async ({ name, username, avatar }) => {
    if (username !== (profile.username || "")) {
      const claimed = await usernameApi.claim(username, auth.email || "guest", profile.username);
      if (!claimed.ok) return claimed;
    }
    setProfile((previous) => {
      const next = { ...previous, name: name.trim() || "Student", username, avatar };
      db.saveProfile(next);
      return next;
    });
    return { ok: true };
  }, [auth.email, profile.username]);

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

  useEffect(() => {
    if (!auth.loggedIn || !isSupabaseConfigured || !profile.username) return undefined;
    const id = setTimeout(() => {
      leaderboardApi.sync({ username: profile.username, name: profile.name, avatar: profile.avatar, xp: profile.xp, streak: streak.current, best: streak.longest });
    }, 2000);
    return () => clearTimeout(id);
  }, [auth.loggedIn, profile.username, profile.name, profile.avatar, profile.xp, streak.current, streak.longest]);

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
    return (
      <>
        {profile.theme === "dark" ? <SpaceBackground /> : <SkyBackground />}
        <CardFX theme={profile.theme} />
        <ButtonFX />
        <TiltFX />
        <LoginView onLogin={handleLogin} t={t} />
      </>
    );
  }

  return (
    <>
    {profile.theme === "dark" ? <SpaceBackground /> : <SkyBackground />}
        <CardFX theme={profile.theme} />
        <ButtonFX />
        <TiltFX />
    <div
      data-theme={profile.theme}
      style={{
        position: "relative",
        zIndex: 1,
        background: "transparent",
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
          background: t.chrome, ...GLASS_CHROME,
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
            className="lb-trigger"
            onClick={() => setLbOpen(true)}
            aria-label="Open leaderboard"
            title="Leaderboard"
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.border}`,
              background: t.surface, color: t.textMuted, display: "flex",
              alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <Trophy size={15} />
          </button>
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
          data-nomag
          style={{
            position: "relative", zIndex: 20,
            width: 176, borderRight: `1px solid ${t.border}`, padding: "16px 10px",
            background: t.chrome, ...GLASS_CHROME,
            display: "flex", flexDirection: "column", gap: 2, flexShrink: 0,
          }}
        >
          <AnimatedTabGroup
            items={NAV_ITEMS}
            activeId={activeTab}
            onSelect={setActiveTab}
            t={t}
          />
          <SoundControl sound={sound} theme={profile.theme} t={t} />
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
            <ProfileButton profile={profile} active={activeTab === "profile"} onClick={() => setActiveTab("profile")} t={t} />
          </div>
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
          ) : activeTab === "profile" ? (
            <ProfileView
              profile={profile}
              auth={auth}
              google={google}
              planName={PLANS.find((p) => p.id === profile.plan)?.name || "Free"}
              onSave={handleSaveProfile}
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
                  <div className="dashboard-side-panel" style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18 }}>
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

                  <div className="dashboard-side-panel" style={{ background: t.surface, ...GLASS, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18 }}>
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
      <LeaderboardPanel
        open={lbOpen}
        onClose={() => setLbOpen(false)}
        profile={profile}
        streak={streak}
        onOpenProfile={() => { setLbOpen(false); setActiveTab("profile"); }}
        t={t}
      />
    </div>
    </>
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