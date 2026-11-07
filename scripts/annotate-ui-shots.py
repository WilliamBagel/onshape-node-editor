#!/usr/bin/env python3
"""Compat wrapper: canonical annotator lives in qa/harness/annotate-ui-shots.py."""
import runpy, sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
sys.argv[0] = str(root / "qa/harness/annotate-ui-shots.py")
runpy.run_path(sys.argv[0], run_name="__main__")
