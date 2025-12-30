#!/usr/bin/env python3
"""
FFmpeg Audio Processor for AI Dubbing
Handles audio extraction, mixing, and synchronization for dubbed content.
"""
import sys
import os
import json
import subprocess
import tempfile
import shutil


def run_ffmpeg(args: list, description: str = "FFmpeg operation") -> dict:
    """Run FFmpeg command and capture output."""
    try:
        cmd = ["ffmpeg", "-y"] + args
        print(f"Running: {' '.join(cmd)}", file=sys.stderr)
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "error": result.stderr or f"{description} failed with code {result.returncode}"
            }
        
        return {"success": True}
        
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"{description} timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_audio_duration(file_path: str) -> float:
    """Get duration of audio/video file in seconds."""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except:
        pass
    return 0.0


def get_audio_info(file_path: str) -> dict:
    """Get detailed audio information."""
    try:
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format", "-show_streams",
            file_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            audio_streams = [s for s in data.get("streams", []) if s.get("codec_type") == "audio"]
            return {
                "success": True,
                "duration": float(data.get("format", {}).get("duration", 0)),
                "audio_streams": len(audio_streams),
                "format": data.get("format", {}).get("format_name", ""),
                "size": int(data.get("format", {}).get("size", 0))
            }
    except Exception as e:
        pass
    return {"success": False, "error": "Failed to get audio info"}


def analyze_audio_loudness(file_path: str) -> dict:
    """
    Analyze audio loudness using FFmpeg loudnorm filter.
    Returns loudness metrics for adaptive volume control.
    """
    try:
        cmd = [
            "ffmpeg", "-i", file_path, "-af", 
            "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
            "-f", "null", "-"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        output = result.stderr
        
        json_start = output.rfind('{')
        json_end = output.rfind('}') + 1
        
        if json_start >= 0 and json_end > json_start:
            loudness_json = output[json_start:json_end]
            loudness_data = json.loads(loudness_json)
            
            return {
                "success": True,
                "input_i": float(loudness_data.get("input_i", -23)),
                "input_tp": float(loudness_data.get("input_tp", -1)),
                "input_lra": float(loudness_data.get("input_lra", 7)),
                "input_thresh": float(loudness_data.get("input_thresh", -33)),
                "target_offset": float(loudness_data.get("target_offset", 0))
            }
        
        return {
            "success": True,
            "input_i": -23.0,
            "input_tp": -1.0,
            "input_lra": 7.0,
            "input_thresh": -33.0,
            "target_offset": 0.0
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def extract_audio(video_path: str, output_path: str, format: str = "mp3") -> dict:
    """
    Extract audio from video file.
    
    Args:
        video_path: Path to video file
        output_path: Path for output audio file
        format: Output format (mp3, wav, aac)
    """
    codec_map = {
        "mp3": ["-acodec", "libmp3lame", "-q:a", "2"],
        "wav": ["-acodec", "pcm_s16le"],
        "aac": ["-acodec", "aac", "-b:a", "192k"],
        "m4a": ["-acodec", "aac", "-b:a", "192k"]
    }
    
    codec_args = codec_map.get(format, codec_map["mp3"])
    
    args = [
        "-i", video_path,
        "-vn",
        *codec_args,
        "-ar", "44100",
        "-ac", "2",
        output_path
    ]
    
    result = run_ffmpeg(args, "Audio extraction")
    
    if result["success"] and os.path.exists(output_path):
        result["output_file"] = output_path
        result["duration"] = get_audio_duration(output_path)
        result["size"] = os.path.getsize(output_path)
    
    return result


def adjust_audio_speed(input_path: str, output_path: str, target_duration: float) -> dict:
    """
    Adjust audio speed to match target duration (for dubbing sync).
    
    Args:
        input_path: Input audio file
        output_path: Output audio file
        target_duration: Target duration in seconds
    """
    current_duration = get_audio_duration(input_path)
    
    if current_duration <= 0:
        return {"success": False, "error": "Could not determine audio duration"}
    
    speed_factor = current_duration / target_duration
    
    if speed_factor < 0.5:
        speed_factor = 0.5
    elif speed_factor > 2.0:
        speed_factor = 2.0
    
    args = [
        "-i", input_path,
        "-filter:a", f"atempo={speed_factor}",
        "-vn",
        output_path
    ]
    
    result = run_ffmpeg(args, "Speed adjustment")
    
    if result["success"]:
        result["original_duration"] = current_duration
        result["target_duration"] = target_duration
        result["speed_factor"] = speed_factor
        result["new_duration"] = get_audio_duration(output_path)
    
    return result


def mix_audio_tracks(
    original_audio: str,
    dubbed_audio: str,
    output_path: str,
    original_volume: float = 0.1,
    dubbed_volume: float = 1.0,
    output_format: str = "aac"
) -> dict:
    """
    Mix original audio (lowered) with dubbed audio.
    
    Args:
        original_audio: Path to original audio
        dubbed_audio: Path to dubbed audio
        output_path: Path for mixed output
        original_volume: Volume level for original (0.0-1.0)
        dubbed_volume: Volume level for dubbed track (0.0-1.0)
        output_format: Output format (aac, mp3)
    """
    codec_args = ["-acodec", "aac", "-b:a", "192k"] if output_format == "aac" else ["-acodec", "libmp3lame", "-q:a", "2"]
    
    args = [
        "-i", original_audio,
        "-i", dubbed_audio,
        "-filter_complex",
        f"[0:a]volume={original_volume}[a1];[1:a]volume={dubbed_volume}[a2];[a1][a2]amix=inputs=2:duration=longest",
        *codec_args,
        output_path
    ]
    
    result = run_ffmpeg(args, "Audio mixing")
    
    if result["success"]:
        result["output_file"] = output_path
        result["duration"] = get_audio_duration(output_path)
    
    return result


def mix_audio_adaptive(
    original_audio: str,
    dubbed_audio: str,
    output_path: str,
    output_format: str = "aac"
) -> dict:
    """
    Mix audio with adaptive volume control based on loudness analysis.
    Automatically balances dubbed audio against background for optimal clarity.
    
    Args:
        original_audio: Path to original audio
        dubbed_audio: Path to dubbed/TTS audio
        output_path: Path for mixed output
        output_format: Output format (aac, mp3)
    """
    print("Analyzing audio loudness for adaptive mixing...", file=sys.stderr)
    
    original_loudness = analyze_audio_loudness(original_audio)
    dubbed_loudness = analyze_audio_loudness(dubbed_audio)
    
    original_lufs = original_loudness.get("input_i", -23)
    dubbed_lufs = dubbed_loudness.get("input_i", -16)
    
    target_dubbed_lufs = -14
    target_bg_lufs = -30
    
    dubbed_adjust = target_dubbed_lufs - dubbed_lufs
    bg_adjust = target_bg_lufs - original_lufs
    
    dubbed_adjust = max(-20, min(20, dubbed_adjust))
    bg_adjust = max(-30, min(6, bg_adjust))
    
    print(f"Original LUFS: {original_lufs:.1f}, Dubbed LUFS: {dubbed_lufs:.1f}", file=sys.stderr)
    print(f"Adaptive adjustment: bg={bg_adjust:+.1f}dB, dubbed={dubbed_adjust:+.1f}dB", file=sys.stderr)
    
    codec_args = ["-acodec", "aac", "-b:a", "192k"] if output_format == "aac" else ["-acodec", "libmp3lame", "-q:a", "2"]
    
    filter_complex = (
        f"[0:a]volume={bg_adjust}dB,highpass=f=80,lowpass=f=8000[bg];"
        f"[1:a]volume={dubbed_adjust}dB[dubbed];"
        f"[bg][dubbed]amix=inputs=2:duration=longest:dropout_transition=2,loudnorm=I=-16:TP=-1.5:LRA=11"
    )
    
    args = [
        "-i", original_audio,
        "-i", dubbed_audio,
        "-filter_complex", filter_complex,
        *codec_args,
        output_path
    ]
    
    result = run_ffmpeg(args, "Adaptive audio mixing")
    
    if result["success"]:
        result["output_file"] = output_path
        result["duration"] = get_audio_duration(output_path)
        result["adaptive_volume"] = {
            "original_lufs": original_lufs,
            "dubbed_lufs": dubbed_lufs,
            "bg_adjustment_db": bg_adjust,
            "dubbed_adjustment_db": dubbed_adjust
        }
    
    return result


def replace_video_audio(
    video_path: str,
    audio_path: str,
    output_path: str,
    keep_original: bool = False,
    original_volume: float = 0.1
) -> dict:
    """
    Replace video audio track with dubbed audio.
    
    Args:
        video_path: Original video file
        audio_path: New audio track
        output_path: Output video file
        keep_original: If True, mix original audio at low volume
        original_volume: Volume for original audio if kept
    """
    if keep_original:
        args = [
            "-i", video_path,
            "-i", audio_path,
            "-filter_complex",
            f"[0:a]volume={original_volume}[a1];[1:a]volume=1.0[a2];[a1][a2]amix=inputs=2:duration=longest[aout]",
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            output_path
        ]
    else:
        args = [
            "-i", video_path,
            "-i", audio_path,
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            output_path
        ]
    
    result = run_ffmpeg(args, "Audio replacement")
    
    if result["success"]:
        result["output_file"] = output_path
        result["size"] = os.path.getsize(output_path) if os.path.exists(output_path) else 0
    
    return result


def create_dubbed_audio_track(
    original_audio: str,
    tts_audio: str,
    output_path: str,
    sync_to_original: bool = True,
    keep_background: bool = True,
    use_adaptive_volume: bool = True,
    output_format: str = "aac"
) -> dict:
    """
    Create a complete dubbed audio track with adaptive volume control.
    
    This is the main function for dubbing - it:
    1. Syncs TTS audio to match original duration (if needed)
    2. Uses adaptive volume control based on loudness analysis
    3. Outputs a complete dubbed audio track in the specified format
    
    Args:
        original_audio: Path to original audio/video
        tts_audio: Path to TTS-generated audio
        output_path: Path for output file
        sync_to_original: Adjust TTS speed to match original
        keep_background: Mix in original audio at low volume
        use_adaptive_volume: Use adaptive loudness-based volume control
        output_format: Output format (aac for higher quality, mp3)
    """
    original_duration = get_audio_duration(original_audio)
    tts_duration = get_audio_duration(tts_audio)
    
    if original_duration <= 0 or tts_duration <= 0:
        return {"success": False, "error": "Could not determine audio durations"}
    
    temp_dir = tempfile.mkdtemp(prefix="dub_")
    
    try:
        adjusted_tts = tts_audio
        
        if sync_to_original and abs(tts_duration - original_duration) > 1.0:
            adjusted_tts = os.path.join(temp_dir, "adjusted_tts.mp3")
            speed_result = adjust_audio_speed(tts_audio, adjusted_tts, original_duration)
            
            if not speed_result["success"]:
                return speed_result
        
        if keep_background:
            extracted_audio = os.path.join(temp_dir, "extracted.mp3")
            
            extract_result = extract_audio(original_audio, extracted_audio)
            if not extract_result["success"]:
                return extract_result
            
            if use_adaptive_volume:
                result = mix_audio_adaptive(
                    extracted_audio,
                    adjusted_tts,
                    output_path,
                    output_format=output_format
                )
            else:
                result = mix_audio_tracks(
                    extracted_audio,
                    adjusted_tts,
                    output_path,
                    original_volume=0.15,
                    dubbed_volume=1.0,
                    output_format=output_format
                )
        else:
            shutil.copy(adjusted_tts, output_path)
            result = {
                "success": True,
                "output_file": output_path,
                "duration": get_audio_duration(output_path)
            }
        
        if result["success"]:
            result["original_duration"] = original_duration
            result["tts_duration"] = tts_duration
            result["sync_applied"] = sync_to_original and abs(tts_duration - original_duration) > 1.0
            result["output_format"] = output_format
            result["adaptive_volume_used"] = use_adaptive_volume and keep_background
        
        return result
        
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    """CLI interface for audio processor."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python audio_processor.py <command> [args]",
            "commands": {
                "extract": "<video> <output> [format]",
                "duration": "<file>",
                "info": "<file>",
                "loudness": "<file>",
                "adjust-speed": "<input> <output> <target_duration>",
                "mix": "<audio1> <audio2> <output> [vol1] [vol2]",
                "mix-adaptive": "<background> <dubbed> <output> [format]",
                "replace": "<video> <audio> <output> [keep_original]",
                "create-dub": "<original> <tts_audio> <output> [keep_bg] [format]"
            }
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "extract":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Usage: extract <video> <output> [format]"}))
            sys.exit(1)
        format = sys.argv[4] if len(sys.argv) > 4 else "mp3"
        result = extract_audio(sys.argv[2], sys.argv[3], format)
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    elif command == "duration":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Usage: duration <file>"}))
            sys.exit(1)
        duration = get_audio_duration(sys.argv[2])
        print(json.dumps({"duration": duration, "file": sys.argv[2]}))
    
    elif command == "info":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Usage: info <file>"}))
            sys.exit(1)
        result = get_audio_info(sys.argv[2])
        print(json.dumps(result))
        sys.exit(0 if result.get("success") else 1)
    
    elif command == "loudness":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Usage: loudness <file>"}))
            sys.exit(1)
        result = analyze_audio_loudness(sys.argv[2])
        print(json.dumps(result))
        sys.exit(0 if result.get("success") else 1)
    
    elif command == "adjust-speed":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: adjust-speed <input> <output> <target_duration>"}))
            sys.exit(1)
        result = adjust_audio_speed(sys.argv[2], sys.argv[3], float(sys.argv[4]))
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    elif command == "mix":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: mix <audio1> <audio2> <output> [vol1] [vol2]"}))
            sys.exit(1)
        vol1 = float(sys.argv[5]) if len(sys.argv) > 5 else 0.1
        vol2 = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
        result = mix_audio_tracks(sys.argv[2], sys.argv[3], sys.argv[4], vol1, vol2)
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    elif command == "mix-adaptive":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: mix-adaptive <background> <dubbed> <output> [format]"}))
            sys.exit(1)
        output_fmt = sys.argv[5] if len(sys.argv) > 5 else "aac"
        result = mix_audio_adaptive(sys.argv[2], sys.argv[3], sys.argv[4], output_fmt)
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    elif command == "replace":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: replace <video> <audio> <output> [keep_original]"}))
            sys.exit(1)
        keep = sys.argv[5].lower() == "true" if len(sys.argv) > 5 else False
        result = replace_video_audio(sys.argv[2], sys.argv[3], sys.argv[4], keep)
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    elif command == "create-dub":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: create-dub <original> <tts_audio> <output> [keep_bg] [format]"}))
            sys.exit(1)
        keep_bg = sys.argv[5].lower() != "false" if len(sys.argv) > 5 else True
        output_fmt = sys.argv[6] if len(sys.argv) > 6 else "aac"
        result = create_dubbed_audio_track(
            sys.argv[2], sys.argv[3], sys.argv[4], 
            sync_to_original=True, 
            keep_background=keep_bg, 
            use_adaptive_volume=True,
            output_format=output_fmt
        )
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
