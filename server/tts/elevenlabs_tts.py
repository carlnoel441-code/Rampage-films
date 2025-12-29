#!/usr/bin/env python3
"""
ElevenLabs TTS Dubbing Engine
Premium voice synthesis for Netflix-quality dubbing.
Requires ELEVENLABS_API_KEY environment variable.
"""
import sys
import os
import json
import requests
import tempfile
import subprocess

API_BASE = "https://api.elevenlabs.io/v1"

# High-quality voices for dubbing (pre-made voices)
# These are voice IDs for ElevenLabs' pre-made voices
VOICE_MAP = {
    "male": {
        "default": "pNInz6obpgDQGcFmaJgB",  # Adam - deep male voice
        "young": "TxGEqnHWrfWFTfGW9XjX",    # Josh - young male
        "old": "VR6AewLTigWG4xSOukaG",      # Arnold - mature male
        "narrator": "ErXwobaYiN019PkySvjV",  # Antoni - narrator style
    },
    "female": {
        "default": "EXAVITQu4vr4xnSDxMaL",  # Bella - warm female
        "young": "21m00Tcm4TlvDq8ikWAM",    # Rachel - professional female
        "old": "AZnzlk1XvdvUeBnXmlld",      # Domi - strong female
        "narrator": "MF3mGyEYCl7XYWbV9V6O",  # Elli - narrator style
    }
}

# Language-specific voice recommendations
LANGUAGE_VOICES = {
    "es": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
    "fr": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
    "de": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
    "it": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
    "pt": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
    "ru": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
    "zh": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
    "ja": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
    "ko": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
    "en": {"male": "pNInz6obpgDQGcFmaJgB", "female": "EXAVITQu4vr4xnSDxMaL"},
}

def get_api_key():
    """Get ElevenLabs API key from environment."""
    # Try multiple variable names (workaround for stuck secrets)
    key = os.environ.get("ELEVEN_TTS_KEY") or os.environ.get("ELEVEN_API_KEY") or os.environ.get("ELEVENLABS_API_KEY")
    if not key or key.startswith("import "):
        raise ValueError("ElevenLabs API key not set. Please add ELEVEN_TTS_KEY secret.")
    return key

def get_voice_id(language: str = "en", gender: str = "female", style: str = "default") -> str:
    """Get the appropriate voice ID for language, gender, and style."""
    lang = language.lower().split("-")[0]
    
    if lang in LANGUAGE_VOICES:
        return LANGUAGE_VOICES[lang].get(gender, LANGUAGE_VOICES[lang]["female"])
    
    return VOICE_MAP.get(gender, VOICE_MAP["female"]).get(style, VOICE_MAP[gender]["default"])

def list_available_voices():
    """List all available voices from ElevenLabs account."""
    try:
        headers = {"xi-api-key": get_api_key()}
        response = requests.get(f"{API_BASE}/voices", headers=headers, timeout=30)
        response.raise_for_status()
        return response.json().get("voices", [])
    except Exception as e:
        return {"error": str(e)}

def get_user_info():
    """Get user subscription info including character limits."""
    try:
        headers = {"xi-api-key": get_api_key()}
        response = requests.get(f"{API_BASE}/user", headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def generate_audio(text: str, voice_id: str, output_file: str, 
                   stability: float = 0.35, similarity_boost: float = 0.85,
                   style: float = 0.25, use_speaker_boost: bool = True) -> dict:
    """
    Generate audio from text using ElevenLabs API.
    
    Args:
        text: Text to convert to speech
        voice_id: ElevenLabs voice ID
        output_file: Path to save audio file (MP3)
        stability: Voice stability (0-1, lower = more expressive/emotional)
        similarity_boost: Voice similarity (0-1, higher = more consistent)
        style: Style exaggeration (0-1, for multilingual v2 model - adds emotion)
        use_speaker_boost: Boost speaker clarity
    
    Returns:
        dict with success status and metadata
    
    Note: Default settings optimized for cinematic dubbing:
        - stability=0.35: More expressive, natural speech variation
        - similarity_boost=0.85: Maintains voice consistency
        - style=0.25: Adds emotional depth for movie dialogue
    """
    try:
        headers = {
            "xi-api-key": get_api_key(),
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
        }
        
        data = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity_boost,
                "style": style,
                "use_speaker_boost": use_speaker_boost
            }
        }
        
        response = requests.post(
            f"{API_BASE}/text-to-speech/{voice_id}",
            headers=headers,
            json=data,
            timeout=120
        )
        response.raise_for_status()
        
        with open(output_file, 'wb') as f:
            f.write(response.content)
        
        file_size = os.path.getsize(output_file)
        
        return {
            "success": True,
            "output_file": output_file,
            "voice_id": voice_id,
            "file_size": file_size,
            "characters_used": len(text)
        }
        
    except requests.exceptions.HTTPError as e:
        error_msg = str(e)
        try:
            error_data = e.response.json()
            error_msg = error_data.get("detail", {}).get("message", str(e))
        except:
            pass
        return {"success": False, "error": error_msg}
    except Exception as e:
        return {"success": False, "error": str(e)}

def generate_multi_speaker_audio(text_file: str, language: str, output_file: str, 
                                  speaker_config: dict) -> dict:
    """
    Generate audio with multiple speakers.
    
    Args:
        text_file: Path to text file
        language: Target language code
        output_file: Output MP3 path
        speaker_config: Config with mode, defaultGender, speakers
    
    Returns:
        dict with success status and metadata
    """
    try:
        with open(text_file, 'r', encoding='utf-8') as f:
            text = f.read().strip()
        
        if not text:
            return {"success": False, "error": "Text file is empty"}
        
        mode = speaker_config.get('mode', 'single')
        default_gender = speaker_config.get('defaultGender', 'female')
        speakers = speaker_config.get('speakers', [])
        
        if mode == 'single' or not speakers:
            voice_id = get_voice_id(language, default_gender)
            print(f"Single speaker mode using voice: {voice_id}", file=sys.stderr)
            return generate_audio(text, voice_id, output_file)
        
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
        if not paragraphs:
            paragraphs = [text]
        
        temp_dir = tempfile.mkdtemp(prefix='elevenlabs_multi_')
        segment_files = []
        total_chars = 0
        
        print(f"Multi-speaker mode: {mode} with {len(speakers)} speakers for {len(paragraphs)} paragraphs", file=sys.stderr)
        
        for i, paragraph in enumerate(paragraphs):
            if mode == 'alternating':
                speaker_idx = i % 2
                gender = 'male' if speaker_idx == 0 else 'female'
            else:
                speaker_idx = i % len(speakers)
                gender = speakers[speaker_idx].get('gender', default_gender)
            
            voice_id = get_voice_id(language, gender)
            segment_file = os.path.join(temp_dir, f"segment_{i:04d}.mp3")
            
            print(f"  Segment {i+1}/{len(paragraphs)}: Speaker {speaker_idx+1} ({gender})", file=sys.stderr)
            
            result = generate_audio(paragraph, voice_id, segment_file)
            
            if result.get('success'):
                segment_files.append(segment_file)
                total_chars += result.get('characters_used', len(paragraph))
            else:
                print(f"  Warning: Failed segment {i}: {result.get('error')}", file=sys.stderr)
        
        if not segment_files:
            return {"success": False, "error": "No segments generated"}
        
        concat_list = os.path.join(temp_dir, 'concat.txt')
        with open(concat_list, 'w') as f:
            for seg_file in segment_files:
                f.write(f"file '{seg_file}'\n")
        
        try:
            subprocess.run([
                'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                '-i', concat_list, '-c', 'copy', output_file
            ], capture_output=True, check=True, timeout=300)
            
            print(f"Concatenated {len(segment_files)} segments", file=sys.stderr)
        except subprocess.CalledProcessError as e:
            return {"success": False, "error": f"FFmpeg failed: {e.stderr.decode() if e.stderr else str(e)}"}
        
        for seg_file in segment_files:
            try:
                os.remove(seg_file)
            except:
                pass
        try:
            os.remove(concat_list)
            os.rmdir(temp_dir)
        except:
            pass
        
        file_size = os.path.getsize(output_file) if os.path.exists(output_file) else 0
        
        return {
            "success": True,
            "output_file": output_file,
            "mode": mode,
            "speakers_used": len(speakers) if mode == 'multi' else 2,
            "segments_generated": len(segment_files),
            "total_characters": total_chars,
            "file_size": file_size
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def generate_timed_segments(
    segments: list,
    language: str,
    output_dir: str,
    speaker_config: dict = None
) -> dict:
    """
    Generate TTS audio for each timestamped segment.
    
    Args:
        segments: List of dicts with 'text', 'start', 'end' and optionally 'speaker_id', 'gender'
        language: Target language code
        output_dir: Directory to save individual segment audio files
        speaker_config: Speaker configuration dict
    
    Returns:
        dict with success status and list of generated segments with audio paths
    """
    try:
        os.makedirs(output_dir, exist_ok=True)
        
        mode = speaker_config.get('mode', 'single') if speaker_config else 'single'
        default_gender = speaker_config.get('defaultGender', 'female') if speaker_config else 'female'
        speakers = speaker_config.get('speakers', []) if speaker_config else []
        
        generated_segments = []
        total_chars = 0
        failed_count = 0
        
        print(f"Generating {len(segments)} timed segments with ElevenLabs...", file=sys.stderr)
        
        for i, seg in enumerate(segments):
            text = seg.get('text', '').strip()
            if not text:
                continue
            
            start = seg.get('start', 0)
            end = seg.get('end', start + 1)
            
            if mode == 'single':
                gender = default_gender
            elif mode == 'alternating':
                gender = 'male' if i % 2 == 0 else 'female'
            elif mode == 'smart':
                gender = seg.get('gender', seg.get('detected_gender', default_gender))
                if gender not in ['male', 'female']:
                    gender = default_gender
            else:
                speaker_idx = i % len(speakers) if speakers else 0
                gender = speakers[speaker_idx].get('gender', default_gender) if speakers else default_gender
            
            voice_id = get_voice_id(language, gender)
            segment_file = os.path.join(output_dir, f"seg_{i:04d}.mp3")
            
            result = generate_audio(text, voice_id, segment_file)
            
            if result.get('success'):
                generated_segments.append({
                    'audio_path': segment_file,
                    'start': start,
                    'end': end,
                    'text': text,
                    'gender': gender,
                    'index': i
                })
                total_chars += len(text)
                if (i + 1) % 20 == 0:
                    print(f"  Progress: {i+1}/{len(segments)} segments", file=sys.stderr)
            else:
                failed_count += 1
                print(f"  Warning: Segment {i} failed: {result.get('error', 'unknown')}", file=sys.stderr)
        
        print(f"Generated {len(generated_segments)}/{len(segments)} segments ({total_chars} chars)", file=sys.stderr)
        
        return {
            "success": True,
            "segments": generated_segments,
            "total_segments": len(generated_segments),
            "failed_segments": failed_count,
            "total_characters": total_chars,
            "output_dir": output_dir
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def check_quota():
    """Check remaining character quota."""
    try:
        user_info = get_user_info()
        if "error" in user_info:
            return user_info
        
        subscription = user_info.get("subscription", {})
        return {
            "success": True,
            "character_count": subscription.get("character_count", 0),
            "character_limit": subscription.get("character_limit", 0),
            "remaining": subscription.get("character_limit", 0) - subscription.get("character_count", 0),
            "tier": subscription.get("tier", "unknown")
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    """CLI interface for ElevenLabs TTS."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python elevenlabs_tts.py <command> [args]",
            "commands": {
                "generate": "<text_file> <language> <output_mp3> [gender]",
                "generate-multi": "<text_file> <language> <output_mp3> <speaker_config_json>",
                "list-voices": "",
                "check-quota": "",
                "get-voice": "<language> [gender]"
            }
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "generate":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: generate <text_file> <language> <output_mp3> [gender]"}))
            sys.exit(1)
        
        text_file = sys.argv[2]
        language = sys.argv[3]
        output_file = sys.argv[4]
        gender = sys.argv[5] if len(sys.argv) > 5 else "female"
        
        with open(text_file, 'r', encoding='utf-8') as f:
            text = f.read().strip()
        
        voice_id = get_voice_id(language, gender)
        print(f"Generating with ElevenLabs voice: {voice_id}", file=sys.stderr)
        
        result = generate_audio(text, voice_id, output_file)
        print(json.dumps(result))
        sys.exit(0 if result.get("success") else 1)
    
    elif command == "generate-multi":
        if len(sys.argv) < 6:
            print(json.dumps({"error": "Usage: generate-multi <text_file> <language> <output_mp3> <speaker_config_json>"}))
            sys.exit(1)
        
        text_file = sys.argv[2]
        language = sys.argv[3]
        output_file = sys.argv[4]
        config_path = sys.argv[5]
        
        with open(config_path, 'r') as f:
            speaker_config = json.load(f)
        
        result = generate_multi_speaker_audio(text_file, language, output_file, speaker_config)
        print(json.dumps(result))
        sys.exit(0 if result.get("success") else 1)
    
    elif command == "list-voices":
        voices = list_available_voices()
        print(json.dumps(voices, indent=2))
    
    elif command == "check-quota":
        quota = check_quota()
        print(json.dumps(quota, indent=2))
    
    elif command == "get-voice":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Usage: get-voice <language> [gender]"}))
            sys.exit(1)
        
        language = sys.argv[2]
        gender = sys.argv[3] if len(sys.argv) > 3 else "female"
        voice_id = get_voice_id(language, gender)
        print(json.dumps({"voice_id": voice_id, "language": language, "gender": gender}))
    
    elif command == "generate-timed":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: generate-timed <segments_json> <language> <output_dir> [speaker_config_json]"}))
            sys.exit(1)
        
        segments_file = sys.argv[2]
        language = sys.argv[3]
        output_dir = sys.argv[4]
        config_path = sys.argv[5] if len(sys.argv) > 5 else None
        
        with open(segments_file, 'r', encoding='utf-8') as f:
            segments = json.load(f)
        
        speaker_config = None
        if config_path:
            with open(config_path, 'r') as f:
                speaker_config = json.load(f)
        
        result = generate_timed_segments(segments, language, output_dir, speaker_config)
        print(json.dumps(result))
        sys.exit(0 if result.get("success") else 1)
    
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
