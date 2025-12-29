#!/usr/bin/env python3
"""
Voice Selector for Netflix-Quality Dubbing
Intelligently selects appropriate voices for dubbing based on:
- Speaker characteristics (gender, age estimate)
- Character consistency (same voice for same speaker throughout)
- Target language availability
- Emotional style matching
"""

import sys
import json
import argparse
from typing import Dict, List, Optional, Tuple

# Comprehensive Edge TTS voice database by language
# Using stable neural voices that work reliably with Edge TTS service
EDGE_TTS_VOICES = {
    "en": {
        "male": [
            {"name": "en-US-GuyNeural", "style": "general", "age": "adult"},
            {"name": "en-US-DavisNeural", "style": "general", "age": "adult"},
            {"name": "en-US-TonyNeural", "style": "general", "age": "adult"},
            {"name": "en-US-JasonNeural", "style": "general", "age": "adult"},
            {"name": "en-GB-RyanNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "en-US-JennyNeural", "style": "general", "age": "adult"},
            {"name": "en-US-AriaNeural", "style": "expressive", "age": "young_adult"},
            {"name": "en-US-SaraNeural", "style": "general", "age": "adult"},
            {"name": "en-US-MichelleNeural", "style": "general", "age": "adult"},
            {"name": "en-GB-SoniaNeural", "style": "general", "age": "adult"},
        ]
    },
    "es": {
        "male": [
            {"name": "es-MX-JorgeNeural", "style": "general", "age": "adult"},
            {"name": "es-ES-AlvaroNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "es-MX-DaliaNeural", "style": "general", "age": "adult"},
            {"name": "es-ES-ElviraNeural", "style": "general", "age": "adult"},
        ]
    },
    "fr": {
        "male": [
            {"name": "fr-FR-HenriNeural", "style": "general", "age": "adult"},
            {"name": "fr-CA-AntoineNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "fr-FR-DeniseNeural", "style": "general", "age": "adult"},
            {"name": "fr-CA-SylvieNeural", "style": "general", "age": "adult"},
        ]
    },
    "de": {
        "male": [
            {"name": "de-DE-ConradNeural", "style": "general", "age": "adult"},
            {"name": "de-AT-JonasNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "de-DE-KatjaNeural", "style": "general", "age": "adult"},
            {"name": "de-AT-IngridNeural", "style": "general", "age": "adult"},
        ]
    },
    "it": {
        "male": [
            {"name": "it-IT-DiegoNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "it-IT-ElsaNeural", "style": "general", "age": "adult"},
            {"name": "it-IT-IsabellaNeural", "style": "general", "age": "adult"},
        ]
    },
    "pt": {
        "male": [
            {"name": "pt-BR-AntonioNeural", "style": "general", "age": "adult"},
            {"name": "pt-PT-DuarteNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "pt-BR-FranciscaNeural", "style": "general", "age": "adult"},
            {"name": "pt-PT-RaquelNeural", "style": "general", "age": "adult"},
        ]
    },
    "ru": {
        "male": [
            {"name": "ru-RU-DmitryNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "ru-RU-SvetlanaNeural", "style": "general", "age": "adult"},
            {"name": "ru-RU-DariyaNeural", "style": "general", "age": "adult"},
        ]
    },
    "zh": {
        "male": [
            {"name": "zh-CN-YunxiNeural", "style": "general", "age": "adult"},
            {"name": "zh-CN-YunjianNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "zh-CN-XiaoxiaoNeural", "style": "expressive", "age": "young_adult"},
            {"name": "zh-CN-XiaoyiNeural", "style": "general", "age": "adult"},
        ]
    },
    "ja": {
        "male": [
            {"name": "ja-JP-KeitaNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "ja-JP-NanamiNeural", "style": "general", "age": "adult"},
        ]
    },
    "ko": {
        "male": [
            {"name": "ko-KR-InJoonNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "ko-KR-SunHiNeural", "style": "general", "age": "adult"},
        ]
    },
    "ar": {
        "male": [
            {"name": "ar-SA-HamedNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "ar-SA-ZariyahNeural", "style": "general", "age": "adult"},
        ]
    },
    "hi": {
        "male": [
            {"name": "hi-IN-MadhurNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "hi-IN-SwaraNeural", "style": "general", "age": "adult"},
        ]
    },
    "pl": {
        "male": [
            {"name": "pl-PL-MarekNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "pl-PL-ZofiaNeural", "style": "general", "age": "adult"},
        ]
    },
    "nl": {
        "male": [
            {"name": "nl-NL-MaartenNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "nl-NL-ColetteNeural", "style": "general", "age": "adult"},
        ]
    },
    "tr": {
        "male": [
            {"name": "tr-TR-AhmetNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "tr-TR-EmelNeural", "style": "general", "age": "adult"},
        ]
    },
    "sv": {
        "male": [
            {"name": "sv-SE-MattiasNeural", "style": "general", "age": "adult"},
        ],
        "female": [
            {"name": "sv-SE-SofieNeural", "style": "general", "age": "adult"},
        ]
    }
}

# Voice characteristics for consistent character assignment
class VoiceAssigner:
    def __init__(self):
        self.speaker_voice_map: Dict[str, str] = {}
        self.used_voices: Dict[str, set] = {}  # Per language
    
    def get_voice_for_speaker(
        self,
        speaker_id: str,
        language: str,
        gender: str = "unknown",
        pitch_estimate: float = 200.0,
        style: str = "general"
    ) -> Dict:
        """
        Get or assign a voice for a speaker.
        Ensures consistency - same speaker always gets same voice.
        """
        # Check if speaker already has assigned voice
        cache_key = f"{speaker_id}_{language}"
        if cache_key in self.speaker_voice_map:
            return {
                "voice": self.speaker_voice_map[cache_key],
                "cached": True,
                "speaker_id": speaker_id
            }
        
        # Determine gender from pitch if unknown
        if gender == "unknown":
            gender = "female" if pitch_estimate > 180 else "male"
        
        # Get available voices for language and gender
        lang_code = language[:2].lower()
        if lang_code not in EDGE_TTS_VOICES:
            lang_code = "en"  # Fallback to English
        
        voices = EDGE_TTS_VOICES[lang_code].get(gender, [])
        if not voices:
            voices = EDGE_TTS_VOICES[lang_code].get("female" if gender == "male" else "male", [])
        
        if not voices:
            return {
                "voice": "en-US-JennyNeural",  # Ultimate fallback
                "cached": False,
                "speaker_id": speaker_id,
                "fallback": True
            }
        
        # Track used voices for this language to maximize variety
        if lang_code not in self.used_voices:
            self.used_voices[lang_code] = set()
        
        # Prefer unused voices, or match style
        selected_voice = None
        for voice in voices:
            if voice["name"] not in self.used_voices[lang_code]:
                if style == "general" or voice.get("style") == style:
                    selected_voice = voice["name"]
                    break
        
        # If all voices used, just pick first matching style
        if not selected_voice:
            for voice in voices:
                if voice.get("style") == style:
                    selected_voice = voice["name"]
                    break
            if not selected_voice:
                selected_voice = voices[0]["name"]
        
        # Cache the assignment
        self.speaker_voice_map[cache_key] = selected_voice
        self.used_voices[lang_code].add(selected_voice)
        
        return {
            "voice": selected_voice,
            "cached": False,
            "speaker_id": speaker_id,
            "gender": gender,
            "language": lang_code
        }
    
    def assign_voices_for_movie(
        self,
        speakers: List[Dict],
        target_language: str
    ) -> Dict:
        """
        Assign voices for all speakers in a movie.
        
        Args:
            speakers: List of speaker dicts with 'id', 'gender', 'avg_pitch' keys
            target_language: Target dubbing language
        
        Returns:
            dict mapping speaker IDs to voice assignments
        """
        assignments = {}
        
        for speaker in speakers:
            speaker_id = speaker.get("id", str(speaker))
            result = self.get_voice_for_speaker(
                speaker_id=speaker_id,
                language=target_language,
                gender=speaker.get("gender", "unknown"),
                pitch_estimate=speaker.get("avg_pitch", 200.0),
                style=speaker.get("style", "general")
            )
            assignments[speaker_id] = result
        
        return {
            "success": True,
            "language": target_language,
            "assignments": assignments,
            "unique_voices_used": len(self.used_voices.get(target_language[:2].lower(), set()))
        }


def get_available_languages() -> List[str]:
    """Get list of supported languages."""
    return list(EDGE_TTS_VOICES.keys())


def get_voices_for_language(language: str) -> Dict:
    """Get all available voices for a language."""
    lang_code = language[:2].lower()
    if lang_code not in EDGE_TTS_VOICES:
        return {"error": f"Language {language} not supported"}
    
    return {
        "language": lang_code,
        "male_voices": [v["name"] for v in EDGE_TTS_VOICES[lang_code].get("male", [])],
        "female_voices": [v["name"] for v in EDGE_TTS_VOICES[lang_code].get("female", [])]
    }


def main():
    parser = argparse.ArgumentParser(description='Voice selector for dubbing')
    parser.add_argument('--language', '-l', default='en', help='Target language')
    parser.add_argument('--gender', '-g', default='unknown', help='Speaker gender')
    parser.add_argument('--speaker-id', '-s', default='speaker_0', help='Speaker ID')
    parser.add_argument('--pitch', '-p', type=float, default=200.0, help='Average pitch')
    parser.add_argument('--list-languages', action='store_true', help='List supported languages')
    parser.add_argument('--list-voices', action='store_true', help='List voices for language')
    
    args = parser.parse_args()
    
    if args.list_languages:
        print(json.dumps({"languages": get_available_languages()}, indent=2))
        return
    
    if args.list_voices:
        print(json.dumps(get_voices_for_language(args.language), indent=2))
        return
    
    # Single voice assignment
    assigner = VoiceAssigner()
    result = assigner.get_voice_for_speaker(
        speaker_id=args.speaker_id,
        language=args.language,
        gender=args.gender,
        pitch_estimate=args.pitch
    )
    
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
