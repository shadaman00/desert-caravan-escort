/**
 * Curated 16-bit pixel-art entity palettes preserving E2E color & visibility contracts.
 */

export const SANDWALKER_PALETTE_DEFAULT: Readonly<Record<string, string>> = {
  K: '#1a202c', // dark iron outline
  D: '#2d3748', // shadow hull steel
  M: '#4a5568', // mid hull plate
  L: '#718096', // highlight steel
  S: '#cbd5e0', // bright specular rivet
  G: '#ecc94b', // brass / solar gauge
  O: '#dd6b20', // copper exhaust / furnace
  C: '#90cdf4', // viewport glass cyan
  R: '#e53e3e', // red warning rune
};

export const SANDWALKER_PALETTE_PHARAOH: Readonly<Record<string, string>> = {
  K: '#2a1807', // deep bronze outline
  D: '#744210', // bronze shadow
  M: '#b7791f', // royal burnished gold
  L: '#ecc94b', // bright pharaoh gold
  S: '#fef08a', // sunlit crown gleam
  G: '#f6ad55', // amber ornament
  O: '#6b46c1', // royal lapis / amethyst stripe
  C: '#38bdf8', // sacred turquoise eye
  R: '#553c9a', // pharaoh purple crest
};

export const CARAVAN_PALETTE_DEFAULT: Readonly<Record<string, string>> = {
  K: '#2b1b10', // outline brown
  B: '#4a321f', // dark wagon wood bed (wagonDarkBed)
  W: '#7c4b28', // frame wood
  C: '#d6b88d', // cloth canopy
  T: '#9c7a4c', // canopy rib trim
  M: '#b7791f', // wheel bronze rim
  H: '#c68b59', // camel coat
  S: '#9c683c', // camel shadow
  P: '#8b5a2b', // cargo pack
  G: '#ecc94b', // brass buckle
};

export const CARAVAN_PALETTE_PHARAOH: Readonly<Record<string, string>> = {
  K: '#221238', // royal outline
  B: '#4a321f', // dark wood wagon bed (preserves wagonDarkBed count!)
  W: '#744210', // bronze wood frame
  C: '#553c9a', // royal pharaoh purple canopy (pharaohPurple)
  T: '#ecc94b', // bright gold trim (goldTrim)
  M: '#ecc94b', // golden spoked wheel
  H: '#e8d5b7', // white royal camel coat
  S: '#c9b08a', // camel shadow
  P: '#2b6cb0', // lapis cargo pack
  G: '#fef08a', // bright gold jewel
};

export const ENEMY_PALETTE: Readonly<Record<string, string>> = {
  K: '#141720', // pixel outline
  R: '#c53030', // bandit crimson cloak (higher visibility in DUSK/STORM)
  D: '#742a2a', // bandit hood shadow
  O: '#fbd38d', // warm turban / sash highlight
  S: '#e2e8f0', // steel blade / highlight
  H: '#f7fafc', // crisp top rim specular highlight
  M: '#2d3748', // scorpion obsidian carapace
  A: '#4a5568', // scorpion joint plate
  B: '#90cdf4', // armor shine
  Y: '#ecc94b', // glowing venom stinger / weak point
  G: '#68d391', // glowing green venom core
  P: '#6b46c1', // mirage core purple
  C: '#7dd3fc', // mirage spectral cyan
  W: '#e0f2fe', // mirage pale mist highlight
};

export const BOSS_PALETTE: Readonly<Record<string, string>> = {
  K: '#0f1219', // heavy outline
  D: '#1a202c', // deep obsidian
  M: '#2d3748', // armored steel
  L: '#64748b', // mid chitin / armor rim
  H: '#e2e8f0', // bright steel / carapace rim highlight
  B: '#90cdf4', // armor plating glow
  R: '#e53e3e', // red weak core / danger
  O: '#dd6b20', // copper ram / flame
  Y: '#ecc94b', // bright golden core
  W: '#fef08a', // white-hot weak spot
  P: '#6b46c1', // mirage royal cloak
  V: '#9f7aea', // mirage energy highlight
  C: '#7dd3fc', // spirit cyan eye
  S: '#744210', // sandworm outer shell
  N: '#d69e2e', // bright sandworm ridge scale
};

export const WORLD_PALETTE: Readonly<Record<string, string>> = {
  K: '#1a202c',
  D: '#4a5568',
  M: '#718096',
  L: '#cbd5e0',
  B: '#4a321f',
  W: '#975a16',
  G: '#ecc94b',
  Y: '#fef08a',
  O: '#dd6b20',
  C: '#38bdf8',
  S: '#7dd3fc',
  R: '#e53e3e',
  P: '#805ad5',
};
