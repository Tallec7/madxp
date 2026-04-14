import { Config } from "@remotion/cli/config";

// PNG obligatoire pour préserver le canal alpha de BUT_simple_C.webm
// (JPEG ne supporte pas la transparence → masque alpha impossible)
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
