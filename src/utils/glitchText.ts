/**
 * Glitch text for the chat header's "New Conversation" button: random
 * symbols with combining marks, redrawn every 30 ms while the button flashes.
 * The same generator as the history panel's.
 */

// -- Glitch text generator (same as HistoryPanel) ----------------
const SYMBOLS = "!@#$%^&*†‡§¶∆∇≈≠±×÷√∫∑∏⊗⊕⊘⊙◊♠♣♥♦★☆◈⬡⬢⟁⟐⧫⬟";
const ZALGO = [
  "\u0300",
  "\u0301",
  "\u0302",
  "\u0303",
  "\u0304",
  "\u0305",
  "\u0306",
  "\u0307",
  "\u0308",
  "\u0309",
  "\u030A",
  "\u030B",
  "\u030C",
  "\u030D",
  "\u030E",
  "\u030F",
  "\u0310",
  "\u0311",
  "\u0312",
  "\u0313",
  "\u0314",
  "\u0315",
  "\u0316",
  "\u0317",
  "\u0318",
  "\u0319",
  "\u031A",
  "\u031B",
  "\u0320",
  "\u0321",
  "\u0322",
  "\u0323",
  "\u0324",
  "\u0325",
  "\u0326",
  "\u0327",
  "\u0328",
  "\u0329",
  "\u032A",
  "\u032B",
  "\u032C",
  "\u032D",
  "\u0330",
  "\u0331",
  "\u0332",
  "\u0333",
  "\u0334",
  "\u0335",
  "\u0336",
  "\u0340",
  "\u0341",
  "\u0342",
  "\u0343",
  "\u0344",
  "\u0345",
  "\u0346",
  "\u0350",
  "\u0351",
  "\u0352",
  "\u0353",
  "\u0354",
  "\u0355",
  "\u0356",
];
const GLITCH_POOL = SYMBOLS + "ΣΩΨΞΘΔΛΠΦψξθδλπφ¿¡«»░▒▓█▄▀■□▪▫▬▲▼◆●○◎◇";

export function glitchText(length = 6) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += GLITCH_POOL[Math.floor(Math.random() * GLITCH_POOL.length)];
    const marks = 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < marks; j++) {
      result += ZALGO[Math.floor(Math.random() * ZALGO.length)];
    }
  }
  return result;
}
