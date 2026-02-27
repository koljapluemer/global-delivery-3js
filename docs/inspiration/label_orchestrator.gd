extends Node

## Renders 2D labels from data only (pin labels, crate bubbles, vehicle bubbles).
## Receives label data from orchestrator each frame; no node references. Single responsibility: display.
##
## Visibility rule:
##   In front of horizon → bubble at projected world position, unrotated.
##   Behind horizon      → bubble snapped to the horizon circle at the point
##                         where the (globe-centre → object) ray meets it,
##                         rotated so the tail points inward toward the globe.
##   Near horizon        → smooth lerp between the two states.

const CARGO_BUBBLE_SCENE: PackedScene = preload("res://scenes/ui/cargo_bubble.tscn")
const VEHICLE_BUBBLE_SCENE: PackedScene = preload("res://scenes/ui/vehicle_bubble.tscn")
const PIN_LABEL_SCENE: PackedScene = preload("res://scenes/ui/pin_label.tscn")
const CARGO_BUBBLE_SMALL_SCENE: PackedScene = preload("res://scenes/ui/cargo_bubble_small.tscn")
const CARGO_BUBBLE_SCALE: Vector2 = Vector2(0.1, 0.1)
const PIN_BUBBLE_SCALE: Vector2 = Vector2(0.08, 0.08)
## Width of the horizon blend zone as a fraction of R·|O−C|.  0.1 ≈ 6–8° of
## arc on the globe surface at typical camera distances.
const HORIZON_BLEND_EPSILON: float = 0.1
## Rotation offset so bubble tail points toward the globe centre; tune to art.
const HORIZON_ROTATION_OFFSET: float = PI / 2.0
## Exponential-decay speed for bubble rotation smoothing (1/seconds, roughly).
const ROTATION_SMOOTH_SPEED: float = 10.0

signal crate_label_clicked(entity_id: int)
signal vehicle_label_clicked(vehicle_id: int)

var _canvas_layer: CanvasLayer = null
var _camera: Camera3D = null
var _globe: Node3D = null
var _globe_radius: float = 1.0
## entity_id (int) → { bubble: Control, anchor: Vector3, smooth_rotation: float }
var _crate_bubbles: Dictionary = {}
## vehicle_id (int) → { bubble: Control, anchor: Vector3, smooth_rotation: float }
var _vehicle_bubbles: Dictionary = {}
## Pin labels (route waypoint order): [{ bubble: Control, anchor: Vector3 }, ...]
var _pin_bubbles: Array = []


func init(canvas_layer: CanvasLayer, camera: Camera3D, globe: Node3D = null, globe_radius: float = 1.0) -> void:
	_canvas_layer = canvas_layer
	_camera = camera
	_globe = globe
	_globe_radius = globe_radius


## data: Array of { world_position: Vector3, destination_country: String, entity_id: int }
func set_crate_labels(data: Array) -> void:
	var seen: Dictionary = {}
	for item in data:
		if not item is Dictionary:
			continue
		var pos: Vector3 = item.get("world_position", Vector3.ZERO) as Vector3
		var dest: String = str(item.get("destination_country", ""))
		var eid: int = int(item.get("entity_id", -1))
		if eid < 0:
			continue
		seen[eid] = true
		if not _crate_bubbles.has(eid):
			if _canvas_layer == null or _camera == null:
				continue
			var bubble: Control = CARGO_BUBBLE_SCENE.instantiate() as Control
			if bubble == null:
				continue
			# Let clicks pass through so 3D raycast and IMSM get them (drag/select work).
			bubble.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var label_dest: Label = bubble.get_node_or_null("%LabelDestination") as Label
			if label_dest != null:
				label_dest.text = "→ " + dest
				label_dest.mouse_filter = Control.MOUSE_FILTER_IGNORE
			bubble.scale = CARGO_BUBBLE_SCALE
			_canvas_layer.add_child(bubble)
			_crate_bubbles[eid] = { "bubble": bubble, "anchor": pos, "smooth_rotation": 0.0 }
		else:
			_crate_bubbles[eid]["anchor"] = pos
			var b: Control = _crate_bubbles[eid].get("bubble", null)
			if is_instance_valid(b):
				var lbl: Label = b.get_node_or_null("%LabelDestination") as Label
				if lbl != null:
					lbl.text = "→ " + dest
	for eid in _crate_bubbles.keys():
		if not seen.has(eid):
			var entry: Dictionary = _crate_bubbles[eid]
			var b: Control = entry.get("bubble", null)
			if is_instance_valid(b):
				b.queue_free()
			_crate_bubbles.erase(eid)


## data: Array of { world_position: Vector3, display_name: String, vehicle_id: int, cargo_text: String }
func set_vehicle_labels(data: Array) -> void:
	var seen: Dictionary = {}
	for item in data:
		if not item is Dictionary:
			continue
		var pos: Vector3 = item.get("world_position", Vector3.ZERO) as Vector3
		var name_val: String = str(item.get("display_name", ""))
		var vid: int = int(item.get("vehicle_id", -1))
		var cargo_text: String = str(item.get("cargo_text", ""))
		if vid < 0:
			continue
		seen[vid] = true
		if not _vehicle_bubbles.has(vid):
			if _canvas_layer == null or _camera == null:
				continue
			var bubble: Control = VEHICLE_BUBBLE_SCENE.instantiate() as Control
			if bubble == null:
				continue
			# Let clicks pass through so 3D raycast and IMSM get them (vehicle drag/select work).
			bubble.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var label_name: Label = bubble.get_node_or_null("%LabelVehicleName") as Label
			if label_name != null:
				label_name.text = name_val
				label_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
			_set_vehicle_cargo_text(bubble, cargo_text)
			bubble.scale = CARGO_BUBBLE_SCALE
			_canvas_layer.add_child(bubble)
			_vehicle_bubbles[vid] = { "bubble": bubble, "anchor": pos, "smooth_rotation": 0.0 }
		else:
			_vehicle_bubbles[vid]["anchor"] = pos
			var b: Control = _vehicle_bubbles[vid].get("bubble", null)
			if is_instance_valid(b):
				var lbl: Label = b.get_node_or_null("%LabelVehicleName") as Label
				if lbl != null:
					lbl.text = name_val
				_set_vehicle_cargo_text(b, cargo_text)
	for vid in _vehicle_bubbles.keys():
		if not seen.has(vid):
			var entry: Dictionary = _vehicle_bubbles[vid]
			var b: Control = entry.get("bubble", null)
			if is_instance_valid(b):
				b.queue_free()
			_vehicle_bubbles.erase(vid)


## Set pin (waypoint) labels above route pins. world_positions: one per pin in route order.
## Uses pin_label.tscn: %StopNumber for pin index, %CargoDestinations filled with cargo_bubble_small.tscn per cargo.
## cargo_per_pin[i] = array of { "destination": String, "cargo_index": int } for that checkpoint.
func set_pin_labels(world_positions: PackedVector3Array, cargo_per_pin: Array = []) -> void:
	# Trim or grow to match count.
	while _pin_bubbles.size() > world_positions.size():
		var entry: Dictionary = _pin_bubbles.pop_back()
		var b: Control = entry.get("bubble", null)
		if is_instance_valid(b):
			b.queue_free()
	for i in world_positions.size():
		var anchor: Vector3 = world_positions[i]
		var label_text: String = str(i + 1)
		var cargo_dests: Array = []
		if i < cargo_per_pin.size() and cargo_per_pin[i] is Array:
			for item in cargo_per_pin[i]:
				if item is Dictionary:
					var dest: String = item.get("destination", "") if item.get("destination", "") is String else str(item.get("destination", ""))
					var cidx: int = int(item.get("cargo_index", 0))
					if not dest.is_empty():
						cargo_dests.append({ "destination": dest, "cargo_index": cidx })
		if i < _pin_bubbles.size():
			var entry: Dictionary = _pin_bubbles[i]
			entry["anchor"] = anchor
			var b: Control = entry.get("bubble", null)
			if is_instance_valid(b):
				var stop_lbl: Label = b.get_node_or_null("%StopNumber") as Label
				if stop_lbl != null:
					stop_lbl.text = label_text
			_update_pin_cargo_row(entry, cargo_dests, i)
			continue
		if _canvas_layer == null or _camera == null:
			continue
		var bubble: Control = PIN_LABEL_SCENE.instantiate() as Control
		if bubble == null:
			continue
		var stop_lbl: Label = bubble.get_node_or_null("%StopNumber") as Label
		if stop_lbl != null:
			stop_lbl.text = label_text
		bubble.scale = PIN_BUBBLE_SCALE
		_canvas_layer.add_child(bubble)
		var entry_dict: Dictionary = { "bubble": bubble, "anchor": anchor }
		_update_pin_cargo_row(entry_dict, cargo_dests, i)
		_pin_bubbles.append(entry_dict)


## Fill pin_label's %CargoDestinations with cargo_bubble_small instances (one per cargo). entry["bubble"] = pin_label Control.
func _update_pin_cargo_row(entry: Dictionary, cargo_dests: Array, pin_index: int) -> void:
	var bubble: Control = entry.get("bubble", null) as Control
	if not is_instance_valid(bubble):
		return
	var container: Control = bubble.get_node_or_null("%CargoDestinations") as Control
	if container == null:
		container = bubble.get_node_or_null("Layout/CargoDestinations") as Control
	if container == null:
		return
	# Clear existing cargo bubbles
	for child in container.get_children():
		child.queue_free()
	for item in cargo_dests:
		if not item is Dictionary:
			continue
		var text_val: String = item.get("destination", "") if item.get("destination", "") is String else str(item.get("destination", ""))
		var cargo_index: int = int(item.get("cargo_index", 0))
		var small: Control = CARGO_BUBBLE_SMALL_SCENE.instantiate() as Control
		if small == null:
			continue
		container.add_child(small)
		small.set_meta("pin_index", pin_index)
		small.set_meta("cargo_index", cargo_index)
		var lbl: Label = small.get_node_or_null("%LabelDestination") as Label
		if lbl == null:
			lbl = small.get_node_or_null("%Text") as Label
		if lbl != null:
			lbl.text = text_val
		var btn: Button = small.get_node_or_null("%ButtonUnload") as Button
		if btn == null:
			btn = small.get_node_or_null("%UnloadButton") as Button
		if btn != null:
			btn.pressed.connect(_on_pin_cargo_unload_pressed.bind(small))


func _on_pin_cargo_unload_pressed(slot: Control) -> void:
	var pi: int = int(slot.get_meta("pin_index", 0))
	var ci: int = int(slot.get_meta("cargo_index", 0))
	EventQueue.pin_cargo_unload_requested.emit(pi, ci)


func _process(delta: float) -> void:
	if _camera == null or _canvas_layer == null:
		return
	_process_crate_bubbles(delta)
	_process_vehicle_bubbles(delta)
	_process_pin_bubbles()


func _process_crate_bubbles(delta: float) -> void:
	for eid in _crate_bubbles.keys():
		var data: Dictionary = _crate_bubbles[eid]
		var bubble: Control = data.get("bubble", null)
		var anchor: Vector3 = data.get("anchor", Vector3.ZERO)
		if not is_instance_valid(bubble):
			continue
		_update_bubble(bubble, anchor, data, delta)


func _process_vehicle_bubbles(delta: float) -> void:
	for vid in _vehicle_bubbles.keys():
		var data: Dictionary = _vehicle_bubbles[vid]
		var bubble: Control = data.get("bubble", null)
		var anchor: Vector3 = data.get("anchor", Vector3.ZERO)
		if not is_instance_valid(bubble):
			continue
		_update_bubble(bubble, anchor, data, delta)


func _set_vehicle_cargo_text(bubble: Control, cargo_text: String) -> void:
	var label_cargo: Label = bubble.get_node_or_null("%LabelCargoList") as Label
	if label_cargo != null:
		label_cargo.text = cargo_text


## Common bubble positioning and rotation update.
## data dict must have "smooth_rotation" float entry.
func _update_bubble(bubble: Control, anchor: Vector3, data: Dictionary, delta: float) -> void:
	var blend: float = _get_horizon_blend(anchor)
	var anchor_2d: Vector2 = _camera.unproject_position(anchor)
	bubble.visible = true

	var target_rotation: float = 0.0
	if blend <= 0.0:
		bubble.position = anchor_2d
	else:
		var globe_2d: Vector2 = _camera.unproject_position(_globe.global_position)
		var horizon_pt: Vector2 = _horizon_intersection(globe_2d, anchor_2d)
		bubble.position = anchor_2d.lerp(horizon_pt, blend)
		var outward: Vector2 = bubble.position - globe_2d
		if outward.length_squared() > 1e-4:
			target_rotation = atan2(outward.y, outward.x) + HORIZON_ROTATION_OFFSET

	var smooth_rot: float = data["smooth_rotation"]
	smooth_rot = lerp_angle(smooth_rot, target_rotation, 1.0 - exp(-delta * ROTATION_SMOOTH_SPEED))
	data["smooth_rotation"] = smooth_rot
	bubble.rotation = smooth_rot

	# Keep inner label upright: flip by π when the bubble is upside-down.
	var label: Label = bubble.get_node_or_null("%LabelDestination") as Label
	if label == null:
		label = bubble.get_node_or_null("%LabelVehicleName") as Label
	if label != null:
		label.rotation = PI if cos(smooth_rot) < 0.0 else 0.0


# ---------------------------------------------------------------------------
# Horizon math
# ---------------------------------------------------------------------------

## Globe radius in world space, accounting for non-uniform node scale.
func _get_globe_radius_world() -> float:
	if _globe == null:
		return _globe_radius
	var basis: Basis = _globe.global_transform.basis
	return _globe_radius * (basis.x.length() + basis.y.length() + basis.z.length()) / 3.0


## Returns 0 when anchor is clearly in front of the horizon, 1 when clearly behind.
func _get_horizon_blend(anchor: Vector3) -> float:
	if _globe == null or _camera == null:
		return 0.0
	var C: Vector3 = _globe.global_position
	var O: Vector3 = _camera.global_position
	var R: float = _get_globe_radius_world()
	var signed: float = (anchor - C).dot(O - C) - R * R
	var zone: float = R * C.distance_to(O) * HORIZON_BLEND_EPSILON
	if zone < 1e-4:
		return 0.0 if signed >= 0.0 else 1.0
	return _smoothstep(zone, -zone, signed)


func _smoothstep(edge0: float, edge1: float, x: float) -> float:
	var t: float = clampf((x - edge0) / (edge1 - edge0), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


## Screen-space horizon circle: { center: Vector2, radius: float }.
func _get_horizon_circle() -> Dictionary:
	if _globe == null or _camera == null:
		return { "center": Vector2.ZERO, "radius": 100.0 }
	var C: Vector3 = _globe.global_position
	var O: Vector3 = _camera.global_position
	var R: float = _get_globe_radius_world()
	var CO: Vector3 = C - O
	var dist_sq: float = CO.length_squared()
	if dist_sq <= R * R:
		return { "center": _camera.unproject_position(C), "radius": 1.0 }
	var C_h: Vector3 = C - (R * R / dist_sq) * CO
	var r_h: float = R * sqrt(1.0 - R * R / dist_sq)
	var CO_norm: Vector3 = CO.normalized()
	var perp: Vector3 = CO_norm.cross(Vector3.UP)
	if perp.length_squared() < 0.01:
		perp = CO_norm.cross(Vector3.FORWARD)
	perp = perp.normalized()
	var P_h: Vector3 = C_h + perp * r_h
	var center_2d: Vector2 = _camera.unproject_position(C)
	var radius_2d: float = center_2d.distance_to(_camera.unproject_position(P_h))
	return { "center": center_2d, "radius": radius_2d }


## Pin labels (pin_label.tscn): position at anchor; hide when behind the globe.
func _process_pin_bubbles() -> void:
	if _camera == null or _globe == null:
		return
	for entry in _pin_bubbles:
		var bubble: Control = entry.get("bubble", null)
		var anchor: Vector3 = entry.get("anchor", Vector3.ZERO)
		if not is_instance_valid(bubble):
			continue
		var blend: float = _get_horizon_blend(anchor)
		var anchor_2d: Vector2 = _camera.unproject_position(anchor)
		if blend >= 1.0:
			bubble.visible = false
			continue
		bubble.visible = true
		bubble.position = anchor_2d
		bubble.rotation = 0.0


## Returns the point where the ray from `origin` through `target` intersects
## the screen-space horizon circle.
func _horizon_intersection(origin: Vector2, target: Vector2) -> Vector2:
	var circle: Dictionary = _get_horizon_circle()
	var c: Vector2 = circle.center
	var r: float = circle.radius
	var dir: Vector2 = target - origin
	var dir_len: float = dir.length()
	if dir_len < 1e-4:
		var fallback: Vector2 = origin - c
		return c + (fallback.normalized() if fallback.length_squared() > 1e-8 else Vector2(1.0, 0.0)) * r
	dir /= dir_len
	var oc: Vector2 = origin - c
	var b: float = 2.0 * oc.dot(dir)
	var disc: float = b * b - 4.0 * (oc.length_squared() - r * r)
	if disc < 0.0:
		return c + (target - c).normalized() * r
	var sq: float = sqrt(disc)
	var t0: float = (-b - sq) * 0.5
	var t1: float = (-b + sq) * 0.5
	var t: float = t0 if t0 > 0.0 else t1
	return origin + dir * t
