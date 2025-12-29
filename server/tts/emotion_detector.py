#!/usr/bin/env python3
"""
Emotion Detector for Netflix-Quality Dubbing
Analyzes audio to detect emotional characteristics for expressive TTS.
Uses acoustic features (pitch, energy, tempo) to infer emotion.
"""

import sys
import json
import argparse
from typing import Optional, Dict, List, Tuple

# Try to import audio analysis libraries
try:
    import numpy as np
    import librosa
    import soundfile as sf
    HAS_LIBROSA = True
except ImportError as e:
    HAS_LIBROSA = False
    print(f"Warning: librosa/numpy not available ({e}), audio emotion detection disabled", file=sys.stderr)

# Emotion categories with corresponding TTS style hints
EMOTIONS = {
    "neutral": {"pitch_range": (0.9, 1.1), "energy": "medium", "rate": "normal"},
    "happy": {"pitch_range": (1.1, 1.3), "energy": "high", "rate": "slightly_fast"},
    "sad": {"pitch_range": (0.8, 0.95), "energy": "low", "rate": "slow"},
    "angry": {"pitch_range": (1.0, 1.2), "energy": "very_high", "rate": "fast"},
    "fearful": {"pitch_range": (1.1, 1.4), "energy": "medium_high", "rate": "fast"},
    "surprised": {"pitch_range": (1.2, 1.5), "energy": "high", "rate": "fast"},
    "disgusted": {"pitch_range": (0.85, 1.0), "energy": "medium", "rate": "slow"},
    "calm": {"pitch_range": (0.95, 1.05), "energy": "low", "rate": "slow"}
}

# Edge TTS voice style mapping
EDGE_TTS_STYLES = {
    "neutral": "general",
    "happy": "cheerful",
    "sad": "sad",
    "angry": "angry",
    "fearful": "fearful",
    "surprised": "excited",
    "disgusted": "unfriendly",
    "calm": "calm"
}


def extract_acoustic_features(audio_path: str) -> Dict:
    """
    Extract acoustic features from audio for emotion detection.
    
    Returns:
        dict with pitch, energy, tempo, and other features
    """
    if not HAS_LIBROSA:
        return {"error": "librosa not available for audio analysis"}
    
    try:
        # Load audio
        y, sr = librosa.load(audio_path, sr=22050)
        
        if len(y) == 0:
            return {"error": "Empty audio file"}
        
        # Extract pitch (F0)
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        pitch_values = []
        for t in range(pitches.shape[1]):
            pitch = pitches[:, t]
            mag = magnitudes[:, t]
            if np.max(mag) > 0.1:  # Only consider frames with significant energy
                index = np.argmax(mag)
                if pitch[index] > 0:
                    pitch_values.append(pitch[index])
        
        if pitch_values:
            mean_pitch = np.mean(pitch_values)
            pitch_std = np.std(pitch_values)
            pitch_range = np.max(pitch_values) - np.min(pitch_values)
        else:
            mean_pitch = 0
            pitch_std = 0
            pitch_range = 0
        
        # Extract RMS energy
        rms = librosa.feature.rms(y=y)[0]
        mean_energy = np.mean(rms)
        energy_std = np.std(rms)
        
        # Extract tempo
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        tempo = float(tempo) if isinstance(tempo, np.ndarray) else tempo
        
        # Extract spectral features
        spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
        spectral_rolloff = np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr))
        
        # Zero crossing rate (correlates with voiced/unvoiced)
        zcr = np.mean(librosa.feature.zero_crossing_rate(y))
        
        # Duration
        duration = len(y) / sr
        
        return {
            "success": True,
            "duration": round(duration, 3),
            "pitch": {
                "mean": round(float(mean_pitch), 2),
                "std": round(float(pitch_std), 2),
                "range": round(float(pitch_range), 2)
            },
            "energy": {
                "mean": round(float(mean_energy), 4),
                "std": round(float(energy_std), 4)
            },
            "tempo": round(float(tempo), 1),
            "spectral": {
                "centroid": round(float(spectral_centroid), 2),
                "rolloff": round(float(spectral_rolloff), 2)
            },
            "zcr": round(float(zcr), 4)
        }
        
    except Exception as e:
        return {"error": str(e)}


def classify_emotion(features: Dict) -> Dict:
    """
    Classify emotion based on acoustic features.
    
    Returns:
        dict with detected emotion and confidence
    """
    if "error" in features:
        return {"emotion": "neutral", "confidence": 0.0, "error": features["error"]}
    
    # Normalize features for classification
    pitch_mean = features.get("pitch", {}).get("mean", 200)
    pitch_std = features.get("pitch", {}).get("std", 0)
    energy_mean = features.get("energy", {}).get("mean", 0.1)
    energy_std = features.get("energy", {}).get("std", 0)
    tempo = features.get("tempo", 120)
    
    # Simple rule-based classification (can be replaced with ML model)
    scores = {}
    
    # High pitch + high energy + fast tempo = happy/excited
    if pitch_mean > 250 and energy_mean > 0.15 and tempo > 130:
        scores["happy"] = 0.7
        scores["surprised"] = 0.5
    
    # Low pitch + low energy + slow tempo = sad
    if pitch_mean < 180 and energy_mean < 0.1 and tempo < 100:
        scores["sad"] = 0.7
        scores["calm"] = 0.4
    
    # High energy + high pitch variability = angry
    if energy_mean > 0.2 and pitch_std > 50:
        scores["angry"] = 0.8
    
    # Very high pitch + high energy = fearful/surprised
    if pitch_mean > 300 and energy_mean > 0.12:
        scores["fearful"] = 0.6
        scores["surprised"] = 0.6
    
    # Low energy + moderate pitch = calm
    if energy_mean < 0.08 and pitch_std < 30:
        scores["calm"] = 0.6
    
    # Default to neutral if no strong signals
    if not scores:
        scores["neutral"] = 0.5
    
    # Get highest scoring emotion
    best_emotion = max(scores, key=scores.get)
    confidence = scores[best_emotion]
    
    return {
        "emotion": best_emotion,
        "confidence": round(confidence, 2),
        "all_scores": {k: round(v, 2) for k, v in sorted(scores.items(), key=lambda x: -x[1])},
        "tts_style": EDGE_TTS_STYLES.get(best_emotion, "general")
    }


def analyze_segment(audio_path: str) -> Dict:
    """
    Full emotion analysis for a single audio segment.
    """
    features = extract_acoustic_features(audio_path)
    emotion = classify_emotion(features)
    
    return {
        "success": "error" not in features,
        "features": features,
        "emotion": emotion,
        "tts_hints": get_tts_hints(emotion)
    }


def get_tts_hints(emotion_result: Dict) -> Dict:
    """
    Generate TTS parameter hints based on detected emotion.
    """
    emotion = emotion_result.get("emotion", "neutral")
    emotion_info = EMOTIONS.get(emotion, EMOTIONS["neutral"])
    
    # Map emotion to TTS parameters
    rate_map = {
        "slow": "-10%",
        "slightly_slow": "-5%",
        "normal": "+0%",
        "slightly_fast": "+5%",
        "fast": "+10%"
    }
    
    pitch_map = {
        (0.7, 0.85): "-10%",
        (0.85, 0.95): "-5%",
        (0.95, 1.05): "+0%",
        (1.05, 1.15): "+5%",
        (1.15, 1.5): "+10%"
    }
    
    # Get pitch adjustment
    pitch_range = emotion_info.get("pitch_range", (0.95, 1.05))
    pitch_center = (pitch_range[0] + pitch_range[1]) / 2
    pitch_adjust = "+0%"
    for (low, high), adj in pitch_map.items():
        if low <= pitch_center < high:
            pitch_adjust = adj
            break
    
    return {
        "rate": rate_map.get(emotion_info.get("rate", "normal"), "+0%"),
        "pitch": pitch_adjust,
        "style": EDGE_TTS_STYLES.get(emotion, "general"),
        "emphasis": "strong" if emotion in ["angry", "surprised", "fearful"] else "moderate"
    }


def analyze_segments_batch(audio_paths: List[str]) -> Dict:
    """
    Analyze multiple audio segments for emotion.
    """
    results = []
    for i, path in enumerate(audio_paths):
        result = analyze_segment(path)
        result["segment_index"] = i
        result["path"] = path
        results.append(result)
    
    # Aggregate statistics
    emotions = [r["emotion"]["emotion"] for r in results if r.get("success")]
    emotion_counts = {}
    for e in emotions:
        emotion_counts[e] = emotion_counts.get(e, 0) + 1
    
    dominant_emotion = max(emotion_counts, key=emotion_counts.get) if emotion_counts else "neutral"
    
    return {
        "success": True,
        "segments": results,
        "total_segments": len(audio_paths),
        "dominant_emotion": dominant_emotion,
        "emotion_distribution": emotion_counts
    }


def main():
    parser = argparse.ArgumentParser(description='Detect emotion in audio for dubbing')
    parser.add_argument('input', help='Input audio file')
    parser.add_argument('--output', '-o', help='Output JSON file (optional)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    result = analyze_segment(args.input)
    
    output = json.dumps(result, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        print(f"Results saved to {args.output}")
    else:
        print(output)
    
    if not result.get("success"):
        sys.exit(1)


if __name__ == '__main__':
    main()
