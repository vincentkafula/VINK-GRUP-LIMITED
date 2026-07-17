import { memo, useEffect, useRef } from "react";
import { LAND } from "./worldMapGeoData";

const STATS = [
  { value: "175+", label: "Countries" },
  { value: "55M+", label: "Merchant Locations" },
  { value: "14",   label: "SADC Nations Covered" },
];

const D = Math.PI / 180;

function to3D(lat: number, lng: number, rotY: number): [number, number, number] {
  const phi   = (90 - lat) * D;
  const theta = (lng + rotY) * D;
  return [
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ];
}

// ─── City dots [lat, lng, name] ───────────────────────────────────────────────
const CITIES: [number, number, string, boolean][] = [
  // South Africa — office
  [-33.92,  18.42, "Cape Town",   true ],
  [-26.20,  28.05, "Johannesburg",true ],
  [-29.85,  31.00, "Durban",      true ],
  [-25.75,  28.20, "Pretoria",    true ],
  // Zambia — office
  [-15.39,  28.32, "Lusaka",      true ],
  // Africa
  [-1.28,   36.82, "Nairobi",     false],
  [ 6.36,    3.40, "Lagos",       false],
  [30.06,   31.25, "Cairo",       false],
  [-8.84,   13.23, "Luanda",      false],
  [15.55,   32.53, "Khartoum",    false],
  // Europe — UK office
  [51.51,   -0.13, "London",      true ],
  [48.85,    2.35, "Paris",       false],
  [52.52,   13.40, "Berlin",      false],
  [41.90,   12.48, "Rome",        false],
  // Americas — USA office
  [40.71,  -74.01, "New York",    true ],
  [34.05, -118.24, "Los Angeles", false],
  [-23.55, -46.63, "São Paulo",   false],
  // Asia — China office
  [31.23,  121.47, "Shanghai",    true ],
  [55.75,   37.62, "Moscow",      false],
  [35.69,  139.69, "Tokyo",       false],
  [22.53,  114.06, "Hong Kong",   false],
  [28.61,   77.21, "Delhi",       false],
  [1.35,  103.82, "Singapore",   false],
  // Australia
  [-33.87, 151.21, "Sydney",      false],
];

// ─── Cloud patches ────────────────────────────────────────────────────────────
const CLOUDS: [number,number,number,number,number][] = [
  [ 50, -30,  9, 20, 0.55],
  [ 30,  20,  7, 16, 0.45],
  [-10, 100,  6, 13, 0.40],
  [-30, -70,  6, 14, 0.42],
  [ 10, 140,  7, 11, 0.35],
  [ 65,  30,  6, 13, 0.30],
  [-50, 150,  5, 12, 0.32],
  [  0, -30,  5, 10, 0.38],
  [ 55,  80,  7, 15, 0.28],
  [-15, -50,  6, 12, 0.36],
];

// ─── Climate-band colours, ordered north pole → south pole ─────────────────
// Used to build a screen-space vertical gradient (see buildLandGradient
// below) so land is shaded by each point's REAL latitude rather than one
// flat color per landmass. This matters because e.g. Africa+Europe+Asia are
// one single connected landmass in real geography (joined at Suez) — a
// single fill color per landmass would paint Siberia and the Sahara
// identically.
const CLIMATE_STOPS: { lat: number; fill: string; stroke: string }[] = [
  { lat:  90, fill: "#E8F4FC", stroke: "#B0D8F0" }, // north polar ice
  { lat:  70, fill: "#E8F4FC", stroke: "#B0D8F0" },
  { lat:  60, fill: "#8BA68B", stroke: "#6A8870" }, // tundra
  { lat:  35, fill: "#2E7D4A", stroke: "#1D5C33" }, // temperate forest
  { lat:  15, fill: "#7A9E50", stroke: "#5A7A3A" }, // subtropical/savanna
  { lat:   0, fill: "#27753E", stroke: "#1C5C2E" }, // tropical
  { lat: -15, fill: "#7A9E50", stroke: "#5A7A3A" },
  { lat: -35, fill: "#2E7D4A", stroke: "#1D5C33" },
  { lat: -60, fill: "#8BA68B", stroke: "#6A8870" },
  { lat: -70, fill: "#E8F4FC", stroke: "#B0D8F0" },
  { lat: -90, fill: "#E8F4FC", stroke: "#B0D8F0" }, // south polar ice
];
const SA_FILL = "#FF7043";
const SA_STROKE = "#E64A19";

// ─── Globe canvas ─────────────────────────────────────────────────────────────
function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const SIZE = 520;
    const dpr  = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width        = SIZE * dpr;
    canvas.height       = SIZE * dpr;
    canvas.style.width  = SIZE + "px";
    canvas.style.height = SIZE + "px";
    ctx.scale(dpr, dpr);

    const cx = SIZE / 2, cy = SIZE / 2;
    const R  = SIZE * 0.43;

    // Build the land gradient once — screen Y maps exactly to latitude here
    // because this globe only rotates in longitude (rotY), never tilts in
    // latitude, so the north pole is always at the top of the circle and the
    // south pole always at the bottom, for any rotation.
    const landGradient = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    CLIMATE_STOPS.forEach(({ lat, fill }) => {
      landGradient.addColorStop((90 - lat) / 180, fill);
    });
    // Stroke uses the same latitude mapping so outlines blend with their
    // local fill color rather than a single flat tone everywhere.
    const strokeGradient = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    CLIMATE_STOPS.forEach(({ lat, stroke }) => {
      strokeGradient.addColorStop((90 - lat) / 180, stroke);
    });

    // ── Stars ─────────────────────────────────────────────────────────────────
    const stars: { x:number; y:number; r:number; a:number; tw:number }[] = [];
    while (stars.length < 220) {
      const x = Math.random()*SIZE, y = Math.random()*SIZE;
      const dx = x-cx, dy = y-cy;
      if (Math.sqrt(dx*dx+dy*dy) > R+12) {
        stars.push({ x, y, r: Math.random()*1.6+0.2, a: Math.random()*0.8+0.2, tw: Math.random()*Math.PI*2 });
      }
    }

    function scr(p:[number,number,number]):[number,number] {
      return [cx + p[0]*R, cy - p[1]*R];
    }

    function drawPoly(latLngs:[number,number][], rotY:number, fill:string|CanvasGradient, stroke:string|CanvasGradient, lw=0.6) {
      const pts3 = latLngs.map(([la,ln]) => to3D(la, ln, rotY));
      const vis: [number,number][] = [];
      let lastExitAngle: number | null = null;
      for (let i = 0; i < pts3.length; i++) {
        const c = pts3[i];
        const n = pts3[(i+1) % pts3.length];
        if (c[2] >= 0) vis.push(scr(c));
        if ((c[2] >= 0) !== (n[2] >= 0)) {
          const t = c[2]/(c[2]-n[2]);
          let hx = c[0]+t*(n[0]-c[0]);
          let hy = c[1]+t*(n[1]-c[1]);
          const l = Math.sqrt(hx*hx+hy*hy)||1;
          const bx = hx/l, by = hy/l;
          const exiting = c[2] >= 0; // true = going from visible to hidden
          vis.push([cx+bx*R, cy-by*R]);
          if (!exiting) {
            // Re-entering visibility: the previous boundary point pushed onto
            // `vis` (from the matching exit earlier in this ring) and this
            // entry point are NOT adjacent on the sphere — the hidden arc
            // between them can span a large chunk of the globe (e.g. Asia,
            // Antarctica). Connecting them with a straight line cuts a flat
            // chord across the sphere instead of following its curved edge,
            // which is what made the globe look flat/fake. Trace along the
            // actual horizon circle (radius R) instead.
            const prevExit = lastExitAngle;
            if (prevExit !== null) {
              const entryAngle = Math.atan2(by, bx);
              let delta = entryAngle - prevExit;
              // shortest angular path around the circle
              while (delta > Math.PI) delta -= Math.PI * 2;
              while (delta < -Math.PI) delta += Math.PI * 2;
              const steps = Math.max(2, Math.ceil(Math.abs(delta) / (Math.PI / 24)));
              for (let s = 1; s < steps; s++) {
                const a = prevExit + (delta * s) / steps;
                vis.push([cx + Math.cos(a) * R, cy - Math.sin(a) * R]);
              }
            }
          } else {
            lastExitAngle = Math.atan2(by, bx);
          }
        }
      }
      if (vis.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(vis[0][0], vis[0][1]);
      for (let i=1; i<vis.length; i++) ctx.lineTo(vis[i][0], vis[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.fill();
      ctx.stroke();
    }

    function drawGrid(rotY:number) {
      ctx.lineWidth = 0.3;
      // Equator — brighter
      ctx.strokeStyle = "rgba(100,200,255,0.20)";
      ctx.beginPath(); let started = false;
      for (let lng=0; lng<=360; lng+=2) {
        const p = to3D(0, lng-180, rotY);
        if (p[2]>=0) { const [sx,sy]=scr(p); started?ctx.lineTo(sx,sy):(ctx.moveTo(sx,sy),started=true); }
        else started=false;
      }
      ctx.stroke();
      // Tropics & polar circles
      const specialLats = [-23.5, 23.5, -66.5, 66.5];
      for (const lat of specialLats) {
        ctx.strokeStyle = "rgba(255,200,100,0.12)";
        ctx.beginPath(); started=false;
        for (let lng=0; lng<=360; lng+=2) {
          const p = to3D(lat, lng-180, rotY);
          if (p[2]>=0) { const [sx,sy]=scr(p); started?ctx.lineTo(sx,sy):(ctx.moveTo(sx,sy),started=true); }
          else started=false;
        }
        ctx.stroke();
      }
      // Lat lines
      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      for (let lat=-60; lat<=60; lat+=30) {
        if (lat===0) continue;
        ctx.beginPath(); started=false;
        for (let lng=0; lng<=360; lng+=2) {
          const p=to3D(lat,lng-180,rotY);
          if (p[2]>=0){const[sx,sy]=scr(p);started?ctx.lineTo(sx,sy):(ctx.moveTo(sx,sy),started=true);}else started=false;
        }
        ctx.stroke();
      }
      // Lng lines
      for (let lng=0; lng<360; lng+=30) {
        ctx.beginPath(); started=false;
        for (let lat=-88; lat<=88; lat+=2) {
          const p=to3D(lat,lng,rotY);
          if (p[2]>=0){const[sx,sy]=scr(p);started?ctx.lineTo(sx,sy):(ctx.moveTo(sx,sy),started=true);}else started=false;
        }
        ctx.stroke();
      }
    }

    // ─── Main render ─────────────────────────────────────────────────────────
    let rotY  = 20;  // start showing Africa/SA
    let lastT: number|null = null;
    let tick  = 0;

    function render(now:number) {
      if (lastT===null) lastT=now;
      const dt = Math.min((now-lastT)/1000, 0.05);
      lastT=now; rotY+=dt*12; tick+=dt;

      ctx.clearRect(0,0,SIZE,SIZE);

      // Stars
      stars.forEach(s => {
        const tw = 0.88+0.12*Math.sin(tick*1.6+s.tw);
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(255,255,255,${(s.a*tw).toFixed(3)})`; ctx.fill();
      });

      // Ocean with realistic deep-blue gradient
      const oceanG = ctx.createRadialGradient(cx-R*0.20,cy-R*0.25,R*0.05, cx,cy,R);
      oceanG.addColorStop(0.00, "#48A0D8");
      oceanG.addColorStop(0.20, "#2678B0");
      oceanG.addColorStop(0.50, "#0E4D85");
      oceanG.addColorStop(0.78, "#072E60");
      oceanG.addColorStop(1.00, "#030F2A");
      ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fillStyle=oceanG; ctx.fill();

      ctx.save();
      ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.clip();

      drawGrid(rotY);

      // Land — sorted so SA renders last (on top) for visibility
      const sorted = [...LAND].sort((a,b) => (a.biome==="sa"?1:-1) - (b.biome==="sa"?1:-1));
      sorted.forEach(({pts, biome="land"}) => {
        if (biome === "sa") {
          drawPoly(pts, rotY, SA_FILL, SA_STROKE, 1.0);
        } else {
          drawPoly(pts, rotY, landGradient, strokeGradient, 0.5);
        }
      });

      // ── Clouds ──────────────────────────────────────────────────────────────
      CLOUDS.forEach(([lat,lng,dlat,dlng,op]) => {
        // Drift clouds slowly
        const driftLng = lng + tick * 2.5;
        const cPts: [number,number][] = [];
        for (let a=0; a<360; a+=8) {
          cPts.push([lat+dlat*Math.cos(a*D), driftLng+dlng*Math.sin(a*D)]);
        }
        drawPoly(cPts, rotY, `rgba(240,248,255,${op})`, "transparent", 0);
      });

      // ── City dots ────────────────────────────────────────────────────────────
      CITIES.forEach(([lat,lng,_name,isOffice]) => {
        const p3 = to3D(lat, lng, rotY);
        if (p3[2] < 0) return; // behind globe

        // Determine if in night zone (right side of globe = night)
        const nightFactor = Math.max(0, Math.min(1, p3[0]*0.5 + 0.5));
        const isNight = nightFactor > 0.65;

        const [sx,sy] = scr(p3);

        if (isOffice) {
          // Office cities (South Africa, Zambia, USA, UK, China) — bright orange glow
          const g = ctx.createRadialGradient(sx,sy,0, sx,sy,7);
          g.addColorStop(0, "rgba(255,120,60,0.95)");
          g.addColorStop(0.5,"rgba(255,80,20,0.60)");
          g.addColorStop(1, "rgba(255,50,0,0)");
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sx,sy,7,0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(sx,sy,2,0,Math.PI*2);
          ctx.fillStyle="rgba(255,200,100,0.95)"; ctx.fill();
        } else if (isNight) {
          // Night-side city lights — warm yellow glow
          const g = ctx.createRadialGradient(sx,sy,0, sx,sy,4);
          g.addColorStop(0, "rgba(255,220,100,0.80)");
          g.addColorStop(0.5,"rgba(255,180,60,0.40)");
          g.addColorStop(1, "rgba(255,150,30,0)");
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sx,sy,4,0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(sx,sy,1.2,0,Math.PI*2);
          ctx.fillStyle="rgba(255,230,130,0.90)"; ctx.fill();
        } else {
          // Day-side city — small white dot
          ctx.beginPath(); ctx.arc(sx,sy,1.8,0,Math.PI*2);
          ctx.fillStyle="rgba(255,255,255,0.70)"; ctx.fill();
        }
      });

      // ── Day/night terminator ──────────────────────────────────────────────
      const termG = ctx.createLinearGradient(cx-R*0.15,cy, cx+R,cy);
      termG.addColorStop(0.00, "rgba(0,5,20,0.00)");
      termG.addColorStop(0.50, "rgba(0,5,20,0.02)");
      termG.addColorStop(0.72, "rgba(0,5,20,0.22)");
      termG.addColorStop(0.85, "rgba(0,5,20,0.46)");
      termG.addColorStop(0.93, "rgba(0,5,20,0.62)");
      termG.addColorStop(1.00, "rgba(0,5,20,0.72)");
      ctx.fillStyle=termG; ctx.fillRect(cx-R,cy-R,2*R,2*R);

      // ── Sunset band on terminator ─────────────────────────────────────────
      const sunsetG = ctx.createLinearGradient(cx+R*0.45,cy, cx+R*0.70,cy);
      sunsetG.addColorStop(0, "rgba(255,100,20,0.00)");
      sunsetG.addColorStop(0.3,"rgba(255,90,10,0.12)");
      sunsetG.addColorStop(0.7,"rgba(255,60,0,0.08)");
      sunsetG.addColorStop(1, "rgba(255,60,0,0.00)");
      ctx.fillStyle=sunsetG; ctx.fillRect(cx-R,cy-R,2*R,2*R);

      // ── Specular highlight ────────────────────────────────────────────────
      const specG = ctx.createRadialGradient(cx-R*0.36,cy-R*0.36,0, cx-R*0.36,cy-R*0.36,R*0.55);
      specG.addColorStop(0, "rgba(255,255,255,0.22)");
      specG.addColorStop(0.4,"rgba(255,255,255,0.08)");
      specG.addColorStop(1, "rgba(255,255,255,0.00)");
      ctx.fillStyle=specG; ctx.fillRect(cx-R,cy-R,2*R,2*R);

      // ── Ocean specular (water sparkle sunward) ────────────────────────────
      const wG = ctx.createRadialGradient(cx-R*0.25,cy-R*0.18,0, cx-R*0.25,cy-R*0.18,R*0.30);
      wG.addColorStop(0, "rgba(140,220,255,0.12)");
      wG.addColorStop(1, "rgba(140,220,255,0.00)");
      ctx.fillStyle=wG; ctx.fillRect(cx-R,cy-R,2*R,2*R);

      // ── Limb darkening ────────────────────────────────────────────────────
      const limbG = ctx.createRadialGradient(cx,cy,R*0.70, cx,cy,R);
      limbG.addColorStop(0.00, "rgba(0,0,0,0.00)");
      limbG.addColorStop(0.72, "rgba(0,0,0,0.00)");
      limbG.addColorStop(0.90, "rgba(0,0,0,0.20)");
      limbG.addColorStop(1.00, "rgba(0,0,0,0.58)");
      ctx.fillStyle=limbG; ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();

      ctx.restore();

      // ── Atmosphere ────────────────────────────────────────────────────────
      const atmG = ctx.createRadialGradient(cx,cy,R*0.88, cx,cy,R*1.15);
      atmG.addColorStop(0.00, "rgba( 70,165,255,0.00)");
      atmG.addColorStop(0.25, "rgba( 85,180,255,0.38)");
      atmG.addColorStop(0.55, "rgba( 65,150,230,0.22)");
      atmG.addColorStop(0.80, "rgba( 50,120,200,0.10)");
      atmG.addColorStop(1.00, "rgba( 30, 80,160,0.00)");
      ctx.beginPath(); ctx.arc(cx,cy,R*1.15,0,Math.PI*2); ctx.fillStyle=atmG; ctx.fill();

      // ── SA legend pin ─────────────────────────────────────────────────────
      // (animated pulsing circle to draw attention to Cape Town)
      const ctP3 = to3D(-33.92, 18.42, rotY);
      if (ctP3[2] > 0) {
        const [px,py] = scr(ctP3);
        const pulse = 0.5+0.5*Math.sin(tick*3.0);
        const pr = 6+pulse*5;
        const pg = ctx.createRadialGradient(px,py,0, px,py,pr);
        pg.addColorStop(0, `rgba(255,100,50,${0.85*pulse})`);
        pg.addColorStop(1, "rgba(255,60,0,0)");
        ctx.beginPath(); ctx.arc(px,py,pr,0,Math.PI*2); ctx.fillStyle=pg; ctx.fill();
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return <canvas ref={canvasRef} style={{ display:"block", background:"transparent" }} />;
}

// ─── Section ──────────────────────────────────────────────────────────────────
export const WorldMapSection = memo(function WorldMapSection() {
  return (
    <section className="text-white py-14 sm:py-20 overflow-hidden"
      style={{ background: "linear-gradient(135deg,#0A0A1A 0%,#121230 40%,#1A1845 100%)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="text-center md:text-left">
            <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-5"
              style={{ background: "rgba(255,255,255,.12)" }}>
              Powered by Mastercard &amp; Visa
            </span>
            <h2 className="text-2xl sm:text-3xl font-black mb-4 leading-snug">
              One Card.<br />Everywhere You Go.
            </h2>
            <p className="text-white/70 text-sm leading-relaxed mb-6 max-w-sm mx-auto md:mx-0">
              Your Vink card is accepted at millions of merchant locations in over 175 countries — and across every major taxi route, fuel station, and retailer in South Africa. Tap-to-pay and contactless payments work instantly at partner merchants.
            </p>
            <div className="flex justify-center md:justify-start gap-8 mb-8">
              {STATS.map((s,i) => (
                <div key={i} className="text-center md:text-left">
                  <p className="text-2xl font-black" style={{ color:"#F5C842" }}>{s.value}</p>
                  <p className="text-white/60 text-[11px] font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 justify-center md:justify-start mb-6">
              {[
                { color:"#FF7043", label:"South Africa" },
                { color:"#27753E", label:"Tropical" },
                { color:"#7A9E50", label:"Subtropical" },
                { color:"#2E7D4A", label:"Temperate" },
                { color:"#8BA68B", label:"Polar" },
              ].map((l,i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background:l.color }} />
                  <span className="text-[10px] text-white/60">{l.label}</span>
                </div>
              ))}
            </div>
            <button className="bg-white text-[#1A1845] hover:bg-gray-100 px-8 py-3 rounded-xl transition-colors text-sm font-bold shadow-lg">
              See Our Network
            </button>
          </div>
          <div className="flex justify-center md:justify-end">
            <Globe />
          </div>
        </div>
      </div>
    </section>
  );
});
