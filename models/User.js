const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: [true, 'First name is required'], trim: true, maxlength: 50 },
  lastName:  { type: String, required: [true, 'Last name is required'],  trim: true, maxlength: 50 },
  email:     { type: String, required: [true, 'Email is required'], unique: true, lowercase: true,
               match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'] },
  password:  { type: String, minlength: 8, select: false },
  phone:     { type: String, trim: true },
  nationality: { type: String, trim: true },
  avatar:    { type: String, default: '' },
  role:      { type: String, enum: ['user', 'admin', 'staff'], default: 'user' },

  // OAuth
  googleId:  { type: String },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },

  // Status
  isVerified:  { type: Boolean, default: false },
  isActive:    { type: Boolean, default: true },
  isSuspended: { type: Boolean, default: false },

  // Email verification
  emailVerificationToken:   String,
  emailVerificationExpire:  Date,

  // Password reset
  resetPasswordToken:  String,
  resetPasswordExpire: Date,

  // Notifications
  notifications: [{
    type:      { type: String, enum: ['booking', 'application', 'payment', 'general'] },
    message:   String,
    isRead:    { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],

  newsletterSubscribed: { type: Boolean, default: true },
  lastLogin: Date,
}, { timestamps: true });

// Virtual: full name
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Hash password before save
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match password
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT
UserSchema.methods.getSignedJwt = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Generate email verification token
UserSchema.methods.getEmailVerificationToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Generate password reset token
UserSchema.methods.getResetPasswordToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes
  return token;
};

module.exports = mongoose.model('User', UserSchema);