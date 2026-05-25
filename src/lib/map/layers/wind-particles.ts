/**
 * Wind particles WebGL custom layer.
 *
 * GPU particle simulator that advects PARTICLE_COUNT points across an
 * 8×6 wind vector field encoded as a small RGBA texture. Each frame:
 *   1. prerender: ping-pong the position texture through the update
 *      fragment shader (Euler integration step over the wind field).
 *   2. render: draw the live positions as GL_POINTS colored by speed.
 *
 * Extracted from interactive-map.ts so the heavy WebGL setup stops
 * polluting the main bootstrap. The factory takes the supporting
 * state via getters (windGrid, hour index, dirty flag) so the outer
 * scope can mutate them without coupling to this module.
 */
import type maplibregl from 'maplibre-gl';
import {
  type WindPoint,
  MAX_WIND_MPS,
  encodeWindGrid,
  initParticlePositions,
} from '../../mapwind';
import type { WindGrid } from '../../mapfields';

export const WIND_PARTICLES_LAYER_ID = 'wx-wind-layer';
const PARTICLE_TEX_SIZE = 64;
const PARTICLE_COUNT = PARTICLE_TEX_SIZE * PARTICLE_TEX_SIZE;

export interface WindParticlesDeps {
  /** Returns the current wind grid (8×6 of u/v vectors per hour). */
  getWindGrid: () => WindGrid | null;
  /** Returns the hour index currently being rendered. */
  getHourIndex: () => number;
  /** True when wind grid or hour index changed since last upload. The
   *  layer reads this on each prerender to decide whether to refresh
   *  the wind texture; consumers should call markTexClean() inside
   *  the layer's onRemove. */
  isTexDirty: () => boolean;
  markTexClean: () => void;
  /** Called once per requestAnimationFrame tick; consumer typically
   *  forwards this to its own raf tracker so it can cancel from
   *  removeWind(). */
  onTick?: (id: number) => void;
}

export function windPointsAtHour(g: WindGrid, h: number): WindPoint[] {
  return g.points.map(
    (p: WindGrid['points'][number]): WindPoint => ({
      lat: p.lat,
      lng: p.lng,
      u: p.u[h],
      v: p.v[h],
    }),
  );
}

export function makeWindParticlesLayer(
  map: maplibregl.Map,
  deps: WindParticlesDeps,
): maplibregl.CustomLayerInterface {
  let prog: WebGLProgram | null = null;
  let updateProg: WebGLProgram | null = null;
  let posTexA: WebGLTexture | null = null;
  let posTexB: WebGLTexture | null = null;
  let windTex: WebGLTexture | null = null;
  let fbo: WebGLFramebuffer | null = null;
  let posBuf: WebGLBuffer | null = null;
  let quadBuf: WebGLBuffer | null = null;
  let upd_aPos = -1;
  let upd_uPos: WebGLUniformLocation | null = null;
  let upd_uWind: WebGLUniformLocation | null = null;
  let upd_uDt: WebGLUniformLocation | null = null;
  let upd_uMax: WebGLUniformLocation | null = null;
  let drw_aIdx = -1;
  let drw_uPos: WebGLUniformLocation | null = null;
  let drw_uWind: WebGLUniformLocation | null = null;
  let drw_uSize: WebGLUniformLocation | null = null;
  let drw_uMax: WebGLUniformLocation | null = null;
  let drw_uPointSize: WebGLUniformLocation | null = null;
  let raf = 0;

  function compile(
    gl: WebGLRenderingContext,
    type: number,
    src: string,
  ): WebGLShader {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[wind] shader compile failed:', gl.getShaderInfoLog(sh));
    }
    return sh;
  }
  function link(
    gl: WebGLRenderingContext,
    vs: string,
    fs: string,
  ): WebGLProgram {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[wind] program link failed:', gl.getProgramInfoLog(p));
    }
    return p;
  }

  const updateVs = `
    precision highp float;
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;
  const updateFs = `
    precision highp float;
    uniform sampler2D u_pos;
    uniform sampler2D u_wind;
    uniform float u_dt;
    uniform float u_max;
    varying vec2 v_uv;
    void main() {
      vec4 p = texture2D(u_pos, v_uv);
      vec2 pos = p.xy;
      vec4 wTex = texture2D(u_wind, pos);
      vec2 uv = (wTex.rg * 2.0 - 1.0) * u_max;
      float mask = wTex.a;
      vec2 dp = vec2(uv.x, -uv.y) * u_dt * 0.000045;
      pos += dp * mask;
      float age = p.z + u_dt;
      if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0 || age > 0.95) {
        pos = fract(vec2(
          sin(dot(v_uv, vec2(12.9898, 78.233)) + age * 53.0) * 43758.5453,
          cos(dot(v_uv, vec2(4.898, 7.23)) + age * 39.0) * 12345.678
        ));
        age = 0.0;
      }
      gl_FragColor = vec4(pos, age, 0.0);
    }
  `;
  const drawVs = `
    precision highp float;
    attribute float a_index;
    uniform sampler2D u_pos;
    uniform float u_size;
    uniform float u_pointSize;
    varying float v_speed;
    uniform sampler2D u_wind;
    uniform float u_max;
    void main() {
      float i = a_index;
      float row = floor(i / u_size);
      float col = i - row * u_size;
      vec2 uvIdx = (vec2(col, row) + 0.5) / u_size;
      vec4 p = texture2D(u_pos, uvIdx);
      vec4 w = texture2D(u_wind, p.xy);
      vec2 wind = (w.rg * 2.0 - 1.0) * u_max;
      v_speed = length(wind);
      gl_Position = vec4(p.x * 2.0 - 1.0, (1.0 - p.y) * 2.0 - 1.0, 0.0, 1.0);
      gl_PointSize = u_pointSize;
    }
  `;
  const drawFs = `
    precision highp float;
    varying float v_speed;
    uniform float u_max;
    void main() {
      float t = clamp(v_speed / u_max, 0.0, 1.0);
      vec3 cCalm   = vec3(0.169, 0.514, 0.729);
      vec3 cBreeze = vec3(0.671, 0.867, 0.643);
      vec3 cStrong = vec3(0.992, 0.682, 0.380);
      vec3 cGale   = vec3(0.404, 0.000, 0.051);
      vec3 col = mix(cCalm, cBreeze, smoothstep(0.0, 0.25, t));
      col = mix(col, cStrong, smoothstep(0.25, 0.6, t));
      col = mix(col, cGale, smoothstep(0.6, 1.0, t));
      gl_FragColor = vec4(col, 0.85);
    }
  `;

  function ensureWindTex(gl: WebGLRenderingContext): void {
    const grid = deps.getWindGrid();
    if (!grid || !windTex || !deps.isTexDirty()) return;
    const pts = windPointsAtHour(grid, deps.getHourIndex());
    const cols = 8;
    const rows = 6;
    if (pts.length !== cols * rows) return;
    const enc = encodeWindGrid(pts, cols, rows);
    gl.bindTexture(gl.TEXTURE_2D, windTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      cols,
      rows,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      enc.data,
    );
    deps.markTexClean();
  }

  return {
    id: WIND_PARTICLES_LAYER_ID,
    type: 'custom',
    renderingMode: '2d',
    onAdd(_map: maplibregl.Map, gl: WebGLRenderingContext) {
      updateProg = link(gl, updateVs, updateFs);
      prog = link(gl, drawVs, drawFs);
      upd_aPos = gl.getAttribLocation(updateProg, 'a_pos');
      upd_uPos = gl.getUniformLocation(updateProg, 'u_pos');
      upd_uWind = gl.getUniformLocation(updateProg, 'u_wind');
      upd_uDt = gl.getUniformLocation(updateProg, 'u_dt');
      upd_uMax = gl.getUniformLocation(updateProg, 'u_max');
      drw_aIdx = gl.getAttribLocation(prog, 'a_index');
      drw_uPos = gl.getUniformLocation(prog, 'u_pos');
      drw_uWind = gl.getUniformLocation(prog, 'u_wind');
      drw_uSize = gl.getUniformLocation(prog, 'u_size');
      drw_uMax = gl.getUniformLocation(prog, 'u_max');
      drw_uPointSize = gl.getUniformLocation(prog, 'u_pointSize');
      const initial = initParticlePositions(PARTICLE_COUNT, 1234);
      const bytes = new Uint8Array(PARTICLE_COUNT * 4);
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        bytes[i * 4 + 0] = Math.round(initial[i * 4 + 0] * 255);
        bytes[i * 4 + 1] = Math.round(initial[i * 4 + 1] * 255);
        bytes[i * 4 + 2] = 0;
        bytes[i * 4 + 3] = 0;
      }
      function newTex(): WebGLTexture {
        const tx = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tx;
      }
      posTexA = newTex();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        PARTICLE_TEX_SIZE,
        PARTICLE_TEX_SIZE,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
      posTexB = newTex();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        PARTICLE_TEX_SIZE,
        PARTICLE_TEX_SIZE,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
      windTex = newTex();
      fbo = gl.createFramebuffer();
      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const idx = new Float32Array(PARTICLE_COUNT);
      for (let i = 0; i < PARTICLE_COUNT; i++) idx[i] = i;
      posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      ensureWindTex(gl);
      const tick = (): void => {
        map.triggerRepaint();
        raf = window.requestAnimationFrame(tick);
        deps.onTick?.(raf);
      };
      raf = window.requestAnimationFrame(tick);
      deps.onTick?.(raf);
    },
    onRemove(_map: maplibregl.Map, gl: WebGLRenderingContext) {
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      if (prog) gl.deleteProgram(prog);
      if (updateProg) gl.deleteProgram(updateProg);
      if (posTexA) gl.deleteTexture(posTexA);
      if (posTexB) gl.deleteTexture(posTexB);
      if (windTex) gl.deleteTexture(windTex);
      if (fbo) gl.deleteFramebuffer(fbo);
      if (posBuf) gl.deleteBuffer(posBuf);
      if (quadBuf) gl.deleteBuffer(quadBuf);
    },
    prerender(gl: WebGLRenderingContext) {
      if (!updateProg || !posTexA || !posTexB || !windTex || !fbo || !quadBuf)
        return;
      ensureWindTex(gl);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        posTexB,
        0,
      );
      gl.viewport(0, 0, PARTICLE_TEX_SIZE, PARTICLE_TEX_SIZE);
      gl.useProgram(updateProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(upd_aPos);
      gl.vertexAttribPointer(upd_aPos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, posTexA);
      gl.uniform1i(upd_uPos, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, windTex);
      gl.uniform1i(upd_uWind, 1);
      gl.uniform1f(upd_uDt, 0.016);
      gl.uniform1f(upd_uMax, MAX_WIND_MPS);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(upd_aPos);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const tmp = posTexA;
      posTexA = posTexB;
      posTexB = tmp;
    },
    render(gl: WebGLRenderingContext) {
      if (!prog || !posTexA || !windTex || !posBuf) return;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(drw_aIdx);
      gl.vertexAttribPointer(drw_aIdx, 1, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, posTexA);
      gl.uniform1i(drw_uPos, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, windTex);
      gl.uniform1i(drw_uWind, 1);
      gl.uniform1f(drw_uSize, PARTICLE_TEX_SIZE);
      gl.uniform1f(drw_uMax, MAX_WIND_MPS);
      gl.uniform1f(
        drw_uPointSize,
        3.5 * Math.min(window.devicePixelRatio || 1, 2),
      );
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
      gl.disableVertexAttribArray(drw_aIdx);
      gl.disable(gl.BLEND);
    },
  };
}
