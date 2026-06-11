const express = require('express');
const router = express.Router();
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const User = require('../models/User');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// GET /api/users/profile — logged-in user's own profile
router.get('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, user });
}));

// PUT /api/users/profile — update own profile (with optional avatar upload)
router.put(
  '/profile',
  protect,
  upload.single('avatar'),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, nationality } = req.body;
    const update = { firstName, lastName, phone, nationality };

    if (req.file) {
      const r = await uploadToCloudinary(req.file.path, 'wildroots/avatars');
      update.avatar = r.secure_url;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id, update, { new: true, runValidators: true }
    );
    res.json({ success: true, user });
  })
);

// GET /api/users — admin: list all users with optional filters
router.get(
  '/',
  protect,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { role, search, page = 1, limit = 20, isActive } = req.query;
    const query = {};
    if (role)              query.role     = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName:  new RegExp(search, 'i') },
        { email:     new RegExp(search, 'i') },
      ];
    }

    const users = await User.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);
    res.json({ success: true, count: users.length, total, users });
  })
);

// PUT /api/users/:id/suspend — admin: suspend or unsuspend a user
router.put(
  '/:id/suspend',
  protect,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isSuspended: req.body.suspend },
      { new: true }
    );
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found.' });

    res.json({
      success: true,
      message: `User ${req.body.suspend ? 'suspended' : 'unsuspended'}.`,
      user,
    });
  })
);

// PUT /api/users/:id/role — admin: change a user's role
router.put(
  '/:id/role',
  protect,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: req.body.role },
      { new: true }
    );
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found.' });

    res.json({ success: true, user });
  })
);

module.exports = router;