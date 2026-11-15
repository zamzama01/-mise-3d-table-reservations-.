import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { db } from './db.js';

export const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export function isCloudinaryConfigured() {
  if (String(process.env.CLOUDINARY_URL || '').trim()) return true;
  return Boolean(
    String(process.env.CLOUDINARY_CLOUD_NAME || '').trim() &&
      String(process.env.CLOUDINARY_API_KEY || '').trim() &&
      String(process.env.CLOUDINARY_API_SECRET || '').trim(),
  );
}

function configureCloudinary() {
  const cloudinaryUrl = String(process.env.CLOUDINARY_URL || '').trim();
  if (cloudinaryUrl) {
    cloudinary.config({ cloudinary_url: cloudinaryUrl, secure: true });
    return true;
  }

  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    return true;
  }
  return false;
}

export const imageUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only JPG, PNG, or WEBP images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

export async function uploadRestaurantImage(buffer, originalName, mimeType) {
  if (configureCloudinary()) {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'mise_restaurants',
            resource_type: 'image',
          },
          (err, res) => {
            if (err || !res) return reject(err || new Error('Upload failed'));
            resolve({ secure_url: res.secure_url, public_id: res.public_id });
          },
        );
        stream.end(buffer);
      });
      return {
        imageUrl: result.secure_url,
        imagePublicId: result.public_id,
        provider: 'cloudinary',
      };
    } catch (err) {
      console.warn('Cloudinary upload failed, falling back to persistent local storage:', err?.message);
    }
  }

  const ext =
    mimeType === 'image/png'
      ? '.png'
      : mimeType === 'image/webp'
        ? '.webp'
        : path.extname(originalName) || '.jpg';
  const filename = `restaurant_${crypto.randomUUID().slice(0, 12)}${ext}`;
  const targetPath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(targetPath, buffer);

  try {
    db.prepare(
      `INSERT OR REPLACE INTO uploaded_images (filename, mimeType, data, createdAt)
       VALUES (?, ?, ?, ?)`,
    ).run(filename, mimeType || 'image/jpeg', buffer, new Date().toISOString());
  } catch (err) {
    console.warn('Could not mirror image to SQLite:', err?.message);
  }

  return {
    imageUrl: `/uploads/${filename}`,
    imagePublicId: `local/${filename}`,
    provider: 'local',
  };
}
