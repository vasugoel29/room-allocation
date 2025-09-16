import React, { useState } from "react";
// import Signup from "./Signup";
import { Mail, Lock, LogIn, UserPlus } from "lucide-react";

const Login = ({ onLogin }) => {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // const [showSignup, setShowSignup] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        if (onLogin) onLogin();
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError("Network error");
    }
  };



  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 rounded-lg shadow-lg p-8 w-full max-w-sm">
  <h2 className="text-2xl font-bold text-center text-white mb-6 flex items-center justify-center gap-2"><LogIn size={22}/>Login</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-gray-300 mb-1 flex items-center gap-1" htmlFor="email">
              <Mail size={16}/> Email
            </label>
            <input
              id="email"
              type="email"
              className="w-full px-3 py-2 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="text-gray-300 mb-1 flex items-center gap-1" htmlFor="password">
              <Lock size={16}/> Password
            </label>
            <input
              id="password"
              type="password"
              className="w-full px-3 py-2 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <div className="text-red-400 text-sm text-center">{error}</div>}
          <button
            type="submit"
            className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <LogIn size={18}/> Login
          </button>
        </form>

      </div>
    </div>
  );
};

export default Login;
