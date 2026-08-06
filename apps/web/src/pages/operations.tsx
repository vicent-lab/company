import { useState, useRef, useCallback, useMemo } from 'react';
import { useFarm } from '../app';
import { useTheme } from '../theme';
import { useHashRoute } from '../router';
import { CowPhoto, QrCode, PageHeader, Kpi, AnimatedCounter, Modal, Progress, useToast, useAsync } from '../ui';
import { ALL_COWS, BADGES, LEADERBOARD, BARNS } from '../mock';
import { listCows, gallery, galleryCategories, createGalleryItem, updateGalleryItem, deleteGalleryItem, mapNodes, cowLocations, moveCowLocation, zoneHeatmap, weather, CowLocationView, CowStatus, ZoneHeat, ZoneRecommendation, Period, CalvingRisk } from '../data';
import { Home, Droplets, Tractor, Warehouse, Syringe, Wheat, Trophy, Flame, Crown, Search, Filter, Download, Plus, Edit3, Eye, Trash2, FolderOpen, Camera, ZoomIn, ZoomOut, Maximize, Milk, Move as MoveIcon, MapPin, Beef, Utensils, CloudSun, Thermometer, Wind, CloudRain, AlertTriangle, History, Baby, CalendarClock } from 'lucide-react';
import { fmt } from '../format';

const MAP_NODES = [
  { id: 'office', label: 'Farm Office', x: 8, y: 12, icon: <Home size={16} />, tone: 'var(--text)', category: 'Buildings', detail: 'Records, admin & visitor check-in' },
  { id: 'milk', label: 'Milking Parlor', x: 14, y: 26, icon: <Droplets size={16} />, tone: 'var(--primary)', category: 'Buildings', detail: 'Parlour 2×8 · 3 sessions/day' },
  { id: 'barnA', label: 'Barn A — Milking', x: 26, y: 28, icon: <Tractor size={16} />, tone: 'var(--primary)', category: 'Buildings', detail: 'Capacity 60 · 38 cows · 4 milking stalls' },
  { id: 'barnB', label: 'Barn B — Dry', x: 58, y: 18, icon: <Tractor size={16} />, tone: 'var(--primary)', category: 'Buildings', detail: 'Capacity 40 · 22 dry cows' },
  { id: 'feed', label: 'Feed Store', x: 90, y: 36, icon: <Wheat size={16} />, tone: 'var(--warn)', category: 'Feed', detail: 'Silage 2,400kg · Conc. 380kg (low)' },
  { id: 'water', label: 'Water Tank', x: 34, y: 46, icon: <Droplets size={16} />, tone: 'var(--info)', category: 'Water', detail: 'Flow 12 L/min · temp 14°C · clean' },
  { id: 'shed', label: 'Machinery Shed', x: 92, y: 66, icon: <Warehouse size={16} />, tone: 'var(--text-soft)', category: 'Buildings', detail: 'Tractor, feed mixer, 2 trailers' },
  { id: 'vet', label: 'Veterinary Clinic', x: 12, y: 76, icon: <Syringe size={16} />, tone: 'var(--danger)', category: 'Health', detail: '2 cows under treatment · on-site vet Tue/Fri' },
  { id: 'graze1', label: 'Pasture 1', x: 42, y: 68, icon: <Wheat size={16} />, tone: 'var(--accent)', category: 'Pasture', detail: '12 ha · rotational grazing · good cover' },
  { id: 'graze2', label: 'Pasture 2', x: 76, y: 74, icon: <Wheat size={16} />, tone: 'var(--accent)', category: 'Pasture', detail: '9 ha · rest period until next week' },
];

const MAP_LEGEND = [
  { label: 'Buildings', tone: 'var(--primary)' },
  { label: 'Pasture', tone: 'var(--accent)' },
  { label: 'Water', tone: 'var(--info)' },
  { label: 'Feed', tone: 'var(--warn)' },
  { label: 'Health', tone: 'var(--danger)' },
];

const ROAD_LOOP = ['office', 'milk', 'barnA', 'barnB', 'feed', 'shed', 'graze2', 'graze1', 'water', 'vet', 'office'];

const MIN_ZOOM = 1;
const MAX_ZOOM = 3.5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---- Live cow locations: status colors, zones & activities ----
const ZONE_LABEL: Record<string, string> = Object.fromEntries(MAP_NODES.map((n) => [n.id, n.label.split(' — ')[0].replace(/ \(\d+ cows\)$/, '')]));
const ACTIVITIES = ['eating', 'grazing', 'milking', 'resting', 'moving', 'sick_bay'] as const;
const ACTIVITY_LABEL: Record<string, string> = { eating: 'Eating', grazing: 'Grazing', milking: 'Milking', resting: 'Resting', moving: 'Moving', sick_bay: 'Sick bay' };
const STATUS_ORDER: CowStatus[] = ['sick', 'attention', 'breeding', 'pregnant', 'healthy'];
const STATUS_COLOR: Record<CowStatus, string> = { sick: 'var(--danger)', attention: 'var(--warn)', pregnant: 'var(--info)', breeding: 'var(--purple)', healthy: 'var(--primary)' };
const STATUS_LABEL: Record<CowStatus, string> = { sick: 'Sick', attention: 'Needs attention', pregnant: 'Pregnant', breeding: 'Ready for breeding', healthy: 'Healthy' };
const STATUS_PILL: Record<CowStatus, string> = { sick: 'sick', attention: 'attention', pregnant: 'pregnant', breeding: 'breeding', healthy: 'healthy' };

// ---- Calving map: expected calvings, recently calved cows, high-risk pregnancies ----
type CalvingMarker = 'expected' | 'watch' | 'high' | 'calved';
const CALVING_COLOR: Record<CalvingMarker, string> = { expected: 'var(--info)', watch: 'var(--warn)', high: 'var(--danger)', calved: 'var(--accent)' };
const CALVING_LABEL: Record<CalvingMarker, string> = { expected: 'Expected calving', watch: 'Calving — watch closely', high: 'Calving — high risk', calved: 'Recently calved' };
function calvingMarkerFor(c: CowLocationView): CalvingMarker | null {
  if (c.recentlyCalved) return 'calved';
  if (!c.isPregnant) return null;
  if (c.calvingRisk === 'high') return 'high';
  if (c.calvingRisk === 'watch') return 'watch';
  return 'expected';
}
function calvingRiskReasons(c: CowLocationView): string[] {
  const reasons: string[] = [];
  if (c.daysUntilDue !== null && c.daysUntilDue < 0) reasons.push(`Overdue by ${-c.daysUntilDue} day(s)`);
  else if (c.daysUntilDue !== null && c.daysUntilDue <= 3) reasons.push(`Due in ${c.daysUntilDue} day(s)`);
  if (c.health !== 'healthy') reasons.push(`Currently ${c.health.replace('_', ' ')}`);
  if (c.lastDifficultyScore !== null && c.lastDifficultyScore >= 4) reasons.push('History of a difficult calving');
  return reasons;
}

function jitterFor(x: number, y: number, index: number, total: number) {
  if (total <= 1) return { x, y };
  const angle = (index / total) * Math.PI * 2;
  const radius = 3.5 + (index % 3) * 1.6;
  return { x: clamp(x + Math.cos(angle) * radius, 2, 98), y: clamp(y + Math.sin(angle) * radius, 2, 98) };
}

// ---- Timeline: move through time. Cow positions have no history, so only "Today" shows
// individual cows; every other point scrubs the zone aggregates (health/milk/feed/weather). ----
const TIMELINE: { id: Period; label: string; sub: string }[] = [
  { id: 'yesterday', label: 'Yesterday', sub: 'Actuals' },
  { id: 'today', label: 'Today', sub: 'Live' },
  { id: 'week', label: 'Last Week', sub: 'Daily avg' },
  { id: 'month', label: 'Last Month', sub: 'Daily avg' },
  { id: 'forecast', label: 'Forecast', sub: 'AI projection' },
];

// ---- Smart heat map: health / milk production / feed consumption / weather layers ----
type HeatLayer = 'health' | 'milk' | 'feed' | 'weather';
const HEAT_LAYERS: { id: HeatLayer; label: string; icon: React.ReactNode }[] = [
  { id: 'health', label: 'Health', icon: <Beef size={14} /> },
  { id: 'milk', label: 'Milk production', icon: <Milk size={14} /> },
  { id: 'feed', label: 'Feed consumption', icon: <Utensils size={14} /> },
  { id: 'weather', label: 'Weather & heat stress', icon: <CloudSun size={14} /> },
];
const HEAT_LEGEND: Record<HeatLayer, { label: string; color: string }[]> = {
  health: [
    { label: 'Healthy area', color: 'var(--primary)' },
    { label: 'Warning', color: 'var(--warn)' },
    { label: 'Disease cluster', color: 'var(--danger)' },
    { label: 'No forecast signal', color: 'var(--border)' },
  ],
  milk: [
    { label: 'High production', color: 'var(--primary)' },
    { label: 'Average', color: 'var(--accent)' },
    { label: 'Low production', color: 'var(--danger)' },
  ],
  feed: [
    { label: 'Good (≥80%)', color: 'var(--primary)' },
    { label: 'Moderate (50–79%)', color: 'var(--warn)' },
    { label: 'Low (<50%)', color: 'var(--danger)' },
  ],
  weather: [
    { label: 'Comfortable', color: 'var(--primary)' },
    { label: 'Moderate stress', color: 'var(--warn)' },
    { label: 'High stress — exposed', color: 'var(--danger)' },
  ],
};

// Pastures have no shade/climate control; barns, the parlor, and other buildings shelter
// cows from both heat and cold, so the same farm-wide conditions hit them less hard.
const OUTDOOR_ZONES = new Set(['graze1', 'graze2']);
type WeatherReading = { heatStress: string; coldStress: string; thi: number };
function weatherZoneCategory(zoneId: string, w?: WeatherReading): 'comfortable' | 'moderate' | 'at_risk' {
  if (!w) return 'comfortable';
  const level = w.heatStress !== 'none' ? w.heatStress : w.coldStress !== 'none' ? w.coldStress : 'none';
  if (level === 'none') return 'comfortable';
  const indoor = !OUTDOOR_ZONES.has(zoneId);
  if (indoor) return level === 'severe' ? 'moderate' : 'comfortable';
  return level === 'moderate' ? 'moderate' : 'at_risk';
}
function weatherZoneColor(zoneId: string, w?: WeatherReading): string {
  const cat = weatherZoneCategory(zoneId, w);
  return cat === 'at_risk' ? 'var(--danger)' : cat === 'moderate' ? 'var(--warn)' : 'var(--primary)';
}
function weatherZoneValue(zoneId: string, w?: WeatherReading): string {
  if (!w) return 'No data';
  const cat = weatherZoneCategory(zoneId, w);
  const indoor = !OUTDOOR_ZONES.has(zoneId);
  if (cat === 'comfortable') return indoor && w.heatStress !== 'none' ? 'Sheltered — comfortable' : 'Comfortable';
  if (cat === 'moderate') return 'Moderate stress';
  return w.heatStress !== 'none' ? 'High heat stress — move indoors' : 'High cold stress — move indoors';
}
// Barns and other buildings shelter cows from the outdoor extremes; pastures don't.
// This is a labeled estimate (no per-barn sensors exist), damped halfway toward a
// comfortable indoor baseline rather than tracking outdoor temperature 1:1.
function estimateZoneTemp(zoneId: string, w?: { temp: number }): number | null {
  if (!w) return null;
  if (OUTDOOR_ZONES.has(zoneId)) return w.temp;
  const indoorBaseline = 20;
  return Math.round(((w.temp + indoorBaseline) / 2) * 10) / 10;
}
function heatColor(layer: HeatLayer, zh?: ZoneHeat): string {
  if (!zh || zh.cowCount === 0) return 'var(--border)';
  if (layer === 'health') {
    if (zh.health.category === 'unknown') return 'var(--border)';
    return zh.health.category === 'disease_cluster' ? 'var(--danger)' : zh.health.category === 'warning' ? 'var(--warn)' : 'var(--primary)';
  }
  if (layer === 'milk') return zh.milk.category === 'high' ? 'var(--primary)' : zh.milk.category === 'average' ? 'var(--accent)' : zh.milk.category === 'low' ? 'var(--danger)' : 'var(--border)';
  const pct = zh.feed.pct;
  if (pct === null) return 'var(--border)';
  return pct >= 80 ? 'var(--primary)' : pct >= 50 ? 'var(--warn)' : 'var(--danger)';
}
function heatValue(layer: HeatLayer, zh?: ZoneHeat): string {
  if (!zh || zh.cowCount === 0) return 'No cows here';
  if (layer === 'health') {
    if (zh.health.category === 'unknown') return 'Not enough signal to forecast';
    if (zh.health.category === 'disease_cluster') return `Disease cluster · ${zh.health.sickCount + zh.health.attentionCount}/${zh.cowCount}`;
    if (zh.health.category === 'warning') return `Warning · ${zh.health.sickCount + zh.health.attentionCount} affected`;
    return 'Healthy area';
  }
  if (layer === 'milk') return zh.milk.avgPerCow === null ? 'No milking cows' : `${zh.milk.avgPerCow}L avg/cow`;
  return zh.feed.pct !== null ? `${zh.feed.pct}% of target intake` : 'No feed data';
}
function zoneColor(zoneId: string, layer: HeatLayer, zh: ZoneHeat | undefined, w: WeatherReading | undefined): string {
  return layer === 'weather' ? weatherZoneColor(zoneId, w) : heatColor(layer, zh);
}
function zoneValue(zoneId: string, layer: HeatLayer, zh: ZoneHeat | undefined, w: WeatherReading | undefined): string {
  return layer === 'weather' ? weatherZoneValue(zoneId, w) : heatValue(layer, zh);
}

export function FarmMap() {
  const { theme } = useTheme();
  const { farmId } = useFarm();
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const [active, setActive] = useState<string | null>(null);
  const { data: mapData } = useAsync(() => mapNodes(farmId), [farmId]);
  const barns = (mapData?.barns || []).map((b: any) => ({ id: b.id, name: b.name, cows: b.cows, capacity: b.capacity }));
  const NODES = MAP_NODES.map((n) => {
    if (n.id === 'barnA' && barns[0]) return { ...n, label: `${n.label.split(' — ')[0]} (${barns[0].cows} cows)`, detail: `Capacity ${barns[0].capacity} · ${barns[0].cows} cows` };
    if (n.id === 'barnB' && barns[1]) return { ...n, label: `${n.label.split(' — ')[0]} (${barns[1].cows} cows)`, detail: `Capacity ${barns[1].capacity} · ${barns[1].cows} cows` };
    return n;
  });
  const node = NODES.find((n) => n.id === active);
  const roadPoints = ROAD_LOOP.map((id) => NODES.find((n) => n.id === id)).filter(Boolean) as typeof NODES;

  // --- timeline: which point in time is the map showing ---
  const [period, setPeriod] = useState<Period>('today');
  const isToday = period === 'today';

  // --- view mode: individual cow pins vs. zone-level heat map vs. calving map ---
  // Cow positions have no history, so scrubbing off "Today" forces the heat-map view.
  const [viewModeChoice, setViewModeChoice] = useState<'cows' | 'heatmap' | 'calving'>('cows');
  const viewMode = isToday ? viewModeChoice : 'heatmap';
  const setViewMode = setViewModeChoice;
  const [heatLayer, setHeatLayer] = useState<HeatLayer>('health');
  const isHeat = viewMode === 'heatmap';
  const isCalving = viewMode === 'calving';

  // --- live cow locations (today only) ---
  const [locKey, setLocKey] = useState(0);
  const { data: cowLocs } = useAsync(() => (isToday ? cowLocations(farmId) : Promise.resolve([])), [farmId, locKey, isToday]);
  const { data: heatData } = useAsync(() => zoneHeatmap(farmId, period), [farmId, locKey, period]);
  const heatByZone = useMemo(() => Object.fromEntries((heatData?.data || []).map((z) => [z.zone, z])), [heatData]);
  const zoneRecommendations = useMemo(() => NODES.flatMap((n) =>
    (heatByZone[n.id]?.recommendations || []).map((r) => ({ ...r, zoneId: n.id, zoneLabel: ZONE_LABEL[n.id] || n.label }))
  ).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1)), [heatByZone]);
  const { data: weatherData } = useAsync(() => weather(farmId, period), [farmId, period]);
  const cows = cowLocs || [];
  const statusCounts = useMemo(() => {
    const counts: Record<CowStatus, number> = { sick: 0, attention: 0, pregnant: 0, breeding: 0, healthy: 0 };
    for (const c of cows) counts[c.status]++;
    return counts;
  }, [cows]);
  const [statusFilter, setStatusFilter] = useState<CowStatus | ''>('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [cowSearch, setCowSearch] = useState('');
  const filteredCows = cows.filter((c) =>
    (!statusFilter || c.status === statusFilter) &&
    (!zoneFilter || c.zone === zoneFilter) &&
    (!cowSearch || c.cowCode.toLowerCase().includes(cowSearch.toLowerCase()) || (c.name || '').toLowerCase().includes(cowSearch.toLowerCase()))
  );
  // Map pins mirror the same filters as the list below, so clicking a status
  // chip or typing a search narrows the whole view, not just the table.
  const cowsByZone = useMemo(() => {
    const map: Record<string, CowLocationView[]> = {};
    for (const c of filteredCows) (map[c.zone] ||= []).push(c);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cows, statusFilter, zoneFilter, cowSearch]);

  // --- calving map: pregnant + recently-calved cows only ---
  const calvingCows = useMemo(() => cows.filter((c) => calvingMarkerFor(c) !== null), [cows]);
  const calvingByZone = useMemo(() => {
    const map: Record<string, CowLocationView[]> = {};
    for (const c of calvingCows) (map[c.zone] ||= []).push(c);
    return map;
  }, [calvingCows]);
  const expectedCalvings = useMemo(() => cows
    .filter((c) => c.isPregnant && c.daysUntilDue !== null)
    .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0)), [cows]);
  const recentlyCalvedCows = useMemo(() => cows
    .filter((c) => c.recentlyCalved)
    .sort((a, b) => (a.daysSinceCalving ?? 0) - (b.daysSinceCalving ?? 0)), [cows]);
  const highRiskPregnancies = useMemo(() => cows
    .filter((c) => c.calvingRisk !== 'none')
    .sort((a, b) => (a.calvingRisk === b.calvingRisk ? 0 : a.calvingRisk === 'high' ? -1 : 1)), [cows]);

  const [activeCow, setActiveCow] = useState<CowLocationView | null>(null);
  const [moveZone, setMoveZone] = useState('');
  const [moveActivity, setMoveActivity] = useState('');
  const openCow = (c: CowLocationView) => { setActiveCow(c); setMoveZone(c.zone); setMoveActivity(c.activity); };
  const submitMove = async () => {
    if (!activeCow) return;
    await moveCowLocation(farmId, activeCow.cowId, moveZone, moveActivity);
    push(`${activeCow.name || activeCow.cowCode} moved to ${ZONE_LABEL[moveZone] || moveZone}`);
    setActiveCow(null);
    setLocKey((k) => k + 1);
  };

  // --- zoom & pan ---
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [interacting, setInteracting] = useState(false);
  const drag = useRef<{ active: boolean; startX: number; startY: number; panX: number; panY: number; moved: boolean }>({ active: false, startX: 0, startY: 0, panX: 0, panY: 0, moved: false });
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  const clampPan = useCallback((z: number, p: { x: number; y: number }) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return p;
    const maxX = (rect.width * (z - 1)) / 2;
    const maxY = (rect.height * (z - 1)) / 2;
    return { x: clamp(p.x, -maxX, maxX), y: clamp(p.y, -maxY, maxY) };
  }, []);

  const setZoomClamped = useCallback((next: number) => {
    const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
    setZoom(z);
    setPan((p) => clampPan(z, p));
  }, [clampPan]);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoomClamped(zoom - e.deltaY * 0.0025);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.node')) return;
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setInteracting(true);
    if (pinch.current.size === 2) {
      const [a, b] = Array.from(pinch.current.values());
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag.current.active = false;
    } else if (pinch.current.size === 1) {
      drag.current = { active: true, startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pinch.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setZoomClamped(pinchStart.current.zoom * (dist / pinchStart.current.dist));
      return;
    }
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
    if (zoom > 1) setPan(clampPan(zoom, { x: drag.current.panX + dx, y: drag.current.panY + dy }));
  };

  const endPointer = (e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    drag.current.active = false;
    if (pinch.current.size === 0) setInteracting(false);
  };

  return (
    <div>
      <PageHeader eyebrow="OPERATIONS" title="Interactive farm map"
        desc="Scroll or pinch to zoom, drag to pan, tap any location for live details."
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className={`btn sm ${viewMode === 'cows' ? '' : 'ghost'}`} disabled={!isToday} title={isToday ? undefined : 'Cow positions are only tracked live — switch the timeline to Today'} onClick={() => setViewMode('cows')}><MapPin size={14} /> Cow view</button>
            <button className={`btn sm ${viewMode === 'calving' ? '' : 'ghost'}`} disabled={!isToday} title={isToday ? undefined : 'Calving status is only tracked live — switch the timeline to Today'} onClick={() => setViewMode('calving')}><Baby size={14} /> Calving</button>
            <button className={`btn sm ${viewMode === 'heatmap' ? '' : 'ghost'}`} onClick={() => setViewMode('heatmap')}><Flame size={14} /> Heat map</button>
          </div>
        } />

      <div className="card mb timeline-slider">
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <History size={15} color="var(--primary)" />
          <b style={{ fontSize: 14 }}>Timeline</b>
          <span className="muted" style={{ fontSize: 13 }}>— see how the farm changes over time</span>
        </div>
        <input
          type="range" min={0} max={TIMELINE.length - 1} step={1}
          value={TIMELINE.findIndex((t) => t.id === period)}
          onChange={(e) => setPeriod(TIMELINE[+e.target.value].id)}
          className="timeline-range"
        />
        <div className="timeline-ticks">
          {TIMELINE.map((t) => (
            <button key={t.id} className={`timeline-tick ${period === t.id ? 'active' : ''}`} onClick={() => setPeriod(t.id)}>
              <b>{t.label}</b>
              <span>{t.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {isHeat && (
        <div className="row mb" style={{ gap: 8, flexWrap: 'wrap' }}>
          {HEAT_LAYERS.map((l) => (
            <button key={l.id} className={`btn sm ${heatLayer === l.id ? '' : 'ghost'}`} onClick={() => setHeatLayer(l.id)}>{l.icon} {l.label}</button>
          ))}
        </div>
      )}
      <div
        ref={viewportRef}
        className={`map ${theme === 'dark' ? 'dark' : ''}`}
        style={{ cursor: zoom > 1 ? 'grab' : 'default', touchAction: 'none' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      >
        <div className={`map-scene ${interacting ? 'panning' : ''}`} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}>
          <svg className="map-roads" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline className="road" points={roadPoints.map((n) => `${n.x},${n.y}`).join(' ')} />
          </svg>
          {NODES.map((n) => {
            const zh = heatByZone[n.id];
            const tone = isHeat ? zoneColor(n.id, heatLayer, zh, weatherData) : n.tone;
            const recs = zh?.recommendations || [];
            const worst = recs.some((r) => r.severity === 'critical') ? 'critical' : recs.length ? 'warning' : null;
            return (
              <button key={n.id} className={`node ${active === n.id ? 'active' : ''}`}
                style={{
                  left: n.x + '%', top: n.y + '%', borderColor: tone,
                  background: isHeat ? `color-mix(in srgb, ${tone} 20%, var(--surface))` : undefined,
                }}
                onClick={() => { if (!drag.current.moved) setActive(n.id); drag.current.moved = false; }}>
                {worst && (
                  <span className="node-alert" style={{ background: worst === 'critical' ? 'var(--danger)' : 'var(--warn)' }} title={`${recs.length} AI recommendation${recs.length > 1 ? 's' : ''}`}>
                    <AlertTriangle size={11} />
                  </span>
                )}
                <span style={{ color: tone, display: 'grid', placeItems: 'center' }}>{n.icon}</span>
                <span>
                  {n.label}
                  {isHeat && <><br /><small style={{ fontWeight: 700, opacity: 0.85 }}>{zoneValue(n.id, heatLayer, zh, weatherData)}</small></>}
                </span>
              </button>
            );
          })}
          {viewMode === 'cows' && NODES.map((n) => (cowsByZone[n.id] || []).map((c, idx) => {
            const total = cowsByZone[n.id].length;
            const pos = jitterFor(n.x, n.y, idx, total);
            return (
              <button key={c.cowId} className="cow-pin" title={`${c.name || c.cowCode} — ${STATUS_LABEL[c.status]}`}
                style={{ left: pos.x + '%', top: pos.y + '%', background: STATUS_COLOR[c.status] }}
                onClick={() => { if (!drag.current.moved) openCow(c); drag.current.moved = false; }} />
            );
          }))}
          {isCalving && NODES.map((n) => (calvingByZone[n.id] || []).map((c, idx) => {
            const total = calvingByZone[n.id].length;
            const pos = jitterFor(n.x, n.y, idx, total);
            const marker = calvingMarkerFor(c) as CalvingMarker;
            return (
              <button key={c.cowId} className="cow-pin" title={`${c.name || c.cowCode} — ${CALVING_LABEL[marker]}`}
                style={{ left: pos.x + '%', top: pos.y + '%', background: CALVING_COLOR[marker] }}
                onClick={() => { if (!drag.current.moved) openCow(c); drag.current.moved = false; }} />
            );
          }))}
        </div>
        <div className="map-compass" title="North">N</div>
        <div className="map-zoom">
          <button type="button" onClick={() => setZoomClamped(zoom + 0.4)} title="Zoom in"><ZoomIn size={15} /></button>
          <button type="button" onClick={() => setZoomClamped(zoom - 0.4)} title="Zoom out"><ZoomOut size={15} /></button>
          <button type="button" onClick={resetView} title="Reset view"><Maximize size={15} /></button>
        </div>
      </div>
      <div className="map-legend">
        {isHeat
          ? HEAT_LEGEND[heatLayer].map((l) => <div className="item" key={l.label}><span className="dot" style={{ background: l.color }} /> {l.label}</div>)
          : MAP_LEGEND.map((l) => <div className="item" key={l.label}><span className="dot" style={{ background: l.tone }} /> {l.label}</div>)}
      </div>

      {zoneRecommendations.length > 0 && (
        <div className="mt">
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>AI recommendations</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {zoneRecommendations.map((r, i) => (
              <div key={i} className="card" style={{ cursor: 'pointer', borderLeft: `4px solid ${r.severity === 'critical' ? 'var(--danger)' : 'var(--warn)'}` }}
                onClick={() => setActive(r.zoneId)}>
                <div className="row" style={{ gap: 6, color: r.severity === 'critical' ? 'var(--danger)' : 'var(--warn)', fontWeight: 700, fontSize: 12 }}>
                  <AlertTriangle size={14} /> AI RECOMMENDATION
                </div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{r.zoneLabel}</div>
                <p style={{ fontSize: 14, marginTop: 4 }}>{r.title}.</p>
                <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isHeat && heatLayer === 'weather' && weatherData && (
        <div className="card mt" style={{ background: weatherData.heatStress !== 'none' || weatherData.coldStress !== 'none' ? 'var(--danger-soft)' : 'var(--primary-soft)', borderColor: 'transparent' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 14 }}>
            <div><div className="muted" style={{ fontSize: 12 }}><CloudRain size={13} /> Rain</div><b style={{ fontSize: 18 }}>{weatherData.rainMm ?? 0}mm</b></div>
            <div><div className="muted" style={{ fontSize: 12 }}><Thermometer size={13} /> Temperature</div><b style={{ fontSize: 18 }}>{weatherData.temp}°C</b></div>
            <div><div className="muted" style={{ fontSize: 12 }}><Wind size={13} /> Wind</div><b style={{ fontSize: 18 }}>{weatherData.wind} km/h</b></div>
            <div><div className="muted" style={{ fontSize: 12 }}><Droplets size={13} /> Humidity</div><b style={{ fontSize: 18 }}>{weatherData.humidity}%</b></div>
            <div><div className="muted" style={{ fontSize: 12 }}><Flame size={13} /> Heat stress</div><b style={{ fontSize: 18, textTransform: 'capitalize' }}>{weatherData.heatStress !== 'none' ? weatherData.heatStress : weatherData.coldStress !== 'none' ? `Cold · ${weatherData.coldStress}` : 'None'}</b></div>
          </div>
          {(weatherData.heatStress !== 'none' || weatherData.coldStress !== 'none') && (
            <div className="row mt" style={{ gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={16} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 14 }}>{weatherData.recommendation}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid mt" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px,1fr))' }}>
        {NODES.map((n) => {
          const zh = heatByZone[n.id];
          return (
            <div className="card" key={n.id} onClick={() => setActive(n.id)} style={{ cursor: 'pointer' }}>
              <div className="row">{n.icon && <span style={{ color: n.tone }}>{n.icon}</span>}<b>{n.label}</b></div>
              {isHeat
                ? <p className="row" style={{ fontSize: 13, marginTop: 6, gap: 6 }}><span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: zoneColor(n.id, heatLayer, zh, weatherData) }} /> {zoneValue(n.id, heatLayer, zh, weatherData)}</p>
                : <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{n.detail}</p>}
            </div>
          );
        })}
      </div>

      {isCalving && <>
        <PageHeader eyebrow="BREEDING & CALVING" title="Calving map" desc={`${expectedCalvings.length} expected · ${recentlyCalvedCows.length} recently calved · ${highRiskPregnancies.length} flagged for risk.`} />
        <div className="map-legend mb">
          {(['expected', 'watch', 'high', 'calved'] as CalvingMarker[]).map((m) => (
            <div className="item" key={m}><span className="dot" style={{ background: CALVING_COLOR[m] }} /> {CALVING_LABEL[m]}</div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 16 }}>
          <div className="card">
            <div className="row" style={{ gap: 6 }}><CalendarClock size={16} color="var(--info)" /><b>Expected calving</b></div>
            {expectedCalvings.length === 0 && <p className="muted mt" style={{ fontSize: 13 }}>No pregnant cows with a due date on file.</p>}
            {expectedCalvings.map((c) => (
              <div key={c.cowId} className="between mt" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => openCow(c)}>
                <div><b>{c.name || c.cowCode}</b> <span className="muted" style={{ fontSize: 12 }}>{ZONE_LABEL[c.zone] || c.zone}</span></div>
                <span className={`pill ${c.daysUntilDue !== null && c.daysUntilDue < 0 ? 'sick' : c.daysUntilDue !== null && c.daysUntilDue <= 3 ? 'attention' : 'info'}`}>
                  {c.daysUntilDue !== null && c.daysUntilDue < 0 ? `${-c.daysUntilDue}d overdue` : `in ${c.daysUntilDue}d`}
                </span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="row" style={{ gap: 6 }}><Baby size={16} color="var(--accent)" /><b>Recently calved</b></div>
            {recentlyCalvedCows.length === 0 && <p className="muted mt" style={{ fontSize: 13 }}>No calvings in the last 14 days.</p>}
            {recentlyCalvedCows.map((c) => (
              <div key={c.cowId} className="between mt" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => openCow(c)}>
                <div><b>{c.name || c.cowCode}</b> <span className="muted" style={{ fontSize: 12 }}>{ZONE_LABEL[c.zone] || c.zone}</span></div>
                <span className="pill healthy">{c.daysSinceCalving === 0 ? 'Today' : `${c.daysSinceCalving}d ago`}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="row" style={{ gap: 6 }}><AlertTriangle size={16} color="var(--danger)" /><b>High-risk pregnancies</b></div>
            {highRiskPregnancies.length === 0 && <p className="muted mt" style={{ fontSize: 13 }}>No pregnancies currently flagged for risk.</p>}
            {highRiskPregnancies.map((c) => (
              <div key={c.cowId} className="mt" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => openCow(c)}>
                <div className="between">
                  <div><b>{c.name || c.cowCode}</b> <span className="muted" style={{ fontSize: 12 }}>{ZONE_LABEL[c.zone] || c.zone}</span></div>
                  <span className={`pill ${c.calvingRisk === 'high' ? 'sick' : 'attention'}`}>{c.calvingRisk === 'high' ? 'High risk' : 'Watch'}</span>
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{calvingRiskReasons(c).join(' · ')}</p>
              </div>
            ))}
          </div>
        </div>
      </>}

      {viewMode === 'cows' && <>
        <PageHeader eyebrow="LIVE TRACKING" title="Cow locations" desc={`${cows.length} cows · manually assigned zones today, RFID/GPS-ready.`} />
        <div className="map-legend mb">
          {STATUS_ORDER.map((s) => (
            <button key={s} className="item" style={{ cursor: 'pointer', background: statusFilter === s ? 'var(--surface-2)' : 'none', border: 0, padding: '4px 8px', borderRadius: 8 }}
              onClick={() => setStatusFilter((f) => (f === s ? '' : s))}>
              <span className="dot" style={{ background: STATUS_COLOR[s] }} /> {STATUS_LABEL[s]} <span className="muted">({statusCounts[s]})</span>
            </button>
          ))}
        </div>
        <div className="card mb" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12 }}>
          <input className="input" placeholder="Search cow ID or name" value={cowSearch} onChange={(e) => setCowSearch(e.target.value)} />
          <select className="select" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
            <option value="">All zones</option>
            {NODES.map((n) => <option key={n.id} value={n.id}>{ZONE_LABEL[n.id]}</option>)}
          </select>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CowStatus | '')}>
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cow</th><th>Status</th><th>Location</th><th>Activity</th><th>Milk today</th><th></th></tr></thead>
            <tbody>
              {filteredCows.map((c) => (
                <tr key={c.cowId} style={{ cursor: 'pointer' }} onClick={() => openCow(c)}>
                  <td><b>{c.name || c.cowCode}</b> <span className="muted" style={{ fontSize: 12 }}>{c.cowCode}</span></td>
                  <td><span className={`pill ${STATUS_PILL[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                  <td>{ZONE_LABEL[c.zone] || c.zone}</td>
                  <td style={{ textTransform: 'capitalize' }}>{ACTIVITY_LABEL[c.activity] || c.activity}</td>
                  <td>{c.isMilking ? fmt.liters(c.milkToday) : '—'}</td>
                  <td><button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); openCow(c); }}><MoveIcon size={13} /> Move</button></td>
                </tr>
              ))}
              {!filteredCows.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>No cows match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}

      {node && (() => {
        const zh = heatByZone[node.id];
        const temp = estimateZoneTemp(node.id, weatherData);
        const hasCows = !!zh && zh.cowCount > 0;
        return (
          <Modal title={node.label} onClose={() => setActive(null)}>
            <p style={{ fontSize: 15 }}>{node.detail}</p>
            {!isToday && (
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Showing {TIMELINE.find((t) => t.id === period)?.label.toLowerCase()} — cow headcount reflects today's live positions; the numbers below are from that period.
              </p>
            )}
            {hasCows && zh ? (
              <div className="grid mt" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div><div className="muted" style={{ fontSize: 12 }} title="Cows currently tracked in this zone — may differ from the barn's assigned headcount above if some are out grazing or being treated">Here now</div><b style={{ fontSize: 20 }}>{zh.cowCount}</b></div>
                <div><div className="muted" style={{ fontSize: 12 }}>{isToday ? 'Milk today' : period === 'forecast' ? 'Milk (forecast)' : `Milk (${TIMELINE.find((t) => t.id === period)?.label.toLowerCase()}, daily avg)`}</div><b style={{ fontSize: 20 }}>{zh.milk.totalToday !== null ? fmt.liters(zh.milk.totalToday) : '—'}</b></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Average</div><b style={{ fontSize: 20 }}>{zh.milk.avgPerCow !== null ? fmt.liters(zh.milk.avgPerCow) : '—'}</b></div>
                <div><div className="muted" style={{ fontSize: 12 }}>{isToday ? 'Healthy' : 'No new diagnosis'}</div><b style={{ fontSize: 20, color: 'var(--primary)' }}>{zh.health.category === 'unknown' ? '—' : zh.health.healthyCount}</b></div>
                <div><div className="muted" style={{ fontSize: 12 }} title={isToday ? undefined : 'Cows with a treatment logged in this period — health has no historical snapshot, so this is a real but different signal than a point-in-time sick count'}>{isToday ? 'Sick' : 'Diagnosed'}</div><b style={{ fontSize: 20, color: zh.health.sickCount ? 'var(--danger)' : undefined }}>{zh.health.category === 'unknown' ? '—' : zh.health.sickCount}</b></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Feed left</div><b style={{ fontSize: 20 }}>{zh.feed.daysRemaining !== null ? `${zh.feed.daysRemaining} days` : '—'}</b></div>
                {temp !== null && <div><div className="muted" style={{ fontSize: 12 }}>Temperature</div><b style={{ fontSize: 20 }}>{temp}°C</b></div>}
              </div>
            ) : (
              <p className="muted mt" style={{ fontSize: 13 }}>No cows currently in this zone.</p>
            )}
            {(zh?.recommendations || []).map((r, i) => (
              <div key={i} className="card mt" style={{ background: r.severity === 'critical' ? 'var(--danger-soft)' : 'var(--warn-soft)', borderColor: 'transparent' }}>
                <div className="row" style={{ gap: 6, color: r.severity === 'critical' ? 'var(--danger)' : 'var(--warn)', fontWeight: 700, fontSize: 12 }}>
                  <AlertTriangle size={14} /> AI RECOMMENDATION
                </div>
                <p style={{ fontSize: 14, marginTop: 4 }}>{r.title}.</p>
                <p style={{ fontSize: 13, marginTop: 2 }}>{r.body}</p>
              </div>
            ))}
            <div className="row mt">
              <button className="btn sm" onClick={() => { setActive(null); navigate('/app/cows'); }}>View cows here</button>
              <button className="btn ghost sm" onClick={() => setActive(null)}>Close</button>
            </div>
          </Modal>
        );
      })()}

      {activeCow && <Modal title={activeCow.name || activeCow.cowCode} onClose={() => setActiveCow(null)}>
        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          <span className={`pill ${STATUS_PILL[activeCow.status]}`}>{STATUS_LABEL[activeCow.status]}</span>
          <span className="muted" style={{ fontSize: 13 }}>{activeCow.cowCode} · {activeCow.breed}</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14, marginBottom: 6 }}>
          <div><span className="muted" style={{ fontSize: 12 }}>Milk today</span><div className="row" style={{ gap: 5 }}><Milk size={14} /> <b>{activeCow.isMilking ? fmt.liters(activeCow.milkToday) : '—'}</b></div></div>
          <div><span className="muted" style={{ fontSize: 12 }}>Location</span><div><b>{ZONE_LABEL[activeCow.zone] || activeCow.zone}</b></div></div>
          <div><span className="muted" style={{ fontSize: 12 }}>Activity</span><div><b>{ACTIVITY_LABEL[activeCow.activity] || activeCow.activity}</b></div></div>
          <div><span className="muted" style={{ fontSize: 12 }}>Source</span><div><b style={{ textTransform: 'uppercase' }}>{activeCow.source}</b></div></div>
        </div>
        {(activeCow.isPregnant || activeCow.recentlyCalved) && (
          <div className="card mt" style={{ background: activeCow.calvingRisk === 'high' ? 'var(--danger-soft)' : activeCow.calvingRisk === 'watch' ? 'var(--warn-soft)' : 'var(--info-soft)', borderColor: 'transparent' }}>
            <div className="row" style={{ gap: 6 }}><Baby size={15} /> <b style={{ fontSize: 13 }}>Calving</b></div>
            {activeCow.isPregnant && activeCow.expectedCalvingOn && (
              <p style={{ fontSize: 13, marginTop: 4 }}>
                Expected {new Date(activeCow.expectedCalvingOn).toLocaleDateString()} — {activeCow.daysUntilDue !== null && activeCow.daysUntilDue < 0 ? `${-activeCow.daysUntilDue} day(s) overdue` : `in ${activeCow.daysUntilDue} day(s)`}
              </p>
            )}
            {activeCow.recentlyCalved && activeCow.lastCalvingOn && (
              <p style={{ fontSize: 13, marginTop: 4 }}>Calved {new Date(activeCow.lastCalvingOn).toLocaleDateString()} ({activeCow.daysSinceCalving}d ago)</p>
            )}
            {activeCow.calvingRisk !== 'none' && (
              <p style={{ fontSize: 13, marginTop: 4, fontWeight: 700 }}>
                {activeCow.calvingRisk === 'high' ? 'High risk' : 'Watch closely'}: {calvingRiskReasons(activeCow).join(' · ')}
              </p>
            )}
          </div>
        )}
        <div className="field mt"><label>Move to zone</label>
          <div className="row" style={{ gap: 8 }}>
            <select className="select" value={moveZone} onChange={(e) => setMoveZone(e.target.value)}>
              {NODES.map((n) => <option key={n.id} value={n.id}>{ZONE_LABEL[n.id]}</option>)}
            </select>
            <select className="select" value={moveActivity} onChange={(e) => setMoveActivity(e.target.value)}>
              {ACTIVITIES.map((a) => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
            </select>
          </div>
        </div>
        <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn ghost sm" onClick={() => { setActiveCow(null); navigate('/app/cow/' + activeCow.cowId); }}>View full profile</button>
          <button className="btn sm" onClick={submitMove}><MoveIcon size={14} /> Save location</button>
        </div>
      </Modal>}
    </div>
  );
}

export function Gallery({ id }: { id?: string }) {
  const { farmId } = useFarm();
  const { push } = useToast();
  const [key, setKey] = useState(0);
  const refresh = () => setKey((k) => k + 1);
  const { data: items } = useAsync(() => gallery(farmId), [farmId, key]);
  const { data: cats } = useAsync(() => galleryCategories(farmId), [farmId, key]);
  const all = items || [];
  const categories = cats?.categories || [];
  const itemsByCat = cats?.items || all;
  const cat = id ? categories.find((g: any) => g.id === id) || categories[0] : categories[0];
  const filtered = cat ? (itemsByCat || all).filter((g: any) => g.category === cat.id) : all;
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({ url: '', category: 'cows', caption: '', isPrimary: false });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stopCamera = () => {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); setStream(null); }
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(s);
      setCameraOpen(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); } }, 100);
    } catch (err) { push('Camera access denied'); }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.drawImage(videoRef.current, 0, 0); setForm((f) => ({ ...f, url: canvas.toDataURL('image/jpeg', 0.9) })); }
    stopCamera();
    setCameraOpen(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, url: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url) return;
    await createGalleryItem(farmId, form);
    push('Photo added');
    setForm({ url: '', category: 'cows', caption: '', isPrimary: false });
    setAddOpen(false);
    refresh();
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    await updateGalleryItem(editItem.id, form);
    push('Photo updated');
    setEditItem(null);
    refresh();
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ url: item.url, category: item.category, caption: item.caption || '', isPrimary: item.is_primary ?? item.isPrimary ?? false });
  };

  return (
    <div>
      <PageHeader eyebrow="GALLERY" title="Photo gallery" desc="Upload, capture, and manage farm photos."
        actions={<button className="btn sm" onClick={() => setAddOpen(true)}><Plus size={15} /> Add photo</button>} />
      <div className="row mb">
        {categories.map((g: any) => <button key={g.id} className={`btn sm ${cat?.id === g.id ? '' : 'ghost'}`} onClick={() => location.hash = '#/app/gallery/' + g.id}>{g.label} ({g.count})</button>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))' }}>
        {(filtered.length ? filtered : all).map((item: any) => (
          <div key={item.id} className="card reveal" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ position: 'relative' }}>
              <img src={item.url} alt={item.caption || 'Gallery'} style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block', background: 'var(--surface-2)' }} />
              <div className="row" style={{ position: 'absolute', top: 8, right: 8, gap: 4 }}>
                <button className="btn ghost sm" style={{ background: 'rgba(255,255,255,0.9)' }} onClick={() => openEdit(item)}><Edit3 size={13} /></button>
                <button className="btn ghost sm" style={{ background: 'rgba(255,255,255,0.9)' }} onClick={() => setPreview(item.url)}><Eye size={13} /></button>
                <button className="btn ghost sm" style={{ background: 'rgba(255,255,255,0.9)' }} onClick={async () => { if (confirm('Delete this photo?')) { await deleteGalleryItem(item.id); push('Photo deleted'); refresh(); } }}><Trash2 size={13} /></button>
              </div>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.caption || item.category}</div>
              {item.caption && <div className="muted" style={{ fontSize: 11 }}>{item.category}</div>}
            </div>
          </div>
        ))}
      </div>

      {addOpen && <Modal title="Add photo" onClose={() => { setAddOpen(false); stopCamera(); }}>
        <form onSubmit={submitAdd}>
          <div className="field"><label>Category</label>
            <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="cows">Cows</option><option value="calves">Calves</option><option value="employees">Employees</option><option value="equipment">Equipment</option><option value="facilities">Facilities</option>
            </select>
          </div>
          <div className="field"><label>Caption</label><input className="input" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="Describe this photo" /></div>
          <div className="field"><label>Image</label>
            <div className="row" style={{ gap: 8 }}>
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                <FolderOpen size={14} /> Upload from PC
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
              </label>
              <button type="button" className="btn sm" onClick={startCamera}><Camera size={14} /> Take photo</button>
            </div>
          </div>
          {form.url && <img src={form.url} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginTop: 10, background: 'var(--surface-2)' }} />}
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={!form.url}>Save photo</button>
          </div>
        </form>
      </Modal>}

      {editItem && <Modal title="Edit photo" onClose={() => setEditItem(null)}>
        <form onSubmit={submitEdit}>
          <div className="field"><label>Category</label>
            <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="cows">Cows</option><option value="calves">Calves</option><option value="employees">Employees</option><option value="equipment">Equipment</option><option value="facilities">Facilities</option>
            </select>
          </div>
          <div className="field"><label>Caption</label><input className="input" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></div>
          <div className="field"><label>Retake / Replace image</label>
            <div className="row" style={{ gap: 8 }}>
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                <FolderOpen size={14} /> Upload new
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
              </label>
              <button type="button" className="btn sm" onClick={startCamera}><Camera size={14} /> Retake</button>
            </div>
          </div>
          {form.url && <img src={form.url} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginTop: 10, background: 'var(--surface-2)' }} />}
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setEditItem(null)}>Cancel</button>
            <button className="btn" type="submit" disabled={!form.url}>Save changes</button>
          </div>
        </form>
      </Modal>}

      {preview && <Modal title="Photo preview" onClose={() => setPreview(null)}>
        <img src={preview} alt="Preview" style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 8, background: 'var(--surface-2)' }} />
        <div className="row mt" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setPreview(null)}>Close</button>
        </div>
      </Modal>}

      {cameraOpen && <Modal title="Take photo" onClose={() => { setCameraOpen(false); stopCamera(); }}>
        <video ref={videoRef} style={{ width: '100%', borderRadius: 8, background: '#000' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className="row mt" style={{ justifyContent: 'center', gap: 10 }}>
          <button type="button" className="btn" onClick={capturePhoto}><Camera size={16} /> Capture</button>
          <button type="button" className="btn ghost" onClick={() => { setCameraOpen(false); stopCamera(); }}>Cancel</button>
        </div>
      </Modal>}
    </div>
  );
}

export function AdvancedSearch({ initial = '' }: { initial?: string }) {
  const { farmId } = useFarm();
  const [f, setF] = useState({ q: initial, breed: '', health: '', pregnant: '', age: '', minMilk: '' });
  const { data: cows } = useAsync(() => listCows(farmId, { search: f.q, breed: f.breed, health: f.health, pregnant: f.pregnant }), [farmId, f.q, f.breed, f.health, f.pregnant]);
  const res = (cows || []).filter((c) => !f.minMilk || c.avgDailyMilk >= +f.minMilk);

  return (
    <div>
      <PageHeader eyebrow="SEARCH" title="Advanced search" desc={`${res.length} cows match`} />
      <div className="card mb" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12 }}>
        <input className="input" placeholder="Cow ID / name / tag" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className="select" value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })}><option value="">All breeds</option>{['Holstein','Jersey','Guernsey','Ayrshire','Brown Swiss','Fleckvieh'].map((b) => <option key={b}>{b}</option>)}</select>
        <select className="select" value={f.health} onChange={(e) => setF({ ...f, health: e.target.value })}><option value="">Any health</option><option value="healthy">Healthy</option><option value="sick">Sick</option><option value="under_treatment">Under treatment</option></select>
        <select className="select" value={f.pregnant} onChange={(e) => setF({ ...f, pregnant: e.target.value })}><option value="">Any pregnancy</option><option value="yes">Pregnant</option><option value="no">Open</option></select>
        <input className="input" type="number" placeholder="Min milk L/day" value={f.minMilk} onChange={(e) => setF({ ...f, minMilk: e.target.value })} />
      </div>
      <div className="table-wrap">
        <table><thead><tr><th>Cow</th><th>Code</th><th>Breed</th><th>Health</th><th>Pregnant</th><th>Milk/day</th></tr></thead>
          <tbody>{res.map((c) => <tr key={c.id}><td><div className="row"><CowPhoto name={c.name} color={c.color} size={32} photoUrl={c.photoUrl} /> {c.name}</div></td><td>{c.cowCode}</td><td>{c.breed}</td><td><span className={`pill ${c.health}`}>{c.health.replace('_', ' ')}</span></td><td>{c.isPregnant ? 'Yes' : 'No'}</td><td>{c.avgDailyMilk ? fmt.liters(c.avgDailyMilk) : '—'}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

export function Gamification() {
  const { push } = useToast();
  return (
    <div>
      <PageHeader eyebrow="ENGAGEMENT" title="Goals & achievements"
        desc="Earn badges and climb the leaderboard." actions={<button className="btn sm" onClick={() => push('Goal saved')}><Trophy size={15} /> New goal</button>} />
      <div className="two">
        <div className="card">
          <h3>Achievement badges</h3>
          <div className="grid mt" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {BADGES.map((b) => (
              <div key={b.id} className="card" style={{ opacity: b.earned ? 1 : 0.5, display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
                <div className="icon" style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: b.earned ? 'var(--primary-soft)' : 'var(--surface-2)', color: b.earned ? 'var(--primary)' : 'var(--text-soft)' }}><Crown size={18} /></div>
                <div><b>{b.name}</b><div className="muted" style={{ fontSize: 12 }}>{b.desc}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Leaderboard</h3>
          {LEADERBOARD.map((l, i) => (
            <div key={l.name} className={`between mt ${l.you ? '' : ''}`} style={{ padding: '10px 12px', borderRadius: 10, background: l.you ? 'var(--primary-soft)' : 'var(--surface-2)' }}>
              <div className="row"><span className="tag">#{i + 1}</span><b>{l.name}</b><span className="muted" style={{ fontSize: 12 }}>{l.role}</span></div>
              <b>{fmt.num(l.score)}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="three mt">
        <GoalCard icon={<Flame size={18} />} title="Monthly milk target" value={72} />
        <GoalCard icon={<Crown size={18} />} title="Breeding rate" value={64} />
        <GoalCard icon={<Trophy size={18} />} title="Records accuracy" value={91} />
      </div>
    </div>
  );
}
function GoalCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: number }) {
  return <div className="card"><div className="row"><span style={{ color: 'var(--primary)' }}>{icon}</span><b>{title}</b></div><div className="mt"><Progress value={value} /></div><div className="between mt"><span className="muted" style={{ fontSize: 13 }}>{value}%</span><span className="muted" style={{ fontSize: 13 }}>of goal</span></div></div>;
}
