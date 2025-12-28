#!/usr/bin/env python3
"""
Edge TTS Dubbing Engine with gTTS Fallback
Generates high-quality dubbed audio using Microsoft Edge neural voices.
Falls back to Google TTS (gTTS) if Edge TTS is unavailable.
Free and unlimited usage with 300+ voices across 100+ languages.
"""
import sys
import os
import json
import asyncio
import edge_tts

# gTTS fallback support
try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False
    
# Track if Edge TTS has been working (for fallback decisions)
EDGE_TTS_WORKING = None  # None = unknown, True = working, False = failed
EDGE_TTS_CONSECUTIVE_FAILURES = 0  # Count consecutive failures to auto-skip Edge TTS

# Popular neural voices for dubbing (male/female pairs for major languages)
# 2024 UPDATE: Using Multilingual Neural voices where available (more conversational/natural)
VOICE_MAP = {
    # Spanish (Mexico voices sound more natural for Latin American content)
    "es": {"male": "es-MX-JorgeNeural", "female": "es-MX-DaliaNeural"},
    "es-MX": {"male": "es-MX-JorgeNeural", "female": "es-MX-DaliaNeural"},
    "es-ES": {"male": "es-ES-AlvaroNeural", "female": "es-ES-ElviraNeural"},
    "es-AR": {"male": "es-AR-TomasNeural", "female": "es-AR-ElenaNeural"},
    
    # French (stable neural voices)
    "fr": {"male": "fr-FR-HenriNeural", "female": "fr-FR-DeniseNeural"},
    "fr-CA": {"male": "fr-CA-AntoineNeural", "female": "fr-CA-SylvieNeural"},
    
    # German (stable neural voices)
    "de": {"male": "de-DE-ConradNeural", "female": "de-DE-KatjaNeural"},
    
    # Italian
    "it": {"male": "it-IT-DiegoNeural", "female": "it-IT-ElsaNeural"},
    
    # Portuguese
    "pt": {"male": "pt-BR-AntonioNeural", "female": "pt-BR-FranciscaNeural"},
    "pt-BR": {"male": "pt-BR-AntonioNeural", "female": "pt-BR-FranciscaNeural"},
    "pt-PT": {"male": "pt-PT-DuarteNeural", "female": "pt-PT-RaquelNeural"},
    
    # Russian
    "ru": {"male": "ru-RU-DmitryNeural", "female": "ru-RU-SvetlanaNeural"},
    
    # Chinese
    "zh": {"male": "zh-CN-YunxiNeural", "female": "zh-CN-XiaoxiaoNeural"},
    "zh-CN": {"male": "zh-CN-YunxiNeural", "female": "zh-CN-XiaoxiaoNeural"},
    "zh-TW": {"male": "zh-TW-YunJheNeural", "female": "zh-TW-HsiaoChenNeural"},
    
    # Japanese
    "ja": {"male": "ja-JP-KeitaNeural", "female": "ja-JP-NanamiNeural"},
    
    # Korean
    "ko": {"male": "ko-KR-InJoonNeural", "female": "ko-KR-SunHiNeural"},
    
    # Arabic
    "ar": {"male": "ar-SA-HamedNeural", "female": "ar-SA-ZariyahNeural"},
    
    # Hindi
    "hi": {"male": "hi-IN-MadhurNeural", "female": "hi-IN-SwaraNeural"},
    
    # Dutch
    "nl": {"male": "nl-NL-MaartenNeural", "female": "nl-NL-FennaNeural"},
    
    # Polish
    "pl": {"male": "pl-PL-MarekNeural", "female": "pl-PL-ZofiaNeural"},
    
    # Turkish
    "tr": {"male": "tr-TR-AhmetNeural", "female": "tr-TR-EmelNeural"},
    
    # Swedish
    "sv": {"male": "sv-SE-MattiasNeural", "female": "sv-SE-SofieNeural"},
    
    # Norwegian
    "no": {"male": "nb-NO-FinnNeural", "female": "nb-NO-PernilleNeural"},
    
    # Danish
    "da": {"male": "da-DK-JeppeNeural", "female": "da-DK-ChristelNeural"},
    
    # Finnish
    "fi": {"male": "fi-FI-HarriNeural", "female": "fi-FI-SelmaNeural"},
    
    # Greek
    "el": {"male": "el-GR-NestorasNeural", "female": "el-GR-AthinaNeural"},
    
    # Czech
    "cs": {"male": "cs-CZ-AntoninNeural", "female": "cs-CZ-VlastaNeural"},
    
    # Romanian
    "ro": {"male": "ro-RO-EmilNeural", "female": "ro-RO-AlinaNeural"},
    
    # Hungarian
    "hu": {"male": "hu-HU-TamasNeural", "female": "hu-HU-NoemiNeural"},
    
    # Thai
    "th": {"male": "th-TH-NiwatNeural", "female": "th-TH-PremwadeeNeural"},
    
    # Vietnamese
    "vi": {"male": "vi-VN-NamMinhNeural", "female": "vi-VN-HoaiMyNeural"},
    
    # Indonesian
    "id": {"male": "id-ID-ArdiNeural", "female": "id-ID-GadisNeural"},
    
    # Malay
    "ms": {"male": "ms-MY-OsmanNeural", "female": "ms-MY-YasminNeural"},
    
    # Filipino
    "fil": {"male": "fil-PH-AngeloNeural", "female": "fil-PH-BlessicaNeural"},
    
    # Ukrainian
    "uk": {"male": "uk-UA-OstapNeural", "female": "uk-UA-PolinaNeural"},
    
    # Hebrew
    "he": {"male": "he-IL-AvriNeural", "female": "he-IL-HilaNeural"},
    
    # Bengali
    "bn": {"male": "bn-IN-BashkarNeural", "female": "bn-IN-TanishaaNeural"},
    
    # Tamil
    "ta": {"male": "ta-IN-ValluvarNeural", "female": "ta-IN-PallaviNeural"},
    
    # Telugu
    "te": {"male": "te-IN-MohanNeural", "female": "te-IN-ShrutiNeural"},
    
    # English variants (using stable neural voices)
    "en": {"male": "en-US-GuyNeural", "female": "en-US-JennyNeural"},
    "en-US": {"male": "en-US-GuyNeural", "female": "en-US-JennyNeural"},
    "en-GB": {"male": "en-GB-RyanNeural", "female": "en-GB-SoniaNeural"},
    "en-AU": {"male": "en-AU-WilliamNeural", "female": "en-AU-NatashaNeural"},
    "en-IN": {"male": "en-IN-PrabhatNeural", "female": "en-IN-NeerjaNeural"},
}

# Language names for display
LANGUAGE_NAMES = {
    "es": "Spanish (Spain)",
    "es-MX": "Spanish (Mexico)",
    "es-AR": "Spanish (Argentina)",
    "fr": "French (France)",
    "fr-CA": "French (Canada)",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese (Brazil)",
    "pt-BR": "Portuguese (Brazil)",
    "pt-PT": "Portuguese (Portugal)",
    "ru": "Russian",
    "zh": "Chinese (Mandarin)",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    "ja": "Japanese",
    "ko": "Korean",
    "ar": "Arabic",
    "hi": "Hindi",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "sv": "Swedish",
    "no": "Norwegian",
    "da": "Danish",
    "fi": "Finnish",
    "el": "Greek",
    "cs": "Czech",
    "ro": "Romanian",
    "hu": "Hungarian",
    "th": "Thai",
    "vi": "Vietnamese",
    "id": "Indonesian",
    "ms": "Malay",
    "fil": "Filipino",
    "uk": "Ukrainian",
    "he": "Hebrew",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
    "en": "English (US)",
    "en-US": "English (US)",
    "en-GB": "English (UK)",
    "en-AU": "English (Australia)",
    "en-IN": "English (India)",
}

def get_voice(language_code: str, gender: str = "female") -> str:
    """Get the appropriate voice for a language and gender."""
    lang = language_code.lower()
    
    # Try exact match first
    if lang in VOICE_MAP:
        return VOICE_MAP[lang].get(gender, VOICE_MAP[lang]["female"])
    
    # Try base language (e.g., "es" for "es-CO")
    base_lang = lang.split("-")[0]
    if base_lang in VOICE_MAP:
        return VOICE_MAP[base_lang].get(gender, VOICE_MAP[base_lang]["female"])
    
    # Default to English
    return VOICE_MAP["en"][gender]

def get_language_name(language_code: str) -> str:
    """Get human-readable language name."""
    lang = language_code.lower()
    if lang in LANGUAGE_NAMES:
        return LANGUAGE_NAMES[lang]
    base_lang = lang.split("-")[0]
    if base_lang in LANGUAGE_NAMES:
        return LANGUAGE_NAMES[base_lang]
    return language_code

# Emotion detection keywords for prosody adjustment
EMOTION_KEYWORDS = {
    "angry": {"rate": "+15%", "pitch": "+10Hz", "keywords": ["angry", "furious", "rage", "hate", "damn", "hell"]},
    "sad": {"rate": "-10%", "pitch": "-5Hz", "keywords": ["sad", "sorry", "grief", "cry", "tears", "miss", "lost"]},
    "excited": {"rate": "+20%", "pitch": "+15Hz", "keywords": ["wow", "amazing", "incredible", "excited", "great", "yes!"]},
    "fearful": {"rate": "+5%", "pitch": "+5Hz", "keywords": ["scared", "afraid", "fear", "help", "run", "danger"]},
    "whisper": {"rate": "-15%", "pitch": "-10Hz", "keywords": ["shh", "quiet", "whisper", "secret", "psst"]},
    "question": {"rate": "+0%", "pitch": "+8Hz", "keywords": ["?", "what", "why", "how", "who", "where", "when"]},
}

def detect_emotion(text: str) -> dict:
    """
    Detect emotion from text and return prosody adjustments.
    Returns rate and pitch adjustments for Edge TTS.
    """
    text_lower = text.lower()
    
    for emotion, config in EMOTION_KEYWORDS.items():
        for keyword in config["keywords"]:
            if keyword in text_lower:
                return {
                    "emotion": emotion,
                    "rate": config["rate"],
                    "pitch": config["pitch"]
                }
    
    # Default neutral
    return {"emotion": "neutral", "rate": "+0%", "pitch": "+0Hz"}

def get_audio_duration(file_path: str) -> float:
    """Get audio duration using ffprobe."""
    try:
        import subprocess
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", 
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return float(result.stdout.strip())
    except:
        pass
    return 0.0

def enhance_text_for_natural_speech(text: str) -> str:
    """
    Lightly enhance text for more natural TTS output.
    Only makes minimal, safe changes to improve TTS quality.
    """
    import re
    
    if not text or not text.strip():
        return text
    
    enhanced = text.strip()
    
    # Normalize multiple spaces only
    enhanced = re.sub(r'\s+', ' ', enhanced)
    
    # Normalize excessive punctuation only (keep max 2)
    enhanced = re.sub(r'!{3,}', '!!', enhanced)
    enhanced = re.sub(r'\?{3,}', '??', enhanced)
    enhanced = re.sub(r'\.{4,}', '...', enhanced)
    
    return enhanced

def parse_rate(rate_str: str) -> int:
    """Parse rate string like '+10%' or '-5%' to integer."""
    rate_str = rate_str.replace("%", "").strip()
    try:
        return int(rate_str)
    except:
        return 0

def combine_rates(emotion_rate: str, alignment_rate: int) -> str:
    """Combine emotion-based rate with alignment adjustment."""
    emotion_int = parse_rate(emotion_rate)
    combined = emotion_int + alignment_rate
    # Clamp to Edge TTS limits (-50% to +100%)
    combined = max(-50, min(100, combined))
    if combined >= 0:
        return f"+{combined}%"
    else:
        return f"{combined}%"

async def generate_segment_audio(segment: dict, voice: str, output_file: str, target_duration: float = 0.0, max_retries: int = 3) -> dict:
    """
    Generate audio for a single segment with emotion-aware prosody and retry logic.
    Adjusts rate to match target duration while preserving emotional expression.
    
    Args:
        segment: Dict with 'text', 'start', 'end', 'duration'
        voice: Edge TTS voice name
        output_file: Output MP3 path
        target_duration: Target duration in seconds (for time alignment)
        max_retries: Maximum number of retry attempts
    
    Returns:
        dict with success status, timing metadata, and sync accuracy
    """
    text = segment.get("text", "").strip()
    if not text:
        return {"success": False, "error": "Empty segment text"}
    
    last_error = None
    
    for attempt in range(max_retries):
        try:
            # Enhance text for more natural speech (punctuation, pauses)
            enhanced_text = enhance_text_for_natural_speech(text)
            
            # Detect emotion for prosody
            emotion_config = detect_emotion(enhanced_text)
            base_rate = emotion_config["rate"]
            pitch = emotion_config["pitch"]
            
            # First pass: generate with emotion prosody only
            communicate = edge_tts.Communicate(enhanced_text, voice, rate=base_rate, pitch=pitch)
            await communicate.save(output_file)
            
            # Verify file was created and has content
            if not os.path.exists(output_file):
                raise Exception("Output file was not created")
            
            file_size = os.path.getsize(output_file)
            if file_size < 100:
                raise Exception(f"Output file too small ({file_size} bytes)")
            
            actual_duration = get_audio_duration(output_file)
            final_rate = base_rate
            sync_error = 0.0
            
            # If we have target duration, calculate and apply alignment adjustment
            if target_duration and target_duration > 0 and actual_duration > 0:
                sync_error = actual_duration - target_duration
                
                # Only adjust if sync error exceeds 0.3 seconds (audible threshold)
                if abs(sync_error) > 0.3:
                    # Calculate required rate adjustment: rate = ((actual/target) - 1) * 100
                    rate_adjustment = int(((actual_duration / target_duration) - 1) * 100)
                    
                    # Combine with emotion rate (preserving emotional expression)
                    final_rate = combine_rates(base_rate, rate_adjustment)
                    
                    # Re-generate with combined rate
                    communicate = edge_tts.Communicate(enhanced_text, voice, rate=final_rate, pitch=pitch)
                    await communicate.save(output_file)
                    
                    # Measure final duration
                    actual_duration = get_audio_duration(output_file)
                    sync_error = actual_duration - target_duration
            
            file_size = os.path.getsize(output_file) if os.path.exists(output_file) else 0
            
            # Determine sync quality
            sync_quality = "good" if abs(sync_error) <= 0.5 else ("fair" if abs(sync_error) <= 1.0 else "poor")
            
            return {
                "success": True,
                "output_file": output_file,
                "segment_id": segment.get("id", 0),
                "start": segment.get("start", 0),
                "end": segment.get("end", 0),
                "target_duration": target_duration,
                "actual_duration": round(actual_duration, 3),
                "sync_error": round(sync_error, 3),
                "sync_quality": sync_quality,
                "emotion": emotion_config["emotion"],
                "final_rate": final_rate,
                "file_size": file_size,
                "attempts": attempt + 1
            }
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                # Exponential backoff: 2s, 4s, 8s
                wait_time = 2 ** (attempt + 1)
                print(f"  Segment TTS attempt {attempt + 1} failed: {last_error}. Retrying in {wait_time}s...", file=sys.stderr)
                await asyncio.sleep(wait_time)
    
    return {
        "success": False,
        "error": last_error,
        "segment_id": segment.get("id", 0),
        "attempts": max_retries
    }

async def generate_segments_audio(segments_file: str, voice: str, output_dir: str) -> dict:
    """
    Generate audio for all segments from a transcription JSON file.
    Creates individual audio files for each segment for precise timing.
    
    Args:
        segments_file: Path to JSON file with segments (from transcribe.py)
        voice: Edge TTS voice name
        output_dir: Directory to save segment audio files
    
    Returns:
        dict with results for all segments
    """
    try:
        with open(segments_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        segments = data.get("segments", [])
        if not segments:
            return {"success": False, "error": "No segments found in file"}
        
        os.makedirs(output_dir, exist_ok=True)
        
        results = []
        successful = 0
        failed = 0
        
        sync_stats = {"good": 0, "fair": 0, "poor": 0}
        
        for i, segment in enumerate(segments):
            output_file = os.path.join(output_dir, f"segment_{i:04d}.mp3")
            target_duration = segment.get("duration", None)
            
            result = await generate_segment_audio(segment, voice, output_file, target_duration)
            results.append(result)
            
            if result["success"]:
                successful += 1
                sync_quality = result.get("sync_quality", "fair")
                sync_stats[sync_quality] = sync_stats.get(sync_quality, 0) + 1
                print(f"  Segment {i+1}/{len(segments)} [{sync_quality}]: {segment.get('text', '')[:40]}...", file=sys.stderr)
            else:
                failed += 1
                print(f"  Segment {i+1} FAILED: {result.get('error', 'Unknown')}", file=sys.stderr)
        
        # Calculate overall sync quality
        overall_quality = "good" if sync_stats["good"] > len(segments) * 0.7 else ("fair" if sync_stats["poor"] < len(segments) * 0.3 else "poor")
        
        return {
            "success": failed < len(segments) * 0.2,  # Succeed if less than 20% of segments fail
            "total_segments": len(segments),
            "successful": successful,
            "failed": failed,
            "sync_stats": sync_stats,
            "overall_sync_quality": overall_quality,
            "output_dir": output_dir,
            "segments": results
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_gtts_lang(voice: str) -> str:
    """Extract language code from Edge TTS voice name for gTTS."""
    # Voice format: "en-US-GuyNeural" -> "en"
    if "-" in voice:
        parts = voice.split("-")
        return parts[0].lower()
    return "en"

def generate_audio_gtts_sync(text: str, language: str, output_file: str) -> dict:
    """
    Generate audio using gTTS (Google Text-to-Speech) as fallback.
    This is synchronous because gTTS doesn't support async.
    """
    global GTTS_AVAILABLE
    if not GTTS_AVAILABLE:
        return {"success": False, "error": "gTTS not available"}
    
    try:
        tts = gTTS(text, lang=language)
        tts.save(output_file)
        
        if os.path.exists(output_file):
            file_size = os.path.getsize(output_file)
            if file_size > 100:
                return {
                    "success": True,
                    "output_file": output_file,
                    "voice": f"gTTS-{language}",
                    "file_size": file_size,
                    "text_length": len(text),
                    "engine": "gtts"
                }
        return {"success": False, "error": "gTTS produced empty file"}
    except Exception as e:
        return {"success": False, "error": f"gTTS error: {str(e)}"}

async def generate_audio(text: str, voice: str, output_file: str, rate: str = "+0%", pitch: str = "+0Hz", max_retries: int = 3) -> dict:
    """
    Generate audio from text using Edge TTS with gTTS fallback.
    
    Args:
        text: The text to convert to speech
        voice: The Edge TTS voice to use
        output_file: Path to save the output MP3 file
        rate: Speech rate adjustment (e.g., "+10%", "-5%")
        pitch: Pitch adjustment (e.g., "+5Hz", "-10Hz")
        max_retries: Maximum number of retry attempts
    
    Returns:
        dict with success status and metadata
    """
    global EDGE_TTS_WORKING, EDGE_TTS_CONSECUTIVE_FAILURES
    
    last_error = "Edge TTS unavailable"
    
    # Skip Edge TTS if we've had 3+ consecutive failures (likely network blocked)
    skip_edge_tts = EDGE_TTS_CONSECUTIVE_FAILURES >= 3
    
    if not skip_edge_tts:
        # Try Edge TTS with retries
        for attempt in range(max_retries):
            try:
                communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                await communicate.save(output_file)
                
                # Verify file was created and has content
                if not os.path.exists(output_file):
                    raise Exception("Output file was not created")
                
                file_size = os.path.getsize(output_file)
                if file_size < 100:  # Audio file should be at least 100 bytes
                    raise Exception(f"Output file too small ({file_size} bytes)")
                
                EDGE_TTS_WORKING = True  # Mark Edge TTS as working
                EDGE_TTS_CONSECUTIVE_FAILURES = 0  # Reset failure counter
                return {
                    "success": True,
                    "output_file": output_file,
                    "voice": voice,
                    "file_size": file_size,
                    "text_length": len(text),
                    "attempts": attempt + 1,
                    "engine": "edge"
                }
            except Exception as e:
                last_error = str(e)
                if attempt < max_retries - 1:
                    # Exponential backoff: 2s, 4s, 8s
                    wait_time = 2 ** (attempt + 1)
                    print(f"  TTS attempt {attempt + 1} failed: {last_error}. Retrying in {wait_time}s...", file=sys.stderr)
                    await asyncio.sleep(wait_time)
                else:
                    print(f"  Edge TTS failed after {max_retries} attempts: {last_error}", file=sys.stderr)
        
        # Edge TTS failed
        EDGE_TTS_WORKING = False
        EDGE_TTS_CONSECUTIVE_FAILURES += 1
        
        if EDGE_TTS_CONSECUTIVE_FAILURES >= 3:
            print(f"  [INFO] Edge TTS unreachable - will use gTTS directly for remaining segments", file=sys.stderr)
    
    # Try gTTS (either as fallback or as primary if Edge TTS is blocked)
    if GTTS_AVAILABLE:
        lang = get_gtts_lang(voice)
        if not skip_edge_tts:
            print(f"  Trying gTTS fallback (lang={lang})...", file=sys.stderr)
        gtts_result = generate_audio_gtts_sync(text, lang, output_file)
        if gtts_result.get("success"):
            if not skip_edge_tts:
                print(f"  gTTS fallback succeeded!", file=sys.stderr)
            return gtts_result
        else:
            print(f"  gTTS failed: {gtts_result.get('error')}", file=sys.stderr)
    
    return {
        "success": False,
        "error": last_error,
        "voice": voice,
        "attempts": max_retries
    }

async def generate_with_subtitles(text: str, voice: str, output_audio: str, output_srt: str, rate: str = "+0%") -> dict:
    """
    Generate audio with subtitle timing data.
    
    Args:
        text: The text to convert to speech
        voice: The Edge TTS voice to use
        output_audio: Path to save the output MP3 file
        output_srt: Path to save the SRT subtitle file
        rate: Speech rate adjustment
    
    Returns:
        dict with success status and timing data
    """
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        submaker = edge_tts.SubMaker()
        
        with open(output_audio, "wb") as audio_file:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_file.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    submaker.create_sub((chunk["offset"], chunk["duration"]), chunk["text"])
        
        # Save subtitles
        with open(output_srt, "w", encoding="utf-8") as srt_file:
            srt_file.write(submaker.generate_subs())
        
        file_size = os.path.getsize(output_audio) if os.path.exists(output_audio) else 0
        
        return {
            "success": True,
            "output_audio": output_audio,
            "output_srt": output_srt,
            "voice": voice,
            "file_size": file_size
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

async def generate_multi_speaker_audio(text_file: str, language: str, output_file: str, speaker_config: dict) -> dict:
    """
    Generate audio with multiple speakers alternating.
    
    Speaker modes:
    - 'single': Use one voice for all text (default behavior)
    - 'alternating': Alternate between male and female voices for each paragraph/sentence
    - 'multi': Use configured speakers cycling through segments
    
    Args:
        text_file: Path to the text file to convert
        language: Target language code
        output_file: Output MP3 file path
        speaker_config: Configuration dict with mode, defaultGender, and speakers list
    
    Returns:
        dict with success status and metadata
    """
    import tempfile
    import subprocess
    
    try:
        with open(text_file, 'r', encoding='utf-8') as f:
            text = f.read().strip()
        
        if not text:
            return {"success": False, "error": "Text file is empty"}
        
        mode = speaker_config.get('mode', 'single')
        default_gender = speaker_config.get('defaultGender', 'female')
        speakers = speaker_config.get('speakers', [])
        segment_assignments = speaker_config.get('segment_assignments', [])
        
        if mode == 'single' or (not speakers and mode != 'smart'):
            voice = get_voice(language, default_gender)
            print(f"Single speaker mode using voice: {voice}", file=sys.stderr)
            return await generate_audio(text, voice, output_file)
        
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
        
        if not paragraphs:
            paragraphs = [text]
        
        temp_dir = tempfile.mkdtemp(prefix='multispeaker_')
        segment_files = []
        
        # Build gender lookup from segment_assignments for smart mode
        segment_gender_map = {}
        if mode == 'smart' and segment_assignments:
            for assign in segment_assignments:
                seg_id = assign.get('segment_id', assign.get('id'))
                gender = assign.get('gender', 'unknown')
                if gender not in ['male', 'female']:
                    gender = default_gender
                segment_gender_map[seg_id] = gender
            print(f"Smart mode: {len(segment_gender_map)} segment gender assignments loaded", file=sys.stderr)
        
        print(f"Multi-speaker mode: {mode} with {len(speakers) if speakers else 'auto'} speakers for {len(paragraphs)} paragraphs", file=sys.stderr)
        
        for i, paragraph in enumerate(paragraphs):
            if mode == 'smart':
                # Smart mode: use detected gender from diarization
                gender = segment_gender_map.get(i, default_gender)
                speaker_idx = 0 if gender == 'male' else 1
            elif mode == 'alternating':
                speaker_idx = i % 2
                gender = 'male' if speaker_idx == 0 else 'female'
            else:
                speaker_idx = i % len(speakers) if speakers else 0
                gender = speakers[speaker_idx].get('gender', default_gender) if speakers else default_gender
            
            voice = get_voice(language, gender)
            segment_file = os.path.join(temp_dir, f"segment_{i:04d}.mp3")
            
            print(f"  Segment {i+1}/{len(paragraphs)}: Speaker {speaker_idx+1} ({gender})", file=sys.stderr)
            
            result = await generate_audio(paragraph, voice, segment_file)
            
            if result.get('success'):
                segment_files.append(segment_file)
            else:
                print(f"  Warning: Failed to generate segment {i}: {result.get('error')}", file=sys.stderr)
            
            # Rate limit protection: small delay between segments
            if i < len(paragraphs) - 1:
                await asyncio.sleep(0.5)
        
        if not segment_files:
            return {"success": False, "error": "No segments were successfully generated"}
        
        concat_list = os.path.join(temp_dir, 'concat.txt')
        with open(concat_list, 'w') as f:
            for seg_file in segment_files:
                f.write(f"file '{seg_file}'\n")
        
        try:
            subprocess.run([
                'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                '-i', concat_list, '-c', 'copy', output_file
            ], capture_output=True, check=True, timeout=300)
            
            print(f"Successfully concatenated {len(segment_files)} segments", file=sys.stderr)
        except subprocess.CalledProcessError as e:
            return {"success": False, "error": f"FFmpeg concat failed: {e.stderr.decode() if e.stderr else str(e)}"}
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "FFmpeg concat timed out"}
        
        try:
            for seg_file in segment_files:
                if os.path.exists(seg_file):
                    os.remove(seg_file)
            if os.path.exists(concat_list):
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
            "file_size": file_size
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


async def list_voices(language_filter: str = "") -> list:
    """
    List all available voices, optionally filtered by language.
    """
    voices = await edge_tts.list_voices()
    
    if language_filter:
        voices = [v for v in voices if v["Locale"].lower().startswith(language_filter.lower())]
    
    return voices

def main():
    """CLI interface for Edge TTS dubbing."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python edge_tts_dub.py <command> [args]",
            "commands": {
                "generate": "<text_file> <language> <output_mp3> [gender] [rate]",
                "generate-multi": "<text_file> <language> <output_mp3> <speaker_config_json>",
                "generate-segments": "<segments_json> <language> <output_dir> [gender]",
                "list-voices": "[language_filter]",
                "list-languages": "",
                "get-voice": "<language> [gender]"
            }
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "generate":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: generate <text_file> <language> <output_mp3> [gender] [rate]"}))
            sys.exit(1)
        
        text_file = sys.argv[2]
        language = sys.argv[3]
        output_file = sys.argv[4]
        gender = sys.argv[5] if len(sys.argv) > 5 else "female"
        rate = sys.argv[6] if len(sys.argv) > 6 else "+0%"
        
        if not os.path.exists(text_file):
            print(json.dumps({"error": f"Text file not found: {text_file}"}))
            sys.exit(1)
        
        with open(text_file, 'r', encoding='utf-8') as f:
            text = f.read().strip()
        
        if not text:
            print(json.dumps({"error": "Text file is empty"}))
            sys.exit(1)
        
        voice = get_voice(language, gender)
        print(f"Using voice: {voice}", file=sys.stderr)
        
        result = asyncio.run(generate_audio(text, voice, output_file, rate=rate))
        print(json.dumps(result))
        
        sys.exit(0 if result["success"] else 1)
    
    elif command == "generate-multi":
        if len(sys.argv) < 6:
            print(json.dumps({"error": "Usage: generate-multi <text_file> <language> <output_mp3> <speaker_config_json>"}))
            sys.exit(1)
        
        text_file = sys.argv[2]
        language = sys.argv[3]
        output_file = sys.argv[4]
        speaker_config_file = sys.argv[5]
        
        if not os.path.exists(text_file):
            print(json.dumps({"error": f"Text file not found: {text_file}"}))
            sys.exit(1)
        
        if not os.path.exists(speaker_config_file):
            print(json.dumps({"error": f"Speaker config file not found: {speaker_config_file}"}))
            sys.exit(1)
        
        with open(speaker_config_file, 'r', encoding='utf-8') as f:
            speaker_config = json.load(f)
        
        print(f"Multi-speaker TTS: mode={speaker_config.get('mode', 'single')}", file=sys.stderr)
        
        result = asyncio.run(generate_multi_speaker_audio(text_file, language, output_file, speaker_config))
        print(json.dumps(result))
        
        sys.exit(0 if result["success"] else 1)
    
    elif command == "generate-segments":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: generate-segments <segments_json> <language> <output_dir> [gender]"}))
            sys.exit(1)
        
        segments_file = sys.argv[2]
        language = sys.argv[3]
        output_dir = sys.argv[4]
        gender = sys.argv[5] if len(sys.argv) > 5 else "female"
        
        if not os.path.exists(segments_file):
            print(json.dumps({"error": f"Segments file not found: {segments_file}"}))
            sys.exit(1)
        
        voice = get_voice(language, gender)
        print(f"Using voice: {voice}", file=sys.stderr)
        print(f"Processing segments from: {segments_file}", file=sys.stderr)
        
        result = asyncio.run(generate_segments_audio(segments_file, voice, output_dir))
        print(json.dumps(result))
        
        sys.exit(0 if result["success"] else 1)
    
    elif command == "generate-with-subs":
        if len(sys.argv) < 6:
            print(json.dumps({"error": "Usage: generate-with-subs <text_file> <language> <output_mp3> <output_srt> [gender]"}))
            sys.exit(1)
        
        text_file = sys.argv[2]
        language = sys.argv[3]
        output_audio = sys.argv[4]
        output_srt = sys.argv[5]
        gender = sys.argv[6] if len(sys.argv) > 6 else "female"
        
        if not os.path.exists(text_file):
            print(json.dumps({"error": f"Text file not found: {text_file}"}))
            sys.exit(1)
        
        with open(text_file, 'r', encoding='utf-8') as f:
            text = f.read().strip()
        
        voice = get_voice(language, gender)
        print(f"Using voice: {voice}", file=sys.stderr)
        
        result = asyncio.run(generate_with_subtitles(text, voice, output_audio, output_srt))
        print(json.dumps(result))
        
        sys.exit(0 if result["success"] else 1)
    
    elif command == "list-voices":
        lang_filter = sys.argv[2] if len(sys.argv) > 2 else ""
        voices = asyncio.run(list_voices(lang_filter))
        
        # Format output
        output = []
        for v in voices:
            output.append({
                "name": v["ShortName"],
                "locale": v["Locale"],
                "gender": v["Gender"],
                "friendly_name": v.get("FriendlyName", v["ShortName"])
            })
        
        print(json.dumps({"voices": output, "count": len(output)}))
    
    elif command == "list-languages":
        languages = []
        for code, name in LANGUAGE_NAMES.items():
            voices = VOICE_MAP.get(code, {})
            languages.append({
                "code": code,
                "name": name,
                "male_voice": voices.get("male"),
                "female_voice": voices.get("female")
            })
        print(json.dumps({"languages": languages}))
    
    elif command == "get-voice":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Usage: get-voice <language> [gender]"}))
            sys.exit(1)
        
        language = sys.argv[2]
        gender = sys.argv[3] if len(sys.argv) > 3 else "female"
        voice = get_voice(language, gender)
        language_name = get_language_name(language)
        
        print(json.dumps({
            "voice": voice,
            "language_code": language,
            "language_name": language_name,
            "gender": gender
        }))
    
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
