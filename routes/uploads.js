const express = require('express');
const router = express.Router();
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// POST /api/uploads/image — admin/staff: upload an image to Cloudinary
router.post(
  '/image',
  protect,
  authorize('admin', 'staff'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file)
      return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const folder = req.body.folder || 'wildroots/general';
    const result = await uploadToCloudinary(req.file.path, folder);

    res.json({ success: true, url: result.secure_url, publicId: result.public_id });
  })
);

// POST /api/uploads/document — authenticated user: upload a document
router.post(
  '/document',
  protect,
  upload.single('document'),
  asyncHandler(async (req, res) => {
    if (!req.file)
      return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const result = await uploadToCloudinary(req.file.path, 'wildroots/documents');

    res.json({
      success:  true,
      url:      result.secure_url,
      publicId: result.public_id,
      name:     req.file.originalname,
    });
  })
);

module.exports = router;