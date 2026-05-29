"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Memory = { facts: string[] };
type TaskStatus = "done" | "doing" | "planned" | "scheduled";
type Task = {
  _id: string;
  content: string;
  status: TaskStatus;
  scheduledAt?: string;
  weekdays?: string[];
  category?: string;
  priority: number;
};

const WEEKDAYS = ["MON","TUE","WED","THU","FRI","SAT","SUN"];

const STATUS_META: Record<TaskStatus, { color: string; dot: string }> = {
  doing:     { color: "var(--accent)",   dot: "●" },
  planned:   { color: "var(--thinking)", dot: "◐" },
  scheduled: { color: "#a78bfa",         dot: "◑" },
  done:      { color: "var(--speaking)", dot: "✓" },
};

export default function MemoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"tasks" | "facts">("tasks");

  // Facts
  const [facts, setFacts] = useState<string[]>([]);
  const [newFact, setNewFact] = useState("");

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newContent, setNewContent] = useState("");
  const [newStatus, setNewStatus] = useState<TaskStatus>("planned");
  const [newSchedule, setNewSchedule] = useState("");
  const [newWeekdays, setNewWeekdays] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newPriority, setNewPriority] = useState(5);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadFacts = useCallback(async () => {
    const res = await fetch("/api/memory", { cache: "no-store" });
    const d = (await res.json()) as Memory;
    setFacts(d.facts ?? []);
  }, []);

  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/tasks?status=all", { cache: "no-store" });
    const d = await res.json();
    setTasks(d.tasks ?? []);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    loadFacts();
    loadTasks();
    setTimeout(() => textareaRef.current?.focus(), 120);
  }, [open, loadFacts, loadTasks]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // ── Facts ──
  async function addFact() {
    const fact = newFact.trim();
    if (!fact || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fact }) });
      setFacts(((await res.json()) as Memory).facts ?? []);
      setNewFact("");
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function removeFact(fact: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fact }) });
      setFacts(((await res.json()) as Memory).facts ?? []);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  // ── Tasks ──
  function toggleDay(d: string) {
    setNewWeekdays((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d]);
  }

  async function addTask() {
    const content = newContent.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          status: newStatus,
          scheduledAt: newStatus === "scheduled" ? newSchedule || undefined : undefined,
          weekdays: newWeekdays.length > 0 ? newWeekdays : undefined,
          category: newCategory.trim() || undefined,
          priority: newPriority,
        }),
      });
      setTasks((await res.json()).tasks ?? []);
      setNewContent(""); setNewSchedule(""); setNewWeekdays([]); setNewCategory(""); setNewPriority(5);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function patchTask(taskId: string, patch: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, ...patch }) });
      setTasks((await res.json()).tasks ?? []);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function removeTask(taskId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId }) });
      setTasks((await res.json()).tasks ?? []);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  if (!open) return null;

  return (
    <>
      <div className="memory-backdrop" onClick={onClose} />
      <aside className="memory-panel" role="dialog" aria-label="Memory panel">

        <header className="memory-header">
          <div className="mp-tabs">
            <button className={`mp-tab ${tab === "tasks" ? "active" : ""}`} onClick={() => setTab("tasks")}>TASKS</button>
            <button className={`mp-tab ${tab === "facts" ? "active" : ""}`} onClick={() => setTab("facts")}>FACTS</button>
          </div>
          <button type="button" className="memory-close" onClick={onClose}>✕</button>
        </header>

        {/* ── TASKS TAB ── */}
        {tab === "tasks" && (
          <>
            <div className="task-flat-list">
              {tasks.length === 0 && <p className="memory-empty">No tasks yet.</p>}
              {tasks.map((t) => {
                const meta = STATUS_META[t.status];
                return (
                  <div key={t._id} className={`task-row task-row-${t.status}`}>
                    <span className="task-row-dot" style={{ color: meta.color }}>{meta.dot}</span>
                    <div className="task-row-body">
                      <span className="task-row-text">{t.content}</span>
                      <div className="task-row-meta">
                        {t.category && <span className="task-cat-tag">{t.category}</span>}
                        {t.weekdays && t.weekdays.length > 0 && (
                          <span className="task-days-tag">{t.weekdays.map((d) => d.slice(0,2)).join(" ")}</span>
                        )}
                        {t.scheduledAt && <span className="task-sched-tag">{t.scheduledAt.replace("T", " ").slice(0, 16)}</span>}
                      </div>
                    </div>
                    <div className="task-row-controls">
                      <span className="task-priority-badge">★{t.priority}</span>
                      <button className="task-pri-btn" title="Raise priority" disabled={busy || t.priority >= 10}
                        onClick={() => patchTask(t._id, { priority: t.priority + 1 })}>▲</button>
                      <button className="task-pri-btn" title="Lower priority" disabled={busy || t.priority <= 1}
                        onClick={() => patchTask(t._id, { priority: t.priority - 1 })}>▼</button>
                      <select className="task-status-select" value={t.status} disabled={busy}
                        onChange={(e) => patchTask(t._id, { status: e.target.value })}>
                        <option value="doing">doing</option>
                        <option value="planned">planned</option>
                        <option value="scheduled">scheduled</option>
                        <option value="done">done</option>
                      </select>
                      <button className="task-del-btn" disabled={busy} onClick={() => removeTask(t._id)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add task form */}
            <form className="task-add-form" onSubmit={(e) => { e.preventDefault(); addTask(); }}>
              <textarea
                ref={textareaRef}
                className="task-add-input"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Describe the task, goal, or thought..."
                rows={2}
                disabled={busy}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addTask(); } }}
              />

              <div className="task-add-row">
                <input
                  className="task-cat-input"
                  type="text"
                  placeholder="category (optional)"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  disabled={busy}
                  maxLength={24}
                />
                <div className="task-pri-row">
                  <button type="button" className="task-pri-btn" onClick={() => setNewPriority((p) => Math.max(1, p - 1))} disabled={newPriority <= 1}>▼</button>
                  <span className="task-priority-badge">★{newPriority}</span>
                  <button type="button" className="task-pri-btn" onClick={() => setNewPriority((p) => Math.min(10, p + 1))} disabled={newPriority >= 10}>▲</button>
                </div>
              </div>

              <div className="task-status-pills">
                {(["doing","planned","scheduled","done"] as TaskStatus[]).map((s) => (
                  <button key={s} type="button"
                    className={`task-pill ${newStatus === s ? "active" : ""}`}
                    style={newStatus === s ? { borderColor: STATUS_META[s].color, color: STATUS_META[s].color } : {}}
                    onClick={() => setNewStatus(s)}>{s}</button>
                ))}
              </div>

              {newStatus === "scheduled" && (
                <input className="login-input" type="datetime-local" value={newSchedule}
                  onChange={(e) => setNewSchedule(e.target.value)} disabled={busy} />
              )}

              <div className="weekday-picker">
                <span className="weekday-label">DAYS</span>
                {WEEKDAYS.map((d) => (
                  <button key={d} type="button"
                    className={`weekday-pill ${newWeekdays.includes(d) ? "active" : ""}`}
                    onClick={() => toggleDay(d)} disabled={busy}>{d.slice(0,2)}</button>
                ))}
              </div>

              <button type="submit" className="task-submit-btn" disabled={!newContent.trim() || busy}>
                {busy ? "SAVING..." : "SAVE"}
              </button>
              <p className="memory-hint">Ctrl+Enter to save</p>
            </form>
          </>
        )}

        {/* ── FACTS TAB ── */}
        {tab === "facts" && (
          <>
            <div className="memory-help">Durable facts FRIDAY remembers about you across conversations.</div>
            <ul className="memory-list">
              {facts.length === 0 && <li className="memory-empty">No facts stored yet.</li>}
              {facts.map((f, i) => (
                <li key={i} className="memory-item">
                  <span className="memory-fact">{f}</span>
                  <button type="button" className="memory-remove" onClick={() => removeFact(f)} disabled={busy}>✕</button>
                </li>
              ))}
            </ul>
            <form className="memory-add" onSubmit={(e) => { e.preventDefault(); addFact(); }}>
              <textarea
                ref={tab === "facts" ? textareaRef : undefined}
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                placeholder="e.g. 'Prefers dark mode. Working on FRIDAY v2.'"
                rows={3}
                disabled={busy}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addFact(); } }}
              />
              <button type="submit" disabled={!newFact.trim() || busy}>{busy ? "SAVING..." : "SAVE FACT"}</button>
              <p className="memory-hint">Ctrl+Enter to save</p>
            </form>
          </>
        )}

        {error && <div className="memory-error">{error}</div>}
      </aside>
    </>
  );
}
