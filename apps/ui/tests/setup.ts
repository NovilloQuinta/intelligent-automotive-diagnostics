import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'

/**
 * APIs de DOM que jsdom no implementa y que Radix necesita para abrir un `Select`.
 *
 * Sin ellas, `userEvent.click` sobre el trigger lanza "target.hasPointerCapture is
 * not a function" y los desplegables quedan sin poder probarse. No son mocks de
 * logica nuestra: son huecos de jsdom respecto al DOM real.
 */
beforeAll(() => {
  const proto = window.HTMLElement.prototype
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => undefined
  proto.releasePointerCapture ??= () => undefined
  proto.scrollIntoView ??= () => undefined
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})
