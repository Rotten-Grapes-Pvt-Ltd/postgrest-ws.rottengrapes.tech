import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import MapComponent from './components/MapComponent';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      // Decode token to get user info (simplified)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ email: payload.email, role: payload.role });
      } catch (e) {
        localStorage.removeItem('token');
        setToken(null);
      }
    }
  }, [token]);

  const handleLogin = (loginToken, userData) => {
    localStorage.setItem('token', loginToken);
    setToken(loginToken);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>PostgREST Map Application</h1>
        {user ? (
          <div>
            <span>Welcome, {user.email}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <Login onLogin={handleLogin} />
        )}
      </header>
      <main>
        <MapComponent user={user} token={token} />
      </main>
    </div>
  );
}

export default App;