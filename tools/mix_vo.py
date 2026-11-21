#!/usr/bin/env python3
"""Mix a voice-over into a rendered episode video.

Usage: python3 tools/mix_vo.py <video_in.mp4> <vo_dir> <video_out.mp4>

<vo_dir> holds script.json ([{"id": 1, "t": 0.4, "end": 5.0, "text": ...}, ...]) and
voNN.mp3 files (NN = zero-padded id). Each clip starts at `t`; a clip longer than its
window (end - t) is sped up (max 1.25x). Music/SFX already in the video are ducked
under the voice with a sidechain compressor. Video stream is copied, not re-encoded.
"""
import json, os, subprocess, sys

src, vo_dir, out = sys.argv[1:4]
script = json.load(open(os.path.join(vo_dir, 'script.json')))

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                          '-of', 'csv=p=0', f]).decode().strip())

def mean_db(files):
    out = subprocess.run(['ffmpeg', '-v', 'info', '-i', 'concat:' + '|'.join(files), '-af', 'volumedetect',
                          '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(out.split('mean_volume:')[1].split('dB')[0])

# normalise every voice to the same speech level so a softer voice isn't buried
VO_TARGET_DB = -15.0
vo_files = [os.path.join(vo_dir, f"vo{seg['id']:02d}.mp3") for seg in script]
vo_gain_db = VO_TARGET_DB - mean_db(vo_files)
print(f"voice level gain {vo_gain_db:+.1f} dB")

inputs, chains, labels = ['-i', src], [], []
for k, seg in enumerate(script, start=1):
    f = os.path.join(vo_dir, f"vo{seg['id']:02d}.mp3")
    d, win = dur(f), seg['end'] - seg['t']
    tempo = min(1.25, d / win) if d > win else 1.0
    inputs += ['-i', f]
    ms = int(round(seg['t'] * 1000))
    chain = f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo"
    if tempo > 1.0:
        chain += f",atempo={tempo:.3f}"
        print(f"vo{seg['id']:02d}: {d:.2f}s > {win:.2f}s window, tempo {tempo:.3f}")
    chain += f",adelay={ms}|{ms}[v{k}]"
    chains.append(chain)
    labels.append(f"[v{k}]")

n = len(script)
fc = ';'.join(chains)
fc += f";{''.join(labels)}amix=inputs={n}:normalize=0,highpass=f=80,volume={vo_gain_db:.2f}dB,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=2.2,asplit=2[vo][sc]"
fc += ";[0:a]volume=0.85[mus]"
fc += ";[mus][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400:makeup=1[duck]"
fc += ";[duck][vo]amix=inputs=2:normalize=0,alimiter=limit=0.89[aout]"

cmd = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', fc,
       '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
       '-movflags', '+faststart', out]
subprocess.check_call(cmd)
print('wrote', out)
