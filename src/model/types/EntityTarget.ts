export type EntityTarget =
  | { readonly kind: 'VEHICLE'; readonly id: number }
  | { readonly kind: 'CRATE'; readonly id: number }
