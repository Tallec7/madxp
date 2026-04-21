import { registerRoot } from "remotion";
import { Root } from "./Root";
import { registerCustomFonts } from "./fonts";

registerCustomFonts();

registerRoot(Root);
