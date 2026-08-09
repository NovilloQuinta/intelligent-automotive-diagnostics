import { Bluetooth, Usb, Wifi } from "lucide-react";
import type { Scenario } from "./types";

export const CONNECTION_TYPE_LABELS: Record<
  Scenario["connectionType"],
  string
> = {
  wifi: "WiFi / TCP",
  usb: "USB / Serial",
  bluetooth: "Bluetooth",
};

interface ConnectionTypeIconProps {
  readonly connectionType: Scenario["connectionType"];
}

export function ConnectionTypeIcon({ connectionType }: ConnectionTypeIconProps) {
  const iconMap = {
    wifi: <Wifi data-testid="connection-wifi" className="h-4 w-4" />,
    usb: <Usb data-testid="connection-usb" className="h-4 w-4" />,
    bluetooth: (
      <Bluetooth data-testid="connection-bluetooth" className="h-4 w-4" />
    ),
  };

  return (
    <span
      className="flex items-center rounded-md border border-white/10 bg-black/40 px-2 py-1.5"
      title={`Conexión ${connectionType.toUpperCase()}`}
    >
      {iconMap[connectionType]}
    </span>
  );
}
