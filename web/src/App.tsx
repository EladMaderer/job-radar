import { useCallback, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { clearToken, getToken, setToken } from './auth.js';
import { AuthContext } from './AuthContext.js';
import { Login } from './Login.js';
import { Header } from './components/Header.js';
import { JobsList } from './pages/JobsList.js';
import { ResumePage } from './pages/ResumePage.js';
import { JobDetailPage } from './pages/JobDetailPage.js';

export function App() {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [authError, setAuthError] = useState<string | undefined>(undefined);

  const logout = useCallback((message?: string) => {
    clearToken();
    setTokenState(null);
    setAuthError(message);
  }, []);

  if (!token) {
    return (
      <Login
        error={authError}
        onSubmit={(pw) => {
          setToken(pw);
          setTokenState(pw);
          setAuthError(undefined);
        }}
      />
    );
  }

  return (
    <AuthContext.Provider value={{ logout }}>
      <div className="app">
        <Header onLogout={() => logout()} />
        <Routes>
          <Route path="/" element={<JobsList />} />
          <Route path="/resume" element={<ResumePage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
        </Routes>
      </div>
    </AuthContext.Provider>
  );
}
