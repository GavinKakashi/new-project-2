import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import type { DB } from "../db.js";
import { hashPassword, requireAuth, signToken, verifyPassword } from "../auth.js";
import { HttpError, parse } from "../lib.js";
import { newId } from "../repo.js";

const Credentials = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
const Register = Credentials.extend({ name: z.string().min(1).max(80) });

const publicUser = (u: { id: string; email: string; name: string; created_at: string }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.created_at,
});

export function authRoutes(db: DB) {
  const r = Router();

  r.get("/status", (_req, res) => {
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    res.json({ hasUsers: n > 0, signupOpen: n === 0 || config.allowSignup });
  });

  r.post("/register", async (req, res) => {
    const body = parse(Register, req.body);
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    if (n > 0 && !config.allowSignup) throw new HttpError(403, "Sign-up is closed on this server. Ask the owner to set ALLOW_SIGNUP=true.");
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(body.email)) throw new HttpError(409, "That email is already registered");
    const id = newId();
    db.prepare("INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)").run(id, body.email, body.name, await hashPassword(body.password));
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    res.status(201).json({ token: signToken(id), user: publicUser(user) });
  });

  r.post("/login", async (req, res) => {
    const body = parse(Credentials, req.body);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(body.email) as any;
    if (!user || !(await verifyPassword(body.password, user.password_hash))) throw new HttpError(401, "Wrong email or password");
    res.json({ token: signToken(user.id), user: publicUser(user) });
  });

  r.get("/me", requireAuth, (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId) as any;
    if (!user) throw new HttpError(401, "Account no longer exists");
    res.json({ user: publicUser(user) });
  });

  return r;
}
