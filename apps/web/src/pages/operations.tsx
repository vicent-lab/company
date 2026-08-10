import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useFarm } from '../app';
import { useTheme } from '../theme';
import { useHashRoute } from '../router';
import { useAuth } from '../auth';
import { CowPhoto, QrCode, PageHeader, Kpi, AnimatedCounter, Modal, Progress, useToast, useAsync } from '../ui';
import { isLive } from '../api';
import { ALL_COWS, BADGES, LEADERBOARD, BARNS } from '../mock';
import { listCows, gallery, galleryCategories, createGalleryItem, updateGalleryItem, deleteGalleryItem, mapNodes, cowLocations, moveCowLocation, zoneHeatmap, weather, CowLocationView, CowStatus, ZoneHeat, ZoneRecommendation, Period, CalvingRisk, listFarmMapObjects, createFarmMapObject, updateFarmMapObject, deleteFarmMapObject, moveFarmMapObject, getUndoLog, undoChange, redoChange, saveDraft, getDraft, publishDraft, FarmMapObject, getFarmLocation, updateFarmLocation, listFarmBoundaries, createFarmBoundary, deleteFarmBoundary, listFarmPastures, createFarmPasture, updateFarmPasture, deleteFarmPasture, createMapMeasurement, listMapMeasurements, deleteMapMeasurement, getMapLayers, updateMapLayers, getMapProviders, updateMapProviders, mapAiQuery, mapAiHighlight, FarmBoundary, FarmPasture, MapMeasurement, MapProviderSettings, MapAiQueryResult, FarmLocation, formatHectares, formatAcres, formatMeters, formatMeasurementValue } from '../data';
import { Home, Droplets, Tractor, Warehouse, Syringe, Wheat, Trophy, Flame, Crown, Search, Filter, Download, Plus, Edit3, Eye, Trash2, FolderOpen, Camera, ZoomIn, ZoomOut, Maximize, Milk, Move as MoveIcon, MapPin, Beef, Utensils, CloudSun, Thermometer, Wind, CloudRain, AlertTriangle, History, Baby, CalendarClock, MousePointer2, Square, Minus, Fence, Wrench, Stethoscope, Save, Undo2, Redo2, X } from 'lucide-react';
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
  const { user } = useAuth();
  const canEdit = isLive ? (user?.permissions || []).includes('farm:manage') : true;
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

  // --- edit mode ---
  const [editMode, setEditMode] = useState(false);
  const [editTool, setEditTool] = useState<'select' | 'move' | 'draw-area' | 'draw-line' | 'add-marker' | 'add-building' | 'add-pasture' | 'add-fence' | 'add-gate' | 'add-water-point' | 'add-feed-store' | 'add-milking-area' | 'add-vet-area' | 'add-equipment-area' | 'add-custom' | 'delete'>('select');
  const [mapObjects, setMapObjects] = useState<FarmMapObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undoLog, setUndoLog] = useState<any[]>([]);
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [propertyForm, setPropertyForm] = useState({ name: '', type: '', properties: {} as Record<string, any> });

  const [mapStyle, setMapStyle] = useState<'farm-layout' | 'standard' | 'satellite' | 'terrain' | 'ai-analysis'>('farm-layout');
  const [farmLocation, setFarmLocation] = useState<FarmLocation | null>(null);
  const [boundaries, setBoundaries] = useState<FarmBoundary[]>([]);
  const [pastures, setPastures] = useState<FarmPasture[]>([]);
  const [measurements, setMeasurements] = useState<MapMeasurement[]>([]);
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({});
  const [measureTool, setMeasureTool] = useState<'none' | 'distance' | 'area' | 'perimeter' | 'boundary' | 'pasture'>('none');
  const [drawingPoints, setDrawingPoints] = useState<{ lng: number; lat: number }[]>([]);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResult, setAiResult] = useState<MapAiQueryResult | null>(null);
  const [aiHighlights, setAiHighlights] = useState<any>({ type: 'FeatureCollection', features: [] });
  const [mapReady, setMapReady] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showBoundaryModal, setShowBoundaryModal] = useState(false);
  const [showPastureModal, setShowPastureModal] = useState(false);
  const [selectedPasture, setSelectedPasture] = useState<FarmPasture | null>(null);
  const [showMeasureModal, setShowMeasureModal] = useState(false);
  const [offline, setOffline] = useState(false);

  const mapInstanceRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const loadMapData = async () => {
    const objs = await listFarmMapObjects(farmId);
    setMapObjects(objs);
    const log = await getUndoLog(farmId);
    setUndoLog(log);
  };

  useEffect(() => {
    if (editMode) { void loadMapData(); }
  }, [editMode]);

  useEffect(() => {
    let cancelled = false;
    const loadMapSettings = async () => {
      try {
        const [loc, b, p, m, layers] = await Promise.all([
          getFarmLocation(farmId),
          listFarmBoundaries(farmId),
          listFarmPastures(farmId),
          listMapMeasurements(farmId),
          getMapLayers(farmId),
        ]);
        if (!cancelled) {
          setFarmLocation(loc);
          setBoundaries(b);
          setPastures(p);
          setMeasurements(m);
          setActiveLayers(layers.layers);
        }
      } catch { /* best-effort */ }
    };
    void loadMapSettings();
    return () => { cancelled = true; };
  }, [farmId, mapStyle]);

  useEffect(() => {
    const offlineBanner = () => setOffline(!navigator.onLine);
    window.addEventListener('online', offlineBanner);
    window.addEventListener('offline', offlineBanner);
    return () => {
      window.removeEventListener('online', offlineBanner);
      window.removeEventListener('offline', offlineBanner);
    };
  }, []);

  useEffect(() => {
    if (mapStyle === 'farm-layout' || typeof window === 'undefined') return;
    let cancelled = false;
    const loadMapLibre = async () => {
      const w = window as any;
      if (!w.maplibregl) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
        document.head.appendChild(link);
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Failed to load maplibre-gl'));
          document.head.appendChild(s);
        });
      }
      if (cancelled) return;
      setMapReady(true);
    };
    void loadMapLibre();
    return () => { cancelled = true; };
  }, [mapStyle]);

  useEffect(() => {
    if (!mapReady || mapStyle === 'farm-layout' || !mapContainerRef.current) return;
    const w = window as any;
    if (!w.maplibregl) return;
    const map = new w.maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle === 'satellite' ? {
        version: 8,
        sources: { esri: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } },
        layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
      } : mapStyle === 'terrain' ? {
        version: 8,
        sources: { otm: { type: 'raster', tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'], tileSize: 256 } },
        layers: [{ id: 'otm', type: 'raster', source: 'otm' }],
      } : mapStyle === 'ai-analysis' ? {
        version: 8,
        sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256 } },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': 'transparent' } },
          { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.6 } },
        ],
      } : {
        version: 8,
        sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256 } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
    });
    map.addControl(new w.maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => {
      map.addSource('farm-overlay', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'boundary-fill', type: 'fill', source: 'farm-overlay', filter: ['==', ['get', 'type'], 'boundary'], paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 } });
      map.addLayer({ id: 'boundary-line', type: 'line', source: 'farm-overlay', filter: ['==', ['get', 'type'], 'boundary'], paint: { 'line-color': '#3b82f6', 'line-width': 2 } });
      map.addLayer({ id: 'pasture-fill', type: 'fill', source: 'farm-overlay', filter: ['==', ['get', 'type'], 'pasture'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 } });
      map.addLayer({ id: 'pasture-line', type: 'line', source: 'farm-overlay', filter: ['==', ['get', 'type'], 'pasture'], paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 } });
      map.addLayer({ id: 'node-circle', type: 'circle', source: 'farm-overlay', filter: ['==', ['get', 'type'], 'node'], paint: { 'circle-radius': 6, 'circle-color': ['coalesce', ['get', 'tone'], '#3b82f6'] } });
      map.addLayer({ id: 'measure-line', type: 'line', source: 'farm-overlay', filter: ['in', ['get', 'type'], 'distance', 'perimeter'], paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'measure-fill', type: 'fill', source: 'farm-overlay', filter: ['==', ['get', 'type'], 'area'], paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.2 } });
      map.addLayer({ id: 'highlight', type: 'line', source: 'farm-overlay', filter: ['==', ['get', 'type'], 'highlight'], paint: { 'line-color': '#ef4444', 'line-width': 3 } });
    });
    map.on('error', () => { setMapStyle('farm-layout'); setOffline(true); });
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [mapReady, mapStyle]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.getSource('farm-overlay')) return;
    const features: any[] = [];
    if (activeLayers.boundary || activeLayers.buildings) {
      for (const b of boundaries) features.push({ type: 'Feature', properties: { type: 'boundary', name: b.name }, geometry: b.geometry });
    }
    if (activeLayers.buildings) {
      for (const n of NODES) {
        features.push({ type: 'Feature', properties: { type: 'node', id: n.id, label: n.label }, geometry: { type: 'Point', coordinates: [n.x, n.y] } });
      }
    }
    if (activeLayers.pastures) {
      for (const p of pastures) features.push({ type: 'Feature', properties: { type: 'pasture', name: p.name, color: p.color }, geometry: p.geometry });
    }
    if (activeLayers.water) {
      for (const o of mapObjects.filter((o: any) => o.type === 'water_point')) features.push({ type: 'Feature', properties: { type: 'water_point', name: o.name }, geometry: o.geometry });
    }
    if (activeLayers.roads) {
      for (const o of mapObjects.filter((o: any) => o.type === 'road')) features.push({ type: 'Feature', properties: { type: 'road', name: o.name }, geometry: o.geometry });
    }
    if (activeLayers.fences) {
      for (const o of mapObjects.filter((o: any) => o.type === 'fence')) features.push({ type: 'Feature', properties: { type: 'fence', name: o.name }, geometry: o.geometry });
    }
    if (activeLayers.equipment) {
      for (const o of mapObjects.filter((o: any) => o.type === 'equipment_area')) features.push({ type: 'Feature', properties: { type: 'equipment', name: o.name }, geometry: o.geometry });
    }
    for (const h of aiHighlights.features) features.push(h);
    (map.getSource('farm-overlay') as any).setData({ type: 'FeatureCollection', features });
  }, [mapReady, mapStyle, boundaries, pastures, mapObjects, activeLayers, aiHighlights]);

  useEffect(() => {
    if (!mapReady || mapStyle === 'farm-layout' || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const handleMapClick = (e: any) => {
      if (measureTool === 'none') return;
      const { lng, lat } = e.lngLat;
      setDrawingPoints((prev) => [...prev, { lng, lat }]);
    };
    const handleDblClick = () => {
      if (drawingPoints.length >= 2) finishMapDrawing();
    };
    map.on('click', handleMapClick);
    map.on('dblclick', handleDblClick);
    return () => {
      map.off('click', handleMapClick);
      map.off('dblclick', handleDblClick);
    };
  }, [mapReady, mapStyle, measureTool, drawingPoints]);

  const finishMapDrawing = async () => {
    if (drawingPoints.length < 2) { setDrawingPoints([]); return; }
    if (measureTool === 'boundary') {
      const geo = { type: 'Polygon', coordinates: [drawingPoints.map((p) => [p.lng, p.lat])] };
      await createFarmBoundary(farmId, { name: 'Farm Boundary', geometry: geo });
      void listFarmBoundaries(farmId).then(setBoundaries);
      push('Boundary created');
    } else if (measureTool === 'pasture') {
      const geo = { type: 'Polygon', coordinates: [drawingPoints.map((p) => [p.lng, p.lat])] };
      setSelectedPasture({ id: '', farmId, name: '', geometry: geo, areaHectares: 0, areaAcres: 0, perimeterMeters: 0, currentAnimals: 0, capacity: null, condition: null, grazingStatus: null, lastGrazingOn: null, nextRecommendedGrazing: null, notes: null, color: '#3b82f6', isLocked: false, createdBy: '', updatedBy: '', createdAt: '', updatedAt: '' });
      setShowPastureModal(true);
    } else if (measureTool === 'distance') {
      await createMapMeasurement(farmId, { type: 'distance', geometry: { type: 'LineString', coordinates: drawingPoints.map((p) => [p.lng, p.lat]) } });
      void listMapMeasurements(farmId).then(setMeasurements);
      push('Distance measured');
    } else if (measureTool === 'area') {
      await createMapMeasurement(farmId, { type: 'area', geometry: { type: 'Polygon', coordinates: [drawingPoints.map((p) => [p.lng, p.lat])] } });
      void listMapMeasurements(farmId).then(setMeasurements);
      push('Area measured');
    } else if (measureTool === 'perimeter') {
      await createMapMeasurement(farmId, { type: 'perimeter', geometry: { type: 'Polygon', coordinates: [drawingPoints.map((p) => [p.lng, p.lat])] } });
      void listMapMeasurements(farmId).then(setMeasurements);
      push('Perimeter measured');
    }
    setDrawingPoints([]);
    setMeasureTool('none');
  };

  const handleAiQuery = async () => {
    if (!aiQuery.trim()) return;
    try {
      const result = await mapAiQuery(farmId, aiQuery);
      setAiResult(result);
      if (result.highlights) {
        setAiHighlights({
          type: 'FeatureCollection',
          features: result.highlights.map((h) => ({ type: 'Feature', properties: { type: 'highlight', label: h.label }, geometry: h.geometry })),
        });
      }
    } catch { push('AI query failed'); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedObject = mapObjects.find((o) => o.id === selectedId) || null;

  const syncPropertyForm = (obj: FarmMapObject | null) => {
    if (!obj) { setPropertyForm({ name: '', type: '', properties: {} }); return; }
    setPropertyForm({ name: obj.name, type: obj.type, properties: { ...obj.properties } });
  };

  const handleSelectObject = (id: string | null) => {
    setSelectedId(id);
    const obj = mapObjects.find((o) => o.id === id) || null;
    syncPropertyForm(obj);
    setDrawPoints([]);
  };

  const handleCreateObject = async (type: string, geometry: any) => {
    const obj: Partial<FarmMapObject> = {
      farmId, type, name: `${type.replace(/_/g, ' ')} ${mapObjects.filter((o) => o.type === type).length + 1}`,
      properties: {}, geometry, zIndex: 0, isLocked: false, createdBy: user?.id || '', updatedBy: user?.id || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const created = await createFarmMapObject(farmId, obj);
    setMapObjects((prev) => [...prev, created]);
    setSelectedId(created.id);
    syncPropertyForm(created);
    setDrawPoints([]);
    setEditTool('select');
    push('Object created');
  };

  const handleUpdateObject = async (id: string, updates: Partial<FarmMapObject>) => {
    const updated = await updateFarmMapObject(farmId, id, updates);
    setMapObjects((prev) => prev.map((o) => o.id === id ? { ...o, ...updated } : o));
    if (selectedId === id) syncPropertyForm(updated);
  };

  const handleDeleteObject = async () => {
    if (!selectedId) return;
    await deleteFarmMapObject(farmId, selectedId);
    setMapObjects((prev) => prev.filter((o) => o.id !== selectedId));
    setSelectedId(null);
    syncPropertyForm(null);
    push('Object deleted');
  };

  const handleMoveObject = async (id: string, geometry: any) => {
    const result = await moveFarmMapObject(farmId, id, geometry);
    setMapObjects((prev) => prev.map((o) => o.id === id ? { ...o, geometry: result.geometry } : o));
  };

  const handleSaveProperty = async () => {
    if (!selectedId || !selectedObject) return;
    const updates: Partial<FarmMapObject> = {
      name: propertyForm.name,
      type: propertyForm.type,
      properties: propertyForm.properties,
    };
    await handleUpdateObject(selectedId, updates);
    push('Properties saved');
  };

  const handleUndo = async () => {
    const entry = undoLog[0];
    if (!entry) return;
    await undoChange(farmId, entry.id);
    await loadMapData();
    push('Undo applied');
  };

  const handleRedo = async () => {
    await redoChange(farmId);
    await loadMapData();
    push('Redo applied');
  };

  const handleSaveDraft = async () => {
    await saveDraft(farmId, mapObjects);
    push('Draft saved');
    setShowSaveConfirm(false);
  };

  const handlePublish = async () => {
    await publishDraft(farmId);
    await loadMapData();
    push('Draft published');
    setShowPublishConfirm(false);
  };

  const projectToScreen = (geometry: FarmMapObject['geometry']) => {
    if (geometry.type === 'Point') {
      const c = geometry.coordinates as number[];
      return { x: c[0], y: c[1] };
    }
    if (geometry.type === 'LineString') {
      return (geometry.coordinates as number[][]).map((c) => ({ x: c[0], y: c[1] }));
    }
    if (geometry.type === 'Polygon') {
      return (geometry.coordinates as number[][][])[0].map((c) => ({ x: c[0], y: c[1] }));
    }
    return [];
  };

  const toGeoJSON = (screenPoints: { x: number; y: number }[], type: 'Point' | 'LineString' | 'Polygon') => {
    if (type === 'Point' && screenPoints.length === 1) {
      return { type: 'Point', coordinates: [screenPoints[0].x, screenPoints[0].y] };
    }
    if (type === 'LineString') {
      return { type: 'LineString', coordinates: screenPoints.map((p) => [p.x, p.y]) };
    }
    if (type === 'Polygon') {
      const closed = [...screenPoints, screenPoints[0]];
      return { type: 'Polygon', coordinates: [closed.map((p) => [p.x, p.y])] };
    }
    return { type, coordinates: [] };
  };

  const handleMapClick = (e: React.MouseEvent) => {
    if (!editMode) return;
    if (drag.current.moved) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (editTool === 'select') {
      handleSelectObject(null);
      return;
    }
    if (editTool === 'delete') {
      if (selectedId) { void handleDeleteObject(); }
      return;
    }
    if (editTool === 'draw-area' || editTool === 'draw-line' || editTool === 'add-marker' || editTool === 'add-building' || editTool === 'add-pasture' || editTool === 'add-fence' || editTool === 'add-gate' || editTool === 'add-water-point' || editTool === 'add-feed-store' || editTool === 'add-milking-area' || editTool === 'add-vet-area' || editTool === 'add-equipment-area' || editTool === 'add-custom') {
      setDrawPoints((prev) => [...prev, { x, y }]);
      if (editTool === 'add-marker') {
        const geo = toGeoJSON([{ x, y }], 'Point');
        void handleCreateObject('building', geo);
      }
    }
  };

  const finishDrawing = () => {
    if (drawPoints.length < 2) { setDrawPoints([]); return; }
    const type = editTool === 'draw-area' ? 'Polygon' : editTool === 'draw-line' ? 'LineString' : 'Polygon';
    const objectType = editTool === 'draw-area' ? 'pasture' : editTool === 'draw-line' ? 'road' : 'custom';
    const geo = toGeoJSON(drawPoints, type);
    void handleCreateObject(objectType, geo);
  };

  const handleMapDoubleClick = () => {
    if (drawPoints.length >= 2) finishDrawing();
  };

  const handleObjectMouseDown = (e: React.MouseEvent, obj: FarmMapObject) => {
    if (!editMode) return;
    e.stopPropagation();
    if (editTool === 'delete') { handleSelectObject(obj.id); void handleDeleteObject(); return; }
    if (editTool === 'select' || editTool === 'move') {
      handleSelectObject(obj.id);
    }
  };

  const handleMapDrag = (e: React.PointerEvent) => {
    if (!editMode || !selectedId || editTool !== 'move') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const obj = mapObjects.find((o) => o.id === selectedId);
    if (!obj) return;
    if (obj.geometry.type === 'Point') {
      const projected = projectToScreen(obj.geometry) as { x: number; y: number };
      const dx = x - projected.x;
      const dy = y - projected.y;
      const newCoords = [(projected.x + dx), (projected.y + dy)];
      handleMoveObject(selectedId, { type: 'Point', coordinates: newCoords });
    } else if (obj.geometry.type === 'Polygon') {
      const projected = projectToScreen(obj.geometry) as { x: number; y: number }[];
      const cx = projected.reduce((s, p) => s + p.x, 0) / projected.length;
      const cy = projected.reduce((s, p) => s + p.y, 0) / projected.length;
      const dx = x - cx;
      const dy = y - cy;
      const newPts = projected.map((p) => [p.x + dx, p.y + dy]);
      handleMoveObject(selectedId, { type: 'Polygon', coordinates: [newPts] });
    }
  };

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
            {canEdit && <button className={`btn sm ${editMode ? '' : 'ghost'}`} onClick={() => { setEditMode(!editMode); if (!editMode) setEditTool('select'); }}><Edit3 size={14} /> {editMode ? 'Exit edit' : 'Edit map'}</button>}
          </div>
        } />

      {editMode && (
        <div className="card mb" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className={`btn sm ${editTool === 'select' ? '' : 'ghost'}`} onClick={() => setEditTool('select')}><MousePointer2 size={14} /> Select</button>
            <button className={`btn sm ${editTool === 'move' ? '' : 'ghost'}`} onClick={() => setEditTool('move')}><MoveIcon size={14} /> Move</button>
            <button className={`btn sm ${editTool === 'draw-area' ? '' : 'ghost'}`} onClick={() => { setEditTool('draw-area'); setDrawPoints([]); }}><Square size={14} /> Draw Area</button>
            <button className={`btn sm ${editTool === 'draw-line' ? '' : 'ghost'}`} onClick={() => { setEditTool('draw-line'); setDrawPoints([]); }}><Minus size={14} /> Draw Line</button>
            <button className={`btn sm ${editTool === 'add-marker' ? '' : 'ghost'}`} onClick={() => setEditTool('add-marker')}><MapPin size={14} /> Add Marker</button>
            <button className={`btn sm ${editTool === 'add-building' ? '' : 'ghost'}`} onClick={() => setEditTool('add-building')}><Warehouse size={14} /> Add Building</button>
            <button className={`btn sm ${editTool === 'add-pasture' ? '' : 'ghost'}`} onClick={() => setEditTool('add-pasture')}><Wheat size={14} /> Add Pasture</button>
            <button className={`btn sm ${editTool === 'add-fence' ? '' : 'ghost'}`} onClick={() => setEditTool('add-fence')}><Fence size={14} /> Add Fence</button>
            <button className={`btn sm ${editTool === 'add-gate' ? '' : 'ghost'}`} onClick={() => setEditTool('add-gate')}><Square size={14} /> Add Gate</button>
            <button className={`btn sm ${editTool === 'add-water-point' ? '' : 'ghost'}`} onClick={() => setEditTool('add-water-point')}><Droplets size={14} /> Add Water Point</button>
            <button className={`btn sm ${editTool === 'add-feed-store' ? '' : 'ghost'}`} onClick={() => setEditTool('add-feed-store')}><Wheat size={14} /> Add Feed Store</button>
            <button className={`btn sm ${editTool === 'add-milking-area' ? '' : 'ghost'}`} onClick={() => setEditTool('add-milking-area')}><Milk size={14} /> Add Milking Area</button>
            <button className={`btn sm ${editTool === 'add-vet-area' ? '' : 'ghost'}`} onClick={() => setEditTool('add-vet-area')}><Stethoscope size={14} /> Add Vet Area</button>
            <button className={`btn sm ${editTool === 'add-equipment-area' ? '' : 'ghost'}`} onClick={() => setEditTool('add-equipment-area')}><Wrench size={14} /> Add Equipment Area</button>
            <button className={`btn sm ${editTool === 'add-custom' ? '' : 'ghost'}`} onClick={() => setEditTool('add-custom')}><Plus size={14} /> Add Custom</button>
            <button className={`btn sm ${editTool === 'delete' ? '' : 'ghost'}`} onClick={() => setEditTool('delete')}><Trash2 size={14} /> Delete</button>
            <span style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
            <button className={`btn sm ghost`} onClick={handleUndo} disabled={!undoLog.length}><Undo2 size={14} /> Undo</button>
            <button className={`btn sm ghost`} onClick={handleRedo}><Redo2 size={14} /> Redo</button>
            <button className={`btn sm ghost`} onClick={() => setShowSaveConfirm(true)}><Save size={14} /> Save</button>
            <button className={`btn sm`} onClick={() => setShowPublishConfirm(true)}>Publish</button>
          </div>
          {drawPoints.length > 0 && (
            <div className="row" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>{drawPoints.length} points drawn</span>
              <button className="btn sm ghost" onClick={finishDrawing}>Finish</button>
              <button className="btn sm ghost" onClick={() => setDrawPoints([])}>Cancel</button>
            </div>
          )}
        </div>
      )}

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

      {offline && (
        <div className="card mb" style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={16} color="var(--warn)" />
            <span style={{ fontSize: 14 }}>Offline — showing schematic view</span>
          </div>
        </div>
      )}

      {mapStyle === 'farm-layout' ? (
        <div
          ref={viewportRef}
          className={`map ${theme === 'dark' ? 'dark' : ''}`}
          style={{ cursor: editMode ? (editTool === 'move' ? 'move' : editTool === 'delete' ? 'not-allowed' : 'crosshair') : (zoom > 1 ? 'grab' : 'default'), touchAction: 'none' }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => { onPointerMove(e); handleMapDrag(e); }}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={endPointer}
          onClick={editMode ? handleMapClick : undefined}
          onDoubleClick={editMode ? handleMapDoubleClick : undefined}
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
            }          ))}
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
            {editMode && mapObjects.map((obj) => {
              const projected = projectToScreen(obj.geometry);
              const isSelected = obj.id === selectedId;
              const color = obj.properties?.color || 'var(--primary)';
              if (obj.geometry.type === 'Point') {
                const p = projected as { x: number; y: number };
                return (
                  <div key={obj.id} className={`node ${isSelected ? 'active' : ''}`}
                    style={{ left: p.x + '%', top: p.y + '%', borderColor: color, cursor: editTool === 'move' ? 'move' : 'pointer', zIndex: obj.zIndex }}
                    onMouseDown={(e) => handleObjectMouseDown(e, obj)}>
                    <span style={{ color, display: 'grid', placeItems: 'center' }}><MapPin size={16} /></span>
                    <span>{obj.name}</span>
                  </div>
                );
              }
              if (obj.geometry.type === 'Polygon') {
                const pts = projected as { x: number; y: number }[];
                const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
                return (
                  <svg key={obj.id} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: obj.zIndex }}>
                    <polygon points={pointsStr} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={0.5}
                      style={{ pointerEvents: 'visiblePainted', cursor: editTool === 'move' ? 'move' : 'pointer' }}
                      onMouseDown={(e) => handleObjectMouseDown(e, obj)} />
                    {isSelected && pts.map((p, i) => (
                      <circle key={i} cx={p.x + '%'} cy={p.y + '%'} r={1.5} fill={color} style={{ pointerEvents: 'all', cursor: 'move' }}
                        onMouseDown={(e) => { e.stopPropagation(); handleSelectObject(obj.id); }} />
                    ))}
                  </svg>
                );
              }
              if (obj.geometry.type === 'LineString') {
                const pts = projected as { x: number; y: number }[];
                const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
                return (
                  <svg key={obj.id} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: obj.zIndex }}>
                    <polyline points={pointsStr} fill="none" stroke={color} strokeWidth={0.8}
                      style={{ pointerEvents: 'visiblePainted', cursor: editTool === 'move' ? 'move' : 'pointer' }}
                      onMouseDown={(e) => handleObjectMouseDown(e, obj)} />
                  </svg>
                );
              }
              return null;
            })}
            {editMode && drawPoints.length > 0 && (
              <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 999 }}>
                <polyline points={drawPoints.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth={0.5} strokeDasharray="2 2" />
                {drawPoints.map((p, i) => (
                  <circle key={i} cx={p.x + '%'} cy={p.y + '%'} r={1.2} fill="var(--primary)" />
                ))}
              </svg>
            )}
          </div>
          <div className="map-compass" title="North">N</div>
          <div className="map-zoom">
            <button type="button" onClick={() => setZoomClamped(zoom + 0.4)} title="Zoom in"><ZoomIn size={15} /></button>
            <button type="button" onClick={() => setZoomClamped(zoom - 0.4)} title="Zoom out"><ZoomOut size={15} /></button>
            <button type="button" onClick={resetView} title="Reset view"><Maximize size={15} /></button>
          </div>
        </div>
      ) : (
        <div ref={mapContainerRef} style={{ width: '100%', height: 500, background: 'var(--surface-2)', borderRadius: 8 }} />
      )}
      <div className="map-legend">
        {isHeat
          ? HEAT_LEGEND[heatLayer].map((l) => <div className="item" key={l.label}><span className="dot" style={{ background: l.color }} /> {l.label}</div>)
          : MAP_LEGEND.map((l) => <div className="item" key={l.label}><span className="dot" style={{ background: l.tone }} /> {l.label}</div>)}
      </div>

      {editMode && selectedObject && (
        <div className="card mt" style={{ border: '1px solid var(--primary)', background: 'var(--surface)' }}>
          <div className="between" style={{ marginBottom: 12 }}>
            <b style={{ fontSize: 15 }}>Properties</b>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm ghost" onClick={() => setSelectedId(null)}><X size={14} /></button>
            </div>
          </div>
          <div className="field"><label>Name</label><input className="input" value={propertyForm.name} onChange={(e) => setPropertyForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="field"><label>Type</label>
            <select className="select" value={propertyForm.type} onChange={(e) => setPropertyForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="building">Building</option><option value="barn">Barn</option><option value="pasture">Pasture</option><option value="road">Road</option><option value="fence">Fence</option><option value="gate">Gate</option><option value="water_point">Water Point</option><option value="feed_store">Feed Store</option><option value="milking_area">Milking Area</option><option value="vet_area">Vet Area</option><option value="equipment_area">Equipment Area</option><option value="custom">Custom</option>
            </select>
          </div>
          {propertyForm.type === 'barn' && <>
            <div className="field"><label>Capacity</label><input className="input" type="number" value={propertyForm.properties?.capacity ?? ''} onChange={(e) => setPropertyForm((f) => ({ ...f, properties: { ...f.properties, capacity: Number(e.target.value) } }))} /></div>
            <div className="field"><label>Current Animals</label><input className="input" type="number" value={propertyForm.properties?.currentAnimals ?? ''} onChange={(e) => setPropertyForm((f) => ({ ...f, properties: { ...f.properties, currentAnimals: Number(e.target.value) } }))} /></div>
            <div className="field"><label>Water Points</label><input className="input" type="number" value={propertyForm.properties?.waterPoints ?? ''} onChange={(e) => setPropertyForm((f) => ({ ...f, properties: { ...f.properties, waterPoints: Number(e.target.value) } }))} /></div>
            <div className="field"><label>Feed Area</label><input className="input" value={propertyForm.properties?.feedArea ?? ''} onChange={(e) => setPropertyForm((f) => ({ ...f, properties: { ...f.properties, feedArea: e.target.value } }))} /></div>
            <div className="field"><label>Ventilation</label><input className="input" value={propertyForm.properties?.ventilation ?? ''} onChange={(e) => setPropertyForm((f) => ({ ...f, properties: { ...f.properties, ventilation: e.target.value } }))} /></div>
          </>}
          <div className="field"><label>Notes</label><textarea className="input" rows={3} value={propertyForm.properties?.notes ?? ''} onChange={(e) => setPropertyForm((f) => ({ ...f, properties: { ...f.properties, notes: e.target.value } }))} /></div>
          <div className="field"><label>Color</label><input type="color" value={propertyForm.properties?.color || '#3b82f6'} onChange={(e) => setPropertyForm((f) => ({ ...f, properties: { ...f.properties, color: e.target.value } }))} style={{ width: 48, height: 32, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} /></div>
          <div className="field"><label>Locked</label><input type="checkbox" checked={selectedObject.isLocked} onChange={(e) => handleUpdateObject(selectedObject.id, { isLocked: e.target.checked })} /></div>
          {selectedObject.geometry.type === 'Point' && (
            <div className="field"><label>GPS Coordinates</label><span className="muted" style={{ fontSize: 13 }}>{((selectedObject.geometry.coordinates as number[])[1]).toFixed(6)}, {((selectedObject.geometry.coordinates as number[])[0]).toFixed(6)}</span></div>
          )}
          {selectedObject.geometry.type === 'Polygon' && (
            <div className="field"><label>Area</label><span className="muted" style={{ fontSize: 13 }}>Polygon with {(selectedObject.geometry.coordinates as number[][][])[0].length - 1} points</span></div>
          )}
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn sm" onClick={handleSaveProperty}>Save</button>
          </div>
        </div>
      )}

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
       </Modal>}

      <div className="card mb" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Map style</span>
          <button className={`btn sm ${mapStyle === 'farm-layout' ? '' : 'ghost'}`} onClick={() => setMapStyle('farm-layout')}><MapPin size={14} /> Farm Layout</button>
          <button className={`btn sm ${mapStyle === 'standard' ? '' : 'ghost'}`} onClick={() => setMapStyle('standard')}><MapPin size={14} /> Standard</button>
          <button className={`btn sm ${mapStyle === 'satellite' ? '' : 'ghost'}`} onClick={() => setMapStyle('satellite')}><MapPin size={14} /> Satellite</button>
          <button className={`btn sm ${mapStyle === 'terrain' ? '' : 'ghost'}`} onClick={() => setMapStyle('terrain')}><MapPin size={14} /> Terrain</button>
          <button className={`btn sm ${mapStyle === 'ai-analysis' ? '' : 'ghost'}`} onClick={() => setMapStyle('ai-analysis')}><MapPin size={14} /> AI Analysis</button>
          <span style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
          {mapStyle !== 'farm-layout' && canEdit && (
            <>
              <button className={`btn sm ${measureTool === 'boundary' ? '' : 'ghost'}`} onClick={() => { setMeasureTool(measureTool === 'boundary' ? 'none' : 'boundary'); setDrawingPoints([]); }}><Fence size={14} /> Draw Boundary</button>
              <button className={`btn sm ${measureTool === 'pasture' ? '' : 'ghost'}`} onClick={() => { setMeasureTool(measureTool === 'pasture' ? 'none' : 'pasture'); setDrawingPoints([]); }}><Wheat size={14} /> Draw Pasture</button>
              <button className={`btn sm ${measureTool === 'distance' ? '' : 'ghost'}`} onClick={() => { setMeasureTool(measureTool === 'distance' ? 'none' : 'distance'); setDrawingPoints([]); }}><Minus size={14} /> Distance</button>
              <button className={`btn sm ${measureTool === 'area' ? '' : 'ghost'}`} onClick={() => { setMeasureTool(measureTool === 'area' ? 'none' : 'area'); setDrawingPoints([]); }}><Square size={14} /> Area</button>
              <button className={`btn sm ${measureTool === 'perimeter' ? '' : 'ghost'}`} onClick={() => { setMeasureTool(measureTool === 'perimeter' ? 'none' : 'perimeter'); setDrawingPoints([]); }}><Fence size={14} /> Perimeter</button>
              {drawingPoints.length > 0 && (
                <div className="row" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{drawingPoints.length} points</span>
                  <button className="btn sm ghost" onClick={finishMapDrawing}>Finish</button>
                  <button className="btn sm ghost" onClick={() => setDrawingPoints([])}>Cancel</button>
                </div>
              )}
            </>
          )}
          <span style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
          <button className={`btn sm ${showLayerPanel ? '' : 'ghost'}`} onClick={() => setShowLayerPanel((p) => !p)}><Filter size={14} /> Layers</button>
          <button className={`btn sm ghost`} onClick={() => { setAiQuery(''); setAiResult(null); }}><Search size={14} /> AI Map</button>
        </div>
      </div>

      {showLayerPanel && (
        <div className="card mb" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Layers</span>
          {Object.entries({ satellite: 'Satellite', boundary: 'Farm Boundary', buildings: 'Buildings', pastures: 'Pastures', cows: 'Cows', water: 'Water', roads: 'Roads', fences: 'Fences', equipment: 'Equipment', healthRisk: 'Health Risk', milkProduction: 'Milk Production', weather: 'Weather', aiAlerts: 'AI Alerts' }).map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!activeLayers[key]} onChange={(e) => {
                const next = { ...activeLayers, [key]: e.target.checked };
                setActiveLayers(next);
                void updateMapLayers(farmId, next);
              }} />
              {label}
            </label>
          ))}
        </div>
      )}

      {aiQuery && (
        <div className="card mb" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="input" placeholder="Ask about your farm map..." value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { void handleAiQuery(); } }} />
          <button className="btn sm" onClick={() => void handleAiQuery()}>Ask</button>
          <button className="btn sm ghost" onClick={() => { setAiQuery(''); setAiResult(null); }}>Clear</button>
        </div>
      )}

      {aiResult && (
        <div className="card mb" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>AI Map Answer</div>
          <p style={{ fontSize: 14 }}>{aiResult.text}</p>
        </div>
      )}
      {showSaveConfirm && <Modal title="Save draft" onClose={() => setShowSaveConfirm(false)}>
        <p style={{ fontSize: 14 }}>Save current map edits as a draft? You can publish later.</p>
        <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn ghost" onClick={() => setShowSaveConfirm(false)}>Cancel</button>
          <button className="btn" onClick={handleSaveDraft}>Save draft</button>
        </div>
      </Modal>}

      {showPublishConfirm && <Modal title="Publish draft" onClose={() => setShowPublishConfirm(false)}>
        <p style={{ fontSize: 14 }}>Publish the current draft to make it live? This will replace the current live map objects.</p>
        <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn ghost" onClick={() => setShowPublishConfirm(false)}>Cancel</button>
          <button className="btn" onClick={handlePublish}>Publish</button>
        </div>
      </Modal>}

      {showBoundaryModal && <Modal title="Farm Boundary" onClose={() => setShowBoundaryModal(false)}>
        <p style={{ fontSize: 14 }}>Draw a boundary on the map using the Draw Boundary tool. The area and perimeter will be calculated automatically.</p>
        <div className="field mt"><label>Name</label><input className="input" placeholder="Boundary name" /></div>
        <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn ghost" onClick={() => setShowBoundaryModal(false)}>Close</button>
        </div>
      </Modal>}

      {showPastureModal && selectedPasture && <Modal title={selectedPasture.id ? 'Edit Pasture' : 'New Pasture'} onClose={() => { setShowPastureModal(false); setSelectedPasture(null); }}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = {
            name: String(fd.get('name') || selectedPasture.name),
            geometry: selectedPasture.geometry,
            currentAnimals: Number(fd.get('currentAnimals') || selectedPasture.currentAnimals),
            capacity: fd.get('capacity') ? Number(fd.get('capacity')) : null,
            condition: String(fd.get('condition') || ''),
            grazingStatus: String(fd.get('grazingStatus') || ''),
            lastGrazingOn: String(fd.get('lastGrazingOn') || ''),
            nextRecommendedGrazing: String(fd.get('nextRecommendedGrazing') || ''),
            notes: String(fd.get('notes') || ''),
            color: String(fd.get('color') || '#3b82f6'),
          };
          if (selectedPasture.id) {
            await updateFarmPasture(farmId, selectedPasture.id, data);
          } else {
            await createFarmPasture(farmId, data);
          }
          void listFarmPastures(farmId).then(setPastures);
          setShowPastureModal(false);
          setSelectedPasture(null);
          push(selectedPasture.id ? 'Pasture updated' : 'Pasture created');
        }}>
          <div className="field"><label>Name</label><input className="input" name="name" defaultValue={selectedPasture.name} required /></div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Current Animals</label><input className="input" type="number" name="currentAnimals" defaultValue={selectedPasture.currentAnimals} /></div>
            <div className="field"><label>Capacity</label><input className="input" type="number" name="capacity" defaultValue={selectedPasture.capacity ?? ''} /></div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Condition</label>
              <select className="select" name="condition" defaultValue={selectedPasture.condition || ''}>
                <option value="">Select</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option>
              </select>
            </div>
            <div className="field"><label>Grazing Status</label>
              <select className="select" name="grazingStatus" defaultValue={selectedPasture.grazingStatus || ''}>
                <option value="">Select</option><option value="active">Active</option><option value="resting">Resting</option><option value="preparing">Preparing</option>
              </select>
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Last Grazing</label><input className="input" type="date" name="lastGrazingOn" defaultValue={selectedPasture.lastGrazingOn || ''} /></div>
            <div className="field"><label>Next Recommended</label><input className="input" type="date" name="nextRecommendedGrazing" defaultValue={selectedPasture.nextRecommendedGrazing || ''} /></div>
          </div>
          <div className="field"><label>Notes</label><textarea className="input" name="notes" rows={3} defaultValue={selectedPasture.notes || ''} /></div>
          <div className="field"><label>Color</label><input type="color" name="color" defaultValue={selectedPasture.color || '#3b82f6'} style={{ width: 48, height: 32, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => { setShowPastureModal(false); setSelectedPasture(null); }}>Cancel</button>
            <button type="submit" className="btn">Save</button>
          </div>
        </form>
      </Modal>}

      {showMeasureModal && <Modal title="Measurement" onClose={() => setShowMeasureModal(false)}>
        <p style={{ fontSize: 14 }}>Draw on the map using the measurement tools to calculate distance, area, or perimeter.</p>
        <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn ghost" onClick={() => setShowMeasureModal(false)}>Close</button>
        </div>
      </Modal>}

      {pastures.length > 0 && (
        <div className="card mt">
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>Pastures</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Area</th><th>Animals</th><th>Capacity</th><th>Condition</th><th>Grazing</th><th></th></tr></thead>
              <tbody>
                {pastures.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedPasture(p)}>
                    <td><b>{p.name}</b></td>
                    <td>{formatHectares(p.areaHectares)} / {formatAcres(p.areaAcres)}</td>
                    <td>{p.currentAnimals} / {p.capacity ?? '—'}</td>
                    <td>{p.condition || '—'}</td>
                    <td>{p.grazingStatus || '—'}</td>
                    <td><button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setSelectedPasture(p); setShowPastureModal(true); }}><Edit3 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {measurements.length > 0 && (
        <div className="card mt">
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>Measurements</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Value</th><th>Notes</th><th>Created</th><th></th></tr></thead>
              <tbody>
                {measurements.map((m) => (
                  <tr key={m.id}>
                    <td style={{ textTransform: 'capitalize' }}>{m.type}</td>
                    <td>{formatMeasurementValue(m.valueMeters, m.type)} {m.valueHectares ? formatHectares(m.valueHectares) : ''}</td>
                    <td>{m.notes || '—'}</td>
                    <td>{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td><button className="btn ghost sm" onClick={async () => { await deleteMapMeasurement(farmId, m.id); setMeasurements((prev) => prev.filter((x) => x.id !== m.id)); push('Measurement deleted'); }}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
