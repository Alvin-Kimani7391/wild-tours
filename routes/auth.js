const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, asyncHandler, AppError } = require('../middleware/auth');
const { sendEmail, emails } = require('../utils/emailService');

// Helper: send token response
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwt();
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      isVerified: user.isVerified,
    }
  });
};

// ── POST /api/auth/register ──────────────────────────────
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/\d/).withMessage('Password must contain at least one number'),
  body('phone').optional().trim(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  const { firstName, lastName, email, password, phone, nationality } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
  }

  const user = await User.create({
  firstName,
  lastName,
  email,
  password,
  phone,
  nationality
});

// 🌿 Send welcome email (MODERN SYSTEM)
try {
  const emailData = emails.welcome(user);

  await sendEmail({
    to: user.email,
    subject: emailData.subject,
    html: emailData.html
  });

} catch (e) {
  console.error('Welcome email failed:', e.message);
}

  sendTokenResponse(user, 201, res);
}));

// ── POST /api/auth/login ─────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  if (user.isSuspended) {
    return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
  }

  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });

  sendTokenResponse(user, 200, res);
}));

// ── GET /api/auth/me ─────────────────────────────────────
router.get('/me', protect, asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
}));

// ── POST /api/auth/forgot-password ──────────────────────
router.post(
  '/forgot-password',
  [
    body('email').isEmail().normalizeEmail()
  ],
  asyncHandler(async (req, res) => {

    const user = await User.findOne({ email: req.body.email });

    // NEVER reveal if user exists
    if (!user) {
      return res.json({
        success: true,
        message: 'If that email exists, a reset link has been sent.'
      });
    }

    // 1. Generate reset token
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    // 2. Create reset URL
    const resetUrl = `${process.env.CLIENT_URL}/reset-password.html?token=${resetToken}`;

    try {

      // 3. SEND MODERN EMAIL (YOUR EMAIL SERVICE)
      const { sendEmail, emails } = require('../utils/emailService');

      const emailData = emails.passwordReset(user, resetUrl);

      await sendEmail({
        to: user.email,
        subject: emailData.subject,
        html: emailData.html
      });

      return res.json({
        success: true,
        message: 'If that email exists, a reset link has been sent.'
      });

    } catch (e) {

      // rollback token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      console.error('Password reset email failed:', e.message);

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent. Try again.'
      });
    }
  })
);

// ── PUT /api/auth/reset-password/:token ─────────────────
router.put('/reset-password/:token', [
  body('password').isLength({ min: 8 }).matches(/\d/)
], asyncHandler(async (req, res) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
}));

// ── PUT /api/auth/update-password ───────────────────────
router.put('/update-password', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.matchPassword(req.body.currentPassword))) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
  }
  user.password = req.body.newPassword;
  await user.save();
  sendTokenResponse(user, 200, res);
}));

// ── GOOGLE OAUTH ─────────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.CLIENT_URL}/login.html?error=oauth_failed` }),
  (req, res) => {
    const token = req.user.getSignedJwt();
    const redirectUrl = req.user.role === 'admin'
      ? `${process.env.CLIENT_URL}/admin/index.html?token=${token}`
      : `${process.env.CLIENT_URL}/index.html?token=${token}`;
    res.redirect(redirectUrl);
  }
);

// ── POST /api/auth/logout ────────────────────────────────
router.post('/logout', protect, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

module.exports = router;