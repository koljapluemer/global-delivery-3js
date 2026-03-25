import { inputStateValue } from './input_mode_machine'
import type { Actor } from 'xstate'
import type { CancelButton } from '../../view/ui/overlay/cancel_button'
import type { PinPlacementPreview } from '../../view/game/pin_placement_preview'
import type { CrateDropPreview } from '../../view/game/crate_drop_preview'
import type { CrateLoadPreview } from '../../view/game/crate_load_preview'
import type { CrateLoadMenu } from '../../view/ui/overlay/crate_load_menu'
import type { GameItemRenderer } from '../../view/game/game_item_renderer'
import type { VehiclePlacementPreview } from '../../view/game/vehicle_placement_preview'

export interface InputModeUIDeps {
  inputModeActor: Actor<typeof import('./input_mode_machine').inputModeMachine>
  cancelButton: CancelButton
  domElement: HTMLCanvasElement
  pinPlacementPreview: PinPlacementPreview | null
  crateDropPreview: CrateDropPreview | null
  crateLoadPreview: CrateLoadPreview | null
  vehiclePlacementPreview: VehiclePlacementPreview | null
  closeActiveMenu: () => void
  crateLoadMenu: CrateLoadMenu
  gameItemRenderer: GameItemRenderer
}

export function subscribeInputModeUI(deps: InputModeUIDeps): void {
  const {
    inputModeActor,
    cancelButton,
    domElement,
    pinPlacementPreview,
    crateDropPreview,
    crateLoadPreview,
    vehiclePlacementPreview,
    closeActiveMenu,
    crateLoadMenu,
    gameItemRenderer,
  } = deps
  inputModeActor.subscribe((snapshot) => {
    const state = inputStateValue(snapshot)
    const isNormal = state === 'normal'
    const isPinPlacement = state === 'pinPlacement'
    const isCrateDrop = state === 'crateDrop'
    const isCrateLoad = state === 'crateLoad'
    const isPinDrag = state === 'pinDrag'
    const isRouteSplit = state === 'routeSplit'
    const isVehiclePlacement = state === 'vehiclePlacement'
    const needsCancel = isPinPlacement || isCrateDrop || isCrateLoad
    cancelButton[needsCancel ? 'show' : 'hide']()
    domElement.style.cursor =
      isPinPlacement || isCrateDrop || isCrateLoad || isVehiclePlacement
        ? 'crosshair'
        : isPinDrag || isRouteSplit
          ? 'grabbing'
          : ''
    if (isNormal) {
      pinPlacementPreview?.hide()
      crateDropPreview?.hide()
      crateLoadPreview?.hide()
      vehiclePlacementPreview?.hide()
      closeActiveMenu()
      crateLoadMenu.hide()
    }
    if (!isNormal) gameItemRenderer.setHovered(null)
  })
}
