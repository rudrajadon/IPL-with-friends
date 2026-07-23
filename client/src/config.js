const trimTrailingSlash = (value = "") =>
  String(value || "").replace(/\/+$/, "");

const defaultOrigin =
  typeof window !== "undefined" && window.location && window.location.origin
    ? window.location.origin
    : "http://localhost:4000";

export const API_BASE_URL = trimTrailingSlash(
  process.env.REACT_APP_API_URL || defaultOrigin,
);

export const SOCKET_URL = trimTrailingSlash(
  process.env.REACT_APP_SOCKET_URL || API_BASE_URL,
);

export const FILES_BASE_URL = `${API_BASE_URL}/files`;
export const AUDIO_BASE_URL = `${API_BASE_URL}/audio`;

export const fileUrl = (path = "") => `${FILES_BASE_URL}/${String(path || "")}`;
export const audioUrl = (track = "") =>
  `${AUDIO_BASE_URL}/${String(track || "")}`;
