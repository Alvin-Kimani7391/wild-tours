const mongoose = require('mongoose');

const ACCOMMODATION_CATEGORIES = [
  'hotel', 'airbnb', 'guesthouse', 'hostel', 'lodge',
  'safari_lodge', 'resort', 'beach_resort', 'luxury_tented_camp',
  'campsite', 'homestay', 'apartment'
];

const AccommodationSchema = new mongoose.Schema({
  ref: { type: String, unique: true }, // auto-generated, e.g. ACC-XXXXXX
  name: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, index: true },

  category: {
    type: String,
    enum: ACCOMMODATION_CATEGORIES,
    required: true,
    index: true
  },

  description: { type: String, required: true },
  shortDescription: { type: String, maxlength: 200 },

  location: {
    country: { type: String, required: true },
    region: String,          // e.g. "Arusha", "Zanzibar"
    city: String,
    address: String,
    lat: Number,
    lng: Number,
  },

  pricePerNight: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  priceType: { type: String, enum: ['per_night', 'per_person', 'per_tent'], default: 'per_night' },

  capacity: {
    maxGuests: { type: Number, default: 2 },
    bedrooms: Number,
    beds: Number,
    bathrooms: Number,
  },

  amenities: [{ type: String }], // "wifi", "pool", "generator", "hot_water", "game_drives" etc.

  // ── Media (Cloudinary) ──────────────────────────────
  media: {
    images: [{
      url: String,
      publicId: String,
      caption: String,
      isCover: { type: Boolean, default: false },
    }],
    videos: [{
      url: String,
      publicId: String,
      thumbnailUrl: String,   // Cloudinary can auto-generate a video thumbnail
      caption: String,
    }],
  },

  policies: {
    checkIn: String,
    checkOut: String,
    cancellationPolicy: String,
  },

  // Optional link to a safari tour this accommodation is used on
  relatedTour: { type: mongoose.Schema.Types.ObjectId, ref: 'Tour' },

  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewsCount: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// ── Auto ref + slug ─────────────────────────────────
AccommodationSchema.pre('save', function (next) {
  if (!this.ref) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
    this.ref = `ACC-${ts}-${rand}`;
  }
  if (!this.slug || this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).substr(2, 4);
  }
  next();
});

AccommodationSchema.index({ category: 1, isActive: 1 });
AccommodationSchema.index({ 'location.country': 1, 'location.region': 1 });
AccommodationSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Accommodation', AccommodationSchema);
module.exports.CATEGORIES = ACCOMMODATION_CATEGORIES;