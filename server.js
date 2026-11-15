import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { requireAuth, requireRole, signToken } from './server/auth.js';
import {
  imageUploadMiddleware,
  isCloudinaryConfigured,
  uploadRestaurantImage,
  uploadsDir,
} from './server/cloudinary.js';
import {
  AppError,
  createBookingAtomic,
  createNotification,
  db,
  formatTime12h,
  getTableAvailabilityForRestaurant,
  mapBookingRow,
  mapRestaurantRow,
  mapTableRow,
  mapUserRow,
  seedIfEmpty,
  todayPktStr,
} from './server/db.js';
import { isGeminiConfigured, recommendRestaurantsWithGemini } from './server/gemini.js';
import { isMailerConfigured, sendBookingConfirmationEmail } from './server/mailer.js';
import { attachWebSocketServer, broadcastRealtimeEvent } from './server/ws.js';

seedIfEmpty();

function loadFirebaseWebConfig() {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.warn('Could not read firebase-applet-config.json:', err?.message);
  }
  return null;
}

const app = express();
app.use(express.json({ limit: '4mb' }));

app.use('/uploads', express.static(uploadsDir));
app.get('/uploads/:filename', (req, res) => {
  const row = db
    .prepare('SELECT mimeType, data FROM uploaded_images WHERE filename = ?')
    .get(req.params.filename);
  if (!row) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', row.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  res.send(row.data);
});
app.use(
  '/src/assets/images',
  express.static(path.resolve(process.cwd(), 'src/assets/images')),
);

function todayStr() {
  return todayPktStr();
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: 'sqlite-wal',
    jwtConfigured: true,
    geminiConfigured: isGeminiConfigured(),
    cloudinaryConfigured: isCloudinaryConfigured(),
    mailerConfigured: isMailerConfigured(),
    timestamp: new Date().toISOString(),
  });
});

// ==================== AUTH ====================

app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password, phone = '', role = 'customer' } = req.body ?? {};
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'Name is required.' });
      return;
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email is required.' });
      return;
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    const normalizedRole = role === 'owner' ? 'owner' : 'customer';
    const normalizedEmail = email.trim().toLowerCase();

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }

    const id = `usr_${crypto.randomUUID().slice(0, 12)}`;
    const createdAt = new Date().toISOString();
    const passwordHash = bcrypt.hashSync(password, 10);

    db.prepare(
      `INSERT INTO users (id, name, email, passwordHash, phone, role, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name.trim(),
      normalizedEmail,
      passwordHash,
      String(phone || '').trim(),
      normalizedRole,
      createdAt,
    );

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const user = mapUserRow(row);
    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(String(email).trim().toLowerCase());

    if (!row || !bcrypt.compareSync(String(password), row.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const user = mapUserRow(row);
    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Sign in failed.' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body ?? {};
    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Firebase ID token is required.' });
      return;
    }

    const fbConfig = loadFirebaseWebConfig();
    if (!fbConfig?.apiKey) {
      res.status(500).json({ error: 'Firebase project configuration is missing.' });
      return;
    }

    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fbConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );

    const verifyData = await verifyRes.json().catch(() => ({}));
    const fbUser = verifyData?.users?.[0];
    if (!verifyRes.ok || !fbUser?.email) {
      res.status(401).json({ error: 'Invalid or expired Google sign-in token.' });
      return;
    }

    if (!fbUser.emailVerified) {
      res.status(403).json({ error: 'Please verify your Gmail address before signing in.' });
      return;
    }

    const normalizedEmail = String(fbUser.email).trim().toLowerCase();
    const displayName = String(
      fbUser.displayName || normalizedEmail.split('@')[0] || 'Guest',
    ).trim();

    let row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!row) {
      const id = `usr_${crypto.randomUUID().slice(0, 12)}`;
      const createdAt = new Date().toISOString();
      const randomPasswordHash = bcrypt.hashSync(crypto.randomUUID(), 10);

      db.prepare(
        `INSERT INTO users (id, name, email, passwordHash, phone, role, createdAt)
         VALUES (?, ?, ?, ?, '', 'customer', ?)`,
      ).run(id, displayName, normalizedEmail, randomPasswordHash, createdAt);

      row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    } else if (displayName && row.name !== displayName) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(displayName, row.id);
      row = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
    }

    const user = mapUserRow(row);
    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({ token, user });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google sign in failed.' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
  if (!row) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  res.json({ user: mapUserRow(row) });
});

// ==================== RESTAURANTS & AVAILABILITY ====================

app.get('/api/restaurants', (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const cuisine = String(req.query.cuisine || '').trim().toLowerCase();
    const location = String(req.query.location || '').trim().toLowerCase();
    const partySize = Number(req.query.partySize || 2);
    const bookingDate = String(req.query.date || todayStr());
    const startTime = String(req.query.startTime || '19:00');
    const endTime = String(req.query.endTime || '20:30');

    const rows = db
      .prepare(`SELECT * FROM restaurants WHERE status = 'active' ORDER BY createdAt ASC`)
      .all();

    const restaurants = rows
      .map(mapRestaurantRow)
      .filter((r) => {
        if (
          search &&
          !`${r.name} ${r.cuisine} ${r.location} ${r.description}`
            .toLowerCase()
            .includes(search)
        ) {
          return false;
        }
        if (cuisine && cuisine !== 'all' && r.cuisine.toLowerCase() !== cuisine) {
          return false;
        }
        if (location && location !== 'all' && r.location.toLowerCase() !== location) {
          return false;
        }
        return true;
      })
      .map((r) => {
        const tables = getTableAvailabilityForRestaurant(
          r.id,
          bookingDate,
          startTime,
          endTime,
          partySize,
        );
        const availableTablesCount = tables.filter(
          (t) => t.isAvailable && t.fitsParty,
        ).length;
        const maxPartyCapacity = tables.reduce(
          (acc, t) => Math.max(acc, t.capacity),
          0,
        );
        return {
          ...r,
          totalTables: tables.length,
          availableTablesCount,
          maxPartyCapacity,
        };
      });

    res.json({ restaurants });
  } catch (err) {
    console.error('List restaurants error:', err);
    res.status(500).json({ error: 'Failed to load restaurants.' });
  }
});

app.get('/api/restaurants/:id', (req, res) => {
  try {
    const row = db
      .prepare('SELECT * FROM restaurants WHERE id = ?')
      .get(req.params.id);

    if (!row) {
      res.status(404).json({ error: 'Restaurant not found.' });
      return;
    }

    const bookingDate = String(req.query.date || todayStr());
    const startTime = String(req.query.startTime || '19:00');
    const endTime = String(req.query.endTime || '20:30');
    const partySize = Number(req.query.partySize || 2);

    const restaurant = mapRestaurantRow(row);
    const tables = getTableAvailabilityForRestaurant(
      restaurant.id,
      bookingDate,
      startTime,
      endTime,
      partySize,
    );

    res.json({ restaurant, tables });
  } catch (err) {
    console.error('Get restaurant error:', err);
    res.status(500).json({ error: 'Failed to load restaurant.' });
  }
});

app.get('/api/restaurants/:id/availability', (req, res) => {
  try {
    const row = db
      .prepare('SELECT * FROM restaurants WHERE id = ?')
      .get(req.params.id);

    if (!row) {
      res.status(404).json({ error: 'Restaurant not found.' });
      return;
    }

    const bookingDate = String(req.query.date || todayStr());
    const startTime = String(req.query.startTime || '19:00');
    const endTime = String(req.query.endTime || '20:30');
    const partySize = Number(req.query.partySize || 2);

    const tables = getTableAvailabilityForRestaurant(
      row.id,
      bookingDate,
      startTime,
      endTime,
      partySize,
    );

    res.json({
      restaurantId: row.id,
      bookingDate,
      startTime,
      endTime,
      partySize,
      tables,
    });
  } catch (err) {
    console.error('Availability error:', err);
    res.status(500).json({ error: 'Failed to check availability.' });
  }
});

// ==================== CUSTOMER BOOKINGS ====================

app.post('/api/bookings', requireAuth, async (req, res) => {
  try {
    const {
      restaurantId,
      tableId,
      partySize,
      bookingDate,
      startTime,
      endTime,
      notes = '',
    } = req.body ?? {};

    if (!restaurantId || !tableId || !bookingDate || !startTime || !endTime) {
      res.status(400).json({ error: 'All booking fields are required.' });
      return;
    }

    const parsedParty = Number(partySize);
    if (!Number.isInteger(parsedParty) || parsedParty < 1 || parsedParty > 20) {
      res.status(400).json({ error: 'Party size must be between 1 and 20.' });
      return;
    }

    const booking = createBookingAtomic({
      customerId: req.user.userId,
      restaurantId: String(restaurantId),
      tableId: String(tableId),
      partySize: parsedParty,
      bookingDate: String(bookingDate),
      startTime: String(startTime),
      endTime: String(endTime),
      notes: String(notes || ''),
    });

    broadcastRealtimeEvent('booking:created', {
      restaurantId: booking.restaurantId,
      tableId: booking.tableId,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      booking,
    });

    const restaurantRow = db
      .prepare('SELECT address, phone, location FROM restaurants WHERE id = ?')
      .get(booking.restaurantId);

    const gmailAccessToken = String(req.headers['x-gmail-access-token'] || '').trim();

    const emailStatus = await sendBookingConfirmationEmail({
      bookingId: booking.id,
      guestName: booking.customerName || req.user.name || 'Guest',
      guestEmail: booking.customerEmail || req.user.email,
      restaurantName: booking.restaurantName,
      restaurantLocation: restaurantRow?.location || booking.restaurantLocation,
      restaurantAddress: restaurantRow?.address || '',
      restaurantPhone: restaurantRow?.phone || '',
      tableNumber: booking.tableNumber,
      tableZone: booking.tableZone,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      partySize: booking.partySize,
      notes: booking.notes,
      gmailAccessToken,
    });

    res.status(201).json({ booking, emailStatus });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Unable to create booking.' });
  }
});

app.post('/api/bookings/:id/send-confirmation', requireAuth, async (req, res) => {
  try {
    const row = db
      .prepare(
        `SELECT b.*,
                r.name AS restaurantName, r.location AS restaurantLocation, r.address AS restaurantAddress, r.phone AS restaurantPhone,
                t.tableNumber AS tableNumber, t.zone AS tableZone,
                u.name AS customerName, u.email AS customerEmail
         FROM bookings b
         JOIN restaurants r ON r.id = b.restaurantId
         JOIN dining_tables t ON t.id = b.tableId
         JOIN users u ON u.id = b.customerId
         WHERE b.id = ?`,
      )
      .get(req.params.id);

    if (!row) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    if (row.customerId !== req.user.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const gmailAccessToken = String(req.headers['x-gmail-access-token'] || '').trim();
    const emailStatus = await sendBookingConfirmationEmail({
      bookingId: row.id,
      guestName: row.customerName || req.user.name || 'Guest',
      guestEmail: row.customerEmail || req.user.email,
      restaurantName: row.restaurantName,
      restaurantLocation: row.restaurantLocation,
      restaurantAddress: row.restaurantAddress || '',
      restaurantPhone: row.restaurantPhone || '',
      tableNumber: row.tableNumber,
      tableZone: row.tableZone,
      bookingDate: row.bookingDate,
      startTime: row.startTime,
      endTime: row.endTime,
      partySize: Number(row.partySize),
      notes: row.notes || '',
      gmailAccessToken,
    });

    res.json({ emailStatus });
  } catch (err) {
    console.error('Resend confirmation error:', err);
    res.status(500).json({ error: 'Unable to send confirmation email.' });
  }
});

app.get('/api/bookings/my', requireAuth, (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT b.*,
                r.name AS restaurantName, r.cuisine AS restaurantCuisine, r.location AS restaurantLocation, r.imageUrl AS restaurantImageUrl,
                t.tableNumber AS tableNumber, t.zone AS tableZone, t.capacity AS tableCapacity
         FROM bookings b
         JOIN restaurants r ON r.id = b.restaurantId
         JOIN dining_tables t ON t.id = b.tableId
         WHERE b.customerId = ?
         ORDER BY b.bookingDate DESC, b.startTime DESC, b.createdAt DESC`,
      )
      .all(req.user.userId);

    res.json({ bookings: rows.map(mapBookingRow) });
  } catch (err) {
    console.error('Get bookings error:', err);
    res.status(500).json({ error: 'Failed to load bookings.' });
  }
});

app.patch('/api/bookings/:id/cancel', requireAuth, (req, res) => {
  try {
    const existing = db
      .prepare('SELECT * FROM bookings WHERE id = ?')
      .get(req.params.id);

    if (!existing) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }

    if (existing.customerId !== req.user.userId) {
      res.status(403).json({ error: 'You can only cancel your own bookings.' });
      return;
    }

    if (existing.status === 'cancelled' || existing.status === 'completed') {
      res.status(400).json({ error: `Cannot cancel a ${existing.status} booking.` });
      return;
    }

    db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(existing.id);

    const restaurant = db
      .prepare('SELECT ownerId, name FROM restaurants WHERE id = ?')
      .get(existing.restaurantId);
    if (restaurant) {
      createNotification(
        restaurant.ownerId,
        `Booking cancelled at ${restaurant.name}`,
        `Guest cancelled ${existing.bookingDate} (${formatTime12h(existing.startTime)}–${formatTime12h(existing.endTime)} PKT).`,
        existing.id,
      );
    }

    const updated = db
      .prepare(
        `SELECT b.*,
                r.name AS restaurantName, r.cuisine AS restaurantCuisine, r.location AS restaurantLocation, r.imageUrl AS restaurantImageUrl,
                t.tableNumber AS tableNumber, t.zone AS tableZone, t.capacity AS tableCapacity
         FROM bookings b
         JOIN restaurants r ON r.id = b.restaurantId
         JOIN dining_tables t ON t.id = b.tableId
         WHERE b.id = ?`,
      )
      .get(existing.id);

    const booking = mapBookingRow(updated);
    broadcastRealtimeEvent('booking:updated', {
      restaurantId: booking.restaurantId,
      tableId: booking.tableId,
      bookingDate: booking.bookingDate,
      booking,
    });

    res.json({ booking });
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel booking.' });
  }
});

// ==================== OWNER ROUTES ====================

app.get(
  '/api/owner/restaurants',
  requireAuth,
  requireRole('owner'),
  (req, res) => {
    try {
      const rows = db
        .prepare('SELECT * FROM restaurants WHERE ownerId = ? ORDER BY createdAt DESC')
        .all(req.user.userId);

      const restaurants = rows.map((row) => {
        const r = mapRestaurantRow(row);
        const tables = db
          .prepare('SELECT * FROM dining_tables WHERE restaurantId = ? ORDER BY tableNumber ASC')
          .all(r.id)
          .map(mapTableRow);
        return { ...r, tables };
      });

      res.json({ restaurants });
    } catch (err) {
      console.error('Owner restaurants error:', err);
      res.status(500).json({ error: 'Failed to load restaurants.' });
    }
  },
);

app.post(
  '/api/upload/restaurant-image',
  requireAuth,
  requireRole('owner'),
  imageUploadMiddleware.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Select an image file first.' });
        return;
      }

      const uploaded = await uploadRestaurantImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );
      res.status(201).json(uploaded);
    } catch (err) {
      console.error('Upload error:', err);
      res.status(400).json({ error: err?.message || 'Upload failed.' });
    }
  },
);

app.post('/api/restaurants', requireAuth, requireRole('owner'), (req, res) => {
  try {
    const {
      name,
      description,
      cuisine,
      location,
      address,
      phone,
      openingTime = '12:00',
      closingTime = '23:00',
      priceTier = '$$$',
      imageUrl,
      imagePublicId = '',
    } = req.body ?? {};

    if (!name || !description || !cuisine || !location || !address || !phone || !imageUrl) {
      res.status(400).json({ error: 'All restaurant fields and photo are required.' });
      return;
    }

    const id = `rst_${crypto.randomUUID().slice(0, 12)}`;
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO restaurants (
        id, ownerId, name, description, cuisine, location, address, phone,
        openingTime, closingTime, priceTier, imageUrl, imagePublicId, status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    ).run(
      id,
      req.user.userId,
      String(name).trim(),
      String(description).trim(),
      String(cuisine).trim(),
      String(location).trim(),
      String(address).trim(),
      String(phone).trim(),
      String(openingTime).trim(),
      String(closingTime).trim(),
      String(priceTier).trim(),
      String(imageUrl).trim(),
      String(imagePublicId).trim(),
      createdAt,
    );

    const defaults = [
      { num: 'T1', cap: 2, zone: 'Window', shape: 'round', x: -3.2, z: -2.2 },
      { num: 'T2', cap: 4, zone: 'Main Dining', shape: 'rect', x: 0.0, z: 0.0 },
      { num: 'T3', cap: 4, zone: 'Main Dining', shape: 'rect', x: 3.2, z: 0.0 },
      { num: 'T4', cap: 6, zone: 'Patio', shape: 'banquet', x: 0.0, z: 2.8 },
    ];
    const insTbl = db.prepare(
      `INSERT INTO dining_tables (
        id, restaurantId, tableNumber, capacity, zone, shape, posX, posZ, rotationY, isActive, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
    );
    for (const d of defaults) {
      insTbl.run(
        `tbl_${crypto.randomUUID().slice(0, 10)}`,
        id,
        d.num,
        d.cap,
        d.zone,
        d.shape,
        d.x,
        d.z,
        createdAt,
      );
    }

    const row = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
    const restaurant = mapRestaurantRow(row);
    const tables = db
      .prepare('SELECT * FROM dining_tables WHERE restaurantId = ?')
      .all(id)
      .map(mapTableRow);

    broadcastRealtimeEvent('restaurant:created', { restaurant });
    res.status(201).json({ restaurant: { ...restaurant, tables } });
  } catch (err) {
    console.error('Create restaurant error:', err);
    res.status(500).json({ error: 'Failed to create restaurant.' });
  }
});

app.patch('/api/restaurants/:id', requireAuth, requireRole('owner'), (req, res) => {
  try {
    const existing = db
      .prepare('SELECT * FROM restaurants WHERE id = ?')
      .get(req.params.id);

    if (!existing) {
      res.status(404).json({ error: 'Restaurant not found.' });
      return;
    }

    if (existing.ownerId !== req.user.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const b = req.body ?? {};
    db.prepare(
      `UPDATE restaurants
       SET name = ?, description = ?, cuisine = ?, location = ?, address = ?,
           phone = ?, openingTime = ?, closingTime = ?, priceTier = ?,
           imageUrl = ?, imagePublicId = ?, status = ?
       WHERE id = ?`,
    ).run(
      b.name ?? existing.name,
      b.description ?? existing.description,
      b.cuisine ?? existing.cuisine,
      b.location ?? existing.location,
      b.address ?? existing.address,
      b.phone ?? existing.phone,
      b.openingTime ?? existing.openingTime,
      b.closingTime ?? existing.closingTime,
      b.priceTier ?? existing.priceTier,
      b.imageUrl ?? existing.imageUrl,
      b.imagePublicId ?? existing.imagePublicId,
      b.status ?? existing.status,
      existing.id,
    );

    const updated = mapRestaurantRow(
      db.prepare('SELECT * FROM restaurants WHERE id = ?').get(existing.id),
    );
    broadcastRealtimeEvent('restaurant:updated', { restaurant: updated });
    res.json({ restaurant: updated });
  } catch (err) {
    console.error('Update restaurant error:', err);
    res.status(500).json({ error: 'Failed to update restaurant.' });
  }
});

app.post(
  '/api/restaurants/:id/tables',
  requireAuth,
  requireRole('owner'),
  (req, res) => {
    try {
      const restaurant = db
        .prepare('SELECT * FROM restaurants WHERE id = ?')
        .get(req.params.id);

      if (!restaurant) {
        res.status(404).json({ error: 'Restaurant not found.' });
        return;
      }
      if (restaurant.ownerId !== req.user.userId) {
        res.status(403).json({ error: 'Access denied.' });
        return;
      }

      const {
        tableNumber,
        capacity,
        zone = 'Main Dining',
        shape = 'rect',
        posX = 0,
        posZ = 0,
        rotationY = 0,
      } = req.body ?? {};

      if (!tableNumber || !String(tableNumber).trim()) {
        res.status(400).json({ error: 'Table label is required.' });
        return;
      }
      const cap = Number(capacity);
      if (!Number.isInteger(cap) || cap < 1 || cap > 20) {
        res.status(400).json({ error: 'Seats must be between 1 and 20.' });
        return;
      }

      const duplicate = db
        .prepare(
          'SELECT id FROM dining_tables WHERE restaurantId = ? AND UPPER(tableNumber) = UPPER(?)',
        )
        .get(restaurant.id, String(tableNumber).trim());
      if (duplicate) {
        res.status(409).json({ error: `Table ${tableNumber} already exists.` });
        return;
      }

      const id = `tbl_${crypto.randomUUID().slice(0, 12)}`;
      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO dining_tables (
          id, restaurantId, tableNumber, capacity, zone, shape, posX, posZ, rotationY, isActive, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(
        id,
        restaurant.id,
        String(tableNumber).trim().toUpperCase(),
        cap,
        String(zone),
        String(shape),
        Number(posX) || 0,
        Number(posZ) || 0,
        Number(rotationY) || 0,
        createdAt,
      );

      const table = mapTableRow(
        db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(id),
      );
      broadcastRealtimeEvent('table:updated', { restaurantId: restaurant.id, table });
      res.status(201).json({ table });
    } catch (err) {
      console.error('Create table error:', err);
      res.status(500).json({ error: 'Failed to add table.' });
    }
  },
);

app.patch(
  '/api/tables/:tableId',
  requireAuth,
  requireRole('owner'),
  (req, res) => {
    try {
      const existing = db
        .prepare(
          `SELECT t.*, r.ownerId
           FROM dining_tables t
           JOIN restaurants r ON r.id = t.restaurantId
           WHERE t.id = ?`,
        )
        .get(req.params.tableId);

      if (!existing) {
        res.status(404).json({ error: 'Table not found.' });
        return;
      }
      if (existing.ownerId !== req.user.userId) {
        res.status(403).json({ error: 'Access denied.' });
        return;
      }

      const b = req.body ?? {};
      db.prepare(
        `UPDATE dining_tables
         SET tableNumber = ?, capacity = ?, zone = ?, shape = ?, posX = ?, posZ = ?, rotationY = ?, isActive = ?
         WHERE id = ?`,
      ).run(
        b.tableNumber !== undefined ? String(b.tableNumber).trim().toUpperCase() : existing.tableNumber,
        b.capacity !== undefined ? Number(b.capacity) : existing.capacity,
        b.zone ?? existing.zone,
        b.shape ?? existing.shape,
        b.posX !== undefined ? Number(b.posX) : existing.posX,
        b.posZ !== undefined ? Number(b.posZ) : existing.posZ,
        b.rotationY !== undefined ? Number(b.rotationY) : existing.rotationY,
        b.isActive !== undefined ? (b.isActive ? 1 : 0) : existing.isActive,
        existing.id,
      );

      const table = mapTableRow(
        db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(existing.id),
      );
      broadcastRealtimeEvent('table:updated', { restaurantId: existing.restaurantId, table });
      res.json({ table });
    } catch (err) {
      console.error('Update table error:', err);
      res.status(500).json({ error: 'Failed to update table.' });
    }
  },
);

app.get('/api/owner/bookings', requireAuth, requireRole('owner'), (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT b.*,
                r.name AS restaurantName, r.cuisine AS restaurantCuisine, r.location AS restaurantLocation, r.imageUrl AS restaurantImageUrl,
                t.tableNumber AS tableNumber, t.zone AS tableZone, t.capacity AS tableCapacity,
                u.name AS customerName, u.email AS customerEmail, u.phone AS customerPhone
         FROM bookings b
         JOIN restaurants r ON r.id = b.restaurantId
         JOIN dining_tables t ON t.id = b.tableId
         JOIN users u ON u.id = b.customerId
         WHERE r.ownerId = ?
         ORDER BY b.bookingDate DESC, b.startTime ASC, b.createdAt DESC`,
      )
      .all(req.user.userId);

    res.json({ bookings: rows.map(mapBookingRow) });
  } catch (err) {
    console.error('Owner bookings error:', err);
    res.status(500).json({ error: 'Failed to load bookings.' });
  }
});

app.patch(
  '/api/owner/bookings/:id/status',
  requireAuth,
  requireRole('owner'),
  (req, res) => {
    try {
      const { status } = req.body ?? {};
      const allowed = ['confirmed', 'rejected', 'completed', 'cancelled'];
      if (!allowed.includes(status)) {
        res.status(400).json({ error: 'Invalid status.' });
        return;
      }

      const existing = db
        .prepare(
          `SELECT b.*, r.ownerId, r.name AS restaurantName, t.tableNumber
           FROM bookings b
           JOIN restaurants r ON r.id = b.restaurantId
           JOIN dining_tables t ON t.id = b.tableId
           WHERE b.id = ?`,
        )
        .get(req.params.id);

      if (!existing) {
        res.status(404).json({ error: 'Booking not found.' });
        return;
      }
      if (existing.ownerId !== req.user.userId) {
        res.status(403).json({ error: 'Access denied.' });
        return;
      }

      db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, existing.id);

      createNotification(
        existing.customerId,
        `Booking ${status} at ${existing.restaurantName}`,
        `Table ${existing.tableNumber} on ${existing.bookingDate} (${formatTime12h(existing.startTime)}–${formatTime12h(existing.endTime)} PKT) is ${status}.`,
        existing.id,
      );

      const updated = db
        .prepare(
          `SELECT b.*,
                  r.name AS restaurantName, r.cuisine AS restaurantCuisine, r.location AS restaurantLocation, r.imageUrl AS restaurantImageUrl,
                  t.tableNumber AS tableNumber, t.zone AS tableZone, t.capacity AS tableCapacity,
                  u.name AS customerName, u.email AS customerEmail, u.phone AS customerPhone
           FROM bookings b
           JOIN restaurants r ON r.id = b.restaurantId
           JOIN dining_tables t ON t.id = b.tableId
           JOIN users u ON u.id = b.customerId
           WHERE b.id = ?`,
        )
        .get(existing.id);

      const booking = mapBookingRow(updated);
      broadcastRealtimeEvent('booking:updated', {
        restaurantId: booking.restaurantId,
        tableId: booking.tableId,
        bookingDate: booking.bookingDate,
        booking,
      });

      res.json({ booking });
    } catch (err) {
      console.error('Update status error:', err);
      res.status(500).json({ error: 'Failed to update status.' });
    }
  },
);

// ==================== NOTIFICATIONS ====================

app.get('/api/notifications', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 20')
    .all(req.user.userId);
  res.json({
    notifications: rows.map((r) => ({
      ...r,
      isRead: Boolean(r.isRead),
    })),
  });
});

app.patch('/api/notifications/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ?').run(req.user.userId);
  res.json({ ok: true });
});

// ==================== GEMINI RECOMMENDATIONS ====================

app.post('/api/ai/recommend', async (req, res) => {
  try {
    const {
      cuisine = '',
      location = '',
      partySize = 2,
      bookingDate = todayStr(),
      startTime = '19:00',
      endTime = '20:30',
      preferences = '',
    } = req.body ?? {};

    const result = await recommendRestaurantsWithGemini({
      cuisine: String(cuisine),
      location: String(location),
      partySize: Math.max(1, Number(partySize) || 2),
      bookingDate: String(bookingDate),
      startTime: String(startTime),
      endTime: String(endTime),
      preferences: String(preferences),
    });

    res.json(result);
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({
      error: err?.message || 'Unable to get recommendations right now.',
    });
  }
});

// ==================== SERVER BOOT ====================

async function startServer() {
  const PORT = 3000;
  const server = http.createServer(app);
  attachWebSocketServer(server);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'API route not found.' });
    });
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mise server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
