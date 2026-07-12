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
        pillar: "",
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
