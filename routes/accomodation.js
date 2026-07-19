const express = require('express');
const router = express.Router();
const Accommodation = require('../models/Accommodation');
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { cloudinary, accommodationUpload, deleteFromCloudinary } = require('../config/cloudinary');

// ── PUBLIC: list with filters ─────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { category, country, region, minPrice, maxPrice, guests, page = 1, limit = 12, search } = req.query;
  const query = { isActive: true };

  if (category) query.category = category;
  if (country) query['location.country'] = new RegExp(country, 'i');
  if (region) query['location.region'] = new RegExp(region, 'i');
  if (guests) query['capacity.maxGuests'] = { $gte: parseInt(guests) };
  if (minPrice || maxPrice) {
    query.pricePerNight = {};
    if (minPrice) query.pricePerNight.$gte = Number(minPrice);
    if (maxPrice) query.pricePerNight.$lte = Number(maxPrice);
  }
  if (search) query.$text = { $search: search };

  const items = await Accommodation.find(query)
    .select('-media.videos') // keep list responses light; videos loaded on detail page
    .sort('-isFeatured -createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Accommodation.countDocuments(query);
  res.json({ success: true, count: items.length, total, accommodations: items });
}));

// ── PUBLIC: category counts ───────────────────────────
router.get('/counts', asyncHandler(async (req, res) => {
  const counts = await Accommodation.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]);
  const map = {};
  counts.forEach(c => { map[c._id] = c.count; });
  res.json({ success: true, counts: map });
}));

// ── PUBLIC: single by slug ────────────────────────────
router.get('/:slug', asyncHandler(async (req, res) => {
  const item = await Accommodation.findOne({ slug: req.params.slug, isActive: true })
    .populate('relatedTour', 'title destination');
  if (!item) return res.status(404).json({ success: false, message: 'Accommodation not found.' });
  res.json({ success: true, accommodation: item });
}));

// ── ADMIN: create ─────────────────────────────────────
router.post('/', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const item = await Accommodation.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json({ success: true, accommodation: item });
}));

// ── ADMIN: upload media (images + videos) ─────────────
// accommodationUpload streams each file straight to Cloudinary via
// multer-storage-cloudinary — by the time this handler runs, every
// file in req.files already lives on Cloudinary. `file.path` is the
// secure_url and `file.filename` is the public_id; there is no local
// temp file to clean up.
router.post(
  '/:id/media',
  protect,
  authorize('admin', 'staff'),
  accommodationUpload.array('files', 15),
  asyncHandler(async (req, res) => {
    const item = await Accommodation.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Accommodation not found.' });
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files uploaded.' });

    for (const file of req.files) {
      const isVideo = file.mimetype.startsWith('video/');

      if (isVideo) {
        // Cloudinary generates a JPG thumbnail from the first frame when
        // you request the same public_id with a .jpg extension — cheaper
        // than a second upload call and doesn't rely on eager results
        // being present on the multer file object.
        const thumbnailUrl = cloudinary.url(file.filename, {
          resource_type: 'video',
          format: 'jpg',
          transformation: [{ width: 400, height: 300, crop: 'pad' }],
        });
        item.media.videos.push({
          url: file.path,
          publicId: file.filename,
          thumbnailUrl,
        });
      } else {
        item.media.images.push({
          url: file.path,
          publicId: file.filename,
          isCover: item.media.images.length === 0,
        });
      }
    }

    await item.save();
    res.json({ success: true, accommodation: item });
  })
);

// ── ADMIN: delete a single media item ─────────────────
router.delete('/:id/media/:publicId', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const item = await Accommodation.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Accommodation not found.' });

  // publicId includes folder slashes (e.g. wildroots/accommodations/<id>/abc123),
  // so it must arrive URL-encoded and be decoded here.
  const publicId = decodeURIComponent(req.params.publicId);
  const isVideo = item.media.videos.some(m => m.publicId === publicId);

  await cloudinary.uploader.destroy(publicId, { resource_type: isVideo ? 'video' : 'image' });
  item.media.images = item.media.images.filter(m => m.publicId !== publicId);
  item.media.videos = item.media.videos.filter(m => m.publicId !== publicId);
  await item.save();

  res.json({ success: true, accommodation: item });
}));

// ── ADMIN: set cover image ────────────────────────────
router.patch('/:id/media/:publicId/cover', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const item = await Accommodation.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Accommodation not found.' });

  const publicId = decodeURIComponent(req.params.publicId);
  let found = false;
  item.media.images.forEach(img => {
    img.isCover = img.publicId === publicId;
    if (img.isCover) found = true;
  });
  if (!found) return res.status(404).json({ success: false, message: 'Image not found on this listing.' });

  await item.save();
  res.json({ success: true, accommodation: item });
}));

// ── ADMIN: update / delete accommodation ──────────────
router.put('/:id', protect, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const item = await Accommodation.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, message: 'Accommodation not found.' });
  res.json({ success: true, accommodation: item });
}));

router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const item = await Accommodation.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Accommodation not found.' });

  const imageDeletes = item.media.images.map(m =>
    cloudinary.uploader.destroy(m.publicId, { resource_type: 'image' }).catch(() => {})
  );
  const videoDeletes = item.media.videos.map(m =>
    cloudinary.uploader.destroy(m.publicId, { resource_type: 'video' }).catch(() => {})
  );
  await Promise.all([...imageDeletes, ...videoDeletes]);

  await item.deleteOne();
  res.json({ success: true, message: 'Accommodation deleted.' });
}));

module.exports = router;