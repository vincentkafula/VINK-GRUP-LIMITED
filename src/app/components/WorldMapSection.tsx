import { memo, useEffect, useRef } from "react";

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

// ─── Land polygons — high-detail with biome tagging ─────────────────────────
type LandPoly = { pts: [number,number][]; biome?: "forest"|"desert"|"savanna"|"tundra"|"ice"|"sa"|"tropical" };

const LAND: LandPoly[] = [
  // ── South Africa (highlighted) ──────────────────────────────────────────────
  { biome: "sa", pts: [
    [-22,30],[-22,32],[-24,33],[-26,33],[-28,33],[-29,31],[-31,30],[-33,28],
    [-34,26],[-34,24],[-33,22],[-32,18],[-30,16],[-28,16],[-26,16],[-23,15],
    [-22,30],
  ]},
  // ── Africa (split into biomes) ───────────────────────────────────────────────
  // North Africa (desert)
  { biome: "desert", pts: [
    [37,10],[35,-5],[28,-13],[21,-17],[15,-17],[15,-1],[20,0],[22,3],
    [30,5],[35,10],[37,10],
  ]},
  // Sahel / savanna
  { biome: "savanna", pts: [
    [15,-17],[10,-15],[5,-8],[4,-2],[1,7],[-4,9],[-5,12],
    [0,15],[5,15],[10,10],[15,-1],[15,-17],
  ]},
  // Central & East Africa (tropical)
  { biome: "tropical", pts: [
    [-4,9],[-14,12],[-16,16],[-18,18],[-15,22],[-10,25],[-5,25],
    [0,25],[5,22],[8,22],[8,42],[4,42],[1,42],[-4,40],[-12,40],
    [-14,38],[-14,26],[-14,22],[-14,12],[-4,9],
  ]},
  // Southern Africa (savanna above SA)
  { biome: "savanna", pts: [
    [-14,22],[-22,22],[-22,30],[-22,32],[-16,36],[-10,40],[0,42],
    [1,42],[-4,40],[-12,40],[-14,38],[-14,26],[-14,22],
  ]},
  // Horn of Africa
  { biome: "desert", pts: [
    [8,42],[8,50],[11,50],[12,44],[0,42],[1,42],[8,42],
  ]},
  // West Africa coast
  { biome: "tropical", pts: [
    [4,-2],[1,7],[-4,9],[-8,12],[0,5],[-2,-1],[4,-2],
  ]},
  // Egypt/Nile
  { biome: "desert", pts: [
    [22,36],[30,32],[37,28],[35,26],[29,25],[22,36],
  ]},

  // ── Europe ──────────────────────────────────────────────────────────────────
  { biome: "forest", pts: [
    [36,-9],[38,-9],[41,-9],[43,-9],[44,-1],[44,2],[48,-4],[51,2],
    [52,5],[54,14],[54,9],[56,8],[58,5],[57,22],[56,21],
    [60,24],[63,20],[65,14],[65,-3],[62,-7],[60,-6],[58,-7],
    [52,-10],[44,-8],[41,-9],[36,-9],
  ]},
  // Scandinavian detail
  { biome: "tundra", pts: [
    [65,14],[68,16],[70,26],[71,27],[70,30],[67,28],[65,25],[60,24],[63,20],[65,14],
  ]},
  // British Isles
  { biome: "forest", pts: [
    [50,-5],[52,-5],[54,-3],[56,-3],[58,-4],[57,-2],[54,0],[52,2],[50,-5],
  ]},
  { biome: "forest", pts: [
    [54,-6],[56,-6],[56,-3],[54,-3],[54,-6],
  ]},

  // ── Asia ────────────────────────────────────────────────────────────────────
  // Middle East
  { biome: "desert", pts: [
    [37,28],[42,26],[42,36],[38,40],[37,44],[36,38],[29,34],[22,36],[25,38],[30,32],[37,28],
  ]},
  // Arabia
  { biome: "desert", pts: [
    [22,38],[22,60],[25,57],[27,50],[30,50],[22,38],
  ]},
  // Persian + India
  { biome: "savanna", pts: [
    [25,57],[22,60],[12,44],[5,42],[8,76],[12,78],[8,77],[0,73],
    [10,79],[8,77],[22,88],[26,90],[26,72],[25,68],[25,57],
  ]},
  // India (green)
  { biome: "tropical", pts: [
    [8,76],[12,78],[20,86],[22,88],[26,90],[22,88],[18,83],
    [12,80],[8,77],[5,80],[0,73],[8,76],
  ]},
  // Central Asia (steppe)
  { biome: "desert", pts: [
    [37,44],[42,42],[45,52],[50,58],[55,62],[52,68],[45,60],[37,57],[37,44],
  ]},
  // Siberia/Russia
  { biome: "tundra", pts: [
    [55,62],[60,60],[65,60],[70,68],[77,104],[77,68],[72,58],[60,60],[55,62],
  ]},
  // East Siberia
  { biome: "tundra", pts: [
    [60,100],[65,100],[68,140],[60,153],[55,143],[50,142],[55,130],[60,100],
  ]},
  // China / East Asia
  { biome: "forest", pts: [
    [22,100],[26,90],[30,100],[35,119],[38,122],[40,124],[42,128],[42,130],
    [40,128],[35,120],[22,114],[18,108],[22,100],
  ]},
  // SE Asia
  { biome: "tropical", pts: [
    [0,103],[5,100],[10,98],[18,102],[22,100],[18,108],[10,104],[5,104],[0,103],
  ]},
  // Korea + Manchuria
  { biome: "forest", pts: [
    [38,126],[40,124],[42,128],[40,130],[36,128],[34,128],[38,126],
  ]},
  // Japan
  { biome: "forest", pts: [
    [31,130],[33,131],[35,133],[37,136],[40,140],[42,143],[40,142],[36,136],[31,130],
  ]},
  { biome: "forest", pts: [
    [43,141],[44,143],[44,145],[43,144],[43,141],
  ]},
  // Indonesia (Borneo, Sumatra, Java)
  { biome: "tropical", pts: [
    [-6,106],[-3,104],[1,104],[4,114],[0,116],[-4,114],[-6,106],
  ]},
  { biome: "tropical", pts: [
    [-5,113],[-5,120],[0,120],[2,116],[0,114],[-5,113],
  ]},
  { biome: "tropical", pts: [
    [1,110],[4,114],[4,118],[0,118],[0,110],[1,110],
  ]},
  // Philippines (Luzon)
  { biome: "tropical", pts: [
    [14,122],[16,120],[18,122],[16,124],[14,122],
  ]},

  // ── North America ────────────────────────────────────────────────────────────
  { biome: "tundra", pts: [
    [70,-140],[65,-168],[60,-168],[55,-165],[58,-137],[60,-140],
    [65,-145],[70,-140],
  ]},
  { biome: "forest", pts: [
    [55,-130],[50,-128],[47,-124],[44,-78],[45,-64],[47,-53],
    [52,-55],[58,-68],[62,-65],[65,-65],[65,-85],[60,-90],
    [55,-75],[55,-82],[48,-70],[55,-65],[58,-68],[65,-68],
    [68,-76],[73,-83],[75,-90],[75,-100],[68,-100],[60,-90],
    [55,-95],[50,-95],[50,-84],[45,-80],[40,-74],[45,-64],
    [55,-65],[55,-130],
  ]},
  // Greenland (ice)
  { biome: "ice", pts: [
    [76,-72],[82,-42],[83,-22],[76,-18],[72,-22],
    [65,-37],[65,-52],[68,-58],[72,-63],[76,-72],
  ]},
  // USA / Great Plains
  { biome: "savanna", pts: [
    [32,-117],[32,-80],[36,-75],[40,-74],[42,-78],[45,-78],[45,-90],
    [40,-90],[40,-95],[35,-100],[30,-100],[25,-97],[22,-105],[30,-116],[32,-117],
  ]},
  // SE USA / Florida
  { biome: "forest", pts: [
    [32,-80],[30,-81],[25,-80],[24,-81],[30,-85],[32,-80],
  ]},
  // Mexico / Central America
  { biome: "savanna", pts: [
    [22,-105],[15,-92],[10,-84],[8,-77],[8,-80],[14,-90],
    [20,-90],[25,-92],[30,-100],[22,-105],
  ]},
  // Caribbean (Cuba)
  { biome: "tropical", pts: [
    [22,-84],[20,-75],[22,-74],[23,-80],[22,-84],
  ]},

  // ── South America ────────────────────────────────────────────────────────────
  { biome: "tropical", pts: [
    [8,-63],[5,-52],[0,-50],[-5,-35],[0,-40],
    [0,-50],[5,-52],[8,-63],
  ]},
  // Amazon Basin
  { biome: "tropical", pts: [
    [8,-63],[5,-62],[-2,-60],[-10,-55],[-15,-55],[-12,-65],[-5,-73],[3,-78],[8,-63],
  ]},
  // Andes & Pacific coast
  { biome: "savanna", pts: [
    [3,-78],[-5,-81],[-18,-70],[-30,-72],[-40,-73],[-40,-65],[-30,-65],[-18,-65],[-5,-73],[3,-78],
  ]},
  // Brazil highlands
  { biome: "savanna", pts: [
    [-5,-35],[-10,-37],[-20,-40],[-30,-52],[-38,-57],[-35,-60],[-20,-55],[-10,-50],[-5,-35],
  ]},
  // Patagonia
  { biome: "tundra", pts: [
    [-40,-65],[-40,-73],[-50,-75],[-55,-67],[-55,-65],[-50,-68],[-40,-65],
  ]},

  // ── Australia ────────────────────────────────────────────────────────────────
  { biome: "desert", pts: [
    [-20,115],[-15,130],[-12,136],[-18,136],[-20,140],[-25,138],[-26,128],[-28,115],[-20,115],
  ]},
  { biome: "savanna", pts: [
    [-12,136],[-12,142],[-18,146],[-25,152],[-30,153],[-32,126],[-26,128],[-25,138],[-20,140],[-18,136],[-12,136],
  ]},
  { biome: "forest", pts: [
    [-30,153],[-32,152],[-38,147],[-38,141],[-35,138],[-32,126],[-30,153],
  ]},
  // Tasmania
  { biome: "forest", pts: [
    [-41,147],[-40,148],[-42,148],[-43,146],[-41,147],
  ]},
  // New Zealand
  { biome: "forest", pts: [
    [-34,172],[-36,174],[-38,176],[-40,175],[-38,174],[-34,172],
  ]},
  { biome: "forest", pts: [
    [-40,174],[-44,171],[-46,168],[-46,170],[-42,172],[-40,174],
  ]},

  // ── Antarctica ───────────────────────────────────────────────────────────────
  { biome: "ice", pts: Array.from({length:37}, (_,i) => [-70, i*10-180] as [number,number]) },
  { biome: "ice", pts: Array.from({length:37}, (_,i) => [-80, i*10-180] as [number,number]) },

  // ── Arctic ───────────────────────────────────────────────────────────────────
  { biome: "ice", pts: Array.from({length:37}, (_,i) => [78, i*10-180] as [number,number]) },
];

// ─── City dots [lat, lng, name] ───────────────────────────────────────────────
const CITIES: [number, number, string, boolean][] = [
  // South Africa
  [-33.92,  18.42, "Cape Town",   true ],
  [-26.20,  28.05, "Johannesburg",true ],
  [-29.85,  31.00, "Durban",      true ],
  [-25.75,  28.20, "Pretoria",    true ],
  // Africa
  [-1.28,   36.82, "Nairobi",     false],
  [ 6.36,    3.40, "Lagos",       false],
  [30.06,   31.25, "Cairo",       false],
  [-8.84,   13.23, "Luanda",      false],
  [15.55,   32.53, "Khartoum",    false],
  // Europe
  [51.51,   -0.13, "London",      false],
  [48.85,    2.35, "Paris",       false],
  [52.52,   13.40, "Berlin",      false],
  [41.90,   12.48, "Rome",        false],
  // Americas
  [40.71,  -74.01, "New York",    false],
  [34.05, -118.24, "Los Angeles", false],
  [-23.55, -46.63, "São Paulo",   false],
  // Asia
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

// ─── Biome fill colours ───────────────────────────────────────────────────────
const BIOME_FILL: Record<string, string> = {
  forest:  "#2E7D4A",
  tropical:"#27753E",
  savanna: "#7A9E50",
  desert:  "#C4A064",
  tundra:  "#8BA68B",
  ice:     "#E8F4FC",
  sa:      "#FF7043",   // South Africa — highlight colour
};
const BIOME_STROKE: Record<string, string> = {
  forest:  "#1D5C33",
  tropical:"#1C5C2E",
  savanna: "#5A7A3A",
  desert:  "#A0803C",
  tundra:  "#6A8870",
  ice:     "#B0D8F0",
  sa:      "#E64A19",
};

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

    function drawPoly(latLngs:[number,number][], rotY:number, fill:string, stroke:string, lw=0.6) {
      const pts3 = latLngs.map(([la,ln]) => to3D(la, ln, rotY));
      const vis: [number,number][] = [];
      for (let i = 0; i < pts3.length; i++) {
        const c = pts3[i];
        const n = pts3[(i+1) % pts3.length];
        if (c[2] >= 0) vis.push(scr(c));
        if ((c[2] >= 0) !== (n[2] >= 0)) {
          const t = c[2]/(c[2]-n[2]);
          let hx = c[0]+t*(n[0]-c[0]);
          let hy = c[1]+t*(n[1]-c[1]);
          const l = Math.sqrt(hx*hx+hy*hy)||1;
          vis.push([cx+(hx/l)*R, cy-(hy/l)*R]);
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
      sorted.forEach(({pts, biome="forest"}) => {
        drawPoly(pts, rotY, BIOME_FILL[biome], BIOME_STROKE[biome], biome==="sa"?1.0:0.5);
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
      CITIES.forEach(([lat,lng,_name,isSA]) => {
        const p3 = to3D(lat, lng, rotY);
        if (p3[2] < 0) return; // behind globe

        // Determine if in night zone (right side of globe = night)
        const nightFactor = Math.max(0, Math.min(1, p3[0]*0.5 + 0.5));
        const isNight = nightFactor > 0.65;

        const [sx,sy] = scr(p3);

        if (isSA) {
          // SA cities — bright orange glow
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
                { color:"#2E7D4A", label:"Forest/Temperate" },
                { color:"#C4A064", label:"Desert/Arid" },
                { color:"#7A9E50", label:"Savanna/Steppe" },
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
