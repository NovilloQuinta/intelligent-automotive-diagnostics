package com.iad.dashboard;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Registro manual: ObdUsbPlugin no usa @CapacitorPlugin en la lista de
    // autodescubrimiento de plugins npm, es codigo nativo propio del proyecto.
    registerPlugin(ObdUsbPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
