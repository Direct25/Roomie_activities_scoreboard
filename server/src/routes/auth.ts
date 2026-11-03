import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, parse } from '../lib/http';
import { UPI_ID_PATTERN } from '../lib/prizes';
import { publicUser } from '../lib/views';
import { requireAuth, signToken } from '../middleware/auth';
import { User } from '../models/User';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  email: z.email('Enter a valid email').max(120),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
});

const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required').max(72),
});

authRouter.post('/register', async (req, res) => {
  const { name, email, password } = parse(registerSchema, req.body);

  if (await User.exists({ email: email.toLowerCase() })) {
    throw new HttpError(409, 'An account with that email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash });

  res.status(201).json({ token: signToken(String(user._id)), user: publicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);

  const user = await User.findOne({ email: email.toLowerCase() });
  // Same message for unknown email and wrong password, so emails can't be probed.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Incorrect email or password');
  }

  res.json({ token: signToken(String(user._id)), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

// Optional: lets roommates pay you in one tap. Send an empty string to remove it.
const upiSchema = z.object({
  upiId: z
    .string()
    .trim()
    .max(80)
    .refine((v) => v === '' || UPI_ID_PATTERN.test(v), 'Enter a UPI ID like name@bank'),
});

authRouter.put('/me/upi', requireAuth, async (req, res) => {
  const { upiId } = parse(upiSchema, req.body);
  const user = req.user!;
  user.upiId = upiId;
  await user.save();
  res.json({ user: publicUser(user) });
});
