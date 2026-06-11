const express = require('express');
const router = express.Router();
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { Review } = require('../models/Review');

// POST /api/reviews — authenticated user submits a review
router.post('/', protect, asyncHandler(async (req, res) => {
  const { tourId, rating, title, body, subRatings, bookingId } = req.body;

  const review = await Review.create({
    user:       req.user._id,
    tour:       tourId,
    rating,
    title,
    body,
    subRatings,
    booking:    bookingId,
  });

  res.status(201).json({
    success: true,
    message: 'Review submitted for approval. Thank you!',
    review,
  });
}));

// GET /api/reviews/tour/:tourId — public: approved reviews for a tour
router.get('/tour/:tourId', asyncHandler(async (req, res) => {
  const reviews = await Review.find({ tour: req.params.tourId, isApproved: true })
    .populate('user', 'firstName lastName avatar')
    .sort('-createdAt');

  res.json({ success: true, count: reviews.length, reviews });
}));

// GET /api/reviews — admin: all reviews with optional approval filter
router.get(
  '/',
  protect,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { isApproved, page = 1, limit = 20 } = req.query;
    const query = {};
    if (isApproved !== undefined) query.isApproved = isApproved === 'true';

    const reviews = await Review.find(query)
      .populate('user', 'firstName lastName email')
      .populate('tour', 'title')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Review.countDocuments(query);
    res.json({ success: true, count: reviews.length, total, reviews });
  })
);

// PUT /api/reviews/:id/approve — admin: approve/reject and optionally feature
router.put(
  '/:id/approve',
  protect,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isApproved: req.body.approved, isFeatured: req.body.featured },
      { new: true }
    );

    if (!review)
      return res.status(404).json({ success: false, message: 'Review not found.' });

    // Recalculate tour average rating after approval change
    if (review.tour) await Review.calcAverageRating(review.tour);

    res.json({ success: true, review });
  })
);

// DELETE /api/reviews/:id — admin only
router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review)
    return res.status(404).json({ success: false, message: 'Review not found.' });

  res.json({ success: true, message: 'Review deleted.' });
}));

module.exports = router;