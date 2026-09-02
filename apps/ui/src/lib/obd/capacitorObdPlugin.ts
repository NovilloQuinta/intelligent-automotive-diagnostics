/**
 * Interfaz TS del plugin nativo `ObdUsb` (Kotlin, `usb-serial-for-android`),
 * definido en `android/app/src/main/java/com/iad/dashboard/ObdUsbPlugin.kt`.
 * Solo transporta bytes crudos por USB; el framing por el prompt `>` y toda la
 * logica del protocolo ELM327 viven en TypeScript ({@link ./reliableTransport}).
 */
import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export interface ObdUsbRequestPermissionResult {
  readonly granted: boolean
}

export interface ObdUsbConnectOptions {
  readonly baudRate: number
}

export interface ObdUsbConnectResult {
  readonly connected: boolean
}

export interface ObdUsbWriteOptions {
  readonly data: string
}

export interface ObdUsbDataEvent {
  readonly data: string
}

export interface ObdUsbDisconnectedEvent {
  readonly message: string
}

export interface ObdUsbPlugin {
  requestPermission(): Promise<ObdUsbRequestPermissionResult>
  connect(options: ObdUsbConnectOptions): Promise<ObdUsbConnectResult>
  write(options: ObdUsbWriteOptions): Promise<void>
  disconnect(): Promise<void>
  addListener(
    eventName: 'dataReceived',
    listener: (event: ObdUsbDataEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'deviceDisconnected',
    listener: (event: ObdUsbDisconnectedEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const ObdUsb = registerPlugin<ObdUsbPlugin>('ObdUsb')
