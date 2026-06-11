const express = require('express');
const router = express.Router();
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { Blog } = require('../models/Review');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// GET /api/blog — public: paginated published posts
router.get('/', asyncHandler(async (req, res) => {
  const { category, featured, page = 1, limit = 9 } = req.query;
  const query = { isPublished: true };
  if (category)            query.category = category;
  if (featured === 'true') query.featured = true;

  const posts = await Blog.find(query)
    .populate('author', 'firstName lastName avatar')
    .sort('-publishedAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Blog.countDocuments(query);
  res.json({ success: true, count: posts.length, total, posts });
}));

// GET /api/blog/:slug — public: single post (increments view count)
router.get('/:slug', asyncHandler(async (req, res) => {
  const post = await Blog.findOneAndUpdate(
    { slug: req.params.slug, isPublished: true },
    { $inc: { viewCount: 1 } },
    { new: true }
  ).populate('author', 'firstName lastName avatar');

  if (!post)
    return res.status(404).json({ success: false, message: 'Post not found.' });

  res.json({ success: true, post });
}));

// POST /api/blog — admin/staff: create post (with optional cover image)
router.post(
  '/',
  protect,
  authorize('admin', 'staff'),
  upload.single('coverImage'),
  asyncHandler(async (req, res) => {
    const data = { ...req.body, author: req.user._id };

    if (req.file) {
      const r = await uploadToCloudinary(req.file.path, 'wildroots/blog');
      data.coverImage = { url: r.secure_url, publicId: r.public_id };
    }

    // Set publishedAt only when publishing immediately
    if (data.isPublished === 'true') data.publishedAt = new Date();

    const post = await Blog.create(data);
    res.status(201).json({ success: true, post });
  })
);

// PUT /api/blog/:id — admin/staff: update post
router.put(
  '/:id',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    // Stamp publishedAt the first time the post goes live
    if (req.body.isPublished === 'true') {
      req.body.publishedAt = req.body.publishedAt || new Date();
    }

    const post = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!post)
      return res.status(404).json({ success: false, message: 'Post not found.' });

    res.json({ success: true, post });
  })
);

// DELETE /api/blog/:id — admin only
router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const post = await Blog.findByIdAndDelete(req.params.id);
  if (!post)
    return res.status(404).json({ success: false, message: 'Post not found.' });

  res.json({ success: true, message: 'Post deleted.' });
}));

module.exports = router;