"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "otp-login" | "register" | "reset";
type Step = "form" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Sign in fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // OTP login fields
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // Register fields
  const [regUsername, setRegUsername] = useState("");
  const [regDisplayName, setRegDisplayName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regOtp, setRegOtp] = useState("");

  // Reset fields
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) window.location.replace("/"); else setChecking(false); })
      .catch(() => setChecking(false));
  }, []);

  function switchMode(m: Mode) {
    setMode(m); setStep("form");
    setError(""); setInfo("");
  }

  async function post(url: string, body: object) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  }

  // ── Sign in with password ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { res, data } = await post("/api/auth/login", { username, password });
      if (!res.ok) setError(data.error || "Authentication failed.");
      else router.replace("/");
    } catch { setError("Connection error."); }
    finally { setLoading(false); }
  }

  // ── OTP login: send code ──
  async function handleSendLoginOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { res, data } = await post("/api/auth/send-otp", { email: otpEmail, purpose: "login" });
      if (!res.ok) setError(data.error || "Failed to send code.");
      else { setInfo(`Code sent to ${otpEmail}`); setStep("otp"); }
    } catch { setError("Connection error."); }
    finally { setLoading(false); }
  }

  // ── OTP login: verify code ──
  async function handleVerifyLoginOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { res, data } = await post("/api/auth/verify-otp", { email: otpEmail, code: otpCode });
      if (!res.ok) setError(data.error || "Invalid code.");
      else router.replace("/");
    } catch { setError("Connection error."); }
    finally { setLoading(false); }
  }

  // ── Register: send OTP ──
  async function handleSendRegisterOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!regUsername.trim()) return setError("Username is required.");
    if (!regDisplayName.trim()) return setError("Display name is required.");
    if (!regEmail.trim()) return setError("Email is required.");
    if (!regPassword || regPassword.length < 6) return setError("Password must be at least 6 characters.");
    if (regPassword !== regConfirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const { res, data } = await post("/api/auth/send-otp", { email: regEmail, purpose: "register" });
      if (!res.ok) setError(data.error || "Failed to send code.");
      else { setInfo(`Verification code sent to ${regEmail}`); setStep("otp"); }
    } catch { setError("Connection error."); }
    finally { setLoading(false); }
  }

  // ── Register: verify OTP + create ──
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { res, data } = await post("/api/auth/register", {
        username: regUsername, displayName: regDisplayName,
        email: regEmail, password: regPassword, confirmPassword: regConfirm, otp: regOtp,
      });
      if (!res.ok) setError(data.error || "Registration failed.");
      else router.replace("/");
    } catch { setError("Connection error."); }
    finally { setLoading(false); }
  }

  // ── Reset: send OTP ──
  async function handleSendResetOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { res, data } = await post("/api/auth/send-otp", { email: resetEmail, purpose: "reset" });
      if (!res.ok) setError(data.error || "Failed to send code.");
      else { setInfo(`Reset code sent to ${resetEmail}`); setStep("otp"); }
    } catch { setError("Connection error."); }
    finally { setLoading(false); }
  }

  // ── Reset: verify OTP + new password ──
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (resetPassword.length < 6) return setError("Password must be at least 6 characters.");
    if (resetPassword !== resetConfirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const { res, data } = await post("/api/auth/reset-password", {
        email: resetEmail, code: resetOtp, newPassword: resetPassword,
      });
      if (!res.ok) setError(data.error || "Reset failed.");
      else { setInfo("Password updated. You can now sign in."); switchMode("login"); }
    } catch { setError("Connection error."); }
    finally { setLoading(false); }
  }

  if (checking) return null;

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-title">{"FRIDAY".split("").map((c, i) => <span key={i}>{c}</span>)}</div>
        <p className="login-sub">
          {mode === "login"     && "AUTHENTICATION REQUIRED"}
          {mode === "otp-login" && "EMAIL VERIFICATION LOGIN"}
          {mode === "register"  && (step === "form" ? "CREATE YOUR ACCOUNT" : "VERIFY YOUR EMAIL")}
          {mode === "reset"     && (step === "form" ? "FORGOT PASSWORD" : "RESET PASSWORD")}
        </p>

        {/* Mode tabs */}
        {mode !== "reset" && (
          <div className="login-mode-tabs">
            <button className={`login-mode-tab ${mode === "login" ? "active" : ""}`} onClick={() => switchMode("login")}>SIGN IN</button>
            <button className={`login-mode-tab ${mode === "otp-login" ? "active" : ""}`} onClick={() => switchMode("otp-login")}>EMAIL OTP</button>
            <button className={`login-mode-tab ${mode === "register" ? "active" : ""}`} onClick={() => switchMode("register")}>CREATE</button>
          </div>
        )}

        {/* ── Sign in ── */}
        {mode === "login" && (
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
            <button type="button" className="login-link" onClick={() => switchMode("reset")}>
              Forgot password?
            </button>
          </form>
        )}

        {/* ── OTP Login ── */}
        {mode === "otp-login" && step === "form" && (
          <form onSubmit={handleSendLoginOtp} className="login-form">
            <p className="login-hint">Enter your registered email to receive a one-time code.</p>
            <input className="login-input" type="email" placeholder="EMAIL ADDRESS"
              value={otpEmail} onChange={(e) => setOtpEmail(e.target.value)}
              autoFocus disabled={loading} />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading || !otpEmail.trim()}>
              {loading ? "SENDING..." : "SEND CODE"}
            </button>
          </form>
        )}

        {mode === "otp-login" && step === "otp" && (
          <form onSubmit={handleVerifyLoginOtp} className="login-form">
            {info && <p className="login-info">{info}</p>}
            <input className="login-input otp-input" type="text" placeholder="6-DIGIT CODE"
              value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus maxLength={6} disabled={loading} />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading || otpCode.length < 6}>
              {loading ? "VERIFYING..." : "VERIFY & ENTER"}
            </button>
            <button type="button" className="login-link" onClick={() => { setStep("form"); setError(""); setOtpCode(""); }}>
              Resend code
            </button>
          </form>
        )}

        {/* ── Register ── */}
        {mode === "register" && step === "form" && (
          <form onSubmit={handleSendRegisterOtp} className="login-form">
            <input className="login-input" type="text" placeholder="USERNAME"
              value={regUsername} onChange={(e) => setRegUsername(e.target.value)}
              autoComplete="username" autoFocus disabled={loading} />
            <input className="login-input" type="text" placeholder="DISPLAY NAME"
              value={regDisplayName} onChange={(e) => setRegDisplayName(e.target.value)}
              autoComplete="name" disabled={loading} />
            <input className="login-input" type="email" placeholder="EMAIL ADDRESS"
              value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
              autoComplete="email" disabled={loading} />
            <input className="login-input" type="password" placeholder="PASSWORD"
              value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
              autoComplete="new-password" disabled={loading} />
            <input className="login-input" type="password" placeholder="CONFIRM PASSWORD"
              value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)}
              autoComplete="new-password" disabled={loading} />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "SENDING CODE..." : "SEND VERIFICATION CODE"}
            </button>
          </form>
        )}

        {mode === "register" && step === "otp" && (
          <form onSubmit={handleRegister} className="login-form">
            {info && <p className="login-info">{info}</p>}
            <input className="login-input otp-input" type="text" placeholder="6-DIGIT CODE"
              value={regOtp} onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus maxLength={6} disabled={loading} />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading || regOtp.length < 6}>
              {loading ? "CREATING..." : "VERIFY & CREATE ACCOUNT"}
            </button>
            <button type="button" className="login-link" onClick={() => { setStep("form"); setError(""); setRegOtp(""); }}>
              ← Back / Resend code
            </button>
          </form>
        )}

        {/* ── Forgot Password ── */}
        {mode === "reset" && step === "form" && (
          <form onSubmit={handleSendResetOtp} className="login-form">
            <p className="login-hint">Enter your registered email to receive a reset code.</p>
            <input className="login-input" type="email" placeholder="EMAIL ADDRESS"
              value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
              autoFocus disabled={loading} />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading || !resetEmail.trim()}>
              {loading ? "SENDING..." : "SEND RESET CODE"}
            </button>
            <button type="button" className="login-link" onClick={() => switchMode("login")}>
              ← Back to sign in
            </button>
          </form>
        )}

        {mode === "reset" && step === "otp" && (
          <form onSubmit={handleReset} className="login-form">
            {info && <p className="login-info">{info}</p>}
            <input className="login-input otp-input" type="text" placeholder="6-DIGIT RESET CODE"
              value={resetOtp} onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus maxLength={6} disabled={loading} />
            <input className="login-input" type="password" placeholder="NEW PASSWORD"
              value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
              autoComplete="new-password" disabled={loading} />
            <input className="login-input" type="password" placeholder="CONFIRM NEW PASSWORD"
              value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)}
              autoComplete="new-password" disabled={loading} />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading || resetOtp.length < 6}>
              {loading ? "RESETTING..." : "RESET PASSWORD"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
