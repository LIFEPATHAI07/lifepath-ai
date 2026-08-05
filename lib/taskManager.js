export function detectTaskProgress(message) {
  const text = message.toLowerCase();

  // Task completed
  if (
    text.includes("done") ||
    text.includes("completed") ||
    text.includes("finished") ||
    text.includes("applied") ||
    text.includes("submitted")
  ) {
    return "completed";
  }

  // User couldn't complete because of a problem
  if (
    text.includes("no opening") ||
    text.includes("no openings") ||
    text.includes("not found") ||
    text.includes("nothing found") ||
    text.includes("couldn't find") ||
    text.includes("no jobs") ||
    text.includes("no response")
  ) {
    return "blocked";
  }

  // Still working
  return "continue";
}
