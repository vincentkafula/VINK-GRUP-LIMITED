import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "../data/store.js";
import { JWT_SECRET, JWT_EXPIRES, requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ success: false, error: "username and password required" });
    return;
  }
  const user = db.users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ success: false, error: "Invalid credentials" });
    return;
  }
  user.lastLogin = new Date().toISOString();
  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role },
  });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req: Request, res: Response): void => {
  const user = db.users.find(u => u.id === req.user!.userId);
  if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }
  res.json({ success: true, data: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, lastLogin: user.lastLogin } });
});

// POST /api/auth/logout  (stateless JWT — client discards token)
router.post("/logout", requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, message: "Logged out" });
});

export default router;
