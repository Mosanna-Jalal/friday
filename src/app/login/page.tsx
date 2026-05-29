"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");

  // Login fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Register fields
  const [regUsername, setRegUsername] = useState("");
  const [regDisplayName, setRegDisplayName] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) router.replace("/"); else setChecking(false); })
      .catch(() => setChecking(false));
  }, [router]);

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Authentication failed.");
      else router.replace("/");
    } catch { setError("Connection error. Try again."); }
    finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: regUsername,
          displayName: regDisplayName,
          password: regPassword,
          confirmPassword: regConfirm,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Registration failed.");
      else router.replace("/");
    } catch { setError("Connection error. Try again."); }
    finally { setLoading(false); }
  }

  if (checking) return null;

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-title">
          {"FRIDAY".split("").map((c, i) => <span key={i}>{c}</span>)}
        </div>
        <p className="login-sub">
          {mode === "login" ? "AUTHENTICATION REQUIRED" : "CREATE YOUR ACCOUNT"}
        </p>

        {/* Mode toggle */}
        <div className="login-mode-tabs">
          <button
            type="button"
            className={`login-mode-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            SIGN IN
          </button>
          <button
            type="button"
            className={`login-mode-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            CREATE ACCOUNT
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="login-form">
            <input className="login-input" type="text" placeholder="USERNAME"
              value={username} onChange={(e) => setUsername(e.target.value)}
              autoComplete="username" autoFocus disabled={loading} />
            <input className="login-input" type="password" placeholder="PASSWORD"
              value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" disabled={loading} />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "VERIFYING..." : "ACCESS SYSTEM"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="login-form">
            <input className="login-input" type="text" placeholder="USERNAME"
              value={regUsername} onChange={(e) => setRegUsername(e.target.value)}
              autoComplete="username" autoFocus disabled={loading} />
            <input className="login-input" type="text" placeholder="DISPLAY NAME"
              value={regDisplayName} onChange={(e) => setRegDisplayName(e.target.value)}
              autoComplete="name" disabled={loading} />
            <input className="login-input" type="password" placeholder="PASSWORD"
              value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
              autoComplete="new-password" disabled={loading} />
            <input className="login-input" type="password" placeholder="CONFIRM PASSWORD"
              value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)}
              autoComplete="new-password" disabled={loading} />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "CREATING..." : "INITIALIZE ACCOUNT"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
