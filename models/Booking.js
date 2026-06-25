const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  // Reference
  bookingRef: { type: String, unique: true },
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tour:        { type: mongoose.Schema.Types.ObjectId, ref: 'Tour', required: true },

  // Details
  startDate:         { type: Date, required: true },
  numberOfTravelers: { type: Number, required: true, min: 1 },
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
  pricePerPerson: { type: Number, required: true },
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
    paidAt:    Date,
    receipt:   String,
    receiptPath: String,   // ← local file path for bank transfer uploads

    // Bank transfer specifics
    bankName:       String,
    bankReference:  String,
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

// ── Auto-generate booking reference ──────────────────────
BookingSchema.pre('save', function(next) {
  if (!this.bookingRef) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random    = Math.random().toString(36).substr(2, 4).toUpperCase();
    this.bookingRef = `WR-${timestamp}-${random}`;
  }
  next();
});

// ── Indexes ───────────────────────────────────────────────
BookingSchema.index({ user: 1, status: 1 });
BookingSchema.index({ tour: 1, startDate: 1 });
BookingSchema.index({ bookingRef: 1 });
BookingSchema.index({ 'payments.reference': 1 }); // speeds up M-Pesa/PayPal callback lookups

module.exports = mongoose.model('Booking', BookingSchema);