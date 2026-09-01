"""
Audi A3 2.0 TDI (EA288 CR) — OBD-II scenario for ELM327-emulator.

PIDs sourced from real SAE J1979 Mode 01 (diesel subset) and VAG Mode 22
DIDs documented by the Ross-Tech/VCDS community.

Values represent a warm engine at idle (~770 RPM, ~90 degC coolant) with
THREE ACTIVE FAULTS. Every out-of-range value below is evidence for one of
them — this scenario is the reasoning input of the cognitive diagnosis, so a
sensor reading that contradicts its own DTC would let the LLM "conclude"
nothing but the DTC description itself.

  P0301 — Cylinder 1 misfire (diesel: injector or compression)
      ENGINE_LOAD raised to ~31 %, RPM sagging below the 800 RPM target:
      the ECU compensates for a cylinder that contributes no torque.
      VAG_ENGINE_TORQUE and VAG_INJECTION_QTY rise for the same reason.

  P0401 — EGR insufficient flow
      EGR_ERROR strongly negative (~-60 %) against a commanded ~30 %:
      recirculation is requested and not obtained. MAF and
      VAG_INTAKE_AIR_MASS RISE as a consequence — with no exhaust gas
      displacing it, more fresh air enters. That relationship is
      counter-intuitive and is the most valuable clue in this scenario.

  P2002 — DPF efficiency below threshold
      CATALYST_TEMP raised to ~310 degC, VAG_DPF_SOOT at ~38 g (well past
      the ~24 g regeneration threshold) and VAG_DPF_DIFF_PRESS at ~45 mbar.

LIMITATION: a misfire produces an UNSTABLE idle, i.e. oscillation. The
ELM327 emulator answers with fixed frames and cannot express that. Only the
offset from nominal is represented here — do not read the steady value as a
smooth-running engine.

Every value not listed above stays in its normal range on purpose: a
scenario where everything is out of range diagnoses nothing.
"""
from elm.obd_message import (
    ECU_ADDR_E,
    ECU_R_ADDR_E,
    ECU_R_ADDR_T,
    ELM_FOOTER,
    HD,
    SZ,
    DT,
    PA,
)

# Functional addressing broadcast address (ISO 15765-4). A diagnostic tool
# sends 'AT SH 7DF' and every ECU on the bus answers from its own address.
BROADCAST_HEADER = "7DF"


ObdMessage = {
    # ==================================================================
    # Mode 01 — SAE J1979 Standard PIDs (diesel subset — no fuel trim,
    # no spark advance — those are gasoline-only)
    # ==================================================================

    # ---------------  PIDs 01-20  ---------------
    "ELM_PIDS_A": {
        "Request": "^0100" + ELM_FOOTER,
        "Descr": "Supported PIDs [01-20] (diesel bitmask)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("06") + DT("41 00 B8 3B A8 13"),
    },

    # ------------  PIDs 01-20, functional broadcast  ------------
    # Answers the ECU discovery scan, which addresses 7DF instead of a single
    # ECU. The emulator filters entries by the active header (elm.py:2081), so
    # this one and ELM_PIDS_A above can never match the same request:
    #
    #   AT SH 7E0 (default) -> ELM_PIDS_A, one line, feeds getSupportedPids()
    #   AT SH 7DF (scan)    -> this entry, one line per ECU
    #
    # Only two ECUs answer, and only these two are real: the engine (7E8) is
    # mandated by law to answer the generic broadcast (SAE J1979, emissions),
    # and the gearbox (7E1->7E9) is confirmed on the MQB platform (same
    # electrical architecture as this Audi A3 8V) with real captured CAN
    # traffic — github.com/mrfixpl/MQB-sniffer, a VW Golf MK7 2.0TDI+DSG.
    # A previous version of this scenario also answered from 7EA/7EB/7ED to
    # simulate more ECUs, but those addresses had no real source behind them
    # and, on a real VAG vehicle, modules like ABS or airbag do not answer a
    # generic 11-bit broadcast at all — they sit behind the proprietary
    # gateway (VCDS), unreachable by a plain ELM327-style scan like this one.
    #
    # Each HD/SZ/DT block is emitted on its own line, which is what the client
    # needs to collect the CAN headers. No PA() here on purpose: its answer
    # header would be 7DF + 8 = 7E7, outside the ISO 15765-4 response range.
    "ELM_PIDS_A_BROADCAST": {
        "Request": "^0100" + ELM_FOOTER,
        "Descr": "Supported PIDs [01-20] — the two ECUs answering the 7DF broadcast",
        "Header": BROADCAST_HEADER,
        "Response": (
            HD(ECU_R_ADDR_E) + SZ("06") + DT("41 00 B8 3B A8 13")
            + HD(ECU_R_ADDR_T) + SZ("06") + DT("41 00 98 18 00 01")
        ),
    },
    "MIL_STATUS": {
        "Request": "^0101" + ELM_FOOTER,
        "Descr": "MIL status and emissions monitors (PID 01) — MIL on, 3 DTCs, compression, monitors complete",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("06") + DT("41 01 83 7F FF FF"),
        # Byte A=0x83: MIL on (bit7=1), 3 DTCs stored (bits 0-6=3)
        # Byte B=0x7F: compression (bit3=1), common tests available (bits 0-2=1), common tests complete (bits 4-6=1)
        # Byte C=0xFF: all engine-specific monitors available
        # Byte D=0xFF: all engine-specific monitors completed
    },
    "FUEL_STATUS": {
        "Request": "^0103" + ELM_FOOTER,
        "Descr": "Fuel System Status (closed loop, diesel)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 03 04 00"),
    },
    "ENGINE_LOAD": {
        "Request": "^0104" + ELM_FOOTER,
        "Descr": "Calculated Engine Load",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 04 4F"),
        # 31.0 %  (A*100/255) — EVIDENCE P0301: a healthy 2.0 TDI idles near
        # 18 %; the ECU is compensating for cylinder 1 not contributing torque
    },
    "COOLANT_TEMP": {
        "Request": "^0105" + ELM_FOOTER,
        "Descr": "Engine Coolant Temperature",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 05 82"),
        # 90 degC  (A-40)
    },
    "INTAKE_PRESSURE": {
        "Request": "^010B" + ELM_FOOTER,
        "Descr": "Intake Manifold Absolute Pressure",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 0B 66"),
        # 102 kPa
    },
    "RPM": {
        "Request": "^010C" + ELM_FOOTER,
        "Descr": "Engine RPM",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 0C 0C 08"),
        # 770 RPM  ((A*256+B)/4) — EVIDENCE P0301: sagging below the 800 RPM
        # idle target. See the LIMITATION note in the module docstring: the
        # real symptom is oscillation, which fixed frames cannot express
    },
    "SPEED": {
        "Request": "^010D" + ELM_FOOTER,
        "Descr": "Vehicle Speed",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 0D 00"),
        # 0 km/h (idle)
    },
    "INTAKE_TEMP": {
        "Request": "^010F" + ELM_FOOTER,
        "Descr": "Intake Air Temperature",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 0F 4B"),
        # 35 degC  (A-40)
    },
    "MAF": {
        "Request": "^0110" + ELM_FOOTER,
        "Descr": "Mass Air Flow Rate",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 10 04 7E"),
        # 11.5 g/s  ((A*256+B)/100) — EVIDENCE P0401, and the counter-intuitive
        # one: airflow is ABOVE the ~8.5 g/s of a healthy idle because the
        # blocked EGR is not displacing intake air with exhaust gas
    },
    "THROTTLE_POS": {
        "Request": "^0111" + ELM_FOOTER,
        "Descr": "Throttle Position (diesel — intake flap)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 11 24"),
        # 14.1 %  (A*100/255) — apertura minima de la mariposa al ralenti
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
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 1F 04 B0"),
        # 1200 seconds (20 min) — NOT fault evidence: the previous 120 s was
        # simply incoherent with a 90 degC coolant. A diesel does not reach
        # operating temperature in two minutes
    },

    # ---------------  PIDs 21-40  ---------------
    "ELM_PIDS_B": {
        "Request": "^0120" + ELM_FOOTER,
        "Descr": "Supported PIDs [21-40] (diesel bitmask)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("06") + DT("41 20 80 01 A0 01"),
    },
    "COMMANDED_EGR": {
        "Request": "^012C" + ELM_FOOTER,
        "Descr": "Commanded EGR",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 2C 4D"),
        # 30.2 %  (A*100/255)
    },
    "EGR_ERROR": {
        "Request": "^012D" + ELM_FOOTER,
        "Descr": "EGR Error",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 2D 33"),
        # -60.2 %  ((A-128)*100/128) — EVIDENCE P0401: recirculation commanded
        # at 30.2 % and almost none obtained. A residual error would not
        # justify the DTC; this magnitude does
    },
    "FUEL_LEVEL": {
        "Request": "^012F" + ELM_FOOTER,
        "Descr": "Fuel Tank Level Input",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 2F A6"),
        # 65.1 %  (A*100/255)
    },
    "DISTANCE_SINCE_DTC_CLEAR": {
        "Request": "^0131" + ELM_FOOTER,
        "Descr": "Distance Travelled Since DTCs Cleared",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 31 00 96"),
        # 150 km
    },
    "BAROMETRIC_PRESSURE": {
        "Request": "^0133" + ELM_FOOTER,
        "Descr": "Barometric Pressure",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 33 65"),
        # 101 kPa
    },
    "CATALYST_TEMP_B1S1": {
        "Request": "^013C" + ELM_FOOTER,
        "Descr": "Catalyst Temperature Bank 1 Sensor 1",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 3C 0D AC"),
        # 310 degC  (((A*256+B)/10)-40) — EVIDENCE P2002: a healthy DOC idles
        # near 220 degC; a saturated DPF restricts flow and raises exhaust temp
    },

    # ---------------  PIDs 41-60  ---------------
    "ELM_PIDS_C": {
        "Request": "^0140" + ELM_FOOTER,
        "Descr": "Supported PIDs [41-60] (diesel bitmask)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("06") + DT("41 40 44 CC 00 21"),
    },
    "CONTROL_MODULE_VOLTAGE": {
        "Request": "^0142" + ELM_FOOTER,
        "Descr": "Control Module Voltage",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 42 37 78"),
        # 14.2 V  ((A*256+B)/1000) — alternador cargando
    },
    "AMBIANT_AIR_TEMP": {
        "Request": "^0146" + ELM_FOOTER,
        "Descr": "Ambient Air Temperature",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 46 41"),
        # 25 degC  (A-40)
    },
    "ACCELERATOR_POS_D": {
        "Request": "^0149" + ELM_FOOTER,
        "Descr": "Accelerator Pedal Position D",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 49 00"),
        # 0 % (idle — foot off pedal)
    },
    "THROTTLE_ACTUATOR": {
        "Request": "^014C" + ELM_FOOTER,
        "Descr": "Commanded Throttle Actuator Control",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 4C 00"),
        # 0 % (diesel intake flap closed at idle)
    },
    "TIME_RUN_WITH_MIL": {
        "Request": "^014D" + ELM_FOOTER,
        "Descr": "Time Run with MIL On",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 4D 00 00"),
        # 0 minutes (no MIL active)
    },
    "TIME_SINCE_DTC_CLEARED": {
        "Request": "^014E" + ELM_FOOTER,
        "Descr": "Time Since DTCs Cleared",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 4E 01 2C"),
        # 300 minutes
    },
    "FUEL_TYPE": {
        "Request": "^0151" + ELM_FOOTER,
        "Descr": "Fuel Type",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 51 04"),
        # 04 = Diesel (SAE J1979)
    },
    "ENGINE_OIL_TEMP": {
        "Request": "^015C" + ELM_FOOTER,
        "Descr": "Engine Oil Temperature",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 5C 7D"),
        # 85 degC  (A-40)
    },
    "ENGINE_FUEL_RATE": {
        "Request": "^015E" + ELM_FOOTER,
        "Descr": "Engine Fuel Rate",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 5E 00 0C"),
        # 0.6 L/h  ((A*256+B)/20)
    },

    # ==================================================================
    # Mode 09 — Vehicle Information
    # ==================================================================
    "VIN": {
        "Request": "^0902" + ELM_FOOTER,
        "Descr": "Vehicle Identification Number (VIN)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("14") + DT(
            "49 02 01 57 41 55 5A 5A 5A 38 56 35 4A 41 31 32 33 34 35 36"
        ),
        # WAUZZZ8V5JA123456 — Audi A3 2.0 TDI 2018
    },

    # ==================================================================
    # Mode 03 — Diagnostic Trouble Codes (emission related, SAE J2012)
    # P0301 = 03 01, P0401 = 04 01, P2002 = 20 02
    # ==================================================================
    "GET_DTC": {
        "Request": "^03" + ELM_FOOTER,
        "Descr": "DTCs: P0301 (Cylinder 1 Misfire), P0401 (EGR Insufficient Flow), P2002 (DPF Efficiency)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("07") + DT("43 03 01 04 01 20 02"),
    },

    # ==================================================================
    # Mode 02 — Freeze frame data (values at the moment P0301 fired)
    #
    # The frame describes a moment UNDER LOAD, not the current warm idle.
    # A misfire is registered while the engine is working, and the whole
    # argument for reading the freeze frame before clearing codes collapses
    # if these values are identical to the Mode 01 ones.
    # ==================================================================
    "FF_DTC": {
        "Request": "^0202" + ELM_FOOTER,
        "Descr": "Freeze frame owning DTC (P0301)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("42 02 03 01"),
    },
    "FF_LOAD": {
        "Request": "^0204" + ELM_FOOTER,
        "Descr": "Freeze frame engine load",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("42 04 9E"),
        # 62.0 %  (A*100/255) — engine working, not idling
    },
    "FF_COOLANT_TEMP": {
        "Request": "^0205" + ELM_FOOTER,
        "Descr": "Freeze frame coolant temperature",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("42 05 80"),
        # 88 degC  (A-40) — already at operating temperature
    },
    "FF_RPM": {
        "Request": "^020C" + ELM_FOOTER,
        "Descr": "Freeze frame RPM",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("42 0C 20 D0"),
        # 2100 RPM — under load when the misfire was detected
    },
    "FF_SPEED": {
        "Request": "^020D" + ELM_FOOTER,
        "Descr": "Freeze frame vehicle speed",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("42 0D 41"),
        # 65 km/h — the vehicle was moving, not standing still
    },
    "FF_THROTTLE": {
        "Request": "^0211" + ELM_FOOTER,
        "Descr": "Freeze frame throttle position",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("42 11 73"),
        # 45.1 %  (A*100/255) — intake flap well open, consistent with 62 % load
    },

    # ==================================================================
    # Mode 22 — VAG UDS ReadDataByIdentifier (real DIDs from Ross-Tech)
    #
    # Each entry uses PA(<hex payload>) which auto-generates the UDS
    # positive response: SID 0x62 + DID (2 bytes echoed from request)
    # + payload, all framed by the ISO-TP layer.
    # ==================================================================

    "VAG_RPM": {
        "Request": "^221130" + ELM_FOOTER,
        "Descr": "Engine Speed (VAG DID 1130)",
        "Header": ECU_ADDR_E,
        "Response": PA("0C 08"),
        # 770 RPM — same formula as SAE 0C: (A*256+B)*0.25. MUST match the
        # Mode 01 RPM: the same measurement read through two protocols
    },
    "VAG_BOOST_ACTUAL": {
        "Request": "^22115C" + ELM_FOOTER,
        "Descr": "Charge Air Pressure — Actual (VAG DID 115C)",
        "Header": ECU_ADDR_E,
        "Response": PA("03 FC"),
        # 1020 mbar — raw * 1
    },
    "VAG_BOOST_SPECIFIED": {
        "Request": "^22115E" + ELM_FOOTER,
        "Descr": "Charge Air Pressure — Specified (VAG DID 115E)",
        "Header": ECU_ADDR_E,
        "Response": PA("03 E8"),
        # 1000 mbar — raw * 1
    },
    "VAG_COOLANT_TEMP": {
        "Request": "^22F430" + ELM_FOOTER,
        "Descr": "Coolant Temperature (VAG DID F430)",
        "Header": ECU_ADDR_E,
        "Response": PA("5A"),
        # 90 degC — raw * 1 (VAG scaling)
    },
    "VAG_INTAKE_TEMP": {
        "Request": "^22F432" + ELM_FOOTER,
        "Descr": "Intake Air Temperature (VAG DID F432)",
        "Header": ECU_ADDR_E,
        "Response": PA("23"),
        # 35 degC — raw * 1
    },
    "VAG_FUEL_RAIL_ACTUAL": {
        "Request": "^22F477" + ELM_FOOTER,
        "Descr": "Fuel Rail Pressure — Actual (VAG DID F477)",
        "Header": ECU_ADDR_E,
        "Response": PA("6D 60"),
        # ~280 bar at idle — raw * 0.01 = bar (common rail diesel)
    },
    "VAG_FUEL_RAIL_SPECIFIED": {
        "Request": "^22F47D" + ELM_FOOTER,
        "Descr": "Fuel Rail Pressure — Specified (VAG DID F47D)",
        "Header": ECU_ADDR_E,
        "Response": PA("6B 6C"),
        # ~275 bar — raw * 0.01 = bar
    },
    "VAG_EGR_ACTUAL": {
        "Request": "^221035" + ELM_FOOTER,
        "Descr": "EGR Duty Cycle — Actual (VAG DID 1035)",
        "Header": ECU_ADDR_E,
        "Response": PA("05"),
        # 5 % — EVIDENCE P0401: actual duty far below the ~30 % commanded via
        # SAE PID 2C. Consistent with the -60 % EGR error
    },
    "VAG_ENGINE_TORQUE": {
        "Request": "^221250" + ELM_FOOTER,
        "Descr": "Engine Torque (VAG DID 1250)",
        "Header": ECU_ADDR_E,
        "Response": PA("00 34"),
        # 52 Nm at idle — EVIDENCE P0301: above the ~38 Nm of a healthy idle,
        # the three working cylinders covering for the fourth
    },
    "VAG_INJECTION_QTY": {
        "Request": "^221132" + ELM_FOOTER,
        "Descr": "Injection Quantity (VAG DID 1132)",
        "Header": ECU_ADDR_E,
        "Response": PA("02 6C"),
        # 6.2 mg/stroke at idle — raw * 0.01. EVIDENCE P0301: above the
        # ~4.0 mg/stroke of a healthy idle, more fuel to hold the target RPM
    },
    "VAG_INTAKE_AIR_MASS": {
        "Request": "^221184" + ELM_FOOTER,
        "Descr": "Intake Air Mass (VAG DID 1184)",
        "Header": ECU_ADDR_E,
        "Response": PA("02 62"),
        # 610 mg/stroke at idle — EVIDENCE P0401: above the ~480 mg/stroke of a
        # healthy idle, same cause as the raised MAF (no EGR displacing air)
    },
    "VAG_DPF_SOOT": {
        "Request": "^221410" + ELM_FOOTER,
        "Descr": "DPF Soot Mass Calculated (VAG DID 1410)",
        "Header": ECU_ADDR_E,
        "Response": PA("0E D8"),
        # 38.0 g — raw * 0.01. EVIDENCE P2002: well past the ~24 g at which a
        # VAG DPF requests regeneration, and into the range where the filter
        # can no longer be cleaned by a passive cycle
    },
    "VAG_DPF_DIFF_PRESS": {
        "Request": "^22140E" + ELM_FOOTER,
        "Descr": "DPF Differential Pressure (VAG DID 140E)",
        "Header": ECU_ADDR_E,
        "Response": PA("00 2D"),
        # 45 mbar at idle — raw * 1. EVIDENCE P2002: a clear filter reads
        # ~12 mbar at idle; this is the backpressure of a loaded one
    },
    "VAG_ACCEL_PEDAL": {
        "Request": "^22F449" + ELM_FOOTER,
        "Descr": "Accelerator Pedal Position (VAG DID F449)",
        "Header": ECU_ADDR_E,
        "Response": PA("00"),
        # 0 % — foot off pedal at idle
    },
    "VAG_BATTERY_VOLTAGE": {
        "Request": "^221462" + ELM_FOOTER,
        "Descr": "Battery Voltage (VAG DID 1462)",
        "Header": ECU_ADDR_E,
        "Response": PA("05 85"),
        # 14.1 V — raw / 100
    },
    "VAG_VEHICLE_SPEED": {
        "Request": "^22F40D" + ELM_FOOTER,
        "Descr": "Vehicle Speed (VAG DID F40D)",
        "Header": ECU_ADDR_E,
        "Response": PA("00"),
        # 0 km/h — stopped
    },
}
