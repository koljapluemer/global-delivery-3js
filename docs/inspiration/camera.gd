extends Camera3D

## Azimuth/elevation orbit around the globe: right-drag horizontal = East/West, vertical = North/South.
## Latitude is clamped so the camera never looks directly at the poles. Target and distance from init(globe).

## Max latitude (degrees); camera cannot go over poles. 90 = no clamp.
const MAX_LATITUDE_DEG: float = 85.0
## Radians of orbit per pixel of mouse movement (at zoom_t = 1).
const ORBIT_SENSITIVITY: float = 0.004
## At min zoom (close), drag sensitivity is scaled by this. Keeps panning gentle when zoomed in.
const ROTATION_SCALE_AT_MIN_ZOOM: float = 0.1
## At max zoom (far), drag uses this scale (typically 1.0).
const ROTATION_SCALE_AT_MAX_ZOOM: float = 1.0
## Zoom step when at distance_min (finer control when zoomed in).
const ZOOM_SPEED_AT_MIN_DISTANCE: float = 0.005

@export var zoom_speed: float = 0.2
@export var distance_min: float = 2.05
@export var distance_max: float = 5
@export var focus_animate_duration: float = 0.4

var target: Vector3 = Vector3.ZERO
var distance: float = 4.0
## Longitude (East/West) and latitude (North/South) in radians. Y = North.
var longitude: float = 0.0
var latitude: float = 0.0

var _globe: Node3D = null
var _dragging: bool = false
var _is_animating_target: bool = false
var _locked_node: Node3D = null


func _ready() -> void:
	EventQueue.vehicle_selected.connect(_on_vehicle_selected_for_follow)
	EventQueue.vehicle_deselected.connect(unlock)


func init(globe: Node3D) -> void:
	_globe = globe
	_update_target()
	distance = (global_position - target).length()
	if distance < 0.001:
		distance = 4.0
	var offset: Vector3 = (global_position - target).normalized()
	latitude = asin(clamp(offset.y, -1.0, 1.0))
	longitude = atan2(offset.x, offset.z)
	_clamp_latitude()


func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event
		if mb.button_index == MOUSE_BUTTON_RIGHT:
			if mb.pressed:
				_update_target()
			_dragging = mb.pressed
			return
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			var zoom_t: float = (distance - distance_min) / maxf(distance_max - distance_min, 0.001)
			var step: float = lerpf(ZOOM_SPEED_AT_MIN_DISTANCE, zoom_speed, zoom_t)
			distance = clamp(distance - step, distance_min, distance_max)
			_apply_orbit()
			return
		if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			var zoom_t: float = (distance - distance_min) / maxf(distance_max - distance_min, 0.001)
			var step: float = lerpf(ZOOM_SPEED_AT_MIN_DISTANCE, zoom_speed, zoom_t)
			distance = clamp(distance + step, distance_min, distance_max)
			_apply_orbit()
			return

	if _dragging and event is InputEventMouseMotion:
		var mm: InputEventMouseMotion = event
		var zoom_t: float = (distance - distance_min) / maxf(distance_max - distance_min, 0.001)
		var drag_scale: float = lerpf(ROTATION_SCALE_AT_MIN_ZOOM, ROTATION_SCALE_AT_MAX_ZOOM, zoom_t)
		longitude -= mm.relative.x * ORBIT_SENSITIVITY * drag_scale
		latitude += mm.relative.y * ORBIT_SENSITIVITY * drag_scale
		_clamp_latitude()
		_apply_orbit()


func _update_target() -> void:
	if _globe:
		target = _globe.global_position


func _clamp_latitude() -> void:
	var max_lat_rad: float = deg_to_rad(MAX_LATITUDE_DEG)
	if max_lat_rad >= deg_to_rad(89.0):
		return
	latitude = clamp(latitude, -max_lat_rad, max_lat_rad)


func _spherical_dir(lon: float, lat: float) -> Vector3:
	var c: float = cos(lat)
	return Vector3(sin(lon) * c, sin(lat), cos(lon) * c)


func _apply_orbit() -> void:
	if not _is_animating_target:
		_update_target()
	var dir: Vector3 = _spherical_dir(longitude, latitude)
	global_position = target + dir * distance
	look_at(target)


## Lock camera to follow a moving node (used during DRIVE phase).
## The camera continuously tracks the node's position until unlock() is called.
## Lock camera to follow a moving node (used during DRIVE phase).
## Pans to the node first, then continuously tracks it until unlock() is called.
func lock_to_node(node: Node3D) -> void:
	_locked_node = node
	if is_instance_valid(node):
		# Pan to initial position; _process takes over tracking after animation.
		animate_center_on(node.global_position)


## Release the lock set by lock_to_node().
func unlock() -> void:
	_locked_node = null


func _process(_delta: float) -> void:
	# During DRIVE lock-follow: wait for initial animation to finish, then track continuously.
	if _locked_node != null and is_instance_valid(_locked_node) and not _is_animating_target:
		_update_target()
		var desired_dir: Vector3 = (_locked_node.global_position - target).normalized()
		if desired_dir.length_squared() > 0.0001:
			latitude = asin(clamp(desired_dir.y, -1.0, 1.0))
			longitude = atan2(desired_dir.x, desired_dir.z)
			_clamp_latitude()
			_apply_orbit()


func _on_vehicle_selected_for_follow(vehicle: Node3D) -> void:
	lock_to_node(vehicle)


func animate_center_on(world_position: Vector3, duration: float = -1.0) -> void:
	_update_target()
	var d: float = duration if duration > 0.0 else focus_animate_duration
	var desired_dir: Vector3 = (world_position - target).normalized()
	if desired_dir.length_squared() < 0.0001:
		return
	var desired_lat: float = asin(clamp(desired_dir.y, -1.0, 1.0))
	var desired_lon: float = atan2(desired_dir.x, desired_dir.z)
	var start_lon: float = longitude
	var start_lat: float = latitude
	_is_animating_target = true
	var tween: Tween = create_tween()
	tween.tween_method(func(t: float) -> void:
		longitude = lerp_angle(start_lon, desired_lon, t)
		latitude = lerpf(start_lat, desired_lat, t)
		_clamp_latitude()
		_apply_orbit()
	, 0.0, 1.0, d)
	tween.finished.connect(func() -> void:
		_is_animating_target = false
	)
