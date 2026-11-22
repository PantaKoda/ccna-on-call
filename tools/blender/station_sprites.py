# Renders the traffic around the cockpit view: a trading station turning on
# its axis and three kinds of ship, all modelled here in code (Cycles), so they
# are ours to ship. Writes into content/space/:
#   station.webp   an atlas of the station turning: FRAMES cells, COLS across,
#                  each CELL pixels square, transparent background
#   ships.webp     one ship per row (hauler, shuttle, courier), nose to the
#                  right, SHIP_W x SHIP_H each, transparent background
#
#   blender -b --factory-startup --python tools/blender/station_sprites.py -- [--only station,ships] [--samples 64]
#
# The game draws these as sprites: it rotates them with the ship's roll and
# along each ship's path, and adds the engine glow and trails itself.

import bpy, bmesh, math, os, sys, random, tempfile
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
ONLY = arg("--only", "station,ships").split(",")
SAMPLES = int(arg("--samples", "64"))
OUT = os.path.abspath(arg("--out", os.path.join(os.path.dirname(__file__), "..", "..", "content", "space")))
FRAMES, COLS, CELL = 24, 6, 384
SHIP_W, SHIP_H = 512, 192
os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp(prefix="ccna-sprites-")

# ---------------------------------------------------------------- setup
def fresh_scene(w, h):
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
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("w"); sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.02, 0.03, 0.05, 1); bg.inputs["Strength"].default_value = 1.0
    return sc

def sun(direction, strength=4.5, color=(1.0, 0.96, 0.9)):
    light = bpy.data.lights.new("sun", "SUN"); light.energy = strength; light.color = color; light.angle = math.radians(1.5)
    o = bpy.data.objects.new("sun", light)
    o.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(o)

def ortho_camera(location, target, scale):
    cam = bpy.data.cameras.new("cam"); cam.type = "ORTHO"; cam.ortho_scale = scale
    o = bpy.data.objects.new("cam", cam); o.location = location
    o.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(o); bpy.context.scene.camera = o

# ---------------------------------------------------------------- materials
def material(name, color, metal=0.6, rough=0.4, emit=None, strength=0.0, panels=True, windows=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    t = m.node_tree; n = t.nodes; bsdf = n["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    col = (*color, 1.0)
    if panels:
        # hull plates: a brick pattern in object space gives each plate its own shade
        tc = n.new("ShaderNodeTexCoord"); br = n.new("ShaderNodeTexBrick")
        br.inputs["Scale"].default_value = 5.0
        br.inputs["Color1"].default_value = col
        br.inputs["Color2"].default_value = tuple(c * 0.88 for c in color) + (1.0,)
        br.inputs["Mortar"].default_value = tuple(c * 0.45 for c in color) + (1.0,)
        br.inputs["Mortar Size"].default_value = 0.012
        t.links.new(tc.outputs["Object"], br.inputs["Vector"]); t.links.new(br.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = col
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    if windows is not None:
        # rows of lit windows: a fine brick pattern, some cells on, most off
        tc = n.new("ShaderNodeTexCoord"); wb = n.new("ShaderNodeTexBrick")
        wb.inputs["Scale"].default_value = windows; wb.inputs["Mortar Size"].default_value = 0.35
        wb.inputs["Color1"].default_value = (1, 1, 1, 1); wb.inputs["Color2"].default_value = (0, 0, 0, 1); wb.inputs["Mortar"].default_value = (0, 0, 0, 1)
        wb.inputs["Brick Width"].default_value = 0.5; wb.inputs["Row Height"].default_value = 0.25
        t.links.new(tc.outputs["Object"], wb.inputs["Vector"])
        # each brick is randomly white or black (Color1/Color2); only the white
        # ones, and only away from the mortar, are lit windows
        wb.inputs["Bias"].default_value = -0.55
        sep = n.new("ShaderNodeSeparateColor"); t.links.new(wb.outputs["Color"], sep.inputs[0])
        on = n.new("ShaderNodeMath"); on.operation = "GREATER_THAN"; on.inputs[1].default_value = 0.6
        t.links.new(sep.outputs[0], on.inputs[0])
        glass = n.new("ShaderNodeMath"); glass.operation = "SUBTRACT"; glass.use_clamp = True; glass.inputs[0].default_value = 1.0
        t.links.new(wb.outputs["Factor"], glass.inputs[1])
        lit = n.new("ShaderNodeMath"); lit.operation = "MULTIPLY"
        t.links.new(on.outputs[0], lit.inputs[0]); t.links.new(glass.outputs[0], lit.inputs[1])
        strength = n.new("ShaderNodeMath"); strength.operation = "MULTIPLY"; strength.inputs[1].default_value = 5.0
        t.links.new(lit.outputs[0], strength.inputs[0])
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.78, 0.48, 1.0)
        t.links.new(strength.outputs[0], bsdf.inputs["Emission Strength"])
    return m

def put(obj, mat, parent=None):
    obj.data.materials.clear(); obj.data.materials.append(mat)
    if parent: obj.parent = parent
    bpy.ops.object.shade_smooth() if obj.type == "MESH" and len(obj.data.polygons) > 40 else None
    return obj

def bevel(obj, w=0.02):
    m = obj.modifiers.new("bevel", "BEVEL"); m.width = w; m.segments = 2; m.limit_method = "ANGLE"
    return obj

def box(size, loc, mat, parent=None, rot=(0, 0, 0), bev=0.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bev: bevel(o, bev)
    return put(o, mat, parent)

def cyl(r, depth, loc, mat, parent=None, rot=(0, 0, 0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    return put(bpy.context.object, mat, parent)

def sphere(r, loc, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=16, ring_count=8)
    return put(bpy.context.object, mat, parent)

# ---------------------------------------------------------------- the station
def build_station():
    rnd = random.Random(4)
    hull = material("hull", (0.62, 0.64, 0.68), 0.55, 0.42)
    dark = material("dark", (0.16, 0.17, 0.2), 0.7, 0.35)
    habitat = material("habitat", (0.7, 0.71, 0.74), 0.4, 0.45, windows=26.0)
    solar = material("solar", (0.05, 0.09, 0.2), 0.35, 0.18)
    gold = material("gold", (0.75, 0.55, 0.22), 0.9, 0.3, panels=False)
    dock = material("dock", (0.1, 0.1, 0.12), 0.2, 0.5, emit=(0.25, 0.75, 1.0), strength=4.0, panels=False)
    red = material("red", (0.1, 0, 0), 0, 0.5, emit=(1.0, 0.12, 0.08), strength=40.0, panels=False)
    green = material("green", (0, 0.1, 0), 0, 0.5, emit=(0.15, 1.0, 0.3), strength=40.0, panels=False)
    white = material("white", (0.1, 0.1, 0.1), 0, 0.5, emit=(1.0, 1.0, 1.0), strength=50.0, panels=False)

    root = bpy.data.objects.new("station", None); bpy.context.scene.collection.objects.link(root)
    # the spindle, with a docking bay at the top
    bevel(cyl(0.34, 2.3, (0, 0, 0), hull, root, verts=24), 0.03)
    cyl(0.42, 0.28, (0, 0, 1.0), dark, root, verts=24)
    cyl(0.3, 0.06, (0, 0, 1.16), dock, root, verts=24)
    bpy.ops.mesh.primitive_cone_add(radius1=0.34, radius2=0.12, depth=0.5, location=(0, 0, -1.4), vertices=24)
    put(bpy.context.object, hull, root)
    # the habitat ring, held on three spokes
    bpy.ops.mesh.primitive_torus_add(major_radius=1.7, minor_radius=0.17, major_segments=96, minor_segments=16, location=(0, 0, 0.15))
    put(bpy.context.object, habitat, root)
    for k in range(3):
        a = k * 2 * math.pi / 3
        cyl(0.055, 1.36, (math.cos(a) * 1.02, math.sin(a) * 1.02, 0.15), dark, root, rot=(0, math.pi / 2, a), verts=12)
    # a smaller industrial ring below, and cargo pods on it
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.07, major_segments=64, minor_segments=10, location=(0, 0, -0.65))
    put(bpy.context.object, dark, root)
    for k in range(8):
        a = k * 2 * math.pi / 8 + 0.2
        box((0.22, 0.16, 0.16), (math.cos(a) * 1.0, math.sin(a) * 1.0, -0.65), rnd.choice([hull, gold, hull]), root, rot=(0, 0, a))
    # solar wings on two arms
    for s in (-1, 1):
        cyl(0.035, 1.3, (s * 0.95, 0, -1.05), dark, root, rot=(0, math.pi / 2, 0), verts=10)
        for j in range(3):
            box((0.42, 0.62, 0.015), (s * (1.75 + j * 0.46), 0, -1.05), solar, root, bev=0.004)
    # greebles on the spindle
    for _ in range(70):
        a, z = rnd.uniform(0, 2 * math.pi), rnd.uniform(-1.0, 0.9)
        sz = (rnd.uniform(0.05, 0.16), rnd.uniform(0.05, 0.14), rnd.uniform(0.03, 0.12))
        box(sz, (math.cos(a) * 0.36, math.sin(a) * 0.36, z), rnd.choice([hull, dark, dark, gold]), root, rot=(0, 0, a), bev=0.006)
    # an antenna and its dish at the bottom
    cyl(0.015, 0.9, (0, 0, -2.0), dark, root, verts=8)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.28, location=(0.25, 0, -1.75), segments=24, ring_count=12)
    dish = bpy.context.object; dish.scale = (1, 1, 0.35); put(dish, hull, root)
    # navigation lights
    for k in range(12):
        a = k * 2 * math.pi / 12
        sphere(0.035, (math.cos(a) * 1.7, math.sin(a) * 1.7, 0.34), red if k % 2 else green, root)
    for loc in ((0, 0, -2.45), (2.85, 0, -1.05), (-2.85, 0, -1.05), (0, 0, 1.32)):
        sphere(0.04, loc, white, root)
    return root

def render_station():
    sc = fresh_scene(CELL, CELL)
    root = build_station()
    tilt = bpy.data.objects.new("tilt", None); sc.collection.objects.link(tilt)
    tilt.rotation_euler = (math.radians(14), math.radians(-8), 0)       # its axis leans a little
    root.parent = tilt                                                  # and it turns about that axis
    ortho_camera((0, -6.6, 6.0), (0, 0, -0.25), 7.0)
    sun((-0.6, 0.55, -0.55))
    atlas = np.zeros((CELL * (FRAMES // COLS), CELL * COLS, 4), dtype=np.float32)
    for f in range(FRAMES):
        root.rotation_euler[2] = f * 2 * math.pi / FRAMES
        path = os.path.join(TMP, f"st{f}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(CELL, CELL, 4)
        bpy.data.images.remove(img)
        r, c = divmod(f, COLS)
        rows = atlas.shape[0]
        # images are stored bottom-up; put frame 0 in the top-left cell
        atlas[rows - (r + 1) * CELL: rows - r * CELL, c * CELL:(c + 1) * CELL] = px
        print("frame", f)
    save_atlas(atlas, "station")

# ---------------------------------------------------------------- the ships
def build_ships():
    rnd = random.Random(9)
    hull = material("shull", (0.7, 0.7, 0.72), 0.5, 0.4)
    dark = material("sdark", (0.17, 0.18, 0.21), 0.7, 0.35)
    stripe = material("stripe", (0.85, 0.42, 0.12), 0.3, 0.45, panels=False)
    cans = [material(f"can{i}", c, 0.35, 0.5) for i, c in enumerate([(0.78, 0.36, 0.12), (0.16, 0.34, 0.62), (0.55, 0.56, 0.58), (0.15, 0.5, 0.48)])]
    glass = material("glass", (0.05, 0.08, 0.1), 0.2, 0.1, emit=(0.5, 0.85, 1.0), strength=3.0, panels=False)
    nozzle = material("nozzle", (0.05, 0.05, 0.06), 0, 0.5, emit=(0.45, 0.85, 1.0), strength=25.0, panels=False)
    red = material("sred", (0.1, 0, 0), 0, 0.5, emit=(1.0, 0.12, 0.08), strength=40.0, panels=False)
    green = material("sgreen", (0, 0.1, 0), 0, 0.5, emit=(0.15, 1.0, 0.3), strength=40.0, panels=False)
    ships = []

    # a long cargo hauler: a spine of containers, a cab at the front, big engines
    r = bpy.data.objects.new("hauler", None); bpy.context.scene.collection.objects.link(r)
    box((2.3, 0.16, 0.16), (0, 0, 0), dark, r)
    for i in range(5):
        for s in (-1, 1):
            box((0.38, 0.2, 0.3), (-0.75 + i * 0.4, s * 0.19, 0), rnd.choice(cans), r, bev=0.01)
    box((0.4, 0.42, 0.34), (1.2, 0, 0.02), hull, r)
    box((0.06, 0.3, 0.1), (1.42, 0, 0.1), glass, r, bev=0.01)
    box((0.3, 0.5, 0.42), (-1.25, 0, 0), hull, r)
    for s in (-1, 1):
        cyl(0.13, 0.22, (-1.45, s * 0.13, 0), dark, r, rot=(0, math.pi / 2, 0), verts=20)
        cyl(0.1, 0.02, (-1.565, s * 0.13, 0), nozzle, r, rot=(0, math.pi / 2, 0), verts=20)
    sphere(0.03, (1.2, 0.23, 0.05), green, r); sphere(0.03, (1.2, -0.23, 0.05), red, r)
    ships.append(r)

    # a passenger shuttle: a tapered wedge with short wings
    r = bpy.data.objects.new("shuttle", None); bpy.context.scene.collection.objects.link(r)
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object; o.scale = (1.5, 0.55, 0.34); bpy.ops.object.transform_apply(scale=True)
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:
        if v.co.x > 0: v.co.y *= 0.4; v.co.z *= 0.55; v.co.z -= 0.04
    bm.to_mesh(o.data); bm.free()
    bevel(o, 0.04); put(o, hull, r)
    box((0.5, 1.3, 0.04), (-0.25, 0, -0.06), hull, r)
    box((0.7, 0.05, 0.05), (-0.1, 0, 0.0), stripe, r, bev=0)
    box((0.3, 0.2, 0.08), (0.42, 0, 0.12), glass, r, bev=0.02)
    for s in (-1, 1):
        cyl(0.09, 0.3, (-0.78, s * 0.16, 0), dark, r, rot=(0, math.pi / 2, 0), verts=20)
        cyl(0.07, 0.02, (-0.94, s * 0.16, 0), nozzle, r, rot=(0, math.pi / 2, 0), verts=20)
    sphere(0.03, (-0.25, 0.65, -0.05), green, r); sphere(0.03, (-0.25, -0.65, -0.05), red, r)
    ships.append(r)

    # a fast courier: a needle with fins and one bright engine
    r = bpy.data.objects.new("courier", None); bpy.context.scene.collection.objects.link(r)
    cyl(0.14, 1.3, (0, 0, 0), hull, r, rot=(0, math.pi / 2, 0), verts=24)
    bpy.ops.mesh.primitive_cone_add(radius1=0.14, radius2=0.0, depth=0.6, location=(0.95, 0, 0), rotation=(0, math.pi / 2, 0), vertices=24)
    put(bpy.context.object, hull, r)
    box((0.3, 0.12, 0.06), (0.55, 0, 0.12), glass, r, bev=0.02)
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 2
        box((0.42, 0.02, 0.3), (-0.5, math.cos(a) * 0.2, math.sin(a) * 0.2), stripe if k == 0 else dark, r, rot=(a - math.pi / 2, 0, 0), bev=0.005)
    cyl(0.12, 0.05, (-0.68, 0, 0), nozzle, r, rot=(0, math.pi / 2, 0), verts=24)
    ships.append(r)
    return ships

def render_ships():
    sc = fresh_scene(SHIP_W, SHIP_H)
    ships = build_ships()
    # seen from the side, a little from above and in front; the nose points right
    ortho_camera((0.9, -6, 2.2), (0, 0, 0), 3.7)
    sun((-0.6, 0.55, -0.55))
    atlas = np.zeros((SHIP_H * len(ships), SHIP_W, 4), dtype=np.float32)
    for i, s in enumerate(ships):
        for o in ships: o.hide_render = o is not s
        for c in bpy.context.scene.objects:
            if c.parent in ships: c.hide_render = c.parent is not s
        path = os.path.join(TMP, f"ship{i}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(SHIP_H, SHIP_W, 4)
        bpy.data.images.remove(img)
        rows = atlas.shape[0]
        atlas[rows - (i + 1) * SHIP_H: rows - i * SHIP_H] = px
        print("ship", s.name)
    save_atlas(atlas, "ships")

def save_atlas(atlas, name):
    h, w, _ = atlas.shape
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels = atlas.ravel()
    path = os.path.join(OUT, f"{name}.webp")
    img.filepath_raw = path
    img.file_format = "WEBP"
    img.save()
    print("wrote", path)

if "station" in ONLY: render_station()
if "ships" in ONLY: render_ships()
