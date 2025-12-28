#!/usr/bin/env python3
"""
Smart Speaker Diarization with Gender Detection
Analyzes audio to detect speakers and classify their gender based on pitch.

Uses pitch (fundamental frequency) analysis:
- Male voices typically: 85-180 Hz (average ~120 Hz)
- Female voices typically: 165-255 Hz (average ~210 Hz)
- Overlap zone: 165-180 Hz (use confidence scoring)
"""
import sys
import os
import json
import wave
import struct
import math
import tempfile
import subprocess

def extract_audio_segment(input_file, start_time, end_time, output_file):
    """Extract a segment of audio using ffmpeg."""
    try:
        duration = end_time - start_time
        subprocess.run([
            'ffmpeg', '-y', '-i', input_file,
            '-ss', str(start_time), '-t', str(duration),
            '-ar', '16000', '-ac', '1', '-f', 'wav',
            output_file
        ], capture_output=True, check=True, timeout=30)
        return True
    except Exception as e:
        print(f"Failed to extract segment: {e}", file=sys.stderr)
        return False

def analyze_pitch(audio_file):
    """
    Analyze audio pitch using zero-crossing rate and autocorrelation.
    Returns estimated fundamental frequency (F0) in Hz.
    """
    try:
        with wave.open(audio_file, 'rb') as wf:
            n_channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            sample_rate = wf.getframerate()
            n_frames = wf.getnframes()
            
            if n_frames < sample_rate * 0.1:  # Less than 0.1 seconds
                return None
            
            frames = wf.readframes(n_frames)
            
        # Convert to samples
        if sample_width == 2:
            samples = list(struct.unpack(f'{n_frames}h', frames))
        elif sample_width == 1:
            samples = [s - 128 for s in frames]
        else:
            return None
        
        # Normalize
        max_val = max(abs(min(samples)), abs(max(samples))) or 1
        samples = [s / max_val for s in samples]
        
        # Simple autocorrelation-based pitch detection
        # Look for pitch in human voice range (50-400 Hz)
        min_lag = int(sample_rate / 400)  # 400 Hz max
        max_lag = int(sample_rate / 50)   # 50 Hz min
        
        # Use a window from the middle of the audio
        window_size = min(int(sample_rate * 0.5), len(samples) // 2)
        start_idx = (len(samples) - window_size) // 2
        window = samples[start_idx:start_idx + window_size]
        
        if len(window) < max_lag * 2:
            return None
        
        # Calculate autocorrelation
        best_lag = min_lag
        best_corr = -1
        
        for lag in range(min_lag, min(max_lag, len(window) // 2)):
            corr = 0
            for i in range(len(window) - lag):
                corr += window[i] * window[i + lag]
            corr /= (len(window) - lag)
            
            if corr > best_corr:
                best_corr = corr
                best_lag = lag
        
        if best_corr < 0.1:  # No clear pitch detected
            return None
        
        f0 = sample_rate / best_lag
        
        # Validate it's in human voice range
        if 50 <= f0 <= 400:
            return f0
        return None
        
    except Exception as e:
        print(f"Pitch analysis error: {e}", file=sys.stderr)
        return None

def classify_gender(pitch_hz):
    """
    Classify gender based on pitch with confidence score.
    
    Male range: 85-180 Hz (typical ~120 Hz)
    Female range: 165-255 Hz (typical ~210 Hz)
    """
    if pitch_hz is None:
        return {"gender": "unknown", "confidence": 0.0, "pitch": None}
    
    # Clear male range
    if pitch_hz < 140:
        confidence = min(1.0, (140 - pitch_hz) / 55 + 0.5)
        return {"gender": "male", "confidence": confidence, "pitch": round(pitch_hz, 1)}
    
    # Clear female range
    if pitch_hz > 185:
        confidence = min(1.0, (pitch_hz - 185) / 70 + 0.5)
        return {"gender": "female", "confidence": confidence, "pitch": round(pitch_hz, 1)}
    
    # Overlap zone (140-185 Hz) - use probability
    male_score = (185 - pitch_hz) / 45
    female_score = (pitch_hz - 140) / 45
    
    if male_score > female_score:
        return {"gender": "male", "confidence": round(male_score * 0.7, 2), "pitch": round(pitch_hz, 1)}
    else:
        return {"gender": "female", "confidence": round(female_score * 0.7, 2), "pitch": round(pitch_hz, 1)}

def analyze_segments(audio_file, segments_json, max_samples=50):
    """
    Analyze transcription segments and detect speaker gender for each.
    Uses sampling for large files to avoid timeout issues.
    
    Args:
        audio_file: Path to the audio file
        segments_json: Path to the transcription JSON with segments
        max_samples: Maximum segments to analyze (default 50 for speed)
        
    Returns:
        Enhanced segments with speaker/gender info
    """
    # Load segments from transcription
    with open(segments_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    segments = data.get('segments', [])
    
    if not segments:
        return {"success": False, "error": "No segments found in transcription"}
    
    temp_dir = tempfile.mkdtemp(prefix='diarize_')
    enhanced_segments = []
    speaker_genders = []
    
    # For large files, sample segments evenly instead of processing all
    # This prevents timeout for 2-hour movies with 400+ segments
    total_segments = len(segments)
    if total_segments > max_samples:
        # Sample evenly across the movie
        sample_step = total_segments // max_samples
        sample_indices = set(range(0, total_segments, sample_step))
        print(f"Sampling {len(sample_indices)}/{total_segments} segments for speed...", file=sys.stderr)
    else:
        sample_indices = set(range(total_segments))
        print(f"Analyzing all {total_segments} segments...", file=sys.stderr)
    
    sampled_results = {}  # Store results by index for later propagation
    
    processed_count = 0
    for i, seg in enumerate(segments):
        start = seg.get('start', 0)
        end = seg.get('end', 0)
        text = seg.get('text', '')
        
        # Skip very short segments
        if end - start < 0.3:
            enhanced_segments.append({
                **seg,
                "speaker_id": 0,
                "detected_gender": "unknown",
                "gender_confidence": 0.0,
                "pitch_hz": None
            })
            continue
        
        # Skip non-sampled segments (will propagate later)
        if i not in sample_indices:
            enhanced_segments.append({
                **seg,
                "speaker_id": 0,
                "detected_gender": "pending",  # Will be filled in later
                "gender_confidence": 0.0,
                "pitch_hz": None
            })
            continue
        
        # Extract audio segment (with shorter timeout)
        segment_audio = os.path.join(temp_dir, f'seg_{i}.wav')
        if not extract_audio_segment(audio_file, start, end, segment_audio):
            enhanced_segments.append({
                **seg,
                "speaker_id": 0,
                "detected_gender": "unknown",
                "gender_confidence": 0.0,
                "pitch_hz": None
            })
            continue
        
        # Analyze pitch
        pitch = analyze_pitch(segment_audio)
        gender_result = classify_gender(pitch)
        
        # Store sampled result
        sampled_results[i] = gender_result
        
        # Track for speaker assignment
        speaker_genders.append(gender_result['gender'])
        
        enhanced_seg = {
            **seg,
            "detected_gender": gender_result['gender'],
            "gender_confidence": gender_result['confidence'],
            "pitch_hz": gender_result['pitch']
        }
        enhanced_segments.append(enhanced_seg)
        
        # Clean up temp file
        try:
            os.remove(segment_audio)
        except:
            pass
        
        processed_count += 1
        if processed_count % 10 == 0:
            print(f"  Processed {processed_count}/{len(sample_indices)} samples", file=sys.stderr)
    
    # Propagate sampled results to non-sampled segments (nearest neighbor)
    if sampled_results:
        sorted_sample_indices = sorted(sampled_results.keys())
        for i, seg in enumerate(enhanced_segments):
            if seg.get('detected_gender') == 'pending':
                # Find nearest sampled segment
                nearest_idx = min(sorted_sample_indices, key=lambda x: abs(x - i))
                nearest_result = sampled_results[nearest_idx]
                seg['detected_gender'] = nearest_result['gender']
                seg['gender_confidence'] = nearest_result['confidence'] * 0.8  # Lower confidence for propagated
                seg['pitch_hz'] = None  # We didn't actually measure this one
    
    # Clean up temp directory
    try:
        os.rmdir(temp_dir)
    except:
        pass
    
    # Assign speaker IDs based on gender transitions
    current_speaker = 0
    last_gender = None
    male_speaker_id = 0
    female_speaker_id = 1
    
    for seg in enhanced_segments:
        gender = seg['detected_gender']
        
        if gender == 'male':
            seg['speaker_id'] = male_speaker_id
        elif gender == 'female':
            seg['speaker_id'] = female_speaker_id
        else:
            # Unknown - keep previous speaker or default
            seg['speaker_id'] = current_speaker
        
        if gender in ['male', 'female']:
            current_speaker = seg['speaker_id']
            last_gender = gender
    
    # Calculate summary statistics
    male_count = sum(1 for s in enhanced_segments if s['detected_gender'] == 'male')
    female_count = sum(1 for s in enhanced_segments if s['detected_gender'] == 'female')
    unknown_count = sum(1 for s in enhanced_segments if s['detected_gender'] == 'unknown')
    
    avg_confidence = sum(s.get('gender_confidence', 0) for s in enhanced_segments) / len(enhanced_segments) if enhanced_segments else 0
    
    return {
        "success": True,
        "segments": enhanced_segments,
        "summary": {
            "total_segments": len(enhanced_segments),
            "male_segments": male_count,
            "female_segments": female_count,
            "unknown_segments": unknown_count,
            "average_confidence": round(avg_confidence, 2),
            "detected_speakers": 2 if (male_count > 0 and female_count > 0) else 1
        }
    }

def create_smart_speaker_config(diarization_result, target_language):
    """
    Create speaker configuration for TTS based on diarization results.
    """
    if not diarization_result.get('success'):
        return {
            "mode": "single",
            "defaultGender": "female",
            "speakers": []
        }
    
    summary = diarization_result.get('summary', {})
    male_count = summary.get('male_segments', 0)
    female_count = summary.get('female_segments', 0)
    
    # If mostly one gender, use single speaker mode
    total = male_count + female_count
    if total == 0:
        return {
            "mode": "single",
            "defaultGender": "female",
            "speakers": []
        }
    
    # If one gender dominates (>90%), use single speaker
    if male_count / total > 0.9:
        return {
            "mode": "single",
            "defaultGender": "male",
            "speakers": []
        }
    if female_count / total > 0.9:
        return {
            "mode": "single",
            "defaultGender": "female",
            "speakers": []
        }
    
    # Multiple speakers detected - use smart multi mode
    return {
        "mode": "smart",
        "defaultGender": "male" if male_count > female_count else "female",
        "speakers": [
            {"id": 0, "name": "Speaker 1", "gender": "male"},
            {"id": 1, "name": "Speaker 2", "gender": "female"}
        ],
        "segment_assignments": [
            {"segment_id": seg['id'], "speaker_id": seg.get('speaker_id', 0), "gender": seg.get('detected_gender', 'unknown')}
            for seg in diarization_result.get('segments', [])
        ]
    }

def main():
    """CLI for smart diarization."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python smart_diarize.py <command> [args]",
            "commands": {
                "analyze": "<audio_file> <segments_json> <output_json>",
                "quick-detect": "<audio_file> - Quickly detect primary speaker gender"
            }
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "analyze":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: analyze <audio_file> <segments_json> <output_json>"}))
            sys.exit(1)
        
        audio_file = sys.argv[2]
        segments_json = sys.argv[3]
        output_json = sys.argv[4]
        
        if not os.path.exists(audio_file):
            print(json.dumps({"error": f"Audio file not found: {audio_file}"}))
            sys.exit(1)
        
        if not os.path.exists(segments_json):
            print(json.dumps({"error": f"Segments file not found: {segments_json}"}))
            sys.exit(1)
        
        print(f"Analyzing {audio_file} for speaker detection...", file=sys.stderr)
        result = analyze_segments(audio_file, segments_json)
        
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        
        print(f"Diarization complete. Results saved to {output_json}", file=sys.stderr)
        print(json.dumps(result.get('summary', {})))
        
    elif command == "quick-detect":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Usage: quick-detect <audio_file>"}))
            sys.exit(1)
        
        audio_file = sys.argv[2]
        
        if not os.path.exists(audio_file):
            print(json.dumps({"error": f"Audio file not found: {audio_file}"}))
            sys.exit(1)
        
        # Quick detection - analyze first 30 seconds
        temp_wav = tempfile.mktemp(suffix='.wav')
        try:
            subprocess.run([
                'ffmpeg', '-y', '-i', audio_file,
                '-t', '30', '-ar', '16000', '-ac', '1', '-f', 'wav',
                temp_wav
            ], capture_output=True, check=True, timeout=30)
            
            pitch = analyze_pitch(temp_wav)
            result = classify_gender(pitch)
            print(json.dumps(result))
            
        except Exception as e:
            print(json.dumps({"error": str(e), "gender": "unknown", "confidence": 0}))
        finally:
            if os.path.exists(temp_wav):
                os.remove(temp_wav)
    
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
