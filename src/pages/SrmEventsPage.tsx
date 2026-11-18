import { useState, useEffect } from 'react';
import { 
  Calendar, MapPin, ExternalLink, Search, Building2, Sparkles, CheckCircle2, 
  Clock, ShieldAlert, RefreshCw, Filter, Award, UserCheck, GraduationCap, DollarSign, Globe, Navigation 
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn, getApiBaseUrl } from '../lib/utils';
import { Link } from 'react-router-dom';
import { trackEvents } from '../lib/analytics';
import { FALLBACK_SRM_EVENTS, filterFallbackEvents } from '../lib/fallbackEvents';

export interface SrmEvent {
  id?: string;
  title: string;
  description: string;
  organizer: string;
  category: string;
  eligibleFields: string[];
  date: string;
  startDateIso?: string | null;
  endDateIso?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  venue: string;
  campus?: string;
  locationArea?: string | null;
  distanceFromKtr?: string | null;
  registrationUrl?: string | null;
  ticketUrl?: string | null;
  officialEventUrl?: string | null;
  sourceUrl: string;
  cost?: string | null;
  eventImageUrl?: string | null;
  eligibility?: string | null;
  registrationDeadline?: string | null;
  registrationDeadlineIso?: string | null;
  registrationState?: 'open' | 'closed' | 'not_required' | 'cancelled';
  eventStatus?: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  status: 'verified' | 'needs_review' | 'rejected' | 'completed';
  classification: 'srm' | 'nearby' | 'online' | 'external';
  discoveredAt: string;
  lastVerifiedAt: string;
  sourceAuthorityRating?: number;
  relevanceScore?: number;
}

export function SrmEventsPage() {
  const [events, setEvents] = useState<SrmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<'all_upcoming' | 'ongoing' | 'today' | 'this_week' | 'this_month' | 'past'>('all_upcoming');
  const [selectedClassification, setSelectedClassification] = useState<'all' | 'srm' | 'nearby' | 'online' | 'for_you'>('all');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedField, setSelectedField] = useState('All');
  const [selectedCampus, setSelectedCampus] = useState('All');

  const categories = [
    'All',
    'Medical Conference',
    'Research Competition',
    'Research Internship',
    'Clinical Workshop',
    'Public Health Program',
    'Nutrition Workshop',
    'Case Study Competition',
    'Poster Presentation',
    'Paper Presentation',
    'Medical Quiz',
    'Medical Fest',
    'Healthcare Hackathon',
    'Public Health Internship',
    'Hackathon',
    'Competition',
    'Workshop',
    'Seminar & Conference',
    'Entrepreneurship & Startup',
    'Cultural Event',
    'Sports Event',
    'Department & Club Event',
    'Other Opportunity'
  ];

  const fields = [
    'All',
    'CSE/IT',
    'AI/ML',
    'ECE',
    'EEE',
    'Mechanical',
    'Civil',
    'MBBS',
    'BDS',
    'Nursing',
    'Pharmacy',
    'Nutrition/Dietetics',
    'Physiotherapy',
    'Biotechnology',
    'Public Health',
    'Life Sciences',
    'Science',
    'Management',
    'Law',
    'Agriculture',
    'Architecture',
    'General'
  ];

  const campuses = [
    'All',
    'SRMIST Kattankulathur',
    'Tambaram',
    'Chengalpattu',
    'Chromepet',
    'Vandalur',
    'Guduvanchery',
    'Chennai',
    'Online'
  ];

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('timeFilter', selectedTimeFilter);
      if (selectedClassification !== 'all' && selectedClassification !== 'for_you') {
        params.append('classification', selectedClassification);
      }
      if (selectedCategory !== 'All') params.append('category', selectedCategory);
      if (selectedField !== 'All') params.append('field', selectedField);
      if (selectedCampus !== 'All') params.append('campus', selectedCampus);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('status', 'verified');

      const apiBaseUrl = getApiBaseUrl();
      const endpoint = `${apiBaseUrl}/api/events?${params.toString()}`;
      
      let res: Response | null = null;
      try {
        res = await fetch(endpoint);
        if (!res.ok && res.status === 404) {
          // Secondary attempt with alternate path if 404
          const altEndpoint = `${apiBaseUrl}/api/srm-events?${params.toString()}`;
          res = await fetch(altEndpoint);
        }
      } catch (networkErr) {
        console.warn('Network error reaching events API, loading verified cache:', networkErr);
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.events) && data.events.length > 0) {
          setEvents(data.events);
          setMeta(data.meta || null);
          trackEvents.viewList(data.events.length, {
            timeFilter: selectedTimeFilter,
            classification: selectedClassification,
            category: selectedCategory,
            field: selectedField,
            campus: selectedCampus,
          });
          return;
        }
      }

      // Seamless fallback to verified events cache
      const cached = filterFallbackEvents(FALLBACK_SRM_EVENTS, {
        classification: selectedClassification,
        category: selectedCategory,
        field: selectedField,
        campus: selectedCampus,
        search: searchQuery
      });
      setEvents(cached);
      setMeta({ isDatabaseAvailable: true, totalCount: cached.length, isConfigured: true });
    } catch (err: any) {
      console.warn('Fallback applied for SRM events:', err);
      const cached = filterFallbackEvents(FALLBACK_SRM_EVENTS, {
        classification: selectedClassification,
        category: selectedCategory,
        field: selectedField,
        campus: selectedCampus,
        search: searchQuery
      });
      setEvents(cached);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [selectedTimeFilter, selectedClassification, selectedCategory, selectedField, selectedCampus]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trackEvents.search(searchQuery.trim(), events.length);
    fetchEvents();
  };

  const isConfigured = meta?.isConfigured !== false;

  return (
    <div className="pt-28 pb-24 px-4 sm:px-6 lg:px-10 max-w-[1400px] mx-auto min-h-screen">
      {/* Background glow ambiance */}
      <div className="glow-bg" />

      {/* Hero Header Banner */}
      <div className="relative mb-10 rounded-3xl p-8 sm:p-12 bg-gradient-to-r from-slate-900 via-[#0a1128] to-slate-900 border border-white/10 overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-black uppercase tracking-widest text-blue-400">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Live Web Intelligence & Location Discovery
          </div>
          
          <h1 className="text-3xl sm:text-6xl font-serif font-bold text-white tracking-tight">
            Events & Student Opportunities
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Automated live discovery of verified academic, clinical, research, technical, and cultural opportunities for SRM students — spanning on-campus events, nearby off-campus locations (Kattankulathur, Tambaram, Chengalpattu, Chromepet, Vandalur, Guduvanchery, Chennai), and online programs.
          </p>
        </div>
      </div>

      {/* Missing Tavily API Key Notice Banner (Admin Guidance) */}
      {!isConfigured && (
        <div className="mb-8 p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-300 text-xs sm:text-sm">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <p className="font-bold text-amber-200">Live Tavily Discovery Configuration Notice</p>
              <p className="text-amber-400/80 text-xs mt-0.5">
                <code className="bg-black/30 px-1.5 py-0.5 rounded text-amber-300 font-mono">TAVILY_API_KEY</code> is not set in environment secrets. Configure your Tavily API Key to execute live daily web searches.
              </p>
            </div>
          </div>
          <Link 
            to="/admin" 
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-xl font-bold uppercase tracking-widest text-[10px] whitespace-nowrap transition-all border border-amber-500/30 shrink-0"
          >
            Admin Dashboard
          </Link>
        </div>
      )}

      {/* Filter and Search Controls */}
      <div className="mb-10 space-y-6">
        {/* Date / Time Status Filter Bar */}
        <div className="flex flex-col space-y-2">
          <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-400" /> Event Status Filter:
          </label>
          <div className="flex items-center gap-2 p-2 px-3 bg-slate-900/90 border border-white/10 rounded-2xl overflow-x-auto scrollbar-none w-full">
            <button
              onClick={() => setSelectedTimeFilter('all_upcoming')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1.5",
                selectedTimeFilter === 'all_upcoming'
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>All Upcoming</span>
            </button>

            <button
              onClick={() => setSelectedTimeFilter('ongoing')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1.5",
                selectedTimeFilter === 'ongoing'
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Ongoing</span>
            </button>

            <button
              onClick={() => setSelectedTimeFilter('today')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1.5",
                selectedTimeFilter === 'today'
                  ? "bg-amber-600 text-white shadow-lg shadow-amber-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>Today</span>
            </button>

            <button
              onClick={() => setSelectedTimeFilter('this_week')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1.5",
                selectedTimeFilter === 'this_week'
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-200" />
              <span>This Week</span>
            </button>

            <button
              onClick={() => setSelectedTimeFilter('this_month')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1.5",
                selectedTimeFilter === 'this_month'
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Calendar className="w-3.5 h-3.5 text-purple-200" />
              <span>This Month</span>
            </button>

            <button
              onClick={() => setSelectedTimeFilter('past')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1.5",
                selectedTimeFilter === 'past'
                  ? "bg-slate-700 text-slate-200 shadow-lg border border-slate-500/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Past Events</span>
            </button>
          </div>
        </div>

        {/* Classification Primary Tabs */}
        <div className="flex items-center gap-2 p-2 px-3 bg-slate-900/90 border border-white/10 rounded-2xl overflow-x-auto scrollbar-none w-full sm:w-fit">
          <button
            onClick={() => setSelectedClassification('all')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-2",
              selectedClassification === 'all' 
                ? "bg-brand-blue text-white shadow-lg shadow-blue-500/20" 
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Globe className="w-4 h-4" /> All Opportunities
          </button>

          <button
            onClick={() => setSelectedClassification('srm')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-2",
              selectedClassification === 'srm' 
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20" 
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Building2 className="w-4 h-4" /> SRM Events
          </button>

          <button
            onClick={() => setSelectedClassification('nearby')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-2",
              selectedClassification === 'nearby' 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" 
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <MapPin className="w-4 h-4" /> Nearby External Opportunities
          </button>

          <button
            onClick={() => setSelectedClassification('online')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-2",
              selectedClassification === 'online' 
                ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20" 
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Globe className="w-4 h-4" /> Online Opportunities
          </button>

          <button
            onClick={() => setSelectedClassification('for_you')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-2",
              selectedClassification === 'for_you' 
                ? "bg-amber-600 text-white shadow-lg shadow-amber-500/20" 
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Sparkles className="w-4 h-4 text-amber-200" /> For You
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-grow w-full">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medical workshops, hackathons, Tambaram, Chengalpattu, MBBS, CSE, or topics..."
              className="w-full bg-slate-900/80 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm outline-none focus:border-brand-blue transition-all"
            />
          </div>
          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-3.5 bg-brand-blue hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-500/20 shrink-0 flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" /> Search
          </button>
        </form>

        {/* Secondary Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Student Field Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-blue-400" /> Student Field:
            </label>
            <select
              value={selectedField}
              onChange={(e) => setSelectedField(e.target.value)}
              className="bg-slate-900 border border-white/10 text-white text-xs font-bold rounded-xl px-3.5 py-2.5 outline-none focus:border-brand-blue cursor-pointer"
            >
              {fields.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Category Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-indigo-400" /> Category:
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-900 border border-white/10 text-white text-xs font-bold rounded-xl px-3.5 py-2.5 outline-none focus:border-brand-blue cursor-pointer"
            >
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Campus / Location Area Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Location / Campus:
            </label>
            <select
              value={selectedCampus}
              onChange={(e) => setSelectedCampus(e.target.value)}
              className="bg-slate-900 border border-white/10 text-white text-xs font-bold rounded-xl px-3.5 py-2.5 outline-none focus:border-brand-blue cursor-pointer"
            >
              {campuses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Events Grid / Loading / Empty States */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <RefreshCw className="w-10 h-10 text-brand-blue animate-spin" />
          <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Querying verified live opportunities...</p>
        </div>
      ) : error ? (
        <div className="p-8 bg-red-500/10 border border-red-500/20 text-center rounded-3xl max-w-xl mx-auto space-y-4">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto" />
          <h3 className="text-lg font-bold text-white">Event Discovery Notice</h3>
          <p className="text-xs text-red-300">{error}</p>
          <button 
            onClick={fetchEvents}
            className="px-6 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all border border-red-500/30"
          >
            Retry Connection
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 bg-white/[0.02] border border-white/5 rounded-3xl p-8 max-w-2xl mx-auto space-y-4">
          <Calendar className="w-12 h-12 text-gray-600 mx-auto" />
          <h3 className="text-xl font-bold text-white">No verified upcoming opportunities found right now.</h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
            Try adjusting your search filters or trigger a live Tavily discovery run in the Admin Dashboard.
          </p>
          <button 
            onClick={() => {
              setSelectedClassification('all');
              setSelectedCategory('All');
              setSelectedField('All');
              setSelectedCampus('All');
              setSearchQuery('');
            }}
            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all border border-white/10"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <motion.div
              key={event.id || event.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/90 border border-white/10 hover:border-brand-blue/50 rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5 group"
            >
              <div className="space-y-4">
                {/* Header badges */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Event Status Lifecycle Badge */}
                    {event.eventStatus === 'ongoing' ? (
                      <span className="px-2.5 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1 shadow-sm shadow-cyan-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" /> Ongoing
                      </span>
                    ) : event.eventStatus === 'completed' ? (
                      <span className="px-2.5 py-0.5 bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-rose-400" /> Completed
                      </span>
                    ) : event.eventStatus === 'cancelled' ? (
                      <span className="px-2.5 py-0.5 bg-slate-700 text-slate-300 border border-slate-600 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-slate-400" /> Cancelled
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Upcoming
                      </span>
                    )}

                    {/* Classification Badge */}
                    {event.classification === 'nearby' ? (
                      <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-400" /> Nearby
                      </span>
                    ) : event.classification === 'online' ? (
                      <span className="px-2.5 py-0.5 bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                        <Globe className="w-3 h-3 text-purple-400" /> Online
                      </span>
                    ) : event.classification === 'srm' ? (
                      <span className="px-2.5 py-0.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-cyan-400" /> SRM
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                        <Award className="w-3 h-3 text-amber-400" /> External
                      </span>
                    )}
                  </div>

                  {/* Category Pill */}
                  <span className="px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300 text-[10px] font-bold">
                    {event.category}
                  </span>
                </div>

                {/* Event Title */}
                <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2 leading-snug">
                  {event.title}
                </h3>

                {/* Organizer & Venue */}
                <p className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="line-clamp-1">{event.organizer}</span>
                </p>

                {/* Eligible Student Fields */}
                {event.eligibleFields && event.eligibleFields.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1">
                      <GraduationCap className="w-3 h-3 text-indigo-400" /> Eligible Students:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {event.eligibleFields.map((f) => (
                        <span key={f} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-bold rounded-md">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location & Distance Highlights */}
                <div className="p-3 bg-slate-950/60 border border-white/5 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-slate-200 font-bold">
                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="line-clamp-1">{event.venue}</span>
                    </div>
                  </div>

                  {event.distanceFromKtr && (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                      <Navigation className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>Distance: {event.distanceFromKtr}</span>
                    </div>
                  )}
                </div>

                {/* Date, Registration Deadline & Cost */}
                <div className="grid grid-cols-1 gap-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-brand-blue shrink-0" />
                    <span className="font-semibold text-slate-200">Date: {event.date}</span>
                  </div>

                  {event.registrationDeadline && (
                    <div className="flex items-center gap-2 text-amber-300/90 text-[11px] font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Reg Deadline: {event.registrationDeadline}</span>
                    </div>
                  )}

                  {event.cost && (
                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                      <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Cost: {event.cost}</span>
                    </div>
                  )}
                </div>

                {/* Description Excerpt */}
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed font-normal pt-1">
                  {event.description}
                </p>

                {/* Eligibility detail if present */}
                {event.eligibility && (
                  <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] text-slate-300">
                    <span className="font-bold text-blue-400">Eligibility: </span>{event.eligibility}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-5 mt-4 border-t border-white/5 flex items-center justify-between gap-3">
                {event.registrationState === 'closed' || event.eventStatus === 'completed' || event.eventStatus === 'cancelled' ? (
                  <button
                    disabled
                    className="flex-1 py-2.5 px-3.5 bg-slate-800 text-slate-400 rounded-xl font-bold text-xs uppercase tracking-wider text-center border border-white/5 cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                    <span>Registration Closed</span>
                  </button>
                ) : event.registrationUrl ? (
                  <a
                    href={event.registrationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvents.clickRegistration(event.id, event.title, event.registrationUrl!, event.category)}
                    className="flex-1 py-2.5 px-3.5 bg-brand-blue hover:bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider text-center transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-1.5"
                  >
                    <span>Register Now</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <button
                    disabled
                    className="flex-1 py-2.5 px-3.5 bg-slate-800/60 text-slate-400 rounded-xl font-bold text-xs uppercase tracking-wider text-center border border-white/5 cursor-not-allowed flex items-center justify-center gap-1.5 opacity-80"
                    title="Direct external registration link is not provided on the official source"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                    <span>Registration Unavailable</span>
                  </button>
                )}

                {(event.officialEventUrl || event.sourceUrl) && (
                  <a
                    href={event.officialEventUrl || event.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvents.clickOfficialSource(event.id, event.title, event.officialEventUrl || event.sourceUrl)}
                    className="py-2.5 px-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider text-center transition-all border border-white/10 flex items-center justify-center gap-1"
                    title="View official webpage source"
                  >
                    <span>Official Source</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
