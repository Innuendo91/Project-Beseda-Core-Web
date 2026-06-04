export function getCsrfToken() {
  if (window.__CSRF__?.token) return window.__CSRF__.token;
  const match = document.cookie.match(/_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function csrfFetch(url, init = {}) {
  const headers = new Headers(init.headers || {});
  const token = getCsrfToken();
  if (token && !headers.has("x-csrf-token")) {
    headers.set("x-csrf-token", token);
  }

  return fetch(url, {
    credentials: "same-origin",
    ...init,
    headers,
  });
}

export async function getJson(url, init) {
  const response = await csrfFetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || `Request failed: ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}
