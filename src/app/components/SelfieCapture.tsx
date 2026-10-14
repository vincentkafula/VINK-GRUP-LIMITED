import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, ImagePlus, RefreshCw, Sparkles } from "lucide-react";

/**
 * Takes a selfie with the device's camera: asks for permission, shows the live picture in a square frame with an oval to centre the face in, counts down
 * 3, 2, 1, flashes, and shows the photo to keep or retake. When the camera is blocked, missing or unavailable (a page that is not secure), the same step
 * offers to choose or take a photo with the phone's own camera instead. The picture is cropped square, mirrored the way a mirror shows it, and shrunk to about
 * 560px so it travels with the application as a small JPEG. Nothing is sent from here: the caller receives the picture and decides.
 */

interface Props {
  /** Called with the chosen photo as a JPEG data URL. */
  onUse: (photo: string) => void;
  onBack: () => void;
  /** Length of one count in the countdown; the page uses a second, the tests a millisecond. */
  tick?: number;
}

type Status = "starting" | "live" | "blocked" | "missing" | "unavailable";

const SIZE = 560;

/** Crops the centre square of a picture source, scales it to SIZE, and returns a JPEG data URL. */
export function squareJpeg(src: CanvasImageSource, w: number, h: number, mirror: boolean): string | null {
  const side = Math.min(w, h); if (!side) return null;
  const c = document.createElement("canvas"); const out = Math.min(SIZE, side); c.width = out; c.height = out;
  const x = c.getContext("2d"); if (!x) return null;
  if (mirror) { x.translate(out, 0); x.scale(-1, 1); }
  x.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
  return c.toDataURL("image/jpeg", 0.8);
}

export function SelfieCapture({ onUse, onBack, tick = 1000 }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const [status, setStatus] = useState<Status>("starting");
  const [count, setCount] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [msg, setMsg] = useState("");

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);

  const start = useCallback(async () => {
    stop(); setStatus("starting"); setPhoto(null); setCount(null); setMsg("");
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) { setStatus("unavailable"); return; }                 // an older browser, or a page that is not on https
    try {
      const s = await md.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      if (!alive.current) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s; setStatus("live");
    } catch (e) {
      if (!alive.current) return;
      const n = (e as { name?: string })?.name;
      setStatus(n === "NotFoundError" || n === "OverconstrainedError" || n === "DevicesNotFoundError" ? "missing" : "blocked");
    }
  }, [stop]);

  // the picture element is always on the page, so it can be given the stream the moment the camera is live
  useEffect(() => {
    const v = video.current; if (!v || status !== "live" || !stream.current) return;
    v.srcObject = stream.current; void Promise.resolve(v.play?.()).catch(() => { /* autoplay can be refused: the picture shows on the first tap */ });
  }, [status]);

  useEffect(() => { alive.current = true; void start(); return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); stop(); }; }, [start, stop]);

  const snap = () => {
    const v = video.current; if (!v) return;
    const w = v.videoWidth || 640, h = v.videoHeight || 640;
    const data = squareJpeg(v, w, h, true);
    if (!data) { setMsg("We couldn't take the photo. Please try again."); setCount(null); return; }
    setFlash(true); setTimeout(() => setFlash(false), 220);
    setPhoto(data); setCount(null); stop();
  };
  const shoot = () => {
    if (count !== null) return;
    setMsg(""); let n = 3; setCount(n);
    const step = () => { n -= 1; if (!alive.current) return; if (n <= 0) { snap(); return; } setCount(n); timer.current = setTimeout(step, tick); };
    timer.current = setTimeout(step, tick);
  };

  // a photo chosen or taken with the phone's own camera
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { setMsg("Please choose a photo (an image file)."); return; }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => { const d = squareJpeg(img, img.naturalWidth || img.width, img.naturalHeight || img.height, false); if (d) { setPhoto(d); setMsg(""); } else setMsg("We couldn't read that photo. Please try another."); };
      img.onerror = () => setMsg("We couldn't read that photo. Please try another.");
      img.src = String(r.result);
    };
    r.onerror = () => setMsg("We couldn't read that photo. Please try another.");
    r.readAsDataURL(f);
  };

  const live = status === "live" && !photo;
  const problem = status === "blocked" ? "Camera access was blocked. Allow the camera in your browser's address bar, then try again."
    : status === "missing" ? "No camera was found on this device."
    : status === "unavailable" ? "The camera isn't available in this browser. You can take or choose a photo instead." : "";
  const fileId = "selfie-file";

  return (
    <section>
      <div className="mb-6 mt-7 text-center">
        <h2 className="font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-fg">Take a selfie</h2>
        <p className="mt-3 text-[16px] leading-relaxed text-fg-muted">Centre your face in the oval, look at the camera, and make sure you are in good light.</p>
      </div>

      <div className="relative mx-auto mb-4 aspect-square w-full max-w-[400px] overflow-hidden rounded-[32px] bg-[#16090c] shadow-[0_24px_50px_-20px_rgba(120,10,30,0.55)] ring-1 ring-black/10" data-selfie-frame>
        {photo ? (
          <img src={photo} alt="Your selfie" className="absolute inset-0 size-full object-cover" />
        ) : (
          <video ref={video} autoPlay muted playsInline aria-label="Live camera picture" className={`absolute inset-0 size-full -scale-x-100 object-cover transition-opacity duration-300 ${live ? "opacity-100" : "opacity-0"}`} />
        )}

        {!photo && !live && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white">
            {status === "starting" ? (<><Camera className="size-14 animate-pulse text-white/70" strokeWidth={1.3} aria-hidden="true" /><p className="text-[15px] text-white/80">Waiting for the camera…<br /><span className="text-[13px] text-white/60">Choose Allow if your browser asks.</span></p></>)
              : (<><CameraOff className="size-14 text-white/70" strokeWidth={1.3} aria-hidden="true" /><p role="alert" className="text-[15px] leading-snug text-white/85">{problem}</p></>)}
          </div>
        )}

        {live && (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path fillRule="evenodd" fill="rgba(16,8,10,0.5)" d="M0 0H100V100H0Z M50 12C34 12 25 26 25 44 25 64 36 80 50 80 64 80 75 64 75 44 75 26 66 12 50 12Z" />
            <path fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="0.7" strokeDasharray="2.2 1.6" d="M50 12C34 12 25 26 25 44 25 64 36 80 50 80 64 80 75 64 75 44 75 26 66 12 50 12Z" />
          </svg>
        )}

        {count !== null && (
          <div className="absolute inset-0 flex items-center justify-center" aria-live="assertive">
            <span key={count} className="vkp-rise text-[110px] font-black leading-none text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)]">{count}</span>
          </div>
        )}
        <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-200 ${flash ? "opacity-90" : "opacity-0"}`} />
        {photo && <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[12px] font-bold text-[#0b7a43]"><Check className="size-3.5" aria-hidden="true" />Photo ready</span>}
      </div>

      {msg && <p role="alert" className="mb-2 text-center text-[13.5px] text-bad">{msg}</p>}

      <input id={fileId} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} aria-label="Take or choose a selfie" />

      {photo ? (
        <>
          <Btn onClick={() => onUse(photo)} solid><Check className="size-5" aria-hidden="true" />Use this photo</Btn>
          <Btn onClick={() => void start()}><RefreshCw className="size-4" aria-hidden="true" />Retake</Btn>
        </>
      ) : status === "live" ? (
        <>
          <Btn onClick={shoot} solid disabled={count !== null}><Camera className="size-5" aria-hidden="true" />{count !== null ? "Hold still…" : "Take photo"}</Btn>
          <Btn onClick={onBack}>Back</Btn>
        </>
      ) : status === "starting" ? (
        <Btn onClick={onBack}>Back</Btn>
      ) : (
        <>
          {status === "blocked" && <Btn onClick={() => void start()} solid><RefreshCw className="size-4" aria-hidden="true" />Try the camera again</Btn>}
          <label htmlFor={fileId} className={`mt-3.5 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[16.5px] font-semibold transition-all hover:-translate-y-px ${status === "blocked" ? "bg-brand-soft text-crimson-text ring-1 ring-inset ring-[rgba(176,18,42,0.16)]" : "text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_14px_28px_-10px_rgba(176,18,42,0.55)]"}`}
            style={status === "blocked" ? undefined : { background: "linear-gradient(180deg,#e5484f 0%,#b0122a 100%)" }}><ImagePlus className="size-5" aria-hidden="true" />Take or choose a photo</label>
          <Btn onClick={onBack}>Back</Btn>
        </>
      )}

      <p className="mx-auto mt-5 flex max-w-xs items-start gap-2 text-center text-[12.5px] leading-snug text-fg-muted"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-crimson-text" aria-hidden="true" /><span>Your photo is used only to confirm who you are, and is sent with your application.</span></p>
    </section>
  );
}

function Btn({ children, onClick, solid, disabled }: { children: React.ReactNode; onClick?: () => void; solid?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`mt-3.5 flex h-14 w-full items-center justify-center gap-2 rounded-full text-[16.5px] font-semibold transition-all duration-200 hover:-translate-y-px active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${solid ? "text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_14px_28px_-10px_rgba(176,18,42,0.55)] hover:brightness-105" : "bg-brand-soft text-crimson-text ring-1 ring-inset ring-[rgba(176,18,42,0.16)] hover:brightness-95"}`}
      style={solid ? { background: "linear-gradient(180deg,#e5484f 0%,#b0122a 100%)" } : undefined}>{children}</button>
  );
}

