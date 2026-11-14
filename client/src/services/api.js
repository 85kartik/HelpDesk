import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
let token;
export function setToken(value) { token = value; }
api.interceptors.request.use(config => {
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});
export function errorMessage(error) { return error.response?.data?.message || 'Unable to reach HelpDesk. Try again.'; }
export async function get(path, config) { return (await api.get(path,config)).data.data; }
