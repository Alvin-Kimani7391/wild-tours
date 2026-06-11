// ============================================================
// VOLUNTEER PROGRAMS ROUTES
// ============================================================
const express = require('express');
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { VolunteerProgram, Application } = require('../models/Volunteer');
const { Review, Blog } = require('../models/Review');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { upload, uploadToCloudinary } = require('../config/cloudinary');
const { sendEmail } = require('../utils/email');

// ── VOLUNTEER PROGRAMS ────────────────────────────────────
const volunteerRouter = express.Router();

volunteerRouter.get('/', asyncHandler(async (req, res) => {
  const { country, category, featured, page = 1, limit = 12 } = req.query;
  const query = { isActive: true };
  if (country) query.country = new RegExp(country, 'i');
  if (category) query.category = category;
  if (featured === 'true') query.featured = true;

  const programs = await VolunteerProgram.find(query)
    .select('title slug description category country location duration programFee coverImage featured ratingsAverage')
    .sort('-featured -createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await VolunteerProgram.countDocuments(query);
  res.json({ success: true, count: programs.length, total, programs });
}));

volunteerRouter.get('/:slug', asyncHandler(async (req, res) => {
  const program = await VolunteerProgram.findOne({ slug: req.params.slug, isActive: true });
  if (!program) return res.status(404).json({ success: false, message: 'Program not found.' });
  res.json({ success: true, program });
}));

volunteerRouter.post('/', protect, authorize('admin'), upload.fields([{ name: 'coverImage', maxCount: 1 }, { name: 'images', maxCount: 8 }]), asyncHandler(async (req, res) => {
  const data = { ...req.body, createdBy: req.user._id };
  if (req.files?.coverImage) {
    const r = await uploadToCloudinary(req.files.coverImage[0].path, 'wildroots/volunteer');
    data.coverImage = { url: r.secure_url, publicId: r.public_id };
  }
  ['responsibilities', 'requirements', 'benefits', 'skills', 'feeCoverage', 'languages', 'tags'].forEach(f => {
    if (typeof data[f] === 'string') try { data[f] = JSON.parse(data[f]); } catch (e) {}
  });
  const program = await VolunteerProgram.create(data);
  res.status(201).json({ success: true, program });
}));

volunteerRouter.put('/:id', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const program = await VolunteerProgram.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!program) return res.status(404).json({ success: false, message: 'Program not found.' });
  res.json({ success: true, program });
}));

volunteerRouter.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  await VolunteerProgram.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Program deleted.' });
}));

// ── APPLICATIONS ─────────────────────────────────────────
const applicationRouter = express.Router();

applicationRouter.post('/', protect, upload.fields([
  { name: 'passport', maxCount: 1 },
  { name: 'cv', maxCount: 1 },
  { name: 'certificates', maxCount: 5 },
]), asyncHandler(async (req, res) => {
  const { programId, personalInfo, emergencyContact, programDetails, skills, experience, motivation, languages, medicalConditions, dietaryRequirements, hasPassport } = req.body;

  const program = await VolunteerProgram.findById(programId);
  if (!program || !program.isActive) return res.status(404).json({ success: false, message: 'Program not found.' });

  // Check duplicate application
  const existing = await Application.findOne({ user: req.user._id, program: programId, status: { $nin: ['rejected', 'withdrawn'] } });
  if (existing) return res.status(400).json({ success: false, message: 'You already have an active application for this program.' });

  const documents = [];
  if (req.files) {
    for (const [fieldName, files] of Object.entries(req.files)) {
      for (const file of files) {
        const r = await uploadToCloudinary(file.path, 'wildroots/applications');
        documents.push({ type: fieldName === 'certificates' ? 'certificate' : fieldName, name: file.originalname, url: r.secure_url, publicId: r.public_id });
      }
    }
  }

  const parsedPersonal = typeof personalInfo === 'string' ? JSON.parse(personalInfo) : personalInfo;
  const parsedEmergency = typeof emergencyContact === 'string' ? JSON.parse(emergencyContact) : emergencyContact;
  const parsedProgDetails = typeof programDetails === 'string' ? JSON.parse(programDetails) : programDetails;
  const parsedSkills = typeof skills === 'string' ? JSON.parse(skills) : (skills || []);
  const parsedLanguages = typeof languages === 'string' ? JSON.parse(languages) : (languages || []);

  const application = await Application.create({
    user: req.user._id,
    program: programId,
    personalInfo: parsedPersonal,
    emergencyContact: parsedEmergency,
    programDetails: parsedProgDetails,
    skills: parsedSkills,
    experience, motivation, languages: parsedLanguages,
    medicalConditions, dietaryRequirements,
    hasPassport: hasPassport === 'true',
    documents,
    programFeeAmount: program.programFee,
  });

  await application.populate('program', 'title country location duration programFee');

  try {
    await sendEmail({
      to: req.user.email,
      subject: `🌿 Application Received - ${program.title} [${application.applicationRef}]`,
      template: 'applicationConfirmation',
      data: { name: req.user.firstName, appRef: application.applicationRef, programName: program.title, country: program.country }
    });
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `🔔 New Volunteer Application: ${application.applicationRef}`,
      template: 'adminApplicationAlert',
      data: { appRef: application.applicationRef, applicantName: `${req.user.firstName} ${req.user.lastName}`, programName: program.title }
    });
  } catch (e) { console.error('Application email error:', e.message); }

  res.status(201).json({ success: true, message: 'Application submitted. We\'ll review and contact you within 48 hours.', application });
}));

applicationRouter.get('/my', protect, asyncHandler(async (req, res) => {
  const applications = await Application.find({ user: req.user._id })
    .populate('program', 'title country location duration coverImage')
    .sort('-createdAt');
  res.json({ success: true, applications });
}));

applicationRouter.get('/:id', protect, asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id).populate('program').populate('user', 'firstName lastName email');
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });
  if (app.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }
  res.json({ success: true, application: app });
}));

// Admin: Get all applications
applicationRouter.get('/', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { status, programId, page = 1, limit = 20 } = req.query;
  const query = {};
  if (status) query.status = status;
  if (programId) query.program = programId;

  const applications = await Application.find(query)
    .populate('program', 'title country')
    .populate('user', 'firstName lastName email phone nationality')
    .sort('-createdAt')
    .skip((page - 1) * limit).limit(parseInt(limit));

  const total = await Application.countDocuments(query);
  res.json({ success: true, count: applications.length, total, applications });
}));

// Admin: Update application status
applicationRouter.put('/:id/status', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { status, reviewNotes, rejectionReason } = req.body;
  const app = await Application.findById(req.params.id)
    .populate('user', 'firstName email')
    .populate('program', 'title country');

  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  app.status = status;
  app.reviewedBy = req.user._id;
  app.reviewedAt = Date.now();
  if (reviewNotes) app.reviewNotes = reviewNotes;
  if (rejectionReason) app.rejectionReason = rejectionReason;
  await app.save();

  try {
    const subject = status === 'approved' ? `🎉 Application Approved - ${app.program.title}` :
                    status === 'rejected' ? `Application Update - ${app.program.title}` :
                    `Application Status Update - ${app.applicationRef}`;
    await sendEmail({
      to: app.user.email,
      subject,
      template: 'applicationStatusUpdate',
      data: { name: app.user.firstName, status, programName: app.program.title, appRef: app.applicationRef, notes: reviewNotes, rejectionReason }
    });
  } catch (e) { /* non-critical */ }

  res.json({ success: true, message: `Application ${status}.`, application: app });
}));

// ── USERS ─────────────────────────────────────────────────
const userRouter = express.Router();

userRouter.get('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, user });
}));

userRouter.put('/profile', protect, upload.single('avatar'), asyncHandler(async (req, res) => {
  const { firstName, lastName, phone, nationality } = req.body;
  const update = { firstName, lastName, phone, nationality };

  if (req.file) {
    const r = await uploadToCloudinary(req.file.path, 'wildroots/avatars');
    update.avatar = r.secure_url;
  }

  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true });
  res.json({ success: true, user });
}));

// Admin: Get all users
userRouter.get('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { role, search, page = 1, limit = 20, isActive } = req.query;
  const query = {};
  if (role) query.role = role;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) query.$or = [
    { firstName: new RegExp(search, 'i') },
    { lastName: new RegExp(search, 'i') },
    { email: new RegExp(search, 'i') },
  ];

  const users = await User.find(query).sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit));
  const total = await User.countDocuments(query);
  res.json({ success: true, count: users.length, total, users });
}));

// Admin: Suspend/unsuspend user
userRouter.put('/:id/suspend', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isSuspended: req.body.suspend }, { new: true });
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  res.json({ success: true, message: `User ${req.body.suspend ? 'suspended' : 'unsuspended'}.`, user });
}));

// Admin: Update user role
userRouter.put('/:id/role', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true });
  res.json({ success: true, user });
}));

// ── REVIEWS ───────────────────────────────────────────────
const reviewRouter = express.Router();

reviewRouter.post('/', protect, asyncHandler(async (req, res) => {
  const { tourId, rating, title, body, subRatings, bookingId } = req.body;
  const review = await Review.create({ user: req.user._id, tour: tourId, rating, title, body, subRatings, booking: bookingId });
  res.status(201).json({ success: true, message: 'Review submitted for approval. Thank you!', review });
}));

reviewRouter.get('/tour/:tourId', asyncHandler(async (req, res) => {
  const reviews = await Review.find({ tour: req.params.tourId, isApproved: true })
    .populate('user', 'firstName lastName avatar').sort('-createdAt');
  res.json({ success: true, count: reviews.length, reviews });
}));

// Admin
reviewRouter.get('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { isApproved, page = 1, limit = 20 } = req.query;
  const query = {};
  if (isApproved !== undefined) query.isApproved = isApproved === 'true';
  const reviews = await Review.find(query).populate('user', 'firstName lastName email').populate('tour', 'title').sort('-createdAt').skip((page-1)*limit).limit(parseInt(limit));
  const total = await Review.countDocuments(query);
  res.json({ success: true, count: reviews.length, total, reviews });
}));

reviewRouter.put('/:id/approve', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndUpdate(req.params.id, { isApproved: req.body.approved, isFeatured: req.body.featured }, { new: true });
  if (review.tour) await Review.calcAverageRating(review.tour);
  res.json({ success: true, review });
}));

reviewRouter.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  await Review.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Review deleted.' });
}));

// ── BLOG ──────────────────────────────────────────────────
const blogRouter = express.Router();

blogRouter.get('/', asyncHandler(async (req, res) => {
  const { category, featured, page = 1, limit = 9 } = req.query;
  const query = { isPublished: true };
  if (category) query.category = category;
  if (featured === 'true') query.featured = true;
  const posts = await Blog.find(query).populate('author', 'firstName lastName avatar').sort('-publishedAt').skip((page-1)*limit).limit(parseInt(limit));
  const total = await Blog.countDocuments(query);
  res.json({ success: true, count: posts.length, total, posts });
}));

blogRouter.get('/:slug', asyncHandler(async (req, res) => {
  const post = await Blog.findOneAndUpdate({ slug: req.params.slug, isPublished: true }, { $inc: { viewCount: 1 } }, { new: true }).populate('author', 'firstName lastName avatar');
  if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
  res.json({ success: true, post });
}));

blogRouter.post('/', protect, authorize('admin', 'staff'), upload.single('coverImage'), asyncHandler(async (req, res) => {
  const data = { ...req.body, author: req.user._id };
  if (req.file) { const r = await uploadToCloudinary(req.file.path, 'wildroots/blog'); data.coverImage = { url: r.secure_url, publicId: r.public_id }; }
  if (data.isPublished === 'true') data.publishedAt = new Date();
  const post = await Blog.create(data);
  res.status(201).json({ success: true, post });
}));

blogRouter.put('/:id', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  if (req.body.isPublished === 'true') req.body.publishedAt = req.body.publishedAt || new Date();
  const post = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, post });
}));

blogRouter.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  await Blog.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Post deleted.' });
}));

// ── DASHBOARD ─────────────────────────────────────────────
const dashboardRouter = express.Router();

dashboardRouter.get('/stats', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const [
    totalUsers, newUsersThisMonth,
    totalBookings, confirmedBookings, pendingBookings, cancelledBookings,
    totalApplications, approvedApplications, pendingApplications,
    totalRevenue, revenueThisMonth,
    totalTours, totalPrograms, totalReviews, pendingReviews,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'user', createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }),
    Booking.countDocuments(),
    Booking.countDocuments({ status: 'confirmed' }),
    Booking.countDocuments({ status: 'pending' }),
    Booking.countDocuments({ status: 'cancelled' }),
    Application.countDocuments(),
    Application.countDocuments({ status: 'approved' }),
    Application.countDocuments({ status: 'pending' }),
    Booking.aggregate([{ $match: { paymentStatus: { $in: ['deposit_paid', 'fully_paid'] } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
    Booking.aggregate([{ $match: { paymentStatus: { $in: ['deposit_paid', 'fully_paid'] }, createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
    require('../models/Tour').countDocuments({ isActive: true }),
    VolunteerProgram.countDocuments({ isActive: true }),
    Review.countDocuments(),
    Review.countDocuments({ isApproved: false }),
  ]);

  // Monthly revenue for chart (last 6 months)
  const monthlyRevenue = await Booking.aggregate([
    { $match: { paymentStatus: { $in: ['deposit_paid', 'fully_paid'] }, createdAt: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) } } },
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  // Recent bookings
  const recentBookings = await Booking.find()
    .populate('tour', 'title destination').populate('user', 'firstName lastName email')
    .sort('-createdAt').limit(5);

  // Recent applications
  const recentApplications = await Application.find()
    .populate('program', 'title country').populate('user', 'firstName lastName email')
    .sort('-createdAt').limit(5);

  res.json({
    success: true,
    stats: {
      users: { total: totalUsers, newThisMonth: newUsersThisMonth },
      bookings: { total: totalBookings, confirmed: confirmedBookings, pending: pendingBookings, cancelled: cancelledBookings },
      applications: { total: totalApplications, approved: approvedApplications, pending: pendingApplications },
      revenue: { total: totalRevenue[0]?.total || 0, thisMonth: revenueThisMonth[0]?.total || 0 },
      content: { tours: totalTours, programs: totalPrograms, reviews: totalReviews, pendingReviews },
    },
    monthlyRevenue,
    recentBookings,
    recentApplications,
  });
}));

// ── UPLOADS ───────────────────────────────────────────────
const uploadRouter = express.Router();

uploadRouter.post('/image', protect, authorize('admin', 'staff'), upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
  const folder = req.body.folder || 'wildroots/general';
  const result = await uploadToCloudinary(req.file.path, folder);
  res.json({ success: true, url: result.secure_url, publicId: result.public_id });
}));

uploadRouter.post('/document', protect, upload.single('document'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
  const result = await uploadToCloudinary(req.file.path, 'wildroots/documents');
  res.json({ success: true, url: result.secure_url, publicId: result.public_id, name: req.file.originalname });
}));

module.exports = { volunteerRouter, applicationRouter, userRouter, reviewRouter, blogRouter, dashboardRouter, uploadRouter };