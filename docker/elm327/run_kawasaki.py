#!/usr/bin/env python3
"""
Launch ELM327-emulator with the Kawasaki Z900 scenario.

Patches the built-in ObdMessage dictionary before the emulator starts
so that 'kawasaki-z900' is available as a native scenario via -s flag.

Equivalent to: python -m elm -s kawasaki-z900 -n 35001
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import elm.obd_message as _obm
from scenarios.kawasaki_z900 import ObdMessage as _KawaObdMsg

_obm.ObdMessage["kawasaki-z900"] = _KawaObdMsg

del _KawaObdMsg

sys.argv = ["elm", "-s", "kawasaki-z900", "-n", "35001"]

from elm.interpreter import main

main()
