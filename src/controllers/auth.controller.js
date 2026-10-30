import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import { registerUser, loginUser } from '../services/auth.service.js';

export async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid registration data',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const result = await registerUser(
      parsed.data.email,
      parsed.data.password
    );

    return res.status(201).json(result);
  } catch (error) {
    if (error.code === 'EMAIL_EXISTS') {
      return res.status(409).json({ error: error.message });
    }

    console.error('Registration failed:', error.message);
    return res.status(500).json({ error: 'Unable to register account' });
  }
}

export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid login data',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const result = await loginUser(
      parsed.data.email,
      parsed.data.password
    );

    return res.status(200).json(result);
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.error('Login failed:', error.message);
    return res.status(500).json({ error: 'Unable to log in' });
  }
}
