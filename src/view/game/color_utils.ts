import * as THREE from 'three'

/**
 * Convert a hue (0–360) with fixed S=0.8, V=0.8 to a Three.js Color.
 * Uses HSV→HSL conversion since Three.js only exposes setHSL.
 */
export function hsvColor(hue: number): THREE.Color {
  const s = 0.8, v = 0.8
  const l = v * (1 - s / 2)
  const sl = (l === 0 || l === 1) ? 0 : (v - l) / Math.min(l, 1 - l)
  return new THREE.Color().setHSL(hue / 360, sl, l)
}

/**
 * Finds every mesh in `obj` whose material (or one of its materials) is named
 * "PrimaryMaterial", clones that material, and overwrites its color.
 * Cloning is required because GLB clones share the original material instances.
 */
export function applyPrimaryColor(obj: THREE.Object3D, color: THREE.Color): void {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (Array.isArray(child.material)) {
      child.material = child.material.map((mat: THREE.Material) => {
        if (mat.name !== 'PrimaryMaterial') return mat
        const cloned = (mat as THREE.MeshStandardMaterial).clone()
        cloned.color.copy(color)
        return cloned
      })
    } else {
      const mat = child.material as THREE.MeshStandardMaterial
      if (mat.name !== 'PrimaryMaterial') return
      child.material = mat.clone()
      ;(child.material as THREE.MeshStandardMaterial).color.copy(color)
    }
  })
}
