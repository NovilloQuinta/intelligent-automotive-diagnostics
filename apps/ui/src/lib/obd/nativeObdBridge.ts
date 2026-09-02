/**
 * Punto unico de acceso al servicio OBD nativo — perezoso, y solo relevante en
 * el APK Android (Capacitor). En el navegador normal `isNativePlatform()` es
 * siempre `false` y nada de este modulo llega a instanciarse.
 */
import { Capacitor } from '@capacitor/core'
import { NativeObdService } from './nativeObdService'

let instance: NativeObdService | null = null

/** True solo dentro de la app Android empaquetada con Capacitor. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/** Servicio OBD nativo, creado una sola vez y reutilizado mientras la app viva. */
export function getNativeObdService(): NativeObdService {
  instance ??= new NativeObdService()
  return instance
}
