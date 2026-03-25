import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import type { TileCentersApi } from '../../controller/layer_0/tile_centers_api'
import type { Plan } from '../../model/types/Plan'
import type { DerivedPlanState, DerivedJourneyStep, DerivedCargoStep } from '../../model/types/DerivedPlanState'
import { hsvColor, applyPrimaryColor } from './color_utils'
import crateUrl from '../../assets/items/crate.glb?url'
import carUrl from '../../assets/items/vehicles/car.glb?url'
import boatUrl from '../../assets/items/vehicles/boat.glb?url'
import pinUrl from '../../assets/ui/pin.glb?url'
import roundedArrowUrl from '../../assets/ui/rounded_arrow.glb?url'
import checkmarkUrl from '../../assets/ui/checkmark.png?url'
import smallBubbleUrl from '../../assets/ui/small_bubble.png?url'
import { ITEM_SCALE } from './render_constants'

/** How far to push each crate along the tile's outward surface normal, in world units. */
const CRATE_SURFACE_OFFSET = 0

/** Scale applied to each vehicle-movement pin. */
const PIN_SCALE = 0.02
/** How far to push each pin along the outward surface normal, in world units. */
const PIN_SURFACE_OFFSET = -0.02

/** How far to push route path lines above the surface, in world units. */
const PATH_LINE_SURFACE_OFFSET = 0.0
/** Route line thickness in screen pixels. */
const ROUTE_LINE_WIDTH = 3

/** Uniform scale applied to each cargo-loading arrow. */
const CARGO_ARROW_SCALE = 0.035
/** How far to push cargo arrows along the tile's outward surface normal, in world units. */
const CARGO_ARROW_SURFACE_OFFSET = 0.005

/** Opacity for ghost crates rendered at unloading destinations. */
const GHOST_CRATE_OPACITY = 0.1

/** Size of the checkmark sprite above delivered crates. */
const CHECKMARK_SCALE = 0.03

/** Size of the invalid-intent bubble sprite. */
const INVALID_BUBBLE_SCALE = 0.025

const UP = new THREE.Vector3(0, 1, 0)

/** Clone materials on meshes so each instance has its own; avoids shared emissive (hover highlight) across instances. */
function cloneMaterialsInObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (Array.isArray(child.material)) {
      child.material = child.material.map((m) => m.clone())
    } else {
      child.material = child.material.clone()
    }
  })
}

/** Maps VehicleType.meshPath values to their Vite-resolved asset URLs. */
const VEHICLE_MESH_URLS: Record<string, string> = {
  'assets/items/vehicles/car.glb': carUrl,
  'assets/items/vehicles/boat.glb': boatUrl,
}

export class GameItemRenderer {
  private readonly scene: THREE.Scene
  private readonly renderer: THREE.WebGLRenderer
  private objects: THREE.Object3D[] = []
  private pickables: THREE.Object3D[] = []
  private gltfCache = new Map<string, GLTF>()
  private textureCache = new Map<string, THREE.Texture>()
  private hoveredPickable: THREE.Object3D | null = null
  private hoveredLineOrigColor: THREE.Color | null = null

  constructor(scene: THREE.Scene, _navApi: import('../../controller/navigation').NavApi, renderer: THREE.WebGLRenderer) {
    this.scene = scene
    this.renderer = renderer
  }

  async render(
    plan: Plan,
    derived: DerivedPlanState,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
  ): Promise<void> {
    await this.renderInitialState(plan, derived, tileApi, globeCenter)
    await this.renderJourneySteps(plan, derived, tileApi, globeCenter)
    await this.renderCargoSteps(plan, derived, tileApi, globeCenter)
  }

  dispose(): void {
    this.hoveredPickable = null
    this.hoveredLineOrigColor = null
    for (const obj of this.objects) {
      this.scene.remove(obj)
      const o = obj as THREE.Object3D & { geometry?: { dispose(): void }; material?: { dispose(): void } | Array<{ dispose(): void }> }
      o.geometry?.dispose()
      if (Array.isArray(o.material)) { for (const m of o.material) m.dispose() }
      else o.material?.dispose()
    }
    this.objects = []
    this.pickables = []
  }

  getPickableObjects(): readonly THREE.Object3D[] {
    return this.pickables
  }

  setHovered(hitObject: THREE.Object3D | null): void {
    const root = hitObject ? this.findPickableRoot(hitObject) : null
    if (root === this.hoveredPickable) return
    if (this.hoveredPickable) this.applyHoverHighlight(this.hoveredPickable, false)
    this.hoveredPickable = root
    if (root) this.applyHoverHighlight(root, true)
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private findPickableRoot(obj: THREE.Object3D): THREE.Object3D {
    let cur: THREE.Object3D | null = obj
    while (cur) {
      if (this.pickables.includes(cur)) return cur
      cur = cur.parent
    }
    return obj
  }

  private applyHoverHighlight(root: THREE.Object3D, on: boolean): void {
    if (root instanceof Line2) {
      const mat = root.material as LineMaterial
      root.renderOrder = on ? 1 : 0
      if (on) {
        this.hoveredLineOrigColor = mat.color.clone()
        mat.color.lerp(new THREE.Color(1, 1, 1), 0.4)
      } else {
        if (this.hoveredLineOrigColor) {
          mat.color.copy(this.hoveredLineOrigColor)
          this.hoveredLineOrigColor = null
        }
      }
      return
    }

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial
        if (!('emissive' in m)) continue
        m.emissive.set(on ? 0xffffff : 0x000000)
        m.emissiveIntensity = on ? 0.3 : 0
      }
    })
  }

  private async renderInitialState(
    plan: Plan,
    derived: DerivedPlanState,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
  ): Promise<void> {
    const { initialSnapshot } = derived

    // Render vehicles
    for (const [vehicleId, tileId] of initialSnapshot.vehiclePositions) {
      const tile = tileApi.getTileById(tileId)
      if (!tile) continue
      const vehicle = plan.vehicles[vehicleId]
      if (!vehicle) continue
      const { vehicleType } = vehicle
      const url = VEHICLE_MESH_URLS[vehicleType.meshPath]
      if (!url) continue

      const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

      const obj = (await this.loadGltf(url)).scene.clone()
      cloneMaterialsInObject(obj)
      obj.scale.setScalar(ITEM_SCALE)
      obj.quaternion.setFromUnitVectors(UP, outwardNormal)
      obj.position.copy(tilePos).addScaledVector(outwardNormal, vehicleType.offsetAlongNormal)
      applyPrimaryColor(obj, hsvColor(vehicle.hue))
      const vehicleMeta = { entityType: 'VEHICLE', entityId: vehicleId }
      obj.userData = vehicleMeta
      obj.traverse((child) => { child.userData = vehicleMeta })

      this.scene.add(obj)
      this.objects.push(obj)
      this.pickables.push(obj)

      // Render crates loaded on this vehicle at their Cargo-XX slot positions
      const cargoIds = [...(initialSnapshot.vehicleCargo.get(vehicleId) ?? [])]
      if (cargoIds.length > 0) {
        obj.updateWorldMatrix(true, true)
        for (let slotIndex = 0; slotIndex < cargoIds.length; slotIndex++) {
          const crateId = cargoIds[slotIndex]
          const slotName = `Cargo-${String(slotIndex).padStart(2, '0')}`
          let slotObj: THREE.Object3D | null = null
          obj.traverse((child) => { if (child.name === slotName) slotObj = child })

          const crateObj = (await this.loadGltf(crateUrl)).scene.clone()
          cloneMaterialsInObject(crateObj)
          crateObj.scale.setScalar(ITEM_SCALE)

          if (slotObj) {
            const slotWorld = new THREE.Vector3()
            ;(slotObj as THREE.Object3D).getWorldPosition(slotWorld)
            crateObj.position.copy(slotWorld)
            crateObj.quaternion.setFromUnitVectors(UP, outwardNormal)
          } else {
            crateObj.position.copy(tilePos).addScaledVector(outwardNormal, vehicleType.offsetAlongNormal)
          }

          const crateMeta = { entityType: 'CRATE', entityId: crateId }
          crateObj.userData = crateMeta
          crateObj.traverse((child) => { child.userData = crateMeta })
          this.scene.add(crateObj)
          this.objects.push(crateObj)
          this.pickables.push(crateObj)
        }
      }
    }

    // Render crates on ground
    for (const [crateId, tileId] of initialSnapshot.crateOnGround) {
      const tile = tileApi.getTileById(tileId)
      if (!tile) continue

      const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

      const obj = (await this.loadGltf(crateUrl)).scene.clone()
      cloneMaterialsInObject(obj)
      obj.scale.setScalar(ITEM_SCALE)
      obj.quaternion.setFromUnitVectors(UP, outwardNormal)
      obj.position.copy(tilePos).addScaledVector(outwardNormal, CRATE_SURFACE_OFFSET)
      const crateMeta = { entityType: 'CRATE', entityId: crateId, tileId }
      obj.userData = crateMeta
      obj.traverse((child) => { child.userData = crateMeta })

      this.scene.add(obj)
      this.objects.push(obj)
      this.pickables.push(obj)
    }
  }

  private async renderJourneySteps(
    plan: Plan,
    derived: DerivedPlanState,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
  ): Promise<void> {
    for (const step of derived.steps) {
      if (step.kind !== 'JOURNEY') continue
      const journeyStep = step as DerivedJourneyStep

      for (const j of journeyStep.journeys) {
        const { vehicleId, toTileId, pathTileIds } = j
        const vehicle = plan.vehicles[vehicleId]
        if (!vehicle) continue

        const tile = tileApi.getTileById(toTileId)
        if (!tile) continue

        const color = hsvColor(vehicle.hue)
        const tilePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
        const outwardNormal = tilePos.clone().sub(globeCenter).normalize()

        // Pin at destination
        const pin = (await this.loadGltf(pinUrl)).scene.clone()
        cloneMaterialsInObject(pin)
        pin.scale.setScalar(PIN_SCALE)
        pin.quaternion.setFromUnitVectors(UP, outwardNormal)
        pin.position.copy(tilePos).addScaledVector(outwardNormal, PIN_SURFACE_OFFSET)
        applyPrimaryColor(pin, color)
        const pinMeta = { entityType: 'PIN', vehicleId, stepIndex: journeyStep.stepIndex }
        pin.userData = pinMeta
        pin.traverse((child) => { child.userData = pinMeta })
        this.scene.add(pin)
        this.objects.push(pin)
        this.pickables.push(pin)

        // Route line
        if (pathTileIds.length > 1) {
          // prevTile = vehicle position before this journey step
          const prevSnapshot =
            journeyStep.stepIndex > 0
              ? derived.stepSnapshots[journeyStep.stepIndex - 1]
              : derived.initialSnapshot
          const fromTileId = prevSnapshot.vehiclePositions.get(vehicleId)

          this.drawRouteLine(
            pathTileIds, tileApi, globeCenter, vehicle.vehicleType.offsetAlongNormal, color,
            {
              vehicleId,
              insertAfterStepIndex: journeyStep.stepIndex - 1,
              fromTileId: fromTileId ?? toTileId,
              toTileId,
            },
          )
        }
      }
    }
  }

  private async renderCargoSteps(
    plan: Plan,
    derived: DerivedPlanState,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
  ): Promise<void> {
    for (const step of derived.steps) {
      if (step.kind !== 'CARGO') continue
      const cargoStep = step as DerivedCargoStep

      // State snapshot BEFORE this cargo step
      const precedingSnapshot =
        cargoStep.stepIndex > 0
          ? derived.stepSnapshots[cargoStep.stepIndex - 1]
          : derived.initialSnapshot

      const { intent, valid, invalidReason } = cargoStep.action

      if (!valid) {
        const relevantTileId = this.getInvalidIntentTileId(intent, precedingSnapshot)
        if (relevantTileId !== undefined) {
          await this.renderInvalidIntentBubble(
            relevantTileId, cargoStep.stepIndex,
            invalidReason ?? 'Invalid', tileApi, globeCenter,
          )
        }
      } else {
        switch (intent.kind) {
          case 'LOAD': {
            const crateTileId = precedingSnapshot.crateOnGround.get(intent.crateId)
            const vehicleTileId = precedingSnapshot.vehiclePositions.get(intent.vehicleId)
            if (crateTileId !== undefined && vehicleTileId !== undefined) {
              const vehicle = plan.vehicles[intent.vehicleId]
              if (vehicle) {
                await this.renderCargoArrow(crateTileId, vehicleTileId, vehicle.hue, tileApi, globeCenter)
              }
            }
            break
          }
          case 'UNLOAD': {
            const vehicleTileId = precedingSnapshot.vehiclePositions.get(intent.vehicleId)
            const vehicle = plan.vehicles[intent.vehicleId]
            if (vehicleTileId !== undefined && vehicle) {
              await this.renderCargoArrow(vehicleTileId, intent.toTileId, vehicle.hue, tileApi, globeCenter)
              await this.renderGhostCrate(intent.crateId, intent.toTileId, cargoStep.stepIndex, tileApi, globeCenter, false)
            }
            break
          }
          case 'DELIVER': {
            const vehicleTileId = precedingSnapshot.vehiclePositions.get(intent.vehicleId)
            const vehicle = plan.vehicles[intent.vehicleId]
            if (vehicleTileId !== undefined && vehicle) {
              await this.renderCargoArrow(vehicleTileId, intent.toTileId, vehicle.hue, tileApi, globeCenter)
              await this.renderGhostCrate(intent.crateId, intent.toTileId, cargoStep.stepIndex, tileApi, globeCenter, true)
            }
            break
          }
        }
      }
    }
  }

  private getInvalidIntentTileId(
    intent: import('../../model/types/Plan').CargoIntent,
    snapshot: import('../../model/types/DerivedPlanState').WorldSnapshot,
  ): number | undefined {
    switch (intent.kind) {
      case 'LOAD':
        return snapshot.crateOnGround.get(intent.crateId)
      case 'UNLOAD':
      case 'DELIVER':
        return snapshot.vehiclePositions.get(intent.vehicleId)
    }
  }

  private async renderCargoArrow(
    fromTileId: number,
    toTileId: number,
    vehicleHue: number,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
  ): Promise<void> {
    const fromTile = tileApi.getTileById(fromTileId)
    const toTile = tileApi.getTileById(toTileId)
    if (!fromTile || !toTile) return

    const fromPos = new THREE.Vector3(fromTile.x, fromTile.z, -fromTile.y)
    const toPos = new THREE.Vector3(toTile.x, toTile.z, -toTile.y)

    const yAxis = fromPos.clone().sub(globeCenter).normalize()
    const toTarget = toPos.clone().sub(fromPos)
    const zAxis = toTarget.clone().sub(yAxis.clone().multiplyScalar(toTarget.dot(yAxis))).normalize()
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis)

    const arrow = (await this.loadGltf(roundedArrowUrl)).scene.clone()
    arrow.scale.setScalar(CARGO_ARROW_SCALE)
    arrow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis))
    arrow.position.copy(fromPos).addScaledVector(yAxis, CARGO_ARROW_SURFACE_OFFSET)
    applyPrimaryColor(arrow, hsvColor(vehicleHue))
    this.scene.add(arrow)
    this.objects.push(arrow)
  }

  private async renderGhostCrate(
    crateId: number,
    tileId: number,
    stepIndex: number,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
    isDelivery: boolean,
  ): Promise<void> {
    const tile = tileApi.getTileById(tileId)
    if (!tile) return

    const cratePos = new THREE.Vector3(tile.x, tile.z, -tile.y)
    const outwardNormal = cratePos.clone().sub(globeCenter).normalize()

    const ghost = (await this.loadGltf(crateUrl)).scene.clone()
    cloneMaterialsInObject(ghost)
    ghost.scale.setScalar(ITEM_SCALE)
    ghost.quaternion.setFromUnitVectors(UP, outwardNormal)
    ghost.position.copy(cratePos).addScaledVector(outwardNormal, CRATE_SURFACE_OFFSET)
    const ghostMeta = { entityType: 'GHOST_CRATE', crateId, stepIndex, tileId }
    ghost.userData = ghostMeta
    ghost.traverse((child) => {
      child.userData = ghostMeta
      if (!(child instanceof THREE.Mesh)) return
      const applyOpacity = (mat: THREE.Material) => {
        const cloned = (mat as THREE.MeshStandardMaterial).clone()
        cloned.transparent = true
        cloned.opacity = GHOST_CRATE_OPACITY
        return cloned
      }
      if (Array.isArray(child.material)) {
        child.material = child.material.map(applyOpacity)
      } else {
        child.material = applyOpacity(child.material)
      }
    })
    this.scene.add(ghost)
    this.objects.push(ghost)
    this.pickables.push(ghost)

    if (isDelivery) {
      // Checkmark sprite above ghost crate
      const texture = await this.loadTexture(checkmarkUrl)
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true })
      const sprite = new THREE.Sprite(spriteMat)
      sprite.scale.setScalar(CHECKMARK_SCALE)
      sprite.position.copy(cratePos).addScaledVector(outwardNormal, CRATE_SURFACE_OFFSET + 0.04)
      this.scene.add(sprite)
      this.objects.push(sprite)
    }
  }

  private async renderInvalidIntentBubble(
    tileId: number,
    stepIndex: number,
    _reason: string,
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
  ): Promise<void> {
    const tile = tileApi.getTileById(tileId)
    if (!tile) return

    const pos = new THREE.Vector3(tile.x, tile.z, -tile.y)
    const outwardNormal = pos.clone().sub(globeCenter).normalize()

    const texture = await this.loadTexture(smallBubbleUrl)
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, color: 0xff4444 })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.scale.setScalar(INVALID_BUBBLE_SCALE)
    sprite.position.copy(pos).addScaledVector(outwardNormal, 0.03)
    const meta = { entityType: 'INVALID_INTENT', stepIndex }
    sprite.userData = meta
    this.scene.add(sprite)
    this.objects.push(sprite)
    this.pickables.push(sprite)
  }

  private drawRouteLine(
    pathTileIds: number[],
    tileApi: TileCentersApi,
    globeCenter: THREE.Vector3,
    vehicleSurfaceOffset: number,
    color: THREE.Color,
    lineMeta: { vehicleId: number; insertAfterStepIndex: number; fromTileId: number; toTileId: number },
  ): void {
    const surfaceOffset = vehicleSurfaceOffset + PATH_LINE_SURFACE_OFFSET
    const positions: number[] = []
    for (const tileId of pathTileIds) {
      const tile = tileApi.getTileById(tileId)
      if (!tile) continue
      const pos = new THREE.Vector3(tile.x, tile.z, -tile.y)
      const normal = pos.clone().sub(globeCenter).normalize()
      const p = pos.clone().addScaledVector(normal, surfaceOffset)
      positions.push(p.x, p.y, p.z)
    }
    if (positions.length < 6) return

    const geometry = new LineGeometry()
    geometry.setPositions(positions)
    const resolution = this.renderer.getSize(new THREE.Vector2())
    const material = new LineMaterial({ color, linewidth: ROUTE_LINE_WIDTH, resolution })
    const line = new Line2(geometry, material)
    line.computeLineDistances()
    const meta = { entityType: 'ROUTE_LINE', ...lineMeta }
    line.userData = meta
    this.scene.add(line)
    this.objects.push(line)
    this.pickables.push(line)
  }

  private loadGltf(url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(url)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => { this.gltfCache.set(url, gltf); resolve(gltf) }, undefined, reject)
    })
  }

  private loadTexture(url: string): Promise<THREE.Texture> {
    const cached = this.textureCache.get(url)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (texture) => { this.textureCache.set(url, texture); resolve(texture) },
        undefined,
        reject,
      )
    })
  }
}
