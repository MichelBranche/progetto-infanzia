import { useEffect, useRef } from "react";
import { useHeroAmbientActive } from "../context/HeroAmbientContext";
import { getAmbientDisplayPalette } from "../lib/ambientCss";
import { getUserAmbientPalette } from "../lib/ambientThemes";

// Fallback shader se la palette utente non è disponibile.
const REF_C1: [number, number, number] = [224, 0, 145];
const REF_C2: [number, number, number] = [122, 31, 162];
const REF_C3: [number, number, number] = [49, 16, 80];

/**
 * Qualità massima. Pausa solo col player / tab nascosta / reduced-motion.
 * Fuori dalla home: 60 fps; in home (palette hero): 30 fps (meno carico).
 */
const FPS_HOME = 30;
const FPS_APP = 60;
const PALETTE_MS = 120;
/** Retina 3×: risoluzione piena. */
const MAX_DPR = 3;

type Accent = [number, number, number];

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Domain-warped fbm ricco: 5 ottave + doppio warp + venature fini.
const FRAG = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = uv * vec2(aspect, 1.0) * 2.55;
  float t = u_time * 0.042;

  // Primo warp: masse grandi e lente.
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0) + t * 0.85),
    fbm(p + vec2(5.2, 1.3) - t * 0.65)
  );
  // Secondo warp: pieghe e filamenti.
  vec2 r = vec2(
    fbm(p + 3.6 * q + vec2(1.7, 9.2) + t * 0.55),
    fbm(p + 3.6 * q + vec2(8.3, 2.8) - t * 0.48)
  );
  float f = fbm(p + 3.2 * r);

  // Venature principali + reticolo più fine.
  float veins = 1.0 - abs(2.0 * fract(f * 2.75 + r.x * 1.45) - 1.0);
  veins = pow(veins, 2.8);
  float fine = 1.0 - abs(2.0 * fract(f * 7.2 + q.y * 2.1) - 1.0);
  fine = pow(fine, 4.5) * 0.45;

  float body = smoothstep(0.22, 0.88, f);
  float glow = smoothstep(0.32, 1.05, length(q));
  float rim = smoothstep(0.55, 0.95, length(r));

  vec3 bg = vec3(0.02, 0.0, 0.051);
  vec3 col = bg;
  col = mix(col, u_c3 / 255.0, body * 0.92);
  col = mix(col, u_c2 / 255.0, glow * body * 0.88);
  col = mix(col, u_c1 / 255.0, rim * body * 0.22);
  col += (u_c1 / 255.0) * veins * (0.38 + 0.62 * body);
  col += (u_c2 / 255.0) * fine * (0.25 + 0.5 * glow);

  float vign = smoothstep(1.5, 0.32, length(uv - 0.5) * 1.75);
  col *= mix(0.7, 1.0, vign);

  // Leggero contrasto finale: più profondità senza cambiare la palette.
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.12);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function readAccents(heroActive: boolean): [Accent, Accent, Accent] {
  const userAccents = getUserAmbientPalette().accents;
  const accents = heroActive
    ? (getAmbientDisplayPalette()?.accents ?? userAccents)
    : userAccents;
  return [
    (accents?.[0] ?? REF_C1) as Accent,
    (accents?.[1] ?? REF_C2) as Accent,
    (accents?.[2] ?? REF_C3) as Accent,
  ];
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

type LoopCtl = {
  sync: () => void;
  refreshPalette: () => void;
};

function useLiquidCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  activeRef: React.RefObject<boolean>,
  pausedRef: React.RefObject<boolean>,
  ctlRef: React.MutableRefObject<LoopCtl | null>,
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "default",
      }) ?? undefined;

    if (!gl) return;

    const vert = compile(gl, gl.VERTEX_SHADER, VERT);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vert || !frag) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uC1 = gl.getUniformLocation(program, "u_c1");
    const uC2 = gl.getUniformLocation(program, "u_c2");
    const uC3 = gl.getUniformLocation(program, "u_c3");

    let raf = 0;
    let running = false;
    const start = performance.now();
    let lastDrawAt = 0;
    let lastPaletteAt = 0;
    let cached: [Accent, Accent, Accent] = readAccents(activeRef.current);
    let lastHeroActive = activeRef.current;
    let resizeTimer: number | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0, 0, w, h);
    };

    const queueResize = () => {
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        resize();
        paintOnce(performance.now());
      }, 100);
    };

    const updatePalette = (now: number, force: boolean) => {
      const heroActive = activeRef.current;
      if (
        !force &&
        now - lastPaletteAt < PALETTE_MS &&
        heroActive === lastHeroActive
      ) {
        return;
      }
      lastPaletteAt = now;
      if (heroActive) {
        const live = getAmbientDisplayPalette()?.accents;
        if (live?.[0] && live[1] && live[2]) {
          cached = [live[0] as Accent, live[1] as Accent, live[2] as Accent];
        } else {
          cached = readAccents(true);
        }
      } else if (heroActive !== lastHeroActive || force) {
        cached = readAccents(false);
      }
      lastHeroActive = heroActive;
    };

    const paintOnce = (now: number) => {
      updatePalette(now, false);
      const [c1, c2, c3] = cached;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform3f(uC1, c1[0], c1[1], c1[2]);
      gl.uniform3f(uC2, c2[0], c2[1], c2[2]);
      gl.uniform3f(uC3, c3[0], c3[1], c3[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      lastDrawAt = now;
    };

    const shouldRun = () =>
      !pausedRef.current &&
      !document.hidden &&
      !prefersReducedMotion();

    const draw = (now: number) => {
      if (!running) return;

      if (!shouldRun()) {
        running = false;
        raf = 0;
        return;
      }

      const minInterval = 1000 / (activeRef.current ? FPS_HOME : FPS_APP);
      if (now - lastDrawAt >= minInterval) {
        paintOnce(now);
      }

      raf = requestAnimationFrame(draw);
    };

    const startLoop = () => {
      if (running || !shouldRun()) return;
      running = true;
      updatePalette(performance.now(), true);
      raf = requestAnimationFrame(draw);
    };

    const stopLoop = () => {
      running = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const sync = () => {
      if (shouldRun()) startLoop();
      else stopLoop();
    };

    const refreshPalette = () => {
      updatePalette(performance.now(), true);
      if (!running && !shouldRun()) {
        paintOnce(performance.now());
      }
    };

    ctlRef.current = { sync, refreshPalette };

    const onVisibility = () => sync();
    const onMotionChange = () => {
      if (prefersReducedMotion()) {
        stopLoop();
        paintOnce(performance.now());
      } else {
        sync();
      }
    };

    resize();
    paintOnce(performance.now());
    startLoop();

    window.addEventListener("resize", queueResize);
    document.addEventListener("visibilitychange", onVisibility);
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionMq.addEventListener?.("change", onMotionChange);

    return () => {
      ctlRef.current = null;
      stopLoop();
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", queueResize);
      document.removeEventListener("visibilitychange", onVisibility);
      motionMq.removeEventListener?.("change", onMotionChange);
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteBuffer(buffer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function LiquidBackgroundCanvas({ paused = false }: { paused?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { active } = useHeroAmbientActive();
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const ctlRef = useRef<LoopCtl | null>(null);

  useEffect(() => {
    activeRef.current = active;
    ctlRef.current?.refreshPalette();
  }, [active]);

  useEffect(() => {
    pausedRef.current = paused;
    ctlRef.current?.sync();
  }, [paused]);

  useLiquidCanvas(canvasRef, activeRef, pausedRef, ctlRef);

  return (
    <div className="liquid-bg" aria-hidden>
      <canvas ref={canvasRef} className="liquid-bg__canvas" />
    </div>
  );
}

export function LiquidBackground({ paused = false }: { paused?: boolean }) {
  return <LiquidBackgroundCanvas paused={paused} />;
}

/**
 * Variante standalone per schermate di boot: aurora CSS (non WebGL).
 * Così resta fluida anche mentre sotto il loader la homepage si idrata.
 */
export function BootLiquidBackground({ className = "" }: { className?: string }) {
  return (
    <div
      className={`liquid-bg liquid-bg--boot liquid-bg--boot-css ${className}`.trim()}
      aria-hidden
    >
      <div className="liquid-bg__boot-aurora">
        <span className="liquid-bg__boot-blob liquid-bg__boot-blob--a" />
        <span className="liquid-bg__boot-blob liquid-bg__boot-blob--b" />
        <span className="liquid-bg__boot-blob liquid-bg__boot-blob--c" />
      </div>
    </div>
  );
}
