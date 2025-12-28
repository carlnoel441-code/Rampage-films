#!/usr/bin/env python3
"""
ML-based User Preference Learning for Dubbing.
Analyzes user behavior and ratings to optimize voice selection.
"""

import sys
import json
from typing import Dict, Any, List, Optional
from collections import defaultdict
import math


def calculate_language_preferences(watch_history: List[Dict], ratings: List[Dict]) -> Dict[str, Any]:
    """
    Calculate preferred languages based on watch history and ratings.
    Uses weighted scoring: high ratings + completion % + no switch-back = higher preference.
    """
    language_scores = defaultdict(float)
    language_counts = defaultdict(int)
    
    for watch in watch_history:
        lang = watch.get("language_code", "")
        if not lang:
            continue
        
        completion = float(watch.get("completion_percent", 0))
        switched = int(watch.get("switched_to_original", 0))
        
        score = completion / 100
        if switched:
            score *= 0.5
        
        language_scores[lang] += score
        language_counts[lang] += 1
    
    for rating in ratings:
        lang = rating.get("language_code", "")
        if not lang:
            continue
        
        rating_value = int(rating.get("rating", 3))
        language_scores[lang] += (rating_value - 3) * 0.5
    
    if not language_scores:
        return {
            "preferred_languages": [],
            "primary_language": None,
            "language_confidence": 0
        }
    
    sorted_langs = sorted(language_scores.items(), key=lambda x: x[1], reverse=True)
    
    total_watches = sum(language_counts.values())
    primary_count = language_counts.get(sorted_langs[0][0], 0) if sorted_langs else 0
    confidence = min(1.0, (primary_count / max(total_watches, 1)) * (min(total_watches, 10) / 10))
    
    return {
        "preferred_languages": [lang for lang, _ in sorted_langs[:5]],
        "primary_language": sorted_langs[0][0] if sorted_langs else None,
        "language_confidence": round(confidence, 3)
    }


def calculate_voice_preferences(ratings: List[Dict], watch_history: List[Dict]) -> Dict[str, Any]:
    """
    Infer voice preferences from ratings correlated with voice characteristics.
    """
    gender_scores = {"male": 0, "female": 0}
    gender_counts = {"male": 0, "female": 0}
    
    for rating in ratings:
        voice_model = rating.get("voice_model", "")
        rating_value = int(rating.get("rating", 3))
        
        if not voice_model:
            continue
        
        voice_lower = voice_model.lower()
        if any(g in voice_lower for g in ["female", "woman", "girl", "jenny", "aria", "sara"]):
            gender = "female"
        elif any(g in voice_lower for g in ["male", "man", "guy", "davis", "tony", "guy"]):
            gender = "male"
        else:
            continue
        
        gender_scores[gender] += rating_value
        gender_counts[gender] += 1
    
    for watch in watch_history:
        voice_model = watch.get("voice_model", "")
        completion = float(watch.get("completion_percent", 0))
        switched = int(watch.get("switched_to_original", 0))
        
        if not voice_model:
            continue
        
        voice_lower = voice_model.lower()
        if any(g in voice_lower for g in ["female", "woman", "girl", "jenny", "aria", "sara"]):
            gender = "female"
        elif any(g in voice_lower for g in ["male", "man", "guy", "davis", "tony", "guy"]):
            gender = "male"
        else:
            continue
        
        score = (completion / 100) * (0.5 if switched else 1.0)
        gender_scores[gender] += score * 3
        gender_counts[gender] += 1
    
    total_interactions = sum(gender_counts.values())
    if total_interactions < 3:
        return {
            "preferred_voice_gender": None,
            "preferred_voice_style": "natural",
            "voice_confidence": 0
        }
    
    male_avg = gender_scores["male"] / max(gender_counts["male"], 1)
    female_avg = gender_scores["female"] / max(gender_counts["female"], 1)
    
    if abs(male_avg - female_avg) < 0.5:
        preferred_gender = "neutral"
        confidence = 0.3
    elif male_avg > female_avg:
        preferred_gender = "male"
        confidence = min(1.0, (male_avg - female_avg) / 3)
    else:
        preferred_gender = "female"
        confidence = min(1.0, (female_avg - male_avg) / 3)
    
    confidence *= min(1.0, total_interactions / 10)
    
    return {
        "preferred_voice_gender": preferred_gender,
        "preferred_voice_style": "natural",
        "voice_confidence": round(confidence, 3)
    }


def calculate_quality_threshold(ratings: List[Dict], quality_metrics: List[Dict]) -> float:
    """
    Determine user's quality threshold based on which tracks they rate highly.
    """
    high_rated_scores = []
    low_rated_scores = []
    
    quality_map = {m.get("dubbed_track_id"): m for m in quality_metrics}
    
    for rating in ratings:
        track_id = rating.get("dubbed_track_id")
        rating_value = int(rating.get("rating", 3))
        
        if track_id in quality_map:
            overall_score = float(quality_map[track_id].get("overall_score", 70))
            
            if rating_value >= 4:
                high_rated_scores.append(overall_score)
            elif rating_value <= 2:
                low_rated_scores.append(overall_score)
    
    if high_rated_scores and low_rated_scores:
        threshold = (min(high_rated_scores) + max(low_rated_scores)) / 2
    elif high_rated_scores:
        threshold = min(high_rated_scores) - 5
    else:
        threshold = 70
    
    return round(max(50, min(95, threshold)), 2)


def calculate_implied_satisfaction(watch_data: Dict) -> float:
    """
    Calculate implied satisfaction from watch behavior (0-5 scale).
    """
    completion = float(watch_data.get("completion_percent", 0))
    switched = int(watch_data.get("switched_to_original", 0))
    switch_time = watch_data.get("switch_time")
    downloaded = int(watch_data.get("downloaded_track", 0))
    
    base_score = (completion / 100) * 4
    
    if switched:
        if switch_time and switch_time < 300:
            base_score = min(base_score, 1.5)
        else:
            base_score *= 0.7
    
    if downloaded:
        base_score = min(5, base_score + 0.5)
    
    return round(max(0, min(5, base_score)), 2)


def update_user_preferences(
    current_prefs: Optional[Dict],
    new_watch: Optional[Dict] = None,
    new_rating: Optional[Dict] = None,
    all_watch_history: List[Dict] = None,
    all_ratings: List[Dict] = None,
    quality_metrics: List[Dict] = None
) -> Dict[str, Any]:
    """
    Update user preferences based on new data.
    Uses exponential moving average for smooth updates.
    """
    if not all_watch_history:
        all_watch_history = []
    if not all_ratings:
        all_ratings = []
    if not quality_metrics:
        quality_metrics = []
    
    if not current_prefs:
        current_prefs = {
            "total_dubbed_watched": 0,
            "total_ratings_given": 0,
            "avg_rating_given": None
        }
    
    lang_prefs = calculate_language_preferences(all_watch_history, all_ratings)
    voice_prefs = calculate_voice_preferences(all_ratings, all_watch_history)
    quality_threshold = calculate_quality_threshold(all_ratings, quality_metrics)
    
    total_watched = len(all_watch_history)
    total_ratings = len(all_ratings)
    avg_rating = None
    if all_ratings:
        avg_rating = round(sum(int(r.get("rating", 3)) for r in all_ratings) / len(all_ratings), 2)
    
    return {
        "preferred_languages": lang_prefs["preferred_languages"],
        "primary_language": lang_prefs["primary_language"],
        "preferred_voice_gender": voice_prefs["preferred_voice_gender"],
        "preferred_voice_style": voice_prefs["preferred_voice_style"],
        "quality_threshold": quality_threshold,
        "total_dubbed_watched": total_watched,
        "total_ratings_given": total_ratings,
        "avg_rating_given": avg_rating,
        "language_confidence": lang_prefs["language_confidence"],
        "voice_confidence": voice_prefs["voice_confidence"]
    }


def recommend_voice_for_user(
    user_prefs: Dict,
    available_voices: List[Dict],
    target_language: str
) -> Dict[str, Any]:
    """
    Recommend the best voice for a user based on their preferences.
    """
    if not available_voices:
        return {"voice": None, "confidence": 0, "reason": "No voices available"}
    
    preferred_gender = user_prefs.get("preferred_voice_gender", "neutral")
    voice_confidence = float(user_prefs.get("voice_confidence", 0) or 0)
    
    scored_voices = []
    for voice in available_voices:
        score = 50
        
        voice_name = voice.get("name", "").lower()
        voice_gender = voice.get("gender", "neutral")
        
        if preferred_gender == voice_gender:
            score += 30 * voice_confidence
        elif preferred_gender == "neutral":
            score += 10
        
        if target_language.lower() in voice_name:
            score += 15
        
        if voice.get("neural", False):
            score += 10
        
        scored_voices.append((voice, score))
    
    scored_voices.sort(key=lambda x: x[1], reverse=True)
    best_voice, best_score = scored_voices[0]
    
    return {
        "voice": best_voice,
        "confidence": round(best_score / 100, 2),
        "reason": f"Selected based on {preferred_gender} preference" if voice_confidence > 0.3 else "Default selection"
    }


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: preference_learning.py <action> [json_data]"
        }))
        sys.exit(1)
    
    action = sys.argv[1]
    data = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    
    try:
        if action == "update_preferences":
            result = update_user_preferences(
                current_prefs=data.get("current_prefs"),
                all_watch_history=data.get("watch_history", []),
                all_ratings=data.get("ratings", []),
                quality_metrics=data.get("quality_metrics", [])
            )
        elif action == "calculate_satisfaction":
            result = {"implied_satisfaction": calculate_implied_satisfaction(data)}
        elif action == "recommend_voice":
            result = recommend_voice_for_user(
                user_prefs=data.get("user_prefs", {}),
                available_voices=data.get("available_voices", []),
                target_language=data.get("target_language", "en")
            )
        else:
            result = {"error": f"Unknown action: {action}"}
        
        print(json.dumps({"success": True, **result}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
