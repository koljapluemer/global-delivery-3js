import * as THREE from 'three'

const MAX_LATITUDE_DEG = 85.0
const ORBIT_SENSITIVITY = 0.004
const ROTATION_SCALE_AT_MIN_ZOOM = 0.1
const ROTATION_SCALE_AT_MAX_ZOOM = 3.0

export class MainCamera {
  readonly camera: THREE.PerspectiveCamera

  private target = new THREE.Vector3()
  private distance = 4.0
  private distanceMin = 2.05
  private distanceMax = 5.0
  private longitude = 0.0
  private latitude = 0.0
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
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false })
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

  setAspect(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
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
    const step = this.distance * THREE.MathUtils.lerp(0.005, 0.05, zoomT)
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
