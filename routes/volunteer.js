const express = require('express');
const router = express.Router();

const { VolunteerProgram, Application } = require('../models/Volunteer');
const { protect, authorize, asyncHandler } = require('../middleware/auth');


// ============================================================
// PUBLIC PROGRAMS
// ============================================================

router.get('/test', (req, res) => {
  res.json({ success: true });
});

router.post('/test', (req, res) => {
  res.json({ success: true, method: 'POST' });
});


// GET all volunteer programs
router.get('/', asyncHandler(async (req, res) => {
  const { country, category, featured } = req.query;

  const query = { isActive: true };

  if (country) query.country = new RegExp(country, 'i');
  if (category) query.category = category;
  if (featured === 'true') query.featured = true;

  const programs = await VolunteerProgram.find(query)
    .sort('-featured createdAt');

  res.json({
    success: true,
    count: programs.length,
    programs
  });
}));


// GET single program
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

  res.json({
    success: true,
    program
  });
}));


// ============================================================
// APPLICATIONS
// ============================================================

// Submit application
router.post('/apply', protect, asyncHandler(async (req, res) => {

  const {
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
    hasPassport
  } = req.body;

  const existingProgram = await VolunteerProgram.findById(program);

  if (!existingProgram) {
    return res.status(404).json({
      success: false,
      message: 'Volunteer program not found'
    });
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

  res.status(201).json({
    success: true,
    message: 'Application submitted successfully',
    application
  });
}));


// My applications
router.get('/my/applications', protect, asyncHandler(async (req, res) => {

  const applications = await Application.find({
    user: req.user._id
  })
    .populate('program', 'title country location')
    .sort('-createdAt');

  res.json({
    success: true,
    count: applications.length,
    applications
  });
}));


// ============================================================
// ADMIN ROUTES
// ============================================================

// Create program
router.post('/admin/program', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {

  const program = await VolunteerProgram.create({
    ...req.body,
    createdBy: req.user._id
  });

  res.status(201).json({
    success: true,
    program
  });
}));


// Update program
router.put('/admin/program/:id', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {

  const program = await VolunteerProgram.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!program) {
    return res.status(404).json({
      success: false,
      message: 'Program not found'
    });
  }

  res.json({
    success: true,
    program
  });
}));


// Get applications
router.get('/admin/applications', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {

  const applications = await Application.find()
    .populate('user', 'firstName lastName email')
    .populate('program', 'title country')
    .sort('-createdAt');

  res.json({
    success: true,
    count: applications.length,
    applications
  });
}));


// Update status
router.patch('/admin/applications/:id/status', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {

  const application = await Application.findById(req.params.id);

  if (!application) {
    return res.status(404).json({
      success: false,
      message: 'Application not found'
    });
  }

  application.status = req.body.status;
  application.reviewNotes = req.body.reviewNotes;
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();

  await application.save();

  res.json({
    success: true,
    application
  });
}));


module.exports = router;