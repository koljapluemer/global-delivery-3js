export type InputMode =
  | { readonly kind: 'NORMAL' }
  | { readonly kind: 'PIN_PLACEMENT'; readonly vehicleId: number; readonly fromTileId: number }
  | { readonly kind: 'PIN_DRAG'; readonly vehicleId: number; readonly stepIndex: number;
      readonly prevTileId: number; readonly nextTileId: number | undefined }
  | { readonly kind: 'ROUTE_SPLIT'; readonly vehicleId: number; readonly insertAfterStepIndex: number;
      readonly fromTileId: number; readonly toTileId: number }
  | { readonly kind: 'CRATE_DROP'; readonly vehicleId: number;
      readonly stepIndex: number; readonly crateId: number }

export type ModeChangeListener = (mode: InputMode) => void

export class InputModeController {
  private mode: InputMode = { kind: 'NORMAL' }
  private readonly listeners: ModeChangeListener[] = []

  getMode(): InputMode { return this.mode }

  onChange(listener: ModeChangeListener): void { this.listeners.push(listener) }

  enterPinPlacement(vehicleId: number, fromTileId: number): void {
    this.mode = { kind: 'PIN_PLACEMENT', vehicleId, fromTileId }
    this.emit()
  }

  enterPinDrag(vehicleId: number, stepIndex: number, prevTileId: number, nextTileId?: number): void {
    this.mode = { kind: 'PIN_DRAG', vehicleId, stepIndex, prevTileId, nextTileId }
    this.emit()
  }

  enterRouteSplit(vehicleId: number, insertAfterStepIndex: number, fromTileId: number, toTileId: number): void {
    this.mode = { kind: 'ROUTE_SPLIT', vehicleId, insertAfterStepIndex, fromTileId, toTileId }
    this.emit()
  }

  enterCrateDrop(vehicleId: number, stepIndex: number, crateId: number): void {
    this.mode = { kind: 'CRATE_DROP', vehicleId, stepIndex, crateId }
    this.emit()
  }

  enterNormal(): void {
    this.mode = { kind: 'NORMAL' }
    this.emit()
  }

  private emit(): void { for (const l of this.listeners) l(this.mode) }
}
