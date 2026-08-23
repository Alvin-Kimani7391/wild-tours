const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const Accommodation = require('../models/Accommodation');
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { sendEmail, emails } = require('../utils/emailService');
const { receiptUpload } = require('../config/cloudinary');

const POPULATE_TOUR = 'title destination country duration price coverImage';
const POPULATE_ACCOMMODATION = 'name slug category location pricePerNight priceType currency media.images';

// ── Helper: check accommodation availability ──────────────
// Two date ranges overlap when existingStart < newEnd AND existingEnd > newStart.
async function isAccommodationAvailable(accommodationId, checkInDate, checkOutDate, excludeBookingId = null) {
  const query = {
    bookingType: 'accommodation',
    accommodation: accommodationId,
    status: { $nin: ['cancelled'] },
    checkInDate: { $lt: checkOutDate },
    checkOutDate: { $gt: checkInDate },
  };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };

  const clash = await Booking.findOne(query);
  return !clash;
}

// ── Helper: wrap a multer middleware so its errors (bad file type,
// file too large, etc.) come back as clean JSON instead of crashing
// through Express's default HTML error handler. ───────────────────
function handleUpload(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large. Maximum size is 5MB.'
          : (err.message || 'File upload failed.');
        return res.status(400).json({ success: false, message });
      }
      next();
    });
  };
}

// ── POST /api/bookings ─ Create Booking (tour or accommodation) ──
router.post('/', protect, asyncHandler(async (req, res) => {
  const { bookingType = 'tour' } = req.body;

  if (bookingType === 'accommodation') {
    return createAccommodationBooking(req, res);
  }
  return createTourBooking(req, res);
}));

async function createTourBooking(req, res) {
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
    bookingType: 'tour',
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
    .populate('tour', POPULATE_TOUR)
    .populate('user', 'firstName lastName email phone');

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
}

async function createAccommodationBooking(req, res) {
  const {
    accommodationId, checkInDate, checkOutDate, numberOfGuests,
    specialRequests, paymentMethod, travelers
  } = req.body;

  const accommodation = await Accommodation.findById(accommodationId);
  if (!accommodation || !accommodation.isActive) {
    return res.status(404).json({ success: false, message: 'Accommodation not found or unavailable.' });
  }

  const checkIn  = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  if (isNaN(checkIn) || isNaN(checkOut) || checkOut <= checkIn) {
    return res.status(400).json({ success: false, message: 'Please provide a valid checkInDate and checkOutDate.' });
  }
  if (numberOfGuests > accommodation.capacity.maxGuests) {
    return res.status(400).json({ success: false, message: `This accommodation sleeps a maximum of ${accommodation.capacity.maxGuests} guests.` });
  }

  const available = await isAccommodationAvailable(accommodationId, checkIn, checkOut);
  if (!available) {
    return res.status(409).json({ success: false, message: 'This accommodation is already booked for part or all of the selected dates.' });
  }

  const msPerNight     = 1000 * 60 * 60 * 24;
  const numberOfNights = Math.ceil((checkOut - checkIn) / msPerNight);

  // per_person pricing multiplies by guests as well as nights; per_night/per_tent just by nights.
  const totalAmount = accommodation.priceType === 'per_person'
    ? accommodation.pricePerNight * numberOfGuests * numberOfNights
    : accommodation.pricePerNight * numberOfNights;

  const depositPercent = 20; // accommodations don't carry their own depositPercent field yet
  const depositAmount  = (totalAmount * depositPercent) / 100;

  const booking = await Booking.create({
    bookingType: 'accommodation',
    user: req.user._id,
    accommodation: accommodationId,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    numberOfNights,
    numberOfGuests,
    travelers: travelers || [],
    pricePerNight: accommodation.pricePerNight,
    totalAmount,
    depositAmount,
    currency: accommodation.currency,
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
    .populate('accommodation', POPULATE_ACCOMMODATION)
    .populate('user', 'firstName lastName email phone');

  // emailService doesn't have accommodation-specific templates yet, so we send
  // a minimal branded email directly until dedicated ones are added.
  try {
    await sendEmail({
      to: req.user.email,
      subject: `Booking Received — ${fullBooking.bookingRef}`,
      html: `
        <p>Hi ${req.user.firstName},</p>
        <p>We've received your booking request <strong>${fullBooking.bookingRef}</strong>
        for <strong>${accommodation.name}</strong>.</p>
        <p>Check-in: ${checkIn.toDateString()}<br/>
        Check-out: ${checkOut.toDateString()} (${numberOfNights} night${numberOfNights > 1 ? 's' : ''})</p>
        <p>Total: ${accommodation.currency} ${totalAmount.toFixed(2)} — deposit due: ${accommodation.currency} ${depositAmount.toFixed(2)}</p>
        <p>We'll confirm availability and payment instructions shortly.</p>
      `
    });
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `New Accommodation Booking — ${fullBooking.bookingRef}`,
      html: `
        <p>${req.user.firstName} ${req.user.lastName} (${req.user.email}) booked
        <strong>${accommodation.name}</strong>.</p>
        <p>${checkIn.toDateString()} → ${checkOut.toDateString()} · ${numberOfGuests} guest(s)</p>
      `
    });
  } catch (err) {
    console.error('Accommodation booking email failed:', err.message);
  }

  res.status(201).json({
    success: true,
    message: 'Booking created successfully. Check your email for confirmation.',
    booking: fullBooking,
  });
}

// ── GET /api/bookings/my ─ User's bookings ────────────────
router.get('/my', protect, asyncHandler(async (req, res) => {
  const { status, bookingType, page = 1, limit = 10 } = req.query;
  const query = { user: req.user._id };
  if (status) query.status = status;
  if (bookingType) query.bookingType = bookingType;

  const bookings = await Booking.find(query)
    .populate('tour', 'title destination country duration coverImage')
    .populate('accommodation', 'name slug category location pricePerNight currency media.images')
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
    .populate('accommodation', 'name slug category location pricePerNight priceType currency media.images policies')
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
// Accepts JPG/PNG/WEBP images or PDF receipts via the dedicated
// receiptUpload config (see config/cloudinary.js), which streams the
// file straight to Cloudinary — so by the time this handler runs,
// req.file.path is already the secure_url and req.file.filename is
// already the public_id. No second upload call is needed.
router.post('/:id/upload-proof', protect, handleUpload(receiptUpload.single('proof')), asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('user', 'firstName lastName email')
    .populate('tour', 'title')
    .populate('accommodation', 'name');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.user._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }
  if (!req.file) return res.status(400).json({ success: false, message: 'Please upload proof of payment.' });

  const amount = req.body.amount || booking.depositAmount;

  booking.payments.push({
    method:    'bank_transfer',
    amount,
    reference: req.body.reference || '',
    status:    'pending_verification',
    proofOfPayment: { url: req.file.path, publicId: req.file.filename },
    bankName:      req.body.bankName || '',
    bankReference: req.body.bankReference || '',
  });
  booking.paymentStatus = 'pending_verification';
  booking.paymentMethod = 'bank_transfer';
  await booking.save();

  try {
    const adminEmail = emails.bankReceiptAdminAlert(booking, booking.user, amount, req.file.path);
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
    .populate('accommodation', 'name')
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

  const itemName = booking.bookingType === 'accommodation' ? booking.accommodation.name : booking.tour.title;

  try {
    await sendEmail({
      to: booking.user.email,
      subject: `Booking Cancelled — ${booking.bookingRef}`,
      html: `
        <p>Hi ${booking.user.firstName},</p>
        <p>Your booking <strong>${booking.bookingRef}</strong> for
        <strong>${itemName}</strong> has been cancelled.</p>
        <p>Reason: ${booking.cancellationReason}</p>
        <p>If this was a mistake, please contact us.</p>
      `
    });
  } catch (e) {
    console.error('Cancel email error:', e.message);
  }

  res.json({ success: true, message: 'Booking cancelled successfully.', booking });
}));

// ── ADMIN: GET all bookings (tours + accommodations) ──────
router.get('/', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { status, paymentStatus, page = 1, limit = 20, tourId, accommodationId, bookingType } = req.query;
  const query = {};
  if (status)          query.status        = status;
  if (paymentStatus)   query.paymentStatus = paymentStatus;
  if (tourId)          query.tour          = tourId;
  if (accommodationId) query.accommodation = accommodationId;
  if (bookingType)      query.bookingType  = bookingType; // 'tour' | 'accommodation'

  const bookings = await Booking.find(query)
    .populate('tour', 'title destination country')
    .populate('accommodation', 'name slug category location pricePerNight currency')
    .populate('user', 'firstName lastName email phone')
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Booking.countDocuments(query);

  const stats = await Booking.aggregate([
    { $group: { _id: { status: '$status', bookingType: '$bookingType' }, count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } }
  ]);

  res.json({ success: true, count: bookings.length, total, pages: Math.ceil(total / limit), bookings, stats });
}));

// ── ADMIN: Update booking status ──────────────────────────
router.put('/:id/status', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { status, internalNotes, paymentStatus } = req.body;

  const booking = await Booking.findById(req.params.id)
    .populate('tour', 'title')
    .populate('accommodation', 'name')
    .populate('user', 'firstName lastName email');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  const prevStatus  = booking.status;
  booking.status    = status || booking.status;
  if (paymentStatus)  booking.paymentStatus = paymentStatus;
  if (internalNotes)  booking.internalNotes = internalNotes;
  await booking.save();

  const itemName = booking.bookingType === 'accommodation' ? booking.accommodation.name : booking.tour.title;

  if (status && status !== prevStatus) {
    try {
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
            <p>${booking.bookingType === 'accommodation' ? 'Accommodation' : 'Tour'}: ${itemName}</p>
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
router.patch('/:id/verify-payment', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { approved } = req.body;

  const booking = await Booking.findById(req.params.id)
    .populate('user', 'firstName email')
    .populate('tour', 'title')
    .populate('accommodation', 'name');

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
