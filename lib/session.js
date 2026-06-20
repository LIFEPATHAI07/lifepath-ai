export const getSessionId = () => {
  if (typeof window === "undefined") return "ssr";
  let sid = sessionStorage.getItem("lp_session");
  if (!sid) {
    sid = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("lp_session", sid);
  }
  return sid;
};

export const getUserId = () => {
  if (typeof window === "undefined") return "ssr";
  let uid = localStorage.getItem("lp_uid");
  if (!uid) {
    uid = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("lp_uid", uid);
  }
  return uid;
};
