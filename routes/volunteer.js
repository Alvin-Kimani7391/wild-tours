const express = require('express');
const router = express.Router();

const { VolunteerProgram, Application } = require('../models/Volunteer');
const { protect, authorize, asyncHandler } = require('../middleware/auth');


// ============================================================
// TEST ROUTES
// ============================================================

router.get('/test', (req, res) => {
  res.json({ success: true });
});

router.post('/test', (req, res) => {
  res.json({ success: true, method: 'POST' });
});


// ============================================================
// ADMIN ROUTES  (must come BEFORE /:slug to avoid slug conflict)
// ============================================================

// GET all programs (admin — includes inactive/drafts)
router.get('/admin/programs', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { country, category, page = 1, limit = 50 } = req.query;

  const query = {};  // No isActive filter — admins see everything
  if (country)  query.country  = new RegExp(country, 'i');
  if (category) query.category = category;

  const programs = await VolunteerProgram.find(query)
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await VolunteerProgram.countDocuments(query);

  res.json({
    success: true,
    count: programs.length,
    total,
    programs
  });
}));

// Create program
// POST /admin/program
router.post('/admin/program', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const body = { ...req.body, createdBy: req.user._id };

  // Remap accommodation.type → accommodation.kind
  if (body.accommodation?.type) {
    body.accommodation = {
      ...body.accommodation,
      kind: body.accommodation.type,
    };
    delete body.accommodation.type;
  }

  const program = await VolunteerProgram.create(body);
  res.status(201).json({ success: true, program });
}));

// PUT /admin/program/:id  
router.put('/admin/program/:id', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const body = { ...req.body };

  if (body.accommodation?.type) {
    body.accommodation = {
      ...body.accommodation,
      kind: body.accommodation.type,
    };
    delete body.accommodation.type;
  }

  const program = await VolunteerProgram.findByIdAndUpdate(
    req.params.id,
    body,
    { new: true, runValidators: true }
  );

  if (!program) return res.status(404).json({ success: false, message: 'Program not found' });
  res.json({ success: true, program });
}));

// Delete program
router.delete('/admin/program/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  await VolunteerProgram.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Program deleted.' });
}));

// Get all applications (admin)
router.get('/admin/applications', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const query = {};
  if (status) query.status = status;

  const applications = await Application.find(query)
    .populate('user', 'firstName lastName email')
    .populate('program', 'title country')
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Application.countDocuments(query);

  res.json({
    success: true,
    count: applications.length,
    total,
    applications
  });
}));

// Update application status (admin)
router.patch('/admin/applications/:id/status', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);

  if (!application) {
    return res.status(404).json({
      success: false,
      message: 'Application not found'
    });
  }

  application.status      = req.body.status;
  application.reviewNotes = req.body.reviewNotes;
  application.reviewedBy  = req.user._id;
  application.reviewedAt  = new Date();

  await application.save();

  res.json({
    success: true,
    application
  });
}));


// ============================================================
// PUBLIC ROUTES
// ============================================================

// GET all volunteer programs (public — active only)
router.get('/', asyncHandler(async (req, res) => {
  const { country, category, featured, page = 1, limit = 12 } = req.query;

  const query = { isActive: true };
  if (country)             query.country  = new RegExp(country, 'i');
  if (category)            query.category = category;
  if (featured === 'true') query.featured = true;

  const programs = await VolunteerProgram.find(query)
    .select('title slug description category country location duration programFee coverImage featured ratingsAverage')
    .sort('-featured -createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await VolunteerProgram.countDocuments(query);

  res.json({
    success: true,
    count: programs.length,
    total,
    programs
  });
}));

// GET single program by slug (public)
router.get('/:slug', asyncHandler(async (req, res) => {
  const program = await VolunteerProgram.findOne({
    slug: req.params.slug,
    isActive: true
  });

  if (!program) {
    return res.status(404).json({
      success: false,
      message: 'Program not found'
    });
  }

  res.json({ success: true, program });
}));


// ============================================================
// USER ROUTES (authenticated)
// ============================================================

// Submit application
// Submit application
router.post('/apply', protect, asyncHandler(async (req, res) => {
  const {
    program, personalInfo, emergencyContact, programDetails,
    skills, experience, motivation, languages,
    medicalConditions, dietaryRequirements, hasPassport
  } = req.body;

  const existingProgram = await VolunteerProgram.findById(program);
  if (!existingProgram) {
    return res.status(404).json({ success: false, message: 'Volunteer program not found' });
  }

  const application = await Application.create({
    user: req.user._id,
    program,
    personalInfo,
    emergencyContact,
    programDetails,
    skills,
    experience,
    motivation,
    languages,
    medicalConditions,
    dietaryRequirements,
    hasPassport,
    programFeeAmount: existingProgram.programFee
  });

  try {
    // 👤 USER EMAIL
    const userEmail = emails.volunteerReceived(
      req.user,
      existingProgram.title
    );

    await sendEmail({
      to: req.user.email,
      subject: userEmail.subject,
      html: userEmail.html
    });

    // 👨‍💼 ADMIN EMAIL
    const adminEmail = emails.volunteerAdminAlert(
      req.user,
      existingProgram,
      application._id
    );

    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: adminEmail.subject,
      html: adminEmail.html
    });

  } catch (err) {
    console.error('Application email error:', err.message);
  }

  res.status(201).json({
    success: true,
    message: 'Application submitted successfully',
    application
  });
}));



// My applications
router.get('/my/applications', protect, asyncHandler(async (req, res) => {
  const applications = await Application.find({ user: req.user._id })
    .populate('program', 'title country location')
    .sort('-createdAt');

  res.json({
    success: true,
    count: applications.length,
    applications
  });
}));


module.exports = router;