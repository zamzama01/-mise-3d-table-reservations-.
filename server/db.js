import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'mise.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK(role IN ('customer', 'owner')),
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    cuisine TEXT NOT NULL,
    location TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    openingTime TEXT NOT NULL,
    closingTime TEXT NOT NULL,
    priceTier TEXT NOT NULL DEFAULT '$$$',
    imageUrl TEXT NOT NULL,
    imagePublicId TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'pending', 'paused')),
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dining_tables (
    id TEXT PRIMARY KEY,
    restaurantId TEXT NOT NULL,
    tableNumber TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK(capacity >= 1 AND capacity <= 20),
    zone TEXT NOT NULL DEFAULT 'Main Dining',
    shape TEXT NOT NULL DEFAULT 'rect',
    posX REAL NOT NULL DEFAULT 0,
    posZ REAL NOT NULL DEFAULT 0,
    rotationY REAL NOT NULL DEFAULT 0,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (restaurantId) REFERENCES restaurants(id) ON DELETE CASCADE,
    UNIQUE(restaurantId, tableNumber)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL,
    restaurantId TEXT NOT NULL,
    tableId TEXT NOT NULL,
    partySize INTEGER NOT NULL CHECK(partySize >= 1),
    bookingDate TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rejected')),
    notes TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    FOREIGN KEY (customerId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (restaurantId) REFERENCES restaurants(id) ON DELETE CASCADE,
    FOREIGN KEY (tableId) REFERENCES dining_tables(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_availability
    ON bookings (tableId, bookingDate, status, startTime, endTime);

  CREATE INDEX IF NOT EXISTS idx_bookings_customer
    ON bookings (customerId, createdAt);

  CREATE INDEX IF NOT EXISTS idx_bookings_restaurant
    ON bookings (restaurantId, bookingDate);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    bookingId TEXT,
    isRead INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS uploaded_images (
    filename TEXT PRIMARY KEY,
    mimeType TEXT NOT NULL,
    data BLOB NOT NULL,
    createdAt TEXT NOT NULL
  );
`);

export class AppError extends Error {
  constructor(statusCode, message, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

export function todayPktStr() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatTime12h(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return hhmm || '';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function mapUserRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export function mapTableRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    tableNumber: row.tableNumber,
    capacity: Number(row.capacity),
    zone: row.zone,
    shape: row.shape,
    posX: Number(row.posX),
    posZ: Number(row.posZ),
    rotationY: Number(row.rotationY),
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
  };
}

export function mapRestaurantRow(row) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    cuisine: row.cuisine,
    location: row.location,
    address: row.address,
    phone: row.phone,
    openingTime: row.openingTime,
    closingTime: row.closingTime,
    priceTier: row.priceTier,
    imageUrl: row.imageUrl,
    imagePublicId: row.imagePublicId,
    status: row.status,
    createdAt: row.createdAt,
    ...(row.totalTables !== undefined ? { totalTables: Number(row.totalTables) } : {}),
    ...(row.availableTablesCount !== undefined
      ? { availableTablesCount: Number(row.availableTablesCount) }
      : {}),
    ...(row.maxPartyCapacity !== undefined
      ? { maxPartyCapacity: Number(row.maxPartyCapacity) }
      : {}),
  };
}

export function mapBookingRow(row) {
  return {
    id: row.id,
    customerId: row.customerId,
    restaurantId: row.restaurantId,
    tableId: row.tableId,
    partySize: Number(row.partySize),
    bookingDate: row.bookingDate,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    ...(row.restaurantName ? { restaurantName: row.restaurantName } : {}),
    ...(row.restaurantCuisine ? { restaurantCuisine: row.restaurantCuisine } : {}),
    ...(row.restaurantLocation ? { restaurantLocation: row.restaurantLocation } : {}),
    ...(row.restaurantImageUrl ? { restaurantImageUrl: row.restaurantImageUrl } : {}),
    ...(row.tableNumber ? { tableNumber: row.tableNumber } : {}),
    ...(row.tableZone ? { tableZone: row.tableZone } : {}),
    ...(row.tableCapacity !== undefined ? { tableCapacity: Number(row.tableCapacity) } : {}),
    ...(row.customerName ? { customerName: row.customerName } : {}),
    ...(row.customerEmail ? { customerEmail: row.customerEmail } : {}),
    ...(row.customerPhone ? { customerPhone: row.customerPhone } : {}),
  };
}

export function getTableAvailabilityForRestaurant(
  restaurantId,
  bookingDate,
  startTime,
  endTime,
  partySize = 2,
  includeInactive = false,
) {
  const tableRows = db
    .prepare(
      `SELECT * FROM dining_tables WHERE restaurantId = ? ${
        includeInactive ? '' : 'AND isActive = 1'
      } ORDER BY tableNumber ASC`,
    )
    .all(restaurantId);

  const conflictingStmt = db.prepare(`
    SELECT id, startTime, endTime, status
    FROM bookings
    WHERE tableId = ?
      AND bookingDate = ?
      AND status IN ('pending', 'confirmed')
      AND NOT (endTime <= ? OR startTime >= ?)
    LIMIT 1
  `);

  return tableRows.map((row) => {
    const t = mapTableRow(row);
    const conflict = conflictingStmt.get(t.id, bookingDate, startTime, endTime);
    const fitsParty = t.capacity >= partySize;
    return {
      ...t,
      isAvailable: t.isActive && !conflict,
      fitsParty,
      conflictReason: conflict
        ? `Reserved ${formatTime12h(conflict.startTime)}–${formatTime12h(conflict.endTime)}`
        : null,
    };
  });
}

export const createBookingAtomic = db.transaction((input) => {
  const restaurant = db
    .prepare(`SELECT * FROM restaurants WHERE id = ?`)
    .get(input.restaurantId);

  if (!restaurant || restaurant.status !== 'active') {
    throw new AppError(404, 'Restaurant is not accepting reservations.', 'RESTAURANT_NOT_FOUND');
  }

  const table = db
    .prepare(`SELECT * FROM dining_tables WHERE id = ? AND restaurantId = ?`)
    .get(input.tableId, input.restaurantId);

  if (!table || !table.isActive) {
    throw new AppError(404, 'Selected table is unavailable.', 'TABLE_NOT_FOUND');
  }

  if (input.partySize < 1 || input.partySize > Number(table.capacity)) {
    throw new AppError(
      400,
      `Table ${table.tableNumber} seats up to ${table.capacity} guests.`,
      'CAPACITY_EXCEEDED',
    );
  }

  if (input.startTime >= input.endTime) {
    throw new AppError(400, 'End time must be after start time.', 'INVALID_TIME_RANGE');
  }

  if (
    input.startTime < restaurant.openingTime ||
    input.endTime > restaurant.closingTime
  ) {
    throw new AppError(
      400,
      `Hours are ${formatTime12h(restaurant.openingTime)} to ${formatTime12h(restaurant.closingTime)} PKT.`,
      'OUTSIDE_HOURS',
    );
  }

  const conflict = db
    .prepare(
      `SELECT id, startTime, endTime, status
       FROM bookings
       WHERE tableId = ?
         AND bookingDate = ?
         AND status IN ('pending', 'confirmed')
         AND NOT (endTime <= ? OR startTime >= ?)
       LIMIT 1`,
    )
    .get(input.tableId, input.bookingDate, input.startTime, input.endTime);

  if (conflict) {
    throw new AppError(
      409,
      `Table ${table.tableNumber} is already booked (${formatTime12h(conflict.startTime)}–${formatTime12h(conflict.endTime)} PKT). Pick another table or time.`,
      'BOOKING_CONFLICT',
    );
  }

  const id = uid('bkg');
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO bookings (
      id, customerId, restaurantId, tableId, partySize, bookingDate, startTime, endTime, status, notes, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(
    id,
    input.customerId,
    input.restaurantId,
    input.tableId,
    input.partySize,
    input.bookingDate,
    input.startTime,
    input.endTime,
    input.notes.trim(),
    createdAt,
  );

  const customer = db.prepare(`SELECT name FROM users WHERE id = ?`).get(input.customerId);
  const notifId = uid('ntf');
  db.prepare(
    `INSERT INTO notifications (id, userId, title, message, bookingId, isRead, createdAt)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  ).run(
    notifId,
    restaurant.ownerId,
    `New booking at ${restaurant.name}`,
    `${customer?.name ?? 'Guest'} requested Table ${table.tableNumber} for ${input.partySize} (${input.bookingDate}, ${formatTime12h(input.startTime)} PKT).`,
    id,
    createdAt,
  );

  const joined = db
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
    .get(id);

  return mapBookingRow(joined);
});

export function createNotification(userId, title, message, bookingId = null) {
  const id = uid('ntf');
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO notifications (id, userId, title, message, bookingId, isRead, createdAt)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  ).run(id, userId, title, message, bookingId, createdAt);
  return { id, userId, title, message, bookingId, isRead: false, createdAt };
}

export function seedIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) {
    // Sync legacy demo seed records to Zamda & Hyderabad, Pakistan if present
    db.prepare(
      `UPDATE users
       SET name = 'Zamda', email = 'zamda@mise.pk', phone = '+92 300 2418910'
       WHERE id = 'usr_own_marco' AND (name = 'Marco Rossi' OR email = 'marco.rossi@osteriabrava.com')`,
    ).run();
    db.prepare(
      `UPDATE users
       SET phone = '+92 321 3045120'
       WHERE id = 'usr_cust_nadia' AND phone LIKE '+1%'`,
    ).run();

    const hyderabadUpdates = [
      {
        id: 'rst_osteria_brava',
        location: 'Qasimabad, Hyderabad',
        address: 'Wadhu Wah Road, Qasimabad, Hyderabad, Pakistan',
        phone: '+92 22 265 4120',
      },
      {
        id: 'rst_sora_robata',
        location: 'Latifabad, Hyderabad',
        address: 'Auto Bhan Road, Latifabad Unit 7, Hyderabad, Pakistan',
        phone: '+92 22 381 7410',
      },
      {
        id: 'rst_maison_sol',
        location: 'Saddar, Hyderabad',
        address: 'Thandi Sarak, Cantt Saddar, Hyderabad, Pakistan',
        phone: '+92 22 278 3390',
      },
      {
        id: 'rst_zafarani',
        location: 'Citizen Colony, Hyderabad',
        address: 'Jamshoro Road, Citizen Colony, Hyderabad, Pakistan',
        phone: '+92 22 267 8820',
      },
    ];
    const syncRest = db.prepare(
      `UPDATE restaurants SET location = ?, address = ?, phone = ? WHERE id = ?`,
    );
    for (const h of hyderabadUpdates) {
      syncRest.run(h.location, h.address, h.phone, h.id);
    }
    db.prepare(
      `UPDATE restaurants
       SET name = 'Sindhri Haveli',
           cuisine = 'Pakistani',
           description = 'Sindhi biryani, mutton handi, charcoal BBQ, and freshly baked naan.',
           location = 'Qasimabad, Hyderabad',
           address = 'Wadhu Wah Road, Qasimabad, Hyderabad, Pakistan',
           phone = '+92 22 265 4120'
       WHERE id = 'rst_osteria_brava'`,
    ).run();
    db.prepare(
      `UPDATE restaurants
       SET ownerId = 'usr_own_marco',
           cuisine = 'Pakistani & Grill',
           description = 'Open-fire BBQ, mutton karahi, charcoal kebabs, and saffron rice.'
       WHERE id = 'rst_zafarani' AND cuisine = 'Levantine'`,
    ).run();
    return;
  }

  const now = new Date().toISOString();
  const today = todayPktStr();

  const insertUser = db.prepare(
    `INSERT INTO users (id, name, email, passwordHash, phone, role, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const customerId = 'usr_cust_nadia';
  const owner1Id = 'usr_own_marco';
  const owner2Id = 'usr_own_kenji';

  insertUser.run(
    customerId,
    'Nadia Khan',
    'nadia.khan@example.com',
    bcrypt.hashSync('GuestPass123!', 10),
    '+92 321 3045120',
    'customer',
    now,
  );
  insertUser.run(
    owner1Id,
    'Zamda',
    'zamda@mise.pk',
    bcrypt.hashSync('OwnerPass123!', 10),
    '+92 300 2418910',
    'owner',
    now,
  );
  insertUser.run(
    owner2Id,
    'Bilal Qureshi',
    'bilal.qureshi@sorarobata.pk',
    bcrypt.hashSync('OwnerPass123!', 10),
    '+92 301 2894410',
    'owner',
    now,
  );

  const insertRestaurant = db.prepare(
    `INSERT INTO restaurants (
      id, ownerId, name, description, cuisine, location, address, phone,
      openingTime, closingTime, priceTier, imageUrl, imagePublicId, status, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  );

  const restaurantsSeed = [
    {
      id: 'rst_osteria_brava',
      ownerId: owner1Id,
      name: 'Sindhri Haveli',
      description: 'Sindhi biryani, mutton handi, charcoal BBQ, and freshly baked naan.',
      cuisine: 'Pakistani',
      location: 'Qasimabad, Hyderabad',
      address: 'Wadhu Wah Road, Qasimabad, Hyderabad, Pakistan',
      phone: '+92 22 265 4120',
      openingTime: '12:00',
      closingTime: '23:30',
      priceTier: '$$$',
      imageUrl: '/src/assets/images/restaurant_osteria_brava_1794719248080.jpg',
      imagePublicId: 'seed/sindhri_haveli',
    },
    {
      id: 'rst_sora_robata',
      ownerId: owner2Id,
      name: 'Sora Robata',
      description: 'Charcoal robatayaki grill, fresh sushi, and jasmine teas.',
      cuisine: 'Japanese',
      location: 'Latifabad, Hyderabad',
      address: 'Auto Bhan Road, Latifabad Unit 7, Hyderabad, Pakistan',
      phone: '+92 22 381 7410',
      openingTime: '17:00',
      closingTime: '23:30',
      priceTier: '$$$$',
      imageUrl: '/src/assets/images/restaurant_sora_robata_1794719248697.jpg',
      imagePublicId: 'seed/sora_robata',
    },
    {
      id: 'rst_maison_sol',
      ownerId: owner1Id,
      name: 'Maison Sol',
      description: 'Coastal Mediterranean grill, sea bream, and warm flatbreads.',
      cuisine: 'Mediterranean',
      location: 'Saddar, Hyderabad',
      address: 'Thandi Sarak, Cantt Saddar, Hyderabad, Pakistan',
      phone: '+92 22 278 3390',
      openingTime: '11:30',
      closingTime: '23:00',
      priceTier: '$$$',
      imageUrl: '/src/assets/images/restaurant_maison_sol_1794719249297.jpg',
      imagePublicId: 'seed/maison_sol',
    },
    {
      id: 'rst_zafarani',
      ownerId: owner1Id,
      name: 'Zafarani Hearth',
      description: 'Open-fire BBQ, mutton karahi, charcoal kebabs, and saffron rice.',
      cuisine: 'Pakistani & Grill',
      location: 'Citizen Colony, Hyderabad',
      address: 'Jamshoro Road, Citizen Colony, Hyderabad, Pakistan',
      phone: '+92 22 267 8820',
      openingTime: '17:00',
      closingTime: '23:30',
      priceTier: '$$$',
      imageUrl: '/src/assets/images/restaurant_zafarani_1794719249578.jpg',
      imagePublicId: 'seed/zafarani',
    },
  ];

  for (const r of restaurantsSeed) {
    insertRestaurant.run(
      r.id,
      r.ownerId,
      r.name,
      r.description,
      r.cuisine,
      r.location,
      r.address,
      r.phone,
      r.openingTime,
      r.closingTime,
      r.priceTier,
      r.imageUrl,
      r.imagePublicId,
      now,
    );
  }

  const insertTable = db.prepare(
    `INSERT INTO dining_tables (
      id, restaurantId, tableNumber, capacity, zone, shape, posX, posZ, rotationY, isActive, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  );

  const floorTemplate = [
    { suffix: 't1', tableNumber: 'T1', capacity: 2, zone: 'Window', shape: 'round', posX: -4.4, posZ: -2.6, rotationY: 0 },
    { suffix: 't2', tableNumber: 'T2', capacity: 2, zone: 'Window', shape: 'round', posX: -1.6, posZ: -2.6, rotationY: 0.2 },
    { suffix: 't3', tableNumber: 'T3', capacity: 4, zone: 'Window', shape: 'rect', posX: 1.5, posZ: -2.6, rotationY: 0 },
    { suffix: 't4', tableNumber: 'T4', capacity: 4, zone: 'Main Dining', shape: 'rect', posX: -3.6, posZ: 0.4, rotationY: 0 },
    { suffix: 't5', tableNumber: 'T5', capacity: 4, zone: 'Main Dining', shape: 'round', posX: 0.0, posZ: 0.4, rotationY: 0 },
    { suffix: 't6', tableNumber: 'T6', capacity: 6, zone: 'Main Dining', shape: 'banquet', posX: 3.8, posZ: -0.4, rotationY: Math.PI / 2 },
    { suffix: 't7', tableNumber: 'T7', capacity: 2, zone: 'Chef Counter', shape: 'round', posX: -3.8, posZ: 3.0, rotationY: 0 },
    { suffix: 't8', tableNumber: 'T8', capacity: 8, zone: 'Patio', shape: 'banquet', posX: 0.8, posZ: 3.0, rotationY: 0 },
  ];

  for (const r of restaurantsSeed) {
    for (const tpl of floorTemplate) {
      insertTable.run(
        `tbl_${r.id.replace('rst_', '')}_${tpl.suffix}`,
        r.id,
        tpl.tableNumber,
        tpl.capacity,
        tpl.zone,
        tpl.shape,
        tpl.posX,
        tpl.posZ,
        tpl.rotationY,
        now,
      );
    }
  }

  const insertBooking = db.prepare(
    `INSERT INTO bookings (
      id, customerId, restaurantId, tableId, partySize, bookingDate, startTime, endTime, status, notes, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insertBooking.run(
    'bkg_seed_1',
    customerId,
    'rst_osteria_brava',
    'tbl_osteria_brava_t3',
    4,
    today,
    '19:00',
    '20:30',
    'confirmed',
    'Window table for dinner.',
    now,
  );
  insertBooking.run(
    'bkg_seed_2',
    customerId,
    'rst_osteria_brava',
    'tbl_osteria_brava_t6',
    5,
    today,
    '19:00',
    '20:30',
    'pending',
    'Birthday dinner.',
    now,
  );
  insertBooking.run(
    'bkg_seed_3',
    customerId,
    'rst_sora_robata',
    'tbl_sora_robata_t2',
    2,
    today,
    '19:30',
    '21:00',
    'confirmed',
    '',
    now,
  );
}
