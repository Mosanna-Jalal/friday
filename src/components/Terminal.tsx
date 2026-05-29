"use client";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "listening" | "thinking" | "speaking";

const POOL: Record<Status, string[]> = {
  idle: ["STANDING BY", "ALL SYSTEMS ONLINE", "READY FOR INPUT", "AWAITING COMMAND"],
  listening: [
    "microphone stream active",
    "analyzing audio input",
    "detecting speech patterns",
    "processing voice signal",
    "reading waveform buffer",
    "parsing voice frequency",
  ],
  thinking: [
    "parsing neural context",
    "cross-referencing memory banks",
    "routing to core processor",
    "synthesizing response matrix",
    "aligning language model",
    "decoding semantic patterns",
    "loading cognitive framework",
    "establishing thought vectors",
    "initializing inference engine",
    "compiling response tokens",
    "resolving context graph",
    "weighting probability clusters",
  ],
  speaking: [
    "encoding tts signal",
    "rendering audio waveform",
    "modulating voice output",
    "streaming audio buffer",
    "dispatching speech packets",
  ],
};

const TOOL_POOL: Record<string, string[]> = {
  web_search:          ["initiating web crawl", "scanning live data feeds", "indexing search results", "extracting key vectors", "parsing html nodes"],
  query_database:      ["opening db connection", "executing find query", "parsing document schema", "loading collection index", "deserializing bson"],
  aggregate_database:  ["running aggregation pipeline", "computing statistical clusters", "grouping data segments", "sorting result matrix", "collating documents"],
  list_db_collections: ["listing database collections", "reading schema index", "enumerating namespaces"],
  get_weather:         ["pinging weather satellites", "fetching atmospheric data", "resolving geolocation"],
  get_current_time:    ["syncing system clock", "fetching local timestamp"],
  remember_fact:       ["encoding memory block", "writing to persistent storage", "indexing fact vector"],
  recall_facts:        ["loading memory index", "retrieving stored facts", "deserializing memory doc"],
  forget_fact:         ["purging memory entry", "updating storage index"],
  save_task:           ["serializing task payload", "writing to task queue", "assigning priority weight"],
  list_tasks:          ["fetching task registry", "loading priority queue", "sorting by weight"],
  update_task:         ["updating task record", "syncing task database", "reindexing priority"],
  delete_task:         ["removing task entry", "purging from queue", "compacting index"],
};

export default function Terminal({
  status,
  activeTool,
}: {
  status: Status;
  activeTool: string | null;
}) {
  const [msg, setMsg] = useState("STANDING BY");
  const [blink, setBlink] = useState(true);
  const idxRef = useRef(0);
  const poolRef = useRef<string[]>(POOL.idle);

  // Update pool when status/tool changes; reset index
  useEffect(() => {
    const pool =
      activeTool && TOOL_POOL[activeTool]
        ? TOOL_POOL[activeTool]
        : POOL[status] ?? POOL.idle;
    // shuffle so repeated triggers feel different
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    poolRef.current = shuffled;
    idxRef.current = 0;
    setMsg(shuffled[0]);
  }, [status, activeTool]);

  // Cycle messages while active
  useEffect(() => {
    if (status === "idle") return;
    const interval = window.setInterval(() => {
      idxRef.current = (idxRef.current + 1) % poolRef.current.length;
      setMsg(poolRef.current[idxRef.current]);
    }, 1700);
    return () => clearInterval(interval);
  }, [status, activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Blink cursor
  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 520);
    return () => clearInterval(id);
  }, []);

  const active = status !== "idle";

  return (
    <div className={`terminal-strip ${active ? "terminal-active" : ""}`} aria-live="polite" aria-atomic="true">
      <span className="terminal-prefix">friday.sys</span>
      <span className="terminal-separator">$&gt;</span>
      <span className="terminal-msg">{msg}</span>
      {active && <span className="terminal-ellipsis">...</span>}
      <span className={`terminal-cursor ${blink ? "vis" : ""}`}>▋</span>
    </div>
  );
}
