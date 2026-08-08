"""
Kawasaki Z900 (948cc Inline-4) — OBD-II scenario for ELM327-emulator.

Motorcycle-specific PIDs sourced from SAE J1979 Mode 01 (gasoline subset).
No DTCs, no freeze frame — clean bike at idle (~1300 RPM, ~95 degC).

Motorcycles typically lack MAF, EGR, DPF, and VVT sensors. They use
speed-density (MAP/IAT/RPM) for fuel calculation.

This scenario is the HEALTHY CONTROL GROUP against the faulty Audi. Every
value must stay inside its normal range: if the healthy vehicle also reads
oddly, the contrast carries no information and no value means anything.
"""
from elm.obd_message import (
    ECU_ADDR_E,
    ECU_R_ADDR_E,
    ELM_FOOTER,
    HD,
    SZ,
    DT,
)

ObdMessage = {
    # ==================================================================
    # Mode 01 — SAE J1979 Standard PIDs (gasoline, motorcycle subset)
    # ==================================================================

    # ---------------  PIDs 01-20  ---------------
    "ELM_PIDS_A": {
        "Request": "^0100" + ELM_FOOTER,
        "Descr": "Supported PIDs [01-20] (motorcycle bitmask)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("06") + DT("41 00 98 1B A0 13"),
        # Supports: 03(fuel status), 04(engine load), 05(coolant), 0B(MAP),
        #           0C(RPM), 0D(speed), 0F(intake temp), 10(MAF — not actually
        #           present but bit set for compatibility), 11(throttle),
        #           1C(OBD compliance), 1F(run time)
    },
    "FUEL_STATUS": {
        "Request": "^0103" + ELM_FOOTER,
        "Descr": "Fuel System Status (closed loop, gasoline)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 03 02 00"),
        # Closed loop, using oxygen sensor
    },
    "ENGINE_LOAD": {
        "Request": "^0104" + ELM_FOOTER,
        "Descr": "Calculated Engine Load",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 04 2E"),
        # 18.0 %  (A*100/255) — the previous 58 % is a mid-load figure, not an
        # idle one. This bike is the healthy control group: no value of its own
        # may sit out of range, or the contrast against the Audi means nothing
    },
    "COOLANT_TEMP": {
        "Request": "^0105" + ELM_FOOTER,
        "Descr": "Engine Coolant Temperature",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 05 87"),
        # 95 degC  (A-40)
    },
    "INTAKE_PRESSURE": {
        "Request": "^010B" + ELM_FOOTER,
        "Descr": "Intake Manifold Absolute Pressure",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 0B 28"),
        # 40 kPa — sport bike at idle with individual throttle bodies
    },
    "RPM": {
        "Request": "^010C" + ELM_FOOTER,
        "Descr": "Engine RPM",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 0C 14 50"),
        # 1300 RPM  ((A*256+B)/4) — inline-4 idle
    },
    "SPEED": {
        "Request": "^010D" + ELM_FOOTER,
        "Descr": "Vehicle Speed",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 0D 00"),
        # 0 km/h (neutral, standstill)
    },
    "INTAKE_TEMP": {
        "Request": "^010F" + ELM_FOOTER,
        "Descr": "Intake Air Temperature",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 0F 44"),
        # 28 degC  (A-40)
    },
    "THROTTLE_POS": {
        "Request": "^0111" + ELM_FOOTER,
        "Descr": "Throttle Position",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 11 85"),
        # 52.2 %  (A*100/255) — acelerando
    },
    "OBD_COMPLIANCE": {
        "Request": "^011C" + ELM_FOOTER,
        "Descr": "OBD Standards Compliance",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 1C 06"),
        # EOBD (Europe)
    },
    "RUN_TIME": {
        "Request": "^011F" + ELM_FOOTER,
        "Descr": "Engine Run Time Since Start",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 1F 00 3C"),
        # 60 seconds
    },

    # ---------------  PIDs 21-40  ---------------
    "ELM_PIDS_B": {
        "Request": "^0120" + ELM_FOOTER,
        "Descr": "Supported PIDs [21-40] (motorcycle bitmask)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("06") + DT("41 20 80 00 80 01"),
        # Supports: 21(distance MIL), 2F(fuel level), 33(barometric pressure)
    },
    "DISTANCE_WITH_MIL": {
        "Request": "^0121" + ELM_FOOTER,
        "Descr": "Distance Travelled with MIL On",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 21 00 00"),
        # 0 km — no MIL active
    },
    "FUEL_LEVEL": {
        "Request": "^012F" + ELM_FOOTER,
        "Descr": "Fuel Tank Level Input",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 2F 80"),
        # 50.2 %  (A*100/255) — half tank
    },
    "BAROMETRIC_PRESSURE": {
        "Request": "^0133" + ELM_FOOTER,
        "Descr": "Barometric Pressure",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 33 65"),
        # 101 kPa
    },

    # ---------------  PIDs 41-60  ---------------
    "ELM_PIDS_C": {
        "Request": "^0140" + ELM_FOOTER,
        "Descr": "Supported PIDs [41-60] (motorcycle bitmask)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("06") + DT("41 40 44 00 00 01"),
        # Supports: 42(module voltage), 46(ambient temp), 5E(fuel rate)
    },
    "CONTROL_MODULE_VOLTAGE": {
        "Request": "^0142" + ELM_FOOTER,
        "Descr": "Control Module Voltage",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 42 2A 94"),
        # 10.9 V  ((A*256+B)/1000) — fallo de carga: bateria/alternador
    },
    "AMBIANT_AIR_TEMP": {
        "Request": "^0146" + ELM_FOOTER,
        "Descr": "Ambient Air Temperature",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 46 3C"),
        # 20 degC  (A-40)
    },
    "ENGINE_FUEL_RATE": {
        "Request": "^015E" + ELM_FOOTER,
        "Descr": "Engine Fuel Rate",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 5E 00 04"),
        # 0.2 L/h  ((A*256+B)/20) — inline-4 at idle
    },

    # ==================================================================
    # Mode 03 — Diagnostic Trouble Codes
    # No DTCs on this bike — returns NO DATA. The emulator will respond
    # with "NO DATA" when no DTCs are stored, which the adapter handles.
    # ==================================================================

    # ==================================================================
    # Mode 02 — Freeze Frame
    # No freeze frame data (no DTCs stored).
    # ==================================================================

    # ==================================================================
    # Mode 09 — Vehicle Information
    # ==================================================================
    "VIN": {
        "Request": "^0902" + ELM_FOOTER,
        "Descr": "Vehicle Identification Number (VIN)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("14") + DT(
            "49 02 01 4A 4B 41 5A 52 32 41 31 58 4C 41 30 30 30 31 31 31"
        ),
        # JKAZR2A1XLA000111 — Kawasaki Z900 2020
    },
}
