import "dotenv/config";
import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const db = new Database(path.join(__dirname, "elsewhere.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    universe TEXT NOT NULL,
    prompt TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(session({
  name: "elsewhere.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Sign in to continue." });
  next();
}
function safeUser(user) {
  return { id: user.id, email: user.email, displayName: user.display_name };
}

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 10 || password.length > 200) {
    return res.status(400).json({ error: "Enter a valid email and a password of at least 10 characters." });
  }
  const name = String(displayName || "Storyteller").trim().slice(0, 40) || "Storyteller";
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)").run(email.toLowerCase(), hash, name);
    req.session.userId = Number(result.lastInsertRowid);
    res.status(201).json({ user: { id: Number(result.lastInsertRowid), email: email.toLowerCase(), displayName: name } });
  } catch {
    res.status(409).json({ error: "An account with that email already exists." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").toLowerCase());
  if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash))) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  req.session.userId = user.id;
  res.json({ user: safeUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("elsewhere.sid", { httpOnly: true, sameSite: "lax" });
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(req.session.userId);
  res.json({ user: user ? safeUser(user) : null });
});

app.get("/api/stories", requireAuth, (req, res) => {
  const stories = db.prepare("SELECT id, title, universe, prompt, content, created_at AS createdAt FROM stories WHERE user_id = ? ORDER BY id DESC LIMIT 100").all(req.session.userId);
  res.json({ stories });
});

app.post("/api/stories", requireAuth, (req, res) => {
  const { title, universe, prompt, content } = req.body || {};
  if (![title, universe, prompt, content].every(v => typeof v === "string" && v.trim()) || content.length > 50000) {
    return res.status(400).json({ error: "Story data is incomplete or too long." });
  }
  const result = db.prepare("INSERT INTO stories (user_id, title, universe, prompt, content) VALUES (?, ?, ?, ?, ?)")
    .run(req.session.userId, title.slice(0, 120), universe.slice(0, 80), prompt.slice(0, 2000), content);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.delete("/api/stories/:id", requireAuth, (req, res) => {
  const result = db.prepare("DELETE FROM stories WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Story not found." });
  res.json({ ok: true });
});

app.post("/api/generate", requireAuth, aiLimiter, async (req, res) => {
  const { universe, premise, tone, perspective, length } = req.body || {};
  if (![universe, premise, tone, perspective].every(v => typeof v === "string" && v.trim())) {
    return res.status(400).json({ error: "Complete the story brief before generating." });
  }
  if (premise.length > 2000) return res.status(400).json({ error: "The premise is too long." });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "AI generation is not configured yet. Add OPENAI_API_KEY to your .env file." });
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.9,
      max_tokens: Math.min(Math.max(Number(length) || 1100, 400), 2200),
      messages: [
        { role: "system", content: "You are ELSEWHERE, an imaginative alternative-history and speculative-fiction co-writer. Create vivid, coherent, original prose. Treat historical settings with care and distinguish fictional divergences from established history. For copyrighted universes, use high-level transformative fan-fiction framing and do not imitate any living author's style. Return a compelling title on the first line, then the story." },
        { role: "user", content: `Universe: ${universe}\nTone: ${tone}\nPoint of view: ${perspective}\nPremise: ${premise}\nWrite an immersive opening chapter.` }
      ]
    });
    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("The model returned an empty story.");
    const lines = content.split("\n").filter(Boolean);
    const title = lines[0].replace(/^#+\s*/, "").replace(/^\*\*(.*)\*\*$/, "$1").slice(0, 120) || "An Elsewhere Story";
    res.json({ title, content });
  } catch (error) {
    console.error("Generation failed:", error.message);
    res.status(502).json({ error: "The story could not be generated right now. Please try again." });
  }
});

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`ELSEWHERE is running at http://localhost:${PORT}`));
