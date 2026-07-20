const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  // Reference
  bookingRef: { type: String, unique: true },
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ── Polymorphic booking type ──────────────────────────────
  // 'tour'          -> booking.tour is set, uses startDate/numberOfTravelers
  // 'accommodation' -> booking.accommodation is set, uses checkInDate/checkOutDate
  bookingType: {
    type: String,
    enum: ['tour', 'accommodation'],
    required: true,
    default: 'tour',
    index: true
  },
  tour:          { type: mongoose.Schema.Types.ObjectId, ref: 'Tour' },
  accommodation: { type: mongoose.Schema.Types.ObjectId, ref: 'Accommodation' },

  // ── Tour-style details ─────────────────────────────────────
  startDate:         Date, // tour departure date
  numberOfTravelers: { type: Number, min: 1 },

  // ── Accommodation-style details ────────────────────────────
  checkInDate:    Date,
  checkOutDate:   Date,
  numberOfGuests: { type: Number, min: 1 },
  numberOfNights: Number, // derived from checkIn/checkOut, stored for convenience

  // Shared guest/traveler list (used by both booking types)
  travelers: [{
    firstName:      String,
    lastName:       String,
    email:          String,
    phone:          String,
    passportNumber: String,
    nationality:    String,
    dateOfBirth:    Date
  }],

  // Pricing
  pricePerPerson: Number, // tour bookings
  pricePerNight:  Number, // accommodation bookings
  totalAmount:    { type: Number, required: true },
  depositAmount:  { type: Number, required: true },
  currency:       { type: String, default: 'USD' },

  // Booking status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'refunded'],
    default: 'pending'
  },

  // Payment overview
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'deposit_paid', 'fully_paid', 'refunded', 'pending_verification'],
    default: 'unpaid'
  },
  paymentMethod: {
    type: String,
    enum: ['paypal', 'mpesa', 'bank_transfer', 'stripe']
  },

  // Individual payment records
  payments: [{
    method:    String,
    amount:    Number,
    currency:  String,
    reference: String,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'pending_verification'],
      default: 'pending'
    },
    paidAt:      Date,
    receipt:     String,
    receiptPath: String,   // ← local file path for bank transfer uploads

    // Bank transfer specifics
    bankName:      String,
    bankReference: String,
    proofOfPayment: { url: String, publicId: String },
  }],

  // Bank transfer manual verification block
  bankTransferDetails: {
    bankName:    String,
    accountName: String,
    accountNo:   String,
    reference:   String,
    proofUrl:    String,
    verifiedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt:  Date,
  },

  // Notes & cancellation
  specialRequests:    String,
  internalNotes:      String,
  cancellationReason: String,
  cancelledAt:        Date,
  cancelledBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  confirmationSentAt: Date,
  reminderSentAt:     Date,

}, { timestamps: true });

// ── Auto-generate booking reference ──────────────────────────
BookingSchema.pre('save', function (next) {
  if (!this.bookingRef) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random    = Math.random().toString(36).substr(2, 4).toUpperCase();
    const prefix    = this.bookingType === 'accommodation' ? 'WR-ACC' : 'WR';
    this.bookingRef = `${prefix}-${timestamp}-${random}`;
  }
  next();
});

// ── Require the right fields for each booking type ────────────
BookingSchema.pre('validate', function (next) {
  if (this.bookingType === 'tour') {
    if (!this.tour) return next(new Error('tour is required for a tour booking.'));
    if (!this.startDate) return next(new Error('startDate is required for a tour booking.'));
    if (!this.numberOfTravelers) return next(new Error('numberOfTravelers is required for a tour booking.'));
  }

  if (this.bookingType === 'accommodation') {
    if (!this.accommodation) return next(new Error('accommodation is required for an accommodation booking.'));
    if (!this.checkInDate || !this.checkOutDate) {
      return next(new Error('checkInDate and checkOutDate are required for an accommodation booking.'));
    }
    if (this.checkOutDate <= this.checkInDate) {
      return next(new Error('checkOutDate must be after checkInDate.'));
    }
    if (!this.numberOfNights) {
      const msPerNight = 1000 * 60 * 60 * 24;
      this.numberOfNights = Math.ceil((this.checkOutDate - this.checkInDate) / msPerNight);
    }
  }

  next();
});

// ── Indexes ─────────────────────────────────────────────────
BookingSchema.index({ user: 1, status: 1 });
BookingSchema.index({ tour: 1, startDate: 1 });
BookingSchema.index({ accommodation: 1, checkInDate: 1, checkOutDate: 1 });
BookingSchema.index({ bookingRef: 1 });
BookingSchema.index({ 'payments.reference': 1 }); // speeds up M-Pesa/PayPal callback lookups

module.exports = mongoose.model('Booking', BookingSchema);
