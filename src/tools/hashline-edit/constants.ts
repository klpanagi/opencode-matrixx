export const NIBBLE_STR = "ZPMQVRWSNKTXJBYH"

/**
 * Anchor id width in characters. Each char is one NIBBLE_STR symbol, so 4
 * chars give a 16-symbol (2^16 = 65,536 entry) index space — a 32-bit id.
 *
 * The width used to be 2 (8 bits). At 8 bits a 1200-line file has
 * N(N-1)/512 = 2,810 expected colliding pairs, so a stale anchor matched an
 * unrelated line most of the time. At 4 chars that drops to N(N-1)/131,072.
 */
export const HASHLINE_ID_LENGTH = 4

/** @deprecated pre-widening anchor width; still parsed, validated more weakly. */
export const LEGACY_HASHLINE_ID_LENGTH = 2

/** Number of dictionary entries — the full 16-bit index space. */
export const HASHLINE_DICT_SIZE = 65536

/**
 * Escaped NIBBLE_STR for use inside a character class. Derived from the single
 * definition of the alphabet so the patterns below can never drift from the
 * dictionary that produces the ids they match.
 */
export const NIBBLE_CHARSET = NIBBLE_STR.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")

function nibblePair(byte: number): string {
  return `${NIBBLE_STR[byte >>> 4]}${NIBBLE_STR[byte & 0x0f]}`
}

/** Generated, not hand-written — 65,536 ids would be an unusable literal. */
export const HASHLINE_DICT = Array.from({ length: HASHLINE_DICT_SIZE }, (_, i) => {
  return `${nibblePair(i >>> 8)}${nibblePair(i & 0xff)}`
})

/** @deprecated pre-widening 8-bit dictionary, kept only to validate old anchors. */
export const LEGACY_HASHLINE_DICT = Array.from({ length: 256 }, (_, i) => nibblePair(i))

/** Canonical ref: `12#ABCD`. */
export const HASHLINE_REF_PATTERN = new RegExp(`^([0-9]+)#([${NIBBLE_CHARSET}]{${HASHLINE_ID_LENGTH}})$`)

/** Read output line: `12#ABCD|content`. */
export const HASHLINE_OUTPUT_PATTERN = new RegExp(`^([0-9]+)#([${NIBBLE_CHARSET}]{${HASHLINE_ID_LENGTH}})\\|(.*)$`)

/** Pre-widening ref: `12#AB`. Deprecated width, still accepted on parse. */
export const LEGACY_HASHLINE_REF_PATTERN = new RegExp(
  `^([0-9]+)#([${NIBBLE_CHARSET}]{${LEGACY_HASHLINE_ID_LENGTH}})$`,
)

/** A bare hash id, canonical or legacy. */
export const HASHLINE_HASH_PATTERN = new RegExp(
  `^[${NIBBLE_CHARSET}]{${LEGACY_HASHLINE_ID_LENGTH},${HASHLINE_ID_LENGTH}}$`,
)

/** Trailing hash id of a ref, canonical or legacy. */
export const HASHLINE_TRAILING_HASH_PATTERN = new RegExp(
  `#([${NIBBLE_CHARSET}]{${LEGACY_HASHLINE_ID_LENGTH},${HASHLINE_ID_LENGTH}})$`,
)
