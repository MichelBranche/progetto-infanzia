import { useEffect, useRef } from "react";
import { useHeroAmbientActive } from "../context/HeroAmbientContext";
import { getAmbientDisplayPalette } from "../lib/ambientCss";
import { getUserAmbientPalette } from "../lib/ambientThemes";
// Fallback shader se la palette utente non è disponibile.
const REF_C1: [number, number, number] = [224, 0, 145];
const REF_C2: [number, number, number] = [122, 31, 162];
const REF_C3: [number, number, number] = [49, 16, 80];

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Domain-warped fbm: bande fluide marmorizzate come l'AuroraBackground
// del sito di riferimento (shader WebGL, non blob sfocati).
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
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 2.4;
  float t = u_time * 0.045;

  // Doppio domain warping per il flusso marmorizzato
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0) + t * 0.9),
    fbm(p + vec2(5.2, 1.3) - t * 0.7)
  );
  vec2 r = vec2(
    fbm(p + 3.2 * q + vec2(1.7, 9.2) + t * 0.6),
    fbm(p + 3.2 * q + vec2(8.3, 2.8) - t * 0.5)
  );
  float f = fbm(p + 3.0 * r);

  // Bande sottili "ridged" ad alto contrasto (venature)
  float veins = 1.0 - abs(2.0 * fract(f * 2.6 + r.x * 1.4) - 1.0);
  veins = pow(veins, 3.0);

  float body = smoothstep(0.25, 0.85, f);
  float glow = smoothstep(0.4, 1.0, length(q));

  vec3 bg = vec3(0.02, 0.0, 0.051); // #05000d
  vec3 col = bg;
  col = mix(col, u_c3 / 255.0, body * 0.9);
  col = mix(col, u_c2 / 255.0, glow * body * 0.85);
  col += (u_c1 / 255.0) * veins * (0.35 + 0.65 * body);

  // Vignettatura leggera verso i bordi
  float vign = smoothstep(1.45, 0.35, length(uv - 0.5) * 1.7);
  col *= mix(0.72, 1.0, vign);

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

function useLiquidCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  activeRef: React.RefObject<boolean>,
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
        powerPreference: "low-power",
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
    const start = performance.now();

    const resize = () => {
      // Lo shader è costoso a piena risoluzione: metà basta, il risultato
      // è comunque morbido come il reference.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = () => {
      const userAccents = getUserAmbientPalette().accents;
      const accents = activeRef.current
        ? (getAmbientDisplayPalette()?.accents ?? userAccents)
        : userAccents;

      const c1 = accents?.[0] ?? REF_C1;
      const c2 = accents?.[1] ?? REF_C2;
      const c3 = accents?.[2] ?? REF_C3;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform3f(uC1, c1[0], c1[1], c1[2]);
      gl.uniform3f(uC2, c2[0], c2[1], c2[2]);
      gl.uniform3f(uC3, c3[0], c3[1], c3[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteBuffer(buffer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function LiquidBackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { active } = useHeroAmbientActive();
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useLiquidCanvas(canvasRef, activeRef);

  return (
    <div className="liquid-bg" aria-hidden>
      <canvas ref={canvasRef} className="liquid-bg__canvas" />
    </div>
  );
}

export function LiquidBackground() {
  return <LiquidBackgroundCanvas />;
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