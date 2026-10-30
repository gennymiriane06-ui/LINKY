import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';

function createToken(user) {
  return jwt.sign(
    { email: user.email },
    env.JWT_SECRET,
    {
      subject: String(user.id),
      expiresIn: env.JWT_EXPIRES_IN,
    }
  );
}

export async function registerUser(email, password) {
  const passwordHash = await bcrypt.hash(password, 12);

  let result;

  try {
    result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email.toLowerCase(), passwordHash]
    );
  } catch (error) {
    if (error.code === '23505') {
      const duplicateError = new Error('An account with this email already exists.');
      duplicateError.code = 'EMAIL_EXISTS';
      throw duplicateError;
    }

    throw error;
  }

  const user = result.rows[0];

  return {
    user,
    token: createToken(user),
  };
}

export async function loginUser(email, password) {
  const result = await pool.query(
    `SELECT id, email, password_hash, created_at
     FROM users
     WHERE email = $1`,
    [email.toLowerCase()]
  );

  const user = result.rows[0];

  if (!user) {
    const error = new Error('Invalid email or password.');
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    const error = new Error('Invalid email or password.');
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  const safeUser = {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
  };

  return {
    user: safeUser,
    token: createToken(safeUser),
  };
}
