import { useState, useMemo } from "react";
import { X, Search, Users, MapPin, ChevronRight, Building2, Phone, Download } from "lucide-react";
import {
  TAXI_ASSOCIATIONS, PROVINCES, LEVELS, LEVEL_COLORS, PROVINCE_EMOJIS,
  type AssociationLevel,
} from "../data/taxiAssociations";

interface Props { isOpen: boolean; onClose: () => void; }

const P    = "#5B2D8E";
const GOLD = "#F5A623";
const NAVY = "#0A0F1E";

const PROVINCE_COLORS: Record<string, string> = {
  National:        "#6366F1",
  Gauteng:         "#3B82F6",
  "KwaZulu-Natal": "#0891B2",
  "Western Cape":  "#5B2D8E",
  "Eastern Cape":  "#059669",
  Limpopo:         "#DC2626",
  Mpumalanga:      "#EA580C",
  "North West":    "#7C3AED",
  "Free State":    "#CA8A04",
  "Northern Cape": "#9CA3AF",
};

function LevelBadge({ level }: { level: AssociationLevel }) {
  const c = LEVEL_COLORS[level];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
      style={{ background: c.bg, color: c.text }}>
      {level}
    </span>
  );
}

export function TaxiAssociationsViewer({ isOpen, onClose }: Props) {
  const [search,          setSearch]          = useState("");
  const [provinceFilter,  setProvinceFilter]  = useState<string>("all");
  const [levelFilter,     setLevelFilter]     = useState<string>("all");
  const [view,            setView]            = useState<"table" | "cards" | "map">("table");
  const [expandedProvince, setExpandedProvince] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return TAXI_ASSOCIATIONS.filter(a => {
      const matchP = provinceFilter === "all" || a.province === provinceFilter;
      const matchL = levelFilter    === "all" || a.level    === levelFilter;
      const matchQ = !q ||
        a.name.toLowerCase().includes(q) ||
        a.province.toLowerCase().includes(q) ||
        a.notes.toLowerCase().includes(q);
      return matchP && matchL && matchQ;
    });
  }, [search, provinceFilter, levelFilter]);

  // Group by province for province view
  const byProvince = useMemo(() => {
    const map: Record<string, typeof TAXI_ASSOCIATIONS> = {};
    filtered.forEach(a => {
      if (!map[a.province]) map[a.province] = [];
      map[a.province].push(a);
    });
    return map;
  }, [filtered]);

  const provinceOrder = PROVINCES.filter(p => byProvince[p]);

  const exportCSV = () => {
    const rows = ["Province,Association,Level,Notes",
      ...filtered.map(a => `"${a.province}","${a.name}","${a.level}","${a.notes}"`)
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "vms-taxi-associations.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#F7F8FA" }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-white flex-shrink-0" style={{ borderColor: "#E5E7EB" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: P }}>
          <Building2 className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm" style={{ color: NAVY }}>SA Taxi Associations</p>
          <p className="text-xs text-gray-500">VMS outreach reference · All 9 provinces + national</p>
        </div>
        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 text-center mr-2">
          {[
            { v: "46",  l: "Total" },
            { v: "2",   l: "National" },
            { v: "9",   l: "Provincial" },
            { v: "18",  l: "Regional" },
            { v: "17",  l: "Local" },
          ].map(s => (
            <div key={s.l}>
              <p className="text-base font-black" style={{ color: P }}>{s.v}</p>
              <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{s.l}</p>
            </div>
          ))}
        </div>
        <button onClick={exportCSV} title="Export CSV"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 transition-all">
          <Download className="w-3.5 h-3.5" />CSV
        </button>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 bg-white border-b flex flex-wrap gap-2 flex-shrink-0" style={{ borderColor: "#E5E7EB" }}>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search association…"
            className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-purple-400 transition-colors bg-white"
            style={{ width: 220 }}
          />
        </div>
        {/* Province filter */}
        <select value={provinceFilter} onChange={e => setProvinceFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400 bg-white text-gray-700">
          <option value="all">All provinces</option>
          {PROVINCES.map(p => <option key={p}>{p}</option>)}
        </select>
        {/* Level filter */}
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400 bg-white text-gray-700">
          <option value="all">All levels</option>
          {LEVELS.map(l => <option key={l}>{l}</option>)}
        </select>
        {/* View toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden ml-auto">
          {(["table","cards","map"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-2 text-xs font-semibold capitalize transition-colors"
              style={{ background: view === v ? P : "#fff", color: view === v ? "#fff" : "#6B7280" }}>
              {v}
            </button>
          ))}
        </div>
        {/* Result count */}
        <p className="text-xs text-gray-400 self-center font-medium sm:ml-2">
          {filtered.length} of {TAXI_ASSOCIATIONS.length}
        </p>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* TABLE VIEW */}
        {view === "table" && (
          <div className="max-w-6xl mx-auto px-5 py-5">
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-0 border-b border-gray-100 bg-gray-50 px-5 py-3">
                {["Province", "Association Name", "Level", "Notes / Contact"].map((h, i) => (
                  <div key={h}
                    className={`text-[10px] font-bold uppercase tracking-widest text-gray-500 ${i === 0 ? "col-span-2" : i === 1 ? "col-span-4" : i === 2 ? "col-span-1" : "col-span-5"}`}>
                    {h}
                  </div>
                ))}
              </div>
              {/* Rows */}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-gray-400 text-sm">No associations match your filters.</div>
              )}
              {filtered.map((a, i) => (
                <div key={i}
                  className="grid grid-cols-12 gap-0 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-purple-50/50 transition-colors group">
                  {/* Province */}
                  <div className="col-span-2 flex items-center gap-1.5">
                    <span className="text-base">{PROVINCE_EMOJIS[a.province] ?? "📍"}</span>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: PROVINCE_COLORS[a.province] ?? "#888" }}>{a.province}</p>
                    </div>
                  </div>
                  {/* Name */}
                  <div className="col-span-4 flex items-start">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{a.name}</p>
                  </div>
                  {/* Level */}
                  <div className="col-span-1 flex items-start pt-0.5">
                    <LevelBadge level={a.level} />
                  </div>
                  {/* Notes */}
                  <div className="col-span-5 flex items-start gap-2">
                    <p className="text-xs text-gray-500 leading-relaxed">{a.notes}</p>
                    {a.notes.includes("+27") && (
                      <a href={`tel:${a.notes.match(/\+27[\d\s]+/)?.[0]?.replace(/\s/g,"")}`}
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: P + "15", color: P }}>
                        <Phone className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CARDS VIEW — grouped by province */}
        {view === "cards" && (
          <div className="max-w-6xl mx-auto px-5 py-5 space-y-4">
            {provinceOrder.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-12">No associations match your filters.</p>
            )}
            {provinceOrder.map(province => {
              const associations = byProvince[province];
              const isOpen = expandedProvince === province || provinceFilter !== "all";
              const color = PROVINCE_COLORS[province] ?? "#888";
              return (
                <div key={province} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  {/* Province header */}
                  <button
                    onClick={() => setExpandedProvince(isOpen && expandedProvince === province ? null : province)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
                    <span className="text-2xl">{PROVINCE_EMOJIS[province] ?? "📍"}</span>
                    <div className="flex-1">
                      <p className="font-black text-base" style={{ color }}>{province}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {associations.length} association{associations.length !== 1 ? "s" : ""} ·{" "}
                        {associations.filter(a => a.level === "Provincial").length > 0 &&
                          `${associations.filter(a => a.level === "Provincial").length} provincial · `}
                        {associations.filter(a => a.level === "Regional").length} regional ·{" "}
                        {associations.filter(a => a.level === "Local").length} local
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
                        style={{ background: color }}>
                        {associations.length}
                      </span>
                      <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  {/* Association cards */}
                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {associations.map((a, i) => (
                        <div key={i} className="px-5 py-3.5 flex items-start gap-4 hover:bg-purple-50/40 transition-colors">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: color + "18" }}>
                            <Users className="w-4 h-4" style={{ color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap">
                              <p className="text-sm font-bold text-gray-900 leading-snug">{a.name}</p>
                              <LevelBadge level={a.level} />
                            </div>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{a.notes}</p>
                          </div>
                          {a.notes.includes("+27") && (
                            <a href={`tel:${a.notes.match(/\+27[\d\s]+/)?.[0]?.replace(/\s/g,"")}`}
                              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-90 mt-0.5"
                              style={{ background: P, color: "#fff" }}>
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* MAP VIEW — province tiles with association counts */}
        {view === "map" && (
          <div className="max-w-5xl mx-auto px-5 py-6">
            {/* SA map-style grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
              {PROVINCES.map(province => {
                const all   = TAXI_ASSOCIATIONS.filter(a => a.province === province);
                const shown = filtered.filter(a => a.province === province);
                const color = PROVINCE_COLORS[province] ?? "#888";
                const isActive = shown.length > 0;
                return (
                  <button key={province}
                    onClick={() => { setProvinceFilter(province); setView("cards"); setExpandedProvince(province); }}
                    className={`p-4 rounded-2xl text-left transition-all border-2 hover:scale-105 ${isActive ? "hover:shadow-lg" : "opacity-40"}`}
                    style={{ background: isActive ? color + "12" : "#F9FAFB", borderColor: isActive ? color + "40" : "#E5E7EB" }}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-2xl">{PROVINCE_EMOJIS[province] ?? "📍"}</span>
                      <span className="text-xs font-black rounded-full w-6 h-6 flex items-center justify-center text-white flex-shrink-0"
                        style={{ background: isActive ? color : "#9CA3AF" }}>
                        {shown.length}
                      </span>
                    </div>
                    <p className="text-sm font-black leading-tight" style={{ color: isActive ? color : "#9CA3AF" }}>{province}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {all.filter(a => a.level !== "National").length} associations
                    </p>
                    {/* Mini breakdown */}
                    <div className="flex gap-1 mt-2.5 flex-wrap">
                      {(["Provincial","Regional","Local"] as AssociationLevel[]).map(l => {
                        const count = shown.filter(a => a.level === l).length;
                        if (!count) return null;
                        return (
                          <span key={l} className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: LEVEL_COLORS[l].bg, color: LEVEL_COLORS[l].text }}>
                            {count} {l.slice(0,4)}
                          </span>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* National bodies */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🇿🇦</span>
                <div>
                  <p className="font-black text-gray-900">National Bodies</p>
                  <p className="text-xs text-gray-500">Umbrella organisations covering all provinces</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {TAXI_ASSOCIATIONS.filter(a => a.level === "National").map((a, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ background: "#6366F115", border: "1px solid #6366F130" }}>
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#6366F1", color: "#fff" }}>
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{a.name}</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{a.notes}</p>
                      </div>
                    </div>
                    {a.notes.includes("+27") && (
                      <div className="mt-3 flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-indigo-500" />
                        <p className="text-xs font-semibold text-indigo-600">
                          {a.notes.match(/\+27[\d\s]+/)?.[0]?.trim()}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer stats bar ───────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t bg-white px-5 py-2.5 flex items-center gap-4 flex-wrap" style={{ borderColor: "#E5E7EB" }}>
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-xs text-gray-500 font-medium">VMS AFC Outreach Database · {TAXI_ASSOCIATIONS.length} associations across 9 provinces</p>
        </div>
        <div className="ml-auto flex gap-3">
          {LEVELS.map(l => {
            const count = filtered.filter(a => a.level === l).length;
            return (
              <div key={l} className="flex items-center gap-1.5">
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: LEVEL_COLORS[l].bg, color: LEVEL_COLORS[l].text }}>
                  {l}
                </span>
                <span className="text-xs font-bold text-gray-600">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
