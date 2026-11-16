import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken } from './services/api';
const Auth = createContext(null);

export function AuthProvider({ children }) {
  const [user,setUser] = useState(null);
  function logout() { setToken(null); setUser(null); }
  useEffect(() => {
    const interceptor = api.interceptors.response.use(response => response, error => {
      if (error.response?.status === 401 && error.config?.headers?.Authorization) logout();
      return Promise.reject(error);
    });
    return () => api.interceptors.response.eject(interceptor);
  },[]);
  async function login(mode, values) {
    const { data: { data } } = await api.post('/auth/' + mode,values);
    setToken(data.token);
    setUser(data.user);
  }
  return <Auth.Provider value={{ user,login,logout,updateUser:setUser }}>{children}</Auth.Provider>;
}
export const useAuth = () => useContext(Auth);
