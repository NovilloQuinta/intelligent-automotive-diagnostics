#!/usr/bin/env python3
"""
Launch ELM327-emulator with the built-in 'car' scenario (Toyota).

Patches the VIN in the ObdMessage dictionary before the emulator starts
so that the built-in 'car' scenario responds with a Toyota VIN.

Equivalent to: python -m elm -s car -n 35002
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from elm.obd_message import ObdMessage as _ObdMessage
from elm.obd_message import ECU_ADDR_E, ECU_R_ADDR_E, ELM_FOOTER, PA

# VIN patch — Toyota Auris Hybrid 2016
_ObdMessage["car"]["VIN"] = {
    "Request": "^0902" + ELM_FOOTER,
    "Descr": "Vehicle Identification Number (VIN)",
    "Header": ECU_ADDR_E,
    "Response": "014\r0: 49 02 01 4A 54 44\r1: 4B 4E 33 44 55 36\r2: 30 41 31 32 33 34\r3: 35 36\r\r>",
}
# JTDKN3DU60A123456

# Mode 22 DIDs — Toyota Auris Hybrid odometer
# Formula: (A<<24|B<<16|C<<8|D)/10 km
_ObdMessage["car"]["TCU_ODOMETER"] = {
    "Request": "^220300" + ELM_FOOTER,
    "Descr": "TCU Odometer (Toyota DID 0300)",
    "Header": ECU_ADDR_E,
    "Response": PA("00 03 C0 B8"),
    # 24594.4 km — TCU stored mileage
}
_ObdMessage["car"]["ECM_ODOMETER"] = {
    "Request": "^220400" + ELM_FOOTER,
    "Descr": "ECM Odometer (Toyota DID 0400)",
    "Header": ECU_ADDR_E,
    "Response": PA("00 01 86 A0"),
    # 10000 km — ECM stored mileage (less than TCU, plausible divergence)
}

sys.argv = ["elm", "-s", "car", "-n", "35002"]

from elm.interpreter import main

main()
