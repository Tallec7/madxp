import { Config } from "@remotion/cli/config";

// JPEG : suffisant car le masque alpha de BUT_simple_C.webm est appliqué
// via webkitMaskImage dans le browser AVANT le screenshot Remotion.
// La scène capturée est déjà composée (opaque) → pas besoin de PNG.
// JPEG 95 = ~10x plus rapide que PNG, qualité visuellement identique.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);

// 4 workers Chrome en parallèle → render ~4x plus rapide
Config.setConcurrency(4);

Config.setOverwriteOutput(true);
