// lib/userData.js
// Everything LifePath stores about one person, and how to remove it.
//   user_memory/<id>  the case (facts, hypotheses, warning signs, CV-derived summary,
//                     tasks, archived cases) and a short activity log
//   feedback          reports the person chose to send (matched by userId)
// Deleting both removes all server-side data for that id. Copies the AI companies
// (Google, Groq) may hold under their own terms are outside LifePath's control.
//
// There is deliberately NO function that moves a record from one id to another. An id that
// a browser supplies cannot prove who owns a record, so a record is only ever read, changed
// or deleted under the identity the server has verified. Moving a record is a manual
// administrator action after independently confirming ownership (docs/security.md).
import { doc, deleteDoc, deleteWhere } from "./db";

export async function deleteUserData(userId) {
  await deleteDoc(doc(null, "user_memory", userId));
  const feedbackDeleted = await deleteWhere("feedback", "userId", userId);
  return { memory: true, feedbackDeleted };
}
