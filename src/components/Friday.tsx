"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import MemoryPanel from "./MemoryPanel";
import FeedbackPanel from "./FeedbackPanel";
import Terminal from "./Terminal";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };
type Status = "idle" | "listening" | "thinking" | "speaking";

type SpeakOptions = {
  retryDefaultVoice?: boolean;
  resumeV2v?: boolean;
};

const DB_LABELS: Record<string, { label: string; hint: string }> = {
  auto:       { label: "AUTO",       hint: "Let FRIDAY pick the right database" },
  alumni:     { label: "ALUMNI",     hint: "GBM alumni directory & profiles" },
  attendance: { label: "ATTENDANCE", hint: "Student attendance records" },
  fest:       { label: "FEST",       hint: "GBM Fest 2026 registrations & events" },
  internal:   { label: "INTERNAL",   hint: "Internal tools & test data" },
};

function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export default function Friday() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceMode, setVoiceMode] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string>("");
  const [selectedDb, setSelectedDb] = useState<string>("auto");
  const [currentUser, setCurrentUser] = useState<{ displayName: string; role: string } | null>(null);
  const [briefingText, setBriefingText] = useState<string>("");

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speechDetectedRef = useRef(false);
  const silenceIntervalRef = useRef<number | null>(null);
  const hardStopTimerRef = useRef<number | null>(null);

  // Stable refs for cross-closure access
  const ttsVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const sendingRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const statusRef = useRef<Status>("idle");
  const voiceEnabledRef = useRef(voiceEnabled);
  const voiceModeRef = useRef(voiceMode);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  // sendRef lets recorder.onstop call send without stale closure
  const sendRef = useRef<((text: string) => Promise<void>) | null>(null);
  const briefingDoneRef = useRef(false);
  const runBriefingRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  // Fetch current user on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) setCurrentUser(d.user); })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  // Load persisted history from MongoDB on first mount
  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data: { messages?: { role: Role; content: string }[] }) => {
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-scroll conversation
  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const greetedRef = useRef(false);
  const speakRef = useRef<((text: string, options?: SpeakOptions) => void) | null>(null);

  // Pick best-quality female English voice, then greet on first load
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const pickVoice = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length === 0) return;
      setVoices(list);
      if (ttsVoiceRef.current && list.includes(ttsVoiceRef.current)) return;
      const best = scoreVoices(list);
      ttsVoiceRef.current = best ?? list[0] ?? null;
      setVoiceName(ttsVoiceRef.current?.name ?? "");

      if (!greetedRef.current && ttsVoiceRef.current) {
        greetedRef.current = true;
        window.setTimeout(() => {
          // Speak greeting immediately
          speakRef.current?.("Hello, boss. All systems online. How can I help?", { resumeV2v: false });
          // Fetch briefing in parallel — will speak right after greeting ends
          runBriefingRef.current?.();
        }, 600);
      }
    };
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }, []);

  const selectVoice = (name: string) => {
    const v = voices.find((x) => x.name === name);
    if (!v) return;
    ttsVoiceRef.current = v;
    setVoiceName(name);
    window.speechSynthesis?.cancel();
    const sample = new SpeechSynthesisUtterance("Hello MJ. Friday voice updated.");
    sample.voice = v;
    sample.rate = 1.02;
    sample.pitch = 1.05;
    window.speechSynthesis.speak(sample);
  };

  const stopSilenceCheck = useCallback(() => {
    if (silenceIntervalRef.current !== null) {
      window.clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recordingRef.current) return;
    if (hardStopTimerRef.current !== null) {
      window.clearTimeout(hardStopTimerRef.current);
      hardStopTimerRef.current = null;
    }
    stopSilenceCheck();
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      recordingRef.current = false;
    }
  }, [stopSilenceCheck]);

  const startListening = useCallback(async () => {
    if (
      recordingRef.current ||
      sendingRef.current ||
      statusRef.current === "thinking" ||
      statusRef.current === "speaking"
    ) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // AudioContext for silence detection
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder setup
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopSilenceCheck();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        try { audioCtxRef.current?.close(); } catch { /* ignore */ }
        audioCtxRef.current = null;
        analyserRef.current = null;
        recordingRef.current = false;

        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];

        if (blob.size < 500) {
          setStatus("idle");
          setVoiceNotice("");
          if (voiceModeRef.current && !sendingRef.current) {
            window.setTimeout(() => startListening(), 800);
          }
          return;
        }

        setStatus("thinking");
        setVoiceNotice("Transcribing...");

        try {
          const form = new FormData();
          form.append("audio", blob, "audio.webm");
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = (await res.json()) as { text?: string; error?: string };
          const text = data.text?.trim();
          if (text) {
            setVoiceNotice(`Heard: ${text}`);
            sendRef.current?.(text);
          } else {
            setStatus("idle");
            setVoiceNotice("Didn't catch that. Try again.");
            if (voiceModeRef.current && !sendingRef.current) {
              window.setTimeout(() => startListening(), 1200);
            }
          }
        } catch {
          setStatus("idle");
          setVoiceNotice("Transcription failed. Try again.");
          if (voiceModeRef.current && !sendingRef.current) {
            window.setTimeout(() => startListening(), 1200);
          }
        }
      };

      recorder.start(200);
      mediaRecorderRef.current = recorder;
      recordingRef.current = true;
      speechDetectedRef.current = false;
      setStatus("listening");
      setVoiceNotice("Listening — speak now.");

      // Hard stop at 30 s
      hardStopTimerRef.current = window.setTimeout(() => stopListening(), 30000);

      // Silence detection: check RMS every 150 ms
      const buf = new Uint8Array(analyser.fftSize);
      let silentMs = 0;
      silenceIntervalRef.current = window.setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        const rms = Math.sqrt(
          buf.reduce((sum, v) => sum + (v - 128) ** 2, 0) / buf.length,
        );
        if (rms > 6) {
          speechDetectedRef.current = true;
          silentMs = 0;
          setVoiceNotice("Listening...");
        } else if (speechDetectedRef.current) {
          silentMs += 150;
          if (silentMs >= 1500) stopListening();
        }
      }, 150);
    } catch (err) {
      recordingRef.current = false;
      setStatus("idle");
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission denied") || msg.includes("NotAllowed")) {
        setVoiceNotice(
          "Mic blocked. Click the lock icon in the URL bar → Microphone → Allow, then reload.",
        );
      } else {
        setVoiceNotice(`Mic error: ${msg}`);
      }
    }
  }, [stopListening, stopSilenceCheck]);

  // Speak a string — chunked by sentence with mild prosody variation
  const speak = useCallback(
    (text: string, options: SpeakOptions = {}) => {
      const { retryDefaultVoice = true, resumeV2v = true } = options;
      if (!voiceEnabledRef.current) {
        setStatus("idle");
        if (voiceModeRef.current && resumeV2v) window.setTimeout(startListening, 350);
        return;
      }
      if (typeof window === "undefined" || !window.speechSynthesis) {
        setStatus("idle");
        setVoiceNotice("Text-to-speech is not available in this browser.");
        if (voiceModeRef.current && resumeV2v) window.setTimeout(startListening, 350);
        return;
      }

      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const sentences = splitIntoSentences(stripMarkdown(text));
      if (sentences.length === 0) { setStatus("idle"); return; }

      setVoiceNotice("Speaking reply.");
      setStatus("speaking");

      let firstStarted = false;
      sentences.forEach((sentence, i) => {
        const utter = new SpeechSynthesisUtterance(sentence);
        if (ttsVoiceRef.current) utter.voice = ttsVoiceRef.current;
        utter.volume = 1;

        const trimmed = sentence.trim();
        const isQuestion = /\?\s*$/.test(trimmed);
        const isExclaim = /!\s*$/.test(trimmed);
        const isShort = trimmed.length < 40;
        // Tiny jitter keeps it from sounding robotic across long responses
        const jitter = ((i * 31) % 5) / 100;

        // FRIDAY: calm, measured, slightly clipped British cadence
        // Rate ~0.93–0.97 (slightly slower than default — deliberate, not rushed)
        // Pitch ~1.08–1.12 (clear female, not squeaky)
        if (isQuestion) {
          utter.rate = 0.94 + jitter; utter.pitch = 1.12;
        } else if (isExclaim) {
          utter.rate = 0.97 + jitter; utter.pitch = 1.1;
        } else if (isShort) {
          utter.rate = 0.95 + jitter; utter.pitch = 1.1 + jitter;
        } else {
          utter.rate = 0.93 + jitter; utter.pitch = 1.08 + jitter;
        }

        if (i === 0) {
          utter.onstart = () => {
            if (!firstStarted) {
              firstStarted = true;
              setVoiceNotice("Speaking reply.");
              setStatus("speaking");
            }
          };
        }
        if (i === sentences.length - 1) {
          utter.onend = () => {
            setVoiceNotice("");
            setStatus("idle");
            if (voiceModeRef.current && resumeV2v) window.setTimeout(startListening, 350);
          };
        }
        utter.onerror = (event) => {
          if (retryDefaultVoice && utter.voice) {
            window.speechSynthesis.cancel();
            ttsVoiceRef.current = null;
            speak(text, { retryDefaultVoice: false, resumeV2v });
            return;
          }
          setVoiceNotice(`Voice playback failed: ${event.error || "unknown"}.`);
          setStatus("idle");
          if (voiceModeRef.current && resumeV2v) window.setTimeout(startListening, 350);
        };

        window.speechSynthesis.speak(utter);
      });

      window.setTimeout(() => window.speechSynthesis.resume(), 150);
    },
    [startListening],
  );

  // Send a message to the API
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendingRef.current) return;

      sendingRef.current = true;
      setStatus("thinking");
      setInput("");
      setVoiceNotice("");

      const next: Message[] = [
        ...messagesRef.current,
        { role: "user", content: trimmed },
      ];
      setMessages(next);

      const apiMessages = next.map((m) => ({ role: m.role, content: m.content }));

      let assistantText = "";
      let buffer = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, selectedDb }),
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        setMessages((m) => [...m, { role: "assistant", content: "" }]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.startsWith("data: ")) continue;
            let event: { type: string; [k: string]: unknown };
            try { event = JSON.parse(part.slice(6)); } catch { continue; }

            if (event.type === "text") {
              assistantText += event.text as string;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            } else if (event.type === "tool_use") {
              setActiveTool(event.name as string);
            } else if (event.type === "tool_result") {
              setActiveTool(null);
            } else if (event.type === "error") {
              assistantText += `\n[error: ${event.message}]`;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          }
        }

        if (assistantText.trim()) speak(assistantText);
        else {
          setStatus("idle");
          if (voiceModeRef.current) window.setTimeout(startListening, 350);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `[connection error: ${msg}]` },
        ]);
        setStatus("idle");
        if (voiceModeRef.current) window.setTimeout(startListening, 800);
      } finally {
        setActiveTool(null);
        sendingRef.current = false;
      }
    },
    [speak, startListening],
  );

  // Keep refs in sync so closures always call the latest versions
  useEffect(() => { sendRef.current = send; }, [send]);
  useEffect(() => { speakRef.current = speak; }, [speak]);

  // Auto-briefing: weather + Iran-US-Israel news — runs in background, never blocks user
  const runAutoBriefing = useCallback(async () => {
    if (briefingDoneRef.current) return;
    briefingDoneRef.current = true;

    const t0 = Date.now();

    const BRIEFING_PROMPT =
      "Daily briefing boss: (1) current weather in Gaya, Bihar, India — temperature and conditions in one sentence. (2) latest critical developments in the Iran-US-Israel conflict as of today — two sentences max. No padding, straight to the point.";

    let assistantText = "";
    let buffer = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: BRIEFING_PROMPT }], selectedDb: "auto" }),
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let event: { type: string; [k: string]: unknown };
          try { event = JSON.parse(part.slice(6)); } catch { continue; }
          if (event.type === "text") {
            assistantText += event.text as string;
            setBriefingText(assistantText);
          }
        }
      }

      // Wait for greeting to finish before speaking (greeting ~3.5s, we start at 600ms → 4.5s total)
      const remaining = 4500 - (Date.now() - t0);
      if (remaining > 0) await new Promise<void>((r) => window.setTimeout(r, remaining));

      // Speak only if user hasn't already taken over the conversation
      if (assistantText.trim() && !sendingRef.current) {
        speak(assistantText, { resumeV2v: false });
      }
    } catch {
      // Briefing is non-critical — silent fail
    }
  }, [speak]);

  useEffect(() => { runBriefingRef.current = runAutoBriefing; }, [runAutoBriefing]);

  // Hold SPACE to talk (push-to-talk)
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

    let pressed = false;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      if (voiceModeRef.current) return;
      if (pressed || sendingRef.current) return;
      pressed = true;
      void startListening();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault();
      if (!pressed) return;
      pressed = false;
      stopListening();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startListening, stopListening]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      setBriefingText("");
      void send(input.trim());
    }
  };

  const toggleVoice = () => {
    window.speechSynthesis?.cancel();
    setVoiceEnabled((v) => {
      voiceEnabledRef.current = !v;
      return !v;
    });
    if (status === "speaking") setStatus("idle");
  };

  const toggleVoiceMode = async () => {
    const next = !voiceModeRef.current;
    voiceModeRef.current = next;
    setVoiceMode(next);
    voiceEnabledRef.current = true;
    setVoiceEnabled(true);

    if (next) {
      speak("Voice to voice online.", { resumeV2v: true });
      return;
    }

    window.speechSynthesis?.cancel();
    stopListening();
    if (!sendingRef.current) setStatus("idle");
  };

  const testVoice = () => {
    voiceEnabledRef.current = true;
    setVoiceEnabled(true);
    speak("Hello, boss. All systems online. How can I help?", { resumeV2v: false });
  };

  return (
    <main className={`hud hud-${status}`}>
      <div className="hud-frame">
        <div className="hud-corner tl" />
        <div className="hud-corner tr" />
        <div className="hud-corner bl" />
        <div className="hud-corner br" />
        <h1>F R I D A Y</h1>
        <p className="assistant-subtitle">{currentUser ? `${currentUser.displayName.toUpperCase()} PERSONAL ASSISTANT` : "PERSONAL ASSISTANT"}</p>
        <p className="status-line">
          {statusLine(status, activeTool, voiceMode)}
        </p>
        {currentUser && (
          <button className="logout-btn" onClick={handleLogout} title="Sign out">
            {currentUser.displayName} &nbsp;&#x2715;
          </button>
        )}
      </div>

      {voiceNotice && <div className="voice-notice">{voiceNotice}</div>}

      <Terminal status={status} activeTool={activeTool} />

      {currentUser?.role === "admin" && (
        <div className="db-selector">
          {(["auto", "alumni", "attendance", "fest", "internal"] as const).map((db) => (
            <button
              key={db}
              type="button"
              className={`db-pill ${selectedDb === db ? "active" : ""}`}
              data-db={db}
              onClick={() => setSelectedDb(db)}
              title={DB_LABELS[db].hint}
            >
              {DB_LABELS[db].label}
            </button>
          ))}
        </div>
      )}

      {briefingText && (
        <div className="briefing-card">
          <div className="briefing-header">
            <span className="briefing-label">DAILY BRIEFING</span>
            <button className="briefing-close" onClick={() => setBriefingText("")}>✕</button>
          </div>
          <p className="briefing-body">{briefingText}</p>
        </div>
      )}

      <div className="conversation" ref={conversationRef}>
        {messages.length === 0 && (
          <div className="empty">
            Turn on V2V, hold SPACE, or type below.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <span className="msg-label">
              {m.role === "user" ? "BOSS" : "FRIDAY"}
            </span>
            <span className="msg-text">{m.content || "..."}</span>
          </div>
        ))}
      </div>

      <form className="input-bar" onSubmit={onSubmit}>
        <div className="input-row-main">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type, or hold SPACE to talk..."
            autoFocus
            disabled={status === "thinking"}
          />
          <button type="submit" className="btn-send" disabled={!input.trim() || status === "thinking"}>
            SEND
          </button>
        </div>
        <div className="input-row-controls">
          <button
            type="button"
            className="voice-toggle"
            onClick={toggleVoice}
            title={voiceEnabled ? "Mute voice" : "Unmute voice"}
          >
            {voiceEnabled ? "VOICE ON" : "VOICE OFF"}
          </button>
          <button type="button" className="voice-test" onClick={testVoice}>
            TEST VOICE
          </button>
          <button
            type="button"
            className={`voice-mode-toggle ${voiceMode ? "active" : ""}`}
            onClick={() => void toggleVoiceMode()}
            title="Toggle hands-free voice-to-voice mode"
          >
            {voiceMode ? "V2V ON" : "V2V OFF"}
          </button>
          <button
            type="button"
            className="memory-toggle"
            onClick={() => setMemoryOpen(true)}
            title="View and edit FRIDAY's memory"
          >
            MEMORY
          </button>
          <button
            type="button"
            className="feedback-toggle"
            onClick={() => setFeedbackOpen(true)}
            title="Feedback / Suggestions / Bug reports"
          >
            FEEDBACK
          </button>
          {voices.length > 0 && (
            <select
              className="voice-picker"
              value={voiceName}
              onChange={(e) => selectVoice(e.target.value)}
              title="Choose FRIDAY's voice"
            >
              {voices
                .filter((v) => /^en/i.test(v.lang))
                .map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      </form>

      <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <FeedbackPanel open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      <footer className="site-footer">
        <span>crafted by&nbsp;</span>
        <a href="https://me-mj.vercel.app" target="_blank" rel="noopener noreferrer">
          Mosanna Jalal
        </a>
        <span className="footer-sep">·</span>
        <span>MJX Web Studio</span>
      </footer>
    </main>
  );
}

function statusLine(
  status: Status,
  activeTool: string | null,
  voiceMode: boolean,
): string {
  switch (status) {
    case "listening":
      return "Listening.";
    case "thinking":
      return activeTool ? `Running ${activeTool}...` : "Thinking.";
    case "speaking":
      return "Speaking.";
    default:
      return voiceMode ? "Voice-to-voice online." : "Standing by.";
  }
}

function scoreVoices(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (list.length === 0) return null;
  const score = (v: SpeechSynthesisVoice): number => {
    if (!/^en/i.test(v.lang)) return -1;
    const n = v.name;
    let s = 0;

    // Neural/Natural/Premium voices sound far more human
    if (/Online \(Natural\)|Natural\)|Neural|Premium|Enhanced/i.test(n)) s += 300;

    // #1 pick: Microsoft Sonia — British neural, closest to Kerry Condon's FRIDAY
    if (/Sonia/i.test(n)) s += 1000;
    // #2 pick: Microsoft Libby — British neural, warm but precise
    if (/Libby/i.test(n)) s += 800;

    // Irish accent — closest to Kerry Condon's FRIDAY voice
    if (/Irish|Orla|Aoife|Niamh/i.test(n)) s += 500;

    // British/UK English — second-closest accent family to Irish
    if (/^en-GB/i.test(v.lang)) s += 200;
    if (/^en-IE/i.test(v.lang)) s += 400;
    if (/Hazel|Kate|Mia|Nicky|Abbi|Bella|Hollie|Olivia/i.test(n)) s += 150;
    if (/Google UK English Female/i.test(n)) s += 120;

    // Australian — similar crisp clarity
    if (/^en-AU/i.test(v.lang)) s += 80;
    if (/Natasha|Karen|Catherine/i.test(n)) s += 60;

    // Generic female markers
    if (/female/i.test(n)) s += 30;

    // US English — deprioritise (American accent, wrong for FRIDAY)
    if (/^en-US/i.test(v.lang)) s -= 50;
    if (/Aria|Jenny|Emma|Ava|Sara|Michelle|Nancy|Ana/i.test(n)) s -= 20;
    if (/Samantha|Allison/i.test(n)) s -= 10;

    // Male voices — exclude
    if (/David|Mark|George|Daniel|James|Ryan|Thomas|Guy|Liam/i.test(n)) s -= 999;

    return s;
  };
  return [...list].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function stripMarkdown(text: string): string {
  return text
    // Remove fenced code blocks entirely
    .replace(/```[\s\S]*?```/g, "")
    // Inline code — keep content
    .replace(/`([^`]+)`/g, "$1")
    // Bold / italic
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Headings
    .replace(/^#{1,6}\s+/gm, "")
    // Bullet / numbered lists — replace marker with a natural pause
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Links — keep label only
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Table pipes
    .replace(/[|\\]/g, " ")
    // Roll numbers and long numeric IDs in parentheses — useless when spoken
    .replace(/\(Roll:\s*[\w\d]+\)/gi, "")
    .replace(/\(\d{6,}\)/g, "")
    // "- 85%" style separators → ", 85 percent"
    .replace(/\s*-\s*(\d+)%/g, ", $1 percent")
    // Remaining percentages
    .replace(/(\d+(?:\.\d+)?)%/g, "$1 percent")
    // ALL CAPS words → Title Case so TTS reads them as words not acronyms
    .replace(/\b([A-Z]{2,})\b/g, (w) => w[0] + w.slice(1).toLowerCase())
    // Double newlines → sentence pause
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    // Collapse extra spaces and stray punctuation
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*\./g, ".")
    .trim();
}

function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z(\["'])/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}
