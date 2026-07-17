import { createContext, useContext } from 'react';

/** Lets any page trigger logout (e.g. on an AuthError from authFetch) without prop drilling. */
export const AuthContext = createContext<{ logout: (message?: string) => void }>({
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);
