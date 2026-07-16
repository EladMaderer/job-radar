import { useState } from 'react';

export function Login({ onSubmit, error }: { onSubmit: (password: string) => void; error?: string }) {
  const [password, setPassword] = useState('');

  return (
    <div className="login-wrap">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (password) onSubmit(password);
        }}
      >
        <h1>jobs-radar</h1>
        <p className="login-sub">Enter the dashboard password to continue.</p>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button type="submit">Sign in</button>
        {error && <p className="login-error">{error}</p>}
      </form>
    </div>
  );
}
