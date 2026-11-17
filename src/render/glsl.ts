/**
 * GLSL shared by every material: one sky, one light, one way of finishing a pixel. The wet sand, the sea and the sky
 * dome all call the same sky function, which is why the flats mirror the sky exactly.
 */

/** The atmosphere integral. Keep the constants in step with src/world/atmosphere.ts. */
export const ATMOSPHERE_GLSL = /* glsl */ `
const float A_PI = 3.141592653589793;
const float A_PLANET = 6371e3;
const float A_TOP = 6471e3;
const vec3 A_RAYLEIGH = vec3(5.5e-6, 13.0e-6, 22.4e-6);
const float A_MIE = 21e-6;
const float A_HR = 8e3;
const float A_HM = 1.2e3;
const float A_G = 0.758;
const vec3 A_HAZE = vec3(0.020, 0.027, 0.038);

vec2 raySphere(vec3 r0, vec3 rd, float sr) {
  float b = 2.0 * dot(rd, r0);
  float c = dot(r0, r0) - sr * sr;
  float d = b * b - 4.0 * c;
  if (d < 0.0) return vec2(1e9, -1e9);
  float s = sqrt(d);
  return vec2((-b - s) * 0.5, (-b + s) * 0.5);
}

vec3 atmosphere(vec3 r, vec3 pSun, float iSun) {
  vec3 r0 = vec3(0.0, A_PLANET + 1.0, 0.0);
  vec2 p = raySphere(r0, r, A_TOP);
  if (p.x > p.y) return vec3(0.0);
  float ground = raySphere(r0, r, A_PLANET).x;
  if (ground > 0.0) p.y = min(p.y, ground);
  float iStep = p.y / 16.0;
  float iTime = 0.0;
  vec3 nearSun = vec3(0.0);
  vec3 totalR = vec3(0.0);
  vec3 totalM = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;
  float mu = dot(r, pSun);
  float mumu = mu * mu;
  float gg = A_G * A_G;
  float pR = 3.0 / (16.0 * A_PI) * (1.0 + mumu);
  float pM = 3.0 / (8.0 * A_PI) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * A_G, 1.5) * (2.0 + gg));
  for (int i = 0; i < 16; i++) {
    vec3 iPos = r0 + r * (iTime + iStep * 0.5);
    float iHeight = length(iPos) - A_PLANET;
    float sR = exp(-iHeight / A_HR) * iStep;
    float sM = exp(-iHeight / A_HM) * iStep;
    odR += sR;
    odM += sM;
    float jStep = raySphere(iPos, pSun, A_TOP).y / 8.0;
    float jTime = 0.0;
    float jR = 0.0;
    float jM = 0.0;
    for (int j = 0; j < 8; j++) {
      vec3 jPos = iPos + pSun * (jTime + jStep * 0.5);
      float jHeight = length(jPos) - A_PLANET;
      jR += exp(-jHeight / A_HR) * jStep;
      jM += exp(-jHeight / A_HM) * jStep;
      jTime += jStep;
    }
    vec3 attn = exp(-(A_MIE * (odM + jM) + A_RAYLEIGH * (odR + jR)));
    if (i == 0) nearSun = exp(-(A_MIE * jM + A_RAYLEIGH * jR));
    totalR += sR * attn;
    totalM += sM * attn;
    iTime += iStep;
  }
  // light scattered more than once, roughly: what the long path near the horizon removes comes back as pale haze
  vec3 lost = 1.0 - exp(-(A_MIE * odM + A_RAYLEIGH * odR));
  vec3 haze = nearSun * lost * A_HAZE;
  return iSun * (pR * A_RAYLEIGH * totalR + pM * A_MIE * totalM + haze);
}
`;

export const COMMON_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uKeyDir;
uniform vec3 uSunLight;
uniform vec3 uMoonLight;
uniform vec3 uCloudLight;
uniform vec3 uSunDisc;
uniform vec3 uMoonDisc;
uniform float uSunRadius;
uniform float uMoonRadius;
uniform float uStarGain;
uniform sampler2D uStarMap;
uniform sampler2D uSkyLUT;
uniform float uExposure;
uniform float uNight;
uniform mat3 uStarRot;
uniform float uCloudCover;
uniform vec2 uCloudOffset;
uniform float uTide;
uniform float uWetLine;
uniform sampler2D uGround;
uniform float uGroundSize;
uniform vec3 uLampPos[2];
uniform float uLampPower[2];
uniform float uFog;
uniform float uLogDepth;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform vec3 uHousePos;
uniform vec4 uHouseAxes;
uniform vec3 uHouseSize;

const float PI = 3.141592653589793;
const vec3 LAMP_COLOR = vec3(1.0, 0.55, 0.2);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.7;
    a *= 0.5;
  }
  return s;
}
float fbm3(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.7;
    a *= 0.5;
  }
  return s * 1.14;
}

// ---- sky -------------------------------------------------------------------------------------------------------

vec3 skyLUT(vec3 d) {
  vec2 uv = vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  return texture2D(uSkyLUT, uv).rgb;
}

float cloudAmount(vec3 d) {
  if (d.y < 0.01) return 0.0;
  vec2 p = d.xz / (d.y + 0.14) * 1.1 + uCloudOffset;
  float n = fbm(p) * 0.78 + fbm(p * 3.1 + 5.0) * 0.22;
  float th = mix(0.78, 0.36, uCloudCover);
  return smoothstep(th, th + 0.22, n) * smoothstep(0.01, 0.16, d.y);
}

/** Sky and clouds in direction d. 'through' is how much of what lies behind the clouds still shows. */
vec3 skyClouds(vec3 d, out float through) {
  vec3 sky = skyLUT(d);
  float c = cloudAmount(d) * 0.94;
  float toSun = max(dot(d, uSunDir), 0.0);
  float toMoon = max(dot(d, uMoonDir), 0.0);
  vec3 lit = uCloudLight * (0.28 + 1.3 * pow(toSun, 5.0)) + uMoonLight * (0.3 + 1.2 * pow(toMoon, 5.0));
  vec3 shade = skyLUT(vec3(0.0, 1.0, 0.0)) * 0.55 + skyLUT(normalize(vec3(d.x, 0.15, d.z))) * 0.25;
  through = 1.0 - c;
  return mix(sky, shade + lit, c);
}

// The real stars. The sky is cut into cells; uStarMap lists the stars of each cell (see starMap.ts), and a pixel
// draws the few stars of its own cell exactly where they are.
const vec3 GALAXY_POLE = vec3(-0.86766, -0.19811, 0.45598);
const vec3 GALAXY_CENTRE = vec3(-0.05487, -0.87344, -0.48383);

vec3 starTint(float bv) {
  vec3 blue = vec3(0.55, 0.7, 1.0);
  vec3 white = vec3(1.0, 0.98, 0.94);
  vec3 orange = vec3(1.0, 0.6, 0.3);
  return bv < 0.45 ? mix(blue, white, smoothstep(-0.3, 0.45, bv)) : mix(white, orange, smoothstep(0.45, 1.75, bv));
}

vec3 starField(vec3 d) {
  // (by day the gain is zero and none of this is worked out)
  if (uStarGain <= 0.0) return vec3(0.0);
  vec3 sd = uStarRot * d;
  // the angle one pixel covers: wider in a rippled reflection, where a star smears out and dims
  float px = length(fwidth(d));
  vec3 a = abs(sd);
  int face;
  vec2 uv;
  if (a.x >= a.y && a.x >= a.z) {
    face = sd.x > 0.0 ? 0 : 1;
    uv = sd.yz / a.x;
  } else if (a.y >= a.z) {
    face = sd.y > 0.0 ? 2 : 3;
    uv = sd.xz / a.y;
  } else {
    face = sd.z > 0.0 ? 4 : 5;
    uv = sd.xy / a.z;
  }
  ivec2 cell = ivec2(clamp(floor((uv * 0.5 + 0.5) * 64.0), 0.0, 63.0));
  float low = smoothstep(-0.01, 0.1, d.y);
  vec3 col = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    vec4 s = texelFetch(uStarMap, ivec2(face * 64 + cell.x, cell.y * 6 + k), 0);
    if (s.w <= 0.0) break;
    float e = fract(s.w) / 0.998;
    float bv = floor(s.w) / 63.0 * 2.4 - 0.4;
    // a brighter star looks larger; no star is drawn smaller than a pixel, but its light is the same spread thinner
    float size = 0.00042 * (1.0 + 2.2 * e);
    float wide = clamp(0.75 * px, size, 0.0025);
    float dist = length(sd - s.xyz);
    float q = dist * dist / (wide * wide);
    float g = (exp(-q) + 0.045 * e * exp(-q / 14.0)) * (size * size) / (wide * wide);
    // stars twinkle, more the nearer they are to the horizon
    float id = fract(s.x * 37.1 + s.y * 91.7 + s.z * 53.3);
    float tw = 1.0 - (0.1 + 0.35 * (1.0 - low)) * (0.5 + 0.5 * sin(uTime * (3.0 + 6.0 * id) + id * 60.0));
    col += starTint(bv) * (e * e) * g * tw;
  }
  // the Milky Way, where it lies: along the plane of the galaxy, widest and brightest toward its centre in
  // Sagittarius, with the dark lane that runs from the Swan down to the centre
  float lat = dot(sd, GALAXY_POLE);
  float toCentre = dot(sd, GALAXY_CENTRE);
  float width = mix(0.1, 0.19, smoothstep(-0.3, 0.9, toCentre));
  float band = exp(-lat * lat / (width * width));
  if (band > 0.02) {
    vec2 along = vec2(toCentre, dot(sd, cross(GALAXY_POLE, GALAXY_CENTRE)));
    float clouds = fbm(along * 9.0 + lat * 12.0 + 2.0);
    clouds = clouds * clouds * 2.4;
    float rift = smoothstep(0.0, 0.5, toCentre) * exp(-pow((lat + 0.015) / 0.035, 2.0)) * smoothstep(0.3, 0.55, fbm3(along * 6.0 + 1.7));
    vec3 glow = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.78), smoothstep(0.3, 1.0, toCentre) * 0.6);
    col += band * mix(0.3, 1.0, smoothstep(-0.6, 0.95, toCentre)) * (0.22 + clouds) * (1.0 - 0.8 * rift) * glow * 0.0034;
  }
  return col * uStarGain * low;
}

/** The moon's disc with its phase, and the stars behind it. */
vec3 moonAndStars(vec3 d) {
  vec3 c = vec3(0.0);
  float starMask = 1.0;
  if (dot(d, uMoonDir) > cos(uMoonRadius * 1.1)) {
    vec3 tx = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
    vec3 ty = cross(uMoonDir, tx);
    vec2 q = vec2(dot(d, tx), dot(d, ty)) / sin(uMoonRadius);
    float r2 = dot(q, q);
    if (r2 < 1.0) {
      vec3 n = q.x * tx + q.y * ty - sqrt(1.0 - r2) * uMoonDir;
      float ns = dot(n, uSunDir);
      float lit = smoothstep(-0.02, 0.1, ns) * (0.6 + 0.4 * max(ns, 0.0));
      float maria = 0.7 + 0.3 * smoothstep(0.3, 0.6, fbm(q * 1.9 + 3.7));
      float edge = smoothstep(1.0, 0.92, r2);
      c += uMoonDisc * (lit * maria + 0.01) * edge;
      starMask = 1.0 - edge;
    }
  }
  return c + starField(d) * starMask;
}

vec3 sunDisc(vec3 d) {
  float a = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  return uSunDisc * (smoothstep(uSunRadius, uSunRadius * 0.9, a) + 0.000004 / (a * a + 0.00006));
}

/** Everything overhead. */
vec3 skyAll(vec3 d) {
  float through;
  vec3 c = skyClouds(d, through);
  return c + (moonAndStars(d) + sunDisc(d)) * through;
}

// ---- light -----------------------------------------------------------------------------------------------------

float groundAt(vec2 xz) {
  return textureLod(uGround, xz / uGroundSize + 0.5, 0.0).r;
}

/** Shadow of the land itself on a point, from the brighter of sun and moon: 1 lit, 0 in shadow. */
float landShadow(vec3 p) {
  if (uKeyDir.y <= 0.001) return 0.0;
  float t = 1.2;
  float res = 1.0;
  for (int i = 0; i < 30; i++) {
    vec3 q = p + uKeyDir * t;
    float h = q.y - groundAt(q.xz);
    res = min(res, 12.0 * h / t);
    if (res <= 0.0) break;
    t += max(1.2, t * 0.17);
  }
  return clamp(res, 0.0, 1.0);
}

/** Shadow of built things (house, trees, stones, walls) on a point: 1 lit, 0 in shadow. */
float builtShadow(vec3 p, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 s = (uShadowMat * vec4(p, 1.0)).xyz;
  if (s.x < 0.004 || s.x > 0.996 || s.y < 0.004 || s.y > 0.996 || s.z > 1.0) return 1.0;
  // a surface the light only grazes needs more room, or it shadows itself
  float nl = max(dot(n, uKeyDir), 0.05);
  float bias = 0.00012 * (1.0 + min(sqrt(1.0 - nl * nl) / nl, 10.0));
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      sum += step(s.z - bias, textureLod(uShadowMap, s.xy + vec2(float(x), float(y)) * uShadowTexel * 1.2, 0.0).r);
    }
  }
  return sum / 9.0;
}

/** 1 inside the house, 0 outside. */
float indoors(vec3 p) {
  vec3 d = p - uHousePos;
  vec2 q = abs(vec2(dot(d.xz, uHouseAxes.xy), dot(d.xz, uHouseAxes.zw)));
  // the edge of 'indoors' lies inside the thickness of the walls, so no wall face sits on it
  return (1.0 - smoothstep(uHouseSize.x + 0.12, uHouseSize.x + 0.3, q.x)) * (1.0 - smoothstep(uHouseSize.y + 0.12, uHouseSize.y + 0.3, q.y)) * step(-0.5, d.y) * step(d.y, uHouseSize.z);
}

/** 1 under the open sky, less inside the house. */
float openSky(vec3 p) {
  return 1.0 - 0.42 * indoors(p);
}

vec3 skyAmbient(vec3 n) {
  vec3 zen = skyLUT(vec3(0.0, 1.0, 0.0));
  vec3 hor = skyLUT(normalize(vec3(n.x, 0.22, n.z + 0.0001)));
  // light thrown back up by the sunlit ground: it warms whatever faces down or sideways
  vec3 bounce = (uSunLight * max(uSunDir.y, 0.0) + uMoonLight * max(uMoonDir.y, 0.0)) * vec3(0.12, 0.115, 0.085);
  vec3 gnd = (zen + hor) * 0.1 + bounce;
  return mix(gnd, mix(hor, zen, 0.6), n.y * 0.5 + 0.5);
}

vec3 lampLight(vec3 wpos, vec3 n) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 L = uLampPos[i] - wpos;
    float d2 = dot(L, L);
    float nl = max(dot(n, L * inversesqrt(d2 + 1e-4)), 0.0) * 0.75 + 0.25;
    float fall = smoothstep(2500.0, 100.0, d2) / (1.0 + d2 * 0.3);
    s += LAMP_COLOR * uLampPower[i] * nl * fall;
  }
  return s;
}

/** Light leaving a matt surface. 'shadow' applies to the brighter of sun and moon. */
vec3 shade(vec3 albedo, vec3 n, vec3 wpos, float shadow) {
  // sun and moon come in by the door and the window, never above them: under the roof it is always shade
  shadow *= 1.0 - indoors(wpos) * smoothstep(1.9, 2.15, wpos.y - uHousePos.y);
  float sunUp = step(0.0005, dot(uSunLight, vec3(1.0)));
  vec3 direct = uSunLight * max(dot(n, uSunDir), 0.0) * mix(1.0, shadow, sunUp) + uMoonLight * max(dot(n, uMoonDir), 0.0) * mix(shadow, 1.0, sunUp);
  return albedo * (direct + skyAmbient(n) * openSky(wpos) + lampLight(wpos, n));
}

// ---- finishing -------------------------------------------------------------------------------------------------

vec3 fogged(vec3 col, vec3 wpos) {
  vec3 v = wpos - cameraPosition;
  float dist = length(v);
  float f = 1.0 - exp(-dist * uFog);
  vec3 fc = skyLUT(normalize(vec3(v.x, dist * 0.035 + 1.0, v.z)));
  return mix(col, fc, f);
}

vec3 finish(vec3 hdr) {
  vec3 c = hdr * uExposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l) * vec3(0.74, 0.92, 1.22), uNight * 0.5);
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
  c = pow(c, vec3(1.0 / 2.2));
  return c + (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
}
`;

/** Logarithmic depth, so a shoreline a kilometre away is as exact as one at your feet. */
export const LOGDEPTH_PARS_VERT = /* glsl */ `varying float vLogW;`;
export const LOGDEPTH_VERT = /* glsl */ `vLogW = 1.0 + gl_Position.w;`;
export const LOGDEPTH_PARS_FRAG = /* glsl */ `varying float vLogW;`;
export const LOGDEPTH_FRAG = /* glsl */ `gl_FragDepth = log2(max(vLogW, 1e-6)) * uLogDepth;`;
