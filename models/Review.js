const mongoose = require('mongoose');

// ── REVIEW ───────────────────────────────────────────────
const ReviewSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tour:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tour' },
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'VolunteerProgram' },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },

  rating:  { type: Number, required: true, min: 1, max: 5 },
  title:   { type: String, trim: true, maxlength: 100 },
  body:    { type: String, required: true, maxlength: 2000 },

  images: [{ url: String, publicId: String }],

  // Sub-ratings
  subRatings: {
    guideQuality:      Number,
    valueForMoney:     Number,
    accommodation:     Number,
    foodAndDrinks:     Number,
    organization:      Number,
  },

  isApproved:  { type: Boolean, default: false },
  isFeatured:  { type: Boolean, default: false },
  adminReply:  String,
  repliedAt:   Date,

  helpfulVotes: { type: Number, default: 0 },
  reportedBy:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

// One review per user per tour
ReviewSchema.index({ user: 1, tour: 1 }, { unique: true, sparse: true });
ReviewSchema.index({ tour: 1, isApproved: 1 });

// Update tour's average rating after save
ReviewSchema.statics.calcAverageRating = async function(tourId) {
  const Tour = require('./Tour');
  const stats = await this.aggregate([
    { $match: { tour: tourId, isApproved: true } },
    { $group: { _id: '$tour', avgRating: { $avg: '$rating' }, numRatings: { $sum: 1 } } }
  ]);
  if (stats.length > 0) {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsAverage: stats[0].avgRating,
      ratingsCount: stats[0].numRatings
    });
  }
};

ReviewSchema.post('save', function() {
  if (this.tour) this.constructor.calcAverageRating(this.tour);
});

const Review = mongoose.model('Review', ReviewSchema);

// ── BLOG POST ────────────────────────────────────────────
const BlogSchema = new mongoose.Schema({
  title:     { type: String, required: true, trim: true },
  slug:      { type: String, unique: true },
  excerpt:   { type: String, maxlength: 300 },
  content:   { type: String, required: true },
  category:  { type: String, enum: ['travel-tips', 'volunteer-stories', 'news', 'wildlife', 'destination-guide'], required: true },
  tags:      [String],
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  coverImage: { url: String, publicId: String },
  images:    [{ url: String, publicId: String }],
  isPublished: { type: Boolean, default: false },
  publishedAt: Date,
  featured:  { type: Boolean, default: false },
  viewCount: { type: Number, default: 0 },
  readTime:  Number, // minutes
  metaTitle: String,
  metaDescription: String,
}, { timestamps: true });

BlogSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    const slugify = require('slugify');
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  if (this.isModified('content')) {
    const words = this.content.split(' ').length;
    this.readTime = Math.ceil(words / 200);
  }
  next();
});

const Blog = mongoose.model('Blog', BlogSchema);

module.exports = { Review, Blog };