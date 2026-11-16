import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
let token;
export function setToken(value) { token = value; }
api.interceptors.request.use(config => {
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});
export function errorMessage(error) {
  const response = error.response;
  if (!response) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'You’re offline. Reconnect and try again.';
    return 'Could not connect to the HelpDesk server. Try again from the main HelpDesk site.';
  }
  if (typeof response.data?.message === 'string') return response.data.message;
  if (response.status === 429) return 'Too many requests. Wait a few minutes and try again.';
  if (response.status >= 500) return 'The HelpDesk server is temporarily unavailable. Try again shortly.';
  return 'The server returned an unexpected response. Try again from the main HelpDesk site.';
}
export async function get(path, config) { return (await api.get(path,config)).data.data; }
