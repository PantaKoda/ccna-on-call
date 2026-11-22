# Renders the cockpit view's textures in Blender (Cycles), all procedural, so
# they are ours to ship. Writes into content/space/:
#   <planet>.webp        a 2:1 cloud map (equirectangular, north at the top)
#   <planet>-ring.png    the ring strip: inner edge on the left, alpha = density
#   sky.webp             a 2:1 panorama of nebulae, dust and the Milky Way (no
#                        stars: the game draws those itself, sharp at any size)
#   moon.webp            a 2:1 map of a cratered moon
#
#   blender -b --factory-startup --python tools/blender/space_textures.py -- [--only planet,sky,moon] [--size 4096] [--out content/space]
#
# A cloud map is rendered as a flat 2:1 plane whose shader turns each pixel's
# position into a point on a sphere, so the procedural textures wrap without a
# seam. The sky is a panoramic camera inside a volume of glowing, lit gas.

import bpy, math, os, sys, random

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
ONLY = arg("--only", "planet,sky,moon").split(",")
SIZE = int(arg("--size", "4096"))
OUT = os.path.abspath(arg("--out", os.path.join(os.path.dirname(__file__), "..", "..", "content", "space")))
SKY_SAMPLES = int(arg("--sky-samples", "96"))
os.makedirs(OUT, exist_ok=True)

def lin(c):  # sRGB 0..255 to linear 0..1, for colour ramps
    return tuple(((v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)

# ---------------------------------------------------------------- scene setup
def fresh_scene(w, h, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            for d in prefs.devices: d.use = d.type != "CPU"
            sc.cycles.device = "GPU"
            break
        except Exception:
            continue
    sc.cycles.samples = samples
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.color_mode = "RGB"
    return sc

def save(sc, path, fmt="WEBP", quality=92, rgba=False):
    s = sc.render.image_settings
    s.file_format = fmt
    s.color_mode = "RGBA" if rgba else "RGB"
    if fmt == "WEBP": s.quality = quality
    if fmt == "PNG": s.color_depth = "8"; s.compression = 90
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("wrote", path)

class Nodes:
    """A small helper for building shader node trees in code."""
    def __init__(self, mat):
        mat.use_nodes = True
        self.t = mat.node_tree
        self.t.nodes.clear()
    def n(self, kind, **props):
        node = self.t.nodes.new(kind)
        for k, v in props.items():
            if k == "inputs":
                for name, val in v.items(): self.inp(node, name).default_value = val
            else:
                setattr(node, k, v)
        return node
    def inp(self, node, name, kind=None):
        for s in node.inputs:
            if s.name == name and s.enabled and (kind is None or s.type == kind): return s
        if isinstance(name, int): return node.inputs[name]
        raise KeyError(f"{node.bl_idname} has no input {name}")
    def out(self, node, name=None, kind=None):
        if name is None: return next(s for s in node.outputs if s.enabled)
        for s in node.outputs:
            if s.name == name and s.enabled and (kind is None or s.type == kind): return s
        raise KeyError(f"{node.bl_idname} has no output {name}")
    def link(self, a, b): self.t.links.new(a, b)
    # maths shortcuts: each returns an output socket
    def math(self, op, a, b=0.0, clamp=False):
        m = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if hasattr(v, "is_output"): self.link(v, m.inputs[i])
            else: m.inputs[i].default_value = v
        return m.outputs[0]
    def vmath(self, op, a, b=None, scale=None):
        m = self.n("ShaderNodeVectorMath", operation=op)
        for i, v in enumerate((a, b)):
            if v is None: continue
            if hasattr(v, "is_output"): self.link(v, m.inputs[i])
            else: m.inputs[i].default_value = v
        if scale is not None: self.inp(m, "Scale").default_value = scale
        return self.out(m, "Value" if op in ("LENGTH", "DISTANCE", "DOT_PRODUCT") else "Vector")
    def combine(self, x, y, z):
        c = self.n("ShaderNodeCombineXYZ")
        for i, v in enumerate((x, y, z)):
            if hasattr(v, "is_output"): self.link(v, c.inputs[i])
            else: c.inputs[i].default_value = v
        return c.outputs[0]
    def ramp(self, fac, stops):
        r = self.n("ShaderNodeValToRGB")
        els = r.color_ramp.elements
        while len(els) > 1: els.remove(els[-1])
        els[0].position, els[0].color = stops[0][0], lin(stops[0][1:])
        for t, *c in stops[1:]:
            e = els.new(t); e.color = lin(c)
        self.link(fac, r.inputs[0])
        return self.out(r, "Color")
    def mix(self, fac, a, b):
        m = self.n("ShaderNodeMix", data_type="RGBA")
        self.link(fac, self.inp(m, "Factor", "VALUE")) if hasattr(fac, "is_output") else setattr(self.inp(m, "Factor", "VALUE"), "default_value", fac)
        for name, v in (("A", a), ("B", b)):
            s = self.inp(m, name, "RGBA")
            if hasattr(v, "is_output"): self.link(v, s)
            else: s.default_value = v
        return self.out(m, "Result", "RGBA")
    def emit(self, color, alpha=None):
        e = self.n("ShaderNodeEmission")
        self.link(color, self.inp(e, "Color"))
        o = self.n("ShaderNodeOutputMaterial")
        if alpha is None:
            self.link(self.out(e), self.inp(o, "Surface"))
        else:
            t = self.n("ShaderNodeBsdfTransparent")
            m = self.n("ShaderNodeMixShader")
            self.link(alpha, m.inputs[0]); self.link(self.out(t), m.inputs[1]); self.link(self.out(e), m.inputs[2])
            self.link(m.outputs[0], self.inp(o, "Surface"))

# A plane filling an orthographic camera: each pixel of the image is one point
# of the plane, and the plane's UV runs 0..1 across the image.
def map_plane(w, h, name):
    bpy.ops.mesh.primitive_plane_add(size=2)
    pl = bpy.context.object
    pl.scale = (w / h, 1, 1)
    mat = bpy.data.materials.new(name); pl.data.materials.append(mat)
    cam = bpy.data.cameras.new("cam"); cam.type = "ORTHO"; cam.ortho_scale = 2 * w / h
    co = bpy.data.objects.new("cam", cam); co.location = (0, 0, 5)
    bpy.context.scene.collection.objects.link(co); bpy.context.scene.camera = co
    return Nodes(mat)

# The point on the unit sphere for this pixel: z is the axis, top row is north.
def sphere_point(N):
    tc = N.n("ShaderNodeTexCoord")
    sep = N.n("ShaderNodeSeparateXYZ"); N.link(N.out(tc, "UV"), sep.inputs[0])
    lon = N.math("MULTIPLY", N.math("SUBTRACT", sep.outputs[0], 0.5), 2 * math.pi)
    lat = N.math("MULTIPLY", N.math("SUBTRACT", sep.outputs[1], 0.5), math.pi)
    cl = N.math("COSINE", lat)
    p = N.combine(N.math("MULTIPLY", cl, N.math("COSINE", lon)), N.math("MULTIPLY", cl, N.math("SINE", lon)), N.math("SINE", lat))
    return p, lat

def ll(lat, lon):  # a point on the sphere from degrees
    a, b = math.radians(lat), math.radians(lon)
    return (math.cos(a) * math.cos(b), math.cos(a) * math.sin(b), math.sin(a))

# ---------------------------------------------------------------- gas giants
PLANETS = {
    # warm bands, a great red-brown storm
    "kestrel": dict(
        stops=[(0.0, 58, 30, 24), (0.16, 120, 62, 42), (0.3, 178, 112, 70), (0.42, 222, 170, 118), (0.52, 242, 214, 172),
               (0.62, 204, 140, 96), (0.74, 160, 92, 70), (0.86, 232, 200, 160), (1.0, 128, 76, 56)],
        storm=(186, 82, 58), spots=(246, 236, 220), pole=(90, 80, 86), seed=1.3, wave=2.4, distortion=3.0, storm_at=(-22, 40), storm_r=0.17),
    # an ice giant: soft blues, a dark storm and bright white streaks
    "cryon": dict(
        stops=[(0.0, 14, 34, 66), (0.2, 30, 76, 124), (0.36, 56, 120, 170), (0.5, 104, 170, 205), (0.6, 160, 210, 232),
               (0.7, 86, 150, 196), (0.82, 44, 98, 150), (0.92, 196, 234, 246), (1.0, 34, 82, 130)],
        storm=(16, 30, 70), spots=(236, 250, 255), pole=(60, 90, 120), seed=7.9, wave=1.8, distortion=2.0, storm_at=(18, -70), storm_r=0.14),
}

def render_planet(name, cfg, size):
    w, h = size, size // 2
    sc = fresh_scene(w, h, 8)
    N = map_plane(w, h, name)
    p, lat = sphere_point(N)
    # the great storm: an oval (squashed north to south); the clouds around it
    # are swirled a little, most strongly at its edge
    c = ll(*cfg["storm_at"])
    d = N.vmath("LENGTH", N.vmath("MULTIPLY", N.vmath("SUBTRACT", p, c), (1.0, 1.0, 2.1)))
    near = N.math("POWER", N.math("SUBTRACT", 1.0, N.math("DIVIDE", d, cfg["storm_r"] * 2.0), clamp=True), 1.5)
    rot = N.n("ShaderNodeVectorRotate", rotation_type="AXIS_ANGLE")
    N.link(p, N.inp(rot, "Vector")); N.inp(rot, "Axis").default_value = c
    N.link(N.math("MULTIPLY", near, 2.4), N.inp(rot, "Angle"))
    ps = N.out(rot, "Vector")
    # two levels of turbulence, stretched along the bands, push the clouds around
    def warp(vec, stretch, scale, amount, w):
        tn = N.n("ShaderNodeTexNoise", noise_dimensions="4D", inputs={"W": cfg["seed"] + w, "Scale": scale, "Detail": 8.0, "Roughness": 0.6})
        N.link(N.vmath("MULTIPLY", vec, stretch), N.inp(tn, "Vector"))
        return N.vmath("SCALE", N.vmath("SUBTRACT", N.out(tn, "Color"), (0.5, 0.5, 0.5)), scale=amount)
    pw = N.vmath("ADD", ps, warp(ps, (1.6, 1.6, 8.0), 1.0, 0.13, 0))
    pw = N.vmath("ADD", pw, warp(pw, (4.0, 4.0, 22.0), 1.0, 0.045, 2))
    pw = N.vmath("ADD", pw, warp(pw, (11.0, 11.0, 50.0), 1.0, 0.014, 5))
    # broad belts and zones of uneven width: 1D noise up the axis
    zsep = N.n("ShaderNodeSeparateXYZ"); N.link(pw, zsep.inputs[0])
    belts = N.n("ShaderNodeTexNoise", noise_dimensions="2D", inputs={"Scale": cfg["wave"], "Detail": 6.0, "Roughness": 0.5})
    N.link(N.combine(cfg["seed"] * 3.1, zsep.outputs[2], 0.0), N.inp(belts, "Vector"))
    # finer banding inside them
    wave = N.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z", wave_profile="SIN",
               inputs={"Scale": cfg["wave"] * 2.6, "Distortion": cfg["distortion"], "Detail": 6.0, "Detail Scale": 1.2, "Detail Roughness": 0.55})
    N.link(pw, N.inp(wave, "Vector"))
    # fine streaks along the bands
    fs = N.n("ShaderNodeTexNoise", noise_dimensions="4D", inputs={"W": cfg["seed"] + 4, "Scale": 2.0, "Detail": 12.0, "Roughness": 0.7})
    N.link(N.vmath("MULTIPLY", pw, (3.0, 3.0, 48.0)), N.inp(fs, "Vector"))
    band = N.math("ADD", N.math("MULTIPLY", N.out(belts, "Factor"), 1.45), N.math("MULTIPLY", N.out(wave, "Factor"), 0.05))
    band = N.math("ADD", band, N.math("MULTIPLY", N.out(fs, "Factor"), 0.22))
    band = N.math("SUBTRACT", band, 0.5)
    col = N.ramp(band, cfg["stops"])
    # the storm's own colour, strongest in its middle
    # measured on the turbulent clouds, so its edge is ragged
    dw = N.vmath("LENGTH", N.vmath("MULTIPLY", N.vmath("SUBTRACT", pw, c), (1.0, 1.0, 2.1)))
    core = N.math("POWER", N.math("SUBTRACT", 1.0, N.math("DIVIDE", dw, cfg["storm_r"]), clamp=True), 0.8)
    collar = N.math("SUBTRACT", 1.0, N.math("ABSOLUTE", N.math("MULTIPLY", N.math("SUBTRACT", N.math("DIVIDE", dw, cfg["storm_r"]), 1.2), 2.2)), clamp=True)
    col = N.mix(N.math("MULTIPLY", N.math("POWER", collar, 1.5), 0.3), col, lin(cfg["spots"]))
    col = N.mix(N.math("MULTIPLY", core, 0.7), col, lin(cfg["storm"]))
    # small white ovals scattered in the bands
    vo = N.n("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="F1", inputs={"Scale": 5.0, "Randomness": 1.0})
    N.link(N.vmath("MULTIPLY", pw, (1.0, 1.0, 2.2)), N.inp(vo, "Vector"))
    vsep = N.n("ShaderNodeSeparateColor"); N.link(N.out(vo, "Color"), vsep.inputs[0])
    keep = N.math("GREATER_THAN", vsep.outputs[0], 0.9)
    spot = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, N.math("DIVIDE", N.out(vo, "Distance"), 0.2), clamp=True), keep)
    col = N.mix(N.math("MULTIPLY", N.math("POWER", spot, 1.2), 0.7), col, lin(cfg["spots"]))
    # duller, cooler poles
    pol = N.math("POWER", N.math("ABSOLUTE", N.math("SINE", lat)), 5.0)
    col = N.mix(N.math("MULTIPLY", pol, 0.55), col, lin(cfg["pole"]))
    N.emit(col)
    save(sc, os.path.join(OUT, f"{name}.webp"))

# The ring strip: bands and gaps across the ring, made from 1D noise.
def render_ring(name, seed, tint):
    from mathutils import noise
    W = 4096
    img = bpy.data.images.new(name + "-ring", W, 1, alpha=True)
    rnd = random.Random(seed)
    gaps = [(rnd.random(), 0.004 + rnd.random() * 0.016, 0.15 + rnd.random() * 0.35) for _ in range(7)]
    px = []
    for i in range(W):
        x = i / W
        a = 0.55 + 0.35 * noise.noise((x * 9.0, seed, 0.3)) + 0.12 * noise.noise((x * 40.0, seed, 1.7)) + 0.025 * noise.noise((x * 300.0, seed, 4.1))
        for c, w, depth in gaps: a -= depth * math.exp(-((x - c) / w) ** 2)
        if 0.61 < x < 0.655: a *= 0.06          # one wide division
        a *= min(1, x / 0.05) * min(1, (1 - x) / 0.03)
        a = max(0.0, min(0.94, a))
        warm = 0.5 + 0.5 * noise.noise((x * 5.0, seed, 7.0))
        r, g, b = [(t + warm * 26) / 255 for t in tint]
        px += [r, g, b, a]
    img.pixels = px
    img.filepath_raw = os.path.join(OUT, f"{name}-ring.png")
    img.file_format = "PNG"
    img.save()
    print("wrote", img.filepath_raw)

# ---------------------------------------------------------------- the moon
def render_moon(size):
    w, h = size, size // 2
    sc = fresh_scene(w, h, 8)
    N = map_plane(w, h, "moon")
    p, _ = sphere_point(N)
    base = N.n("ShaderNodeTexNoise", inputs={"Scale": 1.8, "Detail": 10.0, "Roughness": 0.6})
    N.link(p, N.inp(base, "Vector"))
    mare = N.math("MINIMUM", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", N.out(base, "Factor"), 0.48), 6.0))
    shade = N.ramp(N.math("ADD", N.math("MULTIPLY", mare, 0.35), 0.5), [(0.0, 52, 52, 56), (0.5, 104, 102, 100), (1.0, 150, 148, 144)])
    # craters: rings of the Voronoi distance at two sizes
    acc = shade
    for scale, strength in ((6.0, 0.35), (18.0, 0.25), (48.0, 0.18)):
        vo = N.n("ShaderNodeTexVoronoi", feature="F1", inputs={"Scale": scale, "Randomness": 1.0})
        N.link(p, N.inp(vo, "Vector"))
        dist = N.out(vo, "Distance")
        rim = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, N.math("ABSOLUTE", N.math("MULTIPLY", N.math("SUBTRACT", dist, 0.32), 9.0)), clamp=True), strength)
        pit = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, N.math("DIVIDE", dist, 0.3), clamp=True), strength)
        acc = N.mix(rim, acc, (0.78, 0.77, 0.75, 1.0))
        acc = N.mix(pit, acc, (0.06, 0.06, 0.07, 1.0))
    N.emit(acc)
    save(sc, os.path.join(OUT, "moon.webp"))

# ---------------------------------------------------------------- the sky
# A panoramic camera inside a cube of gas: clouds glow on their own, are lit by
# a few hot stars buried in them, and dark dust hides what is behind it.
def render_sky(size):
    w, h = size, size // 2
    sc = fresh_scene(w, h, SKY_SAMPLES)
    sc.cycles.volume_step_rate = 2.0
    sc.cycles.volume_max_steps = 256
    sc.cycles.use_denoising = True
    cam = bpy.data.cameras.new("cam"); cam.type = "PANO"
    try: cam.panorama_type = "EQUIRECTANGULAR"
    except AttributeError: cam.cycles.panorama_type = "EQUIRECTANGULAR"
    co = bpy.data.objects.new("cam", cam); co.rotation_euler = (math.pi / 2, 0, 0)
    sc.collection.objects.link(co); sc.camera = co

    world = bpy.data.worlds.new("w"); sc.world = world
    W = Nodes(world)
    wtc = W.n("ShaderNodeTexCoord")
    # the Milky Way: a soft band across the sky, with dust lanes
    # (on the world, the Generated coordinate is the direction being looked at)
    bandn = W.vmath("DOT_PRODUCT", W.out(wtc, "Generated"), tuple(v / math.sqrt(0.2 ** 2 + 0.55 ** 2 + 0.81 ** 2) for v in (0.2, 0.55, 0.81)))
    band = W.math("EXPONENT", W.math("MULTIPLY", W.math("MULTIPLY", bandn, bandn), -14.0))
    mwn = W.n("ShaderNodeTexNoise", inputs={"Scale": 3.0, "Detail": 12.0, "Roughness": 0.62})
    W.link(W.out(wtc, "Generated"), W.inp(mwn, "Vector"))
    lanes = W.n("ShaderNodeTexNoise", inputs={"Scale": 2.6, "Detail": 8.0, "Roughness": 0.55, "Distortion": 0.25})
    W.link(W.vmath("MULTIPLY", W.out(wtc, "Generated"), (1.0, 2.4, 1.0)), W.inp(lanes, "Vector"))
    dust = W.math("SUBTRACT", 1.0, W.math("MULTIPLY", W.math("SUBTRACT", W.out(lanes, "Factor"), 0.5), 3.0), clamp=True)
    glow = W.math("MULTIPLY", W.math("MULTIPLY", band, W.math("POWER", W.out(mwn, "Factor"), 2.6)), dust)
    mwcol = W.ramp(W.out(mwn, "Factor"), [(0.3, 70, 90, 150), (0.55, 150, 140, 175), (0.75, 235, 200, 165)])
    bg = W.n("ShaderNodeBackground")
    W.link(mwcol, W.inp(bg, "Color"))
    W.link(W.math("ADD", W.math("MULTIPLY", glow, 0.24), 0.002), W.inp(bg, "Strength"))
    wo = W.n("ShaderNodeOutputWorld"); W.link(W.out(bg), W.inp(wo, "Surface"))

    # the nebula: a big cube of glowing, lit gas around the camera
    bpy.ops.mesh.primitive_cube_add(size=60)
    cube = bpy.context.object
    mat = bpy.data.materials.new("nebula"); cube.data.materials.append(mat)
    N = Nodes(mat)
    tc = N.n("ShaderNodeTexCoord")
    pos = N.out(tc, "Object")
    big = N.n("ShaderNodeTexNoise", inputs={"Scale": 0.035, "Detail": 3.0, "Roughness": 0.5})
    N.link(pos, N.inp(big, "Vector"))
    where = N.math("POWER", N.math("SUBTRACT", N.math("MULTIPLY", N.out(big, "Factor"), 2.6), 1.3, clamp=True), 1.8)
    wisp = N.n("ShaderNodeTexNoise", inputs={"Scale": 0.16, "Detail": 12.0, "Roughness": 0.62, "Distortion": 1.6})
    N.link(pos, N.inp(wisp, "Vector"))
    dens = N.math("MULTIPLY", N.math("POWER", N.math("SUBTRACT", N.math("MULTIPLY", N.out(wisp, "Factor"), 1.8), 0.72, clamp=True), 2.2), where)
    # keep a clear space around the camera, so no cloud sits right on the lens
    r = N.vmath("LENGTH", pos)
    clear = N.math("SUBTRACT", N.math("DIVIDE", r, 9.0), 0.4, clamp=True)
    dens = N.math("MULTIPLY", dens, clear)
    hue = N.n("ShaderNodeTexNoise", inputs={"Scale": 0.05, "Detail": 2.0})
    N.link(pos, N.inp(hue, "Vector"))
    tint = N.ramp(N.out(hue, "Factor"), [(0.3, 30, 150, 190), (0.45, 70, 90, 220), (0.55, 170, 60, 170), (0.7, 230, 110, 90)])
    vol = N.n("ShaderNodeVolumePrincipled")
    N.link(tint, N.inp(vol, "Color")); N.link(tint, N.inp(vol, "Emission Color"))
    N.link(N.math("MULTIPLY", dens, 0.12), N.inp(vol, "Density"))
    N.link(N.math("MULTIPLY", dens, 0.3), N.inp(vol, "Emission Strength"))
    N.inp(vol, "Anisotropy").default_value = 0.35
    out = N.n("ShaderNodeOutputMaterial"); N.link(N.out(vol, "Volume"), N.inp(out, "Volume"))

    # a few hot stars inside the clouds light them from within
    rnd = random.Random(11)
    for i in range(7):
        d = [rnd.uniform(-1, 1) for _ in range(3)]; l = math.sqrt(sum(v * v for v in d)) or 1
        dist = rnd.uniform(14, 26)
        light = bpy.data.lights.new(f"star{i}", "POINT")
        light.energy = rnd.uniform(10000, 30000); light.shadow_soft_size = 0.5
        light.color = rnd.choice([(0.7, 0.85, 1.0), (1.0, 0.85, 0.7), (0.8, 0.8, 1.0)])
        lo = bpy.data.objects.new(f"star{i}", light); lo.location = [v / l * dist for v in d]
        sc.collection.objects.link(lo)
    save(sc, os.path.join(OUT, "sky.webp"), quality=90)

# ---------------------------------------------------------------- run
if "planet" in ONLY:
    for name, cfg in PLANETS.items():
        render_planet(name, cfg, SIZE)
    render_ring("kestrel", 3, (196, 178, 150))
    render_ring("cryon", 9, (170, 196, 214))
if "moon" in ONLY: render_moon(min(SIZE, 2048))
if "sky" in ONLY: render_sky(SIZE)
