const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const Gallery = require('../models/Gallery');

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES  (no auth required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/gallery
 * Fetch all published gallery items.
 * Query params:
 *   category  — filter by category slug
 *   featured  — "true" to return only featured items
 *   limit     — max results (default 100)
 *   page      — pagination (default 1)
 *   sort      — "newest" | "oldest" | "order" (default: order then newest)
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { category, featured, limit = 100, page = 1, sort } = req.query;

    const filter = { isPublished: true };
    if (category && category !== 'all') filter.category = category;
    if (featured === 'true') filter.isFeatured = true;

    const sortMap = {
      newest:  { createdAt: -1 },
      oldest:  { createdAt:  1 },
      order:   { displayOrder: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[sort] || { displayOrder: -1, createdAt: -1 };

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Gallery.find(filter)
        .sort(sortQuery)
        .skip(skip)
        .limit(Number(limit))
        .select('-__v')
        .populate('uploadedBy', 'firstName lastName'),
      Gallery.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page:    Number(page),
      pages:   Math.ceil(total / Number(limit)),
      data:    items,
    });
  })
);

/**
 * GET /api/gallery/:id
 * Single gallery item (public) — also increments view count.
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await Gallery.findOneAndUpdate(
      { _id: req.params.id, isPublished: true },
      { $inc: { views: 1 } },
      { new: true }
    ).populate('uploadedBy', 'firstName lastName');

    if (!item) {
      return res.status(404).json({ success: false, message: 'Gallery item not found.' });
    }

    res.json({ success: true, data: item });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES  (admin / staff only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/gallery/admin/all
 * All items (published + unpublished) for the admin panel.
 */
router.get(
  '/admin/all',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { category, published, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (category && category !== 'all') filter.category = category;
    if (published === 'true')  filter.isPublished = true;
    if (published === 'false') filter.isPublished = false;

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Gallery.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-__v')
        .populate('uploadedBy', 'firstName lastName'),
      Gallery.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page:    Number(page),
      pages:   Math.ceil(total / Number(limit)),
      data:    items,
    });
  })
);

/**
 * POST /api/gallery
 * Create a new gallery item.
 * The image must already be uploaded via POST /api/uploads/image first.
 * Body: { imageUrl, publicId, title, location, category, description?,
 *         altText?, isPublished?, isFeatured?, displayOrder?, tags?,
 *         photographer?, capturedAt? }
 */
router.post(
  '/',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const {
      imageUrl, publicId, title, location, category,
      description, altText, isPublished, isFeatured,
      displayOrder, tags, photographer, capturedAt,
    } = req.body;

    // Basic validation
    if (!imageUrl || !publicId || !title || !location || !category) {
      return res.status(400).json({
        success: false,
        message: 'imageUrl, publicId, title, location and category are required.',
      });
    }

    const item = await Gallery.create({
      imageUrl, publicId, title, location, category,
      description:  description  ?? '',
      altText:      altText      ?? '',
      isPublished:  isPublished  ?? true,
      isFeatured:   isFeatured   ?? false,
      displayOrder: displayOrder ?? 0,
      tags:         Array.isArray(tags) ? tags : [],
      photographer: photographer ?? 'WildRoots Africa',
      capturedAt:   capturedAt   ?? null,
      uploadedBy:   req.user._id,
    });

    res.status(201).json({ success: true, data: item });
  })
);

/**
 * PUT /api/gallery/:id
 * Update gallery item metadata (no image replacement here — delete + re-upload).
 */
router.put(
  '/:id',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const allowed = [
      'title', 'location', 'category', 'description', 'altText',
      'isPublished', 'isFeatured', 'displayOrder', 'tags',
      'photographer', 'capturedAt',
    ];

    // Build a safe update object (ignore any image fields — must delete + re-upload)
    const update = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });

    const item = await Gallery.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ success: false, message: 'Gallery item not found.' });
    }

    res.json({ success: true, data: item });
  })
);

/**
 * PATCH /api/gallery/:id/toggle-publish
 * Quick toggle for isPublished (used by the admin panel switch).
 */
router.patch(
  '/:id/toggle-publish',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const item = await Gallery.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Gallery item not found.' });
    }

    item.isPublished = !item.isPublished;
    await item.save();

    res.json({
      success:     true,
      isPublished: item.isPublished,
      message:     `Photo ${item.isPublished ? 'published' : 'unpublished'} successfully.`,
    });
  })
);

/**
 * PATCH /api/gallery/:id/toggle-featured
 * Quick toggle for isFeatured.
 */
router.patch(
  '/:id/toggle-featured',
  protect,
  authorize('admin'),   // admin only
  asyncHandler(async (req, res) => {
    const item = await Gallery.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Gallery item not found.' });
    }

    item.isFeatured = !item.isFeatured;
    await item.save();

    res.json({
      success:    true,
      isFeatured: item.isFeatured,
      message:    `Photo ${item.isFeatured ? 'featured' : 'unfeatured'} successfully.`,
    });
  })
);

/**
 * PATCH /api/gallery/reorder
 * Bulk-update displayOrder for drag-and-drop reordering.
 * Body: { items: [{ id: '...', displayOrder: 5 }, ...] }
 */
router.patch(
  '/reorder',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'items array is required.' });
    }

    const ops = items.map(({ id, displayOrder }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { displayOrder: Number(displayOrder) } },
      },
    }));

    await Gallery.bulkWrite(ops);

    res.json({ success: true, message: 'Display order updated.' });
  })
);

/**
 * DELETE /api/gallery/:id
 * Delete a gallery item + remove image from Cloudinary.
 */
router.delete(
  '/:id',
  protect,
  authorize('admin'),   // admin only — staff cannot delete
  asyncHandler(async (req, res) => {
    const item = await Gallery.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Gallery item not found.' });
    }

    // Remove from Cloudinary (don't block response if it fails)
    try {
      await cloudinary.uploader.destroy(item.publicId);
    } catch (cloudErr) {
      console.warn('[Gallery] Cloudinary delete failed:', cloudErr.message);
    }

    await item.deleteOne();

    res.json({ success: true, message: 'Gallery item deleted successfully.' });
  })
);

module.exports = router;