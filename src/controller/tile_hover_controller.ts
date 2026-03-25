import { findFirstValidInsertionPoint } from './plan_deriver'
import { inputStateValue } from './input_mode/input_mode_machine'
import { hsvColor } from '../view/game/color_utils'
import { AvailableVehicleTypes } from '../model/db/vehicles'
import type { TileCenter } from './layer_0/tile_centers_api'
import type { DerivedPlanState } from '../model/types/DerivedPlanState'
import type { Plan } from '../model/types/Plan'
import type { PinPlacementPreview } from '../view/game/pin_placement_preview'
import type { CrateDropPreview } from '../view/game/crate_drop_preview'
import type { CrateLoadPreview } from '../view/game/crate_load_preview'
import type { VehiclePlacementPreview } from '../view/game/vehicle_placement_preview'
import type { TileCentersApi } from './layer_0/tile_centers_api'
import type { NavApi } from './navigation'
import type { Actor } from 'xstate'
import type { GlobePointer } from './globe_pointer'

export interface TileHoverControllerDeps {
  setLastHoveredTile: (tile: TileCenter | null) => void
  inputModeActor: Actor<typeof import('./input_mode/input_mode_machine').inputModeMachine>
  getDerived: () => DerivedPlanState
  getPlan: () => Plan
  getGlobeCenter: () => import('three').Vector3
  tileCentersApi: TileCentersApi
  navApi: NavApi
  pinPlacementPreview: PinPlacementPreview | null
  crateDropPreview: CrateDropPreview | null
  crateLoadPreview: CrateLoadPreview | null
  vehiclePlacementPreview: VehiclePlacementPreview | null
}

/** Build the pointer.onHover callback for tile-based preview updates. */
export function createTileHoverHandler(
  deps: TileHoverControllerDeps,
): GlobePointer['onHover'] {
  return (tile: TileCenter | null) => {
    deps.setLastHoveredTile(tile)
    const snapshot = deps.inputModeActor.getSnapshot()
    const state = inputStateValue(snapshot)
    const ctx = snapshot.context

    if (!tile || state === 'normal') {
      deps.pinPlacementPreview?.hide()
      deps.crateDropPreview?.hide()
      deps.crateLoadPreview?.hide()
      return
    }

    if (state === 'crateDrop') {
      deps.pinPlacementPreview?.hide()
      const plan = deps.getPlan()
      const derived = deps.getDerived()
      const crate = plan.crates[ctx.crateId!]
      const isDelivery = crate && tile.country_name === crate.destinationCountry
      const intent = isDelivery
        ? { kind: 'DELIVER' as const, crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId: tile.tile_id }
        : { kind: 'UNLOAD' as const, crateId: ctx.crateId!, vehicleId: ctx.vehicleId!, toTileId: tile.tile_id }
      const insertAfter = findFirstValidInsertionPoint(intent, derived)
      if (insertAfter !== null) {
        deps.inputModeActor.send({
          type: 'UPDATE_UNLOAD_TARGET',
          payload: { toTileId: tile.tile_id, isDelivery, insertAfterStepIndex: insertAfter },
        })
        const snap = derived.stepSnapshots[insertAfter]
        const vehicleTileId = snap.vehiclePositions.get(ctx.vehicleId!)
        if (vehicleTileId !== undefined && deps.crateDropPreview) {
          deps.crateDropPreview.update(
            tile,
            vehicleTileId,
            true,
            plan.vehicles[ctx.vehicleId!]?.hue ?? 0,
            deps.getGlobeCenter(),
            deps.tileCentersApi,
          )
        }
      } else {
        deps.inputModeActor.send({ type: 'UPDATE_UNLOAD_TARGET', payload: null })
        deps.crateDropPreview?.hide()
      }
      return
    }

    deps.crateDropPreview?.hide()
    if (state === 'crateLoad') return

    if (state === 'vehiclePlacement') {
      const vehicleType = AvailableVehicleTypes[ctx.vehicleTypeId ?? '']
      if (!vehicleType || !deps.vehiclePlacementPreview) return
      const derived = deps.getDerived()
      const isValid = deps.navApi.isTileOnNavMesh(tile.tile_id, vehicleType.navMesh)
        && !derived.occupiedTiles.has(tile.tile_id)
      void deps.vehiclePlacementPreview.update(tile, vehicleType, deps.getGlobeCenter(), isValid)
      return
    }

    const plan = deps.getPlan()
    const vehicle = plan.vehicles[ctx.vehicleId ?? -1]
    if (!vehicle || !deps.pinPlacementPreview) return

    const fromTileId =
      state === 'pinPlacement' ? ctx.fromTileId! :
      state === 'pinDrag' ? ctx.prevTileId! :
      ctx.fromTileId!

    const toTileId: number | undefined =
      state === 'pinDrag' ? ctx.nextTileId :
      state === 'routeSplit' ? ctx.toTileId :
      undefined

    deps.pinPlacementPreview.update(
      tile,
      fromTileId,
      vehicle.vehicleType.navMesh,
      vehicle.vehicleType.offsetAlongNormal,
      hsvColor(vehicle.hue),
      deps.getGlobeCenter(),
      deps.tileCentersApi,
      toTileId,
    )
  }
}
