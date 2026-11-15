import {
  ArrowUpRight,
  Bell,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AiConciergePanel } from './components/AiConciergePanel.jsx';
import { AuthModal } from './components/AuthModal.jsx';
import { CustomerBookingsView } from './components/CustomerBookingsView.jsx';
import { DiningSceneCanvas } from './components/DiningSceneCanvas.jsx';
import { OwnerDashboardView } from './components/OwnerDashboardView.jsx';
import { RestaurantBookingStudio } from './components/RestaurantBookingStudio.jsx';
import { api, getStoredToken, setStoredToken } from './lib/api.js';
import { signOutFirebase, subscribeFirebaseAuth } from './lib/firebase.js';
import {
  DINING_TIME_SLOTS,
  formatTime12h,
  todayPktIso,
} from './lib/timeFormat.js';
import { useRealtimeSync } from './lib/useRealtimeSync.js';

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 30);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
    total % 60,
  ).padStart(2, '0')}`;
}

function RestaurantCard({ restaurant, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false);
  const openCount = restaurant.availableTablesCount ?? 0;

  return (
    <article
      onClick={() => onOpen(restaurant.id)}
      className="group cursor-pointer flex flex-col overflow-hidden rounded-2xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0F766E]/45 dark:hover:border-[#14B8A6]/45 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#E2E8F0] dark:bg-[#1A2130]">
        {!imgFailed && restaurant.imageUrl ? (
          <img
            src={restaurant.imageUrl}
            alt={restaurant.name}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#0F766E]/15 to-[#0F172A]/10 dark:from-[#14B8A6]/15 dark:to-[#0B0E14] p-4 text-center">
            <UtensilsCrossed className="h-6 w-6 text-[#0F766E] dark:text-[#14B8A6]" />
            <span className="font-display text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              {restaurant.name}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div>
          <p className="text-xs font-medium text-[#475569] dark:text-[#94A3B8]">
            {restaurant.cuisine} · {restaurant.location} · {restaurant.priceTier}
          </p>
          <h3 className="mt-1.5 font-display text-lg font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9] group-hover:text-[#0F766E] dark:group-hover:text-[#14B8A6] transition-colors">
            {restaurant.name}
          </h3>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-[#0F172A]/8 dark:border-white/10 pt-3 text-xs">
          <span
            className={`font-mono font-medium tabular-nums ${
              openCount > 0
                ? 'text-[#15803D] dark:text-[#4ADE80]'
                : 'text-[#991B1B] dark:text-[#F87171]'
            }`}
          >
            {openCount > 0 ? `${openCount} open` : 'Full'}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-[#0F172A] dark:text-[#F1F5F9] group-hover:text-[#0F766E] dark:group-hover:text-[#14B8A6] transition-colors">
            Reserve
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('mise_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('mise_theme', theme);
    } catch {
      // ignore storage failure
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [view, setView] = useState('discover');
  const [activeRestaurantId, setActiveRestaurantId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [cuisineFilter, setCuisineFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [bookingDate, setBookingDate] = useState(todayPktIso());
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('20:30');
  const [partySize, setPartySize] = useState(2);

  const [restaurants, setRestaurants] = useState([]);
  const [allRestaurantsMeta, setAllRestaurantsMeta] = useState([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [heroRestaurantId, setHeroRestaurantId] = useState(null);
  const [heroTables, setHeroTables] = useState([]);
  const [heroSelectedTableId, setHeroSelectedTableId] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const [realtimeTick, setRealtimeTick] = useState(0);

  useRealtimeSync(() => {
    setRealtimeTick((t) => t + 1);
  });

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      api.auth
        .me()
        .then((res) => setUser(res.user))
        .catch(() => {
          setStoredToken(null);
        });
    }

    const unsubscribe = subscribeFirebaseAuth(async (fbUser) => {
      if (!fbUser || !fbUser.emailVerified) return;
      if (!getStoredToken()) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await api.auth.google({ idToken });
          setStoredToken(res.token);
          setUser(res.user);
        } catch {
          // ignore silent background sync failure
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }
    try {
      const res = await api.notifications.list();
      setNotifications(res.notifications);
    } catch {
      // ignore transient error
    }
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, realtimeTick]);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await api.restaurants.list({
        search: searchQuery,
        cuisine: cuisineFilter,
        location: locationFilter,
        partySize,
        date: bookingDate,
        startTime,
        endTime,
      });
      setRestaurants(res.restaurants);

      if (!searchQuery && cuisineFilter === 'All' && locationFilter === 'All') {
        setAllRestaurantsMeta(res.restaurants);
      }

      const activeHero =
        res.restaurants.find((r) => r.id === heroRestaurantId) ||
        res.restaurants[0] ||
        null;
      if (activeHero) {
        if (activeHero.id !== heroRestaurantId) {
          setHeroRestaurantId(activeHero.id);
        }
        const detail = await api.restaurants.availability(activeHero.id, {
          date: bookingDate,
          startTime,
          endTime,
          partySize,
        });
        setHeroTables(detail.tables);
      } else {
        setHeroTables([]);
      }
    } catch (err) {
      console.error('Failed to load restaurants:', err);
    } finally {
      setLoadingRestaurants(false);
    }
  }, [
    searchQuery,
    cuisineFilter,
    locationFilter,
    partySize,
    bookingDate,
    startTime,
    endTime,
    heroRestaurantId,
  ]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog, realtimeTick]);

  const metaSource = allRestaurantsMeta.length > 0 ? allRestaurantsMeta : restaurants;
  const cuisines = useMemo(
    () => Array.from(new Set(metaSource.map((r) => r.cuisine))).sort(),
    [metaSource],
  );
  const locations = useMemo(
    () => Array.from(new Set(metaSource.map((r) => r.location))).sort(),
    [metaSource],
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const openRestaurant = (id) => {
    setActiveRestaurantId(id);
    setView('restaurant');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignOut = () => {
    setStoredToken(null);
    signOutFirebase().catch(() => {});
    setUser(null);
    setNotifOpen(false);
    setMobileMenuOpen(false);
    if (view === 'bookings' || view === 'owner') {
      setView('discover');
    }
  };

  const featuredRestaurant =
    restaurants.find((r) => r.id === heroRestaurantId) || restaurants[0] || null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F5F7] dark:bg-[#0B0E14] text-[#0F172A] dark:text-[#F1F5F9] transition-colors duration-200">
      <header className="sticky top-0 z-40 border-b border-[#0F172A]/10 dark:border-white/10 bg-[#F4F5F7]/88 dark:bg-[#0B0E14]/88 backdrop-blur-md transition-colors">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 md:gap-8 px-4 sm:px-6 py-3">
          <button
            type="button"
            onClick={() => {
              setView('discover');
              setMobileMenuOpen(false);
            }}
            className="font-display text-2xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9] whitespace-nowrap shrink-0"
          >
            Mise
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#475569] dark:text-[#94A3B8]">
            <button
              type="button"
              onClick={() => setView('discover')}
              className={`hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 ${
                view === 'discover'
                  ? 'text-[#0F766E] dark:text-[#14B8A6] underline decoration-2 underline-offset-[10px]'
                  : ''
              }`}
            >
              Restaurants
            </button>
            <button
              type="button"
              onClick={() => {
                if (featuredRestaurant) openRestaurant(featuredRestaurant.id);
              }}
              className={`hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 ${
                view === 'restaurant'
                  ? 'text-[#0F766E] dark:text-[#14B8A6] underline underline-offset-8'
                  : ''
              }`}
            >
              3D Floorplan
            </button>
            <a
              href="#ai-concierge"
              onClick={(e) => {
                if (view !== 'discover') {
                  e.preventDefault();
                  setView('discover');
                  setTimeout(() => {
                    document
                      .getElementById('ai-concierge')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }, 80);
                }
              }}
              className="hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0"
            >
              Assistant
            </a>
            {user?.role === 'owner' ? (
              <button
                type="button"
                onClick={() => setView('owner')}
                className={`hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 ${
                  view === 'owner'
                    ? 'text-[#0F766E] dark:text-[#14B8A6] underline underline-offset-8'
                    : ''
                }`}
              >
                Owner Studio
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!user) setAuthModalOpen(true);
                  else setView('bookings');
                }}
                className={`hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 ${
                  view === 'bookings'
                    ? 'text-[#0F766E] dark:text-[#14B8A6] underline underline-offset-8'
                    : ''
                }`}
              >
                My Bookings
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 relative">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to Day mode' : 'Switch to Night mode'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F172A]/12 dark:border-white/15 bg-white dark:bg-[#131822] px-2.5 sm:px-3 py-2 text-xs font-medium text-[#334155] dark:text-[#E2E8F0] hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors whitespace-nowrap shrink-0"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-[#FBBF24]" />
                  <span className="hidden sm:inline">Day</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-[#0F766E]" />
                  <span className="hidden sm:inline">Night</span>
                </>
              )}
            </button>

            {user ? (
              <>
                <button
                  type="button"
                  aria-label="Notifications"
                  onClick={() => {
                    const next = !notifOpen;
                    setNotifOpen(next);
                    if (next && unreadCount > 0) {
                      api.notifications.markAllRead().then(loadNotifications);
                    }
                  }}
                  className="relative rounded-lg border border-[#0F172A]/12 dark:border-white/15 bg-white dark:bg-[#131822] p-2 text-[#0F172A] dark:text-[#F1F5F9] hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 rounded-full bg-[#0F766E] dark:bg-[#14B8A6] px-1.5 py-0.5 text-[10px] font-mono font-semibold text-white dark:text-[#0B0E14]">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-3 sm:px-4 py-2 text-xs font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] transition-colors whitespace-nowrap shrink-0"
                >
                  <span className="max-w-[90px] sm:max-w-[120px] truncate">{user.name}</span>
                  <LogOut className="h-3.5 w-3.5" />
                </button>

                {notifOpen && (
                  <div className="absolute right-0 top-12 w-72 sm:w-80 rounded-xl border border-[#0F172A]/12 dark:border-white/12 bg-white dark:bg-[#131822] p-4 shadow-lg z-50">
                    <div className="flex items-center justify-between border-b border-[#0F172A]/10 dark:border-white/10 pb-2 mb-2">
                      <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                        Notifications
                      </span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-[11px] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]"
                      >
                        Close
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="py-4 text-center text-xs text-[#475569] dark:text-[#94A3B8]">
                        No notifications.
                      </p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto divide-y divide-[#0F172A]/8 dark:divide-white/8">
                        {notifications.map((n) => (
                          <div key={n.id} className="py-2.5 text-xs">
                            <p className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                              {n.title}
                            </p>
                            <p className="mt-0.5 text-[#475569] dark:text-[#94A3B8]">
                              {n.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-3.5 sm:px-4 py-2 text-xs font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              className="md:hidden inline-flex items-center justify-center rounded-lg border border-[#0F172A]/12 dark:border-white/15 bg-white dark:bg-[#131822] p-2 text-[#0F172A] dark:text-[#F1F5F9]"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] px-4 py-3 flex flex-col gap-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                setView('discover');
                setMobileMenuOpen(false);
              }}
              className="rounded-lg px-3 py-2.5 text-left text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F4F5F7] dark:hover:bg-[#1A2130]"
            >
              Restaurants
            </button>
            <button
              type="button"
              onClick={() => {
                if (featuredRestaurant) openRestaurant(featuredRestaurant.id);
              }}
              className="rounded-lg px-3 py-2.5 text-left text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F4F5F7] dark:hover:bg-[#1A2130]"
            >
              3D Floorplan
            </button>
            <a
              href="#ai-concierge"
              onClick={(e) => {
                setMobileMenuOpen(false);
                if (view !== 'discover') {
                  e.preventDefault();
                  setView('discover');
                  setTimeout(() => {
                    document
                      .getElementById('ai-concierge')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }, 80);
                }
              }}
              className="rounded-lg px-3 py-2.5 text-left text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F4F5F7] dark:hover:bg-[#1A2130]"
            >
              Assistant
            </a>
            {user?.role === 'owner' ? (
              <button
                type="button"
                onClick={() => {
                  setView('owner');
                  setMobileMenuOpen(false);
                }}
                className="rounded-lg px-3 py-2.5 text-left text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F4F5F7] dark:hover:bg-[#1A2130]"
              >
                Owner Studio
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (!user) setAuthModalOpen(true);
                  else setView('bookings');
                }}
                className="rounded-lg px-3 py-2.5 text-left text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F4F5F7] dark:hover:bg-[#1A2130]"
              >
                My Bookings
              </button>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 sm:px-6 py-6 sm:py-8">
        {view === 'restaurant' && activeRestaurantId ? (
          <RestaurantBookingStudio
            restaurantId={activeRestaurantId}
            initialDate={bookingDate}
            initialStartTime={startTime}
            initialEndTime={endTime}
            initialPartySize={partySize}
            user={user}
            theme={theme}
            onToggleTheme={toggleTheme}
            realtimeTick={realtimeTick}
            onBack={() => setView('discover')}
            onRequireAuth={() => setAuthModalOpen(true)}
            onBookingCreated={() => {
              loadCatalog();
              loadNotifications();
            }}
          />
        ) : view === 'bookings' && user ? (
          <CustomerBookingsView
            realtimeTick={realtimeTick}
            onBrowseRestaurants={() => setView('discover')}
            onOpenRestaurant={openRestaurant}
          />
        ) : view === 'owner' && user?.role === 'owner' ? (
          <OwnerDashboardView
            realtimeTick={realtimeTick}
            onRestaurantsChanged={loadCatalog}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        ) : (
          <div className="space-y-10 sm:space-y-12">
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
              <div className="lg:col-span-5 flex flex-col justify-between gap-5">
                <div className="space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0F766E] dark:text-[#14B8A6]">
                    Hyderabad · Pakistan · Live PKT
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl xl:text-[46px] font-semibold leading-[1.08] tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
                    Pick your exact table in 3D.
                  </h1>
                  <p className="text-sm sm:text-[15px] leading-relaxed text-[#475569] dark:text-[#94A3B8]">
                    Inspect live dining rooms across Hyderabad, reserve your seat, and receive instant Gmail confirmation.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] p-4 sm:p-5 space-y-3.5 shadow-xs transition-colors">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Search
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748B] dark:text-[#94A3B8]" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Restaurant, cuisine, area..."
                          className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] pl-8 pr-3 py-2.5 text-sm text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        value={bookingDate}
                        min={todayPktIso()}
                        onChange={(e) => setBookingDate(e.target.value)}
                        className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2.5 text-sm font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Time (PKT)
                        </label>
                        <select
                          value={startTime}
                          onChange={(e) => {
                            setStartTime(e.target.value);
                            setEndTime(addMinutes(e.target.value, 90));
                          }}
                          className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2 py-2.5 text-xs sm:text-sm font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
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
                          Guests
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={partySize}
                          onChange={(e) =>
                            setPartySize(Math.max(1, Number(e.target.value) || 2))
                          }
                          className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2.5 text-sm font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <select
                      value={cuisineFilter}
                      onChange={(e) => setCuisineFilter(e.target.value)}
                      className="rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                    >
                      <option value="All">All Cuisines</option>
                      {cuisines.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>

                    <select
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      className="rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-2.5 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                    >
                      <option value="All">All Areas</option>
                      {locations.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href="#dining-rooms"
                      className="flex-1 inline-flex items-center justify-center rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-4 py-2.5 text-xs font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] transition-colors whitespace-nowrap"
                    >
                      Explore Tables
                    </a>
                    {featuredRestaurant && (
                      <button
                        type="button"
                        onClick={() => openRestaurant(featuredRestaurant.id)}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3.5 py-2.5 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors whitespace-nowrap"
                      >
                        Book {featuredRestaurant.name}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col gap-2.5">
                {restaurants.length > 1 && (
                  <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
                    <div className="flex items-center gap-1 rounded-xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] p-1">
                      {restaurants.slice(0, 4).map((r) => {
                        const active = featuredRestaurant?.id === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setHeroRestaurantId(r.id);
                              setHeroSelectedTableId(null);
                            }}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                              active
                                ? 'bg-[#0F766E] dark:bg-[#14B8A6] text-white dark:text-[#0B0E14] font-semibold'
                                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                            }`}
                          >
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                    {featuredRestaurant && (
                      <span className="hidden sm:inline font-mono text-xs tabular-nums text-[#15803D] dark:text-[#4ADE80] shrink-0">
                        {featuredRestaurant.availableTablesCount ?? 0} open
                      </span>
                    )}
                  </div>
                )}

                <div className="flex-1 flex flex-col">
                  <DiningSceneCanvas
                    compact
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    tables={heroTables}
                    selectedTableId={heroSelectedTableId}
                    onSelectTable={(tableId) => {
                      setHeroSelectedTableId(tableId);
                      if (featuredRestaurant) {
                        openRestaurant(featuredRestaurant.id);
                      }
                    }}
                    restaurantName={
                      featuredRestaurant
                        ? `${featuredRestaurant.name} · ${formatTime12h(startTime)} PKT`
                        : '3D Floorplan'
                    }
                  />
                </div>
              </div>
            </section>

            <section id="dining-rooms" className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#0F172A]/10 dark:border-white/10 pb-3.5">
                <div>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
                    Dining Rooms
                  </h2>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#475569] dark:text-[#94A3B8]">
                  {bookingDate} · {formatTime12h(startTime)}–{formatTime12h(endTime)} PKT · {partySize} guests
                </span>
              </div>

              {cuisines.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {['All', ...cuisines].map((c) => {
                    const active = cuisineFilter === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCuisineFilter(c)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-[#0F766E] dark:bg-[#14B8A6] text-white dark:text-[#0B0E14] font-semibold'
                            : 'bg-white dark:bg-[#131822] border border-[#0F172A]/10 dark:border-white/10 text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                        }`}
                      >
                        {c === 'All' ? 'All Cuisines' : c}
                      </button>
                    );
                  })}
                </div>
              )}

              {loadingRestaurants ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-72 rounded-2xl border border-[#0F172A]/10 dark:border-white/10 bg-white dark:bg-[#131822] animate-pulse"
                    />
                  ))}
                </div>
              ) : restaurants.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#0F172A]/20 dark:border-white/15 bg-white dark:bg-[#131822] p-8 text-center">
                  <p className="text-sm text-[#0F172A] dark:text-[#F1F5F9]">
                    No matching restaurants.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCuisineFilter('All');
                      setLocationFilter('All');
                    }}
                    className="mt-3 rounded-lg border border-[#0F172A]/15 dark:border-white/15 px-4 py-2 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
                  {restaurants.map((r) => (
                    <RestaurantCard
                      key={r.id}
                      restaurant={r}
                      onOpen={openRestaurant}
                    />
                  ))}
                </div>
              )}
            </section>

            <AiConciergePanel
              defaultDate={bookingDate}
              defaultStartTime={startTime}
              defaultEndTime={endTime}
              defaultPartySize={partySize}
              cuisines={cuisines}
              locations={locations}
              onSelectRestaurant={openRestaurant}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-[#0F172A]/10 dark:border-white/10 bg-[#F4F5F7] dark:bg-[#0B0E14] py-5 transition-colors">
        <div className="mx-auto flex max-w-[1280px] flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 text-xs text-[#475569] dark:text-[#94A3B8]">
          <span className="font-display text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            Mise
          </span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setView('discover')}
              className="hover:text-[#0F172A] dark:hover:text-[#F1F5F9]"
            >
              Restaurants
            </button>
            <button
              type="button"
              onClick={() => {
                if (!user) setAuthModalOpen(true);
                else if (user.role === 'owner') setView('owner');
                else setView('bookings');
              }}
              className="hover:text-[#0F172A] dark:hover:text-[#F1F5F9]"
            >
              {user?.role === 'owner' ? 'Owner Studio' : 'My Bookings'}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="hover:text-[#0F172A] dark:hover:text-[#F1F5F9]"
            >
              {theme === 'dark' ? 'Day Mode' : 'Night Mode'}
            </button>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="hover:text-[#0F172A] dark:hover:text-[#F1F5F9]"
            >
              {user ? 'Switch Account' : 'Sign In'}
            </button>
          </div>
        </div>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(u) => {
          setUser(u);
          if (u.role === 'owner') {
            setView('owner');
          }
        }}
      />
    </div>
  );
}
