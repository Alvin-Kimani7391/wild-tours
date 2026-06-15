const mongoose = require('mongoose');

// ── VOLUNTEER PROGRAM ────────────────────────────────────
const VolunteerProgramSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  slug:        { type: String, unique: true },
  description: { type: String, required: true },
  shortDescription: { type: String, maxlength: 280 },

  category: { type: String, enum: ['wildlife', 'education', 'healthcare', 'environment', 'community', 'construction', 'sports'], required: true },
  country:  { type: String, required: true },
  location: { type: String, required: true },
  coordinates: { lat: Number, lng: Number },

  duration: { min: Number, max: Number, unit: { type: String, default: 'weeks' } },
  startDates: [Date],
  ageMin: { type: Number, default: 18 },
  ageMax: { type: Number, default: 65 },

  programFee: { type: Number, required: true },
  feeCoverage: [String], // what the fee includes
  currency: { type: String, default: 'USD' },

  responsibilities: [String],
  requirements:     [String],
  benefits:         [String],
  skills:           [String],

  accommodation: {
  kind:        { type: String },   // 'host-family', 'shared-house', 'bush-camp'
  description: { type: String },
  amenities:   [String],
},

  meals:       { type: String }, // 'full-board', 'half-board', 'self-catering'
  languages:   [String],

  coverImage: { url: String, publicId: String },
  images:     [{ url: String, publicId: String, caption: String }],

  featured:    { type: Boolean, default: false },
  isActive:    { type: Boolean, default: true },
  spotsTotal:  Number,
  spotsLeft:   Number,

  ratingsAverage: { type: Number, default: 4.5 },
  ratingsCount:   { type: Number, default: 0 },
  tags: [String],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

VolunteerProgramSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    const slugify = require('slugify');
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

const VolunteerProgram = mongoose.model('VolunteerProgram', VolunteerProgramSchema);

// ── APPLICATION ──────────────────────────────────────────
const ApplicationSchema = new mongoose.Schema({
  applicationRef: { type: String, unique: true },
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'VolunteerProgram', required: true },

  // Personal details
  personalInfo: {
    firstName: String, lastName: String,
    email: String, phone: String,
    dateOfBirth: Date, nationality: String,
    address: String, city: String, country: String,
  },

  emergencyContact: {
    name: String, relationship: String,
    phone: String, email: String,
  },

  programDetails: {
    startDate:      Date,
    duration:       String,
    preferredAccommodation: String,
  },

  skills:      [String],
  experience:  String,
  motivation:  String,
  languages:   [String],
  medicalConditions: String,
  dietaryRequirements: String,
  hasPassport: Boolean,

  // Documents
  documents: [{
    type:      { type: String, enum: ['passport', 'cv', 'certificate', 'medical', 'other'] },
    name:      String,
    url:       String,
    publicId:  String,
    uploadedAt: { type: Date, default: Date.now },
  }],

  // Status workflow
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'waitlisted', 'withdrawn'],
    default: 'pending'
  },

  // Payments
  paymentStatus: { type: String, enum: ['unpaid', 'deposit_paid', 'fully_paid'], default: 'unpaid' },
  programFeeAmount: Number,
  payments: [{
    method: String, amount: Number, reference: String,
    status: String, paidAt: Date,
    proofOfPayment: { url: String, publicId: String },
  }],

  // Admin
  reviewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt:   Date,
  reviewNotes:  String,
  rejectionReason: String,
  internalNotes: String,

}, { timestamps: true });

ApplicationSchema.pre('save', function(next) {
  if (!this.applicationRef) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    this.applicationRef = `VOL-${timestamp}-${random}`;
  }
  next();
});

ApplicationSchema.index({ user: 1, status: 1 });
ApplicationSchema.index({ program: 1, status: 1 });

const Application = mongoose.model('Application', ApplicationSchema);

module.exports = { VolunteerProgram, Application };