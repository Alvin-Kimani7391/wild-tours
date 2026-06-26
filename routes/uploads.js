const express = require('express');
const router = express.Router();
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { upload, uploadToCloudinary } = require('../config/cloudinary');
const Gallery = require('../models/Gallery');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/uploads/image
// Admin/staff: upload a single image to Cloudinary.
// Returns { url, publicId } — caller decides what to do with it.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/image',
  protect,
  authorize('admin', 'staff'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const folder = req.body.folder || 'wildroots/general';
    const result = await uploadToCloudinary(req.file.path, folder);

    res.json({
      success:  true,
      url:      result.secure_url,
      publicId: result.public_id,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/uploads/gallery
// Admin/staff: upload image AND immediately create a Gallery document.
// This is the single endpoint the admin "Add Photo" form calls.
//
// multipart/form-data fields:
//   image        (file, required)
//   title        (string, required)
//   location     (string, required)
//   category     (string, required) — wildlife|safari|volunteer|culture|landscape
//   description  (string, optional)
//   altText      (string, optional)
//   photographer (string, optional)
//   capturedAt   (ISO date string, optional)
//   tags         (comma-separated string, optional) — e.g. "kenya,mara,lion"
//   isPublished  ("true"/"false", optional, default "true")
//   isFeatured   ("true"/"false", optional, default "false")
//   displayOrder (number string, optional, default "0")
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/gallery',
  protect,
  authorize('admin', 'staff'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded.' });
    }

    const { title, location, category } = req.body;
    if (!title || !location || !category) {
      return res.status(400).json({
        success: false,
        message: 'title, location and category are required.',
      });
    }

    // 1. Upload to Cloudinary in the gallery folder
    const result = await uploadToCloudinary(req.file.path, 'wildroots/gallery');

    // 2. Parse optional fields
    const tags = req.body.tags
      ? req.body.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    // 3. Save Gallery document
    const item = await Gallery.create({
      imageUrl:     result.secure_url,
      publicId:     result.public_id,
      title:        title.trim(),
      location:     location.trim(),
      category,
      description:  req.body.description  || '',
      altText:      req.body.altText      || '',
      photographer: req.body.photographer || 'WildRoots Africa',
      capturedAt:   req.body.capturedAt   || null,
      tags,
      isPublished:  req.body.isPublished  !== 'false',    // default true
      isFeatured:   req.body.isFeatured   === 'true',     // default false
      displayOrder: Number(req.body.displayOrder) || 0,
      uploadedBy:   req.user._id,
    });

    res.status(201).json({
      success:  true,
      message:  'Photo uploaded and added to gallery.',
      data:     item,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/uploads/document
// Authenticated user: upload a document (payment proof, etc.)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/document',
  protect,
  upload.single('document'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

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