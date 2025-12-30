#!/usr/bin/env python3
"""
Segment-based audio assembly for precise dubbing sync.
Places each TTS segment at its exact original timestamp.
Uses high-quality pyrubberband for time stretching (Netflix-quality).
"""
import sys
import os
import json
import subprocess
import tempfile

# Try to import pyrubberband for high-quality time stretching
try:
    import numpy as np
    import pyrubberband as pyrb
    import soundfile as sf
    HAS_RUBBERBAND = True
except ImportError as e:
    HAS_RUBBERBAND = False
    np = None  # Placeholder for when numpy isn't available
    print(f"Warning: pyrubberband/numpy not available ({e}), falling back to FFmpeg atempo", file=sys.stderr)

def get_audio_duration(file_path: str) -> float:
    """Get audio duration in seconds."""
    result = subprocess.run([
        'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', file_path
    ], capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except:
        return 0

def generate_silence(duration: float, output_path: str, sample_rate: int = 44100) -> bool:
    """Generate silent audio of specified duration."""
    result = subprocess.run([
        'ffmpeg', '-y', '-f', 'lavfi',
        '-i', f'anullsrc=r={sample_rate}:cl=stereo',
        '-t', str(duration), '-acodec', 'libmp3lame', '-q:a', '2',
        output_path
    ], capture_output=True)
    return result.returncode == 0

def adjust_segment_speed_rubberband(input_path: str, output_path: str, target_duration: float) -> bool:
    """
    High-quality time stretching using rubberband (Netflix-quality).
    Preserves pitch while adjusting duration.
    """
    if not HAS_RUBBERBAND:
        return adjust_segment_speed_ffmpeg(input_path, output_path, target_duration)
    
    try:
        # Load audio
        audio, sr = sf.read(input_path)
        
        # Handle stereo
        if len(audio.shape) > 1:
            audio = np.mean(audio, axis=1)
        
        current_duration = len(audio) / sr
        if current_duration <= 0 or target_duration <= 0:
            return False
        
        # Calculate stretch ratio
        stretch_ratio = target_duration / current_duration
        stretch_ratio = max(0.7, min(1.5, stretch_ratio))  # Safe limits
        
        if abs(stretch_ratio - 1.0) > 0.02:
            # Apply high-quality time stretching
            stretched = pyrb.time_stretch(audio, sr, stretch_ratio, rbargs={'-c': '2'})
        else:
            stretched = audio
        
        # Save to temporary WAV, then convert to MP3
        temp_wav = output_path.replace('.mp3', '_temp.wav')
        sf.write(temp_wav, stretched, sr)
        
        # Convert to MP3
        result = subprocess.run([
            'ffmpeg', '-y', '-i', temp_wav,
            '-acodec', 'libmp3lame', '-q:a', '2',
            output_path
        ], capture_output=True)
        
        # Cleanup temp file
        try:
            os.remove(temp_wav)
        except:
            pass
        
        return result.returncode == 0
        
    except Exception as e:
        print(f"Rubberband stretch failed: {e}, falling back to FFmpeg", file=sys.stderr)
        return adjust_segment_speed_ffmpeg(input_path, output_path, target_duration)

def adjust_segment_speed_ffmpeg(input_path: str, output_path: str, target_duration: float) -> bool:
    """Fallback: Adjust audio speed using FFmpeg atempo filter."""
    current_duration = get_audio_duration(input_path)
    if current_duration <= 0 or target_duration <= 0:
        return False
    
    speed_factor = current_duration / target_duration
    speed_factor = max(0.5, min(2.0, speed_factor))
    
    result = subprocess.run([
        'ffmpeg', '-y', '-i', input_path,
        '-filter:a', f'atempo={speed_factor}',
        '-vn', '-acodec', 'libmp3lame', '-q:a', '2',
        output_path
    ], capture_output=True)
    return result.returncode == 0

def adjust_segment_speed(input_path: str, output_path: str, target_duration: float) -> bool:
    """Adjust audio speed to match target duration using best available method."""
    if HAS_RUBBERBAND:
        return adjust_segment_speed_rubberband(input_path, output_path, target_duration)
    else:
        return adjust_segment_speed_ffmpeg(input_path, output_path, target_duration)

def assemble_segments_with_timing(
    tts_segments: list,
    total_duration: float,
    output_path: str,
    sample_rate: int = 44100
) -> dict:
    """
    Assemble TTS segments with precise timing alignment.
    
    Args:
        tts_segments: List of dicts with:
            - audio_path: Path to TTS audio for this segment
            - start: Original start time in seconds
            - end: Original end time in seconds
        total_duration: Total duration of original audio
        output_path: Path for output assembled audio
        sample_rate: Audio sample rate
    
    Returns:
        dict with success status and metadata
    """
    temp_dir = tempfile.mkdtemp(prefix='segment_assemble_')
    
    try:
        if not tts_segments:
            return {"success": False, "error": "No segments provided"}
        
        tts_segments = sorted(tts_segments, key=lambda x: x['start'])
        
        segment_files = []
        current_time = 0.0
        
        for i, seg in enumerate(tts_segments):
            start_time = seg['start']
            end_time = seg['end']
            audio_path = seg['audio_path']
            target_duration = end_time - start_time
            
            if start_time > current_time:
                silence_duration = start_time - current_time
                silence_file = os.path.join(temp_dir, f'silence_{i:04d}.mp3')
                if generate_silence(silence_duration, silence_file, sample_rate):
                    segment_files.append(silence_file)
                    print(f"  Added {silence_duration:.2f}s silence at {current_time:.2f}s", file=sys.stderr)
                current_time = start_time
            
            if os.path.exists(audio_path):
                actual_duration = get_audio_duration(audio_path)
                
                if abs(actual_duration - target_duration) > 0.3:
                    adjusted_file = os.path.join(temp_dir, f'adjusted_{i:04d}.mp3')
                    if adjust_segment_speed(audio_path, adjusted_file, target_duration):
                        segment_files.append(adjusted_file)
                        print(f"  Segment {i}: {actual_duration:.2f}s -> {target_duration:.2f}s (speed adjusted)", file=sys.stderr)
                    else:
                        segment_files.append(audio_path)
                        print(f"  Segment {i}: {actual_duration:.2f}s (speed adjust failed, using original)", file=sys.stderr)
                else:
                    segment_files.append(audio_path)
                    print(f"  Segment {i}: {actual_duration:.2f}s (good fit)", file=sys.stderr)
                
                current_time = end_time
            else:
                print(f"  Warning: Segment {i} audio not found: {audio_path}", file=sys.stderr)
                silence_file = os.path.join(temp_dir, f'gap_{i:04d}.mp3')
                if generate_silence(target_duration, silence_file, sample_rate):
                    segment_files.append(silence_file)
                current_time = end_time
        
        if current_time < total_duration:
            final_silence = os.path.join(temp_dir, 'final_silence.mp3')
            if generate_silence(total_duration - current_time, final_silence, sample_rate):
                segment_files.append(final_silence)
                print(f"  Added {total_duration - current_time:.2f}s final silence", file=sys.stderr)
        
        if not segment_files:
            return {"success": False, "error": "No segments to concatenate"}
        
        concat_list = os.path.join(temp_dir, 'concat.txt')
        with open(concat_list, 'w') as f:
            for seg_file in segment_files:
                f.write(f"file '{seg_file}'\n")
        
        result = subprocess.run([
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', concat_list, '-acodec', 'libmp3lame', '-q:a', '2',
            output_path
        ], capture_output=True, timeout=600)
        
        if result.returncode != 0:
            return {
                "success": False, 
                "error": f"Concatenation failed: {result.stderr.decode()[:500]}"
            }
        
        final_duration = get_audio_duration(output_path)
        
        for f in segment_files:
            if f.startswith(temp_dir):
                try:
                    os.remove(f)
                except:
                    pass
        try:
            os.remove(concat_list)
            os.rmdir(temp_dir)
        except:
            pass
        
        return {
            "success": True,
            "output_file": output_path,
            "segments_processed": len(tts_segments),
            "target_duration": total_duration,
            "actual_duration": final_duration,
            "duration_error": abs(final_duration - total_duration)
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    """CLI interface."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python segment_assembler.py <command> [args]",
            "commands": {
                "assemble": "<segments_json> <tts_segments_dir> <output_path>",
                "legacy": "<segments_json> <total_duration> <output_path>"
            }
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "assemble":
        # New command: assemble TTS segments with timing from translated segments
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: assemble <segments_json> <tts_segments_dir> <output_path>"}))
            sys.exit(1)
        
        segments_json = sys.argv[2]
        tts_dir = sys.argv[3]
        output_path = sys.argv[4]
        
        with open(segments_json, 'r') as f:
            data = json.load(f)
        
        # Handle both formats: direct list or {segments: [...]}
        segments = data.get("segments", data) if isinstance(data, dict) else data
        
        # Map each segment to its TTS audio file
        mapped_segments = []
        for i, seg in enumerate(segments):
            tts_file = os.path.join(tts_dir, f"segment_{i:04d}.mp3")
            if os.path.exists(tts_file):
                mapped_segments.append({
                    "audio_path": tts_file,
                    "start": seg.get("start", 0),
                    "end": seg.get("end", seg.get("start", 0) + seg.get("duration", 3)),
                    "text": seg.get("text", "")
                })
            else:
                print(f"Warning: Missing TTS file {tts_file}", file=sys.stderr)
        
        if not mapped_segments:
            print(json.dumps({"success": False, "error": "No TTS segments found"}))
            sys.exit(1)
        
        # Calculate total duration from last segment end time
        total_duration = max(seg["end"] for seg in mapped_segments)
        
        print(f"Assembling {len(mapped_segments)} segments with timing ({total_duration:.1f}s total)...", file=sys.stderr)
        result = assemble_segments_with_timing(mapped_segments, total_duration, output_path)
        print(json.dumps(result))
        sys.exit(0 if result.get("success") else 1)
    
    elif command == "legacy" or len(sys.argv) >= 4:
        # Legacy mode: direct segment list
        segments_json = sys.argv[1] if command != "legacy" else sys.argv[2]
        total_duration = float(sys.argv[2] if command != "legacy" else sys.argv[3])
        output_path = sys.argv[3] if command != "legacy" else sys.argv[4]
        
        with open(segments_json, 'r') as f:
            segments = json.load(f)
        
        print(f"Assembling {len(segments)} segments with timing...", file=sys.stderr)
        result = assemble_segments_with_timing(segments, total_duration, output_path)
        print(json.dumps(result))
        sys.exit(0 if result.get("success") else 1)
    
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
