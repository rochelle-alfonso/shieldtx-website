/* ShieldTX background — dithered shield shader (fixed behind the page).
   Source: ~/Downloads/dither-shield.html. Changes for the site: light mode on the
   page ground, shield placement per breakpoint, no controls, pauses off-screen. */
(() => {
  const VERTEX_SHADER = `#version 300 es
  void main() {
    vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
  }
  `;
  
  const FIELD_SHADER = `#version 300 es
  precision highp float;
  
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float uLightMode;
  uniform float uMorph;
  uniform vec2 uShieldCenter;   // shield centre, in units of canvas height
  uniform float uShieldScale;   // shield size (1.0 = original)
  uniform float uLineScale;     // shield size the line weights are tuned for (grows lines when zoomed)
  uniform float uAfter;         // 0 = shield scene, 1 = the quiet ambient field behind later sections
  uniform vec2 uAmbientCenter;  // where the ambient field gathers (bottom right)
  uniform float uAmbientZoom;   // < 1 spreads the ambient field wider (tighter on narrow screens)
  // Step graphics over .helps__visual — up to two at once during a handoff.
  // uGfxN = (centre x, centre y, scale, alpha); uGfxNInfo = (kind, appear)
  // kind 0 = wallet, 1 = shield, 2 = stack of wallets, 3 = bar chart
  uniform vec4 uGfxA;
  uniform vec2 uGfxAInfo;
  uniform vec4 uGfxB;
  uniform vec2 uGfxBInfo;
  uniform vec3 uDarkBackground;
  uniform vec3 uLightBackground;
  out vec4 fragColor;
  
  const float HUE = 0.675;          // 0.675 = blue (was 0.75 violet)
  const float HUE_SPREAD = 0.0345983915;
  const float HUE_TRAVEL = 2.13467026;
  const float CHROMA = 0.19;
  const float LIGHTNESS = 0.610733986;
  const float COLOUR_CYCLE = 0.172102034;
  const float THETA = 2.11476326;
  const float SHEAR = 0.970108986;
  const float SHRINK = 0.958995402;
  const float LAYERS = 89.0;
  const float WARP_FREQ_X = 0.545764089;
  const float WARP_FREQ_Y = 2.04452133;
  const float WARP_AMP_X = 0.14922668;
  const float WARP_AMP_Y = 0.0252230503;
  const float ASPECT_X = 2.55997324;
  const float ASPECT_Y = 0.134395227;
  const float OFFSET_X = 0.380216628;
  const float OFFSET_Y = -0.00688662054;
  const float TILT = 1.90862358;
  const float ZOOM = 1.10279596;
  const float CENTRE_X = -0.429505587;
  const float CENTRE_Y = -0.371106058;
  const float GLOW_SIZE = 0.00194646465;
  const float FALLOFF = 0.270416111;
  const float VIGNETTE = 0.0285886582;
  const float FLOW_SPEED = 0.379173398;
  const float FLOW_DIRECTION = 1.0;
  const float BREATH_RATE = 0.353896827;
  const float BREATH_AMOUNT = 0.075651288;
  const float PHASE = 21.9168777;
  const float ECHO = 0.0;
  const float ECHO_SHIFT = -0.13534914;
  const float SOFTNESS = 0.00126428448;
  const float LIGHT_SWING = 0.291902989;
  
  const float TAU = 6.28318530718;
const vec2 FLOW_FOCUS = vec2(-0.36, -0.28); // centre of the flow's arch, in field space
const float AMBIENT_STRENGTH = 0.42; // how much light the ambient field keeps
const float AMBIENT_HUE_SHIFT = 0.05; // nudges the ambient from cyan toward periwinkle
  
  vec3 oklchToLinear(float L, float C, float h) {
    float a = C * cos(h), b = C * sin(h);
    float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    vec3 lms = vec3(l_, m_, s_);
    lms = lms * lms * lms;
    return mat3(4.0767416621, -1.2684380046, -0.0041960863,
                -3.3077115913, 2.6097574011, -0.7034186147,
                0.2309699292, -0.3413193965, 1.7076147010) * lms;
  }
  
  float blueNoise(vec2 p, float frame) {
    p += 5.588238 * mod(frame, 64.0);
    return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
  }
  
  // Shield outline: negative inside, positive outside.
  const float SHIELD_W = 0.34;
  const float SHIELD_TOP = 0.40;
  const float SHIELD_DIP = 0.035;
  const float SHIELD_SHOULDER = 0.08;
  const float SHIELD_TIP = -0.46;
  
  float shield(vec2 p) {
    float x = abs(p.x);
    float n = clamp(x / SHIELD_W, 0.0, 1.0);
    float top = SHIELD_TOP - SHIELD_DIP * (1.0 - n * n);
    float s = clamp((SHIELD_SHOULDER - p.y) / (SHIELD_SHOULDER - SHIELD_TIP), 0.0, 1.0);
    float halfWidth = SHIELD_W * (1.0 - s * s);
    return max(max((x - halfWidth) * 0.8, p.y - top), SHIELD_TIP - p.y);
  }
  
  const float CONTOURS = 44.0;     // number of nested light lines
  const float DEPTH = 0.8;         // how far the contours reach toward the centre
  const float LINE_GLOW = 0.000013;
  const float LINE_SOFT = 0.000022;
  const float SWEEP = 0.9;         // strength of the moving diagonal highlight
  
  // The original flowing field (linear colour, before tone mapping).
  vec3 flowField(vec2 pos, float t, float breath, float hue0, float hue1) {
    vec2 u = (pos - vec2(CENTRE_X, CENTRE_Y)) * (ZOOM - breath * BREATH_AMOUNT);
    float ct = cos(TILT), st = sin(TILT);
    u = mat2(ct, st, -st, ct) * u;
    mat2 fold = mat2(cos(THETA), sin(THETA), -SHEAR, cos(THETA));
    vec3 color = vec3(0.0);
    for (float i = 1.0; i <= 96.0; i += 1.0) {
      if (i > LAYERS) break;
      u.x += -sin(u.y * WARP_FREQ_X + t + i * 0.007) * WARP_AMP_X;
      u.y += -sin(u.x * WARP_FREQ_Y - t + i * 0.02) * WARP_AMP_Y;
      u = fold * u * SHRINK;
      vec2 q = u - vec2(OFFSET_X + breath * 0.1, OFFSET_Y);
      vec2 s = vec2(q.x * ASPECT_X, q.y * ASPECT_Y);
      float glow = GLOW_SIZE / (dot(s, s) + SOFTNESS);
      glow *= 0.25 + breath * 0.4;
      float r = length(u);
      float k = sin(i * COLOUR_CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
      vec3 tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), 0.0, 1.0);
      color += glow * tint * exp2(-r * FALLOFF);
    }
    return color;
  }
  
  // The glowing shield (linear colour, before tone mapping).
  vec3 shieldField(vec2 p, float t, float breath, float hue0, float hue1) {
    vec3 color = vec3(0.0);
    float sweep = 0.5 + 0.5 * sin(dot(p, vec2(0.8, 1.3)) * 3.2 - t * 1.1);
    sweep = mix(1.0 - SWEEP * 0.6, 1.0 + SWEEP, sweep * sweep);
    for (float i = 0.0; i < 64.0; i += 1.0) {
      if (i >= CONTOURS) break;
      float f = i / CONTOURS;
      vec2 q = p;
      q.x += sin(q.y * 5.0 + t + i * 0.13) * 0.010 * f;
      q.y += sin(q.x * 6.0 - t * 0.8 + i * 0.09) * 0.008 * f;
      float scale = 1.0 - f * DEPTH;
      float d = shield(q / scale) * scale * uLineScale;
      float glow = LINE_GLOW / (d * d + LINE_SOFT);
      glow *= pow(1.0 - f, 1.6) * 1.3 * (0.55 + breath * 0.45);
      float r = length(q);
      float k = sin(i * COLOUR_CYCLE * 1.4 + t * 1.2 + r * HUE_TRAVEL * 2.0) * 0.5 + 0.5;
      vec3 tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), 0.0, 1.0);
      color += glow * tint;
    }
    float sd = shield(p) * uLineScale;
    float body = 1.0 - smoothstep(-0.02, 0.004, sd);
    float depthFade = smoothstep(-0.25, 0.0, sd);
    color += body * (0.06 + 0.10 * depthFade) * oklchToLinear(LIGHTNESS, CHROMA, hue0);
    color *= sweep;
    color += exp(-max(sd, 0.0) * 38.0) * 0.05 * oklchToLinear(LIGHTNESS + 0.1, CHROMA, hue1);
    return color;
  }
  
  // ---- Dither wallet (from dither-wallet-light.html) --------------------------
  const float WALLET_INTENSITY = 0.5;  // light mode: lower = more white
  const float WALLET_CUTOFF = 0.035;   // light mode: faint areas drop to the ground
  const vec2 BODY_SIZE = vec2(0.42, 0.28);   // half-size of the wallet body
  const float BODY_RADIUS = 0.07;
  const vec2 CLASP_CENTRE = vec2(0.37, -0.01);
  const vec2 CLASP_SIZE = vec2(0.13, 0.085); // half-size of the clasp tab
  const float CLASP_RADIUS = 0.045;
  const vec2 BUTTON_CENTRE = vec2(0.41, -0.01);
  const float BUTTON_RADIUS = 0.026;

  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // Wallet outline: negative inside, positive outside.
  float wallet(vec2 p) {
    p.x += 0.04; // keep the whole wallet (with its clasp) centred
    float body = roundBox(p, BODY_SIZE, BODY_RADIUS);
    float clasp = roundBox(p - CLASP_CENTRE, CLASP_SIZE, CLASP_RADIUS);
    return smin(body, clasp, 0.02);
  }

  // Shield from dither-shield-light.html: the hero outline drawn smaller.
  const float SMALL_SHIELD = 1.3; // bigger = smaller shield
  float smallShield(vec2 p) { return shield(p * SMALL_SHIELD) / SMALL_SHIELD; }

  float walletButton(vec2 p) {
    p.x += 0.04;
    return length(p - BUTTON_CENTRE) - BUTTON_RADIUS;
  }

  // One glowing outline (linear colour, before tone mapping). kind 0 = wallet, 1 = shield.
  // ap = how far it has formed (0..1), phase = its own float rhythm.
  vec3 walletLayer(vec2 p, float kind, float t, float breath, float hue0, float hue1, float ap, float phase) {
    // Gentle float and tilt so it feels alive.
    p.y -= sin(t * 0.9 + phase) * 0.012;
    float tilt = sin(t * 0.6 + phase * 0.7) * 0.03;
    p = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * p;
    // Appear: settles from slightly larger, outer edge first, then the layers fill inward.
    p *= mix(0.95, 1.0, ap);
    vec3 color = vec3(0.0);
    if (kind < 0.5) {
      float bd = walletButton(p);
      color += (LINE_GLOW * 5.0 / (bd * bd + LINE_SOFT)) * (0.6 + 0.4 * breath) * smoothstep(0.55, 1.0, ap) * oklchToLinear(LIGHTNESS + LIGHT_SWING, CHROMA * 0.8, hue1);
    }
    float sweep = 0.5 + 0.5 * sin(dot(p, vec2(0.8, 1.3)) * 3.2 - t * 1.1);
    sweep = mix(1.0 - SWEEP * 0.6, 1.0 + SWEEP, sweep * sweep);
    for (float i = 0.0; i < 64.0; i += 1.0) {
      if (i >= CONTOURS) break;
      float f = i / CONTOURS;
      vec2 q = p;
      q.x += sin(q.y * 5.0 + t + i * 0.13) * 0.010 * f;
      q.y += sin(q.x * 6.0 - t * 0.8 + i * 0.09) * 0.008 * f;
      float scale = 1.0 - f * DEPTH;
      vec2 qs = q / scale;
      float d = (kind < 0.5 ? wallet(qs) : smallShield(qs)) * scale;
      float glow = LINE_GLOW / (d * d + LINE_SOFT);
      glow *= pow(1.0 - f, 1.6) * 1.3 * (0.55 + breath * 0.45);
      glow *= smoothstep(f * 0.6, f * 0.6 + 0.4, ap);
      float r = length(q);
      float k = sin(i * COLOUR_CYCLE * 1.4 + t * 1.2 + r * HUE_TRAVEL * 2.0) * 0.5 + 0.5;
      vec3 tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), 0.0, 1.0);
      color += glow * tint;
    }
    float sd = kind < 0.5 ? wallet(p) : smallShield(p);
    float body = 1.0 - smoothstep(-0.02, 0.004, sd);
    float depthFade = smoothstep(-0.25, 0.0, sd);
    color += body * (0.06 + 0.10 * depthFade) * oklchToLinear(LIGHTNESS, CHROMA, hue0);
    color *= sweep;
    color += exp(-max(sd, 0.0) * 38.0) * 0.05 * oklchToLinear(LIGHTNESS + 0.1, CHROMA, hue1);
    return color * smoothstep(0.0, 0.35, ap);
  }

  // ---- Stack of wallets (from dither-wallets-light.html) ----------------------
  const float STACK_SCALE = 1.4;                   // bigger = smaller wallets
  const vec2 OFFSET_FRONT = vec2(0.03, -0.07);
  const vec2 OFFSET_MID   = vec2(-0.01, 0.02);
  const vec2 OFFSET_BACK  = vec2(-0.04, 0.09);
  const float SHRINK_MID  = 0.86;                  // size of the middle wallet vs the front one
  const float SHRINK_BACK = 0.74;                  // size of the back wallet vs the front one
  const float STAGGER = 0.28;                      // delay between wallets forming (fraction of the appear time)

  float formed(float i, float ap) {
    return clamp((ap * (1.0 + 2.0 * STAGGER) - i * STAGGER), 0.0, 1.0);
  }
  float insideOf(vec2 p) {
    return 1.0 - smoothstep(-0.015, 0.02, wallet(p));
  }
  float stackShape(vec2 p) {
    float b = wallet((p - OFFSET_BACK) * STACK_SCALE / SHRINK_BACK) * SHRINK_BACK / STACK_SCALE;
    float m = wallet((p - OFFSET_MID) * STACK_SCALE / SHRINK_MID) * SHRINK_MID / STACK_SCALE;
    float f = wallet((p - OFFSET_FRONT) * STACK_SCALE) / STACK_SCALE;
    return min(b, min(m, f));
  }
  vec3 stackField(vec2 p, float t, float breath, float hue0, float hue1, float ap) {
    vec2 pb = (p - OFFSET_BACK) * STACK_SCALE / SHRINK_BACK;
    vec2 pm = (p - OFFSET_MID) * STACK_SCALE / SHRINK_MID;
    vec2 pf = (p - OFFSET_FRONT) * STACK_SCALE;
    float ab = formed(0.0, ap), am = formed(1.0, ap), af = formed(2.0, ap);

    vec3 back  = walletLayer(pb, 0.0, t, breath, hue0, hue1, ab, 0.0) * 0.55;
    vec3 mid   = walletLayer(pm, 0.0, t, breath, hue0, hue1, am, 2.1) * 0.78;
    vec3 front = walletLayer(pf, 0.0, t, breath, hue0, hue1, af, 4.2);

    // Front wallets cover the ones behind them.
    float mMid = insideOf(pm) * smoothstep(0.0, 0.4, am);
    float mFront = insideOf(pf) * smoothstep(0.0, 0.4, af);
    vec3 color = back;
    color = color * (1.0 - 0.88 * mMid) + mid;
    color = color * (1.0 - 0.88 * mFront) + front;
    return color;
  }

  // ---- Bar chart (from dither-bars-light.html) --------------------------------
  const float BAR_W = 0.078;                         // half-width of each bar
  const float BAR_RADIUS = 0.034;                    // corner rounding
  const float BAR_SPACING = 0.205;                   // distance between bar centres
  const float BASE_Y = -0.25;                        // baseline the bars grow from
  const vec4 BAR_H = vec4(0.10, 0.17, 0.13, 0.24);   // half-heights of the four bars
  const float LIVE = 0.05;                           // how much the bars rise and fall once formed
  const float BAR_STAGGER = 0.22;                    // delay between bars growing
  const float BAR_GLOW = 0.55;                       // glow strength of the bars (lower = more white)

  float barX(float i) { return (i - 1.5) * BAR_SPACING; }
  float barBox(vec2 p, float h) {
    float r = min(BAR_RADIUS, max(h, 0.001));
    return roundBox(p, vec2(BAR_W, max(h, 0.001)), r);
  }
  // Union of the bars at full height (plus the baseline).
  float barsShape(vec2 p) {
    float d = roundBox(p - vec2(0.0, BASE_Y - 0.035), vec2(0.40, 0.002), 0.002);
    for (int i = 0; i < 4; i++) {
      float h = BAR_H[i] * (1.0 + LIVE);
      d = min(d, barBox(p - vec2(barX(float(i)), BASE_Y + h), h));
    }
    return d;
  }
  // One glowing bar. q0 is relative to the bar's centre, h its current half-height.
  vec3 barLayer(vec2 q0, float h, float t, float breath, float hue0, float hue1, float ap) {
    vec3 color = vec3(0.0);
    float sweep = 0.5 + 0.5 * sin(dot(q0, vec2(0.8, 1.3)) * 3.2 - t * 1.1);
    sweep = mix(1.0 - SWEEP * 0.6, 1.0 + SWEEP, sweep * sweep);
    for (float i = 0.0; i < 64.0; i += 1.0) {
      if (i >= CONTOURS) break;
      float f = i / CONTOURS;
      vec2 q = q0;
      q.x += sin(q.y * 9.0 + t + i * 0.13) * 0.006 * f;
      q.y += sin(q.x * 10.0 - t * 0.8 + i * 0.09) * 0.005 * f;
      float scale = 1.0 - f * DEPTH;
      float d = barBox(q / scale, h) * scale;
      float glow = BAR_GLOW * LINE_GLOW / (d * d + LINE_SOFT);
      glow *= pow(1.0 - f, 2.2) * 1.3 * (0.55 + breath * 0.45);
      glow *= smoothstep(f * 0.6, f * 0.6 + 0.4, ap);
      float r = length(q);
      float k = sin(i * COLOUR_CYCLE * 1.4 + t * 1.2 + r * HUE_TRAVEL * 2.0) * 0.5 + 0.5;
      vec3 tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), 0.0, 1.0);
      color += glow * tint;
    }
    float sd = barBox(q0, h);
    float body = 1.0 - smoothstep(-0.02, 0.004, sd);
    color += body * 0.10 * oklchToLinear(LIGHTNESS, CHROMA, hue0);
    color *= sweep;
    color += exp(-max(sd, 0.0) * 38.0) * 0.05 * oklchToLinear(LIGHTNESS + 0.1, CHROMA, hue1);
    return color * smoothstep(0.0, 0.3, ap);
  }
  vec3 barsField(vec2 p, float t, float breath, float hue0, float hue1, float appear) {
    p.y -= sin(t * 0.9) * 0.008; // whole chart floats very slightly
    vec3 color = vec3(0.0);
    // Faint baseline that draws out first.
    float gb = smoothstep(0.0, 0.25, appear);
    float bd = roundBox(p - vec2(0.0, BASE_Y - 0.035), vec2(0.40 * gb + 0.001, 0.002), 0.002);
    color += LINE_GLOW * 0.7 / (bd * bd + LINE_SOFT) * gb * oklchToLinear(LIGHTNESS, CHROMA * 0.7, hue0);
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float ap = clamp(appear * (1.0 + 3.0 * BAR_STAGGER) - fi * BAR_STAGGER, 0.0, 1.0);
      float grow = 1.0 - pow(1.0 - ap, 3.0);                         // ease-out growth
      float live = 1.0 + LIVE * sin(t * 0.9 + fi * 1.7) * smoothstep(0.8, 1.0, ap);
      float h = BAR_H[i] * max(grow, 0.02) * live;
      color += barLayer(p - vec2(barX(fi), BASE_Y + h), h, t, breath, hue0, hue1, ap);
    }
    return color;
  }

  float graphicShape(vec2 p, float kind) {
    return kind < 0.5 ? wallet(p) : kind < 1.5 ? smallShield(p) : kind < 2.5 ? stackShape(p) : barsShape(p);
  }
  vec3 graphicField(vec2 p, float kind, float t, float breath, float hue0, float hue1, float ap) {
    if (kind < 1.5) return walletLayer(p, kind, t, breath, hue0, hue1, ap, 0.0);
    if (kind < 2.5) return stackField(p, t, breath, hue0, hue1, ap);
    return barsField(p, t, breath, hue0, hue1, ap);
  }

  vec3 toneMap(vec3 c) {
    vec3 x = max(c, 0.0);
    c = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    return pow(clamp(c, 0.0, 1.0), vec3(0.85, 0.92, 0.98));
  }

  // Lay a step graphic over the ambient: clear the ground behind it, then screen it on.
  vec3 layStepGraphic(vec3 color, vec2 pos, vec4 g, vec2 info, float grow, float t, float breath, float hue0, float hue1) {
    vec2 wp = (pos - g.xy) / g.z * grow;
    float wd = graphicShape(wp, info.x);
    if (wd > 0.4) return color;
    vec3 w = graphicField(wp, info.x, t, breath, hue0, hue1, clamp(info.y, 0.0, 1.0)) * WALLET_INTENSITY;
    w = toneMap(max(w - WALLET_CUTOFF, 0.0)) * g.w * uAfter;
    color *= mix(1.0, smoothstep(-0.02, 0.18, wd), clamp(info.y, 0.0, 1.0) * g.w);
    return 1.0 - (1.0 - color) * (1.0 - w);
  }

  // The hero scene: flow field condensing into the shield, tone mapped.
  vec3 shieldScene(vec2 pos, vec2 p, float m, float local, float t, float breath, float hue0, float hue1) {
    vec3 color = vec3(0.0);
    if (local < 0.999) {
      // The flowing field is pulled in and twisted toward the shield as it goes.
      float pull = m * m;
      float a = pull * 1.3;
      // Anchor the flow's hollow (FLOW_FOCUS) on the shield so the opening graphic
      // sits where the shield will form, then pull and twist around that point.
      vec2 fp = FLOW_FOCUS + mat2(cos(a), sin(a), -sin(a), cos(a)) * (pos - uShieldCenter) * mix(1.0, 2.4, pull);
      color += flowField(fp, t + pull * 2.0, breath, hue0, hue1) * (1.0 - local);
    }
    if (local > 0.001) {
      color += shieldField(p, t, breath, hue0, hue1) * local;
    }
    color = toneMap(color);
    // Keep the page ground exactly #F5F5F0: drop the faint haze the glow leaves
    // across the whole canvas, keeping only the visible light.
    return color * smoothstep(0.03, 0.14, max(color.r, max(color.g, color.b)));
  }

  void main() {
    vec2 R = iResolution.xy;
    vec2 pos = (gl_FragCoord.xy - 0.5 * R) / R.y;
    float t = iTime * FLOW_SPEED * FLOW_DIRECTION + PHASE;
    float breath = (-sin(iTime * BREATH_RATE * 1.5) + sin(iTime * BREATH_RATE + 1.0)) * 0.25 + 0.5;
    float hue0 = HUE * TAU;
    float hue1 = hue0 + HUE_SPREAD * TAU;
    float m = clamp(uMorph, 0.0, 1.0);
  
    // Shield space: it condenses from slightly larger down onto its final outline.
    vec2 sp = (pos - uShieldCenter) / uShieldScale;
    vec2 p = sp * (1.0 + breath * BREATH_AMOUNT * 0.4) * mix(0.7, 1.0, smoothstep(0.0, 1.0, m));
  
    // Where the shield has formed so far: the outline appears first, then the light spreads in and out from it.
    float edgeDist = clamp(abs(shield(p)) * 3.2, 0.0, 1.0);
    float wobble = sin(atan(p.y, p.x) * 5.0 + t * 2.0) * 0.06;
    float local = smoothstep(edgeDist * 0.55 + wobble, edgeDist * 0.55 + wobble + 0.45, m);
  
    vec3 color = vec3(0.0);
    if (uAfter < 0.999) {
      color = shieldScene(pos, p, m, local, t, breath, hue0, hue1);
    }
    if (uAfter > 0.001) {
      // Ambient: a slow, faint pass of the same flow gathered in the bottom-right corner.
      vec2 ap = FLOW_FOCUS + (pos - uAmbientCenter) * uAmbientZoom;
      float shift = AMBIENT_HUE_SHIFT * TAU;
      vec3 ambient = toneMap(flowField(ap, t * 0.6, breath, hue0 + shift, hue1 + shift));
      // Clear the haze so empty areas stay on the #F5F5F0 ground.
      ambient *= smoothstep(0.05, 0.22, max(ambient.r, max(ambient.g, ambient.b))) * AMBIENT_STRENGTH;
      color = mix(color, ambient, uAfter);

      // Step graphics, each only near its outline (the glow is negligible further out).
      float grow = 1.0 + breath * BREATH_AMOUNT * 0.4;
      if (uGfxA.w > 0.001 && uGfxAInfo.y > 0.001) color = layStepGraphic(color, pos, uGfxA, uGfxAInfo, grow, t, breath, hue0, hue1);
      if (uGfxB.w > 0.001 && uGfxBInfo.y > 0.001) color = layStepGraphic(color, pos, uGfxB, uGfxBInfo, grow, t, breath, hue0, hue1);
    }

    vec3 dark = uDarkBackground + color * (1.0 - uDarkBackground);
    float strength = max(color.r, max(color.g, color.b));
    vec3 light = uLightBackground * (1.0 - strength) + color * 0.96;
    color = mix(dark, light, uLightMode);
  
    color += (blueNoise(gl_FragCoord.xy, floor(iTime * 24.0)) - 0.5) / 255.0;
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
  `;
  
  const DITHER_SHADER = `#version 300 es
  precision highp float;
  
  uniform sampler2D tScene;
  uniform vec2 iResolution;
  uniform float uLightMode;
  uniform vec3 uDarkBackground;
  uniform vec3 uLightBackground;
  uniform float uPixelRatio;
  uniform float uCell;          // dither cell multiplier (dots grow as we zoom in)
  out vec4 fragColor;
  
  const float uStrength = 1.08359063;
  const float uScale = 0.871710658;
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  
  vec3 toInk(vec3 c) { return mix(c - uDarkBackground, uLightBackground - c, uLightMode); }
  vec3 fromInk(vec3 ink) { return mix(uDarkBackground + ink, uLightBackground - ink, uLightMode); }
  vec3 sceneInk(vec2 uv) { return toInk(texture(tScene, clamp(uv, 0.0, 1.0)).rgb); }
  
  const mat4 BAYER = mat4(
    0.94118, 0.29412, 0.76471, 0.05882,
    0.47059, 0.70588, 0.23529, 0.52941,
    0.82353, 0.11765, 0.88235, 0.17647,
    0.35294, 0.58824, 0.41176, 0.64706
  );
  
  vec3 dither(vec2 frag) {
    float cell = max(2.0, floor(uScale * 2.2 * uPixelRatio * uCell + 0.5));
    vec2 grid = floor(frag / cell);
    vec3 soft = sceneInk(frag / iResolution);
    vec3 ink = sceneInk((grid + 0.5) * cell / iResolution);
    float level = dot(ink, LUMA);
    float levels = 8.0;
    ivec2 b = ivec2(mod(grid, 4.0));
    float v = pow(max(level, 0.0), 0.8) * levels + BAYER[b.x][b.y];
    float quantised = pow(floor(v) / levels, 1.25);
    vec3 dithered = ink * (quantised / max(level, 1e-4));
    float presence = smoothstep(0.03, 0.14, level) * (0.38 + 0.2 * uStrength);
    return mix(soft, dithered, presence);
  }
  
  void main() {
    vec3 ink = dither(gl_FragCoord.xy);
    fragColor = vec4(clamp(fromInk(clamp(ink, 0.0, 1.0)), 0.0, 1.0), 1.0);
  }
  `;
  
  const LIGHT_BG = "#f5f5f0"; // page ground (--ground)
  const DARK_BG = "#090909";
  const MORPH_SECONDS = 2.6;
  const MORPH_DELAY = 1.8;    // seconds before the shield forms

  // Fit the shield into the free space beside the headline (wide screens) or above
  // it (narrow). Returned in shader units: canvas height, measured from the centre, y up.
  const SHIELD_BOX = { w: 0.68, h: 0.86, cy: -0.03 }; // outline bounds at scale 1
  const MAX_SCALE = 1.0;
  const ZOOM_FILL = 1.3;      // zoomed shield width ÷ viewport width
  const ZOOM_LIFT = 0.02;     // nudges the zoomed shield up (+) or down (−) behind the heading
  const ZOOM_DOTS = 2.2;      // dither dots at full zoom (× rest size)
  const THROUGH = 3.5;        // extra zoom while flying through the shield into the next section
  const AMBIENT_ZOOM = 0.55;  // < 1 spreads the ambient field wider
  const WALLET_BOX = { w: 0.92, h: 0.56, top: 0.28 };  // wallet outline bounds at scale 1 (clasp included)
  const WALLET_APPEAR = 3.5, WALLET_DELAY = 0.3; // seconds
  const STEP_SHIELD_BOX = { w: 0.68 / 1.3, top: 0.40 / 1.3 }; // step shield bounds at scale 1
  const STEP_SHIELD_SIZE = 0.85;  // × the wallet's width
  const STEP_SHIELD_LIFT = 0.18;  // × slot height it sits above the wallet's top edge
  const STACK_BOX = { w: 0.64, cx: 0.038, top: 0.238 }; // wallet stack bounds at scale 1
  const STACK_SIZE = 0.9;         // × the wallet's width
  const STACK_LIFT = 0.12;        // × slot height it sits above the wallet's top edge
  const BARS_BOX = { w: 0.80, h: 0.54, bottom: -0.25 - 0.037 }; // bar chart size and baseline (below centre) at scale 1
  const BARS_SIZE = 0.8;          // × the wallet's width
  const BARS_BOTTOM = 0.1;        // baseline, × screen height up from the bottom
  function measurePlacement(hero) {
    const W = hero.clientWidth, H = hero.clientHeight;
    const titleEl = hero.querySelector(".hero__title");
    const contentEl = hero.querySelector(".hero__content");
    const title = { left: titleEl.offsetLeft, right: titleEl.offsetLeft + titleEl.offsetWidth, bottom: titleEl.offsetTop + titleEl.offsetHeight };
    const content = { left: contentEl.offsetLeft, top: contentEl.offsetTop, bottom: contentEl.offsetTop + contentEl.offsetHeight };
    const gutter = content.left;
    const top = document.querySelector(".header").offsetHeight + 16;

    const fit = (x0, x1, y0, y1, room = 1) => {
      const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
      const scale = Math.min(w / SHIELD_BOX.w, h / SHIELD_BOX.h) / H * room;
      return { scale: Math.min(scale, MAX_SCALE), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    // beside: right of the title, down to the bottom of the copy
    const side = fit(title.right + 40, W - gutter / 2, top, content.bottom);
    // above: full width, down to the top of the copy
    const above = fit(gutter, W - gutter, top, content.top - 12, 0.9); // room for the glow
    const b = side.scale >= above.scale ? side : above;
    return {
      x: (b.cx - W / 2) / H,
      y: (H / 2 - b.cy) / H - SHIELD_BOX.cy * b.scale,
      scale: Math.max(b.scale, 0.2),
    };
  }

  // Scrolled-in view: the shield centred and large enough that its inside fills the screen.
  function zoomPlacement(hero) {
    const aspect = hero.clientWidth / hero.clientHeight;
    const scale = Math.max(ZOOM_FILL * aspect / SHIELD_BOX.w, 1.25 / SHIELD_BOX.h);
    return { x: 0, y: -SHIELD_BOX.cy * scale + ZOOM_LIFT * scale, scale };
  }

  const smooth = t => t * t * (3 - 2 * t);
  const clamp01 = t => Math.min(1, Math.max(0, t));

  function parseHex(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255);
  }

  function compile(gl, fragSrc) {
    const program = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERTEX_SHADER], [gl.FRAGMENT_SHADER, fragSrc]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(program, s);
      gl.deleteShader(s);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  }

  function uniforms(gl, program, names) {
    return Object.fromEntries(names.map(n => [n, gl.getUniformLocation(program, n)]));
  }

  function start(canvas, hero) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error("WebGL2 is not available.");
    const dark = parseHex(DARK_BG), light = parseHex(LIGHT_BG);

    const field = compile(gl, FIELD_SHADER);
    const fieldU = uniforms(gl, field, ["iResolution", "iTime", "uLightMode", "uMorph", "uShieldCenter", "uShieldScale", "uLineScale", "uAfter", "uAmbientCenter", "uAmbientZoom", "uGfxA", "uGfxAInfo", "uGfxB", "uGfxBInfo", "uDarkBackground", "uLightBackground"]);
    const post = compile(gl, DITHER_SHADER);
    const postU = uniforms(gl, post, ["tScene", "iResolution", "uLightMode", "uDarkBackground", "uLightBackground", "uPixelRatio", "uCell"]);

    const fb = gl.createFramebuffer();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let texW = 0, texH = 0;

    const maxDim = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    // The field loops 89 times per pixel; phones get a smaller pixel budget.
    const maxPixels = matchMedia("(max-width: 720px)").matches ? 1200000 : 2400000;

    let elapsed = 0, previous = null, visible = true, ready = false;
    let morphProgress = reduceMotion.matches ? 1 : 0;
    let zoom = 0, after = 0, walletClock = 0, stepPos = 0;
    const graphics = window.ShieldTXSteps ? window.ShieldTXSteps.graphics : ["wallet"];
    const walletSlot = document.querySelector(".helps__visual");
    const stepsList = document.querySelector(".steps");
    let place = measurePlacement(hero);
    const remeasure = () => { place = measurePlacement(hero); };
    new ResizeObserver(remeasure).observe(hero);
    if (document.fonts) document.fonts.ready.then(remeasure);

    function fit() {
      const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
      const scale = Math.min(devicePixelRatio || 1, 2, Math.sqrt(maxPixels / (w0 * h0)), maxDim / w0, maxDim / h0);
      const w = Math.max(1, Math.floor(w0 * scale)), h = Math.max(1, Math.floor(h0 * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      return w / w0;
    }

    function setFrame(u, time) {
      gl.uniform2f(u.iResolution, canvas.width, canvas.height);
      if (u.iTime) gl.uniform1f(u.iTime, time);
      gl.uniform1f(u.uLightMode, 1);
      gl.uniform3fv(u.uDarkBackground, dark);
      gl.uniform3fv(u.uLightBackground, light);
    }

    function draw(time, pixelRatio) {
      const { width, height } = canvas;
      gl.viewport(0, 0, width, height);
      if (texW !== width || texH !== height) {
        texW = width; texH = height;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.useProgram(field);
      setFrame(fieldU, time);
      const e = morphProgress;
      gl.uniform1f(fieldU.uMorph, e * e * (3 - 2 * e));
      // Scroll zoom: ease the rest placement into the zoomed one. Scale moves
      // geometrically so the zoom speed feels constant.
      const z = zoom;
      const target = zoomPlacement(hero);
      const scale = place.scale * Math.pow(target.scale / place.scale, z) * Math.pow(THROUGH, after);
      gl.uniform2f(fieldU.uShieldCenter, place.x + (target.x - place.x) * z, place.y + (target.y - place.y) * z);
      gl.uniform1f(fieldU.uShieldScale, scale);
      gl.uniform1f(fieldU.uLineScale, place.scale);
      gl.uniform1f(fieldU.uAfter, smooth(clamp01(after * 1.25)));
      // Ambient field gathers past the bottom-right corner
      gl.uniform2f(fieldU.uAmbientCenter, 0.5 * width / height + 0.05, -0.62);
      // Tuned at the 1512 × 851 artboard; narrower screens pull the field in to their corner.
      // Step graphics over their layout box; read each frame because it scrolls with the section.
      const gfx = stepGraphics();
      const slots = [[fieldU.uGfxA, fieldU.uGfxAInfo], [fieldU.uGfxB, fieldU.uGfxBInfo]];
      slots.forEach(([u, info], i) => {
        const g = gfx[i];
        gl.uniform4f(u, g ? g.x : 0, g ? g.y : 0, g ? g.scale : 1, g ? g.alpha : 0);
        gl.uniform2f(info, g ? g.kind : 0, g ? g.appear : 0);
      });

      gl.uniform1f(fieldU.uAmbientZoom, AMBIENT_ZOOM * Math.pow(Math.max(1, (1512 / 851) / (width / height)), 0.75));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      gl.useProgram(post);
      setFrame(postU, time);
      gl.uniform1f(postU.uPixelRatio, pixelRatio);
      gl.uniform1f(postU.uCell, 1 + (ZOOM_DOTS - 1) * zoom * (1 - smooth(clamp01(after * 1.25))));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(postU.tScene, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Where each step graphic sits, how far through the handoff we are, and which
    // (at most two) are visible. Returned in shader units.
    const KINDS = { wallet: 0, shield: 1, wallets: 2, bars: 3 };
    function stepGraphics() {
      const slot = walletSlot && walletSlot.getBoundingClientRect();
      if (!slot || slot.width <= 0) return [];
      const H = canvas.clientHeight, W = canvas.clientWidth;
      const toPos = (x, y) => [(x - W / 2) / H, (H / 2 - y) / H];
      // Every graphic lines up with the wallet: its width and its top edge (then per-graphic tweaks).
      const scaleW = slot.width / H / WALLET_BOX.w;
      const cx = slot.left + slot.width / 2, slotCy = slot.top + slot.height / 2;
      const edge = slotCy - WALLET_BOX.top * scaleW * H;
      const place = {
        wallet: () => ({ x: cx, y: slotCy, scale: scaleW }),
        shield: () => {
          const sc = slot.width / H / STEP_SHIELD_BOX.w * STEP_SHIELD_SIZE;
          return { x: cx, y: edge + STEP_SHIELD_BOX.top * sc * H - STEP_SHIELD_LIFT * slot.height, scale: sc };
        },
        wallets: () => {
          const sc = slot.width / H / STACK_BOX.w * STACK_SIZE;
          return { x: cx - STACK_BOX.cx * sc * H, y: edge + STACK_BOX.top * sc * H - STACK_LIFT * slot.height, scale: sc };
        },
        bars: () => {
          // The chart is short, so it sits fully in view: baseline near the bottom of the screen.
          let sc = slot.width / H / BARS_BOX.w * BARS_SIZE;
          const base = Math.min(H - BARS_BOTTOM * H, slot.bottom);
          // Where the chart shares columns with the steps (narrow screens), keep it below them.
          const list = stepsList && stepsList.getBoundingClientRect();
          if (list && cx - BARS_BOX.w / 2 * sc * H < list.right) {
            const room = base - (list.bottom + 24);
            sc = Math.max(0.05, Math.min(sc, room / (BARS_BOX.h * H)));
          }
          const half = BARS_BOX.w / 2 * sc * H;
          const x = Math.max(half + 16, Math.min(cx, W - half - 16)); // whole chart on screen
          return { x, y: base + BARS_BOX.bottom * sc * H, scale: sc }; // baseline sits BARS_BOX.bottom below centre
        },
      };

      const appearFirst = reduceMotion.matches ? (walletClock > 0 ? 1 : 0)
        : 1 - Math.pow(1 - clamp01((walletClock - WALLET_DELAY) / WALLET_APPEAR), 3);
      const out = [];
      graphics.forEach((name, i) => {
        // d > 0: this step is being left (fade + shrink away); d < 0: it's arriving (rise from below).
        const d = stepPos - i;
        let alpha = 1, rise = 1, shrink = 0, appear = i === 0 ? appearFirst : 1;
        if (d > 0) { const o = smooth(clamp01(d / 0.45)); alpha = 1 - o; shrink = o; }
        else if (d < 0) {
          const inn = clamp01((d + 1 - 0.3) / 0.7);
          alpha = smooth(clamp01(inn / 0.5));
          rise = 1 - Math.pow(1 - inn, 3);
          if (name === "wallets" || name === "bars") appear = inn; // forms piece by piece as it rises
        }
        if (alpha <= 0.001 || !place[name]) return;
        const p = place[name]();
        const [x, y] = toPos(p.x, p.y + (1 - rise) * H * 0.6);
        out.push({ x, y, scale: p.scale * (1 - 0.08 * shrink), alpha, kind: KINDS[name], appear });
      });
      return out.slice(0, 2);
    }

    function tick(now) {
      const delta = previous === null ? 0 : Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const running = visible && !document.hidden && canvas.clientWidth > 0 && canvas.clientHeight > 0;
      if (running) {
        if (!reduceMotion.matches) elapsed += delta;
        if (elapsed >= MORPH_DELAY || reduceMotion.matches) morphProgress = Math.min(1, morphProgress + delta / MORPH_SECONDS);
        // Scrolling: finish forming the shield quickly, then zoom into it.
        const p = window.ShieldTXIntro ? window.ShieldTXIntro.progress() : 0;
        if (p > 0) morphProgress = Math.max(morphProgress, Math.min(1, morphProgress + delta * 1.5, p / 0.12));
        zoom = reduceMotion.matches ? 0 : smooth(clamp01((p - 0.04) / 0.72));
        // Next section scrolling in: fly through the shield and settle into the ambient field.
        after = window.ShieldTXIntro ? window.ShieldTXIntro.after() : 0;
        // The wallet fades in once the section has mostly arrived, then stays.
        if (walletClock > 0 || after > 0.6) walletClock += Math.max(delta, 1e-3);
        stepPos = window.ShieldTXSteps ? window.ShieldTXSteps.position() : 0;
        draw(elapsed, fit());
        if (!ready) { ready = true; canvas.classList.add("is-ready"); }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(canvas);
  }

  const hero = document.querySelector(".hero");
  const canvas = document.querySelector(".bg-shader");
  if (!hero || !canvas) return;
  try {
    start(canvas, hero);
  } catch (err) {
    console.warn("[hero-shader]", err.message);
    document.documentElement.classList.add("no-gl");
  }
})();
