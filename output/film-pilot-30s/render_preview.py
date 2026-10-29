import json
import subprocess
from pathlib import Path

import imageio_ffmpeg


root = Path(__file__).resolve().parent
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
dialogues = [
    (0.8, 4.7, "Minh", "Mai tớ bắt đầu sống kỷ luật."),
    (5.2, 9.7, "Linh", "Cậu nói câu này từ thứ Hai\\Ntuần trước rồi."),
    (10.3, 15.6, "Minh", "Lần này khác.\\NTớ đặt báo thức rồi."),
    (16.3, 18.6, "Linh", "Mấy giờ?"),
    (19.3, 22.6, "Minh", "Chín giờ."),
    (23.2, 25.1, "Linh", "Chín giờ qua rồi."),
    (25.8, 29.4, "Minh", "Chín giờ… ngày mai."),
]


def timestamp(seconds, ass=False):
    if ass:
        return f"0:{int(seconds // 60):02}:{int(seconds % 60):02}.{round(seconds % 1 * 100):02}"
    return f"00:{int(seconds // 60):02}:{int(seconds % 60):02},{round(seconds % 1 * 1000):03}"


header = """[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Minh,Arial,36,&H00FFE4AC,&H000000FF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,3,2,0,2,40,40,150,1
Style: Linh,Arial,36,&H00C2F5D2,&H000000FF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,3,2,0,2,40,40,150,1
Style: Label,Arial,21,&H00FFFFFF,&H000000FF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,3,2,0,8,20,20,34,1
Style: Title,Arial,44,&H00FFFFFF,&H000000FF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,3,2,0,8,20,20,88,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
events = [
    "Dialogue: 0,0:00:00.00,0:00:30.00,Label,,0,0,0,,BẢN DỰNG NHÁP · ẢNH + PHỤ ĐỀ · CHƯA CÓ GIỌNG",
    "Dialogue: 0,0:00:00.20,0:00:02.40,Title,,0,0,0,,HẸN NGÀY MAI",
]
srt = []
for index, (start, end, speaker, text) in enumerate(dialogues, 1):
    events.append(f"Dialogue: 1,{timestamp(start, True)},{timestamp(end, True)},{speaker},,0,0,0,,{speaker.upper()}\\N{text}")
    srt.append(f"{index}\n{timestamp(start)} --> {timestamp(end)}\n{speaker}: " + text.replace("\\N", "\n") + "\n")
(root / "dialogue.ass").write_text(header + "\n".join(events), encoding="utf-8-sig")
(root / "dialogue.srt").write_text("\n".join(srt), encoding="utf-8-sig")

shots = [(5, "wide"), (5, "left"), (6, "right"), (3, "left"), (4, "right"), (7, "wide")]
filters = ["[0:v]split=6" + "".join(f"[s{i}]" for i in range(6))]
for index, (duration, angle) in enumerate(shots):
    frames = duration * 24
    if angle == "wide":
        zoom = "1.01+0.00025*on"
        x, y = "(iw-iw/zoom)/2", "(ih-ih/zoom)/2"
    else:
        zoom = "1.75+0.00045*on"
        center = "0.27" if angle == "left" else "0.70"
        x = f"max(0,min(iw-iw/zoom,iw*{center}-iw/zoom/2))"
        y = "max(0,min(ih-ih/zoom,ih*0.35-ih/zoom/2))"
    filters.append(f"[s{index}]zoompan=z='{zoom}':x='{x}':y='{y}':d={frames}:s=720x1280:fps=24,setpts=PTS-STARTPTS[v{index}]")
filters.append("".join(f"[v{i}]" for i in range(6)) + "concat=n=6:v=1:a=0,ass=dialogue.ass,fade=t=in:st=0:d=0.3,fade=t=out:st=29.6:d=0.4[out]")
output = root / "hen-ngay-mai-30s-animatic.mp4"
subprocess.run([
    ffmpeg, "-hide_banner", "-loglevel", "warning", "-y", "-i", "characters.png",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex", ";".join(filters),
    "-map", "[out]", "-map", "1:a", "-t", "30", "-r", "24", "-c:v", "libx264",
    "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k",
    "-movflags", "+faststart", str(output),
], cwd=root, check=True)
frames, seconds = imageio_ffmpeg.count_frames_and_secs(str(output))
assert frames == 720 and abs(seconds - 30) < 0.1, (frames, seconds)
print(json.dumps({"file": str(output), "frames": frames, "seconds": seconds, "bytes": output.stat().st_size, "kind": "animatic_without_voice_or_lip_sync"}))
