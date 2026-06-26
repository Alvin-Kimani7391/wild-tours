const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// GALLERY ITEM SCHEMA
// Each document = one photo in the public gallery.
// Mirrors the data attributes used in gallery.html:
//   data-category, data-title, data-location + the img src
// ─────────────────────────────────────────────────────────────────────────────

const gallerySchema = new mongoose.Schema(
  {
    // ── Image ──────────────────────────────────────────────────────────────
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true,
    },
    publicId: {
      // Cloudinary public_id — needed for deletion
      type: String,
      required: [true, 'Cloudinary public ID is required'],
      trim: true,
    },
    thumbnailUrl: {
      // Optional smaller version (auto-generated or Cloudinary transformation)
      type: String,
      default: '',
    },

    // ── Metadata (maps to gallery.html data-* attributes) ─────────────────
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
      maxlength: [120, 'Location cannot exceed 120 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: ['wildlife', 'safari', 'volunteer', 'culture', 'landscape'],
        message: 'Category must be one of: wildlife, safari, volunteer, culture, landscape',
      },
    },
    description: {
      type: String,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    altText: {
      // Accessibility — defaults to title if not provided
      type: String,
      default: '',
      maxlength: [200, 'Alt text cannot exceed 200 characters'],
    },

    // ── Display control ────────────────────────────────────────────────────
    isPublished: {
      type: Boolean,
      default: true,   // visible on the public gallery immediately
    },
    isFeatured: {
      type: Boolean,
      default: false,  // pinned to the top when featured
    },
    displayOrder: {
      type: Number,
      default: 0,      // higher = shown first within a category
    },
    tags: {
      type: [String],
      default: [],
    },

    // ── Attribution ────────────────────────────────────────────────────────
    photographer: {
      type: String,
      default: 'WildRoots Africa',
      trim: true,
    },
    capturedAt: {
      // When the photo was actually taken (optional)
      type: Date,
      default: null,
    },

    // ── Metrics ────────────────────────────────────────────────────────────
    views: {
      type: Number,
      default: 0,
    },

    // ── Who uploaded it ────────────────────────────────────────────────────
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,   // createdAt + updatedAt
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
gallerySchema.index({ category: 1, isPublished: 1, displayOrder: -1 });
gallerySchema.index({ isFeatured: 1, isPublished: 1 });
gallerySchema.index({ createdAt: -1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────

// Resolved alt text — falls back to title
gallerySchema.virtual('resolvedAlt').get(function () {
  return this.altText || this.title;
});

// ─── Pre-save hook ────────────────────────────────────────────────────────────

gallerySchema.pre('save', function (next) {
  // Auto-fill thumbnailUrl with a Cloudinary w_400 transformation if not set
  if (!this.thumbnailUrl && this.imageUrl && this.imageUrl.includes('cloudinary.com')) {
    this.thumbnailUrl = this.imageUrl.replace('/upload/', '/upload/w_400,f_auto,q_auto/');
  }
  next();
});

module.exports = mongoose.model('Gallery', gallerySchema);