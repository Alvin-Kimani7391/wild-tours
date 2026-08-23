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

// ── Helper: wrap multer middleware errors as clean JSON ────
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

// ── Helper: load a booking fully populated + confirm ownership ─────
async function loadOwnedBooking(bookingId, reqUser) {
  const booking = await Booking.findById(bookingId)
    .populate('tour', POPULATE_TOUR)
    .populate('accommodation', POPULATE_ACCOMMODATION)
    .populate('user', 'firstName lastName email phone');
  if (!booking) return { error: 404, message: 'Booking not found.' };
  const isOwner = booking.user._id.toString() === reqUser._id.toString();
  const isAdmin = ['admin', 'staff'].includes(reqUser.role);
  if (!isOwner && !isAdmin) return { error: 403, message: 'Not authorized.' };
  return { booking };
}

// ── POST /api/bookings ─ Create Booking (tour or accommodation) ──
router.post('/', protect, asyncHandler(async (req, res) => {
  const { bookingType = 'tour' } = req.body;
  if (bookingType === 'accommodation') return createAccommodationBooking(req, res);
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

  const totalAmount = accommodation.priceType === 'per_person'
    ? accommodation.pricePerNight * numberOfGuests * numberOfNights
    : accommodation.pricePerNight * numberOfNights;

  const depositPercent = 20;
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

  try {
    const userEmail = emails.bookingAccommodationUser(fullBooking, req.user);
    await sendEmail({ to: req.user.email, subject: userEmail.subject, html: userEmail.html });

    const adminEmail = emails.bookingAccommodationAdmin(fullBooking, req.user);
    await sendEmail({ to: process.env.ADMIN_EMAIL, subject: adminEmail.subject, html: adminEmail.html });
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

  if (booking.user._id.toString() !== req.user._id.toString() && !['admin', 'staff'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Not authorized to view this booking.' });
  }

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

// ── POST /api/bookings/:id/email-details ──────────────────
// Replaces the old fake "Download PDF" button — sends a fully
// detailed booking summary straight to the guest's inbox.
router.post('/:id/email-details', protect, asyncHandler(async (req, res) => {
  const result = await loadOwnedBooking(req.params.id, req.user);
  if (result.error) return res.status(result.error).json({ success: false, message: result.message });

  const { booking } = result;
  const tpl = emails.bookingDetails(booking, booking.user);
  const sendResult = await sendEmail({ to: booking.user.email, subject: tpl.subject, html: tpl.html });

  if (sendResult?.error) {
    return res.status(502).json({ success: false, message: 'Could not send email right now. Please try again shortly.' });
  }
  res.json({ success: true, message: `Booking details emailed to ${booking.user.email}.` });
}));

// ── POST /api/bookings/:id/contact-guide ──────────────────
// Tour bookings — message goes to the guide/coordinator inbox,
// guest gets an acknowledgement.
router.post('/:id/contact-guide', protect, asyncHandler(async (req, res) => {
  const result = await loadOwnedBooking(req.params.id, req.user);
  if (result.error) return res.status(result.error).json({ success: false, message: result.message });
  const { booking } = result;

  const message = (req.body?.message || '').trim() ||
    `Hi, I have a question about my upcoming safari (${booking.bookingRef}). Could someone get in touch with me?`;

  const { emails: mails } = require('../utils/emailService');
  const guideEmail = process.env.GUIDE_EMAIL || process.env.ADMIN_EMAIL;

  try {
    const toGuide = emails.contactGuideAdmin(booking, booking.user, message);
    await sendEmail({ to: guideEmail, subject: toGuide.subject, html: toGuide.html });

    const toGuest = emails.contactGuideUser(booking, booking.user);
    await sendEmail({ to: booking.user.email, subject: toGuest.subject, html: toGuest.html });
  } catch (e) {
    console.error('contact-guide email error:', e.message);
    return res.status(502).json({ success: false, message: 'Could not send your message right now.' });
  }

  res.json({ success: true, message: 'Message sent to your guide. Our team will contact you within 24 hours.' });
}));

// ── POST /api/bookings/:id/contact-host ───────────────────
// Accommodation bookings — message goes to the host/admin inbox,
// guest gets an acknowledgement.
router.post('/:id/contact-host', protect, asyncHandler(async (req, res) => {
  const result = await loadOwnedBooking(req.params.id, req.user);
  if (result.error) return res.status(result.error).json({ success: false, message: result.message });
  const { booking } = result;

  const message = (req.body?.message || '').trim() ||
    `Hi, I have a question about my stay booking (${booking.bookingRef}). Could someone get in touch with me?`;

  const hostEmail = process.env.HOST_EMAIL || process.env.ADMIN_EMAIL;

  try {
    const toHost = emails.contactHostAdmin(booking, booking.user, message);
    await sendEmail({ to: hostEmail, subject: toHost.subject, html: toHost.html });

    const toGuest = emails.contactHostUser(booking, booking.user);
    await sendEmail({ to: booking.user.email, subject: toGuest.subject, html: toGuest.html });
  } catch (e) {
    console.error('contact-host email error:', e.message);
    return res.status(502).json({ success: false, message: 'Could not send your message right now.' });
  }

  res.json({ success: true, message: 'Message sent to the host/our team. Expect a reply within 24 hours.' });
}));

// ── POST /api/bookings/:id/upload-proof ──────────────────
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

  try {
    const toGuest = emails.bookingCancelled(booking, booking.user, booking.cancellationReason);
    await sendEmail({ to: booking.user.email, subject: toGuest.subject, html: toGuest.html });

    const toAdmin = emails.bookingCancelledAdmin(booking, booking.user, booking.cancellationReason);
    await sendEmail({ to: process.env.ADMIN_EMAIL, subject: toAdmin.subject, html: toAdmin.html });
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
  if (bookingType)      query.bookingType  = bookingType;

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

  const prevStatus = booking.status;
  booking.status   = status || booking.status;
  if (paymentStatus)  booking.paymentStatus = paymentStatus;
  if (internalNotes)  booking.internalNotes = internalNotes;
  if (status === 'cancelled') {
    booking.cancellationReason = internalNotes || 'Cancelled by admin';
    booking.cancelledAt = Date.now();
    booking.cancelledBy = req.user._id;
  }
  await booking.save();

  if (status && status !== prevStatus) {
    try {
      if (status === 'cancelled') {
        const toGuest = emails.bookingCancelled(booking, booking.user, booking.cancellationReason);
        await sendEmail({ to: booking.user.email, subject: toGuest.subject, html: toGuest.html });
      } else if (status === 'confirmed') {
        const toGuest = emails.bookingConfirmed(booking, booking.user);
        await sendEmail({ to: booking.user.email, subject: toGuest.subject, html: toGuest.html });
      } else if (paymentStatus === 'deposit_paid' || paymentStatus === 'fully_paid') {
        const lastPayment = booking.payments[booking.payments.length - 1];
        const emailData = emails.paymentConfirmed(booking, booking.user, lastPayment?.amount || booking.depositAmount);
        await sendEmail({ to: booking.user.email, subject: emailData.subject, html: emailData.html });
      } else {
        const tpl = emails.emailGuestCustom(
          booking,
          booking.user,
          `Your booking status has been updated to: ${status}.${internalNotes ? ` Note: ${internalNotes}` : ''}`,
          `Booking Update — ${booking.bookingRef}`
        );
        await sendEmail({ to: booking.user.email, subject: tpl.subject, html: tpl.html });
      }
    } catch (e) {
      console.error('Status update email error:', e.message);
    }
  }

  res.json({ success: true, message: `Booking updated successfully.`, booking });
}));

// ── ADMIN: Email Guest (free-text message button) ─────────
router.post('/:id/email-guest', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('tour', 'title')
    .populate('accommodation', 'name')
    .populate('user', 'firstName lastName email');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  const message = (req.body?.message || '').trim();
  if (!message) return res.status(400).json({ success: false, message: 'Message text is required.' });

  const tpl = emails.emailGuestCustom(booking, booking.user, message, req.body?.subject);
  const result = await sendEmail({ to: booking.user.email, subject: tpl.subject, html: tpl.html });

  if (result?.error) {
    return res.status(502).json({ success: false, message: 'Could not send email right now.' });
  }
  res.json({ success: true, message: `Email sent to ${booking.user.email}.` });
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

  await booking.save();

  try {
    const emailData = approved
      ? emails.paymentConfirmed(booking, booking.user, payment.amount)
      : emails.paymentRejected(booking, booking.user);
    await sendEmail({ to: booking.user.email, subject: emailData.subject, html: emailData.html });
  } catch (e) {
    console.error('Verification email failed:', e.message);
  }

  res.json({ success: true, booking });
}));

module.exports = router;