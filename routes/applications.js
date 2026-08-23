const express = require('express');
const router = express.Router();
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { Application, VolunteerProgram } = require('../models/Volunteer');
const { upload, uploadToCloudinary } = require('../config/cloudinary');
const { sendEmail, emails } = require('../utils/emailService');

// POST /api/applications — authenticated user submits application
router.post(
  '/',
  protect,
  upload.fields([
    { name: 'passport',     maxCount: 1 },
    { name: 'cv',           maxCount: 1 },
    { name: 'certificates', maxCount: 5 },
  ]),
  asyncHandler(async (req, res) => {
    const {
      programId, personalInfo, emergencyContact, programDetails,
      skills, experience, motivation, languages,
      medicalConditions, dietaryRequirements, hasPassport,
    } = req.body;

    const program = await VolunteerProgram.findById(programId);
    if (!program || !program.isActive)
      return res.status(404).json({ success: false, message: 'Program not found.' });

    const existing = await Application.findOne({
      user: req.user._id,
      program: programId,
      status: { $nin: ['rejected', 'withdrawn'] },
    });
    if (existing)
      return res.status(400).json({
        success: false,
        message: 'You already have an active application for this program.',
      });

    const documents = [];
    if (req.files) {
      for (const [fieldName, files] of Object.entries(req.files)) {
        for (const file of files) {
          const r = await uploadToCloudinary(file.path, 'wildroots/applications');
          documents.push({
            type: fieldName === 'certificates' ? 'certificate' : fieldName,
            name: file.originalname,
            url:  r.secure_url,
            publicId: r.public_id,
          });
        }
      }
    }

    const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
    const parsedPersonal   = parse(personalInfo);
    const parsedEmergency  = parse(emergencyContact);
    const parsedProgDetails = parse(programDetails);
    const parsedSkills     = skills     ? parse(skills)     : [];
    const parsedLanguages  = languages  ? parse(languages)  : [];

    const application = await Application.create({
      user: req.user._id,
      program: programId,
      personalInfo:     parsedPersonal,
      emergencyContact: parsedEmergency,
      programDetails:   parsedProgDetails,
      skills:           parsedSkills,
      experience,
      motivation,
      languages:        parsedLanguages,
      medicalConditions,
      dietaryRequirements,
      hasPassport: hasPassport === 'true',
      documents,
      programFeeAmount: program.programFee,
    });

    await application.populate('program', 'title country location duration programFee');

    try {
      const userEmail = emails.volunteerReceived(req.user, program.title);
      await sendEmail({ to: req.user.email, subject: userEmail.subject, html: userEmail.html });

      const adminEmail = emails.volunteerAdminAlert(req.user, program, application.applicationRef);
      await sendEmail({ to: process.env.ADMIN_EMAIL, subject: adminEmail.subject, html: adminEmail.html });
    } catch (e) {
      console.error('Application email error:', e.message);
    }

    res.status(201).json({
      success: true,
      message: "Application submitted. We'll review and contact you within 48 hours.",
      application,
    });
  })
);

// GET /api/applications/my
router.get('/my', protect, asyncHandler(async (req, res) => {
  const applications = await Application.find({ user: req.user._id })
    .populate('program', 'title country location duration coverImage')
    .sort('-createdAt');
  res.json({ success: true, applications });
}));

// GET /api/applications/:id — owner or admin
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id)
    .populate('program')
    .populate('user', 'firstName lastName email');

  if (!app)
    return res.status(404).json({ success: false, message: 'Application not found.' });

  const isOwner = app.user._id.toString() === req.user._id.toString();
  const isAdmin = ['admin', 'staff'].includes(req.user.role);
  if (!isOwner && !isAdmin)
    return res.status(403).json({ success: false, message: 'Not authorized.' });

  res.json({ success: true, application: app });
}));

// GET /api/applications — admin / staff list all
router.get(
  '/',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { status, programId, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status)    query.status  = status;
    if (programId) query.program = programId;

    const applications = await Application.find(query)
      .populate('program', 'title country')
      .populate('user', 'firstName lastName email phone nationality')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Application.countDocuments(query);
    res.json({ success: true, count: applications.length, total, applications });
  })
);

// PUT /api/applications/:id/status — admin / staff review decision
router.put(
  '/:id/status',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { status, reviewNotes, rejectionReason } = req.body;

    const app = await Application.findById(req.params.id)
      .populate('user', 'firstName lastName email')
      .populate('program', 'title country');

    if (!app)
      return res.status(404).json({ success: false, message: 'Application not found.' });

    app.status       = status;
    app.reviewedBy   = req.user._id;
    app.reviewedAt   = Date.now();
    if (reviewNotes)      app.reviewNotes      = reviewNotes;
    if (rejectionReason)  app.rejectionReason  = rejectionReason;
    await app.save();

    try {
      const statusEmail = emails.volunteerStatusUpdate(
        app.user,
        app.program.title,
        status,
        app.applicationRef,
        reviewNotes,
        rejectionReason
      );
      await sendEmail({ to: app.user.email, subject: statusEmail.subject, html: statusEmail.html });
    } catch (e) {
      console.error('Status email failed:', e.message);
    }

    res.json({ success: true, message: `Application ${status}.`, application: app });
  })
);

// ── ADMIN: Email Applicant (free-text message button) ─────
router.post(
  '/:id/email-applicant',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const app = await Application.findById(req.params.id)
      .populate('user', 'firstName lastName email')
      .populate('program', 'title');

    if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

    const message = (req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Message text is required.' });

    const tpl = emails.emailApplicantCustom(app, app.user, message, req.body?.subject);
    const result = await sendEmail({ to: app.user.email, subject: tpl.subject, html: tpl.html });

    if (result?.error) {
      return res.status(502).json({ success: false, message: 'Could not send email right now.' });
    }
    res.json({ success: true, message: `Email sent to ${app.user.email}.` });
  })
);

module.exports = router;