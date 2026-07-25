// lib/userMemory.js
//
// User Memory system — one document per user in the "user_memory" Firestore
// collection. Lets LifePath AI say "welcome back, last time you searched
// Naukri" instead of asking the same questions again.

import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { getUserId } from "./user";

const COLLECTION = "user_memory";
const SCHEMA_VERSION = 1;

const PILLAR_IDS = ["jobs", "career", "cv", "wealth", "hustle", "startup"];

function memoryRef(userId) {
  return doc(db, COLLECTION, userId);
}

function createEmptyPillarSection() {
  return {
    completedTasks: [],
    updatedAt: null,
  };
}

function createEmptyUserMemory(userId) {
  const now = Date.now();
  const pillars = {};
  PILLAR_IDS.forEach((id) => {
    pillars[id] = createEmptyPillarSection();
  });

  pillars.jobs.platformsUsed = [];
  pillars.jobs.companiesApplied = [];

  return {
    userId,
    version: SCHEMA_VERSION,
    shared: {
      name: "",
      currentPillar: "",
      streak: 0,
      lastActiveDate: "",
      lastPillarUsed: "",
      activeTask: {
  id: "",
  pillar: "",
  title: "",
  status: "pending",
},
    },
    pillars,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getUserMemory(userId) {
  const uid = userId || getUserId();
  const snap = await getDoc(memoryRef(uid));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function ensureUserMemory(userId) {
  const uid = userId || getUserId();
  const existing = await getUserMemory(uid);
  if (existing) return existing;

  const fresh = createEmptyUserMemory(uid);
  await setDoc(memoryRef(uid), fresh);
  return fresh;
}

export async function getPillarMemory(userId, pillarId) {
  const uid = userId || getUserId();
  const memory = await ensureUserMemory(uid);
  return memory.pillars[pillarId] || createEmptyPillarSection();
}

// Merges scalar/object field updates into one pillar's section
// (e.g. role, city, status, income). For arrays, call updateDoc directly
// with arrayUnion at the call site — see addCompletedTask for the pattern.
export async function updatePillarMemory(userId, pillarId, updates) {
  const uid = userId || getUserId();
  await ensureUserMemory(uid);

  const now = Date.now();
  const fieldPath = `pillars.${pillarId}`;

  const dotUpdates = {};
  Object.entries(updates).forEach(([key, value]) => {
    dotUpdates[`${fieldPath}.${key}`] = value;
  });
  dotUpdates[`${fieldPath}.updatedAt`] = now;
  dotUpdates.updatedAt = now;

  await updateDoc(memoryRef(uid), dotUpdates);
  return getPillarMemory(uid, pillarId);
}

// Appends one completed task using arrayUnion — atomic, no read-then-write
// race. Task shape matches the locked architecture.
export async function addCompletedTask(userId, pillarId, task, platform = "") {
  const uid = userId || getUserId();
  await ensureUserMemory(uid);

  const newTask = {
    id: `task_${Date.now()}`,
    task,
    platform,
    date: new Date().toISOString().split("T")[0],
    status: "completed",
  };

  const now = Date.now();

  await updateDoc(memoryRef(uid), {
  [`pillars.${pillarId}.completedTasks`]: arrayUnion(newTask),
  [`pillars.${pillarId}.updatedAt`]: now,

  "shared.activeTask.pillar": pillarId,
  "shared.activeTask.status": "completed",
  "shared.lastPillarUsed": pillarId,

  updatedAt: now,
});

  return newTask;
}

// Updates shared fields (name, streak, currentPillar, activeTask, etc.).
// Automatically refreshes shared.lastActiveDate on every call, since any
// shared-memory update means the user was just active. Callers can still
// override it explicitly by including lastActiveDate in `updates`.
export async function updateSharedMemory(userId, updates) {
  const uid = userId || getUserId();
  await ensureUserMemory(uid);

  const now = Date.now();
  const dotUpdates = {
    "shared.lastActiveDate": new Date().toISOString().split("T")[0],
  };
  Object.entries(updates).forEach(([key, value]) => {
    dotUpdates[`shared.${key}`] = value;
  });
  dotUpdates.updatedAt = now;

  await updateDoc(memoryRef(uid), dotUpdates);
  return getUserMemory(uid);
}
const MAX_MEMORY_CONTEXT_CHARS = 700;
const MAX_COMPLETED_TASKS_SHOWN = 3;

export function buildMemoryContext(memory, pillarId) {
  if (!memory) return "";

  const shared = memory.shared || {};
  const pillar = memory.pillars?.[pillarId] || {};
  const lines = [];

  if (shared.activeTask?.pillar && shared.activeTask.status === "pending") {
    const title = shared.activeTask.title || "in progress";
    lines.push(`Active task: ${title} (${shared.activeTask.pillar} pillar)`);
  }

  const completed = pillar.completedTasks || [];
  if (completed.length > 0) {
    const recent = completed
      .slice(-MAX_COMPLETED_TASKS_SHOWN)
      .map((t) => `- ${t.task}${t.platform ? ` (${t.platform})` : ""} on ${t.date}`);

    lines.push(`Recently completed:\n${recent.join("\n")}`);
  }

  if (lines.length === 0) return "";

  let context =
    `\nUSER MEMORY (read-only — use to personalize and avoid repeating past steps, do not repeat this block verbatim):\n${lines.join("\n")}`;

  if (context.length > MAX_MEMORY_CONTEXT_CHARS) {
    context = context.slice(0, MAX_MEMORY_CONTEXT_CHARS) + "...";
  }

  return context;
}

export async function recordAssistantResponse(userId, pillarId, structured) {
  if (!userId || !structured) return;

  // Only save when AI actually assigns a task
  if (
    structured.needs_more_info === false &&
    structured.task &&
    structured.task.trim()
  ) {
    await updateSharedMemory(userId, {
      currentPillar: pillarId,
      lastPillarUsed: pillarId,
      activeTask: {
        id: `task_${Date.now()}`,
        pillar: pillarId,
        title: structured.task,
        status: "pending",
      },
    });
  }

  return null;
}
// Returns the user's current active task
export async function getActiveTask(userId) {
  const memory = await getUserMemory(userId);

  if (!memory?.shared?.activeTask) {
    return null;
  }

  return memory.shared.activeTask;
}
