export function detectTaskProgress(message = "") {
  const msg = message.toLowerCase();

  // User completed the task
  if (
    msg.includes("done") ||
    msg.includes("completed") ||
    msg.includes("finished") ||
    msg.includes("applied")
  ) {
    return "completed";
  }

  // User couldn't complete because of a problem
  if (
    msg.includes("no opening") ||
    msg.includes("no openings") ||
    msg.includes("no jobs") ||
    msg.includes("not found") ||
    msg.includes("nothing found") ||
    msg.includes("couldn't find") ||
    msg.includes("no response")
  ) {
    return "blocked";
  }

  // User hasn't made progress
  return "continue";
}
