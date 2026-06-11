const mongoose = require('mongoose');

const ItinerarySchema = new mongoose.Schema({
  day: Number,
  title: String,
  description: String,
  accommodation: String,
  meals: { breakfast: Boolean, lunch: Boolean, dinner: Boolean }
}, { _id: false });

const TourSchema = new mongoose.Schema({
  title:    { type: String, required: [true, 'Tour title is required'], trim: true, maxlength: 120 },
  slug:     { type: String, unique: true },
  description: { type: String, required: true },
  shortDescription: { type: String, maxlength: 280 },

  // Categorization
  category: { type: String, enum: ['wildlife-safari', 'gorilla-trekking', 'mountain-climbing', 'beach-safari', 'cultural-tour', 'bird-watching', 'photography'], required: true },
  destination: { type: String, required: true },
  country: { type: String, required: true },
  coordinates: { lat: Number, lng: Number },

  // Logistics
  duration: { days: { type: Number, required: true }, nights: Number },
  maxGroupSize: { type: Number, default: 12 },
  minGroupSize: { type: Number, default: 1 },
  difficulty: { type: String, enum: ['easy', 'moderate', 'challenging', 'expert'], default: 'easy' },
  startLocation: String,
  endLocation: String,

  // Pricing
  price: { type: Number, required: true },
  priceDiscount: Number,
  depositPercent: { type: Number, default: 20 },
  currency: { type: String, default: 'USD' },

  // Media
  coverImage: { url: String, publicId: String },
  images: [{ url: String, publicId: String, caption: String }],

  // Content
  included: [String],
  excluded: [String],
  highlights: [String],
  itinerary: [ItinerarySchema],
  requirements: [String],
  meetingPoint: String,

  // Meta
  featured:     { type: Boolean, default: false },
  isActive:     { type: Boolean, default: true },
  isAvailable:  { type: Boolean, default: true },
  availableDates: [Date],
  tags: [String],

  // Stats (computed)
  ratingsAverage: { type: Number, default: 4.5, min: 1, max: 5, set: val => Math.round(val * 10) / 10 },
  ratingsCount:   { type: Number, default: 0 },
  bookingsCount:  { type: Number, default: 0 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual populate reviews
TourSchema.virtual('reviews', { ref: 'Review', foreignField: 'tour', localField: '_id' });

// Auto-slug
TourSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    const slugify = require('slugify');
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

// Effective price
TourSchema.virtual('effectivePrice').get(function() {
  return this.priceDiscount || this.price;
});

TourSchema.index({ destination: 'text', title: 'text', description: 'text' });
TourSchema.index({ country: 1, category: 1, featured: 1 });

module.exports = mongoose.model('Tour', TourSchema);