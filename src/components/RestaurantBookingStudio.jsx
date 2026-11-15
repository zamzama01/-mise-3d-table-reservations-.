import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  UserCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import {
  authorizeGmailAccess,
  getGmailAccessToken,
  saveBookingToFirestore,
} from '../lib/firebase.js';
import {
  DINING_TIME_SLOTS,
  formatTime12h,
  todayPktIso,
} from '../lib/timeFormat.js';
import { DiningSceneCanvas } from './DiningSceneCanvas.jsx';

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 30);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function RestaurantBookingStudio({
  restaurantId,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialPartySize,
  user,
  theme,
  onToggleTheme,
  realtimeTick,
  onBack,
  onRequireAuth,
  onBookingCreated,
}) {
  const [restaurant, setRestaurant] = useState(null);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  const [bookingDate, setBookingDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [partySize, setPartySize] = useState(initialPartySize);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await api.restaurants.detail(restaurantId, {
        date: bookingDate,
        startTime,
        endTime,
        partySize,
      });
      setRestaurant(res.restaurant);
      setTables(res.tables);

      setSelectedTableId((prev) => {
        const stillThere = res.tables.find((t) => t.id === prev);
        if (stillThere) return stillThere.id;
        const firstOpen = res.tables.find((t) => t.isAvailable && t.fitsParty);
        return firstOpen ? firstOpen.id : res.tables[0]?.id ?? null;
      });
    } catch (err) {
      setErrorBanner({
        message: err instanceof ApiError ? err.message : 'Unable to load restaurant.',
        isConflict: false,
      });
    } finally {
      setLoading(false);
    }
  }, [restaurantId, bookingDate, startTime, endTime, partySize]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail, realtimeTick]);

  const selectedTable = tables.find((t) => t.id === selectedTableId) || null;
  const openMatchingCount = tables.filter((t) => t.isAvailable && t.fitsParty).length;

  const handleSubmitBooking = (e) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessInfo(null);

    if (!user) {
      onRequireAuth();
      return;
    }

    if (!selectedTableId) {
      setErrorBanner({
        message: 'Select a table from the 3D floorplan.',
        isConflict: false,
      });
      return;
    }

    setConfirmOpen(true);
  };

  const executeConfirmedBooking = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const gmailToken = getGmailAccessToken() || '';
      const res = await api.bookings.create(
        {
          restaurantId,
          tableId: selectedTableId,
          partySize,
          bookingDate,
          startTime,
          endTime,
          notes,
        },
        gmailToken,
      );

      let firestoreSaved = false;
      try {
        const fsRes = await saveBookingToFirestore({
          booking: res.booking,
          userName: user.name,
          userEmail: user.email,
        });
        firestoreSaved = Boolean(fsRes?.saved);
      } catch (fsErr) {
        console.warn('Firestore sync skipped or failed:', fsErr);
      }

      setSuccessInfo({
        booking: res.booking,
        emailStatus: res.emailStatus || null,
        firestoreSaved,
      });
      setNotes('');
      onBookingCreated(res.booking);
      await fetchDetail();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorBanner({
          message: err.message,
          isConflict: err.status === 409,
        });
        await fetchDetail();
      } else {
        setErrorBanner({
          message: 'Reservation failed. Please try again.',
          isConflict: false,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAuthorizeAndResendEmail = async () => {
    if (!successInfo?.booking?.id) return;
    setResendingEmail(true);
    setErrorBanner(null);
    try {
      const token = await authorizeGmailAccess();
      const res = await api.bookings.sendConfirmation(successInfo.booking.id, token);
      setSuccessInfo((prev) =>
        prev ? { ...prev, emailStatus: res.emailStatus || prev.emailStatus } : prev,
      );
    } catch (err) {
      setErrorBanner({
        message:
          err?.code === 'auth/popup-closed-by-user'
            ? 'Google authorization popup was closed before completing.'
            : err?.message || 'Could not send Gmail confirmation.',
        isConflict: false,
      });
    } finally {
      setResendingEmail(false);
    }
  };

  if (loading && !restaurant) {
    return (
      <div className="py-12 text-center text-sm text-[#475569] dark:text-[#94A3B8]">
        Loading dining room...
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="rounded-xl border border-[#0F172A]/12 dark:border-white/12 bg-white dark:bg-[#131822] p-8 text-center">
        <p className="text-sm text-[#475569] dark:text-[#94A3B8]">Restaurant not found.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-4 py-2 text-xs font-semibold text-white dark:text-[#0B0E14]"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#0F172A]/10 dark:border-white/10 pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All restaurants
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
            {restaurant.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#475569] dark:text-[#94A3B8]">
            <span className="font-medium text-[#0F172A] dark:text-[#F1F5F9]">
              {restaurant.cuisine}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {restaurant.address}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Clock className="h-3.5 w-3.5" />
              {formatTime12h(restaurant.openingTime)}–{formatTime12h(restaurant.closingTime)} PKT
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Phone className="h-3.5 w-3.5" />
              {restaurant.phone}
            </span>
          </div>
        </div>

        <p className="font-mono text-sm font-semibold tabular-nums text-[#15803D] dark:text-[#4ADE80] shrink-0">
          {openMatchingCount} of {tables.length} tables open
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-4">
          <DiningSceneCanvas
            tables={tables}
            selectedTableId={selectedTableId}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onSelectTable={(id) => {
              setSelectedTableId(id);
              setErrorBanner(null);
            }}
            restaurantName={restaurant.name}
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {tables.map((t) => {
              const isSelected = t.id === selectedTableId;
              const unavailable = !t.isAvailable;
              const tooSmall = t.isAvailable && !t.fitsParty;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTableId(t.id);
                    setErrorBanner(null);
                  }}
                  className={`rounded-xl border p-3 text-left transition-all duration-150 ${
                    isSelected
                      ? 'border-[#0F766E] dark:border-[#14B8A6] bg-[#0F766E]/8 dark:bg-[#14B8A6]/12 shadow-xs'
                      : unavailable
                        ? 'border-[#B91C1C]/25 dark:border-[#F87171]/25 bg-[#B91C1C]/5 dark:bg-[#B91C1C]/10 opacity-85'
                        : tooSmall
                          ? 'border-[#0F172A]/10 dark:border-white/10 bg-[#F4F5F7] dark:bg-[#1A2130] opacity-75'
                          : 'border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] hover:border-[#0F766E]/50 dark:hover:border-[#14B8A6]/50 hover:-translate-y-0.5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      {t.tableNumber}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[#475569] dark:text-[#94A3B8]">
                      {t.capacity} seats
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#475569] dark:text-[#94A3B8] truncate">
                    {t.zone}
                  </p>
                  <p
                    className={`mt-1 text-[11px] font-medium ${
                      unavailable
                        ? 'text-[#991B1B] dark:text-[#F87171]'
                        : tooSmall
                          ? 'text-[#64748B] dark:text-[#94A3B8]'
                          : 'text-[#15803D] dark:text-[#4ADE80]'
                    }`}
                  >
                    {unavailable
                      ? 'Reserved'
                      : tooSmall
                        ? `Max ${t.capacity}`
                        : 'Open'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="lg:col-span-4 rounded-2xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] p-5 sm:p-6 shadow-xs lg:sticky lg:top-20 transition-colors">
          <h2 className="font-display text-xl font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            Book a table
          </h2>

          {user && (
            <div className="mt-3 rounded-lg border border-[#0F766E]/25 dark:border-[#14B8A6]/25 bg-[#0F766E]/6 dark:bg-[#14B8A6]/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                <UserCheck className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#14B8A6] shrink-0" />
                <span className="truncate">{user.name}</span>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-[#475569] dark:text-[#94A3B8] truncate">
                {user.email}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmitBooking} className="mt-4 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={bookingDate}
                min={todayPktIso()}
                onChange={(e) => setBookingDate(e.target.value)}
                className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2.5 text-sm font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Start (PKT)
                </label>
                <select
                  value={startTime}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setStartTime(nextStart);
                    if (nextStart >= endTime) {
                      setEndTime(addMinutes(nextStart, 90));
                    }
                  }}
                  className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2.5 text-xs sm:text-sm font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
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
                  End (PKT)
                </label>
                <select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2.5 text-xs sm:text-sm font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                >
                  {DINING_TIME_SLOTS.map((slot) => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Guests
              </label>
              <div className="flex items-center justify-between rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setPartySize((p) => Math.max(1, p - 1))}
                  className="rounded px-3 py-1.5 text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:bg-white dark:hover:bg-[#131822] transition-colors"
                >
                  −
                </button>
                <span className="font-mono text-sm font-semibold tabular-nums text-[#0F172A] dark:text-[#F1F5F9]">
                  {partySize}
                </span>
                <button
                  type="button"
                  onClick={() => setPartySize((p) => Math.min(12, p + 1))}
                  className="rounded px-3 py-1.5 text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:bg-white dark:hover:bg-[#131822] transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {selectedTable && (
              <div className="rounded-lg border border-[#0F172A]/10 dark:border-white/10 bg-[#F4F5F7] dark:bg-[#1A2130] p-3 text-xs space-y-1">
                <div className="flex items-center justify-between font-medium text-[#0F172A] dark:text-[#F1F5F9]">
                  <span>
                    Table {selectedTable.tableNumber} · {selectedTable.zone}
                  </span>
                  <span className="font-mono tabular-nums">
                    {selectedTable.capacity} seats
                  </span>
                </div>
                {!selectedTable.isAvailable && (
                  <p className="text-[#991B1B] dark:text-[#F87171]">
                    {selectedTable.conflictReason || 'Reserved for this time.'}
                  </p>
                )}
                {selectedTable.isAvailable && !selectedTable.fitsParty && (
                  <p className="text-[#B45309] dark:text-[#FBBF24]">
                    Fits up to {selectedTable.capacity} guests.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Special Requests
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergies, celebration, seating preference..."
                className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
              />
            </div>

            {errorBanner && (
              <div
                className={`rounded-lg border p-3 text-xs ${
                  errorBanner.isConflict
                    ? 'border-[#B91C1C]/35 dark:border-[#F87171]/35 bg-[#B91C1C]/10 text-[#991B1B] dark:text-[#FCA5A5]'
                    : 'border-[#D97706]/35 dark:border-[#FBBF24]/35 bg-[#D97706]/10 text-[#92400E] dark:text-[#FDE68A]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{errorBanner.message}</p>
                </div>
              </div>
            )}

            {successInfo && (
              <div className="rounded-lg border border-[#15803D]/35 dark:border-[#4ADE80]/35 bg-[#15803D]/8 dark:bg-[#15803D]/15 p-3 text-xs text-[#166534] dark:text-[#86EFAC] space-y-1.5">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      Booked Table {successInfo.booking.tableNumber} for {successInfo.booking.partySize} guests
                    </p>
                    <p className="mt-0.5 font-mono text-[11px]">
                      ID: {successInfo.booking.id} · {successInfo.booking.bookingDate} (
                      {formatTime12h(successInfo.booking.startTime)}–
                      {formatTime12h(successInfo.booking.endTime)} PKT)
                    </p>
                  </div>
                </div>
                {successInfo.emailStatus && (
                  <div className="flex flex-col gap-2 border-t border-[#15803D]/20 dark:border-[#4ADE80]/20 pt-2 text-[11px]">
                    <div className="flex items-start gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {successInfo.emailStatus.sent ? (
                        <span>
                          Confirmation email sent to{' '}
                          <strong className="font-mono">{successInfo.emailStatus.recipient}</strong>
                          {successInfo.firestoreSaved ? ' · Saved to Firestore.' : '.'}
                        </span>
                      ) : (
                        <span className="text-[#92400E] dark:text-[#FDE68A]">
                          Booking saved{successInfo.firestoreSaved ? ' to Firestore' : ''}, but email was not sent:{' '}
                          {successInfo.emailStatus.reason}
                        </span>
                      )}
                    </div>
                    {!successInfo.emailStatus.sent && (
                      <button
                        type="button"
                        disabled={resendingEmail}
                        onClick={handleAuthorizeAndResendEmail}
                        className="self-start rounded-md border border-[#0F766E]/40 dark:border-[#14B8A6]/40 bg-white dark:bg-[#131822] px-2.5 py-1.5 text-[11px] font-semibold text-[#0F766E] dark:text-[#14B8A6] hover:bg-[#0F766E]/10 disabled:opacity-60 transition-colors"
                      >
                        {resendingEmail ? 'Sending...' : 'Send Confirmation to Gmail'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !selectedTable}
              className="w-full rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-4 py-3 text-sm font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] disabled:opacity-55 transition-colors"
            >
              {!user
                ? 'Sign in to book'
                : submitting
                  ? 'Booking...'
                  : `Reserve ${selectedTable?.tableNumber || 'Table'}`}
            </button>
          </form>
        </aside>
      </div>

      {confirmOpen && user && selectedTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E14]/65 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-booking-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#0F172A]/12 dark:border-white/12 bg-white dark:bg-[#131822] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#0F172A]/10 dark:border-white/10 pb-3">
              <h3
                id="confirm-booking-title"
                className="font-display text-xl font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
              >
                Confirm Reservation &amp; Email
              </h3>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                aria-label="Cancel"
                className="rounded-lg p-1.5 text-[#475569] dark:text-[#94A3B8] hover:bg-[#0F172A]/5 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 text-xs text-[#334155] dark:text-[#CBD5E1]">
              <p>
                Please confirm saving your reservation at{' '}
                <strong className="text-[#0F172A] dark:text-[#F1F5F9]">{restaurant.name}</strong> and sending a booking confirmation email to{' '}
                <strong className="font-mono text-[#0F766E] dark:text-[#14B8A6]">{user.email}</strong>.
              </p>

              <div className="rounded-lg border border-[#0F172A]/10 dark:border-white/10 bg-[#F4F5F7] dark:bg-[#1A2130] p-3 space-y-1 font-mono text-[11px]">
                <div>Guest: {user.name}</div>
                <div>
                  Table: {selectedTable.tableNumber} ({selectedTable.zone}) · {partySize} guests
                </div>
                <div>
                  When: {bookingDate} · {formatTime12h(startTime)}–{formatTime12h(endTime)} PKT
                </div>
                {notes.trim() && <div>Requests: {notes.trim()}</div>}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-[#0F172A]/15 dark:border-white/15 px-4 py-2 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F4F5F7] dark:hover:bg-[#1A2130]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedBooking}
                className="rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-4 py-2 text-xs font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF]"
              >
                Confirm &amp; Send Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
