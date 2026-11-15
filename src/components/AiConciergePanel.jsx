import { ArrowRight, Compass, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { formatTime12h } from '../lib/timeFormat.js';

export function AiConciergePanel({
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  defaultPartySize,
  cuisines,
  locations,
  onSelectRestaurant,
}) {
  const [cuisine, setCuisine] = useState('Any');
  const [location, setLocation] = useState('Any');
  const [partySize, setPartySize] = useState(defaultPartySize);
  const [preferences, setPreferences] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleRecommend = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.ai.recommend({
        cuisine: cuisine === 'Any' ? '' : cuisine,
        location: location === 'Any' ? '' : location,
        partySize,
        bookingDate: defaultDate,
        startTime: defaultStartTime,
        endTime: defaultEndTime,
        preferences,
      });
      setResult(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to fetch suggestions.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      id="ai-concierge"
      className="rounded-2xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] p-5 sm:p-7 shadow-xs transition-colors"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0F766E] dark:text-[#14B8A6]">
            Smart Concierge
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
            Dining Assistant
          </h2>
          <p className="mt-1.5 text-sm text-[#475569] dark:text-[#94A3B8]">
            Suggestions matched to live tables for{' '}
            <span className="font-mono text-[#0F172A] dark:text-[#F1F5F9] tabular-nums">
              {defaultDate} · {formatTime12h(defaultStartTime)} PKT
            </span>
            .
          </p>

          <form onSubmit={handleRecommend} className="mt-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Cuisine
                </label>
                <select
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2.5 text-sm text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                >
                  <option value="Any">Any</option>
                  {cuisines.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Area
                </label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2.5 text-sm text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                >
                  <option value="Any">Any</option>
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Guests
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={partySize}
                  onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 2))}
                  className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2.5 text-sm font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <input
                type="text"
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                placeholder="Window seat, family dastarkhwan, quiet dinner..."
                className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2.5 text-sm text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-4 py-2.5 text-xs font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Matching tables...
                </>
              ) : (
                <>
                  <Compass className="h-3.5 w-3.5" />
                  Suggest Restaurants
                </>
              )}
            </button>
          </form>

          {error && (
            <p className="mt-3 rounded-lg border border-[#B91C1C]/25 dark:border-[#F87171]/30 bg-[#B91C1C]/8 dark:bg-[#B91C1C]/15 px-3 py-2 text-xs font-medium text-[#991B1B] dark:text-[#FCA5A5]">
              {error}
            </p>
          )}
        </div>

        <div className="lg:col-span-7 border-t lg:border-t-0 lg:border-l border-[#0F172A]/10 dark:border-white/10 pt-5 lg:pt-0 lg:pl-8">
          {!result && !loading && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8]">
                Quick ideas
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Window table for 2',
                  'Chef counter experience',
                  'Family dinner for 6 in Hyderabad',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPreferences(preset)}
                    className="rounded-lg border border-[#0F172A]/12 dark:border-white/12 bg-[#F4F5F7] dark:bg-[#1A2130] px-3.5 py-2 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] hover:border-[#0F766E] dark:hover:border-[#14B8A6] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <p className="text-sm text-[#0F172A] dark:text-[#F1F5F9] font-medium leading-relaxed">
                {result.summary}
              </p>

              <div className="divide-y divide-[#0F172A]/10 dark:divide-white/10 border-t border-b border-[#0F172A]/10 dark:border-white/10">
                {result.recommendations.map((rec) => (
                  <div
                    key={rec.restaurantId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5"
                  >
                    <div className="flex items-center gap-3.5">
                      <img
                        src={rec.imageUrl}
                        alt={rec.restaurantName}
                        referrerPolicy="no-referrer"
                        className="h-14 w-18 rounded-lg object-cover shrink-0 bg-[#E2E8F0] dark:bg-[#1A2130]"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display font-semibold text-base text-[#0F172A] dark:text-[#F1F5F9]">
                            {rec.restaurantName}
                          </h3>
                          <span className="text-xs text-[#475569] dark:text-[#94A3B8]">
                            {rec.cuisine} · {rec.location}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#334155] dark:text-[#CBD5E1]">
                          {rec.matchReason}
                        </p>
                        <p className="mt-1 text-xs font-mono tabular-nums text-[#15803D] dark:text-[#4ADE80]">
                          {rec.suggestedZone} · {rec.availableTablesCount} open
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectRestaurant(rec.restaurantId)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3.5 py-2 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:border-[#0F766E] dark:hover:border-[#14B8A6] hover:text-[#0F766E] dark:hover:text-[#14B8A6] transition-colors whitespace-nowrap shrink-0"
                    >
                      View 3D Floor
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
