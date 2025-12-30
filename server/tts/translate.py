#!/usr/bin/env python3
"""
Translation service for AI dubbing
Supports DeepL (primary) and OpenAI GPT as translation engines.
Supports 40+ languages with context-aware translation.
"""
import sys
import os
import json
import urllib.request
import urllib.parse


# DeepL language code mapping (DeepL uses different codes for some languages)
DEEPL_LANGUAGE_MAP = {
    "en": "EN",
    "en-US": "EN-US",
    "en-GB": "EN-GB",
    "es": "ES",
    "es-MX": "ES",
    "es-AR": "ES",
    "fr": "FR",
    "fr-CA": "FR",
    "de": "DE",
    "it": "IT",
    "pt": "PT-PT",
    "pt-BR": "PT-BR",
    "pt-PT": "PT-PT",
    "ru": "RU",
    "zh": "ZH",
    "zh-CN": "ZH-HANS",
    "zh-TW": "ZH-HANT",
    "ja": "JA",
    "ko": "KO",
    "ar": "AR",
    "nl": "NL",
    "pl": "PL",
    "tr": "TR",
    "sv": "SV",
    "da": "DA",
    "fi": "FI",
    "el": "EL",
    "cs": "CS",
    "ro": "RO",
    "hu": "HU",
    "id": "ID",
    "uk": "UK",
    "nb": "NB",
    "no": "NB",
    "sk": "SK",
    "sl": "SL",
    "bg": "BG",
    "et": "ET",
    "lv": "LV",
    "lt": "LT",
}

SUPPORTED_LANGUAGES = {
    "es": "Spanish",
    "es-MX": "Spanish (Mexican)",
    "es-AR": "Spanish (Argentine)",
    "fr": "French",
    "fr-CA": "French (Canadian)",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "pt-BR": "Portuguese (Brazilian)",
    "pt-PT": "Portuguese (European)",
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
    "en": "English",
    "en-US": "English (American)",
    "en-GB": "English (British)",
    "en-AU": "English (Australian)",
    "en-IN": "English (Indian)",
}


def get_language_name(code: str) -> str:
    """Get human-readable language name from code."""
    if code in SUPPORTED_LANGUAGES:
        return SUPPORTED_LANGUAGES[code]
    base_code = code.split("-")[0]
    if base_code in SUPPORTED_LANGUAGES:
        return SUPPORTED_LANGUAGES[base_code]
    return code


def get_deepl_code(lang_code: str) -> str:
    """Convert language code to DeepL format."""
    if lang_code in DEEPL_LANGUAGE_MAP:
        return DEEPL_LANGUAGE_MAP[lang_code]
    base_code = lang_code.split("-")[0]
    if base_code in DEEPL_LANGUAGE_MAP:
        return DEEPL_LANGUAGE_MAP[base_code]
    return lang_code.upper()


def translate_with_deepl(text: str, source_lang: str, target_lang: str, context: str = "") -> dict:
    """
    Translate text using DeepL API for higher accuracy.
    
    Args:
        text: Text to translate
        source_lang: Source language code
        target_lang: Target language code
        context: Optional context (used to set formality)
    
    Returns:
        dict with translation result
    """
    api_key = os.environ.get("DEEPL_API_KEY")
    
    if not api_key:
        return {
            "success": False,
            "error": "DeepL API key not found. Set DEEPL_API_KEY environment variable.",
            "fallback": True
        }
    
    try:
        source_deepl = get_deepl_code(source_lang)
        target_deepl = get_deepl_code(target_lang)
        
        is_free_api = api_key.endswith(":fx")
        base_url = "https://api-free.deepl.com" if is_free_api else "https://api.deepl.com"
        url = f"{base_url}/v2/translate"
        
        data = {
            "auth_key": api_key,
            "text": text,
            "target_lang": target_deepl,
            "preserve_formatting": "1",
            "tag_handling": "xml",
        }
        
        if source_deepl and source_deepl != target_deepl:
            data["source_lang"] = source_deepl.split("-")[0]
        
        if context and "formal" in context.lower():
            data["formality"] = "prefer_more"
        elif context and ("casual" in context.lower() or "dialogue" in context.lower()):
            data["formality"] = "prefer_less"
        
        encoded_data = urllib.parse.urlencode(data).encode('utf-8')
        
        req = urllib.request.Request(url, data=encoded_data, method='POST')
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode('utf-8'))
        
        if "translations" in result and len(result["translations"]) > 0:
            translated_text = result["translations"][0]["text"]
            detected_lang = result["translations"][0].get("detected_source_language", source_lang)
            
            return {
                "success": True,
                "translation": translated_text,
                "source_lang": detected_lang,
                "target_lang": target_lang,
                "source_length": len(text),
                "translation_length": len(translated_text),
                "engine": "deepl"
            }
        else:
            return {
                "success": False,
                "error": "DeepL returned no translations",
                "fallback": True
            }
            
    except urllib.error.HTTPError as e:
        error_msg = f"DeepL API error: {e.code}"
        try:
            error_body = e.read().decode('utf-8')
            error_data = json.loads(error_body)
            error_msg = error_data.get("message", error_msg)
        except:
            pass
        return {
            "success": False,
            "error": error_msg,
            "fallback": True
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "fallback": True
        }


def translate_with_openai(text: str, source_lang: str, target_lang: str, context: str = "") -> dict:
    """
    Translate text using OpenAI GPT via HTTP API.
    Uses Replit AI Integrations if available, falls back to standard OpenAI API.
    
    Args:
        text: Text to translate
        source_lang: Source language code (e.g., 'en', 'en-US')
        target_lang: Target language code (e.g., 'es', 'fr')
        context: Optional context about the content (e.g., 'movie dialogue', 'documentary narration')
    
    Returns:
        dict with translation result
    """
    # Check for Replit AI Integrations first, then standard OpenAI
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    
    if not api_key or api_key == "_DUMMY_API_KEY_":
        # If using Replit AI Integrations with dummy key, that's fine if base_url is set
        if not base_url:
            return {
                "success": False,
                "error": "OpenAI API key not found. Set OPENAI_API_KEY or configure AI Integrations."
            }
    
    try:
        source_name = get_language_name(source_lang)
        target_name = get_language_name(target_lang)
        
        context_hint = f" This is {context}." if context else ""
        
        system_prompt = f"""You are a professional translator specializing in film and media translation.
Translate the following text from {source_name} to {target_name}.{context_hint}

Translation guidelines:
- Maintain the original tone, emotion, and style
- Use natural, conversational language appropriate for spoken dialogue
- Preserve cultural nuances while adapting idioms for the target audience
- Keep sentence structure optimized for voice-over timing
- Do not add explanations or notes - provide only the translation"""

        # Use Replit AI Integrations base URL if available, otherwise standard OpenAI
        if base_url:
            url = f"{base_url}/chat/completions"
        else:
            url = "https://api.openai.com/v1/chat/completions"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Use gpt-4o-mini for translation (supported by AI Integrations)
        data = json.dumps({
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "temperature": 0.3,
            "max_completion_tokens": 4096
        }).encode('utf-8')
        
        req = urllib.request.Request(url, data=data, headers=headers)
        
        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode('utf-8'))
        
        translated_text = result["choices"][0]["message"]["content"].strip()
        
        return {
            "success": True,
            "translation": translated_text,
            "source_lang": source_lang,
            "target_lang": target_lang,
            "source_length": len(text),
            "translation_length": len(translated_text),
            "model": "gpt-4o-mini",
            "engine": "openai"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def translate_text(text: str, source_lang: str, target_lang: str, context: str = "", engine: str = "auto") -> dict:
    """
    Translate text using the best available translation engine.
    Tries DeepL first for higher accuracy, falls back to OpenAI GPT.
    
    Args:
        text: Text to translate
        source_lang: Source language code
        target_lang: Target language code
        context: Optional context about the content
        engine: Translation engine to use ('auto', 'deepl', 'openai')
    
    Returns:
        dict with translation result
    """
    if engine == "deepl":
        return translate_with_deepl(text, source_lang, target_lang, context)
    elif engine == "openai":
        return translate_with_openai(text, source_lang, target_lang, context)
    
    deepl_result = translate_with_deepl(text, source_lang, target_lang, context)
    
    if deepl_result.get("success"):
        print(f"Translation completed using DeepL", file=sys.stderr)
        return deepl_result
    
    if deepl_result.get("fallback"):
        print(f"DeepL unavailable ({deepl_result.get('error', 'unknown')}), falling back to OpenAI...", file=sys.stderr)
        openai_result = translate_with_openai(text, source_lang, target_lang, context)
        if openai_result.get("success"):
            openai_result["engine"] = "openai (fallback)"
        return openai_result
    
    return deepl_result


def translate_segments(segments: list, source_lang: str, target_lang: str, context: str = "", max_retries: int = 3) -> dict:
    """
    Translate a list of text segments (for subtitle-style translation).
    Maintains segment structure for timing alignment.
    
    Args:
        segments: List of text segments to translate
        source_lang: Source language code
        target_lang: Target language code
        context: Optional context
        max_retries: Maximum retry attempts for rate limiting
    
    Returns:
        dict with translated segments
    """
    import re
    import time
    
    # Check for Replit AI Integrations first, then standard OpenAI
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    
    if not api_key or (api_key == "_DUMMY_API_KEY_" and not base_url):
        return {
            "success": False,
            "error": "OpenAI API key not found"
        }
    
    source_name = get_language_name(source_lang)
    target_name = get_language_name(target_lang)
    
    context_hint = f" This is {context}." if context else ""
    
    numbered_text = "\n".join([f"[{i+1}] {seg}" for i, seg in enumerate(segments)])
    
    system_prompt = f"""You are a professional translator specializing in film and media translation.
Translate the following numbered segments from {source_name} to {target_name}.{context_hint}

Translation guidelines:
- Maintain the original tone, emotion, and style
- Use natural, conversational language appropriate for spoken dialogue
- Preserve cultural nuances while adapting idioms for the target audience
- Keep each segment at a similar length for voice-over timing
- Return translations in the same numbered format: [1] translation [2] translation etc.
- Do not add explanations or notes"""

    # Use Replit AI Integrations base URL if available, otherwise standard OpenAI
    if base_url:
        url = f"{base_url}/chat/completions"
    else:
        url = "https://api.openai.com/v1/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": numbered_text}
        ],
        "temperature": 0.3,
        "max_completion_tokens": 4096
    }).encode('utf-8')
    
    last_error = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers)
            
            with urllib.request.urlopen(req, timeout=180) as response:
                result = json.loads(response.read().decode('utf-8'))
            
            result_text = result["choices"][0]["message"]["content"].strip()
            
            translated_segments = []
            matches = re.findall(r'\[(\d+)\]\s*(.+?)(?=\[\d+\]|$)', result_text, re.DOTALL)
            
            for match in matches:
                translated_segments.append(match[1].strip())
            
            if len(translated_segments) != len(segments):
                translated_segments = result_text.split('\n')
                translated_segments = [s.strip() for s in translated_segments if s.strip()]
                translated_segments = [re.sub(r'^\[\d+\]\s*', '', s) for s in translated_segments]
            
            return {
                "success": True,
                "translations": translated_segments,
                "source_lang": source_lang,
                "target_lang": target_lang,
                "segment_count": len(translated_segments),
                "model": "gpt-4o-mini"
            }
            
        except urllib.error.HTTPError as e:
            last_error = f"HTTP {e.code}: {e.reason}"
            if e.code == 429:  # Rate limit
                wait_time = (2 ** attempt) * 5  # Exponential backoff: 5, 10, 20 seconds
                print(f"  Rate limited, waiting {wait_time}s before retry {attempt + 1}/{max_retries}...", file=sys.stderr)
                time.sleep(wait_time)
            elif e.code >= 500:  # Server error
                wait_time = (2 ** attempt) * 2
                print(f"  Server error {e.code}, waiting {wait_time}s before retry {attempt + 1}/{max_retries}...", file=sys.stderr)
                time.sleep(wait_time)
            else:
                break  # Don't retry client errors
        except urllib.error.URLError as e:
            last_error = f"Network error: {str(e.reason)}"
            wait_time = (2 ** attempt) * 3
            print(f"  Network error, waiting {wait_time}s before retry {attempt + 1}/{max_retries}...", file=sys.stderr)
            time.sleep(wait_time)
        except Exception as e:
            last_error = str(e)
            break  # Don't retry unknown errors
    
    return {
        "success": False,
        "error": last_error or "Translation failed after retries"
    }


def translate_timed_segments(segments: list, source_lang: str, target_lang: str, context: str = "") -> dict:
    """
    Translate segments while preserving their timestamps.
    
    Args:
        segments: List of dicts with 'text', 'start', 'end' keys
        source_lang: Source language code
        target_lang: Target language code
        context: Optional context for translation
    
    Returns:
        dict with translated segments including preserved timestamps
    """
    import time
    
    texts = [seg.get('text', '') for seg in segments if seg.get('text', '').strip()]
    
    if not texts:
        return {"success": False, "error": "No text segments to translate"}
    
    # Smaller batch size for more reliable processing
    BATCH_SIZE = 20
    all_translated = []
    failed_batches = 0
    max_batch_failures = 3
    
    for batch_start in range(0, len(texts), BATCH_SIZE):
        batch_texts = texts[batch_start:batch_start + BATCH_SIZE]
        batch_num = (batch_start // BATCH_SIZE) + 1
        total_batches = (len(texts) + BATCH_SIZE - 1) // BATCH_SIZE
        
        # Try translating this batch with retries
        result = translate_segments(batch_texts, source_lang, target_lang, context)
        
        if not result.get('success'):
            failed_batches += 1
            error_msg = result.get('error', 'Unknown error')
            print(f"  Batch {batch_num}/{total_batches} failed: {error_msg}", file=sys.stderr)
            
            if failed_batches >= max_batch_failures:
                return {
                    "success": False,
                    "error": f"Translation failed after {failed_batches} batch failures. Last error: {error_msg}",
                    "partial_count": len(all_translated)
                }
            
            # Wait before retrying the whole batch
            time.sleep(10)
            result = translate_segments(batch_texts, source_lang, target_lang, context)
            
            if not result.get('success'):
                return {
                    "success": False,
                    "error": f"Batch {batch_num} failed after retry: {result.get('error', 'Unknown')}",
                    "partial_count": len(all_translated)
                }
        
        all_translated.extend(result.get('translations', []))
        
        current_count = min(batch_start + BATCH_SIZE, len(texts))
        print(f"  Translated {current_count}/{len(texts)} segments", file=sys.stderr)
        
        # Add small delay between batches to prevent rate limiting
        if batch_start + BATCH_SIZE < len(texts):
            time.sleep(1.5)
    
    translated_segments = []
    text_idx = 0
    
    for seg in segments:
        if seg.get('text', '').strip():
            if text_idx < len(all_translated):
                translated_segments.append({
                    'text': all_translated[text_idx],
                    'start': seg.get('start', 0),
                    'end': seg.get('end', 0),
                    'original_text': seg.get('text', ''),
                    'speaker_id': seg.get('speaker_id'),
                    'gender': seg.get('gender', seg.get('detected_gender'))
                })
                text_idx += 1
    
    return {
        "success": True,
        "segments": translated_segments,
        "source_lang": source_lang,
        "target_lang": target_lang,
        "segment_count": len(translated_segments)
    }


def main():
    """CLI interface for translation service."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python translate.py <command> [args]",
            "commands": {
                "translate": "<input_file> <source_lang> <target_lang> <output_file> [context]",
                "list-languages": "",
                "check": ""
            }
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "translate":
        if len(sys.argv) < 6:
            print(json.dumps({"error": "Usage: translate <input_file> <source_lang> <target_lang> <output_file> [context]"}))
            sys.exit(1)
        
        input_file = sys.argv[2]
        source_lang = sys.argv[3]
        target_lang = sys.argv[4]
        output_file = sys.argv[5]
        context = sys.argv[6] if len(sys.argv) > 6 else "movie dialogue"
        
        if not os.path.exists(input_file):
            print(json.dumps({"error": f"Input file not found: {input_file}"}))
            sys.exit(1)
        
        with open(input_file, 'r', encoding='utf-8') as f:
            text = f.read().strip()
        
        if not text:
            print(json.dumps({"error": "Input file is empty"}))
            sys.exit(1)
        
        print(f"Translating from {get_language_name(source_lang)} to {get_language_name(target_lang)}...", file=sys.stderr)
        
        result = translate_text(text, source_lang, target_lang, context)
        
        if result["success"]:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(result["translation"])
            result["output_file"] = output_file
            print(f"Translation saved to: {output_file}", file=sys.stderr)
        
        print(json.dumps(result))
        sys.exit(0 if result["success"] else 1)
    
    elif command == "list-languages":
        languages = []
        for code, name in SUPPORTED_LANGUAGES.items():
            languages.append({
                "code": code,
                "name": name
            })
        print(json.dumps({"languages": languages}))
    
    elif command == "check":
        openai_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
        deepl_key = os.environ.get("DEEPL_API_KEY")
        print(json.dumps({
            "deepl_configured": bool(deepl_key),
            "openai_configured": bool(openai_key),
            "primary_engine": "deepl" if deepl_key else "openai",
            "fallback_engine": "openai" if deepl_key else None
        }))
    
    elif command == "translate-timed":
        if len(sys.argv) < 6:
            print(json.dumps({"error": "Usage: translate-timed <segments_json> <source_lang> <target_lang> <output_json> [context]"}))
            sys.exit(1)
        
        segments_file = sys.argv[2]
        source_lang = sys.argv[3]
        target_lang = sys.argv[4]
        output_file = sys.argv[5]
        context = sys.argv[6] if len(sys.argv) > 6 else "movie dialogue"
        
        with open(segments_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        segments = data.get('segments', []) if isinstance(data, dict) else data
        
        if not segments:
            print(json.dumps({"error": "No segments found in input file"}))
            sys.exit(1)
        
        print(f"Translating {len(segments)} timed segments from {get_language_name(source_lang)} to {get_language_name(target_lang)}...", file=sys.stderr)
        
        result = translate_timed_segments(segments, source_lang, target_lang, context)
        
        if result.get("success"):
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(result.get("segments", []), f, ensure_ascii=False, indent=2)
            result["output_file"] = output_file
            print(f"Translation saved to: {output_file}", file=sys.stderr)
        
        print(json.dumps(result))
        sys.exit(0 if result.get("success") else 1)
    
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
