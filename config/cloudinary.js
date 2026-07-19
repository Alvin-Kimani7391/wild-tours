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

module.exports = {
  cloudinary,
  storage,
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
  accommodationStorage,
  accommodationUpload
};