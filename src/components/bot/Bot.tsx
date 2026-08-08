// Fix-it Bot chat widget. Replaces src/islands/bot.ts wholesale — same
// endpoint, same request/response shape, same DOM class names (driven by
// legacy.css, not component-local styles). The backend is a free Render
// instance that cold-starts (can take 20-50s to respond), hence the 60s
// abort timeout below; there is no loading/pending UI beyond the
// "Typing..." bubble, matching the original.
//
// Replies are rendered as plain React children ({m.text}), never
// dangerouslySetInnerHTML — the same textContent-safety the original got
// from bubble.textContent, just via React's default escaping instead.
//
// Fix while converting: the original had no send-lock, so a rapid double
// submit could produce two "Typing..." bubbles, and its removeTypingBubble()
// (a first-match querySelector) could remove the wrong one. Here every
// message carries a stable id, the typing bubble is swapped for the reply
// in place by that id (never queried), and isSending disables the input and
// submit button for the duration of the request — so a second submit while
// one is in flight is structurally impossible, not just less likely.
import { useEffect, useRef, useState, type SubmitEvent } from 'react';

interface ChatResponse {
  reply?: string;
}

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  variant?: 'intro' | 'typing';
}

const CHAT_ENDPOINT = 'https://fixitbotbackend.onrender.com/api/chat';
const GENERIC_ERROR = '⚠️ Something went wrong. Please try again.';
const WAKING_UP_ERROR = '⏳ The assistant is still waking up. Please try again in a moment.';

let nextId = 0;
function newId(): string {
  nextId += 1;
  return `bot-msg-${nextId}`;
}

export function Bot() {
  const [messages, setMessages] = useState<Message[]>(() => [
    { id: newId(), sender: 'bot', text: 'Hi! How can I help you today?', variant: 'intro' },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // Same scroll-to-bottom-on-every-message behavior as the original's
  // chatWindow.scrollTop = chatWindow.scrollHeight after each appendMessage.
  useEffect(() => {
    const el = chatWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (isSending) return;

    const userMessage = inputValue.trim();
    if (!userMessage) return;

    setInputValue('');
    const typingId = newId();
    setMessages((prev) => [
      ...prev,
      { id: newId(), sender: 'user', text: userMessage },
      { id: typingId, sender: 'bot', text: 'Typing...', variant: 'typing' },
    ]);
    setIsSending(true);

    // The backend is a free Render instance and can cold-start for ~50s.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.error(`Chat request failed with status ${res.status}`);
        setMessages((prev) =>
          prev.map((m) => (m.id === typingId ? { id: typingId, sender: 'bot', text: GENERIC_ERROR } : m)),
        );
        return;
      }

      const data = (await res.json()) as ChatResponse;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId ? { id: typingId, sender: 'bot', text: data.reply || GENERIC_ERROR } : m,
        ),
      );
    } catch (err) {
      console.error(err);
      const text =
        err instanceof DOMException && err.name === 'AbortError' ? WAKING_UP_ERROR : GENERIC_ERROR;
      setMessages((prev) => prev.map((m) => (m.id === typingId ? { id: typingId, sender: 'bot', text } : m)));
    } finally {
      clearTimeout(timeout);
      setIsSending(false);
    }
  }

  return (
    <>
      <div id="chat-window" className="chat-window" ref={chatWindowRef}>
        {messages.map((m) => (
          <div key={m.id} className={`${m.sender}-bubble${m.variant ? ` ${m.variant}` : ''}`}>
            {m.text}
          </div>
        ))}
      </div>

      <form id="chat-form" className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          id="user-input"
          placeholder="Type your issue…"
          autoComplete="off"
          required
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isSending}
        />
        <button type="submit" disabled={isSending}>
          Send
        </button>
      </form>
    </>
  );
}
