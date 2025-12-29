#!/usr/bin/env python3
"""
Google Speech Recognition transcription with segment timestamps
Free cloud-based speech recognition - no local dependencies
Outputs timestamped segments for precise dubbing sync
"""
import sys
import os
import json
import subprocess
import speech_recognition as sr
from concurrent.futures import ThreadPoolExecutor, as_completed

def main():
    if len(sys.argv) < 4:
        print("Usage: python transcribe.py <audio_file> <language> <output_file>", file=sys.stderr)
        sys.exit(1)
    
    audio_file = sys.argv[1]
    language = sys.argv[2]
    output_file = sys.argv[3]
    
    if not os.path.exists(audio_file):
        print(f"Error: Audio file not found: {audio_file}", file=sys.stderr)
        sys.exit(1)
    
    # Get file size for progress estimation
    file_size = os.path.getsize(audio_file)
    file_size_mb = file_size / (1024 * 1024)
    print(f"Transcribing {audio_file} ({file_size_mb:.1f}MB) using Google Speech Recognition (free)...", file=sys.stderr)
    
    # Convert to WAV format required by SpeechRecognition
    wav_file = audio_file.rsplit('.', 1)[0] + '_sr.wav'
    print(f"Converting to WAV format...", file=sys.stderr)
    
    subprocess.run([
        'ffmpeg', '-y', '-i', audio_file,
        '-ar', '16000', '-ac', '1', '-f', 'wav',
        wav_file
    ], capture_output=True)
    
    if not os.path.exists(wav_file):
        print(f"Error: Failed to convert audio to WAV", file=sys.stderr)
        sys.exit(1)
    
    # Get audio duration
    duration = get_audio_duration(wav_file)
    print(f"Audio duration: {duration:.1f} seconds ({duration/60:.1f} minutes)", file=sys.stderr)
    
    # Map language codes
    lang_map = {
        'en': 'en-US', 'en-us': 'en-US', 'en-gb': 'en-GB',
        'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE',
        'it': 'it-IT', 'pt': 'pt-BR', 'ru': 'ru-RU',
        'zh': 'zh-CN', 'ja': 'ja-JP', 'ko': 'ko-KR',
        'hi': 'hi-IN', 'ar': 'ar-SA', 'nl': 'nl-NL',
        'pl': 'pl-PL', 'tr': 'tr-TR', 'sv': 'sv-SE'
    }
    lang_code = lang_map.get(language.lower(), language)
    
    # Transcribe in chunks
    segments = transcribe_chunked(wav_file, lang_code, duration)
    
    # Clean up temp WAV file
    try:
        os.remove(wav_file)
    except:
        pass
    
    if not segments:
        print("Warning: Transcription produced no segments", file=sys.stderr)
        segments = []
    
    # Calculate full text
    full_text = " ".join([seg["text"] for seg in segments if seg.get("text")])
    
    # Build output structure
    output = {
        "language": language,
        "full_text": full_text.strip(),
        "segments": segments,
        "total_segments": len(segments),
        "total_duration": round(segments[-1]["end"], 3) if segments else 0
    }
    
    # Write JSON output for segment-based processing
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"Transcription complete: {len(segments)} segments", file=sys.stderr)
    print(f"Total duration: {output['total_duration']}s", file=sys.stderr)
    print(f"Saved to: {output_file}", file=sys.stderr)

def get_audio_duration(wav_file: str) -> float:
    """Get audio duration using ffprobe"""
    result = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', 
         '-of', 'default=noprint_wrappers=1:nokey=1', wav_file],
        capture_output=True, text=True
    )
    try:
        return float(result.stdout.strip())
    except:
        return 0

def transcribe_chunk(args):
    """Transcribe a single chunk - for parallel processing"""
    chunk_file, chunk_start, chunk_num, lang_code = args
    
    recognizer = sr.Recognizer()
    
    try:
        with sr.AudioFile(chunk_file) as source:
            audio = recognizer.record(source)
        
        # Use Google's free speech recognition
        text = recognizer.recognize_google(audio, language=lang_code)
        
        # Get chunk duration
        duration = get_audio_duration(chunk_file)
        
        return {
            "chunk_num": chunk_num,
            "start": chunk_start,
            "end": chunk_start + duration,
            "text": text.strip(),
            "success": True
        }
    except sr.UnknownValueError:
        # No speech detected in this chunk
        duration = get_audio_duration(chunk_file)
        return {
            "chunk_num": chunk_num,
            "start": chunk_start,
            "end": chunk_start + duration,
            "text": "",
            "success": True
        }
    except sr.RequestError as e:
        return {
            "chunk_num": chunk_num,
            "start": chunk_start,
            "end": chunk_start + 30,
            "text": "",
            "success": False,
            "error": str(e)
        }
    except Exception as e:
        return {
            "chunk_num": chunk_num,
            "start": chunk_start,
            "end": chunk_start + 30,
            "text": "",
            "success": False,
            "error": str(e)
        }

def transcribe_chunked(wav_file: str, lang_code: str, total_duration: float) -> list:
    """Transcribe audio in chunks using Google Speech Recognition"""
    import tempfile
    
    # Split into 30-second chunks (Google's limit)
    chunk_duration = 30
    segments = []
    chunk_start = 0
    chunk_num = 0
    chunk_files = []
    chunk_args = []
    
    tmpdir = tempfile.mkdtemp()
    
    print(f"Splitting audio into {int(total_duration / chunk_duration) + 1} chunks...", file=sys.stderr)
    
    # Create all chunks first
    while chunk_start < total_duration:
        chunk_num += 1
        chunk_file = os.path.join(tmpdir, f"chunk_{chunk_num}.wav")
        
        # Extract chunk using ffmpeg
        subprocess.run([
            'ffmpeg', '-y', '-i', wav_file,
            '-ss', str(chunk_start),
            '-t', str(chunk_duration),
            '-ar', '16000', '-ac', '1',
            chunk_file
        ], capture_output=True)
        
        if os.path.exists(chunk_file) and os.path.getsize(chunk_file) > 1000:
            chunk_files.append(chunk_file)
            chunk_args.append((chunk_file, chunk_start, chunk_num, lang_code))
        
        chunk_start += chunk_duration
    
    print(f"Transcribing {len(chunk_args)} chunks...", file=sys.stderr)
    
    # Process chunks with progress updates
    results = []
    completed = 0
    
    # Process sequentially to avoid rate limits
    for args in chunk_args:
        result = transcribe_chunk(args)
        results.append(result)
        completed += 1
        
        if completed % 10 == 0 or completed == len(chunk_args):
            progress = int((completed / len(chunk_args)) * 100)
            print(f"Progress: {progress}% ({completed}/{len(chunk_args)} chunks)", file=sys.stderr)
    
    # Sort results by chunk number and build segments
    results.sort(key=lambda x: x["chunk_num"])
    
    segment_id = 0
    for result in results:
        if result.get("text"):
            segments.append({
                "id": segment_id,
                "start": round(result["start"], 3),
                "end": round(result["end"], 3),
                "text": result["text"],
                "words": [],
                "duration": round(result["end"] - result["start"], 3)
            })
            segment_id += 1
    
    # Clean up chunk files
    for chunk_file in chunk_files:
        try:
            os.remove(chunk_file)
        except:
            pass
    try:
        os.rmdir(tmpdir)
    except:
        pass
    
    return segments

if __name__ == "__main__":
    main()
