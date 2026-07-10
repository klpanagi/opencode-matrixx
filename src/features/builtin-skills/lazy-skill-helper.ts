import type { BuiltinSkill } from "./types"

interface CachedSkill {
  template: string
  description: string
}
const skillCache = new Map<string, CachedSkill>()

/**
 * Wraps a skill factory into a BuiltinSkill with a lazy `template` getter.
 *
 * The factory is NOT called at construction time — only when `.template` is
 * first accessed. Subsequent accesses return a cached value (self-destructing
 * getter pattern replaces itself with a data property after first access).
 * `description` is hydrated on every template access so the cache being
 * populated by an earlier test does not leave subsequent instances empty.
 *
 * @param name - Skill name (used as cache key)
 * @param skillFactory - Factory returning a full BuiltinSkill
 * @returns BuiltinSkill with deferred template resolution
 */
export function createLazyTemplateSkill(
  name: string,
  skillFactory: () => BuiltinSkill,
): BuiltinSkill {
  const skill: BuiltinSkill = {
    name,
    description: "",
    template: "",
  }

  const result = { ...skill }

  Object.defineProperty(result, "template", {
    enumerable: true,
    configurable: true,
    get(this: BuiltinSkill) {
      let cached = skillCache.get(name)
      if (!cached) {
        const actual = skillFactory()
        cached = { template: actual.template, description: actual.description }
        skillCache.set(name, cached)
      }
      // Always hydrate description from cache (idempotent)
      Object.defineProperty(this, "description", {
        value: cached.description,
        writable: true,
        enumerable: true,
        configurable: true,
      })
      // Self-destructing getter: replace with writable data property
      Object.defineProperty(this, "template", {
        value: cached.template,
        writable: true,
        enumerable: true,
        configurable: true,
      })
      return cached.template
    },
  })

  return result
}


/** Clears the internal skill cache (for testing). */
export function clearLazyTemplateCache(): void {
  skillCache.clear()
}
