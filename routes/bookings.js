const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { sendEmail, emails } = require('../utils/emailService');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// ── POST /api/bookings ─ Create Booking ──────────────────
router.post('/', protect, asyncHandler(async (req, res) => {
  const { tourId, startDate, numberOfTravelers, specialRequests, paymentMethod, travelers } = req.body;

  const tour = await Tour.findById(tourId);
  if (!tour || !tour.isActive) {
    return res.status(404).json({ success: false, message: 'Tour not found or unavailable.' });
  }
  if (numberOfTravelers > tour.maxGroupSize) {
    return res.status(400).json({ success: false, message: `Maximum group size for this tour is ${tour.maxGroupSize}.` });
  }

  const pricePerPerson  = tour.priceDiscount || tour.price;
  const totalAmount     = pricePerPerson * numberOfTravelers;
  const depositPercent  = tour.depositPercent || 20;
  const depositAmount   = (totalAmount * depositPercent) / 100;

  const booking = await Booking.create({
    user: req.user._id,
    tour: tourId,
    startDate,
    numberOfTravelers,
    travelers: travelers || [],
    pricePerPerson,
    totalAmount,
    depositAmount,
    specialRequests,
    paymentMethod,
    status: 'pending',
    bankTransferDetails: paymentMethod === 'bank_transfer' ? {
      bankName:    'Equity Bank Kenya',
      accountName: 'WildRoots Africa Ltd',
      accountNo:   '0150263XXXX',
      swiftCode:   'EQBLKENA',
    } : undefined,
  });

  const fullBooking = await Booking.findById(booking._id)
    .populate('tour', 'title destination country duration price coverImage')
    .populate('user', 'firstName lastName email phone');

  // ── Emails ───────────────────────────────────────────────
  try {
    const userEmail  = emails.bookingUser(fullBooking, req.user);
    await sendEmail({ to: req.user.email, subject: userEmail.subject, html: userEmail.html });

    const adminEmail = emails.bookingAdmin(fullBooking, req.user);
    await sendEmail({ to: process.env.ADMIN_EMAIL, subject: adminEmail.subject, html: adminEmail.html });
  } catch (err) {
    console.error('Booking email failed:', err.message);
  }

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
    .populate('tour', 'title destination country duration coverImage included excluded price')
    .populate('user', 'firstName lastName email phone');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  if (booking.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to view this booking.' });
  }

  // Build paymentSummary so frontend gets receiptUrl directly
  const paymentSummary = booking.payments.map((p, index) => ({
    index,
    method:          p.method,
    amount:          p.amount,
    currency:        p.currency,
    reference:       p.reference,
    status:          p.status,
    paidAt:          p.paidAt,
    bankName:        p.bankName,
    bankReference:   p.bankReference,
    receiptUrl:      p.proofOfPayment?.url    || null,
    receiptPublicId: p.proofOfPayment?.publicId || null,
  }));

  res.json({ success: true, booking, paymentSummary });
}));

// ── POST /api/bookings/:id/upload-proof ──────────────────
router.post('/:id/upload-proof', protect, upload.single('proof'), asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('user', 'firstName lastName email')
    .populate('tour', 'title');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.user._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }
  if (!req.file) return res.status(400).json({ success: false, message: 'Please upload proof of payment.' });

  const result = await uploadToCloudinary(req.file.path, 'wildroots/payment-proofs');
  const amount = req.body.amount || booking.depositAmount;

  booking.payments.push({
    method:    'bank_transfer',
    amount,
    reference: req.body.reference || '',
    status:    'pending_verification',
    proofOfPayment: { url: result.secure_url, publicId: result.public_id },
    bankName:      req.body.bankName || '',
    bankReference: req.body.bankReference || '',
  });
  booking.paymentStatus = 'pending_verification';
  booking.paymentMethod = 'bank_transfer';
  await booking.save();

  // ── Emails ───────────────────────────────────────────────
  try {
    const adminEmail = emails.bankReceiptAdminAlert(booking, booking.user, amount, result.secure_url);
    await sendEmail({ to: process.env.ADMIN_EMAIL, subject: adminEmail.subject, html: adminEmail.html });

    const userEmail = emails.bankReceiptReceived(booking, booking.user, amount);
    await sendEmail({ to: booking.user.email, subject: userEmail.subject, html: userEmail.html });
  } catch (e) {
    console.error('Upload proof email error:', e.message);
  }

  res.json({ success: true, message: 'Payment proof uploaded. Admin will verify within 24 hours.', booking });
}));

// ── PUT /api/bookings/:id/cancel ──────────────────────────
router.put('/:id/cancel', protect, asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('tour', 'title')
    .populate('user', 'firstName lastName email');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }
  if (['cancelled', 'completed'].includes(booking.status)) {
    return res.status(400).json({ success: false, message: 'Booking cannot be cancelled.' });
  }

  booking.status             = 'cancelled';
  booking.cancellationReason = req.body.reason || 'Customer cancellation';
  booking.cancelledAt        = Date.now();
  booking.cancelledBy        = req.user._id;
  await booking.save();

  // ── Email ─────────────────────────────────────────────────
  // emailService doesn't have a dedicated cancellation template yet,
  // so we send a minimal branded email directly until one is added.
  try {
    await sendEmail({
      to: booking.user.email,
      subject: `Booking Cancelled — ${booking.bookingRef}`,
      html: `
        <p>Hi ${booking.user.firstName},</p>
        <p>Your booking <strong>${booking.bookingRef}</strong> for
        <strong>${booking.tour.title}</strong> has been cancelled.</p>
        <p>Reason: ${booking.cancellationReason}</p>
        <p>If this was a mistake, please contact us.</p>
      `
    });
  } catch (e) {
    console.error('Cancel email error:', e.message);
  }

  res.json({ success: true, message: 'Booking cancelled successfully.', booking });
}));

// ── ADMIN: GET all bookings ───────────────────────────────
router.get('/', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { status, paymentStatus, page = 1, limit = 20, tourId } = req.query;
  const query = {};
  if (status)        query.status        = status;
  if (paymentStatus) query.paymentStatus = paymentStatus;
  if (tourId)        query.tour          = tourId;

  const bookings = await Booking.find(query)
    .populate('tour', 'title destination country')
    .populate('user', 'firstName lastName email phone')
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Booking.countDocuments(query);

  const stats = await Booking.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } }
  ]);

  res.json({ success: true, count: bookings.length, total, pages: Math.ceil(total / limit), bookings, stats });
}));

// ── ADMIN: Update booking status ──────────────────────────
router.put('/:id/status', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { status, internalNotes, paymentStatus } = req.body;

  const booking = await Booking.findById(req.params.id)
    .populate('tour', 'title')
    .populate('user', 'firstName lastName email');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  const prevStatus  = booking.status;
  booking.status    = status || booking.status;
  if (paymentStatus)  booking.paymentStatus = paymentStatus;
  if (internalNotes)  booking.internalNotes = internalNotes;
  await booking.save();

  // ── Email on status change ────────────────────────────────
  if (status && status !== prevStatus) {
    try {
      // Use paymentConfirmed template when admin marks as confirmed + paid
      if (status === 'confirmed' && paymentStatus === 'deposit_paid' || paymentStatus === 'fully_paid') {
        const lastPayment = booking.payments[booking.payments.length - 1];
        const emailData = emails.paymentConfirmed(booking, booking.user, lastPayment?.amount || booking.depositAmount);
        await sendEmail({ to: booking.user.email, subject: emailData.subject, html: emailData.html });
      } else {
        // Generic status update — send plain email until a dedicated template is added
        await sendEmail({
          to: booking.user.email,
          subject: `Booking Update — ${booking.bookingRef}`,
          html: `
            <p>Hi ${booking.user.firstName},</p>
            <p>Your booking <strong>${booking.bookingRef}</strong> status is now:
            <strong>${status}</strong>.</p>
            <p>Tour: ${booking.tour.title}</p>
            ${internalNotes ? `<p>Note from us: ${internalNotes}</p>` : ''}
          `
        });
      }
    } catch (e) {
      console.error('Status update email error:', e.message);
    }
  }

  res.json({ success: true, message: `Booking updated successfully.`, booking });
}));

// ── ADMIN: Verify bank transfer payment ───────────────────
// ── PATCH /api/admin/bookings/:id/verify-payment ──────────
// ── ADMIN: Verify bank transfer payment ───────────────────
router.patch('/:id/verify-payment', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { approved } = req.body;

  const booking = await Booking.findById(req.params.id)
    .populate('user', 'firstName email')
    .populate('tour', 'title');

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found.' });
  }

  const payment = booking.payments.find(p => p.status === 'pending_verification');
  if (!payment) {
    return res.status(400).json({ success: false, message: 'No pending payment found.' });
  }

  if (approved) {
    payment.status = 'completed';
    booking.paymentStatus = payment.amount >= booking.totalAmount ? 'fully_paid' : 'deposit_paid';
    booking.status = 'confirmed';
  } else {
    payment.status = 'failed';
    booking.paymentStatus = 'unpaid';
  }

  await booking.save(); // ← always runs first

  try {
    const emailData = approved
      ? emails.paymentConfirmed(booking, booking.user, payment.amount)
      : emails.paymentRejected(booking, booking.user);
    await sendEmail({ to: booking.user.email, subject: emailData.subject, html: emailData.html });
  } catch (e) {
    console.error('Verification email failed:', e.message);
    // don't return 500 — booking is already saved
  }

  res.json({ success: true, booking });
}));

module.exports = router;