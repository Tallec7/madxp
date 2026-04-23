'use strict';

const SPACE = 0x20;
const SPORT_BASKET = 0x35; // '5'

function asciiDigit(n) {
  return 0x30 + (n % 10);
}

// Pads a non-negative integer to a fixed-width ASCII buffer, leading spaces for missing leading digits.
// Ex: padInt(7, 3) -> "  7", padInt(42, 3) -> " 42", padInt(127, 3) -> "127".
function padInt(n, width) {
  const out = Buffer.alloc(width, SPACE);
  if (n <= 0) {
    out[width - 1] = 0x30; // always emit at least '0' for units per PDF examples
    return out;
  }
  let remaining = n;
  for (let i = width - 1; i >= 0 && remaining > 0; i--) {
    out[i] = asciiDigit(remaining);
    remaining = Math.floor(remaining / 10);
  }
  return out;
}

function statusWordMsg18(state) {
  // b7=1 always, b0=game clock(0)/rest(1), b1=clock OFF, b2=horn, b4=shot-clock unit 1/10, b6=new match.
  let sw = 0x80;
  if (!state.clockRunning) sw |= 0x02; // b1
  if (state.hornActive) sw |= 0x04; // b2
  if (state.chronoMs < 60_000) sw |= 0x10; // b4 hint last-minute
  if (state.newMatch) sw |= 0x40; // b6
  return sw;
}

function statusWordMsg50(state) {
  let sw = 0x80;
  if (!state.shotClockRunning) sw |= 0x02;
  if (state.shotClockBlanked) sw |= 0x08; // b3
  if (state.chronoMs < 60_000) sw |= 0x10; // b4 unit 1/10
  return sw;
}

// Msg 18 normal: 13 bytes. ID '1' '8' + status + sport + MM + SS + TO(home) + TO(guest) + 2x space + period.
function buildMsg18(state) {
  const totalSec = Math.floor(state.chronoMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (state.chronoMs < 60_000) return buildMsg18LastMinute(state);

  const buf = Buffer.alloc(13);
  buf[0] = 0x31;
  buf[1] = 0x38;
  buf[2] = statusWordMsg18(state);
  buf[3] = SPORT_BASKET;
  const mm = padInt(minutes, 2);
  buf[4] = mm[0];
  buf[5] = mm[1];
  const ss = padInt(seconds, 2);
  // PDF example: 54s -> '5' '4' (no leading space when < 10 in seconds? The example has 54, no zero case). We force zero-pad.
  buf[6] = seconds < 10 ? 0x30 : ss[0];
  buf[7] = ss[1];
  buf[8] = asciiDigit(state.homeTimeoutsLeft);
  buf[9] = asciiDigit(state.guestTimeoutsLeft);
  buf[10] = SPACE;
  buf[11] = SPACE;
  buf[12] = asciiDigit(state.period);
  return buf;
}

// Msg 18 last-minute (chrono < 60s): SS + 'D' + tenths at offsets 4-7.
function buildMsg18LastMinute(state) {
  const totalTenths = Math.floor(state.chronoMs / 100);
  const seconds = Math.floor(totalTenths / 10);
  const tenths = totalTenths % 10;
  const buf = Buffer.alloc(13);
  buf[0] = 0x31;
  buf[1] = 0x38;
  buf[2] = statusWordMsg18(state);
  buf[3] = SPORT_BASKET;
  const ss = padInt(seconds, 2);
  buf[4] = seconds < 10 ? 0x30 : ss[0];
  buf[5] = ss[1];
  buf[6] = 0x44; // 'D' separator
  buf[7] = asciiDigit(tenths);
  buf[8] = asciiDigit(state.homeTimeoutsLeft);
  buf[9] = asciiDigit(state.guestTimeoutsLeft);
  buf[10] = SPACE;
  buf[11] = SPACE;
  buf[12] = asciiDigit(state.period);
  return buf;
}

// Msg 30: scores home/guest, 9 bytes. 3 bytes per score (hundreds/tens/units), leading spaces for 0.
function buildMsg30(state) {
  const buf = Buffer.alloc(9);
  buf[0] = 0x33;
  buf[1] = 0x30;
  buf[2] = SPORT_BASKET;
  const homeBuf = encodeScore3(state.homeScore);
  const guestBuf = encodeScore3(state.guestScore);
  homeBuf.copy(buf, 3);
  guestBuf.copy(buf, 6);
  return buf;
}

function encodeScore3(score) {
  const buf = Buffer.alloc(3, SPACE);
  if (score >= 100) {
    buf[0] = asciiDigit(Math.floor(score / 100));
    buf[1] = asciiDigit(Math.floor(score / 10));
    buf[2] = asciiDigit(score);
  } else if (score >= 10) {
    buf[0] = SPACE;
    buf[1] = asciiDigit(Math.floor(score / 10));
    buf[2] = asciiDigit(score);
  } else {
    buf[0] = SPACE;
    buf[1] = SPACE;
    buf[2] = asciiDigit(score);
  }
  return buf;
}

// Msg 31: fouls snapshot for the last foul (single player). 11 bytes.
function buildMsg31(state) {
  const buf = Buffer.alloc(11);
  buf[0] = 0x33;
  buf[1] = 0x31;
  buf[2] = SPORT_BASKET;
  buf[3] = SPACE; // ignore
  buf[4] = asciiDigit(state.homeTeamFouls);
  buf[5] = SPACE; // ignore
  buf[6] = asciiDigit(state.guestTeamFouls);
  if (state.lastFoul) {
    const line = state.lastFoul.playerLine;
    buf[7] = line >= 10 ? asciiDigit(Math.floor(line / 10)) : 0x30;
    buf[8] = asciiDigit(line);
    buf[9] = asciiDigit(state.lastFoul.playerFouls);
    buf[10] = state.lastFoul.team === 'home' ? 0x31 : 0x32;
  } else {
    // Per PDF note: after ~10s no foul → bytes 8-10 go to 0x20 (blanking).
    buf[7] = SPACE;
    buf[8] = SPACE;
    buf[9] = SPACE;
    buf[10] = SPACE;
  }
  return buf;
}

// Msg 36: 1/10 chrono (last minute), 5 bytes. No status word, no sport byte (PDF p.20 exception).
function buildMsg36(state) {
  const totalTenths = Math.floor(state.chronoMs / 100);
  const seconds = Math.floor(totalTenths / 10);
  const tenths = totalTenths % 10;
  const buf = Buffer.alloc(5);
  buf[0] = 0x33;
  buf[1] = 0x36;
  buf[2] = seconds >= 10 ? asciiDigit(Math.floor(seconds / 10)) : 0x30;
  buf[3] = asciiDigit(seconds);
  buf[4] = asciiDigit(tenths);
  return buf;
}

// Msg 50: shot clock, 5 bytes. No sport byte per PDF p.20 layout.
function buildMsg50(state) {
  const buf = Buffer.alloc(5);
  buf[0] = 0x35;
  buf[1] = 0x30;
  buf[2] = statusWordMsg50(state);
  if (state.shotClockBlanked) {
    buf[3] = SPACE;
    buf[4] = SPACE;
    return buf;
  }
  const totalSec = Math.floor(state.shotClockMs / 1000);
  if (state.chronoMs < 60_000 && totalSec < 10) {
    // b4=1 regime: show S.d (units + tenths).
    const tenths = Math.floor((state.shotClockMs % 1000) / 100);
    buf[3] = asciiDigit(totalSec);
    buf[4] = asciiDigit(tenths);
  } else {
    // b4=0 regime: SS (tens + units).
    buf[3] = totalSec >= 10 ? asciiDigit(Math.floor(totalSec / 10)) : 0x30;
    buf[4] = asciiDigit(totalSec);
  }
  return buf;
}

// Msg 19: timeout countdown + indicators. 7 bytes.
function buildMsg19(state) {
  const buf = Buffer.alloc(7);
  buf[0] = 0x31;
  buf[1] = 0x39;
  buf[2] = SPORT_BASKET;
  const homeIndicator = timeoutIndicator(state, 'home');
  const guestIndicator = timeoutIndicator(state, 'guest');
  buf[3] = homeIndicator;
  buf[4] = guestIndicator;
  const totalSec = Math.floor(state.timeoutRemainingMs / 1000);
  buf[5] = totalSec >= 10 ? asciiDigit(Math.floor(totalSec / 10)) : 0x30;
  buf[6] = asciiDigit(totalSec);
  return buf;
}

function timeoutIndicator(state, team) {
  const left = team === 'home' ? state.homeTimeoutsLeft : state.guestTimeoutsLeft;
  const isActiveTeam = state.timeoutActive === team && state.timeoutRemainingMs > 0;
  if (isActiveTeam) {
    // Alternate each second between 0x2F+n and 0x30+n per PDF p.22.
    const tick = Math.floor(state.timeoutRemainingMs / 1000) % 2;
    return (tick === 0 ? 0x30 : 0x2f) + left;
  }
  return 0x30 + left;
}

// Msg 60: bonus indicator. 5 bytes. Status word b0 = foul indicator.
function buildMsg60(state) {
  const buf = Buffer.alloc(5);
  buf[0] = 0x36;
  buf[1] = 0x30;
  buf[2] = SPORT_BASKET;
  buf[3] = 0x80 | (state.homeBonus ? 0x01 : 0x00);
  buf[4] = 0x80 | (state.guestBonus ? 0x01 : 0x00);
  return buf;
}

module.exports = {
  buildMsg18,
  buildMsg19,
  buildMsg30,
  buildMsg31,
  buildMsg36,
  buildMsg50,
  buildMsg60,
  asciiDigit,
  padInt,
  encodeScore3,
  statusWordMsg18,
  statusWordMsg50,
};
