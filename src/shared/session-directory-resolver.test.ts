import { describe, expect, test } from "bun:test"

import { isWindowsAppDataDirectory } from "./session-directory-resolver"

describe("session-directory-resolver", () => {
  describe("isWindowsAppDataDirectory", () => {
    test("returns true when path is under AppData Local", () => {
      //#given
      const directory = "C:/Users/test/AppData/Local/opencode"

      //#when
      const result = isWindowsAppDataDirectory(directory)

      //#then
      expect(result).toBe(true)
    })

    test("returns true when path ends with AppData directory segment", () => {
      //#given
      const directory = "C:/Users/test/AppData/Local"

      //#when
      const result = isWindowsAppDataDirectory(directory)

      //#then
      expect(result).toBe(true)
    })

    test("returns false when path is outside AppData", () => {
      //#given
      const directory = "D:/projects/matrixx"

      //#when
      const result = isWindowsAppDataDirectory(directory)

      //#then
      expect(result).toBe(false)
    })

    test("returns false for lookalike non-AppData segment", () => {
      //#given
      const directory = "D:/projects/appdata/local-tools"

      //#when
      const result = isWindowsAppDataDirectory(directory)

      //#then
      expect(result).toBe(false)
    })
  })
})
