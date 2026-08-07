#!/usr/bin/env python3
"""
Launch ELM327-emulator with the Audi A3 2.0 TDI scenario.

Patches the built-in ObdMessage dictionary before the emulator starts
so that 'audi-a3-tdi' is available as a native scenario via -s flag.

Equivalent to: python -m elm -s audi-a3-tdi -n 35000
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import elm.obd_message as _obm
from scenarios.audi_a3_tdi import ObdMessage as _AudiObdMsg

_obm.ObdMessage["audi-a3-tdi"] = _AudiObdMsg

del _AudiObdMsg

sys.argv = ["elm", "-s", "audi-a3-tdi", "-n", "35000"]

from elm.interpreter import main

main()
