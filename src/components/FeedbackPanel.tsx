"use client";

import { useEffect, useState } from "react";

type FType = "feedback" | "suggestion" | "bug";

const TYPES: { value: FType; label: string; hint: string }[] = [
  { value: "feedback",   label: "FEEDBACK",   hint: "General feedback" },
  { value: "suggestion", label: "SUGGESTION", hint: "Feature idea" },
  { value: "bug",        label: "BUG REPORT", hint: "Something broken" },
];

export default function FeedbackPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<FType>("feedback");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSent(false); setMessage(""); setError("");
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSent(true); setMessage("");
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  if (!open) return null;

  return (
    <>
      <div className="memory-backdrop" onClick={onClose} />
      <aside className="memory-panel feedback-panel" role="dialog" aria-label="Feedback">
        <header className="memory-header">
          <h2>HELP US IMPROVE</h2>
          <button type="button" className="memory-close" onClick={onClose}>CLOSE</button>
        </header>

        <p className="memory-help">
          Share feedback, suggest a feature, or report a bug. Every message is read.
        </p>

        {sent ? (
          <div className="feedback-sent">
            <div className="feedback-sent-icon">&#10003;</div>
            <p>Received. Thanks for the input, boss.</p>
            <button className="login-btn" style={{ marginTop: "1rem" }} onClick={() => setSent(false)}>
              SEND ANOTHER
            </button>
          </div>
        ) : (
          <form className="memory-add" onSubmit={submit}>
            <div className="task-status-pills" style={{ marginBottom: "0.5rem" }}>
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`task-pill ${type === t.value ? "active" : ""}`}
                  style={type === t.value ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}
                  onClick={() => setType(t.value)}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === "bug"
                  ? "Describe what happened and what you expected..."
                  : type === "suggestion"
                  ? "Describe the feature you'd like to see..."
                  : "Share your thoughts on FRIDAY..."
              }
              rows={5}
              disabled={busy}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  submit(e as unknown as React.FormEvent);
                }
              }}
            />

            {error && <div className="memory-error">{error}</div>}

            <button type="submit" disabled={!message.trim() || busy}>
              {busy ? "SENDING..." : "SUBMIT"}
            </button>
            <p className="memory-hint">Ctrl+Enter to send</p>
          </form>
        )}
      </aside>
    </>
  );
}
