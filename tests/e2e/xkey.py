#!/usr/bin/env python3
"""Presses a key chord on the X11 display through the XTest extension (Linux test helper).

Usage: xkey.py Control_L Alt_L u
Used by the end-to-end tests to prove global shortcuts fire from outside the app.
"""
import ctypes
import sys
import time

x11 = ctypes.cdll.LoadLibrary("libX11.so.6")
xtst = ctypes.cdll.LoadLibrary("libXtst.so.6")
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XKeysymToKeycode.restype = ctypes.c_ubyte
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]

display = x11.XOpenDisplay(None)
if not display:
    sys.exit("cannot open X display")
codes = [x11.XKeysymToKeycode(display, x11.XStringToKeysym(name.encode())) for name in sys.argv[1:]]
if not codes or 0 in codes:
    sys.exit("unknown key name")
for code in codes:
    xtst.XTestFakeKeyEvent(display, code, 1, 0)
    x11.XFlush(display)
    time.sleep(0.03)
for code in reversed(codes):
    xtst.XTestFakeKeyEvent(display, code, 0, 0)
    x11.XFlush(display)
    time.sleep(0.03)
x11.XCloseDisplay(display)
