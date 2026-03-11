import * as THREE from 'three'

const ZOOM_MIN_RADIUS_FACTOR = 1.05
const ZOOM_MAX_RADIUS_FACTOR = 5.0
const ZOOM_INITIAL_FIT_MARGIN = 2

const MAX_LATITUDE_DEG = 85.0
const PAN_ANIMATION_DURATION_S = 0.3
const ORBIT_SENSITIVITY = 0.004
const ROTATION_SCALE_AT_MIN_ZOOM = 0.1
const ROTATION_SCALE_AT_MAX_ZOOM = 3.0
/** Zoom step as a fraction of current distance when fully zoomed in (small = slow). */
const ZOOM_SPEED_AT_MIN_DISTANCE = 0.005
/** Zoom step as a fraction of current distance when fully zoomed out (larger = faster). */
const ZOOM_SPEED_AT_MAX_DISTANCE = 0.2

export class MainCamera {
  readonly camera: THREE.PerspectiveCamera

  private target = new THREE.Vector3()
  private distance = 4.0
  private distanceMin = 2.05
  private distanceMax = 5.0
  private longitude = 0.0
  private latitude = 0.0
  private panElapsed = 0
  private panDuration = 0
  private panStartLongitude = 0
  private panStartLatitude = 0
  private panTargetLongitude = 0
  private panTargetLatitude = 0
  private dragging = false

  constructor(canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.dragging = true
    })
    canvas.addEventListener('mouseup', () => { this.dragging = false })
    canvas.addEventListener('mouseleave', () => { this.dragging = false })
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e))
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  /** Call after the globe loads. Sets target, computes lon/lat from initialPosition. */
  init(
    target: THREE.Vector3,
    initialPosition: THREE.Vector3,
    distanceMin: number,
    distanceMax: number
  ) {
    this.distanceMin = distanceMin
    this.distanceMax = distanceMax
    this.target.copy(target)

    const offset = initialPosition.clone().sub(target)
    this.distance = Math.max(distanceMin, Math.min(distanceMax, offset.length()))
    const dir = offset.length() > 0
      ? offset.clone().normalize()
      : new THREE.Vector3(0, 0, 1)
    this.latitude = Math.asin(Math.max(-1, Math.min(1, dir.y)))
    this.longitude = Math.atan2(dir.x, dir.z)
    this.clampLatitude()
    this.applyOrbit()
  }

  /** Fit the camera to the loaded globe. Call once after GlobeScene.load() resolves. */
  fitToGlobe(boundingSphere: THREE.Sphere): void {
    const { center, radius } = boundingSphere
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov)
    const fitDistance = (radius / Math.sin(fovRad / 2)) * ZOOM_INITIAL_FIT_MARGIN
    const distMin = radius * ZOOM_MIN_RADIUS_FACTOR
    const distMax = radius * ZOOM_MAX_RADIUS_FACTOR

    this.camera.near = distMin * 0.01
    this.camera.far = distMax * 2
    this.camera.updateProjectionMatrix()

    this.init(
      center,
      center.clone().add(new THREE.Vector3(0, 0, fitDistance)),
      distMin,
      distMax
    )
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** Orbit so the given world position is at screen center (simulates right-drag; target and distance unchanged). Animates over PAN_ANIMATION_DURATION_S. */
  panTo(worldPosition: THREE.Vector3): void {
    const d = worldPosition.clone().sub(this.target)
    if (d.lengthSq() < 1e-10) return
    d.normalize()
    const maxRad = THREE.MathUtils.degToRad(MAX_LATITUDE_DEG)
    this.panStartLongitude = this.longitude
    this.panStartLatitude = this.latitude
    this.panTargetLongitude = Math.atan2(d.x, d.z)
    this.panTargetLatitude = Math.max(-maxRad, Math.min(maxRad, Math.asin(Math.max(-1, Math.min(1, d.y)))))
    this.panElapsed = 0
    this.panDuration = PAN_ANIMATION_DURATION_S
  }

  /** Call each frame with delta in seconds to drive pan animation. */
  update(delta: number): void {
    if (this.panDuration <= 0) return
    this.panElapsed += delta
    const t = Math.min(1, this.panElapsed / this.panDuration)
    let dLon = this.panTargetLongitude - this.panStartLongitude
    while (dLon > Math.PI) dLon -= 2 * Math.PI
    while (dLon < -Math.PI) dLon += 2 * Math.PI
    this.longitude = this.panStartLongitude + dLon * t
    this.latitude = this.panStartLatitude + (this.panTargetLatitude - this.panStartLatitude) * t
    this.clampLatitude()
    this.applyOrbit()
    if (t >= 1) this.panDuration = 0
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.dragging) return
    const zoomT = (this.distance - this.distanceMin) /
      Math.max(this.distanceMax - this.distanceMin, 0.001)
    const dragScale = THREE.MathUtils.lerp(
      ROTATION_SCALE_AT_MIN_ZOOM,
      ROTATION_SCALE_AT_MAX_ZOOM,
      zoomT
    )
    this.longitude -= e.movementX * ORBIT_SENSITIVITY * dragScale
    this.latitude  += e.movementY * ORBIT_SENSITIVITY * dragScale
    this.clampLatitude()
    this.applyOrbit()
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    // Step is a fraction of current distance so it feels consistent at any scale.
    const zoomT = (this.distance - this.distanceMin) /
      Math.max(this.distanceMax - this.distanceMin, 0.001)
    const step = this.distance * THREE.MathUtils.lerp(ZOOM_SPEED_AT_MIN_DISTANCE, ZOOM_SPEED_AT_MAX_DISTANCE, zoomT)
    this.distance = Math.max(
      this.distanceMin,
      Math.min(this.distanceMax, this.distance + (e.deltaY > 0 ? step : -step))
    )
    this.applyOrbit()
  }

  private clampLatitude() {
    const maxRad = THREE.MathUtils.degToRad(MAX_LATITUDE_DEG)
    this.latitude = Math.max(-maxRad, Math.min(maxRad, this.latitude))
  }

  private sphericalDir(lon: number, lat: number): THREE.Vector3 {
    const c = Math.cos(lat)
    return new THREE.Vector3(Math.sin(lon) * c, Math.sin(lat), Math.cos(lon) * c)
  }

  private applyOrbit() {
    const dir = this.sphericalDir(this.longitude, this.latitude)
    this.camera.position.copy(this.target).addScaledVector(dir, this.distance)
    this.camera.lookAt(this.target)
  }
}
