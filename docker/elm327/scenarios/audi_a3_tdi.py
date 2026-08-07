"""
Audi A3 2.0 TDI (EA288 CR) — OBD-II scenario for ELM327-emulator.

PIDs sourced from real SAE J1979 Mode 01 (diesel subset) and VAG Mode 22
DIDs documented by the Ross-Tech/VCDS community.

Values represent a warm engine at idle (~800 RPM, ~90 degC coolant).
"""
from elm.obd_message import (
    ECU_ADDR_E,
    ECU_R_ADDR_E,
    ELM_FOOTER,
    HD,
    SZ,
    DT,
    PA,
)

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
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 04 40"),
        # 25.1 %  (A*100/255)
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
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 0C 0C 80"),
        # 800 RPM  ((A*256+B)/4)
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
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 10 03 52"),
        # 8.5 g/s  ((A*256+B)/100)
    },
    "THROTTLE_POS": {
        "Request": "^0111" + ELM_FOOTER,
        "Descr": "Throttle Position (diesel — intake flap)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 11 00"),
        # 0 % at idle (diesel intake flap closed, EGR handles air)
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
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 1F 00 78"),
        # 120 seconds
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
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("41 2D 7A"),
        # -4.7 %  ((A-128)*100/128) — slight EGR flow lower than commanded
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
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 3C 0A 28"),
        # 220 degC  (((A*256+B)/10)-40) — warm DOC at idle
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
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("41 42 37 14"),
        # 14.1 V  ((A*256+B)/1000)
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
    # ==================================================================
    "FF_RPM": {
        "Request": "^020C" + ELM_FOOTER,
        "Descr": "Freeze frame RPM (moment of P0301)",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("04") + DT("42 0C 0C 80"),
        # 800 RPM — surged from idle when misfire occurred
    },
    "FF_COOLANT_TEMP": {
        "Request": "^0205" + ELM_FOOTER,
        "Descr": "Freeze frame coolant temperature",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("42 05 82"),
        # 90 degC  (A-40)
    },
    "FF_SPEED": {
        "Request": "^020D" + ELM_FOOTER,
        "Descr": "Freeze frame vehicle speed",
        "Header": ECU_ADDR_E,
        "Response": HD(ECU_R_ADDR_E) + SZ("03") + DT("42 0D 00"),
        # 0 km/h — misfire at standstill
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
        "Response": PA("0C 80"),
        # 800 RPM — same formula as SAE 0C: (A*256+B)*0.25
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
        "Response": PA("1C"),
        # 28 % — raw * 1 percentage
    },
    "VAG_ENGINE_TORQUE": {
        "Request": "^221250" + ELM_FOOTER,
        "Descr": "Engine Torque (VAG DID 1250)",
        "Header": ECU_ADDR_E,
        "Response": PA("00 26"),
        # 38 Nm at idle
    },
    "VAG_INJECTION_QTY": {
        "Request": "^221132" + ELM_FOOTER,
        "Descr": "Injection Quantity (VAG DID 1132)",
        "Header": ECU_ADDR_E,
        "Response": PA("00 28"),
        # 4.0 mg/stroke at idle — raw * 0.01
    },
    "VAG_INTAKE_AIR_MASS": {
        "Request": "^221184" + ELM_FOOTER,
        "Descr": "Intake Air Mass (VAG DID 1184)",
        "Header": ECU_ADDR_E,
        "Response": PA("01 E0"),
        # 480 mg/stroke at idle
    },
    "VAG_DPF_SOOT": {
        "Request": "^221410" + ELM_FOOTER,
        "Descr": "DPF Soot Mass Calculated (VAG DID 1410)",
        "Header": ECU_ADDR_E,
        "Response": PA("00 50"),
        # 8.0 g — raw * 0.01 for measured soot
    },
    "VAG_DPF_DIFF_PRESS": {
        "Request": "^22140E" + ELM_FOOTER,
        "Descr": "DPF Differential Pressure (VAG DID 140E)",
        "Header": ECU_ADDR_E,
        "Response": PA("00 0C"),
        # 12 mbar at idle — raw * 1
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
