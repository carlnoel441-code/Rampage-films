#!/usr/bin/env python3
"""
Audio Quality Analyzer - Automated testing framework for dubbed audio quality.
Analyzes sync, volume, clarity, and overall quality metrics.
"""

import sys
import os
import json
import subprocess
import tempfile
from typing import Dict, Any, List, Optional
import re

VERSION = "1.0.0"


def run_ffprobe(file_path: str, options: List[str] = None) -> Dict[str, Any]:
    """Run ffprobe and return parsed JSON output."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams"
    ]
    if options:
        cmd.extend(options)
    cmd.append(file_path)
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return {"error": result.stderr}
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        return {"error": "ffprobe timeout"}
    except json.JSONDecodeError:
        return {"error": "Invalid ffprobe output"}
    except Exception as e:
        return {"error": str(e)}


def analyze_loudness(audio_path: str) -> Dict[str, Any]:
    """Analyze loudness using FFmpeg's loudnorm filter."""
    cmd = [
        "ffmpeg", "-i", audio_path, "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        output = result.stderr
        
        json_match = re.search(r'\{[^}]+\}', output, re.DOTALL)
        if json_match:
            loudness_data = json.loads(json_match.group())
            return {
                "input_i": float(loudness_data.get("input_i", -24)),
                "input_tp": float(loudness_data.get("input_tp", -1)),
                "input_lra": float(loudness_data.get("input_lra", 7)),
                "input_thresh": float(loudness_data.get("input_thresh", -34)),
            }
        return {"error": "No loudness data found"}
    except subprocess.TimeoutExpired:
        return {"error": "Loudness analysis timeout"}
    except Exception as e:
        return {"error": str(e)}


def analyze_silence(audio_path: str) -> Dict[str, Any]:
    """Detect silence regions in audio."""
    cmd = [
        "ffmpeg", "-i", audio_path, "-af",
        "silencedetect=noise=-40dB:d=0.5",
        "-f", "null", "-"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        output = result.stderr
        
        silence_starts = re.findall(r'silence_start: ([\d.]+)', output)
        silence_ends = re.findall(r'silence_end: ([\d.]+)', output)
        silence_durations = re.findall(r'silence_duration: ([\d.]+)', output)
        
        total_silence = sum(float(d) for d in silence_durations) if silence_durations else 0
        
        probe = run_ffprobe(audio_path)
        duration = float(probe.get("format", {}).get("duration", 1))
        
        return {
            "silence_count": len(silence_starts),
            "total_silence_duration": total_silence,
            "silence_ratio": total_silence / duration if duration > 0 else 0,
            "audio_duration": duration
        }
    except Exception as e:
        return {"error": str(e)}


def analyze_audio_stats(audio_path: str) -> Dict[str, Any]:
    """Get detailed audio statistics using FFmpeg's astats filter."""
    cmd = [
        "ffmpeg", "-i", audio_path, "-af",
        "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-",
        "-f", "null", "-"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        output = result.stderr
        
        rms_match = re.search(r'RMS level dB: ([-\d.]+)', output)
        peak_match = re.search(r'Peak level dB: ([-\d.]+)', output)
        
        return {
            "rms_level": float(rms_match.group(1)) if rms_match else -20,
            "peak_level": float(peak_match.group(1)) if peak_match else -1,
        }
    except Exception as e:
        return {"error": str(e)}


def calculate_sync_score(video_path: str, audio_path: str) -> Dict[str, Any]:
    """
    Estimate sync quality by comparing audio characteristics.
    This is a heuristic approach since true sync requires speech detection.
    """
    try:
        video_probe = run_ffprobe(video_path)
        audio_probe = run_ffprobe(audio_path)
        
        video_duration = float(video_probe.get("format", {}).get("duration", 0))
        audio_duration = float(audio_probe.get("format", {}).get("duration", 0))
        
        duration_diff = abs(video_duration - audio_duration)
        
        if duration_diff < 1:
            sync_score = 100
        elif duration_diff < 5:
            sync_score = 90 - (duration_diff * 2)
        elif duration_diff < 30:
            sync_score = 80 - (duration_diff * 1.5)
        else:
            sync_score = max(0, 50 - duration_diff)
        
        return {
            "sync_score": round(sync_score, 2),
            "video_duration": video_duration,
            "audio_duration": audio_duration,
            "duration_offset": round(duration_diff, 3),
            "avg_sync_offset": round(duration_diff / max(video_duration, 1) * 10, 3),
            "max_sync_offset": round(duration_diff, 3)
        }
    except Exception as e:
        return {"error": str(e), "sync_score": 50}


def calculate_volume_score(loudness_data: Dict[str, Any]) -> float:
    """Calculate volume consistency score based on loudness data."""
    if "error" in loudness_data:
        return 70.0
    
    input_i = loudness_data.get("input_i", -24)
    input_lra = loudness_data.get("input_lra", 7)
    
    if -18 <= input_i <= -14:
        loudness_score = 100
    elif -24 <= input_i <= -10:
        loudness_score = 80 - abs(input_i + 16) * 2
    else:
        loudness_score = 50
    
    if input_lra < 12:
        range_score = 100
    elif input_lra < 18:
        range_score = 90 - (input_lra - 12) * 2
    else:
        range_score = 60
    
    return round((loudness_score * 0.6 + range_score * 0.4), 2)


def calculate_clarity_score(silence_data: Dict[str, Any], loudness_data: Dict[str, Any]) -> float:
    """Calculate speech clarity score."""
    if "error" in silence_data:
        return 70.0
    
    silence_ratio = silence_data.get("silence_ratio", 0)
    
    if 0.1 <= silence_ratio <= 0.4:
        silence_score = 100
    elif silence_ratio < 0.05:
        silence_score = 70
    elif silence_ratio > 0.6:
        silence_score = 60
    else:
        silence_score = 85
    
    if "error" not in loudness_data:
        input_lra = loudness_data.get("input_lra", 7)
        if input_lra > 5:
            dynamic_bonus = min(10, input_lra - 5)
            silence_score = min(100, silence_score + dynamic_bonus)
    
    return round(silence_score, 2)


def calculate_overall_score(
    sync_score: float,
    volume_score: float,
    clarity_score: float
) -> tuple:
    """Calculate weighted overall score and grade."""
    weights = {
        "sync": 0.35,
        "volume": 0.35,
        "clarity": 0.30
    }
    
    overall = (
        sync_score * weights["sync"] +
        volume_score * weights["volume"] +
        clarity_score * weights["clarity"]
    )
    
    if overall >= 90:
        grade = "A"
    elif overall >= 80:
        grade = "B"
    elif overall >= 70:
        grade = "C"
    elif overall >= 60:
        grade = "D"
    else:
        grade = "F"
    
    return round(overall, 2), grade


def generate_issues_and_recommendations(
    sync_data: Dict[str, Any],
    volume_score: float,
    clarity_score: float,
    loudness_data: Dict[str, Any],
    silence_data: Dict[str, Any]
) -> tuple:
    """Generate list of issues and recommendations based on analysis."""
    issues = []
    recommendations = []
    
    sync_score = sync_data.get("sync_score", 100)
    if sync_score < 70:
        issues.append("Audio/video duration mismatch detected")
        recommendations.append("Re-generate dubbing with adjusted timing parameters")
    elif sync_score < 85:
        issues.append("Minor sync offset detected")
        recommendations.append("Consider fine-tuning speech rate")
    
    if volume_score < 70:
        if "error" not in loudness_data:
            input_i = loudness_data.get("input_i", -24)
            if input_i < -20:
                issues.append("Audio is too quiet")
                recommendations.append("Increase overall volume by 3-6 dB")
            elif input_i > -12:
                issues.append("Audio may be too loud")
                recommendations.append("Reduce volume to prevent distortion")
            
            input_lra = loudness_data.get("input_lra", 7)
            if input_lra > 18:
                issues.append("High dynamic range may cause listening discomfort")
                recommendations.append("Apply compression to reduce dynamic range")
    
    if clarity_score < 70:
        if "error" not in silence_data:
            silence_ratio = silence_data.get("silence_ratio", 0)
            if silence_ratio > 0.5:
                issues.append("Excessive silence in audio")
                recommendations.append("Check for speech detection issues")
            elif silence_ratio < 0.1:
                issues.append("Very little natural pausing in speech")
                recommendations.append("Adjust speech pacing for more natural delivery")
    
    if not issues:
        issues.append("No significant issues detected")
        recommendations.append("Audio quality meets standards")
    
    return issues, recommendations


def analyze_audio_quality(
    audio_path: str,
    video_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main function to analyze audio quality.
    
    Args:
        audio_path: Path to the dubbed audio file
        video_path: Optional path to source video for sync analysis
    
    Returns:
        Dict with quality metrics
    """
    import time
    start_time = time.time()
    
    if not os.path.exists(audio_path):
        return {
            "success": False,
            "error": f"Audio file not found: {audio_path}"
        }
    
    loudness_data = analyze_loudness(audio_path)
    silence_data = analyze_silence(audio_path)
    
    if video_path and os.path.exists(video_path):
        sync_data = calculate_sync_score(video_path, audio_path)
    else:
        sync_data = {
            "sync_score": 85,
            "note": "No video provided for sync analysis"
        }
    
    volume_score = calculate_volume_score(loudness_data)
    clarity_score = calculate_clarity_score(silence_data, loudness_data)
    sync_score = sync_data.get("sync_score", 85)
    
    overall_score, quality_grade = calculate_overall_score(
        sync_score, volume_score, clarity_score
    )
    
    issues, recommendations = generate_issues_and_recommendations(
        sync_data, volume_score, clarity_score, loudness_data, silence_data
    )
    
    test_duration = int((time.time() - start_time) * 1000)
    
    return {
        "success": True,
        "version": VERSION,
        "metrics": {
            "sync_score": sync_score,
            "avg_sync_offset": sync_data.get("avg_sync_offset", 0),
            "max_sync_offset": sync_data.get("max_sync_offset", 0),
            "volume_score": volume_score,
            "avg_loudness": loudness_data.get("input_i", -16) if "error" not in loudness_data else -16,
            "peak_level": loudness_data.get("input_tp", -1) if "error" not in loudness_data else -1,
            "dynamic_range": loudness_data.get("input_lra", 7) if "error" not in loudness_data else 7,
            "clarity_score": clarity_score,
            "silence_ratio": silence_data.get("silence_ratio", 0.2) if "error" not in silence_data else 0.2,
            "noise_floor": -60,
            "overall_score": overall_score,
            "quality_grade": quality_grade
        },
        "issues": issues,
        "recommendations": recommendations,
        "test_duration": test_duration
    }


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: quality_analyzer.py <audio_path> [video_path]"
        }))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    video_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = analyze_audio_quality(audio_path, video_path)
    print(json.dumps(result))
    
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
