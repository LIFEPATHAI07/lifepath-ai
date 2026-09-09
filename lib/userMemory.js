// lib/userMemory.js
//
// User Memory system — one document per user in the "user_memory" Firestore
// collection.

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

export async function getActiveTask(userId, pillarId) {
  const memory = await getUserMemory(userId);

  const activeTask = memory?.shared?.activeTask;

  if (!activeTask) {
    return null;
  }

  if (activeTask.pillar !== pillarId) {
    return null;
  }

  return activeTask;
}

// ============================================================
// V2 — JOB SEARCH CONVERSION INTELLIGENCE
// ============================================================

const MAX_SEARCH_CONTEXT_CHARS = 900;

function createEmptySearchState() {
  return {
    problemStatement: "",
    roleTarget: "",
    location: "",
    experienceLevel: "",
    applicationsTotal: null,
    responses: null,
    interviews: null,
    channels: { portals: null, direct: null },
    channelResponses: { portals: null, direct: null },
    facts: [],
    insightsGiven: [],
    activeTask: null,
    updatedAt: null,
  };
}

export async function ensureSearchState(userId) {
  const uid = userId || getUserId();
  const memory = await ensureUserMemory(uid);

  if (memory.search) return memory.search;

  const fresh = createEmptySearchState();
  await updateDoc(memoryRef(uid), {
    search: fresh,
    updatedAt: Date.now(),
  });
  return fresh;
}

export async function getSearchState(userId) {
  const uid = userId || getUserId();
  const state = await ensureSearchState(uid);
  return state;
}

export async function updateSearchState(userId, updates) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  const dotUpdates = {};
  Object.entries(updates).forEach(([key, value]) => {
    dotUpdates[`search.${key}`] = value;
  });
  dotUpdates["search.updatedAt"] = now;
  dotUpdates.updatedAt = now;

  await updateDoc(memoryRef(uid), dotUpdates);
  return getSearchState(uid);
}

export async function addSearchFact(userId, fact) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  await updateDoc(memoryRef(uid), {
    "search.facts": arrayUnion(fact),
    "search.updatedAt": now,
    updatedAt: now,
  });
  return getSearchState(uid);
}

export async function addSearchInsight(userId, insight) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  await updateDoc(memoryRef(uid), {
    "search.insightsGiven": arrayUnion(insight),
    "search.updatedAt": now,
    updatedAt: now,
  });
  return getSearchState(uid);
}

export function buildSearchContext(state) {
  if (!state) return "";

  const lines = [];

  if (state.problemStatement) lines.push(`Stated problem: ${state.problemStatement}`);
  if (state.roleTarget) lines.push(`Target role: ${state.roleTarget}`);
  if (state.location) lines.push(`Location: ${state.location}`);
  if (state.experienceLevel) lines.push(`Experience level: ${state.experienceLevel}`);
  if (state.applicationsTotal != null) lines.push(`Total applications: ${state.applicationsTotal}`);
  if (state.responses != null) lines.push(`Total responses: ${state.responses}`);
  if (state.interviews != null) lines.push(`Total interviews: ${state.interviews}`);

  const { portals, direct } = state.channels || {};
  if (portals != null || direct != null) {
    lines.push(`Channel split — portals: ${portals ?? "?"}, direct: ${direct ?? "?"}`);
  }

  const { portals: portalResp, direct: directResp } = state.channelResponses || {};
  if (portalResp != null || directResp != null) {
    lines.push(`Channel responses — portals: ${portalResp ?? "?"}, direct: ${directResp ?? "?"}`);
  }

  if (state.facts?.length > 0) {
    lines.push(`Known facts:\n${state.facts.slice(-6).map((f) => `- ${f}`).join("\n")}`);
  }

  if (state.insightsGiven?.length > 0) {
    lines.push(`Already told the user (do not repeat as if new):\n${state.insightsGiven.slice(-3).map((i) => `- ${i}`).join("\n")}`);
  }

  if (state.activeTask?.status === "pending") {
    lines.push(`Active recommended action (still pending): ${state.activeTask.title}`);
  }

  if (lines.length === 0) return "";

  let context = `\nJOB SEARCH STATE (read-only — real facts already collected, do not re-ask these):\n${lines.join("\n")}`;

  if (context.length > MAX_SEARCH_CONTEXT_CHARS) {
    context = context.slice(0, MAX_SEARCH_CONTEXT_CHARS) + "...";
  }

  return context;
}

export async function setActiveSearchTask(userId, title) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  await updateDoc(memoryRef(uid), {
    "search.activeTask": {
      id: `action_${now}`,
      title,
      status: "pending",
    },
    "search.updatedAt": now,
    updatedAt: now,
  });
}

export async function completeActiveSearchTask(userId) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  await updateDoc(memoryRef(uid), {
    "search.activeTask.status": "completed",
    "search.updatedAt": now,
    updatedAt: now,
  });
}
