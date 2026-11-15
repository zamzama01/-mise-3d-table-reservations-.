import { Calendar, CheckCircle2, Clock, MapPin, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { cancelBookingInFirestore } from '../lib/firebase.js';
import { formatTime12h } from '../lib/timeFormat.js';

const STATUS_META = {
  pending: {
    label: 'Pending',
    colorClass: 'text-[#B45309] dark:text-[#FBBF24]',
  },
  confirmed: {
    label: 'Confirmed',
    colorClass: 'text-[#15803D] dark:text-[#4ADE80]',
  },
  completed: {
    label: 'Completed',
    colorClass: 'text-[#475569] dark:text-[#94A3B8]',
  },
  cancelled: {
    label: 'Cancelled',
    colorClass: 'text-[#64748B] dark:text-[#94A3B8]',
  },
  rejected: {
    label: 'Declined',
    colorClass: 'text-[#991B1B] dark:text-[#F87171]',
  },
};

export function CustomerBookingsView({
  realtimeTick,
  onBrowseRestaurants,
  onOpenRestaurant,
}) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const loadBookings = useCallback(async () => {
    try {
      const res = await api.bookings.my();
      setBookings(res.bookings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings, realtimeTick]);

  const handleCancel = async (id) => {
    setCancellingId(id);
    setError(null);
    try {
      await api.bookings.cancel(id);
      await cancelBookingInFirestore(id).catch(() => {});
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel booking.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#0F172A]/10 dark:border-white/10 pb-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
          My Bookings
        </h1>
        <button
          type="button"
          onClick={onBrowseRestaurants}
          className="rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-white dark:bg-[#131822] px-4 py-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          Browse Restaurants
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-[#B91C1C]/30 dark:border-[#F87171]/30 bg-[#B91C1C]/8 dark:bg-[#B91C1C]/15 px-4 py-3 text-xs font-medium text-[#991B1B] dark:text-[#FCA5A5]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-[#475569] dark:text-[#94A3B8]">
          Loading...
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#0F172A]/20 dark:border-white/15 bg-white dark:bg-[#131822] p-10 text-center">
          <p className="font-display text-xl font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            No bookings yet
          </p>
          <button
            type="button"
            onClick={onBrowseRestaurants}
            className="mt-4 rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-5 py-2.5 text-xs font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] transition-colors"
          >
            Find a Table
          </button>
        </div>
      ) : (
        <div className="divide-y divide-[#0F172A]/10 dark:divide-white/10 rounded-2xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] shadow-xs">
          {bookings.map((b) => {
            const meta = STATUS_META[b.status] || STATUS_META.pending;
            const canCancel = b.status === 'pending' || b.status === 'confirmed';

            return (
              <div
                key={b.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-5 transition-colors hover:bg-[#F4F5F7]/50 dark:hover:bg-[#1A2130]/50"
              >
                <div className="flex items-start gap-3.5 sm:gap-4">
                  {b.restaurantImageUrl && (
                    <img
                      src={b.restaurantImageUrl}
                      alt={b.restaurantName || 'Restaurant'}
                      referrerPolicy="no-referrer"
                      className="h-16 w-20 sm:h-18 sm:w-24 rounded-lg object-cover shrink-0 bg-[#E2E8F0] dark:bg-[#1A2130]"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenRestaurant(b.restaurantId)}
                        className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:text-[#0F766E] dark:hover:text-[#14B8A6] transition-colors text-left"
                      >
                        {b.restaurantName}
                      </button>
                      <span className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        {b.restaurantCuisine} ·{' '}
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {b.restaurantLocation}
                        </span>
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-[#334155] dark:text-[#CBD5E1]">
                      <span className="text-[#0F766E] dark:text-[#14B8A6] font-semibold">
                        #{b.id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-[#64748B] dark:text-[#94A3B8]" />
                        {b.bookingDate}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-[#64748B] dark:text-[#94A3B8]" />
                        {formatTime12h(b.startTime)}–{formatTime12h(b.endTime)} PKT
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Table {b.tableNumber} ({b.tableZone}) · {b.partySize} guests
                      </span>
                    </div>

                    {b.notes && (
                      <p className="mt-1 text-xs text-[#475569] dark:text-[#94A3B8]">
                        {b.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    {b.status === 'confirmed' ? (
                      <CheckCircle2 className="h-4 w-4 text-[#15803D] dark:text-[#4ADE80]" />
                    ) : b.status === 'rejected' || b.status === 'cancelled' ? (
                      <XCircle className="h-4 w-4 text-[#991B1B] dark:text-[#F87171]" />
                    ) : null}
                    <span className={meta.colorClass}>{meta.label}</span>
                  </div>

                  {canCancel && (
                    <button
                      type="button"
                      disabled={cancellingId === b.id}
                      onClick={() => handleCancel(b.id)}
                      className="rounded-lg border border-[#0F172A]/15 dark:border-white/15 px-3 py-2 text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] hover:border-[#B91C1C] dark:hover:border-[#F87171] hover:text-[#991B1B] dark:hover:text-[#F87171] disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {cancellingId === b.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
