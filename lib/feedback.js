import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export const saveFeedback = async ({ rating, reason, pillar, sessionId, userId }) => {
  try {
    await addDoc(collection(db, "feedback"), {
      rating, reason, pillar,
      sessionId: sessionId || "anonymous",
      userId: userId || "anonymous",
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.error("Feedback save error:", e);
  }
};

export const saveInterview = async ({ userId, pillar, whyTried, expected, useful, disappointed, returnTomorrow, payFor }) => {
  try {
    await addDoc(collection(db, "interviews"), {
      userId: userId || "anonymous",
      pillar, whyTried, expected, useful,
      disappointed, returnTomorrow, payFor,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.error("Interview save error:", e);
  }
};
