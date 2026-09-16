const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getJwtSecret = () => {
  return process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production_key';
};

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid name (at least 2 characters).',
      });
    }

    // Validate email
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address.',
      });
    }

    // Validate password
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long.',
      });
    }

    // Validate role
    if (!role || typeof role !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Role is required and must be either "customer" or "officer".',
      });
    }

    const normalizedRole = role.trim().toUpperCase();
    if (normalizedRole !== 'CUSTOMER' && normalizedRole !== 'OFFICER') {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be either "customer" or "officer".',
      });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Check database connection and pool
    let pool;
    try {
      pool = db.getDatabasePool();
    } catch (configError) {
      return res.status(503).json({
        success: false,
        error: 'Database configuration unavailable.',
        details: configError.message,
      });
    }

    // Ensure table exists
    if (typeof db.ensureUsersTable === 'function') {
      try {
        await db.ensureUsersTable();
      } catch (tableError) {
        console.warn('Could not ensure users table:', tableError.message);
      }
    }

    // Check if user with this email already exists
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists.',
      });
    }

    // Hash the password with bcryptjs
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user into MySQL users table (supports 'password' or 'password_hash')
    let insertResult;
    try {
      const [result] = await pool.query(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [trimmedName, normalizedEmail, passwordHash, normalizedRole]
      );
      insertResult = result;
    } catch (insertErr) {
      if (insertErr.code === 'ER_BAD_FIELD_ERROR' && insertErr.message.includes('password')) {
        const [result] = await pool.query(
          'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
          [trimmedName, normalizedEmail, passwordHash, normalizedRole]
        );
        insertResult = result;
      } else {
        throw insertErr;
      }
    }

    // Return safe user information without password or password_hash
    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      user: {
        id: insertResult.insertId,
        name: trimmedName,
        email: normalizedEmail,
        role: normalizedRole.toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      error: 'An error occurred during registration.',
      details: error.message,
    });
  }
};

/**
 * Log in an existing user
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    let pool;
    try {
      pool = db.getDatabasePool();
    } catch (configError) {
      return res.status(503).json({
        success: false,
        error: 'Database configuration unavailable.',
        details: configError.message,
      });
    }

    // Ensure table exists
    if (typeof db.ensureUsersTable === 'function') {
      try {
        await db.ensureUsersTable();
      } catch (tableError) {
        console.warn('Could not ensure users table:', tableError.message);
      }
    }

    // Retrieve user by email (supports 'password' or 'password_hash')
    let rows;
    try {
      const [result] = await pool.query(
        'SELECT id, name, email, password, role FROM users WHERE email = ? LIMIT 1',
        [normalizedEmail]
      );
      rows = result;
    } catch (selectErr) {
      if (selectErr.code === 'ER_BAD_FIELD_ERROR' && selectErr.message.includes('password')) {
        const [result] = await pool.query(
          'SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
          [normalizedEmail]
        );
        rows = result;
      } else {
        throw selectErr;
      }
    }

    if (!rows || rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const user = rows[0];

    // Verify password against stored hash
    const storedHash = user.password || user.password_hash;
    const isPasswordValid = await bcrypt.compare(password, storedHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    // Generate JWT token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase(),
      name: user.name,
    };

    const token = jwt.sign(tokenPayload, getJwtSecret(), {
      expiresIn: '24h',
    });

    // Return JWT and safe user information
    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'An error occurred during login.',
      details: error.message,
    });
  }
};

/**
 * Get current authenticated user
 * GET /api/auth/me
 */
const getCurrentUser = async (req, res) => {
  try {
    // req.user is set by authMiddleware
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated.',
      });
    }

    // Try fetching fresh data from MySQL if pool is available
    try {
      const pool = db.getDatabasePool();
      const [rows] = await pool.query(
        'SELECT id, name, email, role, created_at FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      );

      if (rows && rows.length > 0) {
        const user = rows[0];
        return res.json({
          success: true,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.toLowerCase(),
            createdAt: user.created_at,
          },
        });
      }
    } catch {
      // If DB is temporarily unavailable, fall back to safe token payload
    }

    return res.json({
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role.toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve user information.',
    });
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
};
