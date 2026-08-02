import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { JWT_SECRET, JWT_EXPIRES, requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ success: false, error: "username and password required" });
    return;
  }
  const { rows } = await pool!.query(`SELECT * FROM users WHERE username = $1`, [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ success: false, error: "Invalid credentials" });
    return;
  }
  await pool!.query(`UPDATE users SET last_login = now() WHERE id = $1`, [user.id]);
  const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({
    success: true, token,
    user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role },
  });
});

// POST /api/auth/register — customer (or, with role:"seller", a seller account)
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const { username, password, name, email, role } = req.body;
  if (!username || !password || !name || !email) {
    res.status(400).json({ success: false, error: "username, password, name and email are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ success: false, error: "password must be at least 8 characters" });
    return;
  }
  const accountRole = role === "seller" ? "seller" : "customer";
  const { rows: existing } = await pool!.query(`SELECT 1 FROM users WHERE username = $1 OR email = $2`, [username, email]);
  if (existing.length) {
    res.status(409).json({ success: false, error: "An account with that username or email already exists" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool!.query(
    `INSERT INTO users (username, password_hash, role, name, email) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [username, passwordHash, accountRole, name, email]
  );
  const user = rows[0];
  const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.status(201).json({
    success: true, token,
    user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role },
  });
});

router.get("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM users WHERE id = $1`, [req.user!.userId]);
  if (!rows.length) { res.status(404).json({ success: false, error: "User not found" }); return; }
  const u = rows[0];
  res.json({ success: true, data: { id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, lastLogin: u.last_login } });
});

router.post("/logout", requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, message: "Logged out" });
});

router.post("/change-password", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) { res.status(400).json({ success: false, error: "currentPassword and newPassword are required" }); return; }
  if (newPassword.length < 8) { res.status(400).json({ success: false, error: "newPassword must be at least 8 characters" }); return; }
  const { rows } = await pool!.query(`SELECT * FROM users WHERE id = $1`, [req.user!.userId]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    res.status(401).json({ success: false, error: "Current password is incorrect" });
    return;
  }
  const newHash = await bcrypt.hash(newPassword, 10);
  await pool!.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, user.id]);
  res.json({ success: true, message: "Password updated" });
});

export default router;
