// ============================================================
// TOURS ROUTES
// ============================================================
const express = require('express');
const tourRouter = express.Router();
const Tour = require('../models/Tour');
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { upload, uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// GET all tours (public)
tourRouter.get('/', asyncHandler(async (req, res) => {
  const { country, category, minPrice, maxPrice, duration, featured, search, page = 1, limit = 12 } = req.query;
  const query = { isActive: true };

  if (country) query.country = new RegExp(country, 'i');
  if (category) query.category = category;
  if (featured === 'true') query.featured = true;
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }
  if (duration) {
    const [min, max] = duration.split('-').map(Number);
    query['duration.days'] = max ? { $gte: min, $lte: max } : { $gte: min };
  }
  if (search) query.$text = { $search: search };

  const tours = await Tour.find(query)
    .select('title slug destination country duration price priceDiscount category coverImage ratingsAverage ratingsCount featured maxGroupSize')
    .sort(featured ? '-featured -ratingsAverage' : '-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Tour.countDocuments(query);

  res.json({ success: true, count: tours.length, total, pages: Math.ceil(total / limit), tours });
}));

// GET single tour
tourRouter.get('/:slug', asyncHandler(async (req, res) => {
  const tour = await Tour.findOne({ slug: req.params.slug, isActive: true })
    .populate({ path: 'reviews', match: { isApproved: true }, select: 'rating title body user createdAt', populate: { path: 'user', select: 'firstName lastName avatar' } });

  if (!tour) return res.status(404).json({ success: false, message: 'Tour not found.' });
  res.json({ success: true, tour });
}));

// ADMIN: Create tour
tourRouter.post('/', protect, authorize('admin', 'staff'), upload.fields([{ name: 'coverImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), asyncHandler(async (req, res) => {
  const tourData = { ...req.body, createdBy: req.user._id };

  if (req.files?.coverImage) {
    const r = await uploadToCloudinary(req.files.coverImage[0].path, 'wildroots/tours');
    tourData.coverImage = { url: r.secure_url, publicId: r.public_id };
  }
  if (req.files?.images) {
    tourData.images = await Promise.all(req.files.images.map(async f => {
      const r = await uploadToCloudinary(f.path, 'wildroots/tours');
      return { url: r.secure_url, publicId: r.public_id };
    }));
  }

  // Parse JSON fields
  ['included', 'excluded', 'highlights', 'itinerary', 'requirements', 'tags'].forEach(field => {
    if (typeof tourData[field] === 'string') {
      try { tourData[field] = JSON.parse(tourData[field]); } catch (e) {}
    }
  });

  const tour = await Tour.create(tourData);
  res.status(201).json({ success: true, tour });
}));

// ADMIN: Update tour
tourRouter.put('/:id', protect, authorize('admin', 'staff'), upload.fields([{ name: 'coverImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), asyncHandler(async (req, res) => {
  let tour = await Tour.findById(req.params.id);
  if (!tour) return res.status(404).json({ success: false, message: 'Tour not found.' });

  const updateData = { ...req.body };
  if (req.files?.coverImage) {
    if (tour.coverImage?.publicId) await deleteFromCloudinary(tour.coverImage.publicId);
    const r = await uploadToCloudinary(req.files.coverImage[0].path, 'wildroots/tours');
    updateData.coverImage = { url: r.secure_url, publicId: r.public_id };
  }

  ['included', 'excluded', 'highlights', 'itinerary', 'requirements', 'tags'].forEach(field => {
    if (typeof updateData[field] === 'string') {
      try { updateData[field] = JSON.parse(updateData[field]); } catch (e) {}
    }
  });

  tour = await Tour.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
  res.json({ success: true, tour });
}));

// ADMIN: Delete tour
tourRouter.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) return res.status(404).json({ success: false, message: 'Tour not found.' });
  if (tour.coverImage?.publicId) await deleteFromCloudinary(tour.coverImage.publicId);
  await tour.deleteOne();
  res.json({ success: true, message: 'Tour deleted.' });
}));

module.exports = tourRouter;