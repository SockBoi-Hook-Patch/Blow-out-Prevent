#!/usr/bin/env python3
"""Mix a voice-over into a rendered episode video.

Usage: python3 tools/mix_vo.py <video_in.mp4> <vo_dir> <video_out.mp4>

<vo_dir> holds script.json ([{"id": 1, "t": 0.4, "end": 5.0, "text": ...}, ...]) and
voNN.mp3 files (NN = zero-padded id). Each clip starts at `t`; a clip longer than its
window (end - t) is sped up (max 1.25x).

Voice clean-up per clip: FFT denoise, silence trim at head/tail, gentle de-ess, voice EQ,
short fades (no clicks). Voice bus: level-matched across voices, light compression and a
very small shared room so separate takes sound like one continuous read. Music/SFX
already in the video are ducked smoothly under the voice. Video stream is copied.
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

# per-clip clean-up (before timing): denoise, trim silence both ends, de-ess, EQ
CLEAN = ("afftdn=nr=12:nf=-40:tn=1,"
         "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,"
         "areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.08,areverse,"
         "highpass=f=85,equalizer=f=250:t=q:w=1.2:g=-2.5,equalizer=f=3200:t=q:w=1.0:g=2,"
         "deesser=i=0.35:m=0.5:f=0.5")

inputs, chains, labels = ['-i', src], [], []
for k, seg in enumerate(script, start=1):
    f = vo_files[k - 1]
    d, win = dur(f), seg['end'] - seg['t']
    d = max(0.1, d - 0.15)  # rough length after silence trim
    tempo = min(1.25, d / win) if d > win else 1.0
    inputs += ['-i', f]
    ms = int(round(seg['t'] * 1000))
    chain = f"[{k}:a]aresample=48000,aformat=channel_layouts=mono,{CLEAN}"
    if tempo > 1.0:
        chain += f",atempo={tempo:.3f}"
        print(f"vo{seg['id']:02d}: ~{d:.2f}s > {win:.2f}s window, tempo {tempo:.3f}")
    chain += ",afade=t=in:d=0.02,areverse,afade=t=in:d=0.08,areverse"
    chain += f",aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{k}]"
    chains.append(chain)
    labels.append(f"[v{k}]")

n = len(script)
fc = ';'.join(chains)
# voice bus: level match, compression, tiny shared room for cohesion
fc += (f";{''.join(labels)}amix=inputs={n}:normalize=0,volume={vo_gain_db:.2f}dB,"
       "acompressor=threshold=-20dB:ratio=3:attack=8:release=150:makeup=1,volume=2.2,"
       "aecho=in_gain=1.0:out_gain=0.95:delays=23|41:decays=0.10|0.06,asplit=2[vo][sc]")
fc += ";[0:a]volume=0.85[mus]"
# smooth ducking: slower attack/release so the music breathes instead of pumping
fc += ";[mus][sc]sidechaincompress=threshold=0.025:ratio=5:attack=60:release=900:knee=6:makeup=1[duck]"
fc += ";[duck][vo]amix=inputs=2:normalize=0,alimiter=limit=0.84:attack=5:release=60:level=0[aout]"

cmd = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', fc,
       '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
       '-movflags', '+faststart', out]
subprocess.check_call(cmd)
print('wrote', out)
