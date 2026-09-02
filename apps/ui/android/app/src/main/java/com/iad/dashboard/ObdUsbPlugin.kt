package com.iad.dashboard

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbManager
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.util.SerialInputOutputManager
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

private const val ACTION_USB_PERMISSION = "com.iad.dashboard.USB_PERMISSION"

/**
 * Puente USB-serie para el ELM327, usando el mismo driver que AndrOBD
 * (usb-serial-for-android). El lado TypeScript espera exactamente el framing de
 * `reliableTransport.ts`: acumula bytes hasta ver el prompt `>` del ELM327, este
 * plugin solo transporta bytes crudos — el parseo del prompt vive en JS.
 *
 * No hay contraparte web: esta app solo corre en Android nativo, así que no
 * necesita implementar `WebPlugin`.
 */
@CapacitorPlugin(name = "ObdUsb")
class ObdUsbPlugin : Plugin() {
  private var driver: UsbSerialDriver? = null
  private var port: UsbSerialPort? = null
  private var ioManager: SerialInputOutputManager? = null
  private val ioExecutor = Executors.newSingleThreadExecutor()
  private var permissionCall: PluginCall? = null

  private val usbReceiver =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_USB_PERMISSION) return
        val call = permissionCall ?: return
        permissionCall = null
        val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
        val result = JSObject()
        result.put("granted", granted)
        call.resolve(result)
      }
    }

  override fun load() {
    super.load()
    val filter = IntentFilter(ACTION_USB_PERMISSION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      context.registerReceiver(usbReceiver, filter)
    }
  }

  /**
   * Busca un adaptador USB-serie conectado (CDC/FTDI/CP210x/CH340 — lo que traiga
   * el cable OTG-ELM327) y pide permiso al usuario si hace falta. Resuelve cuando
   * el dialogo del sistema se cierra, con `granted: false` si lo rechaza.
   */
  @PluginMethod
  fun requestPermission(call: PluginCall) {
    val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    val availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)
    if (availableDrivers.isEmpty()) {
      call.reject("No se detecta ningún adaptador USB. Comprueba el cable OTG y el ELM327.")
      return
    }
    val candidate = availableDrivers[0]
    driver = candidate

    if (usbManager.hasPermission(candidate.device)) {
      val result = JSObject()
      result.put("granted", true)
      call.resolve(result)
      return
    }

    permissionCall = call
    val flags =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    val permissionIntent =
      PendingIntent.getBroadcast(context, 0, Intent(ACTION_USB_PERMISSION), flags)
    usbManager.requestPermission(candidate.device, permissionIntent)
  }

  /**
   * Abre el puerto serie al baudrate indicado (38400 de fabrica del ELM327) y
   * arranca la lectura asincrona. Cada chunk que llegue se reenvia al JS como
   * evento `dataReceived`; el framing por el prompt `>` lo hace el lado TS.
   */
  @PluginMethod
  fun connect(call: PluginCall) {
    val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    val candidate = driver
    if (candidate == null) {
      call.reject("Llama a requestPermission() antes de connect().")
      return
    }
    val connection = usbManager.openDevice(candidate.device)
    if (connection == null) {
      call.reject("No se pudo abrir el dispositivo USB (¿permiso denegado?).")
      return
    }
    if (candidate.ports.isEmpty()) {
      call.reject("El adaptador USB no expone ningún puerto serie.")
      return
    }
    val openedPort = candidate.ports[0]
    try {
      openedPort.open(connection)
      val baudRate = call.getInt("baudRate", 38400) ?: 38400
      openedPort.setParameters(
        baudRate,
        UsbSerialPort.DATABITS_8,
        UsbSerialPort.STOPBITS_1,
        UsbSerialPort.PARITY_NONE,
      )
    } catch (e: Exception) {
      call.reject("Fallo al abrir el puerto serie: ${e.message}", e)
      return
    }
    port = openedPort

    val manager =
      SerialInputOutputManager(
        openedPort,
        object : SerialInputOutputManager.Listener {
          override fun onNewData(data: ByteArray) {
            val event = JSObject()
            event.put("data", String(data, StandardCharsets.ISO_8859_1))
            notifyListeners("dataReceived", event)
          }

          override fun onRunError(e: Exception) {
            val event = JSObject()
            event.put("message", e.message ?: "USB I/O error")
            notifyListeners("deviceDisconnected", event)
          }
        },
      )
    ioManager = manager
    ioExecutor.submit(manager)

    val result = JSObject()
    result.put("connected", true)
    call.resolve(result)
  }

  /**
   * Escribe un comando en el puerto. `data` ya trae el terminador `\r\n` puesto
   * por el lado TS, igual que hace `serialTransport.ts` con el ELM327 real.
   */
  @PluginMethod
  fun write(call: PluginCall) {
    val activePort = port
    if (activePort == null) {
      call.reject("Puerto no conectado.")
      return
    }
    val data = call.getString("data")
    if (data == null) {
      call.reject("Falta el parametro 'data'.")
      return
    }
    try {
      activePort.write(data.toByteArray(StandardCharsets.ISO_8859_1), 2000)
      call.resolve()
    } catch (e: Exception) {
      call.reject("Fallo al escribir en el puerto serie: ${e.message}", e)
    }
  }

  /** Cierra el puerto y detiene la lectura asincrona. Idempotente. */
  @PluginMethod
  fun disconnect(call: PluginCall) {
    closeQuietly()
    call.resolve()
  }

  private fun closeQuietly() {
    try {
      ioManager?.stop()
    } catch (_: Exception) {
      // best-effort
    }
    ioManager = null
    try {
      port?.close()
    } catch (_: Exception) {
      // best-effort
    }
    port = null
  }

  override fun handleOnDestroy() {
    closeQuietly()
    try {
      context.unregisterReceiver(usbReceiver)
    } catch (_: Exception) {
      // ya desregistrado
    }
    ioExecutor.shutdownNow()
    super.handleOnDestroy()
  }
}
