const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Existing tour/booking upload (unchanged) ──────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'tours',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
  }
});

const upload = multer({ storage });

const uploadToCloudinary = async (filePath, folder = 'tours') => {
  return await cloudinary.uploader.upload(filePath, { folder });
};

const deleteFromCloudinary = async (publicId) => {
  return await cloudinary.uploader.destroy(publicId);
};

// ── Accommodation media (images + video) ──────────────────
// resource_type must be 'auto' so Cloudinary accepts either an image
// or a video through the same field, and stores each under the
// correct resource type on their end.
const accommodationStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const isVideo = file.mimetype.startsWith('video/');
    return {
      folder: `wildroots/accommodations/${req.params.id || 'unfiled'}`,
      resource_type: isVideo ? 'video' : 'image',
      allowed_formats: isVideo
        ? ['mp4', 'mov', 'webm']
        : ['jpg', 'jpeg', 'png', 'webp'],
      // Generates a jpg thumbnail frame for videos automatically.
      ...(isVideo ? { eager: [{ width: 400, height: 300, crop: 'pad', format: 'jpg' }] } : {})
    };
  }
});

const accommodationUpload = multer({
  storage: accommodationStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype) || /^video\/(mp4|quicktime|webm)$/.test(file.mimetype);
    cb(ok ? null : new Error('Only JPG, PNG, WEBP images or MP4, MOV, WEBM video are allowed.'), ok);
  }
});

// ── Payment receipts / proof-of-payment (bank transfer) ────
// Used by POST /api/bookings/:id/upload-proof for both tour and
// accommodation bookings. Receipts are frequently PDFs (bank apps
// export statements as PDF), so this needs its own storage config —
// the generic `upload`/`storage` above only allow image formats and
// would silently reject a PDF receipt.
//
// resource_type: 'auto' lets Cloudinary route images to its image
// pipeline and PDFs to its raw/image-as-document pipeline correctly.
// Some Cloudinary accounts have PDF/raw delivery disabled by default
// for security reasons — if uploads here start failing with an
// "unsupported format" or "delivery disabled" error, enable PDF/raw
// delivery in the Cloudinary dashboard under Settings → Security.
const receiptStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'wildroots/payment-proofs',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
  })
});

const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — matches the limit shown in the booking UI
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype) || file.mimetype === 'application/pdf';
    cb(ok ? null : new Error('Only JPG, PNG, WEBP images or PDF receipts are allowed.'), ok);
  }
});

module.exports = {
  cloudinary,
  storage,
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
  accommodationStorage,
  accommodationUpload,
  receiptStorage,
  receiptUpload
};