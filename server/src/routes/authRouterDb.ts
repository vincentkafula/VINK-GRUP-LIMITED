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

router.get("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM users WHERE id = $1`, [req.user!.userId]);
  if (!rows.length) { res.status(404).json({ success: false, error: "User not found" }); return; }
  const u = rows[0];
  res.json({ success: true, data: { id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, lastLogin: u.last_login } });
});

router.post("/logout", requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, message: "Logged out" });
});

export default router;
