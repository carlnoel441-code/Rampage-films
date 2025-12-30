#!/bin/bash
# Wrapper script to run transcribe.py with proper library paths

# Set library path for PyAV/faster-whisper
export LD_LIBRARY_PATH="/nix/store/$(ls /nix/store | grep '^[a-z0-9]\{32\}-zlib' | head -1)/lib:$LD_LIBRARY_PATH"

# Run the Python transcription script
exec python3 "$(dirname "$0")/transcribe.py" "$@"
