#!/usr/bin/env python3
"""
Launch ELM327-emulator with the built-in 'car' scenario (Toyota).

Equivalent to: python -m elm -s car -n 35002
"""
import sys

sys.argv = ["elm", "-s", "car", "-n", "35002"]

from elm.interpreter import main

main()
