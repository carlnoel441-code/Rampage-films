#!/usr/bin/env python3
"""
Audio Pre-processor for Dubbing
Cleans source audio before transcription to improve quality:
- Noise reduction
- Audio normalization  
- Voice isolation (optional)
"""
import sys
import os
import subprocess
import json

def run_ffmpeg(args: list, description: str = "Processing") -> tuple:
    """Run ffmpeg command and return success status and output."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-y"] + args,
            capture_output=True,
            text=True,
            timeout=300
        )
        return result.returncode == 0, result.stderr
    except subprocess.TimeoutExpired:
        return False, "Timeout exceeded"
    except FileNotFoundError:
        return False, "ffmpeg not found"
    except Exception as e:
        return False, str(e)

def extract_audio(input_video: str, output_audio: str) -> dict:
    """Extract audio track from video file."""
    success, error = run_ffmpeg([
        "-i", input_video,
        "-vn",  # No video
        "-acodec", "pcm_s16le",  # 16-bit PCM
        "-ar", "16000",  # 16kHz sample rate (optimal for Whisper)
        "-ac", "1",  # Mono
        output_audio
    ], "Extracting audio")
    
    return {
        "success": success,
        "output": output_audio if success else None,
        "error": error if not success else None
    }

def reduce_noise(input_audio: str, output_audio: str, noise_reduction_amount: float = 0.21) -> dict:
    """
    Apply noise reduction using ffmpeg's afftdn filter.
    
    Args:
        input_audio: Path to input audio file
        output_audio: Path to output audio file  
        noise_reduction_amount: Noise reduction strength (0.0-1.0)
    """
    # afftdn = Adaptive FFT Denoiser
    # nr = noise reduction amount (0-97 dB, we convert from 0-1 scale)
    nr_db = int(noise_reduction_amount * 40)  # Scale to 0-40 dB range
    
    success, error = run_ffmpeg([
        "-i", input_audio,
        "-af", f"afftdn=nr={nr_db}:nf=-25",  # Noise floor at -25dB
        output_audio
    ], "Reducing noise")
    
    return {
        "success": success,
        "output": output_audio if success else None,
        "error": error if not success else None
    }

def normalize_audio(input_audio: str, output_audio: str, target_loudness: float = -16.0) -> dict:
    """
    Normalize audio loudness using EBU R128 standard.
    
    Args:
        input_audio: Path to input audio file
        output_audio: Path to output audio file
        target_loudness: Target integrated loudness in LUFS (default -16)
    """
    success, error = run_ffmpeg([
        "-i", input_audio,
        "-af", f"loudnorm=I={target_loudness}:TP=-1.5:LRA=11",
        output_audio
    ], "Normalizing audio")
    
    return {
        "success": success,
        "output": output_audio if success else None,
        "error": error if not success else None
    }

def high_pass_filter(input_audio: str, output_audio: str, cutoff_hz: int = 80) -> dict:
    """
    Apply high-pass filter to remove low-frequency rumble.
    
    Args:
        input_audio: Path to input audio file
        output_audio: Path to output audio file
        cutoff_hz: Cutoff frequency in Hz (removes frequencies below this)
    """
    success, error = run_ffmpeg([
        "-i", input_audio,
        "-af", f"highpass=f={cutoff_hz}",
        output_audio
    ], "Applying high-pass filter")
    
    return {
        "success": success,
        "output": output_audio if success else None,
        "error": error if not success else None
    }

def preprocess_for_transcription(input_file: str, output_file: str, 
                                  apply_noise_reduction: bool = True,
                                  apply_normalization: bool = True,
                                  apply_highpass: bool = True) -> dict:
    """
    Full preprocessing pipeline for transcription.
    Extracts audio (if video), reduces noise, normalizes, and applies high-pass filter.
    """
    import tempfile
    
    temp_dir = tempfile.mkdtemp(prefix="audio_preprocess_")
    steps_completed = []
    current_file = input_file
    
    try:
        # Step 1: Extract audio if input is video
        video_extensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv']
        input_ext = os.path.splitext(input_file)[1].lower()
        
        if input_ext in video_extensions:
            extracted = os.path.join(temp_dir, "extracted.wav")
            result = extract_audio(input_file, extracted)
            if not result["success"]:
                return {"success": False, "error": f"Audio extraction failed: {result['error']}", "steps": steps_completed}
            current_file = extracted
            steps_completed.append("extract_audio")
        
        # Step 2: High-pass filter to remove rumble
        if apply_highpass:
            filtered = os.path.join(temp_dir, "highpass.wav")
            result = high_pass_filter(current_file, filtered)
            if result["success"]:
                current_file = filtered
                steps_completed.append("highpass_filter")
        
        # Step 3: Noise reduction
        if apply_noise_reduction:
            denoised = os.path.join(temp_dir, "denoised.wav")
            result = reduce_noise(current_file, denoised)
            if result["success"]:
                current_file = denoised
                steps_completed.append("noise_reduction")
        
        # Step 4: Normalize loudness
        if apply_normalization:
            normalized = os.path.join(temp_dir, "normalized.wav")
            result = normalize_audio(current_file, normalized)
            if result["success"]:
                current_file = normalized
                steps_completed.append("normalization")
        
        # Copy final result to output
        import shutil
        shutil.copy2(current_file, output_file)
        
        return {
            "success": True,
            "output": output_file,
            "steps": steps_completed,
            "file_size": os.path.getsize(output_file)
        }
        
    except Exception as e:
        return {"success": False, "error": str(e), "steps": steps_completed}
    finally:
        # Cleanup temp files
        try:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
        except:
            pass

def main():
    """CLI interface for audio preprocessing."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python audio_preprocess.py <command> [args]",
            "commands": {
                "preprocess": "<input_file> <output_file> [--no-denoise] [--no-normalize]",
                "extract": "<input_video> <output_audio>",
                "denoise": "<input_audio> <output_audio> [strength 0.0-1.0]",
                "normalize": "<input_audio> <output_audio> [target_lufs]"
            }
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "preprocess":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Usage: preprocess <input_file> <output_file>"}))
            sys.exit(1)
        
        input_file = sys.argv[2]
        output_file = sys.argv[3]
        apply_denoise = "--no-denoise" not in sys.argv
        apply_normalize = "--no-normalize" not in sys.argv
        apply_highpass = "--no-highpass" not in sys.argv
        
        if not os.path.exists(input_file):
            print(json.dumps({"error": f"Input file not found: {input_file}"}))
            sys.exit(1)
        
        print(f"Preprocessing: {input_file}", file=sys.stderr)
        result = preprocess_for_transcription(input_file, output_file, apply_denoise, apply_normalize, apply_highpass)
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    elif command == "extract":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Usage: extract <input_video> <output_audio>"}))
            sys.exit(1)
        
        result = extract_audio(sys.argv[2], sys.argv[3])
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    elif command == "denoise":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Usage: denoise <input_audio> <output_audio> [strength]"}))
            sys.exit(1)
        
        strength = float(sys.argv[4]) if len(sys.argv) > 4 else 0.21
        result = reduce_noise(sys.argv[2], sys.argv[3], strength)
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    elif command == "normalize":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Usage: normalize <input_audio> <output_audio> [target_lufs]"}))
            sys.exit(1)
        
        target = float(sys.argv[4]) if len(sys.argv) > 4 else -16.0
        result = normalize_audio(sys.argv[2], sys.argv[3], target)
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
