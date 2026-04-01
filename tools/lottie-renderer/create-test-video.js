/**
 * Creates a simple test MP4 video using FFmpeg (solid color + text).
 * Used as a stand-in for the real +1.mp4 from Google Drive.
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const OUTPUT = 'test-input.mp4';

if (existsSync(OUTPUT)) {
  console.log(`✓ ${OUTPUT} already exists, skipping creation`);
  process.exit(0);
}

console.log('Creating test input video...');

try {
  // 5-second 1920x1080 video with dark gradient background + "BOUCLE VIDEO" text
  execSync(`ffmpeg -y \
    -f lavfi -i "color=c=0x1a1a3e:s=1920x1080:d=5:r=30" \
    -vf "drawtext=text='BOUCLE VIDEO EN COURS':fontsize=60:fontcolor=white@0.3:x=(w-text_w)/2:y=(h-text_h)/2:font=Arial" \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
    ${OUTPUT}`, { stdio: 'inherit' });

  console.log(`✓ Created ${OUTPUT}`);
} catch (error) {
  console.error('FFmpeg not found. Install with: brew install ffmpeg');
  process.exit(1);
}
