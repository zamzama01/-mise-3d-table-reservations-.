import { Check, Plus, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import {
  DINING_TIME_SLOTS,
  formatPakistaniPhone,
  formatTime12h,
} from '../lib/timeFormat.js';
import { DiningSceneCanvas } from './DiningSceneCanvas.jsx';

export function OwnerDashboardView({
  realtimeTick,
  onRestaurantsChanged,
  theme,
  onToggleTheme,
}) {
  const [restaurants, setRestaurants] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [bookingFilter, setBookingFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const [showNewRestaurant, setShowNewRestaurant] = useState(false);
  const [rName, setRName] = useState('');
  const [rCuisine, setRCuisine] = useState('Pakistani');
  const [rLocation, setRLocation] = useState('Qasimabad, Hyderabad');
  const [rAddress, setRAddress] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rOpen, setROpen] = useState('12:00');
  const [rClose, setRClose] = useState('23:00');
  const [rPrice, setRPrice] = useState('$$$');
  const [rDesc, setRDesc] = useState('');
  const [rImageUrl, setRImageUrl] = useState('');
  const [rImagePublicId, setRImagePublicId] = useState('');
  const [uploadingImg, setUploadingImg] = useState(false);

  const [tNumber, setTNumber] = useState('');
  const [tCapacity, setTCapacity] = useState(4);
  const [tZone, setTZone] = useState('Main Dining');
  const [tShape, setTShape] = useState('rect');
  const [tPosX, setTPosX] = useState(2.2);
  const [tPosZ, setTPosZ] = useState(1.8);

  const loadOwnerData = useCallback(async () => {
    try {
      const [restRes, bkgRes] = await Promise.all([
        api.owner.restaurants(),
        api.owner.bookings(),
      ]);
      setRestaurants(restRes.restaurants);
      setBookings(bkgRes.bookings);
      setSelectedRestaurantId((prev) =>
        prev && restRes.restaurants.some((r) => r.id === prev)
          ? prev
          : restRes.restaurants[0]?.id ?? null,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOwnerData();
  }, [loadOwnerData, realtimeTick]);

  const activeRestaurant =
    restaurants.find((r) => r.id === selectedRestaurantId) || null;

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    setError(null);
    try {
      const uploaded = await api.owner.uploadImage(file);
      setRImageUrl(uploaded.imageUrl);
      setRImagePublicId(uploaded.imagePublicId);
      setStatusMsg('Photo uploaded.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploadingImg(false);
    }
  };

  const handleCreateRestaurant = async (e) => {
    e.preventDefault();
    setError(null);
    if (!rImageUrl) {
      setError('Upload a photo first.');
      return;
    }
    try {
      const res = await api.owner.createRestaurant({
        name: rName,
        description: rDesc,
        cuisine: rCuisine,
        location: rLocation,
        address: rAddress,
        phone: formatPakistaniPhone(rPhone),
        openingTime: rOpen,
        closingTime: rClose,
        priceTier: rPrice,
        imageUrl: rImageUrl,
        imagePublicId: rImagePublicId,
      });
      setShowNewRestaurant(false);
      setRName('');
      setRAddress('');
      setRPhone('');
      setRDesc('');
      setRImageUrl('');
      setRImagePublicId('');
      setSelectedRestaurantId(res.restaurant.id);
      setStatusMsg(`${res.restaurant.name} added.`);
      await loadOwnerData();
      onRestaurantsChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add restaurant.');
    }
  };

  const handleCreateTable = async (e) => {
    e.preventDefault();
    if (!activeRestaurant) return;
    setError(null);
    try {
      await api.owner.createTable(activeRestaurant.id, {
        tableNumber: tNumber,
        capacity: tCapacity,
        zone: tZone,
        shape: tShape,
        posX: tPosX,
        posZ: tPosZ,
      });
      setTNumber('');
      setStatusMsg(`Table ${tNumber.toUpperCase()} added.`);
      await loadOwnerData();
      onRestaurantsChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add table.');
    }
  };

  const handleToggleTableActive = async (table) => {
    try {
      await api.owner.updateTable(table.id, { isActive: !table.isActive });
      await loadOwnerData();
      onRestaurantsChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update table.');
    }
  };

  const handleBookingDecision = async (bookingId, status) => {
    setError(null);
    try {
      await api.owner.updateBookingStatus(bookingId, status);
      setStatusMsg(`Booking ${status}.`);
      await loadOwnerData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed.');
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (selectedRestaurantId && b.restaurantId !== selectedRestaurantId) return false;
    if (bookingFilter !== 'all' && b.status !== bookingFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-[#475569] dark:text-[#94A3B8]">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#0F172A]/10 dark:border-white/10 pb-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
          Owner Studio
        </h1>

        <div className="flex flex-wrap items-center gap-2.5">
          {restaurants.length > 0 && (
            <select
              value={selectedRestaurantId || ''}
              onChange={(e) => setSelectedRestaurantId(e.target.value)}
              className="rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-white dark:bg-[#131822] px-3 py-2 text-sm font-medium text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
            >
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.tables.length} tables)
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setShowNewRestaurant((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-4 py-2 text-xs font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            {showNewRestaurant ? 'Close' : 'Add Restaurant'}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-[#B91C1C]/30 dark:border-[#F87171]/30 bg-[#B91C1C]/8 dark:bg-[#B91C1C]/15 px-4 py-2.5 text-xs font-medium text-[#991B1B] dark:text-[#FCA5A5]">
          {error}
        </p>
      )}
      {statusMsg && (
        <p className="rounded-lg border border-[#15803D]/30 dark:border-[#4ADE80]/30 bg-[#15803D]/8 dark:bg-[#15803D]/15 px-4 py-2.5 text-xs font-medium text-[#166534] dark:text-[#86EFAC]">
          {statusMsg}
        </p>
      )}

      {showNewRestaurant && (
        <form
          onSubmit={handleCreateRestaurant}
          className="rounded-2xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] p-5 sm:p-6 shadow-xs space-y-4"
        >
          <h2 className="font-display text-xl font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            Add Restaurant
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Name
              </label>
              <input
                type="text"
                required
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder="Mehran Dastarkhwan"
                className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F1F5F9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Cuisine
              </label>
              <input
                type="text"
                required
                value={rCuisine}
                onChange={(e) => setRCuisine(e.target.value)}
                className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F1F5F9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Area
              </label>
              <input
                type="text"
                required
                value={rLocation}
                onChange={(e) => setRLocation(e.target.value)}
                className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F1F5F9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Address
              </label>
              <input
                type="text"
                required
                value={rAddress}
                onChange={(e) => setRAddress(e.target.value)}
                placeholder="Auto Bhan Road, Latifabad, Hyderabad"
                className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F1F5F9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Phone (+92)
              </label>
              <div className="flex items-center rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] overflow-hidden">
                <span className="border-r border-[#0F172A]/12 dark:border-white/12 px-2.5 py-2 text-xs font-mono font-semibold text-[#0F766E] dark:text-[#14B8A6] shrink-0">
                  +92
                </span>
                <input
                  type="text"
                  required
                  value={rPhone}
                  onChange={(e) => setRPhone(e.target.value)}
                  placeholder="22 381 4400"
                  className="w-full bg-transparent px-3 py-2 text-sm font-mono text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Opens (PKT)
                </label>
                <select
                  value={rOpen}
                  onChange={(e) => setROpen(e.target.value)}
                  className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-1.5 py-2 text-xs font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                >
                  {DINING_TIME_SLOTS.map((slot) => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Closes (PKT)
                </label>
                <select
                  value={rClose}
                  onChange={(e) => setRClose(e.target.value)}
                  className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-1.5 py-2 text-xs font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                >
                  {DINING_TIME_SLOTS.map((slot) => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Price
                </label>
                <select
                  value={rPrice}
                  onChange={(e) => setRPrice(e.target.value)}
                  className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                >
                  <option value="$$">$$</option>
                  <option value="$$$">$$$</option>
                  <option value="$$$$">$$$$</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Description
              </label>
              <textarea
                rows={2}
                required
                value={rDesc}
                onChange={(e) => setRDesc(e.target.value)}
                placeholder="Short summary of the menu and space..."
                className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F1F5F9]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Photo
              </label>
              <div className="flex items-center gap-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-4 py-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingImg ? 'Uploading...' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                </label>
                {rImageUrl && (
                  <img
                    src={rImageUrl}
                    alt="Preview"
                    className="h-14 w-20 rounded-md object-cover border border-[#0F172A]/15 dark:border-white/15"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewRestaurant(false)}
              className="rounded-lg border border-[#0F172A]/15 dark:border-white/15 px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadingImg}
              className="rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-5 py-2 text-xs font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {!activeRestaurant ? (
        <div className="rounded-xl border border-dashed border-[#0F172A]/20 dark:border-white/15 bg-white dark:bg-[#131822] p-10 text-center">
          <p className="font-display text-xl font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            No restaurants yet
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7">
              <DiningSceneCanvas
                tables={activeRestaurant.tables.filter((t) => t.isActive)}
                selectedTableId={selectedTableId}
                onSelectTable={setSelectedTableId}
                restaurantName={activeRestaurant.name}
                theme={theme}
                onToggleTheme={onToggleTheme}
              />
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] p-5 shadow-xs space-y-4">
              <h2 className="font-display text-xl font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                Tables
              </h2>

              <form
                onSubmit={handleCreateTable}
                className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 border-b border-[#0F172A]/10 dark:border-white/10 pb-4"
              >
                <div>
                  <label className="block text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Label
                  </label>
                  <input
                    type="text"
                    required
                    value={tNumber}
                    onChange={(e) => setTNumber(e.target.value)}
                    placeholder="T9"
                    className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2 text-xs font-mono uppercase text-[#0F172A] dark:text-[#F1F5F9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Seats
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={tCapacity}
                    onChange={(e) => setTCapacity(Number(e.target.value) || 2)}
                    className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2 text-xs font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Zone
                  </label>
                  <select
                    value={tZone}
                    onChange={(e) => setTZone(e.target.value)}
                    className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    <option value="Main Dining">Main Dining</option>
                    <option value="Window">Window</option>
                    <option value="Chef Counter">Chef Counter</option>
                    <option value="Patio">Patio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Style
                  </label>
                  <select
                    value={tShape}
                    onChange={(e) => setTShape(e.target.value)}
                    className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    <option value="round">Round</option>
                    <option value="rect">Rect</option>
                    <option value="banquet">Banquet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    X / Z
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min={-5}
                      max={5}
                      value={tPosX}
                      onChange={(e) => setTPosX(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-1.5 py-2 text-xs font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                    />
                    <input
                      type="number"
                      step="0.5"
                      min={-3.5}
                      max={3.5}
                      value={tPosZ}
                      onChange={(e) => setTPosZ(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-1.5 py-2 text-xs font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-3 py-2 text-xs font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] transition-colors"
                  >
                    Add
                  </button>
                </div>
              </form>

              <div className="max-h-64 overflow-y-auto divide-y divide-[#0F172A]/8 dark:divide-white/8">
                {activeRestaurant.tables.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedTableId(t.id)}
                      className="text-left hover:text-[#0F766E] dark:hover:text-[#14B8A6]"
                    >
                      <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                        {t.tableNumber}
                      </span>{' '}
                      <span className="text-[#475569] dark:text-[#94A3B8]">
                        · {t.capacity} seats · {t.zone}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleTableActive(t)}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        t.isActive
                          ? 'border-[#15803D]/30 dark:border-[#4ADE80]/30 bg-[#15803D]/8 dark:bg-[#15803D]/15 text-[#166534] dark:text-[#86EFAC]'
                          : 'border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] text-[#475569] dark:text-[#94A3B8]'
                      }`}
                    >
                      {t.isActive ? 'Active' : 'Off'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                Reservations — {activeRestaurant.name}
              </h2>

              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#E9ECEF] dark:bg-[#1A2130] p-1">
                {['all', 'pending', 'confirmed', 'completed', 'rejected'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setBookingFilter(f)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      bookingFilter === f
                        ? 'bg-white dark:bg-[#0B0E14] text-[#0F172A] dark:text-[#F1F5F9] shadow-sm'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {filteredBookings.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#475569] dark:text-[#94A3B8]">
                No reservations found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead className="border-b border-[#0F172A]/10 dark:border-white/10 text-[#475569] dark:text-[#94A3B8]">
                    <tr>
                      <th className="py-2.5 pr-4 font-medium">Guest</th>
                      <th className="py-2.5 pr-4 font-medium">Date & Time</th>
                      <th className="py-2.5 pr-4 font-medium">Table</th>
                      <th className="py-2.5 pr-4 font-medium">Guests</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0F172A]/8 dark:divide-white/8">
                    {filteredBookings.map((b) => (
                      <tr
                        key={b.id}
                        className="hover:bg-[#F4F5F7]/70 dark:hover:bg-[#1A2130]/60"
                      >
                        <td className="py-3 pr-4">
                          <p className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                            {b.customerName}
                          </p>
                          <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                            {b.customerEmail}
                          </p>
                          {b.notes && (
                            <p className="mt-0.5 text-[11px] text-[#334155] dark:text-[#CBD5E1]">
                              {b.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9]">
                          {b.bookingDate}
                          <br />
                          <span className="text-[#475569] dark:text-[#94A3B8]">
                            {formatTime12h(b.startTime)}–{formatTime12h(b.endTime)} PKT
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-mono font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                          {b.tableNumber}{' '}
                          <span className="font-sans font-normal text-[#475569] dark:text-[#94A3B8]">
                            ({b.tableZone})
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9]">
                          {b.partySize}
                        </td>
                        <td className="py-3 pr-4 font-semibold capitalize">
                          <span
                            className={
                              b.status === 'confirmed'
                                ? 'text-[#15803D] dark:text-[#4ADE80]'
                                : b.status === 'pending'
                                  ? 'text-[#B45309] dark:text-[#FBBF24]'
                                  : b.status === 'rejected'
                                    ? 'text-[#991B1B] dark:text-[#F87171]'
                                    : 'text-[#475569] dark:text-[#94A3B8]'
                            }
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {b.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBookingDecision(b.id, 'confirmed')
                                  }
                                  className="inline-flex items-center gap-1 rounded-md bg-[#15803D] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#166534]"
                                >
                                  <Check className="h-3 w-3" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBookingDecision(b.id, 'rejected')
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-[#B91C1C]/35 dark:border-[#F87171]/35 px-2.5 py-1 text-[11px] font-semibold text-[#991B1B] dark:text-[#F87171] hover:bg-[#B91C1C]/8"
                                >
                                  <X className="h-3 w-3" />
                                  Decline
                                </button>
                              </>
                            )}
                            {b.status === 'confirmed' && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleBookingDecision(b.id, 'completed')
                                }
                                className="rounded-md border border-[#0F172A]/15 dark:border-white/15 px-2.5 py-1 text-[11px] font-medium text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#E9ECEF] dark:hover:bg-[#1A2130]"
                              >
                                Complete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
