'use strict';

const SPACE = 0x20;
const START_BYTE = 0xf8;
const TYPE_MAIN = 0x33;
const FRAME_LEN = 54;

function asciiDigit(n) {
  return 0x30 + (n % 10);
}

// Writes a right-aligned ASCII integer with leading spaces into dst[start..start+width).
function writeRightAlignedAscii(dst, start, width, value) {
  for (let i = 0; i < width; i++) dst[start + i] = SPACE;
  if (value <= 0) {
    dst[start + width - 1] = 0x30;
    return;
  }
  let rem = value;
  for (let i = width - 1; i >= 0 && rem > 0; i--) {
    dst[start + i] = asciiDigit(rem);
    rem = Math.floor(rem / 10);
  }
}

// Writes a 2-digit zero-padded ASCII number into dst[start..start+2).
function writeTwoDigits(dst, start, value) {
  const v = Math.max(0, Math.min(99, value));
  dst[start] = asciiDigit(Math.floor(v / 10));
  dst[start + 1] = asciiDigit(v);
}

function buildFrame0x33(state) {
  const buf = Buffer.alloc(FRAME_LEN, SPACE);
  buf[0] = START_BYTE;
  buf[1] = TYPE_MAIN;

  // Chrono MM:SS — or last-minute SS.d encoding (SPEC § 1.4.1).
  const chronoMs = Math.max(0, state.chronoMs | 0);
  if (state.clockRunning && chronoMs < 60_000) {
    // SPEC § 1.4.1 — encodage fragile, à recalibrer sur vraie console.
    // Heuristic Panel2Net l.299-305: bytes 2-3 hold the "SS" pair, byte 4 is the decimal separator slot,
    // byte 5 holds the tenths. Trimmed-length of bytes 4-5 must be 1 → place tenths at byte 5 and leave byte 4 as space.
    const totalTenths = Math.floor(chronoMs / 100);
    const seconds = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    writeTwoDigits(buf, 2, seconds);
    buf[4] = SPACE;
    buf[5] = asciiDigit(tenths);
  } else {
    const totalSec = Math.floor(chronoMs / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    writeTwoDigits(buf, 2, minutes);
    writeTwoDigits(buf, 4, seconds);
  }

  // Scores 3 bytes ASCII right-aligned, spaces leading.
  writeRightAlignedAscii(buf, 6, 3, state.homeScore);
  writeRightAlignedAscii(buf, 9, 3, state.guestScore);

  // Period 1..9.
  buf[12] = asciiDigit(Math.max(1, Math.min(9, state.period)));

  // Team fouls (0..5 in basket FIBA, clamp 9).
  buf[13] = asciiDigit(Math.min(9, state.homeTeamFouls));
  buf[14] = asciiDigit(Math.min(9, state.guestTeamFouls));

  // Timeouts remaining.
  buf[15] = asciiDigit(Math.min(9, state.homeTimeoutsLeft));
  buf[16] = asciiDigit(Math.min(9, state.guestTimeoutsLeft));

  // SPEC § 1.4 l.17 — inconnu, émission espace par défaut.
  buf[17] = SPACE;

  // Byte 18 — binary status: 0x01 = STOP, other = RUN (stramatel.php l.293-298).
  buf[18] = state.clockRunning ? 0x00 : 0x01;

  // Byte 19 — timeout indicator: 0x20 = no timeout, any other byte = timeout in progress.
  buf[19] = state.timeoutActive ? 0x01 : SPACE;

  // Bytes 20-31: fautes individuelles joueurs domicile (12 lignes, 1 byte chacun).
  for (let i = 0; i < 12; i++) {
    buf[20 + i] = asciiDigit(Math.min(9, state.homePlayerFouls[i] || 0));
  }
  // Bytes 32-43: fautes individuelles joueurs visiteur.
  for (let i = 0; i < 12; i++) {
    buf[32 + i] = asciiDigit(Math.min(9, state.guestPlayerFouls[i] || 0));
  }

  // Bytes 44-45: timeout MM/SS — during active timeout, encode countdown seconds as SS (00..60).
  // In Panel2Net (l.171-173) the field is reused as chrono backup outside timeouts; we mirror the chrono SS as benign default.
  if (state.timeoutActive) {
    const toSec = Math.floor(state.timeoutRemainingMs / 1000);
    writeTwoDigits(buf, 44, toSec);
  } else {
    const totalSec = Math.floor(chronoMs / 1000);
    writeTwoDigits(buf, 44, totalSec % 60);
  }

  // Bytes 46-47: shot clock 24s basket FIBA, 2 ASCII digits.
  const shotSec = Math.max(0, Math.min(99, Math.floor(state.shotClockMs / 1000)));
  writeTwoDigits(buf, 46, shotSec);

  // SPEC § 4 Stramatel pt.4 — padding hypothétique.
  for (let i = 48; i < 54; i++) buf[i] = SPACE;

  return buf;
}

module.exports = {
  buildFrame0x33,
  START_BYTE,
  TYPE_MAIN,
  FRAME_LEN,
};
