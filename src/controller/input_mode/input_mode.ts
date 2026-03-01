export type InputMode =
  | { readonly kind: 'NORMAL' }
  | { readonly kind: 'PIN_PLACEMENT'; readonly vehicleId: number; readonly fromTileId: number }

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

  enterNormal(): void {
    this.mode = { kind: 'NORMAL' }
    this.emit()
  }

  private emit(): void { for (const l of this.listeners) l(this.mode) }
}
