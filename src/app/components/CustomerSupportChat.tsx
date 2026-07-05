import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Paperclip, Phone, Video, ChevronDown, Bot, User, Clock, CheckCheck, AlertCircle, Star } from "lucide-react";

const P = "#5B2D8E";
const GOLD = "#F5A623";

type MessageRole = "user" | "agent" | "bot" | "system";

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: Date;
  read?: boolean;
  typing?: boolean;
}

interface QuickReply {
  label: string;
  action: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "sys1",
    role: "system",
    text: "🟢 VMS Support is online — Average response time: under 2 minutes",
    timestamp: new Date(),
  },
  {
    id: "bot1",
    role: "bot",
    text: "Hi! I'm Viva, your VMS virtual assistant. I can help you with:\n\n• Account balances & transactions\n• Card freezing & limits\n• Loan application status\n• Club Travel bookings\n• Branch & ATM locator\n\nWhat can I help you with today?",
    timestamp: new Date(),
  },
];

const QUICK_REPLIES: QuickReply[] = [
  { label: "Check my balance", action: "balance" },
  { label: "Report lost card", action: "card_lost" },
  { label: "Loan application status", action: "loan_status" },
  { label: "Club Travel booking", action: "travel" },
  { label: "Speak to an agent", action: "human" },
];

const BOT_RESPONSES: Record<string, string> = {
  balance: "Your current balances:\n\n💳 Everyday Account: **R24,850.00**\n💰 Savings Account: **R87,340.00**\n🌍 USD Wallet: **$1,240.00**\n\nWould you like a full statement?",
  card_lost: "I'm sorry to hear that. I'll help you freeze your card immediately.\n\n🔒 Your Mastercard ending ••4291 has been **temporarily frozen**.\n\nA replacement card will be delivered within 3–5 business days. Should I also block the card permanently?",
  loan_status: "Your active loan applications:\n\n📋 **VMS-PL-2026-33847** — Personal Loan R50,000\nStatus: **Under Review** ✏️\nExpected decision: Within 24 hours\n\nWould you like me to escalate this to a specialist?",
  travel: "Your Club Travel bookings:\n\n✈️ **CPT → JFK** — 15 Jul 2026\nRef: VMS-CB-2026-48291\nStatus: **Confirmed** ✅\nSeats booked: 2\n\nDo you need help with your visa application?",
  human: "Connecting you to a live agent now...\n\nCurrent queue: **2 people ahead of you**\nEstimated wait: **~3 minutes**\n\nWhile you wait, you can also reach us:\n📞 0800 VMS HELP (0800 867 4357)\n📧 support@vms.co.za",
};

const CATEGORIES = [
  { label: "Account", color: "#3B82F6" },
  { label: "Cards", color: P },
  { label: "Loans", color: "#8B5CF6" },
  { label: "Travel", color: "#F59E0B" },
  { label: "Technical", color: "#10B981" },
  { label: "Complaint", color: "#EF4444" },
];

type ChatView = "launcher" | "chat" | "new_ticket" | "my_tickets";

export function CustomerSupportChat() {
  const [view, setView] = useState<ChatView>("launcher");
  const [minimized, setMinimized] = useState(true);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(1);
  const [ticketCategory, setTicketCategory] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [rating, setRating] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (text?: string) => {
    const msg = text ?? input;
    if (!msg.trim()) return;
    setInput("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: msg,
      timestamp: new Date(),
      read: false,
    };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      const lower = msg.toLowerCase();
      let response = "I understand your query. Let me look into that for you right away. Is there anything else I can help with?\n\nFor urgent issues, you can also call us at **0800 867 4357** (free from any SA network).";
      for (const [key, resp] of Object.entries(BOT_RESPONSES)) {
        if (lower.includes(key.replace("_", " ")) || lower.includes(key)) {
          response = resp;
          break;
        }
      }
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        text: response,
        timestamp: new Date(),
        read: true,
      };
      setMessages(prev => [...prev, botMsg]);
    }, 1200 + Math.random() * 800);
  };

  const handleQuickReply = (qr: QuickReply) => {
    sendMessage(qr.label);
  };

  const open = () => { setMinimized(false); setUnread(0); };

  if (minimized) {
    return (
      <button
        onClick={open}
        className="fixed bottom-6 right-6 z-[300] flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl text-white font-semibold text-sm transition-all hover:scale-105"
        style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}
      >
        <MessageCircle className="w-5 h-5" />
        Support
        {unread > 0 && (
          <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{unread}</span>
        )}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-[300] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
      style={{ width: 380, height: 580, background: "#0A0A14", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10" style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
        <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg">🎧</div>
        <div className="flex-1">
          <p className="text-white font-bold text-sm">VMS Support</p>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-white/70 text-xs">Online · ~2 min wait</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-lg hover:bg-white/20 text-white/70 transition-colors" title="Call us">
            <Phone className="w-4 h-4" />
          </button>
          <button className="p-1.5 rounded-lg hover:bg-white/20 text-white/70 transition-colors" onClick={() => setMinimized(true)}>
            <ChevronDown className="w-4 h-4 text-white" />
          </button>
          <button className="p-1.5 rounded-lg hover:bg-white/20 text-white/70 transition-colors" onClick={() => setMinimized(true)}>
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Nav tabs */}
      <div className="flex border-b border-white/10">
        {(["chat", "new_ticket", "my_tickets"] as ChatView[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="flex-1 py-2 text-xs font-semibold capitalize transition-colors"
            style={{
              color: view === v ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: view === v ? `2px solid ${GOLD}` : "2px solid transparent",
              background: "transparent",
            }}
          >
            {v.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Chat view */}
      {view === "chat" && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map(msg => (
              <div key={msg.id}>
                {msg.role === "system" && (
                  <div className="text-center">
                    <span className="text-[11px] text-white/40 bg-white/5 px-3 py-1 rounded-full">{msg.text}</span>
                  </div>
                )}
                {(msg.role === "bot" || msg.role === "agent") && (
                  <div className="flex items-end gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: msg.role === "bot" ? `${P}44` : "#10B98144" }}>
                      {msg.role === "bot" ? <Bot className="w-4 h-4 text-purple-300" /> : <User className="w-4 h-4 text-green-300" />}
                    </div>
                    <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-3 py-2" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <p className="text-xs text-white/90 leading-relaxed whitespace-pre-line"
                        dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#F5A623">$1</strong>') }}
                      />
                      <p className="text-[10px] text-white/30 mt-1">{msg.timestamp.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                )}
                {msg.role === "user" && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2" style={{ background: P }}>
                      <p className="text-xs text-white leading-relaxed">{msg.text}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <p className="text-[10px] text-white/50">{msg.timestamp.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</p>
                        <CheckCheck className="w-3 h-3 text-white/50" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {typing && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${P}44` }}>
                  <Bot className="w-4 h-4 text-purple-300" />
                </div>
                <div className="rounded-2xl rounded-bl-sm px-4 py-3" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick replies */}
          {messages.length <= 2 && (
            <div className="px-3 py-2 flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map(qr => (
                <button
                  key={qr.action}
                  onClick={() => handleQuickReply(qr)}
                  className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  {qr.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t border-white/10 flex items-center gap-2">
            <button className="p-2 text-white/40 hover:text-white/70 transition-colors flex-shrink-0">
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 bg-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none border border-white/10 focus:border-white/30"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className="p-2 rounded-xl transition-all flex-shrink-0"
              style={{ background: input.trim() ? P : "rgba(255,255,255,0.05)", color: input.trim() ? "#fff" : "rgba(255,255,255,0.2)" }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* New ticket view */}
      {view === "new_ticket" && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {ticketSubmitted ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${P}22` }}>✅</div>
              <div>
                <p className="text-white font-bold">Ticket Submitted!</p>
                <p className="text-white/60 text-xs mt-1">Reference: TKT-2847291</p>
                <p className="text-white/50 text-xs mt-2">Our team will respond within 2 hours. You will receive an email confirmation.</p>
              </div>
              <div className="space-y-2 w-full">
                <p className="text-white/50 text-xs">Rate your submission experience</p>
                <div className="flex justify-center gap-2">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setRating(s)}>
                      <Star className="w-6 h-6" fill={s <= rating ? GOLD : "transparent"} stroke={GOLD} />
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => { setTicketSubmitted(false); setView("chat"); }} className="w-full py-2 rounded-xl text-sm font-semibold text-white" style={{ background: P }}>
                Back to Chat
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-white font-semibold text-sm">Log a Support Ticket</p>
              <div>
                <label className="text-xs text-white/50 block mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.label}
                      onClick={() => setTicketCategory(cat.label)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={{
                        background: ticketCategory === cat.label ? cat.color : "rgba(255,255,255,0.08)",
                        color: ticketCategory === cat.label ? "#fff" : "rgba(255,255,255,0.6)",
                        border: `1px solid ${ticketCategory === cat.label ? cat.color : "rgba(255,255,255,0.1)"}`,
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1.5">Subject</label>
                <input
                  value={ticketSubject}
                  onChange={e => setTicketSubject(e.target.value)}
                  placeholder="Brief summary of your issue"
                  className="w-full px-3 py-2 rounded-xl text-sm text-white bg-white/8 border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1.5">Description</label>
                <textarea
                  value={ticketDescription}
                  onChange={e => setTicketDescription(e.target.value)}
                  rows={4}
                  placeholder="Please describe your issue in detail..."
                  className="w-full px-3 py-2 rounded-xl text-sm text-white bg-white/8 border border-white/10 focus:outline-none focus:border-white/30 resize-none placeholder-white/30"
                />
              </div>
              <button
                onClick={() => ticketCategory && ticketSubject && ticketDescription ? setTicketSubmitted(true) : null}
                disabled={!ticketCategory || !ticketSubject || !ticketDescription}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
                style={{ background: ticketCategory && ticketSubject && ticketDescription ? P : "rgba(255,255,255,0.1)", color: ticketCategory && ticketSubject && ticketDescription ? "#fff" : "rgba(255,255,255,0.3)" }}
              >
                Submit Ticket
              </button>
            </div>
          )}
        </div>
      )}

      {/* My tickets view */}
      {view === "my_tickets" && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <p className="text-white font-semibold text-sm">My Tickets</p>
          {[
            { ref: "TKT-2847291", subject: "Unable to increase card limit", category: "Cards", status: "in_progress", updated: "1 hour ago", priority: "normal" },
            { ref: "TKT-2831048", subject: "Loan disbursement query", category: "Loans", status: "resolved", updated: "3 days ago", priority: "normal" },
            { ref: "TKT-2815920", subject: "International transactions blocked", category: "Cards", status: "closed", updated: "2 weeks ago", priority: "high" },
          ].map(t => (
            <div key={t.ref} className="p-3 rounded-xl cursor-pointer transition-colors hover:bg-white/8" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-white leading-tight">{t.subject}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                  style={{
                    background: t.status === "resolved" || t.status === "closed" ? "#10B98122" : `${GOLD}22`,
                    color: t.status === "resolved" || t.status === "closed" ? "#10B981" : GOLD,
                  }}>
                  {t.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-white/40">
                <span className="font-mono">{t.ref}</span>
                <span>·</span>
                <span>{t.category}</span>
                <span>·</span>
                <Clock className="w-3 h-3" />
                <span>{t.updated}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-center gap-2">
        <span className="text-[10px] text-white/25">Powered by VMS AI · All conversations are recorded for quality</span>
      </div>
    </div>
  );
}
