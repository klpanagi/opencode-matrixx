import type { BuiltinSkill } from "./types"

const templateCache = new Map<string, string>()

/**
 * Wraps a skill factory into a BuiltinSkill with a lazy `template` getter.
 *
 * The factory is NOT called at construction time — only when `.template` is
 * first accessed. Subsequent accesses return a cached value (self-destructing
 * getter pattern replaces itself with a data property after first access).
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
      if (!templateCache.has(name)) {
        const actual = skillFactory()
        templateCache.set(name, actual.template)
      }
      const value = templateCache.get(name) as string
      // Self-destructing getter: replace with writable data property
      Object.defineProperty(this, "template", {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      })
      return value
    },
  })

  return result
}

/** Clears the internal template cache (for testing). */
export function clearLazyTemplateCache(): void {
  templateCache.clear()
}
