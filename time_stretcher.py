#!/usr/bin/env python3
"""
Time Stretcher for Netflix-Quality Dubbing
Uses pyrubberband for high-quality time-stretching to fit dubbed speech
into original timing gaps without changing pitch.
"""

import sys
import json
import argparse
import os
from typing import Optional, Tuple

try:
    import numpy as np
    import soundfile as sf
    import pyrubberband as pyrb
    HAS_RUBBERBAND = True
except ImportError as e:
    HAS_RUBBERBAND = False
    print(f"Warning: pyrubberband/numpy not available ({e}), time stretching disabled", file=sys.stderr)

def analyze_audio_duration(audio_path: str) -> float:
    """Get duration of audio file in seconds."""
    if not HAS_RUBBERBAND:
        # Fallback to ffprobe
        import subprocess
        try:
            result = subprocess.run([
                'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1', audio_path
            ], capture_output=True, text=True)
            return float(result.stdout.strip())
        except:
            return 0.0
    try:
        info = sf.info(audio_path)
        return info.duration
    except Exception as e:
        print(f"Error analyzing audio: {e}", file=sys.stderr)
        return 0.0

def time_stretch_audio_ffmpeg(
    input_path: str,
    output_path: str,
    target_duration: float,
    min_stretch: float = 0.5,
    max_stretch: float = 2.0
) -> dict:
    """
    FFmpeg fallback for time stretching using atempo filter.
    Less quality than rubberband but works without numpy.
    """
    import subprocess
    
    current_duration = analyze_audio_duration(input_path)
    if current_duration <= 0 or target_duration <= 0:
        return {"success": False, "error": "Invalid duration"}
    
    # Calculate speed factor (inverse of stretch ratio for atempo)
    speed_factor = current_duration / target_duration
    speed_factor = max(min_stretch, min(max_stretch, speed_factor))
    
    try:
        result = subprocess.run([
            'ffmpeg', '-y', '-i', input_path,
            '-filter:a', f'atempo={speed_factor}',
            '-vn', output_path
        ], capture_output=True, timeout=120)
        
        if result.returncode == 0:
            actual_duration = analyze_audio_duration(output_path)
            return {
                "success": True,
                "input_duration": round(current_duration, 3),
                "target_duration": round(target_duration, 3),
                "actual_duration": round(actual_duration, 3),
                "stretch_ratio": round(1.0 / speed_factor, 3),
                "method": "ffmpeg_atempo",
                "output_path": output_path
            }
        else:
            return {"success": False, "error": result.stderr.decode()[:200]}
    except Exception as e:
        return {"success": False, "error": str(e)}

def time_stretch_audio(
    input_path: str,
    output_path: str,
    target_duration: float,
    min_stretch: float = 0.7,
    max_stretch: float = 1.5,
    preserve_pitch: bool = True
) -> dict:
    """
    Time-stretch audio to fit target duration.
    Uses pyrubberband for high quality, falls back to FFmpeg atempo.
    
    Args:
        input_path: Path to input audio file
        output_path: Path to output audio file
        target_duration: Desired duration in seconds
        min_stretch: Minimum stretch ratio (0.7 = 30% faster)
        max_stretch: Maximum stretch ratio (1.5 = 50% slower)
        preserve_pitch: Keep original pitch (True for voice)
    
    Returns:
        dict with success status and stretch info
    """
    if not HAS_RUBBERBAND:
        # Fallback to FFmpeg atempo
        return time_stretch_audio_ffmpeg(input_path, output_path, target_duration, min_stretch, max_stretch)
    
    try:
        # Load audio
        audio, sr = sf.read(input_path)
        
        # Handle stereo by converting to mono for processing
        if len(audio.shape) > 1:
            audio_mono = np.mean(audio, axis=1)
        else:
            audio_mono = audio
        
        # Calculate current duration
        current_duration = len(audio_mono) / sr
        
        if current_duration == 0:
            return {
                "success": False,
                "error": "Input audio has zero duration"
            }
        
        # Calculate required stretch ratio
        stretch_ratio = target_duration / current_duration
        
        # Clamp to safe range
        original_ratio = stretch_ratio
        stretch_ratio = max(min_stretch, min(max_stretch, stretch_ratio))
        was_clamped = original_ratio != stretch_ratio
        
        # Apply time stretching using rubberband
        if abs(stretch_ratio - 1.0) > 0.01:  # Only stretch if needed
            stretched_audio = pyrb.time_stretch(
                audio_mono, 
                sr, 
                stretch_ratio,
                rbargs={'-c': '2'}  # Use high quality mode
            )
        else:
            stretched_audio = audio_mono
        
        # Calculate actual output duration
        actual_duration = len(stretched_audio) / sr
        
        # Write output
        sf.write(output_path, stretched_audio, sr)
        
        return {
            "success": True,
            "input_duration": round(current_duration, 3),
            "target_duration": round(target_duration, 3),
            "actual_duration": round(actual_duration, 3),
            "stretch_ratio": round(stretch_ratio, 3),
            "was_clamped": was_clamped,
            "original_ratio": round(original_ratio, 3) if was_clamped else None,
            "output_path": output_path
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def stretch_segments(
    segments: list,
    input_dir: str,
    output_dir: str,
    timing_mode: str = "fit"
) -> dict:
    """
    Time-stretch multiple audio segments to fit original timing.
    
    Args:
        segments: List of segment dicts with 'file', 'start', 'end' keys
        input_dir: Directory containing input segment files
        output_dir: Directory for stretched output files
        timing_mode: 'fit' (stretch to exact timing) or 'natural' (minimal stretch)
    
    Returns:
        dict with results for each segment
    """
    os.makedirs(output_dir, exist_ok=True)
    
    results = []
    
    for i, seg in enumerate(segments):
        input_path = os.path.join(input_dir, seg.get('file', f'segment_{i}.wav'))
        output_path = os.path.join(output_dir, f'stretched_{i}.wav')
        
        # Calculate target duration from original timing
        target_duration = seg.get('end', 0) - seg.get('start', 0)
        
        if target_duration <= 0:
            results.append({
                "segment": i,
                "success": False,
                "error": "Invalid timing"
            })
            continue
        
        # Apply time stretching
        if timing_mode == "fit":
            result = time_stretch_audio(
                input_path, 
                output_path, 
                target_duration,
                min_stretch=0.75,  # Allow 25% speed up
                max_stretch=1.3    # Allow 30% slow down
            )
        else:
            # Natural mode: only minor adjustments
            result = time_stretch_audio(
                input_path, 
                output_path, 
                target_duration,
                min_stretch=0.9,
                max_stretch=1.1
            )
        
        result["segment"] = i
        result["original_start"] = seg.get('start')
        result["original_end"] = seg.get('end')
        results.append(result)
    
    return {
        "success": all(r.get("success", False) for r in results),
        "segments": results,
        "total_segments": len(segments),
        "successful_segments": sum(1 for r in results if r.get("success", False))
    }


def main():
    parser = argparse.ArgumentParser(description='Time stretch audio for dubbing')
    parser.add_argument('input', help='Input audio file')
    parser.add_argument('output', help='Output audio file')
    parser.add_argument('--target-duration', type=float, required=True,
                        help='Target duration in seconds')
    parser.add_argument('--min-stretch', type=float, default=0.7,
                        help='Minimum stretch ratio')
    parser.add_argument('--max-stretch', type=float, default=1.5,
                        help='Maximum stretch ratio')
    
    args = parser.parse_args()
    
    result = time_stretch_audio(
        args.input,
        args.output,
        args.target_duration,
        args.min_stretch,
        args.max_stretch
    )
    
    print(json.dumps(result, indent=2))
    
    if not result.get("success"):
        sys.exit(1)


if __name__ == '__main__':
    main()
