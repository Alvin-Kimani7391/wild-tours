const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// ── POST /api/bookings ─ Create Booking ──────────────────
router.post('/', protect, asyncHandler(async (req, res) => {
  const { tourId, startDate, numberOfTravelers, specialRequests, paymentMethod } = req.body;

  const tour = await Tour.findById(tourId);
  if (!tour || !tour.isActive) {
    return res.status(404).json({ success: false, message: 'Tour not found or unavailable.' });
  }
  if (numberOfTravelers > tour.maxGroupSize) {
    return res.status(400).json({ success: false, message: `Maximum group size for this tour is ${tour.maxGroupSize}.` });
  }

  const pricePerPerson = tour.priceDiscount || tour.price;
  const totalAmount = pricePerPerson * numberOfTravelers;
  const depositPercent = tour.depositPercent || 20;
  const depositAmount = (totalAmount * depositPercent) / 100;

  // Generate bank transfer instructions if needed
  let bankTransferDetails = null;
  if (paymentMethod === 'bank_transfer') {
    bankTransferDetails = {
      bankName: 'Equity Bank Kenya',
      accountName: 'WildRoots Africa Ltd',
      accountNo: '0150263XXXX',
      swiftCode: 'EQBLKENA',
    };
  }

  const booking = await Booking.create({
    user: req.user._id,
    tour: tourId,
    startDate,
    numberOfTravelers,
    pricePerPerson,
    totalAmount,
    depositAmount,
    specialRequests,
    paymentMethod,
    status: 'pending',
    bankTransferDetails: paymentMethod === 'bank_transfer' ? bankTransferDetails : undefined,
  });

  await booking.populate('tour', 'title destination duration coverImage');
  await booking.populate('user', 'firstName lastName email phone');

  // Add booking reference to the response
  const fullBooking = await Booking.findById(booking._id)
    .populate('tour', 'title destination country duration price coverImage')
    .populate('user', 'firstName lastName email phone');

  // Send confirmation email
  try {
    await sendEmail({
      to: req.user.email,
      subject: `✅ Booking Received - ${tour.title} [${fullBooking.bookingRef}]`,
      template: 'bookingConfirmation',
      data: {
        name: req.user.firstName,
        bookingRef: fullBooking.bookingRef,
        tourName: tour.title,
        startDate: new Date(startDate).toDateString(),
        travelers: numberOfTravelers,
        totalAmount,
        depositAmount,
        currency: tour.currency,
        paymentMethod,
        bankDetails: bankTransferDetails,
      }
    });

    // Notify admin
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `🔔 New Booking: ${fullBooking.bookingRef} - ${tour.title}`,
      template: 'adminBookingAlert',
      data: {
        bookingRef: fullBooking.bookingRef,
        customerName: `${req.user.firstName} ${req.user.lastName}`,
        customerEmail: req.user.email,
        tourName: tour.title,
        startDate: new Date(startDate).toDateString(),
        travelers: numberOfTravelers,
        totalAmount,
        paymentMethod,
      }
    });
  } catch (e) { console.error('Booking email failed:', e.message); }

  res.status(201).json({
    success: true,
    message: 'Booking created successfully. Check your email for confirmation.',
    booking: fullBooking,
  });
}));

// ── GET /api/bookings/my ─ User's bookings ────────────────
router.get('/my', protect, asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const query = { user: req.user._id };
  if (status) query.status = status;

  const bookings = await Booking.find(query)
    .populate('tour', 'title destination country duration coverImage')
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Booking.countDocuments(query);

  res.json({ success: true, count: bookings.length, total, bookings });
}));

// ── GET /api/bookings/:id ─ Single booking ────────────────
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('tour', 'title destination country duration coverImage included excluded')
    .populate('user', 'firstName lastName email phone');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  // Only owner or admin can view
  if (booking.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to view this booking.' });
  }

  res.json({ success: true, booking });
}));

// ── POST /api/bookings/:id/upload-proof ─ Bank transfer proof ─
router.post('/:id/upload-proof', protect, upload.single('proof'), asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }

  if (!req.file) return res.status(400).json({ success: false, message: 'Please upload proof of payment.' });

  const result = await uploadToCloudinary(req.file.path, 'wildroots/payment-proofs');

  const paymentRecord = {
    method: 'bank_transfer',
    amount: req.body.amount || booking.depositAmount,
    reference: req.body.reference || '',
    status: 'pending',
    proofOfPayment: { url: result.secure_url, publicId: result.public_id },
    bankName: req.body.bankName || '',
    bankReference: req.body.bankReference || '',
  };

  booking.payments.push(paymentRecord);
  booking.paymentStatus = 'deposit_paid';
  booking.paymentMethod = 'bank_transfer';
  await booking.save();

  // Notify admin
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `💳 Payment Proof Uploaded - ${booking.bookingRef}`,
      template: 'paymentProofAlert',
      data: {
        bookingRef: booking.bookingRef,
        customerName: `${req.user.firstName} ${req.user.lastName}`,
        proofUrl: result.secure_url,
        amount: paymentRecord.amount,
      }
    });
  } catch (e) { /* non-critical */ }

  res.json({ success: true, message: 'Payment proof uploaded. Admin will verify within 24 hours.', booking });
}));

// ── PUT /api/bookings/:id/cancel ─ Cancel booking ─────────
router.put('/:id/cancel', protect, asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate('tour', 'title');
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }
  if (['cancelled', 'completed'].includes(booking.status)) {
    return res.status(400).json({ success: false, message: 'Booking cannot be cancelled.' });
  }

  booking.status = 'cancelled';
  booking.cancellationReason = req.body.reason || 'Customer cancellation';
  booking.cancelledAt = Date.now();
  booking.cancelledBy = req.user._id;
  await booking.save();

  try {
    await sendEmail({
      to: req.user.email,
      subject: `Booking Cancelled - ${booking.bookingRef}`,
      template: 'bookingCancelled',
      data: { name: req.user.firstName, bookingRef: booking.bookingRef, tourName: booking.tour.title }
    });
  } catch (e) { /* non-critical */ }

  res.json({ success: true, message: 'Booking cancelled successfully.', booking });
}));

// ── ADMIN: GET all bookings ───────────────────────────────
router.get('/', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { status, paymentStatus, page = 1, limit = 20, search, tourId } = req.query;
  const query = {};
  if (status) query.status = status;
  if (paymentStatus) query.paymentStatus = paymentStatus;
  if (tourId) query.tour = tourId;

  const bookings = await Booking.find(query)
    .populate('tour', 'title destination country')
    .populate('user', 'firstName lastName email phone')
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Booking.countDocuments(query);

  // Stats
  const stats = await Booking.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } }
  ]);

  res.json({ success: true, count: bookings.length, total, pages: Math.ceil(total / limit), bookings, stats });
}));

// ── ADMIN: Update booking status ─────────────────────────
router.put('/:id/status', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { status, internalNotes, paymentStatus } = req.body;
  const booking = await Booking.findById(req.params.id)
    .populate('tour', 'title')
    .populate('user', 'firstName lastName email');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  const prevStatus = booking.status;
  booking.status = status || booking.status;
  if (paymentStatus) booking.paymentStatus = paymentStatus;
  if (internalNotes) booking.internalNotes = internalNotes;
  await booking.save();

  // Email if status changed
  if (status && status !== prevStatus) {
    try {
      await sendEmail({
        to: booking.user.email,
        subject: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)} - ${booking.bookingRef}`,
        template: 'bookingStatusUpdate',
        data: {
          name: booking.user.firstName,
          bookingRef: booking.bookingRef,
          tourName: booking.tour.title,
          status, notes: internalNotes
        }
      });
    } catch (e) { /* non-critical */ }
  }

  res.json({ success: true, message: `Booking ${status} successfully.`, booking });
}));

// ── ADMIN: Verify bank transfer ───────────────────────────
router.put('/:id/verify-payment', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('user', 'firstName lastName email')
    .populate('tour', 'title');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  const { paymentIndex, verified, notes } = req.body;
  const payment = booking.payments[paymentIndex || 0];
  if (!payment) return res.status(400).json({ success: false, message: 'Payment record not found.' });

  payment.status = verified ? 'completed' : 'failed';
  if (verified) {
    booking.paymentStatus = payment.amount >= booking.totalAmount ? 'fully_paid' : 'deposit_paid';
    booking.status = 'confirmed';
    booking.bankTransferDetails.verifiedBy = req.user._id;
    booking.bankTransferDetails.verifiedAt = Date.now();
  }
  if (notes) booking.internalNotes = notes;
  await booking.save();

  if (verified) {
    try {
      await sendEmail({
        to: booking.user.email,
        subject: `✅ Payment Confirmed - ${booking.bookingRef}`,
        template: 'paymentConfirmed',
        data: {
          name: booking.user.firstName,
          bookingRef: booking.bookingRef,
          tourName: booking.tour.title,
          amount: payment.amount,
        }
      });
    } catch (e) { /* non-critical */ }
  }

  res.json({ success: true, message: `Payment ${verified ? 'verified and booking confirmed' : 'rejected'}.`, booking });
}));

module.exports = router;