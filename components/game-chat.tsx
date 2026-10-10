"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Message = { id: string; username: string; body: string; created_at: string };

export default function GameChat({ gameId }: { gameId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const endpoint = `/api/games/${gameId}/chat`;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      if (response.status === 401) {
        setMessages([]);
        setSignedOut(true);
        return;
      }
      if (!response.ok) throw new Error("Unable to load chat. Please try again.");
      const data = await response.json();
      setMessages(data.messages);
      setLoaded(true);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load chat.");
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const update = () => {
      if (document.visibilityState === "visible") void refresh(controller.signal);
    };
    const initial = window.setTimeout(() => void refresh(controller.signal), 0);
    const timer = window.setInterval(update, 5000);
    document.addEventListener("visibilitychange", update);
    return () => {
      controller.abort();
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);

  useEffect(() => {
    if (stickToBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !draft.trim()) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const data = await response.json();
      if (response.status === 401) {
        setMessages([]);
        setSignedOut(true);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Unable to send message.");
      setDraft("");
      stickToBottom.current = true;
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  if (signedOut) return null;
  return (
    <section className="game-chat" aria-label="Game conversation">
      <div className="game-chat-messages" ref={list} role="log" aria-label="Chat messages" aria-live="polite" tabIndex={0}
        onScroll={() => {
          const element = list.current;
          if (element) stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
        }}>
        {!loaded ? <p className="game-chat-note">Loading…</p> : messages.length === 0 ? <p className="game-chat-note">No messages yet.</p> : messages.map((message) => (
          <div className="game-chat-message" key={message.id}>
            <strong>{message.username}</strong>{" "}
            <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>{new Date(message.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>{" "}
            <span>{message.body}</span>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="game-chat-form">
        <input id="game-chat-draft" aria-label="Chat message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} required disabled={sending} placeholder="Message…" />
        <button className="button small" type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
